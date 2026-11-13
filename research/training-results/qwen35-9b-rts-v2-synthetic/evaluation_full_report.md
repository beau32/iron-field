# RTS model evaluation

Identical full game prompts and structured choice schema, warm models, one deterministic response per case. Synthetic validation is held out by exact prompt and seed but uses the same templates and rules. Benchmark rubric is separately authored but synthetic.

Synthetic labels reflect hand-written heuristics and may be wrong; these results are not match win rates. Both models use the same base and Q8 quantization.

| Measure | Base Q8 | Synthetic-trained Q8 |
|---|---:|---:|
| Valid responses | 109/109 | 109/109 |
| Generated validation label agreement | 41/95 | 79/95 |
| Existing benchmark acceptable | 12/14 | 14/14 |
| Existing discriminating cases acceptable | 7/9 | 9/9 |
| Median warm wall time | 294 ms | 308 ms |

Training and validation differ in generated random state, but share scenario templates and labeling rules; the earlier benchmark is also synthetic and was known when designing training. Evaluate against held-out human games and AI matches before claiming stronger play.

Per-case responses and prompt hashes are in evaluation_full_results.json.

The full adapter completed 1,902 training steps. Each generated validation family above contains five examples. On weak-HQ cases, agreement fell from 5/5 to 3/5; on air-attack cases it remained 1/5. These small samples help identify follow-up work but do not reliably estimate performance.
