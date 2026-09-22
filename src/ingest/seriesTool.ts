/** Narrow synthetic-series research adapter over the repository's actual math. */
import { bestLaggedPearson } from '../math/correlates';

export interface SeriesQuery {
  schema: 'cmb.series-query/v1';
  id: string;
  origin: 'synthetic';
  a: number[];
  b: number[];
  max_lag: number;
}

export interface SeriesMeasurement {
  schema: 'cmb.series-measurement/v1';
  id: string;
  origin: 'synthetic';
  epistemic: 'RESEARCH/DERIVED';
  lag: number;
  correlation: number;
  zero_lag_correlation: number;
  strong: 0 | 1;
  sign: -1 | 0 | 1;
  zero_lag_sign: -1 | 0 | 1;
}

/** Validate the complete request; no labels, prompts, or model state are admitted. */
export function parseSeriesQuery(value: unknown): SeriesQuery {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected query object');
  const query = value as Record<string, unknown>;
  const keys = ['schema', 'id', 'origin', 'a', 'b', 'max_lag'];
  if (Object.keys(query).length !== keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(query, key))) {
    throw new Error('Missing or unknown query fields');
  }
  if (query.schema !== 'cmb.series-query/v1') throw new Error('Unsupported query schema');
  if (query.origin !== 'synthetic') throw new Error('This research adapter requires declared synthetic origin');
  if (typeof query.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(query.id)) {
    throw new Error('Invalid query id');
  }
  for (const key of ['a', 'b']) {
    const series = query[key];
    if (!Array.isArray(series) || series.length < 12 || series.length > 64) throw new Error('Series must contain 12–64 samples');
    // Index iteration also rejects sparse arrays passed directly by callers.
    for (let i = 0; i < series.length; i++) {
      if (typeof series[i] !== 'number' || !Number.isFinite(series[i])) throw new Error('Series samples must be finite numbers');
    }
  }
  const a = query.a as number[];
  const b = query.b as number[];
  if (a.length !== b.length) throw new Error('Series must already be aligned with equal lengths');
  if (typeof query.max_lag !== 'number' || !Number.isInteger(query.max_lag) || query.max_lag < 0 ||
    query.max_lag > 8 || query.max_lag > Math.floor(a.length / 3)) throw new Error('Invalid max_lag');
  return { schema: 'cmb.series-query/v1', id: query.id, origin: 'synthetic', a: a.slice(), b: b.slice(), max_lag: query.max_lag };
}

/**
 * The existing math returns zero for a tiny denominator. Reject those windows
 * here instead of reporting undefined Pearson as a measured zero correlation.
 * This checks admissibility only; measurement still calls bestLaggedPearson.
 */
function requireDefinedWindows(a: number[], b: number[], maxLag: number): void {
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const x = lag >= 0 ? a.slice(0, a.length - lag) : a.slice(-lag);
    const y = lag >= 0 ? b.slice(lag) : b.slice(0, b.length + lag);
    const mx = x.reduce((sum, value) => sum + value, 0) / x.length;
    const my = y.reduce((sum, value) => sum + value, 0) / y.length;
    const vx = x.reduce((sum, value) => sum + (value - mx) ** 2, 0);
    const vy = y.reduce((sum, value) => sum + (value - my) ** 2, 0);
    const denominator = Math.sqrt(vx * vy);
    if (!Number.isFinite(denominator) || denominator < 1e-12) {
      throw new Error(`Pearson is numerically undefined at lag ${lag}`);
    }
  }
}

function direction(value: number): -1 | 0 | 1 {
  return value > 0 ? 1 : value < 0 ? -1 : 0;
}

/** Positive lag pairs a[t] with b[t + lag]; no resampling or ranking occurs. */
export function measureSeriesQuery(value: unknown): SeriesMeasurement {
  const query = parseSeriesQuery(value);
  requireDefinedWindows(query.a, query.b, query.max_lag);
  const best = bestLaggedPearson(query.a, query.b, query.max_lag);
  const zero = bestLaggedPearson(query.a, query.b, 0).score;
  if (![best.score, zero].every(score => Number.isFinite(score) && Math.abs(score) <= 1 + 1e-12)) {
    throw new Error('Invalid correlation returned by CMB math');
  }
  return {
    schema: 'cmb.series-measurement/v1', id: query.id, origin: query.origin,
    epistemic: 'RESEARCH/DERIVED', lag: best.lag || 0, correlation: best.score,
    zero_lag_correlation: zero, strong: Math.abs(best.score) >= 0.8 ? 1 : 0,
    sign: direction(best.score), zero_lag_sign: direction(zero),
  };
}
