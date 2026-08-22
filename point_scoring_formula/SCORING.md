# Guess the MSG — Point System Design Notes

## Goal

Design a scoring system for the emoji-guessing round that rewards two things at once:

1. How fast a player guesses correctly (reaction/recognition speed)
2. How few guesses it took them to get there (accuracy, not spam)

Max possible score per round: **1000 points**. Both factors are scored independently on a 0–500 scale, then summed.

---

## Factor 1: Time Score (linear, fully determined)

Design decision: give a flat grace window so reaction time isn't punished, then decay linearly to zero by the time the round ends.

- 500 points if the correct guess lands within the first 5 seconds
- Decays linearly from 500 down to 0 between 5 seconds and `n` seconds (`n` = the host-configured round duration)

```
time_score = 500                                             if elapsed <= 5
time_score = max(0, 500 * (1 - (elapsed - 5) / (n - 5)))      otherwise
```

Because both anchor points (500 at 5s, 0 at `n`) were fixed from the start, this half of the formula had no tunable parameters — it's just the line connecting those two points.

**Edge case found:** if `n <= 5`, the formula divides by `(n - 5)`, which is zero or negative. Resolved by setting a hard minimum round duration of **30 seconds** at the room-settings level, so `(n - 5)` is always ≥ 25 and the division is always safe.

---

## Factor 2: Guess Score (non-linear, required tuning)

Design decision: unlike time, guesses had to decay in a way that:

- Rewards guessing correctly on the first try (max 500 points)
- Punishes spamming random guesses, but
- Never actually hits zero — even a player who guesses 50 times should walk away with *something*, so bad luck doesn't feel like a total loss.

### Candidate curves considered

- **Exponential decay** — rejected. Drops to near-zero within about 8–10 guesses, which contradicts the "always get something" goal.
- **Power decay** (`500 / guesses^p`, p < 1) — considered but not chosen; behaves similarly to the harmonic option but adds an extra parameter to tune for no real benefit here.
- **Harmonic / inverse decay** (`500 / guesses`) — chosen as the starting shape: asymptotic, never reaches zero, simple to reason about.

### Problem with the raw harmonic curve (k = 1 equivalent)

```
Guess 1 -> 500
Guess 2 -> 250   (a 50% drop from a single wrong guess)
```

This felt too harsh — a single mistyped or near-miss guess shouldn't cost half the guess-score budget.

### Fix: generalized steepness parameter, `k`

```
guess_score = 500 / (1 + k * (guesses - 1))
```

- `k = 1` reproduces the harsh raw harmonic curve
- Lower `k` = gentler early drop-off, longer stabilized tail
- Higher `k` = harsher early drop-off

---

## Elbow Plot: Choosing k

To pick `k` objectively, plotted the point drop between guess 1 and guess 2 (the sharpest part of the curve) across a range of `k` values from 0.1 to 2.0, in steps of 0.1.

Formula for the 1st-to-2nd-guess drop at a given `k`:

```
drop = 500 - 500 / (1 + k) = 500 * k / (1 + k)
```

Key values from that plot:

| k | Drop (pts) | Drop (%) |
|---|---|---|
| 0.1 | 45.5 | 9.1% |
| 0.2 | 83.3 | 16.7% |
| 0.3 | 115.4 | 23.1% |
| 0.4 | 142.9 | 28.6% |
| 0.5 | 166.7 | 33.3% |
| 1.0 | 250.0 | 50.0% |

**Note:** this curve does not have a sharp, obvious "elbow" in the classic scree-plot sense — it's a smooth concave curve that keeps climbing toward 500 as `k` grows, with the rate of increase gradually slowing rather than bending sharply at one point. The closest thing to an elbow is around `k = 0.5–0.6`, where marginal drop-per-`k` starts flattening out noticeably.

### Narrowing down k

Initial pick was `k = 0.4` (a reasonable middle ground, 28.6% first-guess penalty). Considered going much lower (`k = 0.1`) to soften the curve further, but rejected it after comparing full distributions:

| Guesses | k=0.1 | k=0.4 |
|---|---|---|
| 1 | 500 | 500 |
| 2 | 454.5 | 357.1 |
| 5 | 357.1 | 192.3 |
| 10 | 263.2 | 108.7 |
| 20 | 172.4 | 58.1 |
| 50 | 84.7 | 24.3 |

At `k = 0.1`, even 50 guesses still nets 84.7 points — the guess factor stops meaningfully separating careful players from spam-guessers, which defeats the purpose of having it as a separate scoring dimension at all.

Settled on **`k = 0.2`** as the final value — gentler than 0.4 on the first-guess penalty (16.7% instead of 28.6%), while still keeping a real, felt difference at higher guess counts (e.g. 20 guesses nets 104 points at k=0.2, vs 172 at k=0.1 and 58 at k=0.4 — a genuine middle ground rather than a flattened curve).

---

## Final Formula

```
time_score  = 500                                                  if elapsed <= 5
            = max(0, 500 * (1 - (elapsed - 5) / (n - 5)))          otherwise

guess_score = 500 / (1 + 0.2 * (guesses - 1))

total_score = round(time_score + guess_score)
```

Where:

- `elapsed` = seconds from round start to the correct guess
- `n` = host-configured round duration, **minimum 30 seconds**
- `guesses` = total guesses submitted up to and including the correct one

**Bounds:** `total_score` is always between 0 and 1000. The theoretical maximum (1000) is only reachable by guessing correctly within 5 seconds, on the first attempt.

---

## Worked Examples

| Scenario | Time score | Guess score | Total |
|---|---|---|---|
| Correct in 3s, 1st guess (60s round) | 500 | 500 | **1000** |
| Correct in 30s, 1st guess (60s round) | ~273 | 500 | **773** |
| Correct in 10s, 4th guess (60s round) | 500 | 312.5 | **813** |
| Correct in 45s, 8th guess (60s round) | ~136 | 208.3 | **344** |

---

## Known Limitations / Things to Watch After Playtesting

- Time and guesses aren't fully independent in practice even though the formula adds them separately: a player who knows the answer instantly tends to score well on both halves at once, while an unsure player loses on both. The real-world point spread between a strong and weak player will likely feel more polarized than the formula alone suggests.
- The formula doesn't currently account for clue difficulty (e.g. a 5-emoji "hard" clue scores identically to a 2-emoji "easy" one for the same time/guesses). A difficulty multiplier is a plausible v2 addition once there's a difficulty field being used meaningfully.
- `k = 0.2` (and the 5s/500-point anchors for time) are values chosen by reasoning through curves on paper, not from actual play data. Expect to revisit both after a real playtesting session.

---

Designed and validated by vinayak251104
