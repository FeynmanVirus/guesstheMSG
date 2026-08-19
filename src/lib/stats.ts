// End-of-game stats (DESIGN.md §2.8, CLAUDE.md "Game feel"): fastest average
// guess time, most correct guesses, an MVP callout, and a per-round
// breakdown. Pure — no Supabase/Date imports — so game-results.tsx maps its
// query result into these shapes and everything below is trivially testable
// (see stats.test.deno.ts) without a database or a browser.

export interface StatsGuess {
  playerId: string;
  isCorrect: boolean;
  points: number;
  submittedAtMs: number;
}

export interface StatsRound {
  roundNumber: number;
  answer: string | null;
  startedAtMs: number;
  guesses: StatsGuess[];
}

export interface RoundBreakdown {
  roundNumber: number;
  answer: string | null;
  /** How many players got it this round. */
  solvers: number;
  /** The round's top scorer, ties broken by earliest submission. */
  best: { playerId: string; points: number; seconds: number } | null;
}

export interface GameStats {
  /** Mean seconds from round start to correct guess, over rounds solved. */
  fastestAverage: { playerId: string; seconds: number } | null;
  mostCorrect: { playerId: string; count: number } | null;
  /** Most rounds where they scored highest — distinct from "most total
   * points" (that's already the leaderboard winner), or this would just be
   * a redundant callout for the same player. */
  mvp: { playerId: string; roundsWon: number } | null;
  rounds: RoundBreakdown[];
}

// An entry only ever gets created for a player with at least one correct
// guess (see the loop below) — so `acc` never holds a correctCount:0 row,
// and mostCorrect/fastestAverage naturally end up null on an all-miss game
// simply because `acc` stays empty, no extra guard needed for that case.
interface Accumulator {
  correctCount: number;
  totalSeconds: number;
  totalPoints: number;
  roundsWon: number;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Tie-break order shared by all three headline stats: higher points first,
 * then lower player id — arbitrary but deterministic, so the callout never
 * flickers between renders on an exact tie. */
function betterTiebreak(aPoints: number, aId: string, bPoints: number, bId: string): boolean {
  if (aPoints !== bPoints) return aPoints > bPoints;
  return aId < bId;
}

export function computeStats(rounds: StatsRound[]): GameStats {
  const acc = new Map<string, Accumulator>();
  const roundBreakdowns: RoundBreakdown[] = [];

  for (const r of rounds) {
    const correct = r.guesses.filter((g) => g.isCorrect);
    let best: RoundBreakdown["best"] = null;
    let bestSubmittedAtMs = Infinity;

    for (const g of correct) {
      const seconds = Math.max(0, (g.submittedAtMs - r.startedAtMs) / 1000);

      const entry = acc.get(g.playerId) ?? {
        correctCount: 0,
        totalSeconds: 0,
        totalPoints: 0,
        roundsWon: 0,
      };
      entry.correctCount += 1;
      entry.totalSeconds += seconds;
      entry.totalPoints += g.points;
      acc.set(g.playerId, entry);

      // Tie-break by earliest submission here, not player id — this is a
      // per-round "who scored highest" pick, not one of the headline
      // player-level stats betterTiebreak() is for.
      const better =
        !best || g.points > best.points || (g.points === best.points && g.submittedAtMs < bestSubmittedAtMs);
      if (better) {
        best = { playerId: g.playerId, points: g.points, seconds: round1(seconds) };
        bestSubmittedAtMs = g.submittedAtMs;
      }
    }

    if (best) {
      const winner = acc.get(best.playerId)!;
      winner.roundsWon += 1;
    }

    roundBreakdowns.push({
      roundNumber: r.roundNumber,
      answer: r.answer,
      solvers: correct.length,
      best,
    });
  }

  let fastestAverage: GameStats["fastestAverage"] = null;
  let mostCorrect: GameStats["mostCorrect"] = null;
  let mvp: GameStats["mvp"] = null;

  for (const [playerId, entry] of acc) {
    if (entry.correctCount > 0) {
      const avgSeconds = round1(entry.totalSeconds / entry.correctCount);
      // Lower average is better — the tie-break helper assumes "higher is
      // better", so negate both sides to reuse it for this one metric.
      if (!fastestAverage || betterTiebreak(-avgSeconds, playerId, -fastestAverage.seconds, fastestAverage.playerId)) {
        fastestAverage = { playerId, seconds: avgSeconds };
      }
    }

    if (!mostCorrect || betterTiebreak(entry.correctCount, playerId, mostCorrect.count, mostCorrect.playerId)) {
      mostCorrect = { playerId, count: entry.correctCount };
    }

    if (entry.roundsWon > 0) {
      if (!mvp || betterTiebreak(entry.roundsWon, playerId, mvp.roundsWon, mvp.playerId)) {
        mvp = { playerId, roundsWon: entry.roundsWon };
      }
    }
  }

  return { fastestAverage, mostCorrect, mvp, rounds: roundBreakdowns };
}
