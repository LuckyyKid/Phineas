// « Mes suivis » (Views/Intelligence/Suivis.cshtml, maquette 06) : vue « À traiter » (relances recommandées avec leur
// contexte), vue « À venir » (suivis enregistrés planifiés après aujourd'hui), relances suspendues et préférences de
// contact déclarées par le conseiller. Les recommandations viennent du store ; les suivis à venir, du serveur.
(function () {
  "use strict";

  var I = window.Intelligence, P = window.Prospects, UI = window.IntelligenceUI, Regles = window.IntelligenceRegles;
  var racine = document.getElementById("suivis");
  if (!I || !P || !UI || !Regles || !racine) return;
  var esc = P.esc;

  // Au-delà de LIGNES_PAR_PAGE, les listes (relances, relances suspendues) se découpent en pages.
  var LIGNES_PAR_PAGE = 6;
  // Page affichée de chaque liste, rangée par id de liste (ex. pages.relances = 2). Absente = page 1.
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

  // ---------- Vue « À venir » ----------
  // Données : <script id="suivis-planifies"> (IntelligenceController.Suivis → ServiceProspects.SuivisPlanifiesAsync),
  // déjà triées par date prévue puis par opportunité. Classement avec le jour civil du navigateur, la même convention
  // que la règle « suivi-echeance » de « À traiter » : aujourd'hui ou avant = « À traiter », après aujourd'hui = « À venir ».
  var suivisPlanifies = lireSuivisPlanifies();

  function lireSuivisPlanifies() {
    var element = document.getElementById("suivis-planifies");
    if (!element) return [];
    try {
      return JSON.parse(element.textContent) || [];
    } catch (erreur) {
      return [];
    }
  }

  function suivisAVenir() {
    return suivisPlanifies.filter(function (s) { return P.ecartJours(s.datePrevue) > 0; });
  }

  var fmtJourLong = new Intl.DateTimeFormat("fr-CA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  // « Demain », « Dans 4 jours ».
  function dansCombien(d) {
    var jours = P.ecartJours(d);
    return jours === 1 ? "Demain" : "Dans " + jours + " jours";
  }

  // Une ligne par opportunité : client (lien vers la fiche), opportunité, action, date prévue, actions existantes.
  function ligneAVenir(s) {
    return '<tr data-suivi="' + esc(s.opportuniteId) + '">' +
      '<td><a class="iv-nom" href="' + esc(P.urlFiche(s.prospectId)) + '">' + esc(s.client) + "</a></td>" +
      "<td>" + esc(s.opportunite) + "</td>" +
      "<td>" + esc(s.action) + "</td>" +
      "<td>" + esc(fmtJourLong.format(new Date(s.datePrevue))) + '<span class="iv-sous">' + esc(dansCombien(s.datePrevue)) + "</span></td>" +
      '<td><span class="iv-cellule-boutons">' +
      '<button type="button" class="iv-btn iv-btn-discret" data-realiser-suivi="' + esc(s.opportuniteId) + '"><i class="bi bi-check2" aria-hidden="true"></i>Marquer comme réalisé</button>' +
      '<button type="button" class="iv-btn iv-btn-discret" data-reporter-suivi="' + esc(s.opportuniteId) + '"><i class="bi bi-clock" aria-hidden="true"></i>Reporter</button>' +
      "</span></td></tr>";
  }

  function rendreAVenir() {
    var liste = suivisAVenir();
    var page = paginer("a-venir", liste);
    document.getElementById("a-venir").innerHTML = page.elements.map(ligneAVenir).join("");
    racine.querySelector('[data-zone="pagination-a-venir"]').innerHTML = page.pagination;
    racine.querySelector('[data-zone="tableau-a-venir"]').hidden = liste.length === 0;
    document.getElementById("a-venir-vide").hidden = liste.length > 0;
    racine.querySelector('[data-champ="nb-a-venir"]').textContent = String(liste.length);
  }

  // Icône du canal préféré (clés de ReferentielsProspects.MoyensContact).
  var ICONES_CANAL = { courriel: "bi-envelope", texto: "bi-chat-dots", telephone: "bi-telephone" };

  // Une ligne par obligation (IntelligenceRegles.regrouperObligations) : la raison principale donne le client, la
  // priorité, le contact et « Préparer le message » ; toutes les raisons restent listées dans « Pourquoi », avec leur
  // échéance quand elles sont plusieurs. L'échéance affichée est la plus proche de toutes les raisons.
  function ligneRelance(g) {
    var a = g.principale;
    var ctx = I.contexteRelance(a.id);
    var derniere = ctx.derniere;
    var o = ctx.opportunite;
    var icone = ICONES_CANAL[ctx.canalCle] || "bi-chat-left-text";

    var client = '<a class="iv-nom" href="' + esc(P.urlFiche(a.prospectId)) + '">' + esc(a.client) + "</a>";
    if (a.vehicule) client += '<span class="iv-sous">' + esc(a.vehicule) + "</span>";
    client += '<span class="iv-sous">Priorité : ' + esc(I.ref.libellesPriorite[g.priorite] || g.priorite) + "</span>";

    var raison = g.raisons.map(function (r, i) {
      var texte = '<span class="d-block' + (i > 0 ? " mt-2" : "") + '" data-raison="' + esc(r.regle) + '">' + esc(r.regleLibelle);
      texte += '<span class="iv-sous">' + esc(r.motif) + (g.regroupee ? " · " + esc(UI.echeanceTexte(r.echeance)) : "") + "</span>";
      if (r.avertissement) texte += '<span class="iv-sous iv-a-verifier">' + esc(r.avertissement) + "</span>";
      return texte + "</span>";
    }).join("");
    if (g.regroupee) raison += '<span class="iv-sous mt-2">Même prise de contact : ' + g.raisons.length + " raisons, une seule action.</span>";

    // Dernier contact déclaré avec le client (intelligence-store.js, contexteRelance) : jamais une note interne.
    var contact = '<span class="iv-gris">Aucun contact déclaré</span>';
    if (derniere) contact = '<span class="iv-gris">' + esc(P.relatif(derniere.date)) + '</span><span class="iv-sous">' + esc(derniere.resume) + "</span>";

    var canal = '<span class="iv-canal"><i class="bi ' + icone + '" aria-hidden="true"></i>' + esc(ctx.canal) + "</span>";
    if (ctx.coordonnee) canal += '<span class="iv-sous">' + esc(ctx.coordonnee) + "</span>";

    var prevu = a.actionProposee + " · " + UI.echeanceTexte(g.echeance);
    if (o && o.prochaineAction) prevu += " · prévu : " + o.prochaineAction;
    // Suivi planifié et enregistré en base parmi les raisons : il peut être marqué comme réalisé ou reporté (écritures
    // serveur réelles, sur ce suivi seulement). « Reporter » ouvre la fenêtre de intelligence-composants.js (ouvrirReport).
    var suivi = g.raisons.filter(function (r) { return r.regle === "suivi-echeance" && P.estEnregistree(r.opportuniteId); })[0];
    var realiser = suivi
      ? '<button type="button" class="iv-btn iv-btn-discret" data-realiser-suivi="' + esc(suivi.opportuniteId) + '"><i class="bi bi-check2" aria-hidden="true"></i>Marquer comme réalisé</button>' +
        '<button type="button" class="iv-btn iv-btn-discret" data-ia="reporter" data-id="' + esc(suivi.id) + '"><i class="bi bi-clock" aria-hidden="true"></i>Reporter</button>'
      : "";
    // Préférences et pause : locales, donc réservées aux dossiers de démonstration (fonctionnalité 15). Sur un dossier
    // réel, elles ne suspendraient plus rien : le bouton n'est pas proposé.
    var preferences = window.IntelligenceRegles.estDossierReel(a) ? "" :
      '<button type="button" class="iv-btn iv-btn-discret" data-preferences="' + esc(a.prospectId) + '" data-opp="' + esc(a.opportuniteId) + '">Préférences</button>';
    var prochaine = '<span class="iv-cellule-boutons">' + realiser + preferences +
      '<button type="button" class="iv-btn iv-btn-sapin iv-btn-petit" data-ia="relance" data-id="' + esc(a.id) + '">Préparer le message</button></span>' +
      '<span class="iv-sous">' + esc(prevu) + "</span>";

    return '<tr data-action-id="' + esc(a.id) + '" data-obligation="' + esc(g.id) + '" data-nb-raisons="' + g.raisons.length + '">' +
      "<td>" + client + "</td><td>" + raison + "</td><td>" + contact + "</td><td>" + canal + "</td><td>" + prochaine + "</td></tr>";
  }

  // Date affichée à droite d'une relance suspendue : début de la pause si le suivi est en pause, sinon détection.
  function dateSuspension(a) {
    var pause = a.opportuniteId ? I.pause(a.opportuniteId) : null;
    if (pause && pause.depuis) return "Depuis le " + P.dateCourte(pause.depuis);
    if (a.detecteLe) return "Détectée " + P.relatif(a.detecteLe);
    return "";
  }

  function ligneSuspendue(a) {
    return '<li><i class="bi bi-pause-circle" aria-hidden="true"></i>' +
      '<div class="iv-suspendues-texte"><strong>' + esc(a.client) + "</strong>" +
      "<span>" + esc(a.raisonSuspension) + "</span>" +
      '<span class="iv-sous">' + esc(a.regleLibelle) + " · situation détectée : " + esc(a.motif) + "</span></div>" +
      '<span class="iv-suspendues-date">' + esc(dateSuspension(a)) + "</span>" +
      '<button type="button" class="iv-btn iv-btn-discret" data-preferences="' + esc(a.prospectId) + '" data-opp="' + esc(a.opportuniteId) + '">Préférences</button></li>';
  }

  function rendre() {
    // Une obligation par ligne : les recommandations qui expriment la même prise de contact sont regroupées
    // (le compteur et la pagination portent sur les obligations, pas sur les recommandations).
    var relances = Regles.regrouperObligations(I.actives({ conseiller: P.moiId }).filter(function (a) { return a.relance; }));
    var pageRelances = paginer("relances", relances);
    document.getElementById("relances").innerHTML = pageRelances.elements.map(ligneRelance).join("");
    racine.querySelector('[data-zone="pagination-relances"]').innerHTML = pageRelances.pagination;
    // Pas de tableau avec seulement ses en-têtes : on affiche l'état vide à sa place.
    racine.querySelector('[data-zone="tableau-relances"]').hidden = relances.length === 0;
    document.getElementById("relances-vide").hidden = relances.length > 0;
    racine.querySelector('[data-champ="nb-relances"]').textContent = String(relances.length);

    var suspendues = I.suspendues().filter(function (a) { return a.conseillerId === P.moiId; });
    var pageSuspendues = paginer("suspendues", suspendues);
    document.getElementById("suspendues").innerHTML = suspendues.length
      ? pageSuspendues.elements.map(ligneSuspendue).join("")
      : '<li><span class="iv-gris">Aucune relance suspendue.</span></li>';
    racine.querySelector('[data-zone="pagination-suspendues"]').innerHTML = pageSuspendues.pagination;
    racine.querySelector('[data-champ="nb-suspendues"]').textContent = String(suspendues.length);

    rendreAVenir();
  }

  // Préférences de contact : déclarées par le conseiller (ce que le client a demandé), jamais déduites.
  var courant = null;
  function ouvrirPreferences(pid, oppId) {
    var c = P.contact(pid);
    var pref = I.preferences(pid) || { consentement: "inconnu", nePlusContacter: false };
    var pause = oppId ? I.pause(oppId) : null;
    var o = oppId ? P.opportunite(oppId) : null;
    courant = { pid: pid, oppId: oppId };
    var demain = new Date(); demain.setDate(demain.getDate() + 7);
    UI.fenetre("Préférences de contact : " + c.prenom + " " + c.nom,
      '<p class="small">Moyen préféré : <strong>' + esc(P.libelle("moyensContact", c.contactPrefere) || "non précisé") + "</strong>" + (c.momentContact ? ", " + esc((P.libelle("momentsContact", c.momentContact) || "").toLowerCase()) : "") + ".</p>" +
      '<label class="form-label" for="pf-consentement">Consentement aux communications commerciales</label><select class="form-select" id="pf-consentement">' +
      Object.keys(I.ref.consentements).map(function (k) { return '<option value="' + esc(k) + '"' + (pref.consentement === k ? " selected" : "") + ">" + esc(I.ref.consentements[k]) + "</option>"; }).join("") + "</select>" +
      '<div class="form-check mt-3"><input class="form-check-input" type="checkbox" id="pf-arret"' + (pref.nePlusContacter ? " checked" : "") + ' /><label class="form-check-label" for="pf-arret">Le client a demandé à ne plus être sollicité</label></div>' +
      (o ? '<hr /><p class="mb-1"><strong>Pause du suivi</strong> : ' + esc(o.titre) + "</p>" + (pause ? '<p class="small">En pause jusqu\'au ' + esc(P.dateCourte(pause.jusqua)) + " : " + esc(pause.motif) + ' <button type="button" class="btn btn-sm btn-link p-0" data-pref="lever">Lever la pause</button></p>' : "") +
        '<div class="row g-2"><div class="col-sm-5"><label class="form-label" for="pf-jusqua">Reprendre le</label><input type="date" class="form-control" id="pf-jusqua" min="' + esc(P.aujourdhuiChamp()) + '" value="' + esc(P.versChampDate(demain)) + '" /></div>' +
        '<div class="col-sm-7"><label class="form-label" for="pf-motif">Motif</label><input class="form-control" id="pf-motif" maxlength="120" placeholder="Ex. : achat reporté au printemps" /></div></div>' +
        '<button type="button" class="btn btn-sm btn-outline-primary mt-2" data-pref="pause">Mettre le suivi en pause</button>' : "") +
      '<p class="pr-note mt-3 mb-0">Ces préférences sont locales à la démonstration et devront être validées juridiquement avant tout usage réel.</p>',
      '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Fermer</button><button type="button" class="btn btn-primary" data-pref="enregistrer">Enregistrer</button>');
  }
  // « Marquer comme réalisé » : le serveur archive le suivi, puis cette page se recharge avec un message,
  // dans la même vue (l'adresse garde ?vue=a-venir).
  racine.addEventListener("click", function (e) {
    var bouton = e.target.closest("[data-realiser-suivi]");
    if (!bouton || bouton.disabled) return;
    bouton.disabled = true; // contre le double clic
    P.envoyerRealisation(bouton.dataset.realiserSuivi, window.location.pathname + window.location.search);
  });

  // « Reporter » d'un suivi à venir : même fenêtre et même envoi que dans « À traiter » (intelligence-composants.js).
  racine.addEventListener("click", function (e) {
    var bouton = e.target.closest("[data-reporter-suivi]");
    if (!bouton) return;
    var suivi = suivisPlanifies.find(function (s) { return s.opportuniteId === bouton.dataset.reporterSuivi; });
    if (suivi) UI.reporterSuivi(suivi.opportuniteId, suivi.opportunite, suivi.client);
  });

  // Vue affichée : gardée dans l'adresse pour revenir au même endroit après une action ou une actualisation.
  // La pastille « Délais : règles de démonstration » ne concerne que « À traiter ».
  var ongletAVenir = document.getElementById("onglet-a-venir");
  var pastilleATraiter = racine.querySelector("[data-pastille-a-traiter]");
  racine.querySelectorAll('[data-bs-toggle="tab"]').forEach(function (onglet) {
    onglet.addEventListener("shown.bs.tab", function () {
      var aVenir = onglet === ongletAVenir;
      pastilleATraiter.hidden = aVenir;
      history.replaceState(null, "", window.location.pathname + (aVenir ? "?vue=a-venir" : ""));
    });
  });
  if (new URLSearchParams(window.location.search).get("vue") === "a-venir" && window.bootstrap) {
    bootstrap.Tab.getOrCreateInstance(ongletAVenir).show();
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-preferences]");
    if (b) { ouvrirPreferences(b.dataset.preferences, b.dataset.opp || null); return; }
    var p = e.target.closest("[data-pref]");
    if (!p || !courant) return;
    var m = document.getElementById("ia-modale");
    if (p.dataset.pref === "enregistrer") {
      I.definirPreferences(courant.pid, { consentement: m.querySelector("#pf-consentement").value, nePlusContacter: m.querySelector("#pf-arret").checked });
      P.notifier("Préférences de contact enregistrées (local).");
      if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(m).hide();
    } else if (p.dataset.pref === "pause") {
      var v = m.querySelector("#pf-jusqua").value;
      var ok = I.mettreEnPause(courant.oppId, v ? P.depuisChampDate(v) : null, m.querySelector("#pf-motif").value.trim());
      P.notifier(ok ? "Suivi mis en pause." : "Choisissez une date à venir.");
      if (ok && window.bootstrap) bootstrap.Modal.getOrCreateInstance(m).hide();
    } else if (p.dataset.pref === "lever") {
      I.leverPause(courant.oppId);
      P.notifier("Pause levée.");
      if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(m).hide();
    }
  });

  // Clic sur un bouton de pagination : change de page et garde le focus sur le numéro choisi.
  racine.addEventListener("click", function (e) {
    var bouton = e.target.closest("[data-aller-page]");
    if (!bouton || bouton.disabled) return;
    var idListe = bouton.dataset.liste;
    pages[idListe] = Number(bouton.dataset.allerPage);
    rendre();
    var pageCourante = racine.querySelector('[data-liste="' + idListe + '"][aria-current="page"]');
    if (pageCourante) pageCourante.focus();
  });

  I.abonner(rendre);
  rendre();
  P.afficherMessageServeur();
})();
