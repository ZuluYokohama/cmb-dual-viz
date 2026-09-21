/**
 * Ingestion + meaning-map types.
 * Epistemic: DERIVED/MEANING-MAP unless a source declares otherwise.
 */

export type EpistemicLabel =
  | 'PHYSICS-BACKED'
  | 'PHYSICS-BACKED (EXAMPLE)'
  | 'METAPHOR/RESEARCH'
  | 'DERIVED/MEANING-MAP';

export type NodeKind =
  | 'sky-sample'
  | 'time-series-window'
  | 'text-claim'
  | 'multipole-bin'
  | 'coherence-metric'
  | 'series-point'
  | 'alm-mode';

export type DatasetType =
  | 'json'
  | 'csv'
  | 'text'
  | 'generator'
  | 'builtin-thread'
  | 'url';

export interface SkySample {
  theta?: number;
  phi?: number;
  lon?: number;
  lat?: number;
  value: number;
}

export interface SeriesPoint {
  t: number;
  value: number;
}

export interface ClaimItem {
  id?: string;
  text: string;
}

export interface IngestedDataset {
  id: string;
  name: string;
  type: DatasetType;
  epistemic: EpistemicLabel;
  enabled: boolean;
  /** Original format tag */
  format: string;
  /** Optional sky samples (θ,φ or lon,lat) */
  skySamples?: SkySample[];
  /** Time series */
  series?: SeriesPoint[];
  /** Text claims / paragraphs */
  claims?: ClaimItem[];
  /** Multipole C_ℓ array (index = ℓ) */
  cl?: number[];
  /** a_ℓm list */
  alm?: { ell: number; m: number; a: number }[];
  /** Free-form residue / notes */
  meta?: Record<string, unknown>;
  ingestedAt: number;
  /** External URL provenance (when type === 'url' or fetched remotely) */
  sourceUrl?: string;
  /** How the bytes arrived */
  sourceKind?: 'file' | 'paste' | 'generator' | 'url';
  /** Upstream Content-Type from URL fetch */
  contentType?: string;
}

export interface IngestLogEntry {
  id: string;
  at: number;
  status: 'accepted' | 'rejected' | 'residue';
  source: string;
  message: string;
  datasetId?: string;
}

export interface MeaningNode {
  id: string;
  label: string;
  kind: NodeKind;
  datasetId: string;
  epistemic: EpistemicLabel;
  /** Feature vector in shared embedding space */
  features: Float32Array;
  /** Layout position (updated by layout) */
  x: number;
  y: number;
  /** Convergence pull strengths from Thread A / B */
  pullA: number;
  pullB: number;
  /** Provenance snippet for inspector */
  provenance: string;
  /** Optional sky highlight (theta, phi) or bbox */
  skyHint?: { theta: number; phi: number; weight?: number };
  /** Multipole band association */
  ellBand?: { lo: number; hi: number };
  /** Raw payload for inspector */
  payload?: unknown;
}

export interface MeaningEdge {
  source: string;
  target: string;
  weight: number;
  reason: 'similarity' | 'co-occurrence' | 'shared-multipole' | 'thread-pull' | 'correlate';
  correlate?: CorrelateEdge;
  bareTouch?: boolean;
}

export interface MeaningGraph {
  nodes: MeaningNode[];
  edges: MeaningEdge[];
}

export interface CorrelateEdge {
  id: string;
  sourceId: string;
  targetId: string;
  metric: 'pearson' | 'lagged_pearson' | 'spearman' | 'cosine';
  lag: number;
  score: number;
  pValue: number;
  n: number;
  ledgerRef: string;
  createdAt: string;
}
