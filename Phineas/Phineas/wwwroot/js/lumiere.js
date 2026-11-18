// Phineas · effets du thème « Lumière » : inclinaison 3D, parallaxe, menu mobile.
(function () {
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Barre du haut : ligne sous la barre après défilement
  var top = document.querySelector('.lm-top');
  if (top) {
    var onScroll = function () { top.classList.toggle('is-scrolled', window.scrollY > 4); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Menu mobile
  var app = document.querySelector('.lm-app');
  document.querySelectorAll('[data-menu-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var open = app.classList.toggle('menu-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });
  var scrim = document.querySelector('.lm-scrim');
  if (scrim) scrim.addEventListener('click', function () { app.classList.remove('menu-open'); });

  if (reduced) return;

  // Inclinaison 3D des tuiles au survol
  document.querySelectorAll('[data-tilt]').forEach(function (el) {
    var max = parseFloat(el.getAttribute('data-tilt')) || 6;
    el.addEventListener('pointermove', function (e) {
      var r = el.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = 'perspective(900px) rotateX(' + (-py * max).toFixed(2) + 'deg) rotateY(' + (px * max).toFixed(2) + 'deg) translateY(-3px)';
    });
    el.addEventListener('pointerleave', function () { el.style.transform = ''; });
  });

  // Parallaxe de la scène de connexion
  var stage = document.querySelector('[data-parallax]');
  if (stage) {
    var inner = stage.querySelector('.lm-stage-inner');
    var area = stage.closest('.lm-auth-aside') || stage;
    area.addEventListener('pointermove', function (e) {
      var r = area.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      inner.style.setProperty('--ry', (-14 + px * 16).toFixed(2) + 'deg');
      inner.style.setProperty('--rx', (10 - py * 12).toFixed(2) + 'deg');
    });
    area.addEventListener('pointerleave', function () {
      inner.style.setProperty('--ry', '-14deg');
      inner.style.setProperty('--rx', '10deg');
    });
  }
})();
