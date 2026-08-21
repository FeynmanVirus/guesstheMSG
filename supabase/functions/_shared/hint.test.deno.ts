// Self-check for the letter-hint mask. Run with:
//   npx --yes deno@2 test supabase/functions/_shared/hint.test.deno.ts
//
// hint.ts has zero imports, so no permission flags are needed.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { hintState, maxReveals, revealOrder } from "./hint.ts";

Deno.test("maxReveals: the three confirmed tiers, plus the eligible-length clamp", () => {
  assertEquals(maxReveals("cat"), 1); // 1 word, <4 letters
  assertEquals(maxReveals("up"), 0); // eligible.length-1 clamps this to 0
  assertEquals(maxReveals("pizza"), 2); // 1 word, >=4 letters
  assertEquals(maxReveals("kite"), 2); // exactly 4 letters -> the ">=4" tier
  assertEquals(maxReveals("hot dog"), 3); // 2 words, any combined length
  // "my dog" has only 3 eligible (non-first-letter) positions total, so the
  // eligible-length clamp caps it at 2 even though the word-count tier is 3
  // — at least one non-first letter must always stay blank.
  assertEquals(maxReveals("my dog"), 2);
  assertEquals(maxReveals("the lion king"), 3); // 3 words
});

Deno.test("maxReveals: punctuation doesn't count as a letter", () => {
  // "can't" has 4 alphanumeric letters (c a n t), so it's the ">=4" tier.
  assertEquals(maxReveals("can't"), 2);
});

Deno.test("revealOrder never includes a word's first letter", () => {
  for (const answer of ["pizza", "hot dog", "can't stop", "the lion king", "a"]) {
    const order = revealOrder(answer, "round-1");
    const words = answer.split(/\s+/);
    let offset = 0;
    for (const word of words) {
      const firstAlnumIdx = answer.indexOf(word.match(/[\p{L}\p{N}]/u)?.[0] ?? "\0", offset);
      if (firstAlnumIdx !== -1) assert(!order.includes(firstAlnumIdx), `${answer}: first letter leaked`);
      offset += word.length + 1;
    }
  }
});

Deno.test("revealOrder is deterministic per (answer, roundId) and varies across round ids", () => {
  const a = revealOrder("pizza", "round-abc");
  const b = revealOrder("pizza", "round-abc");
  assertEquals(a, b);

  const c = revealOrder("pizza", "round-xyz");
  // Not a hard guarantee for every possible pair, but true for this pair —
  // if it ever collides, swap in a different roundId rather than loosen this.
  assert(JSON.stringify(a) !== JSON.stringify(c), "different round ids produced the same order");
});

Deno.test("hintState: fully blank before HINT_START_SECONDS, and only gains letters over time", () => {
  const answer = "pizza night";
  const roundId = "round-1";
  const startedAtMs = 0;
  const endsAtMs = 60_000;

  const before = hintState(answer, roundId, startedAtMs, endsAtMs, 14_000);
  assertEquals(before.mask, "_____ _____");

  let prevRevealedCount = 0;
  for (let t = 0; t <= 60_000; t += 500) {
    const { mask } = hintState(answer, roundId, startedAtMs, endsAtMs, t);
    const revealedCount = [...mask].filter((ch, i) => /[\p{L}\p{N}]/u.test(answer[i]) && ch !== "_").length;
    assert(revealedCount >= prevRevealedCount, `mask lost a letter between ticks at t=${t}`);
    prevRevealedCount = revealedCount;
  }
  assertEquals(prevRevealedCount, maxReveals(answer));
});

Deno.test("hintState: never reveals a word's first letter, at any point in the round", () => {
  const answer = "hot dog";
  const roundId = "round-2";
  for (let t = 0; t <= 90_000; t += 1000) {
    const { mask } = hintState(answer, roundId, 0, 90_000, t);
    assertEquals(mask[0], "_");
    assertEquals(mask[4], "_"); // "hot dog"[4] === 'd', dog's first letter
  }
});

Deno.test("hintState: schedule stays inside the round for both the min and max round length", () => {
  for (const duration of [30_000, 90_000]) {
    const { nextRevealAt } = hintState("pizza night out", "round-3", 0, duration, 0);
    assert(nextRevealAt !== null);
    const dueMs = new Date(nextRevealAt!).getTime();
    assert(dueMs >= 15_000 && dueMs < duration, `first reveal at ${dueMs}ms outside [15000, ${duration})`);

    const finalState = hintState("pizza night out", "round-3", 0, duration, duration);
    assertEquals(finalState.nextRevealAt, null);
  }
});

Deno.test("hintState: identical output for the same inputs across repeated calls", () => {
  const a = hintState("pizza", "round-4", 0, 60_000, 20_000);
  const b = hintState("pizza", "round-4", 0, 60_000, 20_000);
  assertEquals(a, b);
});
