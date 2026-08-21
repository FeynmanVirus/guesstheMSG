// Progressive letter-hint mask. Pure, no I/O — same convention as guess.ts:
// CLAUDE.md puts this class of logic in a unit-testable module rather than
// inline in the Edge Function.
//
// Hard constraint (CLAUDE.md rule 1): the answer must never be readable by
// the client before reveal. This module is called fresh, server-side, on
// every round-tick request — it recomputes "which letters are currently
// revealed" from the real answer and the caller's now(), and returns only
// a mask. Nothing it produces is ever persisted or broadcast; round-tick
// hands the mask back in the one HTTP response that request gets, the same
// per-client pipe every member already polls (see use-round-tick.ts).

/** First hint (if any) is due this many seconds into the round. */
export const HINT_START_SECONDS = 15;

/** The last hint is due at this fraction of the round's total duration, so
 * it never lands with no time left to use it. SETTINGS_BOUNDS's minimum
 * round length (30s) keeps this comfortably after HINT_START_SECONDS for
 * every legal round length. */
export const HINT_WINDOW_FRACTION = 0.85;

const ALNUM = /[\p{L}\p{N}]/u;

function isAlnum(ch: string): boolean {
  return ALNUM.test(ch);
}

/** Space-delimited words, each as the ordered list of its alphanumeric
 * character indices into the original string. Punctuation (apostrophes,
 * hyphens) stays inside the word it's attached to rather than splitting it
 * — "can't" is one word, not two. A word with zero alphanumeric characters
 * (shouldn't happen for a real answer) contributes an empty array. */
function splitWords(answer: string): number[][] {
  const words: number[][] = [];
  let current: number[] = [];
  let inWord = false;
  for (let i = 0; i < answer.length; i++) {
    const ch = answer[i];
    if (/\s/.test(ch)) {
      if (inWord) words.push(current);
      current = [];
      inWord = false;
      continue;
    }
    inWord = true;
    if (isAlnum(ch)) current.push(i);
  }
  if (inWord) words.push(current);
  return words;
}

/** Every alphanumeric index EXCEPT each word's first — a word's opening
 * letter is too strong a single hint and is never a candidate for reveal,
 * so it stays blank in the mask for the whole live round. */
function eligibleIndices(answer: string): number[] {
  const indices: number[] = [];
  for (const word of splitWords(answer)) {
    for (let i = 1; i < word.length; i++) indices.push(word[i]);
  }
  return indices;
}

// FNV-1a — small, dependency-free, and only needs to be a stable hash, not
// cryptographic. Used purely to order eligible positions deterministically.
function fnv1a(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** How many letters this answer will ever have revealed, total, this round.
 * Tiers (confirmed): single word <4 letters -> 1; single word >=4 letters
 * -> 2; 2+ words (any combined length) -> 3. Then clamped to
 * `eligible.length - 1` so at least one non-first letter always stays
 * blank even for a short word ("up" -> 0 reveals, "cat" -> 1). */
export function maxReveals(answer: string): number {
  const words = splitWords(answer).filter((w) => w.length > 0);
  const eligible = eligibleIndices(answer);

  let tier: number;
  if (words.length >= 2) {
    tier = 3;
  } else {
    const letters = words[0]?.length ?? 0;
    tier = letters < 4 ? 1 : 2;
  }

  return Math.min(tier, Math.max(0, eligible.length - 1));
}

/** Eligible positions in the deterministic order they'll be revealed in,
 * seeded by the round id (not Math.random()) so a mid-round refresh shows
 * the same letters instead of re-rolling them. */
export function revealOrder(answer: string, roundId: string): number[] {
  return eligibleIndices(answer)
    .map((i) => ({ i, h: fnv1a(`${roundId}:${i}`) }))
    .sort((a, b) => a.h - b.h || a.i - b.i)
    .map((entry) => entry.i);
}

export interface HintState {
  /** The answer with every not-yet-revealed alphanumeric character
   * replaced by `_`. Spaces and punctuation pass through unchanged. */
  mask: string;
  /** ISO timestamp of the next reveal, or null once every reveal for this
   * round has already fired. */
  nextRevealAt: string | null;
}

/** The mask as of `nowMs`, recomputed from scratch every call — nothing
 * here is stateful or cached across requests. */
export function hintState(
  answer: string,
  roundId: string,
  startedAtMs: number,
  endsAtMs: number,
  nowMs: number,
): HintState {
  const n = maxReveals(answer);
  const order = revealOrder(answer, roundId);

  const times: number[] = [];
  if (n > 0) {
    const startAt = startedAtMs + HINT_START_SECONDS * 1000;
    const windowEnd = startedAtMs + (endsAtMs - startedAtMs) * HINT_WINDOW_FRACTION;
    const step = n === 1 ? 0 : (windowEnd - startAt) / (n - 1);
    for (let k = 0; k < n; k++) times.push(startAt + step * k);
  }

  let revealedCount = 0;
  let nextRevealAt: string | null = null;
  for (const t of times) {
    if (nowMs >= t) {
      revealedCount++;
    } else {
      nextRevealAt = new Date(t).toISOString();
      break;
    }
  }

  const revealed = new Set(order.slice(0, revealedCount));
  const mask = Array.from(answer)
    .map((ch, i) => (isAlnum(ch) ? (revealed.has(i) ? ch : "_") : ch))
    .join("");

  return { mask, nextRevealAt };
}
