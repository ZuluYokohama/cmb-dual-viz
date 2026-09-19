/**
 * SH_SYNTH WGSL — primary TP_ELL_BAND (coeff bands in dispatch Z), nested TP_PIX_TILE.
 *
 * Pass A (band): workgroup (8,8,1) — each WG covers an 8×8 pixel tile × one ℓ-band;
 * writes partialSky[band * nPix + pix].
 * Pass B (reduce): workgroup (64,1,1) — ordered sum over bands → sky.
 *
 * f32 only. Deterministic ordered band reduce (ascending band index).
 */

export const SH_TILE_WG = 8;
export const SH_REDUCE_WG = 64;

export const SH_SYNTH_BAND_WGSL = /* wgsl */ `
struct Params {
  nTheta: u32,
  nPhi: u32,
  ellMax: u32,
  nCoeffs: u32,
  nBands: u32,
  bandEll0: u32,
  bandEll1: u32,
  _pad: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> coeffs: array<vec4f>; // ell, m, a, N
@group(0) @binding(2) var<storage, read_write> partial: array<f32>;

fn associated_legendre(ell: u32, m: u32, x: f32) -> f32 {
  if (m > ell) { return 0.0; }
  let xc = clamp(x, -1.0, 1.0);
  var pmm = 1.0;
  if (m > 0u) {
    let somx2 = sqrt(max(0.0, (1.0 - xc) * (1.0 + xc)));
    var fact = 1.0;
    for (var i = 1u; i <= m; i++) {
      pmm = pmm * (-fact * somx2);
      fact = fact + 2.0;
    }
  }
  if (ell == m) { return pmm; }
  var pmmp1 = xc * f32(2u * m + 1u) * pmm;
  if (ell == m + 1u) { return pmmp1; }
  var pll = 0.0;
  var pmm_v = pmm;
  var pmmp1_v = pmmp1;
  for (var ll = m + 2u; ll <= ell; ll++) {
    pll = (f32(2u * ll - 1u) * xc * pmmp1_v - f32(ll + m - 1u) * pmm_v) / f32(ll - m);
    pmm_v = pmmp1_v;
    pmmp1_v = pll;
  }
  return pll;
}

@compute @workgroup_size(${SH_TILE_WG}, ${SH_TILE_WG}, 1)
fn main(
  @builtin(global_invocation_id) gid: vec3u,
  @builtin(workgroup_id) wid: vec3u,
) {
  let ip = gid.x;
  let it = gid.y;
  let band = wid.z;
  if (ip >= params.nPhi || it >= params.nTheta || band >= params.nBands) {
    return;
  }

  let ellSpan = max(1u, params.bandEll1 - params.bandEll0 + 1u);
  let perBand = max(1u, (ellSpan + params.nBands - 1u) / params.nBands);
  let ellLo = params.bandEll0 + band * perBand;
  let ellHi = min(params.bandEll1, ellLo + perBand - 1u);
  if (ellLo > params.bandEll1) {
    let pix = it * params.nPhi + ip;
    let nPix = params.nTheta * params.nPhi;
    partial[band * nPix + pix] = 0.0;
    return;
  }

  let theta = 3.14159265358979323846 * (f32(it) + 0.5) / f32(params.nTheta);
  let phi = 6.28318530717958647692 * f32(ip) / f32(params.nPhi);
  let x = cos(theta);

  var sum = 0.0;
  // Deterministic coeff order (ascending index); skip ell outside band
  for (var ci = 0u; ci < params.nCoeffs; ci++) {
    let c = coeffs[ci];
    let ell = u32(round(c.x));
    if (ell < ellLo || ell > ellHi) { continue; }
    let mSigned = i32(round(c.y));
    let a = c.z;
    let N = c.w;
    let absM = u32(abs(mSigned));
    let P = associated_legendre(ell, absM, x);
    var ang = 1.0;
    if (mSigned > 0) {
      ang = cos(f32(absM) * phi);
    } else if (mSigned < 0) {
      ang = sin(f32(absM) * phi);
    }
    sum = sum + a * N * P * ang;
  }

  let pix = it * params.nPhi + ip;
  let nPix = params.nTheta * params.nPhi;
  partial[band * nPix + pix] = sum;
}
`;

export const SH_REDUCE_WGSL = /* wgsl */ `
struct Params {
  nPix: u32,
  nBands: u32,
  _p2: u32,
  _p3: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> partial: array<f32>;
@group(0) @binding(2) var<storage, read_write> sky: array<f32>;

@compute @workgroup_size(${SH_REDUCE_WG}, 1, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let pix = gid.x;
  if (pix >= params.nPix) { return; }
  var s = 0.0;
  for (var b = 0u; b < params.nBands; b++) {
    s = s + partial[b * params.nPix + pix];
  }
  sky[pix] = s;
}
`;
