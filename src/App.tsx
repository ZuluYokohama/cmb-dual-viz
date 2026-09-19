import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SkyCanvas } from './components/SkyCanvas';
import { PowerSpectrum } from './components/PowerSpectrum';
import { Controls } from './components/Controls';
import { CoherenceMetrics } from './components/CoherenceMetrics';
import { UlamPanel } from './components/UlamPanel';
import { MeaningMap } from './components/MeaningMap';
import { IngestPanel } from './components/IngestPanel';
import { NodeInspector } from './components/NodeInspector';
import { SmithChart } from './components/SmithChart';
import { CorrelateSearch } from './components/CorrelateSearch';
import { PerfPanel } from './components/PerfPanel';
import {
  fabricCoherence,
  ledgerAppend,
  ledgerAppendDressing,
  initComputeFabric,
  scrubShouldResynthSh,
  runSkyFrameOffthread,
  multiDeviceRuntime,
  recordGraphMeasurement,
  workerPathAvailable,
  type ComputeDeviceKind,
  type HardwareReality,
  type LogicalDevice,
  type MultiDeviceMode,
} from './compute';
import {
  buildMeaningGraph,
  skyHighlightsFromNodes,
} from './math/meaningMap';
import {
  buildSmithState,
  dualThreadToZ,
  nodeFeaturesToZ,
  zToGamma,
  type Complex,
  type TransferArc,
} from './math/smith';
import type { CorrelateHit } from './math/correlates';
import {
  applyDressingTransition,
  bulkMarkDressedCandidate,
  nodeIdsFromCorrelateHits,
  type DressingState,
  type DressingStateMap,
} from './math/dressing';
import { DressingChecklist } from './components/DressingChecklist';
import type {
  IngestedDataset,
  IngestLogEntry,
  MeaningEdge,
  MeaningGraph,
  MeaningNode,
} from './ingest/types';
import { genDemoClaims, genExampleCl, genSyntheticGcpLike } from './math/generators';

const TRAIL_MAX = 48;

export default function App() {
  const [ellMax, setEllMax] = useState(16);
  const [ellFocus, setEllFocus] = useState(8);
  const [seed, setSeed] = useState(42);
  const [ampScales, setAmpScales] = useState<Record<number, number>>({
    2: 1,
    3: 1,
    4: 1,
    5: 1,
    6: 1,
  });
  const [showCoherence, setShowCoherence] = useState(true);
  const [coherenceOpacity, setCoherenceOpacity] = useState(0.45);
  const [cohSeed, setCohSeed] = useState(7);
  const [timePhase, setTimePhase] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [computeDevice, setComputeDevice] = useState<ComputeDeviceKind>('cpu');
  const [gateNote, setGateNote] = useState('probing…');
  const [hardware, setHardware] = useState<HardwareReality | null>(null);
  const [devices, setDevices] = useState<LogicalDevice[]>([]);
  const [mdMode, setMdMode] = useState<MultiDeviceMode>('single');
  const [workerOk, setWorkerOk] = useState(false);
  const [skyRgba, setSkyRgba] = useState<Uint8ClampedArray | null>(null);

  const [cmbGrid, setCmbGrid] = useState<Float32Array | null>(null);
  const [gridShape, setGridShape] = useState({ nTheta: 90, nPhi: 180 });
  const [Cl, setCl] = useState<number[]>([]);
  const [coh, setCoh] = useState<{
    grid: Float32Array;
    nTheta: number;
    nPhi: number;
    score: number;
    nullMean: number;
    nullStd: number;
    zScore: number;
    timePhase: number;
  } | null>(null);

  const analogyFromUrl =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('analogy') === '1';
  const [showAnalogy, setShowAnalogy] = useState(analogyFromUrl);

  const [datasets, setDatasets] = useState<IngestedDataset[]>(() => {
    // Include a series so correlate scan has something to chew on at boot
    return [genDemoClaims(), genExampleCl(48), genSyntheticGcpLike()];
  });
  const [ingestLog, setIngestLog] = useState<IngestLogEntry[]>([
    {
      id: 'log-boot',
      at: Date.now(),
      status: 'accepted',
      source: 'boot',
      message: 'Seeded demo claims + EXAMPLE C_ℓ + GCP-like series (toy)',
    },
  ]);
  const [selectedNode, setSelectedNode] = useState<MeaningNode | null>(null);
  const [gammaTrail, setGammaTrail] = useState<Complex[]>([]);
  const trailPhaseRef = useRef<number | null>(null);
  const [correlateHits, setCorrelateHits] = useState<CorrelateHit[]>([]);
  const [activeHit, setActiveHit] = useState<CorrelateHit | null>(null);
  const [dressingMap, setDressingMap] = useState<DressingStateMap>({});
  const [dressingLog, setDressingLog] = useState<
    { nodeId: string; from: string; to: string; note: string; at: number }[]
  >([]);
  const dressingMapRef = useRef<DressingStateMap>({});
  dressingMapRef.current = dressingMap;
  const driveHistoryRef = useRef<number[]>([]);

  const synthKey = useMemo(
    () => JSON.stringify({ ellMax, seed, ampScales }),
    [ellMax, seed, ampScales]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const gate = await initComputeFabric();
      if (cancelled) return;
      setComputeDevice(gate.device);
      const eps = gate.reports
        .map((r) => `${r.op} maxΔ=${r.maxAbsDiff.toExponential(2)} (ε=${r.eps}) ${r.passed ? 'pass' : 'fail'}`)
        .join('; ');
      const devs = await multiDeviceRuntime.enumerateDevices();
      if (cancelled) return;
      setDevices(devs);
      const hw = multiDeviceRuntime.getHardwareReality();
      setHardware(hw);
      setWorkerOk(workerPathAvailable());
      setGateNote(
        gate.gpuEnabled
          ? `ε-gate pass${eps ? ` · ${eps}` : ''} · ${hw.uiLabel}`
          : `CPU fallback — ${gate.reason}${eps ? ` · ${eps}` : ''} · ${hw.uiLabel}`
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onMdMode = useCallback((m: MultiDeviceMode) => {
    setMdMode(m);
  }, []);

  const resynthesize = useCallback(() => {
    setBusy(true);
    requestAnimationFrame(() => {
      void (async () => {
        try {
          // G3 DEMO dual-logical: shard TP_ELL_BAND, then still run worker/main SkyFrame fuse for COH+PROJECT
          if (multiDeviceRuntime.mode === 'demo-dual-logical') {
            const dual = await multiDeviceRuntime.runDualEllBand({
              ellMax,
              seed,
              ampScales,
            });
            setCmbGrid(dual.grid);
            setCl(dual.Cl);
            setGridShape({ nTheta: dual.nTheta, nPhi: dual.nPhi });
            const anyGpu = dual.report.placements.some((p) => p.deviceId === 'webgpu');
            setComputeDevice(anyGpu ? 'webgpu' : 'cpu');
            recordGraphMeasurement(
              {
                graphId: 'SkyFrame-dual',
                pattern: 'SkyFrame',
                device: anyGpu ? 'webgpu' : 'cpu',
                ms: dual.report.totalMs,
                epistemic: dual.report.epistemic,
                ops: [
                  {
                    opId: 'sh0',
                    opName: 'SH_SYNTH',
                    device: anyGpu ? 'webgpu' : 'cpu',
                    ms: dual.report.totalMs,
                    tp: 'TP_ELL_BAND',
                    shardCount: dual.report.placements.length,
                    epistemic: dual.report.epistemic,
                    fused: true,
                    placements: dual.report.placements,
                  },
                ],
                fuseNotes: [dual.report.note],
                at: Date.now(),
                path: 'main',
                multiDeviceMode: 'demo-dual-logical',
              },
              { ledger: true }
            );
            setSkyRgba(null);
            return;
          }

          const out = await runSkyFrameOffthread({
            ellMax,
            seed,
            ampScales,
            includeCoh: true,
            cohSeed,
            timePhase: 0,
            drive: 0,
            lightMetrics: false,
            projectWidth: 620,
            projectHeight: 280,
            showCoherence,
            coherenceOpacity,
            ledger: true,
            preferWorker: true,
          });
          setCmbGrid(out.grid);
          setCl(out.Cl);
          setGridShape({ nTheta: out.nTheta, nPhi: out.nPhi });
          setComputeDevice(out.device);
          setSkyRgba(out.rgba);
          setWorkerOk(out.path === 'worker' || workerPathAvailable());
          if (out.coh) {
            setCoh({
              grid: out.coh.grid,
              nTheta: out.coh.nTheta,
              nPhi: out.coh.nPhi,
              score: out.coh.score,
              nullMean: out.coh.nullMean,
              nullStd: out.coh.nullStd,
              zScore: out.coh.zScore,
              timePhase: out.coh.timePhase,
            });
          }
        } finally {
          setBusy(false);
        }
      })();
    });
  }, [ellMax, seed, ampScales, cohSeed, showCoherence, coherenceOpacity]);

  useEffect(() => {
    multiDeviceRuntime.setMode(mdMode);
  }, [mdMode]);

  useEffect(() => {
    resynthesize();
  }, [synthKey, mdMode]); 

  const seriesDrive = useMemo(() => {
    for (const ds of datasets) {
      if (!ds.enabled || !ds.series?.length) continue;
      const sorted = [...ds.series].sort((a, b) => a.t - b.t);
      const t0 = sorted[0]!.t;
      const t1 = sorted[sorted.length - 1]!.t;
      const t = t0 + timePhase * Math.max(1e-9, t1 - t0);
      let best = sorted[0]!;
      let bestD = Infinity;
      for (const p of sorted) {
        const d = Math.abs(p.t - t);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      return best.value;
    }
    return 0;
  }, [datasets, timePhase]);

  // Keep short history for Thread B correlate seed / Smith trail drive
  useEffect(() => {
    driveHistoryRef.current = [...driveHistoryRef.current, seriesDrive].slice(-48);
  }, [seriesDrive, timePhase]);

  // SCRUB_GUARD: timePhase/cohSeed must not resynth SH (synthKey owns SH)
  useEffect(() => {
    if (scrubShouldResynthSh({ timePhase: true, cohSeed: true })) {
      throw new Error('scrub must not force SH');
    }
    const { nTheta, nPhi } = gridShape;
    const field = fabricCoherence({
      nTheta,
      nPhi,
      seed: cohSeed,
      Lcoh: 4,
      timePhase,
      drive: seriesDrive,
      lightMetrics: playing,
      ledger: !playing,
    });
    setCoh(field);
  }, [cohSeed, timePhase, seriesDrive, gridShape, playing]);

  useEffect(() => {
    if (playing) return;
    const { nTheta, nPhi } = gridShape;
    const field = fabricCoherence({
      nTheta,
      nPhi,
      seed: cohSeed,
      Lcoh: 4,
      timePhase,
      drive: seriesDrive,
      lightMetrics: false,
      ledger: true,
    });
    setCoh(field);
  }, [cohSeed, playing]); 

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setTimePhase((p) => (p + dt * 0.08) % 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      setPlaying((p) => !p);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    setEllFocus((f) => Math.min(f, ellMax));
  }, [ellMax]);

  const onAmpScale = (ell: number, v: number) => {
    setAmpScales((prev) => ({ ...prev, [ell]: v }));
  };

  const baseGraph = useMemo(
    () =>
      buildMeaningGraph(datasets, {
        ellFocus: Math.min(ellFocus, ellMax),
        ellMax,
        Cl,
        coherenceZ: coh?.zScore ?? 0,
        coherenceScore: coh?.score ?? 0,
        timePhase,
      }),
    [datasets, ellFocus, ellMax, Cl, coh, timePhase]
  );

  // Merge top correlate hits as dashed correlate edges
  const meaningGraph: MeaningGraph = useMemo(() => {
    const edges: MeaningEdge[] = [...baseGraph.edges];
    const nodeIds = new Set(baseGraph.nodes.map((n) => n.id));
    for (const h of correlateHits.slice(0, 6)) {
      const a = h.seedNodeId;
      const b = h.targetNodeId;
      if (!a || !b || !nodeIds.has(a) || !nodeIds.has(b) || a === b) continue;
      const w = Math.min(1, 0.35 + Math.abs(h.zToy) / 8);
      edges.push({ source: a, target: b, weight: w, reason: 'correlate' });
    }
    return { nodes: baseGraph.nodes, edges };
  }, [baseGraph, correlateHits]);

  const highlightIds = useMemo(() => {
    const ids: string[] = [];
    if (activeHit?.seedNodeId) ids.push(activeHit.seedNodeId);
    if (activeHit?.targetNodeId) ids.push(activeHit.targetNodeId);
    return ids;
  }, [activeHit]);

  const highlights = useMemo(
    () => skyHighlightsFromNodes(meaningGraph.nodes, selectedNode?.id ?? null),
    [meaningGraph, selectedNode]
  );

  const meanPulls = useMemo(() => {
    const nodes = meaningGraph.nodes;
    if (!nodes.length) return { a: 0.3, b: 0.3 };
    let a = 0;
    let b = 0;
    for (const n of nodes) {
      a += n.pullA;
      b += n.pullB;
    }
    return { a: a / nodes.length, b: b / nodes.length };
  }, [meaningGraph]);

  const smithState = useMemo(() => {
    // Active correlate hit → blend pair features into z
    if (activeHit) {
      const na = activeHit.seedNodeId
        ? meaningGraph.nodes.find((n) => n.id === activeHit.seedNodeId)
        : null;
      const nb = activeHit.targetNodeId
        ? meaningGraph.nodes.find((n) => n.id === activeHit.targetNodeId)
        : null;
      if (na && nb) {
        const za = nodeFeaturesToZ({
          features: na.features,
          pullA: na.pullA,
          pullB: na.pullB,
          kind: na.kind,
        });
        const zb = nodeFeaturesToZ({
          features: nb.features,
          pullA: nb.pullA,
          pullB: nb.pullB,
          kind: nb.kind,
        });
        const blend = {
          re: 0.5 * (za.z.re + zb.z.re),
          im: 0.5 * (za.z.im + zb.z.im),
        };
        const matchPull = Math.min(
          1,
          0.4 * (za.matchPull + zb.matchPull) + Math.abs(activeHit.score) * 0.35
        );
        // Strong |corr| → nudge toward match (toy transfer law)
        const matched = { re: 1, im: 0 };
        const z = {
          re: blend.re + (matched.re - blend.re) * matchPull * 0.5,
          im: blend.im + (matched.im - blend.im) * matchPull * 0.5,
        };
        return buildSmithState(
          z,
          matchPull,
          'meaning-node',
          `DERIVED: correlate pair ${activeHit.seedLabel} ↔ ${activeHit.targetLabel} ` +
            `(${activeHit.metric}, lag=${activeHit.lag}, z_toy=${activeHit.zToy.toFixed(2)}). ` +
            `Not measured Z₀.`
        );
      }
    }
    if (selectedNode) {
      const mapped = nodeFeaturesToZ({
        features: selectedNode.features,
        pullA: selectedNode.pullA,
        pullB: selectedNode.pullB,
        kind: selectedNode.kind,
      });
      return buildSmithState(mapped.z, mapped.matchPull, 'meaning-node', mapped.mappingNote);
    }
    const mapped = dualThreadToZ({
      Cl,
      ellFocus: Math.min(ellFocus, ellMax),
      ellMax,
      coherenceScore: coh?.score ?? 0,
      coherenceZ: coh?.zScore ?? 0,
      seriesDrive,
      meanPullA: meanPulls.a,
      meanPullB: meanPulls.b,
      timePhase,
    });
    return buildSmithState(mapped.z, mapped.matchPull, 'dual-thread', mapped.mappingNote);
  }, [
    activeHit,
    selectedNode,
    meaningGraph,
    Cl,
    ellFocus,
    ellMax,
    coh,
    seriesDrive,
    meanPulls,
    timePhase,
  ]);

  useEffect(() => {
    const prev = trailPhaseRef.current;
    trailPhaseRef.current = timePhase;
    if (prev === null) {
      setGammaTrail([smithState.gamma]);
      return;
    }
    setGammaTrail((tr) => {
      const g = smithState.gamma;
      if (tr.length === 0) return [g];
      const dPhase = Math.abs(timePhase - (prev ?? timePhase));
      if (dPhase > 0.008 || playing) {
        const next = [...tr, g];
        return next.length > TRAIL_MAX ? next.slice(next.length - TRAIL_MAX) : next;
      }
      const copy = tr.slice();
      copy[copy.length - 1] = g;
      return copy;
    });
  }, [timePhase, smithState.gamma, playing]);

  useEffect(() => {
    setGammaTrail([smithState.gamma]);
  }, [selectedNode?.id, activeHit?.id, seed, ellMax]); 

  const transferArcs: TransferArc[] = useMemo(() => {
    const arcs: TransferArc[] = [];
    const nodeById = new Map(meaningGraph.nodes.map((n) => [n.id, n]));

    if (activeHit?.seedNodeId && activeHit?.targetNodeId) {
      const a = nodeById.get(activeHit.seedNodeId);
      const b = nodeById.get(activeHit.targetNodeId);
      if (a && b) {
        const za = nodeFeaturesToZ({
          features: a.features,
          pullA: a.pullA,
          pullB: a.pullB,
          kind: a.kind,
        });
        const zb = nodeFeaturesToZ({
          features: b.features,
          pullA: b.pullA,
          pullB: b.pullB,
          kind: b.kind,
        });
        arcs.push({
          from: zToGamma(za.z),
          to: zToGamma(zb.z),
          weight: Math.min(1, Math.abs(activeHit.score)),
          label: 'correlate',
        });
      }
    }

    if (selectedNode && arcs.length < 6) {
      for (const e of meaningGraph.edges) {
        if (e.source !== selectedNode.id && e.target !== selectedNode.id) continue;
        if (e.reason !== 'thread-pull' && e.reason !== 'correlate' && e.weight < 0.55)
          continue;
        const a = nodeById.get(e.source);
        const b = nodeById.get(e.target);
        if (!a || !b) continue;
        const za = nodeFeaturesToZ({
          features: a.features,
          pullA: a.pullA,
          pullB: a.pullB,
          kind: a.kind,
        });
        const zb = nodeFeaturesToZ({
          features: b.features,
          pullA: b.pullA,
          pullB: b.pullB,
          kind: b.kind,
        });
        arcs.push({
          from: zToGamma(za.z),
          to: zToGamma(zb.z),
          weight: Math.min(1, e.weight),
          label: e.reason,
        });
        if (arcs.length >= 6) break;
      }
    }
    return arcs;
  }, [selectedNode, activeHit, meaningGraph]);

  const threadInput = useMemo(
    () => ({
      Cl,
      ellFocus: Math.min(ellFocus, ellMax),
      ellMax,
      coherenceScore: coh?.score ?? 0,
      coherenceZ: coh?.zScore ?? 0,
      timePhase,
      seriesDriveHistory: driveHistoryRef.current.slice(),
    }),
    [Cl, ellFocus, ellMax, coh, timePhase, seriesDrive]
  );

  const onSelectHit = (hit: CorrelateHit | null) => {
    setActiveHit(hit);
    if (hit?.seedNodeId || hit?.targetNodeId) {
      const n =
        meaningGraph.nodes.find((x) => x.id === hit.targetNodeId) ??
        meaningGraph.nodes.find((x) => x.id === hit.seedNodeId) ??
        null;
      if (n) setSelectedNode(n);
    }
  };

  const pushDressingEntry = useCallback(
    (entry: {
      nodeId: string;
      from: string;
      to: string;
      note: string;
      at: number;
    }) => {
      ledgerAppendDressing(entry);
      setDressingLog((prev) => [entry, ...prev].slice(0, 40));
    },
    []
  );

  const onSetDressing = useCallback(
    (node: MeaningNode, to: DressingState, note?: string) => {
      const { map, entry } = applyDressingTransition(
        dressingMapRef.current,
        node,
        to,
        note
      );
      dressingMapRef.current = map;
      setDressingMap(map);
      pushDressingEntry(entry);
    },
    [pushDressingEntry]
  );

  const onBulkCorrelateHits = useCallback(() => {
    const ids = nodeIdsFromCorrelateHits(correlateHits);
    const { map, entries } = bulkMarkDressedCandidate(
      dressingMapRef.current,
      meaningGraph.nodes,
      ids,
      'Bulk: correlate hits → dressed_candidate'
    );
    dressingMapRef.current = map;
    setDressingMap(map);
    for (const e of entries) pushDressingEntry(e);
  }, [correlateHits, meaningGraph.nodes, pushDressingEntry]);

  const addDataset = (ds: IngestedDataset, entry: IngestLogEntry) => {
    setDatasets((prev) => [...prev, ds]);
    setIngestLog((prev) => [entry, ...prev].slice(0, 40));
    ledgerAppend({
      kind: 'ingest',
      op: 'INGEST_PARSE',
      tp: 'TP_DOC_BATCH',
      epistemic: ds.epistemic,
      device: 'cpu',
      detail: {
        datasetId: ds.id,
        name: ds.name,
        type: ds.type,
        sourceUrl: ds.sourceUrl ?? null,
        status: entry.status,
        message: entry.message,
      },
    });
  };

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>CMB Dual-Thread Engine</h1>
          <p className="subtitle">
            Core + Instrument · harmonics · coherence · ingest · meaning · correlates · Smith · dressing
          </p>
        </div>
        <div className="epistemic-banner">
          <div>
            <span className="badge badge-physics">Physics-backed</span>
            Multipole synthesis / EXAMPLE C_ℓ — toy peaks, not Planck
          </div>
          <div>
            <span className="badge badge-metaphor">Metaphor / research</span>
            Coherence field — exploratory. Not GCP = CMB.
          </div>
          <div>
            <span className="badge badge-derived">Derived / meaning-map</span>
            Convergence + correlates — intuition only, not OPEN
          </div>
          <div>
            <span className="badge badge-derived">Derived / RF-topology</span>
            Smith Γ from DERIVED z; remote URL untrusted until labeled
          </div>
        </div>
      </header>

      <main className="main main-tri engine-shell">
        <div className="sky-column">
          <div className="sky-frame">
            <div className="sky-title">
              Mollweide anisotropy map
              {busy && <span className="busy-pill">updating…</span>}
              {playing && <span className="busy-pill play-pill">scrubbing</span>}
            </div>
            <SkyCanvas
              cmbGrid={cmbGrid}
              cohGrid={coh?.grid ?? null}
              nTheta={gridShape.nTheta}
              nPhi={gridShape.nPhi}
              showCoherence={showCoherence}
              coherenceOpacity={coherenceOpacity}
              highlights={highlights}
              width={620}
              height={280}
              precomputedRgba={highlights.length ? null : skyRgba}
              precomputedWidth={620}
              precomputedHeight={280}
            />
            <p className="hint sky-hint">
              Real Y_ℓ<sup>m</sup> (ℓ = 2…{ellMax}). Magenta glow = meaning-map sky
              projection. Not flight data.
            </p>
          </div>

          <div className="meaning-frame">
            <div className="sky-title">
              Meaning map
              <span className="badge badge-derived">Derived</span>
              <span className="hint-inline">
                {meaningGraph.nodes.length} nodes · {meaningGraph.edges.length} edges
                {correlateHits.length > 0 ? ` · ${Math.min(6, correlateHits.length)} corr` : ''}
              </span>
            </div>
            <MeaningMap
              graph={meaningGraph}
              selectedId={selectedNode?.id ?? null}
              highlightIds={highlightIds}
              onSelect={(n) => {
                setSelectedNode(n);
                setActiveHit(null);
              }}
              width={620}
              height={220}
              ellFocus={Math.min(ellFocus, ellMax)}
              coherenceZ={coh?.zScore ?? 0}
            />
            <p className="hint">
              Halos = Thread A/B pull. Dashed magenta = correlate edges. Click → inspector +
              Smith.
            </p>
          </div>

          <div className="smith-row">
            <SmithChart
              state={smithState}
              trail={gammaTrail}
              transferArcs={transferArcs}
              width={280}
              height={250}
            />
            <div className="lower-stack">
              <CorrelateSearch
                datasets={datasets}
                nodes={baseGraph.nodes}
                selectedNode={selectedNode}
                thread={threadInput}
                convergence={{
                  ellFocus: Math.min(ellFocus, ellMax),
                  ellMax,
                  Cl,
                  coherenceZ: coh?.zScore ?? 0,
                  coherenceScore: coh?.score ?? 0,
                  timePhase,
                }}
                activeHitId={activeHit?.id ?? null}
                onSelectHit={onSelectHit}
                onResults={setCorrelateHits}
              />
              <div className="mini-metrics">
                <div className="spectrum-frame compact">
                  <div className="sky-title">C_ℓ</div>
                  <PowerSpectrum Cl={Cl} ellMax={ellMax} width={260} height={100} />
                </div>
                <CoherenceMetrics
                  score={coh?.score ?? 0}
                  nullMean={coh?.nullMean ?? 0}
                  nullStd={coh?.nullStd ?? 0}
                  zScore={coh?.zScore ?? 0}
                  visible={showCoherence && !!coh}
                />
                {showAnalogy && <UlamPanel maxN={900} size={72} />}
              </div>
            </div>
          </div>
        </div>

        <aside className="sidebar">
          <Controls
            ellMax={ellMax}
            seed={seed}
            ampScales={ampScales}
            showCoherence={showCoherence}
            coherenceOpacity={coherenceOpacity}
            cohSeed={cohSeed}
            busy={busy}
            timePhase={timePhase}
            playing={playing}
            ellFocus={ellFocus}
            computeDevice={computeDevice}
            gateNote={gateNote}
            onEllMax={setEllMax}
            onSeed={setSeed}
            onAmpScale={onAmpScale}
            onShowCoherence={setShowCoherence}
            onCoherenceOpacity={setCoherenceOpacity}
            onCohSeed={setCohSeed}
            onResynthesize={resynthesize}
            onTimePhase={setTimePhase}
            onPlaying={setPlaying}
            onEllFocus={setEllFocus}
            showAnalogy={showAnalogy}
            onShowAnalogy={setShowAnalogy}
          />
          <PerfPanel
            hardware={hardware}
            devices={devices}
            mode={mdMode}
            onModeChange={onMdMode}
            workerPath={workerOk}
          />
          <NodeInspector node={selectedNode} dressingMap={dressingMap} />
          <DressingChecklist
            nodes={meaningGraph.nodes}
            dressingMap={dressingMap}
            correlateHits={correlateHits}
            selectedId={selectedNode?.id ?? null}
            onSelectNode={(n) => {
              setSelectedNode(n);
              setActiveHit(null);
            }}
            onSetDressing={onSetDressing}
            onBulkCorrelateHits={onBulkCorrelateHits}
            recentNotes={dressingLog}
          />
          <IngestPanel
            datasets={datasets}
            log={ingestLog}
            onAdd={addDataset}
            onToggle={(id) =>
              setDatasets((prev) =>
                prev.map((d) => (d.id === id ? { ...d, enabled: !d.enabled } : d))
              )
            }
            onRemove={(id) => {
              setDatasets((prev) => prev.filter((d) => d.id !== id));
              setSelectedNode((n) => (n?.datasetId === id ? null : n));
            }}
            onLogOnly={(entry) => setIngestLog((prev) => [entry, ...prev].slice(0, 40))}
          />
        </aside>
      </main>

      <footer className="footer">
        <p>
          Epistemic boundaries: EXAMPLE C_ℓ, synthetic series, URL-fetched bytes, coherence
          overlay, and correlate z_toy are not certified measured data. Smith RF Möbius math is
          real; z←features is DERIVED. Correlate search proposes candidates under a null
          control — high score ≠ OPEN. Dressing checklist is RESEARCH motif only (no DFM
          algebra); invariant_claim ≠ OPEN and never auto-PHYSICS-BACKED. Class D-analogue
          research instrument — not NASA-compliant (no signed assessment). Compute device:{' '}
          <span className="device-pill" data-device={computeDevice}>
            {computeDevice}
          </span>
          {' '}
          ({gateNote}). G3 scale: SkyFrame Worker/Offscreen + multi-device API (DEMO dual-logical TP). Post-G3 residue: IngestConverge default scan + correlate Worker + full OpGraph dispatch. Scrub invalidates COH+Smith only. No discrete GPU on this box → no invented ≥2× speedup. SwiftShader ≠ hardware.
        </p>
      </footer>
    </div>
  );
}
