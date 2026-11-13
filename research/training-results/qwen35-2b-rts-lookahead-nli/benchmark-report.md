# RTS 2B: held-out synthetic comparison

The original and RTS-trained 2B used the same 280 held-out cases and ordered choices. Scores measure agreement with a synthetic heuristic teacher, not game wins or proven optimal decisions. The held-out cases share scenario families with other synthetic training, and use map descriptions not verified as actual routes.

| Measure | Original OpenJEV 2B | RTS-lookahead 2B |
|---|---:|---:|
| Heuristic-label matches | 81 / 280 | 34 / 280 |
| Both decisions in a pair match | 3 / 140 | 0 / 140 |
| Median local request | 208 ms | 228 ms |

| Scenario family | Original 2B | RTS-lookahead 2B |
|---|---:|---:|
| bridge_breach | 0 / 40 | 0 / 40 |
| bridge_air_bypass | 0 / 40 | 0 / 40 |
| armor_combined_arms | 18 / 40 | 6 / 40 |
| waterway_control | 0 / 40 | 4 / 40 |
| air_threat_screen | 20 / 40 | 0 / 40 |
| base_approach | 23 / 40 | 4 / 40 |
| coast_vs_inland_economy | 20 / 40 | 20 / 40 |

The trained model selected `raid-economy` in 204 of the 280 cases, versus 167 for the original model. This is an observed choice concentration, not proof of why its teacher agreement fell. No case had all candidate scores tied. An input audit found 1,542 candidate texts, maximum 232 tokens, with none exceeding the service's 512-token limit.

## Real-engine games against a scripted opponent

Same game rules, starting setup, seed and map for both models. Lookahead was on and the game was paused while decisions were requested. Each entry is one match; this is not direct head-to-head play. Solo AI assistance is enabled for both, and live network timeouts are not tested.

| Map | Original 2B | RTS-lookahead 2B |
|---|---|---|
| classic | AI win at 202s | AI win at 234s |
| river | AI win at 218s | AI win at 281s |
| crossroads | AI win at 297s | AI win at 237s |

These results include only one scripted opponent and one seed per map; a single comparison does not establish a general win rate. The compact benchmark input differs from the live game JEV prompt, so live outcomes may differ. The original 2B adapter was not overwritten.

The original model's engine runs contained 119 candidate inputs (maximum 233 tokens); the trained model's contained 122 (maximum 231). None exceeded the service's 512-token limit and no decision had all candidate scores tied. This audit does not apply to the longer live game prompts.

## Interpretation

The completed 2B is not clearly better overall. Its 92.75% final training-distribution validation accuracy is encouraging for fitting those synthetic labels, but on this separate 280-case synthetic map set it agreed with the teacher less often than the original 2B. It was faster to victory on Four Shores and slower on the other two maps against the scripted opponent. Neither measure establishes a general model ranking; retain the original as a baseline and evaluate both against varied opponents and in live games before selecting a default.

Raw results: benchmark-original-2b.json, benchmark-rts-lookahead-2b.json, engine-comparison.json.
