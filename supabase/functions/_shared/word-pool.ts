// Word-pool selection. Pure, no I/O — same convention as guess.ts/hint.ts.
//
// The naive `pool[Math.floor(Math.random() * pool.length)]` round-tick used
// to do picks uniformly over WORDS, not CATEGORIES. That weights each
// category by its own word count: in a "Mixed" room with one 70-word
// category and one 20-word category, the smaller one gets drawn ~3.5x less
// often than an even split would give it — and a room's own custom category
// (usually 2-5 words) all but disappears against a 20+-word global one. This
// module picks a category uniformly among the ones with an unused word left,
// then a word uniformly within that category — so every category currently
// in play (global or custom) gets an equal shot each round, not one
// proportional to how many words happen to be in it.

export interface PoolWord {
  id: string;
  category_id: string;
}

/** `random` is injectable so the self-check can run with a seeded PRNG
 * instead of Math.random(). Caller must pass a non-empty pool. */
export function pickWeightedWord<T extends PoolWord>(
  pool: readonly T[],
  random: () => number = Math.random,
): T {
  const categoryIds = [...new Set(pool.map((w) => w.category_id))];
  const categoryId = categoryIds[Math.floor(random() * categoryIds.length)];
  const inCategory = pool.filter((w) => w.category_id === categoryId);
  return inCategory[Math.floor(random() * inCategory.length)];
}
