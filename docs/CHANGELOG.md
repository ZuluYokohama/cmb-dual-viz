## Unreleased — Dressing checklist (RESEARCH)

- Dressing checklist panel: bare / dressed_candidate / invariant_claim + scaffolding display
- Ledger `kind: 'dressing'` (`nodeId`, `from`, `to`, `at`, `note`); bulk mark correlate hits
- Bombelli motif copy; no DFM algebra / Lean claim; never auto-PHYSICS-BACKED or OPEN
- Docs: `docs/DRESSING_CHECKLIST.md`; screenshot `artifacts/cmb-dressing-checklist.png`

## Unreleased — Post-G3 residue closed

- **IngestConverge default path:** CorrelateSearch / scan UI uses OpGraph
  (`INGEST_PARSE` → `EMBED_HASH` → `MEANING_LAYOUT` → `CORRELATE_BATCH` → `SMITH_MAP`);
  `fabricCorrelate` kept as documented escape hatch (`?correlateBypass=1` / tests)
- **Full OpGraph dispatch:** `cpuRuntime` handles `PROJECT_MOLLWEIDE`, `EMBED_HASH`,
  `MEANING_LAYOUT`, `INGEST_PARSE` (SkyFrame project + IngestConverge stages via switch)
- **Correlate Worker:** `correlate.worker.ts` + transferable score/z/lag buffers;
  main-thread fallback; measurements record `path: worker|main` + placement note
- Screenshot: `artifacts/cmb-residue-closed.png`
- **Still open (plan residue, not this cleanup):** CUDA multi-node TP; FITS/HEALPix;
  sky-bin spatial correlates; formal IV&V; hardware-GPU ≥2× (unmeasured on SwiftShader)

## Unreleased — Rev 2 G3 (optional scale)

- Worker path for SkyFrame (`skyFrame.worker.ts`) with transferable buffers; main-thread fallback
- OffscreenCanvas raster path in `SkyCanvas` (+ blit precomputed rgba)
- Multi-device TensorRuntime façade: enumerate cpu/webgpu/logical:q0/q1; placement hints; `demo-dual-logical` shards TP_ELL_BAND / TP_PAIR_BLOCK (DEMO — not multi-GPU HW)
- Hardware gate: SwiftShader/software labeled; UI forbids invented ≥2× speedup
- Measurements show per-shard device placement + worker path
- Tests: `multiDevice.test.ts`; lint/tsc/build green

## Unreleased — Rev 2 G2 (graph fusion + measurements)

- G2 OpGraph fusion: **SkyFrame** (SH_SYNTH → COH_FIELD → PROJECT_MOLLWEIDE), **IngestConverge** (INGEST_PARSE → EMBED_HASH → MEANING_LAYOUT → CORRELATE_BATCH → SMITH_MAP), **Scrub** (COH_FIELD + SMITH_MAP only; time scrub does not resynth SH)
- Per-op / per-graph measurements: device, wall ms, primary TP policy, shard counts — UI `PerfPanel` + Evidence Ledger `kind: perf`
- PROJECT_MOLLWEIDE / EMBED_HASH / MEANING_LAYOUT / INGEST_PARSE wired onto OpGraph for fusion scheduling
- Tests: fusion scheduling + measurement records (`graphs.test.ts`)
- SwiftShader honesty: no invented ≥2× speedup claim

# Changelog — CMB Dual-Thread Engine

## Unreleased — Rev 2 G1 (WebGPU single-device)

- G1: WebGPU for `SH_SYNTH` (`TP_ELL_BAND` + nested `TP_PIX_TILE`) and `CORRELATE_BATCH` (`TP_PAIR_BLOCK` + nested `TP_LAG_SLICE`)
- Feature-detect `navigator.gpu`; ε-gate vs CPU goldens; automatic CPU fallback
- ε: `EPS_SH_ABS=0.75`, `EPS_CORR_ABS=5e-4` (documented in TEST_PLAN / PERF / peer-review)
- UI shows `device: webgpu|cpu`; Class D-analogue footer unchanged (no “NASA compliant”)
- Unit + ε-gate tests; peer-review checklist filled for these kernels

## Prior — Rev 2 S0–S3 (CPU fabric + assurance)

- S0: Classification D-analogue, requirements, architecture, hazards, test plan, peer-review skeleton
- S1: Core/Instrument default UX; Ulam behind `?analogy=1` / settings
- S2: CPU OpGraph / TensorRuntime; SH, correlates, coherence routed with TP policies
- S3: Evidence Ledger JSONL; unit tests; eslint/tsc; measured CPU perf baseline

## Unreleased

- docs: add `CAPABILITIES_BRIEFING.md` (shareable operator/capabilities briefing).
