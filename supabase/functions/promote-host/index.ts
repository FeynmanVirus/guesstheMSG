// promote-host — "Ensure this room has a live host." Idempotent, safe for
// every client to call. The successor is always recomputed server-side from
// authoritative DB state (players.last_seen_at, stamped by a trigger no
// client can override) — a client can never name who becomes host, so lying
// to this function gains nothing. See ARCHITECTURE.md §11 for the design
// rationale (rule 7: a state transition must be validated against server
// truth, never a client's claim).
//
// Request:  { roomCode }
// Success:  { roomId, hostPlayerId, previousHostPlayerId, changed, reason }
//   reason: 'no_host' | 'voluntary' | 'lease_expired' | 'noop'

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handlePreflight, CORS_HEADERS } from "../_shared/cors.ts";
import { jsonOk, jsonErr } from "../_shared/errors.ts";
import { createAdminClient, createCallerClient } from "../_shared/supabase-admin.deno.ts";
import { normalizeRoomCode, ROOM_CODE_RE } from "../_shared/room-code.ts";
import { PRESENCE_TIMING, pickSuccessor, type HostCandidate } from "../_shared/presence.ts";

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

  const { data: room } = await admin.from("rooms").select("id").eq("code", code).maybeSingle();
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

  const { data: host } = await admin
    .from("players")
    .select("id, last_seen_at")
    .eq("room_id", room.id)
    .eq("is_host", true)
    .maybeSingle();

  // --- Authorization gate: exactly three ways to pass -------------------
  let reason: "no_host" | "voluntary" | "lease_expired";
  if (!host) {
    reason = "no_host";
  } else if (host.id === me.id) {
    reason = "voluntary";
  } else {
    const leaseAgeMs = Date.now() - new Date(host.last_seen_at).getTime();
    if (leaseAgeMs < PRESENCE_TIMING.HOST_LEASE_MS) {
      return jsonErr("HOST_STILL_ACTIVE", "The current host is still active.", CORS_HEADERS);
    }
    reason = "lease_expired";
  }

  const { data: roster } = await admin
    .from("players")
    .select("id, joined_at, is_host, is_spectator, status, last_seen_at")
    .eq("room_id", room.id);

  const successorId = pickSuccessor((roster ?? []) as HostCandidate[], host?.id ?? null);

  if (!successorId) {
    return jsonOk(
      { roomId: room.id, hostPlayerId: null, previousHostPlayerId: host?.id ?? null, changed: false, reason },
      CORS_HEADERS,
    );
  }

  // --- Demote the old host, if any. The staleness check is repeated in the
  // WHERE clause (not just the read above) so a heartbeat landing between
  // the read and this write wins the race and the promotion aborts cleanly.
  if (host) {
    let demote = admin
      .from("players")
      .update({ is_host: false, is_connected: false })
      .eq("id", host.id)
      .eq("is_host", true);
    if (reason === "lease_expired") {
      const cutoff = new Date(Date.now() - PRESENCE_TIMING.HOST_LEASE_MS).toISOString();
      demote = demote.lt("last_seen_at", cutoff);
    }
    const { data: demoted } = await demote.select("id");

    if (!demoted || demoted.length === 0) {
      // Lost the race — either the host's heartbeat landed just in time, or
      // another promote-host call already resolved this. Re-read and report
      // the truth rather than guessing which.
      const { data: currentHost } = await admin
        .from("players")
        .select("id")
        .eq("room_id", room.id)
        .eq("is_host", true)
        .maybeSingle();
      if (currentHost?.id === host.id) {
        return jsonErr("HOST_STILL_ACTIVE", "The current host is still active.", CORS_HEADERS);
      }
      return jsonOk(
        {
          roomId: room.id,
          hostPlayerId: currentHost?.id ?? null,
          previousHostPlayerId: host.id,
          changed: false,
          reason: "noop",
        },
        CORS_HEADERS,
      );
    }
  }

  const { data: promoted, error: promoteError } = await admin
    .from("players")
    .update({ is_host: true })
    .eq("id", successorId)
    .eq("room_id", room.id)
    .select("id")
    .single();

  if (promoteError?.code === "23505" || !promoted) {
    // Someone else's promote-host call won the race — the partial unique
    // index backstops this even if application logic somehow raced.
    const { data: currentHost } = await admin
      .from("players")
      .select("id")
      .eq("room_id", room.id)
      .eq("is_host", true)
      .maybeSingle();
    return jsonOk(
      {
        roomId: room.id,
        hostPlayerId: currentHost?.id ?? null,
        previousHostPlayerId: host?.id ?? null,
        changed: false,
        reason: "noop",
      },
      CORS_HEADERS,
    );
  }

  await admin.from("rooms").update({ last_active_at: new Date().toISOString() }).eq("id", room.id);

  return jsonOk(
    { roomId: room.id, hostPlayerId: promoted.id, previousHostPlayerId: host?.id ?? null, changed: true, reason },
    CORS_HEADERS,
  );
});
