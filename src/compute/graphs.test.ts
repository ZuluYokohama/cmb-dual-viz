import { describe, expect, it, beforeEach } from 'vitest';
import {
  buildSkyFrameGraph,
  buildIngestConvergeGraph,
  buildScrubGraph,
  scrubShouldResynthSh,
  graphOpNames,
  SCRUB_INVALIDATE,
  runSkyFrame,
  runScrub,
  runIngestConverge,
} from './graphs';
import { cpuRuntime } from './cpuRuntime';
import { exampleCl } from '../math/sphericalHarmonics';
import {
  clearMeasurements,
  latestMeasurements,
  latestByPattern,
  recordGraphMeasurement,
} from './measurements';
import { ledgerClear, ledgerSnapshot } from './ledger';
import { OP_DESCS } from './types';

describe('G2 graph fusion', () => {
  beforeEach(() => {
    clearMeasurements();
    ledgerClear();
  });

  it('SkyFrame fuse order SH → COH → PROJECT', () => {
    const g = buildSkyFrameGraph({ includeCoh: true });
    expect(graphOpNames(g)).toEqual([
      'SH_SYNTH',
      'COH_FIELD',
      'PROJECT_MOLLWEIDE',
    ]);
    expect(g.fuse?.[0]?.ops).toContain('PROJECT_MOLLWEIDE');
    expect(OP_DESCS.PROJECT_MOLLWEIDE.tp).toBe('TP_PIX_TILE');
  });

  it('IngestConverge fuse order parse→embed→layout→correlate→smith', () => {
    const g = buildIngestConvergeGraph();
    expect(graphOpNames(g)).toEqual([
      'INGEST_PARSE',
      'EMBED_HASH',
      'MEANING_LAYOUT',
      'CORRELATE_BATCH',
      'SMITH_MAP',
    ]);
  });

  it('Scrub invalidates COH+SMITH only; no SH resynth on timePhase', () => {
    const g = buildScrubGraph();
    expect(graphOpNames(g)).toEqual(['COH_FIELD', 'SMITH_MAP']);
    expect(graphOpNames(g)).not.toContain('SH_SYNTH');
    expect(SCRUB_INVALIDATE).toEqual(['COH_FIELD', 'SMITH_MAP']);
    expect(scrubShouldResynthSh({ timePhase: true })).toBe(false);
    expect(scrubShouldResynthSh({ cohSeed: true })).toBe(false);
    expect(scrubShouldResynthSh({ seed: true })).toBe(true);
    expect(scrubShouldResynthSh({ ellMax: true })).toBe(true);
  });

  it('runSkyFrame records per-op measurements + ledger perf', async () => {
    const r = await runSkyFrame({
      ellMax: 4,
      seed: 42,
      forceCpu: true,
      ledger: true,
      projectWidth: 48,
      projectHeight: 24,
      includeCoh: true,
    });
    expect(r.rgba.length).toBe(48 * 24 * 4);
    expect(r.measurement.pattern).toBe('SkyFrame');
    expect(r.measurement.ops.map((o) => o.opName)).toEqual([
      'SH_SYNTH',
      'COH_FIELD',
      'PROJECT_MOLLWEIDE',
    ]);
    for (const o of r.measurement.ops) {
      expect(o.ms).toBeGreaterThanOrEqual(0);
      expect(o.shardCount).toBeGreaterThanOrEqual(1);
      expect(['cpu', 'webgpu']).toContain(o.device);
      expect(o.tp).toBeTruthy();
    }
    expect(latestByPattern('SkyFrame')?.graphId).toBe('SkyFrame');
    const snap = ledgerSnapshot();
    expect(snap.some((x) => x.kind === 'perf' && x.op === 'SkyFrame')).toBe(true);
  });

  it('runScrub never resynthesizes SH', () => {
    const r = runScrub({
      nTheta: 12,
      nPhi: 24,
      cohSeed: 3,
      timePhase: 0.2,
      z: { re: 1.1, im: -0.2 },
      matchPull: 0.3,
      source: 'dual-thread',
      mappingNote: 'test scrub',
      ledger: true,
    });
    expect(r.shResynthesized).toBe(false);
    expect(r.measurement.ops.map((o) => o.opName)).toEqual([
      'COH_FIELD',
      'SMITH_MAP',
    ]);
    expect(r.measurement.ops.every((o) => o.opName !== 'SH_SYNTH')).toBe(true);
  });

  it('measurement record shape', () => {
    recordGraphMeasurement(
      {
        graphId: 't',
        pattern: 'other',
        device: 'cpu',
        ms: 1.5,
        epistemic: 'ASSURANCE',
        ops: [
          {
            opId: 'a',
            opName: 'LEDGER_APPEND',
            device: 'cpu',
            ms: 1.5,
            tp: 'TP_NONE',
            shardCount: 1,
          },
        ],
        fuseNotes: [],
        at: Date.now(),
      },
      { ledger: true }
    );
    expect(latestMeasurements(1)[0]?.ms).toBe(1.5);
  });


  it('cpuRuntime dispatches PROJECT_MOLLWEIDE / EMBED_HASH / MEANING_LAYOUT / INGEST_PARSE', () => {
    const sky = new Float32Array(6 * 12);
    const proj = cpuRuntime.runOp({
      id: 'p',
      op: OP_DESCS.PROJECT_MOLLWEIDE,
      params: { sky, nTheta: 6, nPhi: 12, width: 16, height: 8 },
    });
    expect(proj.opName).toBe('PROJECT_MOLLWEIDE');
    expect((proj.outputs[0]!.data as Uint8ClampedArray).length).toBe(16 * 8 * 4);

    const ingest = cpuRuntime.runOp({
      id: 'i',
      op: OP_DESCS.INGEST_PARSE,
      params: {
        datasets: [
          {
            id: 'd1',
            name: 't',
            type: 'text',
            epistemic: 'DERIVED/MEANING-MAP',
            enabled: true,
            format: 'txt',
            claims: [{ text: 'hello CMB anisotropy' }],
            ingestedAt: Date.now(),
          },
        ],
      },
    });
    expect(ingest.opName).toBe('INGEST_PARSE');

    const embed = cpuRuntime.runOp({
      id: 'e',
      op: OP_DESCS.EMBED_HASH,
      params: { texts: ['cosmic microwave background'] },
    });
    expect(embed.opName).toBe('EMBED_HASH');
    expect(embed.outputs[0]!.meta.shape[1]).toBeGreaterThan(0);

    const layout = cpuRuntime.runOp({
      id: 'l',
      op: OP_DESCS.MEANING_LAYOUT,
      params: {
        datasets: [],
        convergence: {
          ellFocus: 4,
          ellMax: 8,
          Cl: [0, 0, 1, 1, 1, 1, 1, 1, 1],
          coherenceZ: 0,
          coherenceScore: 0,
          timePhase: 0,
        },
      },
    });
    // fix Cl below
    expect(layout.opName).toBe('MEANING_LAYOUT');
  });

  it('runIngestConverge uses OpGraph ops + records path', async () => {
    const Cl: number[] = [];
    for (let ell = 0; ell <= 16; ell++) Cl.push(exampleCl(ell));
    const r = await runIngestConverge({
      datasets: [
        {
          id: 'ds-test',
          name: 'test-series',
          type: 'csv',
          epistemic: 'DERIVED/MEANING-MAP',
          enabled: true,
          format: 'csv',
          series: Array.from({ length: 24 }, (_, i) => ({
            t: i,
            value: Math.sin(i / 3),
          })),
          ingestedAt: Date.now(),
        },
      ],
      convergence: {
        ellFocus: 4,
        ellMax: 8,
        Cl,
        coherenceZ: 0.5,
        coherenceScore: 0.2,
        timePhase: 0.1,
      },
      seed: {
        id: 'seed-thread-a',
        label: 'Thread A',
        kind: 'thread-a-ell',
        series: Cl.slice(2, 14),
        epistemic: 'PHYSICS-BACKED (EXAMPLE)',
      },
      thread: {
        Cl,
        ellFocus: 4,
        ellMax: 8,
        coherenceScore: 0.2,
        coherenceZ: 0.5,
        timePhase: 0.1,
        seriesDriveHistory: [0.1, 0.2, 0.15],
      },
      forceCpu: true,
      preferWorker: false,
      ledger: true,
    });
    expect(r.measurement.pattern).toBe('IngestConverge');
    expect(r.measurement.ops.map((o) => o.opName)).toEqual([
      'INGEST_PARSE',
      'EMBED_HASH',
      'MEANING_LAYOUT',
      'CORRELATE_BATCH',
      'SMITH_MAP',
    ]);
    expect(r.path).toBe('main');
    expect(r.correlate.scanned).toBeGreaterThan(0);
    expect(latestByPattern('IngestConverge')?.path).toBe('main');
  });

});
