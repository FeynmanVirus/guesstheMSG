# Guess the MSG — Point System Design Notes (Final)

This replaces the earlier time+guess-count design. Keeping the full
history below since the earlier work explains *why* the final formula
looks the way it does — it wasn't the first idea, it's what survived
after a real implementation problem was found.

---

## Original Design (superseded)

The first version scored two independent factors, both 0–500:

- **time_score** — linear decay: 500 points if correct within 5s,
  decaying to 0 by the end of the round.
- **guess_score** — harmonic decay based on number of guesses taken:
  `500 / (1 + k * (guesses - 1))`, with `k = 0.2` chosen via an elbow
  plot comparing the 1st-to-2nd-guess point drop across k = 0.1–2.0.

This produced a clean 0–1000 range per round and was fully validated
in `scoring.py` (earlier version) before being scrapped.

## Why It Was Scrapped

The chat and guess-submission UI share a single input box — there's
no dedicated "this is my answer attempt" field, just one shared
message stream where players can both chat and guess.

This breaks `guess_score` in a fundamental way: the server can always
check a message against the answer (that part's easy), but it can't
tell "wrong guess" apart from "normal chat" when counting how many
attempts a player made. A player who says "lol nice try" to a friend
mid-round would be counted as having "guessed" and penalized for it.
Counting messages is trivial — counting *meaningful guesses* isn't,
without either:

1. A dedicated guess input, separate from chat (rejected for now —
   would require a UI change), or
2. Accepting the noise (rejected — actively unfair to chatty players)

## Rejected Alternative: Rank-Based Scoring

Before landing on the final version, replacing guess-count with
**rank** (1st correct guess, 2nd correct guess, etc.) was considered.
This was rejected because rank isn't an independent signal — it's a
direct re-encoding of time. Whoever answers fastest is definitionally
rank 1; there's no scenario where rank and time disagree. Scoring
both would just weight "being fast" twice under two different names.

(Guess-count, by contrast, *was* a genuinely independent signal from
time — two players could both answer in 10 seconds with very
different guess counts. It just couldn't be measured cleanly given
the shared chat/guess input.)

---

## Final Formula

Three independent, non-redundant factors, summed per clue:

```
time_score        = 500                                                  if elapsed <= 5
                   = max(0, 500 * (1 - (elapsed - 5) / (n - 5)))         otherwise

difficulty_bonus  = 100 (easy) | 200 (medium) | 300 (hard)
                    — always applied, independent of time taken

first_guess_bonus = 200 if this player was first to guess correctly this round, else 0
                    — flat, binary, no scaling

clue_score        = round(time_score + difficulty_bonus + first_guess_bonus)
```

Where:
- `elapsed` = seconds from round start to the correct guess
- `n` = host-configured round duration, **minimum 30 seconds**
  (keeps `n - 5 >= 25`, so the time decay never divides by zero/negative)

**Bounds:** `clue_score` is always in `[0, 1000]`. The ceiling (1000)
is only reachable by guessing a **hard** clue **correctly within 5
seconds** while being the **first** to do so.

### Why each factor earns its place

- **time_score** — rewards recognition speed, with a grace window so
  reaction time isn't punished as if it were knowledge.
- **difficulty_bonus** — corrects for the fact that a 5-emoji hard
  clue is mechanically harder to solve than a 2-emoji easy one; without
  it, the time formula alone would silently favor players who happen
  to draw easy clues. Applied regardless of elapsed time, since
  difficulty is a property of the clue, not of how fast anyone solved it.
- **first_guess_bonus** — a continuous time curve compresses the gap
  between "answered at 3s" and "answered at 4s" almost to nothing, so
  a discrete "you were literally first" bonus adds a competitive signal
  the curve alone smooths over. Not redundant with time_score for the
  same reason rank *was* redundant — being first is a discrete event,
  not just a relabeling of a continuous value multiple players could
  share.

---

## Game Score

Per-clue scores are summed with no normalization or averaging:

```
game_score = sum(clue_score for every clue shown in the game)
```

**Worked example:**

| Clue | Score |
|---|---|
| 1 | 700 |
| 2 | 500 |
| 3 | 600 |
| 4 | 800 |
| **Total** | **2600** |

---

## Worked Examples (single clue)

| Scenario | time_score | difficulty_bonus | first_guess_bonus | clue_score |
|---|---|---|---|---|
| 3s, hard, first (60s round) | 500 | 300 | 200 | **1000** (ceiling) |
| 10s, medium, not first (60s round) | ~454.5 | 200 | 0 | **655** |
| 59s, easy, not first (60s round) | ~9.1 | 100 | 0 | **109** |

*(Verified against `scoring.py` — run the file directly to reproduce.)*

---

## Known Limitations / Things to Watch After Playtesting

- The formula doesn't currently weight difficulty and time against
  each other beyond flat addition — a very fast easy-clue guess and a
  slow-ish hard-clue guess could land at similar totals. Worth
  sanity-checking once real difficulty-tagged content exists.
- `first_guess_bonus` only rewards one player per round (winner-takes-all
  on that dimension) — everyone else gets 0 from it regardless of how
  close they were. This is intentional (keeps it simple/binary) but is
  a real design tradeoff worth naming.
- As before, the 5s grace window and the specific bonus values (100/200/300,
  200) were chosen by reasoning on paper, not from real play data. Expect
  to revisit after actual playtesting with your friend group.

---

Designed and validated by vinayak251104
