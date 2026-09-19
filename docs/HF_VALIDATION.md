# Executed Hugging Face intake validation

Date: 2026-09-19. Result: **selected numeric fields pass, with a source-metadata failure retained**.

Two public datasets were downloaded from immutable Hugging Face commits. Both complete source Parquet files match their pinned SHA-256 hashes and the Hub's LFS metadata. No HF Job, GPU rental, model training, or remote repository code was used.

## Data admitted

| Dataset | Pinned revision | Selection and interpretation | Result |
|---|---|---|---|
| [Planck PSZ2 catalog](https://huggingface.co/datasets/juliensimon/planck-sz2-clusters) | `d502c41c80614530aa6c5a99edc92a2c16166585` | All 1,653 rows: Galactic longitude/latitude and detection SNR. SNR is dimensionless, not CMB temperature. | Exact values retained; all converted angles checked against an independent calculation; CPU pipeline and browser intake pass. |
| [SILSO daily sunspot index](https://huggingface.co/datasets/juliensimon/silso-sunspot-number) | `9419617e92fe2c23abf247ee7ffbe4839b082d50` | All 365 dates in 2019: numeric index and UTC days since 2019-01-01. | Every date and value matches the primary SILSO CSV; CPU pipeline and browser intake pass. |

Downloadable/importable files are under `public/samples/hf/`. Their separate attribution and license terms are in that directory's README. Source schemas, row mappings, reports, hashes, and the primary 2019 comparison slice are retained in `docs/hf-evidence/`. Full source downloads remain reproducible from `examples/hf/sources.json`.

## A real validation finding

For every one of the selected **365 dates**, the HF file reports `is_provisional=true`. The [primary SILSO data specification](https://www.sidc.be/SILSO/infosndtot) defines CSV flag **1 as definitive** and **0 as provisional**; the primary file contains 1 for all those dates. Numeric sunspot values match exactly, but this metadata field fails comparison.

The adapter does not silently invert the flag. It preserves the HF field and primary interpretation in a sidecar, reports all affected dates, and admits only the checked date/value fields. The finding is scoped to this pinned file and 2019 selection; it is not a claim about every HF record or a proven explanation of the publisher's conversion code.

Planck's upstream [HEASARC catalog documentation](https://heasarc.gsfc.nasa.gov/W3Browse/all/plancksz2.html) supports the field interpretation and 1,653-row count. This run did not independently retrieve and compare every original observatory row. The HF-derived `is_confirmed` field is not used: having a redshift is not a replacement for the original catalog's full external-validation status.

## Numerical and browser evidence

All **29 independent numerical gates** passed:

| Check | Coverage | Maximum absolute error |
|---|---|---:|
| Coordinate conversion | All 1,653 catalog positions | 8.88e-16 radians |
| Sky SNR preservation | All 1,653 values | 0 |
| Daily time/value preservation | All 365 selected rows | 0 |
| Pearson and lag selection vs SciPy | 24 cases: 3 lengths × 4 transformations × 2 lag settings | 1.25e-14; all selected lags agree |
| Index interpolation vs NumPy | Both aligned vectors | 7.82e-14 |
| Real spherical harmonics vs SciPy | 87 evaluations through ell=64 | 2.41e-13 |

The transformation controls include positive/negative affine maps, a fixed-seed permutation, and a circular shift. These are numerical checks, **not** significance tests. Limits and selection rules are in `examples/hf/validation-plan.json`; the plan was fixed before the engine comparison, after source inspection. This is not a preregistered scientific study.

A headless Chromium 153 test of the production build also passed four checks: both files import with the correct counts; an invalid numeric row is rejected without adding a dataset; a correlation scan completes through the CPU worker; and no uncaught browser exceptions occur. The observed scan visited 35 targets. Initial attempts could not reach a separately launched local server; the final runner starts and stops its own preview server. That setup failure is retained in the evidence.

The engine still subsamples these 1,653 sky records to **25 meaning-map nodes**, and represents the 365-day series as a window-summary node. The full checked arrays remain in the import files. The display is not a lossless representation of the inputs.

## Reproduce

```bash
npm ci
python -m venv .venv-hf
# Activate the environment using the command appropriate to your shell.
python -m pip install -r scripts/hf-validation-requirements.txt
python scripts/hf-validation.py --out artifacts/hf-validation/new-run
```

Use a fresh output directory. The script validates pinned HF file identity, downloads primary SILSO data, maps selected fields with sidecars, invokes strict CMB staging, and compares engine results with independent NumPy/SciPy calculations. Downloads have a 5 MiB per-response cap. Upstream SILSO's current complete file can change; the captured primary 2019 slice and complete-download hash document this run's comparison.

For the browser test, install or select a Chromium binary, then:

```bash
npm run build
node scripts/check-hf-browser.mjs artifacts/hf-validation/new-run /absolute/path/to/chromium
```

The browser runner owns a local preview on port 5175 and shuts it down after the test. It runs with GPU disabled; this closes only the CPU browser/worker intake path.

## Gates still open

Source-metadata correctness is **not globally PASS**. Scientific inference/calibration, temporal-dependence-aware nulls and multiple-testing control, independent original Planck row comparison, physical GPU parity/performance, and proxy hardening remain open. The simulated CMB-spectrum benchmark considered during discovery was not downloaded or validated; no spectrum reconstruction or temperature-map claim is made.

The generic staging reports deliberately retain `sourceAssertionsVerified=false`: that parser cannot authenticate a source. The separate HF receipt establishes byte identity, and the primary SILSO comparison establishes the selected numerical field agreement. Those narrower results do not verify every source assertion.
