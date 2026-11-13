# Technical paper artifacts

The [technical paper](../benchmarks/iron-field-technical-paper-2026-11-12.md) describes training and evaluation of compact RTS commanders. The source game is this repository. This folder archives the training scripts and selected metrics; `benchmarks/` contains evaluation code and final traces cited in the paper.

## What is included

- The exact current simulation and commander implementation needed by the full-engine harness. Game source hashes in the final traces identify the benchmarked files.
- Headless browser harnesses, shared candidate/prompt code, duel runners, matched-input replay, and validation tests.
- Completed result traces, losslessly compressed under `research/results/`, and comparison reports used by the paper. Smoke runs, exploratory/discarded duels, service logs and Python caches are excluded.
- Original training, data-generation, model-serving and evaluation scripts, plus training manifests and selected metrics. `training-source-hashes.json` records the archived source bytes.

Model weights and datasets are hosted on Hugging Face; links and access restrictions appear in the paper's Appendix B. These repositories are private. This Git commit does not make those artifacts public. The 2B and 4B adapters require matching Qwen base models. The 9B GGUF is a merged model.

## Restore and verify the recorded results

```text
python research/unpack-results.py --check
python research/unpack-results.py
```

The first command verifies every archive against its saved SHA-256 hash without writing result files. The second restores their original paths for the replay and analysis scripts, refusing to overwrite different existing results. `result-archives.json` identifies every source file, size and checksum. The paper links to the compressed archives; historical filenames in code and prose refer to the extracted files.

## Run the benchmark checks

Use Node.js 22 or newer, with Chrome, Edge or Chromium installed. The harness uses Node's built-in fetch and WebSocket; no npm dependencies are required. Set `IRON_BENCH_BROWSER` if the browser is outside the detected paths. Browser tests launch an isolated temporary headless profile; they do not use your current browser session or call a paid model API.

```text
node tests/shared-model-comparison.test.cjs
node tests/strategy-benchmark.test.cjs
node tests/jev-engine-benchmark.test.cjs
node tests/full-engine-benchmark.test.cjs
node tests/duel-benchmark.test.cjs
```

These checks validate the engine hooks, equal starts, two autonomous controllers, resources and combat, and shared model-input structure. They do not rerun the model tournaments.

## Run new model games

Start compatible local model services first. The standard 4B/9B duel expects `qwen35-4b-rts-lookahead` on JEV port 8011 and `qwen3.5:9b-rts-synthetic-full` in Ollama on port 11434:

```text
node benchmarks/duel-benchmark.cjs --maps classic,river,crossroads --seconds 900 --output benchmarks/new-duel-results.json
```

Outputs must use a new filename. Decision inference pauses simulated time. Different service versions, numerical precision, hardware or game revisions can change choices; matching the software alone does not guarantee the same outcome. The scripts record source hashes and model identities.

For the 30-game tier protocol, `benchmarks/run-tier-comparison.py` starts a temporary JEV service on 18012 and switches the existing service on 8011, attempting to restore its original active adapter afterward. It expects a local OpenJEV installation and adapters. Set `OPENJEV_ROOT` to its directory (the historical default is `C:/Users/Public/openjev`); the Python executable is expected in `.venv-local/Scripts/python.exe`. `TIER_PAIRS` optionally selects comma-separated pair identifiers from the script. The wrapper remains Windows-specific and references historical output filenames, so inspect the configuration and use new output names before rerunning. The 9B control in the final study used `DUEL_BASE_9B_GPU_LAYERS=8` with the generic duel runner to keep both models resident. This setting affects execution and numerical reproducibility; it is documented in the paper.

`benchmarks/replay-tier-states.py` replays the completed tier traces. It switches model adapters and attempts restoration; it measures choice agreement rather than outcome quality. The proxy `strategy-benchmark.cjs` uses a simplified strategic model and must not be reported as a full-engine tournament.

## Training archive

`training/` preserves the scripts used locally, rather than presenting them as a portable training package. They contain historical filesystem assumptions, imports between training stages, and explicit expected counts. Copy the top-level scripts into an OpenJEV workspace and place `strategy-9b/` scripts in the corresponding synthetic experiment directory, or adapt the paths deliberately. Use the original scripts' `--check-data` options before training where available. A CUDA/PyTorch/Transformers/PEFT/bitsandbytes environment, the initial OpenJEV adapters, tokenizer/base weights, and downloaded training splits are also required. The adjacent `environment.json` records installed package versions at archival time; it is an environment inventory, not proof of the exact package versions at every historical run.

The Hugging Face dataset uses configuration folders; the original scripts expect experiment-specific filenames. Map the published recommendation and lookahead splits to the filenames in the script constants and manifests. The experimental map-training pipeline additionally regenerates/audits map cases with the archived generator; its full generator output is not the same as the reduced combined-NLI training configuration. Two weak human-derived examples are separately identified in the 9B data. Do not sum overlapping dataset stages as independent examples.

The 9B merge script requires the original BF16 base revision named in the merge record and uses special layer-name mapping. Generic adapter loading is not a substitute for that merge workflow. The tested deployment artifact is the archived GGUF on Hugging Face.

## Scope of the evidence

The final tournaments used one nominal seed per map with sides swapped. The 9B controls have quantization and, in some cases, interface differences. Source hashes, trace decisions and hardware observations help audit the study, but the small deterministic sample does not establish a population win rate or isolate model size. Historical exploratory results and training distributions are retained as evidence, not as verified optimal game strategies.
