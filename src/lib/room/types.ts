import type { AvatarId } from "@/lib/avatars";

export type RoomStatus = "lobby" | "in_progress" | "ended";

export interface RoomPlayer {
  id: string;
  displayName: string;
  avatarId: AvatarId;
  isHost: boolean;
  isSpectator: boolean;
  status: "active" | "kicked";
  joinedAt: string;
}

export interface RoomInfo {
  id: string;
  status: RoomStatus;
}

export type LobbyPhase = "loading" | "redirecting" | "lobby" | "starting";
