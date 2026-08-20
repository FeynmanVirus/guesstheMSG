"use client";

import { useEffect, useRef } from "react";
import { Check, Clock, Lock } from "lucide-react";
import { useRoomStore } from "@/lib/room/store";

interface MessageStreamProps {
  myPlayerId: string | null;
}

// The scrolling body of the chat panel — chat-panel.tsx owns the card
// shell, header, and input footer around this. Three row kinds:
//   system       — "<name> guessed correctly +125". Never the answer itself.
//   chat/all     — ordinary talk, everyone sees it.
//   chat/correct — winners' chat. RLS decides who receives these at all, so
//                  if a row is here the viewer is entitled to it.
export function MessageStream({ myPlayerId }: MessageStreamProps) {
  const messages = useRoomStore((s) => s.messages);
  const players = useRoomStore((s) => s.players);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll this container directly rather than scrollIntoView on a bottom
  // sentinel: now that the panel has a real bounded height (chat-panel.tsx),
  // scrollIntoView would walk every scrollable ancestor including the page
  // itself, so a new message could nudge the whole results page.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-3.5" aria-live="polite">
      {messages.length === 0 ? (
        <p className="flex h-full items-center justify-center text-center text-sm text-ink-muted">
          No messages yet — start guessing.
        </p>
      ) : (
        <ul className="space-y-2">
          {messages.map((message) => {
            const name = players.get(message.playerId)?.displayName ?? "Someone";
            const isSelf = message.playerId === myPlayerId;

            if (message.kind === "system") {
              return (
                <li key={message.id} className="flex items-center gap-1.5 text-sm font-bold text-sage-ink">
                  <Check className="size-3.5 shrink-0" aria-hidden />
                  <span>{message.body}</span>
                </li>
              );
            }

            const winners = message.visibility === "correct";
            // A pending row is a local echo whose verdict hasn't come back
            // yet (guess-input.tsx) — not yet a committed message, since
            // the client doesn't know if it's about to be replaced by a
            // "guessed correctly" line. Dimmed + a clock, never opacity
            // alone (DESIGN.md §3's color-isn't-enough guardrail, applied
            // here to state-isn't-color-alone-either).
            return (
              <li
                key={message.id}
                aria-busy={message.pending}
                className={`text-sm ${message.pending ? "text-ink-muted opacity-60" : "text-ink"}`}
              >
                {message.pending ? (
                  <Clock className="mr-1 inline size-3 shrink-0 animate-pulse align-[-1px]" aria-hidden />
                ) : (
                  winners && (
                    <Lock className="mr-1 inline size-3 shrink-0 align-[-1px] text-sage-ink" aria-hidden />
                  )
                )}
                <span
                  className={`font-extrabold ${
                    winners && !message.pending ? "text-sage-ink" : "text-ink"
                  }`}
                >
                  {name}
                  {isSelf ? " (you)" : ""}:
                </span>{" "}
                <span className="break-words">{message.body}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
