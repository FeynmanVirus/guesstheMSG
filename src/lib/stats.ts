// End-of-game stats (DESIGN.md §2.8, CLAUDE.md "Game feel"): fastest average
// guess time, most correct guesses, an MVP callout, highest accuracy, the
// biggest rank comeback ("the Phoenix"), the hardest round, and a per-round
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
  /** Mean seconds from round start to correct guess, over rounds solved,
   * plus that player's single fastest correct guess of the game. */
  fastestAverage: { playerId: string; seconds: number; bestSeconds: number } | null;
  mostCorrect: { playerId: string; count: number } | null;
  /** Most rounds where they scored highest — distinct from "most total
   * points" (that's already the leaderboard winner), or this would just be
   * a redundant callout for the same player. */
  mvp: { playerId: string; roundsWon: number } | null;
  /** Correct guesses / total guesses submitted, over players who've made at
   * least MIN_ACCURACY_ATTEMPTS attempts (right or wrong) — without a real
   * floor, a single lucky 1-of-1 guess beats a real 9-of-11 leader on raw
   * percentage. Someone below the floor (or who never guessed) isn't
   * rankable here, since this function never sees the full player roster,
   * only who appears in guesses. */
  highestAccuracy: { playerId: string; correct: number; attempts: number; pct: number } | null;
  /** The biggest rank climb: `fromRank` is the worst (numerically largest)
   * cumulative-score rank a player held at the end of any round, `toRank`
   * is their rank after the final round. Same roster caveat as accuracy —
   * only players who appear in at least one round's guesses are ranked. */
  phoenix: { playerId: string; fromRank: number; toRank: number } | null;
  /** The round with the fewest solvers (0 preferred), first such round on a
   * tie. Null only when there are no rounds at all. */
  hardest: RoundBreakdown | null;
  rounds: RoundBreakdown[];
}

// An entry gets created for any player with at least one guess this game,
// right or wrong — attempts/correctCount both start at 0. mostCorrect,
// fastestAverage, and mvp all additionally require correctCount > 0 before
// picking a player, so an all-miss game still reports those three as null
// (highestAccuracy is the one stat that legitimately wants a 0-correct
// player in the running).
interface Accumulator {
  attempts: number;
  correctCount: number;
  totalSeconds: number;
  bestSeconds: number;
  totalPoints: number;
  roundsWon: number;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// Below this many attempts, a raw percentage is noise (a single lucky guess
// is a "100%" that shouldn't beat a real leader) — see highestAccuracy's doc
// comment on GameStats.
const MIN_ACCURACY_ATTEMPTS = 3;

/** Tie-break order shared by the headline stats: higher points first, then
 * lower player id — arbitrary but deterministic, so a callout never
 * flickers between renders on an exact tie. */
function betterTiebreak(aPoints: number, aId: string, bPoints: number, bId: string): boolean {
  if (aPoints !== bPoints) return aPoints > bPoints;
  return aId < bId;
}

/** Dense ranks (1 = highest score) over a fixed player set, so every player
 * gets a rank every round even before they've scored anything — a
 * still-scoreless player needs a real (tied-last) rank for the Phoenix
 * comeback calculation to have a "worst rank" to climb from. Ties broken by
 * player id, matching betterTiebreak's determinism elsewhere in this file. */
function ranksByScore(scores: Map<string, number>): Map<string, number> {
  const ordered = [...scores.entries()].sort(([aId, aScore], [bId, bScore]) =>
    betterTiebreak(aScore, aId, bScore, bId) ? -1 : 1,
  );
  return new Map(ordered.map(([playerId], i) => [playerId, i + 1]));
}

export function computeStats(rounds: StatsRound[]): GameStats {
  const acc = new Map<string, Accumulator>();
  const roundBreakdowns: RoundBreakdown[] = [];
  const cumulativeScore = new Map<string, number>();
  // Worst (numerically largest) rank each player has held at the end of any
  // round so far — seeded lazily the first round a player appears in, since
  // ranksByScore only ranks players already known by that point.
  const worstRank = new Map<string, number>();

  for (const r of rounds) {
    const correct = r.guesses.filter((g) => g.isCorrect);
    let best: RoundBreakdown["best"] = null;
    let bestSubmittedAtMs = Infinity;

    for (const g of r.guesses) {
      const entry = acc.get(g.playerId) ?? {
        attempts: 0,
        correctCount: 0,
        totalSeconds: 0,
        bestSeconds: Infinity,
        totalPoints: 0,
        roundsWon: 0,
      };
      entry.attempts += 1;
      acc.set(g.playerId, entry);
      if (!cumulativeScore.has(g.playerId)) cumulativeScore.set(g.playerId, 0);

      if (!g.isCorrect) continue;

      const seconds = Math.max(0, (g.submittedAtMs - r.startedAtMs) / 1000);
      entry.correctCount += 1;
      entry.totalSeconds += seconds;
      entry.bestSeconds = Math.min(entry.bestSeconds, seconds);
      entry.totalPoints += g.points;
      cumulativeScore.set(g.playerId, (cumulativeScore.get(g.playerId) ?? 0) + g.points);

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

    // Rank everyone known so far (including this round's first-time
    // guessers, now seeded at 0 above) and fold each rank into their worst
    // seen so far.
    for (const [playerId, rank] of ranksByScore(cumulativeScore)) {
      worstRank.set(playerId, Math.max(worstRank.get(playerId) ?? 0, rank));
    }
  }

  let fastestAverage: GameStats["fastestAverage"] = null;
  let mostCorrect: GameStats["mostCorrect"] = null;
  let mvp: GameStats["mvp"] = null;
  let highestAccuracy: GameStats["highestAccuracy"] = null;

  for (const [playerId, entry] of acc) {
    if (entry.correctCount > 0) {
      const avgSeconds = round1(entry.totalSeconds / entry.correctCount);
      // Lower average is better — the tie-break helper assumes "higher is
      // better", so negate both sides to reuse it for this one metric.
      if (
        !fastestAverage ||
        betterTiebreak(-avgSeconds, playerId, -fastestAverage.seconds, fastestAverage.playerId)
      ) {
        fastestAverage = { playerId, seconds: avgSeconds, bestSeconds: round1(entry.bestSeconds) };
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

    if (entry.attempts >= MIN_ACCURACY_ATTEMPTS) {
      const pct = round1((entry.correctCount / entry.attempts) * 100);
      if (!highestAccuracy || betterTiebreak(pct, playerId, highestAccuracy.pct, highestAccuracy.playerId)) {
        highestAccuracy = { playerId, correct: entry.correctCount, attempts: entry.attempts, pct };
      }
    }
  }

  let phoenix: GameStats["phoenix"] = null;
  const finalRank = ranksByScore(cumulativeScore);
  for (const [playerId, from] of worstRank) {
    const to = finalRank.get(playerId)!;
    const climb = from - to;
    if (climb <= 0) continue;
    const currentClimb = phoenix ? phoenix.fromRank - phoenix.toRank : -Infinity;
    if (!phoenix || betterTiebreak(climb, playerId, currentClimb, phoenix.playerId)) {
      phoenix = { playerId, fromRank: from, toRank: to };
    }
  }

  let hardest: GameStats["hardest"] = null;
  for (const r of roundBreakdowns) {
    if (!hardest || r.solvers < hardest.solvers) hardest = r;
  }

  return { fastestAverage, mostCorrect, mvp, highestAccuracy, phoenix, hardest, rounds: roundBreakdowns };
}
