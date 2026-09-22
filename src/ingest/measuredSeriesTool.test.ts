import { describe, expect, it } from 'vitest';
import {
  measureMeasuredSeriesQuery,
  validateMeasuredSeriesQuery,
  type MeasuredSeriesQuery,
} from './measuredSeriesTool';

const signal = [3, -1, 4, 1, 5, -9, 2, 6, 5, 3, 5, 8, 9, 7, 9, 3, 2, 3, 8, 4, 6, 2, 6, 4];

function query(a: (number | null)[] = signal, b: (number | null)[] = [8, -4, 11, ...signal.slice(0, -3)]): MeasuredSeriesQuery {
  const channel = (values: (number | null)[], name: string) => ({
    values: [...values],
    timestamps: values.map((_, i) => i * 0.25),
    unit: name === 'a' ? 'mV' : 'V',
    provenance: { source: 'fixture:' + name, revision: 'test-v1', sha256: 'a'.repeat(64) },
  });
  return {
    schema: 'cmb.series-query/v2',
    id: 'measured-series-test',
    origin: 'synthetic',
    a: channel(a, 'a'),
    b: channel(b, 'b'),
    time: { unit: 's', step: 0.25 },
    max_lag: Math.min(5, Math.floor(a.length / 3)),
    min_pairs: 3,
    missing: 'reject',
  };
}

function zeroLag(a: number[], b: number[]) {
  return measureMeasuredSeriesQuery({ ...query(a, b), max_lag: 0 }).zero_lag;
}

describe('measured-series v2 numerical contract', () => {
  it('finds a unique analytic delay with an explicit sign and physical lag', () => {
    const result = measureMeasuredSeriesQuery(query());
    expect(result.best?.lag).toBe(3);
    expect(result.best?.lag_time).toBe(0.75);
    expect(result.best?.correlation).toBeCloseTo(1, 14);
    expect(result.best?.n_pairs).toBe(21);
    expect(result.selection.ambiguous).toBe(false);
    expect(result.selection.score_gap).toBeGreaterThan(0.1);
    expect(result.profile.map(row => row.lag)).toEqual([-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]);
    expect(result.zero_lag.lag).toBe(0);
    expect(result.lag_convention).toContain('a[t] with b[t+k]');
  });

  it('reverses the unique winning lag when channels are swapped or time order is reversed', () => {
    const original = query();
    const swapped = measureMeasuredSeriesQuery({ ...original, a: original.b, b: original.a });
    // Reversing the samples and assigning increasing coordinates represents the
    // reversed-time signal; the ingestion API itself never sorts timestamps.
    const reversed = measureMeasuredSeriesQuery(query([...original.a.values].reverse(), [...original.b.values].reverse()));
    expect(swapped.best?.lag).toBe(-3);
    expect(reversed.best?.lag).toBe(-3);
    expect(swapped.best?.correlation).toBeCloseTo(1, 14);
    expect(reversed.best?.correlation).toBeCloseTo(1, 14);
  });

  it.each([1e-200, 1e200])('preserves the complete profile under affine scaling by %s', scale => {
    const original = query();
    const result = measureMeasuredSeriesQuery(original);
    const transformed = measureMeasuredSeriesQuery(query(
      original.a.values.map(v => (v! + 7) * scale),
      original.b.values.map(v => (-3 * v! + 11) * scale),
    ));
    expect(transformed.best?.lag).toBe(3);
    for (let i = 0; i < result.profile.length; i++) {
      expect(transformed.profile[i].status).toBe('ok');
      expect(transformed.profile[i].correlation).toBeCloseTo(-result.profile[i].correlation!, 13);
    }
  });

  it('centers before scaling to retain representable variation around a large offset', () => {
    const b = Array.from({ length: 12 }, (_, i) => 2 * i);
    const a = b.map(v => 1e16 + v);
    expect(zeroLag(a, b).correlation).toBeCloseTo(1, 14);
  });

  it('handles finite ranges whose raw differences overflow', () => {
    const a = Array.from({ length: 12 }, (_, i) => i % 2 === 0 ? Number.MAX_VALUE : -Number.MAX_VALUE);
    const b = a.map(v => -v);
    expect(zeroLag(a, b)).toMatchObject({ status: 'ok', n_pairs: 12 });
    expect(zeroLag(a, b).correlation).toBeCloseTo(-1, 14);
  });

  it('handles nonconstant subnormal signals without an arbitrary denominator cutoff', () => {
    const a = Array.from({ length: 12 }, (_, i) => (i - 6) * Number.MIN_VALUE);
    const b = a.map(v => -v);
    expect(zeroLag(a, b).status).toBe('ok');
    expect(zeroLag(a, b).correlation).toBeCloseTo(-1, 14);
  });

  it('keeps a genuine zero correlation defined and distinguishes it from constants', () => {
    const a = Array.from({ length: 12 }, (_, i) => [1, -1, 1, -1][i % 4]);
    const b = Array.from({ length: 12 }, (_, i) => [1, 1, -1, -1][i % 4]);
    expect(zeroLag(a, b)).toMatchObject({ correlation: 0, status: 'ok' });
  });

  it('selects the smallest lag even when every valid score is exactly zero', () => {
    const a = [0, 0, 0, 1, -1, 0, 0, 0, 0, 0, 0, 0];
    const b = [0, 0, 0, 0, 0, 0, 0, 0, 1, -1, 0, 0];
    const result = measureMeasuredSeriesQuery({ ...query(a, b), max_lag: 1 });
    expect(result.profile.every(row => row.correlation === 0 && row.status === 'ok')).toBe(true);
    expect(result.best?.lag).toBe(-1);
    expect(result.selection.exact_tie_lags).toEqual([-1, 0, 1]);
    expect(result.selection.close_peak_lags).toEqual([-1, 0, 1]);
    expect(result.selection.score_gap).toBe(0);
    expect(result.selection.ambiguous).toBe(true);
    expect(result.selection.boundary_winner).toBe(true);
    expect(result.warnings.some(w => w.includes('Exact absolute-score tie'))).toBe(true);
  });

  it('reports close peaks independently of exact score selection', () => {
    const a = Array.from({ length: 24 }, (_, i) => i);
    const b = a.map((v, i) => v + (i % 3) * 1e-7);
    const result = measureMeasuredSeriesQuery(query(a, b));
    expect(result.selection.close_peak_lags.length).toBeGreaterThan(1);
    expect(result.selection.ambiguous).toBe(true);
    expect(result.selection.close_score_tolerance).toBe(1e-12);
    const bestScore = Math.max(...result.profile.map(row => Math.abs(row.correlation!)));
    expect(Math.abs(result.best!.correlation!)).toBe(bestScore);
    expect(result.best?.lag).toBe(result.profile.find(row => Math.abs(row.correlation!) === bestScore)?.lag);
  });

  it('flags a unique boundary winner and leaves a single-candidate score gap undefined', () => {
    const result = measureMeasuredSeriesQuery({ ...query(), max_lag: 3 });
    expect(result.best?.lag).toBe(3);
    expect(result.selection.boundary_winner).toBe(true);
    expect(result.warnings.some(w => w.includes('search boundary'))).toBe(true);
    const single = measureMeasuredSeriesQuery({ ...query(), max_lag: 0 });
    expect(single.selection.score_gap).toBeNull();
    expect(single.selection.boundary_winner).toBe(false);
  });

  it.each([0, 1e12 + 0.1, 1e-200])('marks truly constant samples (%s) undefined without mean-rounding artifacts', value => {
    const a = Array(12).fill(value) as number[];
    const result = measureMeasuredSeriesQuery(query(a, a));
    expect(result.status).toBe('unavailable');
    expect(result.best).toBeNull();
    expect(result.zero_lag.correlation).toBeNull();
    expect(result.profile.every(row => row.status === 'constant' && row.correlation === null)).toBe(true);
    expect(result.selection.exact_tie_lags).toEqual([]);
  });

  it('keeps an undefined result when just one paired channel is constant', () => {
    expect(zeroLag(Array(12).fill(5), signal.slice(0, 12))).toMatchObject({ status: 'constant', correlation: null });
  });
});

describe('measured-series v2 pairwise missingness', () => {
  it('counts the actual complete pairs at each lag and enforces min_pairs separately', () => {
    const a = [null, 1, 4, 2, null, 9, 3, 7, 6, 8, 2, 5];
    const b = [3, 1, null, 2, 5, null, 4, 7, 6, 8, null, 9];
    const result = measureMeasuredSeriesQuery({
      ...query(a, b), max_lag: 3, min_pairs: 7, missing: 'pairwise-complete',
    });
    expect(result.profile.map(row => row.n_pairs)).toEqual([6, 8, 7, 7, 7, 6, 5]);
    expect(result.profile.map(row => row.status)).toEqual([
      'insufficient_pairs', 'ok', 'ok', 'ok', 'ok', 'insufficient_pairs', 'insufficient_pairs',
    ]);
    expect(result.profile.filter(row => row.status === 'insufficient_pairs').every(row => row.correlation === null)).toBe(true);
    expect(result.warnings.some(w => w.includes('own complete pairs'))).toBe(true);
  });

  it('accepts an entirely unavailable measurement without inventing zero correlations', () => {
    const empty = Array(12).fill(null) as null[];
    const result = measureMeasuredSeriesQuery({ ...query(empty, empty), missing: 'pairwise-complete' });
    expect(result.status).toBe('unavailable');
    expect(result.best).toBeNull();
    expect(result.profile.every(row => row.n_pairs === 0 && row.status === 'insufficient_pairs' && row.correlation === null)).toBe(true);
    expect(result.selection.score_gap).toBeNull();
  });

  it('rejects explicit null under the reject policy and never deletes or imputes samples', () => {
    const input = query();
    input.a.values[2] = null;
    expect(validateMeasuredSeriesQuery(input).ok).toBe(false);
    expect(() => measureMeasuredSeriesQuery(input)).toThrow(/reject does not accept null/);
    expect(input.a.values[2]).toBeNull();
  });
});

describe('measured-series v2 strict ingestion and provenance', () => {
  it('echoes declared provenance without authenticating a measured or named source', () => {
    const input = query();
    input.origin = 'measured';
    input.a.provenance.source = 'Planck (caller assertion only)';
    const result = measureMeasuredSeriesQuery(input);
    expect(result.schema).toBe('cmb.series-measurement/v2');
    expect(result.id).toBe(input.id);
    expect(result.origin).toBe('measured');
    expect(result.epistemic).toBe('RESEARCH/DERIVED');
    expect(result.source_assertions_verified).toBe(false);
    expect(result.descriptive_only).toBe(true);
    expect(result.channels.a).toEqual({ unit: input.a.unit, provenance: input.a.provenance });
    expect(result.time).toEqual(input.time);
    expect(result.warnings.some(w => w.includes('causality'))).toBe(true);
    expect(result.warnings.some(w => w.includes('no calibrated significance'))).toBe(true);
    input.a.provenance.source = 'changed';
    expect(result.channels.a.provenance.source).toBe('Planck (caller assertion only)');
  });

  it.each([
    ['schema v1', { schema: 'cmb.series-query/v1' }],
    ['unsupported origin', { origin: 'PLANCK' }],
    ['injected source label', { source: 'PHYSICAL' }],
    ['injected epistemic label', { epistemic: 'PHYSICAL/MEASURED' }],
    ['injected verification', { source_assertions_verified: true }],
    ['invalid id', { id: '' }],
    ['unsafe id', { id: '../output' }],
    ['overlong id', { id: 'a'.repeat(129) }],
    ['fractional max_lag', { max_lag: 1.5 }],
    ['negative max_lag', { max_lag: -1 }],
    ['too-large max_lag', { max_lag: 9 }],
    ['too-small min_pairs', { min_pairs: 2 }],
    ['too-large min_pairs', { min_pairs: 25 }],
    ['fractional min_pairs', { min_pairs: 3.5 }],
    ['unsupported missing policy', { missing: 'impute' }],
  ])('rejects %s', (_, patch) => {
    expect(validateMeasuredSeriesQuery({ ...query(), ...patch }).ok).toBe(false);
  });

  it.each([undefined, NaN, Infinity, -Infinity, '3', {}])('rejects malformed sample %s', value => {
    const input = query();
    (input.a.values as unknown[])[3] = value;
    expect(validateMeasuredSeriesQuery(input).ok).toBe(false);
  });

  it('rejects sparse arrays, inherited slots, and a mismatch among any array lengths', () => {
    const values = query();
    delete values.a.values[3];
    expect(validateMeasuredSeriesQuery(values).ok).toBe(false);
    const times = query();
    delete times.b.timestamps[3];
    expect(validateMeasuredSeriesQuery(times).ok).toBe(false);
    const mismatch = query();
    mismatch.b.values.pop();
    expect(validateMeasuredSeriesQuery(mismatch).ok).toBe(false);
    const mismatchChannels = query(signal.slice(0, 12), signal.slice(0, 13));
    expect(validateMeasuredSeriesQuery(mismatchChannels).ok).toBe(false);
  });

  it.each([11, 4097])('rejects sample count %s', n => {
    const samples = Array.from({ length: n }, (_, i) => i);
    expect(validateMeasuredSeriesQuery(query(samples, samples)).ok).toBe(false);
  });

  it('accepts the maximum sample and lag limits', () => {
    const samples = Array.from({ length: 4096 }, (_, i) => i);
    expect(validateMeasuredSeriesQuery({ ...query(samples, samples), max_lag: 64 }).ok).toBe(true);
    expect(validateMeasuredSeriesQuery({ ...query(samples, samples), max_lag: 65 }).ok).toBe(false);
  });

  it.each(['', 'abc', 'g'.repeat(64)])('rejects malformed provenance digest %s', sha256 => {
    const input = query();
    input.a.provenance.sha256 = sha256;
    expect(validateMeasuredSeriesQuery(input).ok).toBe(false);
  });

  it('rejects missing provenance, empty units, and caller-injected verified metadata', () => {
    const input = query();
    expect(validateMeasuredSeriesQuery({ ...input, a: { ...input.a, provenance: undefined } }).ok).toBe(false);
    expect(validateMeasuredSeriesQuery({ ...input, a: { ...input.a, unit: ' ' } }).ok).toBe(false);
    expect(validateMeasuredSeriesQuery({ ...input, b: { ...input.b, provenance: { ...input.b.provenance, verified: true } } }).ok).toBe(false);
    expect(validateMeasuredSeriesQuery({ ...input, time: { ...input.time, unit: '' } }).ok).toBe(false);
    expect(validateMeasuredSeriesQuery({ ...input, a: { ...input.a, unit: 'x'.repeat(257) } }).ok).toBe(false);
    expect(validateMeasuredSeriesQuery({ ...input, a: { ...input.a, provenance: { ...input.a.provenance, source: 'x'.repeat(2049) } } }).ok).toBe(false);
    expect(validateMeasuredSeriesQuery({ ...input, a: { ...input.a, provenance: { ...input.a.provenance, revision: 'x'.repeat(257) } } }).ok).toBe(false);
  });

  it.each([0, -1, Infinity, NaN])('rejects invalid time step %s', step => {
    expect(validateMeasuredSeriesQuery({ ...query(), time: { unit: 's', step } }).ok).toBe(false);
  });

  it('rejects a shifted, irregular, duplicate, reversed, or nonfinite timestamp grid', () => {
    const shifted = query();
    shifted.b.timestamps = shifted.b.timestamps.map(t => t + 0.125);
    expect(validateMeasuredSeriesQuery(shifted).ok).toBe(false);
    const irregular = query();
    irregular.a.timestamps[8] += 1e-7;
    expect(validateMeasuredSeriesQuery(irregular).ok).toBe(false);
    const duplicate = query();
    duplicate.a.timestamps[8] = duplicate.a.timestamps[7];
    expect(validateMeasuredSeriesQuery(duplicate).ok).toBe(false);
    const reversed = query();
    reversed.b.timestamps.reverse();
    expect(validateMeasuredSeriesQuery(reversed).ok).toBe(false);
    const nonfinite = query();
    nonfinite.a.timestamps[8] = Infinity;
    expect(validateMeasuredSeriesQuery(nonfinite).ok).toBe(false);
  });

  it('allows only floating-point grid noise and rejects inadequate time resolution', () => {
    const decimal = query();
    decimal.time.step = 0.1;
    decimal.a.timestamps = decimal.a.timestamps.map((_, i) => 1000 + i * 0.1);
    decimal.b.timestamps = [...decimal.a.timestamps];
    expect(validateMeasuredSeriesQuery(decimal).ok).toBe(true);
    decimal.b.timestamps[3] += 1e-3;
    expect(validateMeasuredSeriesQuery(decimal).ok).toBe(false);

    const epochSeconds = query();
    epochSeconds.time.step = 1;
    epochSeconds.a.timestamps = epochSeconds.a.timestamps.map((_, i) => 1.7e9 + i);
    epochSeconds.b.timestamps = [...epochSeconds.a.timestamps];
    expect(validateMeasuredSeriesQuery(epochSeconds).ok).toBe(true);

    const epochTenths = query();
    epochTenths.time.step = 0.1;
    epochTenths.a.timestamps = epochTenths.a.timestamps.map((_, i) => 1.7e9 + i * 0.1);
    epochTenths.b.timestamps = [...epochTenths.a.timestamps];
    expect(() => measureMeasuredSeriesQuery(epochTenths)).toThrow(/insufficient floating-point time resolution/);

    const unresolved = query();
    unresolved.time.step = 2;
    unresolved.a.timestamps = unresolved.a.timestamps.map((_, i) => 1e16 + i * 2);
    unresolved.b.timestamps = [...unresolved.a.timestamps];
    expect(() => measureMeasuredSeriesQuery(unresolved)).toThrow(/insufficient floating-point time resolution/);
  });

  it('accepts resolved subnormal time grids and rejects a nonfinite grid extent', () => {
    const tiny = query();
    tiny.time.step = 1e-310;
    tiny.a.timestamps = tiny.a.timestamps.map((_, i) => i * tiny.time.step);
    tiny.b.timestamps = [...tiny.a.timestamps];
    expect(validateMeasuredSeriesQuery(tiny).ok).toBe(true);
    const overflow = query();
    overflow.time.step = Number.MAX_VALUE;
    expect(() => measureMeasuredSeriesQuery(overflow)).toThrow(/grid extent is not finite/);
  });
});
