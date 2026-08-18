-- Phase 2: room-password hashing (CLAUDE.md non-negotiable rule 6 —
-- "Room passwords are hashed (pgcrypto/crypt()), never stored plaintext").
--
-- pgcrypto is already installed (schema `extensions`) but nothing has
-- invoked it yet. These two functions are the only way `password_hash` gets
-- written or checked; both live in `public` (not `private`) because
-- PostgREST only routes RPC for its exposed schemas, and putting them in
-- `private` would 404 for the service-role client without also changing the
-- Dashboard's exposed-schemas setting.
--
-- Phase 1 lesson carried forward: `revoke ... from public` does NOT strip
-- `anon`/`authenticated`'s direct default-privilege grants — Supabase grants
-- those two roles EXECUTE at function-creation time regardless of the
-- PUBLIC pseudo-role, so all three must be named explicitly in the revoke.
-- (Confirmed the hard way in supabase/migrations/*_advisor_fixups.sql.)

create function public.hash_password(password text)
returns text
language sql
security definer
set search_path = ''
as $$
  select extensions.crypt(password, extensions.gen_salt('bf', 10));
$$;

create function public.verify_password(password text, password_hash text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select password_hash = extensions.crypt(password, password_hash);
$$;

revoke all on function public.hash_password(text) from public, anon, authenticated;
revoke all on function public.verify_password(text, text) from public, anon, authenticated;

grant execute on function public.hash_password(text) to service_role;
grant execute on function public.verify_password(text, text) to service_role;

-- Defence in depth: the room-code format is now decided (AAA-999, see
-- supabase/functions/_shared/room-code.ts) and no rows exist yet.
alter table public.rooms
  add constraint rooms_code_format check (code ~ '^[A-Z0-9]{3}-[0-9]{3}$');
