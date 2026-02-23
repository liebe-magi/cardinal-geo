-- 1. Create user_mode_ratings table
create table if not exists public.user_mode_ratings (
  user_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null,
  rating double precision not null default 1500,
  rd double precision not null default 350,
  vol double precision not null default 0.06,
  updated_at timestamptz not null default now(),
  primary key (user_id, mode)
);

-- 2. Enable RLS and add policies
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

-- Trigger for updated_at
create trigger user_mode_ratings_updated_at
  before update on public.user_mode_ratings
  for each row execute function public.update_updated_at();

-- 3. Insert existing ratings from profiles into user_mode_ratings with mode = 'global'
insert into public.user_mode_ratings (user_id, mode, rating, rd, vol, updated_at)
select id, 'global', rating, rd, vol, updated_at
from public.profiles
on conflict (user_id, mode) do nothing;

-- 4. Update submit_rated_answer RPC
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
  p_city_b_vol double precision default null
)
returns void as $$
declare
  match_rec public.match_history;
  v_mode text;
  v_rating_mode text;
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

  v_mode := match_rec.mode;
  v_rating_mode := case when v_mode in ('survival_rated', 'challenge_rated') then 'global' else v_mode end;

  -- Update match history
  update public.match_history
  set
    status = case when p_is_correct then 'win' else 'lose' end,
    user_rating_after = p_new_user_rating,
    question_rating_after = p_new_question_rating,
    rating_change = p_rating_change,
    answered_at = now()
  where id = p_match_history_id;

  -- Update user rating in user_mode_ratings
  insert into public.user_mode_ratings (user_id, mode, rating, rd, vol)
  values (auth.uid(), v_rating_mode, p_new_user_rating, p_new_user_rd, p_new_user_vol)
  on conflict (user_id, mode) do update set
    rating = excluded.rating,
    rd = excluded.rd,
    vol = excluded.vol;

  -- Update question rating and stats
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
      play_count = city_ratings.play_count + 1;
  end if;

  if p_city_b_code is not null and p_city_b_rating is not null then
    insert into public.city_ratings (country_code, rating, rd, vol, play_count)
    values (p_city_b_code, p_city_b_rating, p_city_b_rd, p_city_b_vol, 1)
    on conflict (country_code) do update set
      rating = excluded.rating,
      rd = excluded.rd,
      vol = excluded.vol,
      play_count = city_ratings.play_count + 1;
  end if;

  -- Update best survival score if applicable
  if v_mode = 'survival_rated' then
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

-- 5. Update get_rating_ranking RPC
drop function if exists public.get_rating_ranking();

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
    join public.user_mode_ratings umr on umr.user_id = p.id and umr.mode = p_mode
    left join public.match_history mh
      on mh.user_id = p.id
      and mh.status != 'pending'
      and (
        (p_mode = 'global' and mh.mode in ('survival_rated', 'challenge_rated'))
        or (p_mode != 'global' and mh.mode = p_mode)
      )
    group by p.id, p.username, umr.rating
    order by umr.rating desc
    limit 100;
end;
$$ language plpgsql security definer;
