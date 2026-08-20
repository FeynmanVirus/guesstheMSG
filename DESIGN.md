# DESIGN.md — Guessmoji

This is the living product/UX source of truth for Guessmoji (per `CLAUDE.md`'s Workflow section). When a product or visual decision changes, update it here, not just in conversation.

**Naming:** the product was originally built as "GuessTheMSG"; a visual redesign against a Claude Design mockup set renamed it to **Guessmoji** (§3 records the accompanying style changes). The two names refer to the same app — `GuessTheMSG` still appears in the repo directory name, some code comments, and git history, and isn't worth a mechanical rename pass on its own.

## 1. Core loop

Home → Create Room *or* Join Room → Lobby → (host starts) → Round loop × N → Post-game results → host restarts (same room) or ends.

One sentence pitch: players decode an emoji sequence and race to type the answer into a shared chat box; faster correct guesses score more; a live leaderboard tracks rank.

## 2. Screens & flows

### 2.1 Home
- Two primary actions: **Create Room**, **Join Room**. Nothing else competes for attention.
- Before either action is available: a name input (required) and an avatar picker (defaults to a random pick from the curated set of 12 emoji-on-colored-circle avatars, opened in a centered "pick a face" modal; changeable). Neither flow can proceed without a non-empty name — block the button, don't silently fail on submit.
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

**Phase 3 status:** live now — room name/settings header, a room-code pill with copy-to-clipboard, a real-time player card grid (name, avatar, host badge, connected/disconnected via Presence, `DISCONNECT_UI_GRACE_MS`-delayed so a refresh never flickers), an "invite a friend" tile that copies the join link, a host-only Start Game button disabled under 2 present players, host migration when the host disconnects (`ARCHITECTURE.md` §11). Still missing: a QR code (§2.6) and the "system chat message" narration of a host change (no lobby chat exists yet — see §2.4's chat note).

### 2.4 Round loop (repeats N times)
Layout (revised for the Guessmoji redesign, superseding the single-column version below): a wide 3-column shell — leaderboard (270px) | emoji stage (flexible) | chat/guess panel (300px) — that stacks to a single column below `lg`. Both side panels stay visible on desktop; on mobile the stage comes first, then the leaderboard, then chat, so the puzzle is never pushed below the fold. Chat and guessing are no longer visually separate cards — one panel owns both, with the input as its footer.

- **Emoji sequence** appears centered, large, as soon as the round starts, under a "decode this" label — no "Round N of M" on the card itself anymore, that moved to the page header alongside the room's name and category.
- **Timer**: visible, server-synced countdown (see `ARCHITECTURE.md` §6 — client never owns the duration), shown as a pill in the header. Calm state is Accent Lavender (not Sky, the pre-redesign color); urgency styling kicks in as time runs low (pill fill shifts to Accent Coral, icon pulse — no jarring flashing).
- **Chat/guess box**: one input serves both normal chat and guesses — every submitted message is evaluated server-side (`submit-guess`) as a potential guess. **Two-tier stream, not one shared feed with highlighted rows** (revised from the original spec): a correct guess never republishes its text — everyone sees a system row, `"<name> guessed correctly +<points>"`, name and points only, never the answer. That player's *subsequent* messages move to a winners' chat visible only to other players who have also guessed correctly that round, styled in the Sage-ink text color with a lock icon; the guesser sees an inline label ("Only other correct guessers see what you type now") so the mode-switch is never silent. The split is enforced by RLS, not client-side filtering — a player who hasn't guessed correctly never receives those rows at all. Reasoning: the original "highlighted row with the answer inline" design would hand the answer to every player still guessing the instant anyone got it right.
- The sender's own message appears the instant Send is pressed, not after the server round-trip — an optimistic local echo (`guess-input.tsx`) reconciled against the real row once Realtime delivers it (`ARCHITECTURE.md` §5).
- The player's own guess box turns Accent Sage the moment their guess is confirmed correct, alongside a short "ding" (§4).
- **Leaderboard**: names + avatars + scores, sorted by rank, animates reordering (Framer Motion `layout`) as scores change mid-round. The rank-1 row gets a Sun fill; every row carries a one-line substatus ("guessed ✓" / "guessing…" / "away") derived from this round's system chat messages and live presence.
- Round ends on timer expiry, or (if the host enabled it) once every connected, non-spectating player has guessed correctly.
- **Not yet built** (mockup features with no backend behind them): letter-blank hints revealing the answer's shape, and a live "Sam is very close 🔥" near-miss line — both need new server-side work (masked-answer broadcast, edit-distance scoring) and are deliberately out of scope for the visual redesign. Lobby chat is the same story — `submit-guess` is round-scoped today, so pre-game chat doesn't exist yet.

### 2.5 Per-round recap
Brief transition between rounds (~5 seconds — `RECAP_SECONDS` in `_shared/settings.ts`, shared by the server's advance timing and the client's due-time calculation so they can't drift apart — not skippable by players, though the host could have a "skip recap" affordance later):
- Reveals the correct answer.
- Shows the round's top 3 scorers on a podium (avatar, name, points) — or "Nobody guessed it this round" if nobody did.
- Then auto-advances to the next round.

**Not a modal overlay** (revised for the redesign): the recap used to be a `fixed inset-0` dialog blocking the whole screen. It's now the emoji stage's alternate state — only the centre column swaps, so the leaderboard and chat panel keep running live behind it, matching the game's actual "nothing pauses" feel.

### 2.6 Shareable join
- Room link (`/join/<code>` or similar) and a generated QR code, shown in the Lobby and available to copy/share at room creation time.
- Joining via link pre-fills the room code on the Join Room screen; the player still must enter a name (and can pick an avatar) before actually joining — no anonymous silent join.

**Status:** the pre-fill mechanism exists (`/?code=XXX-999` opens Home with the Join panel expanded and the code field filled). The Lobby now has both a room-code copy button and an "invite a friend" tile that copies the join link — no QR code yet.

### 2.7 Late joiners
- If a link/code is used after `status = in_progress`: the player can still join, but as a **spectator** until the next round begins (they see the game live but can't submit guesses this round). This is called out clearly in the UI ("You're spectating — you'll join at the next round"), not a silent failure or a rejected join.
- Once the current round ends, spectators become full players for the next round.

### 2.8 End-of-game results
More than a final scoreboard, eventually:
- Final leaderboard (winner emphasized, avatar + score; a tie at the top shows no single winner rather than crowning one arbitrarily).
- Fastest average guess time.
- Most correct guesses.
- An "MVP" callout — most rounds won (highest score in that round), not most total points, since total points is already the leaderboard winner and would be a redundant callout for the same player.
- Per-round breakdown (what was asked, who got it, how fast).
- Host-only controls: **change category / edit custom words**, then **restart** — this keeps the same room/lobby alive so players don't have to re-join or re-pick avatars for another game. The custom-words field replaces the previous game's list wholesale rather than pre-filling it (the client has no read access to `words`, by design — CLAUDE.md rule 1 — so there's nothing to prefill from); leaving it blank falls back to category words only. A plain "end room" option also exists.

**Status:** live now, in the same wide 3-column shell as the round loop — final standings (with each player's "N of M correct") and a "hardest sequence" callout on the left, a podium of the top 3 with award badges (⚡ fastest guesser, 🎯 highest accuracy, 🔥 "the Phoenix" — the biggest rank comeback) in the centre, live chat on the right, plus a share-results button and confetti for an outright winner. `stats.ts` still computes MVP (most rounds won) but the podium doesn't surface it as a separate badge — the mockup's three award slots won out over a fourth. The host restart flow (`restart-room`, `ARCHITECTURE.md` §9/§14) renders as its own panel below the grid; the "end room" option is still not built.

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

**Typography:** "Comic Neue" for headings/display (400/700 weight — revised from "Caveat" when the app was renamed to Guessmoji against the mockup set; Comic Neue is rounder and closer to a comic-lettering feel than Caveat's marker-script look); "Nunito" for all body/UI/chat/leaderboard/button text. Never use the display font for dense or small text.

**Doodle motifs:**
- Cards: white surface, 2.5px ink border, 20px radius. **No per-card rotation** — the pre-redesign `-1°…1.5°` tilt is gone; the mockup set has zero rotated cards, so the system is flat and consistent instead. Two tiers: `doodle-card` for the one outer card a screen is built around, `doodle-panel` for nested surfaces (leaderboard, chat, the emoji stage) with a quieter shadow.
- Dividers: hand-drawn wavy/squiggle line (`doodle/squiggle.tsx`), not `<hr>`.
- CTAs use `doodle-pop`: a hard offset shadow (`0 6px 0` ink, no blur) that collapses toward the ink on press — a different shadow language from the soft blurred `doodle-card`/`doodle-panel`, deliberately, since a button reads as a physical pressable object and a card reads as a cutout resting on the page.
- Buttons: pill-shaped/large-radius, thick ink border, small press scale-down, no gradients.
- Icons: `lucide-react`, single-color, rounded stroke caps, ~1.5–2px weight.
- At most one doodle illustration per screen (e.g. empty lobby state).
- `rough-notation` was speculatively planned pre-redesign but never adopted — not installed, not used by the mockup set. Treat it as dropped, not deferred; revisit only if a specific screen calls for a hand-drawn circle/underline accent it can't get another way.

**Avatars:** emoji on a colored circle (`doodle/avatar.tsx`) — a curated set of 12 (fox/frog/penguin/unicorn/octopus/koala/bee/whale/owl/flamingo/turtle/dice), each paired with one of the five palette accents as its circle fill. Replaces the pre-redesign DiceBear `open-peeps` SVGs; no runtime API calls either way, avatar ids are plain strings stored on `players.avatar_id`.

**Motion:** Framer Motion, spring easing (`stiffness: 300, damping: 20`), used for entrances and leaderboard reordering. Only one element animates at a time to hold attention.

**Layout:** centered single column (max content width ~640–720px) for the home/create/join/lobby screens; the round loop and results screens are a wide 3-column shell up to 1280px (§2.4), stacking to single-column below the `lg` breakpoint. 24–32px padding, minimal chrome (small home link only).

**Accessibility:** WCAG AA text contrast despite the pastel palette; never rely on color alone for correct/incorrect or connected/disconnected — always pair with an icon or label. Two of the palette accents (Sun, Sage) are too light for small text at AA contrast — `--color-sun-ink`/`--color-sage-ink` are the same hues darkened for that one use (status lines like "Meera guessed the word"), never used as a fill.

**Emoji rendering:** browsers/OSes render emoji glyphs differently (iOS vs Android vs Windows), which can make a sequence ambiguous — and now that avatars are emoji too (not bundled SVGs), that same ambiguity applies to a player's own avatar rendering slightly differently across devices, not just the puzzle clue. Still unresolved: rendering emoji via a bundled, consistent set (e.g. Twemoji SVGs) rather than the visitor's native OS emoji font, so every player sees identical glyphs for both the clue and the avatars.

**Theme:** light/dark is a nice-to-have (Tailwind + shadcn make it cheap if the token structure above is respected from the start) — doesn't block core phases.

## 4. Sound design
Short, mutable sound effects, both live (`src/lib/sounds.ts`): a correct-guess "ding" (fires on the direct HTTP response from `submit-guess`, not a realtime round-trip, so the feedback is immediate), and a low-time tick during the last `URGENT_SECONDS` (10) of a round — synthesized via the Web Audio API rather than a shipped asset, so there's no second binary in `public/sounds/` and no possible 404 path. A mute toggle (`SoundToggle`, shown in the room header) persists the preference in `localStorage["gtm:muted"]` and gates both sounds.

## 5. Moderation & content rules
- Profanity filter applies to: chat messages (live, Phase 4, via `submit-guess`), room names, custom word submissions (both the emoji-sequence label and the answer text), **and player display names** — since hosts can submit arbitrary free text for custom words, and any player can set an arbitrary display name that's then visible to the whole room for the entire game (same exposure as a room name), this is a hard requirement, not a polish item. Implemented via `obscenity` in `supabase/functions/_shared/profanity.ts`. **Scope, revised in Phase 4:** the filter blocks one slur (the n-word and obfuscations of it), not general profanity — ordinary swearing is allowed. `obscenity` is kept for its obfuscation/leetspeak transformer pipeline; only the word list was narrowed.
- Host can kick or mute a player from the room, both accessible from the in-round or lobby player list (small, deliberate affordance — not prominent enough to invite misuse). A muted player sees a visible muted indicator on their own input (icon + label, not color-only, per the accessibility guardrail) — mute stops chat, not guessing. A kicked player is removed immediately and cannot silently rejoin by refreshing (`ARCHITECTURE.md` §10).

## 6. Open product questions
- ~~MVP metric definition for the end-of-game screen~~ — settled and shipped: most rounds won, not a weighted composite (§2.8).
- ~~Exact scoring formula defaults~~ — settled and shipped, `ARCHITECTURE.md` §7: `time (500 max, 5s leeway) + difficulty (100/200/300) + room-wide first-guess bonus (200 max)`, 1000-point ceiling, no guess-count factor (an earlier per-player-attempt-count factor was dropped since the guess box is also the chat box, and would have penalized ordinary banter; the current first-guess bonus is room-wide — the round's single fastest correct guess, not a per-player attempt tally — so it doesn't have that flaw).
- ~~Whether "round ends early once everyone's guessed correctly" is on by default or a host toggle~~ — settled: on by default (`rooms.settings.end_round_on_all_correct`), not host-editable in the UI yet.
- ~~Whether to adopt the Claude Design mockup set's visual direction wholesale~~ — settled and shipped: rename to Guessmoji, Comic Neue display font, emoji avatars, no card rotation, wide 3-column round-loop/results shell (§3). The mockup also proposed several features with no backend behind them — letter-blank hints and near-miss detection (§2.4), lobby chat, a public-room quick-join browser, and private/hints-toggle room settings — all deliberately left out of the redesign pass as separate follow-on work, not silently dropped.
