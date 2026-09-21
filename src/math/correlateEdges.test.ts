import { describe, expect, it } from 'vitest';
import {
  correlateEdgesFromHits,
  filterCorrelateEdgesByPValue,
  replayCorrelateEdgesFromLedger,
} from './correlateEdges';
import type { CorrelateHit } from './correlates';
import type { LedgerRecord } from '../compute/ledger';

function hit(partial: Partial<CorrelateHit> = {}): CorrelateHit {
  return {
    id: 'hit-a',
    seedId: 'seed-a',
    seedLabel: 'Seed A',
    targetId: 'target-b',
    targetLabel: 'Target B',
    metric: 'pearson',
    score: 0.73,
    lag: 0,
    nullMean: 0.01,
    nullStd: 0.11,
    zToy: 3.2,
    pValue: 0.005,
    n: 32,
    epistemic: 'DERIVED/MEANING-MAP',
    seedNodeId: 'node-a',
    targetNodeId: 'node-b',
    note: 'test',
    ...partial,
  };
}

describe('correlateEdges', () => {
  it('builds stable edge ids for same source/target/metric/lag', () => {
    const a = correlateEdgesFromHits([hit()], 'led-1', '2026-01-01T00:00:00.000Z')[0]!;
    const b = correlateEdgesFromHits(
      [hit({ id: 'hit-b', score: 0.9, pValue: 0.001 })],
      'led-2',
      '2026-01-02T00:00:00.000Z'
    )[0]!;
    expect(a.id).toBe(b.id);
  });

  it('filters edges by p-value threshold', () => {
    const edges = correlateEdgesFromHits(
      [hit({ pValue: 0.002 }), hit({ id: 'hit-c', targetNodeId: 'node-c', pValue: 0.02 })],
      'led-1',
      '2026-01-01T00:00:00.000Z'
    );
    const filtered = filterCorrelateEdgesByPValue(edges, 0.01);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.targetId).toBe('node-b');
  });

  it('replays edges from correlate ledger history', () => {
    const records: LedgerRecord[] = [
      {
        id: 'led-correlate-1',
        at: Date.parse('2026-01-01T00:00:00.000Z'),
        kind: 'correlate',
        detail: { hits: [hit()] },
      },
      {
        id: 'led-correlate-2',
        at: Date.parse('2026-01-01T00:00:01.000Z'),
        kind: 'correlate',
        detail: { hits: [hit({ score: 0.91, pValue: 0.001 })] },
      },
    ];
    const replayed = replayCorrelateEdgesFromLedger(records);
    expect(replayed).toHaveLength(1);
    expect(replayed[0]!.ledgerRef).toBe('led-correlate-2');
    expect(replayed[0]!.score).toBeCloseTo(0.91);
  });
});
