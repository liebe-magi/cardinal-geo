\set ON_ERROR_STOP on
begin;
insert into auth.users(id,raw_user_meta_data) values ('00000000-0000-0000-0000-000000000004','{"name":"公開テスト表示名"}'),('00000000-0000-0000-0000-000000000005','{"name":"other-test"}');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
set local role authenticated;
do $$
declare result jsonb; issued jsonb; sid uuid; snap jsonb; stable jsonb; share_id uuid:='44444444-4444-4444-4444-444444444444';
begin
 result:=public.start_game(gen_random_uuid(),'survival');sid:=(result->'session'->>'id')::uuid;
 begin perform public.create_share_snapshot(gen_random_uuid(),sid,'ja'); raise exception 'Unfinished result shared';
 exception when raise_exception then if sqlerrm<>'Completed result not found' then raise; end if; end;
 issued:=public.issue_game_question(sid);
 result:=public.answer_game_question(sid,(issued->>'id')::bigint,jsonb_build_object('ns',case when issued->'question'->'correctDirection'->>'ns'='N' then 'S' else 'N' end,'ew','E'),gen_random_uuid());
 snap:=public.create_share_snapshot(share_id,sid,'ja');
 if snap->'payload'->>'score'<>'0' or snap::text like '%00000000-0000-0000-0000-000000000004%' or snap::text like '%cityA%' then raise exception 'Unsafe snapshot: %',snap; end if;
 if public.create_share_snapshot(share_id,sid,'ja')<>snap then raise exception 'Share retry changed snapshot'; end if;
 perform public.start_game(gen_random_uuid(),'starter');
 stable:=public.get_share_snapshot(share_id);
 if stable<>snap then raise exception 'Snapshot changed after later play'; end if;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
 if exists(select 1 from public.profiles where id<>'00000000-0000-0000-0000-000000000005') then raise exception 'Private profile exposed'; end if;
 if exists(select 1 from public.daily_challenge_results) then raise exception 'Daily history exposed'; end if;
 perform public.revoke_share_snapshot(share_id);
 if public.get_share_snapshot(share_id) is null then raise exception 'Other user revoked snapshot'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
 if public.get_share_snapshot('44444444-4444-4444-4444-444444444444') is null then raise exception 'Anon cannot read public snapshot'; end if;
 if exists(select 1 from public.profiles) then raise exception 'Anon private profile access'; end if;
 begin perform payload from public.share_snapshots; raise exception 'Direct snapshot table exposed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select public.revoke_share_snapshot('44444444-4444-4444-4444-444444444444');
do $$ begin
 if public.get_share_snapshot('44444444-4444-4444-4444-444444444444') is not null then raise exception 'Revoked snapshot exposed'; end if;
 if public.get_share_snapshot('55555555-5555-5555-5555-555555555555') is not null then raise exception 'Missing snapshot exposed'; end if;
 perform * from public.public_leaderboard('rating');
 perform * from public.public_leaderboard('survival_rated');
 perform * from public.public_leaderboard('daily');
 perform * from public.public_leaderboard('daily_avg');
end $$;
rollback;
