import type { LedgerRecord } from '../compute/ledger';
import type { CorrelateHit } from './correlates';
import type { CorrelateEdge } from '../ingest/types';

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function metricFromHit(metric: CorrelateHit['metric']): CorrelateEdge['metric'] {
  if (metric === 'lagged-pearson') return 'lagged_pearson';
  return metric;
}

export function correlateEdgeId(
  sourceId: string,
  targetId: string,
  metric: CorrelateEdge['metric'],
  lag: number
): string {
  return `edge-${hashStr(`${sourceId}|${targetId}|${metric}|${lag}`).toString(16)}`;
}

export function correlateEdgesFromHits(
  hits: CorrelateHit[],
  ledgerRef: string,
  createdAt: string
): CorrelateEdge[] {
  const out: CorrelateEdge[] = [];
  for (const h of hits) {
    if (!h.seedNodeId || !h.targetNodeId || h.seedNodeId === h.targetNodeId) continue;
    const metric = metricFromHit(h.metric);
    out.push({
      id: correlateEdgeId(h.seedNodeId, h.targetNodeId, metric, h.lag),
      sourceId: h.seedNodeId,
      targetId: h.targetNodeId,
      metric,
      lag: h.lag,
      score: h.score,
      pValue: h.pValue,
      n: h.n,
      ledgerRef,
      createdAt,
    });
  }
  return out;
}

export function upsertCorrelateEdges(
  current: CorrelateEdge[],
  incoming: CorrelateEdge[]
): CorrelateEdge[] {
  const map = new Map<string, CorrelateEdge>();
  for (const edge of current) map.set(edge.id, edge);
  for (const edge of incoming) map.set(edge.id, edge);
  return [...map.values()];
}

export function filterCorrelateEdgesByPValue(
  edges: CorrelateEdge[],
  threshold = 0.01
): CorrelateEdge[] {
  const t = Math.max(0, threshold);
  return edges.filter((e) => Number.isFinite(e.pValue) && e.pValue < t);
}

export function replayCorrelateEdgesFromLedger(records: LedgerRecord[]): CorrelateEdge[] {
  let edges: CorrelateEdge[] = [];
  for (const rec of records) {
    if (rec.kind !== 'correlate') continue;
    const hits = (rec.detail?.hits ?? null) as CorrelateHit[] | null;
    if (!Array.isArray(hits) || hits.length === 0) continue;
    edges = upsertCorrelateEdges(
      edges,
      correlateEdgesFromHits(hits, rec.id, new Date(rec.at).toISOString())
    );
  }
  return edges;
}
