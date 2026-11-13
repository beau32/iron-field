# Iron Field headless strategy benchmark

Mode: ollama · model: qwen3.5:9b-rts-synthetic-full. 3 seed(s) per scenario; up to 8 decision windows per run.

- Strategic proxy only: not actual Iron Field matches, not a game-engine rollout, and not a win-rate estimate.
- Combat, income, production and scripted enemy responses are simplified; no movement, terrain, fog, routing, technology prerequisites or building placement.
- Both conditions share seeds and starting states, but the proxy can favor or penalize either method for reasons unrelated to real games.
- A model can choose differently on sequential runs; temperature zero does not guarantee repeatability on all hardware.

## Mean proxy outcomes

| Metric | Lookahead off | Lookahead on |
|---|---:|---:|
| Own HQ remaining (%) | 59.5 | 59.8 |
| Enemy HQ remaining (%) | 69.9 | 75 |
| Ore delivered | 275.6 | 311.3 |
| Own asset value lost | 720 | 690 |
| Enemy unit value destroyed | 465.8 | 408.3 |
| Own remaining unit value | 862.5 | 918.3 |

## Paired scenarios

| Scenario | Seed | Own HQ off / on | Enemy HQ off / on | Choices differed* |
|---|---:|---:|---:|---:|
| mining-recovery | 1 | 96 / 99 | 66 / 100 | 8/8 |
| mining-recovery | 2 | 96 / 99 | 66 / 100 | 8/8 |
| mining-recovery | 3 | 96 / 98 | 45 / 100 | 8/8 |
| base-assault | 1 | 80 / 80 | 100 / 100 | 0/8 |
| base-assault | 2 | 80 / 80 | 100 / 100 | 0/8 |
| base-assault | 3 | 80 / 80 | 100 / 100 | 0/8 |
| air-attack | 1 | 0 / 0 | 100 / 100 | 2/6 |
| air-attack | 2 | 0 / 0 | 100 / 100 | 2/6 |
| air-attack | 3 | 0 / 0 | 100 / 100 | 2/6 |
| armor-push | 1 | 0 / 0 | 100 / 100 | 2/5 |
| armor-push | 2 | 0 / 0 | 100 / 100 | 2/5 |
| armor-push | 3 | 0 / 0 | 100 / 100 | 2/5 |
| fortified-base | 1 | 100 / 100 | 0 / 0 | 3/5 |
| fortified-base | 2 | 100 / 100 | 0 / 0 | 4/5 |
| fortified-base | 3 | 100 / 100 | 0 / 0 | 4/5 |
| naval-pressure | 1 | 100 / 100 | 100 / 100 | 0/8 |
| naval-pressure | 2 | 100 / 100 | 100 / 100 | 0/8 |
| naval-pressure | 3 | 100 / 100 | 100 / 100 | 0/8 |
| vulnerable-enemy | 1 | 100 / 100 | 0 / 0 | 2/2 |
| vulnerable-enemy | 2 | 100 / 100 | 0 / 0 | 2/2 |
| vulnerable-enemy | 3 | 100 / 100 | 0 / 0 | 2/2 |
| exhausted-ore | 1 | 0 / 0 | 100 / 100 | 1/3 |
| exhausted-ore | 2 | 0 / 0 | 100 / 100 | 1/3 |
| exhausted-ore | 3 | 0 / 0 | 100 / 100 | 1/3 |

*Choices compare corresponding decision windows. Once the runs diverge, their states can differ, so this is not a controlled count of decisions caused by lookahead.

Each run’s states, decisions, offered choices, latency and effects are recorded in lookahead-comparison-3seeds.json.
