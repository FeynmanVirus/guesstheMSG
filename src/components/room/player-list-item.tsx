import Image from "next/image";
import { avatarSrc } from "@/lib/avatars";
import { HostBadge } from "@/components/room/host-badge";
import { ConnectionIndicator } from "@/components/room/connection-indicator";
import type { RoomPlayer } from "@/lib/room/types";

interface PlayerListItemProps {
  player: RoomPlayer;
  isSelf: boolean;
  connected: boolean;
}

export function PlayerListItem({ player, isSelf, connected }: PlayerListItemProps) {
  return (
    <li
      className={`flex items-center gap-3 rounded-xl border-2 border-ink/15 bg-surface px-3 py-2 transition-opacity ${
        connected ? "" : "opacity-60"
      }`}
    >
      <Image
        src={avatarSrc(player.avatarId)}
        alt=""
        width={40}
        height={40}
        className="size-10 rounded-full border-2 border-ink/40"
        unoptimized
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">
          {player.displayName}
          {isSelf && <span className="text-ink-muted"> (you)</span>}
        </p>
        <div className="flex items-center gap-3">
          {player.isHost && <HostBadge />}
          <ConnectionIndicator connected={connected} />
        </div>
      </div>
    </li>
  );
}
