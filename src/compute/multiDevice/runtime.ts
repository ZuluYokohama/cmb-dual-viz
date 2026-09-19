/**
 * MultiDeviceTensorRuntime — G3 façade.
 * Enumerates cpu + webgpu; ships API for 2+ logical devices.
 * demo-dual-logical shards TP_ELL_BAND / TP_PAIR_BLOCK across CPU+WebGPU
 * or two sequential logical queues — clearly DEMO, not fake hardware.
 */

import {
  adaptiveGridSize,
  drawCoefficients,
  synthesizeGrid,
  type HarmonicCoeff,
} from '../../math/sphericalHarmonics';
import { laggedPearsonBatchCpu } from '../webgpu/ops/correlateGpu';
import { shSynthGpu } from '../webgpu/ops/shSynthGpu';
import { getGateState, initComputeFabric } from '../fabric';
import { cpuRuntime } from '../cpuRuntime';
import { OP_DESCS, type OpName, type OpNode, type TPPolicy, type TensorHandle } from '../types';
import {
  classifyAdapterInfo,
  hardwareRealityNone,
  type HardwareReality,
} from '../hardwareGate';
import type {
  DualShardReport,
  LogicalDevice,
  LogicalDeviceId,
  MultiDeviceMode,
  MultiDeviceOpResult,
  MultiDeviceRuntime,
  PlacementHint,
  ShardPlacement,
} from './types';

const DEFAULT_HINTS: PlacementHint[] = [
  {
    op: 'SH_SYNTH',
    tp: 'TP_ELL_BAND',
    preferred: ['webgpu', 'cpu'],
    dualPolicy: 'split-tp',
    note: 'DEMO dual: split ℓ bands across logical devices',
  },
  {
    op: 'CORRELATE_BATCH',
    tp: 'TP_PAIR_BLOCK',
    preferred: ['webgpu', 'cpu'],
    dualPolicy: 'split-tp',
    note: 'DEMO dual: split pair blocks across logical devices',
  },
  {
    op: 'COH_FIELD',
    tp: 'TP_PIX_TILE',
    preferred: ['cpu'],
    dualPolicy: 'none',
  },
  {
    op: 'PROJECT_MOLLWEIDE',
    tp: 'TP_PIX_TILE',
    preferred: ['cpu'],
    dualPolicy: 'none',
  },
  {
    op: 'SMITH_MAP',
    tp: 'TP_NONE',
    preferred: ['cpu'],
    dualPolicy: 'none',
  },
  {
    op: 'EMBED_HASH',
    tp: 'TP_DOC_BATCH',
    preferred: ['cpu'],
    dualPolicy: 'none',
  },
  {
    op: 'MEANING_LAYOUT',
    tp: 'TP_NONE',
    preferred: ['cpu'],
    dualPolicy: 'none',
  },
  {
    op: 'INGEST_PARSE',
    tp: 'TP_DOC_BATCH',
    preferred: ['cpu'],
    dualPolicy: 'none',
  },
  {
    op: 'LEDGER_APPEND',
    tp: 'TP_NONE',
    preferred: ['cpu'],
    dualPolicy: 'none',
  },
];

function nowMs(): number {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();
}

function splitCoeffsByEll(
  coeffs: HarmonicCoeff[],
  parts: number
): HarmonicCoeff[][] {
  if (parts <= 1) return [coeffs];
  const ells = [...new Set(coeffs.map((c) => c.ell))].sort((a, b) => a - b);
  const buckets: HarmonicCoeff[][] = Array.from({ length: parts }, () => []);
  for (let i = 0; i < ells.length; i++) {
    const ell = ells[i]!;
    const b = i % parts;
    for (const c of coeffs) {
      if (c.ell === ell) buckets[b]!.push(c);
    }
  }
  // Ensure non-empty: if a bucket empty, give it a zero coeff from first
  for (let i = 0; i < parts; i++) {
    if (buckets[i]!.length === 0 && coeffs[0]) {
      buckets[i]!.push({ ...coeffs[0], a: 0 });
    }
  }
  return buckets;
}

export class MultiDeviceTensorRuntime implements MultiDeviceRuntime {
  private _mode: MultiDeviceMode = 'single';
  private devices: LogicalDevice[] = [];
  private reality: HardwareReality = hardwareRealityNone('not probed');
  private probed = false;

  get mode(): MultiDeviceMode {
    return this._mode;
  }

  setMode(mode: MultiDeviceMode): void {
    this._mode = mode;
  }

  getHardwareReality(): HardwareReality {
    return this.reality;
  }

  getDevicesSync(): LogicalDevice[] {
    return this.devices.slice();
  }

  getPlacementHints(): PlacementHint[] {
    return DEFAULT_HINTS.map((h) => ({ ...h, preferred: [...h.preferred] }));
  }

  async enumerateDevices(): Promise<LogicalDevice[]> {
    await initComputeFabric();
    const gate = getGateState();
    const info = gate.adapterInfo ?? gate.handle?.adapterInfo ?? '';
    this.reality = gate.gpuEnabled
      ? classifyAdapterInfo(info)
      : hardwareRealityNone(gate.reason);

    const cpu: LogicalDevice = {
      id: 'cpu',
      kind: 'cpu',
      label: 'CPU',
      isHardwareGpu: false,
      isSimulated: false,
      available: true,
    };

    const webgpu: LogicalDevice = {
      id: 'webgpu',
      kind: 'webgpu',
      label: gate.gpuEnabled
        ? `WebGPU (${this.reality.adapterInfo})`
        : 'WebGPU (unavailable)',
      isHardwareGpu: this.reality.hasHardwareGpu,
      isSimulated: false,
      adapterInfo: this.reality.adapterInfo,
      available: gate.gpuEnabled,
    };

    // Always expose 2 logical queues for API readiness (DEMO)
    const q0: LogicalDevice = {
      id: 'logical:q0',
      kind: 'logical',
      label: 'DEMO logical queue 0',
      isHardwareGpu: false,
      isSimulated: true,
      available: true,
    };
    const q1: LogicalDevice = {
      id: 'logical:q1',
      kind: 'logical',
      label: 'DEMO logical queue 1',
      isHardwareGpu: false,
      isSimulated: true,
      available: true,
    };

    this.devices = [cpu, webgpu, q0, q1];
    this.probed = true;
    return this.getDevicesSync();
  }

  placeShards(op: OpName, tp: TPPolicy, shardCount: number): ShardPlacement[] {
    const n = Math.max(1, shardCount);
    const hint = DEFAULT_HINTS.find((h) => h.op === op);

    if (this._mode === 'single' || n === 1 || hint?.dualPolicy !== 'split-tp') {
      const gate = getGateState();
      const preferGpu =
        hint?.preferred[0] === 'webgpu' && gate.gpuEnabled;
      const id: LogicalDeviceId = preferGpu ? 'webgpu' : 'cpu';
      return [
        {
          shardIndex: 0,
          shardCount: 1,
          deviceId: id,
          note: 'single-device placement',
          demo: false,
        },
      ];
    }

    // DEMO dual-logical: prefer CPU+WebGPU when GPU up; else two logical queues
    const gate = getGateState();
    const placements: ShardPlacement[] = [];
    for (let i = 0; i < n; i++) {
      let deviceId: LogicalDeviceId;
      let note: string;
      if (gate.gpuEnabled && n >= 2) {
        deviceId = i % 2 === 0 ? 'webgpu' : 'cpu';
        note = `DEMO/logical shard ${i} on ${deviceId} (not multi-GPU HW)`;
      } else {
        deviceId = i % 2 === 0 ? 'logical:q0' : 'logical:q1';
        note = `DEMO/logical sequential queue ${deviceId}`;
      }
      placements.push({
        shardIndex: i,
        shardCount: n,
        deviceId,
        note,
        demo: true,
      });
    }
    return placements;
  }

  async runOp(node: OpNode, inputs?: TensorHandle[]): Promise<MultiDeviceOpResult> {
    if (!this.probed) await this.enumerateDevices();
    const base = await Promise.resolve(cpuRuntime.runOp(node, inputs));
    const placements = this.placeShards(node.op.name, node.op.tp, 1);
    return {
      ...base,
      placements,
      mode: this._mode,
    };
  }

  /**
   * DEMO dual-logical SH_SYNTH — shards TP_ELL_BAND across placements.
   * Returns summed sky + per-shard placement timings. Not a HW multi-GPU claim.
   */
  async runDualEllBand(opts: {
    ellMax: number;
    seed: number;
    ampScales?: Record<number, number>;
    forceCpu?: boolean;
  }): Promise<{
    grid: Float32Array;
    Cl: number[];
    coeffs: HarmonicCoeff[];
    nTheta: number;
    nPhi: number;
    report: DualShardReport;
  }> {
    if (!this.probed) await this.enumerateDevices();
    const ampScales = opts.ampScales ?? {};
    const { nTheta, nPhi } = adaptiveGridSize(opts.ellMax);
    const { coeffs, Cl } = drawCoefficients(opts.ellMax, opts.seed, ampScales);

    if (this._mode !== 'demo-dual-logical') {
      const t0 = nowMs();
      const gate = getGateState();
      let grid: Float32Array;
      let deviceId: LogicalDeviceId = 'cpu';
      let ms: number;
      if (gate.gpuEnabled && gate.handle && !opts.forceCpu) {
        try {
          const gpu = await shSynthGpu(gate.handle, coeffs, nTheta, nPhi);
          grid = gpu.grid;
          ms = gpu.ms;
          deviceId = 'webgpu';
        } catch {
          grid = synthesizeGrid(coeffs, nTheta, nPhi);
          ms = nowMs() - t0;
        }
      } else {
        grid = synthesizeGrid(coeffs, nTheta, nPhi);
        ms = nowMs() - t0;
      }
      const placements: ShardPlacement[] = [
        { shardIndex: 0, shardCount: 1, deviceId, ms, demo: false },
      ];
      return {
        grid,
        Cl,
        coeffs,
        nTheta,
        nPhi,
        report: {
          op: 'SH_SYNTH',
          tp: 'TP_ELL_BAND',
          mode: 'single',
          placements,
          totalMs: ms,
          epistemic: OP_DESCS.SH_SYNTH.epistemicCeiling,
          hardwareMultiGpu: false,
          note: 'single-device',
        },
      };
    }

    const placements = this.placeShards('SH_SYNTH', 'TP_ELL_BAND', 2);
    const bands = splitCoeffsByEll(coeffs, 2);
    const grid = new Float32Array(nTheta * nPhi);
    const gate = getGateState();
    const tAll = nowMs();

    for (let s = 0; s < placements.length; s++) {
      const p = placements[s]!;
      const part = bands[s] ?? [];
      const t0 = nowMs();
      let partGrid: Float32Array;
      if (
        p.deviceId === 'webgpu' &&
        gate.gpuEnabled &&
        gate.handle &&
        !opts.forceCpu &&
        part.length > 0
      ) {
        try {
          const gpu = await shSynthGpu(gate.handle, part, nTheta, nPhi);
          partGrid = gpu.grid;
          p.ms = gpu.ms;
        } catch {
          partGrid = synthesizeGrid(part, nTheta, nPhi);
          p.ms = nowMs() - t0;
          p.deviceId = 'cpu';
          p.note = 'DEMO fallback to CPU after GPU shard fail';
        }
      } else {
        // logical:q* and cpu — sequential CPU (labeled DEMO)
        partGrid = synthesizeGrid(part, nTheta, nPhi);
        p.ms = nowMs() - t0;
      }
      for (let i = 0; i < grid.length; i++) grid[i]! += partGrid[i]!;
    }

    return {
      grid,
      Cl,
      coeffs,
      nTheta,
      nPhi,
      report: {
        op: 'SH_SYNTH',
        tp: 'TP_ELL_BAND',
        mode: 'demo-dual-logical',
        placements,
        totalMs: nowMs() - tAll,
        epistemic: OP_DESCS.SH_SYNTH.epistemicCeiling,
        hardwareMultiGpu: false,
        note: 'DEMO/logical TP_ELL_BAND shard — not multi-GPU hardware',
      },
    };
  }

  /**
   * DEMO dual-logical CORRELATE — shards TP_PAIR_BLOCK across placements.
   */
  async runDualPairBlock(opts: {
    series: Float32Array;
    nSeries: number;
    tLen: number;
    pairs: Uint32Array;
    maxLag: number;
  }): Promise<{
    scores: Float32Array;
    lags: Int32Array;
    report: DualShardReport;
  }> {
    if (!this.probed) await this.enumerateDevices();
    const nPairs = opts.pairs.length / 2;
    const scores = new Float32Array(nPairs);
    const lags = new Int32Array(nPairs);

    if (this._mode !== 'demo-dual-logical' || nPairs < 2) {
      const t0 = nowMs();
      const cpu = laggedPearsonBatchCpu(
        opts.series,
        opts.nSeries,
        opts.tLen,
        opts.pairs,
        opts.maxLag
      );
      scores.set(cpu.scores);
      lags.set(cpu.lags);
      const ms = nowMs() - t0;
      return {
        scores,
        lags,
        report: {
          op: 'CORRELATE_BATCH',
          tp: 'TP_PAIR_BLOCK',
          mode: 'single',
          placements: [
            { shardIndex: 0, shardCount: 1, deviceId: 'cpu', ms, demo: false },
          ],
          totalMs: ms,
          epistemic: OP_DESCS.CORRELATE_BATCH.epistemicCeiling,
          hardwareMultiGpu: false,
          note: 'single-device',
        },
      };
    }

    const mid = Math.floor(nPairs / 2);
    const placements = this.placeShards('CORRELATE_BATCH', 'TP_PAIR_BLOCK', 2);
    const tAll = nowMs();

    const runSlice = (start: number, end: number, p: ShardPlacement) => {
      const slicePairs = opts.pairs.subarray(start * 2, end * 2);
      const t0 = nowMs();
      const out = laggedPearsonBatchCpu(
        opts.series,
        opts.nSeries,
        opts.tLen,
        slicePairs,
        opts.maxLag
      );
      p.ms = nowMs() - t0;
      for (let i = 0; i < end - start; i++) {
        scores[start + i] = out.scores[i]!;
        lags[start + i] = out.lags[i]!;
      }
    };

    // Sequential logical queues (even when labeled webgpu — correlate GPU
    // overlay stays in fabric; DEMO path uses CPU slices with placement labels)
    runSlice(0, mid, placements[0]!);
    runSlice(mid, nPairs, placements[1]!);

    return {
      scores,
      lags,
      report: {
        op: 'CORRELATE_BATCH',
        tp: 'TP_PAIR_BLOCK',
        mode: 'demo-dual-logical',
        placements,
        totalMs: nowMs() - tAll,
        epistemic: OP_DESCS.CORRELATE_BATCH.epistemicCeiling,
        hardwareMultiGpu: false,
        note: 'DEMO/logical TP_PAIR_BLOCK shard — not multi-GPU hardware',
      },
    };
  }
}

/** Singleton façade */
export const multiDeviceRuntime = new MultiDeviceTensorRuntime();
