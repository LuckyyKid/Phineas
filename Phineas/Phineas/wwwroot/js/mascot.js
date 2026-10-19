(function () {
  "use strict";

  var T = {
    greeting: "Salut! Moi, c'est Boulon, le mécano de Phineas.",
    tips: [
      "Astuce : tapez « vroum » n'importe où pour me faire faire un tour.",
    ],
    honk: "Bip bip!",
    ready: "Prêt pour la route!",
    oops: "Oups! On vérifie et on réessaie?",
    flat: "Crevaison! Je m'en occupe.",
    another: "Une autre astuce",
    quiet: "Moins de balades",
    loud: "Plus de balades",
    close: "Fermer",
    launcher: "Parler à Boulon",
  };
  try {
    var dataEl = document.getElementById("boulon-data");
    if (dataEl) {
      var d = JSON.parse(dataEl.textContent);
      for (var k in d) T[k] = d[k];
    }
  } catch (e) {}

  var reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function store(kind) {
    try {
      return window[kind];
    } catch (e) {
      return null;
    }
  }
  function getFlag(kind, key) {
    var s = store(kind);
    try {
      return s ? s.getItem(key) : null;
    } catch (e) {
      return null;
    }
  }
  function setFlag(kind, key, val) {
    var s = store(kind);
    try {
      if (s) {
        if (val == null) s.removeItem(key);
        else s.setItem(key, val);
      }
    } catch (e) {}
  }
  function isQuiet() {
    return getFlag("localStorage", "boulon-quiet") === "1";
  }

  function head() {
    return (
      "" +
      '<g class="b-head">' +
      '<ellipse cx="18" cy="64" rx="5" ry="10" fill="#1c46b0"/>' +
      '<ellipse cx="102" cy="64" rx="5" ry="10" fill="#1c46b0"/>' +
      '<rect x="18" y="30" width="84" height="64" rx="28" fill="#2457d6"/>' +
      '<rect x="29" y="46" width="62" height="30" rx="15" fill="#0b1526"/>' +
      '<g class="b-eyes"><rect x="42" y="55" width="10" height="13" rx="5" fill="#7dd3fc"/>' +
      '<rect x="68" y="55" width="10" height="13" rx="5" fill="#7dd3fc"/></g>' +
      '<path class="b-mouth" d="M50 83 Q60 90 70 83" fill="none" stroke="#eaf0fd" stroke-width="3.5" stroke-linecap="round"/>' +
      '<circle cx="35" cy="84" r="4" fill="#f472b6" opacity=".55"/><circle cx="85" cy="84" r="4" fill="#f472b6" opacity=".55"/>' +
      '<path d="M22 40 C22 12 98 12 98 40 Z" fill="#f5a524"/>' +
      '<rect x="54" y="17" width="12" height="23" rx="4" fill="#fbbf24"/>' +
      '<rect x="12" y="36" width="96" height="10" rx="5" fill="#d98a0b"/>' +
      "</g>"
    );
  }

  function boulon() {
    return (
      '<svg class="boulon-svg" viewBox="0 0 122 140" aria-hidden="true" focusable="false">' +
      '<g class="b-body">' +
      '<rect x="44" y="88" width="32" height="12" fill="#1c46b0"/>' +
      '<path d="M32 106 L18 124" stroke="#1c46b0" stroke-width="9" stroke-linecap="round"/>' +
      '<circle cx="18" cy="124" r="6" fill="#f5a524"/>' +
      '<rect x="30" y="96" width="60" height="40" rx="14" fill="#2457d6"/>' +
      '<rect x="30" y="114" width="60" height="7" fill="#f5a524"/>' +
      '<circle cx="60" cy="106" r="4.5" fill="#eaf0fd"/>' +
      '<g class="b-arm">' +
      '<path d="M88 106 L104 88" stroke="#1c46b0" stroke-width="9" stroke-linecap="round"/>' +
      '<path d="M104 88 L113 73" stroke="#94a3b8" stroke-width="4" stroke-linecap="round"/>' +
      '<circle cx="114.5" cy="70" r="5" fill="none" stroke="#94a3b8" stroke-width="3.5"/>' +
      '<circle cx="104" cy="88" r="6" fill="#f5a524"/>' +
      "</g></g>" +
      head() +
      "</svg>"
    );
  }

  function wheel(x, cls) {
    return (
      '<g transform="translate(' +
      x +
      ' 106)"><g class="tire ' +
      cls +
      '"><g class="spin">' +
      '<circle r="18" fill="#0b1526" stroke="#475569" stroke-width="2"/><circle r="9" fill="#cbd5e1"/>' +
      '<path d="M0 -9 V9 M-9 0 H9" stroke="#64748b" stroke-width="2.5"/>' +
      "</g></g></g>"
    );
  }

  function car() {
    return (
      '<svg class="boulon-car-svg" viewBox="0 0 230 130" aria-hidden="true" focusable="false">' +
      '<g class="puffs"><circle class="puff" cx="8" cy="100" r="5"/><circle class="puff" cx="8" cy="100" r="5"/><circle class="puff" cx="8" cy="100" r="5"/></g>' +
      '<g class="car-bounce">' +
      '<g transform="translate(70 -2) scale(.6)">' +
      head() +
      "</g>" +
      '<path d="M146 60 L136 47" stroke="#0b1526" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M158 64 L147 36" stroke="#bae6fd" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M10 88 Q10 72 26 70 L64 66 Q70 58 80 58 L150 58 Q162 58 172 66 L208 72 Q220 74 220 88 L220 100 Q220 106 214 106 L16 106 Q10 106 10 100 Z" fill="#2457d6"/>' +
      '<path d="M14 86 H218" stroke="#f5a524" stroke-width="5"/>' +
      '<path d="M100 64 V104" stroke="#1c46b0" stroke-width="2"/>' +
      '<rect x="106" y="73" width="13" height="3.5" rx="1.75" fill="#eaf0fd"/>' +
      '<ellipse cx="216" cy="79" rx="3.5" ry="5" fill="#fde68a"/>' +
      '<rect x="10" y="74" width="5" height="9" rx="2" fill="#ef4444"/>' +
      '<circle cx="140" cy="96" r="7" fill="#eaf0fd"/>' +
      '<text x="140" y="99.5" font-size="10" font-weight="700" text-anchor="middle" fill="#2457d6" font-family="Inter, system-ui, sans-serif">P</text>' +
      "</g>" +
      wheel(56, "rear") +
      wheel(176, "front") +
      "</svg>"
    );
  }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  var dock,
    btn,
    bubble,
    bubbleText,
    quietBtn,
    hideTimer,
    tipIndex = -1;

  function buildDock() {
    dock = el("div", "boulon-dock");
    bubble = el("div", "boulon-bubble");
    bubble.setAttribute("role", "status");
    bubble.setAttribute("aria-live", "polite");
    bubbleText = el("p", "boulon-bubble-text");
    var actions = el("div", "boulon-actions");
    var more = el("button", "boulon-link", T.another);
    more.type = "button";
    quietBtn = el("button", "boulon-link", isQuiet() ? T.loud : T.quiet);
    quietBtn.type = "button";
    var close = el("button", "boulon-x", "&times;");
    close.type = "button";
    close.setAttribute("aria-label", T.close);
    actions.appendChild(more);
    actions.appendChild(quietBtn);
    bubble.appendChild(close);
    bubble.appendChild(bubbleText);
    bubble.appendChild(actions);

    btn = el("button", "boulon-btn", boulon());
    btn.type = "button";
    btn.setAttribute("aria-label", T.launcher);

    dock.appendChild(bubble);
    dock.appendChild(btn);
    document.body.appendChild(dock);

    btn.addEventListener("click", function () {
      if (dock.classList.contains("is-out")) {
        jump();
        nextTip();
      } else {
        nextTip();
      }
    });
    more.addEventListener("click", nextTip);
    close.addEventListener("click", hide);
    quietBtn.addEventListener("click", function () {
      var q = !isQuiet();
      setFlag("localStorage", "boulon-quiet", q ? "1" : null);
      quietBtn.textContent = q ? T.loud : T.quiet;
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") hide();
    });
  }

  function say(text, ms) {
    if (!dock) return;
    clearTimeout(hideTimer);
    bubbleText.textContent = text;
    dock.classList.remove("is-away");
    dock.classList.add("is-out");
    if (ms) hideTimer = setTimeout(hide, ms);
  }
  function hide() {
    if (dock) {
      clearTimeout(hideTimer);
      dock.classList.remove("is-out");
    }
  }
  function nextTip() {
    tipIndex = (tipIndex + 1) % T.tips.length;
    say(T.tips[tipIndex]);
  }
  function jump() {
    if (reduceMotion || !btn) return;
    btn.classList.remove("jump");
    void btn.offsetWidth;
    btn.classList.add("jump");
  }

  var driving = false;
  function drive(message) {
    if (driving) return;
    if (reduceMotion) {
      if (message) say(message, 5000);
      return;
    }
    driving = true;
    hide();
    if (dock) dock.classList.add("is-away");

    var lane = el("div", "boulon-lane");
    var rig = el("div", "boulon-rig moving");
    if (message) {
      var flag = el("span", "boulon-flag");
      flag.textContent = message;
      rig.appendChild(flag);
    }
    rig.appendChild(el("div", "boulon-car", car()));
    lane.appendChild(rig);
    document.body.appendChild(lane);

    var start = -rig.offsetWidth - 20;
    var end = window.innerWidth + 20;
    var anim = rig.animate(
      [
        { transform: "translateX(" + start + "px)" },
        { transform: "translateX(" + end + "px)" },
      ],
      {
        duration: Math.max(4200, (end - start) * 4.2),
        easing: "cubic-bezier(.45,.05,.55,.95)",
      },
    );
    anim.onfinish = function () {
      lane.remove();
      driving = false;
      if (dock) dock.classList.remove("is-away");
    };
  }

  function road(container) {
    var rig = el("div", "boulon-rig moving");
    var honk = el("span", "boulon-honk", T.honk);
    rig.appendChild(honk);
    rig.appendChild(el("div", "boulon-car", car()));
    container.appendChild(rig);
    rig.setAttribute("title", T.honk);

    if (reduceMotion) {
      rig.classList.remove("moving");
      rig.style.left = "8%";
      return;
    }

    var anim;
    function start(progress) {
      if (anim) anim.cancel();
      var from = -rig.offsetWidth - 10,
        to = container.clientWidth + 10;
      anim = rig.animate(
        [
          { transform: "translateX(" + from + "px)" },
          { transform: "translateX(" + to + "px)" },
        ],
        { duration: Math.max(7000, (to - from) * 11), iterations: Infinity },
      );
      if (progress)
        anim.currentTime = progress * anim.effect.getTiming().duration;
    }
    start(0.15);

    var resizeTimer;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        var t = anim.effect.getComputedTiming();
        start(t.progress || 0);
      }, 150);
    });

    rig.style.pointerEvents = "auto";
    rig.addEventListener("click", function () {
      honk.classList.remove("show");
      void honk.offsetWidth;
      honk.classList.add("show");
      anim.playbackRate = 3;
      setTimeout(function () {
        anim.playbackRate = 1;
      }, 900);
    });
  }

  function wave(container) {
    var failed = document.querySelector(
      ".validation-summary-errors li, .auth-card .alert-danger",
    );
    container.appendChild(
      el("div", "boulon-mini" + (failed ? " sad" : " waving"), boulon()),
    );
    var b = el("div", "boulon-say");
    b.textContent = failed ? T.oops : T.greeting;
    container.appendChild(b);
  }

  function flat(container) {
    var b = el("div", "boulon-say boulon-say-up");
    b.textContent = T.flat;
    container.appendChild(b);
    container.appendChild(el("div", "boulon-car flat", car()));
  }

  function listenForVroum() {
    var typed = "";
    document.addEventListener("keydown", function (e) {
      var t = e.target;
      if (
        t &&
        (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
      )
        return;
      if (!e.key || e.key.length !== 1) return;
      typed = (typed + e.key.toLowerCase()).slice(-5);
      if (typed === "vroum") {
        typed = "";
        drive(T.honk);
      }
    });
  }

  function init() {
    document.querySelectorAll("[data-boulon-road]").forEach(road);
    document.querySelectorAll("[data-boulon-wave]").forEach(wave);
    document.querySelectorAll("[data-boulon-flat]").forEach(flat);
    listenForVroum();

    if (
      !document.body.classList.contains("app-body") &&
      !document.querySelector("[data-boulon-dock]")
    )
      return;
    buildDock();

    var success = document.querySelector(".alert-success.flash");
    if (success && !isQuiet()) {
      var text = success.textContent.trim().replace(/\s+/g, " ");
      setTimeout(function () {
        drive(text.length > 70 ? text.slice(0, 67) + "…" : text);
      }, 500);
    } else if (!getFlag("sessionStorage", "boulon-greeted") && !isQuiet()) {
      setFlag("sessionStorage", "boulon-greeted", "1");
      setTimeout(function () {
        say(T.greeting, 6000);
        jump();
      }, 900);
    }
  }

  window.Boulon = {
    say: say,
    drive: drive,
    statusChanged: function (p) {
      if (p && p.to === "PretPourVente" && !isQuiet())
        drive(T.ready + " " + (p.title || ""));
    },
  };

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
