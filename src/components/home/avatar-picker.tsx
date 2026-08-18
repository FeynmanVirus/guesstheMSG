"use client";

import Image from "next/image";
import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { Check } from "lucide-react";
import { AVATAR_IDS, avatarSrc, type AvatarId } from "@/lib/avatars";

interface AvatarPickerProps {
  value: AvatarId;
  onChange: (id: AvatarId) => void;
}

// Built directly on the base-ui Radio primitives (not the shadcn
// RadioGroupItem wrapper) — that wrapper bakes in a small dot-indicator
// layout meant for text option lists, not a grid of clickable avatar tiles.
// Selection state is shown via border + a Check badge, never color alone
// (DESIGN.md §3 accessibility guardrail).
export function AvatarPicker({ value, onChange }: AvatarPickerProps) {
  return (
    <RadioGroupPrimitive
      value={value}
      onValueChange={(next) => onChange(next as AvatarId)}
      aria-label="Choose an avatar"
      className="grid grid-cols-4 gap-3 sm:grid-cols-6"
    >
      {AVATAR_IDS.map((id) => (
        <RadioPrimitive.Root
          key={id}
          value={id}
          className="group relative flex items-center justify-center rounded-full border-2 border-ink/25 p-0.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sky data-checked:border-ink data-checked:ring-2 data-checked:ring-sky"
        >
          <Image
            src={avatarSrc(id)}
            alt={`Avatar option ${id}`}
            width={56}
            height={56}
            className="size-14 rounded-full"
            unoptimized
          />
          <span className="absolute -right-1 -bottom-1 hidden size-5 items-center justify-center rounded-full border-2 border-ink bg-sage group-data-checked:flex">
            <Check className="size-3 text-ink" aria-hidden />
          </span>
        </RadioPrimitive.Root>
      ))}
    </RadioGroupPrimitive>
  );
}
