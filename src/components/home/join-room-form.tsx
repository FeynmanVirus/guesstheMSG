"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Lock } from "lucide-react";
import { Label } from "@/components/ui/label";
import { PopButton } from "@/components/doodle/pop-button";
import { RoomCodeInput } from "@/components/home/room-code-input";
import { FormError } from "@/components/home/form-error";
import { ensureAnonSession } from "@/lib/supabase/client";
import { callFunction } from "@/lib/api";
import { saveIdentity, saveRoomCode } from "@/lib/identity";
import type { AvatarId } from "@/lib/avatars";
import { normalizeRoomCode } from "@shared/room-code";

interface JoinRoomFormProps {
  displayName: string;
  avatarId: AvatarId;
  initialCode?: string;
}

interface JoinRoomData {
  roomCode: string;
}

export function JoinRoomForm({ displayName, avatarId, initialCode }: JoinRoomFormProps) {
  const router = useRouter();
  const passwordRef = useRef<HTMLInputElement>(null);

  const [roomCode, setRoomCode] = useState(initialCode ? normalizeRoomCode(initialCode) : "");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPasswordError(null);
    setSubmitting(true);
    try {
      await ensureAnonSession();
      const result = await callFunction<JoinRoomData>("join-room", {
        roomCode,
        displayName,
        avatarId,
        password: password || null,
      });

      if (!result.ok) {
        // The client can't pre-check whether a room needs a password — RLS
        // means `rooms` isn't readable before membership exists — so these
        // two outcomes are expected, not exceptional, and get resolved
        // right where the user's attention already is.
        if (result.error.code === "PASSWORD_REQUIRED" || result.error.code === "INVALID_PASSWORD") {
          setPasswordError(result.error.message);
          passwordRef.current?.focus();
          return;
        }
        setError(result.error.message);
        return;
      }

      saveIdentity(displayName, avatarId);
      saveRoomCode(result.data.roomCode);
      router.push(`/room/${result.data.roomCode}`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormError message={error} />

      <div className="space-y-2">
        {/* No htmlFor: this labels the whole 6-box group (aria-label="Room
            code" on its own container), not a single focusable input. */}
        <Label className="text-xs font-bold tracking-[0.14em] text-ink-muted uppercase">
          Room code
        </Label>
        <RoomCodeInput value={roomCode} onChange={setRoomCode} />
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor="join-password"
          className="text-xs font-bold tracking-[0.14em] text-ink-muted uppercase"
        >
          Password
        </Label>
        <div className="flex items-center gap-2 rounded-2xl border-[2.5px] border-ink bg-surface pr-3.5 shadow-panel focus-within:ring-2 focus-within:ring-sky">
          <input
            id="join-password"
            ref={passwordRef}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="enter if asked"
            autoComplete="current-password"
            className="h-auto flex-1 rounded-2xl bg-transparent px-3.5 py-3 text-lg font-extrabold text-ink outline-none placeholder:text-placeholder"
          />
          <Lock className="size-4.5 shrink-0 text-ink-muted" aria-hidden />
        </div>
        {passwordError && <p className="text-sm text-coral">{passwordError}</p>}
      </div>

      <PopButton
        accent="sky"
        icon={<Bell className="size-5" aria-hidden />}
        title="Knock knock"
        subtitle="join the room"
        type="submit"
        disabled={submitting}
        className="w-full"
      />
    </form>
  );
}
