import { fabricShSynth, fabricCorrelate, initComputeFabric } from '../src/compute';
import { adaptiveGridSize } from '../src/math/sphericalHarmonics';
import { genExampleCl, genSyntheticGcpLike } from '../src/math/generators';
import type { CorrelateSeed, ThreadSeriesInput } from '../src/math/correlates';

async function bench(fn: () => void | Promise<void>, runs: number) {
  const times: number[] = [];
  await fn(); // warmup
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    await fn();
    times.push(performance.now() - t0);
  }
  const meanMs = times.reduce((a, b) => a + b, 0) / times.length;
  return {
    runs,
    meanMs,
    minMs: Math.min(...times),
    maxMs: Math.max(...times),
  };
}

export async function runBaseline() {
  const gate = await initComputeFabric({ forceCpu: true });
  const shElls = [8, 16, 32];
  const sh = [];
  for (const ellMax of shElls) {
    const { nTheta, nPhi } = adaptiveGridSize(ellMax);
    const stats = await bench(async () => {
      await fabricShSynth({ ellMax, seed: 42, ampScales: {}, ledger: false, forceCpu: true });
    }, ellMax >= 32 ? 3 : 5);
    sh.push({ ellMax, nTheta, nPhi, ...stats });
  }

  const datasets = [genExampleCl(48), genSyntheticGcpLike()];
  const thread: ThreadSeriesInput = {
    Cl: datasets[0]!.cl ?? [],
    ellFocus: 8,
    ellMax: 48,
    coherenceScore: 0.2,
    coherenceZ: 1.0,
    timePhase: 0.1,
  };
  const corrNs = [32, 64];
  const corr = [];
  for (const n of corrNs) {
    const series = Array.from({ length: n }, (_, i) => Math.sin(i / 5) + 0.1 * i);
    const seed: CorrelateSeed = {
      id: 'perf-seed',
      label: `series n=${n}`,
      kind: 'dataset-series',
      series,
      epistemic: 'METAPHOR/RESEARCH',
    };
    let scanned = 0;
    const stats = await bench(async () => {
      const r = await fabricCorrelate({
        seed,
        datasets,
        nodes: [],
        thread,
        maxLag: 5,
        topN: 10,
        ledger: false,
        forceCpu: true,
      });
      scanned = r.scanned;
    }, 5);
    corr.push({ n, scanned, ...stats });
  }

  return {
    atIso: new Date().toISOString(),
    device: gate.device,
    gpuEnabled: gate.gpuEnabled,
    gateReason: gate.reason,
    sh,
    corr,
  };
}
