-- Expands each global category from 5 to 20 words. The default room is 10
-- rounds and word selection is no-repeat within a session
-- (ARCHITECTURE.md §13), so 5 per category would exhaust the pool and end
-- a default game halfway through.
--
-- Answers are stored lowercase and are compared after normalizeGuess
-- (trim/lowercase/strip punctuation), so 'wall-e' also matches "Wall E".

insert into public.words (category_id, emoji_sequence, answer, difficulty)
select c.id, w.emoji_sequence, w.answer, w.difficulty
from public.categories c
join (values
  ('Movies', '⭐⚔️',      'star wars',     'easy'),
  ('Movies', '🕶️💊',      'the matrix',    'medium'),
  ('Movies', '🐠🔍',      'finding nemo',  'easy'),
  ('Movies', '🧙⚡👓',    'harry potter',  'easy'),
  ('Movies', '👹🧅',      'shrek',         'medium'),
  ('Movies', '🦖🏝️',      'jurassic park', 'easy'),
  ('Movies', '👻🔫',      'ghostbusters',  'medium'),
  ('Movies', '🤠🚀🧸',    'toy story',     'easy'),
  ('Movies', '🚢🧊💔',    'titanic',       'easy'),
  ('Movies', '🦇🃏',      'batman',        'easy'),
  ('Movies', '🏠🎈👴',    'up',            'medium'),
  ('Movies', '🚗⚡🏁',    'cars',          'easy'),
  ('Movies', '🤖❤️🌱',    'wall-e',        'medium'),
  ('Movies', '🎩🍫🏭',    'willy wonka',   'medium'),
  ('Movies', '🐼🥋',      'kung fu panda', 'easy')

  -- All 15 Food and all 15 Things rows that used to be here were
  -- single-emoji clues — removed in
  -- 20260820180000_delete_single_emoji_words.sql, not re-added here.
) as w(category, emoji_sequence, answer, difficulty) on w.category = c.name
where c.is_custom = false and c.room_id is null;
