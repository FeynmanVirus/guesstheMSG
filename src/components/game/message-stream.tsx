"use client";

import { useEffect, useRef } from "react";
import { Check, Lock } from "lucide-react";
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
            return (
              <li
                key={message.id}
                className={`px-2 py-0.5 text-sm ${
                  winners ? "rounded-lg bg-sage/15 text-ink" : "text-ink"
                }`}
              >
                {winners && (
                  <Lock className="mr-1 inline size-3 shrink-0 align-[-1px]" aria-hidden />
                )}
                <span className={winners ? "font-semibold" : "font-semibold text-ink-muted"}>
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
