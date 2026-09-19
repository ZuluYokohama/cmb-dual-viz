# CMB repository review and V&V staging

Reviewed upstream revision: `1b6ede9c0529a160be2bbff0ea61df44b473c155` (2026-09-19).

## What the repository does

This is a React/TypeScript exploratory research instrument. Thread A synthesizes a CMB-like sky from real spherical harmonics and a **toy** power spectrum. Thread B adds a synthetic coherence field. JSON/CSV/text input becomes a meaning graph, correlation candidates, and derived Smith-chart displays. CPU implementations are the reference; selected operations have WebGPU implementations and epsilon gates. The multi-device implementation includes a dual-logical-device demonstration, which does not demonstrate physical multi-GPU scaling.

The "meaning" representation is a 24-dimensional token-hash/numeric feature projection plus PCA/force layout. It is not a pretrained semantic embedding model. The new staging format attaches explicit provenance and units but cannot create semantic comparability between heterogeneous feature vectors. The UI is useful for hypothesis exploration and pipeline inspection; its labels already disclaim physics discovery and formal claim certification.

Relevant implementation: `src/math/{sphericalHarmonics,coherence,embedding,meaningMap,correlates,smith}.ts`, `src/compute/`, and `src/ingest/`. Imported sky/C_l/a_lm enter summaries and similarity routes; they do not replace Thread A's random synthetic sky. Imported series can drive Thread B, so comparing a source against that driven overlay is not independent validation.

## Findings and changes

| Finding at upstream revision | Action in staging branch | Remaining boundary |
|---|---|---|
| No dependency lockfile; fresh TypeScript/WebGPU declarations produced build errors | Added lockfile; GPU uploads and worker transfers now use owned typed-array slices | GPU upload copies may add overhead; physical-GPU timing has not been measured |
| JSON can substitute zero for malformed C_l values and accept partial payloads | Added atomic versioned intake that rejects any bad record | Legacy parser remains permissive; use checked intake for V&V |
| Lon/lat units guessed by magnitude | Explicit degree/radian contract, ranges, coordinate-frame metadata | Frame transformation, beam/mask/calibration remain upstream requirements |
| Local payload can claim PHYSICS-BACKED | External legacy physics labels now demoted; original declaration retained | Source truth and licenses still require independent verification |
| Blank CSV numeric cells coerced to zero | Missing numeric cells report errors and are excluded | Legacy partial-row acceptance remains visible as residue |
| No ingestion-specific tests in original suite | Added strict contract, mapping, boundary, replay, downstream CPU, and analytic-reference checks | Fuzzing, browser end-to-end tests, and real-data validation remain pending |
| No structured HF staging handoff | Explicit JSONL mapping, pinned-revision syntax, saved raw input/mapping/output hashes | Actual HF dataset, file, split, columns, and semantics not supplied |
| Evidence ledger is a mutable in-memory ring capped at 200 records | Staging CLI writes separate preserved run artifacts | Browser ledger is not an immutable audit log and does not persist a complete experiment history |

The observed baseline passed **47 tests** and lint. The expanded suite passed **78 tests** before the existing build-type errors were corrected. The final suite contains **79 passing tests**; lint and the production build also pass. Exact results and logs are produced by `npm run vv`; see the committed execution record in `docs/vv-evidence/`.

## Full V&V gate roster

Verification asks whether the software performs the specified operations. Validation asks whether those operations and measurements are suitable for the proposed scientific claim. A software PASS does not close the validation gates.

| Gate | Required evidence / acceptance | Status for this preparation |
|---|---|---|
| V0 — repository identity | Immutable code revision, lockfile, reproducible commands | Staged; reports record revision, dirty state and hashes |
| V1 — representation | Explicit units, frame/basis, unique IDs/modes, no missing-value imputation; raw-byte retention | Implemented and tested for five V1 record kinds |
| V2 — software verification | Unit/reference tests, lint, typecheck and production build pass | Executed locally; machine-readable reports retained |
| V3 — pipeline execution | Envelope → parser → data nodes → finite CPU correlations; no physics-label promotion | Executed on synthetic fixtures; deterministic replay checked |
| V4 — source validation | Pinned actual dataset/file, source/license check, transform lineage, row counts and independent units/frame comparison | **NOT RUN — actual new data required** |
| V5 — mathematical/numerical validation | Independent reference results, representative dimensions and boundary cases; error bounds justified in units | Low-order analytic harmonic identities/addition theorem and Pearson properties checked; broader domain validation pending |
| V6 — inferential validity | Preregister statistic, lag/target search family, timestamp alignment, suitable null, multiplicity control, held-out evaluation, independent negative/positive controls | **NOT RUN — current shuffle z is exploratory** |
| V7 — hardware/browser | UI import and rejection, worker round trip, CPU/GPU agreement over workload envelope, physical-device details and measured performance | Node fallback tests only; **physical GPU/browser validation NOT RUN** |
| V8 — remote/reproducibility | Streaming byte limits, body-lifetime timeout, redirect/private-host policy; independent clean replay and evidence retention | Local staging bounded; remote proxy issues unresolved; independent replication pending |

## Next execution, in order

1. Select the first dataset or new structure and the claim it is intended to test. Specify source/revision, units, coordinate/basis/time conventions, uncertainty/missingness, and the expected result or independent reference. Graph/tensor/uncertainty data need a semantics-preserving extension before ingestion.
2. Download a small immutable slice, preserve it, map explicitly, and run checked staging. Review raw versus mapped record counts, exclusions, provenance assertions, and meaning-map subsampling. Freeze the accepted adapter and fixtures before increasing volume.
3. For time-series inference, implement physically meaningful timestamp alignment and isolate independent controls from the imported-series-driven Thread B. Specify and validate a null that preserves relevant temporal/spatial dependence. Account for every lag/target search and evaluate held-out data.
4. For measured sky data, validate units, coordinate transforms, mask/beam/noise treatment, real/complex harmonic conversion and any D_l↔C_l conversion against an independent reference. The current renderer is a toy synthesis, so a measured-sky rendering/reconstruction claim requires additional implementation.
5. Exercise the browser and target GPU, compare to CPU references over the actual sizes, and record full error distributions and timing. Fix remote proxy controls before expanding URL ingestion. Keep claim status provisional until every applicable gate has evidence.

No live HF dataset, GPU job, measured Planck/GCP validation, significance claim, or full V&V certification is asserted by this staging work.
