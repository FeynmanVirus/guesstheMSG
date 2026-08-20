"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";
import { normalizeRoomCode } from "@shared/room-code";

// The 6-box room-code entry (mockup frame 1c). Room codes are AAA-999 (see
// @shared/room-code) — 6 alphanumeric characters, one per box; the dash is
// implied by a wider gap after the 3rd box rather than its own box. The
// external value is always the normalized "AAA-999" string, same contract
// as the plain Input this replaces.
const LENGTH = 6;

interface RoomCodeInputProps {
  value: string;
  onChange: (next: string) => void;
}

export function RoomCodeInput({ value, onChange }: RoomCodeInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const raw = value.replace(/[^A-Z0-9]/g, "");
  const chars = Array.from({ length: LENGTH }, (_, i) => raw[i] ?? "");

  function commit(nextChars: string[]) {
    onChange(normalizeRoomCode(nextChars.join("").slice(0, LENGTH)));
  }

  function handleChange(i: number, e: React.ChangeEvent<HTMLInputElement>) {
    const typed = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const next = [...chars];

    if (typed.length <= 1) {
      next[i] = typed;
      commit(next);
      if (typed) refs.current[i + 1]?.focus();
      return;
    }

    // Paste (or a fast mobile keyboard) can hand us several characters at once.
    for (let j = 0; j < typed.length && i + j < LENGTH; j++) next[i + j] = typed[j];
    commit(next);
    refs.current[Math.min(i + typed.length, LENGTH - 1)]?.focus();
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !chars[i] && i > 0) {
      // preventDefault matters here: without it, moving focus mid-keydown
      // lets the browser's default backspace-delete re-target the box we
      // just focused, silently eating its character too.
      e.preventDefault();
      refs.current[i - 1]?.focus();
    }
  }

  return (
    <div className="flex gap-1.5" role="group" aria-label="Room code">
      {chars.map((ch, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={ch}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          // Not maxLength={1}: a paste starting in any box needs the full
          // string in e.target.value so handleChange can spread it across
          // the remaining boxes — a length-1 cap would truncate it first.
          maxLength={LENGTH}
          aria-label={`Room code character ${i + 1}`}
          className={cn(
            // min-w-0: a bare flex-1 isn't enough to shrink a text <input>
            // below its intrinsic content width (~20ch by default) — without
            // this every box renders full-size and the row overflows.
            "aspect-[0.82] min-w-0 flex-1 rounded-2xl border-[2.5px] border-ink bg-surface text-center font-heading text-2xl font-bold text-ink shadow-panel outline-none focus-visible:ring-2 focus-visible:ring-sky",
            i === 2 && "mr-1.5",
          )}
        />
      ))}
    </div>
  );
}
