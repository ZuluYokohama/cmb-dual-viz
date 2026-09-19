/**
 * ε-gate — compare GPU vs CPU goldens; disable GPU if outside tolerance.
 */

import {
  adaptiveGridSize,
  drawCoefficients,
  synthesizeGrid,
} from '../../math/sphericalHarmonics';
import {
  EPS_CORR_ABS,
  EPS_SH_ABS,
  compareVectors,
  type EpsilonReport,
} from './epsilon';
import {
  disableWebGpu,
  probeWebGpu,
  type ComputeDeviceKind,
  type WebGpuHandle,
} from './device';
import { shSynthGpu } from './ops/shSynthGpu';
import {
  correlateLaggedBatchGpu,
  laggedPearsonBatchCpu,
} from './ops/correlateGpu';

export interface GateState {
  device: ComputeDeviceKind;
  gpuEnabled: boolean;
  reason: string;
  reports: EpsilonReport[];
  handle: WebGpuHandle | null;
  adapterInfo?: string;
}

let gateState: GateState = {
  device: 'cpu',
  gpuEnabled: false,
  reason: 'not initialized',
  reports: [],
  handle: null,
};

export function getGateState(): GateState {
  return gateState;
}

function makeCorrGolden(): {
  series: Float32Array;
  nSeries: number;
  tLen: number;
  pairs: Uint32Array;
  maxLag: number;
} {
  const nSeries = 8;
  const tLen = 32;
  const series = new Float32Array(nSeries * tLen);
  for (let s = 0; s < nSeries; s++) {
    for (let t = 0; t < tLen; t++) {
      series[s * tLen + t] =
        Math.sin((t + 1) * 0.37 + s * 0.9) + 0.15 * Math.cos(t * 0.11 * (s + 1));
    }
  }
  // All pairs i<j
  const pairList: number[] = [];
  for (let i = 0; i < nSeries; i++) {
    for (let j = i + 1; j < nSeries; j++) {
      pairList.push(i, j);
    }
  }
  return {
    series,
    nSeries,
    tLen,
    pairs: Uint32Array.from(pairList),
    maxLag: 5,
  };
}

/**
 * Probe WebGPU and run ε-gates for SH_SYNTH + CORRELATE_BATCH.
 * On failure or missing GPU → CPU fallback (gpuEnabled=false).
 */
export async function runEpsilonGate(opts?: {
  forceCpu?: boolean;
}): Promise<GateState> {
  if (opts?.forceCpu) {
    disableWebGpu('forced CPU (test/flag)');
    gateState = {
      device: 'cpu',
      gpuEnabled: false,
      reason: 'forced CPU',
      reports: [],
      handle: null,
    };
    return gateState;
  }

  const probe = await probeWebGpu();
  if (!probe.available || !probe.handle) {
    gateState = {
      device: 'cpu',
      gpuEnabled: false,
      reason: probe.reason,
      reports: [],
      handle: null,
    };
    return gateState;
  }

  const handle = probe.handle;
  const reports: EpsilonReport[] = [];

  // --- SH golden: seed=42, ℓmax=8 ---
  try {
    const ellMax = 8;
    const seed = 42;
    const { nTheta, nPhi } = adaptiveGridSize(ellMax);
    const { coeffs } = drawCoefficients(ellMax, seed, {});
    const cpuGrid = synthesizeGrid(coeffs, nTheta, nPhi);
    const gpu = await shSynthGpu(handle, coeffs, nTheta, nPhi);
    const shReport = compareVectors(
      'SH_SYNTH',
      `ellMax=${ellMax} grid=${nTheta}x${nPhi}`,
      seed,
      EPS_SH_ABS,
      gpu.grid,
      cpuGrid,
      `ε=${EPS_SH_ABS} abs; TP_ELL_BAND bands=${gpu.nBands}`
    );
    reports.push(shReport);
  } catch (err) {
    reports.push({
      op: 'SH_SYNTH',
      shape: 'ellMax=8',
      seed: 42,
      eps: EPS_SH_ABS,
      maxAbsDiff: Number.POSITIVE_INFINITY,
      rmsDiff: Number.POSITIVE_INFINITY,
      passed: false,
      note: err instanceof Error ? err.message : String(err),
    });
  }

  // --- Correlate golden: n=8 series × t=32, maxLag=5 ---
  try {
    const g = makeCorrGolden();
    const cpu = laggedPearsonBatchCpu(
      g.series,
      g.nSeries,
      g.tLen,
      g.pairs,
      g.maxLag
    );
    const gpu = await correlateLaggedBatchGpu(
      handle,
      g.series,
      g.nSeries,
      g.tLen,
      g.pairs,
      g.maxLag
    );
    const corrReport = compareVectors(
      'CORRELATE_BATCH',
      `nSeries=${g.nSeries} tLen=${g.tLen} pairs=${g.pairs.length / 2} maxLag=${g.maxLag}`,
      0,
      EPS_CORR_ABS,
      gpu.scores,
      cpu.scores,
      `ε=${EPS_CORR_ABS} abs on lagged-Pearson scores; lags also checked`
    );
    // Also require lag match (exact)
    let lagMismatch = 0;
    for (let i = 0; i < cpu.lags.length; i++) {
      if (cpu.lags[i] !== gpu.lags[i]) lagMismatch++;
    }
    if (lagMismatch > 0) {
      corrReport.passed = false;
      corrReport.note =
        (corrReport.note ?? '') + `; lag mismatches=${lagMismatch}`;
    }
    reports.push(corrReport);
  } catch (err) {
    reports.push({
      op: 'CORRELATE_BATCH',
      shape: 'n=8 t=32',
      seed: 0,
      eps: EPS_CORR_ABS,
      maxAbsDiff: Number.POSITIVE_INFINITY,
      rmsDiff: Number.POSITIVE_INFINITY,
      passed: false,
      note: err instanceof Error ? err.message : String(err),
    });
  }

  const allPass = reports.length > 0 && reports.every((r) => r.passed);
  if (!allPass) {
    const why = reports
      .filter((r) => !r.passed)
      .map((r) => `${r.op}: maxΔ=${r.maxAbsDiff} (ε=${r.eps}) ${r.note ?? ''}`)
      .join('; ');
    disableWebGpu(`ε-gate failed: ${why}`);
    gateState = {
      device: 'cpu',
      gpuEnabled: false,
      reason: `ε-gate failed → CPU fallback (${why})`,
      reports,
      handle: null,
      adapterInfo: handle.adapterInfo,
    };
    return gateState;
  }

  gateState = {
    device: 'webgpu',
    gpuEnabled: true,
    reason: 'ε-gate passed',
    reports,
    handle,
    adapterInfo: handle.adapterInfo,
  };
  return gateState;
}
