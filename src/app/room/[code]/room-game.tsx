"use client";

import { motion, AnimatePresence } from "motion/react";
import { useRoundTick } from "@/lib/room/use-round-tick";
import { useRoomStore } from "@/lib/room/store";
import { EmojiCard } from "@/components/game/emoji-card";
import { RoundTimer } from "@/components/game/round-timer";
import { GuessInput } from "@/components/game/guess-input";
import { MessageStream } from "@/components/game/message-stream";
import { Leaderboard } from "@/components/game/leaderboard";
import { RoundRecap } from "@/components/game/round-recap";

interface RoomGameProps {
  roomCode: string;
  myPlayerId: string | null;
  isSpectator: boolean;
}

// Rendered while rooms.status === 'in_progress' — the seam room-lobby.tsx
// used to render "Game starting…" for. Layout follows DESIGN.md §2.4:
// emoji card focal, timer + guess box below it, leaderboard alongside;
// stacks to a single column under the fold on narrow screens, never fully
// hidden.
export function RoomGame({ roomCode, myPlayerId, isSpectator }: RoomGameProps) {
  // Every member ticks, not just the host — see use-round-tick.ts.
  useRoundTick(roomCode, true);

  const round = useRoomStore((s) => s.round);
  const totalRounds = useRoomStore((s) => s.room?.totalRounds ?? 0);

  if (!round) {
    // A brief gap right after start-game, before the first tick has created
    // round 1 — round-tick is already running and fills this in within one
    // request.
    return <p className="py-12 text-center text-ink-muted">Getting the first round ready…</p>;
  }

  const live = !round.revealedAt;

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-[1fr_260px]">
      <div className="space-y-4 sm:col-start-1">
        {/* The emoji card + timer swap out as a unit between rounds — exit
            the old round, then enter the new one. mode="wait" keeps them
            from overlapping mid-transition. GuessInput/MessageStream stay
            outside this swap on purpose: mode="wait" would otherwise blank
            the input (and drop focus) for the length of the exit, and the
            input already resets correctly via its own key={round.id}
            remount below. */}
        <AnimatePresence mode="wait">
          <motion.div
            key={round.id}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98, transition: { duration: 0.18 } }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="space-y-4"
          >
            <EmojiCard
              emojiSequence={round.emojiSequence}
              roundNumber={round.roundNumber}
              totalRounds={totalRounds}
            />
            {live && <RoundTimer endsAt={round.endsAt} />}
          </motion.div>
        </AnimatePresence>

        <GuessInput
          key={`${round.id}-input`}
          roomCode={roomCode}
          disabled={!live}
          isSpectator={isSpectator}
          myPlayerId={myPlayerId}
        />
        <MessageStream myPlayerId={myPlayerId} />
      </div>

      <div className="sm:col-start-2 sm:row-start-1">
        <Leaderboard myPlayerId={myPlayerId} />
      </div>

      {/* RoundRecap's own fade in/out now lives here, one level up, since a
          component can't animate its own unmount by wrapping itself. */}
      <AnimatePresence>{!live && <RoundRecap key={round.id} round={round} />}</AnimatePresence>
    </div>
  );
}
