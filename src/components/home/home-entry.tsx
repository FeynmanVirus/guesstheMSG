"use client";

import { useEffect, useState } from "react";
import { Sparkles, LogIn } from "lucide-react";
import { PopButton } from "@/components/doodle/pop-button";
import { Squiggle } from "@/components/doodle/squiggle";
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
    <div className="doodle-card mx-auto w-full max-w-md space-y-5 p-6 sm:p-8">
      {mode === "idle" ? (
        <div className="flex flex-col items-center gap-0.5 text-center">
          <p className="font-heading text-5xl font-bold text-ink sm:text-6xl">Guessmoji</p>
          <p className="mt-1 text-2xl" aria-hidden>
            🍿 🕵️ 🎬
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMode("idle")}
            aria-label="Back"
            className="doodle-btn flex size-9 shrink-0 items-center justify-center text-base font-bold text-ink"
          >
            ←
          </button>
          <p className="font-heading text-3xl font-bold text-ink">
            {mode === "create" ? "Create room" : "Join room"}
          </p>
        </div>
      )}

      {mode === "idle" ? (
        <Squiggle color="sun" className="mx-auto" />
      ) : (
        <div className={`h-0 border-t-2 border-dashed ${mode === "create" ? "border-coral" : "border-sky"}`} />
      )}

      {/* Always rendered, not just on the idle screen — a direct room link
          (/?code=XXX) opens straight into mode="join" (see initialCode
          below), so a first-time visitor with nothing in localStorage still
          needs a way to enter a name before they can actually join
          (DESIGN.md §2.6). It used to live inside the idle-only branch,
          which stranded that exact visitor on "fill out the highlighted
          field" with no visible name field anywhere. */}
      <IdentityFields
        displayName={displayName}
        onDisplayNameChange={setDisplayName}
        avatarId={avatarId}
        onAvatarIdChange={setAvatarId}
      />

      {mode === "idle" ? (
        <>
          <div className="space-y-2">
            <div className="flex flex-col gap-3">
              <PopButton
                accent="coral"
                icon={<Sparkles className="size-5" aria-hidden />}
                title="Create Room"
                subtitle="set the rules, invite friends"
                disabled={!canProceed || starting}
                onClick={() => startFlow("create")}
              />
              <PopButton
                accent="sky"
                icon={<LogIn className="size-5" aria-hidden />}
                title="Join Room"
                subtitle="got a code? hop in"
                disabled={!canProceed || starting}
                onClick={() => startFlow("join")}
              />
            </div>
            {!canProceed && (
              <p className="text-center text-sm text-ink-muted">Enter your name to continue.</p>
            )}
          </div>

          <p className="text-center text-xs font-semibold text-ink-muted">how to play</p>
        </>
      ) : mode === "create" ? (
        <CreateRoomForm displayName={displayName.trim()} avatarId={avatarId} />
      ) : (
        <JoinRoomForm displayName={displayName.trim()} avatarId={avatarId} initialCode={initialCode} />
      )}
    </div>
  );
}
