// Self-check for the round loop's pure logic. Run with:
//   npx --yes deno@2 test --allow-env --allow-read supabase/functions/_shared/guess.test.deno.ts
//
// The `.deno.ts` suffix keeps this out of Next's typecheck (see tsconfig.json
// "exclude"), so it can import the npm: specifier that profanity.ts uses.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { difficultyScore, normalizeGuess, scoreGuess } from "./guess.ts";
import { containsProfanity } from "./profanity.ts";

Deno.test("normalizeGuess makes casing, punctuation and spacing irrelevant", () => {
  const target = normalizeGuess("the lion king");
  for (const variant of ["The Lion King", "  THE LION KING!  ", "the  lion, king.", "The-Lion-King"]) {
    assertEquals(normalizeGuess(variant), target, variant);
  }

  // Separator-insensitive in both directions — this is the pair that forces
  // separators to be deleted rather than collapsed to a space.
  assertEquals(normalizeGuess("wall-e"), normalizeGuess("Wall E"));
  assertEquals(normalizeGuess("wall-e"), normalizeGuess("walle"));
  assertEquals(normalizeGuess("e.t."), normalizeGuess("ET"));
  assertEquals(normalizeGuess("e.t."), normalizeGuess("e t"));
  assertEquals(normalizeGuess("hot dog"), normalizeGuess("hotdog"));

  // Non-Latin answers must survive rather than normalize to nothing — an
  // answer that normalized to "" would match every punctuation-only guess.
  assertEquals(normalizeGuess("Süßé Crème!"), "süßécrème");
  assertEquals(normalizeGuess("寿司"), "寿司");

  // A guess of only punctuation is empty, and no seeded answer is empty, so
  // it can never be scored as correct.
  assertEquals(normalizeGuess("!!!???"), "");
  for (const answer of SEEDED_ANSWERS) {
    assert(normalizeGuess(answer).length > 0, `answer normalizes to empty: ${answer}`);
  }
});

// difficulty: null -> defaults to medium (200), isFirstCorrect: false, so
// these isolate the time component: total = time + 200.
Deno.test("scoreGuess: the 5-second leeway is full marks, and ends exactly at 5s", () => {
  const started = 1_000_000;
  const score = (elapsedSeconds: number, roundDurationSeconds = 60) =>
    scoreGuess({
      startedAtMs: started,
      nowMs: started + elapsedSeconds * 1000,
      roundDurationSeconds,
      difficulty: null,
      isFirstCorrect: false,
    });

  assertEquals(score(0), 700); // 500 + 200
  assertEquals(score(2.5), 700);
  assertEquals(score(5.0), 700); // the boundary itself is still full marks

  // Just past the boundary must be strictly less — proves the leeway is a
  // closed [0,5] window, not slop that bleeds past 5s.
  assertEquals(score(5.1), 699); // 500*(1-0.1/55) = 499.09.. -> 499 + 200
  assertEquals(score(5.5), 695); // 500*(1-0.5/55) = 495.45.. -> 495 + 200

  // A round row stamped a few ms ahead of the guess clamps elapsed to 0,
  // not negative — must not read as "expired" or throw.
  assertEquals(
    scoreGuess({
      startedAtMs: started,
      nowMs: started - 500,
      roundDurationSeconds: 60,
      difficulty: null,
      isFirstCorrect: false,
    }),
    700,
  );
});

Deno.test("scoreGuess decays across the curve and clamps to 0 (time component) at and past full duration", () => {
  const started = 1_000_000;
  const score = (elapsedSeconds: number, roundDurationSeconds: number) =>
    scoreGuess({
      startedAtMs: started,
      nowMs: started + elapsedSeconds * 1000,
      roundDurationSeconds,
      difficulty: null,
      isFirstCorrect: false,
    });

  // Hand-verified fractional cases — none land near a .5 rounding boundary
  // except the first, which is called out.
  assertEquals(score(10, 60), 655); // 500*(1-5/55) = 454.545.. -> 455 + 200
  assertEquals(score(6, 35), 683); // 500*(1-1/30) = 483.33.. -> 483 + 200
  assertEquals(score(8, 33), 646); // 500*(1-3/28) = 446.43.. -> 446 + 200

  // Zero crossing is at elapsed == roundDurationSeconds (full time used),
  // not at roundDurationSeconds - 5 — the leeway only shortens the *decay*,
  // not the total time available. Difficulty's flat 200 still applies.
  assertEquals(score(60, 60), 200);
  assertEquals(score(61, 60), 200); // past full duration — still floors at difficulty, not negative
  assertEquals(score(100_000, 60), 200);
});

Deno.test("scoreGuess always returns an integer in [200, 700], non-increasing in elapsed time", () => {
  const started = 1_000_000;
  for (const roundDurationSeconds of [30, 60, 90]) {
    let previous = Infinity;
    for (let halfSeconds = 0; halfSeconds <= roundDurationSeconds * 2; halfSeconds++) {
      const elapsed = halfSeconds / 2;
      const s = scoreGuess({
        startedAtMs: started,
        nowMs: started + elapsed * 1000,
        roundDurationSeconds,
        difficulty: null,
        isFirstCorrect: false,
      });
      assert(Number.isInteger(s), `not an integer at n=${roundDurationSeconds}, elapsed=${elapsed}: ${s}`);
      assert(s >= 200 && s <= 700, `out of [200,700] at n=${roundDurationSeconds}, elapsed=${elapsed}: ${s}`);
      assert(s <= previous, `increased at n=${roundDurationSeconds}, elapsed=${elapsed}: ${previous} -> ${s}`);
      previous = s;
    }
  }
});

Deno.test("difficultyScore maps easy/medium/hard, is case-insensitive, and defaults unrated words to medium", () => {
  assertEquals(difficultyScore("easy"), 100);
  assertEquals(difficultyScore("medium"), 200);
  assertEquals(difficultyScore("hard"), 300);
  assertEquals(difficultyScore("Hard"), 300);
  assertEquals(difficultyScore("EASY"), 100);
  assertEquals(difficultyScore(null), 200);
  assertEquals(difficultyScore(undefined), 200);
  assertEquals(difficultyScore(""), 200);
  assertEquals(difficultyScore("legendary"), 200); // unrecognized -> same fallback as unrated
});

Deno.test("scoreGuess adds the flat first-guess bonus only when isFirstCorrect", () => {
  const started = 1_000_000;
  const base = {
    startedAtMs: started,
    nowMs: started + 1000, // well inside the leeway -> time maxes at 500
    roundDurationSeconds: 60,
    difficulty: "medium",
  };
  assertEquals(scoreGuess({ ...base, isFirstCorrect: false }), 700); // 500 + 200
  assertEquals(scoreGuess({ ...base, isFirstCorrect: true }), 900); // 500 + 200 + 200
});

Deno.test("scoreGuess: first guess on a Hard clue within the leeway scores the documented max of 1000", () => {
  const started = 1_000_000;
  assertEquals(
    scoreGuess({
      startedAtMs: started,
      nowMs: started + 3000, // 3s elapsed, inside the 5s leeway
      roundDurationSeconds: 60,
      difficulty: "hard",
      isFirstCorrect: true,
    }),
    1000, // 500 (time) + 300 (hard) + 200 (first)
  );
});

Deno.test("scoreGuess: 1000 is the global ceiling — nothing scores above it", () => {
  const started = 1_000_000;
  for (const roundDurationSeconds of [30, 60, 90]) {
    for (const elapsedSeconds of [0, 1, 5, 10, 30, 60, 90]) {
      for (const difficulty of ["easy", "medium", "hard", null]) {
        for (const isFirstCorrect of [false, true]) {
          const s = scoreGuess({
            startedAtMs: started,
            nowMs: started + elapsedSeconds * 1000,
            roundDurationSeconds,
            difficulty,
            isFirstCorrect,
          });
          assert(s <= 1000, `exceeded 1000: dur=${roundDurationSeconds} elapsed=${elapsedSeconds} diff=${difficulty} first=${isFirstCorrect} -> ${s}`);
        }
      }
    }
  }
});

// Guards the Scunthorpe failure mode: if a bank word tripped the filter,
// submit-guess's ordering already exempts an exact answer match, but the
// *wrong*-guess path would still reject other players typing it. Keeping the
// bank clean means neither path can silently make a round unwinnable.
// Mirrors the answers seeded in 20260818091446_realtime_and_seed.sql and
// 20260819040729_seed_more_words.sql.
const SEEDED_ANSWERS = [
  "the lion king", "spider-man", "frozen", "jaws", "e.t.",
  "star wars", "the matrix", "finding nemo", "harry potter", "shrek",
  "jurassic park", "ghostbusters", "toy story", "titanic", "batman",
  "up", "cars", "wall-e", "willy wonka", "kung fu panda",
  "pizza", "burger", "sushi", "taco", "spaghetti",
  "pancakes", "ice cream", "donut", "salad", "fries",
  "hot dog", "popcorn", "croissant", "ramen", "waffle",
  "sandwich", "cookie", "cheese", "bacon", "chocolate",
  "phone", "key", "glasses", "clock", "backpack",
  "umbrella", "chair", "flashlight", "books", "pencil",
  "broom", "mirror", "hammer", "suitcase", "candle",
  "guitar", "camera", "bicycle", "socks", "toothbrush",
];

Deno.test("no seeded answer trips the profanity filter", () => {
  for (const answer of SEEDED_ANSWERS) {
    assert(!containsProfanity(answer), `bank word rejected by profanity filter: ${answer}`);
  }
});

Deno.test("profanity filter blocks the slur and its obfuscations, and nothing else", () => {
  for (const blocked of ["nigger", "n1gg3r", "n i g g e r", "niiigger", "NIGGA", "n-i-g-g-e-r"]) {
    assert(containsProfanity(blocked), `should be blocked: ${blocked}`);
  }

  // Ordinary swearing is deliberately allowed now (see profanity.ts).
  for (const allowed of ["shit", "fuck", "bastard", "damn", "asshole"]) {
    assert(!containsProfanity(allowed), `should be allowed: ${allowed}`);
  }

  // Upstream's whitelist, kept so real words aren't collateral.
  assert(!containsProfanity("snigger"));
  assert(!containsProfanity("Nigel"));
});
