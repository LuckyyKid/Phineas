// Composants partagés du module Rendez-vous : pastilles, alertes, assistant de préparation et checklists.
(function () {
  "use strict";

  var R = window.RendezVous, P = window.Prospects, S = window.Soumissions;
  if (!R || !P) return;
  var esc = P.esc;
  var A_VERIFIER = '<span class="rv-a-verifier">À vérifier</span>';

  function pastilleStatut(cle) {
    var s = R.statut(cle);
    return '<span class="rv-statut rv-st-' + esc(cle) + '"><i class="bi ' + esc(s.icone) + '" aria-hidden="true"></i>' + esc(s.libelle) + "</span>";
  }
  function pastilleType(cle) {
    var t = R.type(cle);
    return '<span class="badge-soft rv-type"><i class="bi ' + esc(t.icone) + '" aria-hidden="true"></i>' + esc(t.libelle) + "</span>";
  }
  // Même rendu que SoumissionsUI.pastilleVehicule (classes de soumissions.css), sans dépendre du module de calcul.
  function pastilleVehicule(cle) {
    return '<span class="status-pill s-' + esc(cle) + '">' + esc(S.libelleStatutVehicule(cle)) + "</span>";
  }
  function nomClient(r) {
    var c = P.contact(r.prospectId);
    return c ? c.prenom + " " + c.nom : "Prospect introuvable";
  }
  function alertes(liste) {
    if (!liste.length) return "";
    return '<ul class="rv-alertes">' + liste.map(function (a) {
      var icone = a.niveau === "critique" ? "bi-exclamation-octagon-fill" : "bi-exclamation-triangle-fill";
      return '<li class="rv-al-' + esc(a.niveau) + '"><i class="bi ' + icone + '" aria-hidden="true"></i><span><span class="visually-hidden">' +
        (a.niveau === "critique" ? "Bloquant : " : "Attention : ") + "</span>" + esc(a.texte) + "</span></li>";
    }).join("") + "</ul>";
  }
  function moyenPrefere(c) {
    if (!c) return null;
    var m = P.libelle("moyensContact", c.contactPrefere);
    var moment = P.libelle("momentsContact", c.momentContact);
    return (m || "Non précisé") + (moment ? ", " + moment.toLowerCase() : "");
  }
  // Coordonnée correspondant au moyen préféré (ou la première disponible).
  function coordonnee(c) {
    if (!c) return null;
    if (c.contactPrefere === "courriel" && c.courriel) return c.courriel;
    return c.telephone || c.courriel || null;
  }

  // ---------- Assistant de préparation (uniquement les informations déjà connues) ----------
  function derniereSoumission(r) {
    if (!S) return null;
    if (r.soumissionId && S.soumission(r.soumissionId)) return S.soumission(r.soumissionId);
    var l = S.parOpportunite(r.opportuniteId).slice().sort(function (a, b) { return new Date(S.dateModification(b)) - new Date(S.dateModification(a)); });
    return l[0] || null;
  }
  function objectionsConnues(r, o) {
    var liste = [];
    if (o && o.qualification && o.qualification.objections) liste.push(o.qualification.objections);
    R.parOpportunite(r.opportuniteId).forEach(function (x) {
      if (x.id !== r.id && x.resultat && x.resultat.objections) liste.push(x.resultat.objections + " (" + R.type(x.type).libelle.toLowerCase() + " du " + R.jourCourt(x.debut) + ")");
    });
    return liste;
  }
  function preparation(r) {
    var c = P.contact(r.prospectId);
    var o = P.opportunite(r.opportuniteId);
    var q = (o && o.qualification) || {};
    var s = derniereSoumission(r);
    var notes = P.interactionsDe(r.prospectId).filter(function (i) {
      return i.opportuniteId === r.opportuniteId && ["note", "appel", "visite", "courriel", "rendezvous"].indexOf(i.type) >= 0;
    }).slice(0, 3);
    var criteres = (q.elementsDecision || []).map(function (k) { return P.libelle("elementsDecision", k); })
      .concat((q.caracteristiques || []).map(function (k) { return P.libelle("caracteristiques", k); })).filter(Boolean);
    var objections = objectionsConnues(r, o);
    var manquants = P.completude(q).manquants;
    function ligne(t, v) {
      return "<div><dt>" + esc(t) + "</dt><dd>" + (v || A_VERIFIER) + "</dd></div>";
    }
    return '<dl class="pr-liste-def rv-prep">' +
      ligne("Client", c ? esc(c.prenom + " " + c.nom) + '<span class="pr-sous d-block">' + esc(moyenPrefere(c)) + (coordonnee(c) ? " · " + esc(coordonnee(c)) : "") + "</span>" : null) +
      ligne("Véhicule recherché", o && P.resumeVehicule(o) ? esc(P.resumeVehicule(o)) : null) +
      ligne("Budget indicatif", P.resumeBudget(q) ? esc(P.resumeBudget(q)) : null) +
      ligne("Mode d'achat envisagé", P.libelle("modesAchat", q.modeAchat) ? esc(P.libelle("modesAchat", q.modeAchat)) : null) +
      ligne("Horizon d'achat", P.libelle("horizons", q.horizon) ? esc(P.libelle("horizons", q.horizon)) : null) +
      ligne("Critères prioritaires", criteres.length ? esc(criteres.join(" · ")) : null) +
      ligne("Objections déjà exprimées", objections.length ? "<ul class=\"rv-puces\">" + objections.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : null) +
      ligne("Dernière soumission", s ? '<a href="' + esc(S.urlDetail(s.id)) + '">' + esc(s.reference) + "</a> " + '<span class="so-statut so-st-' + esc(S.statut(s)) + '">' + esc(S.libelleStatut(S.statut(s))) + "</span>" +
        '<span class="pr-sous d-block">' + esc(S.nomVehicule(S.versionCourante(s).vehicule)) + " · version " + S.versionCourante(s).numero + "</span>" : '<span class="text-muted">Aucune soumission</span>') +
      ligne("Dernières notes commerciales", notes.length ? "<ul class=\"rv-notes\">" + notes.map(function (i) {
        return "<li><span class=\"pr-sous\">" + esc(P.relatif(i.date)) + " · " + esc(i.auteur) + "</span>" + esc(i.resume) + "</li>";
      }).join("") + "</ul>" : null) +
      ligne("Informations manquantes", manquants.length ? '<span class="rv-a-verifier">' + esc(manquants.join(" · ")) + "</span>" : '<span class="text-muted">Qualification complète</span>') +
      "</dl>" +
      '<p class="pr-note mb-0"><i class="bi bi-info-circle me-1"></i>Résumé construit uniquement à partir du dossier. Ce qui n\'a pas été recueilli est indiqué « À vérifier ».</p>';
  }

  // Éléments de checklist applicables au rendez-vous.
  function checklist(r, essai) {
    var base = essai ? R.ref.checklistEssai : R.ref.checklistPreparation.filter(function (x) {
      if (x.cle === "soumission") return !!derniereSoumission(r);
      if (["disponibilite", "preparation", "technique"].indexOf(x.cle) >= 0) return !!r.vehiculeId;
      return true;
    });
    return base.map(function (x) { return { cle: x.cle, libelle: x.libelle, coche: !!(r.checklist && r.checklist[x.cle]) }; });
  }
  function progression(items) {
    var faits = items.filter(function (x) { return x.coche; }).length;
    return { faits: faits, total: items.length, pct: items.length ? Math.round(faits * 100 / items.length) : 100 };
  }
  function checklistHtml(r, essai, modifiable) {
    var items = checklist(r, essai);
    var p = progression(items);
    var id = essai ? "essai" : "prep";
    return '<div class="pr-completude rv-progression"><div class="pr-completude-tete"><span>Préparation</span><strong>' + p.faits + " / " + p.total + "</strong></div>" +
      '<div class="progress" role="progressbar" aria-label="Progression : ' + p.faits + " sur " + p.total + '" aria-valuenow="' + p.pct + '" aria-valuemin="0" aria-valuemax="100"><div class="progress-bar" style="width:' + p.pct + '%"></div></div></div>' +
      '<ul class="rv-checklist">' + items.map(function (x) {
        return '<li><div class="form-check"><input class="form-check-input" type="checkbox" id="ck-' + id + "-" + esc(x.cle) + '" data-cocher="' + esc(x.cle) + '"' + (x.coche ? " checked" : "") + (modifiable ? "" : " disabled") + ' />' +
          '<label class="form-check-label" for="ck-' + id + "-" + esc(x.cle) + '">' + esc(x.libelle) + "</label></div></li>";
      }).join("") + "</ul>";
  }

  // Fiche véhicule compacte, avec son statut de disponibilité.
  function vehiculeHtml(v) {
    if (!v) return '<p class="text-muted mb-0">Aucun véhicule associé.</p>';
    var ev = R.etatVehicule(v);
    return '<div class="rv-vehicule"><span class="so-photo"><i class="bi bi-car-front"></i><small>Photo non disponible</small></span><div>' +
      "<strong>" + esc(S.nomVehicule(v)) + "</strong>" +
      '<span class="pr-sous d-block">N° ' + esc(v.numeroStock) + " · " + esc(v.neuf ? "Neuf" : v.kilometrage.toLocaleString("fr-CA") + " km") + " · " + esc(P.argent(v.prixDemande)) + "</span>" +
      '<span class="pr-sous d-block">' + esc((v.caracteristiques || []).join(" · ")) + "</span>" +
      '<span class="d-flex flex-wrap gap-2 align-items-center mt-1">' + pastilleVehicule(v.statutActuel) +
      '<span class="pr-sous"><i class="bi bi-geo-alt me-1"></i>' + (v.emplacement ? esc(v.emplacement) : "Emplacement non renseigné") + "</span></span>" +
      (ev.niveau !== "ok" ? '<span class="so-alerte"><i class="bi bi-exclamation-triangle"></i>' + esc(ev.message) + "</span>" : "") +
      "</div></div>";
  }

  window.RendezVousUI = {
    pastilleStatut: pastilleStatut,
    pastilleType: pastilleType,
    pastilleVehicule: pastilleVehicule,
    nomClient: nomClient,
    alertes: alertes,
    moyenPrefere: moyenPrefere,
    coordonnee: coordonnee,
    preparation: preparation,
    derniereSoumission: derniereSoumission,
    checklist: checklist,
    progression: progression,
    checklistHtml: checklistHtml,
    vehiculeHtml: vehiculeHtml,
    A_VERIFIER: A_VERIFIER,
  };
})();
