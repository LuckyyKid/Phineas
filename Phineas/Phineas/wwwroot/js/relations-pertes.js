// Page « Ventes perdues » : liste filtrable et fiche d'analyse d'une vente perdue.
// Les indicateurs sont calculés à partir des clôtures enregistrées ; aucune statistique codée à la main.
(function () {
  "use strict";

  var RC = window.RelationsClients, P = window.Prospects, I = window.Intelligence, UI = window.IntelligenceUI, RUI = window.RelationsUI;
  var racine = document.getElementById("pertes");
  if (!RC || !P || !UI || !RUI || !racine) return;
  var esc = P.esc, ref = RC.ref;
  var oppId = racine.dataset.opportunite || null;
  var JOUR = 86400000;

  function champ(id) { return document.getElementById(id); }
  var F = ["f-recherche", "f-periode", "f-motif", "f-origine", "f-vehicule", "f-conseiller", "f-recuperable", "f-reactivees", "f-manquantes"];
  function valeur(id) { var e = champ(id); return e.type === "checkbox" ? e.checked : e.value; }
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }

  function filtrer(l) {
    var q = norm(valeur("f-recherche")), per = Number(valeur("f-periode")) || 0, m = new Date();
    return l.filter(function (x) {
      var cl = x.cloture;
      if (q && norm(x.client + " " + x.opportunite.titre + " " + x.vehicule).indexOf(q) < 0) return false;
      if (per && (m - new Date(cl.date)) / JOUR > per) return false;
      if (valeur("f-motif") && cl.motif !== valeur("f-motif")) return false;
      if (valeur("f-origine") && cl.origine !== valeur("f-origine")) return false;
      if (valeur("f-vehicule") && x.vehicule !== valeur("f-vehicule")) return false;
      if (valeur("f-conseiller") && x.conseillerId !== valeur("f-conseiller")) return false;
      if (valeur("f-recuperable") === "oui" && !x.recuperable) return false;
      if (valeur("f-recuperable") === "non" && x.etat.cle !== "aucune") return false;
      if (valeur("f-reactivees") && !x.reactivee) return false;
      if (valeur("f-manquantes") && !x.informationsManquantes.length) return false;
      return true;
    });
  }
  function filtresActifs() {
    return F.some(function (id) { return id !== "f-conseiller" && valeur(id); }) || valeur("f-conseiller") !== P.moiId;
  }

  function ligne(x) {
    var cl = x.cloture, a = x.prochaineAction;
    return '<tr data-opp="' + esc(x.opportunite.id) + '">' +
      '<td data-label="Client et opportunité"><a class="pr-nom" href="' + esc(RC.urlAnalyse(x.opportunite.id)) + '">' + esc(x.client) + '</a><span class="pr-sous d-block">' + esc(x.opportunite.titre) + "</span>" +
      '<span class="pr-sous d-block">Conseiller : ' + esc(x.conseillerId === P.moiId ? "Vous" : x.conseiller + " (fictif)") + "</span></td>" +
      '<td data-label="Véhicule recherché">' + esc(x.vehicule) + (x.soumission ? '<span class="pr-sous d-block">' + esc(x.soumission.reference + " v" + x.soumission.numero + " · " + x.soumission.statutLibelle.toLowerCase()) + "</span>" : '<span class="pr-sous d-block">Aucune soumission</span>') + "</td>" +
      '<td data-label="Clôture">' + esc(P.dateCourte(cl.date)) + '<span class="pr-sous d-block">Étape : ' + esc(P.libelleEtape(cl.etapeAtteinte)) + "</span></td>" +
      '<td data-label="Motif de perte"><span class="rc-motif">' + esc(ref.motifsPerte[cl.motif]) + "</span>" + RUI.pastilleOrigine(cl.origine) + "</td>" +
      '<td data-label="Récupération">' + RUI.pastilleRecuperation(x.etat) + (x.informationsManquantes.length ? '<span class="pr-sous d-block"><i class="bi bi-exclamation-circle me-1" aria-hidden="true"></i>' + esc(x.informationsManquantes.join(", ")) + "</span>" : "") + "</td>" +
      '<td data-label="Prochaine action">' + (a ? '<span class="rc-action">' + UI.pastillePriorite(a.priorite) + " " + esc(a.actionProposee) + "</span>" : '<span class="text-muted">Aucune</span>') + "</td></tr>";
  }

  function rendreListe() {
    var tout = RC.pertes();
    var mes = tout.filter(function (x) { return !valeur("f-conseiller") || x.conseillerId === valeur("f-conseiller"); });
    var k = RC.compteursPertes(mes);
    Object.keys(k).forEach(function (c) { var e = racine.querySelector('[data-compteur="' + c + '"]'); if (e) e.textContent = String(k[c]); });
    racine.querySelector('[data-detail="hypotheses"]').textContent = "confirmés" + (k.hypotheses ? " · " + k.hypotheses + " hypothèse(s) à part" : "");
    // Liste des véhicules recherchés (filtre), recalculée à partir des données.
    var sel = champ("f-vehicule"), choisi = sel.value;
    var vehicules = tout.map(function (x) { return x.vehicule; }).filter(function (v, i, t) { return v && t.indexOf(v) === i; }).sort();
    sel.innerHTML = '<option value="">Tous les véhicules</option>' + vehicules.map(function (v) { return '<option value="' + esc(v) + '"' + (v === choisi ? " selected" : "") + ">" + esc(v) + "</option>"; }).join("");
    var l = filtrer(tout);
    champ("liste-corps").innerHTML = l.map(ligne).join("");
    champ("etat-vide").hidden = l.length > 0;
    racine.querySelector(".rc-table").hidden = !l.length;
    champ("resultat").textContent = l.length + " opportunité(s) perdue(s) ou réactivée(s)";
    racine.querySelectorAll("[data-effacer-filtres]").forEach(function (b) { if (b.classList.contains("pr-effacer")) b.hidden = !filtresActifs(); });
    var sans = RC.pertesSansCloture();
    racine.querySelector('[data-zone="sans-cloture"]').innerHTML = sans.length ? '<i class="bi bi-exclamation-circle me-1"></i>' + sans.length + " opportunité(s) marquée(s) « Perdu » sans clôture enregistrée : motif inconnu (" +
      esc(sans.map(function (o) { var c = P.contact(o.prospectId); return c ? c.prenom + " " + c.nom : o.titre; }).join(", ")) + ")." : "";
  }

  // ---------- Fiche d'analyse ----------
  function liste(titre, l, vide) {
    return '<section class="card rc-bloc"><div class="card-header sv-card-header"><span>' + titre + "</span></div><div class=\"card-body\">" +
      (l.length ? '<ul class="ia-liste-simple">' + l.join("") + "</ul>" : '<p class="text-muted small mb-0">' + esc(vide) + "</p>") + "</div></section>";
  }
  function rendreFiche() {
    var dsr = RC.dossierPerte(oppId);
    var zone = racine.querySelector('[data-zone="fiche"]');
    if (!dsr) {
      zone.innerHTML = '<div class="pr-etat-vide"><i class="bi bi-question-circle"></i><strong>Aucune clôture enregistrée</strong><span>Cette opportunité n\'a pas été clôturée comme perdue dans Phineas.</span></div>';
      return;
    }
    var cl = dsr.cloture, o = dsr.opportunite, c = dsr.contact, q = o.qualification || {}, an = dsr.analyse, e = dsr.etat;
    var actif = !cl.reactivation && o.etape === "Perdu";
    var boutons = actif ? [
      '<button type="button" class="btn btn-sm btn-outline-primary" data-rc="preciser" data-opp="' + esc(o.id) + '"><i class="bi bi-pencil me-1"></i>Préciser le motif</button>',
      '<button type="button" class="btn btn-sm btn-outline-primary" data-rc="suivi" data-opp="' + esc(o.id) + '"><i class="bi bi-calendar-check me-1"></i>Futur suivi</button>',
      e.cle !== "aucune" ? '<button type="button" class="btn btn-sm btn-outline-primary" data-rc="evenement" data-opp="' + esc(o.id) + '"><i class="bi bi-lightning me-1"></i>Déclarer un événement</button>' : "",
      dsr.refusReactivation ? "" : '<button type="button" class="btn btn-sm btn-primary" data-rc="reactiver" data-opp="' + esc(o.id) + '"><i class="bi bi-arrow-counterclockwise me-1"></i>Réactiver l\'opportunité</button>',
    ].join(" ") : "";
    var recommandees = I ? I.actives().filter(function (a) { return a.opportuniteId === o.id; }) : [];
    var html =
      '<header class="rc-fiche-tete"><div><h2 class="h4 mb-1"><a href="' + esc(P.urlFiche(c.id)) + '">' + esc(c.prenom + " " + c.nom) + "</a></h2>" +
      '<p class="text-muted mb-0">' + esc(o.titre) + " · " + esc(P.libelleEtape(o.etape)) + "</p></div>" + RUI.pastilleRecuperation(e) + "</header>" +
      '<div class="rc-grille">' +
      '<section class="card rc-bloc"><div class="card-header sv-card-header"><span><i class="bi bi-x-octagon me-2"></i>Motif de perte</span>' + RUI.pastilleOrigine(cl.origine) + '</div><div class="card-body">' +
      '<p class="rc-motif-grand">' + esc(ref.motifsPerte[cl.motif]) + "</p>" +
      (cl.origine === "hypothese" ? '<p class="ia-avertissement"><i class="bi bi-lightbulb me-1"></i>Hypothèse du conseiller : elle n\'est pas une raison confirmée.</p>' : "") +
      '<dl class="rc-def"><div><dt>Clôturée le</dt><dd>' + esc(P.dateComplete(cl.date)) + "</dd></div><div><dt>Par</dt><dd>" + esc(cl.auteur) + "</dd></div><div><dt>Dernière étape atteinte</dt><dd>" + esc(P.libelleEtape(cl.etapeAtteinte)) + "</dd></div>" +
      "<div><dt>Restrictions de communication</dt><dd>" + esc(ref.restrictions[cl.restriction] || "—") + "</dd></div></dl>" +
      (cl.commentaire ? '<p class="small mb-0"><strong>Commentaire :</strong> ' + esc(cl.commentaire) + "</p>" : "") + "</div></section>" +
      '<section class="card rc-bloc"><div class="card-header sv-card-header"><span><i class="bi bi-arrow-counterclockwise me-2"></i>Récupération</span></div><div class="card-body">' +
      "<p>" + esc(e.raison) + "</p>" +
      '<dl class="rc-def"><div><dt>Futur suivi</dt><dd>' + (cl.suiviPossible ? "Possible" : "Non envisagé") + "</dd></div><div><dt>Date de reprise</dt><dd>" + esc(cl.dateReprise ? P.dateCourte(cl.dateReprise) : "Non connue") + "</dd></div>" +
      "<div><dt>Conditions de réactivation</dt><dd>" + esc(cl.conditions || "Non précisées") + "</dd></div>" + (cl.evenement ? "<div><dt>Événement déclaré</dt><dd>" + esc(cl.evenement.texte) + "</dd></div>" : "") +
      (cl.reactivation ? "<div><dt>Réactivée le</dt><dd>" + esc(P.dateComplete(cl.reactivation.le)) + " — " + esc(cl.reactivation.evenement) + "</dd></div>" : "") + "</dl>" +
      (cl.motif === "financement-refuse" && actif ? '<div class="rc-alternatives"><strong>Alternatives commerciales autorisées à examiner avec le client</strong><ul>' + ref.alternativesFinancement.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") +
        '</ul><p class="small mb-0">Aucune approbation de crédit n\'est recommandée ni promise ; aucun contact automatique n\'est fait.</p></div>' : "") +
      (actif && ["vehicule-indisponible", "budget-incompatible", "caracteristiques-absentes"].indexOf(cl.motif) >= 0 ? '<p class="small"><a href="' + esc((I && I.ref.urlVehicules || "#") + "?opportunite=" + encodeURIComponent(o.id)) + '"><i class="bi bi-car-front me-1"></i>Voir les véhicules compatibles avec l\'ancienne recherche</a></p>' : "") +
      (actif && cl.motif === "achat-ailleurs" && RC.regles.estConfirme(cl) ? '<p class="small text-muted">Aucune relance commerciale. Si le client manifeste un nouveau projet, créez une nouvelle opportunité distincte depuis sa fiche.</p>' : "") +
      (dsr.refusReactivation && actif ? '<p class="small text-muted mb-2"><i class="bi bi-lock me-1"></i>Réactivation impossible : ' + esc(dsr.refusReactivation) + "</p>" : "") +
      '<div class="d-flex flex-wrap gap-2">' + boutons + "</div></div></section></div>" +
      '<div class="rc-grille">' + liste('<i class="bi bi-check2-square me-2"></i>Ce que nous savons', an.faits.map(function (x) { return "<li>" + esc(x) + "</li>"; }), "Aucun fait enregistré.") +
      liste('<i class="bi bi-question-diamond me-2"></i>Ce qui reste inconnu', an.inconnus.map(function (x) { return "<li>" + esc(x) + "</li>"; }), "Rien d'important ne semble manquer.") + "</div>" +
      (an.interpretations.length ? liste('<i class="bi bi-lightbulb me-2"></i>Interprétations (non confirmées)', an.interpretations.map(function (x) { return "<li>" + esc(x) + "</li>"; }), "") : "") +
      (recommandees.length ? '<section class="card rc-bloc"><div class="card-header sv-card-header"><span><i class="bi bi-lightning-charge me-2"></i>Actions recommandées</span><a class="btn btn-sm btn-link p-0" href="' + esc(I.ref.urlActions) + '">Centre d\'actions</a></div><div class="card-body"><div class="ia-file">' +
        recommandees.map(function (a) { return UI.carte(a, { compacte: true }); }).join("") + "</div></div></section>" : "") +
      '<div class="rc-grille">' +
      liste('<i class="bi bi-clipboard-check me-2"></i>Besoins initiaux', [
        "<li>Recherche : " + esc(P.resumeVehicule(o) || o.titre) + "</li>",
        "<li>Budget : " + esc(P.resumeBudget(q) || "non renseigné") + "</li>",
        "<li>Horizon d'achat : " + esc(P.libelle("horizons", q.horizon) || "non renseigné") + "</li>",
        "<li>Qualification : " + dsr.completude.remplis + " / " + dsr.completude.total + " informations</li>",
      ], "") +
      liste('<i class="bi bi-car-front me-2"></i>Véhicules proposés', (o.vehiculesEnvisages || []).map(function (v) { return "<li>" + esc(v) + "</li>"; })
        .concat(dsr.soumissions.map(function (s) { return '<li><a href="' + esc(s.url) + '">' + esc(s.reference) + "</a> — " + esc(s.vehicule) + " (" + s.versions + " version(s), " + esc(s.statutLibelle.toLowerCase()) + ")</li>"; })), "Aucun véhicule proposé.") +
      liste('<i class="bi bi-calendar-event me-2"></i>Rendez-vous', dsr.rendezVous.map(function (r) { return '<li><a href="' + esc(r.url) + '">' + esc(r.typeLibelle) + "</a> — " + esc(r.creneau.toLowerCase()) + " (" + esc(r.statutLibelle.toLowerCase()) + ")" + (r.resultat && r.resultat.objections ? '<span class="pr-sous d-block">Objections : ' + esc(r.resultat.objections) + "</span>" : "") + "</li>"; }), "Aucun rendez-vous.") +
      liste('<i class="bi bi-sign-stop me-2"></i>Blocages rencontrés', dsr.blocages.map(function (x) { return "<li>" + esc(x) + "</li>"; }), "Aucune transaction ouverte : aucun blocage enregistré.") + "</div>" +
      liste('<i class="bi bi-clock-history me-2"></i>Dernières interactions', dsr.interactions.slice(0, 6).map(function (i) { return "<li><strong>" + esc(P.dateCourte(i.date)) + "</strong> — " + esc(i.resume) + "</li>"; }), "Aucune interaction.") +
      '<section class="card rc-bloc"><div class="card-header sv-card-header"><span><i class="bi bi-chat-square-text me-2"></i>Retour volontaire du client</span><span class="badge-soft">Facultatif</span></div><div class="card-body">' +
      (dsr.retour ? '<dl class="rc-def"><div><dt>Reçu le</dt><dd>' + esc(P.dateComplete(dsr.retour.recuLe)) + (dsr.retour.simule ? " (simulation)" : "") + "</dd></div>" +
        "<div><dt>" + esc(RUI.questionsRetour[0]) + "</dt><dd>" + esc({ oui: "Oui", non: "Non", "en-partie": "En partie" }[dsr.retour.vehiculeTrouve] || "Sans réponse") + "</dd></div>" +
        "<div><dt>" + esc(RUI.questionsRetour[1]) + "</dt><dd>" + esc(dsr.retour.raison || "Sans réponse") + "</dd></div>" +
        "<div><dt>" + esc(RUI.questionsRetour[2]) + "</dt><dd>" + esc(dsr.retour.amelioration || "Sans réponse") + "</dd></div>" +
        "<div><dt>" + esc(RUI.questionsRetour[3]) + "</dt><dd>" + esc(dsr.retour.informerSiDisponible == null ? "Sans réponse" : dsr.retour.informerSiDisponible ? "Oui" : "Non") + "</dd></div></dl>"
        : '<p class="small">Aucun retour reçu. Le client peut, s\'il le souhaite, répondre à un formulaire court (aucun envoi réel dans ce prototype).</p>') +
      '<div class="d-flex flex-wrap gap-2"><button type="button" class="btn btn-sm btn-outline-primary" data-rc="apercu-retour"><i class="bi bi-eye me-1"></i>Prévisualiser le formulaire client</button>' +
      (actif || cl.reactivation ? '<button type="button" class="btn btn-sm btn-ghost" data-rc="retour" data-opp="' + esc(o.id) + '"><i class="bi bi-cone-striped me-1"></i>Simuler la réception d\'un retour</button>' : "") + "</div></div></section>" +
      liste('<i class="bi bi-journal-text me-2"></i>Historique de la clôture', dsr.historique.map(function (h) {
        return "<li><strong>" + esc(P.dateCourte(h.date)) + "</strong> — clôture : " + esc(ref.motifsPerte[h.motif]) + " (" + esc(ref.originesMotif[h.origine].toLowerCase()) + ")" + (h.reactivation ? " ; réactivée le " + esc(P.dateCourte(h.reactivation.le)) : "") + "</li>";
      }).concat((cl.historique || []).map(function (h) { return "<li><strong>" + esc(P.dateCourte(h.date)) + "</strong> — " + esc(h.texte) + "</li>"; })), "");
    zone.innerHTML = html;
  }

  function rendre() {
    racine.querySelector('[data-mode="liste"]').hidden = !!oppId;
    racine.querySelector('[data-mode="fiche"]').hidden = !oppId;
    if (oppId) rendreFiche(); else rendreListe();
  }
  F.forEach(function (id) { var e = champ(id); if (e) e.addEventListener(e.type === "search" ? "input" : "change", rendre); });
  racine.addEventListener("click", function (e) {
    if (!e.target.closest("[data-effacer-filtres]")) return;
    F.forEach(function (id) { var x = champ(id); if (x.type === "checkbox") x.checked = false; else x.value = id === "f-conseiller" ? P.moiId : ""; });
    rendre();
  });
  champ("f-conseiller").value = P.moiId;
  RC.abonner(rendre);
  P.abonner(rendre);
  if (I) I.abonner(rendre);
  rendre();
})();
