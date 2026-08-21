"use client";

import { useCallback, useEffect, useRef } from "react";
import { callFunction } from "@/lib/api";
import { useRoomStore } from "@/lib/room/store";
import { RECAP_SECONDS } from "@shared/settings";

// A slow backstop, not the primary trigger. It covers the two cases the
// due-time check can't see: a round that should end early because everyone
// guessed correctly, and a client whose cached round state is stale.
const SAFETY_POLL_MS = 5_000;

// Mirrors round-tick/index.ts's response envelope. hintMask/nextRevealAt
// only ever ride along on a `state: 'live'` response — see that function's
// header comment for why this is the mask's only delivery path.
interface RoundTickResult {
  state: "lobby" | "live" | "recap" | "ended";
  roundId?: string;
  roundNumber?: number;
  endsAt?: string;
  totalRounds: number;
  hintMask?: string;
  nextRevealAt?: string | null;
}

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
      const result = await callFunction<RoundTickResult>("round-tick", { roomCode });
      // Everything else about round state (start/end/recap/emoji) comes
      // through useRoomChannel's `rounds` postgres_changes subscription —
      // this response used to be discarded entirely. The hint mask has no
      // other pipe: it must never be persisted or broadcast (CLAUDE.md rule
      // 1), so this per-client HTTP round trip is its only delivery path.
      if (result.ok && result.data.state === "live" && result.data.roundId) {
        const { roundId, hintMask, nextRevealAt } = result.data;
        useRoomStore
          .getState()
          .setHint(hintMask !== undefined ? { roundId, mask: hintMask, nextRevealAt: nextRevealAt ?? null } : null);
      }
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
      const { round, hint, serverOffsetMs } = useRoomStore.getState();
      // No round yet in an in-progress room: round 1 is overdue.
      if (!round) return 0;

      const now = Date.now() + serverOffsetMs;
      const target = round.revealedAt
        ? new Date(round.revealedAt).getTime() + RECAP_SECONDS * 1000
        : new Date(round.endsAt).getTime();

      // A hint reveal is often due well before the round-end/recap target —
      // wake for whichever is sooner, so a letter lands on its own phase
      // boundary instead of up to SAFETY_POLL_MS late.
      const hintTarget =
        !round.revealedAt && hint?.roundId === round.id && hint.nextRevealAt
          ? new Date(hint.nextRevealAt).getTime()
          : Infinity;

      return Math.max(0, Math.min(target, hintTarget) - now);
    }

    // One timer, re-armed each pass, rather than a fixed interval: in steady
    // state mid-round it sleeps until the transition is actually due instead
    // of polling every second.
    //
    // The timer always fires by at most SAFETY_POLL_MS and always ticks when
    // it fires — never gated on "is the due-time calc satisfied yet". A
    // gate there would defeat the whole point of the safety poll: whether
    // everyone has already guessed correctly is server-side state this
    // client can't compute from its own cached `round`, so the only way to
    // discover it is to actually ask, on every safety-poll tick, not just
    // once dueInMs() independently reaches 0.
    let timer: ReturnType<typeof setTimeout>;

    function schedule() {
      if (cancelled) return;
      const delay = Math.min(dueInMs(), SAFETY_POLL_MS);
      timer = setTimeout(async () => {
        if (cancelled) return;
        await tick();
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
