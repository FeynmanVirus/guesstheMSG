"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/home/form-error";
import { callFunction } from "@/lib/api";
import { MIN_PLAYERS_TO_START } from "@shared/settings";

interface StartGameButtonProps {
  roomCode: string;
  presentPlayerCount: number;
}

// Rendered only when the caller is host and the room is still in 'lobby'
// (parent's call). Gated on presence-visible player count client-side —
// stricter than the server, which can only see seated players — so a forged
// invoke still can't start a 1-player game even if this button is bypassed.
export function StartGameButton({ roomCode, presentPlayerCount }: StartGameButtonProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const notEnough = presentPlayerCount < MIN_PLAYERS_TO_START;

  async function handleClick() {
    setError(null);
    setSubmitting(true);
    try {
      const result = await callFunction("start-game", { roomCode });
      if (!result.ok) {
        setError(result.error.message);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-2">
      <FormError message={error} />
      <Button
        type="button"
        onClick={handleClick}
        disabled={notEnough || submitting}
        className="doodle-btn w-full bg-sun text-ink hover:bg-sun/90"
      >
        {submitting ? "Starting…" : "Start Game"}
      </Button>
      {notEnough && (
        <p className="text-sm text-ink-muted">Need at least {MIN_PLAYERS_TO_START} players to start.</p>
      )}
    </div>
  );
}
