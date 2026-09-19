/* Representational Pages site — light atmosphere only. No operational controls. */
(function () {
  'use strict';
  var art = document.querySelector('.atmosphere-art');
  if (!art) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      var y = window.scrollY || 0;
      art.style.transform = 'scale(1.04) translateY(' + (y * 0.04) + 'px)';
      ticking = false;
    });
  }, { passive: true });
})();
