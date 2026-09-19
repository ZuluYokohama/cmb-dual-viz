/**
 * CORRELATE_BATCH GPU core — TP_PAIR_BLOCK + nested TP_LAG_SLICE.
 * Computes best lagged Pearson per pair (signed score + lag).
 */

import {
  CORR_WG,
  CORRELATE_PAIR_LAG_WGSL,
} from '../kernels/correlate.wgsl';
import type { WebGpuHandle } from '../device';

export interface CorrelateGpuPairResult {
  scores: Float32Array;
  lags: Int32Array;
  nPairs: number;
  ms: number;
  device: 'webgpu';
}

/** CPU reference for ε-gate — same lag/pearson semantics as WGSL. */
export function laggedPearsonBatchCpu(
  series: Float32Array,
  nSeries: number,
  tLen: number,
  pairs: Uint32Array,
  maxLag: number
): { scores: Float32Array; lags: Int32Array } {
  const nPairs = pairs.length / 2;
  const scores = new Float32Array(nPairs);
  const lags = new Int32Array(nPairs);

  const pearson = (ia: number, ib: number, a0: number, b0: number, n: number): number => {
    if (n < 4) return 0;
    let ma = 0;
    let mb = 0;
    for (let k = 0; k < n; k++) {
      ma += series[ia * tLen + a0 + k]!;
      mb += series[ib * tLen + b0 + k]!;
    }
    ma /= n;
    mb /= n;
    let num = 0;
    let da = 0;
    let db = 0;
    for (let k = 0; k < n; k++) {
      const xa = series[ia * tLen + a0 + k]! - ma;
      const xb = series[ib * tLen + b0 + k]! - mb;
      num += xa * xb;
      da += xa * xa;
      db += xb * xb;
    }
    const den = Math.sqrt(da * db);
    if (den < 1e-12) return 0;
    return num / den;
  };

  for (let p = 0; p < nPairs; p++) {
    const ia = pairs[p * 2]!;
    const ib = pairs[p * 2 + 1]!;
    const lim = Math.min(maxLag, Math.floor(tLen / 3));
    let bestAbs = -1;
    let bestSigned = 0;
    let bestLag = 0;
    for (let lag = -lim; lag <= lim; lag++) {
      let a0: number;
      let b0: number;
      let n: number;
      if (lag >= 0) {
        a0 = 0;
        b0 = lag;
        n = tLen - lag;
      } else {
        a0 = -lag;
        b0 = 0;
        n = tLen + lag;
      }
      const s = pearson(ia, ib, a0, b0, n);
      const ab = Math.abs(s);
      if (ab > bestAbs) {
        bestAbs = ab;
        bestSigned = s;
        bestLag = lag;
      }
    }
    scores[p] = bestSigned;
    lags[p] = bestLag;
  }
  return { scores, lags };
}

async function readF32(device: GPUDevice, src: GPUBuffer, n: number): Promise<Float32Array> {
  const bytes = n * 4;
  const staging = device.createBuffer({
    size: bytes,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const enc = device.createCommandEncoder();
  enc.copyBufferToBuffer(src, 0, staging, 0, bytes);
  device.queue.submit([enc.finish()]);
  await staging.mapAsync(GPUMapMode.READ);
  const copy = new Float32Array(staging.getMappedRange().slice(0));
  staging.unmap();
  staging.destroy();
  return copy;
}

async function readI32(device: GPUDevice, src: GPUBuffer, n: number): Promise<Int32Array> {
  const bytes = n * 4;
  const staging = device.createBuffer({
    size: bytes,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const enc = device.createCommandEncoder();
  enc.copyBufferToBuffer(src, 0, staging, 0, bytes);
  device.queue.submit([enc.finish()]);
  await staging.mapAsync(GPUMapMode.READ);
  const copy = new Int32Array(staging.getMappedRange().slice(0));
  staging.unmap();
  staging.destroy();
  return copy;
}

export async function correlateLaggedBatchGpu(
  handle: WebGpuHandle,
  series: Float32Array,
  nSeries: number,
  tLen: number,
  pairs: Uint32Array,
  maxLag: number
): Promise<CorrelateGpuPairResult> {
  const t0 = performance.now();
  const { device } = handle;
  const nPairs = pairs.length / 2;
  if (nPairs === 0) {
    return {
      scores: new Float32Array(0),
      lags: new Int32Array(0),
      nPairs: 0,
      ms: 0,
      device: 'webgpu',
    };
  }

  const paramsData = new Uint32Array([nPairs, tLen, maxLag, nSeries]);
  const uniformBuf = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(uniformBuf, 0, paramsData);

  const seriesBuf = device.createBuffer({
    size: Math.max(4, series.byteLength),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(seriesBuf, 0, series);

  const pairBuf = device.createBuffer({
    size: Math.max(8, pairs.byteLength),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(pairBuf, 0, pairs);

  const scoreBuf = device.createBuffer({
    size: nPairs * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const lagBuf = device.createBuffer({
    size: nPairs * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  const module = device.createShaderModule({ code: CORRELATE_PAIR_LAG_WGSL });
  const pipe = device.createComputePipeline({
    layout: 'auto',
    compute: { module, entryPoint: 'main' },
  });
  const bg = device.createBindGroup({
    layout: pipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuf } },
      { binding: 1, resource: { buffer: seriesBuf } },
      { binding: 2, resource: { buffer: pairBuf } },
      { binding: 3, resource: { buffer: scoreBuf } },
      { binding: 4, resource: { buffer: lagBuf } },
    ],
  });

  const enc = device.createCommandEncoder();
  const pass = enc.beginComputePass();
  pass.setPipeline(pipe);
  pass.setBindGroup(0, bg);
  // One workgroup per pair (TP_PAIR_BLOCK)
  pass.dispatchWorkgroups(nPairs);
  pass.end();
  device.queue.submit([enc.finish()]);

  const scores = await readF32(device, scoreBuf, nPairs);
  const lags = await readI32(device, lagBuf, nPairs);

  uniformBuf.destroy();
  seriesBuf.destroy();
  pairBuf.destroy();
  scoreBuf.destroy();
  lagBuf.destroy();

  return {
    scores,
    lags,
    nPairs,
    ms: performance.now() - t0,
    device: 'webgpu',
  };
}

export { CORR_WG };
