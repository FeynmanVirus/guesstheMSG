"use client";

import { cn } from "@/lib/utils";

// Pill toggle — category, time-per-round, and custom-word chips in the
// create/rematch forms. Selection reads via border weight + offset shadow,
// not color alone (DESIGN.md §3 accessibility guardrail); the fill color is
// the caller's one accent for that group.
const ACCENT_BG: Record<string, string> = {
  sun: "bg-sun",
  coral: "bg-coral",
  sky: "bg-sky",
  sage: "bg-sage",
  lavender: "bg-lavender",
};

interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  accent?: keyof typeof ACCENT_BG;
}

// No default aria-pressed here: a lone toggle chip wants aria-pressed, but a
// chip in an exclusive group (category, time-per-round) wants role="radio" +
// aria-checked instead — that's the caller's call, passed through via
// ...props rather than guessed here.
export function Chip({ selected, accent = "coral", className, children, ...props }: ChipProps) {
  return (
    <button
      type="button"
      data-selected={selected}
      className={cn(
        "doodle-chip px-4 py-2 text-sm font-bold text-ink",
        selected && ACCENT_BG[accent],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
