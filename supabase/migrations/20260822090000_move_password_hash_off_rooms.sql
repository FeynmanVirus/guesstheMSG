-- Production-readiness RLS pass found a real leak: rooms is in the
-- supabase_realtime publication (use-room-channel.ts subscribes to
-- postgres_changes on it), and Postgres Changes broadcasts the FULL row from
-- the WAL to every subscriber whose RLS predicate passes for that row —
-- independent of PostgREST's column-level grants entirely. The column-grant
-- fix that worked for guesses.guess_text (20260819112311) does NOT apply
-- here: it only restricts REST `select`, not the replication stream.
--
-- Confirmed empirically, not assumed: a live test subscribed to
-- postgres_changes on a password-protected room and triggered an UPDATE
-- (join-room touching last_active_at, which happens on nearly every room
-- mutation) — the received payload included password_hash in full,
-- including its bcrypt/crypt() hash, to every ordinary room member's
-- browser. Column REVOKE alone would not have stopped this.
--
-- Fix: move password_hash out of rooms entirely, into a table that is never
-- added to the realtime publication and carries zero grants to
-- anon/authenticated — the same "RLS enabled, no policies, service_role
-- only" pattern already used for public.words (CLAUDE.md rule 1).
create table public.room_passwords (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  password_hash text not null
);

alter table public.room_passwords enable row level security;

-- No policies created — RLS-enabled-with-zero-policies blocks every row for
-- every role except service_role (which bypasses RLS). The advisor flags
-- this shape as an INFO-level "no policy" lint; that's expected here, not a
-- gap — same as words.
--
-- Explicit revoke, not just "don't grant": Supabase auto-grants
-- SELECT/INSERT/UPDATE/DELETE to anon/authenticated on new public-schema
-- tables by default (this is exactly how rooms.password_hash leaked in the
-- first place — no one ever explicitly revoked it). Naming all three roles
-- is required, not just `from public` — a lesson this repo already learned
-- once (see 20260818152814's own comment on the same footgun for functions).
revoke all on public.room_passwords from public, anon, authenticated;
grant all on public.room_passwords to service_role;

-- Not added to the supabase_realtime publication — deliberately. That's the
-- actual fix; the RLS/grant lockdown above is defense in depth on top of it.

insert into public.room_passwords (room_id, password_hash)
select id, password_hash from public.rooms where password_hash is not null;

alter table public.rooms drop column password_hash;
