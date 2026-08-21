"use client";

import { useEffect, useState } from "react";
import { Podium, type PodiumEntry } from "@/components/doodle/podium";
import { Squiggle } from "@/components/doodle/squiggle";
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

// The centre column's alternate state once a round ends (mockup frame 1f):
// reveals the answer and the round's top 3 scorers. Unlike the old fixed
// overlay this used to be, the leaderboard and chat panel keep running
// behind it — the parent (room-game.tsx) swaps just this one column and
// owns the swap animation, so this component renders as plain content.
// round-tick advances the round on its own timer; this is purely a read of
// what it already wrote, and it auto-dismisses the instant a new round row
// replaces this one (the parent stops rendering it).
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
        // `undefined` here just keeps the podium blank rather than
        // asserting an outcome the query couldn't confirm.
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

  const entries: PodiumEntry[] = (top ?? []).flatMap((row) => {
    const p = players.get(row.playerId);
    return p
      ? [{ playerId: p.id, avatarId: p.avatarId, displayName: p.displayName, points: row.points }]
      : [];
  });

  return (
    // max-lg:h-full max-lg:min-h-0: matches emoji-card.tsx's mobile floor
    // swap — the stage cell (room-game.tsx) caps this at 36dvh on a phone,
    // and the recap has to fit inside that same cap when it's showing.
    <div className="doodle-panel flex min-h-[420px] flex-col items-center gap-2.5 p-5 text-center max-lg:h-full max-lg:min-h-0 max-lg:justify-center max-lg:gap-1.5 max-lg:py-3 lg:min-h-[560px]">
      <p className="text-xs font-bold tracking-[0.16em] text-ink-muted uppercase max-lg:hidden">
        round {round.roundNumber} solved
      </p>
      <Squiggle color="lavender" width={160} className="max-lg:hidden" />
      <p className="mt-1 font-heading text-3xl font-bold text-ink capitalize max-lg:mt-0 max-lg:text-xl">
        {round.revealedAnswer ?? "…"}
      </p>

      <div className="flex w-full flex-1 items-end px-4 max-lg:flex-none max-lg:px-0">
        {top === undefined ? null : entries.length > 0 ? (
          <Podium entries={entries} />
        ) : (
          <p className="m-auto text-sm text-ink-muted">Nobody guessed it this round.</p>
        )}
      </div>

      <p className="w-full border-t-2 border-dashed border-hairline pt-3.5 text-sm font-semibold text-ink-muted max-lg:hidden">
        next round starting…
      </p>
    </div>
  );
}
