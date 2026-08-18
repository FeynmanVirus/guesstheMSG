-- Phase 1: Realtime publication + seed categories/words.
--
-- `words` is deliberately excluded — Postgres Changes still respects RLS for
-- authenticated subscribers, and `words` has zero policies (ARCHITECTURE.md §3),
-- but there's no reason to broadcast change events for a table clients never read.

alter publication supabase_realtime add table
  public.rooms,
  public.players,
  public.game_sessions,
  public.rounds,
  public.guesses,
  public.chat_messages;

-- Seed: global categories with a handful of words each, so RLS can be tested
-- against real rows.
insert into public.categories (name, is_custom, room_id) values
  ('Movies', false, null),
  ('Food', false, null),
  ('Things', false, null);

with cat as (
  select id, name from public.categories where is_custom = false
)
insert into public.words (category_id, emoji_sequence, answer, difficulty)
select cat.id, w.emoji_sequence, w.answer, w.difficulty
from cat
join (values
  ('Movies', '🦁👑', 'the lion king', 'easy'),
  ('Movies', '🕷️👨', 'spider-man', 'easy'),
  ('Movies', '⛄👸❄️', 'frozen', 'easy'),
  ('Movies', '🦈🌊', 'jaws', 'medium'),
  ('Movies', '👽🚲🌕', 'e.t.', 'medium'),
  ('Food', '🍕', 'pizza', 'easy'),
  ('Food', '🍔', 'burger', 'easy'),
  ('Food', '🍣', 'sushi', 'easy'),
  ('Food', '🌮', 'taco', 'easy'),
  ('Food', '🍝', 'spaghetti', 'medium'),
  ('Things', '📱', 'phone', 'easy'),
  ('Things', '🔑', 'key', 'easy'),
  ('Things', '👓', 'glasses', 'easy'),
  ('Things', '⏰', 'clock', 'easy'),
  ('Things', '🎒', 'backpack', 'medium')
) as w(category, emoji_sequence, answer, difficulty)
  on cat.name = w.category;
