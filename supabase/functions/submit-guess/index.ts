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
  // Kicked off now, awaited together with the room lookup below — a GoTrue
  // network hop that doesn't depend on anything in the request body, so
  // there's no reason to block it behind body parsing. It stays a fully
  // awaited step (never skipped) — it's the only authorization boundary in
  // this function, since everything after runs on the service-role client,
  // which bypasses RLS entirely.
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

  const [{ data: { user } }, { data: room }] = await Promise.all([
    userPromise,
    admin.from("rooms").select("id, status").eq("code", code).maybeSingle(),
  ]);
  if (!user) {
    return jsonErr("UNAUTHENTICATED", "Sign in required.", CORS_HEADERS);
  }
  if (!room) {
    return jsonErr("ROOM_NOT_FOUND", "No room found with that code.", CORS_HEADERS);
  }

  // Both only need room.id, not each other. The round lookup skips the old
  // game_sessions hop entirely: rounds carries room_id directly, and
  // rounds_one_live_per_session plus round-tick's reveal-before-end
  // invariant (a session's last round is always revealed before the
  // session ends) guarantee a room has at most one unrevealed round across
  // all its sessions at any time — so this is the same row the old
  // session->round chain would have found, one hop cheaper. order+limit is
  // defensive: if that invariant were ever violated, this degrades to
  // "newest wins" instead of erroring every guess in the room.
  const [{ data: me }, { data: roundRows }] = await Promise.all([
    admin
      .from("players")
      .select("id, display_name, status, is_muted, is_spectator")
      .eq("room_id", room.id)
      .eq("auth_user_id", user.id)
      .maybeSingle(),
    admin
      .from("rounds")
      .select("id, word_id, started_at, ends_at")
      .eq("room_id", room.id)
      .is("revealed_at", null)
      .order("started_at", { ascending: false })
      .limit(1),
  ]);
  const round = roundRows?.[0] ?? null;
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
  // difficulty rides along for the scoring formula (guess.ts). Independent
  // of the "already correct" check below — both only need round.id/me.id,
  // neither needs the other's result.
  const [{ data: word }, { data: mine }] = await Promise.all([
    admin.from("words").select("answer, difficulty").eq("id", round!.word_id).maybeSingle(),
    admin
      .from("guesses")
      .select("id, points_awarded")
      .eq("round_id", round!.id)
      .eq("player_id", me.id)
      .eq("is_correct", true)
      .maybeSingle(),
  ]);
  const answer = normalizeGuess(word?.answer ?? "");
  const attempt = normalizeGuess(text);

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

    // Independent writes — neither needs the other's result.
    await Promise.all([
      admin.from("guesses").insert({
        round_id: round!.id,
        player_id: me.id,
        guess_text: text,
        is_correct: false,
      }),
      postChat("guess", "all", round!.id, text),
    ]);
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

  const { data: inserted, error: insertError } = await admin
    .from("guesses")
    .insert({
      round_id: round!.id,
      player_id: me.id,
      guess_text: text,
      is_correct: true,
      submitted_at: new Date(now).toISOString(),
      points_awarded: baseScore,
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
        { kind: "guess", correct: true, points: existing?.points_awarded ?? 0, alreadyCorrect: true },
        CORS_HEADERS,
      );
    }
    return jsonErr("INTERNAL_ERROR", "Could not record that guess.", CORS_HEADERS);
  }

  // Atomically claim "first correct guess in the room this round" — a
  // single guarded UPDATE, not "read the earliest guesses row and check if
  // it's mine": that read-then-compare has a real race between two
  // DIFFERENT players' concurrent correct guesses (guess.ts's comment on
  // this), where each could see "nobody yet" and both claim the bonus. This
  // UPDATE can only ever match a row for one caller, full stop.
  const { data: claimed } = await admin
    .from("rounds")
    .update({ first_correct_player_id: me.id })
    .eq("id", round!.id)
    .is("first_correct_player_id", null)
    .select("id");
  const isFirstCorrect = !!claimed && claimed.length > 0;

  const points = isFirstCorrect ? baseScore + FIRST_GUESS_BONUS : baseScore;
  if (isFirstCorrect) {
    await admin.from("guesses").update({ points_awarded: points }).eq("id", inserted.id);
  }

  // Independent writes, both needing only the now-final `points`:
  // the atomic score increment (players.score is service-role-only, rule 4)
  // and the system chat line — name and points only, never the answer, which
  // is what stops the first correct guess from handing the word to everyone
  // still playing.
  await Promise.all([
    admin.rpc("add_player_score", { p_player_id: me.id, p_points: points }),
    postChat("system", "all", round!.id, `${me.display_name} guessed correctly +${points}`),
  ]);

  return jsonOk(
    { kind: "guess", correct: true, points, alreadyCorrect: false },
    CORS_HEADERS,
  );
});
