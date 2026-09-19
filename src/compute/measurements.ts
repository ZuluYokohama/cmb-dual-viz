/**
 * G2/G3 measurement records — per-op / per-graph wall ms, device, TP, shards,
 * optional per-shard placements (multi-logical DEMO).
 */

import type { Epistemic, OpName, TPPolicy } from './types';
import type { LogicalDeviceId, ShardPlacement } from './multiDevice/types';
import { ledgerAppend } from './ledger';

export interface OpMeasurement {
  opId: string;
  opName: OpName | string;
  device: 'cpu' | 'webgpu';
  ms: number;
  tp: TPPolicy;
  shardCount: number;
  epistemic?: Epistemic | string;
  fused?: boolean;
  /** G3: per-shard logical placement when multi-logical */
  placements?: ShardPlacement[];
}

export interface GraphMeasurement {
  graphId: string;
  pattern: 'SkyFrame' | 'IngestConverge' | 'Scrub' | 'other';
  device: 'cpu' | 'webgpu';
  ms: number;
  epistemic: Epistemic | string;
  ops: OpMeasurement[];
  fuseNotes: string[];
  at: number;
  /** G3: worker | main | offscreen */
  path?: 'worker' | 'main' | 'offscreen';
  /** G3: multi-device mode tag */
  multiDeviceMode?: 'single' | 'demo-dual-logical';
}

const RING_MAX = 32;
const ring: GraphMeasurement[] = [];
let listeners: Array<() => void> = [];

export function recordGraphMeasurement(
  m: GraphMeasurement,
  opts?: { ledger?: boolean }
): GraphMeasurement {
  ring.unshift(m);
  if (ring.length > RING_MAX) ring.length = RING_MAX;
  if (opts?.ledger !== false) {
    ledgerAppend({
      kind: 'perf',
      op: m.pattern,
      tp: m.ops[0]?.tp,
      epistemic: m.epistemic,
      device: m.device,
      ms: m.ms,
      detail: {
        graphId: m.graphId,
        pattern: m.pattern,
        fuseNotes: m.fuseNotes,
        path: m.path ?? 'main',
        multiDeviceMode: m.multiDeviceMode ?? 'single',
        ops: m.ops.map((o) => ({
          op: o.opName,
          device: o.device,
          ms: +o.ms.toFixed(3),
          tp: o.tp,
          shards: o.shardCount,
          fused: o.fused ?? false,
          placements: o.placements?.map((p) => ({
            i: p.shardIndex,
            n: p.shardCount,
            deviceId: p.deviceId as LogicalDeviceId,
            ms: p.ms != null ? +p.ms.toFixed(3) : undefined,
            demo: p.demo ?? false,
            note: p.note,
          })),
        })),
      },
    });
  }
  for (const l of listeners) l();
  return m;
}

export function latestMeasurements(n = 8): GraphMeasurement[] {
  return ring.slice(0, n);
}

export function latestByPattern(
  pattern: GraphMeasurement['pattern']
): GraphMeasurement | null {
  return ring.find((m) => m.pattern === pattern) ?? null;
}

export function clearMeasurements(): void {
  ring.length = 0;
  for (const l of listeners) l();
}

export function subscribeMeasurements(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((x) => x !== fn);
  };
}

export function summarizeOps(ops: OpMeasurement[]): string {
  return ops
    .map((o) => {
      const place =
        o.placements && o.placements.length > 1
          ? `[${o.placements.map((p) => p.deviceId).join('+')}]`
          : '';
      return `${o.opName} ${o.ms.toFixed(1)}ms/${o.device}/${o.tp}/×${o.shardCount}${place}`;
    })
    .join(' · ');
}
