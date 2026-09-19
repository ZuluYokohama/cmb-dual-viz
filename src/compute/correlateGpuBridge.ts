/**
 * Bridge: pack series pairs for CORRELATE_BATCH GPU (TP_PAIR_BLOCK + TP_LAG_SLICE)
 * and optionally overlay GPU lagged-Pearson scores onto CPU-assembled hits.
 */

import {
  alignSeries,
  bestLaggedPearson,
  type CorrelateHit,
  type CorrelateSeed,
  type ThreadSeriesInput,
} from '../math/correlates';
import type { IngestedDataset, MeaningNode } from '../ingest/types';

export interface PackedPairs {
  series: Float32Array;
  nSeries: number;
  tLen: number;
  pairs: Uint32Array;
  /** index into the series-path hits array for each pair */
  hitIndex: number[];
  nPairs: number;
}

/**
 * Pack seed + target series for hits that used pearson / lagged-pearson.
 * Re-aligns with the same alignSeries(…, 32) as scanCorrelates.
 */
export function collectAlignedPairs(
  seed: CorrelateSeed,
  datasets: IngestedDataset[],
  nodes: MeaningNode[],
  thread: ThreadSeriesInput,
  seriesHits: CorrelateHit[],
  targetLen = 32
): PackedPairs {
  if (!seed.series || seed.series.length < 3 || seriesHits.length === 0) {
    return {
      series: new Float32Array(0),
      nSeries: 0,
      tLen: 0,
      pairs: new Uint32Array(0),
      hitIndex: [],
      nPairs: 0,
    };
  }

  // Resolve target series by targetId using a lightweight rebuild of collectTargets logic
  const targetSeries = resolveTargetSeries(seed, datasets, nodes, thread);

  const rows: Float32Array[] = [];
  const rowKey = new Map<string, number>();
  const ensureRow = (key: string, raw: number[]): number => {
    const existing = rowKey.get(key);
    if (existing != null) return existing;
    const idx = rows.length;
    // Placeholder — will fill after pair align; use raw resampled alone to length
    const [a] = alignSeries(raw, raw, targetLen);
    rows.push(Float32Array.from(a.length ? a : raw.slice(0, targetLen)));
    rowKey.set(key, idx);
    return idx;
  };

  ensureRow('__seed__', seed.series);

  const pairList: number[] = [];
  const hitIndex: number[] = [];
  let tLen = targetLen;

  for (let hi = 0; hi < seriesHits.length; hi++) {
    const h = seriesHits[hi]!;
    const tgt = targetSeries.get(h.targetId);
    if (!tgt || tgt.length < 3) continue;
    const [a, b] = alignSeries(seed.series, tgt, targetLen);
    if (a.length < 4) continue;
    tLen = a.length;

    // Update seed row with this alignment (seed row should be consistent length)
    const seedIdx = rowKey.get('__seed__')!;
    if (rows[seedIdx]!.length !== a.length) {
      rows[seedIdx] = Float32Array.from(a);
    }

    let tIdx = rowKey.get(h.targetId);
    if (tIdx == null) {
      tIdx = rows.length;
      rows.push(Float32Array.from(b));
      rowKey.set(h.targetId, tIdx);
    } else {
      rows[tIdx] = Float32Array.from(b);
    }

    pairList.push(seedIdx, tIdx);
    hitIndex.push(hi);
  }

  const nSeries = rows.length;
  const series = new Float32Array(nSeries * tLen);
  for (let i = 0; i < nSeries; i++) {
    const row = rows[i]!;
    for (let t = 0; t < tLen; t++) {
      series[i * tLen + t] = row[t] ?? 0;
    }
  }

  return {
    series,
    nSeries,
    tLen,
    pairs: Uint32Array.from(pairList),
    hitIndex,
    nPairs: pairList.length / 2,
  };
}

function resolveTargetSeries(
  seed: CorrelateSeed,
  datasets: IngestedDataset[],
  nodes: MeaningNode[],
  thread: ThreadSeriesInput
): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const ds of datasets) {
    if (!ds.enabled) continue;
    if (seed.datasetId && ds.id === seed.datasetId) continue;
    if (ds.series?.length) {
      const sorted = [...ds.series].sort((a, b) => a.t - b.t);
      map.set(
        `tgt-ds-series-${ds.id}`,
        sorted.map((p) => p.value)
      );
    }
    if (ds.cl && ds.cl.length > 3) {
      const clSeries: number[] = [];
      for (let ell = 2; ell < ds.cl.length; ell++) {
        clSeries.push((ell * (ell + 1) * (ds.cl[ell] ?? 0)) / (2 * Math.PI));
      }
      map.set(`tgt-ds-cl-${ds.id}`, clSeries);
    }
  }
  if (seed.kind !== 'thread-a-ell') {
    const out: number[] = [];
    for (let ell = 2; ell <= thread.ellMax; ell++) {
      const w = 1 / (1 + Math.abs(ell - thread.ellFocus));
      out.push(w * ((ell * (ell + 1) * (thread.Cl[ell] ?? 0)) / (2 * Math.PI)));
    }
    map.set('tgt-thread-a', out);
  }
  if (seed.kind !== 'thread-b-coherence') {
    if (thread.seriesDriveHistory && thread.seriesDriveHistory.length >= 4) {
      map.set('tgt-thread-b', thread.seriesDriveHistory.slice());
    } else {
      const out: number[] = [];
      for (let i = 0; i < 24; i++) {
        const t = i / 23;
        out.push(
          thread.coherenceScore * Math.cos(2 * Math.PI * (t + thread.timePhase)) +
            0.15 * thread.coherenceZ * Math.sin(4 * Math.PI * t) +
            0.05 * Math.sin(6 * Math.PI * (t + thread.timePhase))
        );
      }
      map.set('tgt-thread-b', out);
    }
  }
  for (const n of nodes) {
    if (seed.nodeId && n.id === seed.nodeId) continue;
    if (n.kind === 'text-claim' || n.kind === 'sky-sample' || n.kind === 'alm-mode') {
      if (n.kind !== 'text-claim') {
        map.set(`tgt-node-${n.id}`, Array.from(n.features.slice(0, 12)));
      }
    }
  }
  return map;
}

/** CPU verify helper: bestLaggedPearson on packed pair i */
export function cpuScorePackedPair(
  series: Float32Array,
  tLen: number,
  ia: number,
  ib: number,
  maxLag: number
): { score: number; lag: number } {
  const a: number[] = [];
  const b: number[] = [];
  for (let t = 0; t < tLen; t++) {
    a.push(series[ia * tLen + t]!);
    b.push(series[ib * tLen + t]!);
  }
  return bestLaggedPearson(a, b, maxLag);
}
