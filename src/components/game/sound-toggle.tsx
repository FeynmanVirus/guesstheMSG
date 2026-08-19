"use client";

import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { isMuted, setMuted } from "@/lib/sounds";

// DESIGN.md §4: a visible mute toggle for the ding + low-time tick,
// persisted across visits (sounds.ts, localStorage["gtm:muted"]).
//
// localStorage isn't readable during SSR, so this starts "on" and corrects
// itself on mount — a one-frame icon flip beats a hydration mismatch.
export function SoundToggle() {
  const [on, setOn] = useState(true);

  useEffect(() => {
    // Deliberate exception to react-hooks/set-state-in-effect: this restores
    // state from localStorage, which doesn't exist during SSR — there's no
    // way to compute it during render without a hydration mismatch. Runs
    // once on mount only (matches home-entry.tsx's identical justification).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOn(!isMuted());
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        setMuted(on);
        setOn(!on);
      }}
      aria-pressed={!on}
      aria-label={on ? "Mute sound effects" : "Unmute sound effects"}
      className="rounded-full border-2 border-ink/15 p-2 text-ink-muted transition-colors hover:text-ink"
    >
      {on ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
    </button>
  );
}
