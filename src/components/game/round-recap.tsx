"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "motion/react";
import { avatarSrc } from "@/lib/avatars";
import { supabase } from "@/lib/supabase/client";
import { useRoomStore } from "@/lib/room/store";
import type { RoundInfo } from "@/lib/room/types";

interface RoundRecapProps {
  round: RoundInfo;
}

interface FirstGuesser {
  playerId: string;
  points: number;
}

// The brief, non-skippable transition between rounds (DESIGN.md §2.5):
// reveal the answer, call out who got it first, and how many points they
// got. round-tick advances the round on its own timer — this overlay is
// purely a read of what round-tick already wrote, and it auto-dismisses the
// instant a new round row replaces this one (the parent stops rendering it).
export function RoundRecap({ round }: RoundRecapProps) {
  const players = useRoomStore((s) => s.players);
  // The parent keys this component by round.id, so a new round remounts it
  // and this starts back at `undefined` on its own — no reset needed here.
  const [first, setFirst] = useState<FirstGuesser | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    supabase
      .from("guesses")
      .select("player_id, points_awarded")
      .eq("round_id", round.id)
      .eq("is_correct", true)
      .order("submitted_at", { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        // A real query error (RLS/network) must not render as "nobody
        // guessed" — that's a false claim, not a fallback. Leaving `first`
        // at `undefined` here just keeps the winner slot blank rather than
        // asserting an outcome the query couldn't confirm.
        if (error) {
          console.error("round-recap: failed to load first correct guess", error);
          return;
        }
        setFirst(data ? { playerId: data.player_id, points: data.points_awarded } : null);
      });

    return () => {
      cancelled = true;
    };
  }, [round.id]);

  const winner = first ? players.get(first.playerId) : null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-6"
        role="dialog"
        aria-label="Round recap"
      >
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="doodle-card w-full max-w-sm space-y-4 p-6 text-center"
        >
          <p className="text-sm text-ink-muted">The answer was</p>
          <p className="font-heading text-3xl font-semibold text-ink capitalize">
            {round.revealedAnswer ?? "…"}
          </p>

          {first === undefined ? null : winner ? (
            <div className="flex items-center justify-center gap-3 rounded-xl border-2 border-sun bg-sun/10 px-4 py-3">
              <Image
                src={avatarSrc(winner.avatarId)}
                alt=""
                width={36}
                height={36}
                className="size-9 rounded-full border-2 border-ink/40"
                unoptimized
              />
              <p className="text-sm text-ink">
                <span className="font-semibold">{winner.displayName}</span> got it first
                <span className="font-heading ml-1 font-semibold text-sun">+{first!.points}</span>
              </p>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">Nobody guessed it this round.</p>
          )}

          <p className="text-xs text-ink-muted">Next round starting…</p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
