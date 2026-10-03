\set ON_ERROR_STOP on
begin;
insert into auth.users(id,raw_user_meta_data) values ('00000000-0000-0000-0000-000000000001','{"name":"test-one"}'),('00000000-0000-0000-0000-000000000002','{"name":"test-two"}');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
do $$
declare result jsonb; issued jsonb; again jsonb; sid uuid; r float8[]; expected jsonb; i integer;
begin
  result := public.start_game('11111111-1111-1111-1111-111111111111','survival');
  sid := (result->'session'->>'id')::uuid;
  issued := public.issue_game_question(sid);
  if issued <> public.issue_game_question(sid) then raise exception 'Question changed on retry'; end if;
  for i in 1..3 loop
    if i>1 then issued := public.issue_game_question(sid); end if;
    result := public.answer_game_question(sid,(issued->>'id')::bigint,
      case when i<3 then issued->'question'->'correctDirection' else jsonb_build_object(
        'ns',case when issued->'question'->'correctDirection'->>'ns'='N' then 'S' else 'N' end,
        'ew',issued->'question'->'correctDirection'->>'ew') end,gen_random_uuid());
    again := public.answer_game_question(sid,(issued->>'id')::bigint,'{"ns":"N","ew":"E","score":99999}',gen_random_uuid());
    if again<>result then raise exception 'Duplicate answer changed result'; end if;
  end loop;
  if result->'session'->>'score'<>'2' or result->'session'->>'status'<>'completed' then raise exception 'Invalid completion: %',result; end if;
  if result->'answers'->0->>'user_rating_after' <> result->'answers'->1->>'user_rating_before' or
     result->'answers'->1->>'user_rd_after' <> result->'answers'->2->>'user_rd_before' or
     result->'answers'->1->>'user_vol_after' <> result->'answers'->2->>'user_vol_before' then raise exception 'Broken rating chain'; end if;
  begin
    update public.user_mode_ratings set rating=99999;
    raise exception 'Direct rating write allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set best_score_survival_rated=99999;
    raise exception 'Direct best score write allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.apply_game_answer((issued->>'id')::bigint,null,gen_random_uuid(),true);
    raise exception 'Private expiry function exposed';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
  if public.get_game_result(sid) is not null then raise exception 'Other user result exposed'; end if;
  begin
    perform public.answer_game_question(sid,(issued->>'id')::bigint,'{"ns":"N","ew":"E"}',gen_random_uuid());
    raise exception 'Other user answer allowed';
  exception when raise_exception then if sqlerrm<>'Answer not found' then raise; end if; end;
end $$;
reset role;
do $$
declare r float8[]; qs jsonb; pairs text[];
begin
  r := public.game_rate(1500,350,.06,1500,350,1);
  if abs(r[1]-1662.3108939062977)>.000001 or abs(r[2]-290.31896371798047)>.000001 or abs(r[3]-.05999967537233814)>.000000000001 then
    raise exception 'Glicko regression: %',r;
  end if;
  qs := public.game_daily_questions('2026-10-03');
  select array_agg((q->'cityA'->>'countryCode')||'/'||(q->'cityB'->>'countryCode')) into pairs from jsonb_array_elements(qs) q;
  if pairs <> array['MU/PT','SV/KW','GH/CK','TT/MU','BN/BR','CI/ID','GM/ES','GB/AF','KM/CV','BG/IR'] then
    raise exception 'Daily seed regression: %',pairs;
  end if;
end $$;
rollback;

-- A daily resume keeps the server question set and session ID; failed writes roll back all ratings.
begin;
insert into auth.users(id,raw_user_meta_data) values ('00000000-0000-0000-0000-000000000003','{"name":"daily-test"}');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
create function public.fail_daily_test() returns trigger language plpgsql as $$ begin raise exception 'injected failure'; end $$;
create trigger fail_daily before insert or update on public.daily_challenge_results for each row execute function public.fail_daily_test();
set local role authenticated;
do $$
declare r jsonb; issued jsonb; sid uuid;
begin
  r := public.start_game(gen_random_uuid(),'challenge'); sid := (r->'session'->>'id')::uuid;
  issued := public.issue_game_question(sid);
  begin
    perform public.answer_game_question(sid,(issued->>'id')::bigint,issued->'question'->'correctDirection',gen_random_uuid());
    raise exception 'Failure injection did not fail';
  exception when raise_exception then if sqlerrm<>'injected failure' then raise; end if; end;
  if (public.get_game_result(sid)->'session'->>'answered_count')::integer<>0 then raise exception 'Partial session commit'; end if;
  if exists(select 1 from public.user_mode_ratings where user_id=auth.uid()) then raise exception 'Partial rating commit'; end if;
end $$;
reset role;
drop trigger fail_daily on public.daily_challenge_results;
set local role authenticated;
do $$
declare r jsonb; issued jsonb; sid uuid; request uuid:=gen_random_uuid(); i integer; first_set jsonb;
begin
  r := public.start_game(request,'challenge'); sid := (r->'session'->>'id')::uuid; first_set:=r->'session'->'question_set';
  for i in 1..10 loop
    if i=6 then
      r:=public.start_game(gen_random_uuid(),'challenge');
      if (r->'session'->>'id')::uuid<>sid or r->'session'->'question_set'<>first_set then raise exception 'Daily changed after resume'; end if;
    end if;
    issued:=public.issue_game_question(sid);
    r:=public.answer_game_question(sid,(issued->>'id')::bigint,issued->'question'->'correctDirection',gen_random_uuid());
  end loop;
  if r->'session'->>'status'<>'completed' or jsonb_array_length(r->'answers')<>10 then raise exception 'Daily incomplete'; end if;
  if public.start_game(gen_random_uuid(),'challenge')<>r then raise exception 'Completed daily changed'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.start_game(gen_random_uuid(),'survival'); raise exception 'Anon play allowed';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

-- Replaced rated commitments keep the legacy player-vs-pair loss, without city changes.
begin;
insert into auth.users(id,raw_user_meta_data) values ('00000000-0000-0000-0000-000000000008','{"name":"expiry-learning"}');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000008',true);
do $$ declare r jsonb; q jsonb; sid uuid; city_before jsonb; expected float8[]; pair public.questions; learning_id uuid;
begin
 r:=public.start_game(gen_random_uuid(),'survival'); sid:=(r->'session'->>'id')::uuid;
 q:=public.issue_game_question(sid);
 select * into pair from public.questions where id=(select question_id from public.match_history where id=(q->>'id')::bigint);
 insert into public.city_ratings(country_code) values(pair.city_a_code),(pair.city_b_code) on conflict do nothing;
 select jsonb_agg(to_jsonb(c) order by country_code) into city_before from public.city_ratings c;
 expected:=public.game_rate(1500,350,.06,pair.rating,pair.rd,0);
 r:=public.start_game(gen_random_uuid(),'learning'); learning_id:=(r->'session'->>'id')::uuid;
 if abs((select rating from public.user_mode_ratings where user_id=auth.uid() and mode='global')-expected[1])>.000001 then raise exception 'Expiry rating differs'; end if;
 if city_before is distinct from (select jsonb_agg(to_jsonb(c) order by country_code) from public.city_ratings c) then raise exception 'Expiry changed cities'; end if;
 if public.get_game_result(sid)->'session'->>'status'<>'abandoned' then raise exception 'Replaced game was marked complete'; end if;
 if public.get_game_result(sid)->'answers'->0->>'user_answer_ns' is not null then raise exception 'Expiry fabricated answer'; end if;
 if (select weakness_scores from public.profiles where id=auth.uid())<>'{}'::jsonb then raise exception 'Expiry changed weaknesses'; end if;
 q:=public.issue_game_question(learning_id);
 r:=public.answer_game_question(learning_id,(q->>'id')::bigint,q->'question'->'correctDirection',gen_random_uuid());
 if r->'session'->>'score'<>'1' or r->'session'->>'rating_after' is not null then raise exception 'Invalid learning result'; end if;
 if (select count(*) from public.user_mode_ratings where user_id=auth.uid())<>1 then raise exception 'Learning created rating'; end if;
 if city_before is distinct from (select jsonb_agg(to_jsonb(c) order by country_code) from public.city_ratings c) then raise exception 'Learning changed cities'; end if;
end $$;
rollback;
