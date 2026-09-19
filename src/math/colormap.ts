/** CMB-like diverging colormap (blue → white → red / Planck-ish) */

export function cmbColor(t: number): [number, number, number] {
  // t in [-1, 1] approx; clamp
  const x = Math.max(-1, Math.min(1, t));
  if (x < 0) {
    const u = -x;
    // deep blue → cyan → white
    const r = Math.floor(20 + 200 * (1 - u) + 35 * (1 - u) * (1 - u));
    const g = Math.floor(40 + 180 * (1 - u));
    const b = Math.floor(120 + 135 * (1 - u) * 0.3 + 100 * u);
    return [
      Math.min(255, Math.max(0, r)),
      Math.min(255, Math.max(0, g)),
      Math.min(255, x > -0.15 ? 220 : Math.min(255, b)),
    ];
  } else {
    const u = x;
    const r = Math.floor(220 + 35 * u);
    const g = Math.floor(220 - 160 * u);
    const b = Math.floor(220 - 200 * u);
    return [
      Math.min(255, r),
      Math.min(255, Math.max(0, g)),
      Math.min(255, Math.max(0, b)),
    ];
  }
}

/** Coherence overlay: teal → magenta through alpha */
export function coherenceColor(t: number, alpha: number): [number, number, number, number] {
  const x = Math.max(-1, Math.min(1, t));
  const a = Math.floor(Math.max(0, Math.min(1, alpha)) * 255 * (0.35 + 0.65 * Math.abs(x)));
  if (x >= 0) {
    return [40, 220, 200, a]; // teal-ish positive
  }
  return [200, 60, 180, a]; // magenta negative
}
