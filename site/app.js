/**
 * Subtle animated Mollweide-ish CMB field + gradient noise for the landing hero.
 * Pure canvas — no deps. Reduced-motion respectful.
 */
(function () {
  const canvas = document.getElementById("sky");
  if (!canvas) return;

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t0 = performance.now();
  let raf = 0;

  // Soft CMB-ish colormap: deep → cyan → magenta → amber → deep
  function cmbColor(v, a) {
    // v in [0,1]
    const x = Math.max(0, Math.min(1, v));
    let r, g, b;
    if (x < 0.25) {
      const u = x / 0.25;
      r = 8 + u * 20;
      g = 12 + u * 80;
      b = 40 + u * 180;
    } else if (x < 0.5) {
      const u = (x - 0.25) / 0.25;
      r = 28 + u * 200;
      g = 92 + u * 40;
      b = 220 - u * 40;
    } else if (x < 0.75) {
      const u = (x - 0.5) / 0.25;
      r = 228 - u * 20;
      g = 132 + u * 60;
      b = 180 - u * 100;
    } else {
      const u = (x - 0.75) / 0.25;
      r = 208 + u * 47;
      g = 192 + u * 1;
      b = 80 - u * 40;
    }
    return `rgba(${r | 0},${g | 0},${b | 0},${a})`;
  }

  // Hash noise
  function hash(ix, iy) {
    let n = ix * 374761393 + iy * 668265263;
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  function smoothNoise(x, y) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = hash(x0, y0);
    const b = hash(x0 + 1, y0);
    const c = hash(x0, y0 + 1);
    const d = hash(x0 + 1, y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }

  function fbm(x, y) {
    let v = 0;
    let amp = 0.5;
    let freq = 1;
    for (let i = 0; i < 4; i++) {
      v += amp * smoothNoise(x * freq, y * freq);
      amp *= 0.5;
      freq *= 2.05;
    }
    return v;
  }

  // Inverse Mollweide-ish: map pixel in oval → (lon, lat) approx
  function inMollweide(nx, ny) {
    // nx, ny in [-1,1] relative to oval
    const r2 = nx * nx + ny * ny;
    if (r2 > 1) return null;
    // Mollweide: x = (2√2/π) λ cos θ, y = √2 sin θ  — approximate inverse
    const sinTheta = Math.max(-1, Math.min(1, ny));
    const theta = Math.asin(sinTheta);
    const cosTheta = Math.cos(theta);
    if (Math.abs(cosTheta) < 1e-6) return { lon: 0, lat: Math.PI / 2 * Math.sign(ny) };
    const lon = (nx * Math.PI) / (2 * Math.max(0.05, cosTheta));
    const lat = Math.asin(Math.max(-1, Math.min(1, (2 * theta + Math.sin(2 * theta)) / Math.PI)));
    return { lon, lat };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(now) {
    const t = (now - t0) * 0.00012;
    ctx.clearRect(0, 0, w, h);

    const cx = w * 0.5;
    const cy = h * 0.38;
    const rx = Math.min(w * 0.42, 520);
    const ry = rx * 0.5;

    // Soft vignette glow behind oval
    const glow = ctx.createRadialGradient(cx, cy, ry * 0.2, cx, cy, rx * 1.35);
    glow.addColorStop(0, "rgba(61,232,255,0.07)");
    glow.addColorStop(0.45, "rgba(255,61,184,0.04)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // Sample grid — coarse for perf
    const step = prefersReduced ? 8 : 5;
    const img = ctx.createImageData(Math.ceil((2 * rx) / step) + 2, Math.ceil((2 * ry) / step) + 2);
    // We'll draw as filled rects instead for simplicity / blend

    for (let py = -ry; py <= ry; py += step) {
      for (let px = -rx; px <= rx; px += step) {
        const nx = px / rx;
        const ny = py / ry;
        const sph = inMollweide(nx, ny);
        if (!sph) continue;

        const { lon, lat } = sph;
        // Dual-thread field: multipole-ish + coherence wave
        const y20 = 0.5 * (3 * Math.sin(lat) * Math.sin(lat) - 1);
        const y22 = Math.cos(lat) * Math.cos(lat) * Math.cos(2 * lon + t * 0.8);
        const coh = Math.sin(3 * lon + t * 1.4) * Math.cos(2 * lat - t * 0.6);
        const n = fbm(lon * 1.2 + t * 0.3, lat * 1.5 - t * 0.2);
        let v = 0.42 + 0.22 * y20 + 0.18 * y22 + 0.12 * coh + 0.2 * (n - 0.5);
        v = Math.max(0, Math.min(1, v));

        const edge = 1 - Math.sqrt(nx * nx + ny * ny);
        const alpha = 0.15 + 0.55 * Math.pow(Math.max(0, edge), 0.65);

        ctx.fillStyle = cmbColor(v, alpha);
        ctx.fillRect(cx + px, cy + py, step + 0.5, step + 0.5);
      }
    }

    // Oval outline
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(61,232,255,0.22)";
    ctx.lineWidth = 1.25;
    ctx.stroke();

    // Meridian tick
    ctx.beginPath();
    ctx.moveTo(cx, cy - ry);
    ctx.lineTo(cx, cy + ry);
    ctx.strokeStyle = "rgba(255,61,184,0.12)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Drift particles
    if (!prefersReduced) {
      for (let i = 0; i < 28; i++) {
        const ang = t * (0.4 + (i % 7) * 0.05) + i * 1.7;
        const rr = 0.35 + (i % 5) * 0.12;
        const px = cx + Math.cos(ang) * rx * rr;
        const py = cy + Math.sin(ang * 0.9) * ry * rr * 0.85;
        const inside =
          ((px - cx) / rx) * ((px - cx) / rx) + ((py - cy) / ry) * ((py - cy) / ry) < 1;
        if (!inside) continue;
        ctx.beginPath();
        ctx.arc(px, py, 1.2 + (i % 3) * 0.4, 0, Math.PI * 2);
        ctx.fillStyle =
          i % 3 === 0
            ? "rgba(61,232,255,0.55)"
            : i % 3 === 1
              ? "rgba(255,61,184,0.45)"
              : "rgba(255,193,74,0.4)";
        ctx.fill();
      }
    }

    if (!prefersReduced) {
      raf = requestAnimationFrame(draw);
    }
  }

  resize();
  draw(performance.now());

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resize();
      if (prefersReduced) draw(performance.now());
    }, 80);
  });

  // Clean up if navigated away (Pages SPA-less, still polite)
  window.addEventListener("pagehide", () => {
    if (raf) cancelAnimationFrame(raf);
  });
})();
