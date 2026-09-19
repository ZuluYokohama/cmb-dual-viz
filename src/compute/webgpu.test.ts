import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  EPS_CORR_ABS,
  EPS_SH_ABS,
  compareVectors,
  laggedPearsonBatchCpu,
  maxAbsDiff,
  probeWebGpu,
  resetWebGpuProbe,
  disableWebGpu,
  runEpsilonGate,
  getGateState,
} from './webgpu';
import {
  fabricShSynth,
  fabricCorrelate,
  initComputeFabric,
  resetComputeFabric,
  activeDevice,
} from './fabric';
import { OP_DESCS } from './types';
import { genExampleCl, genSyntheticGcpLike } from '../math/generators';
import type { CorrelateSeed, ThreadSeriesInput } from '../math/correlates';
import { synthesizeGrid, drawCoefficients, adaptiveGridSize } from '../math/sphericalHarmonics';

describe('G1 WebGPU fabric', () => {
  beforeEach(() => {
    resetWebGpuProbe();
    resetComputeFabric();
  });

  afterEach(() => {
    resetWebGpuProbe();
    resetComputeFabric();
  });

  it('declares primary TP policies for GPU ops', () => {
    expect(OP_DESCS.SH_SYNTH.tp).toBe('TP_ELL_BAND');
    expect(OP_DESCS.SH_SYNTH.cpuRefRequired).toBe(true);
    expect(OP_DESCS.CORRELATE_BATCH.tp).toBe('TP_PAIR_BLOCK');
    expect(OP_DESCS.CORRELATE_BATCH.cpuRefRequired).toBe(true);
  });

  it('feature-detects WebGPU and falls back on Node', async () => {
    const probe = await probeWebGpu(true);
    // Node vitest: no navigator.gpu
    expect(probe.available).toBe(false);
    expect(probe.reason.length).toBeGreaterThan(0);
  });

  it('ε-gate falls back to CPU when WebGPU unavailable', async () => {
    const gate = await runEpsilonGate();
    expect(gate.gpuEnabled).toBe(false);
    expect(gate.device).toBe('cpu');
    expect(activeDevice()).toBe('cpu');
  });

  it('forced CPU path works', async () => {
    const gate = await initComputeFabric({ forceCpu: true });
    expect(gate.device).toBe('cpu');
    const out = await fabricShSynth({ ellMax: 6, seed: 42, ledger: false, forceCpu: true });
    expect(out.device).toBe('cpu');
    expect(out.grid.length).toBeGreaterThan(0);
  });

  it('SH fabric CPU matches synthesizeGrid golden', async () => {
    await initComputeFabric({ forceCpu: true });
    const ellMax = 8;
    const seed = 42;
    const { nTheta, nPhi } = adaptiveGridSize(ellMax);
    const { coeffs, Cl } = drawCoefficients(ellMax, seed, {});
    const direct = synthesizeGrid(coeffs, nTheta, nPhi);
    const fab = await fabricShSynth({ ellMax, seed, ledger: false, forceCpu: true });
    expect(fab.Cl).toEqual(Cl);
    expect(maxAbsDiff(fab.grid, direct)).toBe(0);
  });

  it('laggedPearsonBatchCpu is finite and self-consistent', () => {
    const nSeries = 4;
    const tLen = 16;
    const series = new Float32Array(nSeries * tLen);
    for (let i = 0; i < series.length; i++) series[i] = Math.sin(i * 0.3);
    const pairs = Uint32Array.from([0, 1, 0, 2, 1, 3]);
    const { scores, lags } = laggedPearsonBatchCpu(series, nSeries, tLen, pairs, 3);
    expect(scores.length).toBe(3);
    for (let i = 0; i < scores.length; i++) {
      expect(Number.isFinite(scores[i]!)).toBe(true);
      expect(Math.abs(scores[i]!)).toBeLessThanOrEqual(1.0001);
      expect(Number.isFinite(lags[i]!)).toBe(true);
    }
  });

  it('compareVectors ε helper documents gate thresholds', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([1, 2, 3 + 1e-4]);
    const r = compareVectors('SH_SYNTH', 'toy', 0, EPS_SH_ABS, a, b);
    expect(r.passed).toBe(true);
    expect(EPS_SH_ABS).toBe(0.75);
    expect(EPS_CORR_ABS).toBe(5e-4);
  });

  it('CORRELATE fabric returns device cpu under Node fallback', async () => {
    await initComputeFabric({ forceCpu: true });
    const datasets = [genExampleCl(16), genSyntheticGcpLike()];
    const thread: ThreadSeriesInput = {
      Cl: datasets[0]!.cl ?? [],
      ellFocus: 6,
      ellMax: 16,
      coherenceScore: 0.1,
      coherenceZ: 0.5,
      timePhase: 0,
    };
    const seed: CorrelateSeed = {
      id: 'seed-thread-a',
      label: 'A',
      kind: 'thread-a-ell',
      series: Array.from({ length: 15 }, (_, i) => Math.sin(i / 2)),
      epistemic: 'PHYSICS-BACKED (EXAMPLE)',
    };
    const fab = await fabricCorrelate({
      seed,
      datasets,
      nodes: [],
      thread,
      maxLag: 4,
      topN: 6,
      ledger: false,
      forceCpu: true,
    });
    expect(fab.device).toBe('cpu');
    expect(fab.hits.length).toBeGreaterThan(0);
    expect(fab.epistemic).not.toBe('PHYSICS-BACKED');
  });

  it('disableWebGpu prevents enablement', async () => {
    disableWebGpu('test disable');
    const gate = await runEpsilonGate();
    expect(gate.gpuEnabled).toBe(false);
    expect(getGateState().reason).toMatch(/test disable|forced|missing|ε-gate|navigator/i);
  });
});
