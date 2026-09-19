# WebGPU compute (G1)

Single-device WebGPU for `SH_SYNTH` and `CORRELATE_BATCH`. Feature-detect + ε-gate; automatic CPU fallback.

## Workgroup sizes

| Kernel | WGSL entry | `@workgroup_size` | Dispatch policy |
|--------|------------|-------------------|-----------------|
| SH band synth | `shSynth.wgsl` band pass | **(8, 8, 1)** = 64 | `TP_PIX_TILE` tiles; Z = `TP_ELL_BAND` |
| SH reduce | reduce pass | **(64, 1, 1)** | one thread / pixel; ordered band sum |
| Correlate pair×lag | `correlate.wgsl` | **(32, 1, 1)** | one WG / pair (`TP_PAIR_BLOCK`); lanes = `TP_LAG_SLICE` |

Constants: `SH_TILE_WG=8`, `SH_REDUCE_WG=64`, `CORR_WG=32` in kernel modules.

## Precision

f32 only in WGSL. CPU goldens use JS Number intermediates then Float32Array stores for SH; correlate CPU reference mirrors f32 pearson.

## ε-gate (see `epsilon.ts` / `docs/TEST_PLAN.md`)

| Op | Golden | ε |
|----|--------|---|
| `SH_SYNTH` | seed=42, ℓmax=8, adaptive grid | `EPS_SH_ABS = 0.75` |
| `CORRELATE_BATCH` | 8×32 series, all pairs, maxLag=5 | `EPS_CORR_ABS = 5e-4` (+ exact lag match) |

If probe fails or ε exceeded → `device: 'cpu'`, GPU path disabled for the session.
