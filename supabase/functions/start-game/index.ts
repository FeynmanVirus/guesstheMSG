// start-game — host-only transition of a room from 'lobby' to 'in_progress',
// creating the game_sessions row that boundary belongs to (ARCHITECTURE.md
// §9). Does not pick a word, write round timing, or broadcast a round —
// that's start-round (§14, a later phase); this function's UI reaction is a
// placeholder "Game starting…" card.
//
// Request:  { roomCode }
// Success:  { roomId, roomStatus: 'in_progress', gameSessionId, startedAt }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handlePreflight, CORS_HEADERS } from "../_shared/cors.ts";
import { jsonOk, jsonErr } from "../_shared/errors.ts";
import { createAdminClient, createCallerClient } from "../_shared/supabase-admin.deno.ts";
import { normalizeRoomCode, ROOM_CODE_RE } from "../_shared/room-code.ts";
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
    return jsonErr("NOT_HOST", "Only the host can start the game.", CORS_HEADERS);
  }

  const latestSession = async () =>
    admin
      .from("game_sessions")
      .select("id, started_at")
      .eq("room_id", room.id)
      .order("session_number", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (room.status === "in_progress") {
    // Idempotent: a double-click just returns the session already created.
    const { data: existing } = await latestSession();
    return jsonOk(
      { roomId: room.id, roomStatus: "in_progress", gameSessionId: existing?.id ?? null, startedAt: existing?.started_at ?? null },
      CORS_HEADERS,
    );
  }
  if (room.status === "ended") {
    return jsonErr("INVALID_ROOM_STATE", "This room has already ended.", CORS_HEADERS);
  }

  const { count: activeCount } = await admin
    .from("players")
    .select("id", { count: "exact", head: true })
    .eq("room_id", room.id)
    .eq("status", "active")
    .eq("is_spectator", false);

  if ((activeCount ?? 0) < MIN_PLAYERS_TO_START) {
    return jsonErr(
      "NOT_ENOUGH_PLAYERS",
      `At least ${MIN_PLAYERS_TO_START} players are needed to start.`,
      CORS_HEADERS,
    );
  }

  // Claim the transition first — only the winner of this race ever creates
  // a game_sessions row, so two simultaneous clicks can't produce two
  // sessions for the same game.
  const startedAt = new Date().toISOString();
  const { data: claimed } = await admin
    .from("rooms")
    .update({ status: "in_progress", last_active_at: startedAt })
    .eq("id", room.id)
    .eq("status", "lobby")
    .select("id");

  if (!claimed || claimed.length === 0) {
    const { data: freshRoom } = await admin.from("rooms").select("status").eq("id", room.id).single();
    if (freshRoom?.status === "in_progress") {
      const { data: existing } = await latestSession();
      return jsonOk(
        { roomId: room.id, roomStatus: "in_progress", gameSessionId: existing?.id ?? null, startedAt: existing?.started_at ?? null },
        CORS_HEADERS,
      );
    }
    return jsonErr("INVALID_ROOM_STATE", "This room can't be started right now.", CORS_HEADERS);
  }

  const { data: maxSession } = await admin
    .from("game_sessions")
    .select("session_number")
    .eq("room_id", room.id)
    .order("session_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: session, error: sessionError } = await admin
    .from("game_sessions")
    .insert({
      room_id: room.id,
      session_number: (maxSession?.session_number ?? 0) + 1,
      category_id: room.category_id,
      settings: room.settings,
      started_at: startedAt,
    })
    .select("id, started_at")
    .single();

  if (sessionError || !session) {
    return jsonErr("INTERNAL_ERROR", "Could not start the game.", CORS_HEADERS);
  }

  return jsonOk(
    { roomId: room.id, roomStatus: "in_progress", gameSessionId: session.id, startedAt: session.started_at },
    CORS_HEADERS,
  );
});
