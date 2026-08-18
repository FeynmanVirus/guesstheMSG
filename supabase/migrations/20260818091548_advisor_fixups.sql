-- Phase 1 fixups, from mcp__supabase__get_advisors after the initial apply:
--
-- 1. `revoke ... from public` in helper_functions.sql didn't touch `anon`:
--    Supabase grants EXECUTE to anon/authenticated directly at function
--    creation via default privileges, not through the PUBLIC pseudo-role, so
--    the explicit revoke below is required in addition to it. Confirmed via
--    information_schema.routine_privileges that `anon` still had EXECUTE on
--    all three helper functions.
-- 2. `players_update_self` and `chat_messages_insert_unmuted` called
--    auth.uid() directly, which re-evaluates per row; wrapping as
--    `(select auth.uid())` lets Postgres evaluate it once per statement
--    (WARN: auth_rls_initplan).
-- 3. `game_sessions.category_id` had no covering index for its FK
--    (INFO: unindexed_foreign_keys) — missed in the original table migration.

revoke execute on function public.is_room_member(uuid) from anon;
revoke execute on function public.is_room_host(uuid) from anon;
revoke execute on function public.is_room_member_of_round(uuid) from anon;

alter policy players_update_self on public.players
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));

alter policy chat_messages_insert_unmuted on public.chat_messages
  with check (
    kind = 'chat'
    and exists (
      select 1
      from public.players p
      where p.id = chat_messages.player_id
        and p.room_id = chat_messages.room_id
        and p.auth_user_id = (select auth.uid())
        and p.status = 'active'
        and p.is_muted = false
    )
  );

create index game_sessions_category_id_idx on public.game_sessions (category_id);
