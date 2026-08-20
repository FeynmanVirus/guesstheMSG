"use client";

import { useEffect, useState } from "react";
import { AlarmClock } from "lucide-react";
import { useRoomStore } from "@/lib/room/store";
import { playTick } from "@/lib/sounds";

const URGENT_SECONDS = 10;

interface RoundTimerProps {
  endsAt: string;
}

// The header timer pill (mockup frames 1e/1f): lavender while calm, coral
// once urgent. Its own component so the 250ms tick re-renders a number, not
// the whole game tree (the leaderboard's layout animation especially).
//
// CLAUDE.md rule 3: the countdown is always ends_at - now, recomputed from
// the server's timestamp. There is no locally-held duration to drift, and
// serverOffsetMs absorbs a skewed device clock.
export function RoundTimer({ endsAt }: RoundTimerProps) {
  const serverOffsetMs = useRoomStore((s) => s.serverOffsetMs);
  const [remaining, setRemaining] = useState(() => remainingSeconds(endsAt, serverOffsetMs));

  // The caller keys this component by round.id, so a new round remounts it
  // and the useState initializer above already has the right value — this
  // effect only needs to keep ticking, never to push a synchronous update
  // of its own.
  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(remainingSeconds(endsAt, serverOffsetMs));
    }, 250);
    return () => clearInterval(id);
  }, [endsAt, serverOffsetMs]);

  const urgent = remaining <= URGENT_SECONDS;

  // `remaining` is integer seconds, so React bails out of a same-value
  // setState — this effect only re-fires on an actual second transition,
  // not every 250ms tick. Silent once the round hits 0 (the recap takes
  // over from there).
  useEffect(() => {
    if (urgent && remaining > 0) playTick();
  }, [remaining, urgent]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return (
    <div
      className={`flex items-center gap-2 rounded-full border-[2.5px] border-ink px-4 py-1.5 shadow-pop-pressed ${
        urgent ? "bg-coral" : "bg-lavender"
      }`}
    >
      {/* Icon + the pill's own background shift carry the urgency, so it
          isn't communicated by colour alone (DESIGN.md §3). */}
      <AlarmClock className={`size-4 text-ink ${urgent ? "animate-pulse" : ""}`} aria-hidden />
      <p className="font-heading text-xl font-bold tabular-nums text-ink" aria-live="off">
        {minutes}:{String(seconds).padStart(2, "0")}
      </p>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {urgent ? `${remaining} seconds left` : ""}
      </span>
    </div>
  );
}

function remainingSeconds(endsAt: string, offsetMs: number): number {
  const ms = new Date(endsAt).getTime() - (Date.now() + offsetMs);
  return Math.max(0, Math.ceil(ms / 1000));
}
