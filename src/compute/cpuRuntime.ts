/**
 * CPU TensorRuntime — unified OpGraph dispatch for all named ops:
 * SH_SYNTH, COH_FIELD, PROJECT_MOLLWEIDE, INGEST_PARSE, EMBED_HASH,
 * MEANING_LAYOUT, CORRELATE_BATCH, SMITH_MAP, LEDGER_APPEND.
 * Behavior parity with direct math modules. No WebGPU.
 */

import {
  adaptiveGridSize,
  drawCoefficients,
  synthesizeGrid,
  type HarmonicCoeff,
} from '../math/sphericalHarmonics';
import { buildCoherence, type CoherenceField } from '../math/coherence';
import {
  scanCorrelates,
  type CorrelateScanResult,
  type CorrelateSeed,
  type ThreadSeriesInput,
} from '../math/correlates';
import {
  buildSmithState,
  type Complex,
  type SmithState,
} from '../math/smith';
import { projectMollweideRgba } from '../math/projectMollweide';
import { textEmbed, EMBED_DIM } from '../math/embedding';
import {
  buildMeaningGraph,
  type ConvergenceState,
} from '../math/meaningMap';
import type { IngestedDataset, MeaningNode } from '../ingest/types';
import { ingestFile } from '../ingest';
import {
  OP_DESCS,
  strictestEpistemic,
  type GraphResult,
  type OpGraph,
  type OpNode,
  type OpResult,
  type TensorHandle,
  type TensorRuntime,
  type Epistemic,
} from './types';
import { ledgerAppend } from './ledger';

function nowMs(): number {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();
}

function handle(
  id: string,
  shape: number[],
  epistemic: Epistemic,
  data: TensorHandle['data'],
  dtype: TensorHandle['meta']['dtype'] = 'f32'
): TensorHandle {
  return { id, meta: { shape, dtype, epistemic }, data };
}

function runShSynth(node: OpNode): OpResult {
  const t0 = nowMs();
  const ellMax = Number(node.params?.ellMax ?? 16);
  const seed = Number(node.params?.seed ?? 42);
  const ampScales = (node.params?.ampScales as Record<number, number>) ?? {};
  const gridOverride = node.params?.grid as { nTheta: number; nPhi: number } | undefined;
  const { nTheta, nPhi } = gridOverride ?? adaptiveGridSize(ellMax);
  const { coeffs, Cl } = drawCoefficients(ellMax, seed, ampScales);
  const grid = synthesizeGrid(coeffs, nTheta, nPhi);
  const ms = nowMs() - t0;
  const epistemic = OP_DESCS.SH_SYNTH.epistemicCeiling;
  const outputs: TensorHandle[] = [
    handle('sky', [nTheta, nPhi], epistemic, grid),
    handle('Cl', [Cl.length], epistemic, Cl, 'f64'),
    handle(
      'coeffs',
      [coeffs.length],
      epistemic,
      { coeffs } as unknown as Record<string, unknown>,
      'json'
    ),
  ];
  return {
    opId: node.id,
    opName: 'SH_SYNTH',
    tp: 'TP_ELL_BAND',
    epistemic,
    outputs,
    ms,
    shards: [{ policy: 'TP_ELL_BAND', index: 0, count: 1, axisNote: 'CPU single-shard ℓ band' }],
    device: 'cpu',
  };
}

function runCohField(node: OpNode): OpResult {
  const t0 = nowMs();
  const nTheta = Number(node.params?.nTheta ?? 90);
  const nPhi = Number(node.params?.nPhi ?? 180);
  const seed = Number(node.params?.seed ?? 7);
  const Lcoh = Number(node.params?.Lcoh ?? 4);
  const timePhase = Number(node.params?.timePhase ?? 0);
  const drive = Number(node.params?.drive ?? 0);
  const lightMetrics = Boolean(node.params?.lightMetrics ?? false);
  const field = buildCoherence(nTheta, nPhi, seed, Lcoh, timePhase, drive, lightMetrics);
  const ms = nowMs() - t0;
  const epistemic = OP_DESCS.COH_FIELD.epistemicCeiling;
  return {
    opId: node.id,
    opName: 'COH_FIELD',
    tp: 'TP_PIX_TILE',
    epistemic,
    outputs: [
      handle('coh-grid', [nTheta, nPhi], epistemic, field.grid),
      handle('coh-meta', [1], epistemic, field as unknown as Record<string, unknown>, 'json'),
    ],
    ms,
    shards: [{ policy: 'TP_PIX_TILE', index: 0, count: 1, axisNote: 'CPU single-shard pixels' }],
    device: 'cpu',
  };
}

function runCorrelate(node: OpNode): OpResult {
  const t0 = nowMs();
  const seed = node.params?.seed as CorrelateSeed;
  const datasets = (node.params?.datasets as IngestedDataset[]) ?? [];
  const nodes = (node.params?.nodes as MeaningNode[]) ?? [];
  const thread = node.params?.thread as ThreadSeriesInput;
  const maxLag = Number(node.params?.maxLag ?? 5);
  const topN = Number(node.params?.topN ?? 12);
  if (!seed || !thread) {
    throw new Error('CORRELATE_BATCH requires params.seed and params.thread');
  }
  const scan = scanCorrelates(seed, datasets, nodes, thread, { maxLag, topN });
  const ms = nowMs() - t0;
  const inputEpis: Epistemic[] = [
    (seed.epistemic as Epistemic) ?? 'RESEARCH/DERIVED',
  ];
  const epistemic = strictestEpistemic(inputEpis, OP_DESCS.CORRELATE_BATCH.epistemicCeiling);
  return {
    opId: node.id,
    opName: 'CORRELATE_BATCH',
    tp: 'TP_PAIR_BLOCK',
    epistemic,
    outputs: [
      handle('hits', [scan.hits.length], epistemic, scan as unknown as Record<string, unknown>, 'json'),
    ],
    ms,
    shards: [
      {
        policy: 'TP_PAIR_BLOCK',
        index: 0,
        count: 1,
        axisNote: 'CPU single-shard pairs; nested lag = TP_LAG_SLICE conceptual',
      },
    ],
    device: 'cpu',
  };
}

function runSmith(node: OpNode): OpResult {
  const t0 = nowMs();
  const z = node.params?.z as Complex;
  const matchPull = Number(node.params?.matchPull ?? 0);
  const source = (node.params?.source as 'dual-thread' | 'meaning-node') ?? 'dual-thread';
  const mappingNote = String(node.params?.mappingNote ?? 'DERIVED z mapping');
  if (!z) throw new Error('SMITH_MAP requires params.z');
  const state = buildSmithState(z, matchPull, source, mappingNote);
  const ms = nowMs() - t0;
  const epistemic = OP_DESCS.SMITH_MAP.epistemicCeiling;
  return {
    opId: node.id,
    opName: 'SMITH_MAP',
    tp: 'TP_NONE',
    epistemic,
    outputs: [
      handle('smith', [1], epistemic, state as unknown as Record<string, unknown>, 'json'),
    ],
    ms,
    shards: [{ policy: 'TP_NONE', index: 0, count: 1 }],
    device: 'cpu',
  };
}

function runProjectMollweide(node: OpNode): OpResult {
  const t0 = nowMs();
  const sky = node.params?.sky as Float32Array | undefined;
  const nTheta = Number(node.params?.nTheta ?? 0);
  const nPhi = Number(node.params?.nPhi ?? 0);
  const width = Number(node.params?.width ?? 320);
  const height = Number(node.params?.height ?? 160);
  if (!sky || !nTheta || !nPhi) {
    throw new Error('PROJECT_MOLLWEIDE requires params.sky, nTheta, nPhi');
  }
  const coh = (node.params?.coh as Float32Array | null | undefined) ?? null;
  const rgba = projectMollweideRgba({
    sky,
    nTheta,
    nPhi,
    width,
    height,
    coh,
    showCoherence: Boolean(node.params?.showCoherence ?? !!coh),
    coherenceOpacity: Number(node.params?.coherenceOpacity ?? 0.45),
  });
  const ms = nowMs() - t0;
  const epistemic = OP_DESCS.PROJECT_MOLLWEIDE.epistemicCeiling;
  return {
    opId: node.id,
    opName: 'PROJECT_MOLLWEIDE',
    tp: 'TP_PIX_TILE',
    epistemic,
    outputs: [handle('rgba', [height, width, 4], epistemic, rgba, 'f32')],
    ms,
    shards: [
      {
        policy: 'TP_PIX_TILE',
        index: 0,
        count: 1,
        axisNote: `Mollweide ${width}×${height}`,
      },
    ],
    device: 'cpu',
  };
}

function runIngestParse(node: OpNode): OpResult {
  const t0 = nowMs();
  const text = node.params?.text as string | undefined;
  const filename = String(node.params?.filename ?? 'paste.txt');
  const datasetsIn = (node.params?.datasets as IngestedDataset[]) ?? [];
  let datasets = datasetsIn;
  let parseMeta: Record<string, unknown> = { mode: 'filter-enabled' };
  if (typeof text === 'string') {
    const { result, log } = ingestFile(filename, text);
    datasets = result.ok && result.dataset ? [result.dataset] : [];
    parseMeta = {
      mode: 'parse',
      ok: result.ok,
      logStatus: log.status,
      errors: result.errors,
      residue: result.residue,
    };
  }
  const enabled = datasets.filter((d) => d.enabled !== false);
  const ms = nowMs() - t0;
  const epistemic = OP_DESCS.INGEST_PARSE.epistemicCeiling;
  return {
    opId: node.id,
    opName: 'INGEST_PARSE',
    tp: 'TP_DOC_BATCH',
    epistemic,
    outputs: [
      handle(
        'datasets',
        [enabled.length],
        epistemic,
        { datasets: enabled, meta: parseMeta } as unknown as Record<string, unknown>,
        'json'
      ),
    ],
    ms,
    shards: [
      {
        policy: 'TP_DOC_BATCH',
        index: 0,
        count: Math.max(1, enabled.length),
        axisNote: 'document batch',
      },
    ],
    device: 'cpu',
  };
}

function runEmbedHash(node: OpNode): OpResult {
  const t0 = nowMs();
  const texts = (node.params?.texts as string[]) ?? [];
  const datasets = (node.params?.datasets as IngestedDataset[]) ?? [];
  const dim = Number(node.params?.dim ?? EMBED_DIM);
  const collected: string[] = texts.slice();
  if (!collected.length) {
    for (const ds of datasets.filter((d) => d.enabled !== false)) {
      if (ds.claims) {
        for (const c of ds.claims.slice(0, 32)) collected.push(c.text);
      }
    }
  }
  const embeddings: Float32Array[] = [];
  for (const t of collected) embeddings.push(textEmbed(t, dim));
  const ms = nowMs() - t0;
  const epistemic = OP_DESCS.EMBED_HASH.epistemicCeiling;
  const packed = new Float32Array(embeddings.length * dim);
  for (let i = 0; i < embeddings.length; i++) packed.set(embeddings[i]!, i * dim);
  return {
    opId: node.id,
    opName: 'EMBED_HASH',
    tp: 'TP_DOC_BATCH',
    epistemic,
    outputs: [
      handle('embeds', [embeddings.length, dim], epistemic, packed),
      handle(
        'embed-meta',
        [1],
        epistemic,
        { count: embeddings.length, dim, texts: collected.length } as unknown as Record<
          string,
          unknown
        >,
        'json'
      ),
    ],
    ms,
    shards: [
      {
        policy: 'TP_DOC_BATCH',
        index: 0,
        count: Math.max(1, Math.ceil(embeddings.length / 8) || 1),
        axisNote: 'hash-projection batches',
      },
    ],
    device: 'cpu',
  };
}

function runMeaningLayout(node: OpNode): OpResult {
  const t0 = nowMs();
  const datasets = (node.params?.datasets as IngestedDataset[]) ?? [];
  const convergence = node.params?.convergence as ConvergenceState | undefined;
  if (!convergence) {
    throw new Error('MEANING_LAYOUT requires params.convergence');
  }
  const graph = buildMeaningGraph(datasets, convergence);
  const ms = nowMs() - t0;
  const epistemic = OP_DESCS.MEANING_LAYOUT.epistemicCeiling;
  return {
    opId: node.id,
    opName: 'MEANING_LAYOUT',
    tp: 'TP_NONE',
    epistemic,
    outputs: [
      handle(
        'meaning',
        [graph.nodes.length],
        epistemic,
        graph as unknown as Record<string, unknown>,
        'json'
      ),
    ],
    ms,
    shards: [{ policy: 'TP_NONE', index: 0, count: 1 }],
    device: 'cpu',
  };
}

function runLedgerAppend(node: OpNode): OpResult {
  const t0 = nowMs();
  const detail = (node.params?.detail as Record<string, unknown>) ?? {};
  const kind = (node.params?.kind as 'ingest' | 'correlate' | 'compute' | 'note') ?? 'note';
  const epistemic = (node.params?.epistemic as Epistemic) ?? 'ASSURANCE';
  const rec = ledgerAppend({
    kind,
    op: 'LEDGER_APPEND',
    tp: 'TP_NONE',
    epistemic,
    device: 'cpu',
    detail,
  });
  const ms = nowMs() - t0;
  return {
    opId: node.id,
    opName: 'LEDGER_APPEND',
    tp: 'TP_NONE',
    epistemic: 'ASSURANCE',
    outputs: [handle('ledger', [1], 'ASSURANCE', rec as unknown as Record<string, unknown>, 'json')],
    ms,
    shards: [{ policy: 'TP_NONE', index: 0, count: 1 }],
    device: 'cpu',
  };
}

export class CpuTensorRuntime implements TensorRuntime {
  readonly device = 'cpu' as const;

  runOp(node: OpNode, _inputs?: TensorHandle[]): OpResult {
    const opName = node.op.name;
    switch (opName) {
      case 'SH_SYNTH':
        return runShSynth(node);
      case 'COH_FIELD':
        return runCohField(node);
      case 'PROJECT_MOLLWEIDE':
        return runProjectMollweide(node);
      case 'INGEST_PARSE':
        return runIngestParse(node);
      case 'EMBED_HASH':
        return runEmbedHash(node);
      case 'MEANING_LAYOUT':
        return runMeaningLayout(node);
      case 'CORRELATE_BATCH':
        return runCorrelate(node);
      case 'SMITH_MAP':
        return runSmith(node);
      case 'LEDGER_APPEND':
        return runLedgerAppend(node);
      default:
        throw new Error(`CpuTensorRuntime: unsupported op ${String(opName)}`);
    }
  }

  runGraph(graph: OpGraph, _inputs?: Record<string, TensorHandle>): GraphResult {
    const t0 = nowMs();
    const results: OpResult[] = [];
    for (const node of graph.ops) {
      const filled: OpNode = { ...node, op: node.op };
      const r = this.runOp(filled);
      results.push(r);
      if (graph.ledger !== false && (filled.op.name === 'CORRELATE_BATCH' || filled.op.name === 'SH_SYNTH' || filled.op.name === 'COH_FIELD')) {
        ledgerAppend({
          kind: 'compute',
          op: filled.op.name,
          tp: filled.op.tp,
          epistemic: r.epistemic,
          device: 'cpu',
          ms: r.ms,
          detail: { graphId: graph.id, opId: filled.id, shards: r.shards.length },
        });
      }
    }
    const epis = results.map((r) => r.epistemic);
    const epistemic = epis.length
      ? strictestEpistemic(epis, epis[epis.length - 1]!)
      : ('ASSURANCE' as Epistemic);
    return {
      graphId: graph.id,
      results,
      epistemic,
      ms: nowMs() - t0,
      device: 'cpu',
    };
  }
}

/** Singleton CPU runtime */
export const cpuRuntime = new CpuTensorRuntime();

/* ---------- Convenience wrappers (parity helpers for App) ---------- */

export function fabricShSynth(opts: {
  ellMax: number;
  seed: number;
  ampScales?: Record<number, number>;
  ledger?: boolean;
}): {
  grid: Float32Array;
  Cl: number[];
  coeffs: HarmonicCoeff[];
  nTheta: number;
  nPhi: number;
  ms: number;
  epistemic: Epistemic;
} {
  const graph: OpGraph = {
    id: 'skyframe-sh',
    ledger: opts.ledger ?? true,
    ops: [
      {
        id: 'sh0',
        op: OP_DESCS.SH_SYNTH,
        params: {
          ellMax: opts.ellMax,
          seed: opts.seed,
          ampScales: opts.ampScales ?? {},
        },
      },
    ],
  };
  const gr = cpuRuntime.runGraph(graph);
  const r = gr.results[0]!;
  const grid = r.outputs[0]!.data as Float32Array;
  const Cl = r.outputs[1]!.data as number[];
  const coeffs = (r.outputs[2]!.data as { coeffs: HarmonicCoeff[] }).coeffs;
  const nTheta = r.outputs[0]!.meta.shape[0]!;
  const nPhi = r.outputs[0]!.meta.shape[1]!;
  return { grid, Cl, coeffs, nTheta, nPhi, ms: r.ms, epistemic: r.epistemic };
}

export function fabricCoherence(opts: {
  nTheta: number;
  nPhi: number;
  seed: number;
  Lcoh?: number;
  timePhase?: number;
  drive?: number;
  lightMetrics?: boolean;
  ledger?: boolean;
}): CoherenceField & { ms: number; epistemic: Epistemic } {
  const graph: OpGraph = {
    id: 'skyframe-coh',
    ledger: opts.ledger ?? false,
    ops: [
      {
        id: 'coh0',
        op: OP_DESCS.COH_FIELD,
        params: {
          nTheta: opts.nTheta,
          nPhi: opts.nPhi,
          seed: opts.seed,
          Lcoh: opts.Lcoh ?? 4,
          timePhase: opts.timePhase ?? 0,
          drive: opts.drive ?? 0,
          lightMetrics: opts.lightMetrics ?? false,
        },
      },
    ],
  };
  const gr = cpuRuntime.runGraph(graph);
  const r = gr.results[0]!;
  const field = r.outputs[1]!.data as CoherenceField;
  return { ...field, ms: r.ms, epistemic: r.epistemic };
}

/**
 * CPU-only CORRELATE_BATCH one-shot helper.
 * Prefer runIngestConverge / fabricCorrelate (hybrid) for UI; this remains for
 * parity tests and explicit `?correlateBypass=1` escape hatch.
 */
export function fabricCorrelateCpu(opts: {
  seed: CorrelateSeed;
  datasets: IngestedDataset[];
  nodes: MeaningNode[];
  thread: ThreadSeriesInput;
  maxLag?: number;
  topN?: number;
  ledger?: boolean;
}): CorrelateScanResult & { ms: number; epistemic: Epistemic } {
  const graph: OpGraph = {
    id: 'ingest-correlate',
    ledger: opts.ledger ?? true,
    ops: [
      {
        id: 'corr0',
        op: OP_DESCS.CORRELATE_BATCH,
        params: {
          seed: opts.seed,
          datasets: opts.datasets,
          nodes: opts.nodes,
          thread: opts.thread,
          maxLag: opts.maxLag,
          topN: opts.topN,
        },
      },
    ],
  };
  const gr = cpuRuntime.runGraph(graph);
  const r = gr.results[0]!;
  const scan = r.outputs[0]!.data as CorrelateScanResult;
  return { ...scan, ms: r.ms, epistemic: r.epistemic };
}

export function fabricSmith(opts: {
  z: Complex;
  matchPull: number;
  source: 'dual-thread' | 'meaning-node';
  mappingNote: string;
}): SmithState & { ms: number; epistemic: Epistemic } {
  const r = cpuRuntime.runOp({
    id: 'smith0',
    op: OP_DESCS.SMITH_MAP,
    params: opts,
  });
  const state = r.outputs[0]!.data as SmithState;
  return { ...state, ms: r.ms, epistemic: r.epistemic };
}
