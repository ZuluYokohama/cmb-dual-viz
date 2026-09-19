import { describe, expect, it } from 'vitest';
import {
  alignSeries,
  bestLaggedPearson,
  nullZ,
  scanCorrelates,
  type CorrelateSeed,
  type ThreadSeriesInput,
} from './correlates';
import { genExampleCl, genSyntheticGcpLike } from './generators';

describe('correlates', () => {
  it('Pearson identity ≈ 1 on identical series', () => {
    const xs = Array.from({ length: 32 }, (_, i) => Math.sin(i / 3));
    const [a, b] = alignSeries(xs, xs, 32);
    const { score, lag } = bestLaggedPearson(a, b, 0);
    expect(Math.abs(lag)).toBe(0);
    expect(score).toBeCloseTo(1, 8);
  });

  it('nullZ yields finite toy z', () => {
    const a = Array.from({ length: 40 }, (_, i) => i);
    const b = a.map((x) => x * 0.9 + 0.1);
    const score = 0.95;
    const stats = nullZ(score, (sh) => {
      let s = 0;
      for (let i = 0; i < sh.length; i++) s += a[i]! * sh[i]!;
      return s / sh.length;
    }, b, 20, 99);
    expect(Number.isFinite(stats.zToy)).toBe(true);
    expect(stats.nullStd).toBeGreaterThan(0);
  });

  it('scanCorrelates tags RESEARCH/DERIVED-ish and never PHYSICS-BACKED', () => {
    const datasets = [genExampleCl(24), genSyntheticGcpLike()];
    const thread: ThreadSeriesInput = {
      Cl: datasets[0]!.cl ?? [],
      ellFocus: 8,
      ellMax: 24,
      coherenceScore: 0.2,
      coherenceZ: 1.1,
      timePhase: 0.1,
    };
    const seed: CorrelateSeed = {
      id: 'seed-thread-a',
      label: 'A',
      kind: 'thread-a-ell',
      series: thread.Cl.slice(2).map((c, i) => {
        const ell = i + 2;
        return (ell * (ell + 1) * c) / (2 * Math.PI);
      }),
      epistemic: 'PHYSICS-BACKED (EXAMPLE)',
    };
    const result = scanCorrelates(seed, datasets, [], thread, { maxLag: 3, topN: 5 });
    expect(result.scanned).toBeGreaterThan(0);
    for (const h of result.hits) {
      expect(h.epistemic).not.toBe('PHYSICS-BACKED');
      expect(Number.isFinite(h.zToy)).toBe(true);
    }
  });
});
