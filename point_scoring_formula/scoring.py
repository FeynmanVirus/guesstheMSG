"""
scoring.py

Point system for "Guess the MSG" rounds.
See SCORING.md for the full design rationale.

total_score = time_score + guess_score, each capped at 500,
so total_score is always in the range [0, 1000].
"""

MIN_ROUND_DURATION = 30  # seconds, enforced at the room-settings level
TIME_GRACE_WINDOW = 5    # seconds of free max score before decay starts
MAX_TIME_SCORE = 500
MAX_GUESS_SCORE = 500
GUESS_STEEPNESS_K = 0.2  # chosen via elbow-plot analysis, see SCORING.md


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


def get_guess_score(guesses: int) -> float:
    """
    Non-linear guess score: harmonic-style decay with tunable steepness k.
    Rewards fewer guesses, never hits zero (asymptotic).

    :param guesses: total guesses submitted up to and including the correct one (>= 1)
    :return: guess score, in (0, 500]
    """
    if guesses < 1:
        raise ValueError("guesses must be >= 1")

    return MAX_GUESS_SCORE / (1 + GUESS_STEEPNESS_K * (guesses - 1))


def calculate_score(elapsed_seconds: float, round_duration: float, guesses: int) -> dict:
    """
    Full round score for a correct guess.

    :param elapsed_seconds: seconds from round start to correct guess
    :param round_duration: host-configured round duration in seconds
    :param guesses: total guesses submitted up to and including the correct one
    :return: dict with time_score, guess_score, and total_score
    """
    time_score = get_time_score(elapsed_seconds, round_duration)
    guess_score = get_guess_score(guesses)
    total_score = round(time_score + guess_score)

    return {
        "time_score": time_score,
        "guess_score": guess_score,
        "total_score": total_score,
    }


if __name__ == "__main__":
    # Worked examples from SCORING.md, as a quick sanity check
    examples = [
        {"elapsed_seconds": 3, "round_duration": 60, "guesses": 1},
        {"elapsed_seconds": 30, "round_duration": 60, "guesses": 1},
        {"elapsed_seconds": 10, "round_duration": 60, "guesses": 4},
        {"elapsed_seconds": 45, "round_duration": 60, "guesses": 8},
    ]

    for ex in examples:
        result = calculate_score(**ex)
        print(f"{ex} -> {result}")
