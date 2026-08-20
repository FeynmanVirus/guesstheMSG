// Integration tests against the LIVE deployed submit-guess Edge Function —
// not pure logic like guess.test.deno.ts, this exercises the real
// create-room -> join-room -> start-game -> round-tick -> submit-guess
// chain over the network, because both scenarios below are only real bugs
// if they happen with the actual DB-level guarantees (the partial unique
// index, the server-only clock) in play, not against a mock.
//
// Two scenarios:
//   1. Two concurrent correct guesses from the same player (a genuine race,
//      not a sequential resubmit) must not double-score — the DB unique
//      index (guesses_one_correct_per_player_round) is CLAUDE.md rule 2's
//      actual enforcement, not just the `mine` pre-check.
//   2. A request body carrying extra "timestamp" fields (submittedAt,
//      timestamp, elapsedSeconds, now) claiming near-zero elapsed time must
//      have zero effect on the awarded score — the server's own clock is
//      the only one that counts (CLAUDE.md rule 3). submit-guess never
//      reads anything from the body but roomCode/text; this proves it.
//
// Run with:
//   npx --yes deno@2 test --allow-net --allow-env supabase/functions/submit-guess/submit-guess.integration.test.deno.ts
//
// Uses the project's public URL + publishable key (same ones the browser
// ships — never a service-role key) and real signInAnonymously() sessions,
// exactly like the app itself. Creates one real room; nothing in this repo
// can delete it (no service-role key here, and there's no delete-room API
// by design — rule 5), so a human with project access should prune rooms
// named "Integration test room" occasionally. The room code is logged so
// that's easy to find.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { answerFor, difficultyFor } from "../_shared/seed-words.ts";
import { difficultyScore } from "../_shared/guess.ts";
import { MIXED_CATEGORY_ID } from "../_shared/categories.ts";

const SUPABASE_URL = "https://solqgbkmfyaukdwwdxxm.supabase.co";
const SUPABASE_KEY = "sb_publishable_6Pu76Kc_W-zalcdeiOr75A_TFiO9glF";

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

async function newAnonClient(): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInAnonymously();
  if (error) throw new Error(`signInAnonymously failed: ${error.message}`);
  return client;
}

async function invoke<T>(client: SupabaseClient, fn: string, body: Record<string, unknown>): Promise<Envelope<T>> {
  const { data, error } = await client.functions.invoke(fn, { body });
  if (error) throw new Error(`${fn} transport error: ${error.message}`);
  return data as Envelope<T>;
}

async function setUpRoomWithLiveRound() {
  const host = await newAnonClient();
  const playerA = await newAnonClient();
  const playerB = await newAnonClient();

  // Mixed, not an unordered categories[0] pick — a single category can be
  // empty (e.g. Food/Things after 20260820180000_delete_single_emoji_words.sql),
  // which would end the game with no live round before this test ever gets
  // to submit-guess. Mixed pools every global category and stays valid as
  // long as any one of them (Movies) has words — matching seed-words.ts,
  // which only mirrors Movies now.
  const created = await invoke<{ roomCode: string; roomId: string }>(host, "create-room", {
    displayName: "IntegHost",
    avatarId: "fox",
    roomName: "Integration test room",
    categoryId: MIXED_CATEGORY_ID,
    settings: { rounds: 3, secondsPerRound: 30 },
  });
  assert(created.ok, `create-room rejected: ${created.error?.message}`);
  const { roomCode, roomId } = created.data!;
  console.log(`[submit-guess.integration] room code: ${roomCode} (id ${roomId})`);

  for (const [client, name] of [[playerA, "IntegPlayerA"], [playerB, "IntegPlayerB"]] as const) {
    const joined = await invoke(client, "join-room", {
      roomCode,
      displayName: name,
      avatarId: "frog",
    });
    assert(joined.ok, `join-room rejected for ${name}: ${joined.error?.message}`);
  }

  // Host abstains from guessing for the rest of these tests — the round
  // would otherwise end early once every active player has guessed
  // correctly, and the spoofed-timestamp test needs the round to still be
  // live several real seconds in.
  const started = await invoke(host, "start-game", { roomCode });
  assert(started.ok, `start-game rejected: ${started.error?.message}`);

  // Nothing else creates round 1 in a headless test — round-tick is
  // normally polled by every connected client's browser tab.
  const ticked = await invoke<{ state: string; roundId?: string }>(host, "round-tick", { roomCode });
  assert(ticked.ok && ticked.data?.state === "live", `round-tick didn't produce a live round: ${JSON.stringify(ticked)}`);

  const { data: round, error: roundError } = await host
    .from("rounds")
    .select("id, emoji_sequence")
    .eq("room_id", roomId)
    .is("revealed_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (roundError || !round) throw new Error(`could not read the live round: ${roundError?.message}`);

  return {
    roomCode,
    roomId,
    playerA,
    playerB,
    answer: answerFor(round.emoji_sequence),
    difficulty: difficultyFor(round.emoji_sequence),
  };
}

Deno.test("submit-guess: a concurrent duplicate correct guess does not double-score", async () => {
  const { roomCode, roomId, playerA, answer } = await setUpRoomWithLiveRound();

  interface Result {
    kind: "guess" | "chat";
    correct?: boolean;
    points?: number;
    alreadyCorrect?: boolean;
    winnersChat?: boolean;
  }

  const [first, second] = await Promise.all([
    invoke<Result>(playerA, "submit-guess", { roomCode, text: answer }),
    invoke<Result>(playerA, "submit-guess", { roomCode, text: answer }),
  ]);

  assert(first.ok && second.ok, `both requests should succeed at the HTTP layer: ${JSON.stringify({ first, second })}`);

  // Two valid outcomes for whichever request loses the race, depending on
  // exact timing: either it beat the winner's insert and the DB's partial
  // unique index (guesses_one_correct_per_player_round) caught the
  // collision (kind:'guess', alreadyCorrect:true), or the winner's insert
  // had already committed by the time this one ran its "already answered"
  // pre-check (kind:'chat', winnersChat:true) — that branch returns before
  // ever computing `correct`. Both are valid, non-double-scoring outcomes;
  // which one happens is a timing accident of two network round-trips, not
  // something this test should pin down to one shape.
  const responses = [first.data!, second.data!];
  const guesses = responses.filter((r) => r.kind === "guess");
  const chats = responses.filter((r) => r.kind === "chat");

  assert(guesses.length >= 1, `at least one response must be a scored guess: ${JSON.stringify(responses)}`);
  for (const r of guesses) assert(r.correct, `a 'guess' response must be correct: ${JSON.stringify(r)}`);
  for (const r of chats) assert(r.winnersChat, `a 'chat' response here must be winners' chat: ${JSON.stringify(r)}`);

  const fresh = guesses.filter((r) => !r.alreadyCorrect);
  assertEquals(fresh.length, 1, `exactly one response may be the fresh score: ${JSON.stringify(responses)}`);
  if (guesses.length === 2) {
    assertEquals(guesses[0].points, guesses[1].points, "both guess responses must report the same single score");
  }

  // The real invariant, regardless of which shape the losing request took:
  // players.score reflects exactly one scoring event, never two.
  const { data: player } = await playerA
    .from("players")
    .select("score")
    .eq("room_id", roomId)
    .eq("display_name", "IntegPlayerA")
    .single();
  assertEquals(player?.score, fresh[0].points, "players.score must equal exactly one award, not both summed");
});

Deno.test("submit-guess: spoofed timestamp fields in the request body are ignored", async () => {
  const { roomCode, playerB, answer, difficulty } = await setUpRoomWithLiveRound();

  // Real elapsed time must pass for this assertion to mean anything — if
  // the server honored any of these fake fields, it would still score at
  // the near-zero-elapsed ceiling despite the real wait below.
  await new Promise((resolve) => setTimeout(resolve, 8000));

  const result = await invoke<{ correct: boolean; points: number }>(playerB, "submit-guess", {
    roomCode,
    text: answer,
    // None of these are part of the real request contract
    // (roomCode/text only) — submit-guess must never read them.
    submittedAt: new Date(0).toISOString(),
    timestamp: 0,
    elapsedSeconds: 0,
    now: 0,
  });

  assert(result.ok, `submit-guess rejected: ${result.error?.message}`);
  assert(result.data!.correct, "the answer should still be recognized as correct");

  // playerB never guesses anywhere else in this room, so it's guaranteed to
  // be the room's first correct guess this round (+200). The ceiling if the
  // server had honored the spoofed near-zero elapsed time is
  // 500 (max time) + difficulty + 200 (first) — secondsPerRound=30, 5s
  // leeway. A real ~8s wait decays the time component by at least
  // 500*(1-3/25) ≈ 60 points below that max, well outside timing jitter, so
  // this isn't a flaky boundary assertion.
  const ceilingIfSpoofed = 500 + difficultyScore(difficulty) + 200;
  assert(
    result.data!.points < ceilingIfSpoofed - 40,
    `expected a real score reflecting the actual ~8s wait (< ${ceilingIfSpoofed - 40}), got ${result.data!.points} — the server may be trusting a client-supplied time`,
  );
});
