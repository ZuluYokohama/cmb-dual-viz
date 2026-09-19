import { expect, it } from 'vitest';
import { realYlm } from './sphericalHarmonics';
import { bestLaggedPearson } from './correlates';

it('real Y00 and Y10 match closed forms at multiple angles', () => {
  for (const theta of [0, 0.2, Math.PI / 2, 2.1, Math.PI]) {
    for (const phi of [0, 1.3, 5.8]) {
      expect(realYlm(0, 0, theta, phi)).toBeCloseTo(1 / Math.sqrt(4 * Math.PI), 12);
      expect(realYlm(1, 0, theta, phi)).toBeCloseTo(Math.sqrt(3 / (4 * Math.PI)) * Math.cos(theta), 12);
    }
  }
});

it('real harmonics obey the addition theorem through ell=12', () => {
  for (let ell = 0; ell <= 12; ell++) {
    for (const [theta, phi] of [[0, 0], [0.3, 0.7], [1.2, 2.8], [Math.PI, 0]]) {
      let sum = 0;
      for (let m = -ell; m <= ell; m++) sum += realYlm(ell, m, theta, phi) ** 2;
      expect(sum).toBeCloseTo((2 * ell + 1) / (4 * Math.PI), 10);
    }
  }
});

it('Pearson handles signed affine transforms and a constant series', () => {
  const x = [-2, 3, 0, 5, -1, 4];
  expect(bestLaggedPearson(x, x.map(v => 3 * v + 8), 0).score).toBeCloseTo(1, 12);
  expect(bestLaggedPearson(x, x.map(v => -2 * v + 1), 0).score).toBeCloseTo(-1, 12);
  expect(bestLaggedPearson(x, x.map(() => 2), 0).score).toBe(0);
});
