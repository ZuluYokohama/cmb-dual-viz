/**
 * PROJECT_MOLLWEIDE — rasterize equirect θ–φ grid → Mollweide RGBA.
 * CPU reference used by OpGraph (TP_PIX_TILE). SkyCanvas may still overlay
 * highlights / coherence live; this op owns the measurement path.
 */

import { mollweideToThetaPhi } from './mollweide';
import { cmbColor, coherenceColor } from './colormap';

function sampleGridBilinear(
  grid: Float32Array,
  nTheta: number,
  nPhi: number,
  theta: number,
  phi: number
): number {
  const ft = (theta / Math.PI) * nTheta - 0.5;
  const fp = (phi / (2 * Math.PI)) * nPhi;
  const t0 = Math.max(0, Math.min(nTheta - 2, Math.floor(ft)));
  const tw = Math.max(0, Math.min(1, ft - t0));
  let p0 = Math.floor(fp);
  const pw = fp - p0;
  p0 = ((p0 % nPhi) + nPhi) % nPhi;
  const p1 = (p0 + 1) % nPhi;
  const t1 = t0 + 1;

  const v00 = grid[t0 * nPhi + p0]!;
  const v01 = grid[t0 * nPhi + p1]!;
  const v10 = grid[t1 * nPhi + p0]!;
  const v11 = grid[t1 * nPhi + p1]!;
  const a = v00 * (1 - pw) + v01 * pw;
  const b = v10 * (1 - pw) + v11 * pw;
  return a * (1 - tw) + b * tw;
}

function normalizeStats(grid: Float32Array): { mean: number; std: number } {
  let mean = 0;
  for (let i = 0; i < grid.length; i++) mean += grid[i]!;
  mean /= grid.length;
  let varSum = 0;
  for (let i = 0; i < grid.length; i++) {
    const d = grid[i]! - mean;
    varSum += d * d;
  }
  return { mean, std: Math.sqrt(varSum / grid.length) || 1 };
}

export interface ProjectMollweideOpts {
  sky: Float32Array;
  nTheta: number;
  nPhi: number;
  width: number;
  height: number;
  coh?: Float32Array | null;
  showCoherence?: boolean;
  coherenceOpacity?: number;
}

/** Returns packed RGBA uint8 (row-major). */
export function projectMollweideRgba(opts: ProjectMollweideOpts): Uint8ClampedArray {
  const {
    sky,
    nTheta,
    nPhi,
    width: w,
    height: h,
    coh = null,
    showCoherence = false,
    coherenceOpacity = 0.45,
  } = opts;
  const out = new Uint8ClampedArray(w * h * 4);
  const cmbStats = normalizeStats(sky);
  const cohStats = coh ? normalizeStats(coh) : null;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const nx = ((px + 0.5) / w) * 2 - 1;
      const ny = -(((py + 0.5) / h) * 2 - 1);
      const tp = mollweideToThetaPhi(nx, ny);
      const idx = (py * w + px) * 4;
      if (!tp) {
        out[idx] = 8;
        out[idx + 1] = 10;
        out[idx + 2] = 18;
        out[idx + 3] = 255;
        continue;
      }
      const v = sampleGridBilinear(sky, nTheta, nPhi, tp.theta, tp.phi);
      const t = (v - cmbStats.mean) / (2.5 * cmbStats.std);
      let [r, g, b] = cmbColor(t);
      if (showCoherence && coh && cohStats) {
        const cv = sampleGridBilinear(coh, nTheta, nPhi, tp.theta, tp.phi);
        const ct = (cv - cohStats.mean) / (2.2 * cohStats.std);
        const [cr, cg, cb, ca] = coherenceColor(ct, coherenceOpacity);
        const a = ca / 255;
        r = Math.round(r * (1 - a) + cr * a);
        g = Math.round(g * (1 - a) + cg * a);
        b = Math.round(b * (1 - a) + cb * a);
      }
      out[idx] = r;
      out[idx + 1] = g;
      out[idx + 2] = b;
      out[idx + 3] = 255;
    }
  }
  return out;
}
