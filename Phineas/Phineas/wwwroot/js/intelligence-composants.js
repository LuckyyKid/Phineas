// Composants partagés du moteur d'intelligence commerciale : carte d'action, pastilles, fenêtres (report, ignorer,
// transfert, historique), éditeur de relance et tableau des critères de compatibilité. Les fenêtres sont créées à la
// demande pour être disponibles sur toutes les pages qui chargent le moteur.
(function () {
  "use strict";

  var I = window.Intelligence, P = window.Prospects, S = window.Soumissions;
  if (!I || !P) return;
  var esc = P.esc;
  var ref = I.ref;
  var PRIO = {};
  ref.priorites.forEach(function (p) { PRIO[p.cle] = p; });
  var CAT = {};
  ref.categories.forEach(function (c) { CAT[c.cle] = c; });

  function pastillePriorite(cle) {
    var p = PRIO[cle] || { libelle: cle, icone: "bi-circle" };
    return '<span class="ia-prio ia-prio-' + esc(cle) + '"><i class="bi ' + esc(p.icone) + '" aria-hidden="true"></i>' + esc(p.libelle) + "</span>";
  }
  function pastilleEtat(cle) {
    return '<span class="ia-etat ia-etat-' + esc(cle) + '">' + esc(ref.etatsAction[cle] || cle) + "</span>";
  }
  function echeanceTexte(d) {
    if (!d) return "Sans échéance";
    var m = new Date(), e = new Date(d);
    if (e < m) return "En retard · " + P.dateCourte(e);
    var h = (e - m) / 3600000;
    if (h < 24 && e.toDateString() === m.toDateString()) return "Aujourd'hui, " + e.toLocaleTimeString("fr-CA", { hour: "numeric", minute: "2-digit" });
    return P.echeance(e).charAt(0).toUpperCase() + P.echeance(e).slice(1);
  }
  function enRetard(a) {
    return a.echeance && new Date(a.echeance) < new Date();
  }

  function estActive(a) {
    return a.statut === "ATraiter" || a.statut === "EnCours";
  }
  function libelleResponsable(a) {
    if (a.departement === "conseiller") return "Vous";
    var departements = window.Transactions ? window.Transactions.ref.departements : {};
    var d = departements[a.departement];
    return d ? d.libelle : a.departement;
  }

  // Boutons du menu « Plus » (commencer, reporter, ignorer, confier, historique), selon l'état de l'action.
  function boutonsSecondaires(a) {
    var actif = estActive(a);
    var secondaires = actif ? [
      a.statut === "ATraiter" ? '<button type="button" class="dropdown-item" data-ia="commencer" data-id="' + esc(a.id) + '"><i class="bi bi-play-circle"></i>Commencer le traitement</button>' : "",
      '<button type="button" class="dropdown-item" data-ia="reporter" data-id="' + esc(a.id) + '"><i class="bi bi-clock"></i>Reporter</button>',
      '<button type="button" class="dropdown-item" data-ia="ignorer" data-id="' + esc(a.id) + '"><i class="bi bi-eye-slash"></i>Ignorer</button>',
      a.assignation ? '<button type="button" class="dropdown-item" data-ia="reprendre-charge" data-id="' + esc(a.id) + '"><i class="bi bi-person-check"></i>Reprendre en charge</button>'
        : '<button type="button" class="dropdown-item" data-ia="transferer" data-id="' + esc(a.id) + '"><i class="bi bi-people"></i>Confier à un collègue</button>',
    ].join("") : (a.statut === "Reportee" || a.statut === "Ignoree") && !a.horsFile ? '<button type="button" class="dropdown-item" data-ia="reactiver" data-id="' + esc(a.id) + '"><i class="bi bi-arrow-counterclockwise"></i>Remettre dans la file</button>' : "";
    secondaires += '<button type="button" class="dropdown-item" data-ia="historique" data-id="' + esc(a.id) + '"><i class="bi bi-clock-history"></i>Historique de l\'action</button>';
    return secondaires;
  }

  // Liste « Pourquoi cette recommandation et cette priorité ? » (règle, raisons, résolution, expiration).
  function pourquoi(a) {
    var nature = "action interne";
    if (a.nature === "commerciale") nature = "sollicitation commerciale";
    if (a.nature === "dossier") nature = "communication liée au dossier";
    return "<li>Règle : « " + esc(a.regleLibelle) + " » (" + esc(nature) + ").</li>" +
      (a.raisonsPriorite || []).map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") +
      "<li>Résolution : " + esc(a.resolution || "non précisée") + "</li><li>Expiration : " + esc(a.expiration || "non précisée") + "</li>" +
      "<li>Détectée " + esc(a.detecteLe ? P.relatif(a.detecteLe) : "à une date inconnue") + ".</li>";
  }

  // ---------- Carte d'action (tableau de bord, fiches) ----------
  function carte(a, options) {
    options = options || {};
    var cat = CAT[a.categorie] || {};
    var lien = I.urlObjet(a);
    var actif = estActive(a);
    var secondaires = boutonsSecondaires(a);
    var principale = !actif ? "" : a.relance ? '<button type="button" class="btn btn-sm btn-primary" data-ia="relance" data-id="' + esc(a.id) + '"><i class="bi bi-pencil-square me-1"></i>Préparer la relance</button>'
      : '<a class="btn btn-sm btn-primary" href="' + esc(lien) + '"><i class="bi bi-box-arrow-up-right me-1"></i>' + esc(a.actionProposee) + "</a>";
    return '<article class="ia-carte ia-prio-bord-' + esc(a.priorite) + (enRetard(a) && actif ? " is-retard" : "") + '" data-action-id="' + esc(a.id) + '" aria-labelledby="ia-t-' + esc(cleId(a.id)) + '">' +
      '<header class="ia-carte-tete"><span class="ia-type"><i class="bi ' + esc(cat.icone || "bi-lightning") + '" aria-hidden="true"></i><span id="ia-t-' + esc(cleId(a.id)) + '">' + esc(a.regleLibelle) + "</span></span>" +
      '<span class="ia-carte-pastilles">' + pastillePriorite(a.priorite) + (a.statut !== "ATraiter" ? pastilleEtat(a.statut) : "") + "</span></header>" +
      '<p class="ia-qui"><a href="' + esc(a.prospectId ? P.urlFiche(a.prospectId) : "#") + '"><strong>' + esc(a.client) + "</strong></a>" + (a.vehicule ? ' <span class="pr-sous">· ' + esc(a.vehicule) + "</span>" : "") + "</p>" +
      (a.declencheur ? '<p class="ia-situation">' + esc(a.declencheur) + "</p>" : "") +
      '<p class="ia-motif"><span class="visually-hidden">Raison : </span>' + esc(a.motif) + "</p>" +
      ((a.contexte || []).length && !options.compacte ? '<ul class="ia-contexte">' + a.contexte.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") +
      (a.avertissement ? '<p class="ia-avertissement"><i class="bi bi-shield-exclamation me-1" aria-hidden="true"></i>' + esc(a.avertissement) + "</p>" : "") +
      (a.assignation ? '<p class="ia-transfert"><i class="bi bi-people me-1" aria-hidden="true"></i>Prise en charge temporaire par <strong>' + esc(a.assignation.collegue) + "</strong> (" + esc((ref.motifsTransfert[a.assignation.motif] || "").toLowerCase()) + ")</p>" : "") +
      (a.statut === "Reportee" && a.reporteJusqua ? '<p class="ia-transfert"><i class="bi bi-clock me-1" aria-hidden="true"></i>Reportée au ' + esc(P.dateCourte(a.reporteJusqua)) + "</p>" : "") +
      '<dl class="ia-meta"><div><dt>Action proposée</dt><dd>' + esc(a.actionProposee) + "</dd></div>" +
      '<div><dt>Échéance</dt><dd class="' + (enRetard(a) ? "ia-retard" : "") + '">' + esc(echeanceTexte(a.echeance)) + "</dd></div>" +
      '<div><dt>Responsable</dt><dd>' + esc(a.departement === "conseiller" ? "Vous" : (window.Transactions && window.Transactions.ref.departements[a.departement] || {}).libelle || a.departement) + (a.source ? ' <span class="pr-sous">· ' + esc(a.source) + "</span>" : "") + "</dd></div></dl>" +
      (options.compacte ? "" : '<details class="ia-pourquoi"><summary>Pourquoi cette recommandation et cette priorité ?</summary><ul>' + pourquoi(a) + "</ul></details>") +
      '<footer class="ia-carte-actions">' + principale +
      '<a class="btn btn-sm btn-outline-primary" href="' + esc(lien) + '">Consulter le dossier</a>' +
      (actif ? '<button type="button" class="btn btn-sm btn-ghost" data-ia="terminer" data-id="' + esc(a.id) + '"><i class="bi bi-check2 me-1"></i>Marquer comme réalisée</button>' : "") +
      '<div class="dropdown"><button type="button" class="btn btn-sm btn-ghost dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Autres actions">Plus</button><div class="dropdown-menu dropdown-menu-end sv-menu">' + secondaires + "</div></div>" +
      "</footer></article>";
  }
  function cleId(id) {
    return String(id).replace(/[^a-zA-Z0-9-]/g, "_");
  }

  // ---------- Ligne d'action (Centre d'actions, maquette 01) ----------
  // Ligne compacte : point de priorité, client et type, raison et catégorie, échéance, flèche vers le dossier.
  // Un clic sur la ligne déplie le détail (contexte, pourquoi, boutons de traitement) ; les lignes ouvertes
  // le restent quand la liste est redessinée.
  var lignesOuvertes = {};

  function echeanceCourte(a) {
    if (enRetard(a)) return "En retard";
    return echeanceTexte(a.echeance);
  }

  function detailLigne(a) {
    var lien = I.urlObjet(a);
    var actif = estActive(a);
    var html = "";
    if (a.declencheur) html += "<p>" + esc(a.declencheur) + "</p>";
    if ((a.contexte || []).length) {
      html += '<ul class="iv-contexte">' + a.contexte.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
    }
    if (a.avertissement) html += '<p class="iv-alerte"><i class="bi bi-shield-exclamation" aria-hidden="true"></i> ' + esc(a.avertissement) + "</p>";
    if (a.assignation) {
      html += '<p><i class="bi bi-people" aria-hidden="true"></i> Prise en charge temporaire par <strong>' + esc(a.assignation.collegue) + "</strong> (" + esc((ref.motifsTransfert[a.assignation.motif] || "").toLowerCase()) + ")</p>";
    }
    if (a.statut === "Reportee" && a.reporteJusqua) {
      html += '<p><i class="bi bi-clock" aria-hidden="true"></i> Reportée au ' + esc(P.dateCourte(a.reporteJusqua)) + "</p>";
    }

    var responsable = esc(libelleResponsable(a));
    if (a.source) responsable += '<span class="iv-sous">' + esc(a.source) + "</span>";
    html += '<dl class="iv-meta">' +
      "<div><dt>Action proposée</dt><dd>" + esc(a.actionProposee) + "</dd></div>" +
      "<div><dt>Échéance</dt><dd>" + esc(echeanceTexte(a.echeance)) + "</dd></div>" +
      "<div><dt>Responsable</dt><dd>" + responsable + "</dd></div></dl>";
    html += '<details class="iv-pourquoi"><summary>Pourquoi cette recommandation et cette priorité ?</summary><ul>' + pourquoi(a) + "</ul></details>";

    var boutons = "";
    if (actif && a.relance) {
      boutons += '<button type="button" class="iv-btn iv-btn-sapin iv-btn-petit" data-ia="relance" data-id="' + esc(a.id) + '"><i class="bi bi-pencil-square"></i>Préparer la relance</button>';
    } else if (actif) {
      boutons += '<a class="iv-btn iv-btn-sapin iv-btn-petit" href="' + esc(lien) + '">' + esc(a.actionProposee) + "</a>";
    }
    boutons += '<a class="iv-btn iv-btn-blanc iv-btn-petit" href="' + esc(lien) + '">Consulter le dossier</a>';
    if (a.prospectId) boutons += '<a class="iv-btn iv-btn-discret" href="' + esc(P.urlFiche(a.prospectId)) + '">Fiche du client</a>';
    if (actif) boutons += '<button type="button" class="iv-btn iv-btn-discret" data-ia="terminer" data-id="' + esc(a.id) + '"><i class="bi bi-check2"></i>Marquer comme réalisée</button>';
    boutons += '<div class="dropdown"><button type="button" class="iv-btn iv-btn-discret dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Autres actions">Plus</button>' +
      '<div class="dropdown-menu dropdown-menu-end">' + boutonsSecondaires(a) + "</div></div>";
    html += '<div class="iv-action-boutons">' + boutons + "</div>";
    return html;
  }

  function ligne(a) {
    var cat = CAT[a.categorie] || {};
    var prio = PRIO[a.priorite] || { libelle: a.priorite };
    var ouverte = !!lignesOuvertes[a.id];
    var idDetail = "iv-d-" + cleId(a.id);
    var retard = enRetard(a) && estActive(a);
    var etatAction = a.statut !== "ATraiter" ? '<span class="iv-etat">' + esc(ref.etatsAction[a.statut] || a.statut) + "</span>" : "";
    var raison = a.motif + (cat.libelle ? " · " + cat.libelle : "");
    var lienDossier = I.urlObjet(a);

    return '<article class="iv-action' + (ouverte ? " is-ouverte" : "") + '" data-action-id="' + esc(a.id) + '">' +
      '<div class="iv-action-ligne">' +
      '<button type="button" class="iv-action-ouvrir" data-iv-ouvrir="' + esc(a.id) + '" aria-expanded="' + ouverte + '" aria-controls="' + esc(idDetail) + '">' +
      '<span class="iv-prio iv-prio-' + esc(a.priorite) + '" title="Priorité : ' + esc(prio.libelle) + '"><span class="visually-hidden">Priorité ' + esc(prio.libelle) + "</span></span>" +
      '<span class="iv-action-texte"><span class="iv-action-nom">' + esc(a.client) + "</span>" +
      '<span class="iv-action-type">' + esc(a.regleLibelle) + "</span>" + etatAction +
      (a.vehicule ? '<span class="iv-action-type">' + esc(a.vehicule) + "</span>" : "") +
      '<span class="iv-action-raison">' + esc(raison) + "</span></span></button>" +
      '<span class="iv-action-echeance' + (retard ? " is-retard" : "") + '">' + esc(echeanceCourte(a)) + "</span>" +
      '<a class="iv-btn-rond" href="' + esc(lienDossier) + '" aria-label="Ouvrir le dossier : ' + esc(a.client) + '"><i class="bi bi-arrow-right" aria-hidden="true"></i></a>' +
      "</div>" +
      '<div class="iv-action-detail" id="' + esc(idDetail) + '"' + (ouverte ? "" : " hidden") + ">" + detailLigne(a) + "</div>" +
      "</article>";
  }

  // Ouvre ou ferme le détail d'une ligne, sans redessiner la liste.
  document.addEventListener("click", function (e) {
    var bouton = e.target.closest("[data-iv-ouvrir]");
    if (!bouton) return;
    var id = bouton.dataset.ivOuvrir;
    var article = bouton.closest(".iv-action");
    var detail = article.querySelector(".iv-action-detail");
    var ouvrir = detail.hidden;
    detail.hidden = !ouvrir;
    bouton.setAttribute("aria-expanded", String(ouvrir));
    article.classList.toggle("is-ouverte", ouvrir);
    if (ouvrir) lignesOuvertes[id] = true;
    else delete lignesOuvertes[id];
  });

  // Compteur « à traiter » à côté de « Centre d'actions » dans la barre latérale (calculé dans le navigateur).
  function majCompteurMenu() {
    var liens = document.querySelectorAll(".ph-nav a");
    var lienCentre = null;
    liens.forEach(function (l) {
      if (/\/Intelligence\/?$/i.test(l.getAttribute("href") || "")) lienCentre = l;
    });
    if (!lienCentre) return;
    var compteur = lienCentre.querySelector(".ph-nav-count");
    if (!compteur) {
      compteur = document.createElement("span");
      compteur.className = "ph-nav-count";
      lienCentre.appendChild(compteur);
    }
    compteur.textContent = String(I.compteurs(P.moiId).aTraiter);
  }
  if (I.abonner) I.abonner(majCompteurMenu);
  majCompteurMenu();

  // ---------- Fenêtre générique ----------
  var modale = null;
  function fenetre(titre, corpsHtml, pied) {
    if (!modale) {
      var el = document.createElement("div");
      el.className = "modal fade";
      el.id = "ia-modale";
      el.tabIndex = -1;
      el.setAttribute("aria-labelledby", "ia-modale-titre");
      el.setAttribute("aria-hidden", "true");
      el.innerHTML = '<div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h2 class="modal-title h5" id="ia-modale-titre"></h2>' +
        '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fermer"></button></div><div class="modal-body"></div><div class="modal-footer"></div></div></div>';
      document.body.appendChild(el);
      modale = el;
      el.addEventListener("click", surClicModale);
      el.addEventListener("change", surChangeModale);
    }
    modale.querySelector("#ia-modale-titre").textContent = titre;
    modale.querySelector(".modal-body").innerHTML = corpsHtml;
    modale.querySelector(".modal-footer").innerHTML = pied || '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Fermer</button>';
    if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(modale).show();
    else modale.classList.add("show");
    return modale;
  }
  function fermer() {
    if (modale && window.bootstrap) bootstrap.Modal.getOrCreateInstance(modale).hide();
  }
  function notifier(annuler, ok, ko) {
    P.notifier(annuler ? ok : ko || "Action impossible dans l'état actuel.", annuler || undefined);
  }
  var courant = null;

  function ouvrirReport(id) {
    var a = I.action(id);
    if (a && a.regle === "suivi-echeance" && P.estEnregistree(a.opportuniteId)) {
      ouvrirReportSuivi(a.opportuniteId, a.regleLibelle, a.client);
      return;
    }
    courant = { type: "reporter", id: id };
    var demain = new Date(); demain.setDate(demain.getDate() + 1);
    fenetre("Reporter l'action", "<p><strong>" + esc(a.regleLibelle) + "</strong> : " + esc(a.client) + "</p>" +
      '<label class="form-label" for="ia-date">Revenir dans la file le <span class="pr-requis">*</span></label><input type="date" class="form-control" id="ia-date" min="' + esc(P.versChampDate(demain)) + '" value="' + esc(P.versChampDate(demain)) + '" />' +
      '<div class="invalid-feedback">Choisissez une date à venir.</div>' +
      '<label class="form-label mt-3" for="ia-motif">Motif <span class="text-muted">(facultatif)</span></label><input class="form-control" id="ia-motif" maxlength="200" />' +
      '<p class="pr-note mt-2 mb-0">L\'action ne réapparaîtra pas avant cette date, sauf si vous la remettez dans la file.</p>',
      '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Annuler</button><button type="button" class="btn btn-primary" data-ia-valider>Reporter</button>');
  }
  // Suivi planifié et enregistré en base : on change sa date en base (même action), ce n'est pas une mise en veille locale.
  // Ouvert depuis une recommandation « suivi-echeance » (« À traiter », cartes) ou depuis la vue « À venir ».
  // titre : libellé en gras en tête de la fenêtre (règle ou opportunité) ; client : nom affiché à côté.
  function ouvrirReportSuivi(oppId, titre, client) {
    var o = P.opportunite(oppId);
    var demain = new Date(); demain.setDate(demain.getDate() + 1);
    courant = { type: "reporter-suivi", id: oppId, oppId: oppId };
    fenetre("Reporter le suivi", "<p><strong>" + esc(titre) + "</strong> : " + esc(client) + "</p>" +
      "<p>Action : « " + esc(o.prochaineAction) + " »<br />Échéance actuelle : " + esc(P.dateCourte(o.dateProchaineAction)) + "</p>" +
      '<label class="form-label" for="ia-date">Nouvelle échéance <span class="pr-requis">*</span></label><input type="date" class="form-control" id="ia-date" min="' + esc(P.aujourdhuiChamp()) + '" value="' + esc(P.versChampDate(demain)) + '" />' +
      '<div class="invalid-feedback">Choisissez aujourd\'hui ou une date à venir, différente de l\'échéance actuelle.</div>' +
      '<p class="pr-note mt-2 mb-0">L\'action reste à faire, avec la même description : seule son échéance change. Le report est enregistré dans l\'historique du dossier.</p>',
      '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Annuler</button><button type="button" class="btn btn-primary" data-ia-valider>Reporter</button>');
  }
  function ouvrirIgnorer(id) {
    var a = I.action(id);
    courant = { type: "ignorer", id: id };
    fenetre("Ignorer l'action", "<p><strong>" + esc(a.regleLibelle) + "</strong> : " + esc(a.client) + "</p>" +
      '<label class="form-label" for="ia-motif-ignorer">Motif <span class="text-muted">(facultatif)</span></label><select class="form-select" id="ia-motif-ignorer"><option value="">Sans motif</option>' +
      Object.keys(ref.motifsIgnorer).map(function (k) { return '<option value="' + esc(k) + '">' + esc(ref.motifsIgnorer[k]) + "</option>"; }).join("") + "</select>" +
      '<p class="pr-note mt-2 mb-0">Une action ignorée ne réapparaît que si un nouvel événement crée une nouvelle situation.</p>',
      '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Annuler</button><button type="button" class="btn btn-primary" data-ia-valider>Ignorer</button>');
  }
  function ouvrirTransfert(id) {
    var a = I.action(id);
    courant = { type: "transferer", id: id };
    var collegues = P.conseillers().filter(function (c) { return c.id !== P.moiId; });
    fenetre("Confier l'action à un collègue", "<p><strong>" + esc(a.regleLibelle) + "</strong> : " + esc(a.client) + "</p>" +
      '<label class="form-label" for="ia-collegue">Collègue <span class="pr-requis">*</span></label><select class="form-select" id="ia-collegue">' +
      collegues.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.nom) + " (fictif)</option>"; }).join("") + "</select>" +
      '<label class="form-label mt-3" for="ia-motif-transfert">Motif <span class="pr-requis">*</span></label><select class="form-select" id="ia-motif-transfert">' +
      Object.keys(ref.motifsTransfert).map(function (k) { return '<option value="' + esc(k) + '">' + esc(ref.motifsTransfert[k]) + "</option>"; }).join("") + "</select>" +
      '<div class="ia-transfert-contexte mt-3"><strong>Contexte transmis</strong><p class="mb-1">' + esc(a.motif) + "</p>" + ((a.contexte || []).length ? "<ul>" + a.contexte.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") + "</div>" +
      '<p class="pr-note mt-2 mb-0">Prise en charge temporaire et tracée : le prospect reste attribué à ' + esc(I.ref.conseillerNom || "vous") + ". Aucune affectation ni autorisation serveur n'est modifiée.</p>",
      '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Annuler</button><button type="button" class="btn btn-primary" data-ia-valider>Confier</button>');
  }
  function ouvrirHistorique(id) {
    var a = I.action(id);
    courant = null;
    fenetre("Historique de l'action", "<p><strong>" + esc(a.regleLibelle) + "</strong> : " + esc(a.client) + " " + pastilleEtat(a.statut) + "</p>" +
      '<ol class="ia-historique">' + (a.historique || []).slice().reverse().map(function (h) {
        return "<li><time>" + esc(P.dateComplete(h.date)) + "</time><span>" + esc(h.texte) + ' <span class="pr-sous">· ' + esc(h.auteur) + (h.de && h.vers && h.de !== h.vers ? " · " + esc(ref.etatsAction[h.de] || h.de) + " → " + esc(ref.etatsAction[h.vers] || h.vers) : "") + "</span></span></li>";
      }).join("") + "</ol>");
  }

  // ---------- Éditeur de relance ----------
  function ouvrirRelance(id) {
    var ctx = I.contexteRelance(id);
    if (!ctx) return;
    var a = ctx.action;
    var suspension = I.suspensionContact(a.prospectId, a.opportuniteId, a.nature);
    courant = { type: "relance", id: id };
    var tons = ref.tons.map(function (t) { return '<option value="' + esc(t.cle) + '">' + esc(t.libelle) + "</option>"; }).join("");
    var demain = new Date(); demain.setDate(demain.getDate() + 2);
    fenetre("Préparer une relance : " + a.client,
      '<div class="ia-relance">' +
      '<section><h3 class="ia-sous-titre">Motif de la relance</h3><p class="mb-1"><strong>' + esc(a.regleLibelle) + "</strong> : " + esc(a.motif) + "</p>" +
      (a.avertissement ? '<p class="ia-avertissement">' + esc(a.avertissement) + "</p>" : "") +
      (suspension ? '<p class="ia-avertissement"><i class="bi bi-slash-circle me-1"></i>Contact suspendu : ' + esc(suspension) + "</p>" : "") + "</section>" +
      '<section><h3 class="ia-sous-titre">Informations utilisées</h3><dl class="ia-utilisees">' + ctx.utilisees.map(function (u) {
        return "<div><dt>" + esc(u.libelle) + "</dt><dd>" + (u.valeur ? esc(u.valeur) : '<span class="rv-a-verifier">Non disponible</span>') + "</dd></div>";
      }).join("") + "</dl>" + (ctx.aVerifier.length ? '<p class="pr-note mb-0">À vérifier avant d\'écrire : ' + esc(ctx.aVerifier.join(" · ")) + ".</p>" : "") + "</section>" +
      '<section><div class="row g-2 align-items-end"><div class="col-sm-6"><label class="form-label" for="ia-ton">Ton</label><select class="form-select form-select-sm" id="ia-ton">' + tons + "</select></div>" +
      '<div class="col-sm-6"><span class="form-label d-block">Canal envisagé</span><span class="ia-canal"><i class="bi bi-chat-left-text me-1"></i>' + esc(ctx.canal) + (ctx.coordonnee ? " · " + esc(ctx.coordonnee) : "") + "</span></div></div>" +
      '<label class="form-label mt-2" for="ia-texte">Brouillon (modifiable)</label><textarea class="form-control" id="ia-texte" rows="9">' + esc(I.brouillon(id, "professionnel")) + "</textarea>" +
      '<p class="pr-note mt-1 mb-0"><i class="bi bi-info-circle me-1"></i>Phineas n\'envoie rien. Copier le message ne l\'envoie pas ; vous le transmettez vous-même, puis vous pouvez déclarer le contact.</p></section>' +
      '<section class="ia-relance-suivi"><h3 class="ia-sous-titre">Programmer un suivi (local)</h3><div class="row g-2"><div class="col-sm-5"><input type="date" class="form-control form-control-sm" id="ia-suivi-date" min="' + esc(P.aujourdhuiChamp()) + '" value="' + esc(P.versChampDate(demain)) + '" aria-label="Date du suivi" /></div>' +
      '<div class="col-sm-7"><input class="form-control form-control-sm" id="ia-suivi-texte" maxlength="120" value="' + esc(a.actionProposee) + '" aria-label="Action de suivi" /></div></div>' +
      '<button type="button" class="btn btn-sm btn-outline-primary mt-2" data-ia-relance="suivi"><i class="bi bi-alarm me-1"></i>Programmer le suivi</button></section>' +
      "</div>",
      '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Fermer</button>' +
      '<button type="button" class="btn btn-outline-primary" data-ia-relance="copier"><i class="bi bi-clipboard me-1"></i>Copier le message</button>' +
      '<button type="button" class="btn btn-outline-primary" data-ia-relance="brouillon"><i class="bi bi-journal-text me-1"></i>Enregistrer dans l\'historique</button>' +
      '<button type="button" class="btn btn-primary" data-ia-relance="contact"' + (suspension ? " disabled" : "") + '><i class="bi bi-check2 me-1"></i>J\'ai contacté le client</button>');
  }

  function surChangeModale(e) {
    if (e.target.id === "ia-ton" && courant && courant.type === "relance") {
      modale.querySelector("#ia-texte").value = I.brouillon(courant.id, e.target.value);
    }
  }
  function surClicModale(e) {
    var b = e.target.closest("[data-ia-valider], [data-ia-relance]");
    if (!b || !courant) return;
    var id = courant.id;
    if (b.hasAttribute("data-ia-valider")) {
      if (courant.type === "reporter-suivi") {
        var champSuivi = modale.querySelector("#ia-date");
        var actuelle = P.versChampDate(P.opportunite(courant.oppId).dateProchaineAction);
        // Comparaison des jours au format AAAA-MM-JJ : aujourd'hui ou plus tard, et différent de l'échéance actuelle.
        var jourValide = champSuivi.value !== "" && champSuivi.value >= P.aujourdhuiChamp() && champSuivi.value !== actuelle;
        champSuivi.classList.toggle("is-invalid", !jourValide);
        if (!jourValide) return;
        b.disabled = true; // contre le double clic
        P.envoyerReport(courant.oppId, champSuivi.value, window.location.pathname + window.location.search);
      } else if (courant.type === "reporter") {
        var champ = modale.querySelector("#ia-date");
        var date = champ.value ? P.depuisChampDate(champ.value) : null;
        champ.classList.toggle("is-invalid", !date || date <= new Date());
        if (!date || date <= new Date()) return;
        fermer();
        notifier(I.reporter(id, date, modale.querySelector("#ia-motif").value.trim()), "Action reportée au " + P.dateCourte(date) + ".");
      } else if (courant.type === "ignorer") {
        var motif = modale.querySelector("#ia-motif-ignorer").value;
        fermer();
        notifier(I.ignorer(id, motif), "Action ignorée.");
      } else if (courant.type === "transferer") {
        var col = modale.querySelector("#ia-collegue").value;
        var mt = modale.querySelector("#ia-motif-transfert").value;
        fermer();
        notifier(I.transferer(id, col, mt), "Action confiée temporairement à " + P.conseiller(col).nom + ".");
      }
      return;
    }
    var quoi = b.dataset.iaRelance;
    var texte = modale.querySelector("#ia-texte").value;
    if (quoi === "copier") {
      var z = modale.querySelector("#ia-texte");
      z.select();
      try {
        if (navigator.clipboard) navigator.clipboard.writeText(texte); else document.execCommand("copy");
        P.notifier("Message copié. Rien n'a été envoyé.");
      } catch (err) { P.notifier("Copie impossible : sélectionnez le texte manuellement."); }
    } else if (quoi === "brouillon") {
      notifier(I.enregistrerBrouillon(id, texte), "Brouillon enregistré dans l'historique (non envoyé).", "Le brouillon est vide.");
    } else if (quoi === "contact") {
      var ctx = I.contexteRelance(id);
      var res = I.declarerContact(id, ctx.canalCle, "« " + texte.trim().split("\n").filter(Boolean).slice(1, 2).join(" ").slice(0, 120) + " »");
      fermer();
      notifier(res, "Contact déclaré et action marquée comme réalisée.", "Contact impossible : relance suspendue pour ce client.");
    } else if (quoi === "suivi") {
      var dch = modale.querySelector("#ia-suivi-date").value;
      var ok = I.programmerSuivi(id, dch ? P.depuisChampDate(dch) : null, modale.querySelector("#ia-suivi-texte").value);
      P.notifier(ok ? "Suivi programmé dans l'opportunité (local)." : "Indiquez une date et une action.");
    }
  }

  // Délégation : les boutons [data-ia] des cartes, sur n'importe quelle page.
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-ia]");
    if (!b || b.disabled) return;
    var id = b.dataset.id, quoi = b.dataset.ia;
    if (quoi === "relance") ouvrirRelance(id);
    else if (quoi === "reporter") ouvrirReport(id);
    else if (quoi === "ignorer") ouvrirIgnorer(id);
    else if (quoi === "transferer") ouvrirTransfert(id);
    else if (quoi === "historique") ouvrirHistorique(id);
    else if (quoi === "commencer") notifier(I.commencer(id), "Traitement commencé.");
    else if (quoi === "terminer") terminerAction(id, b);
    else if (quoi === "reactiver") notifier(I.reactiver(id), "Action remise dans la file.");
    else if (quoi === "reprendre-charge") notifier(I.reprendreEnCharge(id), "Vous reprenez l'action en charge.");
  });

  // ---------- Compatibilité ----------
  var ICONES_CRITERE = { satisfait: "bi-check-circle-fill", "non-satisfait": "bi-x-circle-fill", inconnu: "bi-question-circle", "non-applicable": "bi-dash-circle" };
  var LIBELLES_CRITERE = { satisfait: "Satisfait", "non-satisfait": "Non satisfait", inconnu: "Information inconnue", "non-applicable": "Non applicable" };
  var NIVEAUX = { compatible: "Compatible", partiel: "Partiellement compatible", "a-verifier": "Compatibilité à vérifier", incompatible: "Critère indispensable non respecté" };
  function pastilleCompatibilite(r) {
    return '<span class="ia-compat ia-compat-' + esc(r.niveau) + '" title="Pourcentage des critères connus satisfaits (pondérés) : pas une probabilité d’achat.">' + esc(NIVEAUX[r.niveau]) +
      (r.score != null && r.niveau !== "a-verifier" ? " · " + r.score + " % des critères connus" : "") + "</span>";
  }
  function criteres(r) {
    return '<ul class="ia-criteres">' + r.items.map(function (i) {
      return '<li class="ia-cr-' + esc(i.statut) + '"><i class="bi ' + ICONES_CRITERE[i.statut] + '" aria-hidden="true"></i><span><span class="visually-hidden">' + LIBELLES_CRITERE[i.statut] + " : </span><strong>" + esc(i.libelle) + "</strong>" +
        (i.indispensable ? ' <span class="ia-indisp">indispensable</span>' : "") + '<span class="pr-sous d-block">' + esc(i.detail) + "</span></span></li>";
    }).join("") + "</ul>" +
      '<p class="ia-couverture"><span>Couverture des informations : <strong>' + r.couverture + " %</strong></span>" + (r.score == null ? ' <span class="rv-a-verifier">Trop peu de critères connus pour un pourcentage fiable.</span>' : "") + "</p>";
  }

  // ---------- Pagination des listes (Centre d'actions, Recommandations véhicules) ----------
  // Numéros affichés : toutes les pages jusqu'à 7, sinon la première, la dernière et les voisines de la page courante.
  // Un null marque un trou entre deux numéros (affiché « … »). Exemple pour 10 pages, page 5 : 1 … 4 5 6 … 10.
  // Même règle que la liste des prospects (prospects-liste.js).
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

  // Page à afficher : la page demandée, ramenée entre 1 et la dernière page (la liste a pu raccourcir).
  function pageValide(pageDemandee, total, parPage) {
    var nbPages = Math.max(1, Math.ceil(total / parPage));
    return Math.min(Math.max(1, pageDemandee || 1), nbPages);
  }

  function boutonPage(idListe, numero, libelle, contenu, desactive, courant) {
    var classe = "iv-page-btn";
    if (courant) classe += " is-active";
    return '<button type="button" class="' + classe + '" data-liste="' + idListe + '" data-aller-page="' + numero + '"' +
      (desactive ? " disabled" : "") + (courant ? ' aria-current="page"' : "") + ' aria-label="' + libelle + '">' + contenu + "</button>";
  }

  // Barre de pagination d'une liste (« 1 à 6 sur 14 », flèches, numéros), ou "" si tout tient sur une page.
  // Chaque bouton porte data-liste (id de la liste) et data-aller-page (numéro) : la page gère le clic.
  function htmlPagination(idListe, total, page, parPage) {
    var nbPages = Math.ceil(total / parPage);
    if (nbPages <= 1) return "";
    var debut = (page - 1) * parPage + 1;
    var fin = Math.min(total, page * parPage);
    var html = '<nav class="iv-pagination" aria-label="Pagination">' +
      '<span class="iv-pages-info">' + debut + " à " + fin + " sur " + total + "</span>" +
      '<div class="iv-pages">' +
      boutonPage(idListe, page - 1, "Page précédente", '<i class="bi bi-chevron-left"></i>', page === 1, false);
    numerosPages(nbPages, page).forEach(function (numero) {
      if (numero === null) html += '<span class="iv-pages-trou" aria-hidden="true">…</span>';
      else html += boutonPage(idListe, numero, "Page " + numero, String(numero), false, numero === page);
    });
    html += boutonPage(idListe, page + 1, "Page suivante", '<i class="bi bi-chevron-right"></i>', page === nbPages, false) +
      "</div></nav>";
    return html;
  }

  // Suivi planifié et enregistré en base (règle « suivi-echeance », opportunité « oe-… ») : réalisation réelle
  // côté serveur, puis retour à cette page. Toute autre action reste une réalisation locale de démonstration.
  function terminerAction(id, bouton) {
    var x = I.action(id);
    if (x && x.regle === "suivi-echeance" && P.estEnregistree(x.opportuniteId)) {
      bouton.disabled = true; // contre le double clic
      P.envoyerRealisation(x.opportuniteId, window.location.pathname + window.location.search);
      return;
    }
    notifier(I.terminer(id), "Action marquée comme réalisée.");
  }

  // Message du serveur après une réalisation (ou toute autre écriture) : affiché une seule fois par page.
  P.afficherMessageServeur();

  window.IntelligenceUI = {
    pageValide: pageValide,
    htmlPagination: htmlPagination,
    carte: carte,
    ligne: ligne,
    pastillePriorite: pastillePriorite,
    pastilleEtat: pastilleEtat,
    pastilleCompatibilite: pastilleCompatibilite,
    criteres: criteres,
    niveauxCompatibilite: NIVEAUX,
    echeanceTexte: echeanceTexte,
    fenetre: fenetre,
    ouvrirRelance: ouvrirRelance,
    reporterSuivi: ouvrirReportSuivi,
    categories: CAT,
  };
})();
