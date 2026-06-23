-- Atomic, capped guest-play increment.
--
-- Fixes two issues in /api/guest-plays:
--   1. The read-then-upsert TOCTOU race (concurrent requests clobbering each
--      other and under-recording plays, granting extra free plays).
--   2. Over-recording past the limit: the increment only advances while below
--      p_limit, so an already-capped guest is not pushed further.
--
-- Returns the post-call play_count so the route gates on an authoritative value
-- from a single atomic statement.

create or replace function public.increment_guest_play(p_ip_hash text, p_limit integer)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.guest_play_allowances (ip_hash, play_count, last_seen_at)
  values (p_ip_hash, 1, now())
  on conflict (ip_hash) do update
    set play_count = case
          when public.guest_play_allowances.play_count < p_limit
            then public.guest_play_allowances.play_count + 1
          else public.guest_play_allowances.play_count
        end,
        last_seen_at = now()
  returning play_count;
$$;
