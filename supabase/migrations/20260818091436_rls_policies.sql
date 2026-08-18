-- Phase 1: RLS + grants.
--
-- Supabase's default privileges grant anon/authenticated table access in
-- `public`, so every table gets an explicit `revoke all` before its (narrow)
-- grants are added back — RLS alone would still leave the blanket grant in
-- place. Anonymous players use the `authenticated` role (see
-- ARCHITECTURE.md §8), so every policy below is `to authenticated`; `anon`
-- is never used by a player and gets no grants anywhere.

-- ---------------------------------------------------------------------------
-- words — never exposed to clients (ARCHITECTURE.md §3, Non-negotiable rule 1)
-- ---------------------------------------------------------------------------
alter table public.words enable row level security;
revoke all on public.words from anon, authenticated;
-- Deliberately zero policies: no row is visible to any client role. Only
-- service_role (which bypasses RLS) reads `answer`. Players receive
-- emoji_sequence via the snapshot on `rounds`, never via this table.

-- ---------------------------------------------------------------------------
-- rooms
-- ---------------------------------------------------------------------------
alter table public.rooms enable row level security;
revoke all on public.rooms from anon, authenticated;
grant select on public.rooms to authenticated;

create policy rooms_select_member on public.rooms
  for select to authenticated
  using (public.is_room_member(id));

-- No client insert/update/delete: room creation, status transitions, and
-- settings changes go through Edge Functions running as service_role
-- (ARCHITECTURE.md §4).

-- ---------------------------------------------------------------------------
-- players
-- ---------------------------------------------------------------------------
alter table public.players enable row level security;
revoke all on public.players from anon, authenticated;
grant select on public.players to authenticated;
-- Column-level grant: score/is_host/status/is_muted/is_spectator are absent,
-- so a client UPDATE touching them is rejected by the privilege system
-- before RLS is even consulted (Non-negotiable rule 4 — score is
-- Edge-Function-only).
grant update (display_name, avatar_id) on public.players to authenticated;

create policy players_select_member on public.players
  for select to authenticated
  using (public.is_room_member(room_id));

create policy players_update_self on public.players
  for update to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- No client insert: joining runs through the join-room Edge Function, which
-- is where the password check, max-player cap, and kicked-player check
-- belong (ARCHITECTURE.md §10, §14).

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
alter table public.categories enable row level security;
revoke all on public.categories from anon, authenticated;
grant select on public.categories to authenticated;

create policy categories_select on public.categories
  for select to authenticated
  using (room_id is null or public.is_room_member(room_id));

-- ---------------------------------------------------------------------------
-- game_sessions
-- ---------------------------------------------------------------------------
alter table public.game_sessions enable row level security;
revoke all on public.game_sessions from anon, authenticated;
grant select on public.game_sessions to authenticated;

create policy game_sessions_select on public.game_sessions
  for select to authenticated
  using (public.is_room_member(room_id));

-- Insert/update (starting or ending a session) is Edge-Function-only
-- (restart-room), per ARCHITECTURE.md §4.

-- ---------------------------------------------------------------------------
-- rounds
-- ---------------------------------------------------------------------------
alter table public.rounds enable row level security;
revoke all on public.rounds from anon, authenticated;
grant select on public.rounds to authenticated;

create policy rounds_select on public.rounds
  for select to authenticated
  using (public.is_room_member(room_id));

-- ---------------------------------------------------------------------------
-- guesses
-- ---------------------------------------------------------------------------
alter table public.guesses enable row level security;
revoke all on public.guesses from anon, authenticated;
grant select on public.guesses to authenticated;

create policy guesses_select on public.guesses
  for select to authenticated
  using (public.is_room_member_of_round(round_id));

-- No client insert: guesses are written only by the submit-guess Edge
-- Function (Non-negotiable rule 2).

-- ---------------------------------------------------------------------------
-- chat_messages
-- ---------------------------------------------------------------------------
alter table public.chat_messages enable row level security;
revoke all on public.chat_messages from anon, authenticated;
grant select, insert on public.chat_messages to authenticated;

create policy chat_messages_select on public.chat_messages
  for select to authenticated
  using (public.is_room_member(room_id));

-- A player may only insert as themselves, only 'chat' kind (guess/system
-- rows are written server-side), and only while not muted — checked in the
-- policy itself so a muted client can't bypass it by calling PostgREST
-- directly (ARCHITECTURE.md §4, §10).
create policy chat_messages_insert_unmuted on public.chat_messages
  for insert to authenticated
  with check (
    kind = 'chat'
    and exists (
      select 1
      from public.players p
      where p.id = chat_messages.player_id
        and p.room_id = chat_messages.room_id
        and p.auth_user_id = auth.uid()
        and p.status = 'active'
        and p.is_muted = false
    )
  );
