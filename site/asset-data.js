/* Hydrate surface-layer <img> tags from __CMB_ASSETS__ */
(function () {
  var A = window.__CMB_ASSETS__;
  if (!A) return;
  var byPath = {
    "assets/key-art.png": A.keyArt,
    "assets/smith-relic.png": A.smithRelic,
    "assets/meaning-constellation.png": A.meaningConstellation,
    "assets/dressing-glyph.png": A.dressingGlyph
  };
  document.querySelectorAll("img").forEach(function (img) {
    var src = img.getAttribute("src") || "";
    if (byPath[src]) img.src = byPath[src];
  });
})();
