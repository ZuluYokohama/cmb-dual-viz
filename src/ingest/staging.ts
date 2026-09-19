/** Strict, atomic research intake. Passing this contract is not scientific validation. */
import type { IngestedDataset } from './types';
import type { ParseResult } from './parseJson';

export const STAGING_VERSION = 'cmb.dataset/v1';
export const MAX_STAGING_BYTES = 5 * 1024 * 1024;
export const MAX_STAGING_RECORDS = 10_000;
export type StagingKind = 'series' | 'sky' | 'claims' | 'cl' | 'alm';
type Obj = Record<string, unknown>;

export interface StagingEnvelope {
  schemaVersion: typeof STAGING_VERSION;
  name: string;
  kind: StagingKind;
  provenance: {
    source: string;
    revision: string;
    license: string;
    origin: 'synthetic' | 'measured' | 'derived';
  };
  units: { value: string; time?: string; angle?: 'deg' | 'rad' };
  /** Required for sky: frame is preserved, never silently transformed. */
  coordinateFrame?: 'galactic' | 'icrs' | 'unspecified';
  /** Only this real coefficient convention is supported; complex alm needs an adapter. */
  harmonicConvention?: 'real-orthonormal-condon-shortley';
  records: Obj[];
}

function object(v: unknown): v is Obj {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function nonempty(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}
function number(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Number.isFinite(Math.fround(v));
}
function oneOf(v: unknown, choices: string[]): boolean {
  return typeof v === 'string' && choices.includes(v);
}
function keys(o: Obj, allowed: string[], path: string, errors: string[]) {
  for (const k of Object.keys(o)) {
    if (!allowed.includes(k)) errors.push(`${path}.${k}: unsupported field (no silent data loss)`);
  }
}

export function parseStagingDocument(raw: unknown, id: string, at = Date.now()): ParseResult {
  const errors: string[] = [];
  const residue: string[] = [];
  const reject = (): ParseResult => ({ ok: false, errors, residue });
  if (!object(raw)) return { ok: false, errors: ['Expected staging object'], residue };
  keys(raw, ['schemaVersion', 'name', 'kind', 'provenance', 'units', 'coordinateFrame', 'harmonicConvention', 'records'], 'root', errors);
  if (raw.schemaVersion !== STAGING_VERSION) errors.push(`schemaVersion: expected ${STAGING_VERSION}`);
  if (!nonempty(raw.name)) errors.push('name: required nonempty string');
  if (!oneOf(raw.kind, ['series', 'sky', 'claims', 'cl', 'alm'])) errors.push('kind: unsupported data structure');
  const provenance = object(raw.provenance) ? raw.provenance : {};
  keys(provenance, ['source', 'revision', 'license', 'origin'], 'provenance', errors);
  for (const k of ['source', 'revision', 'license']) {
    if (!nonempty(provenance[k])) errors.push(`provenance.${k}: required nonempty string`);
  }
  if (!oneOf(provenance.origin, ['synthetic', 'measured', 'derived'])) errors.push('provenance.origin: expected synthetic, measured, or derived');
  if (typeof provenance.source === 'string' && /^(hf:\/\/|https:\/\/huggingface\.co\/)/i.test(provenance.source)) {
    if (!/^[a-f0-9]{40}$/i.test(String(provenance.revision))) errors.push('provenance.revision: Hugging Face source requires a full 40-character commit SHA');
  }
  const units = object(raw.units) ? raw.units : {};
  keys(units, ['value', 'time', 'angle'], 'units', errors);
  if (!nonempty(units.value)) errors.push('units.value: required (use dimensionless or text where appropriate)');
  if (raw.kind === 'series' && !nonempty(units.time)) errors.push('units.time: explicit time unit required');
  if (raw.kind === 'sky') {
    if (!oneOf(units.angle, ['deg', 'rad'])) errors.push('units.angle: expected deg or rad');
    if (!oneOf(raw.coordinateFrame, ['galactic', 'icrs', 'unspecified'])) errors.push('coordinateFrame: expected galactic, icrs, or unspecified');
  } else if (raw.coordinateFrame !== undefined || units.angle !== undefined) errors.push('coordinateFrame/units.angle: only valid for sky');
  if (raw.kind !== 'series' && units.time !== undefined) errors.push('units.time: only valid for series');
  if (raw.kind === 'alm' && raw.harmonicConvention !== 'real-orthonormal-condon-shortley') errors.push('harmonicConvention: explicit supported real basis required');
  if (raw.kind !== 'alm' && raw.harmonicConvention !== undefined) errors.push('harmonicConvention: only valid for alm');
  if (!Array.isArray(raw.records) || raw.records.length === 0 || raw.records.length > MAX_STAGING_RECORDS) errors.push(`records: expected 1..${MAX_STAGING_RECORDS} rows`);
  if (errors.length) return reject();

  const rows = raw.records as unknown[];
  const dataset: IngestedDataset = {
    id, name: raw.name as string, type: 'json', epistemic: 'DERIVED/MEANING-MAP',
    enabled: true, format: STAGING_VERSION, ingestedAt: at,
    meta: { staging: { schemaVersion: STAGING_VERSION, provenance: { ...provenance }, units: { ...units },
      coordinateFrame: raw.coordinateFrame, harmonicConvention: raw.harmonicConvention,
      verification: 'contract-pass', scientificValidation: 'not-run' } },
  };
  const seen = new Set<string>();
  let previousTime = -Infinity;
  const valueAt = (row: Obj, field: string, path: string): number => {
    const v = row[field];
    if (!number(v)) errors.push(`${path}.${field}: expected finite numeric value representable in float32`);
    return number(v) ? v : NaN;
  };
  rows.forEach((r, i) => {
    const p = `records[${i}]`;
    if (!object(r)) { errors.push(`${p}: expected object`); return; }
    if (raw.kind === 'series') {
      keys(r, ['t', 'value'], p, errors);
      const t = valueAt(r, 't', p), value = valueAt(r, 'value', p);
      if (t <= previousTime) errors.push(`${p}.t: must be strictly increasing; sort and resolve duplicates upstream`);
      previousTime = t;
      (dataset.series ??= []).push({ t, value });
    } else if (raw.kind === 'sky') {
      keys(r, ['lon', 'lat', 'value'], p, errors);
      const lon = valueAt(r, 'lon', p), lat = valueAt(r, 'lat', p), value = valueAt(r, 'value', p);
      const scale = units.angle === 'deg' ? Math.PI / 180 : 1;
      const maxLon = units.angle === 'deg' ? 180 : Math.PI;
      const maxLat = units.angle === 'deg' ? 90 : Math.PI / 2;
      if (Math.abs(lon) > maxLon || Math.abs(lat) > maxLat) errors.push(`${p}: lon/lat outside declared angular range`);
      (dataset.skySamples ??= []).push({ theta: Math.PI / 2 - lat * scale, phi: ((lon * scale) + 2 * Math.PI) % (2 * Math.PI), value });
    } else if (raw.kind === 'claims') {
      keys(r, ['id', 'text'], p, errors);
      if (!nonempty(r.id) || !nonempty(r.text)) errors.push(`${p}: nonempty string id and text required`);
      if (seen.has(String(r.id))) errors.push(`${p}.id: duplicate id`);
      seen.add(String(r.id));
      (dataset.claims ??= []).push({ id: String(r.id), text: String(r.text) });
    } else if (raw.kind === 'cl') {
      keys(r, ['ell', 'value'], p, errors);
      const ell = valueAt(r, 'ell', p), value = valueAt(r, 'value', p);
      if (!Number.isInteger(ell) || ell !== i) errors.push(`${p}.ell: C_l rows must be contiguous from ell=0; missing bins cannot be zero-filled`);
      if (value < 0) errors.push(`${p}.value: C_l must be nonnegative`);
      (dataset.cl ??= []).push(value);
    } else if (raw.kind === 'alm') {
      keys(r, ['ell', 'm', 'a'], p, errors);
      const ell = valueAt(r, 'ell', p), m = valueAt(r, 'm', p), a = valueAt(r, 'a', p);
      if (!Number.isInteger(ell) || ell < 0 || !Number.isInteger(m) || Math.abs(m) > ell) errors.push(`${p}: integer ell>=0 and |m|<=ell required`);
      const key = `${ell}:${m}`;
      if (seen.has(key)) errors.push(`${p}: duplicate harmonic mode`);
      seen.add(key);
      (dataset.alm ??= []).push({ ell, m, a });
    }
  });
  if (errors.length) return reject();
  residue.push('Contract verified; scientific validity and source assertions remain unverified.');
  if (dataset.series) residue.push('Current correlates use index alignment; timestamps and units do not calibrate inference.');
  if (dataset.claims && dataset.claims.length > 40) residue.push('Meaning map displays only the first 40 claims; full input remains in staging.');
  if (dataset.skySamples) residue.push('Sky meaning nodes are subsampled; no coordinate-frame transformation or measured sky reconstruction is performed.');
  if (dataset.alm) residue.push('alm input is summarized by multipole energy; it does not replace the synthesized sky coefficients.');
  return { ok: true, dataset, errors, residue };
}

/** Explicit mapping only. Never guesses columns, coerces strings, or drops bad rows. */
export function mapJsonl(text: string, mapping: unknown): unknown {
  if (!object(mapping) || !object(mapping.envelope) || !object(mapping.columns)) throw new Error('Mapping requires envelope and columns objects');
  const errors: string[] = [];
  keys(mapping, ['envelope', 'columns'], 'mapping', errors);
  if ('records' in mapping.envelope) errors.push('mapping.envelope.records: supplied by JSONL, must be omitted');
  const fields: Record<string, string[]> = { series: ['t', 'value'], sky: ['lon', 'lat', 'value'], claims: ['id', 'text'], cl: ['ell', 'value'], alm: ['ell', 'm', 'a'] };
  const expected = typeof mapping.envelope.kind === 'string' ? fields[mapping.envelope.kind] : undefined;
  if (!expected) throw new Error('Mapping envelope has unsupported kind');
  keys(mapping.columns, expected, 'columns', errors);
  for (const k of expected) if (!nonempty(mapping.columns[k])) errors.push(`columns.${k}: explicit source column required`);
  if (errors.length) throw new Error(errors.join('; '));
  const entries = Object.entries(mapping.columns) as [string, string][];
  const records: Obj[] = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let row: unknown;
    try { row = JSON.parse(line); } catch { throw new Error(`JSONL line ${index + 1}: invalid JSON`); }
    if (!object(row)) throw new Error(`JSONL line ${index + 1}: expected object`);
    const record: Obj = {};
    for (const [to, from] of entries) {
      if (!Object.prototype.hasOwnProperty.call(row, from)) throw new Error(`JSONL line ${index + 1}: missing column ${from}`);
      record[to] = row[from];
    }
    records.push(record);
    if (records.length > MAX_STAGING_RECORDS) throw new Error(`JSONL exceeds ${MAX_STAGING_RECORDS} rows`);
  }
  return { ...mapping.envelope, records };
}
