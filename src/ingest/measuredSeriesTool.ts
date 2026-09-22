/**
 * Descriptive Pearson lag profiles for explicitly declared, regular-grid series.
 * This v2 contract is independent of the frozen synthetic v1 bridge.
 * Provenance is supplied by the caller: this module neither retrieves sources nor
 * verifies the asserted revision, content hash, origin, or physical interpretation.
 */

export interface SeriesProvenance {
  source: string;
  revision: string;
  sha256: string;
}

export interface MeasuredSeriesChannel {
  values: (number | null)[];
  timestamps: number[];
  unit: string;
  provenance: SeriesProvenance;
}

export interface MeasuredSeriesQuery {
  schema: 'cmb.series-query/v2';
  id: string;
  origin: 'measured' | 'synthetic';
  a: MeasuredSeriesChannel;
  b: MeasuredSeriesChannel;
  time: { unit: string; step: number };
  max_lag: number;
  min_pairs: number;
  missing: 'reject' | 'pairwise-complete';
}

export interface MeasuredSeriesProfileRow {
  lag: number;
  lag_time: number;
  n_pairs: number;
  correlation: number | null;
  status: 'ok' | 'insufficient_pairs' | 'constant' | 'numerical_failure';
}

export interface MeasuredSeriesMeasurement {
  schema: 'cmb.series-measurement/v2';
  id: string;
  origin: 'measured' | 'synthetic';
  epistemic: 'RESEARCH/DERIVED';
  source_assertions_verified: false;
  descriptive_only: true;
  status: 'ok' | 'unavailable';
  n_samples: number;
  max_lag: number;
  min_pairs: number;
  missing: MeasuredSeriesQuery['missing'];
  time: MeasuredSeriesQuery['time'];
  channels: {
    a: { unit: string; provenance: SeriesProvenance };
    b: { unit: string; provenance: SeriesProvenance };
  };
  lag_convention: string;
  profile: MeasuredSeriesProfileRow[];
  best: MeasuredSeriesProfileRow | null;
  zero_lag: MeasuredSeriesProfileRow;
  selection: {
    criterion: 'maximum_absolute_correlation';
    tie_rule: 'smallest_lag_on_exact_absolute_score_tie';
    exact_tie_lags: number[];
    close_peak_lags: number[];
    close_score_tolerance: number;
    score_gap: number | null;
    ambiguous: boolean;
    boundary_winner: boolean;
  };
  warnings: string[];
}

export type MeasuredSeriesValidation =
  | { ok: true; query: MeasuredSeriesQuery }
  | { ok: false; errors: string[] };

const CLOSE_SCORE_TOLERANCE = 1e-12;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactKeys(value: Record<string, unknown>, allowed: string[], path: string, errors: string[]): void {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.includes(key)) {
      errors.push(path + ': unexpected field ' + String(key));
    }
  }
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(path + '.' + key + ': required');
  }
}

function nonemptyString(value: unknown, maxLength = 2048): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function denseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false;
  for (let i = 0; i < value.length; i++) {
    if (!Object.prototype.hasOwnProperty.call(value, i)) return false;
  }
  return true;
}

function validateChannel(value: unknown, path: string, errors: string[]): value is MeasuredSeriesChannel {
  const before = errors.length;
  if (!record(value)) {
    errors.push(path + ': expected an object');
    return false;
  }
  exactKeys(value, ['values', 'timestamps', 'unit', 'provenance'], path, errors);
  if (!nonemptyString(value.unit, 256)) errors.push(path + '.unit: expected a nonempty string of at most 256 characters');
  if (!denseArray(value.values)) {
    errors.push(path + '.values: expected a dense array');
  } else {
    if (value.values.length < 12 || value.values.length > 4096) {
      errors.push(path + '.values: length must be 12..4096');
    }
    if (value.values.some(v => v !== null && (typeof v !== 'number' || !Number.isFinite(v)))) {
      errors.push(path + '.values: only finite numbers or explicit null are accepted');
    }
  }
  if (!denseArray(value.timestamps)) {
    errors.push(path + '.timestamps: expected a dense array');
  } else if (value.timestamps.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
    errors.push(path + '.timestamps: expected finite numbers');
  }
  if (Array.isArray(value.values) && Array.isArray(value.timestamps) &&
      value.values.length !== value.timestamps.length) {
    errors.push(path + ': values and timestamps must have identical lengths');
  }
  if (!record(value.provenance)) {
    errors.push(path + '.provenance: expected an object');
  } else {
    exactKeys(value.provenance, ['source', 'revision', 'sha256'], path + '.provenance', errors);
    if (!nonemptyString(value.provenance.source)) errors.push(path + '.provenance.source: expected a nonempty string of at most 2048 characters');
    if (!nonemptyString(value.provenance.revision, 256)) errors.push(path + '.provenance.revision: expected a nonempty string of at most 256 characters');
    if (typeof value.provenance.sha256 !== 'string' || !/^[a-fA-F0-9]{64}$/.test(value.provenance.sha256)) {
      errors.push(path + '.provenance.sha256: expected exactly 64 hexadecimal characters');
    }
  }
  return errors.length === before;
}

/** Spacing of binary64 numbers in the binade containing x, including subnormals. */
function spacing(x: number): number {
  if (x === 0) return Number.MIN_VALUE;
  // log2(MAX_VALUE) rounds to 1024; clamp to its actual finite binade.
  const exponent = Math.min(1023, Math.floor(Math.log2(Math.abs(x))));
  return Math.max(Number.MIN_VALUE, 2 ** (exponent - 52));
}

function validateGrids(query: MeasuredSeriesQuery, errors: string[]): void {
  const n = query.a.timestamps.length;
  const start = query.a.timestamps[0];
  const step = query.time.step;
  const span = (n - 1) * step;
  const end = start + span;
  if (!Number.isFinite(span) || !Number.isFinite(end)) {
    errors.push('time: grid extent is not finite');
    return;
  }
  // Tolerances account only for binary64 representation and arithmetic. Require
  // 4*gridSpacing <= 1e-6*step so even the largest permitted rounding mismatch
  // is at most one millionth of a sampling interval. Callers with an unresolved
  // epoch must explicitly rebase their timestamps before requesting measurement.
  const gridSpacing = Math.max(spacing(start), spacing(end), spacing(span),
    ...query.a.timestamps.map(spacing), ...query.b.timestamps.map(spacing));
  if (4 * gridSpacing > 1e-6 * step) {
    errors.push('time.step: insufficient floating-point time resolution; use a better-resolved time origin/unit');
    return;
  }
  for (const name of ['a', 'b'] as const) {
    const times = query[name].timestamps;
    for (let i = 0; i < n; i++) {
      if (i > 0 && times[i] <= times[i - 1]) {
        errors.push(name + '.timestamps: must be strictly increasing');
        break;
      }
    }
    for (let i = 0; i < n; i++) {
      const offset = i * step;
      const expected = start + offset;
      const tolerance = 4 * Math.max(spacing(start), spacing(offset), spacing(expected), spacing(times[i]));
      if (Math.abs(times[i] - expected) > tolerance) {
        errors.push(name + '.timestamps: must match the declared regular grid; no resampling is performed');
        break;
      }
    }
  }
  for (let i = 0; i < n; i++) {
    const tolerance = 4 * Math.max(spacing(query.a.timestamps[i]), spacing(query.b.timestamps[i]));
    if (Math.abs(query.a.timestamps[i] - query.b.timestamps[i]) > tolerance) {
      errors.push('timestamps: a and b must share the same grid');
      break;
    }
  }
}

export function validateMeasuredSeriesQuery(input: unknown): MeasuredSeriesValidation {
  const errors: string[] = [];
  if (!record(input)) return { ok: false, errors: ['query: expected an object'] };
  exactKeys(input, ['schema', 'id', 'origin', 'a', 'b', 'time', 'max_lag', 'min_pairs', 'missing'], 'query', errors);
  if (input.schema !== 'cmb.series-query/v2') errors.push('schema: expected cmb.series-query/v2');
  if (typeof input.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.id)) {
    errors.push('id: expected 1..128 ASCII letters, digits, dots, underscores, colons, or hyphens, starting with a letter or digit');
  }
  if (input.origin !== 'measured' && input.origin !== 'synthetic') errors.push('origin: expected measured or synthetic');
  if (input.missing !== 'reject' && input.missing !== 'pairwise-complete') errors.push('missing: expected reject or pairwise-complete');
  const aValid = validateChannel(input.a, 'a', errors);
  const bValid = validateChannel(input.b, 'b', errors);
  if (!record(input.time)) {
    errors.push('time: expected an object');
  } else {
    exactKeys(input.time, ['unit', 'step'], 'time', errors);
    if (!nonemptyString(input.time.unit, 256)) errors.push('time.unit: expected a nonempty string of at most 256 characters');
    if (typeof input.time.step !== 'number' || !Number.isFinite(input.time.step) || input.time.step <= 0) {
      errors.push('time.step: expected a positive finite number');
    }
  }
  const n = aValid ? (input.a as MeasuredSeriesChannel).values.length : 0;
  if (typeof input.max_lag !== 'number' || !Number.isInteger(input.max_lag) ||
      input.max_lag < 0 || input.max_lag > Math.min(64, Math.floor(n / 3))) {
    errors.push('max_lag: expected an integer in 0..min(64, floor(n/3))');
  }
  if (typeof input.min_pairs !== 'number' || !Number.isInteger(input.min_pairs) ||
      input.min_pairs < 3 || input.min_pairs > n) {
    errors.push('min_pairs: expected an integer in 3..n');
  }
  if (aValid && bValid) {
    const a = input.a as MeasuredSeriesChannel;
    const b = input.b as MeasuredSeriesChannel;
    if (a.values.length !== b.values.length) errors.push('a and b: all arrays must have identical lengths');
    if (input.missing === 'reject' && (a.values.includes(null) || b.values.includes(null))) {
      errors.push('missing: reject does not accept null values');
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  const query = input as unknown as MeasuredSeriesQuery;
  validateGrids(query, errors);
  return errors.length ? { ok: false, errors } : { ok: true, query };
}

function compensatedSum(values: number[]): number {
  let sum = 0;
  let correction = 0;
  for (const value of values) {
    const next = sum + value;
    correction += Math.abs(sum) >= Math.abs(value) ? (sum - next) + value : (value - next) + sum;
    sum = next;
  }
  return sum + correction;
}

function centeredCoordinates(values: number[]): number[] | null {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return null;
  const anchor = values[0];
  let shifted = values.map(v => v - anchor);
  if (shifted.some(v => !Number.isFinite(v))) {
    // A finite range can span nearly 2*MAX_VALUE. Halving all observations
    // before subtraction avoids overflow; it is used only for this case.
    shifted = values.map(v => v / 2 - anchor / 2);
  }
  const scale = Math.max(...shifted.map(Math.abs));
  const normalized = shifted.map(v => v / scale);
  const mean = compensatedSum(normalized) / normalized.length;
  const centered = normalized.map(v => v - mean);
  const centerScale = Math.max(...centered.map(Math.abs));
  return centered.map(v => v / centerScale);
}

function pearson(a: number[], b: number[]): Pick<MeasuredSeriesProfileRow, 'correlation' | 'status'> {
  const x = centeredCoordinates(a);
  const y = centeredCoordinates(b);
  if (x === null || y === null) return { correlation: null, status: 'constant' };
  const xx = compensatedSum(x.map(v => v * v));
  const yy = compensatedSum(y.map(v => v * v));
  const xy = compensatedSum(x.map((v, i) => v * y[i]));
  const correlation = xy / (Math.sqrt(xx) * Math.sqrt(yy));
  if (!Number.isFinite(correlation) || Math.abs(correlation) > 1 + 64 * Number.EPSILON) {
    return { correlation: null, status: 'numerical_failure' };
  }
  return { correlation: Math.max(-1, Math.min(1, correlation)) || 0, status: 'ok' };
}

export function measureMeasuredSeriesQuery(input: unknown): MeasuredSeriesMeasurement {
  const validation = validateMeasuredSeriesQuery(input);
  if (!validation.ok) throw new Error('Invalid measured-series query: ' + validation.errors.join('; '));
  const query = validation.query;
  const n = query.a.values.length;
  const profile: MeasuredSeriesProfileRow[] = [];
  for (let lag = -query.max_lag; lag <= query.max_lag; lag++) {
    const a: number[] = [];
    const b: number[] = [];
    for (let t = Math.max(0, -lag); t < Math.min(n, n - lag); t++) {
      const av = query.a.values[t];
      const bv = query.b.values[t + lag];
      if (av !== null && bv !== null) {
        a.push(av);
        b.push(bv);
      }
    }
    const result = a.length < query.min_pairs
      ? { correlation: null, status: 'insufficient_pairs' as const }
      : pearson(a, b);
    profile.push({ lag: lag || 0, lag_time: lag === 0 ? 0 : lag * query.time.step, n_pairs: a.length, ...result });
  }
  const valid = profile.filter(row => row.status === 'ok' && row.correlation !== null);
  let best: MeasuredSeriesProfileRow | null = null;
  for (const row of valid) {
    if (best === null || Math.abs(row.correlation!) > Math.abs(best.correlation!)) best = row;
  }
  const bestScore = best === null ? null : Math.abs(best.correlation!);
  const exactTies = bestScore === null ? [] : valid.filter(row => Math.abs(row.correlation!) === bestScore).map(row => row.lag);
  const closePeaks = bestScore === null ? [] : valid.filter(row => bestScore - Math.abs(row.correlation!) <= CLOSE_SCORE_TOLERANCE).map(row => row.lag);
  const remainingScores = valid.filter(row => row !== best).map(row => Math.abs(row.correlation!));
  const scoreGap = bestScore !== null && remainingScores.length ? bestScore - Math.max(...remainingScores) : null;
  const boundary = best !== null && query.max_lag > 0 && Math.abs(best.lag) === query.max_lag;
  const warnings = [
    'Provenance and origin are caller-declared; source assertions are not verified.',
    'Correlation does not establish causality or physical coherence.',
    'Dependent lag search has no calibrated significance or confidence interval; results are descriptive only.',
  ];
  if (query.missing === 'pairwise-complete') warnings.push('Each lag uses its own complete pairs; missingness can change the compared populations.');
  if (exactTies.length > 1) warnings.push('Exact absolute-score tie: the smallest lag is selected; lag direction may be ambiguous.');
  if (closePeaks.length > 1) warnings.push('Multiple peaks are within the descriptive score tolerance; this is not a statistical uncertainty estimate.');
  if (boundary) warnings.push('The selected peak is at the search boundary; the lag search may be truncated.');
  if (best === null) warnings.push('No lag has a defined correlation; the measurement is unavailable.');
  if (profile.some(row => row.status === 'numerical_failure')) warnings.push('At least one lag had a numerical failure and remains undefined.');
  return {
    schema: 'cmb.series-measurement/v2',
    id: query.id,
    origin: query.origin,
    epistemic: 'RESEARCH/DERIVED',
    source_assertions_verified: false,
    descriptive_only: true,
    status: best === null ? 'unavailable' : 'ok',
    n_samples: n,
    max_lag: query.max_lag,
    min_pairs: query.min_pairs,
    missing: query.missing,
    time: { ...query.time },
    channels: {
      a: { unit: query.a.unit, provenance: { ...query.a.provenance } },
      b: { unit: query.b.unit, provenance: { ...query.b.provenance } },
    },
    lag_convention: 'At lag k, correlate a[t] with b[t+k] over their valid overlap; positive k means b follows a by k*time.step.',
    profile,
    best,
    zero_lag: profile[query.max_lag],
    selection: {
      criterion: 'maximum_absolute_correlation',
      tie_rule: 'smallest_lag_on_exact_absolute_score_tie',
      exact_tie_lags: exactTies,
      close_peak_lags: closePeaks,
      close_score_tolerance: CLOSE_SCORE_TOLERANCE,
      score_gap: scoreGap,
      ambiguous: closePeaks.length > 1,
      boundary_winner: boundary,
    },
    warnings,
  };
}
