-- guesses.guess_text was readable by any room member, mid-round — see
-- CLAUDE.md rule 1. 20260818091436_rls_policies.sql granted `select` on the
-- whole table to `authenticated`; guesses_select then gates rows only by
-- room membership, not round liveness or is_correct. A member could read
-- the answer straight off the winner's row before reveal via
--   GET /rest/v1/guesses?round_id=eq.<live>&is_correct=eq.true&select=guess_text
-- which walks around submit-guess's deliberate "<name> guessed correctly
-- +<points>" broadcast (never the text).
--
-- Fixed the same way players.score is (rls_policies.sql:39-44): a
-- column-level grant, so a client SELECT naming guess_text is rejected by
-- the privilege system before RLS is even consulted — no policy rewrite,
-- no per-row round-liveness predicate needed. The table-level grant is
-- revoked first: a later column-level grant does not narrow an existing
-- table-wide one.
--
-- Verified nothing breaks: round-recap.tsx selects (player_id,
-- points_awarded); game-results.tsx embeds guesses(player_id, is_correct,
-- points_awarded, submitted_at) — both fully covered by the grant below,
-- neither uses guess_text or `select *`. submit-guess (the only writer)
-- runs as service_role, which bypasses grants/RLS entirely.
revoke select on public.guesses from authenticated;
grant select (id, round_id, player_id, is_correct, submitted_at, points_awarded)
  on public.guesses to authenticated;
