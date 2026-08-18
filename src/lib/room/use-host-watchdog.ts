"use client";

import { useEffect } from "react";
import { PRESENCE_TIMING, pickSuccessor, type HostCandidate } from "@shared/presence";
import { callFunction } from "@/lib/api";
import type { RoomPlayer } from "@/lib/room/types";

interface UseHostWatchdogArgs {
  players: RoomPlayer[];
  presentIds: Set<string>;
  presenceSynced: boolean;
  myPlayerId: string | null;
  isHost: boolean;
  roomCode: string;
}

// The host-migration trigger. Armed only once presence has synced and never
// when I am the host myself. Client-side, this is only a heuristic for
// *when* to call promote-host and *who* should be the one to call it first
// (the herd-breaker below) — the function itself recomputes everything
// authoritatively server-side, so a wrong guess here just means a slightly
// later or slightly redundant call, never an incorrect promotion.
export function useHostWatchdog({
  players,
  presentIds,
  presenceSynced,
  myPlayerId,
  isHost,
  roomCode,
}: UseHostWatchdogArgs) {
  const host = players.find((p) => p.isHost) ?? null;
  const hostId = host?.id ?? null;
  const hostGone = presenceSynced && !isHost && !!myPlayerId && (!host || !presentIds.has(host.id));

  // Client-side lease freshness is unknowable (last_seen_at isn't in
  // RoomPlayer) — pickSuccessor's freshness tiebreak degrades gracefully to
  // "all equally stale", so the ordering falls back to earliest joined_at,
  // which is exactly the definition of "longest-connected" anyway.
  const amSuccessor =
    hostGone &&
    myPlayerId !== null &&
    pickSuccessor(
      players.map(
        (p): HostCandidate => ({
          id: p.id,
          joined_at: p.joinedAt,
          is_host: p.isHost,
          is_spectator: p.isSpectator,
          status: p.status,
          last_seen_at: new Date(0).toISOString(),
        }),
      ),
      hostId,
    ) === myPlayerId;

  useEffect(() => {
    if (!hostGone || !myPlayerId) return;

    const initialDelay = !hostId
      ? PRESENCE_TIMING.HOST_ORPHAN_GRACE_MS
      : amSuccessor
        ? PRESENCE_TIMING.HOST_GRACE_MS
        : PRESENCE_TIMING.HOST_GRACE_MS + 3_000 + Math.random() * 2_000;

    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function schedule(delay: number) {
      timer = setTimeout(async () => {
        if (cancelled) return;
        const result = await callFunction("promote-host", { roomCode });
        if (cancelled) return;
        if (!result.ok && result.error.code === "HOST_STILL_ACTIVE" && attempt < 4) {
          attempt += 1;
          schedule(PRESENCE_TIMING.HOST_PROMOTE_RETRY_MS);
        }
      }, delay);
    }

    schedule(initialDelay);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [hostGone, myPlayerId, hostId, amSuccessor, roomCode]);
}
