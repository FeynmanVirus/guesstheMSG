// Guess normalization + scoring. Pure, no I/O — CLAUDE.md puts this class
// of logic in a unit-testable module rather than inline in the Edge
// Function, and ARCHITECTURE.md §15 makes _shared/ its canonical home.
//
// Both halves are server-only in practice (submit-guess is the sole caller
// that sees an answer), but the module itself has no Deno dependency so the
// client can import the types if it ever needs them.

import type { DEFAULT_SCORING } from "./settings.ts";

/** Trim, lowercase, strip punctuation — the normalization CLAUDE.md rule 2
 * specifies. Applied to *both* sides of the comparison, never for display.
 *
 * Whitespace is stripped along with punctuation rather than collapsed to a
 * single space. Collapsing looks tidier but can't satisfy both halves of the
 * bank at once: turning separators into spaces makes "The-Lion-King" match
 * but breaks 'e.t.' against "ET", and deleting them outright does the
 * reverse. Removing separators entirely is the only rule under which every
 * spelling of every seeded answer converges —
 *
 *   "The-Lion-King" / "the lion king"  -> thelionking
 *   'wall-e' / "Wall E" / "walle"      -> walle
 *   'e.t.' / "ET" / "e t"              -> et
 *   'hot dog' / "hotdog"               -> hotdog
 *
 * — and it's strictly more forgiving, which is the right bias for a party
 * game where a near-miss on spacing shouldn't cost a round.
 *
 * Uses Unicode property escapes so non-Latin answers keep their characters
 * instead of normalizing to an empty string (which would make every wrong
 * guess "correct" against them). */
export function normalizeGuess(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

export interface ScoreGuessOptions {
  /** rounds.started_at as epoch ms — the server's clock, never the client's. */
  startedAtMs: number;
  /** Server receipt time as epoch ms. */
  nowMs: number;
  /** rooms.settings.scoring, so the formula is tunable per room without a
   * code change (ARCHITECTURE.md §7). */
  scoring: typeof DEFAULT_SCORING;
  isFirstCorrect: boolean;
}

/** ARCHITECTURE.md §7: base points decay with elapsed time down to a floor,
 * plus a flat bonus for the first correct guesser.
 *
 *   max(min_points, base_points - decay_per_second * floor(elapsed)) + bonus?
 *
 * Elapsed is floored so the value is stable within a second — two players
 * answering 40ms apart in the same second score identically, and only the
 * first-guess bonus separates them. */
export function scoreGuess(opts: ScoreGuessOptions): number {
  const { startedAtMs, nowMs, scoring, isFirstCorrect } = opts;

  // Guard against a negative elapsed time: a round row written a few ms in
  // the future by clock granularity would otherwise award above base.
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));

  const decayed = scoring.base_points - scoring.decay_per_second * elapsedSeconds;
  const points = Math.max(scoring.min_points, decayed);

  return points + (isFirstCorrect ? scoring.first_guess_bonus : 0);
}
