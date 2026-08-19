// restart-room — host-only "same room, new game" (DESIGN.md §2.8,
// ARCHITECTURE.md §9). Creates the next game_sessions row (session_number +
// 1) snapshotting the room's newly-chosen category/settings, resets
// players.score and is_spectator, and swaps the room's custom word list.
// Prior rounds/guesses stay attached to their original session, untouched.
//
// Ordering is the inverse of start-game's, deliberately: round-tick reads
// the *latest* session, so flipping rooms.status to 'in_progress' before
// the new session exists would make every client's next tick find the
// previous, already-completed session and immediately end the game again.
// The session row is created first; the status claim happens last — which
// also means any partial failure leaves the room in 'ended' (host just
// retries) rather than stranded mid-game.
//
// Request:  { roomCode, categoryId, customWords? }
// Success:  { roomId, roomStatus: 'in_progress', gameSessionId,
//             sessionNumber, startedAt, customWordCount }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handlePreflight, CORS_HEADERS } from "../_shared/cors.ts";
import { jsonOk, jsonErr } from "../_shared/errors.ts";
import { createAdminClient, createCallerClient } from "../_shared/supabase-admin.deno.ts";
import { normalizeRoomCode, ROOM_CODE_RE } from "../_shared/room-code.ts";
import { containsProfanity } from "../_shared/profanity.ts";
import { parseCustomWords } from "../_shared/custom-words.ts";
import { MIXED_CATEGORY_ID } from "../_shared/categories.ts";
import { MIN_PLAYERS_TO_START } from "../_shared/settings.ts";

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

  const categoryId = typeof body.categoryId === "string" ? body.categoryId : null;
  if (!categoryId) {
    return jsonErr("VALIDATION_ERROR", "Please fix the highlighted fields.", CORS_HEADERS, {
      categoryId: "Category is required.",
    });
  }

  // --- Custom words --------------------------------------------------
  const { pairs: customPairs, errors: parseErrors } = parseCustomWords(
    typeof body.customWords === "string" ? body.customWords : null,
  );
  if (parseErrors.length > 0) {
    return jsonErr(
      "VALIDATION_ERROR",
      "Some custom words couldn't be parsed.",
      CORS_HEADERS,
      { customWords: parseErrors.map((e) => `#${e.index + 1}: ${e.reason}`).join("; ") },
    );
  }
  const profane: Record<string, string> = {};
  customPairs.forEach((pair, i) => {
    if (containsProfanity(pair.emojiSequence) || containsProfanity(pair.answer)) {
      profane[`customWords[${i}]`] = "Please choose different custom words.";
    }
  });
  if (Object.keys(profane).length > 0) {
    return jsonErr("PROFANITY_BLOCKED", "Please revise the flagged fields.", CORS_HEADERS, profane);
  }

  const admin = createAdminClient();

  const { data: room } = await admin
    .from("rooms")
    .select("id, name, status, settings")
    .eq("code", code)
    .maybeSingle();
  if (!room) {
    return jsonErr("ROOM_NOT_FOUND", "No room found with that code.", CORS_HEADERS);
  }

  const { data: me } = await admin
    .from("players")
    .select("id, is_host, status")
    .eq("room_id", room.id)
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!me) {
    return jsonErr("NOT_A_MEMBER", "You haven't joined this room.", CORS_HEADERS);
  }
  if (me.status === "kicked") {
    return jsonErr("KICKED", "You were removed from this room.", CORS_HEADERS);
  }
  if (!me.is_host) {
    return jsonErr("NOT_HOST", "Only the host can restart the game.", CORS_HEADERS);
  }

  const latestSession = async () =>
    admin
      .from("game_sessions")
      .select("id, session_number, started_at")
      .eq("room_id", room.id)
      .order("session_number", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (room.status === "in_progress") {
    // Idempotent: a double-click just returns the session already created.
    const { data: existing } = await latestSession();
    return jsonOk(
      {
        roomId: room.id,
        roomStatus: "in_progress",
        gameSessionId: existing?.id ?? null,
        sessionNumber: existing?.session_number ?? null,
        startedAt: existing?.started_at ?? null,
        customWordCount: 0,
      },
      CORS_HEADERS,
    );
  }
  if (room.status === "lobby") {
    return jsonErr(
      "INVALID_ROOM_STATE",
      "This room hasn't been played yet — start the game instead.",
      CORS_HEADERS,
    );
  }

  // --- Player-count gate ---------------------------------------------
  // Deliberately not filtering is_spectator=false like start-game does — a
  // spectator from the previous game is about to be un-spectated by this
  // same call (below), so excluding them here would wrongly block a
  // legitimate restart.
  const { count: activeCount } = await admin
    .from("players")
    .select("id", { count: "exact", head: true })
    .eq("room_id", room.id)
    .eq("status", "active");

  if ((activeCount ?? 0) < MIN_PLAYERS_TO_START) {
    return jsonErr(
      "NOT_ENOUGH_PLAYERS",
      `At least ${MIN_PLAYERS_TO_START} players are needed to restart.`,
      CORS_HEADERS,
    );
  }

  // --- Category must be a real, global category — unless "mixed" ------
  const isMixed = categoryId === MIXED_CATEGORY_ID;
  if (!isMixed) {
    const { data: category, error: categoryError } = await admin
      .from("categories")
      .select("id")
      .eq("id", categoryId)
      .eq("is_custom", false)
      .is("room_id", null)
      .maybeSingle();

    if (categoryError || !category) {
      return jsonErr("CATEGORY_NOT_FOUND", "That category doesn't exist.", CORS_HEADERS);
    }
  }

  // --- Swap the custom word list: delete the room's existing custom
  // category (cascades to its words), then insert a fresh one if the host
  // provided new pairs. No rollback on a later failure here — the room is
  // still 'ended', so the host just retries; see the file header comment.
  await admin.from("categories").delete().eq("room_id", room.id).eq("is_custom", true);

  let customWordCount = 0;
  if (customPairs.length > 0) {
    const { data: customCategory, error: customCategoryError } = await admin
      .from("categories")
      .insert({ name: `${room.name} — custom`, is_custom: true, room_id: room.id })
      .select("id")
      .single();

    if (customCategoryError || !customCategory) {
      return jsonErr("INTERNAL_ERROR", "Could not save custom words.", CORS_HEADERS);
    }

    const { error: wordsError } = await admin.from("words").insert(
      customPairs.map((pair) => ({
        category_id: customCategory.id,
        emoji_sequence: pair.emojiSequence,
        answer: pair.answer,
      })),
    );
    if (wordsError) {
      return jsonErr("INTERNAL_ERROR", "Could not save custom words.", CORS_HEADERS);
    }
    customWordCount = customPairs.length;
  }

  // round-tick resolves the word pool as session.category_id ??
  // room.category_id — a restart into Mixed must clear this or it silently
  // keeps the room's previous category (round-tick/index.ts's createRound).
  const newCategoryId = isMixed ? null : categoryId;
  await admin.from("rooms").update({ category_id: newCategoryId }).eq("id", room.id);

  const { data: maxSession } = await admin
    .from("game_sessions")
    .select("session_number")
    .eq("room_id", room.id)
    .order("session_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const startedAt = new Date().toISOString();
  const { data: session, error: sessionError } = await admin
    .from("game_sessions")
    .insert({
      room_id: room.id,
      session_number: (maxSession?.session_number ?? 0) + 1,
      category_id: newCategoryId,
      settings: room.settings,
      started_at: startedAt,
    })
    .select("id, session_number, started_at")
    .single();

  if (sessionError || !session) {
    // 23505 on (room_id, session_number): a concurrent restart already won
    // — re-read and report its session as an idempotent success.
    if (sessionError?.code === "23505") {
      const { data: existing } = await latestSession();
      return jsonOk(
        {
          roomId: room.id,
          roomStatus: "in_progress",
          gameSessionId: existing?.id ?? null,
          sessionNumber: existing?.session_number ?? null,
          startedAt: existing?.started_at ?? null,
          customWordCount,
        },
        CORS_HEADERS,
      );
    }
    return jsonErr("INTERNAL_ERROR", "Could not restart the game.", CORS_HEADERS);
  }

  // Placed after the session insert on purpose: a failure above leaves the
  // previous game's scores intact on a room still showing as 'ended',
  // rather than zeroing them under a game that never actually started.
  await admin
    .from("players")
    .update({ score: 0, is_spectator: false })
    .eq("room_id", room.id);

  // Claim the transition last — see the file header comment for why this
  // order (not start-game's lobby->in_progress-then-session order) matters
  // here specifically.
  const { data: claimed } = await admin
    .from("rooms")
    .update({ status: "in_progress", last_active_at: startedAt })
    .eq("id", room.id)
    .eq("status", "ended")
    .select("id");

  if (!claimed || claimed.length === 0) {
    const { data: freshRoom } = await admin.from("rooms").select("status").eq("id", room.id).single();
    if (freshRoom?.status === "in_progress") {
      return jsonOk(
        {
          roomId: room.id,
          roomStatus: "in_progress",
          gameSessionId: session.id,
          sessionNumber: session.session_number,
          startedAt: session.started_at,
          customWordCount,
        },
        CORS_HEADERS,
      );
    }
    return jsonErr("INVALID_ROOM_STATE", "This room can't be restarted right now.", CORS_HEADERS);
  }

  return jsonOk(
    {
      roomId: room.id,
      roomStatus: "in_progress",
      gameSessionId: session.id,
      sessionNumber: session.session_number,
      startedAt: session.started_at,
      customWordCount,
    },
    CORS_HEADERS,
  );
});
