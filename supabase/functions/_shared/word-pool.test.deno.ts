// Self-check for the word-pool pick. Run with:
//   npx --yes deno@2 test supabase/functions/_shared/word-pool.test.deno.ts
//
// word-pool.ts has zero imports, so no permission flags are needed.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { pickWeightedWord, type PoolWord } from "./word-pool.ts";

// Deterministic PRNG (mulberry32) so the distribution assertions below are
// reproducible instead of flaky — pickWeightedWord's `random` param exists
// for exactly this.
function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makePool(counts: Record<string, number>): PoolWord[] {
  const pool: PoolWord[] = [];
  for (const [categoryId, count] of Object.entries(counts)) {
    for (let i = 0; i < count; i++) pool.push({ id: `${categoryId}-${i}`, category_id: categoryId });
  }
  return pool;
}

Deno.test("pickWeightedWord: every pick belongs to the category it claims", () => {
  const pool = makePool({ a: 18, b: 2 });
  const random = seededRandom(1);
  for (let i = 0; i < 500; i++) {
    const word = pickWeightedWord(pool, random);
    assert(word.id.startsWith(word.category_id), `${word.id} doesn't match ${word.category_id}`);
  }
});

Deno.test("pickWeightedWord: near-even split by category, not by word count", () => {
  // 18 words in "a", 2 in "b" — a flat pick would draw "a" ~90% of the
  // time. Category-uniform picking should land close to 50/50 instead.
  const pool = makePool({ a: 18, b: 2 });
  const random = seededRandom(42);
  const counts: Record<string, number> = { a: 0, b: 0 };
  const trials = 4000;
  for (let i = 0; i < trials; i++) {
    counts[pickWeightedWord(pool, random).category_id]++;
  }
  const aShare = counts.a / trials;
  // Not a tight bound — this is a statistical check, not an exact one —
  // but it must land nowhere near the ~90% a flat-over-words pick would
  // produce.
  assert(aShare > 0.4 && aShare < 0.6, `category "a" share was ${aShare}, expected ~0.5`);
});

Deno.test("pickWeightedWord: a single-category pool always returns from it", () => {
  const pool = makePool({ solo: 5 });
  const random = seededRandom(7);
  for (let i = 0; i < 50; i++) {
    assertEquals(pickWeightedWord(pool, random).category_id, "solo");
  }
});

Deno.test("pickWeightedWord: a lone word in a lone category is always returned", () => {
  const pool = makePool({ only: 1 });
  assertEquals(pickWeightedWord(pool, seededRandom(3)).id, "only-0");
});
