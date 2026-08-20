"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

// The "– N +" numeric control (rounds, in create/rematch forms). Clamped to
// [min, max] here so a caller can't drive it past the server's own caps —
// those caps stay authoritative (CLAUDE.md rule 7), this is just UI ergonomics.
interface StepperProps {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  step?: number;
  label?: string;
  className?: string;
}

export function Stepper({ value, min, max, onChange, step = 1, label, className }: StepperProps) {
  return (
    <div className={cn("doodle-panel flex items-center justify-between gap-2 px-3 py-2", className)}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
        aria-label={label ? `Decrease ${label}` : "Decrease"}
        className="doodle-btn flex size-8 items-center justify-center disabled:opacity-40"
      >
        <Minus className="size-4" aria-hidden />
      </button>
      <span className="font-heading text-2xl font-bold text-ink" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + step))}
        disabled={value >= max}
        aria-label={label ? `Increase ${label}` : "Increase"}
        className="doodle-btn flex size-8 items-center justify-center bg-sun disabled:opacity-40"
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}
