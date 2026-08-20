"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AvatarPicker } from "@/components/home/avatar-picker";
import { Avatar } from "@/components/doodle/avatar";
import type { AvatarId } from "@/lib/avatars";

interface IdentityFieldsProps {
  displayName: string;
  onDisplayNameChange: (value: string) => void;
  avatarId: AvatarId;
  onAvatarIdChange: (id: AvatarId) => void;
}

// DESIGN.md §2.1: name + avatar are required before either home action is
// available (mockup frame 1a). The avatar grid lives in a centered "pick a
// face" modal — tapping either the avatar circle or the "avatar" pill opens
// it; picking a tile applies immediately, "use this one" just dismisses.
export function IdentityFields({
  displayName,
  onDisplayNameChange,
  avatarId,
  onAvatarIdChange,
}: IdentityFieldsProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="space-y-1.5">
      <Label
        htmlFor="display-name"
        className="text-xs font-bold tracking-[0.14em] text-ink-muted uppercase"
      >
        Your name
      </Label>
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <div className="doodle-panel flex items-center gap-3 px-4 py-3">
          <DialogTrigger
            aria-label="Choose your avatar"
            className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-sky"
          >
            <Avatar avatarId={avatarId} className="size-[46px] text-2xl" />
          </DialogTrigger>

          <Input
            id="display-name"
            value={displayName}
            onChange={(e) => onDisplayNameChange(e.target.value)}
            placeholder="What should we call you?"
            maxLength={24}
            autoComplete="off"
            className="h-auto flex-1 border-0 bg-transparent p-0 font-heading text-xl font-extrabold text-ink shadow-none outline-none focus-visible:ring-0"
          />

          <DialogTrigger className="shrink-0 rounded-full border-[2.5px] border-ink bg-sun px-3.5 py-1.5 text-xs font-bold text-ink">
            ✏️ avatar
          </DialogTrigger>
        </div>

        <DialogContent
          showCloseButton={false}
          className="w-[calc(100%-2rem)] max-w-sm gap-0 rounded-[20px] border-[2.5px] border-ink bg-surface p-4 shadow-paper ring-0"
        >
          <div className="flex items-center justify-between">
            <DialogTitle className="font-heading text-2xl font-bold text-ink">pick a face</DialogTitle>
            <DialogClose
              aria-label="Close"
              className="flex size-7 items-center justify-center rounded-lg border-2 border-ink text-xs font-extrabold text-ink"
            >
              ✕
            </DialogClose>
          </div>

          <AvatarPicker value={avatarId} onChange={onAvatarIdChange} />

          <DialogClose className="doodle-pop mt-3.5 w-full bg-sun py-2.5 text-center font-heading text-lg font-bold text-ink">
            use this one
          </DialogClose>
        </DialogContent>
      </Dialog>
    </div>
  );
}
