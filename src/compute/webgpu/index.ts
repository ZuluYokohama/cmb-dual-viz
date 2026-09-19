export {
  probeWebGpu,
  disableWebGpu,
  resetWebGpuProbe,
  getCachedProbe,
  type ComputeDeviceKind,
  type DeviceProbe,
  type WebGpuHandle,
} from './device';
export {
  EPS_SH_ABS,
  EPS_CORR_ABS,
  maxAbsDiff,
  rmsDiff,
  compareVectors,
  type EpsilonReport,
} from './epsilon';
export { runEpsilonGate, getGateState, type GateState } from './gate';
export { shSynthGpu, SH_TILE_WG, SH_REDUCE_WG } from './ops/shSynthGpu';
export {
  correlateLaggedBatchGpu,
  laggedPearsonBatchCpu,
  CORR_WG,
} from './ops/correlateGpu';
