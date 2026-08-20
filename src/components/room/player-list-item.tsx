import { Avatar } from "@/components/doodle/avatar";
import { HostBadge } from "@/components/room/host-badge";
import { ConnectionIndicator } from "@/components/room/connection-indicator";
import type { RoomPlayer } from "@/lib/room/types";

interface PlayerListItemProps {
  player: RoomPlayer;
  isSelf: boolean;
  connected: boolean;
}

// Card layout (mockup frame 1d): avatar over name over one status pill.
export function PlayerListItem({ player, isSelf, connected }: PlayerListItemProps) {
  return (
    <li
      className={`doodle-panel flex flex-col items-center gap-1.5 p-3.5 text-center transition-opacity ${
        connected ? "" : "opacity-60"
      }`}
    >
      <Avatar avatarId={player.avatarId} className="size-[52px] text-2xl" />
      <p className="w-full truncate font-heading text-base font-bold text-ink">
        {player.displayName}
        {isSelf && <span className="text-ink-muted"> (you)</span>}
      </p>
      {player.isHost ? <HostBadge /> : <ConnectionIndicator connected={connected} />}
    </li>
  );
}
