-- Cardinal: Supabase Database Schema
-- Run this SQL in Supabase SQL Editor to set up the database.

-- =============================================================
-- 1. profiles テーブル (auth.users と 1:1)
-- =============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  rating double precision not null default 1500,
  rd double precision not null default 350,
  vol double precision not null default 0.06,
  best_score_survival_rated integer not null default 0,
  best_score_survival_unrated integer not null default 0,
  weakness_scores jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- auth.users 作成時に自動でプロフィール行を作る
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', 'Player_' || left(new.id::text, 8)));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at 自動更新
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();

-- =============================================================
-- 2. questions テーブル (問題ごとの Glicko-2 レーティング)
-- =============================================================
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  city_a_code text not null,
  city_b_code text not null,
  city_a_capital text not null,
  city_b_capital text not null,
  correct_ns char(1) not null check (correct_ns in ('N', 'S')),
  correct_ew char(1) not null check (correct_ew in ('E', 'W')),
  rating double precision not null default 1500,
  rd double precision not null default 350,
  vol double precision not null default 0.06,
  play_count integer not null default 0,
  win_count integer not null default 0,
  created_at timestamptz not null default now(),
  -- 同じペアの問題は 1 つだけ
  unique(city_a_code, city_b_code)
);

-- 検索用インデックス
create index if not exists idx_questions_pair on public.questions(city_a_code, city_b_code);

-- =============================================================
-- 3. match_history テーブル (対戦履歴 + pending コミットメント)
-- =============================================================
create table if not exists public.match_history (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  session_id uuid not null,
  mode text not null check (mode in ('survival_rated', 'challenge_rated')),
  status text not null default 'pending' check (status in ('pending', 'win', 'lose')),
  user_rating_before double precision not null,
  user_rating_after double precision,
  question_rating_before double precision not null,
  question_rating_after double precision,
  rating_change double precision not null default 0,
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

create index if not exists idx_match_history_user on public.match_history(user_id);
create index if not exists idx_match_history_session on public.match_history(session_id);
create index if not exists idx_match_history_pending on public.match_history(user_id, status) where status = 'pending';

-- =============================================================
-- 4. daily_challenge_results テーブル
-- =============================================================
create table if not exists public.daily_challenge_results (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  challenge_date date not null,
  score integer not null default 0,
  total_rating_change double precision not null default 0,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  current_question integer not null default 0,
  answers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  -- 1ユーザーにつき1日1回
  unique(user_id, challenge_date)
);

create index if not exists idx_daily_results_date on public.daily_challenge_results(challenge_date);
create index if not exists idx_daily_results_user on public.daily_challenge_results(user_id);

-- =============================================================
-- 5. challenge_unrated_results テーブル
-- =============================================================
create table if not exists public.challenge_unrated_results (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  score integer not null check (score >= 0 and score <= 10),
  created_at timestamptz not null default now()
);

create index if not exists idx_challenge_unrated_user on public.challenge_unrated_results(user_id);

-- =============================================================
-- 6. RLS ポリシー
-- =============================================================

-- profiles
alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- questions
alter table public.questions enable row level security;

create policy "Questions are viewable by everyone"
  on public.questions for select
  using (true);

-- match_history
alter table public.match_history enable row level security;

create policy "Users can view own match history"
  on public.match_history for select
  using (auth.uid() = user_id);

create policy "Users can insert own match history"
  on public.match_history for insert
  with check (auth.uid() = user_id);

create policy "Users can update own match history"
  on public.match_history for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- daily_challenge_results
alter table public.daily_challenge_results enable row level security;

create policy "Daily results are viewable by everyone"
  on public.daily_challenge_results for select
  using (true);

create policy "Users can insert own daily results"
  on public.daily_challenge_results for insert
  with check (auth.uid() = user_id);

create policy "Users can update own daily results"
  on public.daily_challenge_results for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- challenge_unrated_results
alter table public.challenge_unrated_results enable row level security;

create policy "Challenge unrated results viewable by everyone"
  on public.challenge_unrated_results for select
  using (true);

create policy "Users can insert own challenge unrated results"
  on public.challenge_unrated_results for insert
  with check (auth.uid() = user_id);

-- =============================================================
-- 7. RPC 関数
-- =============================================================

-- 7a. Pending レコードの精算 — セッション開始時に呼ぶ
-- auth.uid() を使用し、自分のマッチのみ精算可能
create or replace function public.settle_pending_matches()
returns integer as $$
declare
  settled_count integer;
begin
  -- pending → lose に更新し、レーティングを反映
  with pending as (
    select id, question_id, user_rating_before, question_rating_before
    from public.match_history
    where user_id = auth.uid() and status = 'pending'
  )
  update public.match_history mh
  set
    status = 'lose',
    answered_at = now()
  from pending p
  where mh.id = p.id;

  get diagnostics settled_count = row_count;
  return settled_count;
end;
$$ language plpgsql security definer;

-- 7b. Challenge Unrated ランキング (平均スコア, 最低5回プレイ)
create or replace function public.get_challenge_unrated_ranking()
returns table(id uuid, username text, avg_score numeric, play_count bigint) as $$
begin
  return query
    select
      p.id,
      p.username,
      round(avg(r.score)::numeric, 2) as avg_score,
      count(r.id) as play_count
    from public.profiles p
    inner join public.challenge_unrated_results r on r.user_id = p.id
    group by p.id, p.username
    having count(r.id) >= 5
    order by avg(r.score) desc, count(r.id) desc
    limit 100;
end;
$$ language plpgsql security definer;

-- 7b2. Rating Ranking (with play count from match_history)
create or replace function public.get_rating_ranking()
returns table(id uuid, username text, rating double precision, play_count bigint) as $$
begin
  return query
    select
      p.id,
      p.username,
      p.rating,
      count(mh.id) as play_count
    from public.profiles p
    left join public.match_history mh
      on mh.user_id = p.id and mh.status != 'pending'
    group by p.id, p.username, p.rating
    order by p.rating desc
    limit 100;
end;
$$ language plpgsql security definer;

-- 7c. 問題を city_a_code + city_b_code で取得 (なければ作成)
create or replace function public.get_or_create_question(
  p_city_a_code text,
  p_city_b_code text,
  p_city_a_capital text,
  p_city_b_capital text,
  p_correct_ns char(1),
  p_correct_ew char(1)
)
returns public.questions as $$
declare
  q public.questions;
begin
  select * into q
  from public.questions
  where city_a_code = p_city_a_code and city_b_code = p_city_b_code;

  if not found then
    insert into public.questions (city_a_code, city_b_code, city_a_capital, city_b_capital, correct_ns, correct_ew)
    values (p_city_a_code, p_city_b_code, p_city_a_capital, p_city_b_capital, p_correct_ns, p_correct_ew)
    on conflict (city_a_code, city_b_code) do nothing
    returning * into q;

    -- Handle race condition — if another session inserted it
    if q is null then
      select * into q
      from public.questions
      where city_a_code = p_city_a_code and city_b_code = p_city_b_code;
    end if;
  end if;

  return q;
end;
$$ language plpgsql security definer;

-- 7d. Rated 回答送信 (pending → win/lose + レーティング更新)
create or replace function public.submit_rated_answer(
  p_match_history_id bigint,
  p_is_correct boolean,
  p_new_user_rating double precision,
  p_new_user_rd double precision,
  p_new_user_vol double precision,
  p_new_question_rating double precision,
  p_new_question_rd double precision,
  p_new_question_vol double precision,
  p_rating_change double precision
)
returns void as $$
declare
  match_rec public.match_history;
begin
  -- Verify ownership and pending status
  select * into match_rec
  from public.match_history
  where id = p_match_history_id
    and user_id = auth.uid()
    and status = 'pending';

  if not found then
    raise exception 'Match not found or already resolved';
  end if;

  -- Update match history
  update public.match_history
  set
    status = case when p_is_correct then 'win' else 'lose' end,
    user_rating_after = p_new_user_rating,
    question_rating_after = p_new_question_rating,
    rating_change = p_rating_change,
    answered_at = now()
  where id = p_match_history_id;

  -- Update user rating
  update public.profiles
  set
    rating = p_new_user_rating,
    rd = p_new_user_rd,
    vol = p_new_user_vol
  where id = auth.uid();

  -- Update question rating and stats
  update public.questions
  set
    rating = p_new_question_rating,
    rd = p_new_question_rd,
    vol = p_new_question_vol,
    play_count = play_count + 1,
    win_count = case when p_is_correct then win_count + 1 else win_count end
  where id = match_rec.question_id;

  -- Update best survival score if applicable
  if match_rec.mode = 'survival_rated' then
    update public.profiles
    set best_score_survival_rated = greatest(
      best_score_survival_rated,
      (select count(*) from public.match_history
       where session_id = match_rec.session_id and status = 'win')::integer
    )
    where id = auth.uid();
  end if;
end;
$$ language plpgsql security definer;

-- 7e. Daily Challenge 進捗保存
create or replace function public.save_daily_progress(
  p_challenge_date date,
  p_score integer,
  p_current_question integer,
  p_answers jsonb,
  p_total_rating_change double precision,
  p_completed boolean
)
returns public.daily_challenge_results as $$
declare
  result public.daily_challenge_results;
begin
  insert into public.daily_challenge_results (
    user_id, challenge_date, score, current_question, answers,
    total_rating_change, status, completed_at
  )
  values (
    auth.uid(), p_challenge_date, p_score, p_current_question, p_answers,
    p_total_rating_change,
    case when p_completed then 'completed' else 'in_progress' end,
    case when p_completed then now() else null end
  )
  on conflict (user_id, challenge_date) do update set
    score = excluded.score,
    current_question = excluded.current_question,
    answers = excluded.answers,
    total_rating_change = excluded.total_rating_change,
    status = excluded.status,
    completed_at = excluded.completed_at
  returning * into result;

  return result;
end;
$$ language plpgsql security definer;

-- 7f. Daily Challenge 進捗取得
create or replace function public.get_daily_progress(p_challenge_date date)
returns public.daily_challenge_results as $$
declare
  result public.daily_challenge_results;
begin
  select * into result
  from public.daily_challenge_results
  where user_id = auth.uid()
    and challenge_date = p_challenge_date;
  return result;
end;
$$ language plpgsql security definer;
