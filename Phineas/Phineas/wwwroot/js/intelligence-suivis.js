// « Mes suivis » (Smart Follow-up Engine) : relances recommandées avec leur contexte, relances suspendues
// et préférences de contact déclarées par le conseiller. Les recommandations viennent du store.
(function () {
  "use strict";

  var I = window.Intelligence, P = window.Prospects, UI = window.IntelligenceUI;
  var racine = document.getElementById("suivis");
  if (!I || !P || !UI || !racine) return;
  var esc = P.esc;

  function rendre() {
    var l = I.actives({ conseiller: P.moiId }).filter(function (a) { return a.relance; });
    document.getElementById("relances").innerHTML = l.map(function (a) {
      var ctx = I.contexteRelance(a.id);
      var d = ctx.derniere;
      var o = ctx.opportunite;
      return '<tr data-action-id="' + esc(a.id) + '">' +
        '<td data-label="Client"><a class="pr-nom" href="' + esc(P.urlFiche(a.prospectId)) + '">' + esc(a.client) + "</a>" + (a.vehicule ? '<span class="pr-sous d-block">' + esc(a.vehicule) + "</span>" : "") + UI.pastillePriorite(a.priorite) + "</td>" +
        '<td data-label="Pourquoi"><strong>' + esc(a.regleLibelle) + "</strong><span class=\"d-block small\">" + esc(a.motif) + "</span>" +
        (a.avertissement ? '<span class="ia-avertissement d-block">' + esc(a.avertissement) + "</span>" : "") + "</td>" +
        '<td data-label="Dernier contact">' + (d ? esc(P.relatif(d.date)) + '<span class="pr-sous d-block">' + esc(d.resume) + "</span>" : '<span class="text-muted">Aucun échange enregistré</span>') + "</td>" +
        '<td data-label="Canal préféré">' + esc(ctx.canal) + (ctx.coordonnee ? '<span class="pr-sous d-block">' + esc(ctx.coordonnee) + "</span>" : "") + "</td>" +
        '<td data-label="Prochaine action">' + esc(a.actionProposee) + '<span class="pr-sous d-block">' + esc(UI.echeanceTexte(a.echeance)) + (o && o.prochaineAction ? " · prévu : " + esc(o.prochaineAction) : "") + "</span></td>" +
        '<td data-label="Actions" class="ia-cellule-actions"><button type="button" class="btn btn-sm btn-primary" data-ia="relance" data-id="' + esc(a.id) + '">Préparer la relance</button>' +
        '<button type="button" class="btn btn-sm btn-ghost" data-preferences="' + esc(a.prospectId) + '" data-opp="' + esc(a.opportuniteId) + '">Préférences</button></td></tr>';
    }).join("");
    document.getElementById("relances-vide").hidden = l.length > 0;
    racine.querySelector('[data-champ="nb-relances"]').textContent = String(l.length);

    var s = I.suspendues().filter(function (a) { return a.conseillerId === P.moiId; });
    document.getElementById("suspendues").innerHTML = s.length ? s.map(function (a) {
      return '<li><span class="ia-suspendue-icone"><i class="bi bi-pause-circle" aria-hidden="true"></i></span><div><strong>' + esc(a.client) + "</strong> — " + esc(a.regleLibelle) +
        '<span class="d-block small">' + esc(a.raisonSuspension) + '</span><span class="pr-sous d-block">Situation détectée : ' + esc(a.motif) + "</span></div>" +
        '<button type="button" class="btn btn-sm btn-ghost" data-preferences="' + esc(a.prospectId) + '" data-opp="' + esc(a.opportuniteId) + '">Préférences</button></li>';
    }).join("") : '<li class="sv-empty"><span>Aucune relance suspendue.</span></li>';
    racine.querySelector('[data-champ="nb-suspendues"]').textContent = String(s.length);
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
    UI.fenetre("Préférences de contact — " + c.prenom + " " + c.nom,
      '<p class="small">Moyen préféré : <strong>' + esc(P.libelle("moyensContact", c.contactPrefere) || "non précisé") + "</strong>" + (c.momentContact ? ", " + esc((P.libelle("momentsContact", c.momentContact) || "").toLowerCase()) : "") + ".</p>" +
      '<label class="form-label" for="pf-consentement">Consentement aux communications commerciales</label><select class="form-select" id="pf-consentement">' +
      Object.keys(I.ref.consentements).map(function (k) { return '<option value="' + esc(k) + '"' + (pref.consentement === k ? " selected" : "") + ">" + esc(I.ref.consentements[k]) + "</option>"; }).join("") + "</select>" +
      '<div class="form-check mt-3"><input class="form-check-input" type="checkbox" id="pf-arret"' + (pref.nePlusContacter ? " checked" : "") + ' /><label class="form-check-label" for="pf-arret">Le client a demandé à ne plus être sollicité</label></div>' +
      (o ? '<hr /><p class="mb-1"><strong>Pause du suivi</strong> — ' + esc(o.titre) + "</p>" + (pause ? '<p class="small">En pause jusqu\'au ' + esc(P.dateCourte(pause.jusqua)) + " : " + esc(pause.motif) + ' <button type="button" class="btn btn-sm btn-link p-0" data-pref="lever">Lever la pause</button></p>' : "") +
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

  I.abonner(rendre);
  rendre();
})();
