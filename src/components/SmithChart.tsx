import { useEffect, useMemo, useRef } from 'react';
import type { Complex, SmithState, TransferArc } from '../math/smith';
import {
  constRCircle,
  sampleConstXArc,
} from '../math/smith';

interface Props {
  state: SmithState;
  /** Trail of Γ points from time scrub */
  trail: Complex[];
  /** Optional short transfer arcs (meaning-map edges) */
  transferArcs?: TransferArc[];
  width?: number;
  height?: number;
}

const R_VALUES = [0.2, 0.5, 1, 2, 5];
const X_VALUES = [0.2, 0.5, 1, 2, -0.2, -0.5, -1, -2];

function toCanvas(
  g: Complex,
  cx: number,
  cy: number,
  scale: number
): { x: number; y: number } {
  return { x: cx + g.re * scale, y: cy - g.im * scale };
}

export function SmithChart({
  state,
  trail,
  transferArcs = [],
  width = 280,
  height = 280,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  const readouts = useMemo(
    () => ({
      gRe: state.gamma.re,
      gIm: state.gamma.im,
      mag: state.magGamma,
      swr: state.swr,
      r: state.r,
      x: state.x,
      matchPull: state.matchPull,
      source: state.source,
    }),
    [state]
  );

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#080c16';
    ctx.fillRect(0, 0, width, height);

    const pad = 18;
    const cx = width / 2;
    const cy = height / 2;
    const scale = Math.min(width, height) / 2 - pad;

    // Outer unit circle
    ctx.beginPath();
    ctx.arc(cx, cy, scale, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(110, 182, 255, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Soft fill inside unit disk
    ctx.beginPath();
    ctx.arc(cx, cy, scale, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20, 40, 80, 0.35)';
    ctx.fill();

    // Horizontal r-axis (real Γ)
    ctx.beginPath();
    ctx.moveTo(cx - scale, cy);
    ctx.lineTo(cx + scale, cy);
    ctx.strokeStyle = 'rgba(138, 155, 184, 0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Constant-r circles
    ctx.strokeStyle = 'rgba(61, 214, 195, 0.28)';
    ctx.lineWidth = 1;
    for (const r of R_VALUES) {
      const { cx: gx, cy: gy, rad } = constRCircle(r);
      ctx.beginPath();
      ctx.arc(cx + gx * scale, cy - gy * scale, rad * scale, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Constant-x arcs
    ctx.strokeStyle = 'rgba(255, 159, 67, 0.22)';
    for (const x of X_VALUES) {
      const pts = sampleConstXArc(x, 48);
      if (pts.length < 2) continue;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const p = toCanvas(pts[i]!, cx, cy, scale);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    // Rim label
    ctx.fillStyle = 'rgba(138, 155, 184, 0.7)';
    ctx.font = '9px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('|Γ|=1 rim', cx, cy - scale - 5);

    // MATCH center
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#4ade80';
    ctx.fill();
    ctx.fillStyle = 'rgba(74, 222, 128, 0.9)';
    ctx.font = '600 9px "Outfit", system-ui, sans-serif';
    ctx.fillText('MATCH', cx, cy + 14);

    // Transfer arcs (meaning-map edges → short chords on Smith)
    for (const arc of transferArcs) {
      const a = toCanvas(arc.from, cx, cy, scale);
      const b = toCanvas(arc.to, cx, cy, scale);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      // slight quadratic bulge toward center (transfer intuition)
      const mx = (a.x + b.x) / 2 * 0.7 + cx * 0.3;
      const my = (a.y + b.y) / 2 * 0.7 + cy * 0.3;
      ctx.quadraticCurveTo(mx, my, b.x, b.y);
      ctx.strokeStyle = `rgba(232, 121, 249, ${0.25 + 0.5 * arc.weight})`;
      ctx.lineWidth = 1 + arc.weight;
      ctx.stroke();
    }

    // Trail
    if (trail.length >= 2) {
      ctx.beginPath();
      for (let i = 0; i < trail.length; i++) {
        const p = toCanvas(trail[i]!, cx, cy, scale);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = 'rgba(200, 77, 184, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // fading dots
      const step = Math.max(1, Math.floor(trail.length / 24));
      for (let i = 0; i < trail.length; i += step) {
        const t = i / Math.max(1, trail.length - 1);
        const p = toCanvas(trail[i]!, cx, cy, scale);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 77, 184, ${0.2 + 0.5 * t})`;
        ctx.fill();
      }
    }

    // Current Γ marker (glow)
    const g = state.gamma;
    // Clamp draw to unit disk for display safety
    const mag = Math.hypot(g.re, g.im);
    const drawG =
      mag > 1.05
        ? { re: (g.re / mag) * 1.02, im: (g.im / mag) * 1.02 }
        : g;
    const gp = toCanvas(drawG, cx, cy, scale);

    const glow = ctx.createRadialGradient(gp.x, gp.y, 0, gp.x, gp.y, 16);
    glow.addColorStop(0, 'rgba(110, 182, 255, 0.85)');
    glow.addColorStop(0.4, 'rgba(110, 182, 255, 0.25)');
    glow.addColorStop(1, 'rgba(110, 182, 255, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(gp.x, gp.y, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(gp.x, gp.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#6eb6ff';
    ctx.fill();
    ctx.strokeStyle = '#e4ecf8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Match-pull ring (toy control law visual)
    if (state.matchPull > 0.05) {
      ctx.beginPath();
      ctx.arc(cx, cy, 8 + 18 * (1 - state.matchPull), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(74, 222, 128, ${0.15 + 0.45 * state.matchPull})`;
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [state, trail, transferArcs, width, height]);

  const fmt = (v: number, d = 3) =>
    Number.isFinite(v) ? v.toFixed(d) : '—';

  return (
    <div className="smith-panel">
      <div className="panel-label">
        <span className="badge badge-derived">Derived / RF-topology</span>
        Smith chart — mismatch→match dial
      </div>
      <div className="smith-banner">
        Smith chart = conformal mismatch→match instrument for intuition. RF math is
        real; mapping from CMB/coherence/meaning features onto z is DERIVED analogy.
        Not EW/SDR claims; not proof of non-local effects. Research tags only:
        quantum log-derivative isomorphism · minimize reflection / maximize transfer.
      </div>
      <canvas
        ref={ref}
        width={width}
        height={height}
        className="smith-canvas"
        aria-label="Smith chart reflection coefficient"
      />
      <div className="smith-readouts">
        <div className="metric">
          <span className="metric-label">Re(Γ) · DERIVED</span>
          <span className="metric-value">{fmt(readouts.gRe)}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Im(Γ) · DERIVED</span>
          <span className="metric-value">{fmt(readouts.gIm)}</span>
        </div>
        <div className="metric">
          <span className="metric-label">|Γ| · DERIVED</span>
          <span className="metric-value">{fmt(readouts.mag)}</span>
        </div>
        <div className="metric">
          <span className="metric-label">SWR (toy) · DERIVED</span>
          <span className="metric-value">
            {readouts.swr == null ? '∞' : fmt(readouts.swr, 2)}
          </span>
        </div>
        <div className="metric">
          <span className="metric-label">r · DERIVED</span>
          <span className="metric-value">{fmt(readouts.r, 2)}</span>
        </div>
        <div className="metric">
          <span className="metric-label">x · DERIVED</span>
          <span className="metric-value">{fmt(readouts.x, 2)}</span>
        </div>
      </div>
      <p className="hint smith-hint">
        Source: <strong>{readouts.source}</strong>
        {' · '}
        toy match-pull {fmt(readouts.matchPull, 2)} (halos → center).{' '}
        {state.mappingNote}
      </p>
    </div>
  );
}
