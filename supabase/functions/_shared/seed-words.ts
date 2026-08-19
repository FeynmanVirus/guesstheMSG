// Test-only fixture: emoji_sequence -> answer for every word the seed
// migrations insert (20260818091446_realtime_and_seed.sql,
// 20260819040729_seed_more_words.sql). No Edge Function imports this at
// runtime — `words.answer` is never client-readable by design (CLAUDE.md
// rule 1), so integration tests that need to submit a *correct* guess have
// nowhere else to get the answer from. This mirrors the seed data verbatim;
// it is not a live secret, the same way guess.test.deno.ts's own
// SEEDED_ANSWERS list isn't — both are copies of what's already sitting in
// a committed migration file. Keep in sync by hand if the seed data changes.

export const SEED_WORDS: Record<string, string> = {
  "🦁👑": "the lion king",
  "🕷️👨": "spider-man",
  "⛄👸❄️": "frozen",
  "🦈🌊": "jaws",
  "👽🚲🌕": "e.t.",
  "🍕": "pizza",
  "🍔": "burger",
  "🍣": "sushi",
  "🌮": "taco",
  "🍝": "spaghetti",
  "📱": "phone",
  "🔑": "key",
  "👓": "glasses",
  "⏰": "clock",
  "🎒": "backpack",

  "⭐⚔️": "star wars",
  "🕶️💊": "the matrix",
  "🐠🔍": "finding nemo",
  "🧙⚡👓": "harry potter",
  "👹🧅": "shrek",
  "🦖🏝️": "jurassic park",
  "👻🔫": "ghostbusters",
  "🤠🚀🧸": "toy story",
  "🚢🧊💔": "titanic",
  "🦇🃏": "batman",
  "🏠🎈👴": "up",
  "🚗⚡🏁": "cars",
  "🤖❤️🌱": "wall-e",
  "🎩🍫🏭": "willy wonka",
  "🐼🥋": "kung fu panda",

  "🥞": "pancakes",
  "🍦": "ice cream",
  "🍩": "donut",
  "🥗": "salad",
  "🍟": "fries",
  "🌭": "hot dog",
  "🍿": "popcorn",
  "🥐": "croissant",
  "🍜": "ramen",
  "🧇": "waffle",
  "🥪": "sandwich",
  "🍪": "cookie",
  "🧀": "cheese",
  "🥓": "bacon",
  "🍫": "chocolate",

  "☂️": "umbrella",
  "🪑": "chair",
  "🔦": "flashlight",
  "📚": "books",
  "✏️": "pencil",
  "🧹": "broom",
  "🪞": "mirror",
  "🔨": "hammer",
  "🧳": "suitcase",
  "🕯️": "candle",
  "🎸": "guitar",
  "📷": "camera",
  "🚲": "bicycle",
  "🧦": "socks",
  "🪥": "toothbrush",
};

/** Throws rather than returning undefined — a test that can't find the
 * answer for an on-screen emoji sequence has a stale fixture, and silently
 * guessing wrong would fail confusingly three steps later instead of here. */
export function answerFor(emojiSequence: string): string {
  const answer = SEED_WORDS[emojiSequence];
  if (!answer) {
    throw new Error(
      `seed-words fixture has no answer for "${emojiSequence}" — the seed migrations changed and this file needs updating.`,
    );
  }
  return answer;
}

/** `words.difficulty` mirrored the same way SEED_WORDS mirrors `answer` —
 * not a runtime secret (only `answer` is RLS-hidden from clients), just data
 * a test can't otherwise read back without a service-role key. Every seeded
 * word today is 'easy' or 'medium'; no 'hard' rows exist yet. Keep in sync
 * by hand alongside SEED_WORDS if the seed data changes. */
export const SEED_WORD_DIFFICULTY: Record<string, "easy" | "medium" | "hard"> = {
  "🦁👑": "easy",
  "🕷️👨": "easy",
  "⛄👸❄️": "easy",
  "🦈🌊": "medium",
  "👽🚲🌕": "medium",
  "🍕": "easy",
  "🍔": "easy",
  "🍣": "easy",
  "🌮": "easy",
  "🍝": "medium",
  "📱": "easy",
  "🔑": "easy",
  "👓": "easy",
  "⏰": "easy",
  "🎒": "medium",

  "⭐⚔️": "easy",
  "🕶️💊": "medium",
  "🐠🔍": "easy",
  "🧙⚡👓": "easy",
  "👹🧅": "medium",
  "🦖🏝️": "easy",
  "👻🔫": "medium",
  "🤠🚀🧸": "easy",
  "🚢🧊💔": "easy",
  "🦇🃏": "easy",
  "🏠🎈👴": "medium",
  "🚗⚡🏁": "easy",
  "🤖❤️🌱": "medium",
  "🎩🍫🏭": "medium",
  "🐼🥋": "easy",

  "🥞": "easy",
  "🍦": "easy",
  "🍩": "easy",
  "🥗": "easy",
  "🍟": "easy",
  "🌭": "easy",
  "🍿": "easy",
  "🥐": "medium",
  "🍜": "easy",
  "🧇": "easy",
  "🥪": "easy",
  "🍪": "easy",
  "🧀": "easy",
  "🥓": "easy",
  "🍫": "easy",

  "☂️": "easy",
  "🪑": "easy",
  "🔦": "medium",
  "📚": "easy",
  "✏️": "easy",
  "🧹": "easy",
  "🪞": "easy",
  "🔨": "easy",
  "🧳": "medium",
  "🕯️": "easy",
  "🎸": "easy",
  "📷": "easy",
  "🚲": "easy",
  "🧦": "easy",
  "🪥": "medium",
};

/** Throws for the same reason answerFor does — a stale fixture should fail
 * loudly at the lookup, not produce a silently wrong expected score. */
export function difficultyFor(emojiSequence: string): "easy" | "medium" | "hard" {
  const difficulty = SEED_WORD_DIFFICULTY[emojiSequence];
  if (!difficulty) {
    throw new Error(
      `seed-words fixture has no difficulty for "${emojiSequence}" — the seed migrations changed and this file needs updating.`,
    );
  }
  return difficulty;
}
