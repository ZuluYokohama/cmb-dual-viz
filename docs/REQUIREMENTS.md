# Requirements — CMB Dual-Thread Engine

**Revision:** 2 (S0 freeze)  
**Class:** D-analogue research instrument (see `CLASSIFICATION.md`)

Shall / shall-not language follows NPR SWE-050 *mindset* (analogue), not a signed PE.

## 1. Epistemic spine (non-negotiable) — plan §2.3

| ID | Statement |
|----|-----------|
| REQ-E1 | Shall **not** auto-promote correlate or Smith outputs to PHYSICS-BACKED or OPEN. |
| REQ-E2 | Shall **not** present EXAMPLE \(C_\ell\) / synthetic series as measured Planck/GCP. |
| REQ-E3 | Shall **not** claim “NASA NPR compliant” (or equivalent) without signed classification. |
| REQ-E4 | Shall **not** ship a GPU path without CPU reference + ε gate. |
| REQ-E5 | Shall **not** fetch non-http(s) or unbounded URL bodies (proxy policy). |

## 2. Functional shalls

| ID | Statement |
|----|-----------|
| REQ-F1 | Shall synthesize CMB-like anisotropy from real \(Y_{\ell m}\) with EXAMPLE \(C_\ell\) and adaptive grid. |
| REQ-F2 | Shall provide Thread B coherence overlay with time scrub and null-control metrics. |
| REQ-F3 | Shall ingest local + URL (via proxy) into typed tensors with provenance + epistemic labels. |
| REQ-F4 | Shall build a meaning map (convergence geometry) of active sources. |
| REQ-F5 | Shall run correlate search with shuffle/null \(z_{\mathrm{toy}}\) and explicit RESEARCH/DERIVED tagging. |
| REQ-F6 | Shall expose Smith dial (Möbius Γ↔z) as DERIVED / RF-topology, not measured \(Z_0\). |
| REQ-F7 | Shall append Evidence Ledger records for ingest, correlate, and compute runs (JSONL). |
| REQ-F8 | Shall route Core+Instrument numerics through OpGraph / TensorRuntime with declared TP policies (CPU + optional WebGPU). |
| REQ-F9 | Default UX shall show Core + Instrument only; Ulam deferred unless `?analogy=1` or settings toggle. |

## 3. Assurance shalls (before G1 WebGPU)

| ID | Statement |
|----|-----------|
| REQ-A1 | Shall keep `CLASSIFICATION`, `REQUIREMENTS`, `ARCHITECTURE`, `HAZARDS`, `TEST_PLAN` current. |
| REQ-A2 | Shall provide unit + golden CPU tests for SH, correlates, Smith, and fabric parity. |
| REQ-A3 | Shall keep `tsc --noEmit` and eslint clean on the project gate. |
| REQ-A4 | Shall record a measured CPU perf baseline (not invented). |
| REQ-A5 | GPU ε-gate SHALL run before enabling WebGPU path; fail → CPU fallback (`EPS_SH_ABS`, `EPS_CORR_ABS`). |
| REQ-A6 | Every GPU Op SHALL declare exactly one primary TP policy; SH_SYNTH / CORRELATE_BATCH are G1. |

## 4. Shall-not (additional)

| ID | Statement |
|----|-----------|
| REQ-N1 | Shall not hide null / epistemic tags on correlate UI. |
| REQ-N2 | Shall not allocate GPU budget to Ulam / Thin layers. |
| REQ-N3 | Shall not treat EW/SDR “collective unconscious” rhetoric as product surface (docs-only analogy). |
