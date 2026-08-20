"use client";

import { useEffect, useRef } from "react";
import { Check, Clock, Lock } from "lucide-react";
import { useRoomStore } from "@/lib/room/store";

interface MessageStreamProps {
  myPlayerId: string | null;
}

// The combined chat/guess stream (DESIGN.md §2.4). Three row kinds:
//   system     — "<name> guessed correctly +125". Never the answer itself.
//   chat/all   — ordinary talk, everyone sees it.
//   chat/correct — winners' chat, green. RLS decides who receives these at
//                  all, so if a row is here the viewer is entitled to it.
export function MessageStream({ myPlayerId }: MessageStreamProps) {
  const messages = useRoomStore((s) => s.messages);
  const players = useRoomStore((s) => s.players);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  return (
    <div className="doodle-card flex h-64 flex-col overflow-y-auto p-3" aria-live="polite">
      {messages.length === 0 ? (
        <p className="m-auto text-sm text-ink-muted">No messages yet — start guessing.</p>
      ) : (
        <ul className="space-y-1.5">
          {messages.map((message) => {
            const name = players.get(message.playerId)?.displayName ?? "Someone";
            const isSelf = message.playerId === myPlayerId;

            if (message.kind === "system") {
              return (
                <li
                  key={message.id}
                  className="flex items-center gap-2 rounded-lg bg-sage/25 px-2 py-1 text-sm font-semibold text-ink"
                >
                  <Check className="size-4 shrink-0" aria-hidden />
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
                className={`px-2 py-0.5 text-sm ${
                  message.pending
                    ? "text-ink-muted opacity-60"
                    : winners
                      ? "rounded-lg bg-sage/15 text-ink"
                      : "text-ink"
                }`}
              >
                {message.pending ? (
                  <Clock className="mr-1 inline size-3 shrink-0 animate-pulse align-[-1px]" aria-hidden />
                ) : (
                  winners && (
                    <Lock className="mr-1 inline size-3 shrink-0 align-[-1px]" aria-hidden />
                  )
                )}
                <span className={winners && !message.pending ? "font-semibold" : "font-semibold text-ink-muted"}>
                  {name}
                  {isSelf ? " (you)" : ""}:
                </span>{" "}
                <span className="break-words">{message.body}</span>
              </li>
            );
          })}
        </ul>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
