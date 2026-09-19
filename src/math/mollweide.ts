/**
 * Mollweide equal-area projection helpers.
 */

const SQRT2 = Math.SQRT2;

function mollweideTheta(lat: number): number {
  if (Math.abs(lat) >= Math.PI / 2 - 1e-10) {
    return (Math.sign(lat) * Math.PI) / 2;
  }
  let theta = lat;
  for (let i = 0; i < 12; i++) {
    const d =
      (2 * theta + Math.sin(2 * theta) - Math.PI * Math.sin(lat)) /
      (4 * Math.cos(theta) ** 2);
    theta -= d;
    if (Math.abs(d) < 1e-10) break;
  }
  return theta;
}

/** Lon/lat (radians) → Mollweide (x, y). */
export function lonLatToMollweide(lon: number, lat: number): { x: number; y: number } {
  const theta = mollweideTheta(lat);
  return {
    x: ((2 * SQRT2) / Math.PI) * lon * Math.cos(theta),
    y: SQRT2 * Math.sin(theta),
  };
}

/**
 * Inverse: normalized Mollweide (nx, ny) in [-1,1]² → (θ, φ) or null outside ellipse.
 * θ = colatitude, φ = longitude [0, 2π)
 */
export function mollweideToThetaPhi(
  nx: number,
  ny: number
): { theta: number; phi: number } | null {
  const x = nx * 2 * SQRT2;
  const y = ny * SQRT2;
  const r2 = (x / (2 * SQRT2)) ** 2 + (y / SQRT2) ** 2;
  if (r2 > 1.001) return null;

  const asinArg = Math.max(-1, Math.min(1, y / SQRT2));
  const thetaAux = Math.asin(asinArg);
  const lat = Math.asin(
    Math.max(-1, Math.min(1, (2 * thetaAux + Math.sin(2 * thetaAux)) / Math.PI))
  );
  const cosT = Math.cos(thetaAux);
  const lon = cosT < 1e-12 ? 0 : (Math.PI * x) / (2 * SQRT2 * cosT);
  const lonClamped = Math.max(-Math.PI, Math.min(Math.PI, lon));

  const colatitude = Math.PI / 2 - lat;
  const phi = lonClamped < 0 ? lonClamped + 2 * Math.PI : lonClamped;
  return { theta: colatitude, phi };
}

export function inMollweideEllipse(nx: number, ny: number): boolean {
  return (nx * nx) / 4 + ny * ny <= 1.0001;
}
