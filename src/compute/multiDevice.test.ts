import { describe, expect, it, beforeEach } from 'vitest';
import {
  MultiDeviceTensorRuntime,
  multiDeviceRuntime,
} from './multiDevice';
import { classifyAdapterInfo, hardwareRealityNone } from './hardwareGate';
import { resetComputeFabric } from './fabric';
import { disableWebGpu, resetWebGpuProbe } from './webgpu';
import { clearMeasurements, latestMeasurements } from './measurements';
import { ledgerClear } from './ledger';

describe('G3 hardware gate', () => {
  it('labels SwiftShader as software — no speedup claim', () => {
    const r = classifyAdapterInfo('google / swiftshader');
    expect(r.isSwiftShaderOrSoftware).toBe(true);
    expect(r.hasHardwareGpu).toBe(false);
    expect(r.allowSpeedupClaim).toBe(false);
    expect(r.uiLabel.toLowerCase()).toMatch(/no discrete|software/);
  });

  it('none reality when no adapter', () => {
    const r = hardwareRealityNone('navigator.gpu missing');
    expect(r.gpuClass).toBe('none');
    expect(r.allowSpeedupClaim).toBe(false);
  });
});

describe('G3 multi-device API', () => {
  beforeEach(() => {
    resetWebGpuProbe();
    disableWebGpu('test-force-cpu');
    resetComputeFabric();
    clearMeasurements();
    ledgerClear();
    multiDeviceRuntime.setMode('single');
  });

  it('enumerates cpu + webgpu + 2 logical DEMO devices', async () => {
    const rt = new MultiDeviceTensorRuntime();
    const devs = await rt.enumerateDevices();
    const ids = devs.map((d) => d.id);
    expect(ids).toContain('cpu');
    expect(ids).toContain('webgpu');
    expect(ids).toContain('logical:q0');
    expect(ids).toContain('logical:q1');
    expect(devs.filter((d) => d.isSimulated).length).toBe(2);
    expect(rt.getPlacementHints().some((h) => h.op === 'SH_SYNTH')).toBe(true);
  });

  it('demo-dual-logical places TP_ELL_BAND across two logical devices', async () => {
    const rt = new MultiDeviceTensorRuntime();
    await rt.enumerateDevices();
    rt.setMode('demo-dual-logical');
    const places = rt.placeShards('SH_SYNTH', 'TP_ELL_BAND', 2);
    expect(places.length).toBe(2);
    expect(places.every((p) => p.demo)).toBe(true);
    // No GPU in this test → logical queues
    expect(places.map((p) => p.deviceId).sort()).toEqual([
      'logical:q0',
      'logical:q1',
    ]);
  });

  it('runDualEllBand DEMO shards and sums sky', async () => {
    const rt = new MultiDeviceTensorRuntime();
    await rt.enumerateDevices();
    rt.setMode('demo-dual-logical');
    const out = await rt.runDualEllBand({
      ellMax: 4,
      seed: 42,
      forceCpu: true,
    });
    expect(out.grid.length).toBe(out.nTheta * out.nPhi);
    expect(out.report.mode).toBe('demo-dual-logical');
    expect(out.report.hardwareMultiGpu).toBe(false);
    expect(out.report.placements.length).toBe(2);
    expect(out.report.note).toMatch(/DEMO/);
    // Non-trivial energy
    let energy = 0;
    for (let i = 0; i < out.grid.length; i++) energy += out.grid[i]! * out.grid[i]!;
    expect(energy).toBeGreaterThan(0);
  });

  it('runDualPairBlock DEMO shards pairs', async () => {
    const rt = new MultiDeviceTensorRuntime();
    await rt.enumerateDevices();
    rt.setMode('demo-dual-logical');
    const nSeries = 6;
    const tLen = 16;
    const series = new Float32Array(nSeries * tLen);
    for (let i = 0; i < series.length; i++) series[i] = Math.sin(i * 0.3);
    const pairs = new Uint32Array([0, 1, 0, 2, 1, 2, 2, 3]);
    const out = await rt.runDualPairBlock({
      series,
      nSeries,
      tLen,
      pairs,
      maxLag: 2,
    });
    expect(out.scores.length).toBe(4);
    expect(out.report.placements.length).toBe(2);
    expect(out.report.mode).toBe('demo-dual-logical');
  });

  it('single mode does not mark demo placements', async () => {
    const rt = new MultiDeviceTensorRuntime();
    await rt.enumerateDevices();
    rt.setMode('single');
    const places = rt.placeShards('SH_SYNTH', 'TP_ELL_BAND', 2);
    expect(places.length).toBe(1);
    expect(places[0]!.demo).toBe(false);
  });
});

describe('G3 measurements placements', () => {
  beforeEach(() => {
    clearMeasurements();
    ledgerClear();
  });

  it('records placement detail in ring', async () => {
    const { recordGraphMeasurement, latestByPattern } = await import('./measurements');
    recordGraphMeasurement(
      {
        graphId: 'SkyFrame-dual',
        pattern: 'SkyFrame',
        device: 'cpu',
        ms: 12,
        epistemic: 'PHYSICS-BACKED (EXAMPLE)',
        ops: [
          {
            opId: 'sh0',
            opName: 'SH_SYNTH',
            device: 'cpu',
            ms: 12,
            tp: 'TP_ELL_BAND',
            shardCount: 2,
            placements: [
              {
                shardIndex: 0,
                shardCount: 2,
                deviceId: 'logical:q0',
                ms: 6,
                demo: true,
              },
              {
                shardIndex: 1,
                shardCount: 2,
                deviceId: 'logical:q1',
                ms: 6,
                demo: true,
              },
            ],
          },
        ],
        fuseNotes: ['DEMO'],
        at: Date.now(),
        multiDeviceMode: 'demo-dual-logical',
        path: 'main',
      },
      { ledger: true }
    );
    const m = latestByPattern('SkyFrame');
    expect(m?.ops[0]?.placements?.length).toBe(2);
    expect(m?.multiDeviceMode).toBe('demo-dual-logical');
    expect(latestMeasurements(1)[0]?.path).toBe('main');
  });
});
