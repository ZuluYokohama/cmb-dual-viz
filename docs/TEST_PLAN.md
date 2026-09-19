# Test Plan — CMB Dual-Thread Engine

**Revision:** 2 (G1 WebGPU)  
**G1:** GPU ε-gate + feature-detect fallback required.

## 1. Unit tests

| Suite | Coverage | Gate |
|-------|----------|------|
| `smith` | Möbius round-trip Γ↔z; SWR at Γ=0; match point | S3 |
| `correlates` | Pearson identity; nullZ on shuffled identical; demote epistemic | S3 |
| `SH` | `exampleCl` shape; `drawCoefficients` seed stability; `synthesizeGrid` finite | S3 |
| `fabric parity` | OpGraph CPU path bit-matches / ≈ matches direct math calls | S3 |
| `webgpu` / ε-gate | Probe fallback; ε constants; forced-CPU fabric | G1 |
| `coherence` | Null ensemble finite; lightMetrics path | S3 |

Runner: Node (`tsx` / `node --experimental-vm-modules` / custom `scripts/run-tests.mjs`).

## 2. Golden CPU

| Vector | Shape | Pass |
|--------|-------|------|
| SH sky | seed=42, ℓmax=8, default grid | Float32 checksum / max\|Δ\| ≤ 0 vs direct `synthesizeGrid` |
| Correlate | fixed series pair + seed | scores + \(z_{\mathrm{toy}}\) match within 1e-12 |
| Smith | fixed z → Γ | exact within float eps |

## 3. Null-control

| Case | Expect |
|------|--------|
| Correlate shuffle null | `nullStd > 0` (or guarded); UI shows toy disclaimer |
| Coherence shuffle | z finite; not auto PHYSICS-BACKED |
| Hazard copy | Correlate panel contains “≠ OPEN” / null wording |

## 4. GPU ε (G1)

| Item | ε / shape | Status |
|------|-----------|--------|
| `|gpu - cpu| ≤ ε` on SH golden | **ε = 0.75** abs; seed=42, ℓmax=8, adaptive grid | Enforced in `runEpsilonGate` |
| `|gpu - cpu| ≤ ε` on correlate golden | **ε = 5e-4** abs on lagged-Pearson scores; 8×32, maxLag=5; lags exact | Enforced in `runEpsilonGate` |
| Feature-detect + CPU fallback | No `navigator.gpu` / adapter null / ε fail → `device: cpu` | Covered by unit tests (Node) + gate |

## 5. Static / build gate (S3)

- [ ] `npx tsc --noEmit`
- [ ] `npx eslint` (project config)
- [ ] `npm run build`
- [ ] Dev server binds `0.0.0.0:5173`

## 6. Perf baseline (measured)

Record wall ms for SH at agreed ℓ and correlate n in `docs/PERF_BASELINE.md` / ledger — **no invented × factors**.
