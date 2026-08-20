"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AvatarPicker } from "@/components/home/avatar-picker";
import { Avatar } from "@/components/doodle/avatar";
import type { AvatarId } from "@/lib/avatars";

interface IdentityFieldsProps {
  displayName: string;
  onDisplayNameChange: (value: string) => void;
  avatarId: AvatarId;
  onAvatarIdChange: (id: AvatarId) => void;
}

// DESIGN.md §2.1: name + avatar are required "before either action is
// available". The avatar grid used to sit open at all times below the name
// field — now it's a trigger beside the input that expands into a popover,
// so the resting screen reads as one field, not a field plus a permanent
// picker.
export function IdentityFields({
  displayName,
  onDisplayNameChange,
  avatarId,
  onAvatarIdChange,
}: IdentityFieldsProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="space-y-1.5">
      <Label htmlFor="display-name">Your name</Label>
      <div className="flex items-center gap-2.5">
        <Input
          id="display-name"
          value={displayName}
          onChange={(e) => onDisplayNameChange(e.target.value)}
          placeholder="What should we call you?"
          maxLength={24}
          autoComplete="off"
          className="h-12 flex-1 text-base"
        />
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger
            aria-label="Choose your avatar"
            className="doodle-btn relative size-12 shrink-0 bg-surface p-0 outline-none focus-visible:ring-2 focus-visible:ring-sky"
          >
            <Avatar avatarId={avatarId} className="size-full text-2xl" />
            <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full border-2 border-ink bg-lavender">
              <Pencil className="size-2.5 text-ink" aria-hidden />
            </span>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto">
            <p className="mb-3 text-sm font-medium text-ink">Pick an avatar</p>
            <AvatarPicker
              value={avatarId}
              onChange={(id) => {
                onAvatarIdChange(id);
                setPickerOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
