// localStorage-backed identity — ARCHITECTURE.md §8: "Room code + session
// are persisted in localStorage." A refreshing tab restores name/avatar
// without asking again (DESIGN.md §2.9), and the last room code seeds the
// Join form / lets /room/[code] send an unauthenticated visitor home with
// the code pre-filled.
"use client";

import { AVATAR_IDS, isValidAvatarId, type AvatarId } from "@shared/avatars";

const KEYS = {
  displayName: "guessthemsg:displayName",
  avatarId: "guessthemsg:avatarId",
  lastRoomCode: "guessthemsg:lastRoomCode",
} as const;

function safeGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // private browsing / storage disabled
  }
}

function safeSet(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore — identity just won't persist across refresh this session
  }
}

export function getSavedDisplayName(): string {
  return safeGet(KEYS.displayName) ?? "";
}

// Returns null (not DEFAULT_AVATAR_ID) when nothing valid is saved, so a
// first-time visitor's `getSavedAvatarId() ?? randomAvatarId()` call
// actually reaches randomAvatarId() instead of always landing on the same
// default face — a non-nullable return here previously made that `??` dead.
export function getSavedAvatarId(): AvatarId | null {
  const saved = safeGet(KEYS.avatarId);
  return isValidAvatarId(saved) ? saved : null;
}

export function randomAvatarId(): AvatarId {
  return AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)];
}

export function saveIdentity(displayName: string, avatarId: AvatarId) {
  safeSet(KEYS.displayName, displayName);
  safeSet(KEYS.avatarId, avatarId);
}

export function getSavedRoomCode(): string | null {
  return safeGet(KEYS.lastRoomCode);
}

export function saveRoomCode(code: string) {
  safeSet(KEYS.lastRoomCode, code);
}
