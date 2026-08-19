"use client";

// DESIGN.md §4: a correct-guess ding, a low-time tick, and a mute toggle.

const MUTE_KEY = "gtm:muted";

let muted: boolean | null = null;
let ding: HTMLAudioElement | null = null;
let ctx: AudioContext | null = null;

export function isMuted(): boolean {
  if (muted === null) {
    try {
      muted = localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      muted = false;
    }
  }
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    // No localStorage (private browsing, etc.) — the in-memory flag still
    // works for the rest of this session.
  }
}

/** Plays the correct-guess ding. Always follows a form submit, so autoplay
 * policy is satisfied; the catch covers the case where it isn't (or the
 * file is missing) — a silent failure is correct here, since sound is
 * feedback on top of the visible green state, never the only signal. */
export function playDing() {
  if (isMuted()) return;
  try {
    ding ??= new Audio("/sounds/ding.mp3");
    ding.currentTime = 0;
    void ding.play().catch(() => {});
  } catch {
    // No Audio support — the visual feedback still lands.
  }
}

/** Last-seconds tick. Synthesized via the Web Audio API rather than shipped
 * as an asset — one oscillator is cheaper than a second binary in
 * public/sounds, and there's no possible 404 path. Silent if it throws (no
 * AudioContext support, or a context still suspended pre-gesture) — same
 * "feedback on top of the visible state" posture as playDing. */
export function playTick() {
  if (isMuted()) return;
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.15, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.13);
  } catch {
    // No Web Audio support — the timer's coral/pulse styling still lands.
  }
}
