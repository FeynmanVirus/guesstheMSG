// Self-check for the round loop's pure logic. Run with:
//   npx --yes deno@2 test --allow-env --allow-read supabase/functions/_shared/guess.test.deno.ts
//
// The `.deno.ts` suffix keeps this out of Next's typecheck (see tsconfig.json
// "exclude"), so it can import the npm: specifier that profanity.ts uses.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { normalizeGuess, scoreGuess } from "./guess.ts";
import { DEFAULT_SCORING } from "./settings.ts";
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

Deno.test("scoreGuess decays per second and floors at min_points", () => {
  const started = 1_000_000;
  const at = (s: number) =>
    scoreGuess({
      startedAtMs: started,
      nowMs: started + s * 1000,
      scoring: DEFAULT_SCORING,
      isFirstCorrect: false,
    });

  assertEquals(at(0), DEFAULT_SCORING.base_points); // 100
  assertEquals(at(1), 95);
  assertEquals(at(10), 50);

  // 100 - 5*16 = 20 is the floor; everything past it stays there, and a
  // long round never produces negative points (players.score has a
  // `check (score >= 0)` constraint that this must not violate).
  assertEquals(at(16), DEFAULT_SCORING.min_points);
  assertEquals(at(60), DEFAULT_SCORING.min_points);
  assertEquals(at(100_000), DEFAULT_SCORING.min_points);

  // Sub-second precision is floored, so two players in the same second tie
  // on decay and are separated only by the first-guess bonus.
  assertEquals(at(3), scoreGuess({
    startedAtMs: started,
    nowMs: started + 3999,
    scoring: DEFAULT_SCORING,
    isFirstCorrect: false,
  }));

  // A round row stamped a few ms ahead of the guess must not award above base.
  assertEquals(
    scoreGuess({ startedAtMs: started, nowMs: started - 500, scoring: DEFAULT_SCORING, isFirstCorrect: false }),
    DEFAULT_SCORING.base_points,
  );
});

Deno.test("scoreGuess adds the first-correct bonus on top of the decayed value", () => {
  const started = 1_000_000;
  const opts = { startedAtMs: started, nowMs: started + 4000, scoring: DEFAULT_SCORING };

  assertEquals(scoreGuess({ ...opts, isFirstCorrect: false }), 80);
  assertEquals(scoreGuess({ ...opts, isFirstCorrect: true }), 80 + DEFAULT_SCORING.first_guess_bonus);

  // The bonus applies at the floor too, so being first is always worth more.
  const late = { startedAtMs: started, nowMs: started + 300_000, scoring: DEFAULT_SCORING };
  assert(scoreGuess({ ...late, isFirstCorrect: true }) > scoreGuess({ ...late, isFirstCorrect: false }));
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
