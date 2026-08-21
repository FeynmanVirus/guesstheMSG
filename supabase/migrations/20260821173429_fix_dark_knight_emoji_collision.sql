-- 20260821173314_seed_country_and_more_words.sql accidentally gave "the
-- dark knight" the same emoji_sequence as the existing "batman" word
-- (both 🦇🃏) — a player would see one clue but have two valid-looking
-- answers, only one of which is correct for that specific round. Give it a
-- distinct sequence instead of touching the batman row.
update public.words
set emoji_sequence = '🦇🌃'
where answer = 'the dark knight'
  and emoji_sequence = '🦇🃏'
  and category_id = (select id from public.categories where name = 'Movies' and room_id is null);
