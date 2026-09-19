/**
 * Correlate batch worker — heavy scanCorrelates off the main thread.
 * Returns JSON hits + transferable Float32 score/z/lag buffers.
 */
import {
  scanCorrelates,
  type CorrelateScanResult,
  type CorrelateSeed,
  type ThreadSeriesInput,
} from '../../math/correlates';
import type { IngestedDataset, MeaningNode } from '../../ingest/types';

export interface CorrelateWorkerRequest {
  type: 'correlate';
  id: number;
  seed: CorrelateSeed;
  datasets: IngestedDataset[];
  /** Meaning nodes with features as number[] for structured clone */
  nodes: Array<Omit<MeaningNode, 'features'> & { features: number[] }>;
  thread: ThreadSeriesInput;
  maxLag?: number;
  topN?: number;
}

export interface CorrelateWorkerResponse {
  type: 'correlate-result';
  id: number;
  hits: CorrelateScanResult['hits'];
  residue: string[];
  scanned: number;
  /** Parallel arrays for transfer: score, zToy, lag per hit */
  scoresBuffer: ArrayBuffer;
  zBuffer: ArrayBuffer;
  lagBuffer: ArrayBuffer;
  ms: number;
  device: 'cpu';
  path: 'worker';
}

export interface CorrelateWorkerError {
  type: 'correlate-error';
  id: number;
  message: string;
}

function nowMs(): number {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();
}

self.onmessage = (ev: MessageEvent<CorrelateWorkerRequest>) => {
  const msg = ev.data;
  if (!msg || msg.type !== 'correlate') return;
  try {
    const t0 = nowMs();
    const nodes: MeaningNode[] = msg.nodes.map((n) => ({
      ...n,
      features: Float32Array.from(n.features),
    }));
    const seed: CorrelateSeed = {
      ...msg.seed,
      features: msg.seed.features
        ? msg.seed.features instanceof Float32Array
          ? msg.seed.features
          : Float32Array.from(msg.seed.features as number[])
        : undefined,
    };
    const scan = scanCorrelates(seed, msg.datasets, nodes, msg.thread, {
      maxLag: msg.maxLag,
      topN: msg.topN,
    });
    const n = scan.hits.length;
    const scores = new Float32Array(n);
    const zs = new Float32Array(n);
    const lags = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      scores[i] = scan.hits[i]!.score;
      zs[i] = scan.hits[i]!.zToy;
      lags[i] = scan.hits[i]!.lag;
    }
    const scoresBuffer = scores.buffer.slice(0);
    const zBuffer = zs.buffer.slice(0);
    const lagBuffer = lags.buffer.slice(0);
    const res: CorrelateWorkerResponse = {
      type: 'correlate-result',
      id: msg.id,
      hits: scan.hits,
      residue: scan.residue,
      scanned: scan.scanned,
      scoresBuffer,
      zBuffer,
      lagBuffer,
      ms: nowMs() - t0,
      device: 'cpu',
      path: 'worker',
    };
    postMessage(res, [scoresBuffer, zBuffer, lagBuffer]);
  } catch (err) {
    const res: CorrelateWorkerError = {
      type: 'correlate-error',
      id: msg.id,
      message: err instanceof Error ? err.message : String(err),
    };
    postMessage(res);
  }
};
