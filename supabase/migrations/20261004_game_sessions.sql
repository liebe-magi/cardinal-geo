begin;
create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null check (mode in ('survival','challenge','starter','asia','europe','africa','americas','oceania','learning')),
  status text not null default 'in_progress' check (status in ('in_progress','completed','abandoned')),
  end_reason text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  challenge_date date,
  rules_version integer not null default 1,
  question_set jsonb not null default '[]',
  score integer not null default 0 check (score >= 0),
  answered_count integer not null default 0 check (answered_count >= score),
  rating_scope text,
  rating_before double precision,
  rating_after double precision,
  total_rating_change double precision not null default 0,
  best_before integer,
  unique(user_id, challenge_date),
  check ((mode = 'challenge') = (challenge_date is not null)),
  check ((status = 'in_progress') = (completed_at is null))
);
create index game_sessions_user_time on public.game_sessions(user_id, started_at desc, id);
alter table public.game_sessions enable row level security;
create policy sessions_owner_read on public.game_sessions for select to authenticated using (user_id = auth.uid());
grant select on public.game_sessions to authenticated;
revoke insert, update, delete on public.game_sessions from anon, authenticated;

-- Legacy rows deliberately have no position/snapshot, and are not promoted to sessions.
alter table public.match_history
  add column if not exists question_ordinal integer,
  add column if not exists presented_question jsonb,
  add column if not exists submission_id uuid;
create unique index match_session_ordinal on public.match_history(session_id, question_ordinal)
  where question_ordinal is not null;

create or replace function public.get_game_result(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.game_sessions;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into s from public.game_sessions where id = p_session_id and user_id = auth.uid();
  if not found then return null; end if;
  return jsonb_build_object('session', to_jsonb(s), 'answers', coalesce((
    select jsonb_agg(to_jsonb(m) order by question_ordinal)
    from public.match_history m where session_id = s.id and status <> 'pending'
  ), '[]'::jsonb));
end;
$$;
revoke all on function public.get_game_result(uuid) from public, anon;
grant execute on function public.get_game_result(uuid) to authenticated;
commit;
