/* Hydrate surface-layer <img> tags from __CMB_ASSETS__ */
(function () {
  var A = window.__CMB_ASSETS__;
  if (!A) return;
  var byPath = {
    "assets/key-art.png": A.keyArt,
    "assets/dressing-glyph.png": A.dressingGlyph,
    "assets/smith-relic.png": A.smithRelic,
    "assets/meaning-constellation.png": A.meaningConstellation
  };
  document.querySelectorAll("img").forEach(function (img) {
    var src = img.getAttribute("src") || "";
    Object.keys(byPath).forEach(function (k) {
      if (src === k || src.endsWith(k) || src.indexOf(k.split("/").pop()) !== -1) {
        if (byPath[k]) img.src = byPath[k];
      }
    });
  });
})();
