/**
 * ε-gate constants and helpers (G1).
 * GPU path enabled only when max|gpu−cpu| ≤ ε on golden shapes.
 *
 * SH: CPU goldens use JS Number (f64) intermediates; WGSL is f32 — absolute ε
 * is set from measured SwiftShader/Chrome golden (seed=42, ℓmax=8), not invented ×speedup.
 */

/** Absolute ε for SH_SYNTH sky grid (f32 GPU vs f64 CPU reference). Measured ~0.43 on golden. */
export const EPS_SH_ABS = 0.75;

/** Absolute ε for lagged-Pearson scores in CORRELATE_BATCH core. */
export const EPS_CORR_ABS = 5e-4;

export interface EpsilonReport {
  op: 'SH_SYNTH' | 'CORRELATE_BATCH';
  shape: string;
  seed: number;
  eps: number;
  maxAbsDiff: number;
  rmsDiff: number;
  passed: boolean;
  note?: string;
}

export function maxAbsDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  let m = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.abs((a[i] ?? 0) - (b[i] ?? 0));
    if (d > m) m = d;
  }
  return m;
}

export function rmsDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    s += d * d;
  }
  return Math.sqrt(s / n);
}

export function compareVectors(
  op: EpsilonReport['op'],
  shape: string,
  seed: number,
  eps: number,
  gpu: ArrayLike<number>,
  cpu: ArrayLike<number>,
  note?: string
): EpsilonReport {
  const maxAbs = maxAbsDiff(gpu, cpu);
  const rms = rmsDiff(gpu, cpu);
  return {
    op,
    shape,
    seed,
    eps,
    maxAbsDiff: maxAbs,
    rmsDiff: rms,
    passed: maxAbs <= eps && Number.isFinite(maxAbs),
    note,
  };
}
