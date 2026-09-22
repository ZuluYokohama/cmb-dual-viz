import { describe, expect, it } from 'vitest';
import { measureSeriesQuery, parseSeriesQuery } from './seriesTool';

function fixture() {
  const a = [3, -2, 7, 0, -5, 8, 1, -4, 6, -1, 9, 2];
  return { schema: 'cmb.series-query/v1', id: 'analytic-case', origin: 'synthetic', a, b: a.slice(), max_lag: 0 };
}

describe('CMB series measurement adapter', () => {
  it('measures perfect affine relationships analytically', () => {
    const q = fixture();
    for (const multiplier of [2, -3]) {
      const result = measureSeriesQuery({ ...q, b: q.a.map(value => multiplier * value + 4) });
      expect(result.correlation).toBeCloseTo(Math.sign(multiplier), 12);
      expect(result.sign).toBe(Math.sign(multiplier));
      expect(result.strong).toBe(1);
      expect(result.lag).toBe(0);
      expect(result.epistemic).toBe('RESEARCH/DERIVED');
    }
  });

  it('preserves a genuine zero correlation and zero sign', () => {
    const result = measureSeriesQuery({ ...fixture(),
      a: [1, -1, 1, -1, 1, -1, 1, -1, 1, -1, 1, -1],
      b: [1, 1, -1, -1, 1, 1, -1, -1, 1, 1, -1, -1] });
    expect(result.correlation).toBe(0);
    expect(result.zero_lag_correlation).toBe(0);
    expect(result.sign).toBe(0);
    expect(result.zero_lag_sign).toBe(0);
    expect(result.strong).toBe(0);
  });

  it('finds the known shift with the documented lag direction', () => {
    const q = fixture();
    const b = [11, -8, ...q.a.slice(0, -2)];
    const forward = measureSeriesQuery({ ...q, b, max_lag: 4 });
    const reverse = measureSeriesQuery({ ...q, a: b, b: q.a, max_lag: 4 });
    expect(forward.lag).toBe(2);
    expect(reverse.lag).toBe(-2);
    expect(forward.correlation).toBeCloseTo(1, 12);
    expect(reverse.correlation).toBeCloseTo(1, 12);
    expect(forward.zero_lag_correlation).not.toBeCloseTo(1, 2);
  });

  it('uses the declared inclusive absolute correlation threshold', () => {
    const a = [1, -1, 1, -1, 1, -1, 1, -1, 1, -1, 1, -1];
    const z = [1, 1, -1, -1, 1, 1, -1, -1, 1, 1, -1, -1];
    for (const sign of [-1, 1]) {
      const boundary = measureSeriesQuery({ ...fixture(), a, b: a.map((v, i) => sign * (4 * v + 3 * z[i])) });
      const below = measureSeriesQuery({ ...fixture(), a, b: a.map((v, i) => sign * (3 * v + 4 * z[i])) });
      expect(boundary.correlation).toBe(sign * 0.8);
      expect(boundary.strong).toBe(1);
      expect(below.correlation).toBe(sign * 0.6);
      expect(below.strong).toBe(0);
    }
  });

  it('inherits the CMB tie rule: first strictly strongest lag in ascending order', () => {
    const a = Array.from({ length: 12 }, (_, i) => i);
    expect(measureSeriesQuery({ ...fixture(), a, b: a.slice(), max_lag: 4 }).lag).toBe(-4);
  });

  it('copies inputs and never admits model labels or a different provenance', () => {
    const q = fixture();
    expect(parseSeriesQuery(q).a).not.toBe(q.a);
    expect(() => parseSeriesQuery({ ...q, correct: true })).toThrow('unknown');
    expect(() => parseSeriesQuery({ ...q, origin: 'observed' })).toThrow('synthetic');
    expect(() => parseSeriesQuery({ ...q, origin: undefined })).toThrow();
    expect(() => parseSeriesQuery({ ...q, schema: 'cmb.series-query/v2' })).toThrow();
  });

  it('rejects malformed shapes, bounds, nonfinite samples, and identities', () => {
    const q = fixture();
    const invalid = [null, [], { ...q, id: '' }, { ...q, id: 'x\ny' },
      { ...q, a: q.a.slice(1) }, { ...q, a: new Array(65).fill(1) },
      { ...q, a: q.a.map((v, i) => i === 3 ? Infinity : v) },
      { ...q, a: q.a.map((v, i) => i === 3 ? NaN : v) },
      { ...q, a: new Array(12) }, { ...q, max_lag: -1 },
      { ...q, max_lag: 1.5 }, { ...q, max_lag: 5 }, { ...q, max_lag: 9 }];
    for (const value of invalid) expect(() => parseSeriesQuery(value)).toThrow();
  });

  it('rejects undefined, underflowing, or overflowing Pearson denominators', () => {
    const q = fixture();
    for (const a of [q.a.map(() => 2), q.a.map(v => v * 1e-100), q.a.map(v => v * 1e200)]) {
      expect(() => measureSeriesQuery({ ...q, a })).toThrow('undefined');
    }
    // Full vectors vary, but the lag +4 overlap is constant and undefined.
    expect(() => measureSeriesQuery({ ...q, a: [1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 4, 5], max_lag: 4 })).toThrow('undefined');
  });
});
