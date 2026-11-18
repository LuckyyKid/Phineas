// Actions recommandées dans le contexte d'un dossier : fiche prospect, soumission, rendez-vous, transaction.
// Le bloc est rendu dans [data-ia-lien="prospect|soumission|rendezvous|transaction"] (data-id = identifiant).
// Aucune recommandation n'est recalculée ici : elles viennent du store du moteur.
(function () {
  "use strict";

  var I = window.Intelligence, P = window.Prospects, S = window.Soumissions, UI = window.IntelligenceUI;
  var bloc = document.querySelector("[data-ia-lien]");
  if (!I || !P || !UI || !bloc) return;
  var esc = P.esc;
  var genre = bloc.dataset.iaLien;
  var id = bloc.dataset.id;

  function section(titre, corps, note) {
    return '<section class="card ia-lien mb-4" aria-label="' + esc(titre) + '"><div class="card-header sv-card-header"><span><i class="bi bi-lightning-charge me-2"></i>' + esc(titre) + "</span>" +
      '<a class="btn btn-sm btn-link p-0" href="' + esc(I.ref.urlActions || "#") + '">Centre d\'actions</a></div><div class="card-body">' + corps + (note ? '<p class="pr-note mb-0 mt-2">' + note + "</p>" : "") + "</div></section>";
  }
  function cartes(l, vide) {
    return l.length ? '<div class="ia-file">' + l.map(function (a) { return UI.carte(a, { compacte: true }); }).join("") + "</div>" : '<p class="text-muted small mb-0">' + esc(vide) + "</p>";
  }

  function rendreProspect() {
    var c = P.contact(id);
    if (!c) { bloc.innerHTML = ""; return; }
    var actions = I.parProspect(id);
    var opps = P.opportunitesDe(id).filter(P.estActive);
    var html = '<h3 class="ia-sous-titre">Actions recommandées</h3>' + cartes(actions, "Aucune action recommandée pour ce prospect.");
    // Correspondances automobiles : les 2 meilleures par opportunité active.
    var corr = opps.map(function (o) {
      var l = I.vehiculesPour(o.id).filter(function (r) { return r.niveau === "compatible" || r.niveau === "partiel"; }).slice(0, 2);
      return l.length ? "<li><strong>" + esc(o.titre) + "</strong> : " + l.map(function (r) { return esc(S.nomVehicule(S.vehicule(r.vehiculeId))) + " " + UI.pastilleCompatibilite(r); }).join(" · ") +
        ' <a href="' + esc((I.ref.urlVehicules || "#") + "?opportunite=" + encodeURIComponent(o.id)) + '">Voir tout</a></li>' : "";
    }).join("");
    html += '<h3 class="ia-sous-titre">Correspondances automobiles</h3>' + (corr ? '<ul class="ia-liste-simple">' + corr + "</ul>" : '<p class="text-muted small">Aucune correspondance compatible ou critères insuffisants.</p>');
    var suivis = opps.filter(function (o) { return o.prochaineAction; }).map(function (o) { return "<li>" + esc(o.titre) + " : " + esc(o.prochaineAction) + (o.dateProchaineAction ? ' <span class="pr-sous">(' + esc(P.echeance(o.dateProchaineAction)) + ")</span>" : "") + "</li>"; }).join("");
    html += '<h3 class="ia-sous-titre">Suivis prévus</h3>' + (suivis ? '<ul class="ia-liste-simple">' + suivis + "</ul>" : '<p class="text-muted small">Aucun suivi planifié.</p>');
    var pref = I.preferences(id);
    var pauses = opps.map(function (o) { var p = I.pause(o.id); return p && new Date(p.jusqua) > new Date() ? o.titre + " : en pause jusqu'au " + P.dateCourte(p.jusqua) + " (" + p.motif + ")" : null; }).filter(Boolean);
    if ((pref && (pref.nePlusContacter || pref.consentement === "retire")) || pauses.length) {
      html += '<p class="ia-avertissement mt-2 mb-0"><i class="bi bi-pause-circle me-1"></i>' + esc([pref && pref.nePlusContacter ? "Le client a demandé à ne plus être sollicité." : null].concat(pauses).filter(Boolean).join(" ")) + "</p>";
    }
    var traitees = Object.keys(I.ref.etatsAction).filter(function (k) { return k === "Terminee" || k === "Ignoree" || k === "Obsolete"; })
      .reduce(function (l, k) { return l.concat(I.horsFile(k)); }, []).filter(function (a) { return a.prospectId === id; });
    if (traitees.length) html += '<h3 class="ia-sous-titre">Historique des traitements</h3><ul class="ia-liste-simple">' + traitees.map(function (a) {
      return "<li>" + esc(a.regleLibelle) + " — " + UI.pastilleEtat(a.statut) + "</li>";
    }).join("") + "</ul>";
    bloc.innerHTML = section("Intelligence commerciale", html);
  }
  function rendreObjet(type, titre, vide, note) {
    var l = I.parObjet(type, id);
    bloc.innerHTML = l.length || note ? section(titre, cartes(l, vide), note) : "";
  }

  function rendre() {
    if (genre === "prospect") rendreProspect();
    else if (genre === "soumission") rendreObjet("soumission", "Actions liées à la proposition", "Aucune action recommandée pour cette soumission.");
    else if (genre === "rendezvous") rendreObjet("rendezvous", "Actions liées au rendez-vous", "Aucune action recommandée pour ce rendez-vous.");
    else if (genre === "transaction") rendreObjet("transaction", "Actions recommandées", "Aucune action recommandée : le Deal Control Tower ne signale rien qui vous revienne.",
      "Ces recommandations reprennent les blocages et dépendances du Deal Control Tower : aucune seconde analyse n'est faite.");
  }
  I.abonner(rendre);
  rendre();
})();
