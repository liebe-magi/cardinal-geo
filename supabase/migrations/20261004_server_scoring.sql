begin;
-- All game mutations acquire one transaction lock. This deliberately serializes
-- the short rating transaction, including shared pair/city updates across users.
-- Split this into ordered resource locks only after measuring contention.
create or replace function public.game_lock() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(170104, 1);
end; $$;

-- Glicko-2 single-opponent update, matching glicko2-lite 5.0.0 (tau .5).
-- Algorithm port; license retained in docs/glicko2-lite-LICENSE.txt.
create or replace function public.glicko_vol_f(x float8, phi float8, v float8, delta float8, a float8)
returns float8 language sql immutable set search_path = '' as $$
  select exp(x)*(delta*delta-phi*phi-v-exp(x))/(2*power(phi*phi+v+exp(x),2))-(x-a)/0.25
$$;
create or replace function public.game_rate(r float8, rd float8, vol float8, opponent float8, ord float8, score integer)
returns float8[] language plpgsql immutable set search_path = '' as $$
declare mu float8 := (r-1500)/173.7178; phi float8 := rd/173.7178;
  g float8 := 1/sqrt(1+3*power(ord/173.7178,2)/power(pi(),2));
  e float8; v float8; delta float8; initial_a float8 := ln(vol*vol);
  a float8 := initial_a; b float8; c float8; fa float8; fb float8; fc float8;
  k integer := 1; sigma float8; phip float8;
begin
  e := 1/(1+exp(-g*(mu-(opponent-1500)/173.7178)));
  v := 1/(g*g*e*(1-e)); delta := v*g*(score-e);
  if delta*delta > phi*phi+v then b := ln(delta*delta-phi*phi-v);
  else
    while public.glicko_vol_f(a-k*0.5,phi,v,delta,initial_a) < 0 loop
      k := k+1; if k > 1000 then raise exception 'Volatility did not converge'; end if;
    end loop;
    b := a-k*0.5;
  end if;
  fa := public.glicko_vol_f(a,phi,v,delta,initial_a);
  fb := public.glicko_vol_f(b,phi,v,delta,initial_a);
  k := 0;
  while abs(b-a) > 0.000001 loop
    c := a+(a-b)*fa/(fb-fa); fc := public.glicko_vol_f(c,phi,v,delta,initial_a);
    if fc*fb <= 0 then a := b; fa := fb; else fa := fa/2; end if;
    b := c; fb := fc; k := k+1;
    if k > 1000 then raise exception 'Volatility did not converge'; end if;
  end loop;
  sigma := exp(a/2); phip := 1/sqrt(1/(phi*phi+sigma*sigma)+1/v);
  return array[173.7178*(mu+phip*phip*g*(score-e))+1500,173.7178*phip,sigma];
end; $$;

create or replace function public.game_question(target jsonb, origin jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('cityA',target,'cityB',origin,'correctDirection',jsonb_build_object(
    'ns',case when (target->>'lat')::float8 >= (origin->>'lat')::float8 then 'N' else 'S' end,
    'ew',case when (target->>'lon')::float8 >= (origin->>'lon')::float8 then 'E' else 'W' end))
$$;

-- Unsigned arithmetic preserves the existing DJB2 / mulberry32 daily sequence.
create or replace function public.game_u32(n numeric) returns bigint language sql immutable set search_path = '' as $$
  select ((n % 4294967296 + 4294967296) % 4294967296)::bigint
$$;
create or replace function public.game_random(seed bigint) returns float8 language plpgsql immutable set search_path = '' as $$
declare t bigint;
begin
  t := public.game_u32((seed # (seed >> 15))::numeric * (1 | seed)::numeric);
  t := t # public.game_u32(t + public.game_u32((t # (t >> 7))::numeric * (61 | t)::numeric));
  return (t # (t >> 14))::float8 / 4294967296;
end; $$;
create or replace function public.game_daily_questions(day date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare seed bigint := 5381; phrase text := 'cardinal-daily-' || day::text;
  i integer; a integer; b integer; count_cities integer; pairs text[] := '{}'; result jsonb := '[]';
  ca jsonb; cb jsonb; key text;
begin
  for i in 1..length(phrase) loop seed := public.game_u32(seed*33+ascii(substr(phrase,i,1))); end loop;
  select count(*) into count_cities from public.game_city_catalog;
  while jsonb_array_length(result) < 10 loop
    seed := public.game_u32(seed+1831565813); a := floor(public.game_random(seed)*count_cities)::integer;
    seed := public.game_u32(seed+1831565813); b := floor(public.game_random(seed)*count_cities)::integer;
    key := a||'-'||b;
    if a=b or key=any(pairs) then continue; end if;
    pairs := array_append(pairs,key);
    select city into ca from public.game_city_catalog where ordinal=a;
    select city into cb from public.game_city_catalog where ordinal=b;
    result := result || jsonb_build_array(public.game_question(ca,cb));
  end loop;
  return result;
end; $$;

-- Private shared transaction for normal answers and abandoned commitments.
-- Expiry preserves the old rule: player vs pair, with no city update.
create or replace function public.apply_game_answer(match_id bigint, answer jsonb, request_id uuid, expired boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.match_history; s public.game_sessions; q public.questions;
  u public.user_mode_ratings; ca public.city_ratings; cb public.city_ratings;
  correct boolean; points integer; alpha float8; base float8; opp float8; opp_rd float8;
  player_new float8[]; pair_new float8[]; city_new float8[]; factor float8; code text;
  done boolean; weak jsonb; change float8;
begin
  perform public.game_lock();
  select * into m from public.match_history where id=match_id and user_id=auth.uid() for update;
  if not found then raise exception 'Answer not found'; end if;
  if m.status <> 'pending' then return; end if;
  select * into s from public.game_sessions where id=m.session_id and user_id=auth.uid() for update;
  if not found or s.status <> 'in_progress' or m.question_ordinal <> s.answered_count then
    raise exception 'Invalid session state';
  end if;
  if not expired and (answer is null or answer->>'ns' is null or answer->>'ew' is null or answer->>'ns' not in ('N','S') or answer->>'ew' not in ('E','W')
    or not (answer ? 'ns' and answer ? 'ew') or request_id is null) then raise exception 'Invalid answer'; end if;
  correct := not expired and answer->>'ns'=m.presented_correct_ns and answer->>'ew'=m.presented_correct_ew;
  points := case when correct then 1 else 0 end;
  select * into q from public.questions where id=m.question_id for update;
  if s.rating_scope is not null then
  insert into public.user_mode_ratings(user_id,mode) values(auth.uid(),s.rating_scope) on conflict do nothing;
  select * into u from public.user_mode_ratings where user_id=auth.uid() and mode=s.rating_scope for update;
  insert into public.city_ratings(country_code) values(q.city_a_code),(q.city_b_code) on conflict do nothing;
  select * into ca from public.city_ratings where country_code=q.city_a_code for update;
  select * into cb from public.city_ratings where country_code=q.city_b_code for update;
  alpha := greatest(0,least(1,(350-q.rd)/300));
  base := (ca.rating/power(ca.rd,2)+cb.rating/power(cb.rd,2))/(1/power(ca.rd,2)+1/power(cb.rd,2));
  opp := case when expired then q.rating else (1-alpha)*base+alpha*q.rating end;
  opp_rd := case when expired then q.rd else sqrt(power(1-alpha,2)*(power(ca.rd,2)*power(cb.rd,2)/(power(ca.rd,2)+power(cb.rd,2)))+power(alpha*q.rd,2)) end;
  player_new := public.game_rate(u.rating,u.rd,u.vol,opp,opp_rd,points);
  pair_new := public.game_rate(q.rating,q.rd,q.vol,u.rating,u.rd,1-points);
  change := player_new[1]-u.rating;
  update public.user_mode_ratings set rating=player_new[1],rd=player_new[2],vol=player_new[3]
    where user_id=auth.uid() and mode=s.rating_scope;
  update public.questions set rating=pair_new[1],rd=pair_new[2],vol=pair_new[3],
    play_count=play_count+1,win_count=win_count+points,composite_rating=opp where id=q.id;
  if not expired and alpha < 0.99 then
    factor := 1-alpha;
    foreach code in array array[q.city_a_code,q.city_b_code] loop
      select * into ca from public.city_ratings where country_code=code;
      city_new := public.game_rate(ca.rating,ca.rd,ca.vol,u.rating,u.rd,1-points);
      update public.city_ratings set rating=ca.rating+(city_new[1]-ca.rating)*factor,
        rd=ca.rd+(city_new[2]-ca.rd)*factor,vol=ca.vol+(city_new[3]-ca.vol)*factor,
        play_count=play_count+1 where country_code=code;
    end loop;
  end if;
  else player_new:=array[null::float8,null::float8,null::float8]; change:=0; end if;
  update public.match_history set status=case when correct then 'win' else 'lose' end,
    user_answer_ns=answer->>'ns',user_answer_ew=answer->>'ew',submission_id=request_id,
    user_rating_before=coalesce(u.rating,1500),user_rd_before=u.rd,user_vol_before=u.vol,
    user_rating_after=player_new[1],user_rd_after=player_new[2],user_vol_after=player_new[3],
    question_rating_before=q.rating,question_rating_after=pair_new[1],
    opponent_rating=opp,opponent_rd=opp_rd,opponent_vol=q.vol,rating_change=change,answered_at=now()
    where id=m.id;
  done := (s.mode='challenge' and s.answered_count+1=10) or (s.mode not in ('challenge','learning') and not correct);
  update public.game_sessions set score=score+points,answered_count=answered_count+1,
    rating_before=coalesce(rating_before,u.rating),rating_after=player_new[1],
    total_rating_change=total_rating_change+change,
    status=case when done then 'completed' else status end,
    end_reason=case when done then case when s.mode='challenge' then 'questions_complete' else 'mistake' end else null end,
    completed_at=case when done then now() else null end where id=s.id returning * into s;
  if not expired then
    select weakness_scores into weak from public.profiles where id=auth.uid() for update;
    foreach code in array array[q.city_a_code,q.city_b_code] loop
      weak := jsonb_set(weak,array[code],to_jsonb(coalesce((weak->>code)::integer,0)+case when correct then -1 else 1 end));
    end loop;
    update public.profiles set weakness_scores=weak where id=auth.uid();
  end if;
  if s.mode='survival' then
    update public.profiles set best_score_survival_rated=greatest(best_score_survival_rated,s.score) where id=auth.uid();
  end if;
  if s.mode='challenge' then
    insert into public.daily_challenge_results(user_id,challenge_date,score,current_question,answers,total_rating_change,status,completed_at)
    values(auth.uid(),s.challenge_date,s.score,s.answered_count,'[]',s.total_rating_change,s.status,s.completed_at)
    on conflict(user_id,challenge_date) do update set score=excluded.score,current_question=excluded.current_question,
      total_rating_change=excluded.total_rating_change,status=excluded.status,completed_at=excluded.completed_at;
  end if;
end; $$;

create or replace function public.start_game(p_request_id uuid, p_mode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.game_sessions; existing public.game_sessions; pending record; scope text;
  day date := (now() at time zone 'UTC')::date;
begin
  perform public.game_lock();
  if p_request_id is null or p_mode not in ('survival','challenge','starter','asia','europe','africa','americas','oceania','learning') then raise exception 'Invalid mode'; end if;
  select * into s from public.game_sessions where id=p_request_id and user_id=auth.uid();
  if found then return public.get_game_result(s.id); end if;
  if p_mode='challenge' then
    select * into s from public.game_sessions where user_id=auth.uid() and challenge_date=day;
    if found then return public.get_game_result(s.id); end if;
    if exists(select 1 from public.daily_challenge_results where user_id=auth.uid() and challenge_date=day) then
      raise exception 'Legacy daily progress exists; review the saved result';
    end if;
  end if;
  for existing in select * from public.game_sessions where user_id=auth.uid() and status='in_progress' and mode<>'challenge' order by started_at,id loop
    for pending in select id from public.match_history where session_id=existing.id and status='pending' order by question_ordinal loop
      perform public.apply_game_answer(pending.id,null,gen_random_uuid(),true);
    end loop;
    update public.game_sessions set status='abandoned',end_reason='replaced',completed_at=now()
      where id=existing.id;
  end loop;
  scope := case when p_mode='learning' then null when p_mode in ('survival','challenge') then 'global' else p_mode||'_rated' end;
  insert into public.game_sessions(id,user_id,mode,rating_scope,challenge_date,question_set,best_before)
    select p_request_id,auth.uid(),p_mode,scope,case when p_mode='challenge' then day else null end,
      case when p_mode='challenge' then public.game_daily_questions(day) else '[]'::jsonb end,
      case when p_mode='survival' then best_score_survival_rated else null end
    from public.profiles where id=auth.uid() returning * into s;
  if not found then raise exception 'Profile not found'; end if;
  return public.get_game_result(s.id);
end; $$;

create or replace function public.issue_game_question(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.game_sessions; m public.match_history; question jsonb; target jsonb; origin jsonb;
  a jsonb; b jsonb; qid uuid;
begin
  perform public.game_lock();
  select * into s from public.game_sessions where id=p_session_id and user_id=auth.uid() for update;
  if not found or s.status<>'in_progress' then raise exception 'Session unavailable'; end if;
  select * into m from public.match_history where session_id=s.id and question_ordinal=s.answered_count;
  if found then return jsonb_build_object('id',m.id,'question',m.presented_question); end if;
  if s.mode='challenge' then question := s.question_set->s.answered_count;
  else
    select city into target from public.game_city_catalog where
      s.mode in ('survival','learning') or (s.mode='starter' and famous) or region=s.mode
      order by case when s.mode='learning' then ln(-ln(greatest(random(),0.000000000001)))-coalesce((select (weakness_scores->>(city->>'countryCode'))::integer from public.profiles where id=auth.uid()),0) else random() end limit 1;
    select city into origin from public.game_city_catalog where city->>'countryCode'<>target->>'countryCode' and
      (s.mode in ('survival','learning') or (s.mode='starter' and famous) or region=s.mode)
      order by case when s.mode='learning' then ln(-ln(greatest(random(),0.000000000001)))-coalesce((select (weakness_scores->>(city->>'countryCode'))::integer from public.profiles where id=auth.uid()),0) else random() end limit 1;
    question := public.game_question(target,origin);
  end if;
  if question is null then raise exception 'No question available'; end if;
  target := question->'cityA'; origin := question->'cityB';
  if target->>'countryCode'<origin->>'countryCode' then a:=target; b:=origin; else a:=origin; b:=target; end if;
  insert into public.questions(city_a_code,city_b_code,city_a_capital,city_b_capital,correct_ns,correct_ew)
    values(a->>'countryCode',b->>'countryCode',a->>'capitalEn',b->>'capitalEn',
      public.game_question(a,b)->'correctDirection'->>'ns',public.game_question(a,b)->'correctDirection'->>'ew')
    on conflict(city_a_code,city_b_code) do nothing;
  select id into qid from public.questions where city_a_code=a->>'countryCode' and city_b_code=b->>'countryCode';
  insert into public.match_history(user_id,question_id,session_id,mode,user_rating_before,question_rating_before,
    question_ordinal,presented_question,presented_target_code,presented_origin_code,presented_correct_ns,presented_correct_ew)
  values(auth.uid(),qid,s.id,s.mode||case when s.mode='learning' then '_unrated' else '_rated' end,
    coalesce((select rating from public.user_mode_ratings where user_id=auth.uid() and mode=s.rating_scope),1500),
    (select rating from public.questions where id=qid),s.answered_count,question,target->>'countryCode',origin->>'countryCode',
    question->'correctDirection'->>'ns',question->'correctDirection'->>'ew') returning * into m;
  return jsonb_build_object('id',m.id,'question',question);
end; $$;

create or replace function public.answer_game_question(p_session_id uuid,p_match_id bigint,p_answer jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.game_lock();
  if not exists(select 1 from public.match_history where id=p_match_id and session_id=p_session_id and user_id=auth.uid()) then
    raise exception 'Answer not found';
  end if;
  perform public.apply_game_answer(p_match_id,p_answer,p_request_id);
  return public.get_game_result(p_session_id);
end; $$;

create or replace function public.reset_my_weakness() returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.game_lock();
  update public.profiles set weakness_scores='{}' where id=auth.uid();
end; $$;
revoke all on function public.reset_my_weakness() from public,anon;
grant execute on function public.reset_my_weakness() to authenticated;

-- Cutover: old clients fail closed. Direct score writes and obsolete privileged
-- mutation RPCs must not remain an alternative to server grading.
revoke insert,update,delete on public.profiles,public.user_mode_ratings,public.questions,
  public.city_ratings,public.match_history,public.daily_challenge_results,public.challenge_unrated_results
  from anon,authenticated;
grant update(username) on public.profiles to authenticated;
do $$ declare f record; begin
  for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace
    and proname in ('submit_rated_answer','settle_pending_matches','save_daily_progress','get_or_create_question',
      'update_best_survival_unrated','update_best_survival_rated','update_weakness_score','migrate_local_data')
  loop execute format('revoke all on function %s from public, anon, authenticated',f.signature); end loop;
  for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace
    and (proname like 'game_%' or proname in ('glicko_vol_f','apply_game_answer','start_game','issue_game_question','answer_game_question'))
  loop execute format('revoke all on function %s from public, anon, authenticated',f.signature); end loop;
end $$;
grant execute on function public.start_game(uuid,text),public.issue_game_question(uuid),
  public.answer_game_question(uuid,bigint,jsonb,uuid) to authenticated;
commit;
