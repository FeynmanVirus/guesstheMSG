// create-room — the only way a `rooms` row (and its host `players` row) can
// be created. RLS grants the client zero insert on either table
// (ARCHITECTURE.md §4), so this is not a convenience wrapper, it's the only
// path that exists. Runs entirely under service_role; the caller's identity
// comes from their JWT, never from the request body.
//
// Request:
//   { displayName, avatarId, roomName, password?, categoryId,
//     customWords?, settings?: { rounds?, secondsPerRound? } }
// Success: { roomCode, roomId, playerId, isHost: true, customWordCount }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handlePreflight, CORS_HEADERS } from "../_shared/cors.ts";
import { jsonOk, jsonErr } from "../_shared/errors.ts";
import { createAdminClient, createCallerClient } from "../_shared/supabase-admin.deno.ts";
import { validateDisplayName, validateRoomName, validatePassword } from "../_shared/validation.ts";
import { containsProfanity } from "../_shared/profanity.ts";
import { parseCustomWords } from "../_shared/custom-words.ts";
import { clampSettings } from "../_shared/settings.ts";
import { isValidAvatarId, DEFAULT_AVATAR_ID } from "../_shared/avatars.ts";
import { generateRoomCode } from "../_shared/room-code.ts";

const MAX_CODE_ATTEMPTS = 5;

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

  // --- Field validation -----------------------------------------------
  const fields: Record<string, string> = {};

  const nameError = validateDisplayName(body.displayName);
  if (nameError) fields[nameError.field] = nameError.message;

  const roomNameError = validateRoomName(body.roomName);
  if (roomNameError) fields[roomNameError.field] = roomNameError.message;

  const passwordError = validatePassword(body.password);
  if (passwordError) fields[passwordError.field] = passwordError.message;

  const avatarId = isValidAvatarId(body.avatarId) ? body.avatarId : DEFAULT_AVATAR_ID;

  const categoryId = typeof body.categoryId === "string" ? body.categoryId : null;
  if (!categoryId) fields.categoryId = "Category is required.";

  if (Object.keys(fields).length > 0) {
    return jsonErr("VALIDATION_ERROR", "Please fix the highlighted fields.", CORS_HEADERS, fields);
  }

  const displayName = (body.displayName as string).trim();
  const roomName = (body.roomName as string).trim();
  const password = (body.password as string | null | undefined) || null;

  // --- Profanity ---------------------------------------------------------
  const profane: Record<string, string> = {};
  if (containsProfanity(displayName)) profane.displayName = "Please choose a different name.";
  if (containsProfanity(roomName)) profane.roomName = "Please choose a different room name.";

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
  customPairs.forEach((pair, i) => {
    if (containsProfanity(pair.emojiSequence) || containsProfanity(pair.answer)) {
      profane[`customWords[${i}]`] = "Please choose different custom words.";
    }
  });

  if (Object.keys(profane).length > 0) {
    return jsonErr("PROFANITY_BLOCKED", "Please revise the flagged fields.", CORS_HEADERS, profane);
  }

  const settings = clampSettings(
    body.settings && typeof body.settings === "object"
      ? (body.settings as Record<string, unknown>)
      : undefined,
  );

  const admin = createAdminClient();

  // --- Category must be a real, global category -----------------------
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

  // --- Password hash (server-side, pgcrypto/crypt() — CLAUDE.md rule 6) ---
  let passwordHash: string | null = null;
  if (password) {
    const { data: hash, error: hashError } = await admin.rpc("hash_password", { password });
    if (hashError || !hash) {
      return jsonErr("INTERNAL_ERROR", "Could not process the password.", CORS_HEADERS);
    }
    passwordHash = hash;
  }

  // --- Insert room: generate-then-insert, retry on code collision -----
  let roomId: string | null = null;
  let roomCode: string | null = null;
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const candidate = generateRoomCode();
    const { data: room, error: insertError } = await admin
      .from("rooms")
      .insert({
        code: candidate,
        name: roomName,
        password_hash: passwordHash,
        status: "lobby",
        category_id: categoryId,
        settings,
      })
      .select("id, code")
      .single();

    if (!insertError && room) {
      roomId = room.id;
      roomCode = room.code;
      break;
    }
    if (insertError?.code !== "23505") {
      return jsonErr("INTERNAL_ERROR", "Could not create the room.", CORS_HEADERS);
    }
    // 23505 (unique_violation on code) — regenerate and retry.
  }

  if (!roomId || !roomCode) {
    return jsonErr("CODE_GENERATION_FAILED", "Could not allocate a room code, please try again.", CORS_HEADERS);
  }

  // --- From here on, any failure gets a compensating delete of the room:
  // ON DELETE CASCADE on categories.room_id / words.category_id /
  // players.room_id cleans up everything created below in one statement.
  // supabase-js has no transaction primitive across separate table inserts;
  // pushing this into a single SQL function would move trusted logic out of
  // the testable _shared/ modules, so a compensating delete is the
  // deliberate trade-off here, not a shortcut.
  const rollback = async () => {
    await admin.from("rooms").delete().eq("id", roomId);
  };

  let customWordCount = 0;
  if (customPairs.length > 0) {
    const { data: customCategory, error: customCategoryError } = await admin
      .from("categories")
      .insert({ name: `${roomName} — custom`, is_custom: true, room_id: roomId })
      .select("id")
      .single();

    if (customCategoryError || !customCategory) {
      await rollback();
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
      await rollback();
      return jsonErr("INTERNAL_ERROR", "Could not save custom words.", CORS_HEADERS);
    }
    customWordCount = customPairs.length;
  }

  const { data: player, error: playerError } = await admin
    .from("players")
    .insert({
      room_id: roomId,
      auth_user_id: user.id,
      display_name: displayName,
      avatar_id: avatarId,
      is_host: true,
      is_connected: true,
      is_spectator: false,
      status: "active",
    })
    .select("id")
    .single();

  if (playerError || !player) {
    await rollback();
    return jsonErr("INTERNAL_ERROR", "Could not seat the host.", CORS_HEADERS);
  }

  return jsonOk(
    { roomCode, roomId, playerId: player.id, isHost: true, customWordCount },
    CORS_HEADERS,
  );
});
