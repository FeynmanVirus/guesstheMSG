"""
guess_score_table.py

Prints the guess_score distribution (guesses 1 through N) for one or
more k values, side by side. Used to compare k=0.1 / 0.2 / 0.3 / 0.4
while tuning the guess-score steepness parameter.

Usage:
    python guess_score_table.py
"""


def guess_score(guesses: int, k: float) -> float:
    return 500 / (1 + k * (guesses - 1))


def print_table(k_values, max_guesses=50):
    header = f"{'Guesses':>8}" + "".join(f"{'k=' + str(k):>10}" for k in k_values)
    print(header)
    print("-" * len(header))
    for g in range(1, max_guesses + 1):
        row = f"{g:8d}" + "".join(f"{guess_score(g, k):10.2f}" for k in k_values)
        print(row)


if __name__ == "__main__":
    # Comparison used when narrowing down from k=0.4 -> k=0.1 -> settling on k=0.2
    print_table(k_values=[0.1, 0.2, 0.3, 0.4], max_guesses=50)
