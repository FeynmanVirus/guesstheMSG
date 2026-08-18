export { AVATAR_IDS, DEFAULT_AVATAR_ID, isValidAvatarId, type AvatarId } from "@shared/avatars";
import type { AvatarId } from "@shared/avatars";

/** Static path for a pre-generated avatar SVG — see
 * scripts/generate-avatars.mjs and public/avatars/. */
export function avatarSrc(id: AvatarId): string {
  return `/avatars/${id}.svg`;
}
