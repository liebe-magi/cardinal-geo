-- Local migration source only. Apply to production only as part of an approved cutover.
begin;
create table public.share_snapshots (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
 session_id uuid references public.game_sessions(id) on delete cascade, created_at timestamptz not null default now(),
 revoked_at timestamptz, version integer not null default 1, payload jsonb not null
);
alter table public.share_snapshots enable row level security;
revoke all on public.share_snapshots from anon,authenticated;
create function public.create_share_snapshot(p_request_id uuid,p_session_id uuid default null,p_lang text default 'ja')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.game_sessions; payload jsonb; snapshot public.share_snapshots; username text;
begin
 perform public.game_lock();
 if p_request_id is null or p_lang not in ('ja','en') then raise exception 'Invalid share request'; end if;
 select * into snapshot from public.share_snapshots where id=p_request_id and owner_id=auth.uid();
 if found then
  if snapshot.revoked_at is not null then raise exception 'Share revoked'; end if;
  return jsonb_build_object('id',snapshot.id,'version',snapshot.version,'payload',snapshot.payload);
 end if;
 if (select count(*) from public.share_snapshots where owner_id=auth.uid() and created_at>now()-interval '1 day')>=100 then raise exception 'Share limit reached'; end if;
 select p.username into username from public.profiles p where id=auth.uid();
 payload:=jsonb_build_object('username',username,'lang',p_lang,'sharedAt',now());
 if p_session_id is not null then
  select * into s from public.game_sessions where id=p_session_id and user_id=auth.uid() and status='completed' and rating_scope is not null;
  if not found then raise exception 'Completed result not found'; end if;
  payload:=payload||jsonb_build_object('kind','game','mode',s.mode,'score',s.score,'answeredCount',s.answered_count,
   'ratingScope',s.rating_scope,'ratingBefore',s.rating_before,'ratingAfter',s.rating_after,'ratingChange',s.total_rating_change,
   'challengeDate',s.challenge_date,'completedAt',s.completed_at,
   'outcomes',(select jsonb_agg(status='win' order by question_ordinal) from public.match_history where session_id=s.id and status<>'pending'));
 else
  payload:=payload||jsonb_build_object('kind','profile','bestScore',(select best_score_survival_rated from public.profiles where id=auth.uid()),
   'ratings',coalesce((select jsonb_object_agg(mode,rating) from public.user_mode_ratings where user_id=auth.uid()),'{"global":1500}'::jsonb));
 end if;
 insert into public.share_snapshots(id,owner_id,session_id,payload) values(p_request_id,auth.uid(),p_session_id,payload) returning * into snapshot;
 return jsonb_build_object('id',snapshot.id,'version',snapshot.version,'payload',snapshot.payload);
end; $$;
create function public.get_share_snapshot(p_public_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('id',id,'version',version,'payload',payload) from public.share_snapshots where id=p_public_id and revoked_at is null
$$;
create function public.revoke_share_snapshot(p_public_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 update public.share_snapshots set revoked_at=coalesce(revoked_at,now()) where id=p_public_id and owner_id=auth.uid();
end; $$;
create function public.list_my_shares() returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'createdAt',s.created_at,'kind',s.payload->>'kind') order by s.created_at desc),'[]')
 from (select * from public.share_snapshots where owner_id=auth.uid() and revoked_at is null order by created_at desc limit 100) s
$$;
revoke all on function public.create_share_snapshot(uuid,uuid,text),public.revoke_share_snapshot(uuid),public.list_my_shares() from public,anon;
grant execute on function public.create_share_snapshot(uuid,uuid,text),public.revoke_share_snapshot(uuid),public.list_my_shares() to authenticated;
revoke all on function public.get_share_snapshot(uuid) from public;
grant execute on function public.get_share_snapshot(uuid) to anon,authenticated;

create function public.public_leaderboard(p_kind text,p_mode text default 'global',p_day date default current_date)
returns table(id text,username text,value numeric,extra text,is_self boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
 if p_kind='rating' then
  return query select row_number() over(order by r.rating desc,p.id)::text,p.username,round(r.rating::numeric),
   (select count(*)::text from public.match_history m where m.user_id=p.id and m.status<>'pending' and
    (case when p_mode='global' then m.mode in ('survival_rated','challenge_rated') else m.mode=p_mode end)),p.id=auth.uid()
   from public.profiles p join public.user_mode_ratings r on r.user_id=p.id where r.mode=p_mode order by r.rating desc,p.id limit 100;
 elsif p_kind='survival_rated' then
  return query select row_number() over(order by p.best_score_survival_rated desc,p.id)::text,p.username,p.best_score_survival_rated::numeric,null::text,p.id=auth.uid()
   from public.profiles p where p.best_score_survival_rated>0 order by p.best_score_survival_rated desc,p.id limit 100;
 elsif p_kind='daily' then
  return query select row_number() over(order by d.score desc,p.id)::text,p.username,d.score::numeric,null::text,p.id=auth.uid()
   from public.daily_challenge_results d join public.profiles p on p.id=d.user_id where d.challenge_date=p_day and d.status='completed' order by d.score desc,p.id limit 100;
 elsif p_kind='daily_avg' then
  return query select row_number() over(order by avg(d.score) desc,p.id)::text,p.username,round(avg(d.score),1),count(*)::text,p.id=auth.uid()
   from public.daily_challenge_results d join public.profiles p on p.id=d.user_id where d.status='completed' group by p.id order by avg(d.score) desc,p.id limit 100;
 else raise exception 'Invalid ranking'; end if;
end; $$;
create function public.my_rating_rank(p_mode text default 'global') returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('rank',1+(select count(*) from public.user_mode_ratings where mode=p_mode and user_id<>auth.uid() and rating>coalesce((select rating from public.user_mode_ratings where user_id=auth.uid() and mode=p_mode),1500)),
 'total',(select count(*) from public.user_mode_ratings where mode=p_mode))
$$;
revoke all on function public.public_leaderboard(text,text,date),public.my_rating_rank(text) from public;
grant execute on function public.public_leaderboard(text,text,date) to anon,authenticated;
grant execute on function public.my_rating_rank(text) to authenticated;
drop policy if exists "Profiles are viewable by everyone" on public.profiles;
create policy profiles_owner_read on public.profiles for select to authenticated using (id=auth.uid());
drop policy if exists "Daily results are viewable by everyone" on public.daily_challenge_results;
create policy daily_owner_read on public.daily_challenge_results for select to authenticated using (user_id=auth.uid());
drop policy if exists "User mode ratings are viewable by everyone" on public.user_mode_ratings;
create policy ratings_owner_read on public.user_mode_ratings for select to authenticated using (user_id=auth.uid());
drop policy if exists "Challenge unrated results viewable by everyone" on public.challenge_unrated_results;
create policy challenge_unrated_owner_read on public.challenge_unrated_results for select to authenticated using (user_id=auth.uid());
revoke execute on function public.get_rating_ranking(text),public.get_daily_average_ranking() from public,anon,authenticated;
commit;
