// Fiche prospect : en-tête, vue d'ensemble, qualification par opportunité, historique et opportunités.
(function () {
  "use strict";

  var P = window.Prospects;
  var racine = document.getElementById("fiche");
  if (!P || !racine) return;
  var esc = P.esc;
  var contactId = racine.dataset.prospectId;

  var oppQualif = null; // opportunité affichée dans l'onglet Qualification
  var qualifModifiee = false;
  var filtreHistorique = "";

  var TYPES = {
    creation: { libelle: "Création", icone: "bi-person-plus" },
    note: { libelle: "Note", icone: "bi-journal-text" },
    appel: { libelle: "Appel", icone: "bi-telephone" },
    courriel: { libelle: "Courriel", icone: "bi-envelope" },
    visite: { libelle: "Visite", icone: "bi-shop" },
    etape: { libelle: "Changement d'étape", icone: "bi-signpost-split" },
    suivi: { libelle: "Suivi planifié", icone: "bi-alarm" },
    qualification: { libelle: "Qualification", icone: "bi-clipboard-check" },
    opportunite: { libelle: "Nouvelle opportunité", icone: "bi-briefcase" },
    soumission: { libelle: "Soumission", icone: "bi-file-earmark-text" },
    rendezvous: { libelle: "Rendez-vous", icone: "bi-calendar-event" },
    transaction: { libelle: "Transaction", icone: "bi-cash-coin" },
    action: { libelle: "Action réalisée", icone: "bi-check2-square" },
    brouillon: { libelle: "Brouillon (non envoyé)", icone: "bi-pencil-square" },
    texto: { libelle: "Texto", icone: "bi-chat-dots" },
  };

  function zone(nom) {
    return racine.querySelector('[data-zone="' + nom + '"]');
  }
  function remplir(nom, html) {
    racine.querySelectorAll('[data-champ="' + nom + '"]').forEach(function (x) { x.innerHTML = html; });
  }
  function onglet(nom) {
    bootstrap.Tab.getOrCreateInstance(document.getElementById("onglet-" + nom)).show();
  }
  function pastilleEtape(etape) {
    return '<span class="status-pill sv-et-' + esc(etape) + '">' + esc(P.libelleEtape(etape)) + "</span>";
  }
  function badgeSuivi(o) {
    var s = P.suivi(o);
    if (!s || !s.requis) return "";
    return '<span class="pr-suivi"><i class="bi bi-alarm"></i>' + esc(s.motif) + "</span>";
  }
  function aPreciser() {
    return '<span class="text-muted">À préciser</span>';
  }
  function libelles(liste, cles) {
    return (cles || []).map(function (k) { return P.libelle(liste, k) || k; });
  }
  function prochaineHtml(o) {
    if (!o || !o.prochaineAction) return '<span class="text-muted">Aucune action planifiée</span>';
    var retard = o.dateProchaineAction && P.ecartJours(o.dateProchaineAction) < 0;
    return esc(o.prochaineAction) +
      (o.dateProchaineAction ? '<span class="pr-echeance' + (retard ? " is-retard" : "") + '">' + esc(P.echeance(o.dateProchaineAction)) + "</span>" : "");
  }

  // ---------- Résumé de qualification (composant réutilisé) ----------
  function resumeQualification(o, q) {
    q = q || o.qualification || {};
    var comp = P.completude(q);
    var pct = Math.round((comp.remplis / comp.total) * 100);

    var vehicule = [P.libelle("categories", q.categorie), P.libelle("etats", q.etat)]
      .concat((q.marques || []).length || (q.modeles || []).length ? [(q.marques || []).concat(q.modeles || []).join(", ")] : [])
      .concat(q.places ? [q.places + (q.places >= 8 ? "+ places" : " places")] : [])
      .filter(Boolean);
    var budget = P.resumeBudget(q);
    var mode = [P.libelle("modesAchat", q.modeAchat)];
    if (q.miseDeFonds != null) mode.push("mise de fonds " + P.argent(q.miseDeFonds));
    if (q.reprise) mode.push("reprise : " + P.libelle("reprises", q.reprise).toLowerCase() + (q.repriseDetail ? " (" + q.repriseDetail + ")" : ""));
    mode = mode.filter(Boolean);
    var horizon = [P.libelle("horizons", q.horizon), q.dateCible ? "vers le " + P.dateCourte(q.dateCible) : null].filter(Boolean);
    var criteres = libelles("elementsDecision", q.elementsDecision).concat(libelles("caracteristiques", q.caracteristiques));

    function ligne(titre, valeurs) {
      return "<div><dt>" + esc(titre) + "</dt><dd>" + (valeurs.length ? esc(valeurs.join(" · ")) : aPreciser()) + "</dd></div>";
    }

    return (
      '<div class="card-header sv-card-header"><span><i class="bi bi-clipboard-data me-2"></i>Résumé de qualification</span></div>' +
      '<div class="card-body">' +
      '<div class="pr-resume-opp"><strong>' + esc(o.titre) + "</strong>" + pastilleEtape(o.etape) + "</div>" +
      '<dl class="pr-liste-def pr-liste-def-compacte">' +
      ligne("Véhicule recherché", vehicule) +
      ligne("Budget indicatif", budget ? [budget] : []) +
      ligne("Mode d'achat envisagé", mode) +
      ligne("Horizon d'achat", horizon) +
      ligne("Critères prioritaires", criteres) +
      "</dl>" +
      '<div class="pr-completude">' +
      '<div class="pr-completude-tete"><span>Complétude des informations</span><strong>' + comp.remplis + " / " + comp.total + "</strong></div>" +
      '<div class="progress" role="progressbar" aria-label="Complétude des informations" aria-valuenow="' + comp.remplis + '" aria-valuemin="0" aria-valuemax="' + comp.total + '"><div class="progress-bar" style="width:' + pct + '%"></div></div>' +
      '<p class="pr-note">Indique seulement les informations recueillies, pas l\'intérêt ni la qualité du prospect.</p>' +
      "</div>" +
      (comp.manquants.length
        ? '<div class="pr-manquants"><span>Informations manquantes</span><ul>' + comp.manquants.map(function (m) { return "<li>" + esc(m) + "</li>"; }).join("") + "</ul></div>"
        : '<div class="pr-complet"><i class="bi bi-check2-circle"></i>Toutes les informations de base sont recueillies.</div>') +
      "</div>"
    );
  }

  // ---------- En-tête ----------
  function rendreTete(c, opps) {
    var principale = P.principale(c.id);
    var cons = P.conseiller(c.conseillerId);
    var derniere = P.derniereInteraction(c.id);
    var prochaine = P.prochaineAction(c.id);
    var client = opps.some(function (o) { return o.etape === "Gagne"; });

    document.title = c.prenom + " " + c.nom + " · Phineas";
    remplir("initiales", esc(P.initiales(c)));
    remplir("nom", esc(c.prenom + " " + c.nom));
    remplir("badges",
      (principale ? pastilleEtape(principale.etape) : "") +
      (client ? '<span class="badge-soft"><i class="bi bi-patch-check"></i>Client</span>' : "") +
      (P.suiviRequisContact(c.id) ? '<span class="pr-suivi"><i class="bi bi-alarm"></i>Suivi requis</span>' : ""));
    remplir("conseiller", esc(cons.moi ? cons.nom + " (moi)" : cons.nom + (cons.fictif ? " (fictif)" : "")));
    remplir("source", esc(P.libelle("sources", c.source) || c.source) + (c.sourceDetail ? '<span class="pr-sous d-block">' + esc(c.sourceDetail) + "</span>" : ""));

    var pref = c.contactPrefere;
    var coord = [];
    if (c.telephone) coord.push('<span class="pr-coord-ligne"><a href="tel:' + esc(c.telephone.replace(/[^\d+]/g, "")) + '">' + esc(c.telephone) + "</a></span>" + (pref !== "courriel" ? '<span class="pr-prefere">' + esc(P.libelle("moyensContact", pref)) + " préféré</span>" : ""));
    if (c.courriel) coord.push('<span class="pr-coord-ligne" title="' + esc(c.courriel) + '"><a href="mailto:' + esc(c.courriel) + '">' + esc(c.courriel) + "</a></span>" + (pref === "courriel" ? '<span class="pr-prefere">Courriel préféré</span>' : ""));
    remplir("coordonnees", coord.join("") || '<span class="text-muted">Aucune</span>');
    remplir("derniere", derniere ? esc(P.relatif(derniere.date)) + '<span class="pr-sous d-block pr-tronque">' + esc(derniere.resume) + "</span>" : "—");
    remplir("prochaine", prochaine ? prochaineHtml(prochaine) + '<span class="pr-sous d-block">' + esc(prochaine.titre) + "</span>" : '<span class="text-muted">Aucune action planifiée</span>');

    remplir("nb-interactions", String(P.interactionsDe(c.id).length));
    remplir("nb-opportunites", String(opps.length));
  }

  // ---------- Vue d'ensemble ----------
  function rendreApercu(c, opps) {
    zone("apercu-opportunites").innerHTML = opps.length
      ? '<ul class="pr-opps-compact">' + opps.map(function (o) {
          var vehicule = P.resumeVehicule(o);
          var budget = P.resumeBudget(o.qualification);
          return (
            '<li class="' + (P.estActive(o) ? "" : "is-close") + '">' +
            '<div class="pr-opps-compact-tete"><strong>' + esc(o.titre) + "</strong>" + pastilleEtape(o.etape) + "</div>" +
            '<div class="pr-sous">' + esc([vehicule || "Véhicule à préciser", budget || "budget inconnu"].join(" · ")) + "</div>" +
            (P.estActive(o) ? '<div class="pr-opps-compact-action"><i class="bi bi-arrow-return-right"></i>' + prochaineHtml(o) + "</div>" + badgeSuivi(o) : "") +
            '<button type="button" class="btn btn-sm btn-link p-0" data-qualifier="' + esc(o.id) + '">Voir la qualification</button>' +
            "</li>"
          );
        }).join("") + "</ul>"
      : '<div class="sv-empty"><i class="bi bi-briefcase"></i><span>Aucune opportunité.</span></div>';

    var inter = P.interactionsDe(c.id).slice(0, 4);
    zone("apercu-interactions").innerHTML = inter.length
      ? '<ol class="pr-timeline pr-timeline-compacte">' + inter.map(elementTimeline).join("") + "</ol>"
      : '<div class="sv-empty"><span>Aucune interaction.</span></div>';

    var ref = P.principale(c.id);
    zone("apercu-resume").innerHTML = ref ? resumeQualification(ref) : "";
    zone("apercu-resume").hidden = !ref;

    zone("apercu-contact").innerHTML =
      "<div><dt>Moyen préféré</dt><dd>" + esc(P.libelle("moyensContact", c.contactPrefere) || "—") + "</dd></div>" +
      "<div><dt>Moment de contact</dt><dd>" + (P.libelle("momentsContact", c.momentContact) ? esc(P.libelle("momentsContact", c.momentContact)) : aPreciser()) + "</dd></div>" +
      "<div><dt>Prospect depuis</dt><dd>" + esc(P.dateCourte(c.dateCreation)) + "</dd></div>";
  }

  // ---------- Qualification ----------
  var formQ = document.getElementById("form-qualification");
  var indicateur = formQ.querySelector("[data-indicateur-modifie]");

  function choisirOppQualif(opps) {
    if (oppQualif && opps.some(function (o) { return o.id === oppQualif; })) return;
    var p = P.principale(contactId);
    oppQualif = p ? p.id : null;
  }

  function rendreChoixOpp(opps) {
    var z = zone("choix-opportunite");
    z.hidden = opps.length < 2;
    z.innerHTML = '<span class="pr-choix-titre">Opportunité :</span>' + opps.map(function (o) {
      return '<button type="button" class="sv-chip' + (o.id === oppQualif ? " is-active" : "") + '" aria-pressed="' + (o.id === oppQualif) + '" data-choix-opp="' + esc(o.id) + '">' +
        esc(o.titre) + ' <span>' + esc(P.libelleEtape(o.etape)) + "</span></button>";
    }).join("");
  }

  function remplirQualification(o, c) {
    var q = o.qualification || {};
    formQ.reset();
    formQ.querySelectorAll(".is-invalid").forEach(function (x) { x.classList.remove("is-invalid"); });
    function val(nom, v) { formQ.elements[nom].value = v == null ? "" : v; }
    function radio(nom, v) {
      var r = formQ.querySelector('input[name="' + nom + '"][value="' + v + '"]');
      if (r) r.checked = true;
    }
    function cases(nom, liste) {
      formQ.querySelectorAll('input[name="' + nom + '"]').forEach(function (x) { x.checked = (liste || []).indexOf(x.value) >= 0; });
    }
    val("categorie", q.categorie);
    radio("etat", q.etat);
    val("marques", (q.marques || []).join(", "));
    val("modeles", (q.modeles || []).join(", "));
    val("places", q.places);
    val("utilisation", q.utilisation);
    cases("caracteristiques", q.caracteristiques);
    val("budgetTotal", q.budgetTotal);
    val("budgetMensuel", q.budgetMensuel);
    radio("modeAchat", q.modeAchat);
    val("miseDeFonds", q.miseDeFonds);
    radio("reprise", q.reprise);
    val("repriseDetail", q.repriseDetail);
    radio("horizon", q.horizon);
    val("dateCible", P.versChampDate(q.dateCible));
    val("contactPrefere", c.contactPrefere);
    val("momentContact", c.momentContact);
    cases("elementsDecision", q.elementsDecision);
    val("objections", q.objections);
    formQ.elements.dateCible.min = P.aujourdhuiChamp();
    remplir("titre-opp-qualif", esc(o.titre));
    definirModifiee(false);
    majReprise();
  }

  function lireQualification() {
    var fd = new FormData(formQ);
    function txt(nom) { return String(fd.get(nom) || "").trim(); }
    function nombre(nom) { var v = txt(nom); return v === "" ? null : +v; }
    return {
      categorie: txt("categorie") || null,
      etat: txt("etat") || null,
      marques: P.listeTexte(txt("marques")),
      modeles: P.listeTexte(txt("modeles")),
      places: nombre("places"),
      caracteristiques: fd.getAll("caracteristiques"),
      utilisation: txt("utilisation") || null,
      budgetTotal: nombre("budgetTotal"),
      budgetMensuel: nombre("budgetMensuel"),
      modeAchat: txt("modeAchat") || null,
      miseDeFonds: nombre("miseDeFonds"),
      reprise: txt("reprise") || null,
      repriseDetail: txt("reprise") && txt("reprise") !== "non" ? txt("repriseDetail") || null : null,
      horizon: txt("horizon") || null,
      dateCible: txt("dateCible") ? P.depuisChampDate(txt("dateCible")).toISOString() : null,
      elementsDecision: fd.getAll("elementsDecision"),
      objections: txt("objections") || null,
    };
  }

  function definirModifiee(v) {
    qualifModifiee = v;
    indicateur.hidden = !v;
  }
  function majReprise() {
    var r = (formQ.querySelector('input[name="reprise"]:checked') || {}).value;
    formQ.querySelector("[data-si-reprise]").hidden = !(r === "oui" || r === "a-determiner");
  }
  function majResumeQualif() {
    var o = P.opportunite(oppQualif);
    zone("qualif-resume").innerHTML = o ? resumeQualification(o, qualifModifiee ? lireQualification() : null) : "";
  }

  function validerQualification() {
    var erreurs = [];
    formQ.querySelectorAll(".is-invalid").forEach(function (x) { x.classList.remove("is-invalid"); });
    [["budgetTotal", 500000], ["budgetMensuel", 10000], ["miseDeFonds", 500000]].forEach(function (x) {
      var c = formQ.elements[x[0]];
      if (c.value !== "" && (isNaN(+c.value) || +c.value < 0 || +c.value > x[1])) {
        c.classList.add("is-invalid");
        erreurs.push(c);
      }
    });
    if (erreurs.length) erreurs[0].focus();
    return erreurs.length === 0;
  }

  formQ.addEventListener("input", function () { definirModifiee(true); majReprise(); majResumeQualif(); });
  formQ.addEventListener("change", function () { definirModifiee(true); majReprise(); majResumeQualif(); });
  formQ.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!oppQualif || !validerQualification()) return;
    var fd = new FormData(formQ);
    P.enregistrerQualification(oppQualif, lireQualification(), {
      contactPrefere: fd.get("contactPrefere"),
      momentContact: fd.get("momentContact") || null,
    });
    definirModifiee(false);
    P.notifier("Qualification enregistrée localement (non enregistrée en base).");
  });
  formQ.querySelector("[data-annuler-qualification]").addEventListener("click", function () {
    var o = P.opportunite(oppQualif);
    if (o) remplirQualification(o, P.contact(contactId));
    majResumeQualif();
  });

  function selectionnerOppQualif(id) {
    if (id === oppQualif) return true;
    if (qualifModifiee && !window.confirm("Abandonner les modifications de qualification non enregistrées ?")) return false;
    oppQualif = id;
    definirModifiee(false);
    rendre();
    return true;
  }

  // ---------- Historique ----------
  function elementTimeline(i) {
    var t = TYPES[i.type] || TYPES.note;
    var o = i.opportuniteId ? P.opportunite(i.opportuniteId) : null;
    return (
      '<li class="pr-tl pr-tl-' + esc(i.type) + '">' +
      '<span class="pr-tl-icone"><i class="bi ' + t.icone + '"></i></span>' +
      '<div class="pr-tl-corps">' +
      '<div class="pr-tl-tete"><strong>' + esc(t.libelle) + '</strong><span class="text-muted">' + esc(i.auteur) + "</span>" +
      '<time datetime="' + esc(i.date) + '" title="' + esc(P.dateComplete(i.date)) + '">' + esc(P.relatif(i.date)) + "</time></div>" +
      "<p>" + esc(i.resume) + "</p>" +
      (i.prochaineAction ? '<div class="pr-tl-action"><i class="bi bi-arrow-return-right"></i>Prochaine action : ' + esc(i.prochaineAction) + "</div>" : "") +
      (o ? '<span class="pr-tl-opp"><i class="bi bi-briefcase"></i>' + esc(o.titre) + "</span>" : "") +
      "</div></li>"
    );
  }

  var selFiltreH = document.getElementById("h-filtre");
  function rendreHistorique(c, opps) {
    selFiltreH.innerHTML = '<option value="">Toutes les interactions</option><option value="__contact">Contact (général)</option>' +
      opps.map(function (o) { return '<option value="' + esc(o.id) + '">' + esc(o.titre) + "</option>"; }).join("");
    selFiltreH.value = filtreHistorique;
    if (selFiltreH.value !== filtreHistorique) filtreHistorique = selFiltreH.value = "";

    var liste = P.interactionsDe(c.id).filter(function (i) {
      if (!filtreHistorique) return true;
      if (filtreHistorique === "__contact") return !i.opportuniteId;
      return i.opportuniteId === filtreHistorique;
    });
    zone("timeline").innerHTML = liste.length
      ? liste.map(elementTimeline).join("")
      : '<li class="sv-empty"><span>Aucune interaction pour ce filtre.</span></li>';
  }
  selFiltreH.addEventListener("change", function () {
    filtreHistorique = selFiltreH.value;
    rendre();
  });

  var formNote = document.getElementById("form-note");
  function rendreFormNote(opps) {
    var sel = formNote.elements.opportuniteId;
    var actuel = sel.value;
    sel.innerHTML = '<option value="">Le contact (général)</option>' +
      opps.map(function (o) { return '<option value="' + esc(o.id) + '">' + esc(o.titre) + "</option>"; }).join("");
    var p = P.principale(contactId);
    sel.value = actuel && opps.some(function (o) { return o.id === actuel; }) ? actuel : p ? p.id : "";
    formNote.elements.date.min = P.aujourdhuiChamp();
  }
  formNote.addEventListener("submit", function (e) {
    e.preventDefault();
    var resume = formNote.elements.resume;
    var date = formNote.elements.date;
    var action = formNote.elements.prochaineAction;
    var ok = true;
    [resume, date, action].forEach(function (x) { x.classList.remove("is-invalid"); });
    if (!resume.value.trim()) { resume.classList.add("is-invalid"); ok = false; }
    if (date.value && date.value < P.aujourdhuiChamp()) {
      date.classList.add("is-invalid");
      formNote.querySelector("[data-message-date]").textContent = "Indiquez aujourd'hui ou une date à venir.";
      ok = false;
    } else if (date.value && !action.value.trim()) {
      date.classList.add("is-invalid");
      formNote.querySelector("[data-message-date]").textContent = "Précisez la prochaine action liée à cette date.";
      ok = false;
    }
    if (!ok) { formNote.querySelector(".is-invalid").focus(); return; }

    P.ajouterNote(contactId, {
      type: formNote.elements.type.value,
      opportuniteId: formNote.elements.opportuniteId.value || null,
      resume: resume.value.trim(),
      prochaineAction: action.value.trim() || null,
      date: P.depuisChampDate(date.value),
    });
    formNote.reset();
    rendre();
    P.notifier("Note ajoutée à l'historique (locale, non enregistrée).");
  });
  formNote.addEventListener("input", function (e) { e.target.classList.remove("is-invalid"); });

  // ---------- Opportunités ----------
  function rendreOpportunites(opps) {
    zone("opportunites").innerHTML = opps.length ? opps.map(function (o) {
      var q = o.qualification || {};
      var comp = P.completude(q);
      var options = P.etapes.map(function (e) {
        return '<option value="' + esc(e.cle) + '"' + (e.cle === o.etape ? " selected" : "") + ">" + esc(e.libelle) + "</option>";
      }).join("");
      var criteres = [
        P.libelle("categories", q.categorie),
        P.resumeBudget(q),
        P.libelle("modesAchat", q.modeAchat),
        P.libelle("horizons", q.horizon),
      ].filter(Boolean);
      return (
        '<article class="card pr-opp' + (P.estActive(o) ? "" : " is-close") + '">' +
        '<div class="card-header sv-card-header"><span class="pr-opp-titre">' + esc(o.titre) + "</span>" + pastilleEtape(o.etape) + "</div>" +
        '<div class="card-body">' +
        '<dl class="pr-liste-def pr-opp-grille">' +
        "<div><dt>Véhicules envisagés</dt><dd>" + (o.vehiculesEnvisages && o.vehiculesEnvisages.length
          ? '<ul class="pr-vehicules">' + o.vehiculesEnvisages.map(function (v) { return "<li>" + esc(v) + "</li>"; }).join("") + "</ul>"
          : aPreciser()) + "</dd></div>" +
        "<div><dt>Critères</dt><dd>" + (criteres.length ? esc(criteres.join(" · ")) : aPreciser()) +
        '<span class="pr-sous d-block">Complétude : ' + comp.remplis + " / " + comp.total + "</span></dd></div>" +
        "<div><dt>Prochaine action</dt><dd>" + (P.estActive(o) ? prochaineHtml(o) + badgeSuivi(o) : '<span class="text-muted">Opportunité clôturée</span>') + "</dd></div>" +
        "</dl>" + soumissionsHtml(o) + rendezVousHtml(o) + transactionsHtml(o) + "</div>" +
        '<div class="pr-opp-pied">' +
        '<span class="pr-sous">Ouverte le ' + esc(P.dateCourte(o.dateCreation)) + " · activité " + esc(P.relatif(o.derniereActivite)) + "</span>" +
        '<label class="visually-hidden" for="opp-etape-' + esc(o.id) + '">Étape de « ' + esc(o.titre) + " »</label>" +
        '<select class="form-select form-select-sm pr-select-compact" id="opp-etape-' + esc(o.id) + '" data-etape-opp="' + esc(o.id) + '">' + options + "</select>" +
        '<button type="button" class="btn btn-sm btn-outline-primary" data-qualifier="' + esc(o.id) + '"><i class="bi bi-clipboard-check me-1"></i>Qualifier</button>' +
        "</div></article>"
      );
    }).join("") : '<div class="pr-etat-vide card"><i class="bi bi-briefcase"></i><strong>Aucune opportunité</strong><span>Créez une opportunité pour suivre un projet d\'achat.</span></div>';
  }

  // Soumissions de l'opportunité (module Soumissions chargé sur la fiche).
  function soumissionsHtml(o) {
    var S = window.Soumissions;
    if (!S) return "";
    var liste = S.parOpportunite(o.id);
    return '<div class="pr-soumissions"><div class="pr-soumissions-tete"><span>Soumissions</span>' +
      (P.estActive(o) ? '<a class="btn btn-sm btn-link p-0" href="' + esc(S.urlNouvelle(o.id)) + '"><i class="bi bi-plus-lg me-1"></i>Créer une soumission</a>' : "") + "</div>" +
      (liste.length
        ? "<ul>" + liste.map(function (s) {
            var v = S.versionCourante(s);
            return '<li><a href="' + esc(S.urlDetail(s.id)) + '">' + esc(s.reference) + "</a>" +
              '<span class="so-statut so-st-' + esc(v.statut) + '">' + esc(S.libelleStatut(v.statut)) + "</span>" +
              '<span class="pr-sous">' + esc(S.nomVehicule(v.vehicule)) + " · v" + v.numero + "</span></li>";
          }).join("") + "</ul>"
        : '<p class="pr-sous mb-0">Aucune soumission pour cette opportunité.</p>') + "</div>";
  }

  // Rendez-vous de l'opportunité (module Rendez-vous chargé sur la fiche) : à venir, passés, essais et résultats.
  function rendezVousHtml(o) {
    var R = window.RendezVous;
    if (!R) return "";
    var maintenant = new Date();
    var liste = R.parOpportunite(o.id);
    var aVenir = liste.filter(function (r) { return R.estActif(r) && R.fin(r) >= maintenant; });
    var passes = liste.filter(function (r) { return aVenir.indexOf(r) < 0; }).reverse();
    var essais = liste.filter(function (r) { return R.estEssai(r) && r.statut === "Termine"; }).length;
    function ligne(r) {
      var res = r.resultat;
      var action = res && res.prochaineAction && res.prochaineAction !== "aucune" ? R.libelle("prochainesActions", res.prochaineAction) : null;
      return '<li><a href="' + esc(R.urlDetail(r.id)) + '">' + esc(R.type(r.type).libelle) + "</a>" +
        '<span class="rv-statut rv-st-' + esc(r.statut) + '"><i class="bi ' + esc(R.statut(r.statut).icone) + '" aria-hidden="true"></i>' + esc(R.statut(r.statut).libelle) + "</span>" +
        '<span class="pr-sous">' + esc(R.jourCourt(r.debut) + ", " + R.plage(r)) + "</span>" +
        (res ? '<span class="pr-sous d-block w-100">Résultat : ' + esc(R.libelle("resultats", res.resultat)) + (action ? " · prochaine action : " + esc(action.toLowerCase()) : "") + "</span>" : "") +
        "</li>";
    }
    return '<div class="pr-soumissions"><div class="pr-soumissions-tete"><span>Rendez-vous' + (essais ? " · " + essais + " essai" + (essais > 1 ? "s" : "") + " réalisé" + (essais > 1 ? "s" : "") : "") + "</span>" +
      (P.estActive(o) ? '<a class="btn btn-sm btn-link p-0" href="' + esc(R.urlNouveau({ opportunite: o.id })) + '"><i class="bi bi-calendar-plus me-1"></i>Planifier un rendez-vous</a>' : "") + "</div>" +
      (aVenir.length ? '<p class="pr-sous mb-1">À venir</p><ul>' + aVenir.map(ligne).join("") + "</ul>" : "") +
      (passes.length ? '<p class="pr-sous mb-1 mt-2">Passés</p><ul>' + passes.map(ligne).join("") + "</ul>" : "") +
      (!liste.length ? '<p class="pr-sous mb-0">Aucun rendez-vous pour cette opportunité.</p>' : "") + "</div>";
  }

  // Transactions de l'opportunité (module Transactions chargé sur la fiche) : progression, blocages, prochaine action.
  function transactionsHtml(o) {
    var T = window.Transactions, UI = window.TransactionsUI;
    if (!T || !UI) return "";
    var liste = T.parOpportunite(o.id);
    var enCours = T.enCoursPourOpportunite(o.id);
    return '<div class="pr-soumissions"><div class="pr-soumissions-tete"><span>Transactions</span>' +
      (P.estActive(o) && !enCours ? '<a class="btn btn-sm btn-link p-0" href="' + esc(T.urlNouvelle({ opportunite: o.id })) + '"><i class="bi bi-cash-coin me-1"></i>Créer une transaction</a>' : "") + "</div>" +
      (liste.length
        ? "<ul>" + liste.map(function (t) {
            var a = T.analyse(t);
            return '<li><a href="' + esc(T.urlDetail(t.id)) + '">' + esc(t.reference) + "</a>" + UI.pastilleStatut(a.statut) + UI.miniAxes(a) +
              '<span class="pr-sous d-block w-100">' + esc(T.nomVehicule(t)) + (a.blocages.length ? " · " + a.blocages.length + " blocage" + (a.blocages.length > 1 ? "s" : "") : "") + "</span>" +
              (T.estActive(t) ? '<span class="pr-sous d-block w-100">Prochaine action : ' + esc(a.prochaineAction.texte) + "</span>" : "") + "</li>";
          }).join("") + "</ul>"
        : '<p class="pr-sous mb-0">Aucune transaction pour cette opportunité.</p>') + "</div>";
  }

  // ---------- Rendu global ----------
  function rendre() {
    var c = P.contact(contactId);
    document.getElementById("fiche-introuvable").hidden = !!c;
    racine.hidden = !c;
    if (!c) return;

    var opps = P.opportunitesDe(c.id);
    var avant = oppQualif;
    choisirOppQualif(opps);

    rendreTete(c, opps);
    rendreApercu(c, opps);
    rendreChoixOpp(opps);
    // On ne remplace pas une saisie de qualification en cours.
    var o = P.opportunite(oppQualif);
    formQ.hidden = !o;
    if (o && (avant !== oppQualif || !qualifModifiee || !formQ.dataset.rempli)) {
      remplirQualification(o, c);
      formQ.dataset.rempli = "1";
    }
    majResumeQualif();
    rendreHistorique(c, opps);
    rendreFormNote(opps);
    rendreOpportunites(opps);
  }

  // ---------- Actions ----------
  var modalSuivi = bootstrap.Modal.getOrCreateInstance(document.getElementById("modal-suivi"));
  var formSuivi = document.getElementById("form-suivi");
  var modalOpp = bootstrap.Modal.getOrCreateInstance(document.getElementById("modal-opportunite"));
  var formOpp = document.getElementById("form-opportunite");

  function ouvrirSuivi(oppId) {
    formSuivi.reset();
    formSuivi.querySelectorAll(".is-invalid").forEach(function (x) { x.classList.remove("is-invalid"); });
    var actives = P.opportunitesDe(contactId).filter(P.estActive);
    var sel = formSuivi.elements.opportuniteId;
    sel.innerHTML = actives.map(function (o) { return '<option value="' + esc(o.id) + '">' + esc(o.titre) + "</option>"; }).join("");
    var p = P.principale(contactId);
    sel.value = oppId || (p && P.estActive(p) ? p.id : actives[0] ? actives[0].id : "");
    formSuivi.elements.date.min = P.aujourdhuiChamp();
    formSuivi.elements.date.value = P.aujourdhuiChamp();
    modalSuivi.show();
  }
  formSuivi.addEventListener("submit", function (e) {
    e.preventDefault();
    var ok = true;
    var el = formSuivi.elements;
    [el.opportuniteId, el.action, el.date].forEach(function (x) { x.classList.remove("is-invalid"); });
    if (!el.opportuniteId.value) { el.opportuniteId.classList.add("is-invalid"); ok = false; }
    if (!el.action.value.trim()) { el.action.classList.add("is-invalid"); ok = false; }
    if (!el.date.value || el.date.value < P.aujourdhuiChamp()) { el.date.classList.add("is-invalid"); ok = false; }
    if (!ok) { formSuivi.querySelector(".is-invalid").focus(); return; }
    P.planifierSuivi(el.opportuniteId.value, el.action.value.trim(), P.depuisChampDate(el.date.value));
    modalSuivi.hide();
    P.notifier("Suivi planifié (local, aucun rappel automatique).");
  });

  formOpp.addEventListener("submit", function (e) {
    e.preventDefault();
    var el = formOpp.elements;
    el.titre.classList.remove("is-invalid");
    if (!el.titre.value.trim()) { el.titre.classList.add("is-invalid"); el.titre.focus(); return; }
    if (qualifModifiee && !window.confirm("Abandonner les modifications de qualification non enregistrées ?")) return;
    var o = P.ajouterOpportunite(contactId, {
      titre: el.titre.value.trim(),
      categorie: el.categorie.value || null,
      etape: el.etape.value,
      vehicules: P.listeTexte(el.vehicules.value),
    });
    modalOpp.hide();
    oppQualif = o.id;
    definirModifiee(false);
    formQ.dataset.rempli = "";
    rendre();
    onglet("qualification");
    P.notifier("Opportunité créée (locale). Complétez sa qualification.");
  });

  racine.addEventListener("click", function (e) {
    var b = e.target.closest("[data-action], [data-qualifier], [data-choix-opp], [data-aller-onglet]");
    if (!b) return;
    if (b.dataset.qualifier || b.dataset.choixOpp) {
      if (selectionnerOppQualif(b.dataset.qualifier || b.dataset.choixOpp)) onglet("qualification");
      return;
    }
    if (b.dataset.allerOnglet) return onglet(b.dataset.allerOnglet);
    switch (b.dataset.action) {
      case "modifier":
        window.ProspectsTiroir.ouvrirModification(contactId);
        break;
      case "note":
        var bouton = document.getElementById("onglet-historique");
        if (bouton.classList.contains("active")) {
          formNote.elements.resume.focus();
        } else {
          bouton.addEventListener("shown.bs.tab", function () { formNote.elements.resume.focus(); }, { once: true });
          onglet("historique");
        }
        break;
      case "opportunite":
        formOpp.reset();
        formOpp.elements.titre.classList.remove("is-invalid");
        modalOpp.show();
        break;
      case "suivi":
        ouvrirSuivi();
        break;
    }
  });

  racine.addEventListener("change", function (e) {
    var sel = e.target.closest("[data-etape-opp]");
    if (!sel) return;
    // Phase 07 : une opportunité perdue passe par le parcours de clôture (motif et origine du motif).
    if (sel.value === "Perdu" && window.RelationsUI) {
      sel.value = P.opportunite(sel.dataset.etapeOpp).etape;
      window.RelationsUI.ouvrirCloture(sel.dataset.etapeOpp);
      return;
    }
    var annuler = P.changerEtape(sel.dataset.etapeOpp, sel.value);
    if (annuler) P.notifier("Étape changée : « " + P.libelleEtape(sel.value) + " » (modification locale).", annuler);
    var focus = document.getElementById("opp-etape-" + sel.dataset.etapeOpp);
    if (focus) focus.focus();
  });

  document.getElementById("modal-opportunite").addEventListener("shown.bs.modal", function () { formOpp.elements.titre.focus(); });
  document.getElementById("modal-suivi").addEventListener("shown.bs.modal", function () { formSuivi.elements.action.focus(); });

  // L'onglet ouvert est reflété dans l'adresse (#qualification, #historique…).
  racine.querySelectorAll('[data-bs-toggle="tab"]').forEach(function (t) {
    t.addEventListener("shown.bs.tab", function () {
      history.replaceState(null, "", "#" + t.id.replace("onglet-", ""));
    });
  });
  window.addEventListener("beforeunload", function (e) {
    if (qualifModifiee) { e.preventDefault(); e.returnValue = ""; }
  });

  P.abonner(rendre);
  if (window.Soumissions) window.Soumissions.abonner(rendre);
  if (window.RendezVous) window.RendezVous.abonner(rendre);
  if (window.Transactions) window.Transactions.abonner(rendre);
  rendre();
  var hash = window.location.hash.replace("#", "");
  if (["qualification", "historique", "opportunites"].indexOf(hash) >= 0 && !racine.hidden) onglet(hash);
})();
