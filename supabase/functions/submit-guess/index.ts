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
//           { kind: 'guess', correct: true, points, firstCorrect, alreadyCorrect }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handlePreflight, CORS_HEADERS } from "../_shared/cors.ts";
import { jsonOk, jsonErr } from "../_shared/errors.ts";
import { createAdminClient, createCallerClient } from "../_shared/supabase-admin.deno.ts";
import { normalizeRoomCode, ROOM_CODE_RE } from "../_shared/room-code.ts";
import { clampSettings } from "../_shared/settings.ts";
import { containsProfanity } from "../_shared/profanity.ts";
import { normalizeGuess, scoreGuess } from "../_shared/guess.ts";

const MAX_MESSAGE_LENGTH = 200;

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonErr("METHOD_NOT_ALLOWED", "Use POST.", CORS_HEADERS);
  }

  const caller = createCallerClient(req);
  const {
    data: { user },
  } = await caller.auth.getUser();
  if (!user) {
    return jsonErr("UNAUTHENTICATED", "Sign in required.", CORS_HEADERS);
  }

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

  const { data: room } = await admin
    .from("rooms")
    .select("id, status, settings")
    .eq("code", code)
    .maybeSingle();
  if (!room) {
    return jsonErr("ROOM_NOT_FOUND", "No room found with that code.", CORS_HEADERS);
  }

  const { data: me } = await admin
    .from("players")
    .select("id, display_name, status, is_muted, is_spectator")
    .eq("room_id", room.id)
    .eq("auth_user_id", user.id)
    .maybeSingle();
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

  const { data: session } = await admin
    .from("game_sessions")
    .select("id")
    .eq("room_id", room.id)
    .order("session_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: round } = session
    ? await admin
        .from("rounds")
        .select("id, word_id, started_at, revealed_at")
        .eq("game_session_id", session.id)
        .is("revealed_at", null)
        .maybeSingle()
    : { data: null };

  const live = room.status === "in_progress" && round !== null;

  // --- Not a guess: lobby, recap, ended, or a spectator (§12) -------------
  if (!live || me.is_spectator) {
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

  // The answer is read with the service role and never leaves this function.
  const { data: word } = await admin
    .from("words")
    .select("answer")
    .eq("id", round!.word_id)
    .maybeSingle();
  const answer = normalizeGuess(word?.answer ?? "");
  const attempt = normalizeGuess(text);

  const { data: mine } = await admin
    .from("guesses")
    .select("id, points_awarded")
    .eq("round_id", round!.id)
    .eq("player_id", me.id)
    .eq("is_correct", true)
    .maybeSingle();

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

    await admin.from("guesses").insert({
      round_id: round!.id,
      player_id: me.id,
      guess_text: text,
      is_correct: false,
    });
    await postChat("guess", "all", round!.id, text);
    return jsonOk({ kind: "guess", correct: false }, CORS_HEADERS);
  }

  // --- Correct -----------------------------------------------------------
  const settings = clampSettings({
    rounds: (room.settings as Record<string, unknown>)?.rounds,
    secondsPerRound: (room.settings as Record<string, unknown>)?.seconds_per_round,
  });
  const scoring =
    ((room.settings as Record<string, unknown>)?.scoring as typeof settings.scoring) ??
    settings.scoring;

  // Server clock decides "when" — never a client-reported time (rule 3).
  const now = Date.now();
  const decayed = scoreGuess({
    startedAtMs: new Date(round!.started_at).getTime(),
    nowMs: now,
    scoring,
    isFirstCorrect: false,
  });

  const { data: inserted, error: insertError } = await admin
    .from("guesses")
    .insert({
      round_id: round!.id,
      player_id: me.id,
      guess_text: text,
      is_correct: true,
      submitted_at: new Date(now).toISOString(),
      points_awarded: decayed,
    })
    .select("id")
    .single();

  if (insertError) {
    // guesses_one_correct_per_player_round fired: two near-simultaneous
    // requests from the same player both evaluated "not yet correct". This
    // is an expected outcome, not a fault (ARCHITECTURE.md §14) — return the
    // existing result and award nothing further.
    if (insertError.code === "23505") {
      const { data: existing } = await admin
        .from("guesses")
        .select("points_awarded")
        .eq("round_id", round!.id)
        .eq("player_id", me.id)
        .eq("is_correct", true)
        .maybeSingle();
      return jsonOk(
        {
          kind: "guess",
          correct: true,
          points: existing?.points_awarded ?? 0,
          firstCorrect: false,
          alreadyCorrect: true,
        },
        CORS_HEADERS,
      );
    }
    return jsonErr("INTERNAL_ERROR", "Could not record that guess.", CORS_HEADERS);
  }

  // First place is decided AFTER the insert, by ordering the persisted rows.
  // A pre-insert count would let two players racing each other both read
  // zero correct guesses and both claim the bonus.
  const { data: firstRow } = await admin
    .from("guesses")
    .select("id")
    .eq("round_id", round!.id)
    .eq("is_correct", true)
    .order("submitted_at", { ascending: true })
    .order("id", { ascending: true }) // deterministic tie-break on equal stamps
    .limit(1)
    .maybeSingle();

  const firstCorrect = firstRow?.id === inserted.id;
  const points = decayed + (firstCorrect ? scoring.first_guess_bonus : 0);

  if (firstCorrect) {
    await admin.from("guesses").update({ points_awarded: points }).eq("id", inserted.id);
  }

  // Atomic increment — players.score is service-role-only (rule 4).
  await admin.rpc("add_player_score", { p_player_id: me.id, p_points: points });

  // Name and points only, never the answer: this is what stops the first
  // correct guess from handing the word to everyone still playing. The
  // points ride in the body so the client needs no second lookup to render
  // the row.
  await postChat("system", "all", round!.id, `${me.display_name} guessed correctly +${points}`);

  return jsonOk(
    { kind: "guess", correct: true, points, firstCorrect, alreadyCorrect: false },
    CORS_HEADERS,
  );
});
