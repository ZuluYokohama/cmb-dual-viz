/* Representational Pages — atmosphere, reveal, generative measure field. No ops controls. */
(function () {
  'use strict';

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var art = document.querySelector('.atmosphere-art');

  if (art && !reduce) {
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        art.style.transform = 'scale(1.05) translateY(' + ((window.scrollY || 0) * 0.035) + 'px)';
        ticking = false;
      });
    }, { passive: true });
  }

  if (!reduce && 'IntersectionObserver' in window) {
    var nodes = document.querySelectorAll('.reveal');
    nodes.forEach(function (el) { el.classList.add('is-pending'); });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        e.target.classList.remove('is-pending');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    nodes.forEach(function (el) { io.observe(el); });
  }

  /* Generative measure: soft dual-thread field on canvas (decorative only). */
  var canvas = document.getElementById('gen-measure');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var w = canvas.width;
  var h = canvas.height;
  var t0 = performance.now();

  function hash(n) {
    var x = Math.sin(n * 127.1) * 43758.5453;
    return x - Math.floor(x);
  }

  function field(x, y, t) {
    var u = x / w - 0.5;
    var v = y / h - 0.5;
    var r = Math.sqrt(u * u + v * v * 1.35);
    /* Thread A-ish: low-order multipole lobes */
    var a = Math.cos(2 * Math.atan2(v, u) + t * 0.18) * Math.exp(-r * 2.2);
    /* Thread B-ish: drifting coherence weather */
    var b = Math.sin((u * 6.5 + t * 0.35) + Math.cos(v * 5.2 - t * 0.22)) * Math.exp(-r * 1.4);
    return 0.55 * a + 0.45 * b;
  }

  function frame(now) {
    var t = (now - t0) / 1000;
    var img = ctx.createImageData(w, h);
    var d = img.data;
    var step = 2; /* generative measure sampling stride */
    for (var y = 0; y < h; y += step) {
      for (var x = 0; x < w; x += step) {
        var f = field(x, y, t);
        var n = hash(x * 0.17 + y * 0.31 + Math.floor(t * 2));
        var g = Math.max(0, Math.min(1, 0.5 + 0.5 * f));
        var structure = Math.floor(40 + g * 140 + n * 18);
        var coherence = Math.floor(35 + (1 - g) * 110 + n * 12);
        var blue = Math.floor(70 + g * 90);
        var alpha = Math.floor(28 + g * 90);
        for (var dy = 0; dy < step && y + dy < h; dy++) {
          for (var dx = 0; dx < step && x + dx < w; dx++) {
            var i = ((y + dy) * w + (x + dx)) * 4;
            d[i] = structure;
            d[i + 1] = Math.floor((structure + coherence) * 0.45);
            d[i + 2] = blue + Math.floor(coherence * 0.25);
            d[i + 3] = alpha;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    /* faint rim ellipse — last-scatter metaphor */
    ctx.strokeStyle = 'rgba(201,166,107,0.22)';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.52, w * 0.38, h * 0.32, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (!reduce) requestAnimationFrame(frame);
  }

  if (reduce) {
    frame(t0);
  } else {
    requestAnimationFrame(frame);
  }
})();
