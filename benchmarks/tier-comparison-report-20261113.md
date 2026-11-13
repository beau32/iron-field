# Model tier and fine-tuning comparison

Checkpoint terminology: "4B RTS-lookahead" is `qwen35-4b-rts-lookahead`; "4B OpenJEV baseline" is `qwen35-4b-openjev/checkpoint-6250`. The later map/combined-arms adapter was not used in this tournament.

13 November 2026

Five pairings, six games each, one seed per map with starting sides swapped. Each cell lists wins for the first model versus the second.

| Pairing | Iron Valley | River Front | Four Shores | Total |
|---|---:|---:|---:|---:|
| 2B RTS-lookahead vs 2B original | 2–0 | 2–0 | 1–1 | 5–1 |
| 2B RTS-lookahead vs 4B OpenJEV baseline | 0–2 | 0–2 | 1–1 | 1–5 |
| 4B RTS-lookahead vs 4B OpenJEV baseline | 0–2 | 2–0 | 1–1 | 3–3 |
| 4B RTS-lookahead vs 9B base | 0–2 | 1–1 | 1–1 | 2–4 |
| 9B RTS-trained vs 9B base | 2–0 | 0–2 | 1–1 | 3–3 |

## Interpretation

The trained 2B beat its original 2B baseline 5–1, but lost 1–5 to the original 4B. The trained 4B lost 2–4 to the base 9B. These observations are consistent with the proposed hypothesis in this small test, not proof that fine-tuning always improves a model or cannot overcome a size tier. Same-size controls were 3–3 for both the 4B and 9B pairings, with substantial map dependence.

The 2B and 4B OpenJEV baseline JEV adapters are general OpenJEV-trained baselines, not untouched foundation models. The base 9B is `qwen3.5:9b` (Q4_K_M); the adapted 9B is `qwen3.5:9b-rts-synthetic-full` (Q8_0). The 9B same-size test therefore changes quantization as well as adaptation. The 4B-versus-9B pairing also compares a JEV NLI classifier with constrained Ollama generation, including distinct candidate framing and precision. These tests cannot isolate parameter count or fine-tuning alone.

## Matched-input replay

To complement the games, three decisions were sampled from each of the six games (first, middle and last decision) and each pair was given identical saved inputs and candidates. The replay measures agreement only, not decision quality; some sampled states may repeat. The mixed JEV/Ollama pairing was not replayed because the model interfaces use different input formats.

| Pairing | Same operation | Trained-model original choice reproduced |
|---|---:|---:|
| 2B RTS-lookahead vs 2B original | 12 / 18 | 18 / 18 |
| 2B RTS-lookahead vs 4B OpenJEV baseline | 12 / 18 | 18 / 18 |
| 4B RTS-lookahead vs 4B OpenJEV baseline | 13 / 18 | 18 / 18 |
| 9B RTS-trained vs 9B base | 13 / 18 | 17 / 18 |

The trained 9B did not reproduce one of its recorded game choices on replay, even with temperature zero; exact output reproducibility is not guaranteed. The other trained models reproduced all sampled choices.

## Method and limits

All matches used the same game source revision (hashes in raw files), rules, candidate generator, lookahead and operation mapping; each side began with equal credits, units and structures, and solo AI aid was disabled. Model decisions were requested every 30 simulated seconds while the game was paused. All games ended before the 900-second limit. Choices were made on each side’s own evolving state; the match trajectories are not the same saved states. The separate replay supplies matched-input choice comparisons, not alternate-outcome rollouts.

There is only one nominal seed per map and side assignment. Earlier tests found that different nominal seeds can reproduce trajectories, so these 30 games are not a broad independent sample and do not establish population win rates. No real-time connector lag or deadline was tested. Tactical execution and lookahead are shared game rules; results describe the entire model-and-rules system. Mirrored structure-placement event labels can be reversed, so rely on physical snapshots. Model artifact hashes, model identities, game hashes, choices, snapshots and combat counters are recorded in the JSON files.

For the 9B same-size control, the base model used partial CPU offload (requested eight GPU layers) to keep both models resident; the game was paused during inference. Its context allocation differed from the trained model. This makes latency comparisons inappropriate and can affect numerical execution. The 9B replay reproduced 17/18 original choices. No performance conclusion follows from latency measured under GPU contention.

## Artifacts

- [2B RTS-lookahead vs 2B original raw match traces](../research/results/benchmarks/tier-comparison-20261113-2b-trained-vs-2b-original-full.json.gz)
- [2B RTS-lookahead vs 4B OpenJEV baseline raw match traces](../research/results/benchmarks/tier-comparison-20261113-2b-trained-vs-4b-original-full.json.gz)
- [4B RTS-lookahead vs 4B OpenJEV baseline raw match traces](../research/results/benchmarks/tier-comparison-20261113-4b-trained-vs-4b-original-full.json.gz)
- [4B RTS-lookahead vs 9B base raw match traces](../research/results/benchmarks/tier-comparison-20261113-4b-trained-vs-9b-base-full.json.gz)
- [9B RTS-trained vs 9B base raw match traces](../research/results/benchmarks/tier-comparison-20261113-9b-trained-vs-9b-base-full.json.gz)
- [Matched-input replay](../research/results/benchmarks/tier-comparison-20261113-matched-states.json.gz).
- Test runner: `tier-adaptation-duel.cjs`, `run-tier-comparison.py`; matched-state runner: `replay-tier-states.py`.
