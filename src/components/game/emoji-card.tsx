interface EmojiCardProps {
  emojiSequence: string;
  roundNumber: number;
  totalRounds: number;
}

// The screen's one focal point (DESIGN.md §3): large, centered, nothing
// competing with it. Entrance/exit between rounds is owned by the parent
// (room-game.tsx), which wraps this alongside RoundTimer in one motion.div
// keyed by round.id — a plain div here avoids animating twice.
export function EmojiCard({ emojiSequence, roundNumber, totalRounds }: EmojiCardProps) {
  return (
    <div className="doodle-card px-6 py-8 text-center">
      <p className="text-sm text-ink-muted">
        Round {roundNumber} of {totalRounds}
      </p>
      <p
        className="mt-3 text-5xl leading-tight tracking-wide sm:text-6xl"
        // The emoji sequence IS the puzzle — read it out as one unit rather
        // than letting a screen reader announce each codepoint's CLDR name
        // in isolation.
        role="img"
        aria-label={`Emoji clue: ${emojiSequence}`}
      >
        {emojiSequence}
      </p>
    </div>
  );
}
