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
    clotures: document.getElementById("f-clotures"),
  };
  var corps = document.getElementById("liste-corps");
  var board = document.getElementById("pipeline");
  var zoneListe = document.getElementById("vue-liste-contenu");
  var zonePipeline = document.getElementById("vue-pipeline-contenu");
  var vide = document.getElementById("etat-vide");
  var aucun = document.getElementById("etat-aucun");
  var resultat = document.getElementById("resultat");
  var boutonsEffacer = document.querySelectorAll("[data-effacer-filtres]");
  var vue = "liste";
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
    if (f.etape.value && o.etape !== f.etape.value) return false;
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
  }

  // ---------- Fragments communs ----------
  function pastilleEtape(etape) {
    return '<span class="status-pill sv-et-' + esc(etape) + '">' + esc(P.libelleEtape(etape)) + "</span>";
  }
  function badgeSuivi(o) {
    var s = P.suivi(o);
    if (!s || !s.requis) return "";
    return '<span class="pr-suivi" title="' + esc(s.motif) + '"><i class="bi bi-alarm"></i>' + esc(s.motif) + "</span>";
  }
  function texteProchaine(o) {
    if (!o || !o.prochaineAction) return '<span class="text-muted">Aucune action planifiée</span>';
    var retard = o.dateProchaineAction && P.ecartJours(o.dateProchaineAction) < 0;
    return esc(o.prochaineAction) +
      (o.dateProchaineAction ? '<span class="pr-echeance' + (retard ? " is-retard" : "") + '">' + esc(P.echeance(o.dateProchaineAction)) + "</span>" : "");
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
      var cons = P.conseiller(c.conseillerId);
      var url = P.urlFiche(c.id);
      // Liste : premier véhicule seulement, le détail est dans la fiche.
      var envisages = o && o.vehiculesEnvisages ? o.vehiculesEnvisages : [];
      var vehicule = envisages.length ? envisages[0] + (envisages.length > 1 ? " + " + (envisages.length - 1) + " autre" + (envisages.length > 2 ? "s" : "") : "") : o ? P.resumeVehicule(o) : null;
      var budget = o ? P.resumeBudget(o.qualification) : null;
      var coord = [c.telephone, c.courriel].filter(Boolean).map(function (v) {
        return '<span class="pr-coord-ligne" title="' + esc(v) + '">' + esc(v) + "</span>";
      }).join("");
      return (
        '<tr data-url="' + esc(url) + '"' + (c.id === dernierAjout ? ' class="is-nouveau"' : "") + ">" +
        '<td data-label="Prospect"><div class="pr-personne"><span class="avatar">' + esc(P.initiales(c)) + "</span><div>" +
        '<a class="pr-nom" href="' + esc(url) + '">' + esc(c.prenom + " " + c.nom) + "</a>" +
        '<div class="pr-coord">' + (coord || '<span class="text-muted">Aucune coordonnée</span>') + "</div></div></div></td>" +
        '<td data-label="Source et conseiller"><span class="badge-soft">' + esc(P.libelle("sources", c.source) || c.source) + "</span>" +
        '<div class="pr-sous pr-conseiller"><i class="bi bi-person"></i>' + esc(cons.moi ? "Moi" : cons.nom + " (fictif)") + "</div></td>" +
        '<td data-label="Recherche"><div>' + (vehicule ? esc(vehicule) : '<span class="text-muted">Non précisé</span>') + "</div>" +
        '<div class="pr-sous">' + (budget ? esc(budget) : "Budget inconnu") + "</div></td>" +
        '<td data-label="Étape">' + (o ? pastilleEtape(o.etape) : '<span class="text-muted">—</span>') +
        (x.autres > 0 ? '<div class="pr-sous">+ ' + x.autres + " autre" + (x.autres > 1 ? "s" : "") + " opportunité" + (x.autres > 1 ? "s" : "") + "</div>" : "") + "</td>" +
        '<td data-label="Dernière interaction"><div>' + esc(P.relatif(x.activite)) + '</div><div class="pr-sous pr-tronque">' + esc(x.derniere ? x.derniere.resume : "") + "</div></td>" +
        '<td data-label="Prochaine action"><div class="pr-prochaine">' + texteProchaine(x.action) + "</div>" + (o ? badgeSuivi(o) : "") + "</td>" +
        "</tr>"
      );
    }).join("");
  }

  // ---------- Vue pipeline (une carte par opportunité) ----------
  function rendrePipeline() {
    var parEtape = {};
    P.etapes.forEach(function (e) { parEtape[e.cle] = []; });
    var total = 0;
    P.toutesOpportunites().forEach(function (o) {
      var c = P.contact(o.prospectId);
      if (!c || !correspondContact(c) || !correspondOpp(o)) return;
      parEtape[o.etape].push({ o: o, c: c });
      total++;
    });

    board.innerHTML = P.etapes.filter(function (e) {
      return f.clotures.checked || P.actives.indexOf(e.cle) >= 0;
    }).map(function (e) {
      var cartes = parEtape[e.cle].sort(function (a, b) { return new Date(b.o.derniereActivite) - new Date(a.o.derniereActivite); });
      return (
        '<section class="board-col pr-col sv-et-' + esc(e.cle) + '" role="listitem" aria-label="' + esc(e.libelle) + ", " + cartes.length + ' opportunité(s)">' +
        '<header><span class="pr-col-titre">' + esc(e.libelle) + '</span><span class="count">' + cartes.length + "</span></header>" +
        '<div class="board-cards">' +
        (cartes.length ? cartes.map(function (x) { return carte(x.o, x.c); }).join("") : '<div class="pr-col-vide">Aucune opportunité</div>') +
        "</div></section>"
      );
    }).join("");
    return total;
  }

  function carte(o, c) {
    var vehicule = P.resumeVehicule(o);
    var budget = P.resumeBudget(o.qualification);
    var options = P.etapes.map(function (e) {
      return '<option value="' + esc(e.cle) + '"' + (e.cle === o.etape ? " selected" : "") + ">" + esc(e.libelle) + "</option>";
    }).join("");
    return (
      '<article class="vcard pr-carte">' +
      '<a class="pr-nom" href="' + esc(P.urlFiche(c.id)) + '">' + esc(c.prenom + " " + c.nom) + "</a>" +
      '<div class="vcard-meta">' + esc(o.titre) + "</div>" +
      '<div class="pr-carte-ligne"><i class="bi bi-car-front"></i>' + (vehicule ? esc(vehicule) : '<span class="text-muted">Véhicule à préciser</span>') + "</div>" +
      '<div class="pr-carte-ligne"><i class="bi bi-cash"></i>' + (budget ? esc(budget) : '<span class="text-muted">Budget inconnu</span>') + "</div>" +
      '<div class="pr-carte-ligne"><i class="bi bi-clock-history"></i>' + esc(P.relatif(o.derniereActivite)) + "</div>" +
      '<div class="pr-carte-action">' + texteProchaine(o) + "</div>" +
      badgeSuivi(o) +
      '<label class="visually-hidden" for="etape-' + esc(o.id) + '">Déplacer ' + esc(c.prenom + " " + c.nom) + " vers l'étape</label>" +
      '<select class="form-select form-select-sm pr-deplacer" id="etape-' + esc(o.id) + '" data-opp="' + esc(o.id) + '">' + options + "</select>" +
      "</article>"
    );
  }

  // ---------- Rendu global ----------
  function rendre() {
    compteurs();
    var aucunProspect = P.contacts().length === 0;
    var n;
    if (vue === "liste") {
      var items = lignes();
      rendreListe(items);
      n = items.length;
      resultat.textContent = n + " prospect" + (n > 1 ? "s" : "") + (filtresActifs() ? " correspondant" + (n > 1 ? "s" : "") + " aux critères" : "");
    } else {
      n = rendrePipeline();
      resultat.textContent = n + " opportunité" + (n > 1 ? "s" : "") + (filtresActifs() ? " correspondant" + (n > 1 ? "s" : "") + " aux critères" : "");
    }
    zoneListe.hidden = vue !== "liste" || n === 0;
    zonePipeline.hidden = vue !== "pipeline" || aucunProspect;
    aucun.hidden = !aucunProspect;
    vide.hidden = aucunProspect || n > 0 || vue === "pipeline";
    resultat.hidden = aucunProspect;
    // Le bouton de la barre de filtres n'apparaît que si un filtre est actif.
    boutonsEffacer.forEach(function (b) {
      if (b.closest(".pr-filtres")) b.hidden = !filtresActifs();
    });
  }

  // ---------- Événements ----------
  ["recherche"].forEach(function (k) { f[k].addEventListener("input", rendre); });
  ["etape", "source", "conseiller", "tri", "suivi", "clotures"].forEach(function (k) { f[k].addEventListener("change", rendre); });

  document.querySelectorAll('input[name="vue"]').forEach(function (r) {
    r.addEventListener("change", function () {
      vue = r.value;
      try { window.localStorage.setItem("phineas.salesos.prospects.vue", vue); } catch (e) {}
      rendre();
    });
  });

  boutonsEffacer.forEach(function (b) {
    b.addEventListener("click", function () {
      f.recherche.value = "";
      f.etape.value = f.source.value = f.conseiller.value = "";
      f.suivi.checked = false;
      rendre();
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
        rendre();
      });
    });
  });

  P.abonner(rendre);
  rendre();

  // Ouverture directe depuis l'action rapide du tableau de bord (?nouveau=true).
  var auto = document.querySelector("[data-ouvrir-creation][data-auto]");
  if (auto) auto.click();
})();
