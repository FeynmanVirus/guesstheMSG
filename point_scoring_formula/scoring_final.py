"""
scoring.py

Point system for "Guess the MSG" — FINAL VERSION.

Replaces the earlier time+guess-count formula (see SCORING.md history
section for why guess-count and rank were both dropped).

Per-clue score = time_score + difficulty_bonus + first_guess_bonus
Capped range: [0, 1000] per clue.

Game score = sum of clue_score across every clue shown in the game
(no normalization/averaging — a straight cumulative total).
"""

MIN_ROUND_DURATION = 30  # seconds, enforced at the room-settings level
TIME_GRACE_WINDOW = 5    # seconds of free max time_score before decay starts
MAX_TIME_SCORE = 500

DIFFICULTY_BONUS = {
    "easy": 100,
    "medium": 200,
    "hard": 300,
}

FIRST_GUESS_BONUS = 200


def get_time_score(elapsed_seconds: float, round_duration: float) -> float:
    """
    Linear time score: full points within the grace window,
    decaying linearly to 0 by the end of the round.

    :param elapsed_seconds: seconds from round start to correct guess
    :param round_duration: host-configured round duration (n), must be >= 30
    :return: time score, clamped to [0, 500]
    """
    if round_duration < MIN_ROUND_DURATION:
        raise ValueError(
            f"round_duration must be >= {MIN_ROUND_DURATION}s to avoid "
            "divide-by-zero/negative decay"
        )

    if elapsed_seconds <= TIME_GRACE_WINDOW:
        return float(MAX_TIME_SCORE)

    decay_window = round_duration - TIME_GRACE_WINDOW  # always >= 25
    raw = MAX_TIME_SCORE * (1 - (elapsed_seconds - TIME_GRACE_WINDOW) / decay_window)

    return max(0.0, raw)


def get_difficulty_bonus(difficulty: str) -> int:
    """
    Flat bonus based on clue difficulty. Always applied, regardless of
    how long the player took to guess.

    :param difficulty: one of "easy", "medium", "hard"
    :return: 100 / 200 / 300
    """
    key = difficulty.lower().strip()
    if key not in DIFFICULTY_BONUS:
        raise ValueError(f"difficulty must be one of {list(DIFFICULTY_BONUS)}, got {difficulty!r}")
    return DIFFICULTY_BONUS[key]


def get_first_guess_bonus(is_first_correct: bool) -> int:
    """
    Flat, binary bonus for being the first player to guess correctly
    this round. No scaling/decay.

    :param is_first_correct: True if this player was first to guess correctly
    :return: 200 or 0
    """
    return FIRST_GUESS_BONUS if is_first_correct else 0


def calculate_clue_score(
    elapsed_seconds: float,
    round_duration: float,
    difficulty: str,
    is_first_correct: bool,
) -> dict:
    """
    Full score for a single clue/round.

    :return: dict with time_score, difficulty_bonus, first_guess_bonus, clue_score
    """
    time_score = get_time_score(elapsed_seconds, round_duration)
    difficulty_bonus = get_difficulty_bonus(difficulty)
    first_guess_bonus = get_first_guess_bonus(is_first_correct)

    clue_score = round(time_score + difficulty_bonus + first_guess_bonus)

    return {
        "time_score": time_score,
        "difficulty_bonus": difficulty_bonus,
        "first_guess_bonus": first_guess_bonus,
        "clue_score": clue_score,
    }


def calculate_game_score(clue_scores: list) -> int:
    """
    Cumulative sum across every clue shown in the game.

    :param clue_scores: list of clue_score ints (or dicts from
        calculate_clue_score, in which case "clue_score" is pulled out)
    :return: total game score
    """
    total = 0
    for entry in clue_scores:
        total += entry["clue_score"] if isinstance(entry, dict) else entry
    return total


if __name__ == "__main__":
    # Ceiling case: instant, hardest clue, first to guess -> 1000
    ceiling = calculate_clue_score(
        elapsed_seconds=3, round_duration=60, difficulty="hard", is_first_correct=True
    )
    print("Ceiling case (3s, hard, first):", ceiling)

    # Worked example from the conversation: cumulative sum across 4 clues
    clue_scores = [700, 500, 600, 800]
    print("Example per-clue scores:", clue_scores)
    print("Final game score:", calculate_game_score(clue_scores))
