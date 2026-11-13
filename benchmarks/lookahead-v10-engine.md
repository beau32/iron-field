# Full-engine unattended benchmark

After this run, an economic-recovery edge case was corrected so the estimator does not assume mining income without a refinery or ore. The tested and final planners produced identical prompts in both settings for all 54 recorded decision states (108 prompt comparisons). The JSON source hash identifies the planner actually run; the full matches were not rerun after the edge-case fix.

Model: qwen3.5:9b-rts-synthetic-full. 2 seed(s), river; cap 600 simulated seconds per match. Each side uses the actual game simulation.

- The opposing player is a scripted bot, not a second model or a human.
- Uses the asymmetric solo starting setup and existing computer assistance; both lookahead settings use identical seeds and map.
- Runs execute sequentially; model nondeterminism and simulated-state divergence can affect comparisons.
- Model decisions are requested every fixed simulation window directly from local Ollama; connector/network delay and real-time deadline behavior are not simulated.
- Match duration is capped; unfinished matches are timeouts, not wins or draws.

| Measure | Lookahead off | Lookahead on |
|---|---:|---:|
| Commander wins | 2 | 2 |
| Scripted opponent wins | 0 | 0 |
| Draws | 0 | 0 |
| Timed out | 0 | 0 |
| Mean commander HQ HP | 1200 | 1200 |
| Shots fired per simulated minute | 78.5 | 79.2 |
| Damage dealt per simulated minute | 2387.8 | 2565 |
| Units destroyed per simulated minute | 11.04 | 12.17 |
| Units produced per simulated minute | 12.5 | 13.63 |

## Paired matches

| Map | Seed | Lookahead off | Lookahead on |
|---|---:|---|---|
| river | 1 | commander win at 417s | commander win at 370s |
| river | 2 | commander win at 404s | commander win at 370s |

## Intensity over time

Rates are summed over both teams and normalized by the simulated time actually observed in each window.

| Simulated seconds | Runs off / on | Shots per minute off / on | Damage per minute off / on | Units destroyed per minute off / on |
|---|---:|---:|---:|---:|
| 0–30 | 2 / 2 | 0 / 0 | 0 / 0 | 0 / 0 |
| 30–60 | 2 / 2 | 62 / 0 | 774 / 0 | 4 / 0 |
| 60–90 | 2 / 2 | 18 / 68 | 261.6 / 1258.4 | 4 / 6 |
| 90–120 | 2 / 2 | 100 / 28 | 2004 / 708 | 12 / 6 |
| 120–150 | 2 / 2 | 218 / 252 | 6382.3 / 7266.9 | 42 / 46 |
| 150–180 | 2 / 2 | 57 / 90 | 2864 / 2664.8 | 17 / 14 |
| 180–210 | 2 / 2 | 65 / 54 | 3669.6 / 1660 | 16 / 10 |
| 210–240 | 2 / 2 | 29 / 68 | 1458.1 / 1568 | 9 / 8 |
| 240–270 | 2 / 2 | 106 / 132 | 2498.2 / 2664 | 12 / 12 |
| 270–300 | 2 / 2 | 96 / 132 | 2138.4 / 3512 | 11 / 20 |
| 300–330 | 2 / 2 | 82 / 92 | 1914.3 / 4743 | 10 / 20 |
| 330–360 | 2 / 2 | 81 / 44 | 2862.6 / 4051.2 | 11 / 8 |
| 360–390 | 2 / 2 | 22 / 49.1 | 1277.7 / 4664.6 | 1 / 0 |
| 390–420 | 2 / 0 | 204.2 / 0 | 6733.3 / 0 | 3 / 0 |

Intensity is not an arbitrary score or a measure of match quality. Per-window team breakdowns, decisions and game-state snapshots are in lookahead-v10-engine.json.
