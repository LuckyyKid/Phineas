// Tableau de bord : indicateur « Transactions bloquées », bloc « Mes transactions » et alertes « Dossier bloqué »,
// calculés à partir du même état local que le module Transactions (jamais de version contradictoire).
(function () {
  "use strict";

  var T = window.Transactions, P = window.Prospects, UI = window.TransactionsUI;
  var bloc = document.querySelector("[data-trx-tableau]");
  if (!T || !P || !UI || !bloc) return;
  var esc = P.esc;

  function miennes() {
    return T.liste().filter(function (t) { return t.conseillerId === P.moiId && T.estActive(t); })
      .map(function (t) { return { t: t, a: T.analyse(t) }; });
  }
  function actionRequise(a) {
    return a.actionsVendeur.length > 0 || a.blocages.some(function (b) { return b.proprietaire === "vendeur"; });
  }

  function rendre() {
    var l = miennes();
    var bloquees = l.filter(function (x) { return x.a.blocages.length; });
    var actions = l.filter(function (x) { return actionRequise(x.a); });
    var livraisons = l.filter(function (x) { return x.t.livraison.datePrevue && P.ecartJours(x.t.livraison.datePrevue) >= 0; })
      .sort(function (x, y) { return new Date(x.t.livraison.datePrevue) - new Date(y.t.livraison.datePrevue); });

    var kpi = document.querySelector('[data-indicateur="bi-sign-stop"]');
    if (kpi) {
      kpi.textContent = String(bloquees.length);
      var detail = kpi.parentNode.querySelector(".sv-kpi-detail");
      if (detail) detail.innerHTML = '<i class="bi bi-exclamation-octagon-fill"></i>' + esc(actions.length + " nécessitent votre action");
    }

    function ligne(x, texte) {
      return '<li class="tx-tb-ligne"><a class="sv-lien-fiche" href="' + esc(T.urlDetail(x.t.id)) + '"><strong>' + esc(T.nomClient(x.t)) + "</strong></a>" +
        '<span class="pr-sous d-block">' + esc(T.nomVehicule(x.t)) + "</span>" + texte + "</li>";
    }
    bloc.querySelector("[data-trx-zone]").innerHTML =
      '<div class="tx-tb">' +
      '<div class="tx-tb-chiffres">' +
      '<span><strong data-trx-compte="bloquees">' + bloquees.length + "</strong> bloquée(s)</span>" +
      '<span><strong data-trx-compte="actions">' + actions.length + "</strong> action(s) requise(s)</span>" +
      '<span><strong data-trx-compte="livraisons">' + livraisons.length + "</strong> livraison(s) prévue(s)</span></div>" +
      (bloquees.length ? '<h3 class="tx-tb-titre">Bloquées</h3><ul class="tx-tb-liste">' + bloquees.slice(0, 3).map(function (x) { return ligne(x, UI.resumeBlocage(x.a)); }).join("") + "</ul>" : "") +
      (livraisons.length ? '<h3 class="tx-tb-titre">Prochaines livraisons</h3><ul class="tx-tb-liste">' + livraisons.slice(0, 3).map(function (x) {
        return ligne(x, '<span class="pr-sous d-block">' + esc(P.dateCourte(x.t.livraison.datePrevue)) + " · " + UI.pastilleStatut(x.a.statut) + "</span>");
      }).join("") + "</ul>" : "") +
      (!l.length ? '<div class="sv-empty"><i class="bi bi-cash-coin"></i><span>Aucune transaction en cours.</span></div>' : "") +
      "</div>";

    // Alertes « Dossier bloqué » : une par transaction bloquée, avant les autres alertes.
    var ancre = document.querySelector("[data-trx-alertes]");
    if (ancre) {
      document.querySelectorAll("[data-trx-alerte]").forEach(function (li) { li.remove(); });
      bloquees.forEach(function (x) {
        var b = x.a.blocages[0];
        var li = document.createElement("li");
        li.className = "sv-alert sv-al-DossierBloque";
        li.setAttribute("data-trx-alerte", x.t.id);
        li.innerHTML = '<span class="sv-alert-icon"><i class="bi bi-sign-stop"></i></span><div class="sv-alert-body">' +
          '<span class="sv-alert-type">Dossier bloqué · ' + esc(b.departementLibelle) + "</span>" +
          '<strong><a class="sv-lien-fiche" href="' + esc(T.urlDetail(x.t.id)) + '">' + esc(x.t.reference + " — " + T.nomClient(x.t)) + "</a></strong>" +
          "<span>" + esc(b.nature) + (x.a.blocages.length > 1 ? " (+" + (x.a.blocages.length - 1) + " autre" + (x.a.blocages.length > 2 ? "s" : "") + ")" : "") + "</span></div>";
        ancre.parentNode.insertBefore(li, ancre);
      });
      var alertes = document.getElementById("sv-alertes");
      if (alertes) alertes.querySelector("[data-vide]").classList.toggle("d-none", alertes.querySelectorAll(".sv-alert:not([hidden])").length > 0);
    }
  }

  T.abonner(rendre);
  rendre();
})();
