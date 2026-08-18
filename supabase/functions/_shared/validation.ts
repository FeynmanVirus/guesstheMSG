// Field-level validation for identity/room text inputs. Pure string checks
// only — profanity is a separate concern (see profanity.ts), composed by
// the caller so a single field can report both a length problem and a
// profanity problem distinctly.

export interface FieldError {
  field: string;
  message: string;
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

export function validateDisplayName(value: unknown): FieldError | null {
  if (typeof value !== "string") return { field: "displayName", message: "Name is required." };
  const trimmed = value.trim();
  if (trimmed.length < 1) {
    return { field: "displayName", message: "Name is required." };
  }
  if (trimmed.length > 24) {
    return { field: "displayName", message: "Name must be 24 characters or fewer." };
  }
  return null;
}

export function validateRoomName(value: unknown): FieldError | null {
  if (typeof value !== "string") return { field: "roomName", message: "Room name is required." };
  const trimmed = value.trim();
  if (trimmed.length < 1) {
    return { field: "roomName", message: "Room name is required." };
  }
  if (trimmed.length > 40) {
    return { field: "roomName", message: "Room name must be 40 characters or fewer." };
  }
  return null;
}

/** Optional field — `value` may be null/undefined/empty meaning "no
 * password". crypt()'s 'bf' scheme silently truncates beyond 72 bytes, so
 * two different long passwords would otherwise both "work" — reject early
 * instead of writing a hash that doesn't mean what the host thinks it means. */
export function validatePassword(value: unknown): FieldError | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    return { field: "password", message: "Password must be text." };
  }
  if (value.length < 4) {
    return { field: "password", message: "Password must be at least 4 characters." };
  }
  if (byteLength(value) > 72) {
    return { field: "password", message: "Password must be 72 bytes or fewer." };
  }
  return null;
}
