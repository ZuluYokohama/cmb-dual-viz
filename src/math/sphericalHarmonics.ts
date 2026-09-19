/**
 * Real spherical harmonics Y_ℓ^m for CMB-like anisotropy synthesis.
 * Physics-backed: standard associated Legendre / real Y_lm basis.
 * C_ℓ shape is EXAMPLE (toy) — never present as measured Planck/GCP data.
 */

/** Factorial with caching for small n */
const factCache: number[] = [1];
function factorial(n: number): number {
  while (factCache.length <= n) {
    factCache.push(factCache[factCache.length - 1]! * factCache.length);
  }
  return factCache[n]!;
}

/**
 * Associated Legendre P_ℓ^m(x) for m ≥ 0, |x| ≤ 1.
 */
export function associatedLegendre(ell: number, m: number, x: number): number {
  if (m < 0 || m > ell) return 0;
  const xClamped = Math.max(-1, Math.min(1, x));

  let pmm = 1;
  if (m > 0) {
    const somx2 = Math.sqrt((1 - xClamped) * (1 + xClamped));
    let fact = 1;
    for (let i = 1; i <= m; i++) {
      pmm *= -fact * somx2;
      fact += 2;
    }
  }
  if (ell === m) return pmm;

  let pmmp1 = xClamped * (2 * m + 1) * pmm;
  if (ell === m + 1) return pmmp1;

  let pll = 0;
  for (let ll = m + 2; ll <= ell; ll++) {
    pll = ((2 * ll - 1) * xClamped * pmmp1 - (ll + m - 1) * pmm) / (ll - m);
    pmm = pmmp1;
    pmmp1 = pll;
  }
  return pll;
}

/** Normalization N_ℓ^m for real spherical harmonics */
export function normFactor(ell: number, m: number): number {
  const absM = Math.abs(m);
  const num = (2 * ell + 1) * factorial(ell - absM);
  const den = 4 * Math.PI * factorial(ell + absM);
  const base = Math.sqrt(num / den);
  if (m === 0) return base;
  return base * Math.SQRT2;
}

/**
 * Real spherical harmonic Y_ℓ^m(θ, φ).
 * θ = colatitude [0, π], φ = longitude [0, 2π)
 */
export function realYlm(ell: number, m: number, theta: number, phi: number): number {
  const absM = Math.abs(m);
  const x = Math.cos(theta);
  const P = associatedLegendre(ell, absM, x);
  const N = normFactor(ell, m);
  if (m > 0) return N * P * Math.cos(absM * phi);
  if (m < 0) return N * P * Math.sin(absM * phi);
  return N * P;
}

/** Seeded PRNG (mulberry32) for reproducible maps */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller Gaussian from PRNG */
export function gaussian(rng: () => number): number {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * EXAMPLE acoustic-peak style C_ℓ (toy amplitudes, not Planck data).
 *
 * Interactive range (ℓ ≲ 64) uses a *compressed* acoustic ladder so peaks
 * are visible on the instrument: ≈ ℓ 8, 22, 38, 52 (EXAMPLE positions).
 * A residual high-ℓ hint toward classical ≈220/540/800 is included for
 * documentation when ellMax is raised, still marked EXAMPLE.
 *
 * NEVER treat these numbers as measured.
 */
export function exampleCl(ell: number): number {
  if (ell < 2) return 0;

  // Sachs-Wolfe-ish plateau envelope
  const plateau = 1.15 / (ell * (ell + 1));

  // Sharper compressed acoustic peaks (EXAMPLE — toy interactive range)
  const peak1 = 4.2 * Math.exp(-0.5 * ((ell - 8) / 2.2) ** 2);
  const peak2 = 2.8 * Math.exp(-0.5 * ((ell - 22) / 3.4) ** 2);
  const peak3 = 1.9 * Math.exp(-0.5 * ((ell - 38) / 4.2) ** 2);
  const peak4 = 1.2 * Math.exp(-0.5 * ((ell - 52) / 5.0) ** 2);

  // Subtle classical-position ghosts (only matter if ellMax is huge; still EXAMPLE)
  const ghost1 = 0.15 * Math.exp(-0.5 * ((ell - 220) / 40) ** 2);
  const ghost2 = 0.08 * Math.exp(-0.5 * ((ell - 540) / 55) ** 2);

  const damping = Math.exp(-((ell / 95) ** 1.6));
  const osc =
    1 +
    0.12 * Math.cos((ell - 8) * 0.55) * Math.exp(-(((ell - 25) / 40) ** 2));

  const raw =
    (plateau * 900 + peak1 + peak2 + peak3 + peak4 + ghost1 + ghost2) * damping * osc;

  // Convert toward a D_ℓ-friendly C_ℓ magnitude
  const scale = (ell * (ell + 1)) / (2 * Math.PI);
  return raw / Math.max(1, scale / 55);
}

export interface HarmonicCoeff {
  ell: number;
  m: number;
  a: number;
}

/**
 * Draw Gaussian a_ℓm from C_ℓ for ℓ=2..ellMax.
 * Mode amplitudes can be scaled per-ℓ via ampScale[ell].
 */
export function drawCoefficients(
  ellMax: number,
  seed: number,
  ampScale: Record<number, number> = {}
): { coeffs: HarmonicCoeff[]; Cl: number[] } {
  const rng = mulberry32(seed);
  const coeffs: HarmonicCoeff[] = [];
  const Cl: number[] = new Array(ellMax + 1).fill(0);

  for (let ell = 2; ell <= ellMax; ell++) {
    const cl = exampleCl(ell) * (ampScale[ell] ?? 1);
    Cl[ell] = cl;
    const sigma = Math.sqrt(Math.max(cl, 1e-30));
    for (let m = -ell; m <= ell; m++) {
      coeffs.push({ ell, m, a: sigma * gaussian(rng) });
    }
  }
  return { coeffs, Cl };
}

/** Evaluate temperature anisotropy at (θ, φ) from coefficients. */
export function evaluateMap(
  coeffs: HarmonicCoeff[],
  theta: number,
  phi: number
): number {
  let sum = 0;
  for (const c of coeffs) {
    sum += c.a * realYlm(c.ell, c.m, theta, phi);
  }
  return sum;
}

/**
 * Adaptive grid resolution for interactivity at higher ℓ.
 */
export function adaptiveGridSize(ellMax: number): { nTheta: number; nPhi: number } {
  if (ellMax <= 16) return { nTheta: 90, nPhi: 180 };
  if (ellMax <= 32) return { nTheta: 72, nPhi: 144 };
  if (ellMax <= 48) return { nTheta: 60, nPhi: 120 };
  return { nTheta: 48, nPhi: 96 };
}

/**
 * Precompute map on a θ-φ grid.
 * Optimized: cache associated Legendres per θ-row; reuse trig in φ.
 */
export function synthesizeGrid(
  coeffs: HarmonicCoeff[],
  nTheta: number,
  nPhi: number
): Float32Array {
  const grid = new Float32Array(nTheta * nPhi);
  if (!coeffs.length) return grid;

  let ellMax = 0;
  for (const c of coeffs) if (c.ell > ellMax) ellMax = c.ell;

  // Group coeffs by (ell, |m|) for shared P_lm
  type Entry = { ell: number; m: number; a: number; N: number };
  const entries: Entry[] = coeffs.map((c) => ({
    ell: c.ell,
    m: c.m,
    a: c.a,
    N: normFactor(c.ell, c.m),
  }));

  // Precompute cos(mφ), sin(mφ) for m=0..ellMax
  const cosM = new Float32Array((ellMax + 1) * nPhi);
  const sinM = new Float32Array((ellMax + 1) * nPhi);
  for (let ip = 0; ip < nPhi; ip++) {
    const phi = (2 * Math.PI * ip) / nPhi;
    for (let m = 0; m <= ellMax; m++) {
      cosM[m * nPhi + ip] = Math.cos(m * phi);
      sinM[m * nPhi + ip] = Math.sin(m * phi);
    }
  }

  for (let it = 0; it < nTheta; it++) {
    const theta = (Math.PI * (it + 0.5)) / nTheta;
    const x = Math.cos(theta);
    // Cache P_ell^m(x) for this row
    const Pcache = new Float32Array((ellMax + 1) * (ellMax + 1));
    for (let ell = 0; ell <= ellMax; ell++) {
      for (let m = 0; m <= ell; m++) {
        Pcache[ell * (ellMax + 1) + m] = associatedLegendre(ell, m, x);
      }
    }

    for (let ip = 0; ip < nPhi; ip++) {
      let sum = 0;
      for (const c of entries) {
        const absM = Math.abs(c.m);
        const P = Pcache[c.ell * (ellMax + 1) + absM]!;
        let ang: number;
        if (c.m > 0) ang = cosM[absM * nPhi + ip]!;
        else if (c.m < 0) ang = sinM[absM * nPhi + ip]!;
        else ang = 1;
        sum += c.a * c.N * P * ang;
      }
      grid[it * nPhi + ip] = sum;
    }
  }
  return grid;
}
