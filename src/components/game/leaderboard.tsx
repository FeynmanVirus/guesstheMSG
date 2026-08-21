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
    // max-lg:absolute/inset-0: the mobile skribbl-style shell (room-game.tsx)
    // puts this panel side-by-side with chat in a row that's `relative` below
    // `lg` too — same grid/flex-row auto-sizing fix as ChatPanel's, reused
    // verbatim so a long player list scrolls inside its own column instead
    // of growing the row (and everything else in it). Desktop is untouched:
    // no lg:-prefixed class here changes, so ≥1024px renders exactly as
    // before.
    <div className="doodle-panel space-y-2.5 p-4 max-lg:absolute max-lg:inset-0 max-lg:flex max-lg:flex-col max-lg:overflow-hidden">
      <p className="font-heading text-xl font-bold text-ink max-lg:text-base">Leaderboard</p>
      <div className="h-0 border-t-2 border-dashed border-hairline" />
      <ul className="space-y-2 max-lg:min-h-0 max-lg:flex-1 max-lg:overflow-y-auto">
        {players.map((player, index) => {
          const isMe = player.id === myPlayerId;
          const top = index === 0;
          return (
            <motion.li
              key={player.id}
              layout
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className={`flex items-center gap-2.5 rounded-2xl px-2.5 py-2 max-lg:gap-1.5 max-lg:px-1.5 max-lg:py-1 ${
                top
                  ? "border-[2.5px] border-ink bg-sun shadow-pop-pressed"
                  : "border-2 border-hairline"
              } ${isMe ? "max-lg:ring-2 max-lg:ring-sky" : ""}`}
            >
              {/* Rank number/medal is redundant with sort order once the row
                  is this compact — dropped below lg rather than shrunk. */}
              <span
                className="w-4 text-center text-sm font-extrabold text-ink max-lg:hidden"
                aria-hidden
              >
                {RANK_MEDAL[index] ?? index + 1}
              </span>
              <Avatar avatarId={player.avatarId} className="size-8 text-base max-lg:size-6" />
              <span className="min-w-0 flex-1">
                <p className="block truncate text-sm font-extrabold text-ink max-lg:text-xs">
                  {player.displayName}
                  {/* The "you" pill needs the width this compact row doesn't
                      have — max-lg:ring-sky above (on the row itself) is the
                      mobile stand-in for self-identification. */}
                  {isMe && (
                    <>
                      {" "}
                      <span className="rounded-full border-[1.5px] border-ink bg-paper px-1.5 py-px text-[0.6rem] font-bold max-lg:hidden">
                        you
                      </span>
                    </>
                  )}
                </p>
                {/* Substatus line: no room for it in the compact mobile row. */}
                <span className="block text-[0.65rem] font-semibold text-ink-muted max-lg:hidden">
                  {status(scorerIds.has(player.id), presentIds.has(player.id))}
                </span>
              </span>
              <span
                className="font-heading text-lg font-bold text-ink max-lg:text-base"
                aria-label={`${player.score} points`}
              >
                {player.score}
              </span>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
