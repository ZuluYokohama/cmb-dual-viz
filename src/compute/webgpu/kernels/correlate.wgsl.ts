/**
 * CORRELATE_BATCH WGSL — primary TP_PAIR_BLOCK, nested TP_LAG_SLICE.
 *
 * Workgroup: (32, 1, 1)
 *   - each workgroup = one (i,j) pair in a pair-block
 *   - threads slice lag index ranges; shared-memory reduce → best |r| + lag
 *
 * Input series packed as X[nSeries * tLen] row-major f32 (already aligned).
 * pairs: u32 pairs as (i, j) packed in u32x2 or two u32 arrays.
 *
 * f32 only.
 */

export const CORR_WG = 32;

export const CORRELATE_PAIR_LAG_WGSL = /* wgsl */ `
struct Params {
  nPairs: u32,
  tLen: u32,
  maxLag: u32,
  nSeries: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> series: array<f32>;       // nSeries * tLen
@group(0) @binding(2) var<storage, read> pairIndex: array<u32>;   // 2 * nPairs (i,j)
@group(0) @binding(3) var<storage, read_write> outScore: array<f32>; // nPairs
@group(0) @binding(4) var<storage, read_write> outLag: array<i32>;   // nPairs

var<workgroup> bestAbs: array<f32, ${CORR_WG}>;
var<workgroup> bestSigned: array<f32, ${CORR_WG}>;
var<workgroup> bestLag: array<i32, ${CORR_WG}>;

fn pearson_slice(ia: u32, ib: u32, a0: u32, b0: u32, n: u32) -> f32 {
  if (n < 4u) { return 0.0; }
  var ma = 0.0;
  var mb = 0.0;
  for (var k = 0u; k < n; k++) {
    ma = ma + series[ia * params.tLen + a0 + k];
    mb = mb + series[ib * params.tLen + b0 + k];
  }
  let nf = f32(n);
  ma = ma / nf;
  mb = mb / nf;
  var num = 0.0;
  var da = 0.0;
  var db = 0.0;
  for (var k = 0u; k < n; k++) {
    let xa = series[ia * params.tLen + a0 + k] - ma;
    let xb = series[ib * params.tLen + b0 + k] - mb;
    num = num + xa * xb;
    da = da + xa * xa;
    db = db + xb * xb;
  }
  let den = sqrt(da * db);
  if (den < 1e-12) { return 0.0; }
  return num / den;
}

@compute @workgroup_size(${CORR_WG}, 1, 1)
fn main(
  @builtin(workgroup_id) wid: vec3u,
  @builtin(local_invocation_id) lid: vec3u,
) {
  let pair = wid.x;
  let lane = lid.x;
  if (pair >= params.nPairs) { return; }

  let ia = pairIndex[pair * 2u];
  let ib = pairIndex[pair * 2u + 1u];
  let lim = min(params.maxLag, params.tLen / 3u);

  // Nested TP_LAG_SLICE: lane covers lag subset
  var localBestAbs = -1.0;
  var localBestSigned = 0.0;
  var localBestLag = 0;

  // lag from -lim..lim inclusive → total 2*lim+1 values, striped by lane
  let nLags = 2u * lim + 1u;
  var li = lane;
  loop {
    if (li >= nLags) { break; }
    let lag = i32(li) - i32(lim);
    var a0: u32;
    var b0: u32;
    var n: u32;
    if (lag >= 0) {
      let lg = u32(lag);
      a0 = 0u;
      b0 = lg;
      n = params.tLen - lg;
    } else {
      let lg = u32(-lag);
      a0 = lg;
      b0 = 0u;
      n = params.tLen - lg;
    }
    let s = pearson_slice(ia, ib, a0, b0, n);
    let ab = abs(s);
    if (ab > localBestAbs) {
      localBestAbs = ab;
      localBestSigned = s;
      localBestLag = lag;
    }
    li = li + ${CORR_WG}u;
  }

  bestAbs[lane] = localBestAbs;
  bestSigned[lane] = localBestSigned;
  bestLag[lane] = localBestLag;
  workgroupBarrier();

  // Deterministic reduce: prefer larger |r|; tie → smaller lag index order (lane then lag)
  if (lane == 0u) {
    var bAbs = bestAbs[0];
    var bSigned = bestSigned[0];
    var bLag = bestLag[0];
    for (var i = 1u; i < ${CORR_WG}u; i++) {
      if (bestAbs[i] > bAbs) {
        bAbs = bestAbs[i];
        bSigned = bestSigned[i];
        bLag = bestLag[i];
      }
    }
    outScore[pair] = bSigned;
    outLag[pair] = bLag;
  }
}
`;
