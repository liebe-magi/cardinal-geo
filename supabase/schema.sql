-- Cardinal Geo: Supabase Database Schema
-- 本番DB の完全なスキーマ定義（全マイグレーション反映済み）
-- 最終更新: 2026-02-23
--
-- ⚠️  このファイルはリファレンスドキュメントです。
--     新規環境のセットアップには使えますが、
--     既存本番DB に直接適用しないでください。

-- =============================================================
-- 0. ユーティリティ関数
-- =============================================================

-- updated_at 自動更新トリガー関数
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- =============================================================
-- 1. profiles テーブル (auth.users と 1:1)
-- =============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  best_score_survival_rated integer not null default 0,
  best_score_survival_unrated integer not null default 0,
  weakness_scores jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();

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

-- =============================================================
-- 2. user_mode_ratings テーブル (モードごとのレーティング)
-- =============================================================
create table if not exists public.user_mode_ratings (
  user_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null,
  rating double precision not null default 1500,
  rd double precision not null default 350,
  vol double precision not null default 0.06,
  updated_at timestamptz not null default now(),
  primary key (user_id, mode)
);

drop trigger if exists user_mode_ratings_updated_at on public.user_mode_ratings;
create trigger user_mode_ratings_updated_at
  before update on public.user_mode_ratings
  for each row execute function public.update_updated_at();

-- =============================================================
-- 3. questions テーブル (問題ごとの Glicko-2 レーティング)
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
  composite_rating double precision not null default 1500,
  play_count integer not null default 0,
  win_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique(city_a_code, city_b_code)
);

create index if not exists idx_questions_pair on public.questions(city_a_code, city_b_code);
create index if not exists idx_questions_composite on public.questions(composite_rating);

-- =============================================================
-- 4. city_ratings テーブル (都市ごとの Glicko-2 レーティング)
-- =============================================================
create table if not exists public.city_ratings (
  country_code text primary key,
  rating double precision not null default 1500,
  rd double precision not null default 350,
  vol double precision not null default 0.06,
  play_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- =============================================================
-- 5. match_history テーブル (対戦履歴 + pending コミットメント)
-- =============================================================
-- NOTE: mode の CHECK 制約は意図的に設けない。
--       アプリ側でバリデーションを行う。
create table if not exists public.match_history (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  session_id uuid not null,
  mode text not null,
  status text not null default 'pending' check (status in ('pending', 'win', 'lose')),
  user_rating_before double precision not null,
  user_rd_before double precision,
  user_vol_before double precision,
  user_rating_after double precision,
  user_rd_after double precision,
  user_vol_after double precision,
  question_rating_before double precision not null,
  question_rating_after double precision,
  opponent_rating double precision,
  opponent_rd double precision,
  opponent_vol double precision,
  rating_change double precision not null default 0,
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

create index if not exists idx_match_history_user on public.match_history(user_id);
create index if not exists idx_match_history_session on public.match_history(session_id);
create index if not exists idx_match_history_pending on public.match_history(user_id, status) where status = 'pending';

-- =============================================================
-- 6. daily_challenge_results テーブル
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
  unique(user_id, challenge_date)
);

create index if not exists idx_daily_results_date on public.daily_challenge_results(challenge_date);
create index if not exists idx_daily_results_user on public.daily_challenge_results(user_id);

-- =============================================================
-- 7. challenge_unrated_results テーブル
-- =============================================================
create table if not exists public.challenge_unrated_results (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  score integer not null check (score >= 0 and score <= 10),
  created_at timestamptz not null default now()
);

create index if not exists idx_challenge_unrated_user on public.challenge_unrated_results(user_id);

-- =============================================================
-- 8. RLS ポリシー
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

-- user_mode_ratings
alter table public.user_mode_ratings enable row level security;

create policy "User mode ratings are viewable by everyone"
  on public.user_mode_ratings for select
  using (true);

create policy "Users can insert own mode ratings"
  on public.user_mode_ratings for insert
  with check (auth.uid() = user_id);

create policy "Users can update own mode ratings"
  on public.user_mode_ratings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- questions
alter table public.questions enable row level security;

create policy "Questions are viewable by everyone"
  on public.questions for select
  using (true);

-- city_ratings
alter table public.city_ratings enable row level security;

create policy "city_ratings_select"
  on public.city_ratings for select
  to authenticated
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
-- 9. RPC 関数
-- =============================================================

-- 9a. 問題を city_a_code + city_b_code で取得 (なければ作成)
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

    if q is null then
      select * into q
      from public.questions
      where city_a_code = p_city_a_code and city_b_code = p_city_b_code;
    end if;
  end if;

  return q;
end;
$$ language plpgsql security definer;

-- 9b. Rated 回答送信 (pending → win/lose + レーティング更新)
-- survival_rated / challenge_rated → 'global' にマッピング
create or replace function public.submit_rated_answer(
  p_match_history_id bigint,
  p_is_correct boolean,
  p_new_user_rating double precision,
  p_new_user_rd double precision,
  p_new_user_vol double precision,
  p_new_question_rating double precision,
  p_new_question_rd double precision,
  p_new_question_vol double precision,
  p_rating_change double precision,
  p_composite_rating double precision default null,
  p_city_a_code text default null,
  p_city_a_rating double precision default null,
  p_city_a_rd double precision default null,
  p_city_a_vol double precision default null,
  p_city_b_code text default null,
  p_city_b_rating double precision default null,
  p_city_b_rd double precision default null,
  p_city_b_vol double precision default null,
  p_opponent_rating double precision default null,
  p_opponent_rd double precision default null,
  p_opponent_vol double precision default null,
  p_user_rd_after double precision default null,
  p_user_vol_after double precision default null
)
returns void as $$
declare
  match_rec public.match_history;
  v_mode text;
  v_rating_mode text;
begin
  select * into match_rec
  from public.match_history
  where id = p_match_history_id
    and user_id = auth.uid()
    and status = 'pending';

  if not found then
    raise exception 'Match not found or already resolved';
  end if;

  v_mode := match_rec.mode;

  if v_mode in ('survival_rated', 'challenge_rated') then
    v_rating_mode := 'global';
  else
    v_rating_mode := v_mode;
  end if;

  -- Update match history (including snapshot columns)
  update public.match_history
  set
    status = case when p_is_correct then 'win' else 'lose' end,
    user_rating_after = p_new_user_rating,
    question_rating_after = p_new_question_rating,
    rating_change = p_rating_change,
    answered_at = now(),
    opponent_rating = coalesce(p_opponent_rating, opponent_rating),
    opponent_rd = coalesce(p_opponent_rd, opponent_rd),
    opponent_vol = coalesce(p_opponent_vol, opponent_vol),
    user_rd_after = coalesce(p_user_rd_after, user_rd_after),
    user_vol_after = coalesce(p_user_vol_after, user_vol_after)
  where id = p_match_history_id;

  -- Update user rating in user_mode_ratings
  insert into public.user_mode_ratings (user_id, mode, rating, rd, vol)
  values (auth.uid(), v_rating_mode, p_new_user_rating, p_new_user_rd, p_new_user_vol)
  on conflict (user_id, mode) do update set
    rating = excluded.rating,
    rd = excluded.rd,
    vol = excluded.vol;

  -- Update question (pair) rating and stats
  update public.questions
  set
    rating = p_new_question_rating,
    rd = p_new_question_rd,
    vol = p_new_question_vol,
    play_count = play_count + 1,
    win_count = case when p_is_correct then win_count + 1 else win_count end,
    composite_rating = coalesce(p_composite_rating, composite_rating)
  where id = match_rec.question_id;

  -- Update city ratings (if provided)
  if p_city_a_code is not null and p_city_a_rating is not null then
    insert into public.city_ratings (country_code, rating, rd, vol, play_count)
    values (p_city_a_code, p_city_a_rating, p_city_a_rd, p_city_a_vol, 1)
    on conflict (country_code) do update set
      rating = excluded.rating,
      rd = excluded.rd,
      vol = excluded.vol,
      play_count = public.city_ratings.play_count + 1;
  end if;

  if p_city_b_code is not null and p_city_b_rating is not null then
    insert into public.city_ratings (country_code, rating, rd, vol, play_count)
    values (p_city_b_code, p_city_b_rating, p_city_b_rd, p_city_b_vol, 1)
    on conflict (country_code) do update set
      rating = excluded.rating,
      rd = excluded.rd,
      vol = excluded.vol,
      play_count = public.city_ratings.play_count + 1;
  end if;

  -- Update best survival score if applicable
  if v_mode = 'survival_rated' then
    update public.profiles
    set best_score_survival_rated = greatest(
      best_score_survival_rated,
      (
        select count(*)
        from public.match_history
        where session_id = match_rec.session_id
          and status = 'win'
      )::integer
    )
    where id = auth.uid();
  end if;
end;
$$ language plpgsql security definer;

-- 9c. Daily Challenge 進捗保存
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

-- 9d. Daily Challenge 進捗取得
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

-- 9e. Rating ランキング (global: survival_rated + challenge_rated を合算)
create or replace function public.get_rating_ranking(p_mode text default 'global')
returns table(id uuid, username text, rating double precision, play_count bigint) as $$
begin
  return query
    select
      p.id,
      p.username,
      umr.rating,
      count(mh.id) as play_count
    from public.profiles p
    join public.user_mode_ratings umr
      on umr.user_id = p.id and umr.mode = p_mode
    left join public.match_history mh
      on mh.user_id = p.id
      and mh.status != 'pending'
      and (
        (p_mode = 'global' and mh.mode in ('survival_rated', 'challenge_rated'))
        or (p_mode <> 'global' and mh.mode = p_mode)
      )
    group by p.id, p.username, umr.rating
    order by umr.rating desc
    limit 100;
end;
$$ language plpgsql security definer;

-- 9f. Daily Challenge 平均スコアランキング
create or replace function public.get_daily_average_ranking()
returns table(id uuid, username text, rating numeric, play_count integer) as $$
begin
  return query
    select
      p.id,
      p.username,
      round(avg(d.score)::numeric, 1) as rating,
      count(d.id)::integer as play_count
    from public.profiles p
    join public.daily_challenge_results d on p.id = d.user_id
    where d.status = 'completed'
    group by p.id, p.username
    having count(d.id) > 0
    order by rating desc, play_count desc
    limit 100;
end;
$$ language plpgsql security definer;

-- 9g. グローバルアクティビティ統計
create or replace function public.get_global_activity_stats()
returns table(total_players bigint, total_plays bigint, global_accuracy numeric) as $$
declare
  v_total_players bigint;
  v_total_plays bigint;
  v_total_wins bigint;
begin
  select count(*) into v_total_players from public.profiles;

  select coalesce(sum(play_count), 0), coalesce(sum(win_count), 0)
  into v_total_plays, v_total_wins
  from public.questions;

  return query
  select
    v_total_players,
    v_total_plays,
    case
      when v_total_plays > 0 then round((v_total_wins::numeric / v_total_plays::numeric) * 100.0, 1)
      else 0.0
    end;
end;
$$ language plpgsql security definer;

-- 9h. レーティング履歴 (集約済み、global モードのみ)
create or replace function public.get_rating_history_aggregated(
  p_user_id uuid,
  p_period text  -- 'day', 'week', 'month'
)
returns table(
  period_label text,
  open numeric,
  close numeric,
  high numeric,
  low numeric,
  match_count bigint
) as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if p_user_id is distinct from v_uid then
    raise exception 'Forbidden: p_user_id must match auth.uid()';
  end if;

  return query
  with bucketing as (
    select
      mh.user_rating_before,
      mh.user_rating_after,
      mh.answered_at,
      case p_period
        when 'day'   then date_trunc('day',   mh.answered_at)
        when 'week'  then date_trunc('week',  mh.answered_at)
        when 'month' then date_trunc('month', mh.answered_at)
        else date_trunc('day', mh.answered_at)
      end as bucket_date
    from public.match_history mh
    where mh.user_id = v_uid
      and mh.mode in ('survival_rated', 'challenge_rated')
      and mh.status != 'pending'
      and mh.user_rating_after is not null
      and mh.answered_at is not null
  ),
  aggregated as (
    select
      bucket_date,
      count(*) as cnt,
      min(user_rating_after) as min_after,
      max(user_rating_after) as max_after,
      min(user_rating_before) as min_before,
      max(user_rating_before) as max_before,
      min(answered_at) as first_match_time,
      max(answered_at) as last_match_time
    from bucketing
    group by bucket_date
  ),
  joined as (
    select
      a.bucket_date,
      a.cnt,
      least(a.min_after, a.min_before) as low_val,
      greatest(a.max_after, a.max_before) as high_val,
      (select b.user_rating_before from bucketing b
       where b.bucket_date = a.bucket_date and b.answered_at = a.first_match_time
       order by b.user_rating_before limit 1) as open_val,
      (select b.user_rating_after from bucketing b
       where b.bucket_date = a.bucket_date and b.answered_at = a.last_match_time
       order by b.user_rating_after desc limit 1) as close_val
    from aggregated a
  )
  select
    case p_period
      when 'day'   then to_char(j.bucket_date, 'YYYY-MM-DD')
      when 'week'  then to_char(j.bucket_date, 'YYYY-MM-DD')
      when 'month' then to_char(j.bucket_date, 'YYYY-MM')
      else to_char(j.bucket_date, 'YYYY-MM-DD')
    end as period_label,
    j.open_val::numeric as open,
    j.close_val::numeric as close,
    j.high_val::numeric as high,
    j.low_val::numeric as low,
    j.cnt as match_count
  from joined j
  order by j.bucket_date asc;
end;
$$ language plpgsql security invoker;

-- 9i. Survival Unrated ベストスコア更新
create or replace function public.update_best_survival_unrated(
  p_user_id uuid,
  p_score integer
)
returns void as $$
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'update_best_survival_unrated: cannot modify another user''s profile';
  end if;

  update public.profiles
  set best_score_survival_unrated = greatest(best_score_survival_unrated, p_score)
  where id = auth.uid();
end;
$$ language plpgsql security invoker;
