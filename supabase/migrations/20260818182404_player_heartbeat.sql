-- Phase 3: host-liveness heartbeat (ARCHITECTURE.md §8/§11 — closes the
-- previously-open "exact Presence heartbeat/timeout" question, §16).
--
-- Only the host heartbeats (players is in the realtime publication, so
-- everyone heartbeating would fan out N× realtime messages per beat for
-- state Presence already gives for free). The host's own liveness is the
-- only liveness the server needs to authorize a host-migration decision.
--
-- Design note carried into ARCHITECTURE.md: this is the one new
-- client-writable column on `players` since Phase 1's non-negotiable rule 4
-- locked score/is_host/is_connected/status down to Edge-Function-only. It's
-- safe specifically because the client can never choose its value — the
-- trigger below always overwrites it with the server's own clock, so the
-- only assertion a client can make is "I am alive right now", identical
-- power to what Presence's client-side .track() already lets any client
-- claim, and strictly weaker than anything in the score/game-state family.

alter table public.players
  add column last_seen_at timestamptz not null default now();

create function private.stamp_last_seen()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user = 'authenticated'
     and new.last_seen_at is distinct from old.last_seen_at then
    new.last_seen_at := now();
  end if;
  return new;
end;
$$;

create trigger players_stamp_last_seen
  before update on public.players
  for each row execute function private.stamp_last_seen();

-- current_user = 'authenticated' is the PostgREST role for a player JWT;
-- service_role and the SQL editor (postgres) bypass stamping — this keeps
-- Edge Function writes explicit and lets tests back-date a lease directly.
grant update (display_name, avatar_id, last_seen_at) on public.players to authenticated;
-- (players_update_self policy already scopes this to auth_user_id = auth.uid())

create index players_room_joined_idx on public.players (room_id, joined_at);
