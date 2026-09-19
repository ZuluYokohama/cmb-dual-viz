/**
 * Main-thread client for CORRELATE_BATCH worker + transferable score buffers.
 * Falls back to fabricCorrelate / scan on main when Workers unavailable.
 */
import {
  scanCorrelates,
  type CorrelateScanResult,
  type CorrelateSeed,
  type ThreadSeriesInput,
} from '../../math/correlates';
import type { IngestedDataset, MeaningNode } from '../../ingest/types';
import type { Epistemic } from '../types';
import { OP_DESCS, strictestEpistemic } from '../types';
import { fabricCorrelate } from '../fabric';
import type {
  CorrelateWorkerRequest,
  CorrelateWorkerResponse,
} from './correlate.worker';

let worker: Worker | null = null;
let workerFailed = false;
let seq = 1;
const pending = new Map<
  number,
  {
    resolve: (v: CorrelateWorkerResponse) => void;
    reject: (e: Error) => void;
  }
>();

function canUseWorker(): boolean {
  return (
    !workerFailed &&
    typeof Worker !== 'undefined' &&
    typeof window !== 'undefined'
  );
}

function getWorker(): Worker | null {
  if (!canUseWorker()) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./correlate.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (ev: MessageEvent) => {
      const data = ev.data as { type: string; id: number; message?: string };
      const slot = pending.get(data.id);
      if (!slot) return;
      pending.delete(data.id);
      if (data.type === 'correlate-error') {
        slot.reject(new Error(data.message ?? 'worker error'));
      } else if (data.type === 'correlate-result') {
        slot.resolve(ev.data as CorrelateWorkerResponse);
      }
    };
    worker.onerror = () => {
      workerFailed = true;
      worker = null;
      for (const [, slot] of pending) {
        slot.reject(new Error('Correlate worker crashed'));
      }
      pending.clear();
    };
    return worker;
  } catch {
    workerFailed = true;
    return null;
  }
}

export function correlateWorkerAvailable(): boolean {
  return canUseWorker() && getWorker() != null;
}

function serializeNodes(
  nodes: MeaningNode[]
): CorrelateWorkerRequest['nodes'] {
  return nodes.map((n) => ({
    ...n,
    features: Array.from(n.features),
  }));
}

export interface CorrelateOffthreadResult extends CorrelateScanResult {
  ms: number;
  epistemic: Epistemic;
  device: 'cpu' | 'webgpu';
  path: 'worker' | 'main';
}

/**
 * Run CORRELATE_BATCH off-main-thread when Worker is available.
 * Optional hybrid GPU overlay via fabricCorrelate on main (forceCpu skips GPU).
 */
export async function runCorrelateOffthread(opts: {
  seed: CorrelateSeed;
  datasets: IngestedDataset[];
  nodes: MeaningNode[];
  thread: ThreadSeriesInput;
  maxLag?: number;
  topN?: number;
  preferWorker?: boolean;
  /** When true, skip worker and use fabricCorrelate (tests / escape hatch). */
  forceMain?: boolean;
  forceCpu?: boolean;
  ledger?: boolean;
  /** Use hybrid fabricCorrelate on main instead of raw scan (GPU overlay). */
  useFabricOnMain?: boolean;
}): Promise<CorrelateOffthreadResult> {
  const prefer = opts.preferWorker !== false && !opts.forceMain;
  const w = prefer ? getWorker() : null;
  const epistemic = strictestEpistemic(
    [(opts.seed.epistemic as Epistemic) ?? 'RESEARCH/DERIVED'],
    OP_DESCS.CORRELATE_BATCH.epistemicCeiling
  );

  if (w) {
    const id = seq++;
    const seedPayload: CorrelateSeed = {
      ...opts.seed,
      features: opts.seed.features
        ? Array.from(
            opts.seed.features instanceof Float32Array
              ? opts.seed.features
              : opts.seed.features
          )
        : undefined,
    };
    const req: CorrelateWorkerRequest = {
      type: 'correlate',
      id,
      seed: seedPayload,
      datasets: opts.datasets,
      nodes: serializeNodes(opts.nodes),
      thread: opts.thread,
      maxLag: opts.maxLag,
      topN: opts.topN,
    };
    try {
      const res = await new Promise<CorrelateWorkerResponse>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        w.postMessage(req);
      });
      // Re-attach transferable score arrays onto hits (parity check)
      const scores = new Float32Array(res.scoresBuffer);
      const zs = new Float32Array(res.zBuffer);
      const lags = new Float32Array(res.lagBuffer);
      const hits = res.hits.map((h, i) => ({
        ...h,
        score: scores[i] ?? h.score,
        zToy: zs[i] ?? h.zToy,
        lag: lags[i] ?? h.lag,
      }));
      return {
        hits,
        residue: res.residue,
        scanned: res.scanned,
        ms: res.ms,
        epistemic,
        device: 'cpu',
        path: 'worker',
      };
    } catch {
      workerFailed = true;
      // fall through
    }
  }

  if (opts.useFabricOnMain !== false) {
    const fab = await fabricCorrelate({
      seed: opts.seed,
      datasets: opts.datasets,
      nodes: opts.nodes,
      thread: opts.thread,
      maxLag: opts.maxLag,
      topN: opts.topN,
      ledger: opts.ledger ?? false,
      forceCpu: opts.forceCpu,
    });
    return { ...fab, path: 'main' };
  }

  const t0 =
    typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now();
  const scan = scanCorrelates(
    opts.seed,
    opts.datasets,
    opts.nodes,
    opts.thread,
    { maxLag: opts.maxLag, topN: opts.topN }
  );
  const ms =
    (typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now()) - t0;
  return { ...scan, ms, epistemic, device: 'cpu', path: 'main' };
}
