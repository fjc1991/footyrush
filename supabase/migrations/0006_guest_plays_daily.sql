-- Guests get N free plays PER DAY (was a lifetime count). Add a play_day column
-- so the counter resets at UTC midnight, and make the atomic increment day-aware
-- (reset when the day rolls over) and capped at the limit.

alter table public.guest_play_allowances
  add column if not exists play_day date not null default ((now() at time zone 'utc')::date);

create or replace function public.increment_guest_play(p_ip_hash text, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_count integer;
begin
  insert into public.guest_play_allowances (ip_hash, play_count, play_day, last_seen_at)
  values (p_ip_hash, 1, v_today, now())
  on conflict (ip_hash) do update
    set play_count = case
          when public.guest_play_allowances.play_day < v_today then 1
          when public.guest_play_allowances.play_count < p_limit then public.guest_play_allowances.play_count + 1
          else public.guest_play_allowances.play_count
        end,
        play_day = v_today,
        last_seen_at = now()
  returning play_count into v_count;
  return v_count;
end;
$$;
