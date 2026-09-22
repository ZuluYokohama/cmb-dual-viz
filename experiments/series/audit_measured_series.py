#!/usr/bin/env python3
"""Offline independent audit of the v2 JSONL CLI; no application imports or LLM.

Run from any directory:
  python3 experiments/series/audit_measured_series.py --out /tmp/cmb-series-audit

The destination must not exist. The original source pin is immutable here: a
changed capture needs an explicit reviewed fixture update, never silent repinning.
Only the first two cases are untransformed measurements. All remaining cases are
derived or synthetic software controls. None is a reasoning or science benchmark.
"""

from __future__ import annotations

import argparse
from collections import Counter
from copy import deepcopy
import csv
from datetime import date, timedelta, datetime, timezone
from decimal import Decimal, localcontext
import hashlib
import io
import json
import math
from pathlib import Path
import platform
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[2]
SOURCE = "docs/hf-evidence/silso-primary-2019.csv"
MANIFEST = "docs/hf-evidence/SHA256SUMS.json"
EXPECTED_SOURCE_SHA = "d9595d2eeb05af07fdc194604f95f2a9ec09243826a6b0a0ee9a3196b0a9c164"
SOURCE_URL = "https://www.sidc.be/SILSO/DATA/SN_d_tot_V2.0.csv"
DOCUMENTATION_URL = "https://www.sidc.be/SILSO/infosndtot"
CLI = "scripts/cmb-measured-series-tool.mjs"
PRECISION = 100
TOLERANCE = 1e-12


def encode(value: object) -> bytes:
    return json.dumps(value, allow_nan=False, separators=(",", ":"), sort_keys=True).encode()


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def load_source() -> tuple[list[float], list[float], list[int], dict]:
    raw = (ROOT / SOURCE).read_bytes()
    digest = sha(raw)
    recorded = json.loads((ROOT / MANIFEST).read_text())[SOURCE]
    if digest != recorded or digest != EXPECTED_SOURCE_SHA:
        raise ValueError(f"Source pin mismatch: expected {EXPECTED_SOURCE_SHA}, "
                         f"manifest {recorded}, actual {digest}; refusing to repin")
    rows = list(csv.reader(io.StringIO(raw.decode("utf-8")), delimiter=";"))
    if len(rows) != 365:
        raise ValueError(f"Expected 365 source dates, got {len(rows)}")
    sunspots, observations, timestamps = [], [], []
    first = date(2019, 1, 1)
    epoch = date(1970, 1, 1)
    for index, row in enumerate(rows):
        if len(row) != 8:
            raise ValueError(f"CSV row {index + 1} has {len(row)} columns, expected 8")
        actual_date = date(*map(int, row[:3]))
        if actual_date != first + timedelta(days=index):
            raise ValueError(f"CSV is not a complete ordered daily grid at row {index + 1}")
        numbers = [float(item) for item in row]
        if not all(math.isfinite(number) for number in numbers):
            raise ValueError(f"Nonfinite CSV number at row {index + 1}")
        if any(number < 0 for number in numbers[4:7]):
            raise ValueError(f"Missing sentinel or negative measurement at row {index + 1}")
        if numbers[7] not in (0, 1):
            raise ValueError(f"Invalid provisional flag at row {index + 1}")
        sunspots.append(numbers[4])
        observations.append(numbers[6])
        timestamps.append((actual_date - epoch).days)
    return sunspots, observations, timestamps, {
        "path": SOURCE, "sha256": digest, "original_manifest": MANIFEST,
        "manifest_sha256": sha((ROOT / MANIFEST).read_bytes()),
        "last_source_commit": git("log", "-1", "--format=%H", "--", SOURCE),
        "upstream_url": SOURCE_URL, "column_documentation": DOCUMENTATION_URL,
        "column_numbers_are_one_based": True,
        "columns": {"5": "daily total sunspot number", "7": "observations used to compute daily value"},
        "dates": 365, "first_date": "2019-01-01", "last_date": "2019-12-31",
        "daily_grid_validated": True, "negative_sentinels": 0,
        "capture_policy": "Preserved repository capture; no new download or claim of current upstream revision",
    }


def make_cases(sun: list[float], obs: list[float], times: list[int], source: dict) -> tuple[list[dict], dict]:
    cases: list[dict] = []
    notes: dict = {}

    def add(identifier, a, b, *, origin="synthetic", timestamps=None, lag=8,
            minimum=20, missing="reject", description, expected_lag=None, columns=None):
        time_unit = "synthetic sample interval" if timestamps is None else "UTC days since 1970-01-01"
        timestamps = list(range(len(a))) if timestamps is None else timestamps
        query = {"schema": "cmb.series-query/v2", "id": identifier, "origin": origin,
                 "time": {"unit": time_unit, "step": 1}, "max_lag": lag,
                 "min_pairs": minimum, "missing": missing}
        for name, values in (("a", a), ("b", b)):
            if columns is not None:
                column = columns[0 if name == "a" else 1]
                provenance = {"source": f"{SOURCE_URL}#column-{column}",
                              "revision": "preserved 2019 capture at git:" + source["last_source_commit"],
                              "sha256": source["sha256"]}
                unit = "sunspot-number" if column == 5 else "observation-count"
            else:
                # This pin covers a canonical derived channel payload, not the original CSV.
                provenance = {"source": f"cmb-audit:{identifier}#{name}",
                              "revision": "deterministic-control-v1",
                              "sha256": sha(encode({"values": values, "timestamps": timestamps}))}
                unit = "control-unit"
            query[name] = {"values": values, "timestamps": timestamps[:],
                           "unit": unit, "provenance": provenance}
        cases.append(query)
        notes[identifier] = {"category": "measured software check" if origin == "measured" else "synthetic/derived software control",
                             "description": description}
        if expected_lag is not None:
            notes[identifier]["known_lag"] = expected_lag

    add("measured-silso-sunspots-observations", sun, obs, origin="measured", timestamps=times,
        lag=32, columns=(5, 7), description="Daily sunspot number versus observation count; observational association only")
    add("measured-silso-sunspots-autocorrelation", sun, sun, origin="measured", timestamps=times,
        lag=32, columns=(5, 5), description="Autocorrelation of the same captured daily sunspot channel", expected_lag=0)
    add("derived-silso-affine", [3*x + 7 for x in sun], [2*x - 4 for x in obs], timestamps=times,
        lag=32, description="Independent positive affine transforms of the two measured channels")
    add("derived-silso-polarity", sun, [-x for x in obs], timestamps=times,
        lag=32, description="Negated observation channel; correlation sign reversal")
    add("derived-silso-masked", [None if i % 11 == 0 else x for i, x in enumerate(sun)],
        [None if i % 13 == 0 else x for i, x in enumerate(obs)], timestamps=times,
        lag=32, missing="pairwise-complete", description="Deterministic missing-value masks on measured data")
    # Integer generator is independent of library PRNG versions.
    state, base = 1729, []
    for _ in range(96):
        state = (1664525 * state + 1013904223) % (2**32)
        base.append(float((state % 2001) - 1000))
    delayed = [None] * 7 + base[:-7]
    advanced = base[5:] + [None] * 5
    add("synthetic-delay-plus-7", base, delayed, lag=12, missing="pairwise-complete", expected_lag=7,
        description="Known delay b[t+7]=a[t]; null boundary padding does not fabricate samples")
    add("synthetic-advance-minus-5", base, advanced, lag=12, missing="pairwise-complete", expected_lag=-5,
        description="Known advance b[t-5]=a[t]; null boundary padding does not fabricate samples")
    add("synthetic-delay-inverted", base, [None if x is None else -2*x for x in delayed],
        lag=12, missing="pairwise-complete", expected_lag=7, description="Known delayed and inverted signal")
    for name, factor in (("small", 1e-200), ("large", 1e200)):
        add(f"synthetic-scale-{name}", [factor*x for x in base], [factor*x for x in reversed(base)],
            description=f"Finite amplitude stress control with scale {factor}")
    add("synthetic-offset", [1e150 + 1e135*x for x in base], [1e150 + 1e135*x for x in reversed(base)],
        description="Large common offset; oracle uses exact supplied binary64 values")
    add("synthetic-near-finite-limit", [1.7e305*x for x in base], [-1.7e305*x for x in base],
        description="Mixed signs near the finite binary64 limit; expected finite correlations")
    add("synthetic-subnormal", [float(i)*5e-324 for i in range(1, 97)],
        [float(97-i)*5e-324 for i in range(1, 97)], description="Positive subnormal representable values")
    add("synthetic-constant", [1e12 + 0.1]*96, base,
        description="Identical nonzero binary64 values must report constant, never apparent variance")
    add("synthetic-insufficient", [x if i < 10 else None for i, x in enumerate(base)], base,
        missing="pairwise-complete", description="Only ten usable values; all lags below required twenty pairs")
    add("synthetic-edge-support", base, list(reversed(base)), minimum=90,
        description="Large-lag rows fail minimum-pair support while central rows remain defined")
    add("synthetic-offset-short", [1e16 + 2*i for i in range(12)], [float(2*i) for i in range(12)],
        lag=0, minimum=3, expected_lag=0, description="Twelve representable differences at a 1e16 offset; correlation is one")
    add("synthetic-constant-short", [1e12 + 0.1]*12, [float(i) for i in range(12)],
        lag=0, minimum=3, description="Short nonzero constant control")
    return cases, notes


def reference_profile(query: dict) -> list[dict]:
    """Centered Decimal oracle. Never uses the JS algorithm or its scale/anchor."""
    rows = []
    a, b = query["a"]["values"], query["b"]["values"]
    with localcontext() as context:
        context.prec = PRECISION
        for lag in range(-query["max_lag"], query["max_lag"] + 1):
            pairs = [(Decimal.from_float(float(a[t])), Decimal.from_float(float(b[t+lag])))
                     for t in range(max(0, -lag), min(len(a), len(b)-lag))
                     if a[t] is not None and b[t+lag] is not None]
            row = {"lag": lag, "lag_time": lag*query["time"]["step"], "n_pairs": len(pairs),
                   "status": "insufficient_pairs", "correlation": None}
            if len(pairs) >= query["min_pairs"]:
                count = Decimal(len(pairs))
                mx = sum((x for x, _ in pairs), Decimal(0))/count
                my = sum((y for _, y in pairs), Decimal(0))/count
                centered = [(x-mx, y-my) for x, y in pairs]
                xx = sum((x*x for x, _ in centered), Decimal(0))
                yy = sum((y*y for _, y in centered), Decimal(0))
                if xx == 0 or yy == 0:
                    row["status"] = "constant"
                else:
                    xy = sum((x*y for x, y in centered), Decimal(0))
                    row["correlation"] = float(xy/(xx*yy).sqrt())
                    row["status"] = "ok"
            rows.append(row)
    return rows


def rejection_inputs(seed: dict) -> list[tuple[str, bytes]]:
    tests: list[tuple[str, bytes]] = []

    def mutate(name, change):
        value = deepcopy(seed)
        value["id"] = "reject-" + name
        change(value)
        tests.append((name, encode(value) + b"\n"))

    mutate("duplicate-timestamp", lambda q: q["a"]["timestamps"].__setitem__(1, q["a"]["timestamps"][0]))
    mutate("irregular-grid", lambda q: q["a"]["timestamps"].__setitem__(2, q["a"]["timestamps"][2] + .25))
    mutate("misaligned-grids", lambda q: q["b"].__setitem__("timestamps", [x+1 for x in q["b"]["timestamps"]]))
    mutate("timestamp-count", lambda q: q["a"]["timestamps"].pop())
    mutate("missing-rejected", lambda q: q["a"]["values"].__setitem__(0, None))
    mutate("boolean-value", lambda q: q["a"]["values"].__setitem__(0, True))
    mutate("string-value", lambda q: q["a"]["values"].__setitem__(0, "12"))
    mutate("invalid-sha", lambda q: q["a"]["provenance"].__setitem__("sha256", "not-a-sha256"))
    mutate("missing-provenance", lambda q: q["b"].pop("provenance"))
    mutate("empty-unit", lambda q: q["a"].__setitem__("unit", ""))
    mutate("zero-time-step", lambda q: q["time"].__setitem__("step", 0))
    mutate("fractional-lag", lambda q: q.__setitem__("max_lag", 1.5))
    mutate("unknown-missing-policy", lambda q: q.__setitem__("missing", "zero-fill"))
    mutate("wrong-schema", lambda q: q.__setitem__("schema", "cmb.series-query/v1"))
    tests.extend([("invalid-json", b'{"broken":\n'), ("invalid-utf8", b"\xff\n"),
                  ("oversized-line", b" " * (1024*1024 + 1) + encode(seed) + b"\n")])
    return tests


def audit_case(query: dict, result: dict, raw_input: bytes, notes: dict) -> dict:
    errors: list[str] = []
    reference = reference_profile(query)
    profile = result.get("profile", [])
    worst = {"absolute_error": 0.0, "lag": None}
    checked = 0
    if result.get("id") != query["id"]:
        errors.append("response ID mismatch")
    if result.get("input_sha256") != sha(raw_input):
        errors.append("response input_sha256 mismatch")
    if len(profile) != len(reference):
        errors.append(f"profile length {len(profile)} != {len(reference)}")
    for row, expected in zip(profile, reference):
        for key in ("lag", "lag_time", "n_pairs", "status"):
            if row.get(key) != expected[key]:
                errors.append(f"lag {expected['lag']}: {key} {row.get(key)!r} != {expected[key]!r}")
        actual, target = row.get("correlation"), expected["correlation"]
        if target is None:
            if actual is not None:
                errors.append(f"lag {expected['lag']}: undefined correlation must be null")
        elif isinstance(actual, bool) or not isinstance(actual, (int, float)) or not math.isfinite(actual):
            errors.append(f"lag {expected['lag']}: missing/nonfinite numeric correlation")
        else:
            checked += 1
            discrepancy = abs(actual-target)
            if discrepancy > worst["absolute_error"]:
                worst = {"absolute_error": discrepancy, "lag": expected["lag"],
                         "actual": actual, "decimal_reference": target}
            if discrepancy > TOLERANCE:
                errors.append(f"lag {expected['lag']}: absolute error {discrepancy:.17g} > {TOLERANCE}")
    zero = next((row for row in profile if row.get("lag") == 0), None)
    if result.get("zero_lag") != zero:
        errors.append("zero_lag must equal the full zero-lag profile row")
    valid = [row for row in profile if row.get("status") == "ok" and isinstance(row.get("correlation"), (int, float))]
    best = min(valid, key=lambda row: (-abs(row["correlation"]), row["lag"])) if valid else None
    if result.get("best") != best:
        errors.append("best violates maximum absolute correlation / smallest-lag exact-tie selection")
    if "known_lag" in notes and (best is None or best["lag"] != notes["known_lag"]):
        errors.append(f"known lag {notes['known_lag']} was not recovered")
    return {"id": query["id"], **notes, "pass": not errors, "errors": errors,
            "profile_rows_checked": min(len(profile), len(reference)), "numeric_correlations_checked": checked,
            "reference_status_counts": dict(Counter(row["status"] for row in reference)),
            "worst_discrepancy": worst, "best": best, "zero_lag": zero}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True, help="Fresh output directory; existing paths are rejected")
    args = parser.parse_args()
    if args.out.exists():
        parser.error(f"Output already exists: {args.out}; choose a fresh destination")
    sun, obs, times, source = load_source()
    cases, notes = make_cases(sun, obs, times, source)
    input_lines = [encode(query) for query in cases]
    inputs = b"\n".join(input_lines) + b"\n"
    args.out.mkdir(parents=True, exist_ok=False)
    (args.out / "inputs.jsonl").write_bytes(inputs)
    command = ["node", CLI]
    run = subprocess.run(command, input=inputs, capture_output=True, cwd=ROOT, timeout=90)
    (args.out / "outputs.jsonl").write_bytes(run.stdout)
    if run.returncode:
        raise RuntimeError(f"CLI rejected audit inputs ({run.returncode}): {run.stderr.decode(errors='replace')}")
    results = [json.loads(line) for line in run.stdout.splitlines()]
    errors = []
    if len(results) != len(cases):
        errors.append(f"Output record count {len(results)} != {len(cases)}")
    checks = [audit_case(query, result, raw, notes[query["id"]])
              for query, result, raw in zip(cases, results, input_lines)]
    rejection_checks = []
    for name, payload in rejection_inputs(cases[-2]):
        rejected = subprocess.run(command, input=payload, capture_output=True, cwd=ROOT, timeout=30)
        oversized = name == "oversized-line"
        # Preserve exact replay material without bloating the audit with 2 MiB of spaces.
        input_encoding = ({"leading_ascii_spaces": 1024*1024 + 1,
                           "following_hex": payload[1024*1024 + 1:].hex()} if oversized
                          else {"hex": payload.hex()})
        rejection_checks.append({"id": name, "pass": rejected.returncode != 0 and not rejected.stdout
                                 and (not oversized or b"1 MiB" in rejected.stderr),
                                 "input_encoding": input_encoding, "input_sha256": sha(payload),
                                 "returncode": rejected.returncode,
                                 "stdout": rejected.stdout.decode(errors="replace"),
                                 "stderr": rejected.stderr.decode(errors="replace")})
    pinned_files = [SOURCE, MANIFEST, CLI, "src/ingest/measuredSeriesTool.ts",
                    "experiments/series/audit_measured_series.py", "package.json", "package-lock.json"]
    file_hashes = {path: sha((ROOT/path).read_bytes()) for path in pinned_files if (ROOT/path).is_file()}
    statuses = Counter()
    for check in checks:
        statuses.update(check["reference_status_counts"])
    passed = not errors and all(check["pass"] for check in checks + rejection_checks)
    report = {
        "schema": "cmb.measured-series-audit/v1", "pass": passed, "errors": errors,
        "claim_scope": "Offline numerical/software verification on two measured channel queries and separately labeled controls; no LLM, causality, scientific discovery, or reasoning benchmark",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "runtime": {"python": sys.version, "node": subprocess.check_output(["node", "--version"], text=True).strip(),
                    "platform": platform.platform(), "git_base_revision": git("rev-parse", "HEAD"),
                    "git_status": git("status", "--porcelain"), "command": command,
                    "no_network": True, "no_llm_calls": True, "application_modules_imported_by_oracle": False},
        "oracle": {"method": "Centered Pearson using Decimal.from_float for exact binary64 inputs", "precision_decimal_digits": PRECISION,
                   "absolute_error_tolerance": TOLERANCE, "all_requested_lags_compared": True,
                   "lag_convention": "a[t] versus b[t+lag]", "undefined": "null with explicit status",
                   "best_rule": "largest absolute computed score; smallest lag on exact computed ties",
                   "timings": "CLI compute_ms is observational and excluded from numerical acceptance"},
        "counts": {"measured_queries": sum(q["origin"] == "measured" for q in cases),
                   "synthetic_or_derived_queries": sum(q["origin"] == "synthetic" for q in cases),
                   "profile_rows_checked": sum(check["profile_rows_checked"] for check in checks),
                   "numeric_correlations_checked": sum(check["numeric_correlations_checked"] for check in checks),
                   "reference_status_counts": dict(statuses), "rejection_cases": len(rejection_checks)},
        "worst_absolute_error": max((check["worst_discrepancy"]["absolute_error"] for check in checks), default=0),
        "cases": checks, "rejection_checks": rejection_checks,
        "file_sha256": file_hashes,
        "artifact_sha256": {"inputs.jsonl": sha(inputs), "outputs.jsonl": sha(run.stdout)},
    }
    (args.out / "audit.json").write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")
    print(json.dumps({"pass": passed, "out": str(args.out.resolve()), "counts": report["counts"],
                      "worst_absolute_error": report["worst_absolute_error"]}, indent=2))
    return 0 if passed else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, RuntimeError, OSError, subprocess.SubprocessError) as error:
        print(f"AUDIT_FAILED: {error}", file=sys.stderr)
        sys.exit(2)
