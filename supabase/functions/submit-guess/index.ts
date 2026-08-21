// submit-guess — the one path every message from the combined chat/guess
// input takes (ARCHITECTURE.md §3, CLAUDE.md rule 2). The client never
// compares a guess to an answer; it doesn't have the answer to compare to.
//
// It is also the only writer of chat_messages — the client-side insert
// policy was dropped in 20260819040554_round_loop.sql, because a client
// insert could set visibility='all' on a message containing the answer and
// would bypass the profanity filter entirely.
//
// Two-tier chat: while a round is live, a player who has already guessed
// correctly is talking to the other correct guessers only. Those rows are
// written with visibility='correct' and an RLS policy (not client-side
// filtering) keeps them from reaching anyone still playing.
//
// Request:  { roomCode, text }
// Success:  { kind: 'chat', winnersChat }                       — not a guess
//           { kind: 'guess', correct: false }
//           { kind: 'guess', correct: true, points, alreadyCorrect }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handlePreflight, CORS_HEADERS } from "../_shared/cors.ts";
import { jsonOk, jsonErr } from "../_shared/errors.ts";
import { createAdminClient, createCallerClient } from "../_shared/supabase-admin.deno.ts";
import { normalizeRoomCode, ROOM_CODE_RE } from "../_shared/room-code.ts";
import { containsProfanity } from "../_shared/profanity.ts";
import { normalizeGuess, scoreGuess, FIRST_GUESS_BONUS } from "../_shared/guess.ts";

const MAX_MESSAGE_LENGTH = 200;

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonErr("METHOD_NOT_ALLOWED", "Use POST.", CORS_HEADERS);
  }

  const caller = createCallerClient(req);
  // Kicked off now rather than after body parsing, so this GoTrue network
  // hop overlaps with the (fast, synchronous-ish) req.json() + room-code
  // validation below instead of waiting behind them.
  //
  // It can NOT be overlapped with guess_context (the next network hop,
  // below) — that RPC takes p_auth_user_id: user.id as an argument, so it
  // structurally needs this to resolve first. A version of this comment
  // used to claim otherwise; it was wrong. Cutting that hop for real means
  // either verifying the JWT locally instead of calling GoTrue over the
  // network (removes the hop entirely, but is a security-sensitive change —
  // deliberately not done here without a dedicated look) or merging
  // guess_context + record_guess into one RPC (saves a different hop — see
  // that function's own comment). It stays a fully awaited step regardless
  // — it's the only authorization boundary in this function, since
  // everything after runs on the service-role client, which bypasses RLS
  // entirely.
  const userPromise = caller.auth.getUser();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonErr("VALIDATION_ERROR", "Request body must be JSON.", CORS_HEADERS);
  }

  const code = normalizeRoomCode(typeof body.roomCode === "string" ? body.roomCode : "");
  if (!ROOM_CODE_RE.test(code)) {
    return jsonErr("ROOM_NOT_FOUND", "That room code doesn't look right.", CORS_HEADERS);
  }

  const text = (typeof body.text === "string" ? body.text : "").trim();
  if (text.length === 0) {
    return jsonErr("VALIDATION_ERROR", "Type something first.", CORS_HEADERS, {
      text: "Type something first.",
    });
  }
  if (text.length > MAX_MESSAGE_LENGTH) {
    return jsonErr("VALIDATION_ERROR", "That message is too long.", CORS_HEADERS, {
      text: `Keep it under ${MAX_MESSAGE_LENGTH} characters.`,
    });
  }

  const admin = createAdminClient();

  const {
    data: { user },
  } = await userPromise;
  if (!user) {
    return jsonErr("UNAUTHENTICATED", "Sign in required.", CORS_HEADERS);
  }

  // Room -> player -> round -> word/mine used to be 4 sequential-ish trips
  // (rooms select; players+rounds in parallel; words+guesses in parallel) —
  // measured as the dominant cost of a 1.8s p50 round trip. One RPC,
  // one query: see 20260819150000_submit_guess_rpcs.sql for how the
  // dependency cascade (no room -> no player -> no round -> no word/mine)
  // is expressed as joins instead of sequential awaits.
  const { data: ctx } = await admin.rpc("guess_context", {
    p_code: code,
    p_auth_user_id: user.id,
  });
  const room = ctx?.room ?? null;
  const me = ctx?.player ?? null;
  const round = ctx?.round ?? null;
  const word = ctx?.word ?? null;
  const mine = ctx?.mine ?? null;

  if (!room) {
    return jsonErr("ROOM_NOT_FOUND", "No room found with that code.", CORS_HEADERS);
  }
  if (!me) {
    return jsonErr("NOT_A_MEMBER", "You haven't joined this room.", CORS_HEADERS);
  }
  if (me.status === "kicked") {
    return jsonErr("KICKED", "You were removed from this room.", CORS_HEADERS);
  }

  /** Publish a message to the shared stream. `visibility: 'correct'` rows are
   * readable only by players who already answered this round. */
  async function postChat(
    kind: "chat" | "guess" | "system",
    visibility: "all" | "correct",
    roundId: string | null,
    messageBody: string,
  ) {
    await admin.from("chat_messages").insert({
      room_id: room!.id,
      player_id: me!.id,
      body: messageBody,
      kind,
      visibility,
      round_id: roundId,
    });
  }

  /** Mute silences chat, not gameplay (ARCHITECTURE.md §10). Accepting and
   * dropping — rather than erroring — keeps the muted player from probing
   * for whether they're muted by watching for failures. */
  const muted = me.is_muted;

  const live = room.status === "in_progress" && round !== null;

  // word and mine already came back from guess_context above — the answer
  // is read with the service role there and never leaves this function.
  // Hoisted above the spectator/not-live branch below: `word` is null
  // whenever there's no live round, and normalizeGuess("") can never equal
  // a non-empty `attempt`, so this is safe to compute unconditionally.
  const answer = normalizeGuess(word?.answer ?? "");
  const attempt = normalizeGuess(text);

  // --- Not a guess: lobby, recap, ended, or a spectator (§12) -------------
  if (!live || me.is_spectator) {
    // A spectator (a mid-round joiner) can still see the live clue and type
    // the real answer — the same leak class the winners'-chat guard below
    // exists to prevent, just from a viewer instead of a fellow guesser.
    // Drop it rather than broadcast the answer to everyone still playing.
    if (live && me.is_spectator && attempt.length > 0 && attempt === answer) {
      return jsonOk({ kind: "chat", winnersChat: false, dropped: true }, CORS_HEADERS);
    }
    if (!muted) {
      if (containsProfanity(text)) {
        return jsonErr("PROFANITY_BLOCKED", "Let's keep it friendly.", CORS_HEADERS, {
          text: "That message can't be sent.",
        });
      }
      await postChat("chat", "all", round?.id ?? null, text);
    }
    return jsonOk({ kind: "chat", winnersChat: false }, CORS_HEADERS);
  }

  // --- Already answered: this is winners' chat ----------------------------
  if (mine) {
    // Don't let a winner paste the answer into a channel that a straggler
    // joins the moment they get it right.
    if (attempt.length > 0 && attempt === answer) {
      return jsonOk({ kind: "chat", winnersChat: true, dropped: true }, CORS_HEADERS);
    }
    if (!muted) {
      if (containsProfanity(text)) {
        return jsonErr("PROFANITY_BLOCKED", "Let's keep it friendly.", CORS_HEADERS, {
          text: "That message can't be sent.",
        });
      }
      await postChat("chat", "correct", round!.id, text);
    }
    return jsonOk({ kind: "chat", winnersChat: true }, CORS_HEADERS);
  }

  // --- Evaluate ----------------------------------------------------------
  // Ordering is deliberate: compare BEFORE the profanity gate. If a bank
  // word ever tripped the filter, a profanity-first ordering would reject
  // the correct guess as PROFANITY_BLOCKED and make the round unwinnable
  // with no visible cause. A correct guess is never republished verbatim
  // (the broadcast is "<name> guessed correctly"), so there is nothing for
  // the filter to protect here.
  const isCorrect = attempt.length > 0 && attempt === answer;

  if (!isCorrect) {
    if (muted) return jsonOk({ kind: "guess", correct: false }, CORS_HEADERS);

    // A wrong guess IS republished verbatim, so it is gated.
    if (containsProfanity(text)) {
      return jsonErr("PROFANITY_BLOCKED", "Let's keep it friendly.", CORS_HEADERS, {
        text: "That message can't be sent.",
      });
    }

    // Both writes for a wrong guess (the guesses row + the republished chat
    // line) go through record_guess in one round trip instead of two
    // parallel ones — see 20260819150000_submit_guess_rpcs.sql.
    // p_submitted_at/p_base_score are meaningless on this branch (only
    // p_is_correct: true reads them); a fresh timestamp and 0 are passed
    // just to satisfy the signature.
    await admin.rpc("record_guess", {
      p_round_id: round!.id,
      p_room_id: room.id,
      p_player_id: me.id,
      p_display_name: me.display_name,
      p_guess_text: text,
      p_is_correct: false,
      p_submitted_at: new Date().toISOString(),
      p_base_score: 0,
      p_first_guess_bonus: FIRST_GUESS_BONUS,
    });
    return jsonOk({ kind: "guess", correct: false }, CORS_HEADERS);
  }

  // --- Correct -----------------------------------------------------------
  // Round duration comes from the round row itself (ends_at - started_at),
  // not a fresh clampSettings(room.settings) read — that keeps a host's
  // later bounds/settings change from retroactively changing what an
  // already-running round is worth (guess.ts's own comment on this).
  const startedAtMs = new Date(round!.started_at).getTime();
  const roundDurationSeconds = (new Date(round!.ends_at).getTime() - startedAtMs) / 1000;

  // Server clock decides "when" — never a client-reported time (rule 3).
  // isFirstCorrect is unknown until the atomic claim below, so this is the
  // time+difficulty base — see guess.ts's own comment on why adding the
  // bonus afterward never disagrees with what one full scoreGuess() call
  // would have produced.
  const now = Date.now();
  const baseScore = scoreGuess({
    startedAtMs,
    nowMs: now,
    roundDurationSeconds,
    difficulty: word?.difficulty,
    isFirstCorrect: false,
  });

  // Insert -> atomic first-correct claim -> final points -> score increment
  // -> system chat line used to be 4 sequential round trips; record_guess
  // does all of it in one transaction, one trip. The ON CONFLICT branch
  // inside it replaces the old insert-then-catch-23505-then-reselect dance:
  // a caller who loses the race (two near-simultaneous requests from the
  // same player, ARCHITECTURE.md §14) gets the winning row's own points
  // back as alreadyCorrect, awarding nothing further — same outcome as
  // before, one round trip instead of two.
  const { data: result, error: rpcError } = await admin.rpc("record_guess", {
    p_round_id: round!.id,
    p_room_id: room.id,
    p_player_id: me.id,
    p_display_name: me.display_name,
    p_guess_text: text,
    p_is_correct: true,
    p_submitted_at: new Date(now).toISOString(),
    p_base_score: baseScore,
    p_first_guess_bonus: FIRST_GUESS_BONUS,
  });

  if (rpcError || !result) {
    return jsonErr("INTERNAL_ERROR", "Could not record that guess.", CORS_HEADERS);
  }

  return jsonOk(
    { kind: "guess", correct: true, points: result.points, alreadyCorrect: result.alreadyCorrect },
    CORS_HEADERS,
  );
});
