/**
 * WebGPU feature detection + device acquisition (G1).
 * Automatic CPU fallback when unavailable.
 */

export type ComputeDeviceKind = 'cpu' | 'webgpu';

export interface WebGpuHandle {
  adapter: GPUAdapter;
  device: GPUDevice;
  adapterInfo?: string;
}

export interface DeviceProbe {
  available: boolean;
  reason: string;
  handle: WebGpuHandle | null;
}

let cached: DeviceProbe | null = null;
let disabledReason: string | null = null;

/** Force-disable GPU path (ε-gate fail or tests). */
export function disableWebGpu(reason: string): void {
  disabledReason = reason;
  cached = {
    available: false,
    reason,
    handle: null,
  };
}

export function resetWebGpuProbe(): void {
  disabledReason = null;
  cached = null;
}

export function isWebGpuForcedOff(): boolean {
  return disabledReason != null;
}

/**
 * Feature-detect and request a WebGPU device.
 * Safe in Node (no navigator.gpu) — returns available:false.
 */
export async function probeWebGpu(force = false): Promise<DeviceProbe> {
  if (!force && cached) return cached;
  if (disabledReason) {
    cached = { available: false, reason: disabledReason, handle: null };
    return cached;
  }

  const nav =
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & { gpu?: GPU })
      : undefined;
  if (!nav?.gpu) {
    cached = {
      available: false,
      reason: 'navigator.gpu missing (Node or unsupported browser)',
      handle: null,
    };
    return cached;
  }

  try {
    const adapter = await nav.gpu.requestAdapter({
      powerPreference: 'high-performance',
    });
    if (!adapter) {
      cached = {
        available: false,
        reason: 'requestAdapter() returned null',
        handle: null,
      };
      return cached;
    }
    const device = await adapter.requestDevice({
      label: 'cmb-dual-viz-g1',
    });
    device.lost.then((info) => {
      cached = {
        available: false,
        reason: `GPUDevice lost: ${info.message}`,
        handle: null,
      };
    });
    const infoBits: string[] = [];
    try {
      const ai = adapter.info;
      if (ai) {
        infoBits.push(
          [ai.vendor, ai.architecture, ai.device, ai.description]
            .filter(Boolean)
            .join(' / ')
        );
      }
    } catch {
      /* adapter.info optional */
    }
    cached = {
      available: true,
      reason: 'ok',
      handle: {
        adapter,
        device,
        adapterInfo: infoBits.join('') || 'webgpu',
      },
    };
    return cached;
  } catch (err) {
    cached = {
      available: false,
      reason: err instanceof Error ? err.message : String(err),
      handle: null,
    };
    return cached;
  }
}

export function getCachedProbe(): DeviceProbe | null {
  return cached;
}
