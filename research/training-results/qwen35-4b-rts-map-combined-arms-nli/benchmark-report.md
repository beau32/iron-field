# Map and combined-arms JEV 4B: benchmark report

## Conclusion

The new adapter learned some of the added synthetic map-and-combat patterns, but the evidence does not yet support replacing the previous lookahead-trained 4B. It matched 108 of 280 held-out heuristic labels, versus 83 for the previous 4B and 140 for the 9B. On the updated game engine, all three won every match; the new model was faster on River Front, while the previous 4B was faster on Iron Valley and Four Shores. The 9B was faster than both 4B models on Iron Valley.

Bridge decisions remain a particular weakness: the new model matched only 2 of 40 bridge-breach labels and none of 40 bridge-air-bypass labels. Those labels are synthetic preferences rather than verified optimal moves. The engine tests provide useful regression evidence but do not show whether the new map observations improve real gameplay: the compact engine-benchmark prompt and the current live game do not yet supply those observation sentences.

Recommendation: keep the previous 4B as the live default for now. To assess the new model properly, derive map observations from the visible game state, align the live JEV prompt with the training format, and run broader tests against varied opponents and openings. Do not assume the live game will reproduce the benchmark results before that integration work.

## Training

The model continued from the finished lookahead-trained 4B adapter, using a fresh optimizer and a full additional epoch over 11,700 examples, including 2,800 new NLI examples from 1,400 synthetic map/combined-arms decisions. The earlier examples were retained to reduce forgetting. Training completed 732 steps, using a peak 6.3 GB of CUDA allocation. On the 2,340-example mixed synthetic validation set, three-class accuracy was 85.5% before this pass and 91.4% afterward. These are validation metrics, not win rates; the validation set shares generated scenario families with training.

## Held-out map and combined-arms cases

All three models saw the same 280 held-out case descriptions and ordered legal choices. The 4B classifiers received one operation-name hypothesis per offered choice; the 9B generated a constrained choice and received operation descriptions. JEV used NF4 4-bit with BF16 compute; 9B used Q8. Inputs, providers, architectures and decoding methods differ, so latency is local-request timing, not an inherent model-speed comparison. The test uses different seeds and wording, but shares scenario families and heuristic labels with training. Map observations are synthetic, not verified actual routes.

| Measure | Retrained 4B | Previous 4B | Fine-tuned 9B |
|---|---:|---:|---:|
| Heuristic-label matches | 108 / 280 | 83 / 280 | 140 / 280 |
| Both choices correct in paired situations | 13 / 140 | 0 / 140 | 22 / 140 |
| Median local request | 446 ms | 444 ms | 274 ms |

| Scenario family | Retrained 4B | Previous 4B | 9B |
|---|---:|---:|---:|
| Bridge breach | 2 / 40 | 4 / 40 | 0 / 40 |
| Bridge air bypass | 0 / 40 | 0 / 40 | 20 / 40 |
| Armor and mixed forces | 14 / 40 | 17 / 40 | 32 / 40 |
| Waterway control | 20 / 40 | 16 / 40 | 20 / 40 |
| Air-threat screen | 19 / 40 | 20 / 40 | 20 / 40 |
| Base approach | 29 / 40 | 14 / 40 | 28 / 40 |
| Coast versus inland economy | 24 / 40 | 12 / 40 | 20 / 40 |

The results are agreement with a hand-authored teacher, not objective correctness. The test does not include connector or network latency. One 9B request exceeded five seconds during model warmup; no 4B scenario requests did.

## Updated full-engine game comparison

All models played separately against the same scripted opponent, using the same game/commander source hashes, maps, seeds, compact facts, legal operation rules and lookahead settings. These are not direct AI-versus-AI matches. The asymmetric solo setup includes the game's computer assistance. Decisions are requested every 30 simulated seconds while the simulation is paused; network delay and live five-second fallback are not simulated. Each map has two seeds, but most repeated an identical decision sequence; the runs should not be treated as independent trials. Times are average simulated seconds to victory, rounded.

| Map | Retrained 4B | Previous 4B | Fine-tuned 9B |
|---|---:|---:|---:|
| River Front | 2 wins; 246 s | 2 wins; 267 s | 2 wins; 357 s |
| Iron Valley | 2 wins; 476 s | 2 wins; 395 s | 2 wins; 350 s |
| Four Shores | 2 wins; 259 s | 2 wins; 252 s | 2 wins; 380 s |

Across both teams, shots per simulated minute were 71.8 for the retrained 4B, 104.1 for the previous 4B and 96.6 for the 9B. This measures total battle activity, not the commander's accuracy or its units alone. The new and previous JEV game inputs were audited: none of the 516 candidate inputs were truncated, and none of the 132 decisions had fully tied scores. This audit applies to the controlled benchmark format, not the live game prompt.

## Artifacts and reproducibility

- New adapter: `C:/Users/Public/openjev/outputs/qwen35-4b-rts-map-combined-arms-nli/adapter-final`.
- Training: `train_rts_map_combined_arms.py`, `data-provenance.json`, and `training_result.json` in this experiment folder.
- Held-out results: `benchmark-new4b.json`, `benchmark-prior4b.json`, and `benchmark-9b.json` in this folder; full cases and dataset manifest are under `outputs/rts-map-combined-arms-dataset`.
- Full-engine traces and audits: `benchmarks/map-training-new4b-engine.json`, `map-training-prior4b-engine.json`, `map-training-9b-engine.json`, `map-training-new4b-audit.json`, and `map-training-prior4b-audit.json` in the Iron Field checkout.

The previous JEV service was restored with `qwen35-4b-rts-lookahead` active. The new model was not deployed or selected in the game.
