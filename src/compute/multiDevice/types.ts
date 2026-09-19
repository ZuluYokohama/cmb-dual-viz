/**
 * G3 multi-device TensorRuntime façade types.
 * Ready for 2+ logical devices even when the box only has SwiftShader + CPU.
 * Simulated dual-logical mode is DEMO/logical — not fake hardware.
 */

import type { Epistemic, OpName, OpNode, OpResult, TPPolicy, TensorHandle } from '../types';

export type LogicalDeviceKind = 'cpu' | 'webgpu' | 'logical';

/** Stable ids — real backends + DEMO logical queues */
export type LogicalDeviceId =
  | 'cpu'
  | 'webgpu'
  | 'logical:q0'
  | 'logical:q1';

export type MultiDeviceMode = 'single' | 'demo-dual-logical';

export interface LogicalDevice {
  id: LogicalDeviceId;
  kind: LogicalDeviceKind;
  label: string;
  /** True only for real discrete/integrated silicon */
  isHardwareGpu: boolean;
  /** True when DEMO/logical simulation (not a second physical adapter) */
  isSimulated: boolean;
  adapterInfo?: string;
  available: boolean;
}

export interface PlacementHint {
  op: OpName;
  tp: TPPolicy;
  /** Preferred device order */
  preferred: LogicalDeviceId[];
  /** How to shard when mode = demo-dual-logical */
  dualPolicy: 'none' | 'split-tp' | 'replicate';
  note?: string;
}

export interface ShardPlacement {
  shardIndex: number;
  shardCount: number;
  deviceId: LogicalDeviceId;
  /** Wall ms for this shard when measured */
  ms?: number;
  note?: string;
  /** DEMO marker when placement is logical, not HW multi-GPU */
  demo?: boolean;
}

export interface MultiDeviceOpResult extends OpResult {
  placements: ShardPlacement[];
  mode: MultiDeviceMode;
}

export interface MultiDeviceRuntime {
  readonly mode: MultiDeviceMode;
  setMode(mode: MultiDeviceMode): void;
  enumerateDevices(): Promise<LogicalDevice[]>;
  getDevicesSync(): LogicalDevice[];
  getPlacementHints(): PlacementHint[];
  placeShards(op: OpName, tp: TPPolicy, shardCount: number): ShardPlacement[];
  runOp(
    node: OpNode,
    inputs?: TensorHandle[]
  ): Promise<MultiDeviceOpResult> | MultiDeviceOpResult;
}

export interface DualShardReport {
  op: OpName;
  tp: TPPolicy;
  mode: MultiDeviceMode;
  placements: ShardPlacement[];
  totalMs: number;
  epistemic: Epistemic;
  /** Always false on software adapters / DEMO mode */
  hardwareMultiGpu: boolean;
  note: string;
}
