"""
elbow_plot.py

Generates the elbow plot used to choose the guess-score steepness
parameter k, by plotting the point-drop between guess 1 and guess 2
across a range of k values (0.1 to 2.0).

See SCORING.md for the full write-up of why k=0.2 was chosen.
"""

import matplotlib.pyplot as plt
import numpy as np

k_values = np.round(np.arange(0.1, 2.01, 0.1), 1)

score_g1 = 500.0  # constant: guess 1 always scores 500 regardless of k
score_g2 = 500.0 / (1 + k_values * 1)  # guess 2 score at each k
drop = score_g1 - score_g2
drop_pct = (drop / score_g1) * 100

fig, ax1 = plt.subplots(figsize=(9, 6))

ax1.plot(
    k_values, drop, marker='o', color='#2E5EAA',
    linewidth=2, markersize=5,
    label='Points dropped (1st -> 2nd guess)'
)
ax1.set_xlabel('k (steepness parameter)', fontsize=12)
ax1.set_ylabel('Points dropped from guess 1 to guess 2', fontsize=12, color='#2E5EAA')
ax1.tick_params(axis='y', labelcolor='#2E5EAA')
ax1.grid(True, alpha=0.3)

# highlight the chosen k=0.2
chosen_k = 0.2
chosen_drop = 500 - 500 / (1 + chosen_k)
ax1.scatter(
    [chosen_k], [chosen_drop], color='#D9534F', s=110, zorder=5,
    label=f'k={chosen_k} (chosen) -> drop={chosen_drop:.0f} pts'
)
ax1.annotate(
    f'k={chosen_k}\ndrop={chosen_drop:.0f} pts ({chosen_drop/5:.0f}%)',
    xy=(chosen_k, chosen_drop), xytext=(chosen_k + 0.25, chosen_drop + 40),
    fontsize=10, color='#D9534F',
    arrowprops=dict(arrowstyle='->', color='#D9534F')
)

ax1.set_title(
    'Elbow plot: 1st->2nd guess point drop vs steepness (k)\n'
    'guess_score = 500 / (1 + k*(guesses-1))',
    fontsize=13
)
ax1.legend(loc='lower right', fontsize=10)

plt.tight_layout()
plt.savefig('elbow_k_dropoff.png', dpi=150)
print("Saved elbow_k_dropoff.png")

print(f"\n{'k':>5} {'drop (pts)':>12} {'drop (%)':>10}")
for kv, d, p in zip(k_values, drop, drop_pct):
    print(f"{kv:5.1f} {d:12.1f} {p:9.1f}%")
