import { Squiggle } from "@/components/doodle/squiggle";
import { LetterBlanks } from "@/components/game/letter-blanks";

interface EmojiCardProps {
  emojiSequence: string;
  roundId: string;
}

// The screen's one focal point (DESIGN.md §3): large, centered, nothing
// competing with it. "Round N of M" lives in the header now
// (room-game.tsx) — this card is just the clue. Entrance/exit between
// rounds (and the swap to RoundRecap) is owned by the parent, which wraps
// whichever of the two is showing in one motion.div — a plain div here
// avoids animating twice.
export function EmojiCard({ emojiSequence, roundId }: EmojiCardProps) {
  return (
    // max-lg:h-full max-lg:min-h-0: the mobile shell (room-game.tsx) caps
    // this card's cell at 36dvh — the min-h-[420px] floor below is a desktop
    // value and would blow through that cap if left active on a phone.
    <div className="doodle-panel flex min-h-[420px] flex-col items-center gap-2.5 p-5 text-center max-lg:h-full max-lg:min-h-0 max-lg:justify-center max-lg:py-3 lg:min-h-[560px]">
      {/* Label, squiggle, and the "type your guess" footer all assume the
          desktop card's spare vertical room — dropped below lg so the clue
          and its letter blanks are the only two things in the capped box. */}
      <p className="text-xs font-bold tracking-[0.16em] text-ink-muted uppercase max-lg:hidden">
        decode this
      </p>
      <Squiggle color="lavender" width={160} className="max-lg:hidden" />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-4 max-lg:flex-none max-lg:gap-2 max-lg:py-0">
        <p
          className="text-6xl leading-none sm:text-8xl max-lg:text-5xl"
          // The emoji sequence IS the puzzle — read it out as one unit rather
          // than letting a screen reader announce each codepoint's CLDR name
          // in isolation.
          role="img"
          aria-label={`Emoji clue: ${emojiSequence}`}
        >
          {emojiSequence}
        </p>
        <LetterBlanks roundId={roundId} />
      </div>
      <div className="flex w-full items-center justify-center gap-2 border-t-2 border-dashed border-hairline pt-3.5 text-sm font-semibold text-ink-muted max-lg:hidden">
        <span aria-hidden>👉</span>
        type your guess in the chat
      </div>
    </div>
  );
}
