/* Representational Pages — atmosphere + light reveal. No operational controls. */
(function () {
  'use strict';

  var art = document.querySelector('.atmosphere-art');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (art && !reduce) {
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        var y = window.scrollY || 0;
        art.style.transform = 'scale(1.05) translateY(' + (y * 0.035) + 'px)';
        ticking = false;
      });
    }, { passive: true });
  }

  if (reduce || !('IntersectionObserver' in window)) return;

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
})();
