/**
 * SH_SYNTH GPU op — TP_ELL_BAND (dispatch Z) + nested TP_PIX_TILE (8×8).
 */

import {
  type HarmonicCoeff,
  normFactor,
} from '../../../math/sphericalHarmonics';
import {
  SH_REDUCE_WG,
  SH_REDUCE_WGSL,
  SH_SYNTH_BAND_WGSL,
  SH_TILE_WG,
} from '../kernels/shSynth.wgsl';
import type { WebGpuHandle } from '../device';

function packCoeffs(coeffs: HarmonicCoeff[]): Float32Array {
  const out = new Float32Array(coeffs.length * 4);
  for (let i = 0; i < coeffs.length; i++) {
    const c = coeffs[i]!;
    out[i * 4] = c.ell;
    out[i * 4 + 1] = c.m;
    out[i * 4 + 2] = c.a;
    out[i * 4 + 3] = normFactor(c.ell, c.m);
  }
  return out;
}

function chooseBands(ellMax: number): number {
  if (ellMax <= 8) return 1;
  if (ellMax <= 16) return 2;
  if (ellMax <= 32) return 4;
  return 8;
}

async function readBuffer(device: GPUDevice, src: GPUBuffer, bytes: number): Promise<Float32Array> {
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

export interface ShSynthGpuResult {
  grid: Float32Array;
  nTheta: number;
  nPhi: number;
  nBands: number;
  ms: number;
  device: 'webgpu';
}

/** Synthesize a spherical-harmonic grid on the selected WebGPU device. */
export async function shSynthGpu(
  handle: WebGpuHandle,
  coeffs: HarmonicCoeff[],
  nTheta: number,
  nPhi: number
): Promise<ShSynthGpuResult> {
  const t0 = performance.now();
  const { device } = handle;
  const nPix = nTheta * nPhi;
  const packed = packCoeffs(coeffs);
  let ellMax = 0;
  for (const c of coeffs) if (c.ell > ellMax) ellMax = c.ell;
  const nBands = Math.min(chooseBands(ellMax), Math.max(1, ellMax - 1));
  const bandEll0 = 2;
  const bandEll1 = ellMax;

  const paramsData = new Uint32Array([
    nTheta,
    nPhi,
    ellMax,
    coeffs.length,
    nBands,
    bandEll0,
    bandEll1,
    0,
  ]);

  const uniformBuf = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(uniformBuf, 0, paramsData);

  const coeffBuf = device.createBuffer({
    size: Math.max(16, packed.byteLength),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  if (packed.byteLength) device.queue.writeBuffer(coeffBuf, 0, packed.slice());

  const partialBuf = device.createBuffer({
    size: nBands * nPix * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const skyBuf = device.createBuffer({
    size: nPix * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  const bandModule = device.createShaderModule({ code: SH_SYNTH_BAND_WGSL });
  const reduceModule = device.createShaderModule({ code: SH_REDUCE_WGSL });

  const bandPipe = device.createComputePipeline({
    layout: 'auto',
    compute: { module: bandModule, entryPoint: 'main' },
  });
  const reducePipe = device.createComputePipeline({
    layout: 'auto',
    compute: { module: reduceModule, entryPoint: 'main' },
  });

  const bandBg = device.createBindGroup({
    layout: bandPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuf } },
      { binding: 1, resource: { buffer: coeffBuf } },
      { binding: 2, resource: { buffer: partialBuf } },
    ],
  });

  const reduceParams = new Uint32Array([nPix, nBands, 0, 0]);
  const reduceUniform = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(reduceUniform, 0, reduceParams);

  const reduceBg = device.createBindGroup({
    layout: reducePipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: reduceUniform } },
      { binding: 1, resource: { buffer: partialBuf } },
      { binding: 2, resource: { buffer: skyBuf } },
    ],
  });

  const enc = device.createCommandEncoder();
  {
    const pass = enc.beginComputePass();
    pass.setPipeline(bandPipe);
    pass.setBindGroup(0, bandBg);
    pass.dispatchWorkgroups(
      Math.ceil(nPhi / SH_TILE_WG),
      Math.ceil(nTheta / SH_TILE_WG),
      nBands
    );
    pass.end();
  }
  {
    const pass = enc.beginComputePass();
    pass.setPipeline(reducePipe);
    pass.setBindGroup(0, reduceBg);
    pass.dispatchWorkgroups(Math.ceil(nPix / SH_REDUCE_WG));
    pass.end();
  }
  device.queue.submit([enc.finish()]);

  const grid = await readBuffer(device, skyBuf, nPix * 4);

  uniformBuf.destroy();
  coeffBuf.destroy();
  partialBuf.destroy();
  skyBuf.destroy();
  reduceUniform.destroy();

  return {
    grid,
    nTheta,
    nPhi,
    nBands,
    ms: performance.now() - t0,
    device: 'webgpu',
  };
}

export { SH_TILE_WG, SH_REDUCE_WG };
