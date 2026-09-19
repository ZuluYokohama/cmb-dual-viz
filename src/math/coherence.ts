/**
 * Metaphor / research overlay: synthetic global coherence field.
 * NOT a claim that GCP = CMB physics. Exploratory toy layer only.
 * Supports time-phase scrubbing (rotating relative phases of modes).
 */

import { mulberry32, gaussian, realYlm } from './sphericalHarmonics';

export interface CoherenceField {
  /** Values on θ-φ grid, same layout as CMB grid */
  grid: Float32Array;
  nTheta: number;
  nPhi: number;
  /** Coherence score of this realization vs its shuffle null */
  score: number;
  nullMean: number;
  nullStd: number;
  zScore: number;
  /** Phase used for this build [0,1) */
  timePhase: number;
}

interface CohCoeff {
  ell: number;
  m: number;
  a: number;
  phase0: number;
}

function drawCohCoeffs(seed: number, Lcoh: number): CohCoeff[] {
  const rng = mulberry32(seed ^ 0xc0ffee);
  const coeffs: CohCoeff[] = [];
  for (let ell = 1; ell <= Lcoh; ell++) {
    const sigma = 1 / (ell + 0.5);
    for (let m = -ell; m <= ell; m++) {
      coeffs.push({
        ell,
        m,
        a: sigma * gaussian(rng),
        phase0: rng() * 2 * Math.PI,
      });
    }
  }
  return coeffs;
}

/**
 * Smooth global random field from low-ℓ real Y_lm (ℓ=1..Lcoh).
 * timePhase ∈ [0,1) rotates mode phases for scrubbing / play.
 */
export function synthesizeCoherenceField(
  nTheta: number,
  nPhi: number,
  seed: number,
  Lcoh = 4,
  timePhase = 0
): Float32Array {
  const coeffs = drawCohCoeffs(seed, Lcoh);
  const phase = timePhase * 2 * Math.PI;

  const grid = new Float32Array(nTheta * nPhi);
  for (let it = 0; it < nTheta; it++) {
    const theta = (Math.PI * (it + 0.5)) / nTheta;
    for (let ip = 0; ip < nPhi; ip++) {
      const phi = (2 * Math.PI * ip) / nPhi;
      let sum = 0;
      for (const c of coeffs) {
        const amp = c.a * Math.cos(c.phase0 + phase * (1 + 0.35 * c.ell));
        sum += amp * realYlm(c.ell, c.m, theta, phi);
      }
      grid[it * nPhi + ip] = sum;
    }
  }
  return grid;
}

/**
 * Drive coherence amplitude mildly from an external time-series value
 * (e.g. ingested GCP-like series at current scrub index).
 */
export function synthesizeCoherenceFieldDriven(
  nTheta: number,
  nPhi: number,
  seed: number,
  Lcoh: number,
  timePhase: number,
  drive: number
): Float32Array {
  const base = synthesizeCoherenceField(nTheta, nPhi, seed, Lcoh, timePhase);
  const scale = 1 + 0.35 * Math.tanh(drive);
  for (let i = 0; i < base.length; i++) base[i]! *= scale;
  return base;
}

/**
 * Coherence metric: spatial autocorrelation of |field| at mid-scale lag,
 * compared to pixel-shuffled null ensemble.
 */
export function coherenceScore(
  grid: Float32Array,
  nTheta: number,
  nPhi: number,
  seed: number,
  nNull = 24
): { score: number; nullMean: number; nullStd: number; zScore: number } {
  const score = autocorrMid(grid, nTheta, nPhi);
  const rng = mulberry32(seed ^ 0xbadc0de);
  const nulls: number[] = [];

  const shuffled = new Float32Array(grid.length);
  for (let n = 0; n < nNull; n++) {
    shuffled.set(grid);
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = shuffled[i]!;
      shuffled[i] = shuffled[j]!;
      shuffled[j] = tmp;
    }
    nulls.push(autocorrMid(shuffled, nTheta, nPhi));
  }

  const nullMean = nulls.reduce((a, b) => a + b, 0) / nulls.length;
  const nullVar =
    nulls.reduce((a, b) => a + (b - nullMean) ** 2, 0) / Math.max(1, nulls.length - 1);
  const nullStd = Math.sqrt(nullVar);
  const zScore = nullStd > 1e-12 ? (score - nullMean) / nullStd : 0;

  return { score, nullMean, nullStd, zScore };
}

/** Mid-scale lag autocorrelation (lag ≈ nPhi/8 in φ, same θ row avg) */
function autocorrMid(grid: Float32Array, nTheta: number, nPhi: number): number {
  const lag = Math.max(1, Math.floor(nPhi / 8));
  let num = 0;
  let den = 0;
  let mean = 0;
  for (let i = 0; i < grid.length; i++) mean += grid[i]!;
  mean /= grid.length;

  for (let it = 0; it < nTheta; it++) {
    for (let ip = 0; ip < nPhi; ip++) {
      const a = grid[it * nPhi + ip]! - mean;
      const b = grid[it * nPhi + ((ip + lag) % nPhi)]! - mean;
      num += a * b;
      den += a * a;
    }
  }
  return den > 1e-30 ? num / den : 0;
}

export function buildCoherence(
  nTheta: number,
  nPhi: number,
  seed: number,
  Lcoh = 4,
  timePhase = 0,
  drive = 0,
  /** Skip expensive null ensemble when scrubbing rapidly */
  lightMetrics = false
): CoherenceField {
  const grid =
    Math.abs(drive) > 1e-6
      ? synthesizeCoherenceFieldDriven(nTheta, nPhi, seed, Lcoh, timePhase, drive)
      : synthesizeCoherenceField(nTheta, nPhi, seed, Lcoh, timePhase);
  const metrics = lightMetrics
    ? {
        score: autocorrMid(grid, nTheta, nPhi),
        nullMean: 0,
        nullStd: 1,
        zScore: autocorrMid(grid, nTheta, nPhi) * 3,
      }
    : coherenceScore(grid, nTheta, nPhi, seed, 16);
  return { grid, nTheta, nPhi, timePhase, ...metrics };
}
