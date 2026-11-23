// Page « Mes performances commerciales » (Views/Outils/Performances.cshtml, maquettes 21 à 27).
// Affiche, onglet par onglet, les calculs de performances-calcul.js (instantané des stores via outils-store.js)
// et les statistiques de la relation client (relations-store.js). Aucun chiffre n'est calculé ici en dehors de
// simples rapports entre deux valeurs déjà calculées (ex. « 86 % des créées »).
// Chaque onglet suit le même gabarit : une phrase de résumé, au plus 5 chiffres clés, au plus 2 graphiques,
// puis « Autres chiffres ».
(function () {
  "use strict";

  var P = window.Prospects, R = window.RendezVous, OV = window.OutilsVendeur, PC = window.PerformancesCalcul, RC = window.RelationsClients, I = window.Intelligence;
  var racine = document.getElementById("performances");
  if (!P || !OV || !PC || !racine) return;
  var esc = P.esc;
  var periode = document.getElementById("f-periode");

  // Nombre de constats visibles avant « Afficher les N autres constats ».
  var CONSTATS_VISIBLES = 4;
  // Nombre de semaines du graphique en colonnes.
  var NB_SEMAINES = 8;
  // Hauteur maximale, en pixels, de la plus haute colonne du graphique par semaine.
  var HAUTEUR_COLONNE_MAX = 150;
  // Rayon et épaisseur de l'anneau des taux (40 px de côté).
  var ANNEAU_RAYON = 16;
  var ANNEAU_EPAISSEUR = 5;

  // Onglet de chaque constat : la clé vient de PerformancesCalcul.axes.
  var DOMAINE_DES_CONSTATS = {
    rdv: { onglet: "rendezvous", libelle: "Rendez-vous" },
    soumissions: { onglet: "soumissions", libelle: "Soumissions" },
    vehicule: { onglet: "pipeline", libelle: "Pipeline" },
    delai: { onglet: "acquisition", libelle: "Acquisition" },
    "sans-reponse": { onglet: "acquisition", libelle: "Acquisition" },
  };
  var DOMAINE_DES_PERTES = { onglet: "relation", libelle: "Relation client" };

  // La liste des constats reste dépliée d'un rendu à l'autre (changement de période, mise à jour d'un store).
  var constatsDeplies = false;

  function zone(nom) { return racine.querySelector('[data-zone="' + nom + '"]'); }

  // ---------- Mots et nombres ----------

  // « 3,5 » plutôt que « 3.5 ».
  function nombre(valeur) { return String(valeur).replace(".", ","); }

  // Accorde un mot selon le nombre : accord(1, "gagnée", "gagnées") donne « gagnée ».
  function accord(n, singulier, pluriel) { return n === 1 || n === 0 ? singulier : pluriel; }

  // Valeur observée ou null (une valeur non disponible n'est jamais transformée en zéro).
  function valeurDe(o) { return o && o.statut === "observe" ? o.valeur : null; }

  function libellePeriode() {
    var option = periode.options[periode.selectedIndex];
    return option ? option.text : "";
  }

  // « 86 % » d'une partie sur un total, ou null si le total est nul.
  function pourcentage(partie, total) {
    if (!total) return null;
    return Math.round(partie / total * 100);
  }

  // Une proportion en mots : « une opportunité close sur trois a été gagnée ».
  function proportionEnMots(gagnees, closes) {
    if (!closes) return "Aucune opportunité n'a été close pendant la période.";
    if (gagnees === 0) return "Aucune opportunité close n'a été gagnée.";
    if (gagnees === closes) return "Toutes les opportunités closes ont été gagnées.";
    var part = gagnees / closes;
    var FRACTIONS = [
      { valeur: 1 / 4, texte: "Une opportunité close sur quatre a été gagnée." },
      { valeur: 1 / 3, texte: "Une opportunité close sur trois a été gagnée." },
      { valeur: 1 / 2, texte: "Une opportunité close sur deux a été gagnée." },
      { valeur: 2 / 3, texte: "Deux opportunités closes sur trois ont été gagnées." },
      { valeur: 3 / 4, texte: "Trois opportunités closes sur quatre ont été gagnées." },
    ];
    for (var i = 0; i < FRACTIONS.length; i++) {
      if (Math.abs(part - FRACTIONS[i].valeur) < 0.04) return FRACTIONS[i].texte;
    }
    return "Environ " + Math.round(part * 100) + " % des opportunités closes ont été gagnées.";
  }

  // « A », « A et B » ou « A, B et C ».
  function enumeration(mots) {
    if (mots.length <= 1) return mots.join("");
    return mots.slice(0, -1).join(", ") + " et " + mots[mots.length - 1];
  }

  // ---------- Petits blocs d'affichage ----------

  // Valeur d'un chiffre clé : le nombre et son unité, ou « Non disponible » avec la raison en infobulle.
  function htmlValeur(o, unite) {
    var v = valeurDe(o);
    if (v === null) return '<span class="pf-indispo" title="' + esc(o && o.note || "Données insuffisantes.") + '">Non disponible</span>';
    return esc(nombre(v)) + (unite ? '<span class="pf-unite">' + esc(unite) + "</span>" : "");
  }

  // Anneau de 40 px qui montre une proportion (arc vert sapin sur piste gris pâle). Décoratif : la valeur est écrite à côté.
  function htmlAnneau(pourcent) {
    var circonference = 2 * Math.PI * ANNEAU_RAYON;
    var arc = circonference * Math.max(0, Math.min(100, pourcent)) / 100;
    return '<svg class="pf-anneau" viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">' +
      '<circle cx="20" cy="20" r="' + ANNEAU_RAYON + '" fill="none" stroke="rgba(11,13,13,.08)" stroke-width="' + ANNEAU_EPAISSEUR + '"/>' +
      '<circle cx="20" cy="20" r="' + ANNEAU_RAYON + '" fill="none" stroke="#17614F" stroke-width="' + ANNEAU_EPAISSEUR + '" stroke-linecap="round"' +
      ' stroke-dasharray="' + arc.toFixed(1) + " " + circonference.toFixed(1) + '" transform="rotate(-90 20 20)"/></svg>';
  }

  // Carte de chiffre clé. options : { unite, precision, taux } ; taux = true affiche l'anneau quand la valeur existe.
  function htmlChiffre(libelle, o, options) {
    options = options || {};
    var anneau = options.taux && valeurDe(o) !== null ? htmlAnneau(valeurDe(o)) : "";
    return '<div class="pf-chiffre">' +
      '<div class="pf-chiffre-ligne">' + anneau + '<span class="pf-chiffre-valeur">' + htmlValeur(o, options.unite) + "</span></div>" +
      '<span class="pf-chiffre-libelle">' + esc(libelle) + "</span>" +
      (options.precision ? '<span class="pf-chiffre-precision">' + esc(options.precision) + "</span>" : "") +
      "</div>";
  }

  function htmlRangeeChiffres(cartes) {
    return '<div class="pf-chiffres pf-chiffres-' + cartes.length + '">' + cartes.join("") + "</div>";
  }

  // Note d'une valeur calculée (ex. « 3 observation(s), en jours ») réécrite sans « (s) ».
  function nbObservations(o) {
    var note = o && o.note ? o.note : "";
    var trouve = note.match(/^(\d+) observation/);
    if (!trouve) return "";
    var n = Number(trouve[1]);
    return n + " " + accord(n, "observation", "observations");
  }

  // Graphique en barres fines (répartition). lignes : [{ libelle, n, precision }] ; la plus grande valeur remplit la piste.
  function htmlRepartition(lignes) {
    if (!lignes.length) return '<p class="pf-vide">Aucune observation sur la période.</p>';
    var max = 0;
    lignes.forEach(function (l) { if (l.n > max) max = l.n; });
    return '<ul class="pf-repartition">' + lignes.map(function (l) {
      var largeur = max ? Math.round(l.n / max * 100) : 0;
      return '<li class="pf-ligne" title="' + esc(l.libelle + " : " + l.n) + '">' +
        '<div class="pf-ligne-tete"><span class="pf-ligne-libelle">' + esc(l.libelle) +
        (l.precision ? ' <span class="pf-ligne-precision">' + esc(l.precision) + "</span>" : "") + "</span>" +
        '<span class="pf-ligne-valeur">' + l.n + "</span></div>" +
        '<span class="pf-piste" aria-hidden="true"><span class="pf-barre-fine" style="width:' + largeur + '%"></span></span></li>';
    }).join("") + "</ul>";
  }

  // Graphique en barres épaisses (parcours, entonnoir). lignes : [{ libelle, n, precision }] ; la première étape sert d'échelle.
  function htmlParcours(lignes) {
    if (!lignes.length) return '<p class="pf-vide">Aucune observation sur la période.</p>';
    var max = 0;
    lignes.forEach(function (l) { if (l.n > max) max = l.n; });
    return '<ul class="pf-parcours">' + lignes.map(function (l) {
      var largeur = max ? Math.round(l.n / max * 100) : 0;
      return '<li class="pf-etape" title="' + esc(l.libelle + " : " + l.n) + '">' +
        '<span class="pf-etape-texte"><span class="pf-etape-libelle">' + esc(l.libelle) + "</span>" +
        (l.precision ? '<span class="pf-etape-precision">' + esc(l.precision) + "</span>" : "") + "</span>" +
        '<span class="pf-etape-piste" aria-hidden="true"><span class="pf-barre-epaisse" style="width:' + largeur + '%"></span></span>' +
        '<span class="pf-etape-valeur">' + l.n + "</span></li>";
    }).join("") + "</ul>";
  }

  // Carte de graphique : titre, phrase d'explication, le graphique, puis sa limite de lecture.
  function htmlCarteGraphique(titre, explication, graphique, limite) {
    return '<section class="pf-verre pf-carte pf-graphique">' +
      '<h2 class="pf-carte-titre">' + esc(titre) + "</h2>" +
      '<p class="pf-carte-sous">' + esc(explication) + "</p>" + graphique +
      (limite ? '<p class="pf-pied">' + esc(limite) + "</p>" : "") + "</section>";
  }

  // Un ou deux graphiques : côte à côte quand il y en a deux.
  function htmlGraphiques(cartes) {
    return '<div class="pf-graphiques pf-graphiques-' + cartes.length + '">' + cartes.join("") + "</div>";
  }

  // Carte « Autres chiffres » : lignes [{ libelle, precision, o, unite }]. lien : { texte, url } facultatif.
  function htmlAutresChiffres(lignes, lien) {
    if (!lignes.length) return "";
    return '<section class="pf-verre pf-carte pf-autres">' +
      '<div class="pf-autres-tete"><h2 class="pf-label">Autres chiffres</h2>' +
      (lien && lien.url ? '<a class="pf-lien" href="' + esc(lien.url) + '">' + esc(lien.texte) + ' <i class="bi bi-arrow-right" aria-hidden="true"></i></a>' : "") + "</div>" +
      '<ul class="pf-autres-liste">' + lignes.map(function (l) {
        return '<li><span><span class="pf-autres-libelle">' + esc(l.libelle) + "</span>" +
          (l.precision ? ' <span class="pf-autres-precision">' + esc(l.precision) + "</span>" : "") + "</span>" +
          '<span class="pf-autres-valeur">' + htmlValeur(l.o, l.unite) + "</span></li>";
      }).join("") + "</ul></section>";
  }

  function htmlResume(phrase) { return '<p class="pf-resume">' + esc(phrase) + "</p>"; }

  // Répartition triée de la plus grande à la plus petite valeur, à partir d'un objet { clé: nombre }.
  function lignesTriees(objet, libelleDe) {
    var lignes = Object.keys(objet).map(function (cle) { return { libelle: libelleDe(cle), n: objet[cle] }; });
    lignes.sort(function (a, b) { return b.n - a.n; });
    return lignes;
  }

  // ---------- Vue d'ensemble ----------

  // Texte d'un constat, sans le nombre (affiché à part) et accordé selon ce nombre.
  function texteConstat(c, cibleHeures, libellesPertes) {
    var n = c.n;
    if (c.cle === "rdv") return accord(n, "rendez-vous passé sans résultat enregistré", "rendez-vous passés sans résultat enregistré");
    if (c.cle === "soumissions") return accord(n, "opportunité avec une soumission envoyée et aucune prochaine action planifiée", "opportunités avec une soumission envoyée et aucune prochaine action planifiée");
    if (c.cle === "vehicule") return accord(n, "opportunité qualifiée sans véhicule proposé", "opportunités qualifiées sans véhicule proposé");
    if (c.cle === "delai") return accord(n, "première réponse", "premières réponses") + " au-delà de " + cibleHeures + " h (cible de démonstration)";
    if (c.cle === "sans-reponse") return accord(n, "opportunité récente sans premier échange enregistré", "opportunités récentes sans premier échange enregistré");
    if (c.cle.indexOf("perte-") === 0) return accord(n, "perte", "pertes") + " pour le motif « " + (libellesPertes[c.cle] || "") + " »";
    return c.texte;
  }

  function domaineConstat(c) {
    if (c.cle.indexOf("perte-") === 0) return DOMAINE_DES_PERTES;
    return DOMAINE_DES_CONSTATS[c.cle] || null;
  }

  function htmlConstats(constats, cibleHeures, libellesPertes) {
    if (!constats.length) return '<p class="pf-vide">Aucun constat particulier sur la période.</p>';
    var html = '<ul class="pf-constats">';
    constats.forEach(function (c, index) {
      var domaine = domaineConstat(c);
      var cache = !constatsDeplies && index >= CONSTATS_VISIBLES;
      var contenu = '<span class="pf-constat-nombre">' + c.n + "</span>" +
        '<span class="pf-constat-texte">' + esc(texteConstat(c, cibleHeures, libellesPertes)) +
        (domaine ? '<span class="pf-constat-domaine">' + esc(domaine.libelle) + "</span>" : "") + "</span>";
      if (domaine) {
        contenu = '<button type="button" class="pf-constat" data-ouvrir-onglet="' + domaine.onglet + '">' + contenu +
          '<i class="bi bi-arrow-right pf-constat-fleche" aria-hidden="true"></i></button>';
      } else {
        contenu = '<div class="pf-constat">' + contenu + "</div>";
      }
      html += "<li" + (cache ? " hidden" : "") + ">" + contenu + "</li>";
    });
    html += "</ul>";
    var autres = constats.length - CONSTATS_VISIBLES;
    if (autres > 0) {
      var texteBouton = constatsDeplies ? "Réduire la liste" : "Afficher " + accord(autres, "l'autre constat", "les " + autres + " autres constats");
      html += '<button type="button" class="pf-lien pf-deplier" data-deplier-constats aria-expanded="' + constatsDeplies + '">' + esc(texteBouton) + "</button>";
    }
    return html;
  }

  // Colonnes empilées par semaine : gagnées en bas (vert), perdues au-dessus (bleu doux), total écrit au-dessus.
  function htmlSemaines(semaines) {
    var max = 0;
    semaines.forEach(function (w) { if (w.gagnees + w.perdues > max) max = w.gagnees + w.perdues; });
    var colonnes = semaines.map(function (w) {
      var total = w.gagnees + w.perdues;
      var hauteurGagnees = max ? Math.round(w.gagnees / max * HAUTEUR_COLONNE_MAX) : 0;
      var hauteurPerdues = max ? Math.round(w.perdues / max * HAUTEUR_COLONNE_MAX) : 0;
      var date = P.dateCourte(w.debut);
      var infobulle = "Semaine du " + date + " : " + w.gagnees + " " + accord(w.gagnees, "gagnée", "gagnées") + ", " + w.perdues + " " + accord(w.perdues, "perdue", "perdues");
      return '<div class="pf-semaine" title="' + esc(infobulle) + '">' +
        '<span class="pf-semaine-total">' + total + "</span>" +
        '<span class="pf-pile" aria-hidden="true">' +
        (w.perdues ? '<span class="pf-seg pf-seg-perdues" style="height:' + hauteurPerdues + 'px"></span>' : "") +
        (w.gagnees ? '<span class="pf-seg pf-seg-gagnees" style="height:' + hauteurGagnees + 'px"></span>' : "") +
        "</span>" +
        '<span class="pf-semaine-date">' + esc(date) + "</span></div>";
    }).join("");
    // Équivalent lisible pour les lecteurs d'écran.
    var tableau = '<table class="visually-hidden"><caption>Opportunités closes par semaine</caption><thead><tr><th scope="col">Semaine du</th><th scope="col">Gagnées</th><th scope="col">Perdues</th></tr></thead><tbody>' +
      semaines.map(function (w) { return "<tr><th scope=\"row\">" + esc(P.dateCourte(w.debut)) + "</th><td>" + w.gagnees + "</td><td>" + w.perdues + "</td></tr>"; }).join("") +
      "</tbody></table>";
    return '<div class="pf-colonnes" aria-hidden="true">' + colonnes + "</div>" + tableau;
  }

  function rendreEnsemble(s, contexte) {
    var a = contexte.acquisition, p = contexte.pipeline;
    var creees = valeurDe(a.opportunitesCreees) || 0;
    var gagnees = valeurDe(p.gagnees) || 0;
    var perdues = valeurDe(p.perdues) || 0;
    var closes = gagnees + perdues;

    var phrase = creees + " " + accord(creees, "opportunité créée", "opportunités créées") + ", " +
      gagnees + " " + accord(gagnees, "gagnée", "gagnées") + " et " + perdues + " " + accord(perdues, "perdue", "perdues") + ". " +
      proportionEnMots(gagnees, closes);

    var tauxTexte = valeurDe(p.tauxReussite) === null ? "Non disponible" : nombre(valeurDe(p.tauxReussite)) + " %";
    var resume = '<section class="pf-resume-carte">' +
      '<p class="pf-resume-label">En résumé · ' + esc(libellePeriode()) + "</p>" +
      '<p class="pf-resume-phrase">' + esc(phrase) + "</p>" +
      '<div class="pf-resume-chiffres">' +
      '<div><span class="pf-resume-valeur">' + htmlValeur(a.nouveaux) + "</span><span>nouveaux prospects</span></div>" +
      '<div><span class="pf-resume-valeur">' + htmlValeur(a.opportunitesCreees) + "</span><span>opportunités créées</span></div>" +
      '<div><span class="pf-resume-valeur">' + htmlValeur(p.gagnees) + "</span><span>ventes gagnées</span></div>" +
      '<div><span class="pf-resume-valeur">' + esc(tauxTexte) + "</span><span>taux de réussite observé" + (closes ? " (" + gagnees + " sur " + closes + ")" : "") + "</span></div>" +
      "</div></section>";

    var entonnoir = htmlCarteGraphique("Entonnoir commercial",
      "Ce que sont devenues les " + creees + " " + accord(creees, "opportunité créée", "opportunités créées") + " pendant la période.",
      htmlParcours(contexte.lignesEntonnoir),
      "Chaque étape compte les opportunités qui l'ont atteinte. Une cohorte récente n'a pas encore eu le temps d'atteindre la vente.");

    var constats = '<section class="pf-verre pf-carte pf-graphique">' +
      '<h2 class="pf-carte-titre">À regarder en premier</h2>' +
      '<p class="pf-carte-sous">Des constats tirés de vos dossiers, du plus fréquent au plus rare.</p>' +
      '<div data-zone="constats">' + htmlConstats(contexte.constats, contexte.cibleHeures, contexte.libellesPertes) + "</div>" +
      '<p class="pf-pied">Ce sont des observations : une corrélation n\'est pas une explication.</p></section>';

    var semaines = PC.evolution(s, NB_SEMAINES);
    var parSemaine = '<section class="pf-verre pf-carte pf-carte-semaines">' +
      '<div class="pf-semaines-tete"><div><h2 class="pf-carte-titre">Opportunités closes par semaine</h2>' +
      '<p class="pf-carte-sous">Les huit dernières semaines. Peu d\'observations par semaine : à lire comme une tendance, pas comme une mesure.</p></div>' +
      '<ul class="pf-legende"><li><span class="pf-carre pf-seg-gagnees" aria-hidden="true"></span>Gagnées</li><li><span class="pf-carre pf-seg-perdues" aria-hidden="true"></span>Perdues</li></ul></div>' +
      htmlSemaines(semaines) + "</section>";

    zone("ensemble").innerHTML = resume + '<div class="pf-ensemble-deux">' + entonnoir + constats + "</div>" + parSemaine;
  }

  // ---------- Onglets de domaine ----------

  function rendreAcquisition(a) {
    var nouveaux = valeurDe(a.nouveaux) || 0;
    var sources = lignesTriees(a.parSource, function (cle) { return P.libelle("sources", cle) || (cle === "inconnue" ? "Source inconnue" : cle); });
    var principales = sources.slice(0, 2).map(function (l) { return l.libelle.charAt(0).toLowerCase() + l.libelle.slice(1); });
    var phrase = nouveaux + " " + accord(nouveaux, "nouveau prospect", "nouveaux prospects") + " sur la période (" + libellePeriode().toLowerCase() + ")";
    if (principales.length) phrase += ", surtout par " + enumeration(principales);
    phrase += ".";
    var delai = valeurDe(a.delaiPremiereReponse);
    phrase += delai === null ? " Le délai de première réponse n'est pas encore mesurable." : " La première réponse part après " + nombre(delai) + " h en médiane.";

    var chiffres = htmlRangeeChiffres([
      htmlChiffre("Nouveaux prospects", a.nouveaux, { precision: "Contacts créés pendant la période" }),
      htmlChiffre("Opportunités créées", a.opportunitesCreees, { precision: "Ouvertes pendant la période" }),
      htmlChiffre("Délai de première réponse", a.delaiPremiereReponse, { unite: " h", precision: "Médiane" + (nbObservations(a.delaiPremiereReponse) ? " sur " + nbObservations(a.delaiPremiereReponse) : "") }),
    ]);
    var graphique = htmlGraphiques([htmlCarteGraphique("Répartition des sources", "Nouveaux prospects de la période selon la source déclarée.",
      htmlRepartition(sources), "Une source déclarée n'est pas une attribution vérifiée.")]);
    var autres = [
      { libelle: "Sans premier échange", precision: "Exclues du délai, ce n'est pas un zéro", o: PC.obs(a.sansReponse) },
      { libelle: "Issus des recommandations", precision: "Recommandations attribuées, sans doublon", o: a.recommandations },
      { libelle: "Issus des annonces", precision: "Provenance établie par un lien ou un formulaire", o: a.annonces },
      { libelle: "Sources inconnues", precision: "Jamais devinées", o: a.sourcesInconnues },
    ];
    if (a.datesManquantes) autres.push({ libelle: "Contacts sans date de création", precision: "Exclus des calculs", o: PC.obs(a.datesManquantes) });
    zone("acquisition").innerHTML = htmlResume(phrase) + chiffres + graphique + htmlAutresChiffres(autres);
  }

  function rendrePipeline(p, lignesEntonnoir, creees) {
    var actives = valeurDe(p.actives) || 0;
    var enFinalisation = p.parEtape.Finalisation || 0;
    var gagnees = valeurDe(p.gagnees) || 0;
    var perdues = valeurDe(p.perdues) || 0;
    var closes = gagnees + perdues;
    var phrase = actives + " " + accord(actives, "opportunité est active", "opportunités sont actives") + ", dont " + enFinalisation + " en finalisation. ";
    if (closes) phrase += "Sur " + accord(closes, "la seule close", "les " + closes + " closes") + " pendant la période, " + gagnees + " " + accord(gagnees, "a été gagnée", "ont été gagnées") + ".";
    else phrase += "Aucune opportunité n'a été close pendant la période.";

    var dureeObs = nbObservations(p.dureeCommerciale);
    var chiffres = htmlRangeeChiffres([
      htmlChiffre("Opportunités actives", p.actives, { precision: "Toutes périodes, ni gagnées ni perdues" }),
      htmlChiffre("Gagnées", p.gagnees, { precision: "Vente livrée ou marquée gagnée" }),
      htmlChiffre("Perdues", p.perdues, { precision: "Clôturées comme perdues" }),
      htmlChiffre("Taux de réussite observé", p.tauxReussite, { unite: " %", taux: true, precision: closes ? gagnees + " sur " + closes + " " + accord(closes, "opportunité close", "opportunités closes") : "Aucune opportunité close" }),
      htmlChiffre("Durée commerciale", p.dureeCommerciale, { unite: " j", precision: "Moyenne de la création à la vente" + (dureeObs ? ", " + dureeObs : "") }),
    ]);
    var etapes = P.etapes.filter(function (e) { return p.parEtape[e.cle]; }).map(function (e) { return { libelle: e.libelle, n: p.parEtape[e.cle] }; });
    var graphiques = htmlGraphiques([
      htmlCarteGraphique("Opportunités par étape", "État actuel de toutes vos opportunités, toutes périodes.", htmlRepartition(etapes),
        "C'est un instantané : il ne dit pas combien de temps une opportunité reste à chaque étape."),
      htmlCarteGraphique("Entonnoir commercial", "Ce que sont devenues les " + creees + " " + accord(creees, "opportunité créée", "opportunités créées") + " pendant la période.",
        htmlParcours(lignesEntonnoir), "Chaque étape compte les opportunités qui l'ont atteinte. Une cohorte récente n'a pas encore eu le temps d'atteindre la vente."),
    ]);
    zone("pipeline").innerHTML = htmlResume(phrase) + chiffres + graphiques;
  }

  function rendreSoumissions(so) {
    var creees = valeurDe(so.creees) || 0;
    var envoyees = valeurDe(so.envoyees) || 0;
    var acceptees = valeurDe(so.acceptees) || 0;
    // Une réponse : soumission acceptée, refusée ou expirée (même définition que le taux d'acceptation).
    var reponses = acceptees + (valeurDe(so.refusees) || 0) + (valeurDe(so.expirees) || 0);
    var phrase = creees + " " + accord(creees, "soumission créée", "soumissions créées") + ", " + envoyees + " " + accord(envoyees, "envoyée", "envoyées") + ". ";
    if (reponses) phrase += "Parmi " + accord(reponses, "la seule qui a reçu une réponse", "les " + reponses + " qui ont reçu une réponse") + ", " + acceptees + " " + accord(acceptees, "a été acceptée", "ont été acceptées") + ".";
    else phrase += "Aucune n'a encore reçu de réponse.";

    var delaiObs = nbObservations(so.delaiReponse);
    var chiffres = htmlRangeeChiffres([
      htmlChiffre("Créées", so.creees, { precision: "Pendant la période" }),
      htmlChiffre("Envoyées", so.envoyees, { precision: "Au moins une version transmise au client" }),
      htmlChiffre("Taux d'acceptation", so.tauxAcceptation, { unite: " %", taux: true, precision: reponses ? acceptees + " sur " + reponses + " " + accord(reponses, "soumission ayant reçu une réponse", "soumissions ayant reçu une réponse") : "Aucune réponse reçue" }),
      htmlChiffre("Délai de réponse", so.delaiReponse, { unite: " j", precision: "Moyenne entre l'envoi et la réponse" + (delaiObs ? ", " + delaiObs : "") }),
    ]);
    var envoyeesPct = pourcentage(envoyees, creees), reponsesPct = pourcentage(reponses, envoyees), accepteesPct = pourcentage(acceptees, reponses);
    var parcours = [
      { libelle: "Créées", n: creees, precision: "Point de départ" },
      { libelle: "Envoyées", n: envoyees, precision: envoyeesPct === null ? "Non disponible" : envoyeesPct + " % des créées" },
      { libelle: "Avec réponse", n: reponses, precision: reponsesPct === null ? "Non disponible" : reponsesPct + " % des envoyées" },
      { libelle: "Acceptées", n: acceptees, precision: accepteesPct === null ? "Non disponible" : accepteesPct + " % des réponses" },
    ];
    var graphique = htmlGraphiques([htmlCarteGraphique("Parcours des soumissions", "De la création à la réponse du client.", htmlParcours(parcours),
      "Une réponse est une soumission acceptée, refusée ou expirée.")]);
    var autres = htmlAutresChiffres([
      { libelle: "Refusées", precision: "Sans version acceptée", o: so.refusees },
      { libelle: "Expirées", precision: "Sans acceptation ni refus", o: so.expirees },
      { libelle: "Opportunités avec plusieurs soumissions", precision: "Une vente reste comptée une seule fois", o: so.opportunitesAvecPlusieurs },
    ]);
    zone("soumissions").innerHTML = htmlResume(phrase) + chiffres + graphique + autres;
  }

  function rendreRendezVous(rv) {
    var planifies = valeurDe(rv.planifies) || 0;
    var confirmes = valeurDe(rv.confirmes) || 0;
    var realises = valeurDe(rv.realises) || 0;
    var connus = realises + (valeurDe(rv.absences) || 0);
    var phrase = planifies + " " + accord(planifies, "rendez-vous planifié", "rendez-vous planifiés") + ", dont " + confirmes + " " + accord(confirmes, "confirmé", "confirmés") + ". ";
    if (connus) phrase += "Sur " + accord(connus, "le seul rendez-vous passé", "les " + connus + " rendez-vous passés") + " dont on connaît le résultat, " + realises + " " + accord(realises, "a eu lieu", "ont eu lieu") + ".";
    else phrase += "Aucun rendez-vous passé n'a encore de résultat connu.";

    var chiffres = htmlRangeeChiffres([
      htmlChiffre("Planifiés", rv.planifies, { precision: "De la période et à venir" }),
      htmlChiffre("Confirmés", rv.confirmes, { precision: "Statut confirmé" }),
      htmlChiffre("Réalisés", rv.realises, { precision: "Rendez-vous terminés" }),
      htmlChiffre("Taux de présence", rv.tauxPresence, { unite: " %", taux: true, precision: connus ? realises + " sur " + connus + " " + accord(connus, "rendez-vous à l'issue connue", "rendez-vous à l'issue connue") : "Aucune issue connue" }),
    ]);
    var resultats = lignesTriees(rv.resultatsEssais, function (cle) { return R ? R.libelle("resultats", cle) || cle : cle; });
    var graphique = htmlGraphiques([htmlCarteGraphique("Résultats des essais routiers", "Résultat enregistré après chaque essai.", htmlRepartition(resultats),
      "Un essai sans résultat enregistré n'apparaît pas.")]);
    var autres = htmlAutresChiffres([
      { libelle: "Essais routiers", precision: "Rendez-vous de type essai", o: rv.essais },
      { libelle: "Prospects distincts", precision: "Plusieurs rendez-vous d'un même prospect comptent une fois", o: rv.prospectsDistincts },
      { libelle: "Absences", precision: "Client absent", o: rv.absences },
    ]);
    zone("rendezvous").innerHTML = htmlResume(phrase) + chiffres + graphique + autres;
  }

  function rendreTransactions(tr) {
    var ouvertes = valeurDe(tr.ouvertes) || 0;
    var bloquees = valeurDe(tr.bloquees) || 0;
    var duree = valeurDe(tr.dureeOuvertureLivraison);
    var phrase = ouvertes + " " + accord(ouvertes, "transaction est ouverte", "transactions sont ouvertes") + ", dont " + bloquees + " " + accord(bloquees, "bloquée", "bloquées") + ". ";
    phrase += duree === null ? "Aucune livraison n'a encore été confirmée sur la période." : "Une livraison arrive en moyenne " + nombre(duree) + " jours après l'ouverture du dossier.";

    var dureeObs = nbObservations(tr.dureeOuvertureLivraison);
    var chiffres = htmlRangeeChiffres([
      htmlChiffre("Ouvertes", tr.ouvertes, { precision: "Actives ou en attente" }),
      htmlChiffre("Bloquées", tr.bloquees, { precision: "Au moins un blocage en cours" }),
      htmlChiffre("Finalisées", tr.finalisees, { precision: "Livrées ou clôturées" }),
      htmlChiffre("De l'ouverture à la livraison", tr.dureeOuvertureLivraison, { unite: " j", precision: "Moyenne" + (dureeObs ? ", " + dureeObs : "") }),
    ]);
    var blocages = lignesTriees(tr.typesBlocage, function (cle) { return cle; });
    var graphique = htmlGraphiques([htmlCarteGraphique("Qui doit lever les blocages", "Blocages actuels des transactions ouvertes, par responsable.", htmlRepartition(blocages),
      "C'est un instantané, pas un historique.")]);
    var autres = htmlAutresChiffres([
      { libelle: "Livraisons réalisées", precision: "Confirmées pendant la période", o: tr.livraisons },
      { libelle: "Annulées", precision: "Gardées dans l'historique, jamais comptées comme ventes", o: tr.annulees },
    ]);
    zone("transactions").innerHTML = htmlResume(phrase) + chiffres + graphique + autres;
  }

  // Origine d'un motif de perte : « Confirmé », « Hypothèse », ou le détail quand les origines sont mélangées.
  function origineMotif(m) {
    if (m.confirmes === m.total) return "Confirmé";
    if (m.hypotheses === m.total) return "Hypothèse";
    if (m.inconnus === m.total) return "Origine inconnue";
    var morceaux = [];
    if (m.confirmes) morceaux.push(m.confirmes + " " + accord(m.confirmes, "confirmé", "confirmés"));
    if (m.hypotheses) morceaux.push(m.hypotheses + " " + accord(m.hypotheses, "hypothèse", "hypothèses"));
    if (m.inconnus) morceaux.push(m.inconnus + " " + accord(m.inconnus, "inconnu", "inconnus"));
    return morceaux.join(", ");
  }

  function rendreRelation(per) {
    if (!RC) {
      zone("relation").innerHTML = '<p class="pf-vide">Statistiques de la relation client non chargées.</p>';
      return;
    }
    var st = RC.statistiques(per), res = RC.indicateursReseau();
    var perdues = st.pertes.total, reactivees = st.pertes.reactivees;
    var motifs = st.pertes.parMotif.slice().sort(function (a, b) { return b.total - a.total; });
    var phrase = perdues + " " + accord(perdues, "opportunité perdue", "opportunités perdues") + ", dont " + reactivees + " " + accord(reactivees, "réactivée", "réactivées") + ".";
    var frequents = motifs.slice(0, 2).map(function (m) { return (RC.ref.motifsPerte[m.motif] || m.motif).toLowerCase(); });
    if (frequents.length === 2) phrase += " Les deux motifs les plus fréquents : " + enumeration(frequents) + ".";
    else if (frequents.length === 1) phrase += " Le motif le plus fréquent : " + frequents[0] + ".";

    var chiffres = htmlRangeeChiffres([
      htmlChiffre("Opportunités perdues", PC.obs(perdues), { precision: "Clôtures de la période" }),
      htmlChiffre("Réactivées", PC.obs(reactivees), { precision: "Par le conseiller" }),
      htmlChiffre("Prospects recommandés", PC.obs(st.reseau.prospects), { precision: "Sans doublon" }),
      htmlChiffre("Retours de satisfaction", PC.obs(st.satisfaction.reponses), { precision: "Réceptions simulées" }),
    ]);
    var lignesMotifs = motifs.map(function (m) { return { libelle: RC.ref.motifsPerte[m.motif] || m.motif, n: m.total, precision: origineMotif(m) }; });
    var lignesReseau = res.entonnoir.map(function (e) {
      var precision = "";
      if (e.denominateur != null) precision = e.taux == null ? "Non disponible" : e.taux + " % de l'étape précédente";
      return { libelle: e.libelle, n: e.nombre, precision: precision };
    });
    var graphiques = htmlGraphiques([
      htmlCarteGraphique("Motifs de perte", "Clôtures de la période, avec l'origine de chaque motif.", htmlRepartition(lignesMotifs), "Échantillon réduit : un motif isolé ne fait pas une tendance."),
      htmlCarteGraphique("Résultats des recommandations", "Des prospects recommandés jusqu'aux transactions, toutes périodes.", htmlParcours(lignesReseau), "Chaque étape est rapportée à l'étape précédente."),
    ]);
    var lienStatistiques = RC.ref.urls && RC.ref.urls.statistiques ? { texte: "Statistiques relationnelles", url: RC.ref.urls.statistiques } : null;
    var autres = htmlAutresChiffres([
      { libelle: "Problèmes ouverts", precision: "Après-vente", o: PC.obs(st.satisfaction.problemesOuverts) },
      { libelle: "Ventes livrées issues du réseau", precision: "Recommandations attribuées", o: PC.obs(st.reseau.livrees) },
    ], lienStatistiques);
    zone("relation").innerHTML = htmlResume(phrase) + chiffres + graphiques + autres;
  }

  // ---------- Rendu global ----------

  // Constats de la vue d'ensemble : mêmes compléments que la version précédente de la page, triés du plus fréquent au plus rare.
  function calculerConstats(s, per) {
    var mes = I ? I.actives({ conseiller: P.moiId }) : [];
    var motifsFrequents = [];
    if (RC) {
      motifsFrequents = RC.statistiques(per).pertes.parMotif.filter(function (m) { return m.total >= 2; }).map(function (m) {
        return { motif: m.motif, total: m.total, libelle: RC.ref.motifsPerte[m.motif] };
      });
    }
    var libellesPertes = {};
    motifsFrequents.forEach(function (mf) { libellesPertes["perte-" + mf.motif] = mf.libelle; });
    var cibleHeures = OV.ref.config.delaiPremiereReponseCibleHeures || 1;
    var constats = PC.axes(s, {
      rdvSansResultat: mes.filter(function (x) { return x.regle === "rdv-sans-resultat"; }).length,
      qualifieesSansVehicule: mes.filter(function (x) { return x.regle === "qualifiee-sans-vehicule" || (x.constats || []).some(function (c) { return c.regle === "qualifiee-sans-vehicule"; }); }).length,
      motifsFrequents: motifsFrequents,
      cibleHeures: cibleHeures,
    });
    constats.sort(function (a, b) { return b.n - a.n; });
    return { constats: constats, libellesPertes: libellesPertes, cibleHeures: cibleHeures };
  }

  function lignesEntonnoir(ent) {
    return ent.map(function (e) {
      var precision = "Cohorte de départ";
      if (e.taux) precision = e.taux.statut === "observe" ? e.taux.valeur + " % de la cohorte" : "Non disponible";
      return { libelle: e.libelle === "Avec rendez-vous tenu ou prévu" ? "Avec rendez-vous" : e.libelle, n: e.nombre, precision: precision };
    });
  }

  function rendre() {
    var per = periode.value ? Number(periode.value) : null;
    var s = OV.instantanePerformances(per);
    var a = PC.acquisition(s), p = PC.pipeline(s);
    var lignes = lignesEntonnoir(PC.entonnoir(s));
    var constats = calculerConstats(s, per);
    rendreEnsemble(s, {
      acquisition: a, pipeline: p, lignesEntonnoir: lignes,
      constats: constats.constats, libellesPertes: constats.libellesPertes, cibleHeures: constats.cibleHeures,
    });
    rendreAcquisition(a);
    rendrePipeline(p, lignes, valeurDe(a.opportunitesCreees) || 0);
    rendreSoumissions(PC.soumissions(s));
    rendreRendezVous(PC.rendezVous(s));
    rendreTransactions(PC.transactions(s));
    rendreRelation(per);
  }

  // ---------- Événements ----------

  function ouvrirOnglet(nom) {
    var bouton = document.getElementById("onglet-" + nom);
    if (bouton && window.bootstrap) bootstrap.Tab.getOrCreateInstance(bouton).show();
  }

  racine.addEventListener("click", function (e) {
    var constat = e.target.closest("[data-ouvrir-onglet]");
    if (constat) {
      ouvrirOnglet(constat.dataset.ouvrirOnglet);
      racine.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
    if (e.target.closest("[data-deplier-constats]")) {
      constatsDeplies = !constatsDeplies;
      rendre();
      var bouton = racine.querySelector("[data-deplier-constats]");
      if (bouton) bouton.focus();
    }
  });

  periode.addEventListener("change", rendre);
  OV.abonner(rendre);
  if (RC) RC.abonner(rendre);
  if (I) I.abonner(rendre);
  rendre();

  // Onglet demandé dans l'adresse (?onglet=pipeline), s'il existe.
  if (racine.dataset.onglet) ouvrirOnglet(racine.dataset.onglet);
})();
