import { cn } from "@/lib/utils";

// The hand-drawn wavy divider (DESIGN.md §3: "a hand-drawn wavy/squiggle
// line instead of a straight <hr>"). One path, repeated everywhere the
// mockup uses it (home, lobby, results) — color is the caller's one accent.
const STROKE: Record<string, string> = {
  sun: "var(--color-sun)",
  coral: "var(--color-coral)",
  sky: "var(--color-sky)",
  sage: "var(--color-sage)",
  lavender: "var(--color-lavender)",
};

interface SquiggleProps {
  color?: keyof typeof STROKE;
  width?: number;
  className?: string;
}

export function Squiggle({ color = "sun", width = 200, className }: SquiggleProps) {
  return (
    <svg
      viewBox="0 0 320 12"
      width={width}
      height={Math.round((width / 320) * 12)}
      className={cn("block", className)}
      aria-hidden
    >
      <path
        d="M0 6 Q 20 0 40 6 T 80 6 T 120 6 T 160 6 T 200 6 T 240 6 T 280 6 T 320 6"
        fill="none"
        stroke={STROKE[color]}
        strokeWidth={3}
        strokeLinecap="round"
      />
    </svg>
  );
}
