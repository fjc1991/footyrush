create table public.invincible_attempts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  guest_hash text,
  participant_key text not null,
  attempt_number integer not null,
  user_count_snapshot integer not null,
  target_odds_snapshot numeric not null,
  eligible boolean not null default false,
  unbeaten boolean,
  official_award boolean,
  points integer,
  wins integer,
  draws integer,
  losses integer,
  goal_difference integer,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index invincible_attempts_participant_idx on public.invincible_attempts(participant_key);
create index invincible_attempts_completed_idx on public.invincible_attempts(completed_at);

alter table public.invincible_attempts enable row level security;

create policy "invincible attempts readable by owner" on public.invincible_attempts
  for select using (profile_id = auth.uid());

-- Competitive writes are performed by trusted server code with the service role.

create or replace function public.invincible_distinct_user_count()
returns integer
language sql
security definer
set search_path = public
as $$
  select greatest(0, count(distinct participant_key))::integer
  from public.invincible_attempts;
$$;
