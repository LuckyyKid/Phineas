// Accueil du conseiller : branche la mise en page « verre » (Views/Conseiller/Index.cshtml) sur les données du navigateur.
// Lit le moteur d'intelligence (window.Intelligence), l'agenda (window.RendezVous) et les transactions (window.Transactions),
// la même source que le Centre d'actions, l'agenda et le module Transactions : l'accueil ne les contredit jamais.
// Remplit : la carte « À faire en premier » (animée ensuite par conseiller.js), la phrase de résumé,
// les chiffres, le compteur du menu et la liste des rendez-vous du jour.
(function () {
  "use strict";

  var I = window.Intelligence;
  var P = window.Prospects;
  var Regles = window.IntelligenceRegles;
  var R = window.RendezVous;
  var T = window.Transactions;
  var focus = document.getElementById("ph-focus");
  if (!P || !focus) return;

  // Nombre de priorités montrées dans la carte (une seule visible à la fois).
  var NB_PRIORITES_MAX = 3;
  // À partir de cette heure, les rendez-vous restants sont annoncés « ce soir ». Même valeur dans Index.cshtml.
  var HEURE_DU_SOIR = 17;

  var esc = P.esc;

  // ---------- Lecture des données ----------

  // Mes actions actives dans le moteur, sans celles confiées à un collègue.
  function mesActions() {
    if (!I) return [];
    // Même ensemble que le chiffre « à traiter » du Centre d'actions (Regles.actionsGardees, fonctionnalité 16).
    var resultat = Regles ? Regles.actionsGardees(I.actives({ conseiller: P.moiId })) : [];
    return resultat;
  }

  function estEnRetard(dateTexte) {
    return !!dateTexte && new Date(dateTexte) < new Date();
  }

  // Priorités du jour : obligations urgentes ou élevées dont l'échéance est aujourd'hui ou dépassée
  // (IntelligenceRegles.prioritesAccueil, même règle de regroupement que le Centre d'actions et « Mes suivis »).
  function prioritesDuJour(actions) {
    if (!Regles) return [];
    return Regles.prioritesAccueil(actions, new Date(), NB_PRIORITES_MAX);
  }

  // Mes rendez-vous actifs pas encore terminés, du plus tôt au plus tard (même règle que l'agenda).
  function mesRendezVousAVenir() {
    if (!R) return [];
    var maintenant = new Date();
    var resultat = [];
    var tous = R.liste();
    for (var i = 0; i < tous.length; i++) {
      var r = tous[i];
      if (r.conseillerId === P.moiId && R.estActif(r) && R.fin(r) >= maintenant) resultat.push(r);
    }
    resultat.sort(function (a, b) { return R.debut(a) - R.debut(b); });
    return resultat;
  }

  function rendezVousDuJour(aVenir) {
    var maintenant = new Date();
    var resultat = [];
    for (var i = 0; i < aVenir.length; i++) {
      var commenceEncore = R.debut(aVenir[i]) >= maintenant;
      if (commenceEncore && R.memeJour(aVenir[i].debut, maintenant)) resultat.push(aVenir[i]);
    }
    return resultat;
  }

  // Mes transactions actives qui ont au moins un blocage.
  function mesTransactionsBloquees() {
    if (!T) return null;
    var nombre = 0;
    var toutes = T.liste();
    for (var i = 0; i < toutes.length; i++) {
      var t = toutes[i];
      if (t.conseillerId === P.moiId && T.estActive(t) && T.analyse(t).blocages.length > 0) nombre++;
    }
    return nombre;
  }

  // ---------- Carte « À faire en premier » ----------

  function heureCourte(dateTexte) {
    var d = new Date(dateTexte);
    var heures = String(d.getHours()).padStart(2, "0");
    var minutes = String(d.getMinutes()).padStart(2, "0");
    return heures + ":" + minutes;
  }

  function texteEcheance(a) {
    if (!a.echeance) return "Sans échéance";
    if (estEnRetard(a.echeance)) return "Échéance dépassée";
    return "Échéance à " + heureCourte(a.echeance);
  }

  // Bouton (ou lien) d'une commande (IntelligenceRegles.commandesObligation). La première commande de la carte est
  // le bouton principal (blanc), les suivantes sont secondaires (verre).
  // - realiser-serveur : suivi enregistré, réalisé en base par la route existante (conseiller.js, data-realiser-suivi) ;
  // - declarer-contact : première réponse d'un dossier enregistré, à déclarer dans la fiche ;
  // - realiser-local : démonstration, réalisation locale (conseiller.js, data-valider) ;
  // - aucune : dossier enregistré sans opération persistante : on ouvre le dossier, sans clôture fictive.
  function htmlCommande(c, principale) {
    var classe = principale ? "ph-btn ph-btn-blanc" : "ph-btn ph-btn-verre";
    var r = c.raison;
    var fleche = '<i class="bi bi-arrow-right"></i>';
    if (c.commande === "realiser-serveur") {
      return '<button type="button" class="' + classe + '" data-realiser-suivi="' + esc(r.opportuniteId) + '" data-raison="' + esc(r.id) + '">Marquer le suivi comme réalisé' + fleche + "</button>";
    }
    if (c.commande === "declarer-contact") {
      return '<a class="' + classe + '" href="' + esc(P.urlFiche(r.prospectId)) + '" data-declarer-contact="' + esc(r.id) + '">Déclarer le contact dans la fiche' + fleche + "</a>";
    }
    if (c.commande === "realiser-local") {
      return '<button type="button" class="' + classe + '" data-valider data-raison="' + esc(r.id) + '">' + esc(r.actionProposee) + fleche + "</button>";
    }
    return '<a class="' + classe + '" href="' + esc(I.urlObjet(r)) + '" data-ouvrir-dossier="' + esc(r.id) + '">' + esc(r.actionProposee) + fleche + "</a>";
  }

  // Carte d'une obligation : une raison (comme avant) ou plusieurs (même prise de contact), avec une commande par raison.
  function htmlPriorite(g, index) {
    var a = g.principale;
    var nom = esc(a.client);
    if (a.prospectId) nom = '<a class="sv-lien-fiche" href="' + esc(P.urlFiche(a.prospectId)) + '">' + nom + "</a>";
    var retard = estEnRetard(g.echeance) ? ' <span class="ph-tag-retard">En retard</span>' : "";
    var vehicule = a.vehicule ? "<span>" + esc(a.vehicule) + "</span>" : "";
    var commandes = Regles.commandesObligation(g);
    // Carte de démonstration : toutes ses commandes sont locales ; on le dit, sans couleur nouvelle.
    var demonstration = commandes.every(function (c) { return c.commande === "realiser-local"; });
    var type = g.regroupee ? "Prise de contact · " + g.raisons.length + " raisons" : a.regleLibelle;
    var texte = g.regroupee ? g.raisons.map(function (r) { return r.regleLibelle; }).join(" · ") : a.motif;
    return '<article class="ph-focus-item" data-priorite data-action-id="' + esc(a.id) + '" data-obligation="' + esc(g.id) + '"' + (index > 0 ? " hidden" : "") + ">" +
      '<p class="ph-focus-type">' + esc(type) + (demonstration ? " · Démonstration" : "") + retard + "</p>" +
      '<h3 class="ph-focus-nom">' + nom + "</h3>" +
      '<p class="ph-focus-texte">' + esc(texte) + "</p>" +
      '<p class="ph-focus-dossier" data-dossier hidden>' + vehicule + "<span>" + esc(texteEcheance(g)) + "</span>" +
      '<a class="sv-lien-fiche" href="' + esc(I.urlObjet(a)) + '">Consulter le dossier</a></p>' +
      '<div class="ph-focus-actions">' +
      commandes.map(function (c, i) { return htmlCommande(c, i === 0); }).join("") +
      '<button type="button" class="ph-btn ph-btn-verre" data-voir-dossier aria-expanded="false">Voir le dossier</button>' +
      '<button type="button" class="ph-btn-discret" data-plus-tard>Plus tard</button>' +
      "</div></article>";
  }

  // Écrit les priorités une seule fois au chargement : ensuite conseiller.js gère la progression (1/3, 2/3…).
  function rendrePriorites(priorites) {
    focus.querySelector("[data-priorites]").innerHTML = priorites.map(htmlPriorite).join("");

    var etapes = focus.querySelector("[data-etapes]");
    if (priorites.length > 1) {
      var points = "";
      for (var i = 0; i < priorites.length; i++) points += "<i data-etape></i>";
      etapes.innerHTML = points + "<span data-position>1/" + priorites.length + "</span>";
      etapes.hidden = false;
    }

    if (window.SalesOS && window.SalesOS.rafraichirFocus) window.SalesOS.rafraichirFocus();
  }

  // ---------- Résumé, chiffres et menu ----------

  function texteRendezVous(nombre, moment) {
    if (nombre === 0) return "aucun rendez-vous à venir";
    if (nombre === 1) return "1 rendez-vous " + moment;
    return nombre + " rendez-vous " + moment;
  }

  function rendreResume(nbPriorites, nbRendezVous, moment) {
    var phrase;
    if (nbPriorites === 0) phrase = "Aucune priorité urgente aujourd'hui";
    else if (nbPriorites === 1) phrase = "1 priorité aujourd'hui";
    else phrase = nbPriorites + " priorités aujourd'hui";

    phrase += " et " + texteRendezVous(nbRendezVous, moment) + ".";
    if (nbPriorites > 0) phrase += " On commence par la plus urgente.";
    document.querySelector("[data-resume]").textContent = phrase;
  }

  // Change la valeur d'un chiffre repéré par son icône, et sa pastille d'alerte s'il en a une.
  function ecrireIndicateur(icone, valeur, detail) {
    var valeurEl = document.querySelector('[data-indicateur="' + icone + '"]');
    if (!valeurEl || valeur === null) return;
    valeurEl.textContent = String(valeur);
    var carte = valeurEl.closest(".ph-stat");
    if (detail) carte.title = detail;
    var pastille = carte.querySelector("[data-alerte-indicateur]");
    if (pastille) pastille.hidden = valeur === 0;
  }

  function rendreChiffres(actions, aVenir) {
    // « à recontacter » : prospects distincts qui ont une relance recommandée.
    var prospects = [];
    for (var i = 0; i < actions.length; i++) {
      var a = actions[i];
      if (a.relance && prospects.indexOf(a.prospectId) < 0) prospects.push(a.prospectId);
    }
    if (I) ecrireIndicateur("bi-chat-dots", prospects.length, "relances proposées par le moteur");

    if (R) {
      var aujourdhui = 0;
      for (var j = 0; j < aVenir.length; j++) {
        if (R.memeJour(aVenir[j].debut, new Date())) aujourdhui++;
      }
      ecrireIndicateur("bi-calendar-event", aVenir.length, aujourdhui + " aujourd'hui");
    }

    ecrireIndicateur("bi-sign-stop", mesTransactionsBloquees(), "calculé à partir de vos transactions");
  }

  // Compteur à droite de « Centre d'actions » dans la barre latérale.
  function rendreCompteurMenu(nombre) {
    if (!I || !I.ref.urlActions) return;
    var lien = document.querySelector('.ph-nav a[href="' + I.ref.urlActions + '"]');
    if (!lien) return;
    var compteur = lien.querySelector(".ph-nav-count");
    if (!compteur) {
      compteur = document.createElement("span");
      compteur.className = "ph-nav-count";
      lien.appendChild(compteur);
    }
    compteur.textContent = String(nombre);
  }

  // ---------- Rendez-vous du jour ----------

  function rendreRendezVous(duJour, moment) {
    var zone = document.querySelector("[data-rdv-jour]");
    var titre = document.querySelector("[data-titre-soir]");
    if (!zone || !R) return;
    titre.textContent = moment === "ce soir" ? "Ce soir" : "Aujourd'hui";

    if (duJour.length === 0) {
      zone.innerHTML = '<p class="ph-vide">Plus aucun rendez-vous aujourd\'hui.</p>';
      return;
    }
    var lignes = duJour.map(function (r) {
      var v = R.vehicule(r.vehiculeId);
      var detail = R.type(r.type).libelle + (v ? " · " + R.nomVehicule(v) : "");
      var etat = r.statut === "Confirme"
        ? '<span class="ph-dot ph-dot-ok" role="img" aria-label="Confirmé" title="Confirmé"></span>'
        : '<span class="ph-a-confirmer">' + esc(R.statut(r.statut).libelle) + "</span>";
      return '<li class="ph-rdv"><time class="ph-rdv-heure" datetime="' + esc(r.debut) + '">' + esc(heureCourte(r.debut)) + "</time>" +
        '<div class="ph-rdv-info"><a class="sv-lien-fiche" href="' + esc(R.urlDetail(r.id)) + '"><strong>' + esc(window.RendezVousUI ? window.RendezVousUI.nomClient(r) : "") + "</strong></a>" +
        "<span>" + esc(detail) + "</span></div>" + etat + "</li>";
    });
    zone.innerHTML = '<ul class="ph-rdv-liste">' + lignes.join("") + "</ul>";
  }

  // « ce soir » seulement si tous les rendez-vous restants commencent après HEURE_DU_SOIR.
  function momentDuJour(duJour) {
    if (duJour.length === 0) return "aujourd'hui";
    for (var i = 0; i < duJour.length; i++) {
      if (new Date(duJour[i].debut).getHours() < HEURE_DU_SOIR) return "aujourd'hui";
    }
    return "ce soir";
  }

  // ---------- Assemblage ----------

  var nbPriorites = 0;

  // Tout ce qui suit l'état du moteur et de l'agenda (relancé à chaque changement), sauf la carte.
  function rendre() {
    var actions = mesActions();
    var aVenir = mesRendezVousAVenir();
    var duJour = R ? rendezVousDuJour(aVenir) : [];
    var moment = momentDuJour(duJour);
    rendreChiffres(actions, aVenir);
    // Même compteur que sur les pages du Centre d'actions : obligations à traiter (fonctionnalité 12).
    rendreCompteurMenu(I ? I.compteurs(P.moiId).aTraiter : 0);
    rendreRendezVous(duJour, moment);
    if (R) rendreResume(nbPriorites, duJour.length, moment);
  }

  var priorites = prioritesDuJour(mesActions());
  // La phrase compte toutes les priorités du jour (même règle), pas seulement les 3 cartes affichées (fonctionnalité 16).
  nbPriorites = Regles ? Regles.prioritesAccueil(mesActions(), new Date(), Infinity).length : priorites.length;
  rendrePriorites(priorites);
  rendre();
  // Message du serveur après « Marquer le suivi comme réalisé » (réussite ou refus) : affiché une fois.
  P.afficherMessageServeur();

  if (I) I.abonner(rendre);
  if (R) R.abonner(rendre);
})();
