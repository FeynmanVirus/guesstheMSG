"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { useShallow } from "zustand/react/shallow";
import { avatarSrc } from "@/lib/avatars";
import { useRoomStore, sortForLeaderboard } from "@/lib/room/store";

interface LeaderboardProps {
  myPlayerId: string | null;
}

const RANK_MEDAL: Record<number, string> = { 0: "🥇", 1: "🥈", 2: "🥉" };

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

  return (
    <div className="doodle-card p-4">
      <p className="font-heading text-lg font-semibold text-ink">Leaderboard</p>
      <ul className="mt-2 space-y-2">
        {players.map((player, index) => (
          <motion.li
            key={player.id}
            layout
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2 ${
              player.id === myPlayerId ? "border-sun bg-sun/10" : "border-ink/15 bg-surface"
            }`}
          >
            <span className="w-5 text-center text-sm text-ink-muted" aria-hidden>
              {RANK_MEDAL[index] ?? index + 1}
            </span>
            <Image
              src={avatarSrc(player.avatarId)}
              alt=""
              width={32}
              height={32}
              className="size-8 rounded-full border-2 border-ink/40"
              unoptimized
            />
            <p className="min-w-0 flex-1 truncate font-medium text-ink">
              {player.displayName}
              {player.id === myPlayerId && <span className="text-ink-muted"> (you)</span>}
            </p>
            <p className="font-heading text-lg font-semibold text-sun" aria-label={`${player.score} points`}>
              {player.score}
            </p>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
