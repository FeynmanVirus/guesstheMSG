"use client";

import { useState } from "react";
import { UserPlus, Check } from "lucide-react";
import { PlayerListItem } from "@/components/room/player-list-item";
import type { RoomPlayer } from "@/lib/room/types";

interface PlayerListProps {
  players: RoomPlayer[];
  myPlayerId: string | null;
  offlineIds: Set<string>;
}

export function PlayerList({ players, myPlayerId, offlineIds }: PlayerListProps) {
  const [copied, setCopied] = useState(false);

  async function handleInvite() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Nice-to-have — fail silently rather than throw over a copy button.
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-bold tracking-[0.14em] text-ink-muted uppercase">
        Players · {players.length}
      </p>
      {players.length === 0 ? (
        <p className="text-ink-muted">No one&apos;s here yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {players.map((player) => (
            <PlayerListItem
              key={player.id}
              player={player}
              isSelf={player.id === myPlayerId}
              connected={!offlineIds.has(player.id)}
            />
          ))}
          <li>
            <button
              type="button"
              onClick={handleInvite}
              className="doodle-dashed flex h-full w-full flex-col items-center justify-center gap-1 p-3.5 text-ink-muted"
            >
              {copied ? (
                <>
                  <Check className="size-5 text-sage" aria-hidden />
                  <span className="text-xs font-semibold">link copied</span>
                </>
              ) : (
                <>
                  <UserPlus className="size-5" aria-hidden />
                  <span className="text-xs font-semibold">invite a friend</span>
                </>
              )}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
