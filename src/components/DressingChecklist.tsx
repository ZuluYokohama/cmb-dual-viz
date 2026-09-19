/**
 * Dressing checklist panel — RESEARCH instrument only.
 * Does not implement DFM algebra; motif / operational checklist.
 */

import { useMemo, useState } from 'react';
import type { MeaningNode } from '../ingest/types';
import type { CorrelateHit } from '../math/correlates';
import {
  BOMBELLI_MOTIF,
  DRESSING_STATES,
  dressingHint,
  dressingLabel,
  resolveDressingDisplay,
  type DressingDisplay,
  type DressingState,
  type DressingStateMap,
} from '../math/dressing';

interface Props {
  nodes: MeaningNode[];
  dressingMap: DressingStateMap;
  correlateHits: CorrelateHit[];
  selectedId: string | null;
  onSelectNode: (node: MeaningNode) => void;
  onSetDressing: (node: MeaningNode, to: DressingState, note?: string) => void;
  onBulkCorrelateHits: () => void;
  recentNotes?: { nodeId: string; from: string; to: string; note: string; at: number }[];
}

function stateClass(d: DressingDisplay): string {
  switch (d) {
    case 'bare':
      return 'dress-bare';
    case 'dressed_candidate':
      return 'dress-candidate';
    case 'invariant_claim':
      return 'dress-invariant';
    case 'scaffolding':
      return 'dress-scaffold';
    default:
      return '';
  }
}

export function DressingChecklist({
  nodes,
  dressingMap,
  correlateHits,
  selectedId,
  onSelectNode,
  onSetDressing,
  onBulkCorrelateHits,
  recentNotes = [],
}: Props) {
  const [filter, setFilter] = useState<'all' | DressingDisplay>('all');

  const rows = useMemo(() => {
    const list = nodes.map((n) => ({
      node: n,
      dressing: resolveDressingDisplay(n, dressingMap),
    }));
    if (filter === 'all') return list;
    return list.filter((r) => r.dressing === filter);
  }, [nodes, dressingMap, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      bare: 0,
      dressed_candidate: 0,
      invariant_claim: 0,
      scaffolding: 0,
    };
    for (const n of nodes) {
      const d = resolveDressingDisplay(n, dressingMap);
      c[d] = (c[d] ?? 0) + 1;
    }
    return c;
  }, [nodes, dressingMap]);

  const hitCount = correlateHits.length;

  return (
    <section className="dressing-panel" aria-label="Dressing checklist RESEARCH">
      <h3>
        Dressing checklist{' '}
        <span className="badge badge-metaphor">RESEARCH</span>
      </h3>
      <p className="dressing-motif">{BOMBELLI_MOTIF}</p>
      <p className="hint dressing-disclaimer">
        Motif: relational gauge / Dressing Field Method (Ravera–François) + Cardano–Bombelli —
        intermediate scaffolding stays explicit. DFM algebra is <strong>not</strong> implemented.
        Never auto-promotes to PHYSICS-BACKED or OPEN.
      </p>

      <div className="dressing-counts">
        <button
          type="button"
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          all {nodes.length}
        </button>
        {(['scaffolding', 'bare', 'dressed_candidate', 'invariant_claim'] as DressingDisplay[]).map(
          (d) => (
            <button
              key={d}
              type="button"
              className={`${stateClass(d)} ${filter === d ? 'active' : ''}`}
              onClick={() => setFilter(d)}
              title={dressingHint(d)}
            >
              {dressingLabel(d)} {counts[d] ?? 0}
            </button>
          )
        )}
      </div>

      <div className="dressing-actions">
        <button
          type="button"
          className="btn secondary"
          disabled={hitCount === 0}
          onClick={onBulkCorrelateHits}
          title="Mark seed/target nodes from current correlate hits as dressed_candidate"
        >
          Mark correlate hits as dressed_candidate
          {hitCount > 0 ? ` (${hitCount})` : ''}
        </button>
      </div>

      <ul className="dressing-list">
        {rows.slice(0, 48).map(({ node, dressing }) => {
          return (
            <li
              key={node.id}
              className={`dressing-row ${selectedId === node.id ? 'selected' : ''}`}
            >
              <button
                type="button"
                className="dressing-select"
                onClick={() => onSelectNode(node)}
              >
                <span className={`dress-pill ${stateClass(dressing)}`}>
                  {dressingLabel(dressing)}
                </span>
                <span className="dressing-label" title={node.id}>
                  {node.label}
                </span>
                <span
                  className={`badge ${
                    node.epistemic.includes('PHYSICS')
                      ? 'badge-physics'
                      : node.epistemic.includes('METAPHOR')
                        ? 'badge-metaphor'
                        : 'badge-derived'
                  }`}
                >
                  {node.epistemic}
                </span>
              </button>
              <p className="dressing-prov" title={node.provenance}>
                {node.provenance.slice(0, 90)}
                {node.provenance.length > 90 ? '…' : ''}
              </p>
              <div className="dressing-set">
                {DRESSING_STATES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`btn tiny ${dressing === s ? 'primary' : 'secondary'}`}
                    disabled={dressing === s}
                    onClick={() => {
                      if (s === 'invariant_claim') {
                        onSetDressing(
                          node,
                          s,
                          'Explicit UI: human asserted invariant_claim (RESEARCH; ≠ OPEN)'
                        );
                      } else {
                        onSetDressing(node, s);
                      }
                    }}
                    title={
                      s === 'invariant_claim'
                        ? 'Requires explicit action — still RESEARCH, not OPEN'
                        : dressingHint(s)
                    }
                  >
                    {s === 'dressed_candidate' ? 'candidate' : s}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="hint">No nodes match filter.</li>
        )}
        {rows.length > 48 && (
          <li className="hint">Showing 48 / {rows.length} — filter to narrow.</li>
        )}
      </ul>

      {recentNotes.length > 0 && (
        <div className="dressing-ledger-preview">
          <div className="sky-title">Recent dressing ledger</div>
          <ul>
            {recentNotes.slice(0, 6).map((e, i) => (
              <li key={`${e.nodeId}-${e.at}-${i}`} className="mono">
                {e.nodeId.slice(0, 28)}: {e.from}→{e.to}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
