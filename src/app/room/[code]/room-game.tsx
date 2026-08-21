"use client";

import { motion, AnimatePresence } from "motion/react";
import { Eye } from "lucide-react";
import { useRoundTick } from "@/lib/room/use-round-tick";
import { useRoomStore } from "@/lib/room/store";
import { EmojiCard } from "@/components/game/emoji-card";
import { RoundTimer } from "@/components/game/round-timer";
import { ChatPanel } from "@/components/game/chat-panel";
import { GuessInput } from "@/components/game/guess-input";
import { Leaderboard } from "@/components/game/leaderboard";
import { RoundRecap } from "@/components/game/round-recap";
import { SoundToggle } from "@/components/game/sound-toggle";
import { categoryLabel } from "@/lib/categories";

interface RoomGameProps {
  roomCode: string;
  myPlayerId: string | null;
  isSpectator: boolean;
}

// Rendered while rooms.status === 'in_progress'.
//
// Desktop (≥lg, DESIGN.md §2.4 / mockup frames 1e-1f): the wide 3-column
// shell — leaderboard | emoji stage (or the round recap) | chat.
//
// Mobile (<lg): a skribbl-style 3-row shell instead of the old single-column
// stack — the game area, not just the whole page, needs its own bounded
// height so it can be laid out as three rows rather than an
// arbitrarily-tall column: clue box (row 1, capped height) on top,
// leaderboard + chat side by side filling the space between (row 2), and
// a full-viewport-width guess input pinned below (row 3). The whole screen
// never scrolls — see screen-dvh below and the two inner panels' own
// overflow handling (leaderboard.tsx, chat-panel.tsx).
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
    // Every class below either matches the pre-mobile-redesign markup
    // exactly, or is `max-lg:`-scoped so it's inert at ≥1024px — that's
    // deliberate, it's what makes "desktop is pixel-identical" checkable
    // instead of just hoped for. `lg:space-y-4` (vs. the old bare
    // `space-y-4`) is the one exception, and it's a no-op swap: this
    // element only ever had two children, so `space-y-4`'s margin-top
    // selector and `max-lg:flex max-lg:flex-col` + `max-lg:gap-2` produce
    // identical desktop spacing either way — the mobile shell needs the
    // flex/gap version instead, since a plain margin would double up
    // against `max-lg:gap-2` below rather than replace it.
    <div className="mx-auto w-full max-w-[1280px] lg:space-y-4 max-lg:flex max-lg:flex-col max-lg:screen-dvh max-lg:gap-2 max-lg:overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 max-lg:shrink-0 max-lg:flex-nowrap max-lg:gap-2 max-lg:px-3 max-lg:pt-3">
        <div className="flex items-baseline gap-3.5 max-lg:min-w-0 max-lg:gap-2">
          <p className="font-heading text-2xl font-bold text-ink max-lg:text-lg">Guessmoji</p>
          <p className="text-xs font-bold tracking-[0.14em] text-ink-muted uppercase max-lg:truncate">
            round {round.roundNumber} of {totalRounds} · {categoryLabel(categoryName)}
          </p>
        </div>
        <div className="flex items-center gap-2.5 max-lg:shrink-0">
          {live && <RoundTimer key={round.id} endsAt={round.endsAt} />}
          <SoundToggle />
        </div>
      </div>

      {/* A late joiner is a spectator for the rest of the round they joined
          (round-tick only flips them to a full player at the next round
          boundary, "Late joiners become full players at the next round
          boundary" below) — CLAUDE.md requires that wait be "called out
          clearly in the UI ... not a silent failure." The lobby already has
          this message (room-lobby.tsx), but it's unreachable once the game
          is in progress; this is the in-round equivalent, visible for the
          whole time isSpectator is true rather than only in the input's
          placeholder (which vanishes the instant they start typing). */}
      {isSpectator && (
        <div className="flex items-center gap-1.5 max-lg:shrink-0 max-lg:px-3">
          <Eye className="size-3.5 text-ink-muted" aria-hidden />
          <p className="text-xs font-semibold text-ink-muted">
            Spectating — you&apos;ll join at the next round.
          </p>
        </div>
      )}

      {/* Desktop: the original 3-column grid, `order-*` on all three direct
          children (unchanged — see the original comment history on why
          every sibling needs an explicit lg:order once one does).
          Mobile: `max-lg:flex max-lg:flex-col` overrides the bare `grid`
          above (same "a later media-scoped utility wins" pattern
          chat-panel.tsx already uses for `lg:absolute`) so this becomes the
          3 rows described above: the stage cell, a row-2 wrapper, and the
          row-3 input — in that DOM order, so no mobile `order-*` is needed,
          only the desktop ones. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[270px_1fr_300px] lg:gap-[18px] max-lg:flex max-lg:min-h-0 max-lg:flex-1 max-lg:flex-col max-lg:gap-2 max-lg:overflow-hidden">
        {/* Row 1 — capped height, not full height, per the brief: the stage
            must stay a clue box, not swallow the screen. min-h keeps a very
            short round (e.g. a single-word answer with no letter blanks)
            from collapsing thinner than is tappable/legible. */}
        <div className="lg:order-2 max-lg:h-[36dvh] max-lg:min-h-[150px] max-lg:shrink-0">
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
              className="max-lg:h-full"
            >
              {live ? (
                <EmojiCard emojiSequence={round.emojiSequence} roundId={round.id} />
              ) : (
                <RoundRecap round={round} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Row 2 wrapper — `lg:contents` drops this box at desktop so
            Leaderboard/ChatPanel rejoin the grid as direct items (their
            existing lg:order-1/lg:order-3 keep working unchanged); below lg
            it's a real flex row splitting the width evenly between them. */}
        <div className="lg:contents max-lg:flex max-lg:min-h-0 max-lg:flex-1 max-lg:gap-2">
          {/* relative unconditionally (not lg:relative): Leaderboard/
              ChatPanel only go max-lg:absolute/lg:absolute internally when
              their own layout needs it, so a positioned ancestor at every
              breakpoint is simplest — desktop's outcome is identical either
              way since it was already `lg:relative` there. See
              leaderboard.tsx / chat-panel.tsx's own comments.
              lg:self-start: don't stretch to match the middle/chat columns'
              height at desktop — stay sized to however many players there are. */}
          <div className="relative lg:order-1 lg:self-start max-lg:min-w-0 max-lg:flex-1">
            <Leaderboard myPlayerId={myPlayerId} />
          </div>

          <div className="relative lg:order-3 max-lg:min-w-0 max-lg:flex-1">
            <ChatPanel
              roomCode={roomCode}
              live={live}
              isSpectator={isSpectator}
              myPlayerId={myPlayerId}
              roundId={round.id}
              mobileRow
            />
          </div>
        </div>

        {/* Row 3 — full-viewport-width, edge to edge like skribbl's input,
            not confined to the chat column's width the way it's nested
            inside ChatPanel at desktop (where lg:hidden removes this copy
            entirely, since ChatPanel's own footer input is visible there).
            Same GuessInput component, same store-backed `solved` state —
            see guess-input.tsx's own comment on why two instances agree. */}
        <div className="lg:hidden max-lg:shrink-0">
          <GuessInput
            roomCode={roomCode}
            live={live}
            isSpectator={isSpectator}
            myPlayerId={myPlayerId}
            roundId={round.id}
          />
        </div>
      </div>
    </div>
  );
}
