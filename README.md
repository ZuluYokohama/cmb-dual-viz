# CMB Dual-Thread Engine

Interactive **RESEARCH** instrument (Class D-analogue): CMB-like anisotropy from real spherical harmonics (**Core / Thread A**) plus a synthetic coherence overlay (**Instrument / Thread B**), with multi-source **ingestion (local + URL) → meaning-map → correlate search**, a **Smith chart** mismatch→match dial, and a **Dressing checklist** (RESEARCH motif).

Dark cosmic UI · Mollweide canvas · PCA/force meaning map · Vite + React + TypeScript · **CPU + optional WebGPU** compute fabric (OpGraph). G1: `SH_SYNTH` / `CORRELATE_BATCH` with ε-gate + CPU fallback. G2: SkyFrame / IngestConverge fusion + measurements. G3: Worker/Offscreen + multi-device API (DEMO dual-logical; hardware gate — no invented ≥2× on SwiftShader). Post-G3 residue: IngestConverge default scan + correlate Worker + full OpGraph dispatch.

> **Mode: RESEARCH / exploratory.** Never certifies OPEN claims. Meaning map / correlates / Smith z-mapping are intuition instruments — not proof of non-local effects.  
> **Not “NASA compliant.”** Honest NPR Class D-*analogue* only; see `docs/CLASSIFICATION.md`.

## Run

```bash
cd /workspace/cmb-dual-viz
npm install
npm run dev
# binds 0.0.0.0:5173 by default (see vite.config.ts)
```

```bash
npm test          # unit + golden CPU + fabric parity
npm run lint      # eslint
npm run build     # tsc --noEmit && vite build
npm run preview
```

## Layer cut (Rev 2)

| Cut | Layers | Default UX |
|-----|--------|------------|
| **Core** | Substrate, SH harmonics, ingest, meaning map, correlates, Evidence Ledger | Always on |
| **Instrument** | Coherence overlay, Smith dial, Dressing checklist (RESEARCH) | Always on (coupled to Core) |
| **Thin** | Ulam / prime spiral | **Hidden** unless `?analogy=1` or Controls → “Show Ulam analogy panel” |

### Engine shell layout (≈1280×800)

| Region | Content |
|--------|---------|
| Sky | Mollweide + optional coherence overlay |
| Meaning + Correlates | Meaning map + correlate search |
| Smith | Möbius dial, trail, transfer arcs |
| Ingest / Controls | Thread A/B controls, inspector, URL+file ingest |
| Thin (optional) | Ulam |

**Keyboard:** `Space` — play/pause coherence time scrub (when focus is not in an input).

---

## Epistemic labels

| Layer | Label | Meaning |
|-------|--------|---------|
| Multipole synthesis / \(Y_\ell^m\) | **PHYSICS-BACKED** | Real associated-Legendre / real Y_lm math |
| Acoustic-peak style \(C_\ell\) | **PHYSICS-BACKED (EXAMPLE)** | Toy compressed peaks — **not** Planck |
| Coherence field + z-score | **METAPHOR/RESEARCH** | Exploratory overlay; **not** GCP = CMB |
| Synthetic GCP-like series | **METAPHOR/RESEARCH** | Random AR process — not GCP data |
| Ingested claims / CSV / JSON / URL | **DERIVED/MEANING-MAP** | Convergence geometry for intuition |
| Smith chart Möbius Γ↔z | **RF math real; z mapping DERIVED** | Not measured Z₀; not EW/SDR claims |
| Correlate search | **RESEARCH/DERIVED** | Candidates under toy null — high score ≠ OPEN |
| Ulam spiral (Thin) | **Geometric analogy** | Visual metaphor only |

**Never present fake citations or invented “measured” GCP/Planck numbers as real.** Remote URL payloads stay untrusted until labeled — never auto-promoted to PHYSICS-BACKED.

---

## Compute fabric (S2 + G1–G3)

```
OpGraph → Op → Shard
src/compute/types.ts       TPPolicy, OpDesc, OpGraph, epistemic tags
src/compute/cpuRuntime.ts  CPU backend
src/compute/fabric.ts      Hybrid fabric (WebGPU when ε-gate passes)
src/compute/webgpu/        WGSL kernels, device probe, ε-gate
src/compute/ledger.ts      Evidence Ledger (in-memory + JSONL via scripts)
```

Ops declare a primary TP policy (`TP_ELL_BAND`, `TP_PIX_TILE`, `TP_PAIR_BLOCK`, `TP_LAG_SLICE`, `TP_DOC_BATCH`, `TP_NONE`). **`SMITH_MAP` stays `TP_NONE`.** WebGPU (G1) for `SH_SYNTH` + `CORRELATE_BATCH` when available and ε-gate passes — see `src/compute/webgpu/README.md`.

---

## Evidence Ledger (S3)

Append-only records for ingest, correlate, compute, and dressing transitions (epistemic tags + ms). Browser keeps an in-memory ring; Node tests/scripts write `artifacts/ledger/*.jsonl`.

---

## External ingestion (URL)

For checked new-data intake, use [Data staging](docs/DATA_STAGING.md): `npm run stage:data` accepts a versioned envelope or explicitly mapped JSONL, preserves provenance and hashes, and checks the CPU downstream route. `npm run vv` runs the reproducible software gate. See [the review and full V&V roster](docs/VV_REVIEW.md) for remaining source, inference, GPU, and proxy validation.

[Executed Hugging Face validation](docs/HF_VALIDATION.md): Planck SZ catalog + SILSO 2019 intake, independent numerical references, CPU browser checks, and a retained source-metadata failure. Importable samples: `public/samples/hf/`.

`GET /api/fetch?url=<encoded http(s) URL>` — Vite plugin proxy: **http/https only**, **5 MB** cap. Same-origin samples under `public/samples/` exercise the pipeline.

---

## Docs (S0 assurance pack)

| Doc | Role |
|-----|------|
| `docs/CLASSIFICATION.md` | Class D-analogue + escalation |
| `docs/REQUIREMENTS.md` | Shall / shall-not + epistemic spine |
| `docs/ARCHITECTURE.md` | Engine shell, OpGraph, ledger, proxy |
| `docs/HAZARDS.md` | z_toy misuse, SSRF, GPU-wrongness (GPU N/A) |
| `docs/TEST_PLAN.md` | Unit, golden CPU, null-control; GPU ε reserved |
| `docs/PEER_REVIEW_KERNELS.md` | G1 filled for SH_SYNTH + CORRELATE_BATCH |
| `docs/GPU_TENSOR_PARALLEL_PLAN.md` | Rev 2 phase plan |
| `docs/PERF_BASELINE.md` | Measured CPU timings |
| `docs/DRESSING_CHECKLIST.md` | Dressing states + Bombelli/DFM motif (no Lean/DFM impl) |
| `docs/CAPABILITIES_BRIEFING.md` | Operator capabilities briefing (shareable) |


## Landing

GitHub Pages–ready cosmic landing (static HTML/CSS/JS, no React build):

- **`site/`** — `index.html` · `styles.css` · `app.js`
- Enable Pages: **Settings → Pages → Deploy from branch `main` / folder `/site`**
- See [`site/README.md`](./site/README.md) for local preview and link notes.

## Screenshots

- `artifacts/cmb-s3-cpu-fabric.png` — S3 CPU fabric gate
- `artifacts/cmb-smith-v3.png` — prior Smith + correlates
- `artifacts/cmb-dressing-checklist.png` — Dressing checklist RESEARCH panel

## License

**Zulu Research-Only License** — see [`LICENSE`](./LICENSE) (`SPDX-License-Identifier: LicenseRef-Zulu-Research-Only`).

Non-commercial research, academic, educational, and personal evaluative use only. Commercial use requires a separate written license from ZuluYokohama.

**Caution:** Toy educational / RESEARCH-intuition instrument (Class D-analogue). Does not certify OPEN claims, does not claim NASA compliance, and does not present EXAMPLE / synthetic streams as measured Planck or GCP data. Use at your own epistemic caution.
