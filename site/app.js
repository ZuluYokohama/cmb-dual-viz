(function () {
  "use strict";
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var state = {
    thread: "A",
    dress: "bare",
    gamma: 0.82,
    t0: performance.now(),
  };
  var DRESS = {
    bare: {
      line: "state: bare · scaffolding visible · last-scatter screen only",
      detail: "Mollweide = readable surface · not the interior.<br />Smith = rim of reflection · mismatch→match.<br />Fail-closed. Not NASA. Research-Only.",
      opacity: { packet: 1, smith: 0.55, map: 0.5, readout: 0.7 },
    },
    dressed_candidate: {
      line: "state: dressed_candidate · Bombelli motif · scaffolding cancels if controlled",
      detail: "Dressing on the surface only. Not DFM algebra.<br />Scaffolding that cancels before the invariant shows.<br />Class D-analogue — honest brakes engaged.",
      opacity: { packet: 0.85, smith: 1, map: 0.9, readout: 1 },
    },
    invariant_claim: {
      line: "state: invariant_claim · claim-shaped on the rim · still RESEARCH",
      detail: "Invariant-shaped readout on the boundary only. Never certifies OPEN.<br />high score ≠ OPEN. Metaphor layers stay labeled.<br />Fail-closed if assurance gaps remain.",
      opacity: { packet: 0.7, smith: 0.85, map: 1, readout: 1 },
    },
  };
  document.querySelectorAll(".thread-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      state.thread = btn.dataset.thread;
      document.querySelectorAll(".thread-btn").forEach(function (b) {
        var on = b === btn;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      updateReadouts();
    });
  });
  var dressBlock = document.getElementById("dress-block");
  var dressCopy = document.getElementById("dress-copy");
  var dressDetail = document.getElementById("dress-detail");
  var panels = {
    packet: document.getElementById("panel-packet"),
    smith: document.getElementById("panel-smith"),
    map: document.getElementById("panel-map"),
    readout: document.getElementById("panel-readout"),
  };
  function applyDress(name) {
    state.dress = name;
    var cfg = DRESS[name];
    if (!cfg) return;
    if (dressCopy) dressCopy.textContent = cfg.line;
    if (dressDetail) dressDetail.innerHTML = cfg.detail;
    if (dressBlock) dressBlock.dataset.active = name;
    Object.keys(panels).forEach(function (k) {
      var el = panels[k];
      if (!el) return;
      var op = cfg.opacity[k];
      el.style.opacity = String(op);
      el.classList.toggle("dim", op < 0.6);
      el.classList.toggle("emphasis", op >= 0.95);
    });
    document.querySelectorAll(".dress-chip").forEach(function (c) {
      c.classList.toggle("active", c.dataset.dress === name);
    });
    updateReadouts();
  }
  document.querySelectorAll(".dress-chip").forEach(function (chip) {
    chip.addEventListener("click", function () { applyDress(chip.dataset.dress); });
  });
  var scrub = document.getElementById("gamma-scrub");
  var gammaVal = document.getElementById("gamma-val");
  var matchVal = document.getElementById("match-val");
  function setGamma(v) {
    state.gamma = 1 - Number(v) / 100;
    var mag = state.gamma;
    var matched = mag < 0.18;
    if (gammaVal) gammaVal.textContent = "|Γ| " + mag.toFixed(2);
    if (matchVal) {
      matchVal.textContent = matched ? "MATCH" : "MISMATCH";
      matchVal.className = matched ? "match" : "mismatch";
    }
    updateReadouts();
    drawSmith();
  }
  if (scrub) scrub.addEventListener("input", function (e) { setGamma(e.target.value); });
  function updateReadouts() {
    var labels = { A: "A · multipole", B: "B · coherence", MIX: "⊕ · dual mix" };
    var a = document.getElementById("ro-thread");
    var b = document.getElementById("ro-ell");
    var c = document.getElementById("ro-coh");
    var d = document.getElementById("ro-dress");
    if (a) a.textContent = labels[state.thread] || state.thread;
    if (b) b.textContent = state.thread === "B" ? "suppressed" : state.thread === "MIX" ? "Y₂₀ + Y₂₂ · soft" : "Y₂₀ + Y₂₂";
    var cohW = state.thread === "A" ? 0.12 : state.thread === "B" ? 0.72 : 0.38;
    if (c) c.textContent = cohW.toFixed(2);
    if (d) d.textContent = state.dress;
  }
  var sky = document.getElementById("sky");
  var sctx = sky && sky.getContext("2d", { alpha: true });
  var sw = 0, sh = 0, dpr = 1, skyRaf = 0;
  function cmbColor(v, a) {
    var x = Math.max(0, Math.min(1, v)), r, g, b, u;
    if (x < 0.25) { u = x / 0.25; r = 8 + u * 20; g = 12 + u * 80; b = 40 + u * 180; }
    else if (x < 0.5) { u = (x - 0.25) / 0.25; r = 28 + u * 200; g = 92 + u * 40; b = 220 - u * 40; }
    else if (x < 0.75) { u = (x - 0.5) / 0.25; r = 228 - u * 20; g = 132 + u * 60; b = 180 - u * 100; }
    else { u = (x - 0.75) / 0.25; r = 208 + u * 47; g = 192; b = 80 - u * 40; }
    return "rgba(" + (r | 0) + "," + (g | 0) + "," + (b | 0) + "," + a + ")";
  }
  function hash(ix, iy) {
    var n = ix * 374761393 + iy * 668265263;
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  function smoothNoise(x, y) {
    var x0 = Math.floor(x), y0 = Math.floor(y);
    var fx = x - x0, fy = y - y0;
    var sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    var a = hash(x0, y0), b = hash(x0 + 1, y0), c = hash(x0, y0 + 1), d = hash(x0 + 1, y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  function fbm(x, y) {
    var v = 0, amp = 0.5, freq = 1, i;
    for (i = 0; i < 4; i++) { v += amp * smoothNoise(x * freq, y * freq); amp *= 0.5; freq *= 2.05; }
    return v;
  }
  function inMollweide(nx, ny) {
    if (nx * nx + ny * ny > 1) return null;
    var sinTheta = Math.max(-1, Math.min(1, ny));
    var theta = Math.asin(sinTheta);
    var cosTheta = Math.cos(theta);
    if (Math.abs(cosTheta) < 1e-6) return { lon: 0, lat: (Math.PI / 2) * Math.sign(ny) };
    var lon = (nx * Math.PI) / (2 * Math.max(0.05, cosTheta));
    var lat = Math.asin(Math.max(-1, Math.min(1, (2 * theta + Math.sin(2 * theta)) / Math.PI)));
    return { lon: lon, lat: lat };
  }
  function resizeSky() {
    if (!sky || !sctx) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    sw = window.innerWidth; sh = window.innerHeight;
    sky.width = Math.floor(sw * dpr); sky.height = Math.floor(sh * dpr);
    sky.style.width = sw + "px"; sky.style.height = sh + "px";
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function threadWeights() {
    if (state.thread === "A") return { m: 1, c: 0.15, n: 0.18 };
    if (state.thread === "B") return { m: 0.2, c: 0.85, n: 0.12 };
    return { m: 0.55, c: 0.45, n: 0.16 };
  }
  function drawSky(now) {
    if (!sctx) return;
    var t = (now - state.t0) * 0.00012;
    sctx.clearRect(0, 0, sw, sh);
    var rail = Math.min(172, sw * 0.18);
    var cx = rail + (sw - rail) * 0.52;
    var cy = sh * 0.46;
    var rx = Math.min((sw - rail) * 0.44, sh * 0.55, 560);
    var ry = rx * 0.5;
    var glow = sctx.createRadialGradient(cx, cy, ry * 0.15, cx, cy, rx * 1.4);
    glow.addColorStop(0, state.thread === "B" ? "rgba(255,61,184,0.1)" : "rgba(61,232,255,0.09)");
    glow.addColorStop(0.5, "rgba(255,61,184,0.035)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    sctx.fillStyle = glow; sctx.fillRect(0, 0, sw, sh);
    var w = threadWeights();
    var step = reduced ? 8 : 5;
    var contrast = 0.85 + state.gamma * 0.35;
    var py, px, nx, ny, sph, lon, lat, multipole, coh, n, v, edge, alpha, i, ang, rr;
    for (py = -ry; py <= ry; py += step) {
      for (px = -rx; px <= rx; px += step) {
        nx = px / rx; ny = py / ry;
        sph = inMollweide(nx, ny);
        if (!sph) continue;
        lon = sph.lon; lat = sph.lat;
        multipole = 0.55 * (0.5 * (3 * Math.sin(lat) * Math.sin(lat) - 1)) + 0.45 * (Math.cos(lat) * Math.cos(lat) * Math.cos(2 * lon + t * 0.8));
        coh = Math.sin(3 * lon + t * 1.4) * Math.cos(2 * lat - t * 0.6);
        n = fbm(lon * 1.2 + t * 0.3, lat * 1.5 - t * 0.2);
        v = 0.42 + w.m * 0.28 * multipole + w.c * 0.32 * coh + w.n * 0.22 * (n - 0.5);
        v = 0.5 + (v - 0.5) * contrast;
        v = Math.max(0, Math.min(1, v));
        edge = 1 - Math.sqrt(nx * nx + ny * ny);
        alpha = 0.22 + 0.65 * Math.pow(Math.max(0, edge), 0.65);
        if (state.thread === "B") alpha *= 0.75 + 0.35 * Math.abs(coh);
        sctx.fillStyle = cmbColor(v, alpha);
        sctx.fillRect(cx + px, cy + py, step + 0.5, step + 0.5);
      }
    }
    sctx.beginPath();
    sctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    sctx.strokeStyle = state.thread === "B" ? "rgba(255,61,184,0.4)" : state.thread === "MIX" ? "rgba(255,193,74,0.35)" : "rgba(61,232,255,0.32)";
    sctx.lineWidth = 1.4; sctx.stroke();
    sctx.beginPath(); sctx.moveTo(cx, cy - ry); sctx.lineTo(cx, cy + ry);
    sctx.strokeStyle = "rgba(255,61,184,0.16)"; sctx.lineWidth = 1; sctx.stroke();
    sctx.beginPath(); sctx.moveTo(cx - rx, cy); sctx.lineTo(cx + rx, cy);
    sctx.strokeStyle = "rgba(61,232,255,0.12)"; sctx.stroke();
    for (i = 0; i < 12; i++) {
      ang = (i / 12) * Math.PI * 2;
      sctx.beginPath();
      sctx.moveTo(cx + Math.cos(ang) * rx, cy + Math.sin(ang) * ry);
      sctx.lineTo(cx + Math.cos(ang) * rx * 1.03, cy + Math.sin(ang) * ry * 1.03);
      sctx.strokeStyle = "rgba(220,226,242,0.22)"; sctx.stroke();
    }
    if (!reduced) {
      for (i = 0; i < 32; i++) {
        ang = t * (0.4 + (i % 7) * 0.05) + i * 1.7;
        rr = 0.3 + (i % 5) * 0.13;
        px = cx + Math.cos(ang) * rx * rr;
        py = cy + Math.sin(ang * 0.9) * ry * rr * 0.85;
        if (((px - cx) / rx) * ((px - cx) / rx) + ((py - cy) / ry) * ((py - cy) / ry) >= 1) continue;
        sctx.beginPath(); sctx.arc(px, py, 1.1 + (i % 3) * 0.35, 0, Math.PI * 2);
        sctx.fillStyle = i % 3 === 0 ? "rgba(61,232,255,0.55)" : i % 3 === 1 ? "rgba(255,61,184,0.45)" : "rgba(255,193,74,0.4)";
        sctx.fill();
      }
      skyRaf = requestAnimationFrame(drawSky);
    }
  }
  var smith = document.getElementById("smith");
  var smctx = smith && smith.getContext("2d");
  function gammaToZ(re, im) {
    var d = (1 - re) * (1 - re) + im * im;
    if (d < 1e-9) return { r: 99, x: 0 };
    return { r: (1 - re * re - im * im) / d, x: (2 * im) / d };
  }
  function drawSmith() {
    if (!smctx || !smith) return;
    var W = smith.width, H = smith.height, cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.42;
    smctx.clearRect(0, 0, W, H);
    smctx.beginPath(); smctx.arc(cx, cy, R, 0, Math.PI * 2);
    smctx.strokeStyle = "rgba(61,232,255,0.45)"; smctx.lineWidth = 1.25; smctx.stroke();
    [0.2, 0.5, 1, 2].forEach(function (r) {
      var rr = R / (1 + r), ox = cx + R * (r / (1 + r));
      smctx.beginPath(); smctx.arc(ox, cy, rr, 0, Math.PI * 2);
      smctx.strokeStyle = "rgba(61,232,255,0.14)"; smctx.stroke();
    });
    smctx.beginPath(); smctx.moveTo(cx - R, cy); smctx.lineTo(cx + R, cy);
    smctx.strokeStyle = "rgba(255,193,74,0.25)"; smctx.stroke();
    smctx.beginPath();
    smctx.moveTo(cx - 5, cy); smctx.lineTo(cx + 5, cy);
    smctx.moveTo(cx, cy - 5); smctx.lineTo(cx, cy + 5);
    smctx.strokeStyle = "rgba(61,232,255,0.75)"; smctx.lineWidth = 1.5; smctx.stroke();
    var t = (performance.now() - state.t0) * 0.0004;
    var ang = 2.48 + (state.thread === "B" ? 0.6 : state.thread === "MIX" ? 0.25 : 0) + t * 0.15;
    var mag = state.gamma;
    if (state.thread === "MIX") mag *= 0.85;
    var gre = mag * Math.cos(ang), gim = mag * Math.sin(ang);
    var px = cx + gre * R, py = cy - gim * R;
    smctx.beginPath(); smctx.moveTo(px, py); smctx.lineTo(cx, cy);
    smctx.strokeStyle = mag < 0.18 ? "rgba(61,232,255,0.55)" : "rgba(255,107,138,0.5)";
    smctx.setLineDash([3, 3]); smctx.stroke(); smctx.setLineDash([]);
    smctx.beginPath(); smctx.arc(px, py, 5, 0, Math.PI * 2);
    smctx.fillStyle = mag < 0.18 ? "#3de8ff" : "#ff3db8"; smctx.fill();
    smctx.strokeStyle = "rgba(255,255,255,0.5)"; smctx.lineWidth = 1; smctx.stroke();
    var deg = ((ang * 180) / Math.PI + 360) % 360;
    var z = gammaToZ(gre, gim);
    var gEl = document.getElementById("smith-g");
    var zEl = document.getElementById("smith-z");
    var stEl = document.getElementById("smith-state");
    if (gEl) gEl.textContent = mag.toFixed(2) + "∠" + deg.toFixed(0) + "°";
    if (zEl) zEl.textContent = z.r.toFixed(2) + (z.x >= 0 ? "+" : "") + "j" + z.x.toFixed(2);
    if (stEl) {
      var matched = mag < 0.18;
      stEl.textContent = matched ? "MATCH" : "MISMATCH";
      stEl.className = matched ? "match" : "mismatch";
    }
  }
  var mapC = document.getElementById("constellation");
  var mctx = mapC && mapC.getContext("2d");
  var nodes = [
    { label: "ℓ2", kind: "ell", x: 60, y: 80, vx: 0, vy: 0 },
    { label: "ℓ5", kind: "ell", x: 100, y: 40, vx: 0, vy: 0 },
    { label: "claim", kind: "claim", x: 180, y: 50, vx: 0, vy: 0 },
    { label: "series", kind: "series", x: 220, y: 110, vx: 0, vy: 0 },
    { label: "sky", kind: "sky", x: 140, y: 120, vx: 0, vy: 0 },
    { label: "Γ", kind: "smith", x: 40, y: 40, vx: 0, vy: 0 },
  ];
  var edges = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [5, 0], [5, 2], [1, 4]];
  var kindColor = { ell: "#3de8ff", claim: "#ffc14a", series: "#ff3db8", sky: "#7af0ff", smith: "#c4b5fd" };
  function stepForce() {
    if (!mapC) return;
    var W = mapC.width, H = mapC.height, cx = W / 2, cy = H / 2;
    var pullX = state.thread === "A" ? -18 : state.thread === "B" ? 18 : 0;
    var pullY = state.dress === "invariant_claim" ? -8 : state.dress === "bare" ? 6 : 0;
    var i, j, a, b, dx, dy, dist, rep, f, idx, n;
    for (i = 0; i < nodes.length; i++) {
      for (j = i + 1; j < nodes.length; j++) {
        a = nodes[i]; b = nodes[j];
        dx = b.x - a.x; dy = b.y - a.y;
        dist = Math.sqrt(dx * dx + dy * dy) || 1;
        rep = 420 / (dist * dist);
        dx /= dist; dy /= dist;
        a.vx -= dx * rep; a.vy -= dy * rep;
        b.vx += dx * rep; b.vy += dy * rep;
      }
    }
    edges.forEach(function (pair) {
      a = nodes[pair[0]]; b = nodes[pair[1]];
      dx = b.x - a.x; dy = b.y - a.y;
      dist = Math.sqrt(dx * dx + dy * dy) || 1;
      f = (dist - 55) * 0.02;
      dx /= dist; dy /= dist;
      a.vx += dx * f; a.vy += dy * f;
      b.vx -= dx * f; b.vy -= dy * f;
    });
    for (idx = 0; idx < nodes.length; idx++) {
      n = nodes[idx];
      n.vx += (cx + pullX - n.x) * 0.004;
      n.vy += (cy + pullY - n.y) * 0.004;
      n.vx += Math.sin(performance.now() * 0.0003 + idx) * 0.02;
      n.vx *= 0.86; n.vy *= 0.86;
      n.x = Math.max(14, Math.min(W - 14, n.x + n.vx));
      n.y = Math.max(14, Math.min(H - 14, n.y + n.vy));
    }
  }
  function drawMap() {
    if (!mctx || !mapC) return;
    mctx.clearRect(0, 0, mapC.width, mapC.height);
    if (!reduced) stepForce();
    edges.forEach(function (pair) {
      var a = nodes[pair[0]], b = nodes[pair[1]];
      mctx.beginPath(); mctx.moveTo(a.x, a.y); mctx.lineTo(b.x, b.y);
      mctx.strokeStyle = "rgba(61,232,255,0.28)"; mctx.stroke();
    });
    nodes.forEach(function (n) {
      var col = kindColor[n.kind] || "#fff";
      var glow = mctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 14);
      glow.addColorStop(0, col); glow.addColorStop(0.3, col + "88"); glow.addColorStop(1, "transparent");
      mctx.beginPath(); mctx.arc(n.x, n.y, 14, 0, Math.PI * 2); mctx.fillStyle = glow; mctx.fill();
      mctx.beginPath(); mctx.arc(n.x, n.y, 3.5, 0, Math.PI * 2); mctx.fillStyle = col; mctx.fill();
      mctx.font = "9px IBM Plex Mono, monospace";
      mctx.fillStyle = "rgba(220,226,242,0.8)";
      mctx.fillText(n.label, n.x + 6, n.y - 6);
    });
  }
  function hudLoop() {
    drawSmith();
    drawMap();
    if (!reduced) requestAnimationFrame(hudLoop);
  }
  resizeSky();
  if (scrub) setGamma(scrub.value);
  applyDress("bare");
  updateReadouts();
  drawSky(performance.now());
  drawSmith();
  drawMap();
  if (!reduced) requestAnimationFrame(hudLoop);
  var resizeTimer = 0;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      resizeSky();
      if (reduced) drawSky(performance.now());
    }, 80);
  });
  window.addEventListener("pagehide", function () {
    if (skyRaf) cancelAnimationFrame(skyRaf);
  });
})();
