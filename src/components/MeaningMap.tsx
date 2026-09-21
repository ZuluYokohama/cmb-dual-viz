import { useEffect, useRef } from 'react';
import type { CorrelateEdge, MeaningGraph, MeaningNode } from '../ingest/types';
import { kindColor } from '../math/meaningMap';

interface Props {
  graph: MeaningGraph;
  selectedId: string | null;
  /** Extra node ids to highlight (e.g. correlate pair) */
  highlightIds?: string[];
  onSelect: (node: MeaningNode | null) => void;
  onSelectEdge?: (edge: CorrelateEdge | null) => void;
  width?: number;
  height?: number;
  ellFocus: number;
  coherenceZ: number;
}

function correlateMetricColor(metric: CorrelateEdge['metric']): string {
  switch (metric) {
    case 'pearson':
      return '232,121,249';
    case 'lagged_pearson':
      return '244,114,182';
    case 'spearman':
      return '139,92,246';
    case 'cosine':
      return '217,70,239';
    default:
      return '232,121,249';
  }
}

function pointToSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const denom = dx * dx + dy * dy;
  if (denom <= 1e-12) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / denom));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return Math.hypot(px - x, py - y);
}

export function MeaningMap({
  graph,
  selectedId,
  highlightIds = [],
  onSelect,
  onSelectEdge,
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
        const metricColor = e.correlate
          ? correlateMetricColor(e.correlate.metric)
          : '232,121,249';
        const edgeAlpha = 0.2 + 0.65 * Math.min(1, Math.abs(e.weight));
        ctx.strokeStyle = `rgba(${metricColor}, ${edgeAlpha})`;
        ctx.lineWidth = pairHot ? 2.4 : e.bareTouch ? 2.2 : 1.8;
        ctx.setLineDash(e.reason === 'correlate' ? (e.bareTouch ? [2, 2] : [4, 3]) : []);
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

  const pickAt = (clientX: number, clientY: number) => {
    const canvas = ref.current;
    if (!canvas) return { node: null as MeaningNode | null, edge: null as CorrelateEdge | null };
    const rect = canvas.getBoundingClientRect();
    const cx = ((clientX - rect.left) / rect.width) * width;
    const cy = ((clientY - rect.top) / rect.height) * height;
    const pad = 28;
    const toXY = (nx: number, ny: number) => ({
      x: pad + ((nx + 1) / 2) * (width - 2 * pad),
      y: pad + ((1 - ny) / 2) * (height - 2 * pad),
    });
    let bestNode: MeaningNode | null = null;
    let bestNodeDist = 14;
    for (const n of graph.nodes) {
      const { x, y } = toXY(n.x, n.y);
      const d = Math.hypot(x - cx, y - cy);
      if (d < bestNodeDist) {
        bestNodeDist = d;
        bestNode = n;
      }
    }
    let bestEdge: CorrelateEdge | null = null;
    let bestEdgeDist = 8;
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    for (const e of graph.edges) {
      if (e.reason !== 'correlate' || !e.correlate) continue;
      const a = byId.get(e.source);
      const b = byId.get(e.target);
      if (!a || !b) continue;
      const pa = toXY(a.x, a.y);
      const pb = toXY(b.x, b.y);
      const d = pointToSegmentDistance(cx, cy, pa.x, pa.y, pb.x, pb.y);
      if (d < bestEdgeDist) {
        bestEdgeDist = d;
        bestEdge = e.correlate;
      }
    }
    return { node: bestNode, edge: bestEdge };
  };

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const picked = pickAt(e.clientX, e.clientY);
    if (picked.edge && !picked.node) {
      onSelectEdge?.(picked.edge);
      onSelect(null);
      return;
    }
    if (picked.edge) {
      onSelectEdge?.(picked.edge);
      return;
    }
    onSelectEdge?.(null);
    onSelect(picked.node);
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = ref.current;
    if (!canvas) return;
    const picked = pickAt(e.clientX, e.clientY);
    if (picked.edge) {
      const ce = picked.edge;
      canvas.style.cursor = 'pointer';
      canvas.title =
        `${ce.metric} lag=${ce.lag} score=${ce.score.toFixed(3)} ` +
        `p=${ce.pValue.toExponential(2)} n=${ce.n} ledger=${ce.ledgerRef}`;
      return;
    }
    canvas.style.cursor = '';
    canvas.title = '';
  };

  return (
    <canvas
      ref={ref}
      className="meaning-map-canvas"
      width={width}
      height={height}
      onClick={onClick}
      onMouseMove={onMouseMove}
      onMouseLeave={() => {
        const canvas = ref.current;
        if (!canvas) return;
        canvas.style.cursor = '';
        canvas.title = '';
      }}
      aria-label="Meaning map convergence view"
    />
  );
}
