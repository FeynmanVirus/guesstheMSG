"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion } from "motion/react";
import { Trophy, Zap, Target, Crown } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { avatarSrc } from "@/lib/avatars";
import { supabase } from "@/lib/supabase/client";
import { useRoomStore, sortForLeaderboard } from "@/lib/room/store";
import { computeStats, type GameStats, type StatsRound } from "@/lib/stats";

interface GameResultsProps {
  myPlayerId: string | null;
}

/** The shape of canvas-confetti's callable default export, hand-typed
 * rather than imported — see the cast site below for why. */
type ConfettiFn = ((options?: Record<string, unknown>) => Promise<null> | null) & {
  reset: () => void;
};

// End of game (DESIGN.md §2.8): final leaderboard, the four headline stats
// (fastest average guess, most correct, MVP, per-round breakdown), and
// confetti for an outright winner. The host's restart flow lives alongside
// this in room-lobby.tsx's `ended` branch (restart-room-form.tsx).
export function GameResults({ myPlayerId }: GameResultsProps) {
  // useShallow — see leaderboard.tsx for why the raw selector isn't safe.
  const players = useRoomStore(
    useShallow((s) =>
      sortForLeaderboard(Array.from(s.players.values()).filter((p) => p.status === "active")),
    ),
  );
  // Separate from the sorted/filtered array above — this is for resolving a
  // playerId out of historical guess rows, which may include a player who
  // isn't `active` anymore.
  const playersMap = useRoomStore((s) => s.players);
  const roomId = useRoomStore((s) => s.room?.id ?? null);

  const winner = players[0] ?? null;
  // A tie at the top means nobody is "the" winner — don't crown one arbitrarily.
  const outrightWinner = winner && (players[1] === undefined || players[1].score < winner.score);

  const [stats, setStats] = useState<GameStats | null>(null);

  // Same "query Supabase directly for historical data" precedent as
  // round-recap.tsx — the Zustand store holds no round history, and this is
  // a one-time fetch, not something worth a live subscription.
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;

    (async () => {
      // Join through game_session_id, not room_id directly: a restarted
      // room has several sessions, and a room_id-only query would blend
      // stats across playthroughs (ARCHITECTURE.md §7/§9).
      const { data: session } = await supabase
        .from("game_sessions")
        .select("id")
        .eq("room_id", roomId)
        .order("session_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled || !session) return;

      const { data, error } = await supabase
        .from("rounds")
        .select("round_number, revealed_answer, started_at, guesses(player_id, is_correct, points_awarded, submitted_at)")
        .eq("game_session_id", session.id)
        .order("round_number", { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error("game-results: failed to load stats", error);
        return;
      }

      const rounds: StatsRound[] = (data ?? []).map((r) => ({
        roundNumber: r.round_number,
        answer: r.revealed_answer,
        startedAtMs: new Date(r.started_at).getTime(),
        guesses: (r.guesses ?? []).map((g) => ({
          playerId: g.player_id,
          isCorrect: g.is_correct,
          points: g.points_awarded,
          submittedAtMs: new Date(g.submitted_at).getTime(),
        })),
      }));

      setStats(computeStats(rounds));
    })();

    return () => {
      cancelled = true;
    };
  }, [roomId]);

  // Confetti for an outright winner only — reuses the tie-detection above.
  // Dynamically imported so the ~7kB library stays off every other route's
  // bundle; disableForReducedMotion is the library's own flag, no separate
  // matchMedia check needed.
  useEffect(() => {
    if (!outrightWinner) return;
    let fire: ConfettiFn | null = null;
    void import("canvas-confetti").then((mod) => {
      // @types/canvas-confetti models the package's CJS `export =` shape,
      // but the build a bundler actually resolves here is the real ESM
      // build with `export default` — the ambient type just doesn't know
      // `.default` exists. Cast through `unknown` rather than fight it.
      fire = (mod as unknown as { default: ConfettiFn }).default;
      fire({ particleCount: 120, spread: 70, origin: { y: 0.6 }, disableForReducedMotion: true });
    });
    return () => fire?.reset();
  }, [outrightWinner]);

  return (
    <div className="space-y-5">
      <div className="text-center">
        <p className="font-heading text-3xl font-semibold text-ink">Game over</p>
        {outrightWinner ? (
          <p className="mt-1 flex items-center justify-center gap-2 text-ink">
            <Trophy className="size-5 text-sun" aria-hidden />
            <span className="font-semibold">{winner.displayName}</span> wins with {winner.score}
          </p>
        ) : (
          winner && <p className="mt-1 text-ink-muted">It&apos;s a tie at {winner.score}.</p>
        )}
      </div>

      <ul className="space-y-2">
        {players.map((player, index) => (
          <motion.li
            key={player.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20, delay: index * 0.05 }}
            className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2 ${
              index === 0 ? "border-sun bg-sun/10" : "border-ink/15 bg-surface"
            }`}
          >
            <span className="w-5 text-center text-sm text-ink-muted">{index + 1}</span>
            <Image
              src={avatarSrc(player.avatarId)}
              alt=""
              width={36}
              height={36}
              className="size-9 rounded-full border-2 border-ink/40"
              unoptimized
            />
            <p className="min-w-0 flex-1 truncate font-medium text-ink">
              {player.displayName}
              {player.id === myPlayerId && <span className="text-ink-muted"> (you)</span>}
            </p>
            <p className="font-heading text-xl font-semibold text-sun">{player.score}</p>
          </motion.li>
        ))}
      </ul>

      {stats && (
        <div className="space-y-2">
          <StatLine
            icon={<Crown className="size-4 text-sun" aria-hidden />}
            label="MVP"
            value={
              stats.mvp &&
              `${playersMap.get(stats.mvp.playerId)?.displayName ?? "Someone"} · won ${stats.mvp.roundsWon} round${
                stats.mvp.roundsWon === 1 ? "" : "s"
              }`
            }
          />
          <StatLine
            icon={<Zap className="size-4 text-sky" aria-hidden />}
            label="Fastest average"
            value={
              stats.fastestAverage &&
              `${playersMap.get(stats.fastestAverage.playerId)?.displayName ?? "Someone"} · ${stats.fastestAverage.seconds}s`
            }
          />
          <StatLine
            icon={<Target className="size-4 text-coral" aria-hidden />}
            label="Most correct"
            value={
              stats.mostCorrect &&
              `${playersMap.get(stats.mostCorrect.playerId)?.displayName ?? "Someone"} · ${stats.mostCorrect.count}`
            }
          />

          {stats.rounds.length > 0 && (
            <details className="doodle-card p-4 text-sm text-ink">
              <summary className="cursor-pointer font-medium">Round by round</summary>
              <ul className="mt-2 space-y-1.5">
                {stats.rounds.map((r) => (
                  <li key={r.roundNumber} className="flex items-center justify-between gap-2">
                    <span className="text-ink-muted">
                      #{r.roundNumber} · {r.answer ? capitalize(r.answer) : "…"}
                    </span>
                    <span>
                      {r.best
                        ? `${playersMap.get(r.best.playerId)?.displayName ?? "Someone"} · +${r.best.points} · ${r.best.seconds}s`
                        : "Nobody"}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function StatLine({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
}) {
  // Skip a line entirely rather than render "MVP: —" — a stat with no
  // qualifying player (e.g. nobody guessed correctly all game) just isn't
  // shown, not asserted as empty.
  if (!value) return null;
  return (
    <p className="flex items-center gap-2 text-sm text-ink">
      {icon}
      <span className="text-ink-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </p>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
