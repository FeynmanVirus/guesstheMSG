-- Adds the "Country" global category and imports the host's word-bank
-- CSV (154 rows: 27 Country, 21 Food, 66 Movies, 40 Things) — same
-- name-join pattern as 20260819040729_seed_more_words.sql.
--
-- Two idempotency guards, both load-bearing (categories.name has no unique
-- constraint, per 20260818091407_core_tables.sql's schema):
--   1. The category insert only fires if no global "Country" category
--      exists yet.
--   2. The words insert skips any (category, answer) pair that category
--      already has — checked live against `words`, not hand-filtered from
--      the CSV, so it stays correct regardless of what's retired. This
--      catches 15 real overlaps between the CSV and the existing seed data:
--      "sushi" (Food) and 14 Movies answers (cars, finding nemo, frozen,
--      ghostbusters, harry potter, jaws, jurassic park, spider-man, the
--      lion king, the matrix, titanic, toy story, up, wall-e) — several of
--      which are currently RETIRED rows from
--      20260820180000_delete_single_emoji_words.sql /
--      20260820181500_retire_single_emoji_words.sql, not live ones.
--
-- Answers are stored lowercase, matching the existing seed rows and
-- normalizeGuess's comparison convention (supabase/functions/_shared/guess.ts).

insert into public.categories (name, is_custom, room_id)
select 'Country', false, null
where not exists (
  select 1 from public.categories where name = 'Country' and room_id is null
);

insert into public.words (category_id, emoji_sequence, answer, difficulty)
select c.id, w.emoji_sequence, w.answer, w.difficulty
from public.categories c
join (values
  ('Food', '🍚🐟🥢', 'sushi', 'easy'),
  ('Food', '🌽🧈🔥', 'corn on the cob', 'easy'),
  ('Food', '🍝🧀', 'mac and cheese', 'easy'),
  ('Food', '🌶️🧀🌽', 'nachos', 'medium'),
  ('Food', '🦞🧈', 'lobster', 'medium'),
  ('Food', '🥩🧄🧈', 'steak', 'medium'),
  ('Food', '🐔🍛🌶️', 'chicken curry', 'medium'),
  ('Food', '🍔🧀🥓', 'bacon cheeseburger', 'easy'),
  ('Food', '🥟🥢', 'dumplings', 'easy'),
  ('Food', '🥙🧆🥬', 'shawarma', 'hard'),
  ('Food', '🍲🥔🐄', 'beef stew', 'medium'),
  ('Food', '🦃🥔🌽', 'thanksgiving', 'medium'),
  ('Food', '🥗🧀🥖🥬', 'caesar salad', 'medium'),
  ('Food', '🦪🍋', 'oysters', 'medium'),
  ('Food', '🍏🥧', 'apple pie', 'easy'),
  ('Food', '🍲🐟🌶️', 'fish stew', 'medium'),
  ('Food', '🍡🌸', 'mochi', 'hard'),
  ('Food', '🍕🍄🧅', 'veggie pizza', 'easy'),
  ('Food', '🐟🍋🌿', 'grilled fish', 'medium'),
  ('Food', '🍚🥢🍙', 'onigiri', 'medium'),
  ('Food', '🍞🧀🔥', 'grilled cheese sandwich', 'easy'),
  ('Movies', '🦈🌊', 'jaws', 'easy'),
  ('Movies', '🕷️🕸️🧑', 'spider-man', 'easy'),
  ('Movies', '🚢🧊💔', 'titanic', 'easy'),
  ('Movies', '🧠🔄💤', 'inception', 'hard'),
  ('Movies', '👻🔫', 'ghostbusters', 'medium'),
  ('Movies', '🍫🏭', 'charlie and the chocolate factory', 'medium'),
  ('Movies', '🦁👑', 'the lion king', 'easy'),
  ('Movies', '🧙‍♂️💍🌋', 'the lord of the rings', 'medium'),
  ('Movies', '🦖🏝️', 'jurassic park', 'easy'),
  ('Movies', '🤖❤️🌍', 'wall-e', 'medium'),
  ('Movies', '🧊👸❄️', 'frozen', 'easy'),
  ('Movies', '🚗🏎️💨', 'fast and furious', 'medium'),
  ('Movies', '🐠🔍', 'finding nemo', 'easy'),
  ('Movies', '🎈🏠👴', 'up', 'medium'),
  ('Movies', '🧟‍♂️🌆', 'world war z', 'medium'),
  ('Movies', '🦇🌃', 'the dark knight', 'medium'),
  ('Movies', '🏴‍☠️🦜⚓', 'pirates of the caribbean', 'medium'),
  ('Movies', '🌪️🏠🧙', 'the wizard of oz', 'medium'),
  ('Movies', '🕰️🚗⚡', 'back to the future', 'medium'),
  ('Movies', '🦍🏙️', 'king kong', 'medium'),
  ('Movies', '🧛🩸', 'dracula', 'medium'),
  ('Movies', '🐺🏀', 'teen wolf', 'hard'),
  ('Movies', '🐭🧑‍🍳🍅', 'ratatouille', 'medium'),
  ('Movies', '🐜🔍', 'a bug''s life', 'medium'),
  ('Movies', '🧞‍♂️🪔', 'aladdin', 'easy'),
  ('Movies', '🧙‍♀️💚', 'wicked', 'medium'),
  ('Movies', '🦸‍♂️🛡️', 'captain america', 'easy'),
  ('Movies', '🕶️💊', 'the matrix', 'medium'),
  ('Movies', '🧑‍🚀🪐⏳', 'interstellar', 'medium'),
  ('Movies', '🏹👧🔥', 'the hunger games', 'medium'),
  ('Movies', '🕵️‍♂️🔍👓', 'sherlock holmes', 'medium'),
  ('Movies', '🦉🪄⚡', 'harry potter', 'easy'),
  ('Movies', '🍎🪞👸', 'snow white', 'medium'),
  ('Movies', '🥊🏙️🏆', 'rocky', 'medium'),
  ('Movies', '🎭🃏', 'joker', 'medium'),
  ('Movies', '🕰️🐇🕳️', 'alice in wonderland', 'medium'),
  ('Movies', '🦍💚⚡', 'the incredible hulk', 'medium'),
  ('Movies', '🚂🎅❄️', 'polar express', 'medium'),
  ('Movies', '🦁🦒🦓🏝️', 'madagascar', 'medium'),
  ('Movies', '🐝🍯👔', 'bee movie', 'easy'),
  ('Movies', '🧜‍♀️🐚', 'the little mermaid', 'easy'),
  ('Movies', '🐉🥚🔥', 'how to train your dragon', 'medium'),
  ('Movies', '🤡🎈🔴', 'it', 'medium'),
  ('Movies', '🧟‍♀️📚🔫', 'zombieland', 'hard'),
  ('Movies', '🐧❄️💃', 'happy feet', 'medium'),
  ('Movies', '🐳🎣', 'moby dick', 'hard'),
  ('Movies', '🚕💛🔫', 'taxi driver', 'hard'),
  ('Movies', '⚡🔨', 'thor', 'easy'),
  ('Movies', '🐭🧀🐱', 'tom and jerry', 'easy'),
  ('Movies', '🧛‍♂️🐺❤️', 'twilight', 'medium'),
  ('Movies', '🥁🎓', 'whiplash', 'hard'),
  ('Movies', '🐴🤠🚀', 'toy story', 'medium'),
  ('Movies', '🏹🌳🤠', 'robin hood', 'medium'),
  ('Movies', '🐒🚀🌕', 'space chimps', 'hard'),
  ('Movies', '🕶️👽🔫', 'men in black', 'easy'),
  ('Movies', '🐆🏃‍♀️🌆', 'zootopia', 'medium'),
  ('Movies', '🚗🏁🔧', 'cars', 'easy'),
  ('Movies', '🧚‍♀️🏴‍☠️⏰', 'peter pan', 'medium'),
  ('Movies', '👠🎃🕛', 'cinderella', 'easy'),
  ('Movies', '🌹👹🏰', 'beauty and the beast', 'medium'),
  ('Movies', '🎸🏫', 'school of rock', 'medium'),
  ('Movies', '🐴⚔️🌾', 'war horse', 'hard'),
  ('Movies', '🦑🤖💥', 'pacific rim', 'hard'),
  ('Movies', '🧙‍♀️🎃🕯️', 'hocus pocus', 'medium'),
  ('Movies', '🖤👅👹', 'venom', 'medium'),
  ('Movies', '🦸‍♀️⚔️🛡️', 'wonder woman', 'easy'),
  ('Things', '⏰🐦', 'early bird', 'medium'),
  ('Things', '🌕🐺', 'werewolf', 'medium'),
  ('Things', '🦷🧚', 'tooth fairy', 'easy'),
  ('Things', '🐝🍯', 'honeycomb', 'easy'),
  ('Things', '🎈🎂🎉', 'birthday party', 'easy'),
  ('Things', '🧊🏔️', 'glacier', 'medium'),
  ('Things', '🧯🔥', 'fire extinguisher', 'easy'),
  ('Things', '🧭🗺️', 'treasure map', 'medium'),
  ('Things', '🕳️🐰', 'rabbit hole', 'medium'),
  ('Things', '🌡️🤒', 'fever', 'easy'),
  ('Things', '🧦🎁', 'christmas stocking', 'medium'),
  ('Things', '🐢🐇🏁', 'the tortoise and the hare', 'medium'),
  ('Things', '🦉🌙📚', 'night owl', 'medium'),
  ('Things', '🐝🌼', 'pollination', 'medium'),
  ('Things', '🪜🧑‍🚒', 'fire fighter', 'hard'),
  ('Things', '🌠🙏', 'wishing star', 'medium'),
  ('Things', '🐛🦋', 'metamorphosis', 'medium'),
  ('Things', '🧴🧼', 'soap', 'easy'),
  ('Things', '🪒🧔', 'shaving', 'medium'),
  ('Things', '🧦👃', 'stinky socks', 'hard'),
  ('Things', '🎿❄️', 'skiing', 'easy'),
  ('Things', '🏂❄️', 'snowboarding', 'easy'),
  ('Things', '🏓🏓', 'ping pong', 'easy'),
  ('Things', '🎳🎯', 'bowling', 'medium'),
  ('Things', '🧗‍♀️🪢', 'rock climbing', 'medium'),
  ('Things', '🪂✈️', 'skydiving', 'easy'),
  ('Things', '🧜‍♂️🔱', 'poseidon', 'hard'),
  ('Things', '🧬🔬', 'biotech', 'medium'),
  ('Things', '🪐🔭', 'astronomy', 'medium'),
  ('Things', '🦷😬', 'braces', 'medium'),
  ('Things', '🕰️🔔', 'alarm clock', 'easy'),
  ('Things', '🪃🦘', 'boomerang', 'medium'),
  ('Things', '🪤🧀', 'mousetrap', 'easy'),
  ('Things', '🕸️🕷️🏚️', 'haunted house', 'medium'),
  ('Things', '🪦⚰️', 'funeral', 'medium'),
  ('Things', '🍬🎃', 'halloween', 'easy'),
  ('Things', '🏝️🦜', 'bahamas', 'easy'),
  ('Things', '🧊🥶🐻‍❄️', 'arctic', 'medium'),
  ('Things', '🐫💧', 'sahara desert', 'hard'),
  ('Things', '☀️🏖️🍦', 'summer vacation', 'easy'),
  ('Country', '🌮🌵', 'mexico', 'easy'),
  ('Country', '🦘🏄', 'australia', 'easy'),
  ('Country', '🐼🥢', 'china', 'easy'),
  ('Country', '🐘🕌🍛', 'india', 'medium'),
  ('Country', '🐂💃🥘', 'spain', 'medium'),
  ('Country', '🏔️🍫🧀', 'switzerland', 'medium'),
  ('Country', '🍁🏒', 'canada', 'easy'),
  ('Country', '🗽🍔', 'united states', 'easy'),
  ('Country', '🫒🏛️🌊', 'greece', 'medium'),
  ('Country', '🐻❄️🎻', 'russia', 'medium'),
  ('Country', '🍫🧇🚲', 'belgium', 'hard'),
  ('Country', '🐑🥝', 'new zealand', 'medium'),
  ('Country', '🐪🛢️🏜️', 'saudi arabia', 'hard'),
  ('Country', '🏙️🛢️🌆', 'united arab emirates', 'hard'),
  ('Country', '🌋❄️♨️', 'iceland', 'medium'),
  ('Country', '🌶️🏔️🍷', 'chile', 'hard'),
  ('Country', '🍛🐘🏖️', 'sri lanka', 'hard'),
  ('Country', '🐫🏜️🧿', 'morocco', 'hard'),
  ('Country', '🎤📱🥢', 'japan', 'medium'),
  ('Country', '🎻🏔️🍰', 'austria', 'hard'),
  ('Country', '🏔️🙏🚩', 'nepal', 'hard'),
  ('Country', '🛋️📦❄️', 'sweden', 'hard'),
  ('Country', '☕👑🌂', 'united kingdom', 'medium'),
  ('Country', '🦁🍷🏞️', 'south africa', 'hard'),
  ('Country', '🏏🧕🕌', 'pakistan', 'hard'),
  ('Country', '🐅🌊🕌', 'bangladesh', 'hard'),
  ('Country', '🌶️🍲🏰', 'hungary', 'hard')
) as w(category, emoji_sequence, answer, difficulty) on w.category = c.name
where c.is_custom = false
  and c.room_id is null
  and not exists (
    select 1 from public.words w2
    where w2.category_id = c.id and lower(w2.answer) = w.answer
  );
