// Tableau de bord : « Mes actions prioritaires », indicateur « Prospects à recontacter » et nouvelles correspondances,
// lus dans le store du moteur — la même source que le Centre d'actions (jamais deux listes contradictoires).
(function () {
  "use strict";

  var I = window.Intelligence, P = window.Prospects, UI = window.IntelligenceUI;
  var bloc = document.getElementById("ia-priorites");
  if (!I || !P || !UI || !bloc) return;
  var esc = P.esc;
  var filtre = "toutes";
  var MAX = 6;
  var FILTRES = {
    toutes: function () { return true; },
    aujourdhui: function (a) { return a.echeance && new Date(a.echeance).toDateString() === new Date().toDateString() || (a.echeance && new Date(a.echeance) < new Date()); },
    urgentes: function (a) { return a.priorite === "Urgent"; },
  };

  function rendre() {
    var mes = I.actives({ conseiller: P.moiId }).filter(function (a) { return !a.assignation; });
    var l = mes.filter(FILTRES[filtre]);
    bloc.querySelectorAll("[data-ia-filtre]").forEach(function (b) {
      var actif = b.dataset.iaFiltre === filtre;
      b.classList.toggle("is-active", actif);
      b.setAttribute("aria-pressed", actif ? "true" : "false");
      b.querySelector("span").textContent = String(mes.filter(FILTRES[b.dataset.iaFiltre]).length);
    });
    var corr = mes.filter(function (a) { return a.regle === "nouvelle-correspondance"; });
    bloc.querySelector("[data-ia-zone]").innerHTML =
      (corr.length ? '<p class="ia-tb-correspondances"><i class="bi bi-stars me-1" aria-hidden="true"></i>' + corr.length + " nouvelle(s) correspondance(s) automobile(s) : " + esc(corr.map(function (a) { return a.client + " — " + a.vehicule; }).join(", ")) + "</p>" : "") +
      (l.length ? '<div class="ia-tb-liste">' + l.slice(0, MAX).map(function (a) { return UI.carte(a, { compacte: true }); }).join("") + "</div>" +
        (l.length > MAX ? '<p class="small text-center my-2"><a href="' + esc(I.ref.urlActions || "#") + '">' + (l.length - MAX) + " autre(s) action(s) dans le Centre d'actions</a></p>" : "")
        : '<div class="sv-empty"><i class="bi bi-check2-circle"></i><span>' + (mes.length ? "Aucune action dans ce filtre." : "Aucune action à traiter pour le moment.") + "</span></div>");

    // « Prospects à recontacter » : prospects distincts ayant une relance recommandée.
    var kpi = document.querySelector('[data-indicateur="bi-chat-dots"]');
    if (kpi) {
      var relances = mes.filter(function (a) { return a.relance; });
      var prospects = relances.map(function (a) { return a.prospectId; }).filter(function (x, i, t) { return t.indexOf(x) === i; });
      kpi.textContent = String(prospects.length);
      var detail = kpi.parentNode.querySelector(".sv-kpi-detail");
      if (detail) detail.innerHTML = '<i class="bi bi-exclamation-triangle-fill"></i>' + esc(I.suspendues().length + " relance(s) suspendue(s) par les préférences de contact");
    }
  }

  bloc.addEventListener("click", function (e) {
    var b = e.target.closest("[data-ia-filtre]");
    if (!b) return;
    filtre = b.dataset.iaFiltre;
    rendre();
  });
  I.abonner(rendre);
  rendre();
})();
