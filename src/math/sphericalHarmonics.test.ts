import { describe, expect, it } from 'vitest';
import {
  adaptiveGridSize,
  drawCoefficients,
  exampleCl,
  synthesizeGrid,
} from './sphericalHarmonics';

describe('SH / EXAMPLE C_ℓ', () => {
  it('exampleCl is zero below ℓ=2 and positive after', () => {
    expect(exampleCl(0)).toBe(0);
    expect(exampleCl(1)).toBe(0);
    expect(exampleCl(8)).toBeGreaterThan(0);
  });

  it('drawCoefficients is seed-stable', () => {
    const a = drawCoefficients(8, 42, {});
    const b = drawCoefficients(8, 42, {});
    expect(a.Cl).toEqual(b.Cl);
    expect(a.coeffs.map((c) => c.a)).toEqual(b.coeffs.map((c) => c.a));
  });

  it('synthesizeGrid is finite and seed-stable', () => {
    const { coeffs } = drawCoefficients(6, 7, {});
    const { nTheta, nPhi } = adaptiveGridSize(6);
    const g1 = synthesizeGrid(coeffs, nTheta, nPhi);
    const g2 = synthesizeGrid(coeffs, nTheta, nPhi);
    expect(g1.length).toBe(nTheta * nPhi);
    let max = 0;
    for (let i = 0; i < g1.length; i++) {
      expect(Number.isFinite(g1[i]!)).toBe(true);
      expect(g1[i]).toBe(g2[i]);
      max = Math.max(max, Math.abs(g1[i]!));
    }
    expect(max).toBeGreaterThan(0);
  });
});
