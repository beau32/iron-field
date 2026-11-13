# Controlled lookahead: 4B JEV versus 9B

Both models used the same compact facts, ordered legal operation names, approximate two-step lookahead ranking and risk notes, with flank variants disabled. The 4B classified training-format hypotheses; the 9B generated a constrained choice with operation definitions. The 4B used an NF4 4-bit base with BF16 compute; the 9B used Q8_0. Neither format is identical to the full live-game interaction.

| Map | Seeds | 4B wins; average simulated time | 9B wins; average simulated time | Shots/minute, both teams: 4B / 9B |
|---|---:|---:|---:|---:|
| River Front | 4 | 4/4; 410 s | 4/4; 420 s | 76.5 / 71.7 |
| Iron Valley | 2 | 2/2; 366 s | 2/2; 241 s | 87.6 / 78.9 |

4B River Front times: 366, 443, 475, 355 seconds. 9B River Front: 420, 420, 420, 420 seconds. 4B Iron Valley: 366, 366 seconds. 9B Iron Valley: 241, 240 seconds. Values are rounded. The 9B games on each map and both 4B games on Iron Valley repeated the same decision sequences, so results are not six independent situations. This uses a scripted opponent and asymmetric solo setup with computer assistance. A 600-second cap applied; model decisions were made while simulation was paused and do not include network, connector delays or five-second game fallback.

On the 70 fixed-state replay cases, the models chose the same operation 8 times. This is agreement, not accuracy. The 4B selected rush 45 times; the 9B selected raid-economy 51 times. Median local response was 376 ms for the 4B and 409 ms for the 9B, excluding connector/network delay. None of the replay cases had tied 4B scores. The 4B was trained on premises without lookahead ranking, so the extra lookahead text is outside that exact training format.

The 4B input audit found zero truncated or missing candidate hypotheses and zero decisions with tied candidate scores in 324 candidate inputs over 82 game decisions. This controlled benchmark does not fix truncation in the live game.

Compared with the previous lookahead-off controlled matches, 4B River Front fell from 455 to 410 seconds, while 4B Iron Valley rose from 197 to 366 seconds. 9B River Front rose from 360 to 420 seconds, while 9B Iron Valley fell from 424 to 241 seconds. These are observed differences in small, correlated samples, not reliable proof of causal improvement.

Raw match traces are in `shared-lookahead-4b-river.json`, `shared-lookahead-4b-classic.json`, `shared-lookahead-9b-river.json`, and `shared-lookahead-9b-classic.json`. Candidate scores for identical states are in `shared-model-lookahead-comparison.json`; detailed input audits are in the two `shared-lookahead-4b-*-audit.json` files.
