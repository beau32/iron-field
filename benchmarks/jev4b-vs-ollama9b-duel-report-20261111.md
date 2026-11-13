# Direct RTS duel: JEV 4B versus Ollama 9B

The JEV 4B in this report is **4B RTS-lookahead** (`qwen35-4b-rts-lookahead`), not the general OpenJEV baseline or the later map/combined-arms adapter.

## Result

The RTS lookahead-trained JEV 4B won all six completed matches; the RTS fine-tuned Ollama 9B won none. Both models won their earlier separate matches against a scripted opponent, so this direct result provides different evidence: in this particular controlled matchup the 4B was stronger. Six matches on three maps are not enough to establish a general win rate or prove one model is universally better.

| Map | JEV 4B starting side | Winner | Simulated match time |
|---|---|---|---:|
| Iron Valley | Player | JEV 4B | 342 s |
| Iron Valley | Enemy | JEV 4B | 774 s |
| River Front | Player | JEV 4B | 342 s |
| River Front | Enemy | JEV 4B | 385 s |
| Four Shores | Player | JEV 4B | 390 s |
| Four Shores | Enemy | JEV 4B | 321 s |

## What happened

Across all six games, the JEV side fired 2,902 shots and dealt about 83,611 damage; the Ollama side fired 1,329 shots and dealt about 38,613 damage. The JEV side produced 272 units and the Ollama side 278. In these runs, JEV's surviving HQ had its full 1,200 health in every match. These totals describe the armies' outcomes, not model accuracy or a causal attribution to a specific choice.

Over 88 decisions per model, JEV chose production raids 16 times and air or air-economy operations 18 times combined; 9B chose economy raids 24 times and defend 21 times. These counts show what was selected in different evolving game states; they do not prove why an individual side won. Each side's offered choices depended on its own situation.

Median local request time was 467 ms for JEV and 332 ms for Ollama. These are not directly comparable model-speed measurements: the APIs, formats, model sizes and execution backends differ, and the simulation was paused while each request ran.

## Method and limits

- Models: JEV `qwen35-4b-rts-lookahead` on port 8011, and Ollama `qwen3.5:9b-rts-synthetic-full` Q8. JEV health confirmed the 4B adapter; the run records the Ollama digest.
- Actual game engine, one AI controller for each side, equal initial credits, forces and structures. The normal solo AI credit subsidy was disabled for both.
- Both commanders used the same tactical rules. Every 30 simulated seconds each received a decision from its own perspective using the shared compact benchmark facts, its legal operation list and the same approximate lookahead; both used the same operation-to-game-plan mapping.
- Each map was played twice with the model sides swapped. Both models chose from their own state's available operations; the choices need not be identical across different positions. JEV classified candidate statements while 9B generated a constrained choice. The compact benchmark prompt is not either model's complete live-game prompt, and this comparison does not exercise the 9B's extra free-form tactical choices.
- The engine paused for sequential model requests, so network/connector latency and the live game's timeout or fallback behavior were not tested. It is not a head-to-head latency comparison.
- The second-seed repeat of the first Iron Valley game produced the same decisions and state trajectory; it was stopped and is not counted as an independent result. The map-side pairings and games can share deterministic openings; the six wins are not six independent estimates of a broader win probability.
- The local-only benchmark mirrors one commander by temporarily reversing team perspective. A sanity test checks equal starts, production and firing for both sides, side-specific resources and no subsidy. The mirrored turn can reverse team labels in structure-placement log events; the results use physical-team snapshots and combat counts. The underlying live game server was not modified for this benchmark.

Raw per-window decisions, candidate facts, snapshots, combat intensity and match logs are in `jev4b-vs-ollama9b-duel-balanced-order-20261111.json` and `jev4b-vs-ollama9b-duel-crossroads-20261111.json`. Run the harness checks with `node tests/duel-benchmark.test.cjs`; rerun with `node benchmarks/duel-benchmark.cjs --maps classic,river,crossroads --seconds 900 --output <new-file.json>` while both services are running. The runner refuses to overwrite an existing result.
