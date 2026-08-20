"use client";

import { motion, AnimatePresence } from "motion/react";
import { useRoundTick } from "@/lib/room/use-round-tick";
import { useRoomStore } from "@/lib/room/store";
import { EmojiCard } from "@/components/game/emoji-card";
import { RoundTimer } from "@/components/game/round-timer";
import { ChatPanel } from "@/components/game/chat-panel";
import { Leaderboard } from "@/components/game/leaderboard";
import { RoundRecap } from "@/components/game/round-recap";
import { SoundToggle } from "@/components/game/sound-toggle";
import { categoryLabel } from "@/lib/categories";

interface RoomGameProps {
  roomCode: string;
  myPlayerId: string | null;
  isSpectator: boolean;
}

// Rendered while rooms.status === 'in_progress' — the wide 3-column shell
// from DESIGN.md §2.4 / mockup frames 1e-1f: leaderboard | emoji stage (or
// the round recap) | chat, stacking to a single column under `lg`.
export function RoomGame({ roomCode, myPlayerId, isSpectator }: RoomGameProps) {
  // Every member ticks, not just the host — see use-round-tick.ts.
  useRoundTick(roomCode, true);

  const round = useRoomStore((s) => s.round);
  const totalRounds = useRoomStore((s) => s.room?.totalRounds ?? 0);
  const categoryName = useRoomStore((s) => s.room?.categoryName ?? null);

  if (!round) {
    // A brief gap right after start-game, before the first tick has created
    // round 1 — round-tick is already running and fills this in within one
    // request.
    return <p className="py-12 text-center text-ink-muted">Getting the first round ready…</p>;
  }

  const live = !round.revealedAt;

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3.5">
          <p className="font-heading text-2xl font-bold text-ink">Guessmoji</p>
          <p className="text-xs font-bold tracking-[0.14em] text-ink-muted uppercase">
            round {round.roundNumber} of {totalRounds} · {categoryLabel(categoryName)}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {live && <RoundTimer key={round.id} endsAt={round.endsAt} />}
          <SoundToggle />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[270px_1fr_300px] lg:gap-[18px]">
        {/* lg:self-start: don't stretch to match the middle/chat columns'
            height — stay sized to however many players there are. */}
        <div className="lg:order-1 lg:self-start">
          <Leaderboard myPlayerId={myPlayerId} />
        </div>

        <div className="lg:order-2">
          {/* The emoji stage <-> recap swap is the only thing keyed/animated
              here — round.id alone would re-key on every server write to
              the same round (e.g. the reveal itself), so live is folded
              into the key on purpose. */}
          <AnimatePresence mode="wait">
            <motion.div
              key={live ? round.id : `${round.id}-recap`}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98, transition: { duration: 0.18 } }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              {live ? <EmojiCard emojiSequence={round.emojiSequence} /> : <RoundRecap round={round} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* lg:relative: containing block for ChatPanel's lg:absolute
            inset-0 (see chat-panel.tsx for why it isn't lg:h-full). */}
        <div className="lg:order-3 lg:relative">
          <ChatPanel key={round.id} roomCode={roomCode} live={live} isSpectator={isSpectator} myPlayerId={myPlayerId} />
        </div>
      </div>
    </div>
  );
}
