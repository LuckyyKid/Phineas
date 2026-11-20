// Page « Agenda et rendez-vous » : compteurs, vues jour / semaine / mois / liste, filtres, sélection et confirmations.
(function () {
  "use strict";

  var R = window.RendezVous, P = window.Prospects, UI = window.RendezVousUI;
  var racine = document.getElementById("agenda");
  if (!R || !P || !UI || !racine) return;
  var esc = P.esc;

  var HAUTEUR_HEURE = 56;
  var JOURS_LISTE = 14;
  var VUES = ["jour", "semaine", "mois", "liste"];

  var f = {
    date: document.getElementById("f-date"),
    type: document.getElementById("f-type"),
    statut: document.getElementById("f-statut"),
    conseiller: document.getElementById("f-conseiller"),
    vehicule: document.getElementById("f-vehicule"),
    action: document.getElementById("f-action"),
  };
  var calendrier = document.getElementById("calendrier");
  var vide = document.getElementById("etat-vide");
  var resultat = document.getElementById("resultat");
  var periode = document.getElementById("agenda-periode");
  var panneau = bootstrap.Offcanvas.getOrCreateInstance(document.getElementById("selection"));

  // ---------- Dates ----------
  function debutJour(d) {
    var x = new Date(d);
    return new Date(x.getFullYear(), x.getMonth(), x.getDate());
  }
  function ajouterJours(d, n) {
    var x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }
  function debutSemaine(d) {
    var x = debutJour(d);
    return ajouterJours(x, -((x.getDay() + 6) % 7)); // lundi
  }
  function debutMois(d) {
    var x = new Date(d);
    return new Date(x.getFullYear(), x.getMonth(), 1);
  }
  function champDate(d) {
    return P.versChampDate(d);
  }
  function depuisChamp(v) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v || "")) return null;
    var p = v.split("-");
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return isNaN(d) ? null : d;
  }
  var fmtMois = new Intl.DateTimeFormat("fr-CA", { month: "long", year: "numeric" });
  var fmtJourEntete = new Intl.DateTimeFormat("fr-CA", { weekday: "short", day: "numeric" });
  var fmtJourLong = new Intl.DateTimeFormat("fr-CA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  var fmtCourt = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short" });
  function majuscule(t) {
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  // ---------- État de la page ----------
  var hash = window.location.hash.replace("#", "");
  var etat = {
    vue: VUES.indexOf(hash) >= 0 ? hash : window.matchMedia("(max-width: 767.98px)").matches ? "liste" : "semaine",
    date: depuisChamp(racine.dataset.date) || debutJour(new Date()),
    selection: null,
  };

  function periodeCourante() {
    if (etat.vue === "jour") return { debut: debutJour(etat.date), fin: ajouterJours(debutJour(etat.date), 1) };
    if (etat.vue === "semaine") { var l = debutSemaine(etat.date); return { debut: l, fin: ajouterJours(l, 7) }; }
    if (etat.vue === "mois") { var m = debutMois(etat.date); return { debut: m, fin: new Date(m.getFullYear(), m.getMonth() + 1, 1) }; }
    return { debut: debutJour(etat.date), fin: ajouterJours(debutJour(etat.date), JOURS_LISTE) };
  }
  function naviguer(sens) {
    if (etat.vue === "jour") etat.date = ajouterJours(etat.date, sens);
    else if (etat.vue === "semaine") etat.date = ajouterJours(etat.date, 7 * sens);
    else if (etat.vue === "mois") etat.date = new Date(etat.date.getFullYear(), etat.date.getMonth() + sens, 1);
    else etat.date = ajouterJours(etat.date, JOURS_LISTE * sens);
    rendre();
  }
  function libellePeriode(p) {
    if (etat.vue === "jour") return majuscule(fmtJourLong.format(p.debut));
    if (etat.vue === "mois") return majuscule(fmtMois.format(p.debut));
    var finIncluse = ajouterJours(p.fin, -1);
    return (etat.vue === "semaine" ? "Semaine du " : "Du ") + fmtCourt.format(p.debut) + " au " + fmtCourt.format(finIncluse) + " " + finIncluse.getFullYear();
  }

  // ---------- Filtres ----------
  function remplirVehicules() {
    var actuel = f.vehicule.value;
    var vus = {};
    R.liste().forEach(function (r) { if (r.vehiculeId) vus[r.vehiculeId] = R.vehicule(r.vehiculeId); });
    var ids = Object.keys(vus).sort(function (a, b) { return R.nomVehicule(vus[a]).localeCompare(R.nomVehicule(vus[b]), "fr-CA"); });
    f.vehicule.innerHTML = '<option value="">Tous les véhicules</option>' + ids.map(function (id) {
      var v = vus[id];
      return '<option value="' + esc(id) + '">' + esc(v ? R.nomVehicule(v) + " · " + v.numeroStock : id) + "</option>";
    }).join("");
    f.vehicule.value = vus[actuel] !== undefined ? actuel : "";
  }
  function filtresActifs() {
    return !!(f.type.value || f.statut.value || f.conseiller.value !== P.moiId || f.vehicule.value || f.action.checked);
  }
  function correspond(r) {
    if (f.type.value && r.type !== f.type.value) return false;
    if (f.statut.value && r.statut !== f.statut.value) return false;
    if (f.conseiller.value && r.conseillerId !== f.conseiller.value) return false;
    if (f.vehicule.value && r.vehiculeId !== f.vehicule.value) return false;
    if (f.action.checked && !R.actionsRequises(r).length) return false;
    return true;
  }
  function dansPeriode(r, p) {
    return R.debut(r) < p.fin && R.fin(r) > p.debut;
  }

  // ---------- Compteurs (mes rendez-vous, indépendamment des filtres) ----------
  function mesRendezVous() {
    return R.liste().filter(function (r) { return r.conseillerId === P.moiId; });
  }
  function aConfirmer() {
    return mesRendezVous().filter(function (r) {
      return R.actionsRequises(r).some(function (a) { return a.code === "a-confirmer"; });
    }).sort(function (a, b) { return R.debut(a) - R.debut(b); });
  }
  function compteurs() {
    var mes = mesRendezVous();
    var maintenant = new Date();
    var valeurs = {
      aujourdhui: mes.filter(function (r) { return R.memeJour(r.debut, maintenant) && ["Annule", "Replanifie"].indexOf(r.statut) < 0; }).length,
      aconfirmer: aConfirmer().length,
      essais: mes.filter(function (r) { return R.estEssai(r) && R.estActif(r) && R.fin(r) >= maintenant; }).length,
      suivis: mes.filter(R.suiviRequis).length,
    };
    Object.keys(valeurs).forEach(function (k) { racine.ownerDocument.querySelector('[data-compteur="' + k + '"]').textContent = valeurs[k]; });
  }

  // ---------- Événement ----------
  function description(r) {
    var v = R.vehicule(r.vehiculeId);
    var a = R.actionsRequises(r);
    return [R.plage(r), UI.nomClient(r), R.type(r.type).libelle, R.statut(r.statut).libelle, v ? R.nomVehicule(v) : null,
      a.length ? a.length + " point" + (a.length > 1 ? "s" : "") + " à vérifier" : null].filter(Boolean).join(", ");
  }
  function evenement(r, style) {
    var a = R.actionsRequises(r);
    var critique = a.some(function (x) { return x.niveau === "critique"; });
    var classes = "rv-evt rv-st-" + r.statut + (R.estActif(r) ? "" : " is-clos") + (a.length ? " has-alerte" : "") + (r.id === etat.selection ? " is-selection" : "");
    return '<button type="button" class="' + classes + '" data-rdv="' + esc(r.id) + '"' + (style ? ' style="' + style + '"' : "") + ' aria-label="' + esc(description(r)) + '"' + (r.id === etat.selection ? ' aria-pressed="true"' : ' aria-pressed="false"') + ">" +
      '<span class="rv-evt-ligne"><span class="rv-evt-icones" aria-hidden="true"><i class="bi ' + esc(R.statut(r.statut).icone) + '" title="' + esc(R.statut(r.statut).libelle) + '"></i>' +
      (a.length ? '<i class="bi ' + (critique ? "bi-exclamation-octagon-fill rv-ic-critique" : "bi-exclamation-triangle-fill rv-ic-attention") + '"></i>' : "") + "</span>" +
      '<span class="rv-evt-heure">' + esc(R.heure(r.debut)) + "</span> " +
      '<span class="rv-evt-client">' + esc(UI.nomClient(r)) + "</span></span>" +
      '<span class="rv-evt-type"><i class="bi ' + esc(R.type(r.type).icone) + '" aria-hidden="true"></i>' + esc(R.type(r.type).libelle) + "</span>" +
      "</button>";
  }

  // Répartit les rendez-vous qui se chevauchent sur des colonnes (couloirs).
  function couloirs(liste) {
    var tries = liste.slice().sort(function (a, b) { return R.debut(a) - R.debut(b) || R.fin(b) - R.fin(a); });
    var groupes = [], groupe = null, finGroupe = 0;
    tries.forEach(function (r) {
      if (!groupe || R.debut(r) >= finGroupe) { groupe = []; groupes.push(groupe); finGroupe = 0; }
      groupe.push(r);
      finGroupe = Math.max(finGroupe, R.fin(r).getTime());
    });
    var places = {};
    groupes.forEach(function (g) {
      var fins = [];
      g.forEach(function (r) {
        var i = 0;
        while (i < fins.length && fins[i] > R.debut(r).getTime()) i++;
        fins[i] = R.fin(r).getTime();
        places[r.id] = { couloir: i };
      });
      g.forEach(function (r) { places[r.id].nombre = fins.length; });
    });
    return places;
  }

  // ---------- Vues jour et semaine ----------
  function grille(jours, liste) {
    var hDebut = R.heureOuverture, hFin = R.heureFermeture;
    liste.forEach(function (r) {
      hDebut = Math.min(hDebut, R.debut(r).getHours());
      hFin = Math.max(hFin, Math.ceil((R.fin(r).getHours() * 60 + R.fin(r).getMinutes()) / 60));
    });
    hFin = Math.min(24, Math.max(hFin, hDebut + 1));
    var nbHeures = hFin - hDebut;
    var maintenant = new Date();
    var html = '<div class="rv-grille' + (jours.length > 1 ? " is-semaine" : "") + '" style="--rv-jours:' + jours.length + '">';
    html += '<div class="rv-grille-tete"><div></div>' + jours.map(function (j) {
      var auj = R.memeJour(j, maintenant);
      return '<div class="rv-jour-tete' + (auj ? " is-aujourdhui" : "") + '">' +
        '<button type="button" class="btn btn-link p-0" data-aller-jour="' + champDate(j) + '">' + esc(majuscule(fmtJourEntete.format(j))) + "</button>" +
        (auj ? '<span class="visually-hidden"> (aujourd\'hui)</span>' : "") +
        '<a class="rv-ajouter" href="' + esc(R.urlNouveau({ date: champDate(j) })) + '" aria-label="Nouveau rendez-vous le ' + esc(fmtJourLong.format(j)) + '"><i class="bi bi-plus"></i></a></div>';
    }).join("") + "</div>";
    html += '<div class="rv-grille-corps" style="height:' + nbHeures * HAUTEUR_HEURE + 'px">';
    html += '<div class="rv-heures" aria-hidden="true">';
    for (var h = hDebut; h < hFin; h++) html += '<div class="rv-heure" style="top:' + (h - hDebut) * HAUTEUR_HEURE + 'px">' + h + " h</div>";
    html += "</div>";
    jours.forEach(function (j) {
      var fin = ajouterJours(j, 1);
      var duJour = liste.filter(function (r) { return R.debut(r) >= j && R.debut(r) < fin; });
      var places = couloirs(duJour);
      html += '<div class="rv-col' + (R.memeJour(j, maintenant) ? " is-aujourdhui" : "") + '" style="--rv-heure:' + HAUTEUR_HEURE + 'px" role="group" aria-label="' + esc(majuscule(fmtJourLong.format(j))) + " : " + duJour.length + ' rendez-vous">';
      if (R.memeJour(j, maintenant)) {
        var minutes = (maintenant.getHours() - hDebut) * 60 + maintenant.getMinutes();
        if (minutes >= 0 && minutes <= nbHeures * 60) html += '<div class="rv-maintenant" style="top:' + minutes / 60 * HAUTEUR_HEURE + 'px" aria-hidden="true"></div>';
      }
      duJour.sort(function (a, b) { return R.debut(a) - R.debut(b); }).forEach(function (r) {
        var d = R.debut(r);
        var top = ((d.getHours() - hDebut) * 60 + d.getMinutes()) / 60 * HAUTEUR_HEURE;
        var hauteur = Math.max(r.dureeMinutes / 60 * HAUTEUR_HEURE - 2, 24);
        var p = places[r.id];
        var largeur = 100 / p.nombre;
        html += evenement(r, "top:" + top + "px;height:" + hauteur + "px;left:" + p.couloir * largeur + "%;width:calc(" + largeur + "% - 4px)");
      });
      html += "</div>";
    });
    return html + "</div></div>";
  }

  // ---------- Vue mois ----------
  function mois(liste) {
    var premier = debutMois(etat.date);
    var depart = debutSemaine(premier);
    var maintenant = new Date();
    var html = '<div class="rv-mois"><div class="rv-mois-tete" aria-hidden="true">' +
      ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."].map(function (x) { return "<div>" + x + "</div>"; }).join("") + "</div><div class=\"rv-mois-corps\">";
    for (var i = 0; i < 42; i++) {
      var j = ajouterJours(depart, i);
      var duJour = liste.filter(function (r) { return R.memeJour(r.debut, j); }).sort(function (a, b) { return R.debut(a) - R.debut(b); });
      var autre = j.getMonth() !== premier.getMonth();
      html += '<div class="rv-mois-jour' + (autre ? " is-autre" : "") + (R.memeJour(j, maintenant) ? " is-aujourdhui" : "") + '">' +
        '<button type="button" class="rv-mois-num" data-aller-jour="' + champDate(j) + '" aria-label="' + esc(fmtJourLong.format(j)) + " : " + duJour.length + ' rendez-vous">' + j.getDate() + "</button>" +
        duJour.slice(0, 3).map(function (r) { return evenement(r); }).join("") +
        (duJour.length > 3 ? '<button type="button" class="rv-plus" data-aller-jour="' + champDate(j) + '">+ ' + (duJour.length - 3) + " autre" + (duJour.length > 4 ? "s" : "") + "</button>" : "") +
        "</div>";
    }
    return html + "</div></div>";
  }

  // ---------- Vue liste ----------
  function vueListe(liste, p) {
    var html = "";
    for (var j = p.debut; j < p.fin; j = ajouterJours(j, 1)) {
      var jour = j;
      var duJour = liste.filter(function (r) { return R.memeJour(r.debut, jour); }).sort(function (a, b) { return R.debut(a) - R.debut(b); });
      if (!duJour.length) continue;
      html += '<section class="rv-liste-jour" aria-label="' + esc(majuscule(fmtJourLong.format(jour))) + '"><h3>' + esc(R.jourTexte(jour)) +
        (Math.abs(P.ecartJours(jour)) <= 1 ? ' <span class="pr-sous">' + esc(fmtCourt.format(jour)) + "</span>" : "") + "</h3><ul>" +
        duJour.map(function (r) {
          var v = R.vehicule(r.vehiculeId);
          var cons = P.conseiller(r.conseillerId);
          var a = R.actionsRequises(r);
          return '<li class="rv-ligne' + (R.estActif(r) ? "" : " is-clos") + (r.id === etat.selection ? " is-selection" : "") + '">' +
            '<span class="rv-ligne-heure">' + esc(R.plage(r)) + "</span>" +
            '<div class="rv-ligne-corps"><button type="button" class="rv-ligne-titre" data-rdv="' + esc(r.id) + '" aria-pressed="' + (r.id === etat.selection) + '">' + esc(UI.nomClient(r)) + "</button>" +
            '<div class="rv-ligne-meta">' + UI.pastilleType(r.type) + UI.pastilleStatut(r.statut) + "</div>" +
            '<span class="pr-sous d-block">' + esc([v ? R.nomVehicule(v) : null, R.libelle("modes", r.mode), cons.nom + (cons.moi ? " (moi)" : cons.fictif ? " (fictif)" : "")].filter(Boolean).join(" · ")) + "</span>" +
            UI.alertes(a) + "</div>" +
            '<a class="btn btn-sm btn-outline-primary rv-ligne-ouvrir" href="' + esc(R.urlDetail(r.id)) + '">Ouvrir</a></li>';
        }).join("") + "</ul></section>";
    }
    return html;
  }

  // ---------- Panneau de sélection ----------
  function rendreSelection() {
    var z = document.querySelector('[data-zone="selection"]');
    var r = etat.selection && R.rdv(etat.selection);
    if (!r) {
      z.innerHTML = '<p class="text-muted mb-0">Sélectionnez un rendez-vous dans l\'agenda pour en voir le résumé.</p>';
      return;
    }
    var c = P.contact(r.prospectId), o = P.opportunite(r.opportuniteId), v = R.vehicule(r.vehiculeId);
    var cons = P.conseiller(r.conseillerId);
    var s = r.soumissionId && window.Soumissions ? window.Soumissions.soumission(r.soumissionId) : null;
    var confirmable = (R.transitions(r).filter(function (t) { return t.cle === "Confirme"; })[0] || {});
    z.innerHTML = '<div class="d-flex flex-wrap gap-2 mb-2">' + UI.pastilleStatut(r.statut) + UI.pastilleType(r.type) + "</div>" +
      '<h3 class="h5 mb-1">' + (c ? '<a href="' + esc(P.urlFiche(c.id)) + '">' + esc(c.prenom + " " + c.nom) + "</a>" : esc(UI.nomClient(r))) + "</h3>" +
      '<p class="mb-2">' + esc(R.creneauTexte(r)) + ' <span class="pr-sous">(' + r.dureeMinutes + " min)</span></p>" +
      '<dl class="pr-liste-def pr-liste-def-compacte">' +
      "<div><dt>Opportunité</dt><dd>" + (o ? esc(o.titre) : "—") + "</dd></div>" +
      "<div><dt>Véhicule</dt><dd>" + (v ? esc(R.nomVehicule(v)) + '<span class="pr-sous d-block">N° ' + esc(v.numeroStock) + " · " + esc(window.Soumissions.libelleStatutVehicule(v.statutActuel)) + "</span>" : '<span class="text-muted">Aucun</span>') + "</dd></div>" +
      "<div><dt>Lieu</dt><dd>" + esc(R.libelle("modes", r.mode) + (r.lieu ? " · " + r.lieu : "")) + "</dd></div>" +
      "<div><dt>Conseiller</dt><dd>" + esc(cons.nom + (cons.moi ? " (moi)" : cons.fictif ? " (fictif)" : "")) + "</dd></div>" +
      (s ? "<div><dt>Soumission</dt><dd><a href=\"" + esc(window.Soumissions.urlDetail(s.id)) + '">' + esc(s.reference) + "</a></dd></div>" : "") +
      "</dl>" + UI.alertes(R.actionsRequises(r)) +
      '<div class="d-flex flex-wrap gap-2 mt-3">' +
      '<a class="btn btn-sm btn-primary" href="' + esc(R.urlDetail(r.id)) + '">Ouvrir la fiche</a>' +
      (R.estActif(r) ? '<a class="btn btn-sm btn-outline-primary" href="' + esc(R.urlDetail(r.id) + "#preparation") + '">Préparer</a>' : "") +
      (confirmable.cle && !confirmable.motif ? '<button type="button" class="btn btn-sm btn-outline-primary" data-confirmer="' + esc(r.id) + '"><i class="bi bi-check2 me-1"></i>Marquer comme confirmé</button>' : "") +
      (R.estActif(r) ? '<button type="button" class="btn btn-sm btn-ghost" data-rappel="' + esc(r.id) + '"><i class="bi bi-chat-text me-1"></i>Préparer un rappel</button>' : "") +
      "</div>";
  }

  // ---------- Rendez-vous à confirmer ----------
  function rendreAConfirmer() {
    var l = aConfirmer();
    document.querySelector('[data-zone="nb-aconfirmer"]').textContent = String(l.length);
    document.querySelector('[data-zone="aconfirmer"]').innerHTML = l.length ? l.map(function (r) {
      var c = P.contact(r.prospectId);
      var confirmable = !R.refus(r, "Confirme");
      return '<li><div class="rv-ac-tete"><strong>' + esc(UI.nomClient(r)) + "</strong>" + UI.pastilleStatut(r.statut) + "</div>" +
        '<span class="pr-sous d-block">' + esc(R.creneauTexte(r)) + " · " + esc(R.type(r.type).libelle) + "</span>" +
        '<span class="pr-sous d-block"><i class="bi bi-chat-dots me-1"></i>Préfère : ' + esc(UI.moyenPrefere(c) || "non précisé") + (UI.coordonnee(c) ? " · " + esc(UI.coordonnee(c)) : "") + "</span>" +
        '<div class="d-flex flex-wrap align-items-center gap-2 mt-2">' +
        (confirmable ? '<button type="button" class="btn btn-sm btn-outline-primary py-0" data-confirmer="' + esc(r.id) + '"><i class="bi bi-check2 me-1"></i>Marquer comme confirmé</button>' : '<span class="pr-sous">' + esc(R.refus(r, "Confirme")) + "</span>") +
        '<button type="button" class="btn btn-sm btn-link p-0" data-rappel="' + esc(r.id) + '">Préparer un rappel</button></div></li>';
    }).join("") : '<li class="sv-empty"><i class="bi bi-check2-circle"></i><span>Aucun rendez-vous à confirmer.</span></li>';
  }

  // ---------- Rendu global ----------
  function rendre() {
    var p = periodeCourante();
    remplirVehicules();
    compteurs();
    rendreAConfirmer();
    rendreSelection();
    document.querySelectorAll('input[name="vue"]').forEach(function (x) { x.checked = x.value === etat.vue; });
    f.date.value = champDate(etat.date);
    periode.textContent = libellePeriode(p);
    document.querySelector("[data-effacer-filtres]").hidden = !filtresActifs();

    var filtres = R.liste().filter(correspond);
    var visibles = filtres.filter(function (r) { return dansPeriode(r, p); });
    resultat.textContent = visibles.length + " rendez-vous sur la période" + (filtresActifs() ? " (filtres actifs)" : "");
    if (etat.vue === "jour") calendrier.innerHTML = grille([debutJour(etat.date)], visibles);
    else if (etat.vue === "semaine") calendrier.innerHTML = grille([0, 1, 2, 3, 4, 5, 6].map(function (i) { return ajouterJours(p.debut, i); }), visibles);
    else if (etat.vue === "mois") calendrier.innerHTML = mois(filtres.filter(function (r) { return dansPeriode(r, { debut: debutSemaine(p.debut), fin: ajouterJours(debutSemaine(p.debut), 42) }); }));
    else calendrier.innerHTML = vueListe(visibles, p);
    calendrier.dataset.vue = etat.vue;
    vide.hidden = !(etat.vue === "liste" && !visibles.length);
    history.replaceState(null, "", window.location.pathname + "?date=" + champDate(etat.date) + "#" + etat.vue);
  }

  // ---------- Événements ----------
  function confirmer(id) {
    var annuler = R.changerStatut(id, "Confirme");
    if (!annuler) return P.notifier("Impossible de confirmer ce rendez-vous.");
    P.notifier("Rendez-vous marqué comme confirmé (déclaration locale, aucun message envoyé).", annuler);
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-rdv], [data-aller-jour], [data-naviguer], [data-aujourdhui], [data-confirmer], [data-rappel], [data-effacer-filtres]");
    if (!b) return;
    if (b.dataset.rdv) {
      etat.selection = b.dataset.rdv;
      rendre();
      panneau.show();
    } else if (b.dataset.allerJour) {
      etat.date = depuisChamp(b.dataset.allerJour);
      etat.vue = "jour";
      rendre();
    } else if (b.dataset.naviguer) naviguer(Number(b.dataset.naviguer));
    else if (b.hasAttribute("data-aujourdhui")) { etat.date = debutJour(new Date()); rendre(); }
    else if (b.dataset.confirmer) confirmer(b.dataset.confirmer);
    else if (b.dataset.rappel && window.RappelRendezVous) window.RappelRendezVous.ouvrir(b.dataset.rappel);
    else if (b.hasAttribute("data-effacer-filtres")) {
      f.type.value = f.statut.value = f.vehicule.value = "";
      f.conseiller.value = P.moiId;
      f.action.checked = false;
      rendre();
    }
  });
  document.querySelectorAll('input[name="vue"]').forEach(function (x) {
    x.addEventListener("change", function () { etat.vue = x.value; rendre(); });
  });
  f.date.addEventListener("change", function () {
    var d = depuisChamp(f.date.value);
    if (d) { etat.date = d; rendre(); }
  });
  [f.type, f.statut, f.conseiller, f.vehicule, f.action].forEach(function (x) { x.addEventListener("change", rendre); });

  f.conseiller.value = P.moiId;
  R.abonner(rendre);
  rendre();
})();
