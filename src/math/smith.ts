/**
 * Smith-chart Möbius math + DERIVED z mapping from dual-thread / meaning-map state.
 *
 * RF topology (real):
 *   Γ = (z − 1) / (z + 1),  z = (1 + Γ) / (1 − Γ)
 *   unit disk |Γ| ≤ 1 for Re(z) ≥ 0; MATCH at Γ = 0; |Γ| = 1 = total reflection.
 *   SWR = (1+|Γ|)/(1−|Γ|) for |Γ| < 1.
 *
 * Mapping from CMB/coherence/meaning features → z is DERIVED analogy only —
 * not measured Z0, not EW/SDR claims, not proof of non-local effects.
 * Research labels from the strategic PDF (quantum log-derivative isomorphism,
 * “minimize reflection / maximize transfer”) are analogy tags only.
 */

export interface Complex {
  re: number;
  im: number;
}

export interface SmithState {
  z: Complex;
  gamma: Complex;
  magGamma: number;
  swr: number | null;
  r: number;
  x: number;
  /** 0 = rim (mismatched), 1 = center (matched) after toy control law */
  matchPull: number;
  source: 'dual-thread' | 'meaning-node';
  mappingNote: string;
}

export interface TransferArc {
  from: Complex;
  to: Complex;
  weight: number;
  label?: string;
}

const EPS = 1e-12;

export function cAdd(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}

export function cSub(a: Complex, b: Complex): Complex {
  return { re: a.re - b.re, im: a.im - b.im };
}

export function cMul(a: Complex, b: Complex): Complex {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}

export function cDiv(a: Complex, b: Complex): Complex {
  const d = b.re * b.re + b.im * b.im;
  if (d < EPS) return { re: Number.POSITIVE_INFINITY, im: 0 };
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
}

export function cAbs(a: Complex): number {
  return Math.hypot(a.re, a.im);
}

export function cLerp(a: Complex, b: Complex, t: number): Complex {
  return { re: a.re + (b.re - a.re) * t, im: a.im + (b.im - a.im) * t };
}

/** Möbius: normalized impedance z → reflection coefficient Γ */
export function zToGamma(z: Complex): Complex {
  return cDiv(cSub(z, { re: 1, im: 0 }), cAdd(z, { re: 1, im: 0 }));
}

/** Inverse Möbius: Γ → z */
export function gammaToZ(g: Complex): Complex {
  return cDiv(cAdd({ re: 1, im: 0 }, g), cSub({ re: 1, im: 0 }, g));
}

export function magGamma(g: Complex): number {
  return cAbs(g);
}

/** Standing-wave ratio (toy readout). null if |Γ| ≥ 1 */
export function swrFromGamma(g: Complex): number | null {
  const m = cAbs(g);
  if (m >= 1 - 1e-9) return null;
  return (1 + m) / (1 - m);
}

/** Interpolate a path of Γ points (chordal in Γ-plane) */
export function interpolateGammaPath(points: Complex[], samplesPerSeg = 8): Complex[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [{ ...points[0]! }];
  const out: Complex[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    for (let s = 0; s < samplesPerSeg; s++) {
      out.push(cLerp(a, b, s / samplesPerSeg));
    }
  }
  out.push({ ...points[points.length - 1]! });
  return out;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function soft01(v: number): number {
  return 1 / (1 + Math.exp(-v));
}

export interface DualThreadSmithInput {
  /** Realized C_ℓ (index = ℓ) */
  Cl: number[];
  ellFocus: number;
  ellMax: number;
  /** Coherence autocorr score */
  coherenceScore: number;
  /** Coherence z vs null */
  coherenceZ: number;
  /** Optional series drive at scrub (−∞..∞-ish) */
  seriesDrive: number;
  /** Mean Thread A / B pull over meaning nodes (0..1) */
  meanPullA: number;
  meanPullB: number;
  /** Time scrub 0..1 — mild modulation only */
  timePhase: number;
}

/**
 * DERIVED EXAMPLE mapping: Thread A multipole energy → r, Thread B coherence → x.
 * Then optional toy “convergence” blends toward matched z = 1 (Γ = 0).
 */
export function dualThreadToZ(input: DualThreadSmithInput): {
  zRaw: Complex;
  z: Complex;
  matchPull: number;
  mappingNote: string;
} {
  const { Cl, ellFocus, ellMax, coherenceScore, coherenceZ, seriesDrive, meanPullA, meanPullB, timePhase } =
    input;

  // Focus-band power (D_ℓ style) vs mean band energy → normalize to ~[0,1]
  const lo = Math.max(2, ellFocus - 2);
  const hi = Math.min(ellMax, ellFocus + 2);
  let focusE = 0;
  let n = 0;
  for (let ell = lo; ell <= hi; ell++) {
    focusE += (ell * (ell + 1) * (Cl[ell] ?? 0)) / (2 * Math.PI);
    n++;
  }
  focusE /= Math.max(1, n);

  let allE = 0;
  let nAll = 0;
  for (let ell = 2; ell <= ellMax; ell++) {
    allE += (ell * (ell + 1) * (Cl[ell] ?? 0)) / (2 * Math.PI);
    nAll++;
  }
  const meanE = allE / Math.max(1, nAll);
  const eNorm = clamp(focusE / Math.max(1e-9, meanE * 1.4), 0, 2) / 2;

  // Resistance-like: low energy → high |Γ| (mismatched), mid energy → nearer match
  const r = clamp(0.2 + 2.2 * eNorm + 0.15 * Math.sin(timePhase * Math.PI * 2), 0.08, 4.5);

  // Reactance-like from coherence score / z and series drive
  const cNorm = soft01((coherenceScore - 0.02) * 40) - 0.5; // ~[-0.5,0.5]
  const zN = clamp(coherenceZ / 4, -1.2, 1.2);
  const drive = clamp(seriesDrive * 0.35, -1.5, 1.5);
  const x = clamp(2.4 * cNorm + 1.1 * zN + 0.55 * drive, -3.5, 3.5);

  const zRaw: Complex = { re: r, im: x };

  // Toy control law: strong dual-thread convergence pulls Γ toward center (matched)
  const matchPull = clamp(0.55 * meanPullA + 0.45 * meanPullB, 0, 1);
  const matched: Complex = { re: 1, im: 0 };
  const z = cLerp(zRaw, matched, matchPull * 0.72);

  const mappingNote =
    `DERIVED: r ← focus-ℓ band power (ℓ=${ellFocus}±2) / mean D_ℓ; ` +
    `x ← coherence score + z + series drive; ` +
    `toy match-pull ← mean(pullA,pullB) blends z→1. Not measured Z₀.`;

  return { zRaw, z, matchPull, mappingNote };
}

export interface NodeSmithInput {
  /** Embedding / feature vector */
  features: Float32Array | number[];
  pullA: number;
  pullB: number;
  kind?: string;
}

/** Map selected meaning-map node features → normalized z (DERIVED) */
export function nodeFeaturesToZ(node: NodeSmithInput): {
  zRaw: Complex;
  z: Complex;
  matchPull: number;
  mappingNote: string;
} {
  const f = node.features;
  const f0 = f[0] ?? 0;
  const f1 = f[1] ?? 0;
  const f2 = f[2] ?? 0;
  // Features are roughly unit-ish from embedding; map to positive r and bipolar x
  const r = clamp(0.25 + 1.8 * soft01(f0 * 3) + 0.4 * soft01(f2 * 2), 0.1, 4);
  const x = clamp(2.8 * Math.tanh(f1 * 2.2) + 0.6 * Math.tanh((f[3] ?? 0) * 2), -3.5, 3.5);
  const zRaw: Complex = { re: r, im: x };
  const matchPull = clamp(0.5 * node.pullA + 0.5 * node.pullB, 0, 1);
  const z = cLerp(zRaw, { re: 1, im: 0 }, matchPull * 0.65);
  const mappingNote =
    `DERIVED: selected node (${node.kind ?? 'node'}) features[0..3] → (r,x); ` +
    `pullA/B blend toward match. Not measured impedance.`;
  return { zRaw, z, matchPull, mappingNote };
}

export function buildSmithState(
  z: Complex,
  matchPull: number,
  source: SmithState['source'],
  mappingNote: string
): SmithState {
  const gamma = zToGamma(z);
  const mag = magGamma(gamma);
  return {
    z,
    gamma,
    magGamma: mag,
    swr: swrFromGamma(gamma),
    r: z.re,
    x: z.im,
    matchPull,
    source,
    mappingNote,
  };
}

/** Constant-r circles in Γ-plane (center, radius) for r ≥ 0 */
export function constRCircle(r: number): { cx: number; cy: number; rad: number } {
  const cx = r / (r + 1);
  const rad = 1 / (r + 1);
  return { cx, cy: 0, rad };
}

/**
 * Constant-x arcs in Γ-plane.
 * Circle center (1, 1/x), radius |1/x|; clipped to unit disk.
 */
export function constXCircle(x: number): { cx: number; cy: number; rad: number } | null {
  if (Math.abs(x) < 1e-9) return null;
  const cy = 1 / x;
  const rad = Math.abs(1 / x);
  return { cx: 1, cy, rad };
}

/**
 * Sample points on a const-x arc inside the unit circle.
 */
export function sampleConstXArc(x: number, n = 64): Complex[] {
  const circ = constXCircle(x);
  if (!circ) {
    // x=0 → real axis from Γ=-1 to 1
    const pts: Complex[] = [];
    for (let i = 0; i <= n; i++) {
      pts.push({ re: -1 + (2 * i) / n, im: 0 });
    }
    return pts;
  }
  // Sweep circle; keep samples inside/on the unit disk (Re(z)≥0 image)
  const pts: Complex[] = [];
  const steps = n * 3;
  for (let i = 0; i <= steps; i++) {
    const ang = (2 * Math.PI * i) / steps;
    const re = circ.cx + circ.rad * Math.cos(ang);
    const im = circ.cy + circ.rad * Math.sin(ang);
    if (re * re + im * im <= 1.002) {
      pts.push({ re, im });
    }
  }
  // Order along the arc by angle around the const-x circle center
  pts.sort((a, b) => {
    const aa = Math.atan2(a.im - circ.cy, a.re - circ.cx);
    const bb = Math.atan2(b.im - circ.cy, b.re - circ.cx);
    return aa - bb;
  });
  return pts;
}
