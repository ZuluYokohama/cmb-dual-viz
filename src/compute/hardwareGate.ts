/**
 * G3 hardware gate — classify WebGPU adapter reality.
 * SwiftShader / software adapters are NOT discrete GPUs.
 * Never invent ≥2× speedup claims from software adapters.
 */

export type GpuHardwareClass =
  | 'discrete'
  | 'integrated'
  | 'software'
  | 'unknown'
  | 'none';

export interface HardwareReality {
  /** At least one real (non-software) GPU adapter detected */
  hasHardwareGpu: boolean;
  /** Adapter looks like SwiftShader / lavapipe / llvmpipe / etc. */
  isSwiftShaderOrSoftware: boolean;
  gpuClass: GpuHardwareClass;
  adapterInfo: string;
  /** Short UI sentence — honest about box reality */
  uiLabel: string;
  /** Never claim multi-device HW speedup when false */
  allowSpeedupClaim: boolean;
}

const SOFTWARE_RE =
  /swiftshader|lavapipe|llvmpipe|softpipe|microsoft basic render|cpu|software|swift.?shader/i;

export function classifyAdapterInfo(info: string | undefined | null): HardwareReality {
  const adapterInfo = (info ?? '').trim() || '(no adapter info)';
  if (!info || !info.trim() || info === 'webgpu') {
    return {
      hasHardwareGpu: false,
      isSwiftShaderOrSoftware: false,
      gpuClass: 'unknown',
      adapterInfo,
      uiLabel: 'WebGPU adapter present — class unknown; no ≥2× speedup claim',
      allowSpeedupClaim: false,
    };
  }
  if (SOFTWARE_RE.test(info)) {
    return {
      hasHardwareGpu: false,
      isSwiftShaderOrSoftware: true,
      gpuClass: 'software',
      adapterInfo,
      uiLabel: `No discrete GPU — software adapter (${adapterInfo}). DEMO multi-logical only; no ≥2× speedup claim`,
      allowSpeedupClaim: false,
    };
  }
  // Heuristic: vendor strings that usually mean real silicon
  const discrete =
    /nvidia|amd|radeon|geforce|rtx|gtx|arc|intel.*arc/i.test(info) &&
    !/uhd|iris|hd graphics/i.test(info);
  const integrated = /intel|iris|uhd|apple|mali|adreno|metal/i.test(info);
  const gpuClass: GpuHardwareClass = discrete
    ? 'discrete'
    : integrated
      ? 'integrated'
      : 'unknown';
  const hasHardwareGpu = gpuClass === 'discrete' || gpuClass === 'integrated';
  return {
    hasHardwareGpu,
    isSwiftShaderOrSoftware: false,
    gpuClass,
    adapterInfo,
    uiLabel: hasHardwareGpu
      ? `Hardware GPU (${gpuClass}): ${adapterInfo}`
      : `Adapter (${adapterInfo}) — treat as unverified; no invented ≥2× claim`,
    allowSpeedupClaim: false, // still require measured ledger evidence
  };
}

export function hardwareRealityNone(reason: string): HardwareReality {
  return {
    hasHardwareGpu: false,
    isSwiftShaderOrSoftware: false,
    gpuClass: 'none',
    adapterInfo: reason,
    uiLabel: `No WebGPU — CPU only (${reason}). Multi-device API is logical/DEMO only`,
    allowSpeedupClaim: false,
  };
}
