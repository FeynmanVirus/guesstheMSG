-- Phase 1: RLS helper functions.
--
-- Room-membership policies can't query `players` from inside a policy ON
-- `players` (Postgres raises "infinite recursion detected in policy for
-- relation \"players\"") and every other room-scoped table needs the same
-- membership check. These SECURITY DEFINER functions read `players` with RLS
-- bypassed, so every policy — including players' own — calls through here
-- instead of re-deriving the join.
--
-- search_path is pinned to '' and all identifiers are schema-qualified: a
-- mutable search_path on a SECURITY DEFINER function is a privilege
-- escalation vector the security advisor flags.

create function public.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.players
    where room_id = p_room_id
      and auth_user_id = auth.uid()
      and status = 'active'
  );
$$;

create function public.is_room_host(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.players
    where room_id = p_room_id
      and auth_user_id = auth.uid()
      and status = 'active'
      and is_host = true
  );
$$;

create function public.is_room_member_of_round(p_round_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select public.is_room_member(r.room_id)
      from public.rounds r
      where r.id = p_round_id
    ),
    false
  );
$$;

revoke all on function public.is_room_member(uuid) from public;
revoke all on function public.is_room_host(uuid) from public;
revoke all on function public.is_room_member_of_round(uuid) from public;

grant execute on function public.is_room_member(uuid) to authenticated;
grant execute on function public.is_room_host(uuid) to authenticated;
grant execute on function public.is_room_member_of_round(uuid) to authenticated;
