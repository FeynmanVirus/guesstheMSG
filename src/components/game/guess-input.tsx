"use client";

import { useState } from "react";
import { Check, Lock, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { callFunction } from "@/lib/api";
import { playDing } from "@/lib/sounds";

interface GuessInputProps {
  roomCode: string;
  disabled: boolean;
  isSpectator: boolean;
}

interface GuessResult {
  kind: "chat" | "guess";
  correct?: boolean;
  points?: number;
  firstCorrect?: boolean;
}

// One input serves chat and guesses both (DESIGN.md §2.4). The client has no
// idea whether what you typed was right — submit-guess answers that, and its
// direct HTTP response (not the realtime round-trip) is what drives the
// green state and the ding, so the feedback is immediate.
// The parent keys this component by round.id, so a new round remounts it
// and "solved" naturally starts back at false — no reset effect needed.
export function GuessInput({ roomCode, disabled, isSpectator }: GuessInputProps) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [solved, setSolved] = useState(false);
  const [flash, setFlash] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const result = await callFunction<GuessResult>("submit-guess", { roomCode, text: value });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setText("");
      if (result.data.correct) {
        setSolved(true);
        setFlash(true);
        playDing();
        window.setTimeout(() => setFlash(false), 1200);
      }
    } catch {
      setError("Couldn't send that. Check your connection.");
    } finally {
      setSubmitting(false);
    }
  }

  const placeholder = isSpectator
    ? "Spectating — chat only"
    : solved
      ? "You're in the winners' chat"
      : "Type your guess…";

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          maxLength={200}
          disabled={disabled || submitting}
          aria-label={solved ? "Message the winners' chat" : "Your guess or message"}
          className={`h-11 rounded-full border-2 px-4 transition-colors ${
            flash
              ? "border-sage bg-sage/40"
              : solved
                ? "border-sage bg-sage/15"
                : "border-ink"
          }`}
        />
        <Button
          type="submit"
          disabled={disabled || submitting || text.trim().length === 0}
          aria-label="Send"
          className="doodle-btn bg-sun px-4 text-ink hover:bg-sun/90"
        >
          <Send className="size-4" aria-hidden />
        </Button>
      </div>

      {/* Icon + text, never colour alone (DESIGN.md §3). */}
      {solved && (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Check className="size-4 text-sage" aria-hidden />
          Correct!
          <span className="inline-flex items-center gap-1 font-normal text-ink-muted">
            <Lock className="size-3" aria-hidden />
            Only other correct guessers see what you type now.
          </span>
        </p>
      )}

      {error && <p className="text-sm text-coral">{error}</p>}
    </form>
  );
}
