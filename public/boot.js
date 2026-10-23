// Applies the last known appearance before first paint (avoids a theme flash).
// Values are checked against allow-lists; anything else is ignored.
(function () {
  try {
    var c = JSON.parse(localStorage.getItem('hlab-appearance') || 'null');
    if (!c) return;
    var ok = {
      theme: ['dark', 'black', 'light'],
      accent: ['mint', 'lavender', 'sky', 'amber', 'rose'],
      bg: ['orbits', 'grid', 'plain'],
      motion: ['full', 'subtle', 'off'],
    };
    var r = document.documentElement;
    if (ok.theme.indexOf(c.theme) > -1) r.setAttribute('data-theme', c.theme);
    if (ok.accent.indexOf(c.accent) > -1) r.setAttribute('data-accent', c.accent);
    if (ok.bg.indexOf(c.bg) > -1) r.setAttribute('data-bg', c.bg);
    if (ok.motion.indexOf(c.motion) > -1) r.setAttribute('data-motion', c.motion);
  } catch (e) {
    /* ignore */
  }
})();
