-- Latency fix: submit-guess made 7-10 sequential-ish PostgREST round trips
-- per request (measured p50 1788ms in production logs). Collapse the reads
-- into one RPC and the correct-guess write tail into another, same
-- hardening pattern as the existing public.add_player_score (service_role
-- only). Pure logic (normalizeGuess/scoreGuess, profanity) stays in
-- TypeScript per CLAUDE.md — only the reads/writes move into SQL.

-- guess_context: everything submit-guess needs to know before it can
-- decide anything, in one round trip. Room -> player -> round -> word/mine
-- cascade naturally through the joins: no room means no player, no round
-- means no word/mine, exactly mirroring the sequential dependency the old
-- 4-trip version had, but as one query.
create function public.guess_context(p_code text, p_auth_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with room as (
    select id, status
    from public.rooms
    where code = p_code
  ),
  player as (
    select p.id, p.display_name, p.status, p.is_muted, p.is_spectator
    from public.players p
    join room on p.room_id = room.id
    where p.auth_user_id = p_auth_user_id
  ),
  round as (
    select r.id, r.word_id, r.started_at, r.ends_at
    from public.rounds r
    join room on r.room_id = room.id
    where r.revealed_at is null
    order by r.started_at desc
    limit 1
  ),
  word as (
    select w.answer, w.difficulty
    from public.words w
    join round on w.id = round.word_id
  ),
  mine as (
    select g.points_awarded
    from public.guesses g
    join round on g.round_id = round.id
    join player on g.player_id = player.id
    where g.is_correct
    limit 1
  )
  select jsonb_build_object(
    'room', (select to_jsonb(room) from room),
    'player', (select to_jsonb(player) from player),
    'round', (select to_jsonb(round) from round),
    'word', (select to_jsonb(word) from word),
    'mine', (select to_jsonb(mine) from mine)
  );
$$;

revoke all on function public.guess_context(text, uuid) from public, anon, authenticated;
grant execute on function public.guess_context(text, uuid) to service_role;

-- record_guess: the writes for one guess attempt, in one round trip.
--
-- p_is_correct = false: a plain wrong-guess/chat-line pair (unchanged
-- semantics from the old two-write Promise.all wave).
--
-- p_is_correct = true: insert -> atomic first-correct claim -> final
-- points -> score increment -> system chat line, all in one transaction
-- instead of 4 sequential round trips. The ON CONFLICT clause targets the
-- existing guesses_one_correct_per_player_round partial unique index
-- directly, replacing the old insert-then-catch-23505-then-reselect dance
-- with one statement; a caller who loses the race gets the winning row's
-- points back, exactly as before (ARCHITECTURE.md §14).
--
-- p_base_score/p_first_guess_bonus are passed in rather than duplicated
-- here — guess.ts's scoreGuess()/FIRST_GUESS_BONUS stay the single source
-- of truth for the scoring formula (CLAUDE.md: pure logic lives in
-- TypeScript, unit-tested by guess.test.deno.ts).
create function public.record_guess(
  p_round_id uuid,
  p_room_id uuid,
  p_player_id uuid,
  p_display_name text,
  p_guess_text text,
  p_is_correct boolean,
  p_submitted_at timestamptz,
  p_base_score integer,
  p_first_guess_bonus integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guess_id uuid;
  v_claimed integer;
  v_points integer;
  v_existing_points integer;
begin
  if not p_is_correct then
    insert into public.guesses (round_id, player_id, guess_text, is_correct)
    values (p_round_id, p_player_id, p_guess_text, false);

    insert into public.chat_messages (room_id, player_id, body, kind, visibility, round_id)
    values (p_room_id, p_player_id, p_guess_text, 'guess', 'all', p_round_id);

    return jsonb_build_object('correct', false);
  end if;

  insert into public.guesses (round_id, player_id, guess_text, is_correct, submitted_at, points_awarded)
  values (p_round_id, p_player_id, p_guess_text, true, p_submitted_at, p_base_score)
  on conflict (round_id, player_id) where is_correct
  do nothing
  returning id into v_guess_id;

  if v_guess_id is null then
    -- Lost the race: guesses_one_correct_per_player_round already has a row
    -- for this (round_id, player_id). Same non-error outcome as the old
    -- 23505 catch — return the winning row's own score, award nothing more.
    select points_awarded into v_existing_points
    from public.guesses
    where round_id = p_round_id and player_id = p_player_id and is_correct
    limit 1;

    return jsonb_build_object(
      'correct', true, 'alreadyCorrect', true, 'points', coalesce(v_existing_points, 0)
    );
  end if;

  -- Same atomic claim as before: a guarded UPDATE, not read-then-compare —
  -- Postgres serializes concurrent UPDATEs to the same row, so exactly one
  -- caller's WHERE clause matches (ARCHITECTURE.md §7).
  update public.rounds
  set first_correct_player_id = p_player_id
  where id = p_round_id and first_correct_player_id is null;
  get diagnostics v_claimed = row_count;

  v_points := p_base_score + case when v_claimed > 0 then p_first_guess_bonus else 0 end;

  if v_claimed > 0 then
    update public.guesses set points_awarded = v_points where id = v_guess_id;
  end if;

  perform public.add_player_score(p_player_id, v_points);

  insert into public.chat_messages (room_id, player_id, body, kind, visibility, round_id)
  values (
    p_room_id, p_player_id,
    p_display_name || ' guessed correctly +' || v_points,
    'system', 'all', p_round_id
  );

  return jsonb_build_object(
    'correct', true, 'alreadyCorrect', false, 'points', v_points, 'isFirstCorrect', v_claimed > 0
  );
end;
$$;

revoke all on function public.record_guess(uuid, uuid, uuid, text, text, boolean, timestamptz, integer, integer)
  from public, anon, authenticated;
grant execute on function public.record_guess(uuid, uuid, uuid, text, text, boolean, timestamptz, integer, integer)
  to service_role;
