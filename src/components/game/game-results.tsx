"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { Trophy } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { avatarSrc } from "@/lib/avatars";
import { useRoomStore, sortForLeaderboard } from "@/lib/room/store";

interface GameResultsProps {
  myPlayerId: string | null;
}

// End of game (DESIGN.md §2.8), final leaderboard only for now — the richer
// stats (fastest average guess, most correct, MVP, per-round breakdown) and
// the host's restart flow are still to come.
export function GameResults({ myPlayerId }: GameResultsProps) {
  // useShallow — see leaderboard.tsx for why the raw selector isn't safe.
  const players = useRoomStore(
    useShallow((s) =>
      sortForLeaderboard(Array.from(s.players.values()).filter((p) => p.status === "active")),
    ),
  );

  const winner = players[0] ?? null;
  // A tie at the top means nobody is "the" winner — don't crown one arbitrarily.
  const outrightWinner = winner && (players[1] === undefined || players[1].score < winner.score);

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
    </div>
  );
}
