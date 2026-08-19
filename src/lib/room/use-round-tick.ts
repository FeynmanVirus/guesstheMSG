"use client";

import { useCallback, useEffect, useRef } from "react";
import { callFunction } from "@/lib/api";
import { useRoomStore } from "@/lib/room/store";
import { RECAP_SECONDS } from "@shared/settings";

// A slow backstop, not the primary trigger. It covers the two cases the
// due-time check can't see: a round that should end early because everyone
// guessed correctly, and a client whose cached round state is stale.
const SAFETY_POLL_MS = 5_000;

// Drives the round loop by poking the server's state machine. Runs in EVERY
// member's client, not just the host's — round-tick holds no privilege, and
// host-only ticking would stall the game whenever the host merely
// backgrounds their tab (browsers throttle background timers to ~1/min
// while the WebSocket stays alive, so Presence never drops and host
// migration never fires).
//
// The server decides what, if anything, is due; this only decides *when to
// ask*. Asking early is harmless — an early tick is a no-op response.
export function useRoundTick(roomCode: string, enabled: boolean) {
  const inFlight = useRef(false);

  const tick = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await callFunction("round-tick", { roomCode });
    } catch {
      // Offline or a transient failure — the next poll retries. There is
      // nothing useful to show the player here; the round state they can
      // see is still whatever the server last broadcast.
    } finally {
      inFlight.current = false;
    }
  }, [roomCode]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    function dueInMs(): number {
      const { round, serverOffsetMs } = useRoomStore.getState();
      // No round yet in an in-progress room: round 1 is overdue.
      if (!round) return 0;

      const now = Date.now() + serverOffsetMs;
      const target = round.revealedAt
        ? new Date(round.revealedAt).getTime() + RECAP_SECONDS * 1000
        : new Date(round.endsAt).getTime();

      return Math.max(0, target - now);
    }

    // One timer, re-armed each pass, rather than a fixed interval: in steady
    // state mid-round it sleeps until the transition is actually due instead
    // of polling every second.
    let timer: ReturnType<typeof setTimeout>;

    function schedule() {
      if (cancelled) return;
      const delay = Math.min(dueInMs(), SAFETY_POLL_MS);
      timer = setTimeout(async () => {
        if (cancelled) return;
        if (dueInMs() === 0) await tick();
        schedule();
      }, Math.max(250, delay));
    }

    // A backgrounded tab has its timers throttled; catch up the moment it
    // comes back rather than waiting out the next throttled firing.
    function onVisible() {
      if (document.visibilityState === "visible") void tick();
    }

    void tick();
    schedule();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, tick]);
}
