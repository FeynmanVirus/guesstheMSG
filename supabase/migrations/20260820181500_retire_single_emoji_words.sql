-- The 27 single-emoji Food/Things rows that survived
-- 20260820180000_delete_single_emoji_words.sql are all FK-referenced by
-- played rounds (rounds_word_id_fkey), so they can't be hard-deleted
-- without destroying round history. Without this, they'd stay selectable
-- forever — round-tick's no-repeat check only excludes words already used
-- *within the current session*, not retired words in general. A soft-delete
-- flag is the minimal fix that actually stops them from being drawn again.
--
-- On a fresh database this update matches zero rows (the prior migration's
-- `not exists` guard already deleted all of them outright), so the column
-- still gets added — cheap, and round-tick's pool query filters on it
-- unconditionally — but nothing here is retired that wasn't already gone.
alter table public.words add column retired boolean not null default false;

update public.words
set retired = true
where category_id in (select id from public.categories where name in ('Food', 'Things') and room_id is null)
  and emoji_sequence in (
    '🍕', '🍔', '🍣', '🌮', '🍝', '📱', '🔑', '👓', '⏰', '🎒',
    '🥞', '🍦', '🍩', '🥗', '🍟', '🌭', '🍿', '🥐', '🍜', '🧇',
    '🥪', '🍪', '🧀', '🥓', '🍫',
    '☂️', '🪑', '🔦', '📚', '✏️', '🧹', '🪞', '🔨', '🧳', '🕯️',
    '🎸', '📷', '🚲', '🧦', '🪥'
  );
