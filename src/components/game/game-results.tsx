"use client";

import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Avatar } from "@/components/doodle/avatar";
import { Squiggle } from "@/components/doodle/squiggle";
import { Podium, type PodiumEntry } from "@/components/doodle/podium";
import { ChatPanel } from "@/components/game/chat-panel";
import { SoundToggle } from "@/components/game/sound-toggle";
import { supabase } from "@/lib/supabase/client";
import { useRoomStore, sortForLeaderboard } from "@/lib/room/store";
import { categoryLabel } from "@/lib/categories";
import { computeStats, type GameStats, type StatsRound } from "@/lib/stats";

interface GameResultsProps {
  roomCode: string;
  myPlayerId: string | null;
  /** RestartRoomForm for the host, WaitingForHost for everyone else —
   * room-lobby.tsx owns that branch, this just embeds whatever it hands in
   * at the bottom of the centre column, below the podium/share row. */
  restartSlot: React.ReactNode;
}

/** The shape of canvas-confetti's callable default export, hand-typed
 * rather than imported — see the cast site below for why. */
type ConfettiFn = ((options?: Record<string, unknown>) => Promise<null> | null) & {
  reset: () => void;
};

// End of game (DESIGN.md §2.8, mockup frame 1g): the same wide 3-column
// shell as the in-game screen — final standings | podium & awards | chat —
// plus confetti for an outright winner.
export function GameResults({ roomCode, myPlayerId, restartSlot }: GameResultsProps) {
  // useShallow: the selector builds a fresh array every call, which
  // useSyncExternalStore rejects as an unstable snapshot unless wrapped.
  const players = useRoomStore(
    useShallow((s) =>
      sortForLeaderboard(Array.from(s.players.values()).filter((p) => p.status === "active")),
    ),
  );
  const room = useRoomStore((s) => s.room);

  const winner = players[0] ?? null;
  // A tie at the top means nobody is "the" winner — don't crown one arbitrarily.
  const outrightWinner = winner && (players[1] === undefined || players[1].score < winner.score);

  const [stats, setStats] = useState<GameStats | null>(null);
  const [correctCounts, setCorrectCounts] = useState<Record<string, number>>({});
  const [shared, setShared] = useState(false);

  // Same "query Supabase directly for historical data" precedent as
  // round-recap.tsx — the Zustand store holds no round history, and this is
  // a one-time fetch, not something worth a live subscription.
  useEffect(() => {
    if (!room) return;
    let cancelled = false;

    (async () => {
      // Join through game_session_id, not room_id directly: a restarted
      // room has several sessions, and a room_id-only query would blend
      // stats across playthroughs (ARCHITECTURE.md §7/§9).
      const { data: session } = await supabase
        .from("game_sessions")
        .select("id")
        .eq("room_id", room.id)
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

      const counts: Record<string, number> = {};
      const rounds: StatsRound[] = (data ?? []).map((r) => ({
        roundNumber: r.round_number,
        answer: r.revealed_answer,
        startedAtMs: new Date(r.started_at).getTime(),
        guesses: (r.guesses ?? []).map((g) => {
          if (g.is_correct) counts[g.player_id] = (counts[g.player_id] ?? 0) + 1;
          return {
            playerId: g.player_id,
            isCorrect: g.is_correct,
            points: g.points_awarded,
            submittedAtMs: new Date(g.submitted_at).getTime(),
          };
        }),
      }));

      setCorrectCounts(counts);
      setStats(computeStats(rounds));
    })();

    return () => {
      cancelled = true;
    };
  }, [room]);

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

  async function handleShare() {
    const text = winner
      ? `${winner.displayName} won our Guessmoji game! ${window.location.href}`
      : window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ text, url: window.location.href });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        setShared(true);
        setTimeout(() => setShared(false), 1500);
      }
    } catch {
      // User-cancelled share sheet, or clipboard blocked — both fine to
      // just drop silently rather than surface as an error.
    }
  }

  const totalRounds = stats?.rounds.length ?? 0;

  const podiumEntries: PodiumEntry[] = players.slice(0, 3).map((p) => {
    let award: string | undefined;
    if (stats?.fastestAverage?.playerId === p.id) award = "⚡ Fastest guesser";
    else if (stats?.highestAccuracy?.playerId === p.id && stats.highestAccuracy.attempts > 0) {
      award = "🎯 Highest accuracy";
    } else if (stats?.phoenix?.playerId === p.id) award = "🔥 The Phoenix";

    let note: string | undefined;
    if (award?.includes("Fastest") && stats?.fastestAverage) {
      note = `best ${stats.fastestAverage.bestSeconds}s · avg ${stats.fastestAverage.seconds}s`;
    } else if (award?.includes("accuracy") && stats?.highestAccuracy) {
      note = `${stats.highestAccuracy.correct} of ${stats.highestAccuracy.attempts} guesses · ${stats.highestAccuracy.pct}%`;
    } else if (award?.includes("Phoenix") && stats?.phoenix) {
      note = `last at #${stats.phoenix.fromRank} → #${stats.phoenix.toRank}`;
    }

    return { playerId: p.id, avatarId: p.avatarId, displayName: p.displayName, points: p.score, award, note };
  });

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3.5">
          <p className="font-heading text-2xl font-bold text-ink">Guessmoji</p>
          <p className="text-xs font-bold tracking-[0.14em] text-ink-muted uppercase">
            {totalRounds} of {room?.totalRounds ?? totalRounds} · {categoryLabel(room?.categoryName ?? null)}{" "}
            · complete
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="flex items-center gap-2 rounded-full border-[2.5px] border-ink bg-sun px-4 py-1.5 text-sm font-bold text-ink shadow-pop-pressed">
            🏁 game over
          </span>
          <SoundToggle />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[270px_1fr_300px] lg:gap-[18px]">
        {/* lg:self-start: don't stretch to match the middle/chat columns'
            height — stay sized to however many players there are. */}
        <div className="doodle-panel space-y-2.5 p-4 lg:order-1 lg:self-start">
          <p className="font-heading text-xl font-bold text-ink">Final standings</p>
          <div className="h-0 border-t-2 border-dashed border-hairline" />
          <ul className="space-y-2">
            {players.map((player, index) => (
              <li
                key={player.id}
                className={`flex items-center gap-2.5 rounded-2xl px-2.5 py-2 ${
                  index === 0
                    ? "border-[2.5px] border-ink bg-sun shadow-pop-pressed"
                    : "border-2 border-hairline"
                }`}
              >
                <span className="w-4 text-center text-sm font-extrabold text-ink" aria-hidden>
                  {index + 1}
                </span>
                <Avatar avatarId={player.avatarId} className="size-8 text-base" />
                <span className="min-w-0 flex-1">
                  <p className="block truncate text-sm font-extrabold text-ink">
                    {player.displayName}
                    {player.id === myPlayerId && (
                      <>
                        {" "}
                        <span className="rounded-full border-[1.5px] border-ink bg-paper px-1.5 py-px text-[0.6rem] font-bold">
                          you
                        </span>
                      </>
                    )}
                  </p>
                  <span className="block text-[0.65rem] font-semibold text-ink-muted">
                    {correctCounts[player.id] ?? 0} of {totalRounds} correct
                  </span>
                </span>
                <p className="font-heading text-lg font-bold text-ink">{player.score}</p>
              </li>
            ))}
          </ul>

          {stats?.hardest && (
            <div className="doodle-dashed p-3">
              <p className="font-heading text-base font-bold text-ink">hardest sequence</p>
              <p className="text-xs font-semibold text-ink-muted">
                {stats.hardest.answer ? capitalize(stats.hardest.answer) : "…"} ·{" "}
                {stats.hardest.solvers === 0
                  ? "nobody got it"
                  : `${stats.hardest.solvers} solver${stats.hardest.solvers === 1 ? "" : "s"}`}
              </p>
            </div>
          )}
        </div>

        <div className="doodle-panel flex min-h-[420px] flex-col items-center gap-2 p-5 text-center lg:order-2 lg:min-h-[560px]">
          <p className="text-xs font-bold tracking-[0.16em] text-ink-muted uppercase">
            {totalRounds} rounds · final
          </p>
          <p className="mt-1 font-heading text-4xl font-bold text-ink">
            {outrightWinner ? `${winner.displayName} wins 🎉` : winner ? `Tied at ${winner.score}` : "Game over"}
          </p>
          <Squiggle color="sun" width={160} />

          <div className="flex w-full flex-1 items-end px-4 pt-2.5">
            {podiumEntries.length > 0 ? (
              <Podium entries={podiumEntries} />
            ) : (
              <p className="m-auto text-sm text-ink-muted">No players finished this game.</p>
            )}
          </div>

          <div className="flex w-full items-center gap-3 border-t-2 border-dashed border-hairline pt-3.5">
            <button
              type="button"
              onClick={handleShare}
              className="ml-auto flex items-center gap-1.5 rounded-full border-2 border-ink bg-paper px-4 py-2 text-sm font-bold text-ink"
            >
              <Share2 className="size-3.5" aria-hidden />
              {shared ? "link copied" : "share results"}
            </button>
          </div>

          {/* The rematch form (or "waiting for host") used to render as its
              own full-width section below the whole grid — on top of this
              column's own min-height floor, that left a lot of empty space
              here and then a lot more page to scroll past below. Embedding
              it here instead fills that space and keeps everything about
              "what happens next" in one place. */}
          <div className="w-full border-t-2 border-dashed border-hairline pt-3.5">{restartSlot}</div>
        </div>

        {/* lg:relative: containing block for ChatPanel's lg:absolute
            inset-0 (see chat-panel.tsx for why it isn't lg:h-full). */}
        <div className="lg:order-3 lg:relative">
          <ChatPanel roomCode={roomCode} live={false} isSpectator={false} myPlayerId={myPlayerId} />
        </div>
      </div>
    </div>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
