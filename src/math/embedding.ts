/**
 * Lightweight text + numeric embeddings for meaning-map projection.
 * Hash-projection + TF-IDF bag-of-words — no heavy ML deps.
 * Label: DERIVED/MEANING-MAP
 */

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'is', 'are', 'was',
  'be', 'as', 'by', 'with', 'that', 'this', 'it', 'from', 'at', 'not', 'but',
]);

export const EMBED_DIM = 24;

/** FNV-1a style hash → bucket */
function hashToken(tok: string, dim: number): number {
  let h = 2166136261;
  for (let i = 0; i < tok.length; i++) {
    h ^= tok.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % dim;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9ℓℓ+\-./]+/gi, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** Hash-projection embedding of a bag of tokens */
export function hashEmbed(tokens: string[], dim = EMBED_DIM): Float32Array {
  const v = new Float32Array(dim);
  if (!tokens.length) return v;
  for (const t of tokens) {
    const i = hashToken(t, dim);
    const sign = hashToken(t + '#', 2) === 0 ? 1 : -1;
    v[i]! += sign;
  }
  // L2 normalize
  let n = 0;
  for (let i = 0; i < dim; i++) n += v[i]! * v[i]!;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < dim; i++) v[i]! /= n;
  return v;
}

export function textEmbed(text: string, dim = EMBED_DIM): Float32Array {
  return hashEmbed(tokenize(text), dim);
}

/** Pack numeric features into fixed dim (pad/truncate + normalize) */
export function numericEmbed(values: number[], dim = EMBED_DIM): Float32Array {
  const v = new Float32Array(dim);
  const n = Math.min(values.length, dim);
  for (let i = 0; i < n; i++) v[i] = values[i] ?? 0;
  let mean = 0;
  for (let i = 0; i < dim; i++) mean += v[i]!;
  mean /= dim;
  let std = 0;
  for (let i = 0; i < dim; i++) {
    const d = v[i]! - mean;
    std += d * d;
  }
  std = Math.sqrt(std / dim) || 1;
  for (let i = 0; i < dim; i++) v[i] = (v[i]! - mean) / std;
  return v;
}

/** Cosine similarity */
export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d > 1e-12 ? dot / d : 0;
}

/**
 * Simple 2D PCA via power iteration on covariance (top-2 eigenvectors).
 * Returns [[x,y], ...] for each row of the feature matrix.
 */
export function pca2d(features: Float32Array[]): { x: number; y: number }[] {
  const n = features.length;
  if (n === 0) return [];
  const d = features[0]!.length;

  // Center
  const mean = new Float32Array(d);
  for (const f of features) {
    for (let j = 0; j < d; j++) mean[j]! += f[j]!;
  }
  for (let j = 0; j < d; j++) mean[j]! /= n;

  const centered = features.map((f) => {
    const c = new Float32Array(d);
    for (let j = 0; j < d; j++) c[j] = f[j]! - mean[j]!;
    return c;
  });

  const powerEigen = (avoid?: Float32Array): Float32Array => {
    const v = new Float32Array(d);
    for (let j = 0; j < d; j++) v[j] = Math.sin(j * 1.7 + 0.3);
    if (avoid) {
      // orthogonalize init
      let dot = 0;
      for (let j = 0; j < d; j++) dot += v[j]! * avoid[j]!;
      for (let j = 0; j < d; j++) v[j]! -= dot * avoid[j]!;
    }
    for (let iter = 0; iter < 40; iter++) {
      const w = new Float32Array(d);
      for (const c of centered) {
        let proj = 0;
        for (let j = 0; j < d; j++) proj += c[j]! * v[j]!;
        for (let j = 0; j < d; j++) w[j]! += proj * c[j]!;
      }
      if (avoid) {
        let dot = 0;
        for (let j = 0; j < d; j++) dot += w[j]! * avoid[j]!;
        for (let j = 0; j < d; j++) w[j]! -= dot * avoid[j]!;
      }
      let nn = 0;
      for (let j = 0; j < d; j++) nn += w[j]! * w[j]!;
      nn = Math.sqrt(nn) || 1;
      for (let j = 0; j < d; j++) v[j] = w[j]! / nn;
    }
    return v;
  };

  const e1 = powerEigen();
  const e2 = powerEigen(e1);

  const pts = centered.map((c) => {
    let x = 0;
    let y = 0;
    for (let j = 0; j < d; j++) {
      x += c[j]! * e1[j]!;
      y += c[j]! * e2[j]!;
    }
    return { x, y };
  });

  // Normalize to roughly [-1,1]
  let maxAbs = 1e-9;
  for (const p of pts) maxAbs = Math.max(maxAbs, Math.abs(p.x), Math.abs(p.y));
  for (const p of pts) {
    p.x /= maxAbs;
    p.y /= maxAbs;
  }
  return pts;
}

/** A few steps of force-directed refinement on top of PCA seed */
export function forceLayout(
  positions: { x: number; y: number }[],
  edges: { i: number; j: number; w: number }[],
  steps = 60
): { x: number; y: number }[] {
  const pos = positions.map((p) => ({ x: p.x, y: p.y }));
  const n = pos.length;
  if (n === 0) return pos;

  for (let s = 0; s < steps; s++) {
    const forces = pos.map(() => ({ x: 0, y: 0 }));
    // Repulsion
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = pos[i]!.x - pos[j]!.x;
        const dy = pos[i]!.y - pos[j]!.y;
        const dist2 = dx * dx + dy * dy + 0.01;
        const inv = 0.04 / dist2;
        forces[i]!.x += dx * inv;
        forces[i]!.y += dy * inv;
        forces[j]!.x -= dx * inv;
        forces[j]!.y -= dy * inv;
      }
    }
    // Attraction along edges
    for (const e of edges) {
      const dx = pos[e.j]!.x - pos[e.i]!.x;
      const dy = pos[e.j]!.y - pos[e.i]!.y;
      const k = 0.08 * e.w;
      forces[e.i]!.x += dx * k;
      forces[e.i]!.y += dy * k;
      forces[e.j]!.x -= dx * k;
      forces[e.j]!.y -= dy * k;
    }
    const cool = 1 - s / steps;
    for (let i = 0; i < n; i++) {
      pos[i]!.x += forces[i]!.x * 0.15 * cool;
      pos[i]!.y += forces[i]!.y * 0.15 * cool;
    }
  }

  let maxAbs = 1e-9;
  for (const p of pos) maxAbs = Math.max(maxAbs, Math.abs(p.x), Math.abs(p.y));
  for (const p of pos) {
    p.x /= maxAbs;
    p.y /= maxAbs;
  }
  return pos;
}
