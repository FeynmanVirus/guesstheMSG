"use client";

import { motion } from "motion/react";

interface EmojiCardProps {
  emojiSequence: string;
  roundNumber: number;
  totalRounds: number;
}

// The screen's one focal point (DESIGN.md §3): large, centered, nothing
// competing with it. The card re-mounts per round via a `key` on the parent
// so each new sequence gets its own entrance.
export function EmojiCard({ emojiSequence, roundNumber, totalRounds }: EmojiCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="doodle-card px-6 py-8 text-center"
    >
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
    </motion.div>
  );
}
