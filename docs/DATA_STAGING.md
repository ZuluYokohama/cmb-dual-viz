# Checked data intake and Hugging Face handoff

`cmb.dataset/v1` is an atomic research intake contract. The CLI verifies its structure and executes the existing CPU meaning-map/correlation route on a fixed synthetic context. A passing report does **not** verify source assertions, scientific hypotheses, significance, or observational calibration.

## Run the complete local software gate

Requires Node 20.19+ or 22.12+ and npm; this revision was exercised on Node 24.19.0.

```bash
npm ci
npm run vv
npm run stage:data -- public/samples/staging-series.cmb.json --out artifacts/staging/run-001
npm run stage:data -- examples/staging/rows.jsonl --mapping examples/staging/mapping.json --out artifacts/staging/run-002
```

Use a new output directory for every run. Failed contract or CPU checks exit nonzero without writing an importable dataset. The CLI rejects invalid UTF-8, inputs above 5 MiB, and envelopes above 10,000 rows; it never skips invalid rows. It preserves the original input bytes, optional mapping, generated envelope, SHA-256 hashes, code revision/dirty status, bundled implementation hash, and report. Import `dataset.cmb.json` through the existing file picker or paste box. A successful intake log still includes research limitations as residue.

`npm run vv` records test, lint, and production-build logs, their hashes, lockfile hash, and status under `artifacts/vv/<timestamp>/`. Real-data, inference-calibration, and physical-GPU validation stay `NOT_RUN`. Staging output and raw data are ignored by Git; publish them deliberately only after checking their contents and licensing.

## Version 1 contract

See [the runnable envelope](../public/samples/staging-series.cmb.json), [JSONL rows](../examples/staging/rows.jsonl), and [column mapping](../examples/staging/mapping.json).

Required envelope fields:

| Field | Requirement |
|---|---|
| `schemaVersion` | Exactly `cmb.dataset/v1`; unknown versions fail closed |
| `name` | Nonempty dataset name |
| `kind` | `series`, `sky`, `claims`, `cl`, or `alm` |
| `provenance.source` | Explicit URI or source identifier |
| `provenance.revision` | Nonempty version; HF URIs require the full 40-character commit SHA |
| `provenance.license` | Explicit license identifier or documented restriction; a string is an assertion, not legal clearance |
| `provenance.origin` | `synthetic`, `measured`, or `derived`; origin is an assertion, not an epistemic promotion |
| `units.value` | Explicit physical unit, `dimensionless`, or `text` |
| `records` | 1–10,000 typed records; no unrecognized fields or implicit number coercion |

| Kind | Record | Additional contract / actual engine behavior |
|---|---|---|
| `series` | `{ "t": 0, "value": 1.2 }` | `units.time` required; strictly increasing, unique numeric time; unit conversion is upstream. Current correlates resample by **index**, not elapsed time. |
| `sky` | `{ "lon": 1, "lat": 1, "value": 2 }` | `units.angle`: `deg` or `rad`; longitude ±180°/±π, latitude ±90°/±π/2; `coordinateFrame`: `galactic`, `icrs`, or `unspecified`. Converts angles to radians, preserves frame metadata, does not transform frames. |
| `claims` | `{ "id": "c1", "text": "Claim text" }` | Unique, nonempty IDs/text; meaning map uses the first 40 claims. |
| `cl` | `{ "ell": 0, "value": 0 }` | Ordered, contiguous integer ell from 0; nonnegative C_l. D_l requires an explicit upstream conversion. Missing bins are rejected, not imputed. |
| `alm` | `{ "ell": 2, "m": -1, "a": 0.2 }` | Integer ell≥0, integer abs(m)≤ell, unique modes; `harmonicConvention`: `real-orthonormal-condon-shortley`. Positive m uses cosine and negative m sine. Current intake summarizes energy per ell; it does not replace the synthesized sky. |

The parser rejects unknown fields so uncertainties, masks, covariance, or IDs cannot disappear unnoticed. A future version or explicit adapter must specify how those structures are preserved and consumed. V1 is not a generic graph, tensor, FITS, HEALPix, or complex-a_lm loader. Do not flatten those structures into prose to get them past a gate.

## Hugging Face dataset route

**Executed follow-up:** [HF_VALIDATION.md](HF_VALIDATION.md) records two pinned public datasets, 29 independent numerical gates, a CPU browser test, and an unresolved source-metadata finding. Importable examples are now in `public/samples/hf/`. The instructions below also apply to additional datasets.

Select the actual repository, immutable commit, file, and desired columns before running. The first staging change used synthetic fixtures; the follow-up fetched public data using the HF API after plugin search was unavailable. No remote job was launched.

Use the current `hf` CLI in an authenticated local environment. For a JSONL source:

```bash
hf download OWNER/DATASET path/to/rows.jsonl --type dataset --revision FULL_40_CHARACTER_COMMIT_SHA --local-dir incoming/hf
```

Copy `examples/staging/mapping.json` to a run-specific mapping. Set `provenance.source` to `hf://datasets/OWNER/DATASET/path/to/rows.jsonl`, `revision` to the same commit SHA, and supply the source's actual license, origin, units, and column names. Then:

```bash
npm run stage:data -- incoming/hf/path/to/rows.jsonl --mapping incoming/mapping.json --out artifacts/staging/hf-run-001
```

`columns` maps contract field → exact flat source-column name; nested columns and automatic coercions are unsupported. Additional source columns are deliberately unselected by the mapping and retained in `input.raw`. The source may be public or private: keep credentials in the HF CLI's credential store/environment, never in mappings, URLs, browser bundles, or commits. For Parquet/Arrow, first make a bounded JSONL export with documented subset, split, filters, row order, and units. That export is a separate transformation requiring its own validation; no Parquet/Arrow adapter is claimed here.

The report's input hash proves which local bytes were processed. An HF commit string does not by itself prove those bytes came from that commit; `sourceAssertionsVerified` remains false. Independently compare the retrieved file against the pinned Hub artifact before assigning a provenance-validation PASS.

## Deliberate limits and compatibility

The legacy JSON/CSV/text path remains for exploratory input. It can still accept partial rows or infer angular units. Only versioned intake has the strict contract. Legacy external physics labels now become source assertions and are demoted to DERIVED; blank CSV numeric cells no longer become zeros. Invalid structured input without a file extension no longer falls back into prose.

The CLI's smoke gate checks downstream finite execution. Direct browser import runs the contract parser but does not itself reproduce the CLI smoke report or verify a report signature. Hashes are evidence of byte identity, not cryptographic attestations of scientific correctness.

For untrusted network sources, prefer bounded local downloads followed by this CLI until the existing proxy is hardened. Inspection found the proxy buffers the entire body before applying its size cap, clears its timeout before consuming the body, follows redirects, and does not block private hosts. These are unresolved remote-ingestion issues; the new CLI does not depend on that proxy.

See [V&V review and remaining gates](VV_REVIEW.md).
