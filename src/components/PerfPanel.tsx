import { useEffect, useState } from 'react';
import {
  latestMeasurements,
  subscribeMeasurements,
  summarizeOps,
  type GraphMeasurement,
} from '../compute/measurements';
import type {
  HardwareReality,
  LogicalDevice,
  MultiDeviceMode,
} from '../compute';

interface Props {
  hardware?: HardwareReality | null;
  devices?: LogicalDevice[];
  mode?: MultiDeviceMode;
  onModeChange?: (m: MultiDeviceMode) => void;
  workerPath?: boolean;
}

/** G2/G3 measurements — per-graph / per-op wall ms, device, TP, shards, placements. */
export function PerfPanel({
  hardware = null,
  devices = [],
  mode = 'single',
  onModeChange,
  workerPath = false,
}: Props) {
  const [rows, setRows] = useState<GraphMeasurement[]>(() => latestMeasurements(6));

  useEffect(
    () => subscribeMeasurements(() => setRows(latestMeasurements(6))),
    []
  );

  const latest = rows[0] ?? null;

  return (
    <section className="perf-panel" aria-label="Compute measurements">
      <h3>
        <span className="badge badge-derived">G3</span> Scale / Measurements
      </h3>

      <div className="perf-hw-gate" data-hw={hardware?.gpuClass ?? 'none'}>
        <strong>Hardware gate:</strong>{' '}
        {hardware?.uiLabel ??
          'Probing… — no invented ≥2× speedup until discrete GPU measured'}
      </div>

      {devices.length > 0 ? (
        <ul className="perf-devices">
          {devices.map((d) => (
            <li key={d.id}>
              <span
                className="device-pill"
                data-device={d.kind === 'webgpu' ? 'webgpu' : d.isSimulated ? 'logical' : 'cpu'}
              >
                {d.id}
              </span>
              {d.label}
              {d.isSimulated ? ' · DEMO' : ''}
              {!d.available ? ' · offline' : ''}
            </li>
          ))}
        </ul>
      ) : null}

      {onModeChange ? (
        <label className="perf-mode">
          <input
            type="checkbox"
            checked={mode === 'demo-dual-logical'}
            onChange={(e) =>
              onModeChange(e.target.checked ? 'demo-dual-logical' : 'single')
            }
          />{' '}
          DEMO dual-logical TP (CPU+WebGPU or q0+q1) — not multi-GPU HW
        </label>
      ) : null}

      <p className="hint">
        Path: {latest?.path ?? (workerPath ? 'worker' : 'main')}
        {workerPath ? ' (Worker API available)' : ''} · mode: {mode}
      </p>

      {latest ? (
        <div className="perf-latest">
          <div className="perf-graph-line">
            <span className="perf-pattern">{latest.pattern}</span>
            <span className="device-pill" data-device={latest.device}>
              {latest.device}
            </span>
            {latest.path ? (
              <span className="perf-path">{latest.path}</span>
            ) : null}
            {latest.multiDeviceMode === 'demo-dual-logical' ? (
              <span className="perf-demo">DEMO dual</span>
            ) : null}
            <span className="perf-ms">{latest.ms.toFixed(1)} ms</span>
          </div>
          <ul className="perf-ops">
            {latest.ops.map((o) => (
              <li key={o.opId}>
                <code>{o.opName}</code>
                <span>{o.ms.toFixed(1)} ms</span>
                <span className="device-pill" data-device={o.device}>
                  {o.device}
                </span>
                <span className="perf-tp">{o.tp}</span>
                <span className="perf-shards">×{o.shardCount}</span>
                {o.fused ? <span className="perf-fused">fuse</span> : null}
                {o.placements && o.placements.length > 0 ? (
                  <span className="perf-place">
                    {o.placements
                      .map(
                        (p) =>
                          `${p.deviceId}${p.ms != null ? `@${p.ms.toFixed(0)}ms` : ''}${p.demo ? '*' : ''}`
                      )
                      .join(' | ')}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          {latest.fuseNotes.length > 0 ? (
            <p className="hint perf-fuse-note">{latest.fuseNotes[0]}</p>
          ) : null}
        </div>
      ) : (
        <p className="hint">No graph runs yet — synthesize or scrub to record.</p>
      )}
      {rows.length > 1 ? (
        <details className="perf-history">
          <summary>Recent ({rows.length})</summary>
          <ul>
            {rows.slice(1).map((r, i) => (
              <li key={`${r.graphId}-${r.at}-${i}`}>
                <span className="perf-pattern">{r.pattern}</span>{' '}
                {r.ms.toFixed(1)} ms / {r.device}
                {r.path ? ` / ${r.path}` : ''}
                <div className="hint">{summarizeOps(r.ops)}</div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <p className="hint">
        SwiftShader ≠ hardware GPU — no invented ≥2× claim. * = DEMO/logical placement.
      </p>
    </section>
  );
}
