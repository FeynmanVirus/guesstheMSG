// Profanity filter — DESIGN.md §5: chat messages, room names, and custom
// word submissions (both the emoji-sequence label and the answer text).
// Also applied to display names (the reconnect-scope decision made when
// this phase was planned — DESIGN.md only lists the other three, but an
// unfiltered display name is visible to the whole room for the entire game,
// the same exposure as a room name).
//
// `obscenity`: TS-native, dual ESM/CJS, ships obfuscation/leetspeak
// transformers, resolves cleanly via `npm:obscenity` in Deno. Chosen over
// `bad-words`/`leo-profanity` (CJS-first, unmaintained, no obfuscation
// handling).
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity";

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

export function containsProfanity(value: string): boolean {
  return matcher.hasMatch(value);
}
