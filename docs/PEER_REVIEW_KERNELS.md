# Peer-review checklist — compute kernels

**Status:** G1 WebGPU + G3 multi-device/Worker — checklist filled for `SH_SYNTH` + `CORRELATE_BATCH`; G3 is API/DEMO scale (no new WGSL kernels).  
**Purpose:** NPR peer-review *theme* for GPU/WGSL kernels and TP policies.

Each new kernel SHALL pass this checklist before enablement in default UX.

## Checklist — `SH_SYNTH` (WGSL)

- [x] Op descriptor declares exactly one primary `TPPolicy` from plan §3.2 → **`TP_ELL_BAND`** (nested **`TP_PIX_TILE`** 8×8)
- [x] CPU reference path exists and is exercised by golden test (`synthesizeGrid` / fabric parity)
- [x] ε-gate documented (shape, ε, seed) and enforced → seed=42, ℓmax=8, adaptive grid; **`EPS_SH_ABS = 0.75`** (`src/compute/webgpu/epsilon.ts`)
- [x] Deterministic reduction order documented → ascending band index sum in reduce pass (`src/compute/webgpu/README.md`)
- [x] Epistemic ceiling set; no auto-promote to PHYSICS-BACKED / OPEN → `PHYSICS-BACKED (EXAMPLE)`
- [x] Feature detect + CPU fallback verified with GPU blocked / Node (no `navigator.gpu`)
- [x] Ledger records device, op, ms, epistemic
- [ ] Second reviewer (human) initials ________ date ________

## Checklist — `CORRELATE_BATCH` (WGSL)

- [x] Op descriptor declares exactly one primary `TPPolicy` → **`TP_PAIR_BLOCK`** (nested **`TP_LAG_SLICE`** lanes)
- [x] CPU reference path exists (`laggedPearsonBatchCpu` + `scanCorrelates` goldens)
- [x] ε-gate documented → 8×32 series, all pairs, maxLag=5; **`EPS_CORR_ABS = 5e-4`** + exact lag match
- [x] Deterministic reduction order documented → shared-memory max-|r| reduce in workgroup lane 0
- [x] Epistemic ceiling set → `RESEARCH/DERIVED`; demote never PHYSICS-BACKED / OPEN
- [x] Feature detect + CPU fallback verified (Node + ε-gate fail path)
- [x] Ledger records device, op, ms, epistemic
- [ ] Second reviewer (human) initials ________ date ________

## Workgroup sizes

| Kernel | `@workgroup_size` |
|--------|-------------------|
| SH band (pix tile) | (8, 8, 1) |
| SH reduce | (64, 1, 1) |
| Correlate pair×lag | (32, 1, 1) |

See `src/compute/webgpu/README.md`.


## G3 multi-device / Worker (no new WGSL)

- [x] Multi-device façade enumerates devices; placement hints per Op/TP
- [x] `demo-dual-logical` clearly labeled DEMO — not presented as multi-GPU HW
- [x] Hardware gate: software/SwiftShader → no ≥2× speedup claim in UI
- [x] Worker SkyFrame uses CPU math parity; transferable buffers; main fallback
- [x] Measurements record per-shard `deviceId` placements
- [ ] Second reviewer (human) initials ________ date ________
