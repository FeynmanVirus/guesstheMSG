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
  ('Movies', '🐼🥋',      'kung fu panda', 'easy'),

  ('Food',   '🥞',        'pancakes',      'easy'),
  ('Food',   '🍦',        'ice cream',     'easy'),
  ('Food',   '🍩',        'donut',         'easy'),
  ('Food',   '🥗',        'salad',         'easy'),
  ('Food',   '🍟',        'fries',         'easy'),
  ('Food',   '🌭',        'hot dog',       'easy'),
  ('Food',   '🍿',        'popcorn',       'easy'),
  ('Food',   '🥐',        'croissant',     'medium'),
  ('Food',   '🍜',        'ramen',         'easy'),
  ('Food',   '🧇',        'waffle',        'easy'),
  ('Food',   '🥪',        'sandwich',      'easy'),
  ('Food',   '🍪',        'cookie',        'easy'),
  ('Food',   '🧀',        'cheese',        'easy'),
  ('Food',   '🥓',        'bacon',         'easy'),
  ('Food',   '🍫',        'chocolate',     'easy'),

  ('Things', '☂️',        'umbrella',      'easy'),
  ('Things', '🪑',        'chair',         'easy'),
  ('Things', '🔦',        'flashlight',    'medium'),
  ('Things', '📚',        'books',         'easy'),
  ('Things', '✏️',        'pencil',        'easy'),
  ('Things', '🧹',        'broom',         'easy'),
  ('Things', '🪞',        'mirror',        'easy'),
  ('Things', '🔨',        'hammer',        'easy'),
  ('Things', '🧳',        'suitcase',      'medium'),
  ('Things', '🕯️',        'candle',        'easy'),
  ('Things', '🎸',        'guitar',        'easy'),
  ('Things', '📷',        'camera',        'easy'),
  ('Things', '🚲',        'bicycle',       'easy'),
  ('Things', '🧦',        'socks',         'easy'),
  ('Things', '🪥',        'toothbrush',    'medium')
) as w(category, emoji_sequence, answer, difficulty) on w.category = c.name
where c.is_custom = false and c.room_id is null;
