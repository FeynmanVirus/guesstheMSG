// Sentinel categoryId meaning "no single category — pool words from every
// global category". Never a row in `categories`; create-room stores
// `rooms.category_id = null` for it, and round-tick's createRound expands
// null back into every global category id when building the word pool.

export const MIXED_CATEGORY_ID = "mixed";
