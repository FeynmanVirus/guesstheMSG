@AGENTS.md
# Guessmoji — CLAUDE.md

This file is read automatically at the start of every Claude Code session in this repo. It is the project's standing brief — treat every rule here as binding unless I explicitly say otherwise in a prompt. If `DESIGN.md` or `ARCHITECTURE.md` don't exist yet, your first job is to help create them (see Workflow below) before writing feature code.

The app shipped as "GuessTheMSG" and was renamed **Guessmoji** in a visual redesign against a Claude Design mockup set — the repo directory and some code/history still say GuessTheMSG, that's fine. The "Design & visual style" section below is this rename's seed brief; `DESIGN.md` §3 is the current, canonical version and wins if the two ever diverge (see that file's own note).

## What this is

Guessmoji is a browser-based party game. Players join a room, see an emoji sequence, and race to type the correct answer in a shared chat/guess box. Faster correct guesses score more points. A live leaderboard tracks rank. After N rounds the game ends and shows results; the host can reconfigure and restart.

## Tech stack

- Next.js 16 (App Router, TypeScript) — server components by default, `'use client'` only where interactivity/state is required.
- Tailwind CSS + shadcn/ui for components.
- Framer Motion for animation, canvas-confetti for the win moment.
- Supabase: Postgres (schema + RLS), Realtime (Broadcast for chat/guesses/round events, Presence for who's online), Auth (anonymous), Edge Functions (Deno) for all trusted game logic.
- Zustand for client-side room/game state; avoid pulling in a heavier state library.
- Hosting: Vercel (frontend) + Supabase Cloud (backend).
- Avatars: emoji on a colored circle, a curated set of 12 (`supabase/functions/_shared/avatars.ts`) — no image asset, no runtime API call. (Originally DiceBear `open-peeps` SVGs; replaced in the Guessmoji redesign.)

## Non-negotiable rules

These are correctness/security rules, not style preferences. Don't relax them for convenience or "just for debugging" — flag it to me instead if one seems to be blocking a feature.

1. **The correct answer for the active round must never be readable by the client.** Only `emoji_sequence` is ever sent to players before a round ends. `words.answer` is selectable only by the `service_role` used inside Edge Functions — RLS on `words` must not grant `select` on that column (or that table) to `anon`/`authenticated`.
2. **All guess correctness checks happen server-side**, inside a `submit-guess` Edge Function: normalize (trim/lowercase/strip punctuation), compare against the DB answer, compute points, write the result, broadcast it. The client never evaluates `guess === answer` locally.
3. **All round timing is server-authoritative.** `started_at`/`ends_at` are server timestamps written once by the server and broadcast; every client countdown is derived from `ends_at - Date.now()`, never from a client-set duration. "Who guessed first" ordering is decided by server-received timestamps, never client-reported ones.
4. **RLS is on for every table, always.** When you create a new table, write its RLS policies in the same migration, not as a follow-up. Players may only read/write rows for rooms they've joined; players may never directly update their own `score` (only the scoring Edge Function can).
5. **No service-role key or other secret ever ships to the client bundle.** Anything that needs elevated DB access happens in an Edge Function or server component/action, never client-side code.
6. **Room passwords are hashed** (pgcrypto/`crypt()`), never stored plaintext.
7. **Scoring rules and round settings (rounds count, seconds per round) are validated server-side**, not just trusted from whatever the host's client sends — a malformed or adversarial request (e.g. `rounds: 0`) must fail gracefully, not corrupt the room.

## Required features (v1 scope — not optional extras)

Beyond the core loop (create/join room → lobby → rounds → leaderboard → results → host restart), these are in scope for v1 and should be planned for from the schema/architecture stage, not bolted on at the end:

**Reliability**
- Reconnect/refresh handling: a player refreshing mid-game rejoins the same seat (persist room code + Supabase anonymous session, e.g. in `localStorage`), not a duplicate player.
- Host migration: if the host disconnects, auto-promote the longest-connected remaining player as host.
- Late joiners after the game has started are handled explicitly (spectate-until-next-round, not a silent failure).

**Game feel**
- Visible, server-synced round timer with urgency styling as time runs low.
- Per-round recap: briefly reveal the answer and who got it first before advancing.
- End-of-game results beyond just final scores: fastest average guess time, most correct guesses, an MVP callout, per-round breakdown.
- Sound effects: correct-guess ding, low-time tick (mutable).

**Moderation & safety**
- Profanity filter applied to chat messages, room names, and custom word submissions (both the emoji sequence label and the answer text).
- Host can kick or mute a player.

**Sharing & ops**
- Shareable room link and/or QR code for joining, in addition to a typed room code.
- Scheduled cleanup of rooms inactive beyond ~24h (Supabase scheduled Edge Function / `pg_cron`).
- Sensible caps enforced server-side: max players per room, min/max rounds, min/max seconds per round.
- No-repeat word selection within a session; shuffled per room so two rooms on the same category don't get identical sequences.

Treat analytics (basic event counts) and light/dark theme as good-to-have if time allows within a phase, but don't let them block the phases above.

## Design & visual style

**This section is the original seed brief and is historical — `DESIGN.md` §3 is the current, canonical version and wins if the two diverge.** Kept here for the parts that are still accurate (palette, accessibility guardrail); see DESIGN.md for the Guessmoji-redesign changes (Comic Neue instead of Caveat, emoji avatars instead of DiceBear, no per-card rotation, a wide 3-column shell on the round-loop/results screens).

The brief: **simple, artistic, doodle-y, light, and calm — not much going on.** Think hand-drawn party invite, not a SaaS dashboard. Every screen should have one clear focal point; resist adding decorative elements "because there's space."

**Color palette** (use exactly this set — don't introduce new colors ad hoc):
- Background: `#FFFCF5` (warm paper white)
- Surface/cards: `#FFFFFF`
- Ink (primary text, doodle strokes, borders): `#33302A` (soft charcoal — never pure black)
- Muted text: `#8A8378`
- Accent Sun `#FFC857` — primary CTAs, host badge, points
- Accent Coral `#FF8B6A` — correct-guess celebration, urgent timer state
- Accent Sky `#8ECAE6` — links, secondary actions, calm timer state
- Accent Sage `#A8D5BA` — success states, connected/online indicator
- Accent Lavender `#C9B6E4` — avatar background variety, chat highlight

Use at most one accent color per component. No gradients. No heavy/dark drop shadows — use soft, low-opacity, blurred shadows for a "paper cutout" feel instead.

**Typography:**
- Headings/display: "Caveat" (Google Font, handwritten marker style), 600–700 weight.
- Body/UI text (including chat, leaderboard, buttons): "Nunito" (Google Font, rounded and highly legible) — handwritten fonts should never be used for dense/small text, only for headings and short emphasis.

**Doodle motifs:**
- Cards: white surface, ~2px ink-colored border, slightly irregular border-radius or a subtle random rotation (roughly -1° to 1.5°) per card for a hand-placed feel.
- Dividers: a hand-drawn wavy/squiggle line instead of a straight `<hr>`.
- Use the `rough-notation` library sparingly for hand-drawn circle/underline/highlight accents around the one most important element on screen (e.g. the active timer, the winner's name at game end) — not on every element.
- Buttons: heavily rounded (pill-shaped or large radius), thick ink border, a small "press" scale-down on click. No gradients.
- Icons: `lucide-react`, single-color (ink or one accent), rounded stroke caps/joins, ~1.5–2px stroke weight — not multi-color or filled icon sets.
- Illustrations: at most one doodle illustration per screen (e.g. an empty-lobby state), used sparingly, not as decorative filler.

**Avatars:** DiceBear `open-peeps`/`notionists` style — hand-drawn doodle people, fits the theme directly and needs no custom illustration work.

**Motion:** Framer Motion, spring easing (roughly `stiffness: 300, damping: 20`), used for entrances and the leaderboard's reordering (`layout` animations). Keep motion purposeful: only one element should be animating to draw attention at a time.

**Layout:** centered single column, max content width roughly 640–720px on game screens, generous padding (24–32px), minimal navigation chrome (small home link only) — this is a focused single-purpose app, not a multi-page product.

**Accessibility guardrail:** despite the light/pastel palette, keep text-on-background contrast at WCAG AA, and never rely on color alone to distinguish correct/incorrect or connected/disconnected — pair color with an icon or label.

## Coding conventions

- Server components by default; add `'use client'` only where state/interactivity is required.
- Trusted writes (room creation, guess submission, scoring, round advancement) go through Supabase Edge Functions or server actions — never a client-side Supabase call with elevated permissions.
- Pure logic (scoring formulas, string normalization) lives in `lib/` and is unit-testable in isolation from any UI or network code.
- Schema changes are versioned Supabase migrations under `supabase/migrations/`, applied via the Supabase MCP server — no ad hoc dashboard edits without a corresponding migration file.
- Commit in small, working increments, one phase/feature at a time — not one giant commit per session.

## Workflow

- This project is built in phases (see the phase prompts I'll give you). Before implementing a phase, restate your plan briefly; after implementing, wait for me to review/run it before moving to the next phase.
- Keep `DESIGN.md` and `ARCHITECTURE.md` up to date as decisions are made or changed — they're the source of truth, not this file.
- If a request conflicts with a "Non-negotiable rule" above, point out the conflict instead of silently working around it.