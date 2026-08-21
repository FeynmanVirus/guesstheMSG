"use client";

import { useState } from "react";
import { Check, Lock, Send } from "lucide-react";
import { callFunction } from "@/lib/api";
import { playDing } from "@/lib/sounds";
import { useRoomStore, LOCAL_ECHO_PREFIX } from "@/lib/room/store";

interface GuessInputProps {
  roomCode: string;
  /** Whether the current round is still live (not the recap/results state).
   * Affects only the placeholder copy — submit-guess already accepts a
   * message while not live and posts it as ordinary chat rather than
   * evaluating it as a guess, so there's no correctness reason to ever
   * disable the input while in a room. */
  live: boolean;
  isSpectator: boolean;
  /** For the optimistic echo's playerId. Null only in the impossible
   * pre-bootstrap case, where the echo is simply skipped. */
  myPlayerId: string | null;
  /** Null on screens with no round concept (game-results.tsx). Used to
   * notice a new round has started so `error` can reset (see the
   * render-phase check below) and to scope `solved` to this round via the
   * store's `solvedRoundId` — see the comment above the component. */
  roundId: string | null;
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

// Round trip a normal-looking message would otherwise sit at before a muted
// echo (which never reconciles — see below) gives up and settles. Well
// above the RPC's real latency (a few hundred ms after the
// 20260819150000_submit_guess_rpcs.sql fix) so it never fires before a
// genuine reconciliation would have.
const PENDING_TIMEOUT_MS = 4000;

// One input serves chat and guesses both (DESIGN.md §2.4). The client has no
// idea whether what you typed was right — submit-guess answers that, and its
// direct HTTP response (not the realtime round-trip) is what drives the
// green state and the ding, so that feedback is immediate.
//
// The message itself painting into the shared stream is a separate,
// optimistic path: it's added to the store the instant Send is pressed,
// before the network round-trip even starts, rather than waiting for the
// real chat_messages row to come back over Realtime (WAL -> per-subscriber
// RLS -> WebSocket — a leg no amount of backend speed makes instant). It
// paints as `pending` (message-stream.tsx dims it + shows a clock) rather
// than a fully-committed message: the client can't know yet whether this is
// a normal chat line or about to be retracted for a correct guess, and
// painting it as already-settled is what used to make a correct guess read
// as "it randomly turns green" a second or two later. The store reconciles
// the placeholder against the real row once it lands (store.ts's
// stripEchoes, matched on playerId+body).
//
// The parent used to key this component by round.id so a new round would
// remount it and reset `solved` for free. That also wiped `text` and
// dropped focus on every round transition — losing whatever a player was
// mid-typing the instant a round ended. Now the parent never remounts this;
// instead `roundId` is a prop, and `error` resets via the "adjust state
// during render" pattern below, leaving `text` alone.
//
// The mobile layout (room-game.tsx) mounts TWO of these — one hidden per
// breakpoint, since a full-viewport-width input bar can't live inside a
// half-width chat column. Only one is ever visible, so only one is ever
// typed into, but both must show the same "Correct!" state the instant
// either one's submit resolves. `solved` therefore lives in the room store
// as `solvedRoundId` (compared against this instance's `roundId`, which
// doubles as the per-round reset) rather than local state — see store.ts.
//
// A muted player's echo deliberately never reconciles: submit-guess accepts
// and silently drops their message (no chat_messages row is ever written —
// the shadow-mute design, ARCHITECTURE.md §10), so no real row ever arrives
// to replace the placeholder. That's intentional, not a bug — a muted
// player seeing their own message "stick" is what keeps them from being
// able to probe whether they're muted. PENDING_TIMEOUT_MS is what keeps that
// stuck message from *looking* different too — it settles out of the
// pending state on a timer so it reads as an ordinary sent message instead
// of a spinner that never resolves (which would itself be a tell).
export function GuessInput({ roomCode, live, isSpectator, myPlayerId, roundId }: GuessInputProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const solvedRoundId = useRoomStore((s) => s.solvedRoundId);
  const solved = roundId !== null && solvedRoundId === roundId;

  // Adjust state during render (React's documented alternative to an effect
  // for "reset state when a prop changes") rather than remounting via a
  // `key` — this is what lets `error` reset on a new round while `text`
  // (and DOM focus) survive the transition untouched. `solved` needs no
  // entry here — it's derived from solvedRoundId above, which is already
  // per-round by construction.
  const [prevRoundId, setPrevRoundId] = useState(roundId);
  if (roundId !== prevRoundId) {
    setPrevRoundId(roundId);
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const value = text.trim();
    // No `submitting` guard — sending the next message while a previous one
    // is still in flight is the whole point (each send gets its own echoId
    // below, so nothing collides). Only an empty box blocks a send.
    if (!value) return;

    const echoId = `${LOCAL_ECHO_PREFIX}${crypto.randomUUID()}`;
    const { addMessage, removeMessage, settlePending, setSolvedRoundId, serverOffsetMs } =
      useRoomStore.getState();
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
        pending: true,
      });
      window.setTimeout(() => settlePending(echoId), PENDING_TIMEOUT_MS);
    }

    setText("");
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
        if (roundId) setSolvedRoundId(roundId);
        setFlash(true);
        playDing();
        window.setTimeout(() => setFlash(false), 1200);
      }
    } catch {
      removeMessage(echoId);
      setText(value);
      setError("Couldn't send that. Check your connection.");
    }
  }

  const placeholder = isSpectator
    ? "Spectating — chat only"
    : solved
      ? "You're in the winners' chat"
      : live
        ? "type your guess…"
        : "chat while you wait…";

  return (
    <form onSubmit={handleSubmit} className="border-t-2 border-dashed border-hairline p-3">
      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          maxLength={200}
          // Never disabled — typing (and sending) the next message while a
          // previous one is still in flight is the whole point of the
          // optimistic echo, and submit-guess already accepts a message
          // while the round isn't live and posts it as ordinary chat.
          aria-label={solved ? "Message the winners' chat" : "Your guess or message"}
          className={`h-11 min-w-0 flex-1 rounded-full border-[2.5px] px-4 font-bold text-ink outline-none transition-colors placeholder:font-semibold placeholder:text-placeholder ${
            flash ? "border-sage bg-sage/40" : solved ? "border-sage bg-sage/15" : "border-ink bg-surface"
          }`}
        />
        <button
          type="submit"
          disabled={text.trim().length === 0}
          aria-label="Send"
          className="doodle-btn flex size-9 shrink-0 items-center justify-center bg-lavender text-ink disabled:opacity-50"
        >
          <Send className="size-4" aria-hidden />
        </button>
      </div>

      {/* Icon + text, never colour alone (DESIGN.md §3). */}
      {solved && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink">
          <Check className="size-3.5 text-sage-ink" aria-hidden />
          Correct!
          <span className="inline-flex items-center gap-1 font-normal text-ink-muted">
            <Lock className="size-3" aria-hidden />
            Only other correct guessers see what you type now.
          </span>
        </p>
      )}

      {error && <p className="mt-1.5 text-xs text-coral">{error}</p>}
    </form>
  );
}
