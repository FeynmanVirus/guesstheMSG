"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { IdentityFields } from "@/components/home/identity-fields";
import { CreateRoomForm } from "@/components/home/create-room-form";
import { JoinRoomForm } from "@/components/home/join-room-form";
import { ensureAnonSession } from "@/lib/supabase/client";
import {
  getSavedDisplayName,
  getSavedAvatarId,
  randomAvatarId,
  saveIdentity,
} from "@/lib/identity";
import { DEFAULT_AVATAR_ID, type AvatarId } from "@/lib/avatars";

type Mode = "idle" | "create" | "join";

interface HomeEntryProps {
  initialCode?: string;
}

export function HomeEntry({ initialCode }: HomeEntryProps) {
  const [displayName, setDisplayName] = useState("");
  // Deterministic default avoids a server/client hydration mismatch — a
  // random pick during SSR wouldn't match the client's random pick.
  // Restored to the saved (or a real random) avatar in the effect below,
  // which only ever runs client-side.
  const [avatarId, setAvatarId] = useState<AvatarId>(DEFAULT_AVATAR_ID);
  const [mode, setMode] = useState<Mode>(initialCode ? "join" : "idle");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    // Deliberate exception to react-hooks/set-state-in-effect: this restores
    // state from localStorage, which doesn't exist during SSR — there's no
    // way to compute it during render without a hydration mismatch (see the
    // avatarId comment above). Runs once on mount only.
    const savedName = getSavedDisplayName();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (savedName) setDisplayName(savedName);
    setAvatarId(getSavedAvatarId() ?? randomAvatarId());
  }, []);

  const canProceed = displayName.trim().length >= 1;

  async function startFlow(next: Mode) {
    if (!canProceed) return;
    setStarting(true);
    try {
      await ensureAnonSession();
      saveIdentity(displayName.trim(), avatarId);
      setMode(next);
    } catch {
      // ensureAnonSession failing (e.g. anonymous auth not yet enabled on
      // the project) shouldn't strand the user on a dead button — surface
      // it the same way a form-level error would once they hit submit.
      setMode(next);
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="doodle-card mx-auto w-full max-w-xl space-y-6 p-6 sm:p-8">
      <IdentityFields
        displayName={displayName}
        onDisplayNameChange={setDisplayName}
        avatarId={avatarId}
        onAvatarIdChange={setAvatarId}
      />

      {mode === "idle" && (
        <div className="space-y-2">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              disabled={!canProceed || starting}
              onClick={() => startFlow("create")}
              className="doodle-btn flex-1 bg-sun text-ink hover:bg-sun/90"
            >
              Create Room
            </Button>
            <Button
              type="button"
              disabled={!canProceed || starting}
              onClick={() => startFlow("join")}
              variant="outline"
              className="doodle-btn flex-1"
            >
              Join Room
            </Button>
          </div>
          {!canProceed && (
            <p className="text-sm text-ink-muted">Enter your name to continue.</p>
          )}
        </div>
      )}

      {mode !== "idle" && (
        <div className="space-y-4 border-t-2 border-dashed border-ink/20 pt-6">
          <button
            type="button"
            onClick={() => setMode("idle")}
            className="text-sm text-sky underline underline-offset-2"
          >
            ← Back
          </button>
          {mode === "create" ? (
            <CreateRoomForm displayName={displayName.trim()} avatarId={avatarId} />
          ) : (
            <JoinRoomForm
              displayName={displayName.trim()}
              avatarId={avatarId}
              initialCode={initialCode}
            />
          )}
        </div>
      )}
    </div>
  );
}
