// Modale « Préparer un rappel » : brouillon à transmettre par le conseiller. Aucun envoi, aucune trace d'envoi.
(function () {
  "use strict";

  var R = window.RendezVous, P = window.Prospects, UI = window.RendezVousUI;
  var el = document.getElementById("modal-rappel");
  if (!R || !P || !UI || !el) return;
  var esc = P.esc;
  var modal = bootstrap.Modal.getOrCreateInstance(el);
  var texte = document.getElementById("rappel-texte");

  function ouvrir(id) {
    var r = R.rdv(id);
    if (!r) return;
    var c = P.contact(r.prospectId);
    el.querySelector('[data-zone="rappel-contact"]').innerHTML =
      "<div><dt>Client</dt><dd>" + esc(UI.nomClient(r)) + "</dd></div>" +
      "<div><dt>Moyen préféré</dt><dd>" + esc(UI.moyenPrefere(c) || "Non précisé") + "</dd></div>" +
      "<div><dt>Coordonnée</dt><dd>" + (UI.coordonnee(c) ? esc(UI.coordonnee(c)) : '<span class="rv-a-verifier">À vérifier</span>') + "</dd></div>" +
      "<div><dt>Rendez-vous</dt><dd>" + esc(R.creneauTexte(r)) + "</dd></div>";
    texte.value = R.brouillonRappel(r);
    modal.show();
  }

  el.querySelector("[data-copier-rappel]").addEventListener("click", function () {
    texte.select();
    var fait = function () { P.notifier("Texte copié. Aucun message n'a été envoyé par Phineas."); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(texte.value).then(fait, fait);
    else {
      try { document.execCommand("copy"); } catch (e) {}
      fait();
    }
  });

  window.RappelRendezVous = { ouvrir: ouvrir };
})();
