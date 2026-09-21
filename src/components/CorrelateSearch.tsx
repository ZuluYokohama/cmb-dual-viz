import { useMemo, useState } from 'react';
import type { IngestedDataset, MeaningNode } from '../ingest/types';
import {
  buildSeeds,
  type CorrelateHit,
  type ThreadSeriesInput,
} from '../math/correlates';
import type { ConvergenceState } from '../math/meaningMap';
import {
  fabricCorrelate,
  ledgerAppend,
  runIngestConverge,
} from '../compute';
import { correlateEdgesFromHits } from '../math/correlateEdges';
import type { CorrelateEdge } from '../ingest/types';

interface Props {
  datasets: IngestedDataset[];
  nodes: MeaningNode[];
  selectedNode: MeaningNode | null;
  thread: ThreadSeriesInput;
  convergence: ConvergenceState;
  activeHitId: string | null;
  onSelectHit: (hit: CorrelateHit | null) => void;
  onResults: (payload: { hits: CorrelateHit[]; edges: CorrelateEdge[] }) => void;
}

/**
 * Default path: IngestConverge OpGraph (parse→embed→layout→correlate→smith).
 * Escape hatch: `?correlateBypass=1` uses one-shot fabricCorrelate (tests).
 */
export function CorrelateSearch({
  datasets,
  nodes,
  selectedNode,
  thread,
  convergence,
  activeHitId,
  onSelectHit,
  onResults,
}: Props) {
  const seeds = useMemo(
    () => buildSeeds({ datasets, nodes, selectedNode, thread }),
    [datasets, nodes, selectedNode, thread]
  );
  const [seedId, setSeedId] = useState(seeds[0]?.id ?? '');
  const [hits, setHits] = useState<CorrelateHit[]>([]);
  const [residue, setResidue] = useState<string[]>([]);
  const [scanned, setScanned] = useState(0);
  const [busy, setBusy] = useState(false);
  const [lastMs, setLastMs] = useState<number | null>(null);
  const [lastDevice, setLastDevice] = useState<'cpu' | 'webgpu'>('cpu');
  const [lastPath, setLastPath] = useState<'worker' | 'main' | null>(null);

  const effectiveSeedId = seeds.some((s) => s.id === seedId)
    ? seedId
    : seeds[0]?.id ?? '';

  const bypassGraph = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('correlateBypass') === '1';
  }, []);

  const runScan = () => {
    const seed = seeds.find((s) => s.id === effectiveSeedId);
    if (!seed) return;
    setBusy(true);
    requestAnimationFrame(() => {
      void (async () => {
        try {
          if (bypassGraph) {
            // Documented escape hatch for tests / A-B vs graph path
            const result = await fabricCorrelate({
              seed,
              datasets,
              nodes,
              thread,
              maxLag: 6,
              topN: 10,
              ledger: true,
            });
            setHits(result.hits);
            setResidue(result.residue);
            setScanned(result.scanned);
            setLastMs(result.ms);
            setLastDevice(result.device);
            setLastPath('main');
            const rec = ledgerAppend({
              kind: 'correlate',
              op: 'CORRELATE_BATCH',
              tp: 'TP_PAIR_BLOCK',
              epistemic: result.epistemic,
              device: result.device,
              ms: result.ms,
              detail: {
                seedId: seed.id,
                scanned: result.scanned,
                topZ: result.hits[0]?.zToy ?? null,
                path: 'main',
                bypass: true,
                note: 'escape hatch fabricCorrelate (?correlateBypass=1)',
                hits: result.hits,
              },
            });
            const edges = correlateEdgesFromHits(
              result.hits,
              rec.id,
              new Date(rec.at).toISOString()
            );
            onResults({ hits: result.hits, edges });
            onSelectHit(result.hits[0] ?? null);
            return;
          }

          const result = await runIngestConverge({
            datasets,
            convergence,
            seed,
            thread,
            maxLag: 6,
            topN: 10,
            ledger: true,
            preferWorker: true,
          });
          setHits(result.correlate.hits);
          setResidue(result.correlate.residue);
          setScanned(result.correlate.scanned);
          setLastMs(result.measurement.ms);
          setLastDevice(result.device);
          setLastPath(result.path);
          const rec = ledgerAppend({
            kind: 'correlate',
            op: 'CORRELATE_BATCH',
            tp: 'TP_PAIR_BLOCK',
            epistemic: result.epistemic,
            device: result.device,
            ms: result.correlate.ms,
            detail: {
              seedId: seed.id,
              scanned: result.correlate.scanned,
              topZ: result.correlate.hits[0]?.zToy ?? null,
              path: result.path,
              graphId: 'IngestConverge',
              note: 'z_toy is toy null — high score ≠ OPEN; IngestConverge default',
              hits: result.correlate.hits,
            },
          });
          const edges = correlateEdgesFromHits(
            result.correlate.hits,
            rec.id,
            new Date(rec.at).toISOString()
          );
          onResults({ hits: result.correlate.hits, edges });
          onSelectHit(result.correlate.hits[0] ?? null);
        } finally {
          setBusy(false);
        }
      })();
    });
  };

  return (
    <div className="correlate-panel">
      <h3>
        <span className="badge badge-derived">Research / derived</span>
        Search correlates
      </h3>
      <p className="epistemic-note">
        Correlate search proposes candidates under a null control. High score ≠ OPEN.
        Separate evaluator / human owns any claim. z_toy is not formal inference.
        Default path: IngestConverge OpGraph
        {bypassGraph ? ' (bypass active)' : ''}.
      </p>

      <label className="correlate-seed">
        <span>Seed</span>
        <select
          value={effectiveSeedId}
          onChange={(e) => setSeedId(e.target.value)}
        >
          {seeds.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label} · {s.epistemic}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        className="btn primary"
        disabled={busy || !effectiveSeedId}
        onClick={runScan}
      >
        {busy ? 'Scanning…' : 'Scan active sources'}
      </button>

      {scanned > 0 && (
        <p className="hint">
          Scanned {scanned} targets · top {hits.length} by |z|<sub>toy</sub>
          {lastMs != null
            ? ` · ${lastMs.toFixed(1)} ms · device: ${lastDevice}${
                lastPath ? ` · path: ${lastPath}` : ''
              }`
            : ''}
        </p>
      )}

      <div className="correlate-table-wrap">
        <table className="correlate-table">
          <thead>
            <tr>
              <th>|z|</th>
              <th>score</th>
              <th>metric</th>
              <th>lag</th>
              <th>pair</th>
              <th>tag</th>
            </tr>
          </thead>
          <tbody>
            {hits.length === 0 && (
              <tr>
                <td colSpan={6} className="hint">
                  No results yet — pick a seed and scan.
                </td>
              </tr>
            )}
            {hits.map((h) => (
              <tr
                key={h.id}
                className={activeHitId === h.id ? 'active' : ''}
                onClick={() => onSelectHit(h)}
              >
                <td>{h.zToy.toFixed(2)}</td>
                <td>{h.score.toFixed(3)}</td>
                <td>{h.metric}</td>
                <td>{h.lag}</td>
                <td title={`${h.seedLabel} ↔ ${h.targetLabel}`}>
                  {truncate(h.seedLabel, 18)} ↔ {truncate(h.targetLabel, 18)}
                </td>
                <td>
                  <span className="badge badge-derived">{shortTag(h.epistemic)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {residue.length > 0 && hits.length > 0 && (
        <p className="hint correlate-residue">{residue.join(' ')}</p>
      )}
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

function shortTag(e: string) {
  if (e.includes('EXAMPLE')) return 'EXAMPLE';
  if (e.includes('METAPHOR')) return 'METAPHOR';
  if (e.includes('DERIVED')) return 'DERIVED';
  return e.slice(0, 10);
}
