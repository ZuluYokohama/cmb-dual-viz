/**
 * Correlate search — RESEARCH / DERIVED candidate finder under a toy null.
 * High score ≠ OPEN. Separate evaluator / human owns any claim.
 *
 * MVP: Pearson (+ optional lag) on aligned series; Spearman rank;
 * embedding cosine for claims / feature vectors; shuffle null → z (toy).
 * Sky-bin spatial correlates deferred (residue).
 */

import { cosine } from './embedding';
import type { EpistemicLabel, IngestedDataset, MeaningNode } from '../ingest/types';

function asF32(v: Float32Array | number[]): Float32Array {
  return v instanceof Float32Array ? v : Float32Array.from(v);
}


export type CorrelateMetric = 'pearson' | 'spearman' | 'cosine' | 'lagged-pearson';

export type CorrelateSeedKind =
  | 'dataset-series'
  | 'meaning-node'
  | 'thread-a-ell'
  | 'thread-b-coherence';

export interface CorrelateSeed {
  id: string;
  label: string;
  kind: CorrelateSeedKind;
  /** Numeric series when available */
  series?: number[];
  /** Feature vector for cosine path */
  features?: Float32Array | number[];
  epistemic: EpistemicLabel;
  nodeId?: string;
  datasetId?: string;
}

export interface CorrelateHit {
  id: string;
  seedId: string;
  seedLabel: string;
  targetId: string;
  targetLabel: string;
  metric: CorrelateMetric;
  score: number;
  lag: number;
  nullMean: number;
  nullStd: number;
  /** (score - nullMean) / nullStd — toy, not formal inference */
  zToy: number;
  epistemic: EpistemicLabel;
  seedNodeId?: string;
  targetNodeId?: string;
  seedDatasetId?: string;
  targetDatasetId?: string;
  note: string;
}

export interface CorrelateScanResult {
  hits: CorrelateHit[];
  residue: string[];
  scanned: number;
}

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i]!;
    mb += b[i]!;
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i]! - ma;
    const xb = b[i]! - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const den = Math.sqrt(da * db);
  if (den < 1e-12) return 0;
  return num / den;
}

function rankArray(xs: number[]): number[] {
  const idx = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array(xs.length).fill(0);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j < idx.length && idx[j]!.v === idx[i]!.v) j++;
    const avg = (i + j - 1) / 2 + 1;
    for (let k = i; k < j; k++) ranks[idx[k]!.i] = avg;
    i = j;
  }
  return ranks;
}

function spearman(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  return pearson(rankArray(a.slice(0, n)), rankArray(b.slice(0, n)));
}

/** Best absolute Pearson over lag ∈ [-maxLag, maxLag] */
export function bestLaggedPearson(
  a: number[],
  b: number[],
  maxLag: number
): { score: number; lag: number } {
  let best = { score: 0, lag: 0 };
  const lim = Math.min(maxLag, Math.floor(Math.min(a.length, b.length) / 3));
  for (let lag = -lim; lag <= lim; lag++) {
    let x: number[];
    let y: number[];
    if (lag >= 0) {
      x = a.slice(0, a.length - lag || undefined);
      y = b.slice(lag);
    } else {
      x = a.slice(-lag);
      y = b.slice(0, b.length + lag || undefined);
    }
    const n = Math.min(x.length, y.length);
    if (n < 4) continue;
    const s = pearson(x.slice(0, n), y.slice(0, n));
    if (Math.abs(s) > Math.abs(best.score)) best = { score: s, lag };
  }
  return best;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace(xs: number[], rng: () => number) {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = xs[i]!;
    xs[i] = xs[j]!;
    xs[j] = tmp;
  }
}

/** Toy null: shuffle target, recompute score, return mean/std/z */
export function nullZ(
  score: number,
  recomputer: (shuffledTarget: number[]) => number,
  target: number[],
  nShuffle = 40,
  seed = 12345
): { nullMean: number; nullStd: number; zToy: number } {
  const rng = mulberry32(seed);
  const nullScores: number[] = [];
  for (let s = 0; s < nShuffle; s++) {
    const sh = target.slice();
    shuffleInPlace(sh, rng);
    nullScores.push(recomputer(sh));
  }
  const nullMean = mean(nullScores);
  let v = 0;
  for (const x of nullScores) v += (x - nullMean) ** 2;
  const nullStd = Math.sqrt(v / Math.max(1, nullScores.length - 1)) || 1e-6;
  const zToy = (score - nullMean) / nullStd;
  return { nullMean, nullStd, zToy };
}

function nullZCosine(
  score: number,
  seedFeat: Float32Array | number[],
  targetFeat: Float32Array | number[],
  nShuffle = 40,
  seed = 99
): { nullMean: number; nullStd: number; zToy: number } {
  const rng = mulberry32(seed);
  const nullScores: number[] = [];
  const dim = Math.min(seedFeat.length, targetFeat.length);
  for (let s = 0; s < nShuffle; s++) {
    const sh = new Float32Array(dim);
    for (let i = 0; i < dim; i++) sh[i] = targetFeat[i]!;
    // permute indices
    const idx = Array.from({ length: dim }, (_, i) => i);
    for (let i = dim - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = idx[i]!;
      idx[i] = idx[j]!;
      idx[j] = t;
    }
    const perm = new Float32Array(dim);
    for (let i = 0; i < dim; i++) perm[i] = sh[idx[i]!]!;
    nullScores.push(cosine(asF32(seedFeat), perm));
  }
  const nullMean = mean(nullScores);
  let v = 0;
  for (const x of nullScores) v += (x - nullMean) ** 2;
  const nullStd = Math.sqrt(v / Math.max(1, nullScores.length - 1)) || 1e-6;
  return { nullMean, nullStd, zToy: (score - nullMean) / nullStd };
}

/** Resample / truncate to common length by linear index alignment */
export function alignSeries(a: number[], b: number[], targetLen = 32): [number[], number[]] {
  const n = Math.min(targetLen, Math.max(a.length, b.length), 128);
  if (a.length < 2 || b.length < 2) return [[], []];
  const sample = (xs: number[], len: number) => {
    if (xs.length === len) return xs.slice();
    const out: number[] = [];
    for (let i = 0; i < len; i++) {
      const t = (i / Math.max(1, len - 1)) * (xs.length - 1);
      const i0 = Math.floor(t);
      const i1 = Math.min(xs.length - 1, i0 + 1);
      const f = t - i0;
      out.push(xs[i0]! * (1 - f) + xs[i1]! * f);
    }
    return out;
  };
  return [sample(a, n), sample(b, n)];
}

export interface ThreadSeriesInput {
  Cl: number[];
  ellFocus: number;
  ellMax: number;
  /** Coherence score history proxy — single window expanded */
  coherenceScore: number;
  coherenceZ: number;
  timePhase: number;
  /** Optional external/local series drive samples */
  seriesDriveHistory?: number[];
}

/** Build Thread A focus-ℓ power “series” across neighboring ℓ as a short vector */
export function threadAEllSeries(Cl: number[], ellFocus: number, ellMax: number): number[] {
  const out: number[] = [];
  for (let ell = 2; ell <= ellMax; ell++) {
    const w = 1 / (1 + Math.abs(ell - ellFocus));
    out.push(w * ((ell * (ell + 1) * (Cl[ell] ?? 0)) / (2 * Math.PI)));
  }
  return out;
}

/** Synthetic short Thread B window from score/z/phase (toy) */
export function threadBCohSeries(
  score: number,
  z: number,
  phase: number,
  driveHistory?: number[]
): number[] {
  if (driveHistory && driveHistory.length >= 4) return driveHistory.slice();
  const out: number[] = [];
  for (let i = 0; i < 24; i++) {
    const t = i / 23;
    out.push(
      score * Math.cos(2 * Math.PI * (t + phase)) +
        0.15 * z * Math.sin(4 * Math.PI * t) +
        0.05 * Math.sin(6 * Math.PI * (t + phase))
    );
  }
  return out;
}

export function buildSeeds(opts: {
  datasets: IngestedDataset[];
  nodes: MeaningNode[];
  selectedNode: MeaningNode | null;
  thread: ThreadSeriesInput;
}): CorrelateSeed[] {
  const seeds: CorrelateSeed[] = [];
  const { datasets, nodes, selectedNode, thread } = opts;

  seeds.push({
    id: 'seed-thread-a',
    label: `Thread A focus-ℓ power (ℓ≈${thread.ellFocus})`,
    kind: 'thread-a-ell',
    series: threadAEllSeries(thread.Cl, thread.ellFocus, thread.ellMax),
    epistemic: 'PHYSICS-BACKED (EXAMPLE)',
    nodeId: nodes.find((n) => n.id.startsWith('threadA-ell-'))?.id,
  });

  seeds.push({
    id: 'seed-thread-b',
    label: 'Thread B coherence window',
    kind: 'thread-b-coherence',
    series: threadBCohSeries(
      thread.coherenceScore,
      thread.coherenceZ,
      thread.timePhase,
      thread.seriesDriveHistory
    ),
    features: nodes.find((n) => n.id === 'threadB-coherence')?.features,
    epistemic: 'METAPHOR/RESEARCH',
    nodeId: 'threadB-coherence',
  });

  for (const ds of datasets) {
    if (!ds.enabled || !ds.series?.length) continue;
    const sorted = [...ds.series].sort((a, b) => a.t - b.t);
    seeds.push({
      id: `seed-ds-${ds.id}`,
      label: `${ds.name} series`,
      kind: 'dataset-series',
      series: sorted.map((p) => p.value),
      epistemic: ds.epistemic === 'PHYSICS-BACKED' ? 'PHYSICS-BACKED (EXAMPLE)' : ds.epistemic,
      datasetId: ds.id,
      nodeId: nodes.find((n) => n.datasetId === ds.id && n.kind === 'time-series-window')?.id,
    });
  }

  if (selectedNode) {
    seeds.push({
      id: `seed-node-${selectedNode.id}`,
      label: `Node: ${selectedNode.label}`,
      kind: 'meaning-node',
      features: selectedNode.features,
      series:
        selectedNode.kind === 'time-series-window' || selectedNode.kind === 'multipole-bin'
          ? Array.from(selectedNode.features.slice(0, 16))
          : undefined,
      epistemic:
        selectedNode.epistemic === 'PHYSICS-BACKED'
          ? 'PHYSICS-BACKED (EXAMPLE)'
          : selectedNode.epistemic,
      nodeId: selectedNode.id,
      datasetId: selectedNode.datasetId,
    });
  }

  return seeds;
}

interface Target {
  id: string;
  label: string;
  series?: number[];
  features?: Float32Array | number[];
  epistemic: EpistemicLabel;
  nodeId?: string;
  datasetId?: string;
}

function collectTargets(
  seed: CorrelateSeed,
  datasets: IngestedDataset[],
  nodes: MeaningNode[],
  thread: ThreadSeriesInput
): Target[] {
  const targets: Target[] = [];
  const skip = new Set<string>();
  if (seed.datasetId) skip.add(seed.datasetId);
  if (seed.nodeId) skip.add(seed.nodeId);
  skip.add(seed.id);

  // Other dataset series + cl as series
  for (const ds of datasets) {
    if (!ds.enabled) continue;
    if (seed.datasetId && ds.id === seed.datasetId) continue;
    if (ds.series?.length) {
      const sorted = [...ds.series].sort((a, b) => a.t - b.t);
      targets.push({
        id: `tgt-ds-series-${ds.id}`,
        label: `${ds.name} series`,
        series: sorted.map((p) => p.value),
        epistemic: ds.epistemic === 'PHYSICS-BACKED' ? 'PHYSICS-BACKED (EXAMPLE)' : ds.epistemic,
        datasetId: ds.id,
        nodeId: nodes.find((n) => n.datasetId === ds.id && n.kind === 'time-series-window')?.id,
      });
    }
    if (ds.cl && ds.cl.length > 3) {
      const clSeries: number[] = [];
      for (let ell = 2; ell < ds.cl.length; ell++) {
        clSeries.push((ell * (ell + 1) * (ds.cl[ell] ?? 0)) / (2 * Math.PI));
      }
      targets.push({
        id: `tgt-ds-cl-${ds.id}`,
        label: `${ds.name} C_ℓ`,
        series: clSeries,
        epistemic: ds.epistemic === 'PHYSICS-BACKED' ? 'PHYSICS-BACKED (EXAMPLE)' : ds.epistemic,
        datasetId: ds.id,
        nodeId: nodes.find((n) => n.datasetId === ds.id && n.kind === 'multipole-bin')?.id,
      });
    }
  }

  // Thread counterparts if seed isn't that thread
  if (seed.kind !== 'thread-a-ell') {
    targets.push({
      id: 'tgt-thread-a',
      label: `Thread A ℓ-power`,
      series: threadAEllSeries(thread.Cl, thread.ellFocus, thread.ellMax),
      epistemic: 'PHYSICS-BACKED (EXAMPLE)',
      nodeId: nodes.find((n) => n.id.startsWith('threadA-ell-'))?.id,
    });
  }
  if (seed.kind !== 'thread-b-coherence') {
    targets.push({
      id: 'tgt-thread-b',
      label: 'Thread B coherence',
      series: threadBCohSeries(
        thread.coherenceScore,
        thread.coherenceZ,
        thread.timePhase,
        thread.seriesDriveHistory
      ),
      features: nodes.find((n) => n.id === 'threadB-coherence')?.features,
      epistemic: 'METAPHOR/RESEARCH',
      nodeId: 'threadB-coherence',
    });
  }

  // Meaning nodes (claims etc.) for cosine
  for (const n of nodes) {
    if (seed.nodeId && n.id === seed.nodeId) continue;
    if (seed.datasetId && n.datasetId === seed.datasetId && n.kind === 'text-claim') {
      // still allow other claims from same ds? skip same node only
    }
    if (n.kind === 'text-claim' || n.kind === 'sky-sample' || n.kind === 'alm-mode') {
      targets.push({
        id: `tgt-node-${n.id}`,
        label: n.label,
        features: n.features,
        series: n.kind !== 'text-claim' ? Array.from(n.features.slice(0, 12)) : undefined,
        epistemic:
          n.epistemic === 'PHYSICS-BACKED' ? 'PHYSICS-BACKED (EXAMPLE)' : n.epistemic,
        nodeId: n.id,
        datasetId: n.datasetId,
      });
    }
  }

  return targets;
}

/**
 * Scan correlates for a seed against all other active sources.
 */
export function scanCorrelates(
  seed: CorrelateSeed,
  datasets: IngestedDataset[],
  nodes: MeaningNode[],
  thread: ThreadSeriesInput,
  opts?: { maxLag?: number; topN?: number }
): CorrelateScanResult {
  const maxLag = opts?.maxLag ?? 5;
  const topN = opts?.topN ?? 12;
  const residue: string[] = [
    'Sky-bin spatial correlates deferred (residue).',
    'Null z is a toy shuffle baseline — not formal inference / not OPEN certification.',
  ];
  const hits: CorrelateHit[] = [];
  const targets = collectTargets(seed, datasets, nodes, thread);
  let scanned = 0;

  for (const tgt of targets) {
    scanned++;
    // Series path
    if (seed.series && seed.series.length >= 3 && tgt.series && tgt.series.length >= 3) {
      const [a, b] = alignSeries(seed.series, tgt.series);
      if (a.length >= 4) {
        const pear = pearson(a, b);
        const sp = spearman(a, b);
        const lagged = bestLaggedPearson(a, b, maxLag);
        const metric: CorrelateMetric =
          Math.abs(lagged.lag) > 0 ? 'lagged-pearson' : 'pearson';
        const score = Math.abs(lagged.lag) > 0 ? lagged.score : pear;
        const nullStats = nullZ(
          score,
          (sh) => {
            if (Math.abs(lagged.lag) > 0) {
              return bestLaggedPearson(a, sh, maxLag).score;
            }
            return pearson(a, sh);
          },
          b,
          36,
          hashStr(seed.id + tgt.id)
        );
        hits.push({
          id: `hit-${seed.id}-${tgt.id}-series`,
          seedId: seed.id,
          seedLabel: seed.label,
          targetId: tgt.id,
          targetLabel: tgt.label,
          metric,
          score,
          lag: lagged.lag,
          ...nullStats,
          epistemic: demote(seed.epistemic, tgt.epistemic),
          seedNodeId: seed.nodeId,
          targetNodeId: tgt.nodeId,
          seedDatasetId: seed.datasetId,
          targetDatasetId: tgt.datasetId,
          note: `Spearman=${sp.toFixed(3)} (aux). Toy null shuffle.`,
        });
      }
    }

    // Cosine path (claims / features)
    if (seed.features && tgt.features) {
      const score = cosine(asF32(seed.features), asF32(tgt.features));
      const nullStats = nullZCosine(
        score,
        seed.features,
        tgt.features,
        36,
        hashStr(seed.id + tgt.id + 'cos')
      );
      hits.push({
        id: `hit-${seed.id}-${tgt.id}-cos`,
        seedId: seed.id,
        seedLabel: seed.label,
        targetId: tgt.id,
        targetLabel: tgt.label,
        metric: 'cosine',
        score,
        lag: 0,
        ...nullStats,
        epistemic: demote(seed.epistemic, tgt.epistemic),
        seedNodeId: seed.nodeId,
        targetNodeId: tgt.nodeId,
        seedDatasetId: seed.datasetId,
        targetDatasetId: tgt.datasetId,
        note: 'Embedding cosine vs feature vector. Toy null = feature permute.',
      });
    }
  }

  hits.sort((a, b) => Math.abs(b.zToy) - Math.abs(a.zToy) || Math.abs(b.score) - Math.abs(a.score));
  return { hits: hits.slice(0, topN), residue, scanned };
}

function demote(a: EpistemicLabel, b: EpistemicLabel): EpistemicLabel {
  const rank = (e: EpistemicLabel) =>
    e === 'PHYSICS-BACKED'
      ? 0
      : e === 'PHYSICS-BACKED (EXAMPLE)'
        ? 1
        : e === 'METAPHOR/RESEARCH'
          ? 2
          : 3;
  // Never auto PHYSICS-BACKED for correlate pairs
  const worst = rank(a) >= rank(b) ? a : b;
  if (worst === 'PHYSICS-BACKED') return 'PHYSICS-BACKED (EXAMPLE)';
  return worst === 'PHYSICS-BACKED (EXAMPLE)' ? 'DERIVED/MEANING-MAP' : worst;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
