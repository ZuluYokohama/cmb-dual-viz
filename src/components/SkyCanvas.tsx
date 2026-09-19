import { useEffect, useRef } from 'react';
import { mollweideToThetaPhi } from '../math/mollweide';
import { cmbColor, coherenceColor } from '../math/colormap';

interface SkyHighlight {
  theta: number;
  phi: number;
  weight: number;
}

interface Props {
  cmbGrid: Float32Array | null;
  cohGrid: Float32Array | null;
  nTheta: number;
  nPhi: number;
  showCoherence: boolean;
  coherenceOpacity: number;
  highlights?: SkyHighlight[];
  width?: number;
  height?: number;
  /** G3: precomputed Mollweide rgba (e.g. from worker) — blit only */
  precomputedRgba?: Uint8ClampedArray | null;
  precomputedWidth?: number;
  precomputedHeight?: number;
}

/** Bilinear sample on θ–φ grid (φ wraps). */
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

function angDist(t1: number, p1: number, t2: number, p2: number): number {
  const cos =
    Math.sin(t1) * Math.sin(t2) * Math.cos(p1 - p2) + Math.cos(t1) * Math.cos(t2);
  return Math.acos(Math.max(-1, Math.min(1, cos)));
}

function rasterizeToImageData(
  target: ImageData,
  w: number,
  h: number,
  cmbGrid: Float32Array,
  cohGrid: Float32Array | null,
  nTheta: number,
  nPhi: number,
  showCoherence: boolean,
  coherenceOpacity: number,
  highlights: SkyHighlight[]
): void {
  const data = target.data;
  const cmbStats = normalizeStats(cmbGrid);
  const cohStats = cohGrid ? normalizeStats(cohGrid) : null;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const nx = ((px + 0.5) / w) * 2 - 1;
      const ny = -(((py + 0.5) / h) * 2 - 1);
      const tp = mollweideToThetaPhi(nx, ny);
      const idx = (py * w + px) * 4;

      if (!tp) {
        data[idx] = 8;
        data[idx + 1] = 10;
        data[idx + 2] = 18;
        data[idx + 3] = 255;
        continue;
      }

      const v = sampleGridBilinear(cmbGrid, nTheta, nPhi, tp.theta, tp.phi);
      const t = (v - cmbStats.mean) / (2.5 * cmbStats.std);
      let [r, g, b] = cmbColor(t);

      if (showCoherence && cohGrid && cohStats) {
        const cv = sampleGridBilinear(cohGrid, nTheta, nPhi, tp.theta, tp.phi);
        const ct = (cv - cohStats.mean) / (2.2 * cohStats.std);
        const [cr, cg, cb, ca] = coherenceColor(ct, coherenceOpacity);
        const a = ca / 255;
        r = Math.round(r * (1 - a) + cr * a);
        g = Math.round(g * (1 - a) + cg * a);
        b = Math.round(b * (1 - a) + cb * a);
      }

      if (highlights.length) {
        let glow = 0;
        for (const hi of highlights) {
          const d = angDist(tp.theta, tp.phi, hi.theta, hi.phi);
          const sigma = 0.18;
          glow += hi.weight * Math.exp(-(d * d) / (2 * sigma * sigma));
        }
        glow = Math.min(0.75, glow * 0.35);
        if (glow > 0.02) {
          r = Math.round(r * (1 - glow) + 200 * glow);
          g = Math.round(g * (1 - glow) + 140 * glow);
          b = Math.round(b * (1 - glow) + 255 * glow);
        }
      }

      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
}

export function SkyCanvas({
  cmbGrid,
  cohGrid,
  nTheta,
  nPhi,
  showCoherence,
  coherenceOpacity,
  highlights = [],
  width = 640,
  height = 320,
  precomputedRgba = null,
  precomputedWidth,
  precomputedHeight,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pathRef = useRef<'offscreen' | 'main2d'>('main2d');

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !cmbGrid) return;
    const w = width;
    const h = height;
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fast path: blit precomputed rgba (worker SkyFrame project)
    if (
      precomputedRgba &&
      precomputedWidth &&
      precomputedHeight &&
      precomputedRgba.length === precomputedWidth * precomputedHeight * 4 &&
      precomputedWidth === w &&
      precomputedHeight === h &&
      highlights.length === 0
    ) {
      const img = new ImageData(
        new Uint8ClampedArray(precomputedRgba),
        precomputedWidth,
        precomputedHeight
      );
      ctx.putImageData(img, 0, 0);
      ctx.strokeStyle = 'rgba(140, 180, 255, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2, w / 2 - 1, h / 2 - 1, 0, 0, Math.PI * 2);
      ctx.stroke();
      pathRef.current = 'offscreen';
      return;
    }

    // G3: rasterize via OffscreenCanvas when available (keeps work off display surface)
    const hasOffscreen =
      typeof OffscreenCanvas !== 'undefined' &&
      typeof OffscreenCanvas.prototype.getContext === 'function';

    if (hasOffscreen) {
      try {
        const off = new OffscreenCanvas(w, h);
        const offCtx = off.getContext('2d');
        if (offCtx) {
          const img = offCtx.createImageData(w, h);
          rasterizeToImageData(
            img,
            w,
            h,
            cmbGrid,
            cohGrid,
            nTheta,
            nPhi,
            showCoherence,
            coherenceOpacity,
            highlights
          );
          offCtx.putImageData(img, 0, 0);
          ctx.drawImage(off as unknown as CanvasImageSource, 0, 0);
          ctx.strokeStyle = 'rgba(140, 180, 255, 0.35)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(w / 2, h / 2, w / 2 - 1, h / 2 - 1, 0, 0, Math.PI * 2);
          ctx.stroke();
          pathRef.current = 'offscreen';
          return;
        }
      } catch {
        /* fall through to main 2d */
      }
    }

    const img = ctx.createImageData(w, h);
    rasterizeToImageData(
      img,
      w,
      h,
      cmbGrid,
      cohGrid,
      nTheta,
      nPhi,
      showCoherence,
      coherenceOpacity,
      highlights
    );
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = 'rgba(140, 180, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w / 2 - 1, h / 2 - 1, 0, 0, Math.PI * 2);
    ctx.stroke();
    pathRef.current = 'main2d';
  }, [
    cmbGrid,
    cohGrid,
    nTheta,
    nPhi,
    showCoherence,
    coherenceOpacity,
    highlights,
    width,
    height,
    precomputedRgba,
    precomputedWidth,
    precomputedHeight,
  ]);

  return (
    <canvas
      ref={ref}
      className="sky-canvas"
      width={width}
      height={height}
      aria-label="Mollweide CMB anisotropy map"
      data-raster={pathRef.current}
    />
  );
}
