# Architecture — CMB Dual-Thread Engine

**Revision:** 2 + G3 scale (2026-09-19 CT)  
**Scope:** Engine shell, OpGraph → Op → Shard, Evidence Ledger, URL proxy.

## 1. Engine shell (UX)

Single shell layout (default path = Core + Instrument):

| Region | Content | Layer |
|--------|---------|-------|
| Sky | Mollweide anisotropy + optional coherence overlay | C1 + I1 |
| Meaning + Correlates | Meaning map, correlate search | C3 + C4 |
| Smith | Möbius dial, trail, transfer arcs | I2 |
| Ingest / Controls | Thread controls, node inspector, dressing checklist, ingest (URL + file) | C2 + C0 + RESEARCH dressing |
| Thin | Ulam spiral | Deferred (`?analogy=1` or settings) |

No orphan panels on the default path: every value panel is wired to live state.

## 2. Compute hierarchy

```
OpGraph          # scheduled unit (user action / ingest batch)
  └─ Op            # typed tensor transform
       └─ Shard    # parallel unit (axis + reduce); CPU may be single-shard
```

### Named TP policies (declared even on CPU)

| Policy | Axis | Ops |
|--------|------|-----|
| `TP_ELL_BAND` | ℓ bands | `SH_SYNTH` |
| `TP_PIX_TILE` | sky tiles | `COH_FIELD`, `PROJECT_MOLLWEIDE` |
| `TP_PAIR_BLOCK` | (i,j) blocks | `CORRELATE_BATCH` |
| `TP_LAG_SLICE` | lag ranges | nested in correlate |
| `TP_DOC_BATCH` | documents | `EMBED_HASH`, ingest parse |
| `TP_NONE` | single | `SMITH_MAP`, `LEDGER_APPEND`, layout |

### Canonical ops (Core + Instrument)

`INGEST_PARSE`, `SH_SYNTH`, `COH_FIELD`, `PROJECT_MOLLWEIDE`, `EMBED_HASH`, `MEANING_LAYOUT`, `CORRELATE_BATCH`, `SMITH_MAP`, `LEDGER_APPEND`.

**Device at G1–G3:** CPU always available; WebGPU single-device for `SH_SYNTH` + `CORRELATE_BATCH` when feature-detect + ε-gate pass (`src/compute/webgpu/`). Fallback is automatic. **G3** adds Worker/Offscreen for SkyFrame and a multi-device TensorRuntime façade (see §7).

### Workgroup sizes (G1)

| Kernel | size | Notes |
|--------|------|-------|
| SH band | (8,8,1) | `TP_PIX_TILE`; Z dispatch = `TP_ELL_BAND` |
| SH reduce | (64,1,1) | Ordered band sum |
| Correlate | (32,1,1) | One WG/pair; lanes = `TP_LAG_SLICE` |

Details: `src/compute/webgpu/README.md`.

## 3. Evidence Ledger

- Append-only JSONL under `artifacts/ledger/`
- Events: ingest, correlate scans, compute runs (SH / coherence / smith), dressing transitions
- Each record carries epistemic tags + op name + timing when available
- Browser path: in-memory ring + optional download; Node/scripts write files

## 4. External interfaces

| Interface | Role | Constraints |
|-----------|------|-------------|
| Vite `/api/fetch?url=` | CORS-safe URL ingest proxy | http(s) only; size cap 5 MB |
| Local file / paste | Direct ingest | Same parsers; provenance `file`/`paste` |
| Dev server | `0.0.0.0:5173` | Research desktop |

## 5. Qualities

| Quality | Approach |
|---------|----------|
| Determinism | Fixed seeds; ordered reductions |
| Epistemic propagation | `out = strictest(in, op.ceiling)` |
| Parity | CPU golden vectors; GPU ε reserved for G1 |
| Fallback | CPU if WebGPU missing or ε-gate fails |
| Observability | Ledger + UI badges |

## 6. Module map

```
src/
  compute/     types, cpuRuntime, fabric (hybrid), webgpu/, ledger hooks
  math/        SH, coherence, correlates, smith, meaningMap, …
  ingest/      parsers + URL ingest
  components/  Engine shell panels
docs/          S0 assurance pack + Rev 2 plan
artifacts/ledger/  JSONL runs
```


## 7. G3 optional scale (Worker + multi-device API)

### 7.1 Worker / Offscreen

| Path | Role |
|------|------|
| `src/compute/worker/skyFrame.worker.ts` | Off-main-thread SkyFrame (SH + COH + PROJECT); transferable `ArrayBuffer`s |
| `runSkyFrameOffthread` | Client; falls back to main-thread `runSkyFrame` |
| `src/compute/worker/correlate.worker.ts` | Off-main-thread `CORRELATE_BATCH`; transferable score/z/lag buffers |
| `runCorrelateOffthread` / `runIngestConverge` | Correlate + IngestConverge; Worker preferred; main fallback |
| `SkyCanvas` OffscreenCanvas | Rasterize via `OffscreenCanvas` when available; blit precomputed rgba from worker |
| `CpuTensorRuntime` | Unified switch for all named Ops incl. PROJECT / EMBED / LAYOUT / INGEST |

### 7.2 Multi-device façade

`MultiDeviceTensorRuntime` (`src/compute/multiDevice/`):

- `enumerateDevices()` → `cpu`, `webgpu` (adapter info), `logical:q0`, `logical:q1` (always; DEMO)
- Placement hints per Op / TP policy
- Modes: `single` | `demo-dual-logical`
- `demo-dual-logical` shards `TP_ELL_BAND` / `TP_PAIR_BLOCK` across CPU+WebGPU **or** two sequential logical queues — labeled **DEMO/logical**, not fake hardware
- Hardware gate (`hardwareGate.ts`): SwiftShader/software → UI says no discrete GPU; `allowSpeedupClaim: false`

### 7.3 Measurements

Perf panel + ledger record `path` (worker|main), `multiDeviceMode`, and per-shard `placements[]` (`deviceId`, ms, demo flag).
