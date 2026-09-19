import { describe, it, expect } from 'vitest';
import {
  applyDressingTransition,
  bulkMarkDressedCandidate,
  defaultDressingState,
  dressingPreservesEpistemic,
  isScaffoldingNode,
  nodeIdsFromCorrelateHits,
  resolveDressingDisplay,
  type DressingStateMap,
} from './dressing';
import type { MeaningNode } from '../ingest/types';
import { ledgerAppend, ledgerClear, ledgerSnapshot, ledgerToJsonl } from '../compute/ledger';

function node(partial: Partial<MeaningNode> & Pick<MeaningNode, 'id' | 'label'>): MeaningNode {
  return {
    kind: 'text-claim',
    datasetId: 'ds-1',
    epistemic: 'DERIVED/MEANING-MAP',
    features: new Float32Array(8),
    x: 0,
    y: 0,
    pullA: 0,
    pullB: 0,
    provenance: 'test',
    ...partial,
  };
}

describe('dressing checklist', () => {
  it('defaults new ingest-like nodes to bare', () => {
    const n = node({ id: 'a', label: 'claim' });
    expect(defaultDressingState(n)).toBe('bare');
    expect(resolveDressingDisplay(n, {})).toBe('bare');
  });

  it('marks EXAMPLE / thread-a as scaffolding display', () => {
    const a = node({
      id: 'threadA-ell-2-5',
      label: 'ℓ 2–5',
      kind: 'multipole-bin',
      datasetId: 'thread-a',
      epistemic: 'PHYSICS-BACKED (EXAMPLE)',
      provenance: 'Thread A multipole energy band. EXAMPLE C_ℓ shape.',
    });
    expect(isScaffoldingNode(a)).toBe(true);
    expect(resolveDressingDisplay(a, {})).toBe('scaffolding');

    const cl = node({
      id: 'gen-cl',
      label: 'EXAMPLE acoustic C_ℓ',
      kind: 'multipole-bin',
      epistemic: 'PHYSICS-BACKED (EXAMPLE)',
      provenance: 'Ingested C_ℓ from EXAMPLE',
    });
    expect(isScaffoldingNode(cl)).toBe(true);
  });

  it('transitions bare → dressed_candidate → invariant_claim with ledger shape', () => {
    const n = node({ id: 'n1', label: 'x' });
    let map: DressingStateMap = {};
    const t1 = applyDressingTransition(map, n, 'dressed_candidate');
    map = t1.map;
    expect(t1.entry.kind).toBe('dressing');
    expect(t1.entry.nodeId).toBe('n1');
    expect(t1.entry.from).toBe('bare');
    expect(t1.entry.to).toBe('dressed_candidate');
    expect(typeof t1.entry.at).toBe('number');
    expect(t1.entry.note.length).toBeGreaterThan(0);

    const t2 = applyDressingTransition(map, n, 'invariant_claim');
    expect(t2.entry.from).toBe('dressed_candidate');
    expect(t2.entry.to).toBe('invariant_claim');
    expect(t2.entry.note).toMatch(/≠ OPEN|RESEARCH/);
  });

  it('bulk marks correlate hits as dressed_candidate only', () => {
    const nodes = [
      node({ id: 's', label: 'seed' }),
      node({ id: 't', label: 'target' }),
      node({ id: 'keep', label: 'already' }),
    ];
    const map: DressingStateMap = { keep: 'invariant_claim' };
    const ids = nodeIdsFromCorrelateHits([
      { seedNodeId: 's', targetNodeId: 't' },
      { seedNodeId: 'keep', targetNodeId: 't' },
    ]);
    expect(ids.sort()).toEqual(['keep', 's', 't']);
    const { map: next, entries } = bulkMarkDressedCandidate(map, nodes, ids);
    expect(next.s).toBe('dressed_candidate');
    expect(next.t).toBe('dressed_candidate');
    expect(next.keep).toBe('invariant_claim');
    expect(entries.every((e) => e.to === 'dressed_candidate')).toBe(true);
    expect(entries.some((e) => e.nodeId === 'keep')).toBe(false);
  });

  it('never mutates epistemic via dressing helpers', () => {
    expect(
      dressingPreservesEpistemic('DERIVED/MEANING-MAP', 'DERIVED/MEANING-MAP')
    ).toBe(true);
    expect(
      dressingPreservesEpistemic('METAPHOR/RESEARCH', 'PHYSICS-BACKED')
    ).toBe(false);
  });

  it('ledgerAppend stores dressing JSONL fields', () => {
    ledgerClear();
    const n = node({ id: 'led-n', label: 'y' });
    const { entry } = applyDressingTransition({}, n, 'dressed_candidate', 'test note');
    ledgerAppend({
      kind: 'dressing',
      nodeId: entry.nodeId,
      from: entry.from,
      to: entry.to,
      note: entry.note,
      at: entry.at,
      detail: { ...entry },
    });
    const snap = ledgerSnapshot();
    expect(snap[0]!.kind).toBe('dressing');
    expect(snap[0]!.nodeId).toBe('led-n');
    expect(snap[0]!.from).toBe('bare');
    expect(snap[0]!.to).toBe('dressed_candidate');
    const line = JSON.parse(ledgerToJsonl(snap[0]!)) as Record<string, unknown>;
    expect(line.kind).toBe('dressing');
    expect(line.nodeId).toBe('led-n');
  });

  it('explicit bare on scaffolding node stays bare (not scaffolding)', () => {
    const a = node({
      id: 'threadA-ell-2-5',
      label: 'ℓ 2–5',
      datasetId: 'thread-a',
      epistemic: 'PHYSICS-BACKED (EXAMPLE)',
      kind: 'multipole-bin',
      provenance: 'EXAMPLE C_ℓ',
    });
    const { map } = applyDressingTransition({}, a, 'bare', 'human undressed');
    expect(resolveDressingDisplay(a, map)).toBe('bare');
  });
});
