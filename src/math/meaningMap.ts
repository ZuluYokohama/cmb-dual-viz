/**
 * Meaning-map convergence: project ingested sources into a shared 2D graph.
 * Label: DERIVED/MEANING-MAP — convergence instrument for intuition, not proof.
 */

import type {
  IngestedDataset,
  MeaningEdge,
  MeaningGraph,
  MeaningNode,
  NodeKind,
} from '../ingest/types';
import {
  cosine,
  forceLayout,
  numericEmbed,
  pca2d,
  textEmbed,
  EMBED_DIM,
} from './embedding';
import { exampleCl } from './sphericalHarmonics';

export interface ConvergenceState {
  /** Current ℓ focus band (Thread A) */
  ellFocus: number;
  ellMax: number;
  /** Multipole energy weights Cl[ell] */
  Cl: number[];
  /** Thread B coherence z-score */
  coherenceZ: number;
  coherenceScore: number;
  /** Time scrub phase 0..1 */
  timePhase: number;
}

function windowStats(series: { t: number; value: number }[], phase: number) {
  if (!series.length) return { mean: 0, std: 1, slope: 0 };
  const sorted = [...series].sort((a, b) => a.t - b.t);
  const t0 = sorted[0]!.t;
  const t1 = sorted[sorted.length - 1]!.t;
  const span = Math.max(1e-9, t1 - t0);
  const center = t0 + phase * span;
  const half = span * 0.15;
  const win = sorted.filter((p) => Math.abs(p.t - center) <= half);
  const use = win.length >= 2 ? win : sorted;
  let mean = 0;
  for (const p of use) mean += p.value;
  mean /= use.length;
  let std = 0;
  for (const p of use) std += (p.value - mean) ** 2;
  std = Math.sqrt(std / use.length) || 1;
  const slope =
    use.length >= 2
      ? (use[use.length - 1]!.value - use[0]!.value) /
        Math.max(1e-9, use[use.length - 1]!.t - use[0]!.t)
      : 0;
  return { mean, std, slope };
}

function ellEnergyFeatures(Cl: number[], ellMax: number): Float32Array {
  const vals: number[] = [];
  for (let ell = 2; ell <= Math.min(ellMax, Cl.length - 1); ell++) {
    vals.push((ell * (ell + 1) * (Cl[ell] ?? 0)) / (2 * Math.PI));
  }
  // also blend EXAMPLE shape for alignment
  for (let ell = 2; ell <= Math.min(ellMax, 48); ell++) {
    vals.push(exampleCl(ell));
  }
  return numericEmbed(vals, EMBED_DIM);
}

/**
 * Build meaning nodes from active datasets + live thread state.
 */
export function buildMeaningGraph(
  datasets: IngestedDataset[],
  state: ConvergenceState
): MeaningGraph {
  const nodes: MeaningNode[] = [];
  const active = datasets.filter((d) => d.enabled);

  // Thread A multipole-bin nodes (always present as substrate anchors)
  const bandW = Math.max(2, Math.floor(state.ellMax / 6));
  for (let lo = 2; lo <= state.ellMax; lo += bandW) {
    const hi = Math.min(state.ellMax, lo + bandW - 1);
    let energy = 0;
    for (let ell = lo; ell <= hi; ell++) {
      energy += (ell * (ell + 1) * (state.Cl[ell] ?? exampleCl(ell))) / (2 * Math.PI);
    }
    const feat = numericEmbed(
      [lo, hi, energy, state.ellFocus, Math.abs(state.ellFocus - (lo + hi) / 2)],
      EMBED_DIM
    );
    // Mix in text cue for multipole vocabulary
    const te = textEmbed(`multipole band ell ${lo} to ${hi} acoustic power`);
    for (let i = 0; i < EMBED_DIM; i++) feat[i] = 0.65 * feat[i]! + 0.35 * te[i]!;

    const pullA =
      1 /
      (1 +
        Math.abs(state.ellFocus - (lo + hi) / 2) / Math.max(1, bandW));
    nodes.push({
      id: `threadA-ell-${lo}-${hi}`,
      label: `ℓ ${lo}–${hi}`,
      kind: 'multipole-bin',
      datasetId: 'thread-a',
      epistemic: 'PHYSICS-BACKED (EXAMPLE)',
      features: feat,
      x: 0,
      y: 0,
      pullA,
      pullB: 0.1,
      provenance: `Thread A multipole energy band ℓ=${lo}…${hi}. EXAMPLE C_ℓ shape.`,
      ellBand: { lo, hi },
      payload: { energy, ellFocus: state.ellFocus },
    });
  }

  // Thread B coherence metric node
  {
    const feat = numericEmbed(
      [state.coherenceZ, state.coherenceScore, state.timePhase, state.coherenceZ * state.timePhase],
      EMBED_DIM
    );
    const te = textEmbed('coherence field z-score autocorr metaphor research overlay');
    for (let i = 0; i < EMBED_DIM; i++) feat[i] = 0.6 * feat[i]! + 0.4 * te[i]!;
    const pullB = Math.min(1, Math.abs(state.coherenceZ) / 3);
    nodes.push({
      id: 'threadB-coherence',
      label: `coh z=${state.coherenceZ.toFixed(2)}`,
      kind: 'coherence-metric',
      datasetId: 'thread-b',
      epistemic: 'METAPHOR/RESEARCH',
      features: feat,
      x: 0,
      y: 0,
      pullA: 0.15,
      pullB,
      provenance:
        'Thread B coherence score vs shuffle null. Metaphor/research overlay — not GCP=CMB.',
      payload: {
        z: state.coherenceZ,
        score: state.coherenceScore,
        phase: state.timePhase,
      },
    });
  }

  for (const ds of active) {
    if (ds.claims) {
      for (const c of ds.claims.slice(0, 40)) {
        const feat = textEmbed(c.text);
        nodes.push({
          id: `${ds.id}-claim-${c.id}`,
          label: c.text.slice(0, 36) + (c.text.length > 36 ? '…' : ''),
          kind: 'text-claim',
          datasetId: ds.id,
          epistemic: ds.epistemic,
          features: feat,
          x: 0,
          y: 0,
          pullA: 0,
          pullB: 0,
          provenance: `Text claim from "${ds.name}"`,
          payload: { text: c.text },
        });
      }
    }

    if (ds.skySamples && ds.skySamples.length) {
      // Cluster into up to 24 representative samples
      const step = Math.max(1, Math.floor(ds.skySamples.length / 24));
      for (let i = 0; i < ds.skySamples.length; i += step) {
        const s = ds.skySamples[i]!;
        const theta = s.theta ?? Math.PI / 2;
        const phi = s.phi ?? 0;
        const feat = numericEmbed(
          [theta, phi, s.value, Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi)],
          EMBED_DIM
        );
        nodes.push({
          id: `${ds.id}-sky-${i}`,
          label: `sky ${s.value.toFixed(2)}`,
          kind: 'sky-sample',
          datasetId: ds.id,
          epistemic: ds.epistemic,
          features: feat,
          x: 0,
          y: 0,
          pullA: 0,
          pullB: 0,
          provenance: `Sky sample from "${ds.name}" @ θ=${theta.toFixed(3)}, φ=${phi.toFixed(3)}`,
          skyHint: { theta, phi, weight: Math.abs(s.value) },
          payload: s,
        });
      }
    }

    if (ds.series && ds.series.length) {
      const st = windowStats(ds.series, state.timePhase);
      const feat = numericEmbed([st.mean, st.std, st.slope, state.timePhase, state.coherenceZ], EMBED_DIM);
      const te = textEmbed(`time series window ${ds.name} coherence`);
      for (let i = 0; i < EMBED_DIM; i++) feat[i] = 0.7 * feat[i]! + 0.3 * te[i]!;
      nodes.push({
        id: `${ds.id}-ts-window`,
        label: `${ds.name} window`,
        kind: 'time-series-window',
        datasetId: ds.id,
        epistemic: ds.epistemic,
        features: feat,
        x: 0,
        y: 0,
        pullA: 0,
        pullB: Math.min(1, Math.abs(st.mean) / (st.std * 2 + 1e-6)),
        provenance: `Time-series window from "${ds.name}" at phase=${state.timePhase.toFixed(2)}`,
        payload: { ...st, n: ds.series.length },
      });
    }

    if (ds.cl && ds.cl.length) {
      const feat = ellEnergyFeatures(ds.cl, Math.min(state.ellMax, ds.cl.length - 1));
      nodes.push({
        id: `${ds.id}-cl`,
        label: `${ds.name} C_ℓ`,
        kind: 'multipole-bin',
        datasetId: ds.id,
        epistemic: ds.epistemic,
        features: feat,
        x: 0,
        y: 0,
        pullA: 0.8,
        pullB: 0.1,
        provenance: `Ingested C_ℓ from "${ds.name}"`,
        ellBand: { lo: 2, hi: Math.min(state.ellMax, ds.cl.length - 1) },
        payload: { clLen: ds.cl.length },
      });
    }

    if (ds.alm && ds.alm.length) {
      const byEll = new Map<number, number>();
      for (const a of ds.alm) {
        byEll.set(a.ell, (byEll.get(a.ell) ?? 0) + a.a * a.a);
      }
      const ells = [...byEll.keys()].sort((a, b) => a - b).slice(0, 12);
      for (const ell of ells) {
        const feat = numericEmbed([ell, byEll.get(ell)!, state.ellFocus], EMBED_DIM);
        nodes.push({
          id: `${ds.id}-alm-${ell}`,
          label: `a_ℓm ℓ=${ell}`,
          kind: 'alm-mode',
          datasetId: ds.id,
          epistemic: ds.epistemic,
          features: feat,
          x: 0,
          y: 0,
          pullA: 1 / (1 + Math.abs(ell - state.ellFocus)),
          pullB: 0.05,
          provenance: `a_ℓm power at ℓ=${ell} from "${ds.name}"`,
          ellBand: { lo: ell, hi: ell },
          payload: { ell, power: byEll.get(ell) },
        });
      }
    }
  }

  // Convergence pulls: correlate node features with Thread A energy vector & Thread B
  const threadAFeat =
    nodes.find((n) => n.id.startsWith('threadA-ell-'))?.features ??
    ellEnergyFeatures(state.Cl, state.ellMax);
  const threadBFeat =
    nodes.find((n) => n.id === 'threadB-coherence')?.features ??
    numericEmbed([state.coherenceZ], EMBED_DIM);

  for (const n of nodes) {
    if (n.datasetId === 'thread-a' || n.datasetId === 'thread-b') continue;
    const simA = Math.max(0, cosine(n.features, threadAFeat));
    const simB = Math.max(0, cosine(n.features, threadBFeat));
    // Boost if ell band near focus
    let bandBoost = 0;
    if (n.ellBand) {
      const mid = (n.ellBand.lo + n.ellBand.hi) / 2;
      bandBoost = 1 / (1 + Math.abs(mid - state.ellFocus) / 4);
    }
    n.pullA = Math.min(1, 0.55 * simA + 0.45 * bandBoost + n.pullA * 0.2);
    n.pullB = Math.min(1, 0.7 * simB + 0.3 * Math.abs(state.coherenceZ) / 4 + n.pullB * 0.2);
  }

  // Edges: similarity + shared multipole
  const edges: MeaningEdge[] = [];
  const edgeIdx: { i: number; j: number; w: number }[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      let w = Math.max(0, cosine(a.features, b.features));
      let reason: MeaningEdge['reason'] = 'similarity';
      if (
        a.ellBand &&
        b.ellBand &&
        !(a.ellBand.hi < b.ellBand.lo || b.ellBand.hi < a.ellBand.lo)
      ) {
        w = Math.max(w, 0.55);
        reason = 'shared-multipole';
      }
      if (a.datasetId === b.datasetId && a.datasetId !== 'thread-a' && a.datasetId !== 'thread-b') {
        w = Math.max(w, 0.35);
        reason = 'co-occurrence';
      }
      // Thread pull edges
      if (
        (a.kind === 'multipole-bin' && a.datasetId === 'thread-a' && b.pullA > 0.55) ||
        (b.kind === 'multipole-bin' && b.datasetId === 'thread-a' && a.pullA > 0.55)
      ) {
        w = Math.max(w, 0.5);
        reason = 'thread-pull';
      }
      if (
        (a.kind === 'coherence-metric' && b.pullB > 0.5) ||
        (b.kind === 'coherence-metric' && a.pullB > 0.5)
      ) {
        w = Math.max(w, 0.45);
        reason = 'thread-pull';
      }
      if (w >= 0.32) {
        edges.push({ source: a.id, target: b.id, weight: w, reason });
        edgeIdx.push({ i, j, w });
      }
    }
  }

  // Layout
  const feats = nodes.map((n) => n.features);
  let positions = pca2d(feats);
  if (positions.length === nodes.length) {
    positions = forceLayout(positions, edgeIdx, 45);
    for (let i = 0; i < nodes.length; i++) {
      nodes[i]!.x = positions[i]!.x;
      nodes[i]!.y = positions[i]!.y;
    }
  }

  return { nodes, edges };
}

export function kindColor(kind: NodeKind): string {
  switch (kind) {
    case 'multipole-bin':
      return '#4ade80';
    case 'coherence-metric':
      return '#fbbf24';
    case 'text-claim':
      return '#c84db8';
    case 'sky-sample':
      return '#6eb6ff';
    case 'time-series-window':
      return '#3dd6c3';
    case 'alm-mode':
      return '#ff9f43';
    case 'series-point':
      return '#8a9bb8';
    default:
      return '#e4ecf8';
  }
}

/** Soft highlight samples on Mollweide from selected / high-pull nodes */
export function skyHighlightsFromNodes(
  nodes: MeaningNode[],
  selectedId: string | null
): { theta: number; phi: number; weight: number }[] {
  const out: { theta: number; phi: number; weight: number }[] = [];
  for (const n of nodes) {
    if (!n.skyHint) continue;
    const sel = selectedId === n.id ? 1.5 : 0;
    const w = (n.skyHint.weight ?? 1) * (0.35 + n.pullA + n.pullB + sel);
    if (w < 0.4 && selectedId !== n.id) continue;
    out.push({ theta: n.skyHint.theta, phi: n.skyHint.phi, weight: w });
  }
  // If a multipole/text node selected with no sky hint, no highlights
  return out;
}
