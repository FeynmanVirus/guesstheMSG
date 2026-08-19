// Round settings validation/clamping. CLAUDE.md non-negotiable rule 7:
// "Scoring rules and round settings ... are validated server-side ... a
// malformed or adversarial request (e.g. rounds: 0) must fail gracefully,
// not corrupt the room." clampSettings never throws and never passes through
// an out-of-range value — bad input silently becomes the default, then gets
// clamped, so a room can never end up with rounds:0 or rounds:9999.

export const SETTINGS_BOUNDS = {
  rounds: { min: 3, max: 30, default: 10 },
  secondsPerRound: { min: 15, max: 120, default: 45 },
  maxPlayers: { min: 2, max: 16, default: 16 },
} as const;

// Game-rule bound, not a room setting — how many active, non-spectating
// players start-game requires before the room can leave 'lobby'.
export const MIN_PLAYERS_TO_START = 2;

// How long the per-round recap (answer + who got it first) stays up before
// round-tick advances. DESIGN.md §2.5: "a few seconds, not skippable by
// players". Both round-tick and the client's due-time calculation read this,
// so they can't drift apart.
export const RECAP_SECONDS = 5;

// Not host-editable in this phase's UI, but written now (ARCHITECTURE.md
// §7) so a future start-round/submit-guess phase has a settled formula to
// read rather than inventing one under time pressure.
export const DEFAULT_SCORING = {
  base_points: 100,
  decay_per_second: 5,
  min_points: 20,
  first_guess_bonus: 25,
} as const;

export interface RawSettingsInput {
  rounds?: unknown;
  secondsPerRound?: unknown;
}

export interface RoomSettings {
  rounds: number;
  seconds_per_round: number;
  max_players: number;
  end_round_on_all_correct: boolean;
  scoring: typeof DEFAULT_SCORING;
}

function clampInt(
  value: unknown,
  bounds: { min: number; max: number; default: number },
): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || !Number.isInteger(n)) {
    return bounds.default;
  }
  return Math.min(bounds.max, Math.max(bounds.min, n));
}

/** Always returns a complete, valid settings object — never throws, never
 * echoes an out-of-range or non-numeric value back into storage. */
export function clampSettings(input: RawSettingsInput | undefined | null): RoomSettings {
  return {
    rounds: clampInt(input?.rounds, SETTINGS_BOUNDS.rounds),
    seconds_per_round: clampInt(input?.secondsPerRound, SETTINGS_BOUNDS.secondsPerRound),
    max_players: SETTINGS_BOUNDS.maxPlayers.default,
    end_round_on_all_correct: true,
    scoring: DEFAULT_SCORING,
  };
}
