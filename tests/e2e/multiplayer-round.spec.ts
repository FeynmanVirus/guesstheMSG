import { test, expect, type Page, type Browser } from "@playwright/test";
import { answerFor } from "../../supabase/functions/_shared/seed-words";

// Full-stack test against the live Supabase project (no local stack) — same
// as the app itself in dev. Three independent browser contexts, one per
// player: each context gets its own cookie/localStorage jar, so each mints
// its own anonymous Supabase session and player identity. Reusing one
// context for multiple "tabs" would share that session and collapse all
// three players into one.
//
// Nothing here can delete the room it creates (no service-role key, no
// delete-room API by design — CLAUDE.md rule 5); the room code is logged so
// a human with project access can prune it. Rooms are named "Playwright
// multiplayer test room" to make them easy to find.

test.setTimeout(180_000);

interface PlayerSession {
  page: Page;
  name: string;
}

async function newPlayer(browser: Browser, name: string): Promise<PlayerSession> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/");
  await page.getByLabel("Your name").fill(name);
  return { page, name };
}

async function createRoom(session: PlayerSession, rounds: number): Promise<string> {
  const { page } = session;
  await page.getByRole("button", { name: "Create Room", exact: true }).click();
  await page.getByLabel("Room name").fill("Playwright multiplayer test room");

  // Rounds is a stepper (doodle/stepper.tsx), not a fillable input — click
  // "Decrease rounds" down from SETTINGS_BOUNDS.rounds.default (10) to the
  // requested count.
  const decrease = page.getByRole("button", { name: "Decrease rounds" });
  for (let i = SETTINGS_ROUNDS_DEFAULT; i > rounds; i--) await decrease.click();

  // "Mixed" is always present (no async category fetch to wait on) and
  // works for this test's purposes — it just needs a valid, non-empty
  // categoryId so the server doesn't reject with "Category is required."
  await page.getByRole("radio", { name: "🎲 Mixed" }).click();

  await page.getByRole("button", { name: "Make the room" }).click();

  await page.waitForURL(/\/room\/[A-Z0-9]{3}-\d{3}/, { timeout: 15_000 });
  const match = page.url().match(/\/room\/([A-Z0-9]{3}-\d{3})/);
  if (!match) throw new Error(`could not read room code out of URL: ${page.url()}`);
  return match[1];
}

// Matches SETTINGS_BOUNDS.rounds.default in supabase/functions/_shared/settings.ts
// (not imported directly — that module isn't resolvable from Playwright's config).
const SETTINGS_ROUNDS_DEFAULT = 10;

async function joinRoom(session: PlayerSession, code: string) {
  const { page } = session;
  await page.getByRole("button", { name: "Join Room", exact: true }).click();

  // Room code is a 6-box input (room-code-input.tsx), not a fillable
  // single field — click the first box and type the 6 characters; the
  // component auto-advances focus box to box as each one fills.
  await page.getByLabel("Room code character 1").click();
  await page.keyboard.type(code.replace(/[^A-Z0-9]/g, ""));

  await page.getByRole("button", { name: "Knock knock" }).click();
  await page.waitForURL(new RegExp(`/room/${code}`), { timeout: 15_000 });
}

async function readEmojiSequence(page: Page): Promise<string> {
  const clue = page.getByRole("img", { name: /^Emoji clue:/ });
  await expect(clue).toBeVisible({ timeout: 15_000 });
  return (await clue.textContent())?.trim() ?? "";
}

async function submitGuess(page: Page, text: string) {
  const input = page.getByLabel("Your guess or message");
  await input.fill(text);
  await input.press("Enter");
}

/** Every score cell in the live in-game Leaderboard carries `aria-label="N
 * points"` — unique to that component (round-recap.tsx and
 * game-results.tsx's standings don't use aria-label on their score text),
 * so this needs no further scoping. Returns displayName -> score. */
async function readLiveLeaderboard(page: Page): Promise<Record<string, number>> {
  const rows = page.locator('li:has([aria-label$=" points"])');
  const count = await rows.count();
  const result: Record<string, number> = {};
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const rawName = (await row.locator("p").first().textContent()) ?? "";
    const name = rawName.replace(/\s*you\s*$/, "").trim();
    const scoreText = await row.locator('[aria-label$=" points"]').textContent();
    result[name] = Number(scoreText);
  }
  return result;
}

/** The end-of-game standings list has no aria-label, only plain text rows —
 * read by finding the <li> containing the player's name and taking its
 * last <p>, the score cell (game-results.tsx: name <p>, then score <p>). */
async function readFinalScore(page: Page, name: string): Promise<number> {
  const row = page.locator("li").filter({ hasText: name });
  const scoreText = await row.locator("p").last().textContent();
  return Number(scoreText);
}

test("3-player room: staggered guesses, leaderboard and scores stay consistent across all clients", async ({ browser }) => {
  const ROUNDS = 3;

  const host = await newPlayer(browser, "E2E Host");
  const p2 = await newPlayer(browser, "E2E Player Two");
  const p3 = await newPlayer(browser, "E2E Player Three");

  const code = await createRoom(host, ROUNDS);
  console.log(`[multiplayer-round] room code: ${code}`);

  await joinRoom(p2, code);
  await joinRoom(p3, code);

  // All three clients should agree there are 3 players before starting —
  // this is itself a consistency check on Presence/players sync.
  for (const { page } of [host, p2, p3]) {
    await expect(page.getByText(/^Players · 3$/)).toBeVisible({ timeout: 15_000 });
  }

  await host.page.getByRole("button", { name: "Start Game" }).click();

  for (let round = 1; round <= ROUNDS; round++) {
    // All three should be looking at the same puzzle before anyone guesses.
    const [hostClue, p2Clue, p3Clue] = await Promise.all([
      readEmojiSequence(host.page),
      readEmojiSequence(p2.page),
      readEmojiSequence(p3.page),
    ]);
    expect(p2Clue).toBe(hostClue);
    expect(p3Clue).toBe(hostClue);
    const answer = answerFor(hostClue);

    // Staggered submissions, spread across the 5s leeway boundary
    // (guess.ts) so the three scores are expected to differ, not just
    // happen to match — this is what actually exercises the time +
    // difficulty + first-guess-bonus formula end-to-end rather than
    // trivially landing all three in the flat-time leeway window. The host
    // guesses first, so it also claims the room's one first-guess bonus for
    // this round on top of the max time score — same word/round means
    // difficulty is identical for all three and cancels out of the
    // comparison, so the ordering below is driven by time + that bonus.
    await submitGuess(host.page, answer);
    await host.page.waitForTimeout(6_000);
    await submitGuess(p2.page, answer);
    await p3.page.waitForTimeout(3_000); // total ~9s from round start
    await submitGuess(p3.page, answer);

    // Recap confirms the round actually ended (either by everyone-correct
    // early-end or timer expiry) before reading "final" per-round scores.
    // No longer a modal dialog (round-recap.tsx is inline in the centre
    // column now) — "next round starting…" is its stable, unique marker.
    for (const page of [host.page, p2.page, p3.page]) {
      await expect(page.getByText("next round starting…")).toBeVisible({ timeout: 20_000 });
    }

    const [hostBoard, p2Board, p3Board] = await Promise.all([
      readLiveLeaderboard(host.page),
      readLiveLeaderboard(p2.page),
      readLiveLeaderboard(p3.page),
    ]);
    expect(p2Board, `round ${round}: player two's leaderboard should match the host's`).toEqual(hostBoard);
    expect(p3Board, `round ${round}: player three's leaderboard should match the host's`).toEqual(hostBoard);

    const hostScore = hostBoard["E2E Host"];
    const p2Score = hostBoard["E2E Player Two"];
    const p3Score = hostBoard["E2E Player Three"];
    expect(hostScore, `round ${round}: fastest guesser should not score less than a slower one`).toBeGreaterThanOrEqual(p2Score);
    expect(p2Score, `round ${round}: middling guesser should not score less than the slowest`).toBeGreaterThanOrEqual(p3Score);
    // Guards against the trivial "all three landed in the flat leeway
    // window and scored identically" case actually happening.
    expect(hostScore, `round ${round}: staggered timing should have produced a real spread, not a tie`).toBeGreaterThan(p3Score);

    // Wait for the recap to clear before the next iteration reads the next
    // round's emoji card (or, on the last round, before checking results).
    for (const page of [host.page, p2.page, p3.page]) {
      await expect(page.getByText("next round starting…")).toBeHidden({ timeout: 15_000 });
    }
  }

  // Game over on all three clients, with identical final standings.
  for (const page of [host.page, p2.page, p3.page]) {
    await expect(page.getByText("Game over")).toBeVisible({ timeout: 20_000 });
  }

  const [hostFinal, p2Final, p3Final] = await Promise.all(
    [host.page, p2.page, p3.page].map(async (page) => ({
      host: await readFinalScore(page, "E2E Host"),
      p2: await readFinalScore(page, "E2E Player Two"),
      p3: await readFinalScore(page, "E2E Player Three"),
    })),
  );
  expect(p2Final, "player two's final results screen should match the host's").toEqual(hostFinal);
  expect(p3Final, "player three's final results screen should match the host's").toEqual(hostFinal);

  // The final totals should still respect the same speed ordering that
  // held every round (three rounds of host >= p2 >= p3, host > p3).
  expect(hostFinal.host).toBeGreaterThanOrEqual(hostFinal.p2);
  expect(hostFinal.p2).toBeGreaterThanOrEqual(hostFinal.p3);
  expect(hostFinal.host).toBeGreaterThan(hostFinal.p3);
});
