"use client";

import { useState } from "react";
import { Check, Lock, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { callFunction } from "@/lib/api";
import { playDing } from "@/lib/sounds";
import { useRoomStore, LOCAL_ECHO_PREFIX } from "@/lib/room/store";

interface GuessInputProps {
  roomCode: string;
  disabled: boolean;
  isSpectator: boolean;
  /** For the optimistic echo's playerId. Null only in the impossible
   * pre-bootstrap case, where the echo is simply skipped. */
  myPlayerId: string | null;
}

interface GuessResult {
  kind: "chat" | "guess";
  correct?: boolean;
  points?: number;
  /** True when a winner pasted the answer into winners' chat — submit-guess
   * silently drops it rather than republishing it (round-recap.tsx never
   * shows it either), so there's no real row for the echo to reconcile
   * against and it must be retracted explicitly. */
  dropped?: boolean;
}

// One input serves chat and guesses both (DESIGN.md §2.4). The client has no
// idea whether what you typed was right — submit-guess answers that, and its
// direct HTTP response (not the realtime round-trip) is what drives the
// green state and the ding, so that feedback is immediate.
//
// The message itself painting into the shared stream is a separate,
// optimistic path: it's added to the store the instant Send is pressed,
// before the network round-trip even starts, rather than waiting for the
// real chat_messages row to come back over Realtime (WAL -> per-subscriber
// RLS -> WebSocket — a leg no amount of backend speed makes instant). The
// store reconciles the placeholder against the real row once it lands
// (store.ts's stripEchoes, matched on playerId+body).
//
// The parent keys this component by round.id, so a new round remounts it
// and "solved" naturally starts back at false — no reset effect needed.
//
// A muted player's echo deliberately never reconciles: submit-guess accepts
// and silently drops their message (no chat_messages row is ever written —
// the shadow-mute design, ARCHITECTURE.md §10), so no real row ever arrives
// to replace the placeholder. That's intentional, not a bug — a muted
// player seeing their own message "stick" is what keeps them from being
// able to probe whether they're muted.
export function GuessInput({ roomCode, disabled, isSpectator, myPlayerId }: GuessInputProps) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [solved, setSolved] = useState(false);
  const [flash, setFlash] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value || submitting) return;

    const echoId = `${LOCAL_ECHO_PREFIX}${crypto.randomUUID()}`;
    const { addMessage, removeMessage, serverOffsetMs } = useRoomStore.getState();
    if (myPlayerId) {
      addMessage({
        id: echoId,
        playerId: myPlayerId,
        body: value,
        // message-stream.tsx renders 'chat' and 'guess' identically — only
        // `visibility` changes the styling, and `solved` already tells us
        // which side of the winners'-chat split this lands on.
        kind: "guess",
        visibility: solved ? "correct" : "all",
        roundId: null,
        // Server clock, so a skewed device's echo sorts correctly against
        // rows that already carry a server timestamp (same offset the
        // round timer uses).
        createdAt: new Date(Date.now() + serverOffsetMs).toISOString(),
      });
    }

    setText("");
    setSubmitting(true);
    setError(null);
    try {
      const result = await callFunction<GuessResult>("submit-guess", { roomCode, text: value });
      if (!result.ok) {
        removeMessage(echoId);
        setText(value); // rejected message stays editable, as before
        setError(result.error.message);
        return;
      }
      // Neither outcome produces a real chat_messages row to reconcile
      // against — a correct guess broadcasts a system line, never the text
      // (rule 1); a dropped winners'-chat message is discarded server-side.
      if (result.data.correct || result.data.dropped) removeMessage(echoId);

      if (result.data.correct) {
        setSolved(true);
        setFlash(true);
        playDing();
        window.setTimeout(() => setFlash(false), 1200);
      }
    } catch {
      removeMessage(echoId);
      setText(value);
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
          // Not gated on `submitting` — typing (and sending) the next
          // message while the previous one is still in flight is the whole
          // point of the optimistic echo. The guard in handleSubmit still
          // blocks a double-submit of the same click.
          disabled={disabled}
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
