-- Removes the 40 single-emoji clues seeded across the two earlier seed
-- migrations (20260818091446_realtime_and_seed.sql,
-- 20260819040729_seed_more_words.sql) — a single emoji isn't really a
-- "sequence" to decode, and playtesting found them trivial/uninteresting.
-- This is 100% of Food and 100% of Things (Movies is untouched — every
-- Movies clue is already multi-emoji). Scoped by category name *and* the
-- literal emoji_sequence values rather than a length/grapheme-count
-- heuristic, so it can't accidentally catch a legitimate multi-codepoint
-- single-grapheme clue elsewhere (e.g. Movies' '⭐⚔️' is 2 graphemes and
-- must survive).
--
-- Deliberately deletes only — Food and Things end up with zero words
-- until more are added. round-tick's existing pool_exhausted handling
-- (supabase/functions/round-tick/index.ts) already ends a game gracefully
-- if a room's word pool is empty; this isn't new behavior to build.
--
-- The `not exists` guard skips any row already referenced by a played round
-- (rounds_word_id_fkey blocks deleting those outright — destroying round
-- history to satisfy a content cleanup isn't worth it). On a fresh database
-- with no rounds yet, the guard is a no-op and every listed row is deleted.
delete from public.words
where category_id in (select id from public.categories where name in ('Food', 'Things') and room_id is null)
  and emoji_sequence in (
    '🍕', '🍔', '🍣', '🌮', '🍝', '📱', '🔑', '👓', '⏰', '🎒',
    '🥞', '🍦', '🍩', '🥗', '🍟', '🌭', '🍿', '🥐', '🍜', '🧇',
    '🥪', '🍪', '🧀', '🥓', '🍫',
    '☂️', '🪑', '🔦', '📚', '✏️', '🧹', '🪞', '🔨', '🧳', '🕯️',
    '🎸', '📷', '🚲', '🧦', '🪥'
  )
  and not exists (select 1 from public.rounds r where r.word_id = words.id);
