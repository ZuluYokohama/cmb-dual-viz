/**
 * G3 SkyFrame worker — heavy SH + COH + PROJECT off the main thread.
 * Posts transferable ArrayBuffers back to the client.
 */
import {
  adaptiveGridSize,
  drawCoefficients,
  synthesizeGrid,
} from '../../math/sphericalHarmonics';
import { buildCoherence } from '../../math/coherence';
import { projectMollweideRgba } from '../../math/projectMollweide';

export interface SkyWorkerRequest {
  type: 'skyframe';
  id: number;
  ellMax: number;
  seed: number;
  ampScales?: Record<number, number>;
  includeCoh?: boolean;
  cohSeed?: number;
  timePhase?: number;
  drive?: number;
  projectWidth?: number;
  projectHeight?: number;
  showCoherence?: boolean;
  coherenceOpacity?: number;
}

export interface SkyWorkerResponse {
  type: 'skyframe-result';
  id: number;
  nTheta: number;
  nPhi: number;
  Cl: number[];
  gridBuffer: ArrayBuffer;
  cohBuffer: ArrayBuffer | null;
  rgbaBuffer: ArrayBuffer;
  projectWidth: number;
  projectHeight: number;
  ms: number;
  device: 'cpu';
  path: 'worker';
}

export interface SkyWorkerError {
  type: 'skyframe-error';
  id: number;
  message: string;
}

function nowMs(): number {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();
}

self.onmessage = (ev: MessageEvent<SkyWorkerRequest>) => {
  const msg = ev.data;
  if (!msg || msg.type !== 'skyframe') return;
  try {
    const t0 = nowMs();
    const ampScales = msg.ampScales ?? {};
    const { nTheta, nPhi } = adaptiveGridSize(msg.ellMax);
    const { coeffs, Cl } = drawCoefficients(msg.ellMax, msg.seed, ampScales);
    const grid = synthesizeGrid(coeffs, nTheta, nPhi);

    let cohGrid: Float32Array | null = null;
    if (msg.includeCoh ?? true) {
      const field = buildCoherence(
        nTheta,
        nPhi,
        msg.cohSeed ?? 7,
        4,
        msg.timePhase ?? 0,
        msg.drive ?? 0,
        true
      );
      cohGrid = field.grid;
    }

    const pw = msg.projectWidth ?? 320;
    const ph = msg.projectHeight ?? 160;
    const rgba = projectMollweideRgba({
      sky: grid,
      nTheta,
      nPhi,
      width: pw,
      height: ph,
      coh: cohGrid,
      showCoherence: msg.showCoherence ?? !!cohGrid,
      coherenceOpacity: msg.coherenceOpacity ?? 0.45,
    });

    const gridBuffer = grid.buffer.slice(0);
    const rgbaBuffer = rgba.buffer.slice(
      rgba.byteOffset,
      rgba.byteOffset + rgba.byteLength
    );
    const cohBuffer = cohGrid
      ? cohGrid.buffer.slice(0)
      : null;

    const res: SkyWorkerResponse = {
      type: 'skyframe-result',
      id: msg.id,
      nTheta,
      nPhi,
      Cl,
      gridBuffer,
      cohBuffer,
      rgbaBuffer,
      projectWidth: pw,
      projectHeight: ph,
      ms: nowMs() - t0,
      device: 'cpu',
      path: 'worker',
    };

    const transfer: ArrayBuffer[] = [gridBuffer, rgbaBuffer];
    if (cohBuffer) transfer.push(cohBuffer);
    postMessage(res, transfer);
  } catch (err) {
    const res: SkyWorkerError = {
      type: 'skyframe-error',
      id: msg.id,
      message: err instanceof Error ? err.message : String(err),
    };
    postMessage(res);
  }
};
