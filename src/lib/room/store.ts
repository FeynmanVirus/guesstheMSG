"use client";

import { create } from "zustand";
import type { ChatMessage, RoomInfo, RoomPlayer, RoundHint, RoundInfo } from "@/lib/room/types";

const MAX_MESSAGES = 200;

interface RoomState {
  players: Map<string, RoomPlayer>;
  room: RoomInfo | null;
  round: RoundInfo | null;
  /** Written only by use-round-tick.ts, off round-tick's own HTTP response
   * — never by useRoomChannel, so it can't race the realtime round update. */
  hint: RoundHint | null;
  /** The round id GuessInput last got a correct-guess response for. Lives
   * here instead of GuessInput's own local state because the mobile layout
   * mounts two GuessInput instances (one hidden per breakpoint — see
   * room-game.tsx) that must agree on "solved" without either one knowing
   * the other exists. Compared against a round's id, not a bare boolean, so
   * it doubles as its own per-round reset — no separate effect needed. */
  solvedRoundId: string | null;
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
  setHint: (hint: RoundHint | null) => void;
  setSolvedRoundId: (roundId: string | null) => void;
  addMessage: (message: ChatMessage) => void;
  removeMessage: (id: string) => void;
  settlePending: (id: string) => void;
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

/** Prefix for the client-side placeholder guess-input paints before the
 * server round-trip resolves. Never collides with a Postgres uuid. */
export const LOCAL_ECHO_PREFIX = "local-";

/** Drop any local echo an arriving real row supersedes. The real row has a
 * server uuid, so the match is on (playerId, body) — kind/visibility are
 * excluded because the server may classify a message differently than the
 * echo guessed, and both render identically anyway (message-stream.tsx).
 *
 * One-to-one: each real row retires at most one echo, not every echo that
 * matches it. Sends are no longer serialized (guess-input.tsx allows a
 * second Enter while the first is still in flight), so sending the same
 * text twice in a row is a real case now — a many-to-one match would have
 * both echoes vanish on the first real row's arrival, leaving the second
 * message invisible until its own row lands. */
function stripEchoes(messages: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const real = incoming.filter((m) => !m.id.startsWith(LOCAL_ECHO_PREFIX));
  if (real.length === 0) return messages;
  const unclaimed = real.slice();
  return messages.filter((m) => {
    if (!m.id.startsWith(LOCAL_ECHO_PREFIX)) return true;
    const i = unclaimed.findIndex((r) => r.playerId === m.playerId && r.body === m.body);
    if (i === -1) return true;
    unclaimed.splice(i, 1);
    return false;
  });
}

const initial = {
  players: new Map<string, RoomPlayer>(),
  room: null,
  round: null,
  hint: null as RoundHint | null,
  solvedRoundId: null as string | null,
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
  setHint: (hint) => set({ hint }),
  setSolvedRoundId: (roundId) => set({ solvedRoundId: roundId }),

  addMessage: (message) =>
    set((state) => {
      if (state.messages.some((m) => m.id === message.id)) return state;
      const messages = sortMessages([...stripEchoes(state.messages, [message]), message]);
      return { messages: messages.slice(-MAX_MESSAGES) };
    }),

  removeMessage: (id) =>
    set((state) => {
      const messages = state.messages.filter((m) => m.id !== id);
      return messages.length === state.messages.length ? state : { messages };
    }),

  // Fallback for an echo that will never reconcile — a muted player's
  // message (submit-guess accepts and silently drops it, ARCHITECTURE.md
  // §10's shadow mute) has no real row coming. guess-input.tsx clears
  // `pending` on a timer after the normal round trip would long since have
  // resolved it, so a muted player's echo settles into looking exactly
  // like an ordinary sent message — the same "sticks forever" behavior the
  // shadow mute already relied on — rather than showing a pending spinner
  // forever, which would itself be a tell. A no-op if the id already
  // reconciled or was retracted.
  settlePending: (id) =>
    set((state) => {
      const i = state.messages.findIndex((m) => m.id === id);
      if (i === -1 || !state.messages[i].pending) return state;
      const messages = state.messages.slice();
      messages[i] = { ...messages[i], pending: false };
      return { messages };
    }),

  // The catch-up read (on connect/reconnect) needs the same reconciliation
  // as addMessage — it can land while an echo from an in-flight send is
  // still pending.
  mergeMessages: (incoming) =>
    set((state) => {
      const byId = new Map(stripEchoes(state.messages, incoming).map((m) => [m.id, m]));
      for (const message of incoming) byId.set(message.id, message);
      return { messages: sortMessages([...byId.values()]).slice(-MAX_MESSAGES) };
    }),

  setPresence: (presentIds, synced) =>
    set(synced === undefined ? { presentIds } : { presentIds, presenceSynced: synced }),

  setConnection: (connection) => set({ connection }),
  setServerOffset: (serverOffsetMs) => set({ serverOffsetMs }),

  reset: () =>
    set({
      ...initial,
      players: new Map(),
      presentIds: new Set(),
      messages: [],
      hint: null,
      solvedRoundId: null,
    }),
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
