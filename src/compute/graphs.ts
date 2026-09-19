/**
 * G2 OpGraph fusion (Rev 2 §3.4):
 *   SkyFrame:       SH_SYNTH → (COH_FIELD?) → PROJECT_MOLLWEIDE
 *   IngestConverge: INGEST_PARSE → EMBED_HASH → MEANING_LAYOUT → CORRELATE_BATCH → SMITH_MAP
 *   Scrub:          COH_FIELD + SMITH_MAP only (no SH_SYNTH)
 */

import { type ConvergenceState } from '../math/meaningMap';
import { EMBED_DIM } from '../math/embedding';
import type { CoherenceField } from '../math/coherence';
import type { Complex, SmithState } from '../math/smith';
import type { HarmonicCoeff } from '../math/sphericalHarmonics';
import type {
  CorrelateScanResult,
  CorrelateSeed,
  ThreadSeriesInput,
} from '../math/correlates';
import type { IngestedDataset, MeaningGraph } from '../ingest/types';
import {
  OP_DESCS,
  strictestEpistemic,
  type Epistemic,
  type FuseHint,
  type OpGraph,
  type OpName,
  type OpResult,
  type ShardSpec,
  type TPPolicy,
} from './types';
import {
  recordGraphMeasurement,
  type GraphMeasurement,
  type OpMeasurement,
} from './measurements';
import {
  fabricShSynth,
  fabricCoherence,
  fabricSmith,
} from './fabric';
import { cpuRuntime } from './cpuRuntime';
import { runCorrelateOffthread } from './worker/correlateClient';

function nowMs(): number {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();
}

function makeShards(policy: TPPolicy, count = 1, note?: string): ShardSpec[] {
  return [{ policy, index: 0, count, axisNote: note }];
}

function fuseNames(hints?: FuseHint[]): Set<OpName> {
  const s = new Set<OpName>();
  if (!hints) return s;
  for (const h of hints) for (const o of h.ops) s.add(o);
  return s;
}

function asOpMeas(r: OpResult, fused?: boolean): OpMeasurement {
  return {
    opId: r.opId,
    opName: r.opName,
    device: r.device,
    ms: r.ms,
    tp: r.tp,
    shardCount: r.shards.reduce((a, x) => a + x.count, 0) || r.shards.length || 1,
    epistemic: r.epistemic,
    fused,
  };
}

function opResult(
  opId: string,
  opName: OpName,
  ms: number,
  device: 'cpu' | 'webgpu',
  shards: ShardSpec[]
): OpResult {
  return {
    opId,
    opName,
    tp: OP_DESCS[opName].tp,
    epistemic: OP_DESCS[opName].epistemicCeiling,
    outputs: [],
    ms,
    shards,
    device,
  };
}

/* ---------- builders ---------- */

export function buildSkyFrameGraph(opts: {
  includeCoh?: boolean;
  id?: string;
}): OpGraph {
  const includeCoh = opts.includeCoh ?? true;
  return {
    id: opts.id ?? 'SkyFrame',
    ledger: true,
    fuse: [
      {
        ops: includeCoh
          ? ['SH_SYNTH', 'COH_FIELD', 'PROJECT_MOLLWEIDE']
          : ['SH_SYNTH', 'PROJECT_MOLLWEIDE'],
        note: 'SkyFrame fused raster path',
      },
    ],
    ops: [
      { id: 'sh0', op: OP_DESCS.SH_SYNTH },
      ...(includeCoh
        ? [{ id: 'coh0', op: OP_DESCS.COH_FIELD, inputs: ['sh0'] }]
        : []),
      {
        id: 'proj0',
        op: OP_DESCS.PROJECT_MOLLWEIDE,
        inputs: includeCoh ? ['sh0', 'coh0'] : ['sh0'],
      },
    ],
  };
}

export function buildIngestConvergeGraph(opts?: { id?: string }): OpGraph {
  return {
    id: opts?.id ?? 'IngestConverge',
    ledger: true,
    fuse: [
      {
        ops: [
          'INGEST_PARSE',
          'EMBED_HASH',
          'MEANING_LAYOUT',
          'CORRELATE_BATCH',
          'SMITH_MAP',
        ],
        note: 'Ingest→embed→layout→correlate→Smith pipeline',
      },
    ],
    ops: [
      { id: 'ingest0', op: OP_DESCS.INGEST_PARSE },
      { id: 'embed0', op: OP_DESCS.EMBED_HASH, inputs: ['ingest0'] },
      { id: 'layout0', op: OP_DESCS.MEANING_LAYOUT, inputs: ['embed0'] },
      { id: 'corr0', op: OP_DESCS.CORRELATE_BATCH, inputs: ['layout0'] },
      { id: 'smith0', op: OP_DESCS.SMITH_MAP, inputs: ['corr0'] },
    ],
  };
}

export function buildScrubGraph(opts?: { id?: string }): OpGraph {
  return {
    id: opts?.id ?? 'Scrub',
    ledger: false,
    fuse: [
      {
        ops: ['COH_FIELD', 'SMITH_MAP'],
        note: 'Time scrub: COH + Smith trail only — no SH_SYNTH',
      },
    ],
    ops: [
      { id: 'coh0', op: OP_DESCS.COH_FIELD },
      { id: 'smith0', op: OP_DESCS.SMITH_MAP, inputs: ['coh0'] },
    ],
  };
}

export const SCRUB_INVALIDATE: OpName[] = ['COH_FIELD', 'SMITH_MAP'];

export function scrubShouldResynthSh(changed: {
  seed?: boolean;
  ellMax?: boolean;
  ampScales?: boolean;
  timePhase?: boolean;
  cohSeed?: boolean;
}): boolean {
  return !!(changed.seed || changed.ellMax || changed.ampScales);
}

export function graphOpNames(g: OpGraph): OpName[] {
  return g.ops.map((o) => o.op.name);
}

/* ---------- SkyFrame ---------- */

export interface SkyFrameParams {
  ellMax: number;
  seed: number;
  ampScales?: Record<number, number>;
  includeCoh?: boolean;
  cohSeed?: number;
  timePhase?: number;
  drive?: number;
  lightMetrics?: boolean;
  projectWidth?: number;
  projectHeight?: number;
  showCoherence?: boolean;
  coherenceOpacity?: number;
  forceCpu?: boolean;
  ledger?: boolean;
}

export interface SkyFrameResult {
  grid: Float32Array;
  Cl: number[];
  coeffs: HarmonicCoeff[];
  nTheta: number;
  nPhi: number;
  coh: (CoherenceField & { ms: number; epistemic: Epistemic }) | null;
  rgba: Uint8ClampedArray;
  projectWidth: number;
  projectHeight: number;
  measurement: GraphMeasurement;
  epistemic: Epistemic;
  device: 'cpu' | 'webgpu';
}

export async function runSkyFrame(params: SkyFrameParams): Promise<SkyFrameResult> {
  const t0 = nowMs();
  const includeCoh = params.includeCoh ?? true;
  const graph = buildSkyFrameGraph({ includeCoh });
  const fused = fuseNames(graph.fuse);
  const results: OpResult[] = [];

  const sh = await fabricShSynth({
    ellMax: params.ellMax,
    seed: params.seed,
    ampScales: params.ampScales,
    ledger: false,
    forceCpu: params.forceCpu,
  });
  results.push(
    opResult(
      'sh0',
      'SH_SYNTH',
      sh.ms,
      sh.device,
      makeShards('TP_ELL_BAND', sh.nBands ?? 1, 'ℓ bands')
    )
  );

  let coh: (CoherenceField & { ms: number; epistemic: Epistemic }) | null = null;
  if (includeCoh) {
    const c = fabricCoherence({
      nTheta: sh.nTheta,
      nPhi: sh.nPhi,
      seed: params.cohSeed ?? 7,
      Lcoh: 4,
      timePhase: params.timePhase ?? 0,
      drive: params.drive ?? 0,
      lightMetrics: params.lightMetrics ?? false,
      ledger: false,
    });
    coh = c;
    results.push(
      opResult('coh0', 'COH_FIELD', c.ms, 'cpu', makeShards('TP_PIX_TILE', 1, 'pixels'))
    );
  }

  const pw = params.projectWidth ?? 320;
  const ph = params.projectHeight ?? 160;
  const projOp = cpuRuntime.runOp({
    id: 'proj0',
    op: OP_DESCS.PROJECT_MOLLWEIDE,
    params: {
      sky: sh.grid,
      nTheta: sh.nTheta,
      nPhi: sh.nPhi,
      width: pw,
      height: ph,
      coh: coh?.grid ?? null,
      showCoherence: params.showCoherence ?? includeCoh,
      coherenceOpacity: params.coherenceOpacity ?? 0.45,
    },
  });
  const rgba = projOp.outputs[0]!.data as Uint8ClampedArray;
  results.push(projOp);

  const epis = results.map((r) => r.epistemic);
  const epistemic = strictestEpistemic(epis, epis[epis.length - 1]!);
  const device: 'cpu' | 'webgpu' = results.some((r) => r.device === 'webgpu')
    ? 'webgpu'
    : 'cpu';

  const measurement = recordGraphMeasurement(
    {
      graphId: graph.id,
      pattern: 'SkyFrame',
      device,
      ms: nowMs() - t0,
      epistemic,
      ops: results.map((r) => asOpMeas(r, fused.has(r.opName))),
      fuseNotes: (graph.fuse ?? []).map((f) => f.note ?? f.ops.join('+')),
      at: Date.now(),
    },
    { ledger: params.ledger ?? true }
  );

  return {
    grid: sh.grid,
    Cl: sh.Cl,
    coeffs: sh.coeffs,
    nTheta: sh.nTheta,
    nPhi: sh.nPhi,
    coh,
    rgba,
    projectWidth: pw,
    projectHeight: ph,
    measurement,
    epistemic,
    device,
  };
}

/* ---------- Scrub ---------- */

export interface ScrubParams {
  nTheta: number;
  nPhi: number;
  cohSeed: number;
  timePhase: number;
  drive?: number;
  lightMetrics?: boolean;
  z: Complex;
  matchPull: number;
  source: 'dual-thread' | 'meaning-node';
  mappingNote: string;
  ledger?: boolean;
}

export interface ScrubResult {
  coh: CoherenceField & { ms: number; epistemic: Epistemic; device: 'cpu' | 'webgpu' };
  smith: SmithState & { ms: number; epistemic: Epistemic; device: 'cpu' | 'webgpu' };
  measurement: GraphMeasurement;
  shResynthesized: false;
}

export function runScrub(params: ScrubParams): ScrubResult {
  const t0 = nowMs();
  const graph = buildScrubGraph();
  const fused = fuseNames(graph.fuse);

  if (graph.ops.some((o) => o.op.name === 'SH_SYNTH')) {
    throw new Error('Scrub graph must not include SH_SYNTH');
  }

  const coh = fabricCoherence({
    nTheta: params.nTheta,
    nPhi: params.nPhi,
    seed: params.cohSeed,
    Lcoh: 4,
    timePhase: params.timePhase,
    drive: params.drive ?? 0,
    lightMetrics: params.lightMetrics ?? false,
    ledger: false,
  });

  const smith = fabricSmith({
    z: params.z,
    matchPull: params.matchPull,
    source: params.source,
    mappingNote: params.mappingNote,
  });

  const results: OpResult[] = [
    opResult('coh0', 'COH_FIELD', coh.ms, 'cpu', makeShards('TP_PIX_TILE', 1)),
    opResult('smith0', 'SMITH_MAP', smith.ms, 'cpu', makeShards('TP_NONE', 1)),
  ];

  const epis = results.map((r) => r.epistemic);
  const epistemic = strictestEpistemic(epis, epis[0]!);
  const measurement = recordGraphMeasurement(
    {
      graphId: graph.id,
      pattern: 'Scrub',
      device: 'cpu',
      ms: nowMs() - t0,
      epistemic,
      ops: results.map((r) => asOpMeas(r, fused.has(r.opName))),
      fuseNotes: (graph.fuse ?? []).map((f) => f.note ?? f.ops.join('+')),
      at: Date.now(),
    },
    { ledger: params.ledger ?? false }
  );

  return { coh, smith, measurement, shResynthesized: false };
}

/* ---------- IngestConverge ---------- */

export interface IngestConvergeParams {
  datasets: IngestedDataset[];
  convergence: ConvergenceState;
  seed: CorrelateSeed;
  thread: ThreadSeriesInput;
  maxLag?: number;
  topN?: number;
  smithZ?: Complex;
  matchPull?: number;
  mappingNote?: string;
  forceCpu?: boolean;
  ledger?: boolean;
  /** Prefer correlate Worker (default true). */
  preferWorker?: boolean;
  /**
   * Escape hatch: skip IngestConverge fuse and call fabricCorrelate one-shot
   * (tests / `?correlateBypass=1`). Default false — UI uses full graph.
   */
  bypassGraph?: boolean;
}

export interface IngestConvergeResult {
  graph: MeaningGraph;
  embedDim: number;
  correlate: CorrelateScanResult & {
    ms: number;
    epistemic: Epistemic;
    device: 'cpu' | 'webgpu';
    path?: 'worker' | 'main';
  };
  smith: SmithState & { ms: number; epistemic: Epistemic; device: 'cpu' | 'webgpu' };
  measurement: GraphMeasurement;
  epistemic: Epistemic;
  device: 'cpu' | 'webgpu';
  path: 'worker' | 'main';
}

export async function runIngestConverge(
  params: IngestConvergeParams
): Promise<IngestConvergeResult> {
  const t0 = nowMs();
  const graphDesc = buildIngestConvergeGraph();
  const fused = fuseNames(graphDesc.fuse);
  const ops: OpMeasurement[] = [];

  const ingestOp = cpuRuntime.runOp({
    id: 'ingest0',
    op: OP_DESCS.INGEST_PARSE,
    params: { datasets: params.datasets },
  });
  const enabled =
    (ingestOp.outputs[0]!.data as { datasets: IngestedDataset[] }).datasets ??
    params.datasets.filter((d) => d.enabled);
  ops.push(asOpMeas(ingestOp, fused.has('INGEST_PARSE')));

  const embedOp = cpuRuntime.runOp({
    id: 'embed0',
    op: OP_DESCS.EMBED_HASH,
    params: { datasets: enabled },
  });
  ops.push(asOpMeas(embedOp, fused.has('EMBED_HASH')));

  const layoutOp = cpuRuntime.runOp({
    id: 'layout0',
    op: OP_DESCS.MEANING_LAYOUT,
    params: { datasets: params.datasets, convergence: params.convergence },
  });
  const meaning = layoutOp.outputs[0]!.data as MeaningGraph;
  ops.push(asOpMeas(layoutOp, fused.has('MEANING_LAYOUT')));

  const corr = await runCorrelateOffthread({
    seed: params.seed,
    datasets: params.datasets,
    nodes: meaning.nodes,
    thread: params.thread,
    maxLag: params.maxLag,
    topN: params.topN,
    ledger: false,
    forceCpu: params.forceCpu,
    preferWorker: params.preferWorker !== false && !params.bypassGraph,
    forceMain: params.bypassGraph === true,
    useFabricOnMain: true,
  });
  ops.push({
    opId: 'corr0',
    opName: 'CORRELATE_BATCH',
    device: corr.device,
    ms: corr.ms,
    tp: 'TP_PAIR_BLOCK',
    shardCount: 1,
    epistemic: corr.epistemic,
    fused: fused.has('CORRELATE_BATCH'),
    placements: [
      {
        shardIndex: 0,
        shardCount: 1,
        deviceId: 'cpu',
        ms: corr.ms,
        note: corr.path === 'worker' ? 'worker thread' : 'main thread',
        demo: false,
      },
    ],
  });

  const top = corr.hits[0];
  const z: Complex =
    params.smithZ ?? {
      re: 1 + (top?.score ?? 0) * 0.3,
      im: (top?.zToy ?? 0) * 0.05,
    };
  const smithOp = cpuRuntime.runOp({
    id: 'smith0',
    op: OP_DESCS.SMITH_MAP,
    params: {
      z,
      matchPull: params.matchPull ?? Math.min(1, Math.abs(top?.score ?? 0)),
      source: 'meaning-node',
      mappingNote:
        params.mappingNote ??
        'DERIVED: IngestConverge Smith from correlate top hit (toy z)',
    },
  });
  const smithState = smithOp.outputs[0]!.data as SmithState;
  const smith = {
    ...smithState,
    ms: smithOp.ms,
    epistemic: smithOp.epistemic,
    device: 'cpu' as const,
  };
  ops.push(asOpMeas(smithOp, fused.has('SMITH_MAP')));

  const device: 'cpu' | 'webgpu' = ops.some((o) => o.device === 'webgpu')
    ? 'webgpu'
    : 'cpu';
  const epis = ops.map((o) => (o.epistemic as Epistemic) ?? 'RESEARCH/DERIVED');
  const epistemic = strictestEpistemic(
    epis,
    OP_DESCS.CORRELATE_BATCH.epistemicCeiling
  );
  const path: 'worker' | 'main' = corr.path === 'worker' ? 'worker' : 'main';

  const measurement = recordGraphMeasurement(
    {
      graphId: graphDesc.id,
      pattern: 'IngestConverge',
      device,
      ms: nowMs() - t0,
      epistemic,
      ops,
      fuseNotes: (graphDesc.fuse ?? []).map((f) => f.note ?? f.ops.join('+')),
      at: Date.now(),
      path,
    },
    { ledger: params.ledger ?? true }
  );

  return {
    graph: meaning,
    embedDim: EMBED_DIM,
    correlate: corr,
    smith,
    measurement,
    epistemic,
    device,
    path,
  };
}
