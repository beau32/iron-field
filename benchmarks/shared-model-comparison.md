# Controlled 4B JEV versus 9B RTS model comparison

## Method

Both models received the same compact game facts and the same ordered, currently legal operation names. The 4B classifier received training-format operation hypotheses; the 9B received a constrained choice prompt with operation definitions. Lookahead and flank options were disabled. The models use different inference methods and formats, so this controls facts and choices, not model architecture or tokenization. The 4B used NF4 4-bit weights and BF16 compute; the 9B used Q8_0.

The 70-state paired replay uses saved full-engine states from earlier games; it tests decision agreement, not decision correctness. Both models chose the same operation in 20/70 states. Median local request latency was 291 ms for 4B and 407 ms for 9B, excluding network and connector delays. The 4B chose rush 28 times; the 9B chose raid-economy 52 times. None of the 4B replay decisions had tied scores.

## Fresh full-engine matches

| Map | Seeds | 4B result; mean simulated time | 9B result; mean simulated time | Shots/minute, 4B / 9B |
|---|---:|---:|---:|---:|
| River Front | 4 | 4 wins; 455 s | 4 wins; 360 s | 57.1 / 97.1 |
| Iron Valley | 2 | 2 wins; 197 s | 2 wins; 424 s | 85.3 / 62.2 |

Intensity counts both sides. Match times are rounded; shots/minute is not a score. The models played the same map and seeds against the same scripted opponent, with identical game setup and available-operation rules, but game states naturally diverged once their choices differed. All 4B matches on each map had identical decision sequences; the 9B had two distinct sequences on River Front and one on Iron Valley. Thus six runs do not amount to six independent strategic situations. The asymmetrical solo setup includes computer assistance. A 600-second cap applies, and no network, connector delay, or live five-second fallback is simulated. These results do not establish overall equivalence against humans or other opponents.

The 4B engine inputs were audited against the service tokenizer: 302 candidates across 78 decisions, zero truncated or missing hypotheses, and zero decisions with tied candidate scores. The 512-token service limit still applies to the live-game format, which was not changed by this benchmark. The prior 4B comparison's truncation problem is therefore not present in this controlled run.

Raw data: `shared-model-comparison.json`, `shared-4b-engine.json`, `shared-9b-engine.json`, `shared-4b-classic.json`, `shared-9b-classic.json`, and the two `shared-4b-*-audit.json` files.
