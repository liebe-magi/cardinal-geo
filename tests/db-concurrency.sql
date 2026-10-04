\set ON_ERROR_STOP on
-- Test-only dblink connections race real independent transactions on the isolated database.
create extension if not exists dblink;
insert into auth.users(id,raw_user_meta_data) values
 ('00000000-0000-0000-0000-000000000006','{"name":"parallel-one"}'),
 ('00000000-0000-0000-0000-000000000007','{"name":"parallel-two"}');
create temporary table race_fixture(user_id uuid,session_id uuid,match_id bigint,question_id uuid,answer jsonb);
do $$ declare uid uuid; r jsonb; q jsonb;
begin
 foreach uid in array array['00000000-0000-0000-0000-000000000006'::uuid,'00000000-0000-0000-0000-000000000007'::uuid] loop
  perform set_config('request.jwt.claim.sub',uid::text,true);
  r:=public.start_game(gen_random_uuid(),'challenge');q:=public.issue_game_question((r->'session'->>'id')::uuid);
  insert into race_fixture select uid,(r->'session'->>'id')::uuid,(q->>'id')::bigint,question_id,q->'question'->'correctDirection' from public.match_history where id=(q->>'id')::bigint;
 end loop;
end $$;
create temporary table race_before as select play_count from public.questions where id=(select question_id from race_fixture limit 1);
select dblink_connect('race1',format('dbname=%I user=postgres',current_database()));
select dblink_connect('race2',format('dbname=%I user=postgres',current_database()));
select dblink_exec('race1','set role authenticated');
select dblink_exec('race2','set role authenticated');
select dblink_exec('race1',$$set request.jwt.claim.sub='00000000-0000-0000-0000-000000000006'$$);
select dblink_exec('race2',$$set request.jwt.claim.sub='00000000-0000-0000-0000-000000000007'$$);
select dblink_send_query(case when user_id='00000000-0000-0000-0000-000000000006' then 'race1' else 'race2' end,
 format('select public.answer_game_question(%L,%s,%L,%L)',session_id,match_id,answer,gen_random_uuid())) from race_fixture;
select value->'session'->>'score' from dblink_get_result('race1') as r(value jsonb);
select value->'session'->>'score' from dblink_get_result('race2') as r(value jsonb);
do $$ declare actual integer; before_count integer;
begin
 select play_count into actual from public.questions where id=(select question_id from race_fixture limit 1);
 select play_count into before_count from race_before;
 if actual<>before_count+2 then raise exception 'Lost shared pair update'; end if;
 if (select count(*) from public.match_history where id in (select match_id from race_fixture) and status='win')<>2 then raise exception 'Lost answer'; end if;
end $$;
select dblink_disconnect('race1');select dblink_disconnect('race2');
-- Duplicate response retries after both commits must not change pair counts.
do $$ declare f record;
begin
 for f in select * from race_fixture loop
  perform set_config('request.jwt.claim.sub',f.user_id::text,true);
  perform public.answer_game_question(f.session_id,f.match_id,f.answer,gen_random_uuid());
 end loop;
 if (select play_count from public.questions where id=(select question_id from race_fixture limit 1))<>(select play_count+2 from race_before) then raise exception 'Retry updated pair'; end if;
end $$;
-- The same pending answer is submitted twice from independent connections.
delete from race_fixture where user_id='00000000-0000-0000-0000-000000000007';
do $$ declare q jsonb;
begin
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',true);
 q:=public.issue_game_question((select session_id from race_fixture));
 update race_fixture set match_id=(q->>'id')::bigint,answer=q->'question'->'correctDirection',
 question_id=(select question_id from public.match_history where id=(q->>'id')::bigint);
end $$;
truncate race_before;
insert into race_before select play_count from public.questions where id=(select question_id from race_fixture);
select dblink_connect('same1',format('dbname=%I user=postgres',current_database()));
select dblink_connect('same2',format('dbname=%I user=postgres',current_database()));
select dblink_exec('same1','set role authenticated');
select dblink_exec('same2','set role authenticated');
select dblink_exec('same1',$$set request.jwt.claim.sub='00000000-0000-0000-0000-000000000006'$$);
select dblink_exec('same2',$$set request.jwt.claim.sub='00000000-0000-0000-0000-000000000006'$$);
select dblink_send_query(conn,format('select public.answer_game_question(%L,%s,%L,%L)',session_id,match_id,answer,gen_random_uuid()))
 from race_fixture cross join unnest(array['same1','same2']) conn;
select value->'session'->>'score' from dblink_get_result('same1') as r(value jsonb);
select value->'session'->>'score' from dblink_get_result('same2') as r(value jsonb);
do $$ begin
 if (select answered_count from public.game_sessions where id=(select session_id from race_fixture))<>2 then raise exception 'Concurrent duplicate counted twice'; end if;
 if (select play_count from public.questions where id=(select question_id from race_fixture))<>(select play_count+1 from race_before) then raise exception 'Concurrent duplicate rated twice'; end if;
end $$;
select dblink_disconnect('same1'); select dblink_disconnect('same2');
delete from auth.users where id in ('00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000007');
drop extension dblink;
