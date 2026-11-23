// Composants partagés du module Transactions : pastilles, Deal Control Tower (axes), blocages, conditions de livraison.
// Chaque état est porté par une icône et un texte, jamais par la couleur seule.
(function () {
  "use strict";

  var T = window.Transactions, P = window.Prospects, S = window.Soumissions;
  if (!T || !P) return;
  var esc = P.esc;
  var ref = T.ref;

  var ICONES_ETAT = {
    NonCommencee: "bi-circle",
    EnCours: "bi-arrow-repeat",
    EnAttente: "bi-hourglass-split",
    Bloquee: "bi-sign-stop-fill",
    Terminee: "bi-check-circle-fill",
    NonApplicable: "bi-dash-circle",
  };
  var NIVEAUX = {
    critique: { titre: "Bloquant", detail: "Empêche la prochaine étape", icone: "bi-sign-stop-fill" },
    action: { titre: "À faire par vous", detail: "Vous pouvez avancer maintenant", icone: "bi-person-check" },
    attente: { titre: "En attente d'un autre département", detail: "Traitement normal, à suivre", icone: "bi-hourglass-split" },
    information: { titre: "Informations manquantes", detail: "N'empêchent pas encore d'avancer", icone: "bi-info-circle" },
  };

  function pastilleStatut(cle) {
    var s = T.statutAffiche(cle);
    return '<span class="tx-statut tx-st-' + esc(cle) + '"><i class="bi ' + esc(s.icone) + '" aria-hidden="true"></i>' + esc(s.libelle) + "</span>";
  }
  function pastilleEtat(etat) {
    return '<span class="tx-etat tx-et-' + esc(etat) + '"><i class="bi ' + ICONES_ETAT[etat] + '" aria-hidden="true"></i>' + esc(ref.etatsEtape[etat] || etat) + "</span>";
  }
  function pastilleVehicule(cle) {
    return cle ? '<span class="status-pill s-' + esc(cle) + '">' + esc(ref.statutsVehicule[cle] || cle) + "</span>" : '<span class="text-muted">Inconnu</span>';
  }
  function pastilleFinancement(cle) {
    return '<span class="tx-fin tx-fin-' + esc(cle) + '">' + esc(ref.statutsFinancement[cle] || cle) + "</span>";
  }
  function montant(cents) {
    return cents == null ? "—" : P.argent(Math.round(cents) / 100);
  }
  function duree(jours) {
    if (jours == null) return "";
    if (jours <= 0) return "aujourd'hui";
    return "depuis " + jours + " j";
  }
  function responsable(dep) {
    if (!dep) return "";
    return esc(dep.libelle) + (dep.personne ? ' <span class="pr-sous">· ' + esc(dep.personne) + " (fictif)</span>" : "");
  }

  // Indicateur compact des quatre axes (liste, pipeline, fiche prospect).
  function miniAxes(a) {
    return '<span class="tx-mini" role="img" aria-label="' + esc(a.axes.map(function (x) { return x.libelle + " : " + (ref.etatsEtape[x.etat] || x.etat).toLowerCase(); }).join(" ; ")) + '">' +
      a.axes.map(function (x) {
        return '<span class="tx-mini-seg tx-et-' + esc(x.etat) + '" title="' + esc(x.libelle + " : " + x.faites + " / " + x.total) + '"><i class="bi ' + ICONES_ETAT[x.etat] + '" aria-hidden="true"></i></span>';
      }).join("") + "</span>";
  }

  // Deal Control Tower : quatre axes indépendants, chacun avec ses étapes applicables.
  function tour(a) {
    return '<div class="tx-tour">' + a.axes.map(function (x) {
      return '<section class="tx-axe tx-et-' + esc(x.etat) + '" aria-labelledby="axe-' + esc(x.cle) + '">' +
        '<header><h3 id="axe-' + esc(x.cle) + '">' + esc(x.libelle) + "</h3>" + pastilleEtat(x.etat) + "</header>" +
        '<div class="tx-axe-progression"><div class="progress" role="progressbar" aria-label="' + esc(x.libelle) + " : " + x.faites + " étape(s) sur " + x.total + '" aria-valuenow="' + x.faites + '" aria-valuemin="0" aria-valuemax="' + x.total + '"><div class="progress-bar" style="width:' + (x.total ? Math.round(x.faites * 100 / x.total) : 100) + '%"></div></div><span>' + x.faites + " / " + x.total + "</span></div>" +
        '<ol class="tx-etapes">' + x.etapes.map(function (e) {
          return '<li class="tx-etape tx-et-' + esc(e.etat) + '"><i class="bi ' + ICONES_ETAT[e.etat] + '" aria-hidden="true"></i><div>' +
            '<span class="tx-etape-nom">' + esc(e.libelle) + '</span> <span class="visually-hidden">: ' + esc(ref.etatsEtape[e.etat]) + "</span>" +
            (e.etat !== "NonApplicable" && e.etat !== "Terminee" && e.responsable ? '<span class="tx-etape-resp">' + esc(ref.departements[e.responsable] ? ref.departements[e.responsable].libelle : e.responsable) + "</span>" : "") +
            (e.detail ? '<span class="tx-etape-detail">' + esc(e.detail) + "</span>" : "") +
            "</div></li>";
        }).join("") + "</ol></section>";
    }).join("") + "</div>";
  }

  // Éléments regroupés par nature. options.actions(e) peut fournir un bouton d'action du conseiller.
  function elements(liste, options) {
    options = options || {};
    var niveaux = options.niveaux || ["critique", "action", "attente", "information"];
    var html = niveaux.map(function (n) {
      var l = liste.filter(function (e) { return e.niveau === n; });
      if (!l.length) return "";
      return '<section class="tx-groupe tx-niv-' + n + '"><h3><i class="bi ' + NIVEAUX[n].icone + '" aria-hidden="true"></i>' + NIVEAUX[n].titre +
        ' <span class="pr-compte">' + l.length + '</span><span class="tx-groupe-detail">' + NIVEAUX[n].detail + "</span></h3><ul>" +
        l.map(function (e) { return element(e, options); }).join("") + "</ul></section>";
    }).join("");
    return html || '<div class="sv-empty"><i class="bi bi-check2-circle"></i><span>' + esc(options.vide || "Rien ne bloque cette transaction.") + "</span></div>";
  }
  function element(e, options) {
    var bouton = options.actions ? options.actions(e) : "";
    return '<li class="tx-element tx-niv-' + esc(e.niveau) + '" data-code="' + esc(e.code) + '">' +
      '<strong class="tx-element-nature">' + esc(e.nature) + "</strong>" +
      '<dl class="tx-element-meta">' +
      "<div><dt>Étape</dt><dd>" + esc(e.etapeLibelle) + "</dd></div>" +
      "<div><dt>Responsable</dt><dd>" + responsable({ libelle: e.departementLibelle, personne: e.personne }) + "</dd></div>" +
      (e.depuis ? "<div><dt>Détecté</dt><dd>" + esc(P.dateCourte(e.depuis)) + (e.joursEcoules != null ? ' <span class="pr-sous">· ' + esc(duree(e.joursEcoules)) + "</span>" : "") + "</dd></div>" : "") +
      "<div><dt>Impact</dt><dd>" + esc(e.impact) + "</dd></div>" +
      "<div><dt>Action nécessaire</dt><dd>" + esc(e.action) + "</dd></div>" +
      "</dl>" +
      '<div class="tx-element-vous">' + (e.actionVendeur
        ? '<span><i class="bi bi-person-check" aria-hidden="true"></i>Vous pouvez : ' + esc(e.actionVendeur.charAt(0).toLowerCase() + e.actionVendeur.slice(1)) + "</span>"
        : '<span class="text-muted"><i class="bi bi-lock" aria-hidden="true"></i>Action réservée à ' + esc(e.departementLibelle.toLowerCase()) + "</span>") +
      bouton + "</div></li>";
  }

  // Préparation à la livraison : pourcentage indicatif ET conditions réelles (les seules qui décident).
  function preparationLivraison(a) {
    var restantes = a.conditionsRestantes;
    return '<div class="tx-pret ' + (a.pret ? "is-pret" : "is-non-pret") + '">' +
      '<div class="tx-pret-tete"><span class="tx-pret-etat"><i class="bi ' + (a.pret ? "bi-check-circle-fill" : "bi-x-octagon") + '" aria-hidden="true"></i>' +
      (a.pret ? "Prête à livrer" : "Pas encore prête à livrer") + "</span>" +
      '<span class="pr-sous">' + a.preparation.faites + " prérequis sur " + a.preparation.total + " · " + a.preparation.pct + " %</span></div>" +
      '<div class="progress" role="progressbar" aria-label="Complétude des étapes applicables avant la livraison : ' + a.preparation.pct + ' %" aria-valuenow="' + a.preparation.pct + '" aria-valuemin="0" aria-valuemax="100"><div class="progress-bar" style="width:' + a.preparation.pct + '%"></div></div>' +
      '<p class="pr-note mt-2 mb-2"><i class="bi bi-info-circle me-1"></i>Le pourcentage est indicatif : seules les conditions ci-dessous autorisent la livraison.</p>' +
      '<ul class="tx-conditions">' + a.conditions.map(function (c) {
        return '<li class="' + (c.ok ? "is-ok" : "is-ko") + '"><i class="bi ' + (c.ok ? "bi-check-circle-fill" : "bi-x-circle") + '" aria-hidden="true"></i>' +
          '<span><span class="visually-hidden">' + (c.ok ? "Remplie : " : "Non remplie : ") + "</span>" + esc(c.libelle) +
          (c.detail ? ' <span class="pr-sous">(' + esc(c.detail) + ")</span>" : "") +
          (!c.ok ? '<span class="pr-sous d-block">Responsable : ' + esc(c.responsableLibelle) + "</span>" : "") + "</span></li>";
      }).join("") + "</ul>" +
      (restantes.length ? '<p class="mb-0 small"><strong>' + restantes.length + " condition(s) restante(s).</strong> Prochain responsable : " + esc(restantes[0].responsableLibelle) + ".</p>" : "") +
      "</div>";
  }

  // Résumé en une ligne de ce qui retient le dossier (liste, pipeline, tableau de bord).
  function resumeBlocage(a) {
    if (a.blocages.length) return '<span class="tx-resume tx-niv-critique"><i class="bi bi-sign-stop-fill" aria-hidden="true"></i>' + esc(a.blocages[0].nature) + (a.blocages.length > 1 ? " (+" + (a.blocages.length - 1) + ")" : "") + "</span>";
    if (a.actionsVendeur.length) return '<span class="tx-resume tx-niv-action"><i class="bi bi-person-check" aria-hidden="true"></i>' + esc(a.actionsVendeur[0].nature) + "</span>";
    var attente = a.elements.filter(function (e) { return e.niveau === "attente"; })[0];
    if (attente) return '<span class="tx-resume tx-niv-attente"><i class="bi bi-hourglass-split" aria-hidden="true"></i>' + esc(attente.nature) + "</span>";
    return "";
  }

  window.TransactionsUI = {
    icones: ICONES_ETAT,
    niveaux: NIVEAUX,
    pastilleStatut: pastilleStatut,
    pastilleEtat: pastilleEtat,
    pastilleVehicule: pastilleVehicule,
    pastilleFinancement: pastilleFinancement,
    montant: montant,
    duree: duree,
    responsable: responsable,
    miniAxes: miniAxes,
    tour: tour,
    elements: elements,
    preparationLivraison: preparationLivraison,
    resumeBlocage: resumeBlocage,
  };
})();
