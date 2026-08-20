"use client";

import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { Avatar } from "@/components/doodle/avatar";
import { AVATAR_IDS, type AvatarId } from "@/lib/avatars";

interface AvatarPickerProps {
  value: AvatarId;
  onChange: (id: AvatarId) => void;
}

// Built directly on the base-ui Radio primitives (not the shadcn
// RadioGroupItem wrapper) — that wrapper bakes in a small dot-indicator
// layout meant for text option lists, not a grid of clickable avatar tiles.
// Selection is a shape change (double ring), not a color change, so it
// doesn't rely on color alone (DESIGN.md §3) — plus base-ui's own
// aria-checked state for screen readers.
export function AvatarPicker({ value, onChange }: AvatarPickerProps) {
  return (
    <RadioGroupPrimitive
      value={value}
      onValueChange={(next) => onChange(next as AvatarId)}
      aria-label="Choose an avatar"
      className="mt-3.5 grid grid-cols-6 gap-2.5"
    >
      {AVATAR_IDS.map((id) => (
        <RadioPrimitive.Root
          key={id}
          value={id}
          className="group flex aspect-square items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-sky"
        >
          <Avatar
            avatarId={id}
            className="size-full text-xl transition-shadow group-data-checked:shadow-[0_0_0_3px_var(--color-paper),0_0_0_5.5px_var(--color-ink)]"
          />
        </RadioPrimitive.Root>
      ))}
    </RadioGroupPrimitive>
  );
}
