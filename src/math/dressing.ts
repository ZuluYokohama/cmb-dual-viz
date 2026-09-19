/**
 * Dressing Checklist — RESEARCH instrument (relational-gauge / DFM motif).
 *
 * Operationalizes: keep intermediate scaffolding explicit; let humans tag
 * meaning-map nodes through dressing states; ledger every change.
 * Never auto-promotes epistemic tags to PHYSICS-BACKED or OPEN.
 *
 * Motif only (Ravera–François Dressing Field Method / Cardano–Bombelli):
 * intermediate fictions OK if they cancel under controls.
 * This module does NOT implement DFM algebra or Lean proofs.
 */

import type { EpistemicLabel, MeaningNode } from '../ingest/types';

/** Mutable research states (human-driven). */
export type DressingState = 'bare' | 'dressed_candidate' | 'invariant_claim';

/**
 * Display may show `scaffolding` for known auxiliaries (EXAMPLE C_ℓ /
 * synthetic generators / Thread A multipole bins) while untouched.
 * Scaffolding is display-only — never an auto-claim.
 */
export type DressingDisplay = DressingState | 'scaffolding';

export type DressingStateMap = Record<string, DressingState>;

export interface DressingLedgerPayload {
  kind: 'dressing';
  nodeId: string;
  from: DressingDisplay;
  to: DressingState;
  at: number;
  note: string;
}

export const DRESSING_STATES: DressingState[] = [
  'bare',
  'dressed_candidate',
  'invariant_claim',
];

export const BOMBELLI_MOTIF =
  'Bombelli motif: intermediate fictions OK if they cancel under controls; ' +
  'invariant_claim ≠ OPEN — still RESEARCH, never auto-PHYSICS-BACKED.';

/** Known auxiliary / coordinate-like scaffolding (display hint). */
export function isScaffoldingNode(node: MeaningNode): boolean {
  if (node.datasetId === 'thread-a') return true;
  if (node.epistemic === 'PHYSICS-BACKED (EXAMPLE)') return true;
  const prov = node.provenance.toLowerCase();
  if (prov.includes('example c_ℓ') || prov.includes('example c_l')) return true;
  if (node.label.toLowerCase().includes('example') && node.kind === 'multipole-bin') {
    return true;
  }
  return false;
}

/** Default stored state for a newly seen node: always bare (scaffolding is display). */
export function defaultDressingState(_node: MeaningNode): DressingState {
  return 'bare';
}

/**
 * Resolve display for UI: if never touched and scaffolding → scaffolding;
 * otherwise the stored research state (or bare).
 */
export function resolveDressingDisplay(
  node: MeaningNode,
  map: DressingStateMap
): DressingDisplay {
  if (Object.prototype.hasOwnProperty.call(map, node.id)) {
    return map[node.id]!;
  }
  if (isScaffoldingNode(node)) return 'scaffolding';
  return 'bare';
}

export function dressingLabel(d: DressingDisplay): string {
  switch (d) {
    case 'bare':
      return 'bare';
    case 'dressed_candidate':
      return 'dressed_candidate';
    case 'invariant_claim':
      return 'invariant_claim';
    case 'scaffolding':
      return 'scaffolding';
    default:
      return d;
  }
}

export function dressingHint(d: DressingDisplay): string {
  switch (d) {
    case 'bare':
      return 'Auxiliary / coordinate-like / undressed';
    case 'dressed_candidate':
      return 'Relational reduction proposed — still candidate (RESEARCH)';
    case 'invariant_claim':
      return 'Human asserts dressed/invariant content — still RESEARCH; ≠ OPEN';
    case 'scaffolding':
      return 'Known auxiliary (EXAMPLE C_ℓ / synthetic) — display-only scaffold';
    default:
      return '';
  }
}

/** Allowed next states from UI (scaffolding can move to any research state). */
export function allowedTransitions(from: DressingDisplay): DressingState[] {
  if (from === 'scaffolding') return [...DRESSING_STATES];
  return DRESSING_STATES.filter((s) => s !== from);
}

/**
 * Collect node ids from correlate hits for bulk dressed_candidate.
 * Prefers target + seed; dedupes.
 */
export function nodeIdsFromCorrelateHits(
  hits: { seedNodeId?: string; targetNodeId?: string }[]
): string[] {
  const ids = new Set<string>();
  for (const h of hits) {
    if (h.targetNodeId) ids.add(h.targetNodeId);
    if (h.seedNodeId) ids.add(h.seedNodeId);
  }
  return [...ids];
}

/** Pure apply: set one node; returns new map + ledger payload (caller appends). */
export function applyDressingTransition(
  map: DressingStateMap,
  node: MeaningNode,
  to: DressingState,
  note = ''
): { map: DressingStateMap; entry: DressingLedgerPayload } {
  const from = resolveDressingDisplay(node, map);
  const next = { ...map, [node.id]: to };
  return {
    map: next,
    entry: {
      kind: 'dressing',
      nodeId: node.id,
      from,
      to,
      at: Date.now(),
      note:
        note ||
        (to === 'invariant_claim'
          ? 'Human asserted invariant_claim (RESEARCH; ≠ OPEN)'
          : `Dressing ${from} → ${to}`),
    },
  };
}

/**
 * Bulk mark: set listed nodes to dressed_candidate if currently bare/scaffolding.
 * Does not touch invariant_claim or existing dressed_candidate.
 */
export function bulkMarkDressedCandidate(
  map: DressingStateMap,
  nodes: MeaningNode[],
  nodeIds: string[],
  note = 'Bulk: correlate hits → dressed_candidate'
): { map: DressingStateMap; entries: DressingLedgerPayload[] } {
  const idSet = new Set(nodeIds);
  let next = { ...map };
  const entries: DressingLedgerPayload[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const id of idSet) {
    const node = byId.get(id);
    if (!node) continue;
    const from = resolveDressingDisplay(node, next);
    if (from === 'invariant_claim' || from === 'dressed_candidate') continue;
    const applied = applyDressingTransition(next, node, 'dressed_candidate', note);
    next = applied.map;
    entries.push(applied.entry);
  }
  return { map: next, entries };
}

/** Epistemic never changes via dressing — guard for tests / UI copy. */
export function dressingPreservesEpistemic(
  before: EpistemicLabel,
  after: EpistemicLabel
): boolean {
  return before === after;
}
