-- Scheduled cleanup of rooms inactive beyond ~24h (CLAUDE.md's required
-- v1 features list, ARCHITECTURE.md §13). Plain pg_cron + SQL, not a
-- scheduled Edge Function: the job is a single DELETE with no external
-- calls, Deno runtime, or secrets involved, so an HTTP round trip through
-- an Edge Function would only add latency and a network failure mode for
-- no benefit. If a future cleanup job ever needs to call out to something
-- (e.g. an external analytics ping), pg_net + pg_cron is the documented
-- Supabase path — see the "Cron" and "pg_net" guides — without needing an
-- Edge Function either.
--
-- Install pattern per Supabase's own docs (supabase.com/docs/guides/cron/install):
-- the extension creates its own `cron` schema, not one we choose ourselves.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- `rooms.last_active_at` is already touched on every meaningful mutation
-- (create-room, join-room, promote-host, start-game, round-tick — see each
-- function's own writes), so "inactive beyond 24h" is a direct read of an
-- existing column, no new bookkeeping needed. Cascades handle every child
-- row (categories, players, rounds, chat_messages, game_sessions, and the
-- room_passwords table added just before this migration all have
-- `on delete cascade` back to rooms.id — verified against
-- information_schema before writing this, not assumed) so a plain DELETE
-- on rooms is sufficient; no per-table cleanup loop required.
create or replace function private.cleanup_inactive_rooms()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.rooms
  where last_active_at < now() - interval '24 hours';
$$;

revoke all on function private.cleanup_inactive_rooms() from public, anon, authenticated;

-- Hourly is frequent enough that "inactive beyond 24h" never drifts more
-- than an hour past that bound, and infrequent enough to be a non-event on
-- database load for a party-game-scale table.
select cron.schedule(
  'cleanup-inactive-rooms',
  '0 * * * *',
  $$select private.cleanup_inactive_rooms()$$
);
