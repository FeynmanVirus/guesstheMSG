"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion } from "motion/react";
import { avatarSrc } from "@/lib/avatars";
import { supabase } from "@/lib/supabase/client";
import { useRoomStore } from "@/lib/room/store";
import type { RoundInfo } from "@/lib/room/types";

interface RoundRecapProps {
  round: RoundInfo;
}

interface TopScorer {
  playerId: string;
  points: number;
}

const RANK_MEDAL = ["🥇", "🥈", "🥉"];

// The brief, non-skippable transition between rounds (DESIGN.md §2.5):
// reveal the answer and the round's top 3 scorers. round-tick advances the
// round on its own timer — this overlay is purely a read of what round-tick
// already wrote, and it auto-dismisses the instant a new round row replaces
// this one (the parent stops rendering it).
//
// The outer <AnimatePresence> that used to live here has moved up to the
// parent (room-game.tsx), which now owns the fade in/out for this whole
// overlay alongside the round-to-round transition — a component can't
// animate its own unmount by wrapping itself.
export function RoundRecap({ round }: RoundRecapProps) {
  const players = useRoomStore((s) => s.players);
  // The parent keys this component by round.id, so a new round remounts it
  // and this starts back at `undefined` on its own — no reset needed here.
  const [top, setTop] = useState<TopScorer[] | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    supabase
      .from("guesses")
      .select("player_id, points_awarded")
      .eq("round_id", round.id)
      .eq("is_correct", true)
      .order("points_awarded", { ascending: false })
      .order("submitted_at", { ascending: true }) // deterministic tie-break
      .limit(3)
      .then(({ data, error }) => {
        if (cancelled) return;
        // A real query error (RLS/network) must not render as "nobody
        // guessed" — that's a false claim, not a fallback. Leaving `top` at
        // `undefined` here just keeps the list blank rather than asserting
        // an outcome the query couldn't confirm.
        if (error) {
          console.error("round-recap: failed to load top scorers", error);
          return;
        }
        setTop((data ?? []).map((r) => ({ playerId: r.player_id, points: r.points_awarded })));
      });

    return () => {
      cancelled = true;
    };
  }, [round.id]);

  return (
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

        {top === undefined ? null : top.length > 0 ? (
          <div className="space-y-2 text-left">
            <p className="text-center text-sm text-ink-muted">Top scorers</p>
            <ul className="space-y-2">
              {top.map((row, i) => {
                const p = players.get(row.playerId);
                if (!p) return null;
                return (
                  <li
                    key={row.playerId}
                    className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2 ${
                      i === 0 ? "border-sun bg-sun/10" : "border-ink/15 bg-surface"
                    }`}
                  >
                    <span className="w-5 text-center text-sm" aria-hidden>
                      {RANK_MEDAL[i]}
                    </span>
                    <Image
                      src={avatarSrc(p.avatarId)}
                      alt=""
                      width={32}
                      height={32}
                      className="size-8 rounded-full border-2 border-ink/40"
                      unoptimized
                    />
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                      {p.displayName}
                    </p>
                    <p className="font-heading text-lg font-semibold text-sun">+{row.points}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">Nobody guessed it this round.</p>
        )}

        <p className="text-xs text-ink-muted">Next round starting…</p>
      </motion.div>
    </motion.div>
  );
}
