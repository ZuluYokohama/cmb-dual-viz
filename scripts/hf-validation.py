"""Pinned public HF downloads -> explicit adapters -> staging -> independent checks.

Run: python scripts/hf-validation.py --out artifacts/hf-validation/NEW_RUN
Install scripts/hf-validation-requirements.txt in a virtual environment first.
No remote code, model, credentials, or paid job is used.
"""
import argparse
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import platform
import subprocess
import time
import urllib.request

import numpy as np
import pyarrow
import pyarrow.parquet as pq
import scipy
from scipy.special import sph_harm_y
from scipy.stats import pearsonr

ROOT = Path(__file__).resolve().parent.parent
CAP = 5 * 1024 * 1024


def sha(data):
    """Return the SHA-256 hex digest for artifact identity checks."""
    return hashlib.sha256(data).hexdigest()


def verify_silso_primary(data, source):
    digest = sha(data)
    bytes_match = len(data) == source['upstreamBytes']
    sha256_match = digest == source['upstreamSha256']
    if not bytes_match or not sha256_match:
        raise ValueError('sunspots: primary source identity mismatch; follow the explicit refresh process in docs/HF_VALIDATION.md')
    return digest


def dump(path, data):
    """Write JSON evidence with stable formatting and no non-finite values."""
    path.write_text(json.dumps(data, indent=2, allow_nan=False, default=str) + '\n')


def download(url, path):
    """Download a bounded HTTPS resource and preserve its exact bytes."""
    if not url.startswith('https://'):
        raise ValueError('HTTPS required')
    chunks, total, start = [], 0, time.monotonic()
    with urllib.request.urlopen(url, timeout=30) as response:
        while True:
            chunk = response.read(min(65536, CAP + 1 - total))
            if not chunk:
                break
            total += len(chunk)
            if total > CAP or time.monotonic() - start > 90:
                raise ValueError('Download exceeded byte/time budget')
            chunks.append(chunk)
    data = b''.join(chunks)
    path.write_bytes(data)
    return data


def finite(*values):
    """Return whether every value is a finite, non-boolean number."""
    return all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in values)


def envelope(name, kind, source, records, units, **extra):
    """Build a versioned staging envelope with pinned source provenance."""
    return dict(schemaVersion='cmb.dataset/v1', name=name, kind=kind,
                provenance=dict(source=f"hf://datasets/{source['repo']}/{source['path']}",
                                revision=source['revision'], license=source['license'], origin='measured'),
                units=units, records=records, **extra)


def lag_reference(a, b, max_lag):
    """Compute an independent best lagged Pearson reference result."""
    best_score, best_lag = 0.0, 0
    for lag in range(-max_lag, max_lag + 1):
        # Independently form overlap; matches documented positive lag convention.
        start_a, start_b = max(0, -lag), max(0, lag)
        n = min(len(a) - start_a, len(b) - start_b)
        if n < 4:
            continue
        x, y = a[start_a:start_a + n], b[start_b:start_b + n]
        score = 0.0 if np.ptp(x) == 0 or np.ptp(y) == 0 else float(pearsonr(x, y).statistic)
        if abs(score) > abs(best_score):
            best_score, best_lag = score, lag
    return dict(score=best_score, lag=best_lag)


def references(values, sky, plan):
    """Generate independent numerical reference cases from validated inputs."""
    rng = np.random.default_rng(plan['controls']['seed'])
    cases = []
    for n in plan['controls']['seriesLengths']:
        a = np.asarray(values[:n], dtype=np.float64)
        transforms = {'positive-affine': 3 * a + 8, 'negative-affine': -2 * a + 5,
                      'seeded-permutation': rng.permutation(a), 'circular-shift-7': np.roll(a, 7)}
        for label, b in transforms.items():
            for lag in plan['controls']['maxLags']:
                cases.append(dict(name=f'{label}-{n}-lag{lag}', a=a.tolist(), b=b.tolist(), maxLag=lag,
                                  expected=lag_reference(a, b, lag)))
    a, b = np.asarray(values, dtype=float), np.asarray(values[::3], dtype=float)
    aligned = [np.interp(np.linspace(0, len(x) - 1, 32), np.arange(len(x)), x).tolist() for x in [a, b]]
    harmonics = []
    for ell in plan['controls']['harmonicEll']:
        for m in sorted(set([-ell, -1, 0, 1, ell])):
            if abs(m) > ell:
                continue
            for theta, phi in [(0.2, 0.7), (1.2, 2.8), (math.pi - 0.01, 5.1)]:
                z = sph_harm_y(ell, abs(m), theta, phi)
                value = float(z.real if m == 0 else math.sqrt(2) * (z.real if m > 0 else z.imag))
                harmonics.append(dict(ell=ell, m=m, theta=theta, phi=phi, expected=value))
    coords = [dict(theta=math.radians(90 - r['lat']), phi=math.radians(r['lon'] % 360), value=r['value']) for r in sky]
    return dict(tolerances=plan['tolerances'], pearson=cases, harmonics=harmonics, sky=coords,
                alignment=dict(a=a.tolist(), b=b.tolist(), targetLen=32, expected=aligned))


def main():
    """Validate pinned datasets and emit reproducible intake evidence."""
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=False)
    sources = json.loads((ROOT / 'examples/hf/sources.json').read_text())
    plan = json.loads((ROOT / 'examples/hf/validation-plan.json').read_text())
    report = dict(status='RUNNING', at=dt.datetime.now(dt.timezone.utc).isoformat(),
                  codeCommit=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
                  python=platform.python_version(), numpy=np.__version__, scipy=scipy.__version__, pyarrow=pyarrow.__version__,
                  adapterSha256=sha(Path(__file__).read_bytes()), planSha256=sha((ROOT / 'examples/hf/validation-plan.json').read_bytes()),
                  sources={}, findings=[], scientificInference='NOT_RUN', physicalGpu='NOT_RUN')
    try:
        tables = {}
        for key, spec in sources.items():
            url = f"https://huggingface.co/datasets/{spec['repo']}/resolve/{spec['revision']}/{spec['path']}"
            path = out / f'{key}.parquet'
            raw = download(url, path)
            if len(raw) != spec['bytes'] or sha(raw) != spec['sha256']:
                raise ValueError(f'{key}: source identity mismatch')
            metadata_url = f"https://huggingface.co/api/datasets/{spec['repo']}/revision/{spec['revision']}?blobs=true"
            metadata = json.loads(download(metadata_url, out / f'{key}-hub-metadata.json'))
            entry = next(x for x in metadata['siblings'] if x['rfilename'] == spec['path'])
            if metadata['sha'] != spec['revision'] or entry['lfs']['sha256'] != sha(raw):
                raise ValueError(f'{key}: Hub metadata mismatch')
            table = pq.read_table(path)
            tables[key] = table.to_pylist()
            report['sources'][key] = dict(**spec, fetchedUrl=url, hfByteIdentity='PASS', rows=table.num_rows, columns=table.column_names)
            print(f'{key}: HF commit + LFS SHA-256 verified, {table.num_rows} rows', flush=True)

        sky, sky_ids = [], []
        for i, row in enumerate(tables['planck']):
            lon, lat, value = row['lii'], row['bii'], row['snr']
            if not finite(lon, lat, value) or not 0 <= lon < 360 or not -90 <= lat <= 90 or value <= 0:
                raise ValueError(f'planck: invalid selected fields at row {i}')
            sky.append(dict(lon=(lon + 180) % 360 - 180, lat=lat, value=value))
            sky_ids.append(dict(row=i, name=row['name']))
        if len(sky) != 1653 or len({r['name'] for r in sky_ids}) != 1653:
            raise ValueError('Planck expected 1653 unique catalog sources')
        dump(out / 'planck-identities.json', sky_ids)
        sky_envelope = envelope('Planck PSZ2 catalog detection SNR — not a CMB temperature map', 'sky', sources['planck'], sky,
                                dict(value='dimensionless detection SNR', angle='deg'), coordinateFrame='galactic')
        dump(out / 'planck.cmb.json', sky_envelope)
        report['sources']['planck'].update(selectedRows=len(sky), skippedRows=0,
            conversion='lii -> signed Galactic longitude; bii -> latitude; snr -> value; no coordinate frame rotation',
            originalObservatoryRowComparison='NOT_RUN')

        selected = sorted([r for r in tables['sunspots'] if r['date'].year == 2019], key=lambda r: r['date'])
        epoch = dt.date(2019, 1, 1)
        primary_bytes = download(sources['sunspots']['upstream'], out / 'silso-primary.csv')
        primary_sha256 = verify_silso_primary(primary_bytes, sources['sunspots'])
        primary = {}
        for line in primary_bytes.decode('ascii').splitlines():
            fields = line.split(';')
            if fields[0] == '2019':
                date = dt.date(*map(int, fields[:3]))
                if date in primary:
                    raise ValueError('Duplicate primary date')
                primary[date] = dict(value=float(fields[4]), provisional=int(fields[7]) == 0)
        if len(selected) != 365 or len(primary) != 365:
            raise ValueError('Expected complete 2019 in both sources')
        series, provenance_rows, flag_mismatches = [], [], []
        for i, row in enumerate(selected):
            date, value = row['date'].date(), row['sunspot_number']
            if (date - epoch).days != i or not finite(value) or value < 0 or value != primary[date]['value']:
                raise ValueError(f'SILSO date/value validation failed: {date}')
            series.append(dict(t=i, value=value))
            provenance_rows.append(dict(date=date.isoformat(), **{k: v for k, v in row.items() if k != 'date'},
                                        primary_is_provisional=primary[date]['provisional']))
            if row['is_provisional'] != primary[date]['provisional']:
                flag_mismatches.append(date.isoformat())
        dump(out / 'sunspots-row-provenance.json', provenance_rows)
        dump(out / 'sunspots.cmb.json', envelope('SILSO 2019 daily sunspot index — numeric fields independently checked',
             'series', sources['sunspots'], series, dict(value='SILSO international sunspot number v2', time='UTC days since 2019-01-01')))
        report['sources']['sunspots'].update(selectedRows=len(series), selection='2019-01-01..2019-12-31 inclusive',
             primaryUrl=sources['sunspots']['upstream'], primaryByteIdentity='PASS', primarySha256=primary_sha256,
             numericPrimaryComparison='PASS', numericMismatches=0, flagMismatches=len(flag_mismatches),
             metadataGate='FAIL' if flag_mismatches else 'PASS',
             policy='Only date and numeric value are admitted; disputed flag is preserved in sidecar and excluded')
        if flag_mismatches:
            report['findings'].append(dict(id='HF-SILSO-FLAG', severity='source-semantic-failure',
                affectedDates=flag_mismatches, detail='HF is_provisional disagrees with primary SILSO indicator. No silent correction.'))

        dump(out / 'references.json', references([r['value'] for r in series], sky, plan))
        for key in sources:
            subprocess.run(['node', 'scripts/stage-data.mjs', str(out / f'{key}.cmb.json'), '--out', str(out / f'{key}-staged')], cwd=ROOT, check=True)
        subprocess.run(['node', 'scripts/check-hf.mjs', str(out)], cwd=ROOT, check=True)
        report['status'] = 'PASS_WITH_SOURCE_METADATA_FINDING' if flag_mismatches else 'PASS_FOR_SELECTED_FIELDS'
        report['numericalReferenceChecks'] = json.loads((out / 'numerical-checks.json').read_text())
        print(report['status'], flush=True)
    except Exception as exc:
        report['status'] = 'FAIL'
        report['error'] = f'{type(exc).__name__}: {exc}'
        raise
    finally:
        report['artifacts'] = {str(p.relative_to(out)): dict(bytes=p.stat().st_size, sha256=sha(p.read_bytes()))
                               for p in sorted(out.rglob('*')) if p.is_file() and p.name != 'report.json'}
        dump(out / 'report.json', report)


if __name__ == '__main__':
    main()
