-- Phase 1 fixup: stop exposing the RLS helper functions as public RPC
-- endpoints (WARN: authenticated_security_definer_function_executable —
-- `/rest/v1/rpc/is_room_member` etc. were directly callable by any
-- authenticated user, which was never the intent; they exist only for
-- policies to call internally).
--
-- PostgREST only exposes functions living in its configured API schema
-- (public, by default). Moving them to a `private` schema removes the RPC
-- route entirely. This is transparent to the policies created in
-- rls_policies.sql: Postgres records a policy's function reference by OID
-- via pg_depend, not by schema-qualified name, so ALTER FUNCTION ... SET
-- SCHEMA does not require touching any policy.

create schema if not exists private;
grant usage on schema private to authenticated;

alter function public.is_room_member(uuid) set schema private;
alter function public.is_room_host(uuid) set schema private;
alter function public.is_room_member_of_round(uuid) set schema private;
