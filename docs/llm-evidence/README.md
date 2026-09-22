# Recorded CPU engineering smoke

Run on 2026-09-22 with the model and runtime pinned in `manifest.json`.
Import `traces.jsonl` into the LLM observations panel to inspect all 36 records.
Run `python experiments/llm/verify_trace.py docs/llm-evidence` from the repository root to verify evidence hashes and vector calculations.

- Observation preserved the generated token sequence in all 12 paired cases.
- Ordinary, random, confidence, geometry and shuffled-geometry arms each scored 6/12.
- The retry action repaired zero cases and regressed zero cases. This action pool cannot demonstrate useful allocation.
- Controllers each received six extra attempts; time and token costs were not matched.
- Native tests, 84 application tests, four Python tests, lint and production build passed.
- Browser import, atomic rejection and astronomy separation passed with HeadlessChrome 131. The initial Chrome 153 launch failure is preserved separately.
- Independent checks covered 53 prediction positions with 896-dimensional signed vectors. Physical GPU execution was not tested.

`manifest.json` records hashes of collector sources and original evidence. `validation.json` records the remaining validation summary and implementation hashes. These are local execution receipts, not independently authenticated attestations. No accuracy improvement or general LLM enhancement is established.
