"use client";

import { useRoomStore } from "@/lib/room/store";

interface LetterBlanksProps {
  roundId: string;
}

// Progressive letter-hint row (DESIGN.md §2.4) — one underline per letter,
// preserving word-boundary spacing. `hint` is written only by
// use-round-tick.ts, off round-tick's own HTTP response; see that file and
// hint.ts for why the mask can never come from a broadcast or a column.
//
// Renders nothing until a hint for THIS round has arrived (a stale mask
// from the previous round would otherwise flash for a moment on the swap).
export function LetterBlanks({ roundId }: LetterBlanksProps) {
  const hint = useRoomStore((s) => s.hint);
  if (!hint || hint.roundId !== roundId) return null;

  const words = hint.mask.split(" ");
  const revealedCount = [...hint.mask].filter((ch) => /[\p{L}\p{N}]/u.test(ch)).length;
  const totalCount = [...hint.mask].filter((ch) => ch !== " ").length;

  return (
    <div
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5"
      role="img"
      aria-label={`Answer hint: ${revealedCount} of ${totalCount} characters revealed so far.`}
    >
      {words.map((word, wordIndex) => (
        <div key={wordIndex} className="flex gap-1" aria-hidden>
          {[...word].map((ch, charIndex) =>
            ch === "_" ? (
              <span
                key={charIndex}
                className="h-6 w-4 border-b-2 border-ink sm:h-7 sm:w-5"
              />
            ) : (
              <span
                key={charIndex}
                className="flex h-6 w-4 items-end justify-center border-b-2 border-ink font-heading text-xl font-bold text-ink sm:h-7 sm:w-5 sm:text-2xl"
              >
                {ch}
              </span>
            ),
          )}
        </div>
      ))}
    </div>
  );
}
