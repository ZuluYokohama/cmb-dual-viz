# CMB continuation: measured-series verification

Date: 22 September 2026. Starting revision: `100bbe068249fad3924f6ab034e6fb51eac39351`, the latest head of draft PR #6 when work began.

**Completed goal:** implement a deterministic measured-series interface and independently verify its numerical results, input alignment, missingness handling, and failure behavior. The new v2 CLI is usable on bounded, regular-grid observations. A follow-on LLM experiment remains the next research stage.

## What changed

- Added a separate `cmb.series-query/v2` interface with explicit timestamps, time unit/epoch, sampling interval, per-channel provenance, and configurable minimum pair counts.
- Added a scale-safe Pearson calculation. Constant input stays undefined; large offsets and extreme finite amplitudes no longer inherit the v1 failures demonstrated below.
- Returned all requested lags, signed coefficients, sample counts, null/status for unavailable results, zero-lag measurements, and ambiguity/boundary diagnostics.
- Added an offline auditor that invokes the actual CLI and compares every coefficient with an independently implemented 100-digit Decimal calculation.
- Preserved the v1 experiment implementation and original evidence. The older dashboard comparison path is also unchanged; it does not acquire timestamp-aware analysis through this CLI addition.

See [the tool contract and reproduction instructions](MEASURED_SERIES_TOOL.md). Implementation: `src/ingest/measuredSeriesTool.ts`; CLI: `scripts/cmb-measured-series-tool.mjs`; independent audit: `experiments/series/audit_measured_series.py`.

## Executed results

| Check | Observed result |
|---|---|
| Untransformed measured queries | 2, each using the same preserved 365-day SILSO source |
| Separately labeled synthetic/derived controls | 16 |
| All requested lag rows checked | 538 |
| Defined numerical coefficients checked | 499 |
| Constant-input rows correctly reported undefined | 18 |
| Insufficient-pair rows correctly reported undefined | 21 |
| Largest coefficient error versus independent Decimal | `2.220446049250313e-16` |
| Declared numerical acceptance tolerance | Absolute error `<= 1e-12` |
| Invalid-input rejection checks | 17/17 passed |
| Application tests | 147/147 passed in 13 files; 55 tests added for v2 |
| Existing Python study/pilot tests | 9/9 passed |
| Lint and production build | PASS |

Rejection cases include mismatched, irregular and duplicate timestamps; missing provenance; invalid numeric types; missing values under `reject`; invalid UTF-8/JSON; and a valid JSON request padded beyond the 1 MiB record limit. Unit tests additionally cover insufficient timestamp resolution, schema-field injection, sparse arrays, close peaks, and direction changes under swapping and reversal. Reusing an existing audit output directory was checked to fail without altering its files.

All 538 rows are software comparisons. The two measured queries share a source, and transformed controls are dependent constructions. These counts are not independent scientific samples or new LLM benchmark examples.

## Actual measured example

The two channels are SILSO's daily sunspot number and number of observations used in computing that daily value. The primary column specification was checked. Both arrays use UTC days since 1970-01-01, with no interpolation. The saved source bytes are verified against the repository's original hash before parsing.

| Profile over lags -32 through +32 days | Selected lag | Correlation | Valid pairs at selected lag |
|---|---:|---:|---:|
| Sunspot number vs observation count | 0 days | -0.3383773568151839 | 365 |
| Sunspot autocorrelation | 0 days | 1 | 365 |

The first coefficient is a descriptive association involving the observation process; it does not establish a physical driver or causal relation. The autocorrelation's lag-zero maximum is an identity check, not a discovery. The complete profiles are retained in the output JSONL.

## Numerical regressions addressed

For twelve repeated copies of `1e12 + 0.1`, the original v1 adapter reported `r=1`, although Pearson correlation is undefined on a constant channel. The new path reports null with `constant` status. For `a[i]=1e16+2*i` and `b[i]=2*i`, `i=0..11`, v1 reported `0.9896727008433246`; the new path agrees with the independent result of one within floating-point tolerance. Scale controls include amplitudes `1e-200`, `1e200`, subnormal values, and values near the finite binary64 limit.

These are demonstrated reasons to use v2 for new measured work. They do not contradict the earlier study's independent coefficient audit on its actual rounded synthetic inputs. Its source remains frozen for reproduction; its documented numerical limits now accompany the reproduction instructions.

## Evidence and scope

Saved evidence is in [measured-series-evidence](measured-series-evidence/): `inputs.jsonl`, `outputs.jsonl`, `audit.json`, software logs, the software gate receipt, and `validation.json`. The audit records exact input/output hashes, source and implementation hashes, runtime versions, and the dirty working-tree status at execution. Validation occurred on the implemented working tree based on the starting revision above; this is not a claim that the old commit already contained v2. No pre-registered scientific effect or newly trained model was evaluated.

The original SILSO capture SHA-256 is `d9595d2eeb05af07fdc194604f95f2a9ec09243826a6b0a0ee9a3196b0a9c164`. It remains pinned; no live source data were fetched or repinned in the audit. Source attribution and CC BY-NC 4.0 terms are in the [tool guide](MEASURED_SERIES_TOOL.md#measured-source-and-attribution).

The generic software gate's `realDataValidation: NOT_RUN` is preserved as emitted; the separate measured-fixture numerical audit above supplies this continuation's narrower check. Source authentication, temporal-dependence-aware inference, calibrated lag uncertainty, physical GPU parity, a live LLM measured-data evaluation, and any learned modality remain outside this run.

**Next research decision:** freeze a practical, source-disjoint measured-data task and test whether a larger local model interprets correct, missing, ambiguous and shuffled measurements better than an equally informed baseline. Keep deterministic output as the benchmark for exact numerical questions. Geometry has not earned a default routing role: the preceding confirmation study tied geometry and entropy at 63/96.
