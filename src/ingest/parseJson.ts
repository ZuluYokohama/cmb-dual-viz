/**
 * Flexible JSON ingestion with validation + clear errors.
 * Schema: { type?, name?, points|series|claims|alm|cl, epistemic? }
 */

import type {
  ClaimItem,
  EpistemicLabel,
  IngestedDataset,
  SeriesPoint,
  SkySample,
} from './types';
import { parseStagingDocument } from './staging';

export interface ParseResult {
  ok: boolean;
  dataset?: IngestedDataset;
  errors: string[];
  residue: string[];
}

function asNumber(v: unknown, path: string, errors: string[]): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) {
    return Number(v);
  }
  errors.push(`${path}: expected finite number`);
  return null;
}

function parseSkyPoint(raw: unknown, i: number, errors: string[]): SkySample | null {
  if (!raw || typeof raw !== 'object') {
    errors.push(`points[${i}]: expected object`);
    return null;
  }
  const o = raw as Record<string, unknown>;
  const value = asNumber(o.value ?? o.v ?? o.temp ?? o.T, `points[${i}].value`, errors);
  if (value === null) return null;

  const sample: SkySample = { value };
  if (o.theta !== undefined || o.phi !== undefined) {
    const th = asNumber(o.theta, `points[${i}].theta`, errors);
    const ph = asNumber(o.phi, `points[${i}].phi`, errors);
    if (th === null || ph === null) return null;
    sample.theta = th;
    sample.phi = ph;
  } else if (o.lon !== undefined || o.lat !== undefined) {
    const lon = asNumber(o.lon ?? o.longitude, `points[${i}].lon`, errors);
    const lat = asNumber(o.lat ?? o.latitude, `points[${i}].lat`, errors);
    if (lon === null || lat === null) return null;
    sample.lon = lon;
    sample.lat = lat;
    // Convert degrees if |lon|>2π-ish looks like degrees
    const lonR = Math.abs(lon) > Math.PI + 0.1 ? (lon * Math.PI) / 180 : lon;
    const latR = Math.abs(lat) > Math.PI / 2 + 0.1 ? (lat * Math.PI) / 180 : lat;
    sample.theta = Math.PI / 2 - latR;
    sample.phi = lonR < 0 ? lonR + 2 * Math.PI : lonR;
  } else {
    errors.push(`points[${i}]: need (theta,phi) or (lon,lat)`);
    return null;
  }
  return sample;
}

function parseSeriesPoint(raw: unknown, i: number, errors: string[]): SeriesPoint | null {
  if (Array.isArray(raw) && raw.length >= 2) {
    const t = asNumber(raw[0], `series[${i}][0]`, errors);
    const value = asNumber(raw[1], `series[${i}][1]`, errors);
    if (t === null || value === null) return null;
    return { t, value };
  }
  if (!raw || typeof raw !== 'object') {
    errors.push(`series[${i}]: expected {t,value} or [t,value]`);
    return null;
  }
  const o = raw as Record<string, unknown>;
  const t = asNumber(o.t ?? o.time ?? o.x, `series[${i}].t`, errors);
  const value = asNumber(o.value ?? o.v ?? o.y, `series[${i}].value`, errors);
  if (t === null || value === null) return null;
  return { t, value };
}

function parseEpistemic(raw: unknown): EpistemicLabel {
  const s = String(raw ?? 'DERIVED/MEANING-MAP').toUpperCase();
  if (s.includes('EXAMPLE') && s.includes('PHYSICS')) return 'PHYSICS-BACKED (EXAMPLE)';
  if (s.includes('PHYSICS')) return 'PHYSICS-BACKED';
  if (s.includes('METAPHOR') || s.includes('RESEARCH')) return 'METAPHOR/RESEARCH';
  return 'DERIVED/MEANING-MAP';
}

/** Parse versioned or legacy JSON while preventing label promotion. */
export function parseJsonDocument(
  text: string,
  nameHint: string,
  id: string
): ParseResult {
  const errors: string[] = [];
  const residue: string[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`JSON parse error: ${(e as Error).message}`], residue: [] };
  }

  // Allow bare array of points / series
  let doc: Record<string, unknown>;
  if (Array.isArray(raw)) {
    doc = { type: 'auto', points: raw };
    residue.push('Bare array treated as points[] (or series if [t,value] pairs)');
  } else if (raw && typeof raw === 'object') {
    doc = raw as Record<string, unknown>;
  } else {
    return { ok: false, errors: ['Root must be object or array'], residue: [] };
  }

  const name = String(doc.name ?? nameHint ?? 'json-dataset');
  // Versioned inputs fail closed; never fall back to permissive legacy parsing.
  if ('schemaVersion' in doc) return parseStagingDocument(doc, id);
  const declaredEpistemic = parseEpistemic(doc.epistemic ?? doc.label);
  const epistemic = declaredEpistemic.startsWith('PHYSICS') ? 'DERIVED/MEANING-MAP' : declaredEpistemic;
  if (declaredEpistemic !== epistemic) residue.push('Input physics label retained as a source assertion only; external data stays DERIVED/MEANING-MAP');

  const skySamples: SkySample[] = [];
  const pointsSrc = doc.points ?? doc.sky ?? doc.samples;
  if (Array.isArray(pointsSrc)) {
    pointsSrc.forEach((p, i) => {
      const s = parseSkyPoint(p, i, errors);
      if (s) skySamples.push(s);
    });
  }

  const series: SeriesPoint[] = [];
  const seriesSrc = doc.series ?? doc.timeseries ?? doc.time_series;
  if (Array.isArray(seriesSrc)) {
    seriesSrc.forEach((p, i) => {
      const s = parseSeriesPoint(p, i, errors);
      if (s) series.push(s);
    });
  }

  // If bare array looked like [t,value] pairs, also fill series
  if (Array.isArray(raw) && skySamples.length === 0 && series.length === 0) {
    (raw as unknown[]).forEach((p, i) => {
      if (Array.isArray(p) && p.length >= 2) {
        const s = parseSeriesPoint(p, i, errors);
        if (s) series.push(s);
      }
    });
  }

  const claims: ClaimItem[] = [];
  const claimsSrc = doc.claims ?? doc.texts ?? doc.paragraphs;
  if (Array.isArray(claimsSrc)) {
    claimsSrc.forEach((c, i) => {
      if (typeof c === 'string') claims.push({ id: `c${i}`, text: c });
      else if (c && typeof c === 'object' && typeof (c as { text?: string }).text === 'string') {
        const o = c as { id?: string; text: string };
        claims.push({ id: o.id ?? `c${i}`, text: o.text });
      } else {
        errors.push(`claims[${i}]: expected string or {text}`);
      }
    });
  }
  if (typeof doc.text === 'string' && doc.text.trim()) {
    claims.push({ id: 'text0', text: doc.text });
  }

  let cl: number[] | undefined;
  if (Array.isArray(doc.cl) || Array.isArray(doc.Cl)) {
    const arr = (doc.cl ?? doc.Cl) as unknown[];
    cl = arr.map((v, i) => {
      const n = asNumber(v, `cl[${i}]`, errors);
      return n ?? 0;
    });
  }

  let alm: IngestedDataset['alm'];
  if (Array.isArray(doc.alm) || Array.isArray(doc.a_lm)) {
    const arr = (doc.alm ?? doc.a_lm) as unknown[];
    alm = [];
    arr.forEach((item, i) => {
      if (!item || typeof item !== 'object') {
        errors.push(`alm[${i}]: expected {ell,m,a}`);
        return;
      }
      const o = item as Record<string, unknown>;
      const ell = asNumber(o.ell ?? o.l, `alm[${i}].ell`, errors);
      const m = asNumber(o.m, `alm[${i}].m`, errors);
      const a = asNumber(o.a ?? o.re ?? o.value, `alm[${i}].a`, errors);
      if (ell !== null && m !== null && a !== null) {
        alm!.push({ ell, m, a });
      }
    });
  }

  const hasData =
    skySamples.length > 0 ||
    series.length > 0 ||
    claims.length > 0 ||
    (cl && cl.length > 0) ||
    (alm && alm.length > 0);

  if (!hasData) {
    errors.push(
      'No ingestible fields found. Expected one of: points, series, claims, cl, alm (or text).'
    );
  }

  // Soft residues for unknown keys
  const known = new Set([
    'type',
    'name',
    'epistemic',
    'label',
    'points',
    'sky',
    'samples',
    'series',
    'timeseries',
    'time_series',
    'claims',
    'texts',
    'paragraphs',
    'text',
    'cl',
    'Cl',
    'alm',
    'a_lm',
    'meta',
  ]);
  for (const k of Object.keys(doc)) {
    if (!known.has(k)) residue.push(`Unrecognized key "${k}" kept in meta residue`);
  }

  if (errors.length && !hasData) {
    return { ok: false, errors, residue };
  }

  const dataset: IngestedDataset = {
    id,
    name,
    type: 'json',
    epistemic,
    enabled: true,
    format: String(doc.type ?? 'json'),
    skySamples: skySamples.length ? skySamples : undefined,
    series: series.length ? series : undefined,
    claims: claims.length ? claims : undefined,
    cl,
    alm,
    meta: { ...(doc.meta as object), declaredEpistemic, residueKeys: residue },
    ingestedAt: Date.now(),
  };

  return {
    ok: true,
    dataset,
    errors: errors.filter((e) => !e.startsWith('No ingestible')),
    residue,
  };
}
