# Full-engine unattended benchmark

After this run, the estimator was corrected to allow an already-started refinery to finish if the next operation changes. The tested and final planners produced identical prompts in both settings for all 18 recorded decision states (36 prompt comparisons). The JSON hash identifies the planner actually run; the matches were not rerun after this edge-case fix.

Model: qwen3.5:9b-rts-synthetic-full. 1 seed(s), classic; cap 600 simulated seconds per match. Each side uses the actual game simulation.

- The opposing player is a scripted bot, not a second model or a human.
- Uses the asymmetric solo starting setup and existing computer assistance; both lookahead settings use identical seeds and map.
- Runs execute sequentially; model nondeterminism and simulated-state divergence can affect comparisons.
- Model decisions are requested every fixed simulation window directly from local Ollama; connector/network delay and real-time deadline behavior are not simulated.
- Match duration is capped; unfinished matches are timeouts, not wins or draws.

| Measure | Lookahead off | Lookahead on |
|---|---:|---:|
| Commander wins | 1 | 1 |
| Scripted opponent wins | 0 | 0 |
| Draws | 0 | 0 |
| Timed out | 0 | 0 |
| Mean commander HQ HP | 1200 | 1200 |
| Shots fired per simulated minute | 73 | 79.9 |
| Damage dealt per simulated minute | 2886.3 | 2962.5 |
| Units destroyed per simulated minute | 12.29 | 12.07 |
| Units produced per simulated minute | 14.51 | 14.48 |

## Paired matches

| Map | Seed | Lookahead off | Lookahead on |
|---|---:|---|---|
| classic | 1 | commander win at 244s | commander win at 249s |

## Intensity over time

Rates are summed over both teams and normalized by the simulated time actually observed in each window.

| Simulated seconds | Runs off / on | Shots per minute off / on | Damage per minute off / on | Units destroyed per minute off / on |
|---|---:|---:|---:|---:|
| 0–30 | 1 / 1 | 0 / 0 | 0 / 0 | 0 / 0 |
| 30–60 | 1 / 1 | 74 / 0 | 967.2 / 0 | 4 / 0 |
| 60–90 | 1 / 1 | 128 / 104 | 2683.1 / 2132 | 20 / 10 |
| 90–120 | 1 / 1 | 70 / 82 | 2915.5 / 2226.4 | 4 / 10 |
| 120–150 | 1 / 1 | 104 / 128 | 3402.3 / 4599.9 | 24 / 30 |
| 150–180 | 1 / 1 | 38 / 70 | 2336 / 2679.2 | 14 / 14 |
| 180–210 | 1 / 1 | 48 / 80 | 2480 / 2899.8 | 14 / 14 |
| 210–240 | 1 / 1 | 118 / 156 | 7657 / 7508.8 | 16 / 22 |
| 240–270 | 1 / 1 | 103.7 / 147.4 | 7697.5 / 8766 | 29.6 / 0 |

Intensity is not an arbitrary score or a measure of match quality. Per-window team breakdowns, decisions and game-state snapshots are in lookahead-revised-classic.json.
