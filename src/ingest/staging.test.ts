import { describe, expect, it } from 'vitest';
import { ingestFile } from './index';
import { mapJsonl, parseStagingDocument, STAGING_VERSION, type StagingEnvelope } from './staging';
import { stagingSmoke } from './stagingSmoke';
import { parseCsvDocument } from './parseCsv';

function fixture(kind: StagingEnvelope['kind'] = 'series'): StagingEnvelope {
  const e: StagingEnvelope = { schemaVersion: STAGING_VERSION, name: 'Synthetic fixture', kind,
    provenance: { source: 'file:fixture', revision: 'fixture-v1', license: 'CC0-1.0', origin: 'synthetic' },
    units: { value: 'dimensionless' }, records: [] };
  if (kind === 'series') { e.units.time = 's'; e.records = Array.from({ length: 8 }, (_, t) => ({ t, value: Math.sin(t) })); }
  if (kind === 'sky') { e.units.angle = 'deg'; e.coordinateFrame = 'galactic'; e.records = [{ lon: 1, lat: 1, value: 3 }]; }
  if (kind === 'claims') { e.units.value = 'text'; e.records = [{ id: 'claim-1', text: 'A test claim, not evidence.' }]; }
  if (kind === 'cl') e.records = [0, 0, 2, 1, 0.5].map((value, ell) => ({ ell, value }));
  if (kind === 'alm') { e.harmonicConvention = 'real-orthonormal-condon-shortley'; e.records = [{ ell: 2, m: -1, a: 0.2 }]; }
  return e;
}

describe('versioned staging contract and CPU pipeline', () => {
  it.each(['series', 'sky', 'claims', 'cl', 'alm'] as const)('%s reaches existing engine with explicit validation limits', kind => {
    const e = fixture(kind);
    const result = ingestFile('checked.cmb.json', JSON.stringify(e)).result;
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.dataset!.epistemic).toBe('DERIVED/MEANING-MAP');
    expect(stagingSmoke(result.dataset!).status).toBe('pass');
    expect(result.dataset!.meta!.staging).toMatchObject({ scientificValidation: 'not-run', provenance: e.provenance });
  });

  it('converts small degree angles explicitly, where legacy guessing is ambiguous', () => {
    const result = parseStagingDocument(fixture('sky'), 'test');
    expect(result.dataset!.skySamples![0].theta).toBeCloseTo(Math.PI / 2 - Math.PI / 180, 12);
    expect(result.dataset!.skySamples![0].phi).toBeCloseTo(Math.PI / 180, 12);
  });
  it('converts degree and radian representations to the same coordinates', () => {
    const e = fixture('sky');
    const degrees = parseStagingDocument(e, 'd').dataset!.skySamples;
    e.units.angle = 'rad'; e.records = [{ lon: Math.PI / 180, lat: Math.PI / 180, value: 3 }];
    expect(parseStagingDocument(e, 'r').dataset!.skySamples).toEqual(degrees);
  });
  it.each([null, '', '1', NaN, Infinity, 1e40])('rejects invalid numeric value %s without partial admission', value => {
    const e = fixture(); e.records[3].value = value;
    const r = parseStagingDocument(e, 'bad');
    expect(r.ok).toBe(false); expect(r.dataset).toBeUndefined();
  });
  it.each([0, -1])('rejects duplicate or backwards times %s', t => {
    const e = fixture(); e.records[1].t = t;
    expect(parseStagingDocument(e, 'bad').ok).toBe(false);
  });
  it('rejects missing units, invalid modes, negative power, missing bins, duplicate claims, and unknown fields', () => {
    const bad: unknown[] = [];
    const series = fixture(); delete series.units.time; bad.push(series);
    const sky = fixture('sky'); delete sky.units.angle; bad.push(sky);
    const range = fixture('sky'); range.records[0].lat = 91; bad.push(range);
    const alm = fixture('alm'); alm.records[0].m = 3; bad.push(alm);
    const fractional = fixture('alm'); fractional.records[0].ell = 2.5; bad.push(fractional);
    const duplicateMode = fixture('alm'); duplicateMode.records.push({ ...duplicateMode.records[0] }); bad.push(duplicateMode);
    const power = fixture('cl'); power.records[2].value = -1; bad.push(power);
    const bins = fixture('cl'); bins.records.splice(2, 1); bad.push(bins);
    const claims = fixture('claims'); claims.records.push({ ...claims.records[0] }); bad.push(claims);
    bad.push({ ...fixture(), epistemic: 'PHYSICS-BACKED' });
    const field = fixture(); field.records[0].uncertainty = 0.1; bad.push(field);
    for (const input of bad) expect(parseStagingDocument(input, 'bad').ok).toBe(false);
  });
  it('requires an immutable HF revision but does not claim source verification', () => {
    const e = fixture(); e.provenance.source = 'hf://datasets/owner/data/series.jsonl'; e.provenance.revision = 'main';
    expect(parseStagingDocument(e, 'bad').ok).toBe(false);
    e.provenance.revision = 'a'.repeat(40);
    expect(parseStagingDocument(e, 'good').ok).toBe(true);
  });
  it('rejects array-valued discriminants instead of coercing them to labels', () => {
    const e = fixture('sky');
    for (const raw of [
      { ...e, kind: ['sky'] },
      { ...e, coordinateFrame: ['galactic'] },
      { ...e, units: { ...e.units, angle: ['deg'] } },
      { ...e, provenance: { ...e.provenance, origin: ['synthetic'] } },
    ]) expect(parseStagingDocument(raw, 'bad').ok).toBe(false);
  });
  it('fails closed for unknown versions and extensionless structured data', () => {
    const bad = JSON.stringify({ ...fixture(), schemaVersion: 'cmb.dataset/v2' });
    expect(ingestFile('pasted', bad).result.ok).toBe(false);
    expect(ingestFile('data.json', bad).result.ok).toBe(false);
    expect(ingestFile('data.jsonl', '{"x":1}\n{"x":2}').result.ok).toBe(false);
  });
  it('does not promote labels from legacy local input', () => {
    const r = ingestFile('old.json', JSON.stringify({ claims: ['test'], epistemic: 'PHYSICS-BACKED' })).result;
    expect(r.dataset!.epistemic).toBe('DERIVED/MEANING-MAP');
    expect(r.dataset!.meta!.declaredEpistemic).toBe('PHYSICS-BACKED');
  });
  it('does not turn missing CSV values into observations of zero', () => {
    const r = parseCsvDocument('t,value\n0,\n1,2', 'csv', 'test');
    expect(r.errors.length).toBe(1);
    expect(r.dataset!.series).toEqual([{ t: 1, value: 2 }]);
  });
  it('rejects excessive records and bytes', () => {
    const e = fixture(); e.records = Array.from({ length: 10001 }, (_, t) => ({ t, value: 1 }));
    expect(parseStagingDocument(e, 'bad').ok).toBe(false);
    expect(ingestFile('big.txt', 'a'.repeat(5 * 1024 * 1024 + 1)).result.ok).toBe(false);
  });
  it('replays fixed intake and CPU output deterministically', () => {
    const a = parseStagingDocument(fixture(), 'same', 0), b = parseStagingDocument(fixture(), 'same', 0);
    expect(a).toEqual(b); expect(stagingSmoke(a.dataset!)).toEqual(stagingSmoke(b.dataset!));
  });
});

describe('explicit JSONL adapter', () => {
  function mapping() {
    const { records: _records, ...envelope } = fixture();
    return { envelope, columns: { t: 'time_s', value: 'reading' } };
  }
  it('maps selected source columns and preserves provenance', () => {
    const raw = mapJsonl('{"time_s":0,"reading":2,"unused":"kept in raw artifact"}\n{"time_s":1,"reading":4}\n', mapping());
    expect(parseStagingDocument(raw, 'mapped').dataset!.series).toEqual([{ t: 0, value: 2 }, { t: 1, value: 4 }]);
  });
  it.each(['{"time_s":0}', 'null', '{invalid}', '{"time_s":0,"reading":"2"}'])('rejects invalid row %s', text => {
    let rejected = false;
    try { rejected = !parseStagingDocument(mapJsonl(text, mapping()), 'bad').ok; } catch { rejected = true; }
    expect(rejected).toBe(true);
  });
  it('requires complete explicit mappings', () => {
    expect(() => mapJsonl('{}', { envelope: fixture(), columns: { t: 't' } })).toThrow();
  });
});
