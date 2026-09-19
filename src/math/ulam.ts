/**
 * Ulam / prime spiral — geometric analogy panel only.
 * Not physics; visual metaphor for structured patterns in discrete space.
 */

export function isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n === 2 || n === 3) return true;
  if (n % 2 === 0 || n % 3 === 0) return false;
  for (let i = 5; i * i <= n; i += 6) {
    if (n % i === 0 || n % (i + 2) === 0) return false;
  }
  return true;
}

/** Generate Ulam spiral coordinates: index → (x, y) on square spiral */
export function ulamSpiralCoords(maxN: number): { n: number; x: number; y: number; prime: boolean }[] {
  const out: { n: number; x: number; y: number; prime: boolean }[] = [];
  let x = 0;
  let y = 0;
  let dx = 0;
  let dy = -1;
  for (let n = 1; n <= maxN; n++) {
    out.push({ n, x, y, prime: isPrime(n) });
    if (x === y || (x < 0 && x === -y) || (x > 0 && x === 1 - y)) {
      const t = dx;
      dx = -dy;
      dy = t;
    }
    x += dx;
    y += dy;
  }
  return out;
}
