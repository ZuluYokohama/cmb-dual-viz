# CMB Dual-Thread Engine — Layer Integration & GPU / Tensor-Parallel Plan

**Revision:** 2 (pre-implementation; user-directed revise)  
**Status:** S0–S3 COMPLETED; **G1 WebGPU IMPLEMENTED** (2026-09-19 CT) — **G2 fusion+measurements IMPLEMENTED** (2026-09-19 CT) — **G3 optional scale IMPLEMENTED** (2026-09-19 CT)  
**Mode:** RESEARCH (exploratory instrument). Not flight software. Not an OPEN claim surface.  
**Repo path:** `/workspace/cmb-dual-viz`  
**Standards hub:** https://www.nasa.gov/intelligent-systems-division/software-management-office/nasa-software-engineering-procedural-requirements-standards-and-related-resources/

Primary refs: **NPR 7150.2D**, **NASA-STD-8739.8**, **NASA-HDBK-2203 (SWEHB)**

---

## 0. What changed in Rev 2

| Area | Rev 1 | Rev 2 |
|------|-------|-------|
| Value layers | Flat L0–L7 keep-list | **Core / Instrument / Control / Thin** cut with merge rules |
| Sharding / op graph | Op list + loose shard table | **3-level hierarchy** (Graph → Op → Shard) + named shard policies + fusion/epistemic propagation rules |
| NASA depth | Light E/F-analogue | **Class D-analogue research tool** with mandatory assurance pack *before* GPU kernels; upgrade path to C if decision-support |
| Phases | Fabric → GPU → graphs → multi-device → assurance | **Standards freeze → layer freeze → CPU fabric → assurance gate → WebGPU → graph fusion → optional TP scale** |

Device target (WebGPU vs CUDA) left as in Rev 1 default (WebGPU-first, CUDA optional) — not in this revise set.

---

## 1. Value-adding layers (revised cut)

### 1.1 Core (must ship; on the Compute Fabric hot path)

| ID | Layer | Role | Epistemic |
|----|-------|------|-----------|
| C0 | Substrate / law | Labels, shall-nots, null controls, size caps, provenance schema | LAW / RESTRICT |
| C1 | Thread A Harmonics | \(Y_{\ell m}\) → Mollweide + EXAMPLE \(C_\ell\) | PHYSICS-BACKED (EXAMPLE) |
| C2 | Ingest | Local + URL proxy → typed tensors + provenance | DERIVED (untrusted until labeled) |
| C3 | Meaning map | Convergence geometry of active sources | DERIVED |
| C4 | Correlate search | Ranked correlates + shuffle/null \(z_{\mathrm{toy}}\) | RESEARCH / DERIVED |
| C5 | Evidence Ledger | Append-only ingest/correlate/compute run records | ASSURANCE |

### 1.2 Instrument (value-adding; coupled to Core, not optional forever)

| ID | Layer | Role | Epistemic | Coupling |
|----|-------|------|-----------|----------|
| I1 | Thread B Coherence | Overlay + time scrub + null | METAPHOR / RESEARCH | Feeds correlate seeds + Smith \(x\) |
| I2 | Smith dial | Möbius \(\Gamma\leftrightarrow z\), trail, match-pull | DERIVED / RF-TOPOLOGY | Reads C1/C4/I1; **not** a parallel science claim |

**Merge rule:** I1 is not a second universe — it is a **background instrument** on the same substrate as C1. UI may still show “Thread B,” but compute treats coherence as an op family beside SH, not a fork of truth.

### 1.3 Thin / deferred (not value-adding for TP work)

| Item | Disposition |
|------|-------------|
| Ulam / prime spiral | **Deferred from Engine UX** (optional `?analogy=1`); zero GPU budget |
| EW/SDR / “collective unconscious” rhetoric from Smith PDF | **Docs-only analogy**; never product surface |
| Sky-bin spatial correlates | Residue backlog |
| FITS / HEALPix native | Residue until ingest demand |
| Multi-node CUDA TP | Stretch after single-device WebGPU proven |

### 1.4 Integrate means (Rev 2)

One **OpGraph** over Core+Instrument numerics, one **Evidence Ledger**, one **Engine shell** (Sky | Meaning+Correlates | Smith | Ingest/Controls). No orphan panels on the default path.

---

## 2. NASA adherence depth & classification (revised)

### 2.1 Classification decision (honest analogue)

| Field | Value |
|-------|--------|
| NPR 7150.2 analogue class | **Class D-analogue** — “science/research desktop instrument; loss → wasted analyst time, not vehicle/crew harm” |
| Not | Class A/B/C flight or GNC; not safety-critical |
| Escalation trigger | If outputs are used to **authorize** operational OPEN, funding, or safety decisions → reclassify toward **Class C-analogue**, add independent evaluation, freeze kernels, formal test PE |
| Compliance claim | **Forbidden** until a named human signs a real class assessment against NPR + 8739.8 |

Rationale for D vs E/F: we ingest external URLs, run correlate search that can *look* like evidence, and expose match-pull UI — that warrants **more** assurance than a pure demo (E/F), but not flight rigor.

### 2.2 Assurance depth (mandatory pack before GPU kernels)

Aligned to NPR lifecycle themes + NASA-STD-8739.8 *mindset* (assurance ≠ rubber stamp):

| Artifact | Required before Phase G (WebGPU) | SWE / assurance theme |
|----------|----------------------------------|------------------------|
| `docs/CLASSIFICATION.md` | Yes | App. D class + escalation triggers |
| `docs/REQUIREMENTS.md` | Yes | SWE-050-style shall / shall-not (esp. epistemic) |
| `docs/ARCHITECTURE.md` | Yes | Structure, qualities, external interfaces (proxy, GPU) |
| `docs/TEST_PLAN.md` | Yes | Unit, golden CPU, null-control, GPU ε |
| `docs/HAZARDS.md` | Yes (lite) | Misuse: treating \(z_{\mathrm{toy}}\) as discovery; URL SSRF; GPU wrongness |
| `docs/CHANGELOG.md` + ledger | Yes | CM / measurements trail |
| Peer-review checklist for kernels | Yes | NPR peer review theme |
| Static analysis (`tsc`, eslint) | Yes | SWE static analysis theme |
| Independent IV&V | **No** at D-analogue | Escalate with class |

### 2.3 Shall-not spine (non-negotiable)

1. Shall not auto-promote correlate or Smith outputs to PHYSICS-BACKED or OPEN.  
2. Shall not present EXAMPLE \(C_\ell\) / synthetic series as measured Planck/GCP.  
3. Shall not claim “NASA NPR compliant” without signed classification.  
4. Shall not ship GPU path without CPU reference + ε gate.  
5. Shall not fetch non-http(s) or unbounded URL bodies (proxy policy).

---

## 3. Tensor-parallel sharding model & higher-order op graph (revised)

### 3.1 Three-level hierarchy

```
OpGraph          # scheduled unit of work (one user action or ingest batch)
  └─ Op            # typed tensor transform (SH_SYNTH, CORRELATE_BATCH, …)
       └─ Shard    # parallel unit with explicit axis + reduce
```

**Higher-order abstraction** = the **OpGraph**: fusion, epistemic tag propagation, device placement, and ledger hooks — not “call WGSL from React.”

### 3.2 Named shard policies (tensor-parallel axes)

| Policy ID | Axis | Used by | Reduce |
|-----------|------|---------|--------|
| `TP_ELL_BAND` | contiguous ℓ bands | `SH_SYNTH`, band power | sum into sky / \(D_\ell\) |
| `TP_PIX_TILE` | equal-area or equirect tiles | `SH_ACCUM`, `COH_FIELD` | sum/mean per pixel |
| `TP_PAIR_BLOCK` | blocks of (i,j) pairs | `CORRELATE_BATCH` | write scores; argmax optional |
| `TP_LAG_SLICE` | lag index ranges | lagged Pearson | max \|r\| per pair |
| `TP_DOC_BATCH` | document batches | `EMBED_HASH` | concat |
| `TP_NONE` | single shard | `SMITH_MAP`, layout tick | — |

**Rule:** every GPU Op **declares exactly one primary TP policy** in its descriptor. Secondary axis (e.g. lag inside pair-block) is nested, documented, and deterministic.

### 3.3 Canonical Op set (Core + Instrument)

| Op | In | Out | Primary TP | Device preference |
|----|----|-----|------------|-------------------|
| `INGEST_PARSE` | bytes | Feature tensors + provenance | `TP_NONE` / `TP_DOC_BATCH` | CPU |
| `SH_SYNTH` | \(a_{\ell m}\), grid | `sky[θ,φ]` | `TP_ELL_BAND` then `TP_PIX_TILE` | GPU |
| `COH_FIELD` | seed, t | `coh[θ,φ]` | `TP_PIX_TILE` | GPU |
| `PROJECT_MOLLWEIDE` | sky | rgba | `TP_PIX_TILE` | GPU/CPU |
| `EMBED_HASH` | claims | `V[n,d]` | `TP_DOC_BATCH` | CPU→GPU later |
| `MEANING_LAYOUT` | V, edges | `xy[n]` | `TP_NONE` | CPU |
| `CORRELATE_BATCH` | `X[n,t]` | scores, \(z_{\mathrm{null}}\) | `TP_PAIR_BLOCK` (+ `TP_LAG_SLICE`) | GPU |
| `SMITH_MAP` | derived z | Γ, SWR_toy | `TP_NONE` | CPU |
| `LEDGER_APPEND` | run meta | jsonl record | `TP_NONE` | CPU |

### 3.4 OpGraph patterns (fusion)

1. **SkyFrame graph:** `SH_SYNTH` → (`COH_FIELD` optional) → `PROJECT_MOLLWEIDE`  
2. **IngestConverge graph:** `INGEST_PARSE` → `EMBED_HASH` → `MEANING_LAYOUT` → `CORRELATE_BATCH` → `SMITH_MAP`  
3. **Scrub graph:** time param invalidates `COH_FIELD` + `SMITH_MAP` trail only (do not resynth SH unless seed/ℓ changed)

**Epistemic propagation:** `out.epistemic = strictest(in.epistemics, op.ceiling)`. Example: correlate over PHYSICS_EXAMPLE × METAPHOR → RESEARCH. Ledger stores the tag.

**Determinism:** fixed seeds; ordered reductions; GPU path must pass `|gpu - cpu| ≤ ε` on golden shapes before enablement.

### 3.5 Interface sketch (Rev 2)

```ts
type TPPolicy =
  | 'TP_ELL_BAND' | 'TP_PIX_TILE' | 'TP_PAIR_BLOCK'
  | 'TP_LAG_SLICE' | 'TP_DOC_BATCH' | 'TP_NONE';

interface OpDesc {
  name: string;
  tp: TPPolicy;
  epistemicCeiling: Epistemic;
  cpuRefRequired: boolean; // true for SH_SYNTH, CORRELATE_BATCH on GPU
}

interface OpGraph {
  id: string;
  ops: OpNode[];          // DAG
  fuse?: FuseHint[];      // e.g. SH_SYNTH+PROJECT
  ledger: boolean;        // default true for ingest/correlate
}
```

---

## 4. Phase order, gates, and success criteria (revised)

### 4.1 Phases (reorder)

| Phase | Name | Work | Exit gate (must pass) |
|-------|------|------|------------------------|
| **S0** | Standards freeze | CLASSIFICATION, REQUIREMENTS, ARCHITECTURE, HAZARDS, TEST_PLAN skeletons | Peer self-review checklist checked; shall-not spine present |
| **S1** | Layer freeze | Apply Core/Instrument/Thin cut in UX (hide Ulam by default); single Engine shell | Default UX shows only value layers; README matches cut |
| **S2** | CPU Compute Fabric | `TensorRuntime` CPU; route SH + correlates + coherence through OpGraph API (behavior parity) | Golden vectors bit-match pre-fabric; unit tests green |
| **S3** | Assurance gate | Ledger JSONL; null-control tests; eslint/tsc; CPU perf baseline recorded | TEST_PLAN items for CPU checked; hazard misuse cases have tests or UI copy |
| **G1** | WebGPU TP (single device) | `SH_SYNTH` + `CORRELATE_BATCH` under named TP policies; feature detect + fallback | ε-gate vs CPU on goldens; fallback works with GPU blocked |
| **G2** | Graph fusion + measurements | SkyFrame + IngestConverge fusion; ms/op, shard counts in UI/ledger | **DONE** Measurements visible; no epistemic regression |
| **G3** | Optional scale | Worker/Offscreen; API-ready multi-device TP + DEMO dual-logical (SwiftShader box) | **DONE** — HW gate honest; no invented ×speedup |

**Removed from critical path:** “assurance last.” Assurance is **S0+S3 before G1**.

### 4.2 Success criteria (Rev 2)

**Plan / process**
- [ ] Rev 2 accepted by user (this doc) before any G1 code  
- [x] S0 artifacts exist and state Class D-analogue + escalation triggers  
- [x] No “NASA compliant” wording anywhere in product UI (footer forbids claim)  

**Product / layers**
- [x] Default Engine UX = Core + Instrument only  
- [x] URL ingest, correlates, Smith remain wired through ledger tags  

**Compute**
- [x] Every GPU Op declares a TP policy from §3.2  
- [x] CPU fabric parity (S2) before WebGPU (G1)  
- [x] ε-gate documented and enforced for SH + correlates  
- [ ] Speedup: **measure and report** on a WebGPU machine at agreed shapes (ℓ≥32 sky; n≥64 correlate); **no invented × factor as a claim** — target aspiration ≥2× on at least one op, recorded in ledger (browser measurement when adapter present; Node = N/A)  

**Fail criteria (STOP)**
- GPU enabled without CPU fallback or ε-gate  
- Correlate UI omits null / epistemic tag  
- Class escalation trigger met without reclassification note  

---

## 5. Risks & residue (unchanged intent, tighter)

| Risk | Mitigation |
|------|------------|
| Standards theater | Gates are artifacts + tests, not slogans |
| TP policy soup | One primary policy per Op |
| GPU nondeterminism | ε-gate; ordered reductions |
| Over-classifying | Stay D-analogue until escalation trigger |
| Under-classifying | External ingest + correlate “evidence look” justified D over E/F |

**Residue (still open):** CUDA multi-node TP; FITS/HEALPix; sky-bin correlates; formal IV&V; Ulam panel; hardware-GPU ≥2× (unmeasured on SwiftShader).

**Post-G3 cleanup closed:** IngestConverge default UI path; full `cpuRuntime` Op dispatch (PROJECT/EMBED/LAYOUT/INGEST); correlate Worker + transferable buffers.

---

## 6. Next step (still plan-only)

1. User **accepts Rev 2** or marks further edits.  
2. On GO: execute **S0 → S1 → S2 → S3**, stop for review before **G1**.  
