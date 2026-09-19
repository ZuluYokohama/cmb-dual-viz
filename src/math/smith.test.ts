import { describe, expect, it } from 'vitest';
import {
  buildSmithState,
  gammaToZ,
  magGamma,
  swrFromGamma,
  zToGamma,
} from './smith';

describe('smith Möbius', () => {
  it('maps match z=1 to Γ≈0', () => {
    const g = zToGamma({ re: 1, im: 0 });
    expect(magGamma(g)).toBeLessThan(1e-12);
    expect(swrFromGamma(g)).toBeCloseTo(1, 10);
  });

  it('round-trips Γ↔z for Re(z)>0', () => {
    const z0 = { re: 1.4, im: -0.3 };
    const g = zToGamma(z0);
    const z1 = gammaToZ(g);
    expect(z1.re).toBeCloseTo(z0.re, 10);
    expect(z1.im).toBeCloseTo(z0.im, 10);
  });

  it('buildSmithState stays DERIVED and finite', () => {
    const s = buildSmithState({ re: 0.8, im: 0.2 }, 0.3, 'dual-thread', 'test');
    expect(Number.isFinite(s.magGamma)).toBe(true);
    expect(s.source).toBe('dual-thread');
  });
});
