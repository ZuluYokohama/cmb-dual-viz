# CMB numerical tool and allocation study

This experiment uses the repository's actual `bestLaggedPearson` calculation as external evidence for a pinned Qwen2.5-0.5B-Instruct model served by the native llama.cpp bridge. It separately tests whether final-state cosine drift helps allocate a fixed quota of tool-assisted second answers.

The protocol and immutable dataset were published before confirmation in commit `a132a39ce99ac13f16af74032e0a44a163295529`. See [the frozen protocol](CMB_TOOL_STUDY_PROTOCOL.md) for hypotheses, exact policies, controls, gates, and limits. See [the results](CMB_TOOL_STUDY_RESULTS.md) for the executed findings. The initial arithmetic smoke is preserved separately in [LLM_OBSERVER.md](LLM_OBSERVER.md).

For new measured-series work, use the [separate v2 tool](MEASURED_SERIES_TOOL.md). The v1 implementation below is retained for frozen-study reproduction and has documented constant-input and large-offset numerical limitations outside the audited fixtures.

## Run the numerical tool

After `npm ci`, stream JSONL requests to:

```bash
node scripts/cmb-series-tool.mjs < queries.jsonl > measurements.jsonl
```

Each request has exactly `schema`, `id`, `origin`, `a`, `b`, and `max_lag`. Schema is `cmb.series-query/v1`; origin must be `synthetic`. Both arrays must be finite, equal length (12-64 samples), already aligned, with defined variance at every requested lag. Max lag is an integer 0-8 and at most floor(length/3). Example shape:

```json
{"schema":"cmb.series-query/v1","id":"example","origin":"synthetic","a":[2,-1,4,0,8,-4,1,6,-2,5,9,3],"b":[11,-12,2,-1,4,0,8,-4,1,6,-2,5],"max_lag":4}
```

The CLI returns the best signed correlation, lag, zero-lag correlation, categorical statistics, computation time, and SHA-256 of the input JSON bytes (excluding line separator). Input is bounded to 1 MiB per line; malformed input fails closed. The origin declaration is a caller assertion, not independent source authentication.

This is a narrow research interface over existing math. It performs no resampling, model execution, remote retrieval or generated-code execution. Correlation does not establish causality.

## Reproduce the study

First build the observer and download the exact model as documented in [LLM_OBSERVER.md](LLM_OBSERVER.md). Use Python 3.11 or newer for the independent auditor. Then, from the repository root:

```bash
python -m unittest discover -s experiments/llm -p 'test_*.py' -v
python experiments/llm/cmb_study.py run \
  --data docs/cmb-study-evidence/dataset \
  --out artifacts/llm-runs/reproduction-dev --split dev \
  --binary artifacts/llm-build/cmb-llama-observer \
  --model ../cmb-models/qwen2.5-0.5b-instruct-q4_k_m.gguf \
  --protocol docs/CMB_TOOL_STUDY_PROTOCOL.md
python experiments/llm/cmb_study.py analyze \
  --data docs/cmb-study-evidence/dataset \
  --run artifacts/llm-runs/reproduction-dev
```

For the frozen confirmation, use `--split test` and a fresh output directory. There are 24 development and 96 confirmation examples, each with five model requests; all are CPU-only. No cloud job is required. Do not change the model, prompts, features or policies and call it a reproduction of the frozen study. Different hardware may change timing and numerical behavior; recheck token parity.

The collector never opens the answer-key file. It computes tool measurements from the public raw input, validates the tool against independent Python numerical reductions, and stores all blinded policy choices. The later analyzer opens the separate key. Dataset and evidence hashes prevent silently replacing inputs/labels in confirmation.

## Verify preserved evidence

```bash
python experiments/llm/audit_cmb_study.py \
  --data docs/cmb-study-evidence/dataset \
  --run docs/cmb-study-evidence/test \
  --out artifacts/llm-runs/confirmation-audit.json
```

The auditor imports none of the collector's/scorer's functions. It derives labels with 60-digit Decimal raw moments, recomputes vector norms/cosine drift, compares recorded predictions, reconstructs all policy selections, and independently reproduces all bootstrap intervals. It verifies compressed trace and log hashes before analyzing them.

The raw evidence includes signed vectors and prompts in `traces.jsonl.gz`. Decompress before importing subsets into the existing LLM observations panel (128-record, 20-MiB limit). The complete five-arm confirmation contains 480 records and should not be imported as one batch.

## Interpret within scope

A correct tool summary contains the statistic needed to answer the question; deterministic tool-only accuracy is therefore essential. Improvements show numerical-tool integration, not novel mathematics, trained semantic representations or general model enhancement. Cosine drift is a generic output-state feature, not spherical harmonic structure. The report's proposed learned input modality remains a separate, untested hypothesis.

Policy comparisons enforce equal call quotas and response caps, not equal actual time/FLOPs/tokens. Offline replay shares collected outputs and does not measure a live adaptive service. Raw response times and the observer-off arm expose overhead; cheap policies need not pay the full observation cost in deployment. No speedup claim follows from this run.
