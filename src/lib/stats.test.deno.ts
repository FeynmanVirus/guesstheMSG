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

  assertEquals(stats.fastestAverage, { playerId: B, seconds: 4 });
  assertEquals(stats.mostCorrect, { playerId: B, count: 3 });
  assertEquals(stats.mvp, { playerId: B, roundsWon: 2 });

  assertEquals(stats.rounds.length, 3);
  assertEquals(stats.rounds[0].solvers, 2);
  assertEquals(stats.rounds[0].best, { playerId: A, points: 900, seconds: 2 });
  assertEquals(stats.rounds[2].solvers, 1);
  assertEquals(stats.rounds[2].best, { playerId: B, points: 850, seconds: 3 });
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
  // (not just this round's `best`) must stay null, not default to player A.
  assertEquals(stats.fastestAverage, null);
  assertEquals(stats.mostCorrect, null);
  assertEquals(stats.mvp, null);
});
