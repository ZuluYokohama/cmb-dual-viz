# CMB numerical-tool study: executed results

**Decision:** CMB numerical evidence helps this small model on the frozen synthetic tasks. Final-output drift adds no demonstrated accuracy benefit over entropy. Use the deterministic tool directly for these exact numerical questions; a learned modality remains untested.

The protocol and source/data hashes were published before confirmation at `a132a39ce99ac13f16af74032e0a44a163295529`. The 24-case development set passed the intervention feasibility gate (9/24 to 18/24). Confirmation used 96 independent pairs from four generator families excluded from development, one question per pair. There was no post-confirmation tuning.

## Confirmation results

| Arm | Correct | Accuracy |
|---|---:|---:|
| ordinary | 36/96 | 37.50% |
| observed | 36/96 | 37.50% |
| tool | 71/96 | 73.96% |
| null | 36/96 | 37.50% |
| shuffled | 36/96 | 37.50% |
| deterministic_tool | 96/96 | 100.00% |

Correct evidence repaired 36 answers and regressed one. Correct-tool minus ordinary: +36.46 percentage points; stratified paired bootstrap 95% CI [+29.17, +43.75]. Null and shuffled controls each scored 36/96; both predeclared context-control comparisons passed. Shuffled donors sometimes share the correct label; exact per-task agreement is retained in analysis.json.

## Allocation at a 48-call quota

| Policy | Correct | Additional tool-conditioned responses |
|---|---:|---:|
| random | 55/96 | 48 |
| entropy | 63/96 | 48 |
| length | 52/96 | 48 |
| task_type | 56/96 | 48 |
| geometry | 63/96 | 48 |
| shuffled_geometry | 60/96 | 48 |

Geometry minus entropy: 0 percentage points, empirical stratified-bootstrap interval [0, 0]. This is a conditional tie in this action pool, not evidence of general equivalence. Geometry minus task type: +7.29 points, CI [+3.125, +11.458]. The geometry gate required both comparisons to reach +5 points with positive lower intervals, so it **did not pass**. A favorable comparison does not override that rule.

The two policies selected 47 of the same 48 sources. Their exchanged cases had zero intervention gain. Independent inspection found differing selections in 1,292 bootstrap resamples, but every exchange again contributed zero score difference. All 96 initial answers were single tokens, so the length baseline reduced to the predefined source-ID tie break. These details restrict what the controls and zero-width interval can establish.

Intervals use 2,000 paired resamples with policy ranks and selections recomputed in each draw. Source-family and task mixture are fixed. One 0.5B model, one quantization and these synthetic fixtures cannot establish broad model capability or real-data generalization.

## Cost and practical decision

The direct tool answered 96/96. Numerical computation totaled 9.045 ms; its batch including startup took 134.11 ms. Ordinary LLM request time totaled 233.43 s, observed LLM time 314.67 s, and direct tool-conditioned LLM time 267.34 s. The shared observed initial pool plus selected second responses cost roughly 445-450 s per replay policy. These single-run diagnostics are not deployment speedups.

The imposed quota tests allocation; it does not mean rationing this inexpensive tool is economically sensible. Policies match call counts and response caps, not elapsed time, FLOPs or token cost. All policies pay for the observed pool here, although entropy/task-type policies could avoid representation collection in deployment. Runtime and token accounting are retained for every arm.

## Verification and provenance

- 96/96 observer-on/off emitted token sequences match.
- Independent audit: 96 sources, 480 raw traces, 192 signed vectors and all 2,000 bootstrap intervals verified.
- Maximum independent Pearson discrepancy: 5.55e-16; cosine drift discrepancy: 2.22e-16.
- 92 application tests, nine Python tests, lint and build passed. Existing native metrics tests were unchanged. Physical GPU execution was not tested.
- No model weights were trained or modified. CMB math is the existing ordinary lagged-Pearson calculation, not a newly validated geometric theory.
- Development began before an additional dataset-hash anchor was added; its independently reproduced labels and original evidence verify. The exact original development collector is retained as dev/collector-source.py and matches its recorded SHA-256. Confirmation required the anchor.

## What was applied from the supplied report

The supplied feasibility plan recommends tool/text signal tests first (pp.2,9,20), paired source-held-out evaluation and controls (pp.14-17), and total cost accounting (p.16). Those recommendations shaped this experiment. The learned encoder/projector + LoRA path was deferred because this study neither trains nor compares representations. A future modality must beat an equally trained text-equivalent baseline, survive ablations, preserve language capability, and retain gains after quantized deployment.

Literature context: [Toolformer](https://arxiv.org/abs/2302.04761) establishes tool learning as an existing research direction; this work uses frozen rules instead. [Huang et al.](https://arxiv.org/abs/2310.01798) examine limits of intrinsic self-correction without external feedback in their evaluated settings; the prior arithmetic retry failure was a reason to test computed evidence, not a universal impossibility result.

Next justified step: real-data tasks that require useful interpretation beyond copying an explicit statistic, a larger small model, a matched text baseline, and prospective cost accounting. There is no evidence here to justify a native CMB projector or a geometry controller as a production enhancement.

See [reproduction instructions](CMB_TOOL_STUDY.md), [frozen protocol](CMB_TOOL_STUDY_PROTOCOL.md), and [full evidence](cmb-study-evidence/).
