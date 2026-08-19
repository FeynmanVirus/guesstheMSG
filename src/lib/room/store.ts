"use client";

import { create } from "zustand";
import type { ChatMessage, RoomInfo, RoomPlayer, RoundInfo } from "@/lib/room/types";

const MAX_MESSAGES = 200;

interface RoomState {
  players: Map<string, RoomPlayer>;
  room: RoomInfo | null;
  round: RoundInfo | null;
  messages: ChatMessage[];
  presentIds: Set<string>;
  presenceSynced: boolean;
  connection: "connecting" | "live" | "error";
  /** Server clock minus client clock, in ms. Added to Date.now() before
   * comparing against a server timestamp, so a device with a skewed clock
   * doesn't get a wrong countdown. Sampled once per round INSERT. */
  serverOffsetMs: number;

  upsertPlayer: (player: RoomPlayer) => void;
  removePlayer: (id: string) => void;
  mergePlayers: (players: RoomPlayer[]) => void;
  setRoom: (room: RoomInfo | null) => void;
  setRound: (round: RoundInfo | null) => void;
  addMessage: (message: ChatMessage) => void;
  mergeMessages: (messages: ChatMessage[]) => void;
  setPresence: (presentIds: Set<string>, synced?: boolean) => void;
  setConnection: (connection: "connecting" | "live" | "error") => void;
  setServerOffset: (offsetMs: number) => void;
  reset: () => void;
}

function playersEqual(a: RoomPlayer, b: RoomPlayer): boolean {
  return (
    a.displayName === b.displayName &&
    a.avatarId === b.avatarId &&
    a.isHost === b.isHost &&
    a.isSpectator === b.isSpectator &&
    a.status === b.status &&
    a.joinedAt === b.joinedAt &&
    a.score === b.score
  );
}

function sortMessages(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

const initial = {
  players: new Map<string, RoomPlayer>(),
  room: null,
  round: null,
  messages: [] as ChatMessage[],
  presentIds: new Set<string>(),
  presenceSynced: false,
  connection: "connecting" as const,
  serverOffsetMs: 0,
};

// Module-level store: one room per page load, so there's nothing to scope
// per-room. useRoomChannel is the only writer; components read via selectors.
export const useRoomStore = create<RoomState>((set) => ({
  ...initial,

  upsertPlayer: (player) =>
    set((state) => {
      const existing = state.players.get(player.id);
      // A last_seen_at-only heartbeat delta arrives every 5s per host and
      // changes nothing visible — skip it so the leaderboard doesn't churn.
      if (existing && playersEqual(existing, player)) return state;
      const players = new Map(state.players);
      players.set(player.id, player);
      return { players };
    }),

  removePlayer: (id) =>
    set((state) => {
      if (!state.players.has(id)) return state;
      const players = new Map(state.players);
      players.delete(id);
      return { players };
    }),

  mergePlayers: (incoming) =>
    set((state) => {
      const players = new Map(state.players);
      for (const player of incoming) players.set(player.id, player);
      return { players };
    }),

  setRoom: (room) => set({ room }),
  setRound: (round) => set({ round }),

  addMessage: (message) =>
    set((state) => {
      if (state.messages.some((m) => m.id === message.id)) return state;
      const messages = sortMessages([...state.messages, message]);
      return { messages: messages.slice(-MAX_MESSAGES) };
    }),

  mergeMessages: (incoming) =>
    set((state) => {
      const byId = new Map(state.messages.map((m) => [m.id, m]));
      for (const message of incoming) byId.set(message.id, message);
      return { messages: sortMessages([...byId.values()]).slice(-MAX_MESSAGES) };
    }),

  setPresence: (presentIds, synced) =>
    set(synced === undefined ? { presentIds } : { presentIds, presenceSynced: synced }),

  setConnection: (connection) => set({ connection }),
  setServerOffset: (serverOffsetMs) => set({ serverOffsetMs }),

  reset: () => set({ ...initial, players: new Map(), presentIds: new Set(), messages: [] }),
}));

/** Players sorted for the lobby list: host first, then seat age. */
export function sortForLobby(players: RoomPlayer[]): RoomPlayer[] {
  return [...players].sort((a, b) => {
    if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
    return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
  });
}

/** Players sorted for the leaderboard: score desc, then seat age so ties
 * hold a stable order instead of flickering between renders. */
export function sortForLeaderboard(players: RoomPlayer[]): RoomPlayer[] {
  return [...players].sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
  });
}
