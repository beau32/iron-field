# Lookahead-trained JEV 4B: training and comparison

Checkpoint terminology: "new 4B" means **4B RTS-lookahead**. "Original 4B" in the 70-state replay means the earlier **4B RTS-recommendation** adapter (weight hash prefix `d3450ae3800b`), not the general OpenJEV baseline.

## Conclusion

The lookahead-trained 4B is the most promising model tested so far. It won every benchmark game, improved substantially over the original 4B on both shared maps, and was competitive with the 9B while responding faster in the local replay.

On 70 recorded states, the new model selected the top lookahead-ranked operation less often than the original 4B. It appears more willing to weigh the available choices and risk notes. The paired synthetic tests show that it learned the intended pattern, but they do not establish that its decisions are strategically optimal.

These results are preliminary. Both models faced one scripted opponent, several seeded games played out almost identically, and the models did not play directly against each other. The new 4B is the leading candidate for further testing, rather than conclusively better than the 9B.

The next step is to fix the live game's JEV prompt format and test the new model in actual games. That will show whether its benchmark improvement carries over to human play and more varied battles.

## Training

The new adapter continues training from the original RTS JEV 4B adapter, without overwriting it. One full epoch used 8,900 synthetic recommendation-NLI examples, including 1,600 lookahead scenarios built from 800 paired counterfactual states. Each pair has the same state and candidate operations; the second adds a generated risk on the teacher's original choice. The synthetic teacher retains emergency priorities and otherwise selects a different ranked option. These risk annotations and labels are hypothetical heuristic supervision, not evidence of optimal play.

The held-out validation set contains 1,780 examples generated with separate seeds but the same scenario families. Validation accuracy rose from 80.84% before the new training to 95.39% after it; these are classifier label metrics, not match win rates. In the separate 320-case binary risk evaluation, the new model matched the synthetic teacher in 298 cases. Across 160 risk/no-risk pairs, both choices matched the teacher in 138 pairs; it switched choice in 69 of the 90 cases where the teacher expected a change and in one of the 70 where it did not. The held-out cases are from the validation set used for training monitoring, not an independently curated human dataset.

## Full-engine comparison with lookahead

Each commander played the same scripted opponent on matching map/seed settings and asymmetric solo setup, including existing computer assistance. These are separate games, not direct model-versus-model self-play. Both received identical compact facts, legal ordered operations and lookahead rankings/risk notes for each state, with flank variants disabled. Their game states naturally diverge after different actions. The 4B classified training-format hypotheses using an NF4 4-bit base and BF16 compute; the Q8 9B chose through a constrained text prompt containing operation descriptions. The 9B River Front and Iron Valley results are the recorded earlier runs; the game and commander hashes match this run. Four Shores was run after training. Simulations pause while models decide; network delay and the live five-second fallback are not reproduced.

| Map | Seeds | New 4B wins; average time | Original 4B wins; average time | 9B wins; average time | New 4B / 9B shots per minute |
|---|---:|---:|---:|---:|---:|
| River Front | 4 | 4/4; 316 s | 4/4; 410 s | 4/4; 420 s | 96.3 / 71.7 |
| Iron Valley | 2 | 2/2; 254 s | 2/2; 366 s | 2/2; 241 s | 102.7 / 78.9 |
| Four Shores | 2 | 2/2; 325 s | not run | 2/2; 450 s | 62.6 / 71.8 |

Time is simulated seconds to victory, rounded. Shots/minute sums both teams and is an activity measure, not a score for the commander. New 4B River Front times were 309, 309, 309, 336 seconds; Iron Valley 254, 253 seconds; Four Shores 325, 325 seconds. 9B Four Shores was 450, 450 seconds. Several games repeated the same decision sequence, so eight games do not provide eight independent situations. The 600-second cap and one scripted opponent limit generalization to human opponents.

In 70 identical recorded game states, the new 4B chose the top-ranked lookahead operation 33 times, compared with 64 times for the original 4B. It selected an option named in the risk notes 36 times versus 60 for the original. A risk note does not mean an option is necessarily wrong. The new 4B and 9B agreed on 12/70 choices; agreement does not measure correctness. Median direct local request latency was 304 ms for the new 4B in the replay (first load excluded by the median), versus 376 ms original 4B and 409 ms 9B on their earlier runs; measurements exclude the connector and network. Candidate input audit: zero truncations, missing hypotheses or full-score ties in 324 candidates over 85 game decisions.

## Artifacts

- Adapter: `C:/Users/Public/openjev/outputs/qwen35-4b-rts-lookahead-nli/adapter-final`.
- Training script and backend: `C:/Users/Public/openjev/train_rts_lookahead_nli.py` and `train_rts_lookahead_backend.py`.
- Validation: `C:/Users/Public/openjev/outputs/qwen35-4b-rts-lookahead-nli/training_result.json`, `dataset_manifest.json`, and `lookahead-risk-validation-results.json`.
- New 4B full-engine traces: `paired-new4b-river.json`, `paired-new4b-classic.json`, `paired-new4b-crossroads.json`; 9B Four Shores: `paired-9b-crossroads.json`; prior two-map results: `shared-lookahead-9b-river.json` and `shared-lookahead-9b-classic.json`.
- Identical-state replay: `shared-new4b-lookahead-comparison.json`. Input audits: `paired-new4b-*-audit.json`.

This experiment does not deploy the model or fix the live game's long JEV prompt format. That integration previously truncated candidates and needs a separate compatible change before live play can reproduce these benchmark results.
