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
  score: number;
}

export interface RoomInfo {
  id: string;
  status: RoomStatus;
  /** rooms.settings.rounds. Readable by members (settings holds no secret —
   * the answer lives in `words`, which has no client policy at all), and
   * needed for the "Round N of M" label. */
  totalRounds: number;
}

/** The active (or just-finished) round. `revealedAt`/`revealedAnswer` are
 * null for the whole time a round is live — the server only writes them at
 * reveal, which is what keeps the answer off the client (CLAUDE.md rule 1).
 * `endsAt` is a server timestamp; the countdown is always derived from it,
 * never from a locally-held duration (rule 3). */
export interface RoundInfo {
  id: string;
  roundNumber: number;
  emojiSequence: string;
  startedAt: string;
  endsAt: string;
  revealedAt: string | null;
  revealedAnswer: string | null;
}

/** One row of the combined chat/guess stream. `visibility: 'correct'` rows
 * are the winners' chat — RLS means a player who hasn't guessed correctly
 * never receives them at all, so this field is for styling, not filtering. */
export interface ChatMessage {
  id: string;
  playerId: string;
  body: string;
  kind: "chat" | "guess" | "system";
  visibility: "all" | "correct";
  roundId: string | null;
  createdAt: string;
}

export type LobbyPhase = "loading" | "redirecting" | "lobby" | "starting";
