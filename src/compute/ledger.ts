/**
 * Evidence Ledger — append-only ingest / correlate / compute / dressing records.
 * Browser: in-memory ring. Node scripts: JSONL under artifacts/ledger/.
 */

import type { Epistemic, OpName, TPPolicy } from './types';

export interface LedgerRecord {
  id: string;
  at: number; // epoch ms
  kind: 'ingest' | 'correlate' | 'compute' | 'perf' | 'note' | 'dressing';
  op?: OpName | string;
  tp?: TPPolicy;
  epistemic?: Epistemic | string;
  device?: 'cpu' | 'webgpu';
  ms?: number;
  /** Dressing checklist fields (kind === 'dressing') */
  nodeId?: string;
  from?: string;
  to?: string;
  note?: string;
  detail: Record<string, unknown>;
}

const RING_MAX = 200;
const ring: LedgerRecord[] = [];
let seq = 0;

function nextId(kind: string): string {
  seq += 1;
  return `led-${kind}-${Date.now()}-${seq}`;
}

/** Append a ledger record (always in-memory; optionally mirrored by callers to JSONL). */
export function ledgerAppend(
  partial: Omit<LedgerRecord, 'id' | 'at' | 'detail'> & {
    id?: string;
    at?: number;
    detail?: Record<string, unknown>;
  }
): LedgerRecord {
  const rec: LedgerRecord = {
    id: partial.id ?? nextId(partial.kind),
    at: partial.at ?? Date.now(),
    kind: partial.kind,
    op: partial.op,
    tp: partial.tp,
    epistemic: partial.epistemic,
    device: partial.device ?? 'cpu',
    ms: partial.ms,
    nodeId: partial.nodeId,
    from: partial.from,
    to: partial.to,
    note: partial.note,
    detail: partial.detail ?? {},
  };
  ring.unshift(rec);
  if (ring.length > RING_MAX) ring.length = RING_MAX;
  return rec;
}

/**
 * Append a dressing transition in the canonical shape:
 * `{ kind: 'dressing', nodeId, from, to, at, note }`
 */
export function ledgerAppendDressing(entry: {
  nodeId: string;
  from: string;
  to: string;
  at?: number;
  note?: string;
}): LedgerRecord {
  const at = entry.at ?? Date.now();
  return ledgerAppend({
    kind: 'dressing',
    nodeId: entry.nodeId,
    from: entry.from,
    to: entry.to,
    note: entry.note ?? '',
    at,
    epistemic: 'RESEARCH/DERIVED',
    detail: {
      kind: 'dressing',
      nodeId: entry.nodeId,
      from: entry.from,
      to: entry.to,
      at,
      note: entry.note ?? '',
    },
  });
}

export function ledgerSnapshot(): LedgerRecord[] {
  return ring.slice();
}

export function ledgerClear(): void {
  ring.length = 0;
  seq = 0;
}

/** Serialize one record as a JSONL line. */
export function ledgerToJsonl(rec: LedgerRecord): string {
  return JSON.stringify(rec);
}

/** Format many records as JSONL body. */
export function ledgerDumpJsonl(recs: LedgerRecord[] = ring): string {
  return recs.map(ledgerToJsonl).join('\n') + (recs.length ? '\n' : '');
}
