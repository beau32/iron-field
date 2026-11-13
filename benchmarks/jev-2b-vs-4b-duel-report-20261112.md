# RTS-lookahead 2B vs 4B: automated head-to-head

The 4B in this report is **4B RTS-lookahead** (`qwen35-4b-rts-lookahead`), not the general OpenJEV baseline or the later map/combined-arms adapter.

Date: 12 November 2026

## Result

The trained 2B and 4B models each won three of six full-engine games. Both won once on Iron Valley, 4B won both River Front games, and 2B won both Four Shores games. These results show that the 2B was competitive in this particular head-to-head; they do not establish that the models are equally strong overall. There was only one seed per map and two side assignments, so these games are not a broad or statistically reliable estimate of performance.

| Map | 2B starting side | Winner | Game time |
| --- | --- | --- | --- |
| Iron Valley | Player | 2B | 7:07 |
| Iron Valley | Enemy | 4B | 7:25 |
| River Front | Player | 4B | 5:54 |
| River Front | Enemy | 4B | 12:38 |
| Four Shores | Player | 2B | 8:51 |
| Four Shores | Enemy | 2B | 6:22 |

Across these games, the 2B side produced 326 units and fired 2,619 shots; the 4B side produced 291 and fired 2,176. These counts combine games of different lengths and opposing situations. More shots or units do not necessarily mean better tactics, damage efficiency, or a stronger model. The 2B chose rush 21 times and raid-economy 22 times, compared with 1 and 7 for 4B; 4B chose naval five times and 2B did not. Available choices depend on the evolving state, so these counts alone do not prove a fixed preference or explain the outcomes.

## Method

The matchup used `qwen35-2b-rts-lookahead` and `qwen35-4b-rts-lookahead`, both served as JEV classifiers. Both used the same full game engine, candidate-generation and commander rules, compact classifier input format, and approximate two-step lookahead. The side assignment was reversed on each map. Both sides began with 600 credits and identical unit and building counts, and neither received solo AI subsidies. Decisions were requested every 30 simulated seconds; the simulation paused during model inference. Each game could run for up to 900 simulated seconds; all six ended in a win.

The candidates come from the same generation process, although the actual available operations can differ as each side's game state changes. The classifier prompt uses a compact synthetic-heuristic recommendation format matching training, which is not necessarily identical to the live game's normal JEV prompt. Game rules handle the execution of the selected operation, including unit behavior and combat; the results measure the models together with that shared rule-based system and lookahead, not model reasoning in isolation. Different model sizes, base models, and training histories also prevent attributing the outcome to parameter count alone. Running both services on the same machine and pausing the simulation makes this a gameplay comparison, not a clean model-latency benchmark.

The trace contains 99 decisions per model. An audit using each model's tokenizer found a maximum of 248 input tokens for 2B and 253 for 4B; none of the candidate inputs exceeded the service's 512-token limit, and no decision had all candidate scores tied. Starting credits, unit counts and building counts, and the model identity on every recorded decision were checked. The existing equal-start and dual-commander harness test passed before the run.

The source hashes, model identities, decision inputs and scores, intensity counters, snapshots, and match logs are available in [the raw benchmark record](../research/results/benchmarks/jev-2b-vs-4b-duel-20261112.json.gz). Structure-placement event attribution in the mirrored harness may be inverted; use the physical snapshots when inspecting structures. Further assessment should use multiple seeds and openings, additional maps and opponents, and paired tests with and without lookahead.
