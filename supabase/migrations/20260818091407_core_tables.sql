-- Phase 1: core tables for GuessTheMSG (see ARCHITECTURE.md §2)
-- rooms.category_id and categories.room_id reference each other, so rooms is
-- created first without the FK, categories second, then the FK is added.

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  password_hash text,
  status text not null default 'lobby' check (status in ('lobby', 'in_progress', 'ended')),
  category_id uuid,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_custom boolean not null default false,
  room_id uuid references public.rooms (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint categories_custom_needs_room check (
    (is_custom = false and room_id is null) or
    (is_custom = true and room_id is not null)
  )
);

alter table public.rooms
  add constraint rooms_category_id_fkey
  foreign key (category_id) references public.categories (id) on delete set null;

create index rooms_category_id_idx on public.rooms (category_id);
create index categories_room_id_idx on public.categories (room_id);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_id text not null default 'default',
  score integer not null default 0 check (score >= 0),
  is_host boolean not null default false,
  is_connected boolean not null default true,
  is_spectator boolean not null default false,
  status text not null default 'active' check (status in ('active', 'kicked')),
  is_muted boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (room_id, auth_user_id)
);

-- Exactly one host per room, enforced structurally rather than by convention
-- (see ARCHITECTURE.md §2 — players.is_host is the single source of truth,
-- there is deliberately no rooms.host_id).
create unique index players_one_host_per_room on public.players (room_id) where is_host;
create index players_room_id_idx on public.players (room_id);
create index players_auth_user_id_idx on public.players (auth_user_id);

create table public.words (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete cascade,
  emoji_sequence text not null,
  answer text not null,
  difficulty text,
  created_at timestamptz not null default now()
);

create index words_category_id_idx on public.words (category_id);

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  session_number integer not null check (session_number > 0),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  category_id uuid references public.categories (id) on delete set null,
  settings jsonb not null default '{}'::jsonb,
  unique (room_id, session_number)
);

create index game_sessions_room_id_idx on public.game_sessions (room_id);

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  word_id uuid not null references public.words (id),
  -- snapshot of words.emoji_sequence at round start, so clients never need
  -- read access to `words` (which holds the answer) — see ARCHITECTURE.md §2/§3.
  emoji_sequence text not null,
  round_number integer not null check (round_number > 0),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  revealed boolean not null default false,
  unique (game_session_id, round_number)
);

create index rounds_room_id_idx on public.rounds (room_id);
create index rounds_word_id_idx on public.rounds (word_id);

create table public.guesses (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  guess_text text not null,
  is_correct boolean not null default false,
  submitted_at timestamptz not null default now(),
  points_awarded integer not null default 0 check (points_awarded >= 0)
);

-- DB-enforced invariant: only one correct guess per player per round, closing
-- the submit-guess TOCTOU race described in ARCHITECTURE.md §14.
create unique index guesses_one_correct_per_player_round
  on public.guesses (round_id, player_id) where is_correct;
create index guesses_round_id_idx on public.guesses (round_id);
create index guesses_player_id_idx on public.guesses (player_id);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  body text not null,
  kind text not null default 'chat' check (kind in ('chat', 'guess', 'system')),
  created_at timestamptz not null default now()
);

create index chat_messages_room_id_idx on public.chat_messages (room_id);
create index chat_messages_player_id_idx on public.chat_messages (player_id);
