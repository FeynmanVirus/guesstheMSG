"use client";

import { motion } from "motion/react";
import { useShallow } from "zustand/react/shallow";
import { Avatar } from "@/components/doodle/avatar";
import { useRoomStore, sortForLeaderboard } from "@/lib/room/store";

interface LeaderboardProps {
  myPlayerId: string | null;
}

const RANK_MEDAL: Record<number, string> = { 0: "🥇", 1: "🥈", 2: "🥉" };

// Per-row substatus (mockup frame 1e): "guessed ✓" / "guessing…" / "away".
// Not the lobby's debounced usePresenceGrace treatment — a bare presentIds
// check is enough here since a brief flicker mid-round is low stakes, and
// pulling in the grace hook's timers would be a lot of ceremony for it.
function status(hasGuessedThisRound: boolean, connected: boolean): string {
  if (!connected) return "away";
  return hasGuessedThisRound ? "guessed ✓" : "guessing…";
}

export function Leaderboard({ myPlayerId }: LeaderboardProps) {
  // useShallow: the selector builds a fresh array every call, which
  // useSyncExternalStore rejects as an unstable snapshot (infinite-loop
  // warning) unless wrapped — it shallow-compares against the previous
  // result and hands back the same reference when nothing really changed.
  const players = useRoomStore(
    useShallow((s) =>
      sortForLeaderboard(Array.from(s.players.values()).filter((p) => p.status === "active")),
    ),
  );
  const presentIds = useRoomStore((s) => s.presentIds);
  const roundId = useRoomStore((s) => s.round?.id ?? null);
  const scorerIds = useRoomStore(
    useShallow((s) =>
      new Set(
        s.messages
          .filter((m) => m.kind === "system" && m.roundId === roundId)
          .map((m) => m.playerId),
      ),
    ),
  );

  return (
    <div className="doodle-panel space-y-2.5 p-4">
      <p className="font-heading text-xl font-bold text-ink">Leaderboard</p>
      <div className="h-0 border-t-2 border-dashed border-hairline" />
      <ul className="space-y-2">
        {players.map((player, index) => {
          const isMe = player.id === myPlayerId;
          const top = index === 0;
          return (
            <motion.li
              key={player.id}
              layout
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className={`flex items-center gap-2.5 rounded-2xl px-2.5 py-2 ${
                top
                  ? "border-[2.5px] border-ink bg-sun shadow-pop-pressed"
                  : "border-2 border-hairline"
              }`}
            >
              <span className="w-4 text-center text-sm font-extrabold text-ink" aria-hidden>
                {RANK_MEDAL[index] ?? index + 1}
              </span>
              <Avatar avatarId={player.avatarId} className="size-8 text-base" />
              <span className="min-w-0 flex-1">
                <p className="block truncate text-sm font-extrabold text-ink">
                  {player.displayName}
                  {isMe && (
                    <>
                      {" "}
                      <span className="rounded-full border-[1.5px] border-ink bg-paper px-1.5 py-px text-[0.6rem] font-bold">
                        you
                      </span>
                    </>
                  )}
                </p>
                <span className="block text-[0.65rem] font-semibold text-ink-muted">
                  {status(scorerIds.has(player.id), presentIds.has(player.id))}
                </span>
              </span>
              <span className="font-heading text-lg font-bold text-ink" aria-label={`${player.score} points`}>
                {player.score}
              </span>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
