"use client";

import { useEffect, useState } from "react";
import { AlarmClock } from "lucide-react";
import { useRoomStore } from "@/lib/room/store";
import { playTick } from "@/lib/sounds";

const URGENT_SECONDS = 10;

interface RoundTimerProps {
  endsAt: string;
}

// Its own component so the 250ms tick re-renders a number, not the whole
// game tree (the leaderboard's layout animation especially).
//
// CLAUDE.md rule 3: the countdown is always ends_at - now, recomputed from
// the server's timestamp. There is no locally-held duration to drift, and
// serverOffsetMs absorbs a skewed device clock.
export function RoundTimer({ endsAt }: RoundTimerProps) {
  const serverOffsetMs = useRoomStore((s) => s.serverOffsetMs);
  const [remaining, setRemaining] = useState(() => remainingSeconds(endsAt, serverOffsetMs));

  // The parent keys this component by round.id, so a new round remounts it
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

  return (
    <div
      className={`flex items-center justify-center gap-2 ${urgent ? "text-coral" : "text-sky"}`}
    >
      {/* Icon + the word "left" carry the urgency alongside the colour
          shift, so it isn't communicated by colour alone (DESIGN.md §3). */}
      <AlarmClock className={`size-5 ${urgent ? "animate-pulse" : ""}`} aria-hidden />
      <p className="font-heading text-2xl font-semibold tabular-nums" aria-live="off">
        {remaining}s
      </p>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {urgent ? `${remaining} seconds left` : ""}
      </span>
      <span className={`text-sm ${urgent ? "font-semibold" : "text-ink-muted"}`}>left</span>
    </div>
  );
}

function remainingSeconds(endsAt: string, offsetMs: number): number {
  const ms = new Date(endsAt).getTime() - (Date.now() + offsetMs);
  return Math.max(0, Math.ceil(ms / 1000));
}
