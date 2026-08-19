-- Round loop (ARCHITECTURE.md §6/§7/§14): reveal payload on rounds, the
-- two-tier chat visibility split, and the two privileged helpers the
-- submit-guess / round-tick Edge Functions need.

-- rounds: replace the unused `revealed` flag with the data the recap
-- overlay actually reads. Both stay null while a round is live, so the
-- answer is unreachable even though `rounds` is client-readable
-- (CLAUDE.md rule 1).
alter table public.rounds
  drop column revealed,
  add column revealed_at timestamptz,
  add column revealed_answer text;

-- One live round per session. Mirrors guesses_one_correct_per_player_round:
-- the DB, not the Edge Function, is what makes concurrent round-ticks safe.
create unique index rounds_one_live_per_session
  on public.rounds (game_session_id) where revealed_at is null;

-- chat_messages: round scoping + winners'-chat visibility. 'correct' rows
-- are readable only by players who already guessed correctly that round.
alter table public.chat_messages
  add column round_id uuid references public.rounds (id) on delete cascade,
  add column visibility text not null default 'all'
    check (visibility in ('all', 'correct'));

create index chat_messages_round_id_idx on public.chat_messages (round_id);

create function private.has_correct_guess(p_round_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.guesses g
    join public.players p on p.id = g.player_id
    where g.round_id = p_round_id
      and g.is_correct
      and p.auth_user_id = (select auth.uid())
  );
$$;

revoke all on function private.has_correct_guess(uuid) from public, anon, authenticated;
grant execute on function private.has_correct_guess(uuid) to authenticated;

-- Realtime postgres_changes applies RLS per subscriber, so a player who
-- hasn't guessed correctly never receives a winners'-chat row at all —
-- it isn't merely hidden client-side.
alter policy chat_messages_select on public.chat_messages
  using (
    private.is_room_member(room_id)
    and (visibility = 'all' or private.has_correct_guess(round_id))
  );

-- submit-guess becomes the only writer. A client-side insert could set
-- visibility='all' on a message containing the answer, and would bypass
-- the profanity filter (obscenity is Deno-side only). Verified before
-- dropping: no client or Edge Function code referenced chat_messages.
drop policy chat_messages_insert_unmuted on public.chat_messages;
revoke insert on public.chat_messages from authenticated;

-- Atomic score increment: `set score = score + n` isn't expressible in
-- supabase-js, and a read-modify-write races when two players score at
-- once. service_role only — players still can't touch their own score.
create function public.add_player_score(p_player_id uuid, p_points integer)
returns integer
language sql
security definer
set search_path = ''
as $$
  update public.players
  set score = score + p_points
  where id = p_player_id
  returning score;
$$;

revoke all on function public.add_player_score(uuid, integer) from public, anon, authenticated;
grant execute on function public.add_player_score(uuid, integer) to service_role;
