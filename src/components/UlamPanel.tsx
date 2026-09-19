import { useEffect, useRef } from 'react';
import { ulamSpiralCoords } from '../math/ulam';

interface Props {
  maxN?: number;
  size?: number;
}

export function UlamPanel({ maxN = 1600, size = 160 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = size;
    canvas.height = size;

    ctx.fillStyle = '#080c16';
    ctx.fillRect(0, 0, size, size);

    const pts = ulamSpiralCoords(maxN);
    let maxCoord = 1;
    for (const p of pts) {
      maxCoord = Math.max(maxCoord, Math.abs(p.x), Math.abs(p.y));
    }
    const scale = ((size * 0.42) / maxCoord) | 0 || 1;
    const cx = size / 2;
    const cy = size / 2;

    for (const p of pts) {
      if (!p.prime) continue;
      const px = cx + p.x * scale;
      const py = cy - p.y * scale;
      ctx.fillStyle = 'rgba(120, 200, 255, 0.85)';
      ctx.fillRect(px - 1, py - 1, 2, 2);
    }
  }, [maxN, size]);

  return (
    <div className="ulam-panel">
      <div className="panel-label">
        <span className="badge badge-analogy">Geometric analogy</span>
        Ulam / prime spiral
      </div>
      <canvas ref={ref} width={size} height={size} aria-label="Ulam prime spiral" />
      <p className="hint">
        Discrete structure in the plane — visual metaphor only, not CMB physics.
      </p>
    </div>
  );
}
