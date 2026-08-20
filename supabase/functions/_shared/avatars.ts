// Avatar id catalogue. An avatar is an emoji on a colored circle (DESIGN.md
// §3) — no image asset, no runtime API call, nothing to pre-render.
// `players.avatar_id` stores one of these ids as plain text (no DB check
// constraint; isValidAvatarId is the only gate, enforced here and by every
// caller that accepts a client-supplied avatarId).

export const AVATAR_IDS = [
  "fox",
  "frog",
  "penguin",
  "unicorn",
  "octopus",
  "koala",
  "bee",
  "whale",
  "owl",
  "flamingo",
  "turtle",
  "dice",
] as const;

export type AvatarId = (typeof AVATAR_IDS)[number];

export const DEFAULT_AVATAR_ID: AvatarId = AVATAR_IDS[0];

/** One of the five DESIGN.md §3 accents, used as the circle fill. */
export type AvatarAccent = "sage" | "sun" | "sky" | "lavender" | "coral";

export const AVATAR_FACE: Record<AvatarId, { emoji: string; accent: AvatarAccent }> = {
  fox: { emoji: "🦊", accent: "sage" },
  frog: { emoji: "🐸", accent: "sun" },
  penguin: { emoji: "🐧", accent: "sky" },
  unicorn: { emoji: "🦄", accent: "lavender" },
  octopus: { emoji: "🐙", accent: "coral" },
  koala: { emoji: "🐨", accent: "sage" },
  bee: { emoji: "🐝", accent: "sun" },
  whale: { emoji: "🐳", accent: "sky" },
  owl: { emoji: "🦉", accent: "lavender" },
  flamingo: { emoji: "🦩", accent: "coral" },
  turtle: { emoji: "🐢", accent: "sage" },
  dice: { emoji: "🎲", accent: "sun" },
};

export function isValidAvatarId(value: unknown): value is AvatarId {
  return typeof value === "string" && (AVATAR_IDS as readonly string[]).includes(value);
}
