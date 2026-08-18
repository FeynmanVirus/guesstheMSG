"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AvatarPicker } from "@/components/home/avatar-picker";
import type { AvatarId } from "@/lib/avatars";

interface IdentityFieldsProps {
  displayName: string;
  onDisplayNameChange: (value: string) => void;
  avatarId: AvatarId;
  onAvatarIdChange: (id: AvatarId) => void;
}

// DESIGN.md §2.1: name + avatar are visible and required "before either
// action is available" — this lives once at the top of the Home screen,
// shared by both the Create and Join panels below it.
export function IdentityFields({
  displayName,
  onDisplayNameChange,
  avatarId,
  onAvatarIdChange,
}: IdentityFieldsProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="display-name">Your name</Label>
        <Input
          id="display-name"
          value={displayName}
          onChange={(e) => onDisplayNameChange(e.target.value)}
          placeholder="What should we call you?"
          maxLength={24}
          autoComplete="off"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Your avatar</Label>
        <AvatarPicker value={avatarId} onChange={onAvatarIdChange} />
      </div>
    </div>
  );
}
