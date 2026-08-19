"use client";

// DESIGN.md §4: a correct-guess ding. Kept to the one sound that exists —
// the low-time tick and a mute toggle are still open.

let ding: HTMLAudioElement | null = null;

/** Plays the correct-guess ding. Always follows a form submit, so autoplay
 * policy is satisfied; the catch covers the case where it isn't (or the
 * file is missing) — a silent failure is correct here, since sound is
 * feedback on top of the visible green state, never the only signal. */
export function playDing() {
  try {
    ding ??= new Audio("/sounds/ding.mp3");
    ding.currentTime = 0;
    void ding.play().catch(() => {});
  } catch {
    // No Audio support — the visual feedback still lands.
  }
}
