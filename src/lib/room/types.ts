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
  name: string;
  /** rooms.settings.rounds. Readable by members (settings holds no secret —
   * the answer lives in `words`, which has no client policy at all), and
   * needed for the "Round N of M" label. */
  totalRounds: number;
  /** rooms.settings.seconds_per_round — the lobby header's settings summary. */
  secondsPerRound: number;
  /** rooms.categories.name, joined through category_id — null means the
   * "mixed" sentinel (rooms.category_id is null), not a missing category. */
  categoryName: string | null;
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
 * never receives them at all, so this field is for styling, not filtering.
 *
 * `pending` is a client-only flag, true only for a local echo whose verdict
 * hasn't come back yet (guess-input.tsx) — never set on a row that arrived
 * from the server. It exists so the echo can render as "still evaluating"
 * instead of a fully-committed message that then vanishes if the guess
 * turns out correct (store.ts's stripEchoes still removes/replaces it the
 * same way either way; this only changes how it looks in the meantime). */
export interface ChatMessage {
  id: string;
  playerId: string;
  body: string;
  kind: "chat" | "guess" | "system";
  visibility: "all" | "correct";
  roundId: string | null;
  createdAt: string;
  pending?: boolean;
}

export type LobbyPhase = "loading" | "redirecting" | "lobby" | "starting";
