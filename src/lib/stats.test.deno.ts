// Self-check for the end-of-game stats aggregation. Run with:
//   npx --yes deno@2 test src/lib/stats.test.deno.ts
//
// stats.ts has zero imports, so no permission flags are needed.

import { assertEquals } from "jsr:@std/assert@1";
import { computeStats, type StatsRound } from "./stats.ts";

const A = "player-a";
const B = "player-b";
const C = "player-c";

Deno.test("computeStats: fastest average, most correct, and MVP each pick the right player", () => {
  // Round 1: A solves fast (2s, 900pts), B solves slower (8s, 500pts). C misses.
  // Round 2: A solves slow (20s, 200pts), B solves fast (1s, 950pts). C misses.
  // Round 3: B solves (3s, 850pts). Nobody else does.
  //
  // Expected: A has 2 correct (avg (2+20)/2 = 11s), B has 3 correct
  // (avg (8+1+3)/3 = 4s) — B is both fastest-average and most-correct.
  // Round wins: round1 -> A (900>500), round2 -> B (950>200), round3 -> B
  // (only solver) — B is MVP with 2 rounds won.
  const rounds: StatsRound[] = [
    {
      roundNumber: 1,
      answer: "pizza",
      startedAtMs: 0,
      guesses: [
        { playerId: A, isCorrect: true, points: 900, submittedAtMs: 2_000 },
        { playerId: B, isCorrect: true, points: 500, submittedAtMs: 8_000 },
      ],
    },
    {
      roundNumber: 2,
      answer: "sushi",
      startedAtMs: 100_000,
      guesses: [
        { playerId: A, isCorrect: true, points: 200, submittedAtMs: 100_000 + 20_000 },
        { playerId: B, isCorrect: true, points: 950, submittedAtMs: 100_000 + 1_000 },
      ],
    },
    {
      roundNumber: 3,
      answer: "taco",
      startedAtMs: 200_000,
      guesses: [
        { playerId: B, isCorrect: true, points: 850, submittedAtMs: 200_000 + 3_000 },
        { playerId: C, isCorrect: false, points: 0, submittedAtMs: 200_000 + 4_000 },
      ],
    },
  ];

  const stats = computeStats(rounds);

  // B's three correct guesses were 8s, 1s, 3s — average 4s, best (fastest
  // single) 1s.
  assertEquals(stats.fastestAverage, { playerId: B, seconds: 4, bestSeconds: 1 });
  assertEquals(stats.mostCorrect, { playerId: B, count: 3 });
  assertEquals(stats.mvp, { playerId: B, roundsWon: 2 });

  // A and C never miss when they guess (2/2 and 0 attempts respectively —
  // C never guessed in this fixture), so A is highest accuracy at 100%,
  // tie-broken over B (also 100%, but 3/3) by lower player id.
  assertEquals(stats.highestAccuracy, { playerId: A, correct: 2, attempts: 2, pct: 100 });

  // B ranks 2nd after round 1 (500 < A's 900), climbs to 1st by round 2 and
  // stays there — a real one-spot comeback, the biggest of the three.
  assertEquals(stats.phoenix, { playerId: B, fromRank: 2, toRank: 1 });

  assertEquals(stats.hardest, stats.rounds[2]);

  assertEquals(stats.rounds.length, 3);
  assertEquals(stats.rounds[0].solvers, 2);
  assertEquals(stats.rounds[0].best, { playerId: A, points: 900, seconds: 2 });
  assertEquals(stats.rounds[2].solvers, 1);
  assertEquals(stats.rounds[2].best, { playerId: B, points: 850, seconds: 3 });
});

Deno.test("computeStats: highest accuracy picks the best hit rate, not the most attempts", () => {
  // A: 1 guess, 1 correct -> 100%. B: 4 guesses, 3 correct -> 75%.
  const rounds: StatsRound[] = [
    {
      roundNumber: 1,
      answer: "pizza",
      startedAtMs: 0,
      guesses: [
        { playerId: A, isCorrect: true, points: 500, submittedAtMs: 1_000 },
        { playerId: B, isCorrect: false, points: 0, submittedAtMs: 1_000 },
        { playerId: B, isCorrect: true, points: 400, submittedAtMs: 2_000 },
      ],
    },
    {
      roundNumber: 2,
      answer: "sushi",
      startedAtMs: 10_000,
      guesses: [
        { playerId: B, isCorrect: false, points: 0, submittedAtMs: 10_500 },
        { playerId: B, isCorrect: true, points: 300, submittedAtMs: 11_000 },
      ],
    },
  ];

  const stats = computeStats(rounds);
  assertEquals(stats.highestAccuracy, { playerId: A, correct: 1, attempts: 1, pct: 100 });
});

Deno.test("computeStats: the Phoenix climbs from dead last to the win", () => {
  // Round 1: B and C both solve, A misses -> A tied last (rank 3).
  // Round 2: A solves big, B and C don't -> A takes the lead (rank 1).
  const rounds: StatsRound[] = [
    {
      roundNumber: 1,
      answer: "pizza",
      startedAtMs: 0,
      guesses: [
        { playerId: A, isCorrect: false, points: 0, submittedAtMs: 1_000 },
        { playerId: B, isCorrect: true, points: 300, submittedAtMs: 1_000 },
        { playerId: C, isCorrect: true, points: 200, submittedAtMs: 1_000 },
      ],
    },
    {
      roundNumber: 2,
      answer: "sushi",
      startedAtMs: 10_000,
      guesses: [{ playerId: A, isCorrect: true, points: 1_000, submittedAtMs: 11_000 }],
    },
  ];

  const stats = computeStats(rounds);
  // A: tied-last rank 3 after round 1 (0 points, same as nobody), rank 1
  // after round 2 (1000 vs B/C's unchanged 300/200) — a 2-spot climb.
  assertEquals(stats.phoenix, { playerId: A, fromRank: 3, toRank: 1 });
});

Deno.test("computeStats: hardest round is the one with the fewest solvers, earliest on a tie", () => {
  const rounds: StatsRound[] = [
    {
      roundNumber: 1,
      answer: "pizza",
      startedAtMs: 0,
      guesses: [{ playerId: A, isCorrect: true, points: 500, submittedAtMs: 1_000 }],
    },
    {
      roundNumber: 2,
      answer: "sushi",
      startedAtMs: 10_000,
      guesses: [{ playerId: A, isCorrect: false, points: 0, submittedAtMs: 10_500 }],
    },
    {
      roundNumber: 3,
      answer: "taco",
      startedAtMs: 20_000,
      guesses: [{ playerId: B, isCorrect: false, points: 0, submittedAtMs: 20_500 }],
    },
  ];

  const stats = computeStats(rounds);
  assertEquals(stats.hardest?.roundNumber, 2);
  assertEquals(stats.hardest?.solvers, 0);
});

Deno.test("computeStats: a round's best is tie-broken by earliest submission on equal points", () => {
  const rounds: StatsRound[] = [
    {
      roundNumber: 1,
      answer: "burger",
      startedAtMs: 0,
      guesses: [
        { playerId: A, isCorrect: true, points: 700, submittedAtMs: 5_000 },
        { playerId: B, isCorrect: true, points: 700, submittedAtMs: 3_000 }, // same points, earlier
      ],
    },
  ];

  const stats = computeStats(rounds);
  assertEquals(stats.rounds[0].best, { playerId: B, points: 700, seconds: 3 });
});

Deno.test("computeStats: an empty game reports all-null headline stats and no rounds", () => {
  const stats = computeStats([]);
  assertEquals(stats.fastestAverage, null);
  assertEquals(stats.mostCorrect, null);
  assertEquals(stats.mvp, null);
  assertEquals(stats.highestAccuracy, null);
  assertEquals(stats.phoenix, null);
  assertEquals(stats.hardest, null);
  assertEquals(stats.rounds, []);
});

Deno.test("computeStats: a round nobody solved reports zero solvers and a null best", () => {
  const rounds: StatsRound[] = [
    {
      roundNumber: 1,
      answer: "waffle",
      startedAtMs: 0,
      guesses: [{ playerId: A, isCorrect: false, points: 0, submittedAtMs: 1_000 }],
    },
  ];

  const stats = computeStats(rounds);
  assertEquals(stats.rounds, [{ roundNumber: 1, answer: "waffle", solvers: 0, best: null }]);
  // Nobody has a correct guess anywhere in the game — every headline stat
  // that requires one (not just this round's `best`) must stay null, not
  // default to player A.
  assertEquals(stats.fastestAverage, null);
  assertEquals(stats.mostCorrect, null);
  assertEquals(stats.mvp, null);
  // A still attempted, though — 0/1 is a real (if bleak) accuracy figure,
  // and A's rank never moved (solo game), so no phoenix climb either.
  assertEquals(stats.highestAccuracy, { playerId: A, correct: 0, attempts: 1, pct: 0 });
  assertEquals(stats.phoenix, null);
  assertEquals(stats.hardest, stats.rounds[0]);
});
