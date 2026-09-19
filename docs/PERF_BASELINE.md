# CPU Perf Baseline (measured)

**Date:** 2026-09-19 10:54 CT  
**Host:** Node v20.19.2 · linux x64  
**Device:** cpu (CPU fallback / Node — WebGPU N/A)  
**Gate:** forced CPU

> Values are wall-clock `performance.now()` / `Date.now()` measurements from this machine.
> Do **not** invent GPU speedup factors. Browser WebGPU timings recorded separately when available.

## Spherical-harmonic synthesis (`SH_SYNTH` / `TP_ELL_BAND`)

| ℓ max | grid (θ×φ) | runs | mean ms | min ms | max ms |
|------:|------------|-----:|--------:|-------:|-------:|
| 8 | 90×180 | 5 | 11.01 | 4.65 | 25.61 |
| 16 | 90×180 | 5 | 19.86 | 18.43 | 21.63 |
| 32 | 72×144 | 3 | 57.00 | 55.25 | 59.63 |

## Correlate batch (`CORRELATE_BATCH` / `TP_PAIR_BLOCK`)

| n series pts | targets scanned | runs | mean ms | min ms | max ms |
|-------------:|----------------:|-----:|--------:|-------:|-------:|
| 32 | 4 | 5 | 1.52 | 1.09 | 2.81 |
| 64 | 4 | 5 | 0.98 | 0.90 | 1.06 |

## WebGPU (G1)

| Status | Notes |
|--------|-------|
| Node baseline | WebGPU **N/A** — CPU fallback (no `navigator.gpu`) |
| ε (SH) | `EPS_SH_ABS = 0.75` on seed=42, ℓmax=8 |
| ε (correlate) | `EPS_CORR_ABS = 5e-4` on 8×32 pairs + exact lags |

Browser GPU timings: run app with WebGPU-capable Chrome; ledger records `device: webgpu` when ε-gate passes.

## Notes

- SH path = `fabricShSynth` (parity with `synthesizeGrid` on CPU; WGSL on GPU).
- Correlate path = `fabricCorrelate` over EXAMPLE C_ℓ + synthetic series seeds.
- Recorded also as JSONL: `artifacts/ledger/perf-baseline.jsonl`.

## Browser WebGPU (measured — Chrome + SwiftShader)

**Date:** 2026-09-19 10:54 CT  
**Adapter:** google / swiftshader (software WebGPU)  
**ε-gate:** SH maxΔ=0.427 (ε=0.75) pass; correlate maxΔ=2.38e-7 (ε=5e-4) pass

### SH_SYNTH on WebGPU (fabric, includes upload/readback)

| ℓ max | runs | mean ms | min ms | max ms |
|------:|-----:|--------:|-------:|-------:|
| 8 | 5 | 42.36 | 39.60 | 45.10 |
| 16 | 5 | 102.86 | 86.60 | 133.40 |
| 32 | 3 | 308.57 | 304.10 | 315.30 |

> SwiftShader is **not** a hardware GPU. These timings are slower than the Node CPU baseline on this host — **no speedup claim**. Hardware-GPU ×factor remains unmeasured (G1 stretch / residue).


## G2 graph fusion (measured — Node CPU)

**Date:** 2026-09-19T11:05:01.672Z  
**Host:** Node v20.19.2 · forceCpu  
**Graph:** SkyFrame (SH_SYNTH → COH_FIELD → PROJECT_MOLLWEIDE)  
**Total wall ms:** 69.66 (graph 69.03)

| op | device | TP | shards | ms |
|----|--------|----|-------:|---:|
| SH_SYNTH | cpu | TP_ELL_BAND | 1 | 20.49 |
| COH_FIELD | cpu | TP_PIX_TILE | 1 | 33.60 |
| PROJECT_MOLLWEIDE | cpu | TP_PIX_TILE | 1 | 13.84 |

> SwiftShader / Node CPU — **no ≥2× speedup claim**. Browser WebGPU timings remain as in G1 section when adapter present.



## G3 optional scale (2026-09-19 CT)

| Item | Status |
|------|--------|
| Adapter reality | SwiftShader / software (or CPU-only in Node) — **not** discrete GPU |
| Multi-device HW | **Unavailable** on this box — API shipped; DEMO dual-logical only |
| Worker SkyFrame | Implemented (browser); Node tests use main-thread fallback |
| Speedup claim | **None** — no invented ≥2×; measure on real discrete GPU later |

### DEMO dual-logical (Node, forceCpu)

Sharding `TP_ELL_BAND` across `logical:q0` + `logical:q1` (sequential CPU). Timings are wall-clock for correctness of the API, not a speedup claim.

> Hardware gate: if no real discrete GPU, UI states so. Do not treat DEMO dual-logical as multi-GPU.
