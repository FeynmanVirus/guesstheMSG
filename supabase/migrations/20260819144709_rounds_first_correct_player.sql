-- Scoring now includes a flat first-guess bonus, awarded once per round to
-- whichever player's correct guess is first across the WHOLE ROOM (not
-- "this player's first attempt" — CLAUDE.md rule 2/3's server-authoritative
-- ordering, now feeding the point formula directly instead of just
-- informational recap text).
--
-- Modeled as a nullable pointer on `rounds`, claimed via a single guarded
-- UPDATE (`... WHERE first_correct_player_id IS NULL`) rather than
-- "SELECT the earliest guesses row, check if it's mine" — the SELECT
-- approach has a real race between two DIFFERENT players' concurrent
-- correct guesses: whichever one's SELECT runs before the other's INSERT
-- has committed can each see "no earlier row yet" and both conclude they
-- were first, double-awarding the bonus. A single atomically-guarded UPDATE
-- has no such window — Postgres serializes concurrent UPDATEs to the same
-- row, so exactly one caller's WHERE clause matches.
alter table public.rounds
  add column first_correct_player_id uuid references public.players (id) on delete set null;
