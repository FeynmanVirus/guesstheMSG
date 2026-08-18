"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PRESENCE_TIMING } from "@shared/presence";

/** Anti-flicker: a player only renders as "disconnected" after being absent
 * from presence for DISCONNECT_UI_GRACE_MS continuously — a page refresh
 * (~0.5-2s) never flickers to disconnected for other viewers. Kept separate
 * from use-room-channel so the grace logic is testable and doesn't leak
 * into JSX.
 *
 * Design: `confirmedOffline` state only ever grows, and only from inside a
 * setTimeout callback (a genuine external-timer event, not a synchronous
 * effect-body update) — once a grace timer fires, that id stays recorded as
 * "was confirmed offline at some point." The value actually returned is
 * derived at render time by intersecting that with "is still absent right
 * now" and "still part of the roster," so a returning player disappears
 * from the rendered set immediately without ever needing an effect to
 * proactively clear it. */
export function usePresenceGrace(
  playerIds: string[],
  presentIds: Set<string>,
  presenceSynced: boolean,
): Set<string> {
  const [confirmedOffline, setConfirmedOffline] = useState<Set<string>>(new Set());
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!presenceSynced) return;

    const idSet = new Set(playerIds);

    for (const id of Array.from(timers.current.keys())) {
      if (!idSet.has(id)) {
        clearTimeout(timers.current.get(id));
        timers.current.delete(id);
      }
    }

    for (const id of playerIds) {
      const present = presentIds.has(id);
      const hasTimer = timers.current.has(id);

      if (present) {
        if (hasTimer) {
          clearTimeout(timers.current.get(id));
          timers.current.delete(id);
        }
      } else if (!hasTimer) {
        const timer = setTimeout(() => {
          timers.current.delete(id);
          setConfirmedOffline((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
        }, PRESENCE_TIMING.DISCONNECT_UI_GRACE_MS);
        timers.current.set(id, timer);
      }
    }
  }, [playerIds, presentIds, presenceSynced]);

  useEffect(() => {
    const timersMap = timers.current;
    return () => {
      for (const t of timersMap.values()) clearTimeout(t);
      timersMap.clear();
    };
  }, []);

  return useMemo(() => {
    const idSet = new Set(playerIds);
    return new Set(
      Array.from(confirmedOffline).filter((id) => idSet.has(id) && !presentIds.has(id)),
    );
  }, [confirmedOffline, presentIds, playerIds]);
}
