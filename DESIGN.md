# DESIGN.md — GuessTheMSG

This is the living product/UX source of truth for GuessTheMSG (per `CLAUDE.md`'s Workflow section). When a product or visual decision changes, update it here, not just in conversation.

## 1. Core loop

Home → Create Room *or* Join Room → Lobby → (host starts) → Round loop × N → Post-game results → host restarts (same room) or ends.

One sentence pitch: players decode an emoji sequence and race to type the answer into a shared chat box; faster correct guesses score more; a live leaderboard tracks rank.

## 2. Screens & flows

### 2.1 Home
- Two primary actions: **Create Room**, **Join Room**. Nothing else competes for attention.
- Before either action is available: a name input (required) and an avatar picker (defaults to a random DiceBear avatar from the curated set; changeable). Neither flow can proceed without a non-empty name — block the button, don't silently fail on submit.
- Join Room additionally needs a room code input. Support both typing a code and following a shared link/QR code that pre-fills it (see §2.6).

### 2.2 Create Room
Host provides, in one form:
- Room name
- Optional room password (hashed server-side, never stored/sent plaintext — see `ARCHITECTURE.md` §4)
- Category selection (Movies, Food, Things, etc. — pulled from global categories)
- Optional custom words: free-text entry, `emoji_sequence: answer` pairs separated by commas. These get profanity-filtered and validated server-side before the room can start (see Moderation, §5).
- Round count and seconds-per-round, defaulted sensibly and clamped server-side to sane min/max (host can't set `rounds: 0` or `9999`).

Submitting creates the room in `lobby` status and lands the host in the Lobby screen as `is_host = true`.

### 2.3 Lobby
- Shows room code prominently (for typing) plus a shareable link and QR code (§2.6).
- Live player list (name, avatar, connected/disconnected state) via Presence — updates in real time as people join.
- **Host-only** "Start Game" button. The game never auto-starts — the host decides when everyone's in. No countdown-to-autostart either; this is an explicit rule from the product spec, not just a default.
- Non-host players see a "waiting for host to start" state.

**Phase 3 status:** live now — room code, a real-time player list (name, avatar, host badge, connected/disconnected via Presence, `DISCONNECT_UI_GRACE_MS`-delayed so a refresh never flickers), a host-only Start Game button disabled under 2 present players, host migration when the host disconnects (`ARCHITECTURE.md` §11). Still missing: shareable link/QR (§2.6 remains a stub) and the "system chat message" narration of a host change (no chat UI exists yet).

### 2.4 Round loop (repeats N times)
Layout: single column, emoji sequence in a centered focal card, chat/guess box below it, leaderboard visible alongside (collapses under the fold on narrow mobile, but never fully hidden — players want to see their rank mid-round).

- **Emoji sequence** appears centered, large, as soon as the round starts.
- **Timer**: visible, server-synced countdown (see `ARCHITECTURE.md` §7 — client never owns the duration). Urgency styling kicks in as time runs low (color shift toward Accent Coral, subtle pulse — no jarring flashing).
- **Chat/guess box**: one input serves both normal chat and guesses — every submitted message is evaluated server-side as a potential guess; correct guesses are visually distinguished in the stream (e.g. highlighted row, point value shown inline) rather than living in a separate UI element. This matches the spec: "a chatbox where players can type in their guesses and check other's guesses as well... they can chat normally as well."
- **Leaderboard**: names + avatars + scores, sorted by rank, animates reordering (Framer Motion `layout`) as scores change mid-round.
- Round ends on timer expiry, or (if the host enabled it) once every connected player has guessed correctly.

### 2.5 Per-round recap
Brief transition screen/overlay between rounds (a few seconds, not skippable by players, though the host could have a "skip recap" affordance later):
- Reveals the correct answer.
- Shows who guessed it first (name + avatar) and the point spread awarded that round.
- Then auto-advances to the next round.

### 2.6 Shareable join
- Room link (`/join/<code>` or similar) and a generated QR code, shown in the Lobby and available to copy/share at room creation time.
- Joining via link pre-fills the room code on the Join Room screen; the player still must enter a name (and can pick an avatar) before actually joining — no anonymous silent join.

**Phase 2 status:** the pre-fill mechanism exists (`/?code=XXX-999` opens Home with the Join panel expanded and the code field filled), but there's no dedicated share affordance yet — no QR code, no copy-link button in the Lobby (§2.3 is a stub). The room code is shown on the stub lobby only for the player to read off manually.

### 2.7 Late joiners
- If a link/code is used after `status = in_progress`: the player can still join, but as a **spectator** until the next round begins (they see the game live but can't submit guesses this round). This is called out clearly in the UI ("You're spectating — you'll join at the next round"), not a silent failure or a rejected join.
- Once the current round ends, spectators become full players for the next round.

### 2.8 End-of-game results
More than a final scoreboard:
- Final leaderboard (winner emphasized — confetti moment via `canvas-confetti`, one clear focal point).
- Fastest average guess time.
- Most correct guesses.
- An "MVP" callout (host's choice of metric, e.g. best combination of speed + accuracy).
- Per-round breakdown (what was asked, who got it, how fast).
- Host-only controls: **change category / edit custom words**, then **restart** — this keeps the same room/lobby alive so players don't have to re-join or re-pick avatars for another game. A plain "end room" option also exists.

### 2.9 Reconnect / disconnect (cross-cutting, not a separate screen)
- A refreshed or reconnecting tab silently rejoins the same seat (persisted room code + Supabase anonymous session in `localStorage`) rather than creating a duplicate player entry. No re-entering name/avatar. Exception: a kicked player's rejoin is refused — they see a clear "you were removed from this room" state instead of silently resuming their old seat (see `ARCHITECTURE.md` §10).
- If the host disconnects, the UI clearly surfaces the auto-promoted new host (e.g. a small badge change, a one-line system message in chat) so it's never ambiguous who can start/restart the game.
- Connected/disconnected state is never color-only — pair the online indicator (Accent Sage) with an icon or label per the accessibility guardrail.

## 3. Visual system

This section is the canonical version of the style brief; `CLAUDE.md`'s Design section is the seed and should be treated as historical — this file wins if they ever diverge.

**Brief:** simple, artistic, doodle-y, light, calm — a hand-drawn party invite, not a SaaS dashboard. One clear focal point per screen.

**Palette** (fixed set, no ad hoc additions):
| Token | Hex | Use |
|---|---|---|
| Background | `#FFFCF5` | warm paper white |
| Surface | `#FFFFFF` | cards |
| Ink | `#33302A` | text, strokes, borders (never pure black) |
| Muted | `#8A8378` | secondary text |
| Accent Sun | `#FFC857` | primary CTAs, host badge, points |
| Accent Coral | `#FF8B6A` | correct-guess celebration, urgent timer |
| Accent Sky | `#8ECAE6` | links, secondary actions, calm timer |
| Accent Sage | `#A8D5BA` | success/connected state |
| Accent Lavender | `#C9B6E4` | avatar background variety, chat highlight |

At most one accent per component. No gradients. Shadows are soft/low-opacity/blurred ("paper cutout"), never heavy or dark.

**Typography:** "Caveat" for headings/display (600–700 weight); "Nunito" for all body/UI/chat/leaderboard/button text. Never use the handwritten font for dense or small text.

**Doodle motifs:**
- Cards: white surface, ~2px ink border, slight irregular radius or -1° to 1.5° rotation per card.
- Dividers: hand-drawn wavy/squiggle line, not `<hr>`.
- `rough-notation` accents sparingly, on the single most important element per screen (active timer, winner's name at game end).
- Buttons: pill-shaped/large-radius, thick ink border, small press scale-down, no gradients.
- Icons: `lucide-react`, single-color, rounded stroke caps, ~1.5–2px weight.
- At most one doodle illustration per screen (e.g. empty lobby state).

**Avatars:** DiceBear `open-peeps`/`notionists`, curated set of ~12 seeds pre-rendered to static SVGs at build time — no runtime API calls.

**Motion:** Framer Motion, spring easing (`stiffness: 300, damping: 20`), used for entrances and leaderboard reordering. Only one element animates at a time to hold attention.

**Layout:** centered single column, max content width ~640–720px on game screens, 24–32px padding, minimal chrome (small home link only).

**Accessibility:** WCAG AA text contrast despite the pastel palette; never rely on color alone for correct/incorrect or connected/disconnected — always pair with an icon or label.

**Emoji rendering:** browsers/OSes render emoji glyphs differently (iOS vs Android vs Windows), which can make a sequence ambiguous. Render emoji via a bundled, consistent set (e.g. Twemoji SVGs) rather than relying on the visitor's native OS emoji font, so every player sees an identical glyph.

**Theme:** light/dark is a nice-to-have (Tailwind + shadcn make it cheap if the token structure above is respected from the start) — doesn't block core phases.

## 4. Sound design
Short, mutable sound effects: a correct-guess "ding," a low-time tick during the last few seconds of a round. Cheap to add, disproportionately fun for a party game genre — don't over-scope beyond these two.

## 5. Moderation & content rules
- Profanity filter applies to: chat messages, room names, custom word submissions (both the emoji-sequence label and the answer text), **and player display names** — since hosts can submit arbitrary free text for custom words, and any player can set an arbitrary display name that's then visible to the whole room for the entire game (same exposure as a room name), this is a hard requirement, not a polish item. Implemented (Phase 2) via `obscenity` in `supabase/functions/_shared/profanity.ts`, applied server-side in `create-room`/`join-room`; the chat-message case lands once chat itself is built.
- Host can kick or mute a player from the room, both accessible from the in-round or lobby player list (small, deliberate affordance — not prominent enough to invite misuse). A muted player sees a visible muted indicator on their own input (icon + label, not color-only, per the accessibility guardrail) — mute stops chat, not guessing. A kicked player is removed immediately and cannot silently rejoin by refreshing (`ARCHITECTURE.md` §10).

## 6. Open product questions (flag before Phase 1 sign-off)
- Exact scoring formula defaults (see `ARCHITECTURE.md` §8) — confirm before locking round-recap copy that references point values.
- Whether "round ends early once everyone's guessed correctly" is on by default or a host toggle.
- MVP metric definition for the end-of-game screen (single metric vs weighted composite).
