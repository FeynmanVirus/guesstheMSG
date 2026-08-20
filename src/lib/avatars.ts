export {
  AVATAR_IDS,
  AVATAR_FACE,
  DEFAULT_AVATAR_ID,
  isValidAvatarId,
  type AvatarId,
  type AvatarAccent,
} from "@shared/avatars";
import { AVATAR_FACE, DEFAULT_AVATAR_ID, type AvatarId } from "@shared/avatars";

/** Emoji + accent for an avatar id, falling back to the default avatar for
 * any legacy id (pre-redesign rows stored `peep-01`… or the column default
 * `'default'` — neither is a key in AVATAR_FACE). */
export function avatarFace(id: AvatarId | string) {
  return AVATAR_FACE[id as AvatarId] ?? AVATAR_FACE[DEFAULT_AVATAR_ID];
}
