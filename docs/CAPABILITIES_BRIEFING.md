# CMB Dual-Thread Engine — Capabilities Briefing

**Instrument:** `/workspace/cmb-dual-viz`  
**Live:** `http://localhost:5173` (dev: `npm run dev` → `0.0.0.0:5173`)  
**Mode:** RESEARCH / exploratory Class D-*analogue* desktop instrument  
**Not:** OPEN claim surface · DFM algebra implementation · NASA-compliance certificate · proof of non-local effects

**Stack:** Vite + React + TypeScript + canvas · CPU OpGraph fabric · optional WebGPU (ε-gated) · Workers / OffscreenCanvas · Evidence Ledger · NPR-minded assurance docs

---

## One-line summary

Ingest allowed streams → embed on a meaning map → search correlates under nulls → optionally dress nodes by hand → watch multipole sky, coherence scrub, and Smith match-pull on one OpGraph fabric — with NASA-disciplined docs and hard epistemic brakes, without claiming discovery or compliance.

---

## 1. Operator capabilities

### Thread A — Harmonics (PHYSICS-BACKED / EXAMPLE)

- Synthesize a Mollweide sky from **real** \(Y_{\ell m}\) (associated Legendre / real spherical harmonics), not a stock image.
- Controls: **ℓ max**, **ℓ focus** (convergence), **map seed**, low-ℓ amplitude scales (ℓ=2…6), **Resynthesize**.
- Power spectrum panel: EXAMPLE acoustic-style \(C_\ell\) / \(D_\ell\) vs realized — toy/compressed peaks, **not Planck**.
- Soft magenta glow can project meaning-map sky clusters onto the same sky.

### Thread B — Coherence (METAPHOR / RESEARCH)

- Synthetic global coherence field overlay on the same Mollweide; opacity, seed, **time scrub** (`Space` play/pause when focus is not in an input).
- Metrics: spatial autocorr **score vs shuffle-null** (mean, σ, \(z_{\mathrm{toy}}\)).
- Explicit copy: toy intuition instrument — **not GCP = CMB**.

### Ingest (local + external)

- **Files / drag-drop / paste:** JSON, CSV/TSV, plain text/markdown → sky samples, series, claims, \(C_\ell\), \(a_{\ell m}\).
- **URL fetch:** Vite `GET /api/fetch?url=` — **http(s) only**, **5 MB** cap (CORS-safe proxy).
- Sample remotes under `public/samples/`.
- Provenance on every dataset; remote payloads stay **untrusted** until labeled — **never** auto-promoted to PHYSICS-BACKED.
- Enable / disable / remove sources; ingest log (accepted / residue / rejected).

### Meaning map (DERIVED)

- Active sources → nodes (ℓ-bin, coh, claim, sky, series, correlate) via PCA + force layout.
- Thread A/B **pull halos**; click → **Node inspector** (kind, epistemic, provenance, dressing).
- Optional sky-highlight feedback from selected clusters.

### Correlate search (RESEARCH / DERIVED)

- Seed from Thread A focus-ℓ power, Thread B coherence window, or any active source.
- Metrics: Pearson / lagged Pearson / Spearman / cosine; **shuffle null → \(z_{\mathrm{toy}}\)**.
- **Default path = IngestConverge OpGraph** (`INGEST_PARSE` → `EMBED_HASH` → `MEANING_LAYOUT` → `CORRELATE_BATCH` → `SMITH_MAP`).
- Escape hatch: `?correlateBypass=1` → one-shot `fabricCorrelate` (also used by tests).
- Heavy correlate on a **Worker** (transferable buffers) with main-thread fallback; UI shows `path: worker|main`.
- Click a hit → highlight nodes + drive Smith Γ; top hits → dashed correlate edges.
- Copy: high score ≠ OPEN.

### Smith dial (DERIVED / RF-TOPOLOGY)

- Real Möbius math: \(\Gamma = (z-1)/(z+1)\), constant-r / constant-x grid, MATCH at center, trail, transfer arcs.
- Live Γ from DERIVED \(z\) (focus-ℓ power, coherence, selected node, or correlate pair).
- Readouts: Re/Im Γ, |\Γ|, SWR(toy), r, x — all labeled DERIVED / **not measured \(Z_0\)**; not EW/SDR claims.

### Dressing checklist (RESEARCH motif)

- Per-node states: **bare → dressed_candidate → invariant_claim** (+ display-only **scaffolding** for EXAMPLE \(C_\ell\) / Thread A auxiliaries).
- Bulk: mark correlate hits as `dressed_candidate`.
- Bombelli motif in UI: intermediate scaffolding OK if controlled; **`invariant_claim` ≠ OPEN**.
- Every transition ledgered as `kind: dressing`.
- **Not** Dressing Field Method algebra, Lean formalization, or auto promotion to PHYSICS-BACKED / OPEN.  
  See `docs/DRESSING_CHECKLIST.md`.

### Perf / scale (G2–G3)

- **PerfPanel:** graph pattern (SkyFrame / IngestConverge / Scrub), device, wall ms, per-op TP policy + shard counts + fuse tags.
- **SkyFrame worker** + OffscreenCanvas blit for SH + COH + PROJECT off the main thread.
- **DEMO dual-logical TP:** shard across WebGPU+CPU (or logical queues) with placement labels — correctness/API demo, **not** a speedup claim.
- **Hardware gate:** this development box typically exposes **SwiftShader** software WebGPU — UI states that; **no invented ≥2× claim**.

### Thin / optional

- Ulam / prime spiral: **hidden** unless `?analogy=1` or Controls → “Show Ulam analogy panel” — geometric analogy only.

---

## 2. Layer cut (Rev 2)

| Cut | Layers | Default UX |
|-----|--------|------------|
| **Core** | Substrate/law, SH harmonics, ingest, meaning map, correlates, Evidence Ledger | Always on |
| **Instrument** | Coherence overlay, Smith dial, Dressing checklist | Always on (coupled to Core) |
| **Thin** | Ulam spiral | Off by default |

**Engine shell (≈1280×800):** Sky | Meaning + Correlates | Smith | Ingest / Controls | Thin (optional).

---

## 3. Epistemic labels

| Layer | Label | Meaning |
|-------|--------|---------|
| Multipole synthesis / \(Y_{\ell m}\) | **PHYSICS-BACKED** | Real Y_lm math |
| Acoustic-peak style \(C_\ell\) | **PHYSICS-BACKED (EXAMPLE)** | Toy peaks — not Planck |
| Coherence field + z-score | **METAPHOR / RESEARCH** | Exploratory; not GCP = CMB |
| Synthetic GCP-like series | **METAPHOR / RESEARCH** | Not GCP data |
| Ingested claims / CSV / JSON / URL | **DERIVED / MEANING-MAP** | Convergence geometry for intuition |
| Smith Γ↔z mapping | **RF math real; z mapping DERIVED** | Not measured Z₀ |
| Correlate search | **RESEARCH / DERIVED** | Candidates under toy null — ≠ OPEN |
| Dressing states | **RESEARCH** | Human tags; invariant_claim ≠ OPEN |
| Ulam (Thin) | **Geometric analogy** | Visual metaphor only |

**Propagation:** `out.epistemic = strictest(inputs, op.ceiling)`.

**Never** present fake citations or invented “measured” Planck/GCP numbers as real.

---

## 4. Compute fabric

Hierarchy: **OpGraph → Op → Shard**.

### TP policies

| Policy | Axis | Typical ops |
|--------|------|-------------|
| `TP_ELL_BAND` | ℓ bands | `SH_SYNTH` |
| `TP_PIX_TILE` | sky tiles | `COH_FIELD`, `PROJECT_MOLLWEIDE` |
| `TP_PAIR_BLOCK` | (i,j) blocks | `CORRELATE_BATCH` |
| `TP_LAG_SLICE` | lag ranges | nested in correlate |
| `TP_DOC_BATCH` | documents | `EMBED_HASH`, ingest parse |
| `TP_NONE` | single | `SMITH_MAP`, ledger, layout |

### Canonical ops

`INGEST_PARSE`, `SH_SYNTH`, `COH_FIELD`, `PROJECT_MOLLWEIDE`, `EMBED_HASH`, `MEANING_LAYOUT`, `CORRELATE_BATCH`, `SMITH_MAP`, `LEDGER_APPEND`.

### Fused graphs

| Graph | Pipeline |
|-------|----------|
| **SkyFrame** | `SH_SYNTH` → `COH_FIELD` → `PROJECT_MOLLWEIDE` |
| **IngestConverge** | ingest → embed → layout → correlate → smith |
| **Scrub** | `COH_FIELD` + `SMITH_MAP` only (no SH resynth unless seed/ℓ changed) |

### Devices

- **CPU** always available (`src/compute/cpuRuntime.ts`).
- **WebGPU** for `SH_SYNTH` + `CORRELATE_BATCH` when feature-detect **and** ε-gate pass; else automatic CPU fallback.
- Measured ε (typical): SH abs ε ≈ 0.75 (f32 WGSL vs f64 CPU); correlate abs ε ≈ 5e-4.
- **Workers:** SkyFrame + correlate off-main-thread with transferable buffers.

Module map: `src/compute/` (types, fabric, webgpu/, worker/, multiDevice/, ledger, measurements, graphs).

---

## 5. Evidence Ledger

Append-only events: ingest, correlate scans, compute runs, dressing transitions, perf measurements — each with epistemic tags and timing when available.

- Browser: in-memory ring (+ optional download).
- Node/scripts: `artifacts/ledger/*.jsonl`.

---

## 6. Assurance & standards posture

| Field | Value |
|-------|--------|
| NPR 7150.2 analogue | **Class D-analogue** (research desktop; loss → wasted analyst time, not vehicle/crew harm) |
| Escalation | If outputs **authorize** OPEN / funding / safety → reclassify toward **Class C-analogue**, independent eval, freeze kernels |
| Forbidden | “NASA compliant” / NPR-compliant marketing without a **named human** signed assessment |
| Standards hub (context) | [NASA software engineering resources](https://www.nasa.gov/intelligent-systems-division/software-management-office/nasa-software-engineering-procedural-requirements-standards-and-related-resources/) |

### Docs pack

| Doc | Role |
|-----|------|
| `docs/CLASSIFICATION.md` | Class D-analogue + escalation |
| `docs/REQUIREMENTS.md` | Shall / shall-not + epistemic spine |
| `docs/ARCHITECTURE.md` | Engine shell, OpGraph, ledger, proxy, G3 |
| `docs/HAZARDS.md` | \(z_{\mathrm{toy}}\) misuse, SSRF, GPU-wrongness |
| `docs/TEST_PLAN.md` | Unit, golden CPU, null-control; GPU ε |
| `docs/PEER_REVIEW_KERNELS.md` | Kernel review checklist |
| `docs/PERF_BASELINE.md` | Measured timings |
| `docs/GPU_TENSOR_PARALLEL_PLAN.md` | Rev 2 phase plan (S0–G3) |
| `docs/DRESSING_CHECKLIST.md` | Dressing states + motif bounds |
| `docs/CAPABILITIES_BRIEFING.md` | This briefing |

### Hazards called out

Misreading \(z_{\mathrm{toy}}\) as discovery; URL SSRF / oversized payloads; GPU numerical drift (mitigated by ε-gate + CPU fallback).

### Verification commands

```bash
cd /workspace/cmb-dual-viz
npm test
npm run lint
npm run build
npm run dev
```

---

## 7. Fit vs non-fit (research use)

### Strong fit

- Keep bare scaffolding visible while hunting relational structure (correlates + meaning map).
- Refuse silent promotion (dressing + ledger + null controls).
- Shared multipole “carrier” geometry + mismatch→match dial as **instruments**, not ontology.
- External data on the same substrate without laundering into PHYSICS-BACKED.
- Operational cousin of Cardano–Bombelli / relational-gauge *verification scaffolding* (not ontology invention).

### Weak / not fit

- Implementing or verifying Dressing Field Method (needs Lean / typed algebra).
- Inventing that manifold \(M\) is fiction (human ontological leap; not gradient descent).
- Flight / ops decision support without class escalation.
- Real multi-GPU speedups on SwiftShader-only hosts.
- Backlog: FITS/HEALPix, sky-bin spatial correlates, CUDA multi-node, formal IV&V.

---

## 8. Typical loop

1. Ingest URL, file, or paste (or load samples).  
2. Scan correlates (IngestConverge default).  
3. Click hits → meaning-map highlight + Smith Γ.  
4. Tag dressing states; review ledger / PerfPanel.  
5. Resynthesize sky / scrub coherence as needed — without promoting tags.

---

## 9. Screenshots (artifacts)

- `artifacts/cmb-s3-cpu-fabric.png` — S3 CPU fabric gate  
- `artifacts/cmb-g1-webgpu.png` — G1 WebGPU + ε badges  
- `artifacts/cmb-g2-fusion.png` — G2 fusion + PerfPanel  
- `artifacts/cmb-g3-scale.png` — G3 scale / hardware gate  
- `artifacts/cmb-residue-closed.png` — IngestConverge default + worker correlate  
- `artifacts/cmb-dressing-checklist.png` — Dressing checklist panel  

---

*Briefing generated for sharing. Keep epistemic caution; toy educational / research-intuition instrument.*
