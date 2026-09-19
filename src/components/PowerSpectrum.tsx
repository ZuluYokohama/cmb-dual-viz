import { useEffect, useRef } from 'react';
import { exampleCl } from '../math/sphericalHarmonics';

interface Props {
  Cl: number[];
  ellMax: number;
  width?: number;
  height?: number;
}

export function PowerSpectrum({ Cl, ellMax, width = 360, height = 180 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = width;
    canvas.height = height;

    const pad = { l: 44, r: 12, t: 16, b: 32 };
    const pw = width - pad.l - pad.r;
    const ph = height - pad.t - pad.b;

    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, width, height);

    // Theory curve (EXAMPLE) and realized D_ℓ = ℓ(ℓ+1)C_ℓ/2π
    const theory: number[] = [];
    const realized: number[] = [];
    let maxY = 0;
    for (let ell = 2; ell <= ellMax; ell++) {
      const dTh = (ell * (ell + 1) * exampleCl(ell)) / (2 * Math.PI);
      const dRe = (ell * (ell + 1) * (Cl[ell] ?? 0)) / (2 * Math.PI);
      theory.push(dTh);
      realized.push(dRe);
      maxY = Math.max(maxY, dTh, dRe);
    }
    maxY *= 1.15;
    if (maxY < 1e-12) maxY = 1;

    const xOf = (ell: number) => pad.l + ((ell - 2) / Math.max(1, ellMax - 2)) * pw;
    const yOf = (v: number) => pad.t + ph - (v / maxY) * ph;

    // Grid
    ctx.strokeStyle = 'rgba(80, 100, 140, 0.25)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (ph * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + pw, y);
      ctx.stroke();
    }

    // EXAMPLE theory curve
    ctx.strokeStyle = 'rgba(100, 160, 255, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    for (let i = 0; i < theory.length; i++) {
      const ell = i + 2;
      const x = xOf(ell);
      const y = yOf(theory[i]!);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Realized (from drawn coeffs / amp scales)
    ctx.strokeStyle = '#ff9f43';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < realized.length; i++) {
      const ell = i + 2;
      const x = xOf(ell);
      const y = yOf(realized[i]!);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Axes labels
    ctx.fillStyle = '#8a9bb8';
    ctx.font = '11px "IBM Plex Mono", monospace';
    ctx.fillText('ℓ', pad.l + pw / 2, height - 8);
    ctx.save();
    ctx.translate(12, pad.t + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('D_ℓ = ℓ(ℓ+1)C_ℓ/2π', -40, 0);
    ctx.restore();

    ctx.fillStyle = 'rgba(100, 160, 255, 0.8)';
    ctx.fillText('EXAMPLE theory', pad.l + 4, pad.t + 12);
    ctx.fillStyle = '#ff9f43';
    ctx.fillText('realized (scaled)', pad.l + 4, pad.t + 26);

    ctx.fillStyle = '#6a7a98';
    ctx.fillText('2', xOf(2) - 4, height - 18);
    ctx.fillText(String(ellMax), xOf(ellMax) - 10, height - 18);
  }, [Cl, ellMax, width, height]);

  return (
    <canvas
      ref={ref}
      className="power-spectrum"
      width={width}
      height={height}
      aria-label="Angular power spectrum C_ell"
    />
  );
}
