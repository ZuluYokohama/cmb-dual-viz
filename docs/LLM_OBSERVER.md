# LLM observation and allocation pilot

Status: engineering prototype. The native bridge runs a real GGUF model, exports signed final-output states and uncertainty, and supports observer-off comparisons. It does not retune weights or establish an LLM capability gain.

The first executed CPU smoke used the publisher's Qwen2.5-0.5B-Instruct Q4_K_M file from Hugging Face. Its exact revision, byte count and SHA-256 are in `experiments/llm/model.lock.json`. This small model is an engineering fixture, not the proposed production model or a frontier comparison.

## Implemented

- `bridge/llama_observer`: standalone C++ application linked to an unchanged, pinned llama.cpp checkout. No upstream fork or kernel patch.
- JSONL request/response protocol with a fresh inference context per request. Model loading is shared; KV state is not shared between cases.
- Actual model chat template, raw full-vocabulary entropy in nats at temperature 1 before sampling, top-two logit margin, signed final-output embedding, norm and consecutive-state cosine drift.
- `cmb.llm-trace/v1` envelope with model and prompt hashes; strict, separate TypeScript intake. Raw embeddings remain in the trace, not in the astronomy meaning map.
- An LLM observations panel with atomic import and a hashed ledger receipt. Structural validation does not authenticate an imported provenance assertion.
- Fixed-budget replay of random, confidence, geometry and shuffled-geometry allocation; correctness labels are excluded from selection.
- Native analytic metric tests, Python policy/scoring tests, TypeScript schema tests and an independent vector-reference check.

## Reproduce on Linux or WSL

Needs Git, a C++17 compiler, CMake >=3.20, Python >=3.10, Node >=20 and npm. The Python pipe timeout uses POSIX selectors; native Windows is not supported by this runner yet. Use a CPU build first. The GPU option exists but physical GPU behavior has not been validated.

From this repository:

```bash
git clone https://github.com/ggml-org/llama.cpp.git ../llama.cpp
git -C ../llama.cpp checkout 7ab4ee7baad2d920464cbacfad4f4b07cf111fd2
cmake -S bridge/llama_observer -B artifacts/llm-build \
  -DLLAMA_SOURCE_DIR="$(realpath ../llama.cpp)" \
  -DGGML_NATIVE=OFF -DGGML_OPENMP=OFF -DCMAKE_BUILD_TYPE=Release
cmake --build artifacts/llm-build --target cmb-llama-observer cmb-metrics-test -j 4
ctest --test-dir artifacts/llm-build --output-on-failure

python -m pip install huggingface_hub
hf download Qwen/Qwen2.5-0.5B-Instruct-GGUF \
  qwen2.5-0.5b-instruct-q4_k_m.gguf \
  --revision 9217f5db79a29953eb74d5343926648285ec7e67 \
  --local-dir ../cmb-models

python experiments/llm/pilot.py \
  --binary artifacts/llm-build/cmb-llama-observer \
  --model ../cmb-models/qwen2.5-0.5b-instruct-q4_k_m.gguf \
  --out artifacts/llm-runs/new-run
python experiments/llm/verify_trace.py artifacts/llm-runs/new-run
python -m unittest discover -s experiments/llm -p 'test_*.py' -v
npm ci
npm test
npm run lint
npm run build
```

Use a fresh output directory. The runner refuses a different model hash or size, and refuses a native bridge reporting the wrong llama.cpp revision. CMake also rejects a different dependency commit. There is no cloud job or paid service requirement. Do not add model weights or build outputs to git.

For browser verification after the build:

```bash
node scripts/check-llm-browser.mjs artifacts/llm-runs/new-run /absolute/path/to/chromium
```

Run `npm run dev`, then import the run's `traces.jsonl` in **LLM observations**. The older astronomy importer remains separate. Trace imports are capped at 20 MiB and 128 records. These limits bound display work, not model context capability.

## Experiment definition

The twelve original exact-answer fixtures comprise six additions and six multiplications. These are smoke inputs, not a held-out scientific benchmark. An answer passes only if the entire stripped completion is a single integer equal to the expected value. Extra text, multiple numbers and truncated reasoning fail that scoring rule.

Each case gets an ordinary greedy generation, the same generation with observation enabled, and a fresh-context retry that adds a fixed checking instruction. The observed/ordinary order alternates to reduce fixed warm-cache bias. The seed and decoding parameters are recorded. Loading and first-use warmup are separately retained; per-request times exclude loading.

The policy sees only the first observed answer's measurements. Its action is to replace that answer with the retry; it cannot use the correct-answer label to choose between them. Because these are final-answer measurements, this is a **post-answer** retry decision, not prediction before generation.

Confidence uses mean token entropy divided by log(vocabulary size). Geometry uses half that value plus half mean cosine drift divided by two. This is a fixed exploratory rule, not a trained or established correctness estimator. Missing drift is explicitly marked. The shuffled control permutes drift across cases with a fixed seed. Every controller allocates six extra attempts. The ordinary arm uses none.

All retry outputs are collected offline, then replayed for each policy. This matches extra-attempt counts, not wall time, FLOPs or actual token count. Reports include replay request time and processed-plus-emitted tokens. Replay excludes policy CPU time and does not constitute an end-to-end deployment benchmark. The whole offline collection uses more computation than an individual replay arm. A scientific comparison must execute policies under enforced resource budgets and include controller overhead.

## First result and interpretation

See `docs/llm-evidence/` for the recorded run and verification receipts.

| Check | Result |
|---|---|
| HF bytes match pinned identity | PASS |
| Observed vs ordinary generated token sequences | 12/12 identical |
| Native analytic checks | Uniform, binary-reference, additive-shift, extreme-logit and NaN-rejection cases pass |
| Independent vector checks | 53 observed prediction positions, including end-of-generation |
| Norm maximum absolute discrepancy | 3.41e-13 |
| Cosine-drift maximum absolute discrepancy | 1.78e-15 |
| Exact-answer accuracy | 6/12 for ordinary and every replay policy |
| Retry action diagnostic | 0 repaired, 0 regressed, 12 unchanged correctness outcomes |

The intervention did not repair a failed case, so no allocation policy could improve correctness using this action pool. Confidence and geometry selected the same cases. These observations establish neither an advantage nor a general impossibility for geometry-informed control. They specifically prevent claiming a gain from this smoke.

The model is small, the task pool is tiny, the policy is unfitted, and there is no test-family holdout. Timing is a diagnostic, not a speedup result. Raw embeddings/serialization and context creation are included in request wall time and can materially increase overhead. The narrow `observer_ms` excludes graph changes, serialization and context setup; never use it alone as the total observer tax.

## Boundaries and next experiment

Final-output states are the only representation captured. There is no intermediate-layer callback, activation steering, trained controller, quantization optimization, cache pruning or new language modality in this first increment. Model identity alone does not guarantee identical arithmetic across machines/backends. Importing a syntactically valid hash does not authenticate it.

Next, predefine a development set for finding an intervention with measurable recovery, then reserve separate task families for confirmation. Add a stronger compatible model through a separately reviewed lock, genuine verification actions, and learned intervention-value prediction. Compare geometry against entropy, length and other inexpensive features at enforced total budgets. Preserve no-op, shuffled-feature and observer-off controls. Do not tune on this smoke and rename it a held-out result.

This change is staged in CMB only. The dependency remains upstream llama.cpp; model weights remain with their publisher and local cache.
