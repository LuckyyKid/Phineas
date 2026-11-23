// « Mes suivis » (Views/Intelligence/Suivis.cshtml, maquette 06) : relances recommandées avec leur contexte,
// relances suspendues et préférences de contact déclarées par le conseiller. Les recommandations viennent du store.
(function () {
  "use strict";

  var I = window.Intelligence, P = window.Prospects, UI = window.IntelligenceUI;
  var racine = document.getElementById("suivis");
  if (!I || !P || !UI || !racine) return;
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

  // Icône du canal préféré (clés de ReferentielsProspects.MoyensContact).
  var ICONES_CANAL = { courriel: "bi-envelope", texto: "bi-chat-dots", telephone: "bi-telephone" };

  function ligneRelance(a) {
    var ctx = I.contexteRelance(a.id);
    var derniere = ctx.derniere;
    var o = ctx.opportunite;
    var icone = ICONES_CANAL[ctx.canalCle] || "bi-chat-left-text";

    var client = '<a class="iv-nom" href="' + esc(P.urlFiche(a.prospectId)) + '">' + esc(a.client) + "</a>";
    if (a.vehicule) client += '<span class="iv-sous">' + esc(a.vehicule) + "</span>";
    client += '<span class="iv-sous">Priorité : ' + esc(I.ref.libellesPriorite[a.priorite] || a.priorite) + "</span>";

    var raison = esc(a.regleLibelle) + '<span class="iv-sous">' + esc(a.motif) + "</span>";
    if (a.avertissement) raison += '<span class="iv-sous iv-a-verifier">' + esc(a.avertissement) + "</span>";

    var contact = '<span class="iv-gris">Aucun échange enregistré</span>';
    if (derniere) contact = '<span class="iv-gris">' + esc(P.relatif(derniere.date)) + '</span><span class="iv-sous">' + esc(derniere.resume) + "</span>";

    var canal = '<span class="iv-canal"><i class="bi ' + icone + '" aria-hidden="true"></i>' + esc(ctx.canal) + "</span>";
    if (ctx.coordonnee) canal += '<span class="iv-sous">' + esc(ctx.coordonnee) + "</span>";

    var prevu = a.actionProposee + " · " + UI.echeanceTexte(a.echeance);
    if (o && o.prochaineAction) prevu += " · prévu : " + o.prochaineAction;
    var prochaine = '<span class="iv-cellule-boutons">' +
      '<button type="button" class="iv-btn iv-btn-discret" data-preferences="' + esc(a.prospectId) + '" data-opp="' + esc(a.opportuniteId) + '">Préférences</button>' +
      '<button type="button" class="iv-btn iv-btn-sapin iv-btn-petit" data-ia="relance" data-id="' + esc(a.id) + '">Préparer le message</button></span>' +
      '<span class="iv-sous">' + esc(prevu) + "</span>";

    return '<tr data-action-id="' + esc(a.id) + '">' +
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
    var relances = I.actives({ conseiller: P.moiId }).filter(function (a) { return a.relance; });
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
})();
