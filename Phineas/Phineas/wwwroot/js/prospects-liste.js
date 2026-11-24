// Page « Prospects et opportunités » : compteurs, recherche, filtres, vue Liste et vue Pipeline.
(function () {
  "use strict";

  var P = window.Prospects;
  if (!P) return;
  var esc = P.esc;

  var f = {
    recherche: document.getElementById("f-recherche"),
    etape: document.getElementById("f-etape"),
    source: document.getElementById("f-source"),
    conseiller: document.getElementById("f-conseiller"),
    tri: document.getElementById("f-tri"),
    suivi: document.getElementById("f-suivi"),
  };

  // Les étapes détaillées du modèle sont regroupées en cinq colonnes de pipeline.
  // Gagné et Perdu restent filtrables mais n'ont pas de colonne.
  var GROUPES = [
    { cle: "nouveau", libelle: "Nouveau", etapes: ["Nouveau"] },
    { cle: "contacte", libelle: "Contacté", etapes: ["AQualifier", "Qualifie"] },
    { cle: "rencontre", libelle: "Rencontre", etapes: ["EssaiRoutier"] },
    { cle: "proposition", libelle: "Proposition", etapes: ["Soumission"] },
    { cle: "negociation", libelle: "Négociation", etapes: ["Negociation", "Finalisation"] },
    { cle: "gagne", libelle: "Gagné", etapes: ["Gagne"], cloture: true },
    { cle: "perdu", libelle: "Perdu", etapes: ["Perdu"], cloture: true },
  ];
  function groupeDe(etape) {
    return GROUPES.filter(function (g) { return g.etapes.indexOf(etape) >= 0; })[0] || null;
  }
  var corps = document.getElementById("liste-corps");
  var board = document.getElementById("pipeline");
  var zoneListe = document.getElementById("vue-liste-contenu");
  var zonePipeline = document.getElementById("vue-pipeline-contenu");
  var vide = document.getElementById("etat-vide");
  var aucun = document.getElementById("etat-aucun");
  var resultat = document.getElementById("resultat");
  var boutonsEffacer = document.querySelectorAll("[data-effacer-filtres]");
  var vue = "liste";
  var paginationListe = document.getElementById("pagination-liste");

  // Pagination : la page reste courte, quelle que soit la taille du portefeuille.
  var PAR_PAGE = 8;
  var PAR_COLONNE = 3;
  var pageListe = 1;
  var pagesColonnes = {};
  function revenirPremierePage() {
    pageListe = 1;
    pagesColonnes = {};
  }
  var dernierAjout = null;

  // Mémorise la vue choisie (confort uniquement).
  try {
    if (window.localStorage.getItem("phineas.salesos.prospects.vue") === "pipeline") vue = "pipeline";
  } catch (e) {}
  document.getElementById("vue-" + vue).checked = true;

  // ---------- Filtrage ----------
  function normaliser(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  function filtresActifs() {
    return !!(f.recherche.value.trim() || f.etape.value || f.source.value || f.conseiller.value || f.suivi.checked);
  }
  function correspondContact(c) {
    var q = normaliser(f.recherche.value.trim());
    // Un numéro se cherche sans tenir compte des espaces, tirets et parenthèses.
    if (/^[\d\s().-]+$/.test(q)) q = q.replace(/\D/g, "");
    if (q) {
      var texte = normaliser([c.prenom + " " + c.nom, c.nom + " " + c.prenom, c.courriel, (c.telephone || "").replace(/\D/g, "")].join(" "));
      if (texte.indexOf(q) < 0) return false;
    }
    if (f.source.value && c.source !== f.source.value) return false;
    if (f.conseiller.value && c.conseillerId !== f.conseiller.value) return false;
    return true;
  }
  function correspondOpp(o) {
    if (f.etape.value) {
      var g = groupeDe(o.etape);
      if (!g || g.cle !== f.etape.value) return false;
    }
    if (f.suivi.checked) {
      var s = P.suivi(o);
      if (!s || !s.requis) return false;
    }
    return true;
  }

  function trier(liste, cle) {
    var fois = {
      activite: function (x) { return -new Date(x.activite); },
      creation: function (x) { return -new Date(x.creation); },
      suivi: function (x) { return x.dateSuivi ? new Date(x.dateSuivi).getTime() : 8.64e15; },
    }[cle];
    return liste.sort(function (a, b) {
      if (cle === "nom") return a.nomTri.localeCompare(b.nomTri, "fr-CA");
      return fois(a) - fois(b);
    });
  }

  // ---------- Compteurs (sur l'ensemble des données de démonstration) ----------
  function compteurs() {
    var contacts = P.contacts();
    var opps = P.toutesOpportunites();
    var semaine = Date.now() - 7 * 86400000;
    var valeurs = {
      prospects: contacts.length,
      actives: opps.filter(P.estActive).length,
      nouveaux: contacts.filter(function (c) { return new Date(c.dateCreation) >= semaine; }).length,
      suivis: contacts.filter(function (c) { return P.suiviRequisContact(c.id); }).length,
    };
    Object.keys(valeurs).forEach(function (k) {
      document.querySelector('[data-compteur="' + k + '"]').textContent = valeurs[k];
    });
    document.querySelector("[data-point-suivis]").hidden = valeurs.suivis === 0;
  }

  // ---------- Fragments communs ----------
  function pastilleEtape(etape) {
    var g = groupeDe(etape);
    return '<span class="pr-pastille" title="' + esc(P.libelleEtape(etape)) + '">' + esc(g ? g.libelle : P.libelleEtape(etape)) + "</span>";
  }
  function majuscule(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }
  // Prochaine action : point ambre si un suivi est requis ; le motif et l'échéance sont en info-bulle.
  // action : l'objet qui porte prochaineAction ; opp : l'opportunité dont on vérifie le suivi.
  function texteProchaine(action, opp) {
    var suivi = null;
    if (opp) suivi = P.suivi(opp);
    var requis = suivi !== null && suivi.requis;

    // Texte de l'info-bulle : échéance puis motif du suivi, séparés par « · ».
    var infos = [];
    if (action && action.dateProchaineAction) infos.push("Échéance : " + P.echeance(action.dateProchaineAction));
    if (requis) infos.push(suivi.motif);

    var texte = '<span class="pr-attenue">Aucune action planifiée</span>';
    if (action && action.prochaineAction) texte = esc(action.prochaineAction);

    var html = '<span class="pr-action' + (requis ? " is-requis" : "") + '"';
    if (infos.length > 0) html += ' title="' + esc(infos.join(" · ")) + '"';
    html += ">";
    if (requis) html += '<span class="pr-point" aria-hidden="true"></span>';
    html += '<span class="pr-deux-lignes">' + texte + "</span>";
    // Le point ambre est invisible pour un lecteur d'écran : on lui donne le motif en texte.
    if (requis) html += '<span class="visually-hidden"> (' + esc(suivi.motif) + ")</span>";
    html += "</span>";
    return html;
  }

  // « VUS compact · 35 000 $ » : véhicule recherché et budget sur une ligne, ou null si rien n'est connu.
  function recherche(o) {
    if (!o) return null;

    var vehicule = P.resumeVehicule(o);
    var envisages = o.vehiculesEnvisages || [];
    if (envisages.length > 0) {
      // Premier véhicule envisagé seulement, les autres sont comptés (« Civic + 2 »).
      vehicule = envisages[0];
      if (envisages.length > 1) vehicule += " + " + (envisages.length - 1);
    }

    var morceaux = [];
    if (vehicule) morceaux.push(vehicule);
    var budget = P.resumeBudget(o.qualification);
    if (budget) morceaux.push(budget);

    if (morceaux.length === 0) return null;
    return morceaux.join(" · ");
  }
  // « Sophie G. » : prénom et initiale du nom.
  function nomCourt(cons) {
    if (cons.moi) return "Moi";
    var morceaux = String(cons.nom || "").split(" ");
    return morceaux[0] + (morceaux[1] ? " " + morceaux[1].charAt(0) + "." : "") + " (fictif)";
  }

  // ---------- Vue liste (une ligne par contact) ----------
  function lignes() {
    var res = [];
    P.contacts().forEach(function (c) {
      if (!correspondContact(c)) return;
      var opps = P.opportunitesDe(c.id).filter(correspondOpp);
      var filtreOpp = f.etape.value || f.suivi.checked;
      if (filtreOpp && !opps.length) return;
      var o = opps[0] || null;
      var action = filtreOpp ? (o && o.prochaineAction ? o : null) : P.prochaineAction(c.id);
      var derniere = P.derniereInteraction(c.id);
      res.push({
        c: c,
        o: o,
        action: action,
        autres: P.opportunitesDe(c.id).length - 1,
        derniere: derniere,
        activite: derniere ? derniere.date : c.dateCreation,
        creation: c.dateCreation,
        dateSuivi: action ? action.dateProchaineAction : null,
        nomTri: c.nom + " " + c.prenom,
      });
    });
    return trier(res, f.tri.value);
  }

  function rendreListe(items) {
    corps.innerHTML = items.map(function (x) {
      var c = x.c, o = x.o;
      var url = P.urlFiche(c.id);
      // Une seule coordonnée sous le nom : le courriel, sinon le téléphone.
      var coord = c.courriel || c.telephone;
      var cherche = recherche(o);
      return (
        '<tr data-url="' + esc(url) + '"' + (c.id === dernierAjout ? ' class="is-nouveau"' : "") + ">" +
        '<td data-label="Prospect"><div class="pr-personne"><span class="pr-avatar" aria-hidden="true">' + esc(P.initiales(c)) + "</span><div class=\"pr-personne-id\">" +
        '<a class="pr-nom" href="' + esc(url) + '">' + esc(c.prenom + " " + c.nom) + "</a>" +
        '<span class="pr-sous" title="' + esc(coord || "") + '">' + (coord ? esc(coord) : "Aucune coordonnée") + "</span></div></div></td>" +
        '<td data-label="Source et conseiller"><span class="pr-principal">' + esc(P.libelle("sources", c.source) || c.source) + "</span>" +
        '<span class="pr-sous">' + esc(nomCourt(P.conseiller(c.conseillerId))) + "</span></td>" +
        '<td data-label="Recherche">' + (cherche ? '<span class="pr-deux-lignes" title="' + esc(cherche) + '">' + esc(cherche) + "</span>" : '<span class="pr-attenue">Non précisé</span>') + "</td>" +
        '<td data-label="Étape">' + (o ? pastilleEtape(o.etape) : '<span class="pr-attenue">—</span>') +
        (x.autres > 0 ? '<span class="pr-sous">+ ' + x.autres + " opportunité" + (x.autres > 1 ? "s" : "") + "</span>" : "") + "</td>" +
        '<td data-label="Dernière interaction"><span title="' + esc(x.derniere ? x.derniere.resume : "") + '">' + esc(majuscule(P.relatif(x.activite))) + "</span></td>" +
        '<td data-label="Prochaine action">' + texteProchaine(x.action, o) + "</td>" +
        "</tr>"
      );
    }).join("");
  }

  // ---------- Vue pipeline (une carte par opportunité) ----------
  function rendrePipeline() {
    var colonnes = GROUPES.filter(function (g) { return !g.cloture; });
    var parGroupe = {};
    colonnes.forEach(function (g) { parGroupe[g.cle] = []; });
    var total = 0;
    P.toutesOpportunites().forEach(function (o) {
      var g = groupeDe(o.etape);
      if (!g || g.cloture) return;
      var c = P.contact(o.prospectId);
      if (!c || !correspondContact(c) || !correspondOpp(o)) return;
      parGroupe[g.cle].push({ o: o, c: c });
      total++;
    });

    board.innerHTML = colonnes.map(function (g) {
      var cartes = parGroupe[g.cle].sort(function (a, b) { return new Date(b.o.derniereActivite) - new Date(a.o.derniereActivite); });
      var nbPages = Math.max(1, Math.ceil(cartes.length / PAR_COLONNE));
      var page = Math.min(pagesColonnes[g.cle] || 1, nbPages);
      pagesColonnes[g.cle] = page;
      var visibles = cartes.slice((page - 1) * PAR_COLONNE, page * PAR_COLONNE);
      return (
        '<section class="pr-colonne" role="listitem" aria-label="' + esc(g.libelle) + ", " + cartes.length + ' opportunité(s)">' +
        '<header><span>' + esc(g.libelle) + '</span><span class="pr-compte">' + cartes.length + "</span></header>" +
        '<div class="pr-cartes">' +
        (visibles.length ? visibles.map(function (x) { return carte(x.o, x.c); }).join("") : '<div class="pr-colonne-vide">Aucune opportunité</div>') +
        "</div>" +
        (nbPages > 1
          ? '<nav class="pr-colonne-pages" aria-label="Pages de la colonne ' + esc(g.libelle) + '">' +
            '<button type="button" data-colonne="' + g.cle + '" data-sens="-1"' + (page === 1 ? " disabled" : "") + ' aria-label="Cartes précédentes"><i class="bi bi-chevron-left"></i></button>' +
            "<span>" + page + "/" + nbPages + "</span>" +
            '<button type="button" data-colonne="' + g.cle + '" data-sens="1"' + (page === nbPages ? " disabled" : "") + ' aria-label="Cartes suivantes"><i class="bi bi-chevron-right"></i></button>' +
            "</nav>"
          : "") +
        "</section>"
      );
    }).join("");
    return total;
  }

  function carte(o, c) {
    var cherche = recherche(o);
    var options = P.etapes.map(function (e) {
      return '<option value="' + esc(e.cle) + '"' + (e.cle === o.etape ? " selected" : "") + ">" + esc(e.libelle) + "</option>";
    }).join("");
    return (
      '<article class="pr-carte">' +
      '<a class="pr-nom" href="' + esc(P.urlFiche(c.id)) + '">' + esc(c.prenom + " " + c.nom) + "</a>" +
      '<span class="pr-sous">' + (cherche ? esc(cherche) : "Véhicule à préciser") + "</span>" +
      '<span class="pr-carte-action">' + texteProchaine(o, o) + "</span>" +
      '<label class="visually-hidden" for="etape-' + esc(o.id) + '">Déplacer ' + esc(c.prenom + " " + c.nom) + " vers l'étape</label>" +
      '<select class="pr-deplacer" id="etape-' + esc(o.id) + '" data-opp="' + esc(o.id) + '" title="Changer l\'étape">' + options + "</select>" +
      "</article>"
    );
  }

  // ---------- Pagination de la liste ----------
  // Numéros affichés : toutes les pages jusqu'à 7, sinon la première, la dernière et les voisines de la page courante.
  // Un null marque un trou entre deux numéros (affiché « … »). Exemple pour 10 pages, page 5 : 1 … 4 5 6 … 10.
  function numerosPages(nbPages, pageCourante) {
    var numeros = [];
    var precedent = 0;
    for (var page = 1; page <= nbPages; page++) {
      var estAuBord = page === 1 || page === nbPages;
      var estVoisine = Math.abs(page - pageCourante) <= 1;
      if (nbPages <= 7 || estAuBord || estVoisine) {
        if (page - precedent > 1) numeros.push(null);
        numeros.push(page);
        precedent = page;
      }
    }
    return numeros;
  }
  function rendrePagination(total) {
    var nb = Math.ceil(total / PAR_PAGE);
    paginationListe.hidden = nb <= 1;
    if (nb <= 1) return;
    var debut = (pageListe - 1) * PAR_PAGE + 1;
    var fin = Math.min(total, pageListe * PAR_PAGE);
    paginationListe.innerHTML =
      '<span class="pr-pages-info">' + debut + " à " + fin + " sur " + total + "</span>" +
      '<div class="pr-pages">' +
      '<button type="button" class="pr-page-btn" data-page="' + (pageListe - 1) + '"' + (pageListe === 1 ? " disabled" : "") + ' aria-label="Page précédente"><i class="bi bi-chevron-left"></i></button>' +
      numerosPages(nb, pageListe).map(function (n) {
        if (n === null) return '<span class="pr-pages-trou" aria-hidden="true">…</span>';
        return '<button type="button" class="pr-page-btn' + (n === pageListe ? " is-active" : "") + '" data-page="' + n + '"' +
          (n === pageListe ? ' aria-current="page"' : "") + ' aria-label="Page ' + n + '">' + n + "</button>";
      }).join("") +
      '<button type="button" class="pr-page-btn" data-page="' + (pageListe + 1) + '"' + (pageListe === nb ? " disabled" : "") + ' aria-label="Page suivante"><i class="bi bi-chevron-right"></i></button>' +
      "</div>";
  }

  // ---------- Rendu global ----------
  function rendre() {
    compteurs();
    var aucunProspect = P.contacts().length === 0;
    var n;
    if (vue === "liste") {
      var items = lignes();
      n = items.length;
      pageListe = Math.min(pageListe, Math.max(1, Math.ceil(n / PAR_PAGE)));
      rendreListe(items.slice((pageListe - 1) * PAR_PAGE, pageListe * PAR_PAGE));
      rendrePagination(n);
      resultat.textContent = n + " prospect" + (n > 1 ? "s" : "") + (filtresActifs() ? " correspondant" + (n > 1 ? "s" : "") + " aux critères" : "");
    } else {
      n = rendrePipeline();
      resultat.textContent = n + " opportunité" + (n > 1 ? "s" : "") + (filtresActifs() ? " correspondant" + (n > 1 ? "s" : "") + " aux critères" : "");
    }
    zoneListe.hidden = vue !== "liste" || n === 0;
    if (zoneListe.hidden) paginationListe.hidden = true;
    zonePipeline.hidden = vue !== "pipeline" || aucunProspect;
    aucun.hidden = !aucunProspect;
    vide.hidden = aucunProspect || n > 0 || vue === "pipeline";
    resultat.hidden = aucunProspect;
    // Le bouton de la barre de filtres n'apparaît que si un filtre est actif.
    boutonsEffacer.forEach(function (b) {
      if (b.closest(".pr-resultat-ligne")) b.hidden = !filtresActifs();
    });
  }

  // ---------- Événements ----------
  // Toute nouvelle recherche ou tout nouveau filtre repart de la première page.
  function relancer() {
    revenirPremierePage();
    rendre();
  }
  ["recherche"].forEach(function (k) { f[k].addEventListener("input", relancer); });
  ["etape", "source", "conseiller", "tri", "suivi"].forEach(function (k) { f[k].addEventListener("change", relancer); });

  paginationListe.addEventListener("click", function (e) {
    var b = e.target.closest("[data-page]");
    if (!b || b.disabled) return;
    pageListe = Number(b.dataset.page);
    rendre();
    paginationListe.querySelector('[aria-current="page"]').focus();
    zoneListe.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });

  board.addEventListener("click", function (e) {
    var b = e.target.closest("[data-colonne]");
    if (!b || b.disabled) return;
    var cle = b.dataset.colonne;
    var sens = b.dataset.sens;
    pagesColonnes[cle] = (pagesColonnes[cle] || 1) + Number(sens);
    rendre();
    // Garde le focus sur la flèche utilisée, ou sur l'autre si on est arrivé au bout.
    var cible = board.querySelector('[data-colonne="' + cle + '"][data-sens="' + sens + '"]:not([disabled])') ||
      board.querySelector('[data-colonne="' + cle + '"]:not([disabled])');
    if (cible) cible.focus();
  });

  document.querySelectorAll('input[name="vue"]').forEach(function (r) {
    r.addEventListener("change", function () {
      vue = r.value;
      try { window.localStorage.setItem("phineas.salesos.prospects.vue", vue); } catch (e) {}
      relancer();
    });
  });

  boutonsEffacer.forEach(function (b) {
    b.addEventListener("click", function () {
      f.recherche.value = "";
      f.etape.value = f.source.value = f.conseiller.value = "";
      f.suivi.checked = false;
      relancer();
      f.recherche.focus();
    });
  });

  // Toute la ligne est cliquable ; le lien du nom reste la cible clavier.
  corps.addEventListener("click", function (e) {
    if (e.target.closest("a")) return;
    var tr = e.target.closest("tr[data-url]");
    if (tr && !window.getSelection().toString()) window.location.href = tr.dataset.url;
  });

  board.addEventListener("change", function (e) {
    var sel = e.target.closest(".pr-deplacer");
    if (!sel) return;
    var o = P.opportunite(sel.dataset.opp);
    var c = o && P.contact(o.prospectId);
    // Opportunité enregistrée : le serveur valide, enregistre et trace le changement, puis recharge la liste.
    if (o && P.estEnregistree(o.id)) {
      sel.disabled = true;
      P.envoyerEtape(o.id, sel.value, "liste");
      return;
    }
    // Phase 07 : clôturer comme perdue se fait depuis la fiche (motif, origine du motif, futur suivi).
    if (sel.value === "Perdu" && o) {
      sel.value = o.etape;
      window.location.href = P.urlFiche(o.prospectId) + "?cloturer=" + encodeURIComponent(o.id);
      return;
    }
    var annuler = P.changerEtape(sel.dataset.opp, sel.value);
    if (!annuler) return;
    P.notifier(c.prenom + " " + c.nom + " : « " + P.libelleEtape(sel.value) + " » (modification locale).", annuler);
    var focus = document.getElementById("etape-" + o.id);
    if (focus) focus.focus();
  });

  document.querySelectorAll("[data-ouvrir-creation]").forEach(function (b) {
    b.addEventListener("click", function () {
      window.ProspectsTiroir.ouvrirCreation(function (id) {
        dernierAjout = id;
        relancer();
      });
    });
  });

  P.abonner(rendre);
  rendre();

  // Ouverture directe depuis l'action rapide du tableau de bord (?nouveau=true).
  var auto = document.querySelector("[data-ouvrir-creation][data-auto]");
  if (auto) auto.click();
})();
