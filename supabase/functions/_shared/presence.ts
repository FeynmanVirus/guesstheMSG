// Realtime presence/host-migration timing + the host-selection rule.
// Self-contained (no imports of its own) so it resolves identically from
// Deno (relative path) and Next (`@shared/presence`). Used by `promote-host`
// as the authoritative rule, and by the client watchdog purely as a "should
// I be the one to make the call" heuristic — same code both sides.
//
// Closes ARCHITECTURE.md §16's previously-open "exact Presence
// heartbeat/timeout values" question. Invariants if retuned:
//   LEASE >= 3 x HEARTBEAT               (tolerate two lost beats on flaky mobile)
//   GRACE >= LEASE + HEARTBEAT            (first promote call isn't wasted on a
//                                          not-yet-stale lease)
//   DISCONNECT_UI_GRACE < LEASE           (the dot goes grey before the badge
//                                          moves, so migration reads as a
//                                          consequence, not a surprise)

export const PRESENCE_TIMING = {
  HEARTBEAT_INTERVAL_MS: 5_000, // host client -> players.last_seen_at
  HOST_LEASE_MS: 15_000, // server: lease older than this = migratable (3 missed beats)
  HOST_GRACE_MS: 18_000, // client watchdog: wait after host's presence drops
  HOST_PROMOTE_RETRY_MS: 5_000, // retry after HOST_STILL_ACTIVE (max 4 attempts)
  HOST_ORPHAN_GRACE_MS: 3_000, // no host row at all, or a promoted ghost never appears present
  DISCONNECT_UI_GRACE_MS: 5_000, // presence absent this long before a row renders "disconnected"
} as const;

export function presenceTopic(code: string): string {
  return `room:${code}`;
}

/** The only thing tracked in Presence — nothing durable goes here, the DB
 * owns name/avatar/host/score. */
export interface RoomPresence {
  playerId: string;
}

export interface HostCandidate {
  id: string;
  joined_at: string;
  is_host: boolean;
  is_spectator: boolean;
  status: "active" | "kicked";
  last_seen_at: string;
}

export function isEligibleForHost(p: HostCandidate): boolean {
  return p.status === "active" && !p.is_spectator;
}

function isLeaseFresh(lastSeenAt: string, nowMs: number): boolean {
  return nowMs - new Date(lastSeenAt).getTime() < PRESENCE_TIMING.HOST_LEASE_MS;
}

/** Fresh-lease candidates first (skips provable ghosts), then earliest
 * joined_at — "longest-connected" (DESIGN.md/ARCHITECTURE.md §11) means seat
 * age, not socket age, so a refresh never resets seniority — then id for a
 * deterministic tiebreak. Returns null if nobody is eligible. */
export function pickSuccessor(
  players: HostCandidate[],
  excludeId?: string | null,
  nowMs: number = Date.now(),
): string | null {
  const candidates = players.filter((p) => p.id !== excludeId && isEligibleForHost(p));
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const aFresh = isLeaseFresh(a.last_seen_at, nowMs);
    const bFresh = isLeaseFresh(b.last_seen_at, nowMs);
    if (aFresh !== bFresh) return aFresh ? -1 : 1;
    const joinedDelta = new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
    if (joinedDelta !== 0) return joinedDelta;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return candidates[0].id;
}
