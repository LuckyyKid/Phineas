// Recommandations véhicules (Vehicle Matching Engine) : véhicules pour un prospect, prospects pour un véhicule,
// demandes de recherche non satisfaites et arrivées de véhicules simulées. Chargé par Views/Intelligence/Vehicules.cshtml.
// Le calcul vient du store et du module de matching ; cette page ne fait qu'afficher (en verre clair) et déclencher des actions locales.
(function () {
  "use strict";

  var I = window.Intelligence, P = window.Prospects, S = window.Soumissions, R = window.RendezVous, UI = window.IntelligenceUI;
  var racine = document.getElementById("matching");
  if (!I || !P || !S || !UI || !racine) return;
  var esc = P.esc;
  var GROUPES = [["budget", "Budget"], ["categorie", "Catégorie"], ["caracteristiques", "Caractéristiques"], ["places", "Nombre de places"], ["etat", "Neuf ou occasion"], ["marque", "Marque"]];
  // Pastilles affichées sur chaque carte véhicule : un groupe de critères du moteur par pastille.
  var PASTILLES = [["budget", "Budget"], ["categorie", "Catégorie"], ["caracteristiques", "Caractéristiques"], ["etat", "État"], ["marque", "Marque"]];
  var TEXTE_STATUT_PASTILLE = { satisfait: "satisfait", "non-satisfait": "non satisfait", inconnu: "à vérifier", "non-applicable": "non demandé" };
  var TITRE_SCORE = "Pourcentage des critères connus satisfaits (pondérés) : pas une probabilité d'achat.";

  function zone(n) {
    return racine.querySelector('[data-zone="' + n + '"]');
  }
  // Au-delà de LIGNES_PAR_PAGE, les listes (prospects d'un véhicule, demandes, arrivées) se découpent en pages.
  var LIGNES_PAR_PAGE = 6;
  // Page affichée de chaque liste, rangée par id de liste (ex. pages.demandes = 2). Absente = page 1.
  var pages = {};

  // Éléments de la page courante d'une liste, et la barre de pagination à afficher sous la liste.
  function paginer(idListe, elements) {
    var page = UI.pageValide(pages[idListe], elements.length, LIGNES_PAR_PAGE);
    pages[idListe] = page;
    var debut = (page - 1) * LIGNES_PAR_PAGE;
    return {
      elements: elements.slice(debut, debut + LIGNES_PAR_PAGE),
      pagination: UI.htmlPagination(idListe, elements.length, page, LIGNES_PAR_PAGE),
    };
  }

  function oppsActives() {
    return P.toutesOpportunites().filter(function (o) { return ["Gagne", "Perdu"].indexOf(o.etape) < 0; }).sort(function (a, b) {
      var ca = P.contact(a.prospectId), cb = P.contact(b.prospectId);
      return (ca.nom + ca.prenom).localeCompare(cb.nom + cb.prenom, "fr-CA");
    });
  }
  function libelleOpp(o) {
    var c = P.contact(o.prospectId);
    return c.prenom + " " + c.nom + " · " + o.titre;
  }
  function pastilleStatut(v) {
    var st = I.statutVehicule(v.id);
    return '<span class="ivv-statut">' + esc(S.libelleStatutVehicule(st)) + "</span>";
  }
  function texteKilometrage(v) {
    if (v.neuf) return "Neuf";
    return v.kilometrage.toLocaleString("fr-CA") + " km";
  }

  // ---------- Mode 1 ----------
  var selOpp = document.getElementById("m-opportunite");
  selOpp.innerHTML = oppsActives().map(function (o) { return '<option value="' + esc(o.id) + '">' + esc(libelleOpp(o)) + "</option>"; }).join("");
  if (racine.dataset.opportunite && P.opportunite(racine.dataset.opportunite)) selOpp.value = racine.dataset.opportunite;

  // Valeurs lisibles des critères de qualification (null si inconnues).
  function valeursCriteres(q) {
    var budget = null;
    if (q.budgetTotal != null) budget = P.argent(q.budgetTotal);
    else if (q.budgetMensuel != null) budget = P.argent(q.budgetMensuel) + " / mois (comparaison impossible)";
    var caracteristiques = (q.caracteristiques || []).map(function (k) { return P.libelle("caracteristiques", k); }).join(", ");
    var marques = (q.marques || []).concat(q.modeles || []).join(", ");
    return {
      budget: budget,
      categorie: P.libelle("categories", q.categorie),
      caracteristiques: caracteristiques || null,
      places: q.places ? q.places + " places" : null,
      etat: P.libelle("etats", q.etat),
      marque: marques || null,
    };
  }
  // Tableau libellé à gauche, valeur à droite.
  function tableauCriteres(valeurs) {
    return '<dl class="ivv-tableau">' + GROUPES.map(function (g) {
      var valeur = valeurs[g[0]];
      var affiche = valeur ? esc(valeur) : '<span class="iv-a-verifier">Non renseigné</span>';
      return "<div><dt>" + esc(g[1]) + "</dt><dd>" + affiche + "</dd></div>";
    }).join("") + "</dl>";
  }
  // Un interrupteur « indispensable » par critère ; désactivé si le critère est inconnu.
  function interrupteursIndispensables(valeurs, indisp) {
    return '<fieldset class="ivv-indispensables"><legend class="ivv-champ-label">Critères indispensables</legend>' + GROUPES.map(function (g) {
      var connu = !!valeurs[g[0]];
      var coche = indisp.indexOf(g[0]) >= 0 ? " checked" : "";
      var inactif = connu ? "" : " disabled";
      return '<div class="form-check form-switch iv-interrupteur"><input class="form-check-input" type="checkbox" role="switch" id="ind-' + g[0] + '" data-indispensable="' + g[0] + '"' + coche + inactif + " />" +
        '<label class="form-check-label" for="ind-' + g[0] + '">' + esc(g[1]) + "</label></div>";
    }).join("") + "</fieldset>";
  }
  function rendreCriteres() {
    var o = P.opportunite(selOpp.value);
    var q = (o && o.qualification) || {};
    var indisp = I.indispensables(o.id);
    var valeurs = valeursCriteres(q);
    zone("criteres").innerHTML = tableauCriteres(valeurs) + interrupteursIndispensables(valeurs, indisp) +
      '<p class="ivv-qualif"><a href="' + esc(P.urlFiche(o.prospectId) + "#qualification") + '">Compléter la qualification</a> pour améliorer la couverture.</p>';
  }

  // État d'un groupe de critères pour une pastille : un écart l'emporte, puis l'inconnu.
  function statutGroupe(r, groupe) {
    var items = r.items.filter(function (i) { return i.groupe === groupe && i.statut !== "non-applicable"; });
    if (!items.length) return "non-applicable";
    var ecart = items.some(function (i) { return i.statut === "non-satisfait"; });
    if (ecart) return "non-satisfait";
    var tousSatisfaits = items.every(function (i) { return i.statut === "satisfait"; });
    if (tousSatisfaits) return "satisfait";
    return "inconnu";
  }
  function pastillesCriteres(r) {
    return '<ul class="ivv-pastilles">' + PASTILLES.map(function (p) {
      var statut = statutGroupe(r, p[0]);
      var icone = statut === "satisfait" ? "bi-check2" : "bi-dash";
      var classe = statut === "satisfait" ? "ivv-pastille is-ok" : "ivv-pastille";
      return '<li class="' + classe + '" title="' + esc(p[1] + " : " + TEXTE_STATUT_PASTILLE[statut]) + '"><i class="bi ' + icone + '" aria-hidden="true"></i>' + esc(p[1]) +
        '<span class="visually-hidden"> : ' + esc(TEXTE_STATUT_PASTILLE[statut]) + "</span></li>";
    }).join("") + "</ul>";
  }
  // Score en grand, barre menthe vers sapin et niveau de compatibilité.
  function blocScore(r) {
    var afficherScore = r.score != null && r.niveau !== "a-verifier";
    var chiffre = afficherScore ? r.score + "<small>%</small>" : '<span class="ivv-score-inconnu">À vérifier</span>';
    var largeur = afficherScore ? r.score : 0;
    return '<div class="ivv-score" title="' + esc(TITRE_SCORE) + '"><span class="ivv-score-chiffre">' + chiffre + "</span>" +
      '<span class="ivv-barre" aria-hidden="true"><span style="width:' + largeur + '%"></span></span>' +
      '<span class="ivv-niveau">' + esc(UI.niveauxCompatibilite[r.niveau]) + "</span></div>";
  }
  function ligneVehicule(v, r) {
    var morceaux = [P.argent(v.prixDemande), texteKilometrage(v), "N° " + v.numeroStock];
    var statut = r.disponibilite.cle !== "disponible" ? pastilleStatut(v) : "";
    return '<span class="ivv-meta">' + esc(morceaux.join(" · ")) + "</span>" + statut;
  }
  function remarquesVehicule(r) {
    var html = "";
    if (r.ecarts.length) {
      var ecarts = r.ecarts.map(function (i) { return i.libelle + " (" + i.detail.replace(/\.$/, "") + ")"; }).join(" · ");
      html += '<p class="ivv-remarque"><i class="bi bi-x-circle" aria-hidden="true"></i>Écart : ' + esc(ecarts) + "</p>";
    }
    if (r.disponibilite.cle !== "disponible") {
      html += '<p class="ivv-remarque"><i class="bi bi-exclamation-circle" aria-hidden="true"></i>' + esc(r.disponibilite.texte) + "</p>";
    }
    return html;
  }
  // Menu « Proposer » : regroupe toutes les actions possibles sur le véhicule.
  function menuProposer(o, v, r, dejaEnvisage) {
    var items = '<li><button type="button" class="dropdown-item" data-voir="' + esc(v.id) + '"><i class="bi bi-eye" aria-hidden="true"></i>Consulter le véhicule</button></li>';
    if (r.disponibilite.cle !== "indisponible") {
      items += '<li><a class="dropdown-item" href="' + esc(S.urlNouvelle(o.id) + "&vehicule=" + encodeURIComponent(v.id)) + '"><i class="bi bi-file-earmark-text" aria-hidden="true"></i>Créer une soumission</a></li>';
      if (R) items += '<li><a class="dropdown-item" href="' + esc(R.urlNouveau({ opportunite: o.id, type: "EssaiRoutier", vehicule: v.id })) + '"><i class="bi bi-calendar-event" aria-hidden="true"></i>Planifier un essai</a></li>';
    }
    // Dossier réel : la note se saisit dans la fiche (enregistrée en base) ; les options envisagées ne sont pas encore
    // enregistrables. Démonstration : actions locales, comme avant (fonctionnalité 16).
    if (P.estEnregistree(o.id)) {
      items += '<li><a class="dropdown-item" href="' + esc(P.urlFiche(o.prospectId) + "#historique") + '" data-noter-fiche><i class="bi bi-journal-text" aria-hidden="true"></i>Ajouter une note dans la fiche</a></li>';
      items += '<li><p class="dropdown-item-text small mb-0">Dossier enregistré : les options envisagées ne sont pas encore enregistrables.</p></li>';
    } else {
      var libelleEnvisager = dejaEnvisage ? "Déjà envisagé" : "Ajouter aux options envisagées";
      items += '<li><button type="button" class="dropdown-item" data-envisager="' + esc(v.id) + '"' + (dejaEnvisage ? " disabled" : "") + '><i class="bi bi-bookmark-plus" aria-hidden="true"></i>' + libelleEnvisager + "</button></li>";
      items += '<li><button type="button" class="dropdown-item" data-noter="' + esc(v.id) + '"><i class="bi bi-journal-text" aria-hidden="true"></i>Enregistrer une note (démonstration)</button></li>';
    }
    return '<div class="dropdown ivv-proposer"><button type="button" class="iv-btn iv-btn-blanc" data-bs-toggle="dropdown" data-bs-popper-config=\'{"strategy":"fixed"}\' aria-expanded="false">Proposer</button>' +
      '<ul class="dropdown-menu dropdown-menu-end ivv-menu">' + items + "</ul></div>";
  }
  function carteVehicule(o, r) {
    var v = S.vehicule(r.vehiculeId);
    var nom = S.nomVehicule(v);
    var dejaEnvisage = (o.vehiculesEnvisages || []).indexOf(nom) >= 0;
    var resume = "Critères : " + r.satisfaits.length + " satisfait(s), " + r.ecarts.length + " écart(s), " + r.inconnus.length + " à vérifier";
    return '<article class="iv-verre ivv-vehicule ivv-niveau-' + esc(r.niveau) + '" data-vehicule-id="' + esc(v.id) + '">' +
      blocScore(r) +
      '<div class="ivv-corps"><div class="ivv-nom-ligne"><h3 class="ivv-nom">' + esc(nom) + "</h3>" + ligneVehicule(v, r) + (dejaEnvisage ? '<span class="ivv-statut">Option envisagée</span>' : "") + "</div>" +
      pastillesCriteres(r) + remarquesVehicule(r) +
      '<details class="ivv-detail"' + (r.niveau === "incompatible" ? " open" : "") + "><summary>" + esc(resume) + "</summary>" + UI.criteres(r) + "</details></div>" +
      menuProposer(o, v, r, dejaEnvisage) + "</article>";
  }
  function rendreVehicules() {
    var o = P.opportunite(selOpp.value);
    var l = I.vehiculesPour(o.id, { inclureIndisponibles: document.getElementById("m-indisponibles").checked });
    var compatibles = l.filter(function (r) { return r.niveau === "compatible"; }).length;
    document.getElementById("m-resultat").textContent = l.length + " véhicule(s) évalué(s) · " + compatibles + " compatible(s)";
    var tousInsuffisants = l.length && l.every(function (r) { return r.niveau === "a-verifier" && r.score == null; });
    var avis = tousInsuffisants ? '<p class="ivv-avis"><i class="bi bi-info-circle" aria-hidden="true"></i>Informations insuffisantes : trop peu de critères sont connus pour calculer une compatibilité fiable. Les véhicules sont listés « à vérifier ».</p>' : "";
    var vide = '<div class="iv-verre iv-vide"><i class="bi bi-car-front" aria-hidden="true"></i><strong>Aucun véhicule compatible</strong><span>Aucun véhicule disponible de l\'inventaire ne peut être évalué pour ce client. Vous pouvez enregistrer une demande de recherche.</span></div>';
    var cartes = l.map(function (r) { return carteVehicule(o, r); }).join("");

    // Après une action (note, option envisagée), la bande est redessinée : on garde la position pour le même client.
    var ancienne = document.querySelector("[data-swipe-piste]");
    var defilement = 0;
    if (ancienne && swipeOpportunite === o.id) defilement = ancienne.scrollLeft;
    swipeOpportunite = o.id;

    document.getElementById("m-vehicules").innerHTML = avis + (l.length ? htmlSwipe(cartes, l.length) : vide);
    var piste = document.querySelector("[data-swipe-piste]");
    if (!piste) return;
    piste.scrollLeft = defilement;
    piste.addEventListener("scroll", function () { majPositionSwipe(piste); });
    majPositionSwipe(piste);
  }

  // ---------- Swipe des véhicules d'un client ----------
  // Les véhicules défilent de gauche à droite, une carte à la fois (doigt, pavé tactile, flèches ou clavier).
  // Pas de pagination ici : la bande garde une seule hauteur, quelle que soit la taille de l'inventaire.
  var swipeOpportunite = null;

  function htmlSwipe(cartes, total) {
    var navigation = "";
    if (total > 1) {
      navigation = '<div class="ivv-swipe-nav">' +
        '<button type="button" class="iv-page-btn" data-swipe-sens="-1" aria-label="Véhicule précédent"><i class="bi bi-chevron-left"></i></button>' +
        '<span class="iv-pages-info" data-swipe-position aria-live="polite">1 sur ' + total + "</span>" +
        '<button type="button" class="iv-page-btn" data-swipe-sens="1" aria-label="Véhicule suivant"><i class="bi bi-chevron-right"></i></button>' +
        "</div>";
    }
    return '<div class="ivv-swipe">' +
      '<div class="ivv-swipe-piste" data-swipe-piste tabindex="0" role="region" aria-label="Véhicules évalués : faites glisser pour voir les suivants">' + cartes + "</div>" +
      navigation + "</div>";
  }

  // Largeur d'un pas de défilement : une carte plus l'espace entre deux cartes.
  function pasSwipe(piste) {
    var carte = piste.querySelector(".ivv-vehicule");
    if (!carte) return piste.clientWidth;
    var espace = parseFloat(getComputedStyle(piste).columnGap) || 0;
    return carte.offsetWidth + espace;
  }

  // Met à jour « 3 sur 9 » et désactive les flèches aux deux bouts de la bande.
  function majPositionSwipe(piste) {
    var position = document.querySelector("[data-swipe-position]");
    if (!position) return;
    var total = piste.querySelectorAll(".ivv-vehicule").length;
    var numero = Math.round(piste.scrollLeft / pasSwipe(piste)) + 1;
    numero = Math.min(Math.max(numero, 1), total);
    position.textContent = numero + " sur " + total;
    var auDebut = piste.scrollLeft <= 2;
    var aLaFin = piste.scrollLeft + piste.clientWidth >= piste.scrollWidth - 2;
    document.querySelector('[data-swipe-sens="-1"]').disabled = auDebut;
    document.querySelector('[data-swipe-sens="1"]').disabled = aLaFin;
  }

  // ---------- Mode 2 ----------
  var selVeh = document.getElementById("v-vehicule");
  function remplirVehicules() {
    var actuel = selVeh.value;
    selVeh.innerHTML = S.inventaire().filter(function (v) { return ["Vendu", "Livre"].indexOf(I.statutVehicule(v.id)) < 0; }).map(function (v) {
      return '<option value="' + esc(v.id) + '">' + esc(S.nomVehicule(v) + " · " + P.argent(v.prixDemande) + " · " + S.libelleStatutVehicule(I.statutVehicule(v.id))) + "</option>";
    }).join("");
    if (actuel && S.vehicule(actuel)) selVeh.value = actuel;
    else if (racine.dataset.vehicule && S.vehicule(racine.dataset.vehicule)) selVeh.value = racine.dataset.vehicule;
  }
  // Compatibilité courte pour le tableau : score (ou « À vérifier ») puis niveau.
  function compatibiliteCourte(r) {
    var afficherScore = r.score != null && r.niveau !== "a-verifier";
    var chiffre = afficherScore ? r.score + " %" : "À vérifier";
    return '<span class="ivv-compat" title="' + esc(TITRE_SCORE) + '"><strong>' + esc(chiffre) + "</strong> " + esc(UI.niveauxCompatibilite[r.niveau]) + "</span>";
  }
  function ligneProspect(r) {
    var o = r.opportunite, c = r.contact, q = o.qualification || {};
    var dernier = P.derniereInteraction(c.id);
    var texteDernier = dernier ? P.relatif(dernier.date) : "Aucun contact";
    var suivi = r.suspension ? '<span class="ivv-avertissement">' + esc(r.suspension) + "</span>" : '<span class="iv-sous">Contact possible</span>';
    return "<tr>" +
      '<td data-label="Prospect"><a class="iv-nom" href="' + esc(P.urlFiche(c.id)) + '">' + esc(c.prenom + " " + c.nom) + '</a><span class="iv-sous">' + esc(o.titre) + "</span></td>" +
      '<td data-label="Besoin et budget">' + esc(P.resumeVehicule(o) || P.libelle("categories", q.categorie) || "À préciser") + '<span class="iv-sous">' + esc(P.resumeBudget(q) || "Budget inconnu") + "</span></td>" +
      '<td data-label="Compatibilité">' + compatibiliteCourte(r) + '<span class="iv-sous">Couverture ' + r.couverture + " %</span></td>" +
      '<td data-label="Horizon et dernier contact">' + esc(P.libelle("horizons", q.horizon) || "Horizon inconnu") + '<span class="iv-sous">' + esc(texteDernier) + "</span></td>" +
      '<td data-label="Conseiller et suivi">' + esc(P.conseiller(c.conseillerId).nom) + suivi + "</td>" +
      '<td data-label="Actions"><span class="ivv-cellule-actions"><a class="iv-btn iv-btn-blanc iv-btn-petit" href="' + esc(P.urlFiche(c.id)) + '">Consulter</a>' +
      '<button type="button" class="iv-btn iv-btn-blanc iv-btn-petit" data-presenter="' + esc(o.id) + '"' + (r.suspension ? " disabled" : "") + ">Préparer une présentation</button>" +
      (P.estEnregistree(o.id)
        // Dossier réel : le suivi se planifie dans la fiche, où il est enregistré (fonctionnalité 16).
        ? '<a class="iv-btn iv-btn-discret" href="' + esc(P.urlFiche(c.id)) + '" data-suivi-fiche>Planifier le suivi dans la fiche</a>'
        : '<button type="button" class="iv-btn iv-btn-discret" data-suivi-opp="' + esc(o.id) + '">Ajouter un suivi (démonstration)</button>') +
      "</span></td></tr>";
  }
  function rendreProspects() {
    var v = S.vehicule(selVeh.value);
    if (!v) return;
    var morceaux = [P.argent(v.prixDemande), v.carrosserie || "", v.carburant || ""];
    zone("fiche-vehicule").innerHTML = '<p class="ivv-fiche-ligne"><strong>' + esc(S.nomVehicule(v)) + "</strong> · " + esc(morceaux.join(" · ")) + " " + pastilleStatut(v) + "</p>";
    var l = I.prospectsPour(v.id).filter(function (r) { return r.niveau !== "incompatible" && (r.score == null || r.score >= 50); });
    var morceau = paginer("v-prospects", l);
    document.getElementById("v-prospects").innerHTML = morceau.elements.map(ligneProspect).join("");
    zone("pagination-prospects").innerHTML = morceau.pagination;
    document.getElementById("v-vide").hidden = l.length > 0;
  }

  // ---------- Demandes et arrivées ----------
  var selDemOpp = document.getElementById("d-opportunite");
  // Demandes de recherche : locales, donc réservées aux dossiers de démonstration (fonctionnalité 16).
  selDemOpp.innerHTML = '<option value="">Choisir…</option>' + oppsActives().filter(function (o) { return !P.estEnregistree(o.id); }).map(function (o) { return '<option value="' + esc(o.id) + '">' + esc(libelleOpp(o)) + "</option>"; }).join("");
  function libelleCritere(cle) {
    var g = GROUPES.filter(function (x) { return x[0] === cle; })[0];
    return g ? g[1] : P.libelle("caracteristiques", cle) || cle;
  }
  function resumeDemande(dm) {
    var morceaux = [P.libelle("categories", dm.categorie), dm.budgetMax ? "≤ " + P.argent(dm.budgetMax) : null,
      (dm.caracteristiques || []).map(function (k) { return P.libelle("caracteristiques", k); }).join(", ") || null,
      dm.anneeMin ? "année ≥ " + dm.anneeMin : null, dm.kilometrageMax ? "≤ " + dm.kilometrageMax.toLocaleString("fr-CA") + " km" : null].filter(Boolean);
    return morceaux.join(" · ") || "Critères à préciser";
  }
  function menuStatutDemande(dm) {
    var options = Object.keys(I.ref.statutsDemande).map(function (k) {
      return '<option value="' + esc(k) + '"' + (dm.statut === k ? " selected" : "") + ">" + esc(I.ref.statutsDemande[k]) + "</option>";
    }).join("");
    return '<label class="visually-hidden" for="st-' + esc(dm.id) + '">État de la demande</label>' +
      '<select class="iv-select ivv-select-petit" id="st-' + esc(dm.id) + '" data-statut-demande="' + esc(dm.id) + '">' + options + "</select>";
  }
  function elementDemande(dm, corr) {
    var o = P.opportunite(dm.opportuniteId), c = o ? P.contact(o.prospectId) : null;
    var trouvees = corr.filter(function (a) { return a.objet.id === dm.id; });
    var html = '<li data-demande="' + esc(dm.id) + '"><div class="ivv-demande-texte"><strong>' + esc(c ? c.prenom + " " + c.nom : "?") + "</strong> · " + esc(o ? o.titre : "") +
      '<span class="ivv-demande-resume">' + esc(resumeDemande(dm)) + "</span>";
    if ((dm.indispensables || []).length) html += '<span class="iv-sous">Indispensable : ' + esc(dm.indispensables.map(libelleCritere).join(", ")) + "</span>";
    if (dm.alternatives) html += '<span class="iv-sous">Alternatives acceptables : ' + esc(dm.alternatives) + "</span>";
    html += '<span class="iv-sous">Conseiller : ' + esc(P.conseiller(dm.conseillerId).nom) + " · horizon : " + esc(P.libelle("horizons", dm.horizon) || "inconnu") + "</span>";
    if (trouvees.length) {
      html += '<span class="ivv-trouve"><i class="bi bi-stars" aria-hidden="true"></i>' + trouvees.length + " correspondance(s) : " + esc(trouvees.map(function (a) { return a.vehicule; }).join(", ")) +
        '. <a href="#" data-voir-action="' + esc(trouvees[0].id) + '">Voir dans le Centre d\'actions</a></span>';
    }
    return html + "</div>" + menuStatutDemande(dm) + "</li>";
  }
  function elementArrivee(x) {
    var details = [P.argent(x.vehicule.prixDemande), x.vehicule.carrosserie, x.vehicule.carburant, x.vehicule.kilometrage.toLocaleString("fr-CA") + " km"];
    var action = x.arrive
      ? '<span class="ivv-statut"><i class="bi bi-check2" aria-hidden="true"></i>Arrivé dans l\'inventaire de l\'onglet</span>'
      : '<button type="button" class="iv-btn iv-btn-blanc iv-btn-petit" data-arrivee="' + esc(x.vehicule.id) + '">Simuler l\'arrivée</button>';
    return '<div class="ivv-arrivee"><div><strong>' + esc(S.nomVehicule(x.vehicule)) + "</strong>" + '<span class="iv-sous">' + esc(details.join(" · ")) + "</span>" +
      '<span class="iv-sous">' + esc(x.evenement) + "</span></div>" + action + "</div>";
  }
  function rendreDemandes() {
    var corr = I.actives().filter(function (a) { return a.regle === "nouvelle-correspondance"; });
    var l = I.demandes();
    racine.querySelector('[data-champ="nb-demandes"]').textContent = String(l.filter(function (d) { return d.statut === "Active" || d.statut === "CorrespondanceTrouvee"; }).length);
    var videDemandes = '<div class="iv-vide"><i class="bi bi-car-front" aria-hidden="true"></i><strong>Aucune demande enregistrée</strong><span>Les demandes de recherche créées pour vos clients apparaîtront ici.</span></div>';
    var demandes = paginer("demandes", l);
    var htmlDemandes = '<ul class="ivv-demandes">' + demandes.elements.map(function (dm) { return elementDemande(dm, corr); }).join("") + "</ul>" + demandes.pagination;
    zone("demandes").innerHTML = l.length ? htmlDemandes : videDemandes;
    var arrivees = I.vehiculesSimules();
    var videArrivees = '<p class="iv-vide-texte">Aucune arrivée simulée disponible.</p>';
    var pageArrivees = paginer("arrivees", arrivees);
    var htmlArrivees = pageArrivees.elements.map(elementArrivee).join("") + pageArrivees.pagination;
    zone("arrivees").innerHTML = (arrivees.length ? htmlArrivees : videArrivees) + '<div data-zone="arrivee-resultat" aria-live="polite"></div>';
  }

  function rendre() {
    if (!P.opportunite(selOpp.value)) selOpp.selectedIndex = 0;
    rendreCriteres();
    rendreVehicules();
    remplirVehicules();
    rendreProspects();
    rendreDemandes();
  }

  // ---------- Fenêtres ----------
  function ouvrirFicheVehicule(id) {
    var v = S.vehicule(id);
    var lignes = [["N° d'inventaire", v.numeroStock], ["Prix demandé", P.argent(v.prixDemande)], ["Kilométrage", texteKilometrage(v)], ["Carrosserie", v.carrosserie], ["Motorisation", v.carburant],
      ["Transmission", v.transmission], ["Couleur", v.couleur], ["Emplacement", v.emplacement || "Non renseigné"], ["Caractéristiques", (v.caracteristiques || []).join(", ") || "Non renseignées"], ["Statut", S.libelleStatutVehicule(I.statutVehicule(v.id))]];
    UI.fenetre(S.nomVehicule(v), '<dl class="pr-liste-def pr-liste-def-compacte">' +
      lignes.map(function (x) { return "<div><dt>" + esc(x[0]) + "</dt><dd>" + esc(x[1] || "Non renseigné") + "</dd></div>"; }).join("") + "</dl>" +
      '<p class="pr-note mb-0">Fiche issue de l\'inventaire partagé de démonstration. Aucune caractéristique n\'est déduite : ce qui n\'est pas listé reste à vérifier.</p>');
  }
  function ouvrirPresentation(oppId) {
    var op = P.opportunite(oppId), c = P.contact(op.prospectId), ve = S.vehicule(selVeh.value);
    var rc = I.comparer(op.id, ve.id);
    UI.fenetre("Présentation personnalisée : " + c.prenom + " " + c.nom,
      '<p class="small">Points retenus à partir des critères connus (aucune caractéristique inventée) :</p><ul class="small">' + rc.satisfaits.map(function (i) { return "<li>" + esc(i.detail) + "</li>"; }).join("") + "</ul>" +
      (rc.inconnus.length ? '<p class="small rv-a-verifier">À vérifier avant d\'en parler : ' + esc(rc.inconnus.map(function (i) { return i.libelle; }).join(", ")) + ".</p>" : "") +
      '<label class="form-label" for="ia-presentation">Brouillon (modifiable)</label><textarea class="form-control" id="ia-presentation" rows="7">' +
      esc("Bonjour " + c.prenom + ",\n\nJe pense à vous en voyant le " + S.nomVehicule(ve) + " (" + P.argent(ve.prixDemande) + ") disponible chez nous. " +
        (rc.satisfaits.length ? "Il correspond à plusieurs de vos critères : " + rc.satisfaits.map(function (i) { return i.libelle.toLowerCase(); }).join(", ") + ". " : "") +
        "Souhaitez-vous que je vous en dise plus ?\n\n" + I.ref.conseillerNom) + "</textarea>" +
      '<p class="pr-note mt-2 mb-0">Rien n\'est envoyé : copiez le texte et transmettez-le vous-même.</p>');
  }

  // ---------- Événements ----------
  selOpp.addEventListener("change", rendre);
  document.getElementById("m-indisponibles").addEventListener("change", rendreVehicules);
  selVeh.addEventListener("change", function () {
    pages["v-prospects"] = 1;
    rendreProspects();
  });
  racine.addEventListener("change", function (e) {
    var ind = e.target.closest("[data-indispensable]");
    if (ind) I.basculerIndispensable(selOpp.value, ind.dataset.indispensable);
    var st = e.target.closest("[data-statut-demande]");
    if (st) {
      var ann = I.changerStatutDemande(st.dataset.statutDemande, st.value);
      P.notifier(ann ? "Demande : " + I.ref.statutsDemande[st.value].toLowerCase() + "." : "Changement impossible.", ann || undefined);
    }
  });
  racine.addEventListener("click", function (e) {
    var b = e.target.closest("button, a[data-voir-action]");
    if (!b || b.disabled) return;
    var o = P.opportunite(selOpp.value);
    if (b.dataset.allerPage) {
      // Pagination : change de page et garde le focus sur le numéro choisi.
      pages[b.dataset.liste] = Number(b.dataset.allerPage);
      rendre();
      var pageCourante = racine.querySelector('[data-liste="' + b.dataset.liste + '"][aria-current="page"]');
      if (pageCourante) pageCourante.focus();
    } else if (b.dataset.swipeSens) {
      // Flèches du swipe : avance ou recule d'une carte.
      var piste = racine.querySelector("[data-swipe-piste]");
      piste.scrollBy({ left: Number(b.dataset.swipeSens) * pasSwipe(piste), behavior: "smooth" });
    } else if (b.dataset.voir) {
      ouvrirFicheVehicule(b.dataset.voir);
    } else if (b.dataset.envisager) {
      var ok = P.ajouterVehiculeEnvisage(o.id, S.nomVehicule(S.vehicule(b.dataset.envisager)));
      P.notifier(ok ? "Véhicule ajouté aux options envisagées (démonstration, dans cet onglet)." : "Déjà envisagé.");
    } else if (b.dataset.noter) {
      var r = I.comparer(o.id, b.dataset.noter);
      var note = P.ajouterNote(o.prospectId, { type: "note", opportuniteId: o.id, resume: "Véhicule repéré : " + S.nomVehicule(S.vehicule(b.dataset.noter)) + " (" + UI.niveauxCompatibilite[r.niveau].toLowerCase() + (r.score != null ? ", " + r.score + " %" : "") + ", couverture " + r.couverture + " %)." });
      P.notifier(note ? "Note ajoutée à l'historique (démonstration, dans cet onglet)." : "Dossier enregistré : ajoutez la note dans la fiche du prospect.");
    } else if (b.dataset.presenter) {
      ouvrirPresentation(b.dataset.presenter);
    } else if (b.dataset.suiviOpp) {
      var ve2 = S.vehicule(selVeh.value), d1 = new Date(); d1.setDate(d1.getDate() + 1);
      var planifie = P.planifierSuivi(b.dataset.suiviOpp, "Présenter le " + S.nomVehicule(ve2), d1);
      P.notifier(planifie ? "Suivi ajouté à l'opportunité pour demain (démonstration, dans cet onglet)." : "Dossier enregistré : planifiez le suivi dans la fiche du prospect.");
    } else if (b.dataset.arrivee) {
      var nouvelles = I.simulerArrivee(b.dataset.arrivee);
      var texte = nouvelles && nouvelles.length
        ? nouvelles.length + " nouvelle(s) recommandation(s) : " + esc(nouvelles.map(function (a) { return a.client + " (" + a.vehicule + ")"; }).join(", ")) + "."
        : "aucune demande active ne correspond à ce véhicule (les demandes en pause ou clôturées ne sont pas réactivées).";
      zone("arrivee-resultat").innerHTML = '<p class="ivv-avis"><i class="bi bi-cone-striped" aria-hidden="true"></i>Simulation : ' + texte + "</p>";
    } else if (b.dataset.voirAction) {
      e.preventDefault();
      UI.fenetre("Recommandation", UI.carte(I.action(b.dataset.voirAction)));
    }
  });
  document.getElementById("form-demande").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target;
    f.elements.opportunite.classList.toggle("is-invalid", !f.elements.opportunite.value);
    if (!f.elements.opportunite.value) return;
    var indisp = Array.prototype.filter.call(f.querySelectorAll('[name="indispensable"]'), function (x) { return x.checked; }).map(function (x) { return x.value; });
    var dm = I.creerDemande({ opportuniteId: f.elements.opportunite.value, categorie: f.elements.categorie.value, budgetMax: f.elements.budget.value, anneeMin: f.elements.annee.value,
      kilometrageMax: f.elements.km.value, indispensables: indisp });
    P.notifier(dm ? "Demande de recherche ajoutée (démonstration, dans cet onglet)." : "Création impossible.");
    if (dm) f.reset();
  });

  I.abonner(rendre);
  rendre();
  if (racine.dataset.vehicule && S.vehicule(racine.dataset.vehicule) && window.bootstrap) bootstrap.Tab.getOrCreateInstance(document.getElementById("onglet-vehicule")).show();
})();
