// Fiche d'une transaction : en-tête, situation, Deal Control Tower, proposition, paiement et financement,
// véhicule et atelier, livraison, finalisation et historique. Toutes les actions restent locales.
(function () {
  "use strict";

  var T = window.Transactions, P = window.Prospects, S = window.Soumissions, R = window.RendezVous, UI = window.TransactionsUI;
  var racine = document.getElementById("transaction");
  if (!T || !P || !S || !UI || !racine) return;
  var esc = P.esc;
  var ref = T.ref;
  var id = racine.dataset.transactionId;
  var messageCourant = null;

  function zone(nom) {
    return racine.querySelector('[data-zone="' + nom + '"]');
  }
  function remplir(nom, html) {
    racine.querySelectorAll('[data-champ="' + nom + '"]').forEach(function (x) { x.innerHTML = html; });
  }
  function onglet(nom) {
    var b = document.getElementById("onglet-" + nom);
    if (b && window.bootstrap) bootstrap.Tab.getOrCreateInstance(b).show();
  }
  function modale(idModale) {
    return window.bootstrap ? bootstrap.Modal.getOrCreateInstance(document.getElementById(idModale)) : { show: function () {}, hide: function () {} };
  }
  function resultat(annuler, texte, refus) {
    if (annuler) P.notifier(texte, annuler);
    else P.notifier(refus || "Action impossible dans l'état actuel du dossier.");
  }
  function bouton(faire, texte, icone, classe, extra) {
    return '<button type="button" class="btn btn-sm ' + (classe || "btn-outline-primary") + '" data-faire="' + esc(faire) + '"' + (extra || "") + ">" +
      (icone ? '<i class="bi ' + icone + ' me-1" aria-hidden="true"></i>' : "") + esc(texte) + "</button>";
  }
  function ligneDef(terme, valeur) {
    return "<div><dt>" + esc(terme) + "</dt><dd>" + valeur + "</dd></div>";
  }
  // Actions du conseiller : transaction active seulement (une transaction en attente est suspendue).
  function actif(t) {
    return t.statut === "Active";
  }

  // ---------- En-tête ----------
  function rendreTete(t, a) {
    var c = P.contact(t.prospectId);
    var cons = P.conseiller(t.conseillerId);
    var m = T.montants(t);
    var v = T.vehiculeDe(t);
    document.title = t.reference + " · Phineas";
    remplir("titre", esc(T.nomClient(t)) + ' <span class="tx-titre-ref">' + esc(t.reference) + "</span>");
    remplir("badges", UI.pastilleStatut(a.statut) +
      (t.brouillon ? '<span class="tx-brouillon-tag"><i class="bi bi-pencil-square" aria-hidden="true"></i>Brouillon : proposition non retenue</span>' : "") +
      '<span class="badge-soft">' + esc(ref.etapesPipeline.filter(function (x) { return x.cle === a.etapePipeline; })[0].libelle) + "</span>" +
      '<span class="badge-soft sv-fictif">Données fictives</span>');
    remplir("client", c ? '<a href="' + esc(P.urlFiche(c.id)) + '">' + esc(c.prenom + " " + c.nom) + "</a>" + '<span class="pr-sous d-block">' + esc(c.telephone || c.courriel || "") + "</span>" : '<span class="text-muted">Prospect introuvable</span>');
    remplir("vehicule", esc(T.nomVehicule(t)) + (v ? '<span class="pr-sous d-block">N° ' + esc(v.numeroStock) + "</span>" : "") + UI.pastilleVehicule(T.statutVehicule(t.vehiculeId)));
    remplir("conseiller", esc(cons.moi ? cons.nom + " (vous)" : cons.nom + " (fictif)"));
    remplir("montant", m ? esc(UI.montant(m.totalEstime)) + '<span class="pr-sous d-block">' + (m.figee ? "Version " + t.versionNumero + " figée, taxes estimées" : "Non figé : aucune version acceptée") + "</span>" : '<span class="text-muted">À déterminer</span>');
    remplir("mode", esc(ref.modesAchat[t.modeAchat]) + (t.modeAchat === "financement" || t.modeAchat === "partiel" ? '<span class="d-block">' + UI.pastilleFinancement(t.financement.statut) + "</span>" : ""));
    remplir("nb-blocages", a.blocages.length ? '<span class="tx-nb-blocages"><i class="bi bi-sign-stop-fill" aria-hidden="true"></i>' + a.blocages.length + "</span>" : '<span class="text-muted">Aucun</span>');
    var d = t.livraison.datePrevue;
    remplir("livraison", t.livraison.confirmeeLe ? "Livrée le " + esc(P.dateCourte(t.livraison.confirmeeLe))
      : d ? esc(P.dateCourte(d)) + '<span class="pr-sous d-block">' + (a.pret ? "prévue" : "prévue, non confirmée : conditions restantes") + "</span>" : '<span class="text-muted">Non confirmée</span>');

    var actions = [];
    if (a.pret && !T.rdvLivraison(t) && R) actions.push('<a class="btn btn-sm btn-primary" href="' + esc(urlRdv(t, "Livraison")) + '"><i class="bi bi-calendar-plus me-1"></i>Planifier la livraison</a>');
    var menu = [];
    if (t.soumissionId && S.soumission(t.soumissionId)) menu.push('<li><a class="dropdown-item" href="' + esc(S.urlDetail(t.soumissionId)) + '"><i class="bi bi-file-earmark-text"></i>Voir la soumission</a></li>');
    if (c) menu.push('<li><a class="dropdown-item" href="' + esc(P.urlFiche(c.id)) + '"><i class="bi bi-person"></i>Fiche du client</a></li>');
    if (t.statut === "Active") menu.push('<li><button type="button" class="dropdown-item" data-faire="attente"><i class="bi bi-pause-circle"></i>Mettre en attente</button></li>');
    if (t.statut === "EnAttente") menu.push('<li><button type="button" class="dropdown-item" data-faire="reprendre"><i class="bi bi-play-circle"></i>Reprendre la transaction</button></li>');
    if (T.estActive(t)) menu.push('<li><hr class="dropdown-divider" /></li><li><button type="button" class="dropdown-item text-danger" data-faire="annuler"><i class="bi bi-x-circle"></i>Annuler la transaction</button></li>');
    actions.push('<div class="dropdown"><button type="button" class="btn btn-sm btn-outline-primary dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false">Plus</button><ul class="dropdown-menu dropdown-menu-end sv-menu">' + menu.join("") + "</ul></div>");
    zone("actions-tete").innerHTML = actions.join("");
  }

  function urlRdv(t, type) {
    return R.urlNouveau({ soumission: t.soumissionId && !t.brouillon ? t.soumissionId : null, opportunite: t.opportuniteId, type: type });
  }

  // ---------- Situation : les quatre questions du conseiller ----------
  function rendreSituation(t, a) {
    var etape = ref.etapesPipeline.filter(function (x) { return x.cle === a.etapePipeline; })[0].libelle;
    var p = a.prochaineAction;
    var bloque = a.blocages.length
      ? "<ul>" + a.blocages.slice(0, 3).map(function (b) { return "<li>" + esc(b.nature) + ' <span class="pr-sous">· ' + esc(b.departementLibelle) + "</span></li>"; }).join("") + "</ul>" + (a.blocages.length > 3 ? '<span class="pr-sous">+ ' + (a.blocages.length - 3) + " autre(s)</span>" : "")
      : '<span class="text-muted">Aucun blocage.</span>';
    var qui = a.departementsAttendus.length ? a.departementsAttendus.map(function (d) { return '<span class="tx-dep">' + esc(d.libelle) + "</span>"; }).join("") : '<span class="text-muted">Aucun autre département attendu.</span>';
    zone("situation").innerHTML =
      '<h2 class="visually-hidden" id="tx-situation-titre">Situation de la transaction</h2>' +
      '<div class="tx-situation-grille">' +
      '<div><span class="tx-q">Où en est la transaction ?</span>' + UI.pastilleStatut(a.statut) + '<span class="pr-sous d-block">' + esc(etape) + " · " + a.progression.faites + " / " + a.progression.total + " étapes</span>" + UI.miniAxes(a) + "</div>" +
      '<div class="' + (a.blocages.length ? "tx-q-alerte" : "") + '"><span class="tx-q">Ce qui empêche d\'avancer</span>' + bloque + "</div>" +
      '<div><span class="tx-q">Qui doit intervenir ?</span>' + qui + "</div>" +
      '<div class="tx-q-action"><span class="tx-q">Que pouvez-vous faire maintenant ?</span><strong>' + esc(p.texte) + "</strong>" + (p.responsable ? '<span class="pr-sous d-block">' + esc(p.responsable.libelle) + "</span>" : "") +
      (actionElement(t, { code: p.code, proprietaire: p.responsable && p.responsable.cle === "conseiller" ? "vendeur" : "departement" }) || "") + "</div>" +
      "</div>";
  }

  // Bouton correspondant à un élément signalé, seulement pour ce qu'un conseiller a le droit de faire.
  function actionElement(t, e) {
    if (!actif(t) || !e.code) return "";
    switch (e.code) {
      case "prix": return bouton("confirmer-prix", "Confirmer le prix", "bi-check2");
      case "options": return bouton("confirmer-options", "Confirmer les options", "bi-check2");
      case "remise-a-demander": return bouton("message-remise", "Préparer la demande", "bi-envelope");
      case "remise-refusee": case "reprise-refusee": case "proposition-brouillon": return bouton("aller", "Voir la proposition", "bi-arrow-right", null, ' data-onglet="proposition"');
      case "reprise-infos": case "reprise-a-presenter": case "mode": case "financement-annule": case "financement-refuse": case "dossier": case "dossier-incomplet": case "depot-attendu": case "condition":
        return bouton("aller", "Ouvrir Paiement et financement", "bi-arrow-right", null, ' data-onglet="paiement"');
      case "transmission": return T.peutTransmettre(t) ? bouton("transmettre", "Noter la transmission à F&A", "bi-send") : "";
      case "piece": return bouton("message-piece", "Préparer le message au client", "bi-envelope");
      case "vehicule-vendu": case "vehicule-conflit": return bouton("aller", "Voir la proposition", "bi-arrow-right", null, ' data-onglet="proposition"');
      case "vehicule-regression": case "inspection": case "reparation": case "preparation": case "disponibilite-inconnue":
        return bouton("message-client", "Préparer un message au client", "bi-chat-left-text");
      case "planifier-livraison": return R ? '<a class="btn btn-sm btn-primary" href="' + esc(urlRdv(t, "Livraison")) + '"><i class="bi bi-calendar-plus me-1"></i>Planifier la livraison</a>' : "";
      case "livrer": case "confirmer-livraison": return bouton("aller", "Ouvrir Livraison", "bi-arrow-right", null, ' data-onglet="livraison"');
    }
    return "";
  }

  // ---------- Vue d'ensemble ----------
  function rendreApercu(t, a) {
    remplir("progression", a.progression.faites + " / " + a.progression.total + " étapes applicables");
    zone("tour").innerHTML = UI.tour(a) +
      '<p class="pr-note mb-0 mt-3"><i class="bi bi-info-circle me-1"></i>Les quatre axes avancent indépendamment lorsque c\'est possible. Les étapes « Non applicable » sont exclues du calcul (ex. financement d\'un achat comptant, reprise absente).</p>';
    var clos = !actif(t);
    zone("elements").innerHTML = clos
      ? '<div class="sv-empty"><i class="bi bi-archive"></i><span>Transaction ' + esc(T.statutAffiche(a.statut).libelle.toLowerCase()) + " : plus aucune action requise.</span></div>"
      : UI.elements(a.elements, { actions: function (e) { return actionElement(t, e); } });
    zone("pret-apercu").innerHTML = UI.preparationLivraison(a) + (actif(t) ? '<div class="mt-2">' + bouton("aller", "Ouvrir Livraison", "bi-arrow-right", "btn-link p-0", ' data-onglet="livraison"') + "</div>" : "");
    var evs = T.simulation.evenements(t.id);
    zone("simulation").innerHTML = evs.length
      ? '<div class="tx-simu-liste">' + evs.map(function (e) {
          return '<button type="button" class="btn btn-sm btn-outline-secondary tx-simu" data-faire="simuler" data-code="' + esc(e.code) + '"><span class="tx-simu-dep">' + esc(e.departementLibelle) + "</span>" + esc(e.libelle) + "</button>";
        }).join("") + "</div>"
      : '<p class="text-muted small mb-0">Aucun événement simulable dans l\'état actuel.</p>';
  }

  // ---------- Proposition ----------
  function rendreProposition(t, a) {
    var o = T.offre(t);
    var m = T.montants(t);
    var s = t.soumissionId ? S.soumission(t.soumissionId) : null;
    remplir("figee", t.proposition ? '<span class="badge-soft"><i class="bi bi-lock"></i>Figée le ' + esc(P.dateCourte(t.proposition.dateFigee)) + "</span>" : '<span class="tx-brouillon-tag">Non figée</span>');
    var html = "";
    if (!o) html = '<p class="text-muted mb-0">Aucune proposition : choisissez une soumission acceptée.</p>';
    else {
      var c = m.calcul;
      var v = T.vehiculeDe(t);
      html += (t.brouillon ? '<div class="alert alert-warning small d-flex gap-2"><i class="bi bi-pencil-square"></i><span>Transaction en brouillon : la version ' + esc(t.versionNumero || "") + " envisagée n'est pas acceptée. Les montants ci-dessous ne sont pas figés et peuvent encore changer.</span></div>" : "") +
        '<dl class="pr-liste-def pr-liste-def-compacte">' +
        ligneDef("Soumission", s ? '<a href="' + esc(S.urlDetail(s.id)) + '">' + esc(s.reference) + "</a> · version " + esc(t.versionNumero) : "—") +
        ligneDef("Véhicule", esc(S.nomVehicule(v)) + '<span class="pr-sous d-block">N° ' + esc(v.numeroStock) + " · " + esc(v.neuf ? "Neuf" : v.kilometrage.toLocaleString("fr-CA") + " km") + "</span>") +
        ligneDef("Prix annoncé", esc(UI.montant(c.prixAnnonce))) +
        ligneDef("Remise", c.remise ? esc(UI.montant(c.remise)) + (o.motifRemise ? '<span class="pr-sous d-block">' + esc(o.motifRemise) + "</span>" : "") : "Aucune") +
        ligneDef("Options", c.options.length ? "<ul class=\"rv-puces\">" + c.options.map(function (x) { return "<li>" + esc(x.libelle) + " · " + esc(UI.montant(x.montant)) + "</li>"; }).join("") + "</ul>" : "Aucune") +
        ligneDef("Taxes estimées", c.taxes != null ? esc(UI.montant(c.taxes)) : "Non incluses") +
        ligneDef("Total estimé", "<strong>" + esc(UI.montant(c.totalEstime)) + "</strong>") +
        ligneDef("Mode d'achat envisagé", esc(o.modeAchat === "comptant" ? "Comptant" : "Financement") + (o.modeAchat === "financement" ? '<span class="pr-sous d-block">' + esc(o.dureeMois) + " mois · taux hypothétique " + esc(S.tauxTexte(o.tauxAnnuel)) + "</span>" : "")) +
        ligneDef("Mise de fonds", o.miseDeFonds ? esc(P.argent(o.miseDeFonds)) : "Aucune") +
        ligneDef("Reprise", o.reprise ? esc(o.reprise.vehicule) + '<span class="pr-sous d-block">Estimation figée : ' + (o.reprise.valeurEstimee != null ? esc(P.argent(o.reprise.valeurEstimee)) : "à confirmer") + "</span>" : "Aucune") +
        "</dl>";
    }
    var ecarts = T.ecarts(t);
    if (ecarts.length) html += '<ul class="rv-alertes mt-3">' + ecarts.map(function (e) { return '<li class="rv-al-attention"><i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i><span>' + esc(e.texte) + "</span></li>"; }).join("") + "</ul>";
    html += '<p class="pr-note mb-0 mt-3"><i class="bi bi-lock me-1"></i>Instantané conservé tel qu\'au moment où la version a été retenue : un changement de prix en inventaire, une nouvelle version ou une nouvelle valeur de reprise ne le modifient jamais.</p>';
    zone("proposition").innerHTML = html;

    // Validation commerciale
    var com = t.commercial;
    var lignes = [
      { ok: !t.brouillon && !!t.proposition, texte: "Proposition retenue (version acceptée)" },
      { ok: com.prixConfirme, texte: "Prix confirmé avec le client", faire: !t.brouillon && actif(t) && !com.prixConfirme ? bouton("confirmer-prix", "Confirmer", "bi-check2") : "" },
    ];
    if (o && (o.options || []).length) lignes.push({ ok: com.optionsConfirmees, texte: "Options confirmées", faire: !t.brouillon && actif(t) && !com.optionsConfirmees ? bouton("confirmer-options", "Confirmer", "bi-check2") : "" });
    if (com.remise !== "NonRequise") lignes.push({ ok: com.remise === "Approuvee", texte: "Remise : " + ref.statutsRemise[com.remise].toLowerCase(), faire: com.remise === "ADemander" && actif(t) ? bouton("message-remise", "Préparer la demande", "bi-envelope") : "" });
    if (t.reprise) lignes.push({ ok: t.reprise.statut === "Acceptee", texte: "Reprise : " + ref.statutsReprise[t.reprise.statut].toLowerCase() });
    lignes.push({ ok: !!com.accordClient, texte: "Accord commercial du client" + (com.accordClient ? " (" + P.dateCourte(com.accordClient) + ")" : "") });
    zone("validation").innerHTML = '<ul class="tx-conditions">' + lignes.map(function (l) {
      return '<li class="' + (l.ok ? "is-ok" : "is-ko") + '"><i class="bi ' + (l.ok ? "bi-check-circle-fill" : "bi-circle") + '" aria-hidden="true"></i><span>' + esc(l.texte) + "</span>" + (l.faire || "") + "</li>";
    }).join("") + "</ul>" +
      (com.remise === "Demandee" ? '<p class="pr-note mb-0"><i class="bi bi-lock me-1"></i>Seul le directeur des ventes peut approuver ou refuser la remise.</p>' : "");

    // Autres versions acceptées
    var autres = actif(t) ? T.versionsRetenables(t) : [];
    zone("versions").innerHTML = (autres.length
      ? '<ul class="tx-versions">' + autres.map(function (x) {
          return "<li><span><strong>" + esc(x.soumission.reference) + " · v" + x.version.numero + "</strong>" + '<span class="pr-sous d-block">' + esc(S.nomVehicule(x.version.vehicule)) + "</span></span>" +
            bouton("retenir", "Retenir cette version", "bi-arrow-repeat", null, ' data-soumission="' + esc(x.soumission.id) + '" data-version="' + x.version.numero + '"') + "</li>";
        }).join("") + "</ul>"
      : '<p class="text-muted small mb-2">Aucune autre version acceptée pour cette opportunité.</p>') +
      (actif(t) ? '<p class="small mb-0">Pour revoir la proposition, préparez une nouvelle version de la soumission' + (s ? ' (<a href="' + esc(S.urlDetail(s.id)) + '">' + esc(s.reference) + "</a>)" : "") +
        ", faites-la accepter par le client, puis retenez-la ici. L'ancienne version reste dans l'historique.</p>" : "");
  }

  // ---------- Paiement et financement ----------
  function rendreFinancement(t, a) {
    var f = t.financement;
    var avecFin = t.modeAchat === "financement" || t.modeAchat === "partiel";
    remplir("statut-financement", avecFin ? UI.pastilleFinancement(f.statut) : UI.pastilleFinancement("NonApplicable"));
    var html = "";
    if (t.modeAchat === "comptant") html = '<p class="mb-0"><strong>Non applicable</strong> : achat comptant. Aucune décision de financement n\'est nécessaire.</p>';
    else if (t.modeAchat === "indetermine") html = '<p class="mb-0 text-muted">Le parcours de financement s\'affichera lorsque le mode d\'achat sera déterminé.</p>';
    else {
      html += '<div class="tx-fin-etat"><span>État communiqué par le service F&amp;A</span>' + UI.pastilleFinancement(f.statut) + (f.depuis ? '<span class="pr-sous">' + esc(P.relatif(f.depuis)) + "</span>" : "") + "</div>";
      html += '<p class="pr-note"><i class="bi bi-shield-lock me-1"></i>Vous voyez l\'état du dossier, pas son contenu : revenus, renseignements bancaires, NAS et rapport de crédit restent au service F&amp;A. Aucun score ni probabilité d\'approbation n\'est calculé.</p>';

      // Assistant de préparation (Finance Readiness)
      var prep = T.preparationFinancement(t);
      var modifiablePrep = actif(t) && ["NonCommence", "EnPreparation", "DossierIncomplet"].indexOf(f.statut) >= 0;
      var faits = prep.filter(function (x) { return x.coche; }).length;
      html += '<h3 class="tx-sous-titre">Préparation du dossier <span class="pr-compte">' + faits + " / " + prep.length + "</span></h3>" +
        '<ul class="rv-checklist tx-prep">' + prep.map(function (x) {
          var idCk = "prep-" + x.cle;
          return '<li><div class="form-check"><input class="form-check-input" type="checkbox" id="' + idCk + '"' + (x.coche ? " checked" : "") + (x.manuel && modifiablePrep ? ' data-prep="' + esc(x.cle) + '"' : " disabled") + " />" +
            '<label class="form-check-label" for="' + idCk + '">' + esc(x.libelle) + (x.parFA ? ' <span class="pr-sous">(confirmé par F&amp;A)</span>' : !x.manuel ? ' <span class="pr-sous">(automatique)</span>' : "") + "</label></div></li>";
        }).join("") + "</ul>" +
        '<p class="tx-distinction"><i class="bi bi-exclamation-diamond me-1" aria-hidden="true"></i><strong>Dossier complet ≠ financement approuvé.</strong> La décision appartient uniquement au service F&amp;A.</p>';
      if (T.peutTransmettre(t)) html += bouton("transmettre", "Noter la transmission du dossier à F&A", "bi-send", "btn-primary") + '<p class="form-text">À faire après l\'avoir transmis par le canal habituel : Phineas n\'envoie rien.</p>';

      // Pièces demandées
      if ((f.pieces || []).length) {
        html += '<h3 class="tx-sous-titre">Pièces demandées par F&amp;A</h3><ul class="tx-pieces">' + f.pieces.map(function (p) {
          var requise = p.statut === "Requise";
          return '<li class="' + (requise ? "is-ko" : "is-ok") + '"><i class="bi ' + (requise ? "bi-file-earmark-excel" : "bi-file-earmark-check") + '" aria-hidden="true"></i><span>' +
            (requise ? "Pièce justificative requise par F&amp;A : " : "Pièce vérifiée par F&amp;A : ") + esc(p.libelle) + '<span class="pr-sous d-block">' + esc(P.relatif(p.depuis)) + "</span></span></li>";
        }).join("") + "</ul>";
        if (f.pieces.some(function (p) { return p.statut === "Requise"; }) && actif(t)) html += bouton("message-piece", "Préparer le message au client", "bi-envelope") + '<p class="form-text">Le client remet la pièce directement au service F&amp;A : vous ne la recevez pas.</p>';
      }
      // Conditions d'approbation
      if (f.statut === "ApprouveSousConditions") {
        html += '<h3 class="tx-sous-titre">Conditions de l\'approbation</h3><ul class="tx-conditions">' + (f.conditions || []).map(function (x) {
          return '<li class="' + (x.remplie ? "is-ok" : "is-ko") + '"><i class="bi ' + (x.remplie ? "bi-check-circle-fill" : "bi-hourglass-split") + '" aria-hidden="true"></i><span>' + esc(x.libelle) +
            '<span class="pr-sous d-block">' + (x.remplie ? "Remplie" : "Responsable : " + esc(ref.departements[x.responsable] ? ref.departements[x.responsable].libelle : x.responsable)) + "</span></span></li>";
        }).join("") + "</ul>" +
          '<p class="pr-note mb-0"><i class="bi bi-info-circle me-1"></i>Une approbation, même complète, ne suffit pas à livrer : les autres conditions de livraison restent vérifiées.</p>';
      }
      if (f.statut === "Approuve") html += '<p class="pr-note mb-0"><i class="bi bi-info-circle me-1"></i>Financement approuvé par F&amp;A. La livraison dépend encore des autres conditions (paiement, véhicule, éléments administratifs).</p>';
      // Options après un refus
      if (f.statut === "Refuse" && actif(t)) {
        html += '<div class="tx-refus"><h3 class="tx-sous-titre">Financement refusé : options possibles</h3>' +
          '<p class="small">Aucune solution alternative n\'est garantie. Choisissez avec le client :</p><ul class="tx-options">' +
          "<li>" + bouton("message-reexamen", "Demander à F&A de réexaminer les options", "bi-envelope") + "</li>" +
          '<li><a class="btn btn-sm btn-outline-primary" href="' + esc(S.urlNouvelle(t.opportuniteId)) + '"><i class="bi bi-car-front me-1"></i>Envisager un véhicule différent</a></li>' +
          (t.soumissionId ? '<li><a class="btn btn-sm btn-outline-primary" href="' + esc(S.urlDetail(t.soumissionId)) + '"><i class="bi bi-file-earmark-text me-1"></i>Revoir la proposition commerciale</a></li>' : "") +
          "<li>" + bouton("focus-mode", "Enregistrer un autre mode d'achat", "bi-signpost-split") + "</li>" +
          "<li>" + bouton("attente", "Mettre la transaction en attente", "bi-pause-circle") + "</li>" +
          "<li>" + bouton("annuler", "Annuler la transaction avec un motif", "bi-x-circle", "btn-outline-danger") + "</li>" +
          "</ul></div>";
      }
    }
    zone("financement").innerHTML = html;

    // Mode d'achat
    var form = document.getElementById("form-mode");
    form.elements.mode.value = t.modeAchat;
    Array.prototype.forEach.call(form.elements, function (x) { x.disabled = !actif(t); });
    zone("mode-aide").textContent = actif(t)
      ? (["Transmis", "EnAnalyse", "InformationRequise", "Approuve", "ApprouveSousConditions"].indexOf(f.statut) >= 0 ? "Un dossier est déjà chez F&A : passer au comptant le rendra non applicable ; passer de financement complet à partiel exige un nouveau dossier." : "Le parcours s'adapte au mode choisi.")
      : "Transaction close : le mode d'achat n'est plus modifiable.";
  }

  function rendreReprise(t) {
    var r = t.reprise;
    var carte = zone("carte-reprise");
    if (!r) {
      remplir("statut-reprise", "");
      zone("reprise").innerHTML = '<p class="text-muted mb-0">Aucune reprise dans ce dossier : l\'évaluation est non applicable.</p>';
      return;
    }
    carte.hidden = false;
    remplir("statut-reprise", '<span class="badge-soft">' + esc(ref.statutsReprise[r.statut]) + "</span>");
    var estime = T.offre(t) && T.offre(t).reprise ? T.offre(t).reprise.valeurEstimee : r.valeurEstimee;
    var html = '<dl class="pr-liste-def pr-liste-def-compacte">' +
      ligneDef("Véhicule", esc(r.description)) +
      ligneDef("Marque et modèle", r.marque && r.modele ? esc(r.marque + " " + r.modele) : UI_A_VERIFIER) +
      ligneDef("Année", r.annee ? esc(r.annee) : UI_A_VERIFIER) +
      ligneDef("Kilométrage", r.kilometrage != null ? esc(r.kilometrage.toLocaleString("fr-CA")) + " km" : UI_A_VERIFIER) +
      ligneDef("Valeur estimée (proposition figée)", estime != null ? esc(P.argent(estime)) : UI_A_VERIFIER) +
      ligneDef("Valeur confirmée", r.valeurConfirmee != null ? esc(P.argent(r.valeurConfirmee)) + '<span class="pr-sous d-block">par l\'évaluateur autorisé</span>' : '<span class="text-muted">Pas encore confirmée</span>') +
      ligneDef("Solde de financement existant", r.soldeVisible ? esc(P.argent(r.solde)) + '<span class="pr-sous d-block">déclaré au conseiller dans la soumission</span>' : '<span class="text-muted"><i class="bi bi-lock me-1"></i>Non communiqué au conseiller</span>') +
      "</dl>";
    if (r.valeurConfirmee != null && estime != null && Number(r.valeurConfirmee) !== Number(estime)) {
      html += '<ul class="rv-alertes"><li class="rv-al-attention"><i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i><span>Écart de ' + esc(P.argent(Math.abs(r.valeurConfirmee - estime))) +
        " avec l'estimation de la proposition. La version retenue n'est pas modifiée : préparez une nouvelle version de la soumission si le client accepte cette valeur.</span></li></ul>";
    }
    if (actif(t) && ["Envisagee", "InformationsManquantes"].indexOf(r.statut) >= 0) {
      html += '<form id="form-reprise" class="row g-2 mt-1" novalidate>' +
        '<div class="col-sm-6"><label class="form-label" for="rp-marque">Marque</label><input class="form-control form-control-sm" id="rp-marque" name="marque" maxlength="40" value="' + esc(r.marque || "") + '" /></div>' +
        '<div class="col-sm-6"><label class="form-label" for="rp-modele">Modèle</label><input class="form-control form-control-sm" id="rp-modele" name="modele" maxlength="40" value="' + esc(r.modele || "") + '" /></div>' +
        '<div class="col-sm-6"><label class="form-label" for="rp-annee">Année</label><input class="form-control form-control-sm" id="rp-annee" name="annee" type="number" min="1980" max="' + (new Date().getFullYear() + 1) + '" value="' + esc(r.annee || "") + '" /><div class="invalid-feedback">Année invalide.</div></div>' +
        '<div class="col-sm-6"><label class="form-label" for="rp-km">Kilométrage</label><input class="form-control form-control-sm" id="rp-km" name="kilometrage" type="number" min="0" max="1000000" value="' + esc(r.kilometrage != null ? r.kilometrage : "") + '" /><div class="invalid-feedback">Kilométrage invalide.</div></div>' +
        '<div class="col-12 d-flex flex-wrap gap-2"><button type="submit" class="btn btn-sm btn-outline-primary">Enregistrer les informations</button>' +
        (r.statut === "Envisagee" ? bouton("evaluation", "Noter la demande d'évaluation", "bi-send", "btn-primary") : "") + "</div></form>" +
        '<p class="form-text mb-0">Aucune évaluation automatique : la valeur est confirmée par le personnel autorisé.</p>';
    }
    if (actif(t) && r.statut === "ValeurConfirmee") {
      html += '<div class="d-flex flex-wrap gap-2 mt-2">' + bouton("reprise-accepte", "Le client accepte la valeur", "bi-check2", "btn-primary") + bouton("reprise-refuse", "Le client refuse", "bi-x") + "</div>";
    }
    zone("reprise").innerHTML = html;
  }
  var UI_A_VERIFIER = '<span class="rv-a-verifier">À vérifier</span>';

  function rendrePaiements(t) {
    var m = T.montants(t);
    var pay = t.paiement;
    var o = T.offre(t);
    function etat(statut) {
      var icones = { Aucun: "bi-dash-circle", EnAttente: "bi-hourglass-split", Declare: "bi-chat-left-dots", Confirme: "bi-patch-check-fill" };
      return '<span class="tx-paie tx-paie-' + esc(statut) + '"><i class="bi ' + icones[statut] + '" aria-hidden="true"></i>' + esc(ref.statutsPaiement[statut]) + "</span>";
    }
    var lignes = [];
    lignes.push(ligneDef("Prix convenu (total estimé)", m ? esc(UI.montant(m.totalEstime)) + '<span class="pr-sous d-block">' + (m.figee ? "montant de la proposition figée" : "montant envisagé, non figé") + "</span>" : UI_A_VERIFIER));
    if (pay.depotPrevu) {
      lignes.push(ligneDef("Dépôt", esc(P.argent(pay.depotPrevu)) + " " + etat(pay.depot) +
        (actif(t) && pay.depot === "EnAttente" ? '<span class="d-block mt-1">' + bouton("declarer-depot", "Noter le dépôt déclaré par le client", "bi-chat-left-dots") + "</span>" : "")));
    } else if (actif(t)) {
      lignes.push(ligneDef("Dépôt", '<form id="form-depot" class="d-flex gap-2" novalidate><label class="visually-hidden" for="d-montant">Montant du dépôt envisagé</label><input class="form-control form-control-sm" id="d-montant" name="montant" type="number" min="1" max="100000" placeholder="Montant envisagé" /><button type="submit" class="btn btn-sm btn-outline-primary">Ajouter</button></form><span class="pr-sous d-block">Aucun dépôt prévu.</span>'));
    }
    if (m && m.calcul.reprise) {
      var net = m.ajuste ? m.ajuste.reprise.net : m.calcul.reprise.net;
      lignes.push(ligneDef("Reprise nette", net != null ? esc(UI.montant(net)) + '<span class="pr-sous d-block">' + (t.reprise && t.reprise.statut === "Acceptee" ? "valeur acceptée" : "envisagée, non finalisée") + "</span>" : '<span class="rv-a-verifier">À confirmer</span> <span class="pr-sous">(valeur ou solde inconnu)</span>'));
    }
    var libelle = t.modeAchat === "financement" ? "Mise de fonds" : t.modeAchat === "partiel" ? "Part payée comptant" : "Paiement du solde";
    var montantVersement = null;
    if (m) {
      var calc = m.ajuste || m.calcul;
      if (t.modeAchat === "comptant") {
        var deduit = pay.depotPrevu && ["Declare", "Confirme"].indexOf(pay.depot) >= 0 && !(o && o.acompteVerse) ? Math.round(pay.depotPrevu * 100) : 0;
        montantVersement = calc.comptant.solde - deduit;
      } else if (o && o.miseDeFonds) montantVersement = Math.round(o.miseDeFonds * 100);
    }
    if (t.modeAchat !== "indetermine" && (t.modeAchat === "comptant" || montantVersement)) {
      lignes.push(ligneDef(libelle, (montantVersement != null ? esc(UI.montant(montantVersement)) + " " : "") + etat(pay.versement) +
        (t.modeAchat === "comptant" ? '<span class="pr-sous d-block">Solde estimatif restant, après dépôt et reprise nette connue</span>' : "") +
        (actif(t) && pay.versement === "EnAttente" ? '<span class="d-block mt-1">' + bouton("declarer-versement", "Noter le paiement déclaré par le client", "bi-chat-left-dots") + "</span>" : "")));
    }
    if ((t.modeAchat === "financement" || t.modeAchat === "partiel") && m && m.calcul.financement) {
      var fin = (m.ajuste || m.calcul).financement;
      lignes.push(ligneDef("Montant à financer (estimation)", fin.montantFinance >= 0 ? esc(UI.montant(fin.montantFinance)) + '<span class="pr-sous d-block">simulation de la soumission, pas une offre de crédit</span>' : UI_A_VERIFIER));
    }
    zone("paiements").innerHTML = '<dl class="pr-liste-def pr-liste-def-compacte">' + lignes.join("") + "</dl>" +
      '<p class="pr-note mb-0"><i class="bi bi-lock me-1"></i>Aucun encaissement ni paiement bancaire. Vous pouvez noter ce que le client déclare ; seule une personne autorisée confirme la réception.</p>';
  }

  // ---------- Véhicule et atelier ----------
  function rendreVehicule(t) {
    var v = S.vehicule(t.vehiculeId);
    var st = T.statutVehicule(t.vehiculeId);
    var at = T.atelier(t.vehiculeId);
    zone("vehicule").innerHTML = v
      ? '<div class="rv-vehicule"><span class="so-photo"><i class="bi bi-car-front"></i><small>Photo non disponible</small></span><div>' +
        "<strong>" + esc(S.nomVehicule(v)) + "</strong>" +
        '<span class="pr-sous d-block">N° d\'inventaire ' + esc(v.numeroStock) + " · " + esc(v.neuf ? "Neuf" : v.kilometrage.toLocaleString("fr-CA") + " km") + "</span>" +
        '<span class="pr-sous d-block"><i class="bi bi-geo-alt me-1"></i>' + (v.emplacement ? esc(v.emplacement) : "Emplacement non renseigné") + "</span>" +
        '<span class="d-flex flex-wrap gap-2 align-items-center mt-1">' + UI.pastilleVehicule(st) + "</span>" +
        '<span class="pr-sous d-block mt-1">Disponibilité estimée : ' + (at && at.disponibiliteEstimee ? esc(P.dateCourte(at.disponibiliteEstimee)) : "non communiquée par l'atelier") + "</span>" +
        "</div></div>" +
        (T.ecarts(t).length ? '<ul class="rv-alertes mt-2">' + T.ecarts(t).filter(function (e) { return e.code !== "version"; }).map(function (e) { return '<li class="rv-al-attention"><i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i><span>' + esc(e.texte) + "</span></li>"; }).join("") + "</ul>" : "")
      : '<p class="text-muted mb-0">Véhicule introuvable dans l\'inventaire.</p>';

    var taches = at ? at.taches : [];
    zone("atelier").innerHTML = (taches.length
      ? '<ul class="tx-taches">' + taches.map(function (x) {
          var ic = { AFaire: "bi-circle", EnCours: "bi-arrow-repeat", EnAttentePiece: "bi-sign-stop-fill", Terminee: "bi-check-circle-fill" }[x.statut];
          return '<li class="tx-tache-' + esc(x.statut) + '"><i class="bi ' + ic + '" aria-hidden="true"></i><span><strong>' + esc(x.libelle) + "</strong>" +
            '<span class="pr-sous d-block">' + esc(ref.statutsTache[x.statut]) + (x.depuis ? " · " + esc(P.relatif(x.depuis)) : "") + "</span></span></li>";
        }).join("") + "</ul>"
      : '<p class="text-muted small">Aucun travail signalé par l\'atelier pour ce véhicule.</p>') +
      '<p class="pr-note"><i class="bi bi-lock me-1"></i>Lecture seule : l\'état mécanique et la préparation sont gérés par l\'atelier (mécanicien / préparateur). Les statuts sont ceux de Phineas.</p>' +
      (actif(t) ? bouton("message-client", "Préparer un message au client sur l'avancement", "bi-chat-left-text") : "");

    var hist = at ? at.historique.slice().reverse() : [];
    zone("statuts-vehicule").innerHTML = hist.length
      ? '<ol class="tx-statuts">' + hist.map(function (h) {
          return "<li><time>" + esc(P.dateCourte(h.date)) + "</time><span>" + (h.ancien ? UI.pastilleVehicule(h.ancien) + ' <i class="bi bi-arrow-right" aria-hidden="true"></i><span class="visually-hidden">vers</span> ' : "") + UI.pastilleVehicule(h.nouveau) +
            '<span class="pr-sous d-block">' + esc(ref.departements[h.departement] ? ref.departements[h.departement].libelle : h.departement) + (h.commentaire ? " · " + esc(h.commentaire) : "") + "</span></span></li>";
        }).join("") + "</ol>"
      : '<p class="text-muted small mb-0">Aucun changement de statut publié pour ce véhicule.</p>';
  }

  // ---------- Livraison et finalisation ----------
  function rendreLivraison(t, a) {
    zone("pret").innerHTML = UI.preparationLivraison(a);
    var html = "";
    var rdv = T.rdvLivraison(t);
    if (actif(t)) {
      html += '<form id="form-date" class="mb-3" novalidate><label class="form-label" for="l-date">Date de livraison envisagée</label><div class="d-flex gap-2">' +
        '<input type="date" class="form-control form-control-sm" id="l-date" name="date" min="' + esc(P.aujourdhuiChamp()) + '" value="' + esc(t.livraison.datePrevue ? P.versChampDate(new Date(t.livraison.datePrevue)) : "") + '" />' +
        '<button type="submit" class="btn btn-sm btn-outline-primary">Enregistrer</button></div><div class="invalid-feedback">Choisissez une date à venir.</div>' +
        (!a.pret ? '<div class="form-text">Date indicative : elle reste « non confirmée » tant que les conditions ne sont pas remplies.</div>' : "") + "</form>";
    } else if (t.livraison.datePrevue) html += "<p>Date de livraison : " + esc(P.dateCourte(t.livraison.datePrevue)) + "</p>";

    if (R) {
      html += '<h3 class="tx-sous-titre">Rendez-vous liés</h3>';
      var lies = ["Livraison", "Finalisation", "Financement"].map(function (type) { return T.rendezVous(t, type); }).reduce(function (x, y) { return x.concat(y); }, []);
      html += lies.length ? '<ul class="tx-rdv">' + lies.map(function (r) {
        return '<li><a href="' + esc(R.urlDetail(r.id)) + '">' + esc(R.type(r.type).libelle) + "</a>" +
          '<span class="rv-statut rv-st-' + esc(r.statut) + '"><i class="bi ' + esc(R.statut(r.statut).icone) + '" aria-hidden="true"></i>' + esc(R.statut(r.statut).libelle) + "</span>" +
          '<span class="pr-sous d-block">' + esc(R.creneauTexte(r)) + "</span></li>";
      }).join("") + "</ul>" : '<p class="text-muted small">Aucun rendez-vous de livraison, de financement ou de finalisation.</p>';
      if (actif(t)) {
        html += '<div class="d-flex flex-wrap gap-2 mb-2">' +
          (!rdv ? '<a class="btn btn-sm ' + (a.pret ? "btn-primary" : "btn-outline-primary") + '" href="' + esc(urlRdv(t, "Livraison")) + '"><i class="bi bi-key me-1"></i>Planifier la livraison</a>' : "") +
          (t.modeAchat === "financement" || t.modeAchat === "partiel" ? '<a class="btn btn-sm btn-outline-primary" href="' + esc(urlRdv(t, "Financement")) + '"><i class="bi bi-bank me-1"></i>Rencontre de financement</a>' : "") +
          '<a class="btn btn-sm btn-outline-primary" href="' + esc(urlRdv(t, "Finalisation")) + '"><i class="bi bi-clipboard-check me-1"></i>Rencontre de finalisation</a></div>';
        if (rdv && !a.pret) html += '<ul class="rv-alertes"><li class="rv-al-critique"><i class="bi bi-exclamation-octagon-fill" aria-hidden="true"></i><span>Un rendez-vous de livraison est planifié, mais les conditions ne sont pas remplies : il ne vaut pas livraison.</span></li></ul>';
        else if (!a.pret) html += '<p class="form-text">Le rendez-vous peut être planifié à l\'avance ; il ne vaut pas livraison.</p>';
      }
    }
    if (actif(t)) {
      var refus = T.refusLivraison(t);
      html += '<h3 class="tx-sous-titre">Remise du véhicule</h3>';
      if (!t.livraison.remiseLe) html += bouton("remise-vehicule", "Déclarer la remise du véhicule", "bi-key", "btn-primary", refus ? " disabled" : "");
      else html += '<p class="mb-2"><i class="bi bi-check-circle-fill text-success me-1"></i>Véhicule remis ' + esc(P.relatif(t.livraison.remiseLe)) + ".</p>" + bouton("confirmer-livraison", "Confirmer la livraison", "bi-check2-all", "btn-primary", refus ? " disabled" : "");
      if (refus) html += '<p class="form-text mb-0" data-refus-livraison>' + esc(refus) + "</p>";
    }
    zone("livraison").innerHTML = html;
    rendreFinalisation(t, a);
  }

  function rendreFinalisation(t, a) {
    var html = "";
    if (t.statut === "Annulee") {
      var an = t.annulation;
      html = '<dl class="pr-liste-def pr-liste-def-compacte">' +
        ligneDef("Motif", esc(ref.motifsAnnulation[an.motif])) + ligneDef("Annulée par", esc(ref.auteursAnnulation[an.auteur])) +
        ligneDef("Date", esc(P.dateCourte(an.date))) + ligneDef("Commentaire", an.commentaire ? esc(an.commentaire) : '<span class="text-muted">—</span>') +
        ligneDef("Reprise de la discussion", an.reprendre ? "Possible" : "Non prévue") + "</dl>" +
        '<p class="pr-note mb-0"><i class="bi bi-info-circle me-1"></i>La transaction reste dans l\'historique. L\'opportunité n\'a pas été marquée perdue automatiquement.</p>';
    } else if (t.statut === "Livree" || t.statut === "Cloturee") {
      var m = T.montants(t);
      var validations = (t.historique || []).filter(function (h) { return ["validation", "financement", "paiement", "administratif", "reprise"].indexOf(h.type) >= 0; });
      html = '<dl class="pr-liste-def pr-liste-def-compacte">' +
        ligneDef("Client", esc(T.nomClient(t))) + ligneDef("Véhicule vendu", esc(T.nomVehicule(t))) +
        ligneDef("Proposition finale", (t.soumissionId && S.soumission(t.soumissionId) ? esc(S.soumission(t.soumissionId).reference) + " v" + esc(t.versionNumero) + " · " : "") + (m ? esc(UI.montant(m.totalEstime)) : "—")) +
        ligneDef("Mode d'achat", esc(ref.modesAchat[t.modeAchat])) +
        ligneDef("Livraison", t.livraison.confirmeeLe ? esc(P.dateCourte(t.livraison.confirmeeLe)) : "—") +
        ligneDef("Clôture", t.clotureLe ? esc(P.dateCourte(t.clotureLe)) : '<span class="text-muted">Non clôturée</span>') +
        ligneDef("Conseiller", esc(P.conseiller(t.conseillerId).nom)) + "</dl>" +
        '<h3 class="tx-sous-titre">Historique des validations</h3>' +
        (validations.length ? '<ul class="tx-validations">' + validations.map(function (h) { return "<li><time>" + esc(P.dateCourte(h.date)) + "</time> " + esc(h.description) + ' <span class="pr-sous">· ' + esc(h.auteur) + "</span></li>"; }).join("") + "</ul>" : '<p class="text-muted small">Aucune validation enregistrée.</p>') +
        '<p class="pr-note"><i class="bi bi-info-circle me-1"></i>Vente conclue, livraison et clôture administrative sont des événements distincts.</p>';
      if (t.statut === "Livree") {
        var refusC = T.refusCloture(t);
        html += bouton("cloturer", "Clôturer le dossier", "bi-archive", "btn-primary", refusC ? " disabled" : "") + (refusC ? '<p class="form-text mb-0">' + esc(refusC) + "</p>" : "");
      }
    } else {
      html = '<p class="small">La vente est conclue lorsque les éléments administratifs sont confirmés par le personnel autorisé ; la livraison et la clôture suivent.</p>' +
        '<div class="d-flex flex-wrap gap-2">' +
        (t.statut === "Active" ? bouton("attente", "Mettre en attente", "bi-pause-circle") : bouton("reprendre", "Reprendre la transaction", "bi-play-circle", "btn-primary")) +
        bouton("annuler", "Annuler la transaction", "bi-x-circle", "btn-outline-danger") + "</div>" +
        (t.statut === "EnAttente" && t.attente ? '<p class="form-text mb-0">En attente depuis le ' + esc(P.dateCourte(t.attente.depuis)) + " : " + esc(ref.motifsAttente[t.attente.motif].toLowerCase()) + ".</p>" : "");
    }
    var o2 = P.opportunite(t.opportuniteId);
    // Dossier réel : l'étape « Gagné » n'est pas encore enregistrable ; pas de bouton, une explication (fonctionnalité 16).
    if (T.peutMarquerGagnee(t) && P.estEnregistree(t.opportuniteId)) html += '<p class="small mt-3 mb-0" data-gagne-indisponible><i class="bi bi-info-circle me-1"></i>Dossier enregistré : l\'étape « Gagné » n\'est pas encore enregistrable. Elle le sera avec la gestion des ventes ; en attendant, l\'opportunité reste à « Finalisation » dans la fiche.</p>';
    else if (T.peutMarquerGagnee(t)) html += '<div class="tx-gagnee mt-3"><p class="small mb-2">La vente est conclue. Le changement d\'étape de l\'opportunité n\'est jamais automatique.</p>' + bouton("gagnee", "Marquer l'opportunité comme gagnée", "bi-trophy", "btn-success") + "</div>";
    else if (o2 && o2.etape === "Gagne") html += '<p class="mt-3 mb-0"><i class="bi bi-trophy me-1"></i>Opportunité marquée « Gagné ».</p>';
    zone("finalisation").innerHTML = html;
  }

  // ---------- Historique ----------
  var ICONES_HIST = { conseiller: "bi-person", departement: "bi-building", simulation: "bi-cone-striped", systeme: "bi-gear" };
  function rendreHistorique(t) {
    var filtre = document.getElementById("h-origine").value;
    var liste = (t.historique || []).slice().sort(function (x, y) { return new Date(y.date) - new Date(x.date); });
    remplir("nb-historique", String(liste.length));
    liste = liste.filter(function (h) { return !filtre || h.origine === filtre; });
    zone("historique").innerHTML = liste.length ? liste.map(function (h) {
      return '<li class="pr-tl tx-tl-' + esc(h.origine) + '"><span class="pr-tl-icone"><i class="bi ' + (ICONES_HIST[h.origine] || "bi-dot") + '" aria-hidden="true"></i></span><div class="pr-tl-corps">' +
        '<div class="pr-tl-tete"><strong>' + esc(h.auteur) + '</strong><span class="tx-origine tx-origine-' + esc(h.origine) + '">' + esc(ref.origines[h.origine] || h.origine) + "</span>" +
        (h.departement && h.departement !== "conseiller" && ref.departements[h.departement] ? '<span class="pr-sous">' + esc(ref.departements[h.departement].libelle) + "</span>" : "") +
        '<time datetime="' + esc(h.date) + '">' + esc(P.dateComplete(h.date)) + "</time></div>" +
        "<p>" + esc(h.description) + "</p>" +
        (h.ancien || h.nouveau ? '<div class="pr-tl-action"><i class="bi bi-arrow-right-short" aria-hidden="true"></i>' + (h.ancien ? esc(h.ancien) + " → " : "") + esc(h.nouveau || "") + "</div>" : "") +
        "</div></li>";
    }).join("") : '<li class="sv-empty"><span>Aucun événement pour ce filtre.</span></li>';
  }

  // ---------- Rendu ----------
  function rendre() {
    var t = T.transaction(id);
    document.getElementById("transaction-introuvable").hidden = !!t;
    racine.hidden = !t;
    if (!t) return;
    var a = T.analyse(t);
    rendreTete(t, a);
    rendreSituation(t, a);
    rendreApercu(t, a);
    rendreProposition(t, a);
    rendreFinancement(t, a);
    rendreReprise(t);
    rendrePaiements(t);
    rendreVehicule(t);
    rendreLivraison(t, a);
    rendreHistorique(t);
  }

  // ---------- Messages (brouillons, rien n'est envoyé) ----------
  var MESSAGES = {
    "message-remise": { type: "remise", titre: "Demande de validation de la remise", noter: "Noter la demande comme transmise", faire: function (t) { return T.noterDemandeRemise(t.id); }, ok: "Demande de validation notée comme transmise (hors Phineas)." },
    "message-piece": { type: "piece", titre: "Message au client : pièce requise par F&A", noter: "Noter que le client a été informé", faire: function (t) { return T.noterRelancePiece(t.id); }, ok: "Relance du client notée." },
    "message-reexamen": { type: "reexamen", titre: "Demande de réexamen au service F&A", noter: "Noter la demande comme transmise", faire: function (t) { return T.noterReexamen(t.id); }, ok: "Demande de réexamen notée (aucune solution garantie)." },
    "message-client": { type: "client", titre: "Message au client : avancement du dossier" },
  };
  function ouvrirMessage(cle) {
    var t = T.transaction(id);
    var m = MESSAGES[cle];
    messageCourant = m;
    document.getElementById("modal-message-titre").textContent = m.titre;
    document.getElementById("message-texte").value = T.brouillon(t, m.type);
    var noter = document.querySelector("[data-noter-message]");
    noter.hidden = !m.noter;
    noter.textContent = m.noter || "";
    modale("modal-message").show();
  }
  document.querySelector("[data-copier-message]").addEventListener("click", function () {
    var zoneTexte = document.getElementById("message-texte");
    zoneTexte.select();
    try {
      if (navigator.clipboard) navigator.clipboard.writeText(zoneTexte.value);
      else document.execCommand("copy");
      P.notifier("Texte copié. Rien n'a été envoyé.");
    } catch (e) {
      P.notifier("Copie impossible : sélectionnez le texte manuellement.");
    }
  });
  document.querySelector("[data-noter-message]").addEventListener("click", function () {
    var t = T.transaction(id);
    if (!messageCourant || !messageCourant.faire) return;
    var annuler = messageCourant.faire(t);
    modale("modal-message").hide();
    resultat(annuler, messageCourant.ok);
  });

  // ---------- Actions ----------
  var SIMPLES = {
    "confirmer-prix": [function (t) { return T.confirmer(t.id, "prixConfirme"); }, "Prix confirmé."],
    "confirmer-options": [function (t) { return T.confirmer(t.id, "optionsConfirmees"); }, "Options confirmées."],
    transmettre: [function (t) { return T.transmettreFinancement(t.id); }, "Transmission du dossier à F&A notée."],
    evaluation: [function (t) { return T.demanderEvaluation(t.id); }, "Demande d'évaluation notée."],
    "reprise-accepte": [function (t) { return T.decisionReprise(t.id, true); }, "Reprise acceptée par le client."],
    "reprise-refuse": [function (t) { return T.decisionReprise(t.id, false); }, "Reprise refusée : proposition à revoir."],
    "declarer-depot": [function (t) { return T.declarerPaiement(t.id, "depot"); }, "Dépôt déclaré par le client noté. Il reste à confirmer par une personne autorisée."],
    "declarer-versement": [function (t) { return T.declarerPaiement(t.id, "versement"); }, "Paiement déclaré par le client noté. Il reste à confirmer par une personne autorisée."],
    "remise-vehicule": [function (t) { return T.declarerRemise(t.id); }, "Remise du véhicule déclarée."],
    "confirmer-livraison": [function (t) { return T.confirmerLivraison(t.id); }, "Livraison confirmée."],
    cloturer: [function (t) { return T.cloturer(t.id); }, "Dossier clôturé."],
    reprendre: [function (t) { return T.reprendre(t.id); }, "Transaction reprise."],
    gagnee: [function (t) { return T.marquerGagnee(t.id); }, "Opportunité marquée « Gagné »."],
  };
  racine.addEventListener("click", function (e) {
    var b = e.target.closest("[data-faire]");
    if (!b || b.disabled) return;
    var t = T.transaction(id);
    var faire = b.dataset.faire;
    if (SIMPLES[faire]) {
      var res = SIMPLES[faire][0](t);
      resultat(res, SIMPLES[faire][1], faire === "remise-vehicule" || faire === "confirmer-livraison" ? T.refusLivraison(t) : null);
    } else if (MESSAGES[faire]) ouvrirMessage(faire);
    else if (faire === "aller") onglet(b.dataset.onglet);
    else if (faire === "focus-mode") { onglet("paiement"); document.getElementById("m-mode").focus(); }
    else if (faire === "attente") modale("modal-attente").show();
    else if (faire === "annuler") modale("modal-annulation").show();
    else if (faire === "retenir") {
      var r = T.remplacerProposition(t.id, b.dataset.soumission, Number(b.dataset.version));
      resultat(r, "Nouvelle proposition retenue (instantané figé).");
    } else if (faire === "simuler") {
      var ev = T.simulation.evenements(t.id).filter(function (x) { return x.code === b.dataset.code; })[0];
      var s = T.simulation.simuler(t.id, b.dataset.code);
      resultat(s, "Simulation : " + (ev ? ev.libelle.charAt(0).toLowerCase() + ev.libelle.slice(1) : "événement appliqué") + ". Blocages recalculés.");
    }
  });
  racine.addEventListener("change", function (e) {
    var ck = e.target.closest("[data-prep]");
    if (ck) {
      if (!T.cocherPreparation(id, ck.dataset.prep, ck.checked)) ck.checked = !ck.checked;
    }
  });
  racine.addEventListener("submit", function (e) {
    var form = e.target;
    e.preventDefault();
    var t = T.transaction(id);
    if (form.id === "form-mode") {
      var res = T.choisirMode(t.id, form.elements.mode.value);
      resultat(res, "Mode d'achat enregistré : " + ref.modesAchat[form.elements.mode.value].toLowerCase() + ".", t.modeAchat === form.elements.mode.value ? "Ce mode d'achat est déjà retenu." : "Changement impossible : un dossier est en cours chez F&A.");
    } else if (form.id === "form-reprise") {
      var an = form.elements.annee, km = form.elements.kilometrage;
      an.classList.toggle("is-invalid", an.value !== "" && (Number(an.value) < 1980 || Number(an.value) > new Date().getFullYear() + 1));
      km.classList.toggle("is-invalid", km.value !== "" && (Number(km.value) < 0 || Number(km.value) > 1000000));
      if (form.querySelector(".is-invalid")) return;
      resultat(T.completerReprise(t.id, { marque: form.elements.marque.value, modele: form.elements.modele.value, annee: an.value, kilometrage: km.value }), "Informations de reprise enregistrées.");
    } else if (form.id === "form-date") {
      var champ = form.elements.date;
      var date = champ.value ? P.depuisChampDate(champ.value) : null;
      champ.classList.toggle("is-invalid", !date || P.ecartJours(date) < 0);
      if (!date || P.ecartJours(date) < 0) return;
      resultat(T.definirDateLivraison(t.id, date), "Date de livraison envisagée enregistrée.");
    } else if (form.id === "form-depot") {
      var mnt = Number(form.elements.montant.value);
      form.elements.montant.classList.toggle("is-invalid", !(mnt > 0));
      if (!(mnt > 0)) return;
      resultat(T.definirDepot(t.id, mnt), "Dépôt envisagé ajouté.");
    }
  });
  document.getElementById("form-annulation").addEventListener("submit", function (e) {
    e.preventDefault();
    var form = e.target;
    form.elements.motif.classList.toggle("is-invalid", !form.elements.motif.value);
    if (!form.elements.motif.value) return;
    var res = T.annuler(id, { motif: form.elements.motif.value, auteur: form.elements.auteur.value, commentaire: form.elements.commentaire.value.trim(), reprendre: form.elements.reprendre.checked });
    modale("modal-annulation").hide();
    form.reset();
    resultat(res, "Transaction annulée. Elle reste dans l'historique.");
  });
  document.getElementById("form-attente").addEventListener("submit", function (e) {
    e.preventDefault();
    var form = e.target;
    form.elements.motif.classList.toggle("is-invalid", !form.elements.motif.value);
    if (!form.elements.motif.value) return;
    var res = T.mettreEnAttente(id, form.elements.motif.value);
    modale("modal-attente").hide();
    form.reset();
    resultat(res, "Transaction mise en attente.");
  });
  document.getElementById("h-origine").addEventListener("change", function () {
    var t = T.transaction(id);
    if (t) rendreHistorique(t);
  });

  T.abonner(rendre);
  rendre();
  if (/^#(proposition|paiement|vehicule|livraison|historique)$/.test(window.location.hash)) onglet(window.location.hash.slice(1));
})();
