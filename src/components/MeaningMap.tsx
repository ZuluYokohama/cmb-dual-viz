import { useEffect, useRef } from 'react';
import type { MeaningGraph, MeaningNode } from '../ingest/types';
import { kindColor } from '../math/meaningMap';

interface Props {
  graph: MeaningGraph;
  selectedId: string | null;
  /** Extra node ids to highlight (e.g. correlate pair) */
  highlightIds?: string[];
  onSelect: (node: MeaningNode | null) => void;
  width?: number;
  height?: number;
  ellFocus: number;
  coherenceZ: number;
}

export function MeaningMap({
  graph,
  selectedId,
  highlightIds = [],
  onSelect,
  width = 420,
  height = 320,
  ellFocus,
  coherenceZ,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const highlightSet = new Set(highlightIds);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = '#080c16';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(80, 100, 140, 0.12)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo((width * i) / 4, 0);
      ctx.lineTo((width * i) / 4, height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, (height * i) / 4);
      ctx.lineTo(width, (height * i) / 4);
      ctx.stroke();
    }

    const pad = 28;
    const toXY = (nx: number, ny: number) => ({
      x: pad + ((nx + 1) / 2) * (width - 2 * pad),
      y: pad + ((1 - ny) / 2) * (height - 2 * pad),
    });

    const byId = new Map(graph.nodes.map((n) => [n.id, n]));

    for (const e of graph.edges) {
      const a = byId.get(e.source);
      const b = byId.get(e.target);
      if (!a || !b) continue;
      const pa = toXY(a.x, a.y);
      const pb = toXY(b.x, b.y);
      const alpha = 0.12 + 0.35 * e.weight;
      const pairHot =
        highlightSet.has(e.source) && highlightSet.has(e.target);
      if (e.reason === 'correlate' || pairHot) {
        ctx.strokeStyle = `rgba(232, 121, 249, ${0.35 + 0.45 * e.weight})`;
        ctx.lineWidth = pairHot ? 2.4 : 1.8;
        ctx.setLineDash(e.reason === 'correlate' ? [4, 3] : []);
      } else if (e.reason === 'thread-pull') {
        ctx.strokeStyle = `rgba(251, 191, 36, ${alpha})`;
        ctx.lineWidth = 1.6;
        ctx.setLineDash([]);
      } else if (e.reason === 'shared-multipole') {
        ctx.strokeStyle = `rgba(74, 222, 128, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = `rgba(110, 182, 255, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.fillStyle = 'rgba(74, 222, 128, 0.55)';
    ctx.fillText(`Thread A · ℓ≈${ellFocus}`, 10, 14);
    ctx.fillStyle = 'rgba(251, 191, 36, 0.55)';
    ctx.fillText(`Thread B · z=${coherenceZ.toFixed(2)}`, 10, 28);

    for (const n of graph.nodes) {
      const { x, y } = toXY(n.x, n.y);
      const selected = n.id === selectedId;
      const hi = highlightSet.has(n.id);
      const pull = Math.max(n.pullA, n.pullB);
      const r = selected || hi ? 8 : 3.5 + pull * 4;

      if (pull > 0.35) {
        const g = ctx.createRadialGradient(x, y, r, x, y, r + 10);
        const col = n.pullA >= n.pullB ? '74,222,128' : '251,191,36';
        g.addColorStop(0, `rgba(${col},${0.35 * pull})`);
        g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r + 10, 0, Math.PI * 2);
        ctx.fill();
      }

      if (hi && !selected) {
        ctx.beginPath();
        ctx.arc(x, y, r + 5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(232, 121, 249, 0.85)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = kindColor(n.kind);
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (selected) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    ctx.fillStyle = 'rgba(6,9,20,0.75)';
    ctx.fillRect(0, height - 22, width, 22);
    const kinds: { k: string; c: string }[] = [
      { k: 'ℓ-bin', c: '#4ade80' },
      { k: 'coh', c: '#fbbf24' },
      { k: 'claim', c: '#c84db8' },
      { k: 'sky', c: '#6eb6ff' },
      { k: 'series', c: '#3dd6c3' },
      { k: 'corr', c: '#e879f9' },
    ];
    ctx.font = '9px "IBM Plex Mono", monospace';
    let lx = 8;
    for (const { k, c } of kinds) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(lx, height - 11, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8a9bb8';
      ctx.fillText(k, lx + 6, height - 8);
      lx += 52;
    }
  }, [graph, selectedId, highlightIds, width, height, ellFocus, coherenceZ]);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = ref.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * width;
    const cy = ((e.clientY - rect.top) / rect.height) * height;
    const pad = 28;
    const toXY = (nx: number, ny: number) => ({
      x: pad + ((nx + 1) / 2) * (width - 2 * pad),
      y: pad + ((1 - ny) / 2) * (height - 2 * pad),
    });
    let best: MeaningNode | null = null;
    let bestD = 14;
    for (const n of graph.nodes) {
      const { x, y } = toXY(n.x, n.y);
      const d = Math.hypot(x - cx, y - cy);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    onSelect(best);
  };

  return (
    <canvas
      ref={ref}
      className="meaning-map-canvas"
      width={width}
      height={height}
      onClick={onClick}
      aria-label="Meaning map convergence view"
    />
  );
}
