// round-tick — the round loop's clock. Replaces the separately-planned
// start-round/advance-round pair (ARCHITECTURE.md §14) with one idempotent
// state machine: create round 1, reveal a round that's over, advance past
// the recap, end the game.
//
// Callable by ANY active room member, not just the host. It performs no
// privileged action — every transition is re-derived from server state and
// server time, so a caller can only ask "is anything due?", never assert
// that something is. Host-gating it would buy nothing and would make the
// game stall whenever the host's tab is merely backgrounded (browsers
// throttle background timers to ~1/min while the WebSocket stays alive, so
// Presence never drops and host migration never fires).
//
// Concurrency is handled by the database, not by locking here: two unique
// indexes (rounds_one_live_per_session, rounds unique(game_session_id,
// round_number)) make a duplicate createRound a caught 23505 that re-reads
// and converges. Every branch is safe to run twice.
//
// Request:  { roomCode }
// Success:  { state: 'live'|'recap'|'ended', roundId?, roundNumber?, endsAt?,
//             totalRounds }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handlePreflight, CORS_HEADERS } from "../_shared/cors.ts";
import { jsonOk, jsonErr } from "../_shared/errors.ts";
import { createAdminClient, createCallerClient } from "../_shared/supabase-admin.deno.ts";
import { normalizeRoomCode, ROOM_CODE_RE } from "../_shared/room-code.ts";
import { clampSettings, RECAP_SECONDS } from "../_shared/settings.ts";

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

  const admin = createAdminClient();

  const { data: room } = await admin
    .from("rooms")
    .select("id, status, category_id, settings")
    .eq("code", code)
    .maybeSingle();
  if (!room) {
    return jsonErr("ROOM_NOT_FOUND", "No room found with that code.", CORS_HEADERS);
  }

  const { data: me } = await admin
    .from("players")
    .select("id, status")
    .eq("room_id", room.id)
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!me) {
    return jsonErr("NOT_A_MEMBER", "You haven't joined this room.", CORS_HEADERS);
  }
  if (me.status === "kicked") {
    return jsonErr("KICKED", "You were removed from this room.", CORS_HEADERS);
  }

  const settings = clampSettings({
    rounds: (room.settings as Record<string, unknown>)?.rounds,
    secondsPerRound: (room.settings as Record<string, unknown>)?.seconds_per_round,
  });
  const totalRounds = settings.rounds;

  if (room.status === "lobby") {
    // Nothing to tick until start-game has claimed the transition.
    return jsonOk({ state: "lobby", totalRounds }, CORS_HEADERS);
  }
  if (room.status === "ended") {
    return jsonOk({ state: "ended", totalRounds }, CORS_HEADERS);
  }

  const { data: session } = await admin
    .from("game_sessions")
    .select("id, category_id, settings")
    .eq("room_id", room.id)
    .order("session_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!session) {
    // in_progress with no session shouldn't happen (start-game creates it
    // inside the same claim), but ticking must not 500 if it ever does.
    return jsonErr("INVALID_ROOM_STATE", "This game has no session yet.", CORS_HEADERS);
  }

  const { data: round } = await admin
    .from("rounds")
    .select("id, round_number, word_id, started_at, ends_at, revealed_at")
    .eq("game_session_id", session.id)
    .order("round_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const now = new Date();

  // ---- helpers -----------------------------------------------------------

  async function endGame(reason: "complete" | "pool_exhausted") {
    const endedAt = now.toISOString();
    await admin
      .from("rooms")
      .update({ status: "ended", last_active_at: endedAt })
      .eq("id", room!.id)
      .eq("status", "in_progress");
    await admin
      .from("game_sessions")
      .update({ ended_at: endedAt })
      .eq("id", session!.id)
      .is("ended_at", null);
    return jsonOk({ state: "ended", totalRounds, reason }, CORS_HEADERS);
  }

  async function createRound(roundNumber: number) {
    // Word pool = the session's category ∪ this room's custom category
    // (ARCHITECTURE.md §2), minus everything already used this session
    // (§13: no-repeat within a session, shuffled per room).
    const { data: customCategories } = await admin
      .from("categories")
      .select("id")
      .eq("room_id", room!.id)
      .eq("is_custom", true);

    const categoryIds = [
      session!.category_id ?? room!.category_id,
      ...(customCategories ?? []).map((c) => c.id),
    ].filter((id): id is string => !!id);

    if (categoryIds.length === 0) return endGame("pool_exhausted");

    const { data: poolRows } = await admin
      .from("words")
      .select("id, emoji_sequence")
      .in("category_id", categoryIds);

    const { data: usedRows } = await admin
      .from("rounds")
      .select("word_id")
      .eq("game_session_id", session!.id);

    const used = new Set((usedRows ?? []).map((r) => r.word_id));
    const pool = (poolRows ?? []).filter((w) => !used.has(w.id));

    // Only 5 words per seeded category before this phase, and a room can
    // still run dry on a short custom list — end the game rather than
    // repeat a word or stall.
    if (pool.length === 0) return endGame("pool_exhausted");

    const word = pool[Math.floor(Math.random() * pool.length)];

    // Server-authoritative timing (CLAUDE.md rule 3): both stamps are
    // computed here and written once. The client's countdown is only ever
    // ends_at - now, never a locally-held duration.
    const startedAt = now.toISOString();
    const endsAt = new Date(now.getTime() + settings.seconds_per_round * 1000).toISOString();

    const { data: created, error: insertError } = await admin
      .from("rounds")
      .insert({
        game_session_id: session!.id,
        room_id: room!.id,
        word_id: word.id,
        // Snapshot, so clients read the emoji from `rounds` and never need
        // any access to `words` (which holds the answer) — rule 1.
        emoji_sequence: word.emoji_sequence,
        round_number: roundNumber,
        started_at: startedAt,
        ends_at: endsAt,
      })
      .select("id, round_number, ends_at")
      .single();

    if (insertError) {
      // 23505 on either unique index: another client's tick won the race.
      // Re-read and report whatever it created — the callers converge.
      if (insertError.code === "23505") {
        const { data: existing } = await admin
          .from("rounds")
          .select("id, round_number, ends_at")
          .eq("game_session_id", session!.id)
          .is("revealed_at", null)
          .maybeSingle();
        if (existing) {
          return jsonOk(
            {
              state: "live",
              roundId: existing.id,
              roundNumber: existing.round_number,
              endsAt: existing.ends_at,
              totalRounds,
            },
            CORS_HEADERS,
          );
        }
      }
      return jsonErr("INTERNAL_ERROR", "Could not start the round.", CORS_HEADERS);
    }

    // Late joiners become full players at the next round boundary (§12).
    await admin
      .from("players")
      .update({ is_spectator: false })
      .eq("room_id", room!.id)
      .eq("status", "active")
      .eq("is_spectator", true);

    await admin.from("rooms").update({ last_active_at: startedAt }).eq("id", room!.id);

    return jsonOk(
      {
        state: "live",
        roundId: created.id,
        roundNumber: created.round_number,
        endsAt: created.ends_at,
        totalRounds,
      },
      CORS_HEADERS,
    );
  }

  async function reveal(roundId: string, wordId: string) {
    // The only moment the answer becomes client-readable. Read with the
    // service role, then copy onto the round row now that it's over.
    const { data: word } = await admin
      .from("words")
      .select("answer")
      .eq("id", wordId)
      .maybeSingle();

    const { data: revealed } = await admin
      .from("rounds")
      .update({ revealed_at: now.toISOString(), revealed_answer: word?.answer ?? null })
      .eq("id", roundId)
      .is("revealed_at", null) // loser of a concurrent tick no-ops
      .select("id")
      .maybeSingle();

    return jsonOk(
      { state: "recap", roundId, revealed: !!revealed, totalRounds },
      CORS_HEADERS,
    );
  }

  // ---- state machine -----------------------------------------------------

  if (!round) return createRound(1);

  if (!round.revealed_at) {
    const expired = now.getTime() >= new Date(round.ends_at).getTime();

    let everyoneCorrect = false;
    if (!expired && settings.end_round_on_all_correct) {
      const { count: contenders } = await admin
        .from("players")
        .select("id", { count: "exact", head: true })
        .eq("room_id", room.id)
        .eq("status", "active")
        .eq("is_spectator", false);

      const { count: correct } = await admin
        .from("guesses")
        .select("id", { count: "exact", head: true })
        .eq("round_id", round.id)
        .eq("is_correct", true);

      everyoneCorrect = (contenders ?? 0) > 0 && (correct ?? 0) >= (contenders ?? 0);
    }

    if (expired || everyoneCorrect) return reveal(round.id, round.word_id);

    return jsonOk(
      {
        state: "live",
        roundId: round.id,
        roundNumber: round.round_number,
        endsAt: round.ends_at,
        totalRounds,
      },
      CORS_HEADERS,
    );
  }

  const recapOver =
    now.getTime() >= new Date(round.revealed_at).getTime() + RECAP_SECONDS * 1000;

  if (!recapOver) {
    return jsonOk(
      { state: "recap", roundId: round.id, roundNumber: round.round_number, totalRounds },
      CORS_HEADERS,
    );
  }

  if (round.round_number >= totalRounds) return endGame("complete");

  return createRound(round.round_number + 1);
});
