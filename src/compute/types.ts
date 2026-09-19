/**
 * Compute fabric types — OpGraph → Op → Shard hierarchy (Rev 2 §3).
 * CPU + optional single-device WebGPU (G1) with ε-gate fallback.
 */

export type TPPolicy =
  | 'TP_ELL_BAND'
  | 'TP_PIX_TILE'
  | 'TP_PAIR_BLOCK'
  | 'TP_LAG_SLICE'
  | 'TP_DOC_BATCH'
  | 'TP_NONE';

/** Fabric epistemic tags (subset + assurance). Stricter = higher rank. */
export type Epistemic =
  | 'PHYSICS-BACKED'
  | 'PHYSICS-BACKED (EXAMPLE)'
  | 'METAPHOR/RESEARCH'
  | 'DERIVED/MEANING-MAP'
  | 'RESEARCH/DERIVED'
  | 'ASSURANCE'
  | 'LAW/RESTRICT';

export type OpName =
  | 'INGEST_PARSE'
  | 'SH_SYNTH'
  | 'COH_FIELD'
  | 'PROJECT_MOLLWEIDE'
  | 'EMBED_HASH'
  | 'MEANING_LAYOUT'
  | 'CORRELATE_BATCH'
  | 'SMITH_MAP'
  | 'LEDGER_APPEND';

export interface OpDesc {
  name: OpName;
  /** Primary tensor-parallel policy (declared even on CPU) */
  tp: TPPolicy;
  epistemicCeiling: Epistemic;
  /** True when a GPU path would require CPU reference (G1) */
  cpuRefRequired: boolean;
}

export interface OpNode {
  id: string;
  op: OpDesc;
  /** Upstream OpNode ids */
  inputs?: string[];
  /** Opaque params for the runtime */
  params?: Record<string, unknown>;
}

export interface FuseHint {
  ops: OpName[];
  note?: string;
}

export interface OpGraph {
  id: string;
  ops: OpNode[];
  fuse?: FuseHint[];
  /** Append ledger record when true (default for ingest/correlate) */
  ledger?: boolean;
}

export interface TensorMeta {
  shape: number[];
  dtype: 'f32' | 'f64' | 'i32' | 'json';
  epistemic: Epistemic;
}

export interface TensorHandle {
  id: string;
  meta: TensorMeta;
  /** CPU payload — Float32Array or JSON-serializable */
  data: Float32Array | number[] | Record<string, unknown> | unknown;
}

export interface ShardSpec {
  policy: TPPolicy;
  index: number;
  count: number;
  axisNote?: string;
}

export interface OpResult {
  opId: string;
  opName: OpName;
  tp: TPPolicy;
  epistemic: Epistemic;
  outputs: TensorHandle[];
  ms: number;
  shards: ShardSpec[];
  device: 'cpu' | 'webgpu';
}

export interface GraphResult {
  graphId: string;
  results: OpResult[];
  epistemic: Epistemic;
  ms: number;
  device: 'cpu' | 'webgpu';
}

export interface TensorRuntime {
  readonly device: 'cpu' | 'webgpu';
  runOp(node: OpNode, inputs?: TensorHandle[]): Promise<OpResult> | OpResult;
  runGraph(graph: OpGraph, inputs?: Record<string, TensorHandle>): Promise<GraphResult> | GraphResult;
}

const EPISTEMIC_RANK: Record<Epistemic, number> = {
  'PHYSICS-BACKED': 0,
  'PHYSICS-BACKED (EXAMPLE)': 1,
  'METAPHOR/RESEARCH': 2,
  'DERIVED/MEANING-MAP': 3,
  'RESEARCH/DERIVED': 3,
  ASSURANCE: 4,
  'LAW/RESTRICT': 5,
};

/** Strictest (highest rank) epistemic among inputs and op ceiling. */
export function strictestEpistemic(
  inputs: Epistemic[],
  ceiling: Epistemic
): Epistemic {
  let best: Epistemic = ceiling;
  let bestRank = EPISTEMIC_RANK[ceiling];
  for (const e of inputs) {
    const r = EPISTEMIC_RANK[e] ?? 3;
    if (r > bestRank) {
      best = e;
      bestRank = r;
    }
  }
  // Never auto-promote correlate-style outputs to PHYSICS-BACKED
  if (best === 'PHYSICS-BACKED' && ceiling !== 'PHYSICS-BACKED') {
    return ceiling;
  }
  return best;
}

/** Canonical op descriptors (primary TP policy per plan §3.3) */
export const OP_DESCS: Record<OpName, OpDesc> = {
  INGEST_PARSE: {
    name: 'INGEST_PARSE',
    tp: 'TP_DOC_BATCH',
    epistemicCeiling: 'DERIVED/MEANING-MAP',
    cpuRefRequired: false,
  },
  SH_SYNTH: {
    name: 'SH_SYNTH',
    tp: 'TP_ELL_BAND',
    epistemicCeiling: 'PHYSICS-BACKED (EXAMPLE)',
    cpuRefRequired: true,
  },
  COH_FIELD: {
    name: 'COH_FIELD',
    tp: 'TP_PIX_TILE',
    epistemicCeiling: 'METAPHOR/RESEARCH',
    cpuRefRequired: true,
  },
  PROJECT_MOLLWEIDE: {
    name: 'PROJECT_MOLLWEIDE',
    tp: 'TP_PIX_TILE',
    epistemicCeiling: 'PHYSICS-BACKED (EXAMPLE)',
    cpuRefRequired: false,
  },
  EMBED_HASH: {
    name: 'EMBED_HASH',
    tp: 'TP_DOC_BATCH',
    epistemicCeiling: 'DERIVED/MEANING-MAP',
    cpuRefRequired: false,
  },
  MEANING_LAYOUT: {
    name: 'MEANING_LAYOUT',
    tp: 'TP_NONE',
    epistemicCeiling: 'DERIVED/MEANING-MAP',
    cpuRefRequired: false,
  },
  CORRELATE_BATCH: {
    name: 'CORRELATE_BATCH',
    tp: 'TP_PAIR_BLOCK',
    epistemicCeiling: 'RESEARCH/DERIVED',
    cpuRefRequired: true,
  },
  SMITH_MAP: {
    name: 'SMITH_MAP',
    tp: 'TP_NONE',
    epistemicCeiling: 'DERIVED/MEANING-MAP',
    cpuRefRequired: false,
  },
  LEDGER_APPEND: {
    name: 'LEDGER_APPEND',
    tp: 'TP_NONE',
    epistemicCeiling: 'ASSURANCE',
    cpuRefRequired: false,
  },
};
