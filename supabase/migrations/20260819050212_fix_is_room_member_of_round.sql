-- Pre-existing bug from 20260818091652_helper_functions_private_schema.sql:
-- is_room_member_of_round's body still calls public.is_room_member(...),
-- but that migration moved is_room_member into the private schema. Because
-- is_room_member_of_round runs with `set search_path = ''`, the
-- schema-qualified call resolves against the literal name "public.is_room_member",
-- which no longer exists there — every authenticated SELECT against
-- `guesses` (the only table this helper gates) has failed with
-- "function public.is_room_member(uuid) does not exist" (42883) since that
-- migration landed. Nothing surfaced it because no client code read from
-- `guesses` until the round loop's recap screen. Confirmed against the live
-- REST API before this fix:
--   GET .../rest/v1/guesses?... -> 404 {"code":"42883", ...}
--
-- CREATE OR REPLACE preserves the function's OID, so the guesses_select
-- policy (which references it by OID, not by name) keeps working without
-- needing to be recreated.
create or replace function private.is_room_member_of_round(p_round_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select private.is_room_member(r.room_id)
      from public.rounds r
      where r.id = p_round_id
    ),
    false
  );
$$;
