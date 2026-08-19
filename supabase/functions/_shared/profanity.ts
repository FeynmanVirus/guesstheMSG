// Profanity filter — DESIGN.md §5: chat messages, room names, and custom
// word submissions (both the emoji-sequence label and the answer text).
// Also applied to display names (the reconnect-scope decision made when
// this phase was planned — DESIGN.md only lists the other three, but an
// unfiltered display name is visible to the whole room for the entire game,
// the same exposure as a room name).
//
// SCOPE (deliberately narrow): this blocks exactly one slur. Ordinary
// swearing is allowed — it's a party game among friends, and a broad filter
// mostly produces false positives on people's names and legitimate guesses.
//
// `obscenity`: TS-native, dual ESM/CJS, ships obfuscation/leetspeak
// transformers, resolves cleanly via `npm:obscenity` in Deno. Chosen over
// `bad-words`/`leo-profanity` (CJS-first, unmaintained, no obfuscation
// handling). We keep it rather than hand-rolling a regex precisely because
// the transformer pipeline is the load-bearing part: it's what catches
// `n1gg3r`, `n i g g e r`, and `niiigger` without enumerating variants.
import {
  DataSet,
  RegExpMatcher,
  englishRecommendedTransformers,
  pattern,
} from "obscenity";

// Patterns and the `snigger` whitelist are copied verbatim from obscenity's
// own englishDataset entry, so narrowing the filter doesn't also mean
// regressing to a worse-tuned pattern than upstream's.
const dataset = new DataSet<{ originalWord: string }>().addPhrase((phrase) =>
  phrase
    .setMetadata({ originalWord: "nigger" })
    .addPattern(pattern`n[i]gger`)
    .addPattern(pattern`n[i]gga`)
    .addPattern(pattern`|nig|`)
    .addPattern(pattern`|nigs|`)
    .addWhitelistedTerm("snigger")
);

const matcher = new RegExpMatcher({
  ...dataset.build(),
  ...englishRecommendedTransformers,
});

export function containsProfanity(value: string): boolean {
  // Two passes. obscenity's recommended transformers resolve leetspeak and
  // collapse repeats, but they do not skip separators for blacklist
  // matching, so "n i g g e r" and "n-i-g-g-e-r" slip through a single pass.
  // The second pass re-tests with every non-alphanumeric character removed,
  // which is exactly the normalizeGuess() form.
  //
  // Order matters: the raw pass runs first so the whitelist still applies to
  // genuinely-spaced text. Stripping alone would turn "s nigger" into the
  // whitelisted "snigger" — the raw pass catches that one before we get here.
  if (matcher.hasMatch(value)) return true;

  const stripped = value.replace(/[^\p{L}\p{N}]/gu, "");
  return stripped !== value && matcher.hasMatch(stripped);
}
