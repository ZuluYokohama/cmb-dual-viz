/**
 * Main-thread client for SkyFrame worker + transferable buffers.
 * Falls back to inline runSkyFrame when Workers unavailable.
 */

import { runSkyFrame, type SkyFrameParams, type SkyFrameResult } from '../graphs';
import {
  recordGraphMeasurement,
  type GraphMeasurement,
} from '../measurements';
import { OP_DESCS, strictestEpistemic } from '../types';
import type { SkyWorkerRequest, SkyWorkerResponse } from './skyFrame.worker';

let worker: Worker | null = null;
let workerFailed = false;
let seq = 1;
const pending = new Map<
  number,
  {
    resolve: (v: SkyWorkerResponse) => void;
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
    worker = new Worker(new URL('./skyFrame.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (ev: MessageEvent) => {
      const data = ev.data as { type: string; id: number; message?: string };
      const slot = pending.get(data.id);
      if (!slot) return;
      pending.delete(data.id);
      if (data.type === 'skyframe-error') {
        slot.reject(new Error(data.message ?? 'worker error'));
      } else if (data.type === 'skyframe-result') {
        slot.resolve(ev.data as SkyWorkerResponse);
      }
    };
    worker.onerror = () => {
      workerFailed = true;
      worker = null;
      for (const [, slot] of pending) {
        slot.reject(new Error('SkyFrame worker crashed'));
      }
      pending.clear();
    };
    return worker;
  } catch {
    workerFailed = true;
    return null;
  }
}

export function workerPathAvailable(): boolean {
  return canUseWorker() && getWorker() != null;
}

export interface SkyFrameWorkerResult extends SkyFrameResult {
  path: 'worker' | 'main';
}

/**
 * Run SkyFrame off-main-thread when Worker is available.
 * Returns transferable-backed typed arrays; records measurement with path tag.
 */
export async function runSkyFrameOffthread(
  params: SkyFrameParams & { preferWorker?: boolean }
): Promise<SkyFrameWorkerResult> {
  const prefer = params.preferWorker !== false;
  const w = prefer ? getWorker() : null;

  if (w) {
    const id = seq++;
    const req: SkyWorkerRequest = {
      type: 'skyframe',
      id,
      ellMax: params.ellMax,
      seed: params.seed,
      ampScales: params.ampScales,
      includeCoh: params.includeCoh ?? true,
      cohSeed: params.cohSeed,
      timePhase: params.timePhase,
      drive: params.drive,
      projectWidth: params.projectWidth,
      projectHeight: params.projectHeight,
      showCoherence: params.showCoherence,
      coherenceOpacity: params.coherenceOpacity,
    };

    try {
      const res = await new Promise<SkyWorkerResponse>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        w.postMessage(req);
      });

      const grid = new Float32Array(res.gridBuffer);
      const rgba = new Uint8ClampedArray(res.rgbaBuffer);
      const cohGrid = res.cohBuffer ? new Float32Array(res.cohBuffer) : null;

      const ops = [
        {
          opId: 'sh0',
          opName: 'SH_SYNTH' as const,
          device: 'cpu' as const,
          ms: res.ms * 0.55,
          tp: OP_DESCS.SH_SYNTH.tp,
          shardCount: 1,
          epistemic: OP_DESCS.SH_SYNTH.epistemicCeiling,
          fused: true,
          placements: [
            {
              shardIndex: 0,
              shardCount: 1,
              deviceId: 'cpu' as const,
              ms: res.ms * 0.55,
              note: 'worker thread',
            },
          ],
        },
        ...(params.includeCoh !== false
          ? [
              {
                opId: 'coh0',
                opName: 'COH_FIELD' as const,
                device: 'cpu' as const,
                ms: res.ms * 0.25,
                tp: OP_DESCS.COH_FIELD.tp,
                shardCount: 1,
                epistemic: OP_DESCS.COH_FIELD.epistemicCeiling,
                fused: true,
              },
            ]
          : []),
        {
          opId: 'proj0',
          opName: 'PROJECT_MOLLWEIDE' as const,
          device: 'cpu' as const,
          ms: res.ms * 0.2,
          tp: OP_DESCS.PROJECT_MOLLWEIDE.tp,
          shardCount: 1,
          epistemic: OP_DESCS.PROJECT_MOLLWEIDE.epistemicCeiling,
          fused: true,
        },
      ];

      const epistemic = strictestEpistemic(
        ops.map((o) => o.epistemic),
        OP_DESCS.SH_SYNTH.epistemicCeiling
      );

      const measurement: GraphMeasurement = recordGraphMeasurement(
        {
          graphId: 'SkyFrame',
          pattern: 'SkyFrame',
          device: 'cpu',
          ms: res.ms,
          epistemic,
          ops,
          fuseNotes: ['SkyFrame worker path (transferable buffers)'],
          at: Date.now(),
          path: 'worker',
        },
        { ledger: params.ledger ?? true }
      );

      return {
        grid,
        Cl: res.Cl,
        coeffs: [],
        nTheta: res.nTheta,
        nPhi: res.nPhi,
        coh: cohGrid
          ? {
              grid: cohGrid,
              nTheta: res.nTheta,
              nPhi: res.nPhi,
              score: 0,
              nullMean: 0,
              nullStd: 1,
              zScore: 0,
              timePhase: params.timePhase ?? 0,
              ms: res.ms * 0.25,
              epistemic: OP_DESCS.COH_FIELD.epistemicCeiling,
            }
          : null,
        rgba,
        projectWidth: res.projectWidth,
        projectHeight: res.projectHeight,
        measurement,
        epistemic,
        device: 'cpu',
        path: 'worker',
      };
    } catch {
      workerFailed = true;
      // fall through to main
    }
  }

  const main = await runSkyFrame(params);
  // annotate path on a copy of measurement via fuse note if missing
  if (!main.measurement.path) {
    main.measurement.path = 'main';
  }
  return { ...main, path: 'main' };
}
