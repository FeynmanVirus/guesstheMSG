import { Squiggle } from "@/components/doodle/squiggle";

interface EmojiCardProps {
  emojiSequence: string;
}

// The screen's one focal point (DESIGN.md §3): large, centered, nothing
// competing with it. "Round N of M" lives in the header now
// (room-game.tsx) — this card is just the clue. Entrance/exit between
// rounds (and the swap to RoundRecap) is owned by the parent, which wraps
// whichever of the two is showing in one motion.div — a plain div here
// avoids animating twice.
export function EmojiCard({ emojiSequence }: EmojiCardProps) {
  return (
    <div className="doodle-panel flex min-h-[420px] flex-col items-center gap-2.5 p-5 text-center lg:min-h-[560px]">
      <p className="text-xs font-bold tracking-[0.16em] text-ink-muted uppercase">decode this</p>
      <Squiggle color="lavender" width={160} />
      <div className="flex flex-1 items-center justify-center py-4">
        <p
          className="text-6xl leading-none sm:text-8xl"
          // The emoji sequence IS the puzzle — read it out as one unit rather
          // than letting a screen reader announce each codepoint's CLDR name
          // in isolation.
          role="img"
          aria-label={`Emoji clue: ${emojiSequence}`}
        >
          {emojiSequence}
        </p>
      </div>
      <div className="flex w-full items-center justify-center gap-2 border-t-2 border-dashed border-hairline pt-3.5 text-sm font-semibold text-ink-muted">
        <span aria-hidden>👉</span>
        type your guess in the chat
      </div>
    </div>
  );
}
