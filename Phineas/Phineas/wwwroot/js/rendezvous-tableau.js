// Tableau de bord : le bloc « Rendez-vous à venir », l'indicateur et l'alerte de confirmation suivent l'état local
// de l'agenda (confirmations, annulations, créations faites dans cet onglet), pour ne jamais contredire l'agenda.
(function () {
  "use strict";

  var R = window.RendezVous, P = window.Prospects, UI = window.RendezVousUI;
  var zone = document.querySelector("[data-rdv-tableau]");
  if (!R || !P || !UI || !zone) return;
  var esc = P.esc;

  function aVenir() {
    var maintenant = new Date();
    return R.liste().filter(function (r) {
      return r.conseillerId === P.moiId && R.estActif(r) && R.fin(r) >= maintenant;
    }).sort(function (a, b) { return R.debut(a) - R.debut(b); });
  }

  function rendre() {
    var liste = aVenir();
    var html = "", jourCourant = null;
    liste.forEach(function (r) {
      var jour = new Date(r.debut).toDateString();
      if (jour !== jourCourant) {
        html += '<div class="sv-rdv-day">' + esc(R.jourTexte(r.debut)) + "</div>";
        jourCourant = jour;
      }
      var v = R.vehicule(r.vehiculeId);
      html += '<div class="sv-rdv"><time class="sv-rdv-time" datetime="' + esc(r.debut) + '">' + esc(R.heure(r.debut)) + "</time>" +
        '<div class="sv-rdv-info"><a class="sv-lien-fiche" href="' + esc(R.urlDetail(r.id)) + '"><strong>' + esc(UI.nomClient(r)) + "</strong></a>" +
        (v ? "<span>" + esc(R.nomVehicule(v)) + "</span>" : "") +
        '<span class="sv-rdv-meta"><span class="badge-soft">' + esc(R.type(r.type).libelle) + "</span>" +
        (r.statut === "Confirme"
          ? '<span class="sv-ok"><i class="bi bi-check-circle-fill"></i>Confirmé</span>'
          : '<span class="sv-warn"><i class="bi bi-question-circle-fill"></i>' + esc(R.statut(r.statut).libelle) + "</span>") +
        (R.actionsRequises(r).some(function (a) { return a.niveau === "critique"; }) ? '<span class="sv-warn"><i class="bi bi-exclamation-octagon-fill"></i>À vérifier</span>' : "") +
        "</span></div></div>";
    });
    zone.innerHTML = liste.length ? '<div class="sv-rdv-list">' + html + "</div>" : '<div class="sv-empty"><i class="bi bi-calendar"></i><span>Aucun rendez-vous prévu.</span></div>';

    var kpi = document.querySelector('[data-indicateur="bi-calendar-event"]');
    if (kpi) {
      kpi.textContent = String(liste.length);
      var detail = kpi.parentNode.querySelector(".sv-kpi-detail");
      if (detail) detail.textContent = liste.filter(function (r) { return R.memeJour(r.debut, new Date()); }).length + " aujourd'hui";
    }
    // L'alerte « à confirmer » disparaît si le rendez-vous a été confirmé, annulé ou replanifié dans l'agenda.
    document.querySelectorAll("[data-rdv-alerte]").forEach(function (li) {
      if (!li.dataset.rdvAlerte) return;
      var r = R.rdv(li.dataset.rdvAlerte);
      li.hidden = !r || r.statut !== "AConfirmer";
    });
    var alertes = document.getElementById("sv-alertes");
    if (alertes) alertes.querySelector("[data-vide]").classList.toggle("d-none", alertes.querySelectorAll(".sv-alert:not([hidden])").length > 0);
  }

  R.abonner(rendre);
  rendre();
})();
