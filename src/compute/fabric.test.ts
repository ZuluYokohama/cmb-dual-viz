import { describe, expect, it } from 'vitest';
import {
  adaptiveGridSize,
  drawCoefficients,
  synthesizeGrid,
} from '../math/sphericalHarmonics';
import { buildCoherence } from '../math/coherence';
import { scanCorrelates, type CorrelateSeed, type ThreadSeriesInput } from '../math/correlates';
import { buildSmithState, zToGamma } from '../math/smith';
import { genExampleCl, genSyntheticGcpLike } from '../math/generators';
import {
  OP_DESCS,
  cpuRuntime,
  fabricCoherence,
  fabricCorrelate,
  fabricShSynth,
  fabricSmith,
  ledgerAppend,
  ledgerClear,
  ledgerSnapshot,
} from './index';

describe('CPU fabric parity', () => {
  it('declares TP policies on canonical ops', () => {
    expect(OP_DESCS.SH_SYNTH.tp).toBe('TP_ELL_BAND');
    expect(OP_DESCS.COH_FIELD.tp).toBe('TP_PIX_TILE');
    expect(OP_DESCS.CORRELATE_BATCH.tp).toBe('TP_PAIR_BLOCK');
    expect(OP_DESCS.SMITH_MAP.tp).toBe('TP_NONE');
  });

  it('SH_SYNTH bit-matches direct synthesizeGrid', async () => {
    const ellMax = 8;
    const seed = 42;
    const ampScales = {};
    const direct = (() => {
      const { nTheta, nPhi } = adaptiveGridSize(ellMax);
      const { coeffs, Cl } = drawCoefficients(ellMax, seed, ampScales);
      return { grid: synthesizeGrid(coeffs, nTheta, nPhi), Cl, nTheta, nPhi };
    })();
    const fab = await fabricShSynth({ ellMax, seed, ampScales, ledger: false, forceCpu: true });
    expect(fab.nTheta).toBe(direct.nTheta);
    expect(fab.nPhi).toBe(direct.nPhi);
    expect(fab.Cl).toEqual(direct.Cl);
    expect(fab.grid.length).toBe(direct.grid.length);
    for (let i = 0; i < fab.grid.length; i++) {
      expect(fab.grid[i]).toBe(direct.grid[i]);
    }
  });

  it('COH_FIELD matches buildCoherence', () => {
    const opts = {
      nTheta: 24,
      nPhi: 48,
      seed: 7,
      Lcoh: 3,
      timePhase: 0.25,
      drive: 0.1,
      lightMetrics: false,
    };
    const direct = buildCoherence(
      opts.nTheta,
      opts.nPhi,
      opts.seed,
      opts.Lcoh,
      opts.timePhase,
      opts.drive,
      opts.lightMetrics
    );
    const fab = fabricCoherence({ ...opts, ledger: false });
    expect(fab.score).toBe(direct.score);
    expect(fab.zScore).toBe(direct.zScore);
    for (let i = 0; i < fab.grid.length; i++) {
      expect(fab.grid[i]).toBe(direct.grid[i]);
    }
  });

  it('CORRELATE_BATCH matches scanCorrelates', async () => {
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
    const direct = scanCorrelates(seed, datasets, [], thread, { maxLag: 4, topN: 6 });
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
    expect(fab.scanned).toBe(direct.scanned);
    expect(fab.hits.length).toBe(direct.hits.length);
    for (let i = 0; i < fab.hits.length; i++) {
      expect(fab.hits[i]!.score).toBe(direct.hits[i]!.score);
      expect(fab.hits[i]!.zToy).toBe(direct.hits[i]!.zToy);
      expect(fab.hits[i]!.epistemic).toBe(direct.hits[i]!.epistemic);
    }
  });

  it('SMITH_MAP is TP_NONE and matches buildSmithState', () => {
    const z = { re: 1.2, im: -0.4 };
    const direct = buildSmithState(z, 0.2, 'dual-thread', 'note');
    const fab = fabricSmith({
      z,
      matchPull: 0.2,
      source: 'dual-thread',
      mappingNote: 'note',
    });
    expect(fab.gamma.re).toBe(direct.gamma.re);
    expect(fab.gamma.im).toBe(direct.gamma.im);
    const r = cpuRuntime.runOp({
      id: 's',
      op: OP_DESCS.SMITH_MAP,
      params: { z, matchPull: 0.2, source: 'dual-thread', mappingNote: 'note' },
    });
    expect(r.tp).toBe('TP_NONE');
    expect(zToGamma(z).re).toBeCloseTo(direct.gamma.re, 12);
  });

  it('ledger appends compute/ingest/correlate kinds', async () => {
    ledgerClear();
    ledgerAppend({
      kind: 'ingest',
      op: 'INGEST_PARSE',
      epistemic: 'DERIVED/MEANING-MAP',
      detail: { name: 'test' },
    });
    await fabricShSynth({ ellMax: 4, seed: 1, ledger: true, forceCpu: true });
    const snap = ledgerSnapshot();
    expect(snap.some((r) => r.kind === 'ingest')).toBe(true);
    expect(snap.some((r) => r.kind === 'compute')).toBe(true);
  });
});
