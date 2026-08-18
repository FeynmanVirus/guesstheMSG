// join-room — the only way a `players` row can be created or a room looked
// up by code. RLS grants the client zero insert on `players` and no read on
// `rooms` before membership exists (ARCHITECTURE.md §4), so the client
// can't even pre-check "does this code exist" or "does it need a
// password" — this function is the only source of that information too.
//
// Request:  { roomCode, displayName, avatarId, password? }
// Success:  { roomCode, roomId, playerId, isHost, isSpectator, roomStatus, rejoined }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handlePreflight, CORS_HEADERS } from "../_shared/cors.ts";
import { jsonOk, jsonErr } from "../_shared/errors.ts";
import { createAdminClient, createCallerClient } from "../_shared/supabase-admin.deno.ts";
import { validateDisplayName } from "../_shared/validation.ts";
import { containsProfanity } from "../_shared/profanity.ts";
import { isValidAvatarId, DEFAULT_AVATAR_ID } from "../_shared/avatars.ts";
import { normalizeRoomCode, ROOM_CODE_RE } from "../_shared/room-code.ts";
import { SETTINGS_BOUNDS } from "../_shared/settings.ts";

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

  const fields: Record<string, string> = {};
  const nameError = validateDisplayName(body.displayName);
  if (nameError) fields[nameError.field] = nameError.message;
  if (Object.keys(fields).length > 0) {
    return jsonErr("VALIDATION_ERROR", "Please fix the highlighted fields.", CORS_HEADERS, fields);
  }
  if (containsProfanity((body.displayName as string).trim())) {
    return jsonErr(
      "PROFANITY_BLOCKED",
      "Please choose a different name.",
      CORS_HEADERS,
      { displayName: "Please choose a different name." },
    );
  }

  const displayName = (body.displayName as string).trim();
  const avatarId = isValidAvatarId(body.avatarId) ? body.avatarId : DEFAULT_AVATAR_ID;
  const password = (body.password as string | null | undefined) || null;

  const rawCode = typeof body.roomCode === "string" ? body.roomCode : "";
  const code = normalizeRoomCode(rawCode);
  if (!ROOM_CODE_RE.test(code)) {
    return jsonErr("ROOM_NOT_FOUND", "That room code doesn't look right.", CORS_HEADERS);
  }

  const admin = createAdminClient();

  const { data: room, error: roomError } = await admin
    .from("rooms")
    .select("id, status, password_hash, settings")
    .eq("code", code)
    .maybeSingle();

  if (roomError || !room) {
    return jsonErr("ROOM_NOT_FOUND", "No room found with that code.", CORS_HEADERS);
  }

  // --- Existing seat? Check before the password gate. -------------------
  const { data: existingPlayer } = await admin
    .from("players")
    .select("id, is_host, is_spectator, status")
    .eq("room_id", room.id)
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (existingPlayer?.status === "kicked") {
    return jsonErr("KICKED", "You were removed from this room.", CORS_HEADERS);
  }

  // Deliberate: an existing active seat is proof the password (if any) was
  // already satisfied once, so a refreshing tab never has to re-enter it —
  // this is what makes the silent-reconnect promise (DESIGN.md §2.9) work.
  if (!existingPlayer) {
    if (room.password_hash) {
      if (!password) {
        return jsonErr("PASSWORD_REQUIRED", "This room needs a password.", CORS_HEADERS);
      }
      const { data: verified, error: verifyError } = await admin.rpc("verify_password", {
        password,
        password_hash: room.password_hash,
      });
      if (verifyError || !verified) {
        return jsonErr("INVALID_PASSWORD", "That password isn't right.", CORS_HEADERS, {
          password: "That password isn't right.",
        });
      }
    }

    const maxPlayers =
      typeof room.settings?.max_players === "number"
        ? room.settings.max_players
        : SETTINGS_BOUNDS.maxPlayers.default;

    const { count: activeCount } = await admin
      .from("players")
      .select("id", { count: "exact", head: true })
      .eq("room_id", room.id)
      .eq("status", "active");

    if ((activeCount ?? 0) >= maxPlayers) {
      return jsonErr("ROOM_FULL", "This room is full.", CORS_HEADERS);
    }
  }

  // --- Upsert the seat ---------------------------------------------------
  let playerId: string;
  let isHost: boolean;
  let isSpectator: boolean;
  let rejoined: boolean;

  if (existingPlayer) {
    const { error: updateError } = await admin
      .from("players")
      .update({
        display_name: displayName,
        avatar_id: avatarId,
        is_connected: true,
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", existingPlayer.id);

    if (updateError) {
      return jsonErr("INTERNAL_ERROR", "Could not rejoin the room.", CORS_HEADERS);
    }
    playerId = existingPlayer.id;
    isHost = existingPlayer.is_host;
    isSpectator = existingPlayer.is_spectator;
    rejoined = true;
  } else {
    const spectator = room.status !== "lobby";
    const { data: inserted, error: insertError } = await admin
      .from("players")
      .insert({
        room_id: room.id,
        auth_user_id: user.id,
        display_name: displayName,
        avatar_id: avatarId,
        is_host: false,
        is_connected: true,
        is_spectator: spectator,
        status: "active",
        last_seen_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError?.code === "23505") {
      // Lost a race against a concurrent join from the same user/tab —
      // fall through to a rejoin update instead of failing.
      const { data: raced } = await admin
        .from("players")
        .select("id, is_host, is_spectator")
        .eq("room_id", room.id)
        .eq("auth_user_id", user.id)
        .single();
      if (!raced) {
        return jsonErr("INTERNAL_ERROR", "Could not join the room.", CORS_HEADERS);
      }
      await admin
        .from("players")
        .update({
          display_name: displayName,
          avatar_id: avatarId,
          is_connected: true,
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", raced.id);
      playerId = raced.id;
      isHost = raced.is_host;
      isSpectator = raced.is_spectator;
      rejoined = true;
    } else if (insertError || !inserted) {
      return jsonErr("INTERNAL_ERROR", "Could not join the room.", CORS_HEADERS);
    } else {
      playerId = inserted.id;
      isHost = false;
      isSpectator = spectator;
      rejoined = false;
    }
  }

  await admin.from("rooms").update({ last_active_at: new Date().toISOString() }).eq("id", room.id);

  return jsonOk(
    {
      roomCode: code,
      roomId: room.id,
      playerId,
      isHost,
      isSpectator,
      roomStatus: room.status,
      rejoined,
    },
    CORS_HEADERS,
  );
});
