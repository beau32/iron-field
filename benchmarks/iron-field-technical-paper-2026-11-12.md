# Compact language-model commanders for real-time strategy: training and evaluation in Iron Field

**Technical research paper — updated 13 November 2026**

**Status:** Preliminary experimental report. This paper describes a local prototype and the artifacts currently available; it is not a peer-reviewed result. Model names are identifiers for specific local artifacts, not claims about a general model family.

**Game source code:** [Iron Field on GitHub](https://github.com/beau32/iron-field).

## Abstract

Real-time strategy (RTS) games require agents to manage production, partial observations, movement, combat, and changing objectives over long horizons. We investigate a practical hierarchical approach in Iron Field, a custom browser-based RTS prototype: a compact language model selects from a state-dependent set of strategic operations, while conventional game rules execute production, navigation, targeting, and other tactical actions. The systems studied include RTS-adapted Qwen 3.5 2B and 4B natural-language-inference (NLI) classifiers accessed through a JEV-compatible service and an RTS-adapted Qwen 3.5 9B generative model accessed through Ollama. All were adapted primarily using synthetic, rule-labelled scenarios; the 2B and 4B classifiers received the same recommendation and lookahead datasets, while the 9B followed a separate generative training path.

Across 280 synthetic map and combined-arms test cases, the 9B agreed with the hand-authored teacher on 140 cases, compared with 83 for the 4B RTS-lookahead and 108 for a later 4B RTS-map/combined-arms. In a separate direct head-to-head engine experiment, the 4B RTS-lookahead won all six completed matches against the 9B across three maps with starting sides swapped. The six games had limited opening diversity; an additional seed reproduced an existing trajectory and was excluded. A subsequent head-to-head between the RTS-lookahead 2B and 4B ended 3–3 across six games, with outcomes varying by map; a separate 30-game baseline comparison found the trained 2B beat the original 2B 5–1 but lost 1–5 to the 4B OpenJEV baseline, while 4B RTS-lookahead lost 2–4 to base 9B; a later human game against the 2B exposed a pronounced loss of pressure after the initial engagement. In separate tests against a scripted opponent, relative victory times varied by map and engine version. These results suggest that agreement with a synthetic teacher is not a sufficient proxy for performance in a particular interactive matchup. They do not establish the 4B's general superiority, a causal effect of parameter count or JEV, or strong performance against human experts. We present the training, integration, evaluation, limitations, and a reproducible agenda for broader testing.

**Keywords:** real-time strategy, game AI, language-model agents, natural-language inference, synthetic data, lightweight adaptation, lookahead, head-to-head evaluation

## 1. Introduction

RTS play combines long-horizon strategic choices with rapid decisions about individual units, logistics, spatial access, and combat. A player may need to defend a base, keep miners operating, respond to air or naval threats, and conduct attacks simultaneously. These decisions interact: an apparently good attack can fail if the economy collapses, and an effective economy can be wasted if the army is never committed. Fog of war creates further uncertainty about threats and the opponent's intentions.

Iron Field is a small, locally developed RTS game inspired by the genre. It includes resource gathering, unit and structure production, land, air and naval forces, terrain obstacles, player-controlled units, and solo AI opponents. Our goal was not to solve RTS in general or reproduce a professional commercial-game agent. We wanted a more capable and observable computer opponent that could run with local models on a consumer computer and respond within the tempo of play.

The central design separates two timescales. A model periodically chooses a strategic operation such as defend, raid the economy, counter armor, or build an air force. Existing rules map that operation into legal production and tactical behavior. This reduces the model's action space and preserves responsive local control, but it also makes measured performance a property of the **combined model, prompt, candidate generator, lookahead, and game-rule controller**. It is not a clean measurement of the model alone.

We ask three empirical questions:

1. Can lightweight task-specific adaptation improve agreement with synthetic RTS decision labels?
2. Do that agreement and separate games against a scripted opponent predict results in direct model-versus-model play?
3. What can the current results support, and what further experiments are needed to distinguish model quality from the surrounding system?

As the experiments developed, these questions motivated a two-part working hypothesis: **small-scale RTS fine-tuning can substantially improve a compact model's strategic capability, but may leave it weaker than an RTS-unadapted model in the next size tier**. This was an exploratory hypothesis motivating the later baseline comparisons, rather than a preregistered claim for the whole study. We assess the training benefit and the remaining tier gap separately.

## 2. Related work and position in the literature

### 2.1 Reinforcement learning, demonstrations, and leagues

AlphaStar used human and agent games, imitation, and multi-agent reinforcement learning in a league of changing strategies; it achieved Grandmaster-level results in StarCraft II under the evaluation conditions of that work ([Vinyals et al., 2019](https://www.nature.com/articles/s41586-019-1724-z)). League-based evaluation matters because strategies may be non-transitive: beating one opponent does not imply beating every opponent. Subsequent research examined more robust and opponent-aware league training ([Huang et al., 2023](https://proceedings.neurips.cc/paper_files/paper/2023/hash/94796017d01c5a171bdac520c199d9ed-Abstract-Conference.html)).

Our work uses neither AlphaStar's scale nor its training method. The current direct AI matches are evaluation, not self-play training. We did not perform reinforcement learning from the results, train a value network, or run Monte Carlo tree search. The hand-written bounded lookahead described below is a strategic heuristic and should not be interpreted as AlphaGo-style search or learned reflection.

### 2.2 Language models in RTS and hierarchical control

TextStarCraft II and Chain of Summarization investigate text-based strategic decision-making and language-model adaptation in StarCraft II ([Ma et al., 2024](https://proceedings.neurips.cc/paper_files/paper/2024/hash/f0ebc318e2df08360b2df559e81602e5-Abstract-Conference.html)). LLM-PySC2 offers an interface for language models to interact with the larger PySC2 action space and multi-agent scenarios ([Li et al., 2025](https://proceedings.neurips.cc/paper_files/paper/2025/hash/b9523d484af624986c2e0c630ac44ecb-Abstract-Conference.html)). The HIMA preprint explores a strategic planner coordinating specialized imitation agents ([Ahn et al., 2025](https://arxiv.org/abs/2508.06042)). These projects motivate separating longer-horizon decisions from lower-level execution, although their games, action spaces, models, and evaluations differ from ours.

The recent RTSGameBench preprint extends strategic evaluation in Beyond All Reason with gameplay and targeted competency tests ([Kim et al., 2026](https://arxiv.org/abs/2606.18950)). Its focus on varied matchups and diagnostics is relevant to our finding that synthetic-choice agreement, scripted-opponent matches, and direct games measure different abilities. Iron Field does not implement that benchmark, and its scores cannot be compared numerically with results from these external studies.

### 2.3 Efficient adaptation and decision-time reasoning

QLoRA trains low-rank adapters through a frozen quantized base to reduce training memory requirements ([Dettmers et al., 2023](https://arxiv.org/abs/2305.14314)). Our local adaptation follows this general resource-efficient pattern. The 4B NLI interface scores candidate statements instead of generating a long action narrative. Separately, ReAct studies interleaved reasoning and environment action ([Yao et al., 2023](https://arxiv.org/abs/2210.03629)); Iron Field's periodic model decisions and feedback are conceptually related, but our benchmark does not demonstrate that the models independently form or revise a faithful reasoning trace.

## 3. System architecture

### 3.1 Game state and control hierarchy

The game runs its simulation and tactical rules in the browser. State summaries include own forces and structures, production queues, resources, power, strategic feedback, and available ore. The wider live system also exposes a five-by-five strategic map and visible contacts. A legal-operation generator proposes a bounded set of operations from the current state, considering emergency conditions and technology. The selected operation is validated and mapped to an ordinary game plan; production, movement, unit targeting, repairs, and base defense are carried out by game code.

The fog model restricts visible-contact and some tactical decisions to observed opponents. However, the model summary can include aggregate opposing-unit and structure counts beyond currently visible contacts. Therefore, neither the benchmark inputs nor the live AI should be described as strictly limited to human-equivalent fog-of-war information. Benchmark prompts omit player-profile memory by setting the profile to null, preventing adaptation from earlier games from affecting this comparison.

### 3.2 Model interfaces

The 2B and 4B JEV systems receive a premise describing the state and a set of candidate hypotheses. For each hypothesis its NLI classifier returns entailment, contradiction, and neutral probabilities. The selected candidate maximizes

\[
  s(a)=P(\text{entailment}\mid x,h_a)-P(\text{contradiction}\mid x,h_a).
\]

These scores rank the offered statements; they are not calibrated probabilities that a move will win. The 9B Ollama system receives a compact text prompt and operation descriptions, and returns a constrained operation name. Both choices are mapped through the same validated operation-to-plan logic. In the direct benchmark, candidates are generated independently from each side's state; the systems share the same candidate-generation procedure and ordered format, not necessarily an identical list after their states diverge.

The two paths differ in more than model size: training objective, adapter history, representation, decoding, serving stack, and numerical precision also differ. Hence a 4B-versus-9B outcome cannot identify the effect of parameter count or the JEV interface in isolation. The specific Q8 9B artifact is named `qwen3.5:9b-rts-synthetic-full`; the JEV service reported `qwen35-4b-rts-lookahead` on a Qwen 3.5 4B base.

### 3.2.1 Checkpoint naming key

"JEV" identifies the classifier service. It does not specify whether the weights are the general NLI baseline, an RTS continuation, or a map continuation. This paper uses the following names:

| Paper label | Exact local artifact | Training stage |
|---|---|---|
| **Qwen 4B base** | `Qwen/Qwen3.5-4B` | Foundation weights underneath the adapters; not the general OpenJEV baseline |
| **4B OpenJEV baseline** | `qwen35-4b-openjev/checkpoint-6250` | General OpenJEV NLI adaptation, before RTS training |
| **4B RTS-recommendation** | `outputs/qwen35-4b-rts-recommendation-nli/adapter-final` | First RTS continuation; predecessor in the 70-state replay |
| **4B RTS-lookahead** | `qwen35-4b-rts-lookahead` | Further lookahead-aware RTS continuation; used in the direct 4B-vs-9B and 2B-vs-4B duels |
| **4B RTS-map/combined-arms** | `outputs/qwen35-4b-rts-map-combined-arms-nli/adapter-final` | Later experimental map and combined-arms continuation; not the 4B used in those duels |

The lineage is Qwen 4B base -> 4B OpenJEV baseline -> 4B RTS-recommendation -> 4B RTS-lookahead -> 4B RTS-map/combined-arms. Historical filenames and raw identifiers are retained for traceability. Earlier reports sometimes called the RTS-recommendation checkpoint "original 4B"; that historical usage must not be confused with the OpenJEV baseline used in the later tier comparisons. Its SHA-256 prefix `d3450ae3800b` matches the earlier replay artifact, while the general OpenJEV baseline has prefix `43fece067065`.

### 3.3 Bounded lookahead and feedback

The planner projects a compact, hand-designed state containing force estimates, headquarters health, economy, defenses, and counter coverage. It evaluates up to six candidate operations against three stylized opposing responses: assault, expansion, and raid. For each first action, it evaluates a second action and adversarial response, ranking candidates by a worst-case heuristic utility. The prompt presents the ranking and short possible tradeoffs as approximations, not predictions. This is a finite two-step model over a simplified state—not an engine rollout, Monte Carlo search, a learned value function, or proof of a winning line.

Feedback includes recent losses, destroyed value, income and raid progress. These are inputs to a later decision; no model weights are updated during the match. A separate live player-profile mechanism exists, but it was disabled in the direct benchmark. The tested procedure thus supports state-conditioned feedback, not demonstrated online learning from the opponent.

## 4. Data and model training

### 4.1 Synthetic 9B instruction data

The 9B training set contained 1,900 generated scenarios across 19 families, covering situations such as lost miners or a refinery, base pressure, air and armor counters, fortifications, naval gaps, and raids. Two additional examples had weakly inferred labels from a human match; they were explicitly identified and are not expert demonstrations. Preferred answers were produced by hand-written rules, not verified by playing out every alternative. Validation used 380 generated scenarios from a different seed, but shared the training families and teacher logic.

The local run used a quantized Qwen 3.5 9B base and a low-rank adapter with response-only loss. It completed one shuffled epoch over 1,902 training examples, with 1,902 reported optimizer steps. The completed adapter was merged into a base model and exported as the Q8 Ollama artifact. On a 95-case generated validation subset, label agreement rose from 41/95 for the Q8 base to 79/95 for the adapted Q8 model. An older, separately authored 14-case rubric rose from 12/14 to 14/14 acceptable responses; that rubric was known when the training set was designed and is not a blind test. These numbers measure synthetic rubric agreement, not gameplay strength.

### 4.2 Recommendation-NLI 4B and lookahead continuation

The original RTS recommendation-NLI conversion used the 1,900 synthetic training scenarios and 380 synthetic validation scenarios, excluding the two weak human-derived examples. Each scenario generated three labelled premise–hypothesis pairs: the rule-selected operation as entailment, an offered alternative as neutral, and a direct contradiction of an explicit state fact as contradiction. Neutral means that the teacher did not establish the alternative as its selected choice; it is not a judgement that the move is bad. The resulting data contained 5,700 training and 1,140 validation pairs. A local Qwen 3.5 4B OpenJEV adapter was continued for two epochs.

The lookahead continuation retained earlier training material and added 1,600 synthetic lookahead examples from 800 paired states. Each pair contrasted a base situation with a constructed risk note; hand-authored rules retained emergency priorities and in some cases switched the preferred operation. The final training set contained 8,900 pairs, with 1,780 validation pairs, and was trained for one epoch, 557 reported steps. Peak CUDA allocation was approximately 6.3 GB. Reported validation accuracy increased from 80.84% to 95.39%. The validation set used different generated states but shared scenario families and rules with training. Its accuracy is therefore evidence of fitting that distribution, not an independent estimate of strategic competence.

The 4B service used an NF4 4-bit base with BF16 compute for the relevant local experiments. The saved training manifests, adapter configurations, and metrics are identified in Appendix A. JEV identifies the serving interface, not a unique checkpoint. The model variants are named explicitly below.

### 4.3 Later map and combined-arms continuation

A further 4B adapter continued from the lookahead model with 11,700 training pairs, including 2,800 additional NLI examples derived from 1,400 synthetic map and combined-arms decisions. One epoch completed 732 steps; reported validation accuracy rose from 85.5% to 91.4% on 2,340 mixed synthetic examples. The data retained earlier examples to reduce forgetting. Its map observations were generated descriptions; they were not validated route calculations from the live game.

This later adapter is discussed in the synthetic and scripted-opponent results below, but it was **not** the 4B used in the final direct duel. The direct matchup used the earlier `qwen35-4b-rts-lookahead` adapter.

### 4.4 RTS-lookahead continuation of the 2B classifier

A separate `qwen35-2b-rts-lookahead` adapter started from the existing `qwen35-2b-openjev` classifier. It reused the exact saved recommendation and lookahead datasets from the 4B training path: 5,700 recommendation pairs for two epochs, followed by 8,900 mixed lookahead-aware pairs for one epoch, with 1,140 and 1,780 validation pairs respectively. The second stage completed 557 optimizer steps and reported 3.7 GB peak CUDA allocation. Validation accuracy on that stage's related synthetic distribution rose from 81.01% to 92.75%. The original adapter was retained. Training and validation hashes, checkpoint locations, and the source-adapter hash are recorded in the 2B dataset manifest.

The two classifiers share the training data and training schedule, but use different base models and initial adapters. This is not a controlled parameter-count ablation. The labels are heuristic-generated, and the validation families overlap conceptually with training; the improvement does not establish strategic improvement in play.

### 4.5 Adapter lineage and interpretation of the baselines

The classifier training path was **Qwen base -> general OpenJEV NLI adapter -> RTS recommendation continuation -> RTS-lookahead continuation**. The experimental 4B combined-arms adapter continued from the 4B lookahead adapter. Each final classifier checkpoint saves the updated adapter parameters and classifier head; deployment loads that final adapter directly over the matching Qwen base. Loading the earlier OpenJEV adapter as an additional stage at inference is unnecessary. This preserves the training lineage, but does not establish that performance on the original OpenJEV domain was retained; a separate retention test is needed to assess forgetting.

The 9B followed a separate path: **Qwen 9B base -> generative RTS LoRA -> merged model -> Q8 GGUF**. It was not a continuation of the general OpenJEV NLI adapter. The classifiers rank candidate hypotheses, whereas the 9B generates a constrained operation. The surrounding controller can supply lookahead information to either interface. The phrase "RTS-lookahead" identifies the classifier's training history; it does not mean that only that model can use runtime lookahead.

Consequently, "original 2B/4B" means an existing general OpenJEV adapter without the RTS continuation, rather than an entirely untrained model. The 9B baseline is the unadapted-to-RTS Qwen language-model artifact. These distinctions are essential when attributing differences to training or size.

## 5. Evaluation methods

### 5.1 Synthetic decision evaluation

The map/combined-arms decision test used 280 held-out synthetic cases across seven families, with paired situations and legal choices. For every case, a hit meant exact agreement with the synthetic teacher's selected operation. Different seeds and wording reduced exact duplication, but the cases shared scenario families and teacher rules with training. The 4B systems ranked NLI hypotheses; the 9B generated a constrained choice and received operation descriptions. Thus the task formats were not identical even where the offered operation names matched.

Because there can be more than one viable strategy, a non-match is not necessarily an error. Conversely, matching the teacher does not establish that an action is optimal, reachable, or effective against a real opponent. The tests measure alignment with a particular synthetic decision rubric.

### 5.2 Separate full-engine games against a scripted opponent

An unattended harness ran the actual browser game at fixed simulation steps against a rule-based player bot. Models received compact, comparable facts, state-dependent choices, and approximate lookahead. A controller decision was requested every 30 simulated seconds; the simulation paused during model inference. Earlier solo starting arrangements were asymmetric and included computer assistance. Two seeds per map were used in the later map-training comparison, but many runs repeated decision sequences. Victory, simulated time to victory, and combat intensity were recorded; no connector latency or real-time inference deadline was simulated.

The time-dependent intensity report counts shots, damage, units produced, and units destroyed. In the earlier reports, shots per minute were aggregated across **both teams**. They represent battle activity, not the model's accuracy, effective fire, or the number of shots fired by one commander.

### 5.3 Direct model-versus-model matches

The direct duel used a benchmark-only adaptation of the real game engine. It ran one copy of the existing commander rules for each side by switching the controller's team perspective. The two models had equal starting credits, units, and structures; the solo computer credit subsidy was disabled. Their starting sides were swapped on Iron Valley, River Front, and Four Shores. A unit test checked equal starts, autonomous production and combat by both sides, side-specific resources, and absence of the subsidy.

Every 30 simulated seconds, each side received a decision based on its own current summary. Both used lookahead and the same legal-operation generator and operation-to-plan mapping. JEV used classifier-format candidate hypotheses; Ollama used constrained generation. The game was paused while the two local model requests ran sequentially. A 900-second simulated time limit applied. The last match segment could be shorter if a headquarters was destroyed.

The mirrored harness has a known logging limitation: structure-placement events created during a switched-perspective controller turn can carry reversed team labels. Results below use physical-team snapshots and combat counters; individual structure-placement event labels should not be treated as reliable without correction. The game server itself was not modified to run this test.

An initial four-game exploratory run preceded a correction to how the harness alternated controller execution order. The reported six-game result uses the corrected harness; the exploratory games are excluded. A repeat of the first Iron Valley game with a second nominal seed produced the same decisions and state trajectory and was stopped. It is not counted as a separate observation.

### 5.4 Model-tier controls and matched-input replay

To test whether RTS adaptation improves a model and whether it closes the gap to the next size tier, we ran five pairings: RTS-lookahead 2B against the 2B OpenJEV baseline and 4B OpenJEV baseline; 4B RTS-lookahead against the 4B OpenJEV baseline and 9B base; and RTS-trained 9B against the 9B base. The later map/combined-arms adapter was excluded. Each pairing played one nominal seed on Iron Valley, River Front and Four Shores with starting sides swapped, giving six games per pairing and 30 games overall.

All five pairings used the same game source revision, candidate generator, operation mapping, tactical rules and runtime lookahead. Both sides began with matching credits, units and structures, and solo computer aid was disabled. Decisions were requested every 30 simulated seconds while simulation was paused, with a 900-second match limit. The model identity recorded for each decision and equal starts were checked against the raw records. Later states and candidate sets could diverge as play evolved; these games compare common starting setups, rather than identical decision states throughout.

The 2B and 4B baselines were general OpenJEV NLI adapters. The 9B base was `qwen3.5:9b` in Q4_K_M, whereas the RTS-trained 9B was `qwen3.5:9b-rts-synthetic-full` in Q8_0. The 9B same-size control therefore changes precision as well as training. Its base model requested eight GPU layers and used partial CPU execution so both models could remain resident; context allocation also differed. Paused inference removes simulated response-time advantage, but does not establish identical numerical execution or permit a latency ranking. The cross-tier 4B-9B comparison additionally differs in classifier versus generative interface and candidate framing.

For a complementary replay, we sampled the first, middle and last decision from the trained model's side of each game. Each same-interface pair received exactly the same saved input and candidates, giving 18 sampled inputs per pairing. Some states may repeat. The mixed JEV/Ollama pairing was excluded because the input formats differ. We measured agreement between models and reproduction of the trained model's recorded choice; we did not score correctness or play out counterfactual outcomes.

## 6. Results

### 6.1 Synthetic labels and generalization within the generated distribution

| Held-out synthetic measure | 4B RTS-map/combined-arms | 4B RTS-lookahead | Fine-tuned 9B |
|---|---:|---:|---:|
| Agreement with teacher | 108 / 280 | 83 / 280 | 140 / 280 |
| Both choices in a paired situation match | 13 / 140 | 0 / 140 | 22 / 140 |
| Armor and mixed-forces family | 14 / 40 | 17 / 40 | 32 / 40 |
| Base-approach family | 29 / 40 | 14 / 40 | 28 / 40 |
| Bridge-breach family | 2 / 40 | 4 / 40 | 0 / 40 |
| Bridge air-bypass family | 0 / 40 | 0 / 40 | 20 / 40 |

The 9B matched the teacher most often overall and on the armor/mixed-forces subset. The 4B RTS-map/combined-arms improved overall agreement over 4B RTS-lookahead, but both 4B variants had low agreement on the bridge subsets. These figures do not prove that the 9B's individual decisions were better, or that the bridge labels represent optimal play. They do identify families for independent review and in-engine testing.

### 6.2 Games against the scripted opponent

In the later, common engine comparison, all three systems won every recorded game against the single scripted opponent. Mean simulated seconds to victory were:

| Map | 4B RTS-map/combined-arms | 4B RTS-lookahead | Fine-tuned 9B |
|---|---:|---:|---:|
| River Front | 246 | 267 | 357 |
| Iron Valley | 476 | 395 | 350 |
| Four Shores | 259 | 252 | 380 |

Each entry summarizes two nominal seeds, and repeated trajectories limit independence. The 4B RTS-lookahead was faster on River Front and Four Shores, while the 9B was faster on Iron Valley in this engine configuration. A separate earlier lookahead-training report used different game/commander versions and larger seed counts, producing different times; the numbers should not be combined as if they came from the same experimental run.

The reported lookahead-on/off tests were also small and map-dependent. In one River Front 9B experiment, both conditions won both games, with wins around 404–417 seconds without lookahead and 370 seconds with it. A separate Iron Valley run recorded 244 seconds off versus 249 seconds on. These observations do not demonstrate a general lookahead benefit, especially given repeated trajectories, a single scripted opponent, model-choice divergence, and subsequent planner fixes that were not replayed as full matches.

### 6.3 4B RTS-lookahead versus RTS-trained 9B

| Map | 4B RTS-lookahead side | Winner | Simulated duration |
|---|---|---|---:|
| Iron Valley | Player | 4B RTS-lookahead | 342 s |
| Iron Valley | Enemy | 4B RTS-lookahead | 774 s |
| River Front | Player | 4B RTS-lookahead | 342 s |
| River Front | Enemy | 4B RTS-lookahead | 385 s |
| Four Shores | Player | 4B RTS-lookahead | 390 s |
| Four Shores | Enemy | 4B RTS-lookahead | 321 s |

The tested 4B RTS-lookahead won all six completed matches; the 9B won none. Across these games, the 4B side fired 2,902 shots and dealt approximately 83,611 damage, compared with 1,329 shots and 38,613 damage for the 9B side. Unit production was similar in aggregate: 272 versus 278, respectively. These are cumulative game outcomes, not independent per-match estimates, measures of shooting accuracy, or causal proof that a particular operation caused victory. The surviving 4B headquarters had full health at the end of each recorded game.

Across 88 decisions per model, the 4B selected `raid-production` 16 times and `air` or `air-economy` 18 times combined. The 9B selected `raid-economy` 24 times and `defend` 21 times. These counts describe different evolving states; direct frequency comparisons cannot determine whether the 9B defended too often for the situation it faced. A causal investigation would replay identical saved states, intervene on a selected operation, and measure downstream outcomes.

Median local request times were 467 ms for JEV and 332 ms for Ollama in this particular duel. These do not support a general speed ranking: request formats, decoding, hardware contention, precision, and service implementations differed; the simulation paused and no live timeout or network latency was imposed.

### 6.4 Original versus RTS-lookahead 2B

On the same 280 held-out synthetic scenarios and ordered candidates, the original 2B matched the heuristic teacher on 81 cases and the RTS-lookahead 2B on 34. The adapted model selected `raid-economy` in 204 cases, compared with 167 for the original. These measures describe agreement and choice concentration, not which operation would win. All candidate scores were tied in zero cases; no tested input exceeded the service's 512-token limit.

Against one scripted opponent, both 2B models won their single game on each map. Original versus RTS-lookahead victory times were 202 versus 234 seconds on Iron Valley, 218 versus 281 on River Front, and 297 versus 237 on Four Shores. The engine setup, seed, lookahead and solo AI assistance were matched within this comparison. One match per map and a benchmark prompt that differs from the live JEV prompt limit the inference: the adapted 2B was not uniformly stronger against this scripted opponent.

### 6.5 RTS-lookahead 2B versus 4B RTS-lookahead

Both JEV classifiers used the same candidate-generation process, compact NLI format, lookahead, commander rules and full game engine. Each side started with 600 credits and matching units and structures; solo subsidies were disabled. Starting sides were swapped once on each map. The simulation paused for model inference, so this is a comparison of decision systems under the harness, not live response speed. Candidate sets could diverge as game states diverged.

| Map | 2B starting side | Winner | Simulated duration |
|---|---|---|---:|
| Iron Valley | Player | 2B | 427 s |
| Iron Valley | Enemy | 4B | 445 s |
| River Front | Player | 4B | 354 s |
| River Front | Enemy | 4B | 758 s |
| Four Shores | Player | 2B | 531 s |
| Four Shores | Enemy | 2B | 382 s |

Each model won three games. Across the six, 2B units fired 2,619 shots and 4B units fired 2,176; 2B produced 326 units and 4B 291. These are cumulative counts across games of differing lengths and situations, not measures of firing accuracy or independent evidence of better decisions. The 2B selected `rush` 21 times and `raid-economy` 22 times; 4B selected these one and seven times, respectively. Because legal candidates and states evolved separately, those frequencies do not establish an intrinsic preference under matched conditions.

Each model made 99 decisions. An input audit found maxima of 248 tokens for 2B and 253 for 4B, no candidates over 512 tokens, and no decisions where all scores were tied. The draw demonstrates competitiveness within this small matchup, not equivalence: only one seed per map and two assignments were tested. The compact benchmark premise differs from the live game prompt. Shared tactical logic and lookahead can dominate outcomes, and the models' base checkpoints and adapter histories are not identical.

### 6.6 Human-play observations on River Front

Four later saved human matches supply observational evidence, not controlled model comparisons. All used the same named map, but player choices, model settings and game versions may differ. Their log timestamps identify files, not experimental randomization.

| Logged model decisions | Winner | Duration | AI unit-kill events | AI units created |
|---|---|---:|---:|---:|
| 4B RTS-lookahead | AI | 629 s | 68 | 79 |
| 4B OpenJEV baseline | AI | 384 s | 43 | 45 |
| 4B OpenJEV baseline | Human | 483 s | 26 | 56 |
| RTS-lookahead 2B | Human | 523 s | 21 | 52 |

The preceding 12 Nov 07:34 game also included an initial 4B decision before 45 general 2B decisions; the human won at 605 seconds, with 24 AI unit-kill events and 49 AI units created. Model-switching and uncontrolled play mean that it is not a clean 2B-only comparison.

In the RTS-lookahead 2B match the AI sent attacks, including 12 units at 150 seconds, and recorded 19 of its 21 unit kills in the first 240 seconds. Thereafter, it continued issuing some attacks but recorded only two additional unit kills. The player's units recorded 65 kills, 29 by battleships; the AI's frigate, battleship and shipyard were destroyed at approximately 315, 325 and 401 seconds respectively. These events are consistent with the player's naval pressure suppressing recovery, but the log cannot prove a single cause. AI ore delivery stopped increasing after approximately 420 seconds as miners and structures were lost. It selected `defend` ten times and `rush` ten times, but those decisions reflect the situations encountered; they do not independently prove a model bias.

The match recorded 39 successful model decisions with a median round-trip time of 580 ms. The player reported lower intensity and firing. Human logs do not record individual shots, so unit kills and orders are imperfect proxies for combat activity; they cannot quantify the subjective firing-rate difference. The AI made use of a live player profile, while controlled benchmark runs excluded profile memory.

### 6.7 Model-tier and same-size baseline results

All 30 games completed with a winner before the 900-second limit. Each cell below lists wins for the first model versus the second; these are outcome counts for the tested openings, not estimates from a broad independent sample.

| Pairing | Iron Valley | River Front | Four Shores | Overall |
|---|---:|---:|---:|---:|
| RTS-lookahead 2B vs 2B OpenJEV baseline | 2-0 | 2-0 | 1-1 | 5-1 |
| RTS-lookahead 2B vs 4B OpenJEV baseline | 0-2 | 0-2 | 1-1 | 1-5 |
| 4B RTS-lookahead vs 4B OpenJEV baseline | 0-2 | 2-0 | 1-1 | 3-3 |
| 4B RTS-lookahead vs 9B base | 0-2 | 1-1 | 1-1 | 2-4 |
| RTS-trained 9B vs 9B base | 2-0 | 0-2 | 1-1 | 3-3 |

The trained 2B beat its same-size baseline but lost most games to the 4B OpenJEV baseline. The 4B RTS-lookahead also lost more often than it won against the 9B base. However, the 4B and 9B same-size controls each split 3-3. Map dependence was substantial: trained 4B lost both Iron Valley games and won both River Front games against its baseline, while the trained 9B showed the reverse pattern against its baseline. A pooled score therefore hides differences between map conditions.

### 6.8 Decisions on identical recorded inputs

| Pairing | Same operation selected | Trained model's recorded choice reproduced |
|---|---:|---:|
| RTS-lookahead 2B vs 2B OpenJEV baseline | 12 / 18 | 18 / 18 |
| RTS-lookahead 2B vs 4B OpenJEV baseline | 12 / 18 | 18 / 18 |
| 4B RTS-lookahead vs 4B OpenJEV baseline | 13 / 18 | 18 / 18 |
| RTS-trained 9B vs 9B base | 13 / 18 | 17 / 18 |

The replay shows that models can agree on most sampled choices yet produce different match outcomes. It does not identify which disagreements caused those outcomes, or which operation was preferable. The trained 9B failed to reproduce one recorded choice despite temperature-zero decoding, so exact output reproducibility should not be assumed. All sampled JEV choices were reproduced. Sampling three correlated positions per game does not yield 18 independent strategic situations.

## 7. Discussion

### 7.1 Teacher agreement and competitive performance diverged

The 9B achieved greater agreement with the 280 hand-written labels, while the 4B won this direct matchup. This is consistent with the possibility that following the synthetic teacher and performing well against a particular opponent are different objectives. Other explanations are also plausible: model interfaces, differing candidate phrasing, calibration, lookahead use, decision timing, or interactions with the shared tactical controller. The present evidence cannot identify which explanation dominates. In particular, it would be incorrect to infer that smaller models are inherently stronger, that NLI classification is generally superior to generation, or that either model has mastered RTS strategy.

### 7.2 System performance is not model performance alone

The rules implement mining, repairs, naval behavior, pathfinding, spending, tactical execution, and safety checks. The model selects among actions filtered by those rules. A model can receive credit for an effective hand-written tactic, or be blamed for a poor movement or production rule. The head-to-head tests deliberately held the rule system constant within each comparison to compare decisions within that scaffold; it did not test either model as an independent end-to-end controller. The 9B's richer live tactical interface was not exercised in the duel.

Game code changed during development, including starting conditions, miner behavior, naval adaptation, and base recovery. Consequently, earlier scripted-opponent tables, later head-to-head results, and individual human-match logs represent different versions and protocols. Source hashes in the raw run artifacts should be used to identify exact versions. Human games were useful for diagnosing failures, but differences in human play and uncontrolled conditions make them unsuitable for causal model comparisons.

### 7.3 Lookahead and reflection

The current lookahead is an explicit two-step approximation over hand-built transitions and utility, with only three generic opponent responses. It may help in situations its assumptions represent and mislead in others. In the 70-state replay, the 4B RTS-lookahead selected the top lookahead-ranked operation 33 times versus 64 for the earlier 4B RTS-recommendation adapter; this is a behavior difference, not evidence that one system reasoned more deeply or was correct more often. Likewise, periodic loss and income feedback is not weight-updating learning or an AlphaGo-style self-improvement loop.

### 7.4 Validity, reproducibility, and deployment

Internal validity is limited by the small sample, deterministic and sometimes duplicated trajectories, mirrored-controller implementation, and model interface differences. External validity is limited by a single custom game, a small set of opponent pairings, three maps, one starting arrangement per benchmark, and no randomized human evaluation. The systems used synthetic supervision from related scenario families, so data leakage in the broader sense of shared teacher assumptions remains possible even when exact prompts were held out. Aggregate opponent counts can reveal information outside current sight. Service latency, fallback frequency, and quantization differ from a controlled live deployment.

The models ran locally on a consumer computer with an NVIDIA GeForce RTX 5060 Ti with approximately 16 GB of reported GPU memory. The 4B training result recorded a peak CUDA allocation of 6.3 GB. Both services were loaded during the duel, with the 9B Q8 model and 4B service competing for GPU memory. Hardware and workload details matter; no universal latency or resource-efficiency claim follows from these observations.

### 7.5 What the tier comparisons establish

The 2B results support a narrow practical observation: this RTS adaptation improved head-to-head performance against its original OpenJEV baseline in the tested openings, but the adapted model still lost most games against the next-size OpenJEV baseline. The 4B-9B result is consistent with the larger system retaining an advantage in that particular pairing. Neither comparison establishes a universal size threshold or an inability of fine-tuning to overcome it.

The 3-3 same-size 4B and 9B controls, together with the trained 2B's lower synthetic map-label agreement, rule out a blanket conclusion that small-scale fine-tuning dramatically improves all measured capabilities. Changes may specialize behavior for certain maps or opponents while weakening it elsewhere. Because quantization and interface differ in some pairings, the present experiments cannot assign a percentage of the outcome to model size, training or tactical rules. A larger test with matched precision and interfaces, varied independent openings, and counterfactual game rollouts is needed for causal attribution.

## 8. Recommended follow-up experiments

1. **Broaden the opponent and opening distribution.** Test against diverse scripted styles, earlier checkpoints, several human players, and a population of models. Vary starting armies, ore layouts, timings, and maps. Swap sides and explicitly detect duplicate state/decision trajectories.
2. **Compare the same model and interface under controlled ablations.** Vary one factor at a time: base versus adapted weights, lookahead on/off, compact versus full prompts, NLI versus generative decision format where technically comparable, quantization, and tactical rules. Keep model versions and candidate lists fixed when testing the factor of interest.
3. **Evaluate 9B's richer live interface separately.** Run a paired benchmark that allows the 9B tactical choices it normally receives, then compare it with a matched interface for the 4B where possible. Report this as a system comparison rather than a parameter-count experiment.
4. **Measure strategic choices counterfactually.** Save states before decisions, select a small set of feasible operations, and replay each under multiple seeds and opponent responses. Compare realized economy, survival, damage, and objective progress. This gives more informative labels than a single hand-written preferred answer, though rollouts remain conditional on the simulator and opponent.
5. **Audit observation and logging.** Restrict opponent counts to observed information or explicitly label privileged inputs. Correct mirrored structure-event attribution; record side, source hashes, actual inputs, candidate lists, invalid responses, pending/fallback status, action execution, and resource use. Verify controller order and model identity on every run.
6. **Report robust metrics and uncertainty.** Prespecify matchups and stopping rules; report wins, draws and timeouts, time to victory, per-side shots and damage, resource income, unit value lost, idle miners, decision latency, and errors. Use paired analysis at the genuinely independent scenario level and avoid confidence intervals that assume duplicated games are independent.
7. **Evaluate live play.** Run human matches with both models under comparable conditions, document connector and service delays and fallback frequency, and gather player feedback without presenting subjective preference as a controlled win-rate estimate.

## 9. Conclusion

**1. Lightweight adaptation and synthetic-label agreement.** Lightweight task-specific adaptation can improve agreement with synthetic RTS decision labels, but the improvement is conditional on the evaluation distribution. The adapted 9B improved from 41/95 to 79/95 on a related synthetic validation subset. However, RTS-lookahead 2B matched only 34/280 labels on the separate synthetic map test, compared with 81/280 for its original OpenJEV adapter. The evidence therefore supports adaptation as a way to fit particular decision rubrics, while leaving transfer to other scenario families uncertain. Agreement with a hand-written teacher should not be interpreted as optimal strategy or general RTS competence.

**2. Predicting direct play from synthetic tests and scripted opponents.** Neither synthetic-label agreement nor success against the single scripted opponent reliably determined the ranking observed in direct model-versus-model play. The RTS-trained 9B matched more synthetic map labels than 4B RTS-lookahead (140/280 versus 83/280), yet 4B RTS-lookahead won their earlier six-game duel 6-0. The trained 2B's lower synthetic-label agreement also coexisted with a later 5-1 result against its original OpenJEV baseline. Separate scripted-opponent tests often produced wins for every tested model and map-dependent victory times, which did not resolve these direct matchups. These small experiments demonstrate that the measures can disagree; they do not quantify their predictive relationship across a broader population of games.

**3. Supported conclusions and remaining attribution questions.** The results support the feasibility of compact local models selecting strategic operations within a shared hierarchical RTS controller. They also support specific, scenario-dependent benefits from adaptation, especially the trained 2B's advantage over its baseline in the tested openings. They do not establish universal gains from fine-tuning or a stable model-size ranking: the 4B and 9B same-size controls each split 3-3, while the trained smaller models lost most games to the next-tier baselines in the later comparisons. Interface, precision, starting-adapter history, limited opening diversity and the shared game rules restrict causal interpretation.

Distinguishing learned decision quality from the surrounding system requires paired adaptation tests with matched precision and interfaces, plus controlled ablations of prompts, candidate generation, lookahead and tactical execution. More independent openings, maps and opponents are needed, together with saved-state rollouts that compare the consequences of alternative choices. Synthetic tests, full-engine tournaments and human-play observations should remain complementary measures, with per-side combat, economy and decision-execution evidence reported alongside wins. Until those controls are available, the findings describe the performance of particular model-and-controller configurations, rather than an isolated contribution from model weights.

## Appendix A. Artifacts and reproduction

The selected code and results supporting this paper are archived in the [Iron Field GitHub repository](https://github.com/beau32/iron-field). The [research reproduction guide](https://github.com/beau32/iron-field/blob/45e22dfd833c5d51e9b2c9f891cff6879a9a6ccb/research/README.md) identifies benchmark entry points, training sources and requirements. Links below identify the committed artifacts. Model weights and datasets are hosted separately as described in Appendix B.

- Direct comparison: [benchmarks/jev4b-vs-ollama9b-duel-report-20261111.md](https://github.com/beau32/iron-field/blob/45e22dfd833c5d51e9b2c9f891cff6879a9a6ccb/benchmarks/jev4b-vs-ollama9b-duel-report-20261111.md), [benchmarks/jev4b-vs-ollama9b-duel-balanced-order-20261111.json](https://github.com/beau32/iron-field/blob/45e22dfd833c5d51e9b2c9f891cff6879a9a6ccb/research/results/benchmarks/jev4b-vs-ollama9b-duel-balanced-order-20261111.json.gz), and [benchmarks/jev4b-vs-ollama9b-duel-crossroads-20261111.json](https://github.com/beau32/iron-field/blob/45e22dfd833c5d51e9b2c9f891cff6879a9a6ccb/research/results/benchmarks/jev4b-vs-ollama9b-duel-crossroads-20261111.json.gz).
- Test-only direct-match harness and runner: [benchmarks/duel-harness.cjs](https://github.com/beau32/iron-field/blob/45e22dfd833c5d51e9b2c9f891cff6879a9a6ccb/benchmarks/duel-harness.cjs), [benchmarks/duel-benchmark.cjs](https://github.com/beau32/iron-field/blob/45e22dfd833c5d51e9b2c9f891cff6879a9a6ccb/benchmarks/duel-benchmark.cjs), and [tests/duel-benchmark.test.cjs](https://github.com/beau32/iron-field/blob/45e22dfd833c5d51e9b2c9f891cff6879a9a6ccb/tests/duel-benchmark.test.cjs). The JSON includes source hashes, each side's decisions and compact facts, per-window snapshots, and combat counters.
- RTS-lookahead 2B: [training manifests, metrics and evaluation](https://github.com/beau32/iron-field/tree/45e22dfd833c5d51e9b2c9f891cff6879a9a6ccb/research/training-results/qwen35-2b-rts-lookahead-nli).

- 2B versus 4B duel: [benchmarks/jev-2b-vs-4b-duel-report-20261112.md](https://github.com/beau32/iron-field/blob/45e22dfd833c5d51e9b2c9f891cff6879a9a6ccb/benchmarks/jev-2b-vs-4b-duel-report-20261112.md), [benchmarks/jev-2b-vs-4b-duel-20261112.json](https://github.com/beau32/iron-field/blob/45e22dfd833c5d51e9b2c9f891cff6879a9a6ccb/research/results/benchmarks/jev-2b-vs-4b-duel-20261112.json.gz), and [benchmarks/duel-2b-vs-4b.cjs](https://github.com/beau32/iron-field/blob/45e22dfd833c5d51e9b2c9f891cff6879a9a6ccb/benchmarks/duel-2b-vs-4b.cjs). The [archived supervisor](https://github.com/beau32/iron-field/blob/45e22dfd833c5d51e9b2c9f891cff6879a9a6ccb/research/training/run_rts_2b_vs_4b.py) manages the local model services.
- Human-play observations: [observation analysis in this paper](https://github.com/beau32/iron-field/blob/45e22dfd833c5d51e9b2c9f891cff6879a9a6ccb/benchmarks/iron-field-technical-paper-2026-11-12.md) (Section 6.6). The original individual human-match logs are not included in the repository archive.
- 4B RTS-lookahead: [training manifest and metrics](https://github.com/beau32/iron-field/tree/45e22dfd833c5d51e9b2c9f891cff6879a9a6ccb/research/training-results/qwen35-4b-rts-lookahead-nli).
- 4B RTS-map/combined-arms: [training provenance, metrics and evaluation](https://github.com/beau32/iron-field/tree/45e22dfd833c5d51e9b2c9f891cff6879a9a6ccb/research/training-results/qwen35-4b-rts-map-combined-arms-nli).
- 9B data and evaluation: [training manifest and evaluation](https://github.com/beau32/iron-field/tree/45e22dfd833c5d51e9b2c9f891cff6879a9a6ccb/research/training-results/qwen35-9b-rts-v2-synthetic).
- Earlier full-engine lookahead and map reports: [benchmarks/lookahead-v10-engine.md](https://github.com/beau32/iron-field/blob/45e22dfd833c5d51e9b2c9f891cff6879a9a6ccb/benchmarks/lookahead-v10-engine.md), [benchmarks/lookahead-revised-classic.md](https://github.com/beau32/iron-field/blob/45e22dfd833c5d51e9b2c9f891cff6879a9a6ccb/benchmarks/lookahead-revised-classic.md), and the [map experiment traces](https://github.com/beau32/iron-field/tree/45e22dfd833c5d51e9b2c9f891cff6879a9a6ccb/research/results/benchmarks) traces.

The model-tier study in Sections 5.4, 6.7, 6.8 and 7.5 uses the following archived traces:

- [RTS-lookahead 2B vs 2B OpenJEV baseline](https://github.com/beau32/iron-field/blob/45e22dfd833c5d51e9b2c9f891cff6879a9a6ccb/research/results/benchmarks/tier-comparison-20261113-2b-trained-vs-2b-original-full.json.gz).
- [RTS-lookahead 2B vs 4B OpenJEV baseline](https://github.com/beau32/iron-field/blob/45e22dfd833c5d51e9b2c9f891cff6879a9a6ccb/research/results/benchmarks/tier-comparison-20261113-2b-trained-vs-4b-original-full.json.gz).
- [4B RTS-lookahead vs 4B OpenJEV baseline](https://github.com/beau32/iron-field/blob/45e22dfd833c5d51e9b2c9f891cff6879a9a6ccb/research/results/benchmarks/tier-comparison-20261113-4b-trained-vs-4b-original-full.json.gz).
- [4B RTS-lookahead vs 9B base](https://github.com/beau32/iron-field/blob/45e22dfd833c5d51e9b2c9f891cff6879a9a6ccb/research/results/benchmarks/tier-comparison-20261113-4b-trained-vs-9b-base-full.json.gz).
- [RTS-trained 9B vs 9B base](https://github.com/beau32/iron-field/blob/45e22dfd833c5d51e9b2c9f891cff6879a9a6ccb/research/results/benchmarks/tier-comparison-20261113-9b-trained-vs-9b-base-full.json.gz).
- [Matched-input replay](https://github.com/beau32/iron-field/blob/45e22dfd833c5d51e9b2c9f891cff6879a9a6ccb/research/results/benchmarks/tier-comparison-20261113-matched-states.json.gz).

The tournament runners are [benchmarks/tier-adaptation-duel.cjs](https://github.com/beau32/iron-field/blob/45e22dfd833c5d51e9b2c9f891cff6879a9a6ccb/benchmarks/tier-adaptation-duel.cjs) and [benchmarks/run-tier-comparison.py](https://github.com/beau32/iron-field/blob/45e22dfd833c5d51e9b2c9f891cff6879a9a6ccb/benchmarks/run-tier-comparison.py); the replay runner is [benchmarks/replay-tier-states.py](https://github.com/beau32/iron-field/blob/45e22dfd833c5d51e9b2c9f891cff6879a9a6ccb/benchmarks/replay-tier-states.py). Raw records retain model artifact hashes or Ollama digests, source hashes, choices, snapshots and combat counters. Historical filenames retain "original" where the text now says "OpenJEV baseline". The earlier standalone tier report is retained as a companion artifact; the integrated methods and interpretation are in this paper.

From the game checkout, with the specified local JEV and Ollama services already running, the following commands check the harness and run a new three-map experiment. The output path must not already exist:

```text
node tests/duel-benchmark.test.cjs
node benchmarks/duel-benchmark.cjs --maps classic,river,crossroads --seconds 900 --output benchmarks/new-duel-results.json
```

Reproduction also requires compatible model artifacts, GPU and memory capacity, browser and Node dependencies, and the same source revisions. The local service health response identifies the active JEV adapter but does not itself prove a cryptographic digest of its loaded weights; the benchmark records the Ollama model digest. Do not assume that a different local setup will reproduce identical outcomes.

## Appendix B. Hugging Face artifacts and dataset availability

The models and exact training files have been committed to the author's Hugging Face account. **All repositories listed below are private**, so an authorized account is required; this is an authenticated archive, not a public release. Model cards document intended use, training and evaluation limits. The dataset files were checked against local SHA-256 hashes, and all four dataset configurations were loaded successfully with the Hugging Face `datasets` library.

| Artifact | Repository | Packaging |
|---|---|---|
| RTS-lookahead 2B | [beau32/Qwen3.5-2B-RTS-Lookahead-OpenJEV](https://huggingface.co/beau32/Qwen3.5-2B-RTS-Lookahead-OpenJEV) | Final sequence-classification adapter and tokenizer; Qwen 2B base required |
| 4B RTS-lookahead | [beau32/Qwen3.5-4B-RTS-Lookahead-OpenJEV](https://huggingface.co/beau32/Qwen3.5-4B-RTS-Lookahead-OpenJEV) | Final sequence-classification adapter and tokenizer; Qwen 4B base required |
| Experimental combined-arms 4B | [beau32/Qwen3.5-4B-RTS-Combined-Arms-OpenJEV](https://huggingface.co/beau32/Qwen3.5-4B-RTS-Combined-Arms-OpenJEV) | Final adapter and tokenizer, separately identified from the duel's 4B |
| Generative RTS 9B | [beau32/Qwen3.5-9B-RTS-Strategy-GGUF](https://huggingface.co/beau32/Qwen3.5-9B-RTS-Strategy-GGUF) | Merged Q8 GGUF and Ollama Modelfile; original LoRA checkpoint also archived |

The [training dataset repository](https://huggingface.co/datasets/beau32/Iron-Field-RTS-Strategy-Training) contains these configurations:

| Configuration | Training rows | Validation rows | Relationship |
|---|---:|---:|---|
| `recommendation_nli` | 5,700 | 1,140 | First RTS stage for both classifiers |
| `lookahead_nli` | 8,900 | 1,780 | Retains recommendation examples and adds lookahead cases |
| `combined_arms_nli` | 11,700 | 2,340 | Retains lookahead examples and adds map cases |
| `strategy_9b` | 1,902 | 380 | Generative data; training includes two weak human-derived examples |

These are overlapping training stages, so their row counts must not be summed as independent observations. The combined-arms configuration additionally includes a 560-row test split containing only new map cases, rather than the mixed training distribution. Separate source files identify the 9B's 1,900 synthetic and two weak human-derived training examples. The dataset card explains label semantics and shared-generator limitations. The uploaded files are fixed by dataset commit `25996137a01651fe9a591a2db119dc906e407868`; `file-manifest.json` records their hashes and counts.

The original 9B LoRA used local layer naming that required a custom merge. Archiving it does not demonstrate compatibility with a stock PEFT loader; the merged GGUF is the tested inference artifact. Repository availability also does not by itself reproduce the experiments: the controller revision, candidate prompts, lookahead, evaluation scripts, model precision and access to the private files remain necessary.

## References

1. Vinyals, O., et al. (2019). “Grandmaster level in StarCraft II using multi-agent reinforcement learning.” *Nature*, 575, 350–354. [https://doi.org/10.1038/s41586-019-1724-z](https://doi.org/10.1038/s41586-019-1724-z).
2. Huang, R., et al. (2023). “A Robust and Opponent-Aware League Training Method for StarCraft II.” *NeurIPS 2023*. [Conference paper](https://proceedings.neurips.cc/paper_files/paper/2023/hash/94796017d01c5a171bdac520c199d9ed-Abstract-Conference.html).
3. Ma, W., et al. (2024). “Large Language Models Play StarCraft II: Benchmarks and A Chain of Summarization Approach.” *NeurIPS 2024*. [Conference paper](https://proceedings.neurips.cc/paper_files/paper/2024/hash/f0ebc318e2df08360b2df559e81602e5-Abstract-Conference.html).
4. Li, Z., et al. (2025). “LLM-PySC2: Starcraft II learning environment for Large Language Models.” *NeurIPS 2025*. [Conference paper](https://proceedings.neurips.cc/paper_files/paper/2025/hash/b9523d484af624986c2e0c630ac44ecb-Abstract-Conference.html).
5. Ahn, D., Kim, S., and Choi, J. (2025). “Society of Mind Meets Real-Time Strategy: A Hierarchical Multi-Agent Framework for Strategic Reasoning.” *arXiv preprint*. [https://arxiv.org/abs/2508.06042](https://arxiv.org/abs/2508.06042).
6. Kim, S., et al. (2026). “RTSGameBench: Evaluating VLMs for Strategic Reasoning in Game Environments.” *arXiv preprint*, version 4. [https://arxiv.org/abs/2606.18950](https://arxiv.org/abs/2606.18950).
7. Dettmers, T., Pagnoni, A., Holtzman, A., and Zettlemoyer, L. (2023). “QLoRA: Efficient Finetuning of Quantized LLMs.” [https://arxiv.org/abs/2305.14314](https://arxiv.org/abs/2305.14314).
8. Yao, S., et al. (2023). “ReAct: Synergizing Reasoning and Acting in Language Models.” *ICLR 2023*. [https://arxiv.org/abs/2210.03629](https://arxiv.org/abs/2210.03629).
