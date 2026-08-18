// Parses the "emoji-sequence: answer" custom-words textarea (DESIGN.md
// §2.2: "free-text entry, `emoji_sequence: answer` pairs separated by
// commas"). Split on comma OR newline — an answer could plausibly contain a
// comma, but hosts pasting line-by-line lists is at least as likely, and
// there's no quoting syntax specified, so this is a deliberate, documented
// limitation rather than an attempt at a full grammar.

export interface CustomWordPair {
  emojiSequence: string;
  answer: string;
}

export interface ParseError {
  index: number;
  reason: string;
}

export interface ParseResult {
  pairs: CustomWordPair[];
  errors: ParseError[];
}

const MAX_PAIRS = 50;
const MAX_EMOJI_LENGTH = 24;
const MAX_ANSWER_LENGTH = 48;

// Loosely require the emoji side to actually contain a pictographic
// character and no letters/digits — otherwise a host could type the answer
// as its own clue and the word becomes unplayable.
const HAS_PICTOGRAPH = /\p{Extended_Pictographic}/u;
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

export function parseCustomWords(raw: string | null | undefined): ParseResult {
  const pairs: CustomWordPair[] = [];
  const errors: ParseError[] = [];
  const seenAnswers = new Set<string>();

  if (!raw || !raw.trim()) {
    return { pairs, errors };
  }

  const segments = raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  segments.forEach((segment, index) => {
    if (pairs.length >= MAX_PAIRS) {
      if (errors.length === 0 || errors[errors.length - 1].reason !== "too many pairs") {
        errors.push({ index, reason: "too many pairs" });
      }
      return;
    }

    const colonIndex = segment.indexOf(":");
    if (colonIndex === -1) {
      errors.push({ index, reason: `missing ":" in "${segment}"` });
      return;
    }

    const emojiSequence = segment.slice(0, colonIndex).trim();
    const answer = segment.slice(colonIndex + 1).trim().toLowerCase();

    if (!emojiSequence) {
      errors.push({ index, reason: "empty emoji sequence" });
      return;
    }
    if (!answer) {
      errors.push({ index, reason: "empty answer" });
      return;
    }
    if (emojiSequence.length > MAX_EMOJI_LENGTH) {
      errors.push({ index, reason: `emoji sequence longer than ${MAX_EMOJI_LENGTH} characters` });
      return;
    }
    if (answer.length > MAX_ANSWER_LENGTH) {
      errors.push({ index, reason: `answer longer than ${MAX_ANSWER_LENGTH} characters` });
      return;
    }
    if (!HAS_PICTOGRAPH.test(emojiSequence) || HAS_LETTER_OR_DIGIT.test(emojiSequence)) {
      errors.push({ index, reason: "emoji sequence must be emoji only, no letters/numbers" });
      return;
    }
    if (seenAnswers.has(answer)) {
      errors.push({ index, reason: `duplicate answer "${answer}"` });
      return;
    }

    seenAnswers.add(answer);
    pairs.push({ emojiSequence, answer });
  });

  return { pairs, errors };
}
