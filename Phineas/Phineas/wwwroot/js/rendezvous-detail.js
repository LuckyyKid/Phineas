// Fiche d'un rendez-vous : en-tête et actions de statut, vue d'ensemble, préparation, essai routier, résultat, historique.
(function () {
  "use strict";

  var R = window.RendezVous, P = window.Prospects, S = window.Soumissions, UI = window.RendezVousUI;
  var racine = document.getElementById("rdv");
  if (!R || !P || !S || !UI || !racine) return;
  var esc = P.esc;
  var id = racine.dataset.rdvId;
  var resultatOuvert = false;

  var ACTIONS = {
    AConfirmer: { texte: "Demander une confirmation", icone: "bi-question-circle" },
    Confirme: { texte: "Marquer comme confirmé", icone: "bi-check2" },
    EnCours: { texte: "Démarrer la rencontre", essai: "Déclarer le début de l'essai", icone: "bi-play-fill" },
    Termine: { texte: "Terminer la rencontre", essai: "Déclarer la fin de l'essai", icone: "bi-stop-fill" },
    Annule: { texte: "Annuler le rendez-vous…", icone: "bi-x-circle" },
    ClientAbsent: { texte: "Déclarer le client absent…", icone: "bi-person-x" },
  };
  // Prochaine action proposée par défaut selon le résultat (modifiable).
  var ACTION_PAR_RESULTAT = {
    "interesse": "rappeler", "soumission-a-preparer": "preparer-soumission", "soumission-a-modifier": "modifier-soumission",
    "deuxieme-essai": "deuxieme-essai", "autre-vehicule": "autre-vehicule", "discussion": "rappeler",
    "financement": "financement", "reflexion": "attendre", "abandon": "aucune", "inconnu": "rappeler",
  };

  function zone(nom) {
    return racine.querySelector('[data-zone="' + nom + '"]');
  }
  function remplir(nom, html) {
    racine.querySelectorAll('[data-champ="' + nom + '"]').forEach(function (x) { x.innerHTML = html; });
  }
  function onglet(nom) {
    var b = document.getElementById("onglet-" + nom);
    if (b && !b.closest("[hidden]")) bootstrap.Tab.getOrCreateInstance(b).show();
  }
  function texteAction(r, cible) {
    var a = ACTIONS[cible];
    return R.estEssai(r) && a.essai ? a.essai : a.texte;
  }
  function conseillerTexte(idC) {
    var c = P.conseiller(idC);
    return c.nom + (c.moi ? " (moi)" : c.fictif ? " (fictif)" : "");
  }

  // ---------- En-tête ----------
  function rendreTete(r) {
    var c = P.contact(r.prospectId), o = P.opportunite(r.opportuniteId), v = R.vehicule(r.vehiculeId);
    var t = R.type(r.type);
    document.title = t.libelle + " · " + UI.nomClient(r) + " · Phineas";
    remplir("icone", '<i class="bi ' + esc(t.icone) + '"></i>');
    remplir("titre", esc(t.libelle) + ' <span class="rv-titre-client">· ' + esc(UI.nomClient(r)) + "</span>");
    remplir("badges", UI.pastilleStatut(r.statut) + (R.estActif(r) ? "" : '<span class="badge-soft"><i class="bi bi-lock"></i>Clôturé</span>'));
    remplir("client", c ? '<a href="' + esc(P.urlFiche(c.id)) + '">' + esc(c.prenom + " " + c.nom) + '</a><span class="pr-sous d-block">' + esc(UI.moyenPrefere(c)) + "</span>" : '<span class="text-muted">Prospect introuvable</span>');
    remplir("creneau", esc(R.creneauTexte(r)) + '<span class="pr-sous d-block">' + r.dureeMinutes + " min · " + esc(R.libelle("modes", r.mode) || "") + (r.lieu ? " · " + esc(r.lieu) : "") + "</span>");
    remplir("conseiller", esc(conseillerTexte(r.conseillerId)));
    remplir("vehicule", v ? esc(R.nomVehicule(v)) + '<span class="pr-sous d-block">N° ' + esc(v.numeroStock) + " · " + esc(S.libelleStatutVehicule(v.statutActuel)) + "</span>" : '<span class="text-muted">Aucun</span>');
    remplir("opportunite", o ? '<a href="' + esc(P.urlFiche(o.prospectId) + "#opportunites") + '">' + esc(o.titre) + '</a><span class="pr-sous d-block">' + esc(P.libelleEtape(o.etape)) + "</span>" : '<span class="text-muted">Introuvable</span>');

    var tr = R.transitions(r);
    var principales = tr.filter(function (x) { return ["AConfirmer", "Confirme", "EnCours", "Termine"].indexOf(x.cle) >= 0; });
    var secondaires = tr.filter(function (x) { return ["Annule", "ClientAbsent"].indexOf(x.cle) >= 0; });
    var html = principales.map(function (x, i) {
      return '<button type="button" class="btn btn-sm ' + (i === principales.length - 1 && !x.motif ? "btn-primary" : "btn-outline-primary") + '" data-statut="' + esc(x.cle) + '"' +
        (x.motif ? ' disabled title="' + esc(x.motif) + '"' : "") + '><i class="bi ' + ACTIONS[x.cle].icone + ' me-1"></i>' + esc(texteAction(r, x.cle)) + "</button>";
    }).join("");
    if (r.statut === "Termine") html += '<button type="button" class="btn btn-sm btn-primary" data-ouvrir-resultat><i class="bi bi-flag me-1"></i>' + (r.resultat ? "Modifier le résultat" : "Enregistrer le résultat") + "</button>";
    if (R.estActif(r)) html += '<button type="button" class="btn btn-sm btn-outline-primary" data-rappel="' + esc(r.id) + '"><i class="bi bi-chat-text me-1"></i>Préparer un rappel</button>';
    if (R.peutReplanifier(r)) html += '<a class="btn btn-sm btn-outline-primary" href="' + esc(R.urlNouveau({ replanifier: r.id })) + '"><i class="bi bi-arrow-repeat me-1"></i>Replanifier</a>';
    if (R.estModifiable(r)) html += '<button type="button" class="btn btn-sm btn-outline-primary" data-modifier><i class="bi bi-pencil me-1"></i>Modifier</button>';
    if (secondaires.length) {
      html += '<div class="dropdown"><button type="button" class="btn btn-sm btn-ghost dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false">Plus</button><ul class="dropdown-menu dropdown-menu-end sv-menu">' +
        secondaires.map(function (x) {
          return x.motif
            ? '<li><span class="dropdown-item disabled" aria-disabled="true"><i class="bi ' + ACTIONS[x.cle].icone + '"></i>' + esc(texteAction(r, x.cle)) + '<span class="d-block small">' + esc(x.motif) + "</span></span></li>"
            : '<li><button type="button" class="dropdown-item" data-statut="' + esc(x.cle) + '"><i class="bi ' + ACTIONS[x.cle].icone + '"></i>' + esc(texteAction(r, x.cle)) + "</button></li>";
        }).join("") + "</ul></div>";
    }
    zone("actions").innerHTML = html;
    zone("alertes").innerHTML = UI.alertes(R.actionsRequises(r));
  }

  // ---------- Vue d'ensemble ----------
  function rendreApercu(r) {
    var o = P.opportunite(r.opportuniteId);
    var q = (o && o.qualification) || {};
    zone("informations").innerHTML = '<dl class="pr-liste-def pr-liste-def-compacte">' +
      "<div><dt>Objectif</dt><dd>" + (r.objectif ? esc(r.objectif) : UI.A_VERIFIER) + "</dd></div>" +
      "<div><dt>Moyen et lieu</dt><dd>" + esc([R.libelle("modes", r.mode), r.lieu].filter(Boolean).join(" · ")) + "</dd></div>" +
      "<div><dt>Commentaire</dt><dd>" + (r.commentaire ? esc(r.commentaire) : '<span class="text-muted">—</span>') + "</dd></div>" +
      (r.annulation ? "<div><dt>Annulation</dt><dd>" + esc((R.libelle("motifsAnnulation", r.annulation.motif) || r.annulation.motif) + " · par " + (R.libelle("auteursAnnulation", r.annulation.auteur) || "").toLowerCase() + " · " + P.dateCourte(r.annulation.date)) +
        (r.annulation.commentaire ? '<span class="pr-sous d-block">' + esc(r.annulation.commentaire) + "</span>" : "") +
        '<span class="pr-sous d-block">' + (r.annulation.intentionReplanifier ? "Le client souhaite replanifier." : "Pas d'intention de replanifier exprimée.") + "</span></dd></div>" : "") +
      (r.absence ? "<div><dt>Absence</dt><dd>Prochaine action : " + esc((R.libelle("actionsAbsence", r.absence.prochaineAction) || "").toLowerCase()) +
        (r.absence.commentaire ? '<span class="pr-sous d-block">' + esc(r.absence.commentaire) + "</span>" : "") + "</dd></div>" : "") +
      "</dl>";
    var criteres = (q.elementsDecision || []).map(function (k) { return P.libelle("elementsDecision", k); }).filter(Boolean);
    zone("besoins").innerHTML = '<dl class="pr-liste-def pr-liste-def-compacte">' +
      "<div><dt>Véhicule recherché</dt><dd>" + (o && P.resumeVehicule(o) ? esc(P.resumeVehicule(o)) : UI.A_VERIFIER) + "</dd></div>" +
      "<div><dt>Budget indicatif</dt><dd>" + (P.resumeBudget(q) ? esc(P.resumeBudget(q)) : UI.A_VERIFIER) + "</dd></div>" +
      "<div><dt>Critères</dt><dd>" + (criteres.length ? esc(criteres.join(" · ")) : UI.A_VERIFIER) + "</dd></div>" +
      "</dl>" + '<a class="btn btn-sm btn-link p-0" href="#preparation" data-onglet="preparation">Voir le résumé complet du dossier</a>';

    var s = r.soumissionId ? S.soumission(r.soumissionId) : null;
    var autres = S.parOpportunite(r.opportuniteId).filter(function (x) { return !s || x.id !== s.id; });
    zone("soumission").innerHTML = s
      ? '<a href="' + esc(S.urlDetail(s.id)) + '"><strong>' + esc(s.reference) + "</strong></a> " + '<span class="so-statut so-st-' + esc(S.statut(s)) + '">' + esc(S.libelleStatut(S.statut(s))) + "</span>" +
        '<span class="pr-sous d-block">' + esc(S.nomVehicule(S.versionCourante(s).vehicule)) + " · version " + S.versionCourante(s).numero + "</span>"
      : '<p class="text-muted mb-1">Aucune soumission associée.</p>' + (autres.length ? '<span class="pr-sous d-block">' + autres.length + " soumission" + (autres.length > 1 ? "s" : "") + " sur cette opportunité.</span>" : "") +
        (o && P.estActive(o) ? '<a class="btn btn-sm btn-link p-0" href="' + esc(S.urlNouvelle(o.id)) + '"><i class="bi bi-plus-lg me-1"></i>Créer une soumission</a>' : "");

    var depuis = r.replanifieDepuis && R.rdv(r.replanifieDepuis), vers = r.replanifieVers && R.rdv(r.replanifieVers);
    zone("planification").innerHTML = '<dl class="pr-liste-def pr-liste-def-compacte">' +
      "<div><dt>Créé</dt><dd>" + esc(P.dateCourte(r.dateCreation)) + "</dd></div>" +
      (depuis ? "<div><dt>Replanifié depuis</dt><dd><a href=\"" + esc(R.urlDetail(depuis.id)) + '">' + esc(R.creneauTexte(depuis)) + "</a> " + UI.pastilleStatut(depuis.statut) + "</dd></div>" : "") +
      (vers ? "<div><dt>Nouveau créneau</dt><dd><a href=\"" + esc(R.urlDetail(vers.id)) + '">' + esc(R.creneauTexte(vers)) + "</a> " + UI.pastilleStatut(vers.statut) + "</dd></div>" : "") +
      "</dl>" + (!depuis && !vers ? '<p class="text-muted small mb-0">Aucune replanification.</p>' : "");

    var tr = R.transitions(r);
    zone("actions-disponibles").innerHTML = tr.length || R.peutReplanifier(r)
      ? '<ul class="rv-transitions">' + tr.map(function (x) {
          return "<li" + (x.motif ? ' class="is-impossible"' : "") + '><i class="bi ' + (x.motif ? "bi-slash-circle" : ACTIONS[x.cle].icone) + '" aria-hidden="true"></i><span>' + esc(texteAction(r, x.cle)) +
            (x.motif ? '<span class="pr-sous d-block">' + esc(x.motif) + "</span>" : "") + "</span></li>";
        }).join("") + (R.peutReplanifier(r) ? '<li><i class="bi bi-arrow-repeat" aria-hidden="true"></i><span>Replanifier (l\'ancien créneau reste dans l\'historique)</span></li>' : "") + "</ul>"
      : '<p class="text-muted small mb-0">Rendez-vous clôturé : il n\'est plus modifiable. ' + (r.statut === "Termine" ? "Le résultat reste modifiable." : "") + "</p>";
  }

  // ---------- Préparation ----------
  function rendrePreparation(r) {
    var modifiable = R.estActif(r);
    zone("preparation").innerHTML = UI.preparation(r);
    zone("checklist").innerHTML = UI.checklistHtml(r, false, modifiable) + (modifiable ? "" : '<p class="pr-note mb-0 mt-2">Rendez-vous clôturé : checklist en lecture seule.</p>');
    var v = R.vehicule(r.vehiculeId);
    zone("vehicule-prep").innerHTML = UI.vehiculeHtml(v);
    var p = UI.progression(UI.checklist(r, false));
    remplir("progression", p.faits + "/" + p.total);
    var manquants = R.actionsRequises(r);
    var o = P.opportunite(r.opportuniteId);
    var infos = o ? P.completude(o.qualification).manquants : [];
    zone("manquants").innerHTML = (manquants.length ? UI.alertes(manquants) : "") +
      (infos.length ? '<p class="small mb-1">Qualification à compléter :</p><ul class="rv-puces small">' + infos.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") +
      (!manquants.length && !infos.length ? '<p class="rv-ok mb-0"><i class="bi bi-check-circle-fill me-1"></i>Rien à signaler.</p>' : "");
  }

  // ---------- Essai routier ----------
  function rendreEssai(r) {
    var li = racine.querySelector('[data-zone="onglet-essai"]');
    li.hidden = !R.estEssai(r);
    if (!R.estEssai(r)) return;
    var v = R.vehicule(r.vehiculeId);
    zone("essai-vehicule").innerHTML = UI.vehiculeHtml(v) +
      '<dl class="pr-liste-def pr-liste-def-compacte mt-3"><div><dt>Créneau prévu</dt><dd>' + esc(R.creneauTexte(r)) + "</dd></div></dl>" +
      '<p class="pr-note mb-0"><i class="bi bi-qr-code me-1"></i>Le scan QR des véhicules n\'est pas encore accessible depuis l\'espace conseiller : aucun lien n\'est proposé, et l\'état réel du véhicule n\'est pas modifié par l\'essai.</p>';
    var html;
    var debutPossible = (R.transitions(r).filter(function (x) { return x.cle === "EnCours"; })[0]) || null;
    if (r.statut === "EnCours") {
      html = '<p class="rv-en-cours"><i class="bi bi-record-circle me-1"></i>Essai en cours depuis <strong>' + esc(R.heure(r.debutEssai)) + "</strong>.</p>" +
        '<div class="d-flex flex-wrap gap-2"><button type="button" class="btn btn-sm btn-primary" data-statut="Termine"><i class="bi bi-stop-fill me-1"></i>Déclarer la fin de l\'essai</button>' +
        '<button type="button" class="btn btn-sm btn-outline-primary" data-onglet="preparation">Besoins du client</button></div>';
    } else if (r.debutEssai || r.finEssai) {
      var duree = r.debutEssai && r.finEssai ? Math.max(1, Math.round((new Date(r.finEssai) - new Date(r.debutEssai)) / 60000)) : null;
      html = '<dl class="pr-liste-def pr-liste-def-compacte"><div><dt>Début</dt><dd>' + (r.debutEssai ? esc(R.heure(r.debutEssai)) : "—") + "</dd></div>" +
        "<div><dt>Fin</dt><dd>" + (r.finEssai ? esc(R.heure(r.finEssai)) : "—") + "</dd></div>" +
        (duree ? "<div><dt>Durée effective</dt><dd>" + duree + " min</dd></div>" : "") + "</dl>" +
        (r.statut === "Termine" ? '<button type="button" class="btn btn-sm btn-outline-primary" data-ouvrir-resultat>' + (r.resultat ? "Voir le résultat" : "Enregistrer le résultat") + "</button>" : "");
    } else if (debutPossible) {
      html = '<p class="mb-2">Essai non commencé.</p><button type="button" class="btn btn-sm btn-primary" data-statut="EnCours"' + (debutPossible.motif ? " disabled" : "") + '><i class="bi bi-play-fill me-1"></i>Déclarer le début de l\'essai</button>' +
        (debutPossible.motif ? '<span class="pr-sous d-block mt-1">' + esc(debutPossible.motif) + "</span>" : "");
    } else {
      html = '<p class="text-muted mb-0">' + (["Planifie", "AConfirmer"].indexOf(r.statut) >= 0 ? "Confirmez d'abord le rendez-vous pour pouvoir démarrer l'essai." : "Essai non réalisé (" + esc(R.statut(r.statut).libelle.toLowerCase()) + ").") + "</p>";
    }
    zone("essai-deroulement").innerHTML = html;
    zone("essai-checklist").innerHTML = UI.checklistHtml(r, true, R.estActif(r));
  }

  // ---------- Résultat ----------
  var formRes = document.getElementById("form-resultat");
  function rendreResultat(r) {
    var z = zone("resultat-etat");
    var res = r.resultat;
    formRes.querySelector("[data-si-essai]").hidden = !R.estEssai(r);
    if (r.statut === "Termine") {
      z.innerHTML = res ? resumeResultat(r, res) + (resultatOuvert ? "" : '<button type="button" class="btn btn-sm btn-outline-primary mt-2" data-ouvrir-resultat>Modifier le résultat</button>')
        : '<p class="mb-0">' + (resultatOuvert ? "Complétez le résultat de la rencontre." : '<span class="rv-a-verifier">Résultat à enregistrer.</span>') + "</p>" + (resultatOuvert ? "" : '<button type="button" class="btn btn-sm btn-primary mt-2" data-ouvrir-resultat>Enregistrer le résultat</button>');
    } else if (r.statut === "ClientAbsent") z.innerHTML = '<p class="mb-0"><i class="bi bi-person-x me-1"></i>Client absent. Prochaine action : ' + esc((R.libelle("actionsAbsence", r.absence && r.absence.prochaineAction) || "non précisée").toLowerCase()) + ".</p>";
    else if (r.statut === "Annule") z.innerHTML = '<p class="mb-0"><i class="bi bi-x-circle me-1"></i>Rendez-vous annulé : aucun résultat à enregistrer.</p>';
    else if (r.statut === "Replanifie") z.innerHTML = '<p class="mb-0"><i class="bi bi-arrow-repeat me-1"></i>Rendez-vous replanifié : le résultat sera saisi sur le nouveau créneau.</p>';
    else if (r.statut === "EnCours") z.innerHTML = '<p class="mb-0">Terminez d\'abord la rencontre pour enregistrer son résultat.</p>';
    else z.innerHTML = '<p class="text-muted mb-0">Le résultat pourra être saisi une fois la rencontre terminée.</p>';
    formRes.hidden = !(r.statut === "Termine" && resultatOuvert);
    rendreSuite(r);
  }
  function resumeResultat(r, res) {
    function ligne(t, v) { return v ? "<div><dt>" + esc(t) + "</dt><dd>" + esc(v) + "</dd></div>" : ""; }
    var action = res.prochaineAction && res.prochaineAction !== "aucune" ? R.libelle("prochainesActions", res.prochaineAction) + (res.precisionAction ? " : " + res.precisionAction : "") : "Aucune";
    return '<dl class="pr-liste-def pr-liste-def-compacte">' +
      ligne("Présence", "Client présent") +
      ligne("Résultat", R.libelle("resultats", res.resultat)) +
      ligne("Observations", res.observations) +
      ligne("Objections", res.objections) +
      ligne("Appréciation générale", R.libelle("appreciations", res.appreciation)) +
      ligne("Points appréciés", res.pointsAimes) +
      ligne("Points moins appréciés", res.pointsMoins) +
      ligne("Questions", res.questions) +
      ligne("Intérêt déclaré par le client", R.libelle("interets", res.interet)) +
      ligne("Véhicule alternatif", res.vehiculeAlternatif) +
      ligne("Prochaine action", action + (res.dateSuivi ? " (" + P.dateCourte(res.dateSuivi) + ")" : "")) +
      "</dl>";
  }
  function rendreSuite(r) {
    var o = P.opportunite(r.opportuniteId);
    var s = r.soumissionId ? S.soumission(r.soumissionId) : null;
    var res = r.resultat;
    var suggere = res ? res.prochaineAction : null;
    var liens = [];
    function lien(cle, href, texte, icone) {
      liens.push('<li' + (suggere === cle ? ' class="is-suggere"' : "") + '><a href="' + esc(href) + '"><i class="bi ' + icone + ' me-1"></i>' + esc(texte) + "</a>" + (suggere === cle ? ' <span class="badge-soft">Prochaine action</span>' : "") + "</li>");
    }
    if (o && P.estActive(o)) {
      lien("preparer-soumission", S.urlNouvelle(o.id), "Préparer une nouvelle soumission", "bi-file-earmark-plus");
      if (s) lien("modifier-soumission", S.urlDetail(s.id), "Ouvrir la soumission " + s.reference + " (nouvelle version)", "bi-layers");
      lien("deuxieme-essai", R.urlNouveau({ opportunite: o.id }), "Planifier un autre rendez-vous", "bi-calendar-plus");
    }
    lien("fiche", P.urlFiche(r.prospectId) + "#opportunites", "Ouvrir la fiche du prospect", "bi-person-lines-fill");
    zone("suite").innerHTML = '<ul class="rv-suite">' + liens.join("") + "</ul>" +
      '<p class="pr-note mb-0"><i class="bi bi-info-circle me-1"></i>L\'étape de l\'opportunité (' + esc(o ? P.libelleEtape(o.etape) : "—") + ") n'est jamais modifiée automatiquement par un rendez-vous : changez-la explicitement depuis la fiche du prospect.</p>";
  }
  function remplirFormResultat(r) {
    var res = r.resultat || {};
    var el = formRes.elements;
    el.resultat.value = res.resultat || "";
    ["observations", "objections", "appreciation", "pointsAimes", "pointsMoins", "questions", "interet", "vehiculeAlternatif", "precisionAction"].forEach(function (k) { el[k].value = res[k] || ""; });
    el.prochaineAction.value = res.prochaineAction || "rappeler";
    el.dateSuivi.value = res.dateSuivi ? P.versChampDate(res.dateSuivi) : "";
    el.dateSuivi.min = P.aujourdhuiChamp();
    formRes.querySelectorAll(".is-invalid").forEach(function (x) { x.classList.remove("is-invalid"); });
  }
  formRes.elements.resultat.addEventListener("change", function () {
    var defaut = ACTION_PAR_RESULTAT[formRes.elements.resultat.value];
    if (defaut) formRes.elements.prochaineAction.value = defaut;
  });
  formRes.addEventListener("submit", function (e) {
    e.preventDefault();
    var el = formRes.elements;
    var ok = true;
    el.resultat.classList.toggle("is-invalid", !el.resultat.value);
    if (!el.resultat.value) ok = false;
    var dateInvalide = el.dateSuivi.value && el.dateSuivi.value < P.aujourdhuiChamp();
    el.dateSuivi.classList.toggle("is-invalid", !!dateInvalide);
    if (dateInvalide) ok = false;
    if (!ok) { formRes.querySelector(".is-invalid").focus(); return; }
    var essai = R.estEssai(R.rdv(id));
    function val(k) { return el[k].value.trim() || null; }
    var res = {
      resultat: el.resultat.value,
      observations: val("observations"),
      objections: val("objections"),
      prochaineAction: el.prochaineAction.value,
      precisionAction: val("precisionAction"),
      dateSuivi: el.dateSuivi.value ? P.depuisChampDate(el.dateSuivi.value).toISOString() : null,
      appreciation: essai ? val("appreciation") : null,
      pointsAimes: essai ? val("pointsAimes") : null,
      pointsMoins: essai ? val("pointsMoins") : null,
      questions: essai ? val("questions") : null,
      interet: essai ? val("interet") : null,
      vehiculeAlternatif: essai ? val("vehiculeAlternatif") : null,
    };
    var annuler = R.enregistrerResultat(id, res);
    if (!annuler) return P.notifier("Le résultat ne peut être enregistré que pour un rendez-vous terminé.");
    resultatOuvert = false;
    rendre();
    P.notifier("Résultat enregistré localement et ajouté à l'historique de l'opportunité.", function () { annuler(); });
  });
  formRes.querySelector("[data-annuler-resultat]").addEventListener("click", function () {
    resultatOuvert = false;
    rendre();
  });

  // ---------- Historique ----------
  var TYPES_HISTORIQUE = {
    creation: "bi-calendar-plus", confirmation: "bi-check-circle", statut: "bi-signpost-split", modification: "bi-pencil",
    replanification: "bi-arrow-repeat", annulation: "bi-x-circle", absence: "bi-person-x", essai: "bi-speedometer",
    resultat: "bi-flag", note: "bi-journal-text",
  };
  var LIBELLES_HISTORIQUE = {
    creation: "Création", confirmation: "Confirmation", statut: "Changement de statut", modification: "Modification",
    replanification: "Replanification", annulation: "Annulation", absence: "Absence", essai: "Essai routier", resultat: "Résultat", note: "Note",
  };
  function rendreHistorique(r) {
    var h = (r.historique || []).slice().reverse();
    remplir("nb-historique", String(h.length));
    zone("historique").innerHTML = h.length ? h.map(function (e) {
      return '<li class="pr-tl"><span class="pr-tl-icone"><i class="bi ' + (TYPES_HISTORIQUE[e.type] || "bi-dot") + '"></i></span><div class="pr-tl-corps">' +
        '<div class="pr-tl-tete"><strong>' + esc(LIBELLES_HISTORIQUE[e.type] || e.type) + '</strong><span class="text-muted">' + esc(e.auteur) + "</span>" +
        '<time datetime="' + esc(e.date) + '" title="' + esc(P.dateComplete(e.date)) + '">' + esc(P.relatif(e.date)) + "</time></div><p>" + esc(e.texte) + "</p></div></li>";
    }).join("") : '<li class="sv-empty"><span>Aucun événement.</span></li>';
  }

  // ---------- Rendu global ----------
  function rendre() {
    var r = R.rdv(id);
    document.getElementById("rdv-introuvable").hidden = !!r;
    racine.hidden = !r;
    if (!r) return;
    rendreTete(r);
    rendreApercu(r);
    rendrePreparation(r);
    rendreEssai(r);
    rendreResultat(r);
    rendreHistorique(r);
  }

  // ---------- Actions ----------
  var modalAnnulation = bootstrap.Modal.getOrCreateInstance(document.getElementById("modal-annulation"));
  var modalAbsence = bootstrap.Modal.getOrCreateInstance(document.getElementById("modal-absence"));
  var modalModifier = bootstrap.Modal.getOrCreateInstance(document.getElementById("modal-modifier"));
  var formAnnulation = document.getElementById("form-annulation");
  var formAbsence = document.getElementById("form-absence");
  var formModifier = document.getElementById("form-modifier");

  function changerStatut(cible) {
    var r = R.rdv(id);
    if (cible === "Annule") {
      formAnnulation.reset();
      formAnnulation.elements.motif.classList.remove("is-invalid");
      return modalAnnulation.show();
    }
    if (cible === "ClientAbsent") {
      formAbsence.reset();
      var c = P.contact(r.prospectId);
      formAbsence.querySelector('[data-zone="absence-preferences"]').innerHTML = '<i class="bi bi-chat-dots me-1"></i>Préférence du client : <strong>' + esc(UI.moyenPrefere(c) || "non précisée") + "</strong>" +
        (UI.coordonnee(c) ? " · " + esc(UI.coordonnee(c)) : "") + ". Le suivi proposé respecte ce moyen de contact.";
      formAbsence.querySelector("[data-si-suivi]").hidden = true;
      formAbsence.querySelector("[data-message-action]").hidden = true;
      formAbsence.elements.dateSuivi.min = P.aujourdhuiChamp();
      return modalAbsence.show();
    }
    var motif = R.refus(r, cible);
    if (motif) return P.notifier("Impossible : " + motif);
    var annuler = R.changerStatut(id, cible);
    if (!annuler) return;
    var textes = {
      AConfirmer: "Confirmation demandée (aucun message envoyé par Phineas).",
      Confirme: "Rendez-vous marqué comme confirmé (déclaration locale).",
      EnCours: R.estEssai(r) ? "Début de l'essai déclaré à " + R.heure(new Date()) + "." : "Rencontre commencée.",
      Termine: R.estEssai(r) ? "Fin de l'essai déclarée. Enregistrez le résultat." : "Rencontre terminée. Enregistrez le résultat.",
    };
    if (cible === "Termine") {
      resultatOuvert = true;
      remplirFormResultat(R.rdv(id));
    }
    rendre();
    if (cible === "Termine") onglet("resultat");
    P.notifier(textes[cible] || "Statut mis à jour.", function () { annuler(); resultatOuvert = false; rendre(); });
  }

  formAnnulation.addEventListener("submit", function (e) {
    e.preventDefault();
    var el = formAnnulation.elements;
    el.motif.classList.toggle("is-invalid", !el.motif.value);
    if (!el.motif.value) return el.motif.focus();
    var annuler = R.annuler(id, { motif: el.motif.value, auteur: el.auteur.value, commentaire: el.commentaire.value.trim(), intentionReplanifier: el.intention.checked });
    modalAnnulation.hide();
    if (!annuler) return P.notifier("Ce rendez-vous ne peut plus être annulé.");
    rendre();
    P.notifier("Rendez-vous annulé (localement)." + (el.intention.checked ? " Utilisez « Replanifier » pour proposer un nouveau créneau." : ""), function () { annuler(); rendre(); });
  });

  formAbsence.addEventListener("change", function (e) {
    if (e.target.name !== "prochaineAction") return;
    formAbsence.querySelector("[data-message-action]").hidden = true;
    var suivi = ["contacter", "autre-date"].indexOf(e.target.value) >= 0;
    formAbsence.querySelector("[data-si-suivi]").hidden = !suivi;
    if (suivi && !formAbsence.elements.dateSuivi.value) formAbsence.elements.dateSuivi.value = P.aujourdhuiChamp();
  });
  formAbsence.addEventListener("submit", function (e) {
    e.preventDefault();
    var el = formAbsence.elements;
    var choix = formAbsence.querySelector('input[name="prochaineAction"]:checked');
    formAbsence.querySelector("[data-message-action]").hidden = !!choix;
    if (!choix) return;
    var suivi = ["contacter", "autre-date"].indexOf(choix.value) >= 0;
    var dateInvalide = suivi && el.dateSuivi.value && el.dateSuivi.value < P.aujourdhuiChamp();
    el.dateSuivi.classList.toggle("is-invalid", !!dateInvalide);
    if (dateInvalide) return el.dateSuivi.focus();
    var r = R.rdv(id);
    var c = P.contact(r.prospectId);
    var annuler = R.declarerAbsence(id, {
      prochaineAction: choix.value,
      commentaire: el.commentaire.value.trim(),
      moyen: c ? (P.libelle("moyensContact", c.contactPrefere) || "").toLowerCase() : null,
      dateSuivi: suivi && el.dateSuivi.value ? P.depuisChampDate(el.dateSuivi.value) : null,
    });
    modalAbsence.hide();
    if (!annuler) return P.notifier("L'absence ne peut pas être déclarée pour ce rendez-vous.");
    rendre();
    P.notifier("Absence enregistrée localement." + (choix.value === "autre-date" ? " Utilisez « Replanifier » pour proposer une autre date." : ""), function () { annuler(); rendre(); });
  });

  formModifier.addEventListener("submit", function (e) {
    e.preventDefault();
    var el = formModifier.elements;
    var r = R.rdv(id);
    var patch = { objectif: el.objectif.value.trim(), mode: el.mode.value, lieu: el.lieu.value.trim(), conseillerId: el.conseillerId.value, commentaire: el.commentaire.value.trim() };
    if (patch.conseillerId !== r.conseillerId) {
      var c = R.conflits({ id: r.id, debut: r.debut, dureeMinutes: r.dureeMinutes, conseillerId: patch.conseillerId, vehiculeId: null }).conseiller;
      if (c.length && !window.confirm("Ce conseiller a déjà un rendez-vous sur ce créneau (" + c.map(function (x) { return R.plage(x); }).join(", ") + "). Confirmer ce chevauchement exceptionnel ?")) return;
    }
    var annuler = R.modifier(id, patch);
    modalModifier.hide();
    if (!annuler) return P.notifier("Ce rendez-vous n'est plus modifiable.");
    rendre();
    P.notifier("Rendez-vous modifié localement.", function () { annuler(); rendre(); });
  });

  racine.addEventListener("change", function (e) {
    var x = e.target.closest("[data-cocher]");
    if (!x) return;
    if (!R.cocher(id, x.dataset.cocher, x.checked)) { x.checked = !x.checked; return P.notifier("Rendez-vous clôturé : checklist en lecture seule."); }
    rendre();
  });
  racine.addEventListener("click", function (e) {
    var b = e.target.closest("[data-statut], [data-rappel], [data-modifier], [data-ouvrir-resultat], [data-onglet]");
    if (!b || b.disabled) return;
    if (b.dataset.statut) return changerStatut(b.dataset.statut);
    if (b.dataset.rappel && window.RappelRendezVous) return window.RappelRendezVous.ouvrir(b.dataset.rappel);
    if (b.dataset.onglet) { e.preventDefault(); return onglet(b.dataset.onglet); }
    if (b.hasAttribute("data-ouvrir-resultat")) {
      resultatOuvert = true;
      remplirFormResultat(R.rdv(id));
      rendre();
      onglet("resultat");
      return formRes.elements.resultat.focus();
    }
    if (b.hasAttribute("data-modifier")) {
      var r = R.rdv(id);
      var el = formModifier.elements;
      el.objectif.value = r.objectif || "";
      el.mode.value = r.mode;
      el.lieu.value = r.lieu || "";
      el.conseillerId.value = r.conseillerId;
      el.commentaire.value = r.commentaire || "";
      modalModifier.show();
    }
  });

  racine.querySelectorAll('[data-bs-toggle="tab"]').forEach(function (t) {
    t.addEventListener("shown.bs.tab", function () { history.replaceState(null, "", "#" + t.id.replace("onglet-", "")); });
  });
  window.addEventListener("beforeunload", function (e) {
    if (resultatOuvert && !formRes.hidden && formRes.elements.resultat.value && !(R.rdv(id) || {}).resultat) { e.preventDefault(); e.returnValue = ""; }
  });

  R.abonner(rendre);
  rendre();
  var hash = window.location.hash.replace("#", "");
  if (["apercu", "preparation", "essai", "resultat", "historique"].indexOf(hash) >= 0 && !racine.hidden) {
    if (hash === "resultat" && R.rdv(id) && R.rdv(id).statut === "Termine" && !R.rdv(id).resultat) { resultatOuvert = true; remplirFormResultat(R.rdv(id)); rendre(); }
    onglet(hash);
  }
})();
