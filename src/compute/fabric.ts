/**
 * Hybrid fabric wrappers — prefer WebGPU for SH_SYNTH / CORRELATE_BATCH
 * when ε-gate passed; otherwise CPU. Coherence / Smith stay CPU.
 */

import {
  adaptiveGridSize,
  drawCoefficients,
  type HarmonicCoeff,
} from '../math/sphericalHarmonics';
import type { CoherenceField } from '../math/coherence';
import {
  scanCorrelates,
  type CorrelateScanResult,
  type CorrelateSeed,
  type ThreadSeriesInput,
} from '../math/correlates';
import type { Complex, SmithState } from '../math/smith';
import type { IngestedDataset, MeaningNode } from '../ingest/types';
import { OP_DESCS, strictestEpistemic, type Epistemic, type OpGraph } from './types';
import {
  cpuRuntime,
  fabricCoherence as cpuCoh,
  fabricSmith as cpuSmith,
} from './cpuRuntime';
import { ledgerAppend } from './ledger';
import { collectAlignedPairs } from './correlateGpuBridge';
import {
  getGateState,
  runEpsilonGate,
  shSynthGpu,
  correlateLaggedBatchGpu,
  type ComputeDeviceKind,
} from './webgpu';

export { getGateState, runEpsilonGate };
export type { ComputeDeviceKind };

let initPromise: Promise<ReturnType<typeof getGateState>> | null = null;

/** Initialize probe + ε-gate once (idempotent). */
export function initComputeFabric(opts?: {
  forceCpu?: boolean;
}): Promise<ReturnType<typeof getGateState>> {
  if (!initPromise) {
    initPromise = runEpsilonGate(opts);
  }
  return initPromise;
}

/** Reset init (tests). */
export function resetComputeFabric(): void {
  initPromise = null;
}

export function activeDevice(): ComputeDeviceKind {
  return getGateState().device;
}

export async function fabricShSynth(opts: {
  ellMax: number;
  seed: number;
  ampScales?: Record<number, number>;
  ledger?: boolean;
  forceCpu?: boolean;
}): Promise<{
  grid: Float32Array;
  Cl: number[];
  coeffs: HarmonicCoeff[];
  nTheta: number;
  nPhi: number;
  ms: number;
  epistemic: Epistemic;
  device: ComputeDeviceKind;
  nBands?: number;
}> {
  await initComputeFabric();
  const gate = getGateState();
  const ampScales = opts.ampScales ?? {};
  const epistemic = OP_DESCS.SH_SYNTH.epistemicCeiling;

  if (gate.gpuEnabled && gate.handle && !opts.forceCpu) {
    try {
      const { nTheta, nPhi } = adaptiveGridSize(opts.ellMax);
      const { coeffs, Cl } = drawCoefficients(opts.ellMax, opts.seed, ampScales);
      const gpu = await shSynthGpu(gate.handle, coeffs, nTheta, nPhi);
      if (opts.ledger ?? true) {
        ledgerAppend({
          kind: 'compute',
          op: 'SH_SYNTH',
          tp: 'TP_ELL_BAND',
          epistemic,
          device: 'webgpu',
          ms: gpu.ms,
          detail: {
            graphId: 'skyframe-sh',
            ellMax: opts.ellMax,
            seed: opts.seed,
            nBands: gpu.nBands,
            shards: gpu.nBands,
          },
        });
      }
      return {
        grid: gpu.grid,
        Cl,
        coeffs,
        nTheta,
        nPhi,
        ms: gpu.ms,
        epistemic,
        device: 'webgpu',
        nBands: gpu.nBands,
      };
    } catch (err) {
      console.warn('[fabric] SH_SYNTH GPU failed, CPU fallback', err);
    }
  }

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
          ampScales,
        },
      },
    ],
  };
  const gr = cpuRuntime.runGraph(graph);
  const r = gr.results[0]!;
  return {
    grid: r.outputs[0]!.data as Float32Array,
    Cl: r.outputs[1]!.data as number[],
    coeffs: (r.outputs[2]!.data as { coeffs: HarmonicCoeff[] }).coeffs,
    nTheta: r.outputs[0]!.meta.shape[0]!,
    nPhi: r.outputs[0]!.meta.shape[1]!,
    ms: r.ms,
    epistemic: r.epistemic,
    device: 'cpu',
  };
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
}): CoherenceField & { ms: number; epistemic: Epistemic; device: ComputeDeviceKind } {
  const out = cpuCoh(opts);
  return { ...out, device: 'cpu' };
}

/**
 * CORRELATE_BATCH — CPU assembles hits/nulls; GPU overlays lagged-Pearson
 * scores when ε-gate enabled (TP_PAIR_BLOCK + TP_LAG_SLICE).
 *
 * Escape hatch for tests / `?correlateBypass=1`. UI default is
 * `runIngestConverge` (full OpGraph); prefer that unless explicitly bypassing.
 */
export async function fabricCorrelate(opts: {
  seed: CorrelateSeed;
  datasets: IngestedDataset[];
  nodes: MeaningNode[];
  thread: ThreadSeriesInput;
  maxLag?: number;
  topN?: number;
  ledger?: boolean;
  forceCpu?: boolean;
}): Promise<
  CorrelateScanResult & { ms: number; epistemic: Epistemic; device: ComputeDeviceKind }
> {
  await initComputeFabric();
  const gate = getGateState();
  const t0 = performance.now();

  const cpuScan = scanCorrelates(opts.seed, opts.datasets, opts.nodes, opts.thread, {
    maxLag: opts.maxLag,
    topN: opts.topN,
  });

  let device: ComputeDeviceKind = 'cpu';
  let usedGpuPairs = 0;

  if (gate.gpuEnabled && gate.handle && !opts.forceCpu) {
    try {
      const seriesHits = cpuScan.hits.filter(
        (h) => h.metric === 'pearson' || h.metric === 'lagged-pearson'
      );
      const packed = collectAlignedPairs(
        opts.seed,
        opts.datasets,
        opts.nodes,
        opts.thread,
        seriesHits,
        32
      );
      if (packed.nPairs > 0) {
        const gpu = await correlateLaggedBatchGpu(
          gate.handle,
          packed.series,
          packed.nSeries,
          packed.tLen,
          packed.pairs,
          opts.maxLag ?? 5
        );
        for (let i = 0; i < packed.nPairs; i++) {
          const hi = packed.hitIndex[i]!;
          const hit = seriesHits[hi];
          if (!hit) continue;
          hit.score = gpu.scores[i]!;
          hit.lag = gpu.lags[i]!;
          hit.metric = Math.abs(hit.lag) > 0 ? 'lagged-pearson' : 'pearson';
          usedGpuPairs++;
        }
        // Re-sort after score overlay
        cpuScan.hits.sort(
          (a, b) =>
            Math.abs(b.zToy) - Math.abs(a.zToy) || Math.abs(b.score) - Math.abs(a.score)
        );
        device = 'webgpu';
      }
    } catch (err) {
      console.warn('[fabric] CORRELATE_BATCH GPU failed, CPU result kept', err);
      device = 'cpu';
    }
  }

  const ms = performance.now() - t0;
  const epistemic = strictestEpistemic(
    [(opts.seed.epistemic as Epistemic) ?? 'RESEARCH/DERIVED'],
    OP_DESCS.CORRELATE_BATCH.epistemicCeiling
  );

  if (opts.ledger ?? true) {
    ledgerAppend({
      kind: 'compute',
      op: 'CORRELATE_BATCH',
      tp: 'TP_PAIR_BLOCK',
      epistemic,
      device,
      ms,
      detail: {
        graphId: 'ingest-correlate',
        scanned: cpuScan.scanned,
        gpuPairs: usedGpuPairs,
      },
    });
  }

  return { ...cpuScan, ms, epistemic, device };
}

export function fabricSmith(opts: {
  z: Complex;
  matchPull: number;
  source: 'dual-thread' | 'meaning-node';
  mappingNote: string;
}): SmithState & { ms: number; epistemic: Epistemic; device: ComputeDeviceKind } {
  const out = cpuSmith(opts);
  return { ...out, device: 'cpu' };
}
