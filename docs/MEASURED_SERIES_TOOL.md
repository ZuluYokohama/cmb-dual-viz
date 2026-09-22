# Measured-series numerical tool

The next step after the [controlled synthetic study](CMB_TOOL_STUDY_RESULTS.md) is a deterministic, timestamp-aware measurement interface. It accepts measured series, retains missing-data positions, and returns every requested lag with its valid-pair count. This is a numerical software extension; no model weights, language representation, or inference policy change here.

## Run and reproduce

After `npm ci`, send JSONL to the separate v2 command:

```bash
node scripts/cmb-measured-series-tool.mjs < docs/measured-series-evidence/inputs.jsonl
python experiments/series/audit_measured_series.py --out artifacts/measured-series/new-run
```

The auditor requires a fresh output directory and uses Python's standard library. It checks the preserved SILSO source hash, creates the requests, invokes the actual CLI, and independently recomputes every coefficient with high-precision Decimal arithmetic. Its transformed fixtures are software controls, not additional independent observations. See [the continuation results](MEASURED_SERIES_RESULTS.md) and the saved audit receipt for the executed run.

## Request contract

Each request has exactly these fields:

| Field | Contract |
|---|---|
| `schema` | `cmb.series-query/v2` |
| `id` | Bounded machine-readable identity |
| `origin` | `measured` or `synthetic`; caller declaration |
| `a`, `b` | Channel objects, described below |
| `time` | `{ "unit": "UTC days since 2019-01-01", "step": 1 }`, for example |
| `max_lag` | Integer from zero to the smaller of 64 and floor(length/3) |
| `min_pairs` | Integer from 3 through input length; caller sets the minimum retained overlap |
| `missing` | `reject` or `pairwise-complete` |

Each channel has exactly `values`, `timestamps`, `unit`, and `provenance`. Both channels have 12–4096 samples. Values are finite numbers or explicit JSON `null`; timestamps are finite numbers. Provenance has exactly `source`, `revision`, and a 64-character hexadecimal `sha256`. Use a source fragment or field-qualified identifier to distinguish selected columns. The hash identifies declared source bytes, not an independently authenticated publisher; `source_assertions_verified` remains false in the measurement.

Timestamp arrays must describe the same increasing regular grid under the shared time unit and epoch. The validator uses a small floating-point tolerance and rejects timestamps whose magnitude cannot adequately resolve the declared step. It performs no interpolation, truncation, sorting, unit conversion, or gap compression. Human-readable unit and provenance strings remain caller assertions.

`missing: reject` rejects any null. `pairwise-complete` retains positions and uses a pair only when both values at that lag are present. It reports the number retained at each lag. A dataset-specific missing sentinel such as SILSO's `-1` must be mapped to null by a source adapter before this generic interface; negative numbers are otherwise legitimate measurements. Missingness can bias a correlation, and pair counts are not independent effective sample sizes.

Input remains bounded to 1 MiB per JSONL record. Invalid JSON, UTF-8, schema, or numeric shape stops the process with a nonzero exit code. Earlier valid lines may already have produced outputs, so a consumer must inspect exit status and match identities rather than assuming a batch is atomic. Output includes `input_sha256` of the exact input bytes without the LF/CRLF separator and a diagnostic `compute_ms`; process startup and compilation are additional costs.

## Measurement semantics

Positive lag pairs `a[t]` with `b[t + lag]`. `lag_time` is lag times the declared step. Each profile row reports `lag`, `lag_time`, `n_pairs`, `correlation`, and `status`. Undefined results remain null with a reason: insufficient pairs, constant data, or a numerical failure. A valid input with no usable lag returns an unavailable measurement, not a fabricated zero.

The kernel detects exactly constant input, subtracts an anchor, scales deviations, and uses compensated reductions to avoid the old absolute denominator cutoff and large-offset summation failure. Floating-point values already rounded at ingestion cannot be recovered by any correlation algorithm.

The selected `best` row maximizes absolute correlation among usable lags, with ascending-lag exact tie-breaking. The complete profile, zero-lag row, near-tie information, and boundary warning support interpretation. A selected lag is a descriptive maximum over a requested range; ties, broad peaks, and boundary winners do not identify a unique physical delay. The numeric near-tie threshold is a rounding diagnostic, not a statistical confidence interval.

The interface supplies no p-value, causal conclusion, or significance label. Temporal dependence, lag searching, trends, multiple comparisons, and source dependence require a separate inferential model. `min_pairs` is an admission setting, not a statistical guarantee.

## Relationship to the frozen study and dashboard

The original `cmb.series-query/v1` command and kernel remain at their study implementation so its source hashes and results can be reproduced. Use v2 for new measured-series work. Direct continuation diagnostics found two v1 problems outside the original restricted fixtures:

| Input at lag zero | Correct result | Observed v1 result |
|---|---|---|
| Twelve identical values `1e12 + 0.1` in each array | Undefined Pearson: constant input | `r = 1` |
| `a[i] = 1e16 + 2*i`, `b[i] = 2*i`, `i = 0..11` | `r = 1` | `r = 0.9896727008433246` |

The v1 absolute denominator threshold also rejects sufficiently small rescalings of valid arrays. These findings do not establish an error in the recorded 96-case study: that study's actual coefficients were independently verified against its stored inputs. They do limit reuse of its numerical adapter beyond those fixtures. The shared dashboard math is unchanged and retains these limitations.

The dashboard's existing meaning-map comparison path drops timestamps and aligns by index. This CLI is a separate measurement path and does not silently upgrade that display into a timestamp-aware analysis tool. Source hashes refer to preserved observations; display coordinates, handcrafted embeddings, and model state are never used as numerical labels here.

## Measured source and attribution

The offline examples use the preserved 2019 daily SILSO CSV already checked into `docs/hf-evidence/`. Its existing pin is verified before parsing. The source specification identifies column 5 as the daily sunspot number and column 7 as the number of observations used to compute that day's value. Their comparison is a descriptive data-quality example: observation count is part of the measurement process, not an independent physical driver. Autocorrelation is also provided as a numerical check and necessarily peaks at lag zero.

Source: WDC-SILSO, Royal Observatory of Belgium, Brussels, 2019, [DOI](https://doi.org/10.24414/qnza-ac80), [daily data specification](https://www.sidc.be/SILSO/infosndtot). SILSO data retains [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). Adaptations select two columns, express dates as UTC day offsets, and add separately identified transformations for numerical tests. The earlier disputed HF provisional-status field remains excluded; this continuation does not resolve that publisher metadata issue. The preserved CSV is not a fresh download or a new independent observational replication.

## Next decision

This completes the input and numerical reliability stage for regular measured series. A prospective LLM experiment should next test whether a model can interpret these measurements on a source-disjoint practical task, including unavailable and ambiguous results. Preserve the deterministic answer route as a baseline; charge actual tool and model costs. A larger-model or learned-modality claim still requires a separate frozen experiment against equally informed text/tool baselines.
