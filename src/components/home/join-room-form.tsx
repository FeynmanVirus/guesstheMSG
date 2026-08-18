"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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

      <div className="space-y-1.5">
        <Label htmlFor="room-code">Room code</Label>
        <Input
          id="room-code"
          value={roomCode}
          onChange={(e) => setRoomCode(normalizeRoomCode(e.target.value))}
          placeholder="FOX-482"
          maxLength={7}
          inputMode="text"
          autoComplete="off"
          className="font-heading text-lg tracking-wider"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="join-password">Password (if the room has one)</Label>
        <Input
          id="join-password"
          ref={passwordRef}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        {passwordError && <p className="text-sm text-coral">{passwordError}</p>}
      </div>

      <Button type="submit" disabled={submitting} className="doodle-btn w-full">
        {submitting ? "Joining…" : "Join room"}
      </Button>
    </form>
  );
}
