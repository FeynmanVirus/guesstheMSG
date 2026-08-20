// Guess normalization + scoring. Pure, no I/O — CLAUDE.md puts this class
// of logic in a unit-testable module rather than inline in the Edge
// Function, and ARCHITECTURE.md §15 makes _shared/ its canonical home.
//
// Both halves are server-only in practice (submit-guess is the sole caller
// that sees an answer), but the module itself has no Deno dependency so the
// client can import the types if it ever needs them.

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
 * A leading article ("the"/"a"/"an") is stripped too, before separators are
 * removed — this has to happen first, since once "the lion king" collapses
 * to "thelionking" there's no word boundary left to anchor a strip against.
 * Applied identically to both sides, so the *answer* "the lion king" also
 * loses its "the" and still matches a guess of "Lion King" as well as "The
 * Lion King". Anchored to the very start only (never mid-string), and the
 * trailing boundary is any non-letter/digit character, not just whitespace
 * — "The-Lion-King" separates with hyphens, not spaces, and still needs to
 * strip. Requiring *some* boundary (not just "starts with those letters")
 * is what keeps this from misfiring on "another" or "these".
 *
 * Uses Unicode property escapes so non-Latin answers keep their characters
 * instead of normalizing to an empty string (which would make every wrong
 * guess "correct" against them). */
export function normalizeGuess(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/^\s*(the|an?)[^\p{L}\p{N}]+/u, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** 5-second grace window: any correct guess landing at or before this still
 * scores the max time component. Fixed, not host-tunable — see the
 * formula's own comment below for why. */
export const TIME_LEEWAY_SECONDS = 5;

/** Top of the time component, awarded to anything inside the leeway window. */
export const MAX_TIME_SCORE = 500;

/** Flat bonus for the room's first correct guesser this round — not "this
 * player's first attempt" (the guess box is also the chat box, so attempt
 * count isn't a fair signal — see the deleted decay-formula comment this
 * replaced), but literally the first player in the whole room to answer
 * correctly. */
export const FIRST_GUESS_BONUS = 200;

/** `words.difficulty` -> points. Free-text column, no CHECK constraint, so
 * lookups go through difficultyScore() below rather than indexing this
 * directly — that's where the case-normalizing and the unrated-word
 * fallback live. */
export const DIFFICULTY_SCORES: Record<string, number> = {
  easy: 100,
  medium: 200,
  hard: 300,
};

/** Custom words (create-room/restart-room's host-typed emoji:answer pairs)
 * carry no difficulty rating at all — there's no picker for it in that UI.
 * Falling back to medium splits the difference rather than systematically
 * under- or over-rewarding every custom round relative to a rated one. */
const DEFAULT_DIFFICULTY_SCORE = DIFFICULTY_SCORES.medium;

export function difficultyScore(difficulty: string | null | undefined): number {
  if (!difficulty) return DEFAULT_DIFFICULTY_SCORE;
  return DIFFICULTY_SCORES[difficulty.toLowerCase()] ?? DEFAULT_DIFFICULTY_SCORE;
}

export interface ScoreGuessOptions {
  /** rounds.started_at as epoch ms — the server's clock, never the client's. */
  startedAtMs: number;
  /** Server receipt time as epoch ms. */
  nowMs: number;
  /** (rounds.ends_at - rounds.started_at) / 1000 — read from the round row
   * itself rather than re-clamping room.settings.seconds_per_round, so a
   * host changing the bounds mid-game (or a future bounds change entirely)
   * can never retroactively change what an in-flight round is worth. */
  roundDurationSeconds: number;
  /** words.difficulty for the round's word — see difficultyScore(). */
  difficulty: string | null | undefined;
  /** Whether THIS guess is the room's first correct one this round —
   * decided by submit-guess via an atomic claim on
   * rounds.first_correct_player_id, not by this function. Deliberately not
   * "this player's first guess": the guess box is also the chat box, so a
   * per-player attempt count isn't a fair signal to score on. */
  isFirstCorrect: boolean;
}

/** total = time + difficulty + first-guess bonus.
 *
 *   time:  elapsed <= 5s  -> 500 (flat)
 *          elapsed  > 5s  -> max(0, 500 * (1 - (elapsed-5) / (roundDurationSeconds-5)))
 *   difficulty: 100 / 200 / 300 for easy / medium / hard (difficultyScore())
 *   bonus: +200 if isFirstCorrect, else 0
 *
 * Max possible is 500 + 300 + 200 = 1000 — a first-guess on a Hard clue
 * inside the leeway window. The two time branches agree at the boundary
 * (elapsed=5 gives 500 either way), so there's no discontinuity there —
 * the leeway just short-circuits the algebra for a flat top rather than
 * letting it decay across those first 5 seconds.
 *
 * Rounded once, at the end: difficulty and the bonus are already integers,
 * and round(x + n) === round(x) + n for any integer n, so submit-guess is
 * free to compute this once with isFirstCorrect: false for the value it
 * inserts, then — once the atomic claim above resolves — either leave that
 * value alone or add exactly FIRST_GUESS_BONUS to it, without the two ever
 * disagreeing with what a single call to this function would have produced. */
export function scoreGuess(opts: ScoreGuessOptions): number {
  const { startedAtMs, nowMs, roundDurationSeconds, difficulty, isFirstCorrect } = opts;

  // Guard against a negative elapsed time: a round row written a few ms in
  // the future by clock granularity would otherwise award above max.
  const elapsed = Math.max(0, (nowMs - startedAtMs) / 1000);

  const time =
    elapsed <= TIME_LEEWAY_SECONDS
      ? MAX_TIME_SCORE
      : Math.max(
          0,
          MAX_TIME_SCORE * (1 - (elapsed - TIME_LEEWAY_SECONDS) / (roundDurationSeconds - TIME_LEEWAY_SECONDS)),
        );
  // No upper clamp needed on the decay branch — see guess.test.deno.ts's
  // monotonicity sweep for why (same reasoning as the single-term version
  // this replaced, just at a 500 ceiling instead of 1000).

  return Math.round(time) + difficultyScore(difficulty) + (isFirstCorrect ? FIRST_GUESS_BONUS : 0);
}
