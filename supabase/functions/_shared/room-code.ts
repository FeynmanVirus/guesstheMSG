// Room code generation/normalization. Self-contained (no imports of its own)
// so it resolves identically whether imported from Deno (relative path,
// explicit .ts extension) or from Next via the `@shared/*` tsconfig alias.
//
// Format: AAA-999 — 3 letters, dash, 3 digits, e.g. FOX-482 (ARCHITECTURE.md
// §2's own example). Charset deliberately excludes visually-ambiguous
// characters (I/L/O in letters, 0/1 in digits) since a room code gets read
// aloud and typed on a phone at a party, not copy-pasted.

const LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ"; // no I, L, O
const DIGITS = "23456789"; // no 0, 1

export const ROOM_CODE_RE = /^[A-Z]{3}-\d{3}$/;

function pick(charset: string): string {
  const idx = Math.floor(Math.random() * charset.length);
  return charset[idx];
}

/** Generates a fresh candidate code. Caller is responsible for checking
 * uniqueness against `rooms.code` and retrying on collision. */
export function generateRoomCode(): string {
  const letters = Array.from({ length: 3 }, () => pick(LETTERS)).join("");
  const digits = Array.from({ length: 3 }, () => pick(DIGITS)).join("");
  return `${letters}-${digits}`;
}

/** Best-effort normalization of user-typed input: uppercase, strip anything
 * that isn't alphanumeric, then reinsert the dash at position 3. So
 * "fox482", "FOX 482", and "fox-482" all resolve to "FOX-482". Does NOT
 * validate the result — check against ROOM_CODE_RE separately. */
export function normalizeRoomCode(input: string): string {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length !== 6) return cleaned; // let ROOM_CODE_RE reject it
  return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
}
