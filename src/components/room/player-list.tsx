import { PlayerListItem } from "@/components/room/player-list-item";
import type { RoomPlayer } from "@/lib/room/types";

interface PlayerListProps {
  players: RoomPlayer[];
  myPlayerId: string | null;
  offlineIds: Set<string>;
}

export function PlayerList({ players, myPlayerId, offlineIds }: PlayerListProps) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-ink-muted">
        {players.length} player{players.length === 1 ? "" : "s"}
      </p>
      {players.length === 0 ? (
        <p className="text-ink-muted">No one&apos;s here yet.</p>
      ) : (
        <ul className="space-y-2">
          {players.map((player) => (
            <PlayerListItem
              key={player.id}
              player={player}
              isSelf={player.id === myPlayerId}
              connected={!offlineIds.has(player.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
