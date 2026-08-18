// Avatar id catalogue. Matches the 12 files pre-rendered by
// scripts/generate-avatars.mjs into public/avatars/peep-01.svg..peep-12.svg
// (DESIGN.md §3: "pre-rendered to static SVGs at build time — no runtime
// API calls"). `players.avatar_id` stores one of these ids as plain text.

export const AVATAR_IDS = [
  "peep-01",
  "peep-02",
  "peep-03",
  "peep-04",
  "peep-05",
  "peep-06",
  "peep-07",
  "peep-08",
  "peep-09",
  "peep-10",
  "peep-11",
  "peep-12",
] as const;

export type AvatarId = (typeof AVATAR_IDS)[number];

export const DEFAULT_AVATAR_ID: AvatarId = AVATAR_IDS[0];

export function isValidAvatarId(value: unknown): value is AvatarId {
  return typeof value === "string" && (AVATAR_IDS as readonly string[]).includes(value);
}
