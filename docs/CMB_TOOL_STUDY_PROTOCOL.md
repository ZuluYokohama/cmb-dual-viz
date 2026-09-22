# CMB numerical tool and allocation study - frozen protocol v1

Goal: complete an auditable decision on whether the existing CMB numerical tool helps a small deployed LLM answer questions about series, and whether final-output drift helps allocate that intervention. Completion does not require a positive result. No native modality or enhanced foundation-model claim is authorized by these tests.

## Frozen before confirmation

- Model/runtime/native observer: the exact existing `experiments/llm/model.lock.json` and collector; greedy, seed 31, max 24 generated tokens, 4 CPU threads, no GPU.
- 24 development examples from an IID series generator; 96 confirmation examples from four unseen generator families: random walk, noisy periodic, impulses, piecewise levels. These are synthetic source-family holdouts, not natural data or unseen task types.
- Each family has 6 independent pairs for each task: best lag, sign at best lag, strong absolute correlation, sign at lag zero. One question per pair; no shared-series pseudo-replication. Seeds: 1701 development and 2903 confirmation.
- Each pair has 32 equal-spaced values rounded to 3 decimals. Lag searches -4..4. Positive k pairs A[t] with B[t+k]. Maximize absolute Pearson; smallest-lag tie break. Reject fixtures with best-vs-next absolute correlation gap <.02, absolute zero-lag correlation <.1, or absolute best correlation strictly between .7 and .9. Strong-label fixtures alternate >=.8 and <.8. These restrictions define the synthetic population; they are not based on LLM outputs.
- Labels use independently written Python centered-dot Pearson with `math.fsum`. Tool output uses the repository's existing TypeScript `bestLaggedPearson`. Verify numerical/categorical agreement on every input. Tool outputs explicitly contain the requested statistics; tool-only exact accuracy is a required comparator.

## Model arms and allocation

All arms receive the same raw series and mathematical definition. Base is ordinary observation-off generation. Observed repeats the identical prompt with final-state observation enabled. Tool adds the CMB measurements as JSON; null adds identical keys with unavailable values; shuffled adds another source's real measurements using a seeded within-task derangement. A shuffled source may have the same answer; report agreement rates. Rotate arm execution order by example index. No arm sees the answer-key file or the original model response.

Score the entire stripped output as a single integer equal to the independent answer. Explanations/truncation/multiple numbers fail. Report repair and regression counts and all arms, regardless of acceptance gates. Observed/ordinary token parity must hold on every case or the run is invalid.

All six allocation policies receive a quota of n/2 tool-assisted second responses. The second response replaces the first without consulting gold labels. Allocate using only the observed initial response's entropy, drift, emitted length, and public task type. Record decisions before loading the separate scoring key.

- Random: sample n/2 positions with Python seed 31.
- Entropy: highest mean full-vocabulary raw entropy, normalized by log vocabulary size, including EOS prediction.
- Length: longest emitted-token count.
- Task type: lag first, then strong, zero-sign, sign.
- Geometry: equal average of within-batch midrank percentiles of normalized entropy and mean cosine drift/2. Missing drift is 0 and explicitly counted. This rank rule replaces the first smoke's raw-scale combination, before new outcomes are seen.
- Shuffled geometry: same rule, but seed-31 permutation of drift percentiles across examples.
- All ties: ascending source ID, then position for bootstrap duplicates. Percentile uses `(number strictly lower + (number equal-1)/2)/(n-1)`.

This is offline paired replay of a finite action pool, with fixed quotas and per-response token caps. It is NOT equal total time, token count or FLOPs. Record all prompt/emitted tokens, request wall time (including context creation and JSON transfer), tool batch time including startup, per-call computation, controller time, and total collection time. Never advertise these as deployment speedups. All controllers use the same observed pool, even though cheap policies could avoid observation in deployment; show observer-off cost separately.

## Gates and stopping rule

Development checks that the fixed intervention repairs at least one error and improves exact accuracy by >=10 percentage points. If it fails, stop this protocol with a failed feasibility result; do not tune prompts and count the same development data as confirmation. If it passes, freeze code/source/data hashes and publish the protocol commit before the single confirmation run. No model/prompt/policy tuning after confirmation starts. All outcomes are reported.

Confirmation gates:

1. Information signal: tool-minus-base >=10 percentage points and lower paired 95% CI >0.
2. Context control: tool-minus-null AND tool-minus-shuffled each >=10 points with lower CI >0.
3. Geometry allocation: geometry-minus-entropy AND geometry-minus-task-type each >=5 points with lower CI >0. Both must pass; this is a conjunction, not selection of a favorable comparison.

Use 2,000 paired bootstrap draws, seed 90210, resampling sources with replacement within each family x task stratum. Recompute ranks and n/2 selections for each policy on every resample. Empirical endpoints are indices floor(.025*(B-1)) and floor(.975*(B-1)) of sorted deltas. These intervals concern the fixed synthetic family mixture, not new-model or real-world uncertainty. Treat a failed gate as lack of demonstrated benefit, not equivalence or universal falsification.

## Report-derived decisions and boundaries

The attached *Feasibility and Technical Plan for a CMB-Derived Modality in llama.cpp* recommends text/tool information-value tests before learned projection (pp.2,9,20), paired held-out evaluation and controls (pp.14-17), and end-to-end cost accounting (p.16). This study applies those recommendations at a narrow numerical-tool boundary.

Cosine movement between final-output states is a generic embedding feature. It is not CMB spherical harmonics, topology, curvature or a learned input modality. For short answers it is confounded by emitted category and EOS. Even a positive geometry gate supports only predictive tool allocation in this setting. A learned modality would still need a trained text-equivalent baseline, projector/LoRA controls, retention testing, real data and larger models. For the present exact numerical tasks, a deterministic tool can be the best solution without an LLM.
