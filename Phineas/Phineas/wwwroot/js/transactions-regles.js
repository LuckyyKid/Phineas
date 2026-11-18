// Moteur du Deal Control Tower (prototype frontend) : fonctions pures, sans accès au DOM ni au stockage.
// Tout est calculé à partir de l'état des données (transaction, statut du véhicule, suivi de l'atelier, rendez-vous) :
// aucune liste de blocages n'est saisie à la main. Utilisable dans le navigateur et dans Node (tests).
//
// Chaque élément signalé a une nature :
//   « critique »    : bloque la prochaine étape (refus, pièce manquante, véhicule indisponible, attente prolongée…) ;
//   « attente »     : un autre département traite normalement le dossier ;
//   « action »      : le conseiller peut avancer lui-même ;
//   « information » : il manque une information, sans empêcher encore d'avancer.
(function (racine) {
  "use strict";

  var ORDRE_VEHICULE = ["Recu", "EnInspection", "InspectionTerminee", "NettoyageEnCours", "PretPourVente", "Reserve", "Vendu", "Livre"];
  var PRET = ["PretPourVente", "Reserve", "Vendu", "Livre"];
  var FINANCEMENT_TRANSMIS = ["Transmis", "EnAnalyse", "InformationRequise", "Approuve", "ApprouveSousConditions", "Refuse"];
  var CLOS = ["Livree", "Cloturee", "Annulee"];
  var JOUR = 86400000;

  function avecFinancement(t) {
    return t.modeAchat === "financement" || t.modeAchat === "partiel";
  }
  function joursDepuis(date, maintenant) {
    return date ? Math.floor((maintenant - new Date(date)) / JOUR) : null;
  }
  function argent(cents) {
    return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(cents / 100);
  }

  // ---------- Construction ----------
  function Contexte(t, ctx) {
    this.t = t;
    this.ref = ctx.ref;
    this.maintenant = ctx.maintenant || new Date();
    this.statutVehicule = ctx.statutVehicule || null;
    this.atelier = ctx.atelier || null;
    this.rdvLivraison = ctx.rdvLivraison || null;
    this.autreTransaction = ctx.autreTransaction || null;
    // Offre de référence : l'instantané figé ; pour un brouillon, l'offre envisagée (non figée) fournie par le store.
    this.offre = t.proposition ? t.proposition.offre : ctx.offreEnvisagee || null;
    this.elements = [];
    this.etapes = {};
  }
  Contexte.prototype.departement = function (cle) {
    var d = this.ref.departements[cle] || { libelle: cle, personne: null };
    return { cle: cle, libelle: d.libelle, personne: d.personne || null };
  };
  Contexte.prototype.etape = function (axe, cle, etat, responsable, detail, depuis) {
    this.etapes[cle] = { axe: axe, cle: cle, libelle: this.ref.etapes[cle] || cle, etat: etat, responsable: responsable || null, detail: detail || null, depuis: depuis || null };
    return this.etapes[cle];
  };
  // Une attente plus longue que le délai paramétré devient un blocage.
  Contexte.prototype.prolongee = function (depuis) {
    var j = joursDepuis(depuis, this.maintenant);
    return j !== null && j > this.ref.delaiAttenteJours;
  };
  Contexte.prototype.signaler = function (e) {
    var dep = this.departement(e.departement);
    e.departement = dep.cle;
    e.departementLibelle = dep.libelle;
    e.personne = dep.personne;
    e.proprietaire = e.departement === "conseiller" ? "vendeur" : "departement";
    e.joursEcoules = joursDepuis(e.depuis, this.maintenant);
    e.etapeLibelle = this.ref.etapes[e.etape] || e.etape;
    if (e.niveau === "attente" && this.prolongee(e.depuis)) {
      e.niveau = "critique";
      e.nature = e.nature.replace(/\.$/, "") + " (en attente depuis " + e.joursEcoules + " j).";
    }
    this.elements.push(e);
    return e;
  };

  // ---------- Axe 1 : validation commerciale ----------
  function axeCommercial(c) {
    var t = c.t, com = t.commercial || {}, offre = c.offre;
    if (t.brouillon || !t.proposition) {
      c.etape("commercial", "proposition", "EnCours", "conseiller", "Aucune version acceptée n'est retenue : transaction en brouillon.");
      c.signaler({ code: "proposition-brouillon", niveau: "action", axe: "commercial", etape: "proposition", departement: "conseiller", depuis: t.dateCreation,
        nature: "Brouillon : aucune proposition acceptée n'est retenue.", impact: "Les validations commerciales et la livraison ne peuvent pas être finalisées.",
        action: "Faire accepter une version de la soumission par le client, puis la retenir dans la transaction.", actionVendeur: "Retenir une version acceptée de la soumission." });
    } else {
      c.etape("commercial", "proposition", "Terminee", "conseiller", "Version " + t.versionNumero + " figée le " + new Date(t.proposition.dateFigee).toLocaleDateString("fr-CA") + ".");
    }

    if (com.prixConfirme) c.etape("commercial", "prix", "Terminee", "conseiller");
    else {
      c.etape("commercial", "prix", "NonCommencee", "conseiller");
      c.signaler({ code: "prix", niveau: "action", axe: "commercial", etape: "prix", departement: "conseiller", depuis: t.dateCreation,
        nature: "Prix à confirmer avec le client.", impact: "La validation commerciale reste incomplète.",
        action: "Confirmer le montant de la proposition retenue avec le client.", actionVendeur: "Confirmer le prix." });
    }

    if (!offre || !(offre.options || []).length) c.etape("commercial", "options", "NonApplicable", null, "Aucune option dans la proposition.");
    else if (com.optionsConfirmees) c.etape("commercial", "options", "Terminee", "conseiller");
    else {
      c.etape("commercial", "options", "NonCommencee", "conseiller");
      c.signaler({ code: "options", niveau: "action", axe: "commercial", etape: "options", departement: "conseiller", depuis: t.dateCreation,
        nature: "Options et produits facultatifs à confirmer.", impact: "La validation commerciale reste incomplète.",
        action: "Confirmer avec le client chacune des options choisies.", actionVendeur: "Confirmer les options." });
    }

    var remiseRequise = offre && Number(offre.remise || 0) > c.ref.seuilRemiseApprobation;
    if (!remiseRequise || com.remise === "NonRequise") c.etape("commercial", "remise", "NonApplicable", null, remiseRequise ? null : "Aucune remise à faire valider.");
    else if (com.remise === "Approuvee") c.etape("commercial", "remise", "Terminee", "direction", "Remise de " + argent(Math.round(offre.remise * 100)) + " approuvée.", com.remiseDepuis);
    else if (com.remise === "Demandee") {
      c.etape("commercial", "remise", "EnAttente", "direction", "Validation demandée.", com.remiseDepuis);
      c.signaler({ code: "remise-attente", niveau: "attente", axe: "commercial", etape: "remise", departement: "direction", depuis: com.remiseDepuis,
        nature: "Remise de " + argent(Math.round(offre.remise * 100)) + " en attente d'approbation.", impact: "La validation commerciale ne peut pas être obtenue.",
        action: "Approuver ou refuser la remise.", actionVendeur: "Relancer le directeur des ventes si le délai s'allonge." });
    } else if (com.remise === "Refusee") {
      c.etape("commercial", "remise", "Bloquee", "direction", "Remise refusée.", com.remiseDepuis);
      c.signaler({ code: "remise-refusee", niveau: "critique", axe: "commercial", etape: "remise", departement: "conseiller", depuis: com.remiseDepuis,
        nature: "Remise refusée par le directeur des ventes.", impact: "La proposition retenue ne peut pas être conclue telle quelle.",
        action: "Revoir la proposition avec le client (nouvelle version de la soumission).", actionVendeur: "Préparer une nouvelle version de la soumission." });
    } else {
      c.etape("commercial", "remise", "NonCommencee", "conseiller");
      c.signaler({ code: "remise-a-demander", niveau: "action", axe: "commercial", etape: "remise", departement: "conseiller", depuis: t.dateCreation,
        nature: "La remise de " + argent(Math.round(offre.remise * 100)) + " doit être approuvée par le directeur des ventes.", impact: "La validation commerciale ne peut pas être obtenue.",
        action: "Préparer et transmettre la demande de validation.", actionVendeur: "Préparer la demande de validation." });
    }

    axeReprise(c);

    if (com.accordClient) c.etape("commercial", "accord", "Terminee", "client", null, com.accordClient);
    else c.etape("commercial", "accord", t.brouillon ? "NonCommencee" : "EnCours", "client", "Accord à obtenir sur une version acceptée de la soumission.");
  }

  // ---------- Reprise (étape de l'axe commercial) ----------
  function axeReprise(c) {
    var t = c.t, r = t.reprise;
    if (!r) {
      c.etape("commercial", "reprise", "NonApplicable", null, "Aucune reprise dans ce dossier.");
      return;
    }
    var nom = r.description || "Véhicule repris";
    var estime = c.offre && c.offre.reprise ? c.offre.reprise.valeurEstimee : r.valeurEstimee;
    switch (r.statut) {
      case "Acceptee":
        c.etape("commercial", "reprise", "Terminee", "client", "Valeur acceptée par le client.", r.depuis);
        break;
      case "ValeurConfirmee":
        c.etape("commercial", "reprise", "EnCours", "conseiller", "Valeur confirmée par l'évaluateur, à présenter au client.", r.depuis);
        c.signaler({ code: "reprise-a-presenter", niveau: "action", axe: "commercial", etape: "reprise", departement: "conseiller", depuis: r.depuis,
          nature: "Valeur de reprise confirmée : à présenter au client.", impact: "La reprise n'est pas finalisée.",
          action: "Présenter la valeur confirmée et noter la décision du client.", actionVendeur: "Noter la décision du client sur la reprise." });
        break;
      case "EvaluationDemandee":
      case "EvaluationEnCours":
        c.etape("commercial", "reprise", r.statut === "EvaluationEnCours" ? "EnCours" : "EnAttente", "evaluation", r.statut === "EvaluationEnCours" ? "Évaluation en cours." : "Évaluation demandée.", r.depuis);
        c.signaler({ code: "reprise-evaluation", niveau: "attente", axe: "commercial", etape: "reprise", departement: "evaluation", depuis: r.depuis,
          nature: "Reprise non évaluée : " + nom + ".", impact: "La valeur de reprise n'est pas confirmée ; le solde à payer reste estimatif.",
          action: "Évaluer le véhicule et confirmer sa valeur.", actionVendeur: "Vérifier que les informations du véhicule repris sont complètes." });
        break;
      case "InformationsManquantes":
      case "Envisagee":
        var manquants = [];
        if (!r.marque || !r.modele) manquants.push("marque et modèle");
        if (!r.annee) manquants.push("année");
        if (r.kilometrage == null) manquants.push("kilométrage");
        c.etape("commercial", "reprise", "NonCommencee", "conseiller", manquants.length ? "À compléter : " + manquants.join(", ") + "." : "Évaluation à demander.", r.depuis);
        c.signaler({ code: "reprise-infos", niveau: "action", axe: "commercial", etape: "reprise", departement: "conseiller", depuis: r.depuis,
          nature: manquants.length ? "Informations de reprise manquantes : " + manquants.join(", ") + "." : "Évaluation de la reprise à demander.",
          impact: "L'évaluation ne peut pas commencer.",
          action: manquants.length ? "Compléter les informations du véhicule repris." : "Demander l'évaluation au personnel autorisé.",
          actionVendeur: manquants.length ? "Compléter les informations de la reprise." : "Noter la demande d'évaluation." });
        break;
      case "Refusee":
        c.etape("commercial", "reprise", "Bloquee", "client", "Reprise refusée.", r.depuis);
        c.signaler({ code: "reprise-refusee", niveau: "critique", axe: "commercial", etape: "reprise", departement: "conseiller", depuis: r.depuis,
          nature: "Reprise refusée : la proposition retenue l'incluait.", impact: "Le montant de la proposition n'est plus valable.",
          action: "Revoir la proposition sans reprise (nouvelle version de la soumission).", actionVendeur: "Préparer une nouvelle version de la soumission." });
        break;
    }
    // Écart entre la valeur figée dans la proposition et la valeur confirmée : signalé, jamais réécrit.
    if (r.valeurConfirmee != null && estime != null && Number(r.valeurConfirmee) !== Number(estime)) {
      var ecart = Math.round((r.valeurConfirmee - estime) * 100);
      c.signaler({ code: "reprise-ecart", niveau: "information", axe: "commercial", etape: "reprise", departement: "conseiller", depuis: r.depuis,
        nature: "Valeur confirmée " + (ecart < 0 ? "inférieure" : "supérieure") + " de " + argent(Math.abs(ecart)) + " à l'estimation de la proposition figée.",
        impact: "La proposition retenue n'est pas modifiée ; le solde estimatif en tient compte une fois la reprise acceptée.",
        action: "Si le client accepte la nouvelle valeur, préparer une nouvelle version de la soumission.", actionVendeur: "Préparer une nouvelle version si nécessaire." });
    }
  }

  // ---------- Axe 2 : paiement ou financement ----------
  function axePaiement(c) {
    var t = c.t, f = t.financement || {}, offre = c.offre, pay = t.paiement || {};
    var indetermine = t.modeAchat === "indetermine" || !t.modeAchat;

    if (indetermine) {
      c.etape("paiement", "mode", "NonCommencee", "conseiller", "Mode d'achat à déterminer.");
      c.signaler({ code: "mode", niveau: "action", axe: "paiement", etape: "mode", departement: "conseiller", depuis: t.dateCreation,
        nature: "Mode d'achat à déterminer.", impact: "Le parcours de paiement ou de financement ne peut pas commencer.",
        action: "Déterminer avec le client : comptant, financement complet ou partiel.", actionVendeur: "Enregistrer le mode d'achat." });
    } else if (f.statut === "Annule") {
      c.etape("paiement", "mode", "Bloquee", "conseiller", "Financement annulé.");
      c.signaler({ code: "financement-annule", niveau: "critique", axe: "paiement", etape: "mode", departement: "conseiller", depuis: f.depuis,
        nature: "Financement annulé.", impact: "Aucun mode de paiement valable n'est retenu.",
        action: "Enregistrer le mode d'achat finalement retenu.", actionVendeur: "Enregistrer un autre mode d'achat." });
    } else {
      c.etape("paiement", "mode", "Terminee", "conseiller", c.ref.modesAchat[t.modeAchat]);
    }

    var etapesFinancement = ["dossier", "transmission", "pieces", "decision", "conditions"];
    if (!avecFinancement(t)) {
      etapesFinancement.forEach(function (k) { c.etape("paiement", k, "NonApplicable", null, indetermine ? "Selon le mode d'achat retenu." : "Achat comptant : aucun financement."); });
    } else {
      axeFinancement(c, f);
    }

    // Dépôt
    if (!pay.depotPrevu && pay.depot === "Aucun") c.etape("paiement", "depot", "NonApplicable", null, "Aucun dépôt prévu.");
    else etapePaiement(c, "depot", pay.depot, pay.depotPrevu, "Dépôt", pay.depotDepuis);

    // Versement du client : solde (comptant), mise de fonds (financement), part comptant (partiel).
    var montant = null, libelle = "Paiement du solde";
    if (t.modeAchat === "financement") { montant = offre ? offre.miseDeFonds : null; libelle = "Mise de fonds"; }
    if (t.modeAchat === "partiel") { montant = offre ? offre.miseDeFonds : null; libelle = "Part payée comptant"; }
    if (indetermine) c.etape("paiement", "paiement", "NonCommencee", null, "Selon le mode d'achat retenu.");
    else if (t.modeAchat !== "comptant" && !montant) c.etape("paiement", "paiement", "NonApplicable", null, "Aucune mise de fonds prévue.");
    else etapePaiement(c, "paiement", pay.versement, montant, libelle, pay.versementDepuis);
  }

  function etapePaiement(c, cle, statut, montant, libelle, depuis) {
    var t = c.t;
    var texte = libelle + (montant ? " de " + argent(Math.round(montant * 100)) : "");
    if (statut === "Confirme") return c.etape("paiement", cle, "Terminee", "administration", texte + " confirmé par une personne autorisée.");
    if (statut === "Declare") {
      c.etape("paiement", cle, "EnAttente", "administration", texte + " déclaré par le client, à confirmer.");
      c.signaler({ code: cle + "-declare", niveau: "attente", axe: "paiement", etape: cle, departement: "administration", depuis: depuis || null,
        nature: texte + " déclaré, non confirmé.", impact: "Les conditions de paiement ne sont pas remplies.",
        action: "Vérifier la réception et la confirmer.", actionVendeur: null });
      return;
    }
    c.etape("paiement", cle, "NonCommencee", "client", texte + " attendu.");
    // Avant que le véhicule et le financement soient prêts, un paiement attendu n'empêche pas encore d'avancer.
    c.signaler({ code: cle + "-attendu", niveau: cle === "depot" ? "action" : "information", axe: "paiement", etape: cle, departement: cle === "depot" ? "conseiller" : "client", depuis: t.dateCreation,
      nature: texte + " non confirmé.", impact: cle === "depot" ? "Le véhicule n'est pas garanti au client sans dépôt confirmé." : "Requis avant la livraison.",
      action: cle === "depot" ? "Convenir du dépôt avec le client." : "Convenir des modalités de paiement avec le client avant la livraison.",
      actionVendeur: cle === "depot" ? "Noter le dépôt déclaré par le client." : null });
  }

  function axeFinancement(c, f) {
    var t = c.t, prep = f.preparation || {};
    var transmis = FINANCEMENT_TRANSMIS.indexOf(f.statut) >= 0;
    var pretsVendeur = ["client", "documents"].filter(function (k) { return prep[k]; }).length;

    // Dossier préparé par le conseiller (sans aucun contenu financier).
    if (transmis) c.etape("paiement", "dossier", "Terminee", "conseiller");
    else if (f.statut === "DossierIncomplet") {
      c.etape("paiement", "dossier", "Bloquee", "fa", "Dossier jugé incomplet par F&A.", f.depuis);
      c.signaler({ code: "dossier-incomplet", niveau: "critique", axe: "paiement", etape: "dossier", departement: "conseiller", depuis: f.depuis,
        nature: "Dossier de financement jugé incomplet par F&A.", impact: "Le dossier ne peut pas être analysé.",
        action: "Revoir avec le client la liste des éléments attendus, puis retransmettre le dossier.", actionVendeur: "Compléter la préparation du dossier." });
    } else if (pretsVendeur === 2) c.etape("paiement", "dossier", "Terminee", "conseiller");
    else {
      c.etape("paiement", "dossier", pretsVendeur || f.statut === "EnPreparation" ? "EnCours" : "NonCommencee", "conseiller", pretsVendeur + " / 2 éléments préparés.");
      c.signaler({ code: "dossier", niveau: "action", axe: "paiement", etape: "dossier", departement: "conseiller", depuis: f.depuis || t.dateCreation,
        nature: "Dossier de financement à préparer.", impact: "Le dossier ne peut pas être transmis au service F&A.",
        action: "Compléter l'assistant de préparation du financement.", actionVendeur: "Compléter la préparation du financement." });
    }

    // Transmission
    if (transmis) c.etape("paiement", "transmission", "Terminee", "conseiller", null, f.depuis);
    else if (c.etapes.dossier.etat === "Terminee" && !t.brouillon && t.modeAchat !== "indetermine") {
      c.etape("paiement", "transmission", "NonCommencee", "conseiller");
      c.signaler({ code: "transmission", niveau: "action", axe: "paiement", etape: "transmission", departement: "conseiller", depuis: t.dateCreation,
        nature: "Dossier prêt, non transmis au service F&A.", impact: "L'analyse financière ne peut pas commencer.",
        action: "Transmettre le dossier au service F&A.", actionVendeur: "Noter la transmission du dossier à F&A." });
    } else c.etape("paiement", "transmission", "NonCommencee", "conseiller", t.brouillon ? "Une proposition acceptée doit d'abord être retenue." : null);

    // Pièces demandées par F&A : le conseiller connaît leur intitulé, jamais leur contenu.
    var requises = (f.pieces || []).filter(function (p) { return p.statut === "Requise"; });
    if (!transmis) c.etape("paiement", "pieces", "NonCommencee", "fa");
    else if (requises.length) {
      c.etape("paiement", "pieces", "Bloquee", "client", requises.length + " pièce(s) requise(s) par F&A.", requises[0].depuis);
      requises.forEach(function (p) {
        c.signaler({ code: "piece", niveau: "critique", axe: "paiement", etape: "pieces", departement: "client", depuis: p.depuis,
          nature: "Pièce justificative requise par F&A : " + p.libelle + ".", impact: "La décision de financement ne peut pas être rendue.",
          action: "Le client remet la pièce directement au service F&A, qui la vérifie.", actionVendeur: "Informer le client de la pièce à fournir (sans la recevoir vous-même)." });
      });
    } else c.etape("paiement", "pieces", (f.pieces || []).length || ["Approuve", "ApprouveSousConditions", "Refuse"].indexOf(f.statut) >= 0 ? "Terminee" : "EnCours", "fa",
      (f.pieces || []).length ? "Pièces vérifiées par F&A." : "Aucune pièce supplémentaire demandée à ce jour.");

    // Décision : provient uniquement du service F&A.
    switch (f.statut) {
      case "Approuve":
        c.etape("paiement", "decision", "Terminee", "fa", "Financement approuvé (décision F&A).", f.depuis);
        break;
      case "ApprouveSousConditions":
        c.etape("paiement", "decision", "Terminee", "fa", "Approuvé sous conditions (décision F&A).", f.depuis);
        break;
      case "Refuse":
        c.etape("paiement", "decision", "Bloquee", "fa", "Financement refusé (décision F&A).", f.depuis);
        c.signaler({ code: "financement-refuse", niveau: "critique", axe: "paiement", etape: "decision", departement: "conseiller", depuis: f.depuis,
          nature: "Financement refusé par le service F&A.", impact: "La transaction ne peut pas avancer avec ce mode d'achat.",
          action: "Choisir avec le client une option autorisée (voir l'onglet Paiement et financement).", actionVendeur: "Examiner les options après refus." });
        break;
      case "EnAnalyse":
      case "Transmis":
        c.etape("paiement", "decision", f.statut === "EnAnalyse" ? "EnCours" : "EnAttente", "fa", c.ref.statutsFinancement[f.statut] + ".", f.depuis);
        c.signaler({ code: "decision", niveau: "attente", axe: "paiement", etape: "decision", departement: "fa", depuis: f.depuis,
          nature: "Décision de financement en attente (" + c.ref.statutsFinancement[f.statut].toLowerCase() + ").", impact: "La livraison ne peut pas être préparée sans décision.",
          action: "Analyser le dossier et communiquer la décision.", actionVendeur: null });
        break;
      case "InformationRequise":
        c.etape("paiement", "decision", "EnAttente", "fa", "Suspendue : information complémentaire requise.", f.depuis);
        break;
      default:
        c.etape("paiement", "decision", "NonCommencee", "fa");
    }

    // Conditions d'une approbation conditionnelle.
    if (f.statut !== "ApprouveSousConditions") c.etape("paiement", "conditions", f.statut === "Approuve" ? "NonApplicable" : "NonCommencee", null, f.statut === "Approuve" ? "Approbation sans condition." : null);
    else {
      var restantes = (f.conditions || []).filter(function (x) { return !x.remplie; });
      c.etape("paiement", "conditions", restantes.length ? "EnAttente" : "Terminee", restantes.length ? restantes[0].responsable : "fa",
        restantes.length ? restantes.length + " condition(s) restante(s)." : "Toutes les conditions sont remplies.", f.depuis);
      restantes.forEach(function (x) {
        c.signaler({ code: "condition", niveau: x.responsable === "conseiller" ? "action" : "attente", axe: "paiement", etape: "conditions", departement: x.responsable, depuis: f.depuis,
          nature: "Condition de financement : " + x.libelle + ".", impact: "Le financement n'est pas confirmé tant que la condition n'est pas remplie.",
          action: x.responsable === "client" ? "Le client fournit l'élément au service F&A." : "Remplir la condition.",
          actionVendeur: x.responsable === "client" ? "Rappeler la condition au client." : x.responsable === "conseiller" ? "Remplir la condition." : null });
      });
    }
  }

  // ---------- Axe 3 : préparation du véhicule (statuts existants de Phineas) ----------
  function axeVehicule(c) {
    var t = c.t, s = c.statutVehicule, a = c.atelier || { taches: [], historique: [] };
    var idx = ORDRE_VEHICULE.indexOf(s);
    c.etape("vehicule", "vehicule", "Terminee", "conseiller");

    var venteAuClient = (t.administratif && t.administratif.statut === "Confirme") || CLOS.indexOf(t.statut) >= 0 && t.statut !== "Annulee";
    if (!s) {
      c.etape("vehicule", "disponibilite", "Bloquee", "direction", "Véhicule introuvable dans l'inventaire.");
      c.signaler({ code: "vehicule-introuvable", niveau: "critique", axe: "vehicule", etape: "disponibilite", departement: "direction", depuis: t.dateCreation,
        nature: "Véhicule introuvable dans l'inventaire.", impact: "La transaction ne peut pas avancer.", action: "Vérifier l'inventaire.", actionVendeur: null });
    } else if ((s === "Vendu" || s === "Livre") && !venteAuClient) {
      c.etape("vehicule", "disponibilite", "Bloquee", "direction", "Véhicule « " + s + " » pour un autre dossier.");
      c.signaler({ code: "vehicule-vendu", niveau: "critique", axe: "vehicule", etape: "disponibilite", departement: "conseiller", depuis: t.dateCreation,
        nature: "Le véhicule est déjà vendu ou livré à un autre client.", impact: "Cette transaction ne peut pas aboutir avec ce véhicule.",
        action: "Proposer un autre véhicule au client ou annuler la transaction.", actionVendeur: "Envisager un véhicule différent." });
    } else if (c.autreTransaction) {
      c.etape("vehicule", "disponibilite", "Bloquee", "direction", "Véhicule retenu par la transaction " + c.autreTransaction.reference + ".");
      c.signaler({ code: "vehicule-conflit", niveau: "critique", axe: "vehicule", etape: "disponibilite", departement: "direction", depuis: t.dateCreation,
        nature: "Le même véhicule est retenu par une autre transaction active (" + c.autreTransaction.reference + ").", impact: "Un seul client peut acheter ce véhicule.",
        action: "Arbitrer entre les deux dossiers.", actionVendeur: "Signaler le conflit au directeur des ventes." });
    } else c.etape("vehicule", "disponibilite", "Terminee", "atelier", "Statut actuel : " + (c.ref.statutsVehicule ? c.ref.statutsVehicule[s] || s : s) + ".");

    var taches = a.taches || [];
    function tachesDe(type) { return taches.filter(function (x) { return x.type === type; }); }
    function etatTaches(liste) {
      if (!liste.length) return null;
      if (liste.every(function (x) { return x.statut === "Terminee"; })) return "Terminee";
      if (liste.some(function (x) { return x.statut === "EnAttentePiece"; })) return "Bloquee";
      if (liste.some(function (x) { return x.statut === "EnCours"; })) return "EnCours";
      return "NonCommencee";
    }
    var dernier = (a.historique || []).length ? a.historique[a.historique.length - 1] : null;
    var regression = dernier && dernier.ancien && ORDRE_VEHICULE.indexOf(dernier.nouveau) < ORDRE_VEHICULE.indexOf(dernier.ancien) && dernier.nouveau === s;

    // Inspection
    var insp = idx < 0 ? "NonCommencee" : idx === 0 ? "NonCommencee" : idx === 1 ? "EnCours" : "Terminee";
    c.etape("vehicule", "inspection", insp, "atelier", s === "Recu" ? "Véhicule reçu, inspection non commencée." : s === "EnInspection" ? "Inspection en cours." : null, dernier ? dernier.date : null);
    if (regression) {
      c.signaler({ code: "vehicule-regression", niveau: "critique", axe: "vehicule", etape: "inspection", departement: "atelier", depuis: dernier.date,
        nature: "Le statut du véhicule est revenu de « " + libelleVehicule(c, dernier.ancien) + " » à « " + libelleVehicule(c, dernier.nouveau) + " »" + (dernier.commentaire ? " : " + dernier.commentaire.replace(/\.$/, "") : "") + ".",
        impact: "Le véhicule n'est plus prêt : la livraison ne peut pas être confirmée.",
        action: "Terminer la nouvelle inspection et les travaux nécessaires.", actionVendeur: "Consulter l'état et préparer une communication au client." });
    } else if (insp !== "Terminee" && s) {
      c.signaler({ code: "inspection", niveau: "attente", axe: "vehicule", etape: "inspection", departement: "atelier", depuis: dernier ? dernier.date : t.dateCreation,
        nature: s === "Recu" ? "Inspection du véhicule non commencée." : "Inspection du véhicule en cours.", impact: "Le véhicule ne peut pas être déclaré prêt.",
        action: "Inspecter le véhicule et publier le résultat.", actionVendeur: "Consulter l'état et préparer une communication au client." });
    }

    // Réparations
    var rep = tachesDe("reparation"), etatRep = etatTaches(rep);
    if (!etatRep) c.etape("vehicule", "reparations", "NonApplicable", null, "Aucune réparation signalée par l'atelier.");
    else {
      c.etape("vehicule", "reparations", etatRep, "atelier", rep.filter(function (x) { return x.statut !== "Terminee"; }).map(function (x) { return x.libelle + " (" + c.ref.statutsTache[x.statut].toLowerCase() + ")"; }).join(" · ") || "Réparations terminées.");
      rep.filter(function (x) { return x.statut !== "Terminee"; }).forEach(function (x) {
        c.signaler({ code: "reparation", niveau: x.statut === "EnAttentePiece" ? "critique" : "attente", axe: "vehicule", etape: "reparations", departement: "atelier", depuis: x.depuis,
          nature: "Réparation : " + x.libelle + " (" + c.ref.statutsTache[x.statut].toLowerCase() + ").", impact: "Le véhicule ne peut pas être déclaré prêt.",
          action: "Terminer la réparation.", actionVendeur: a.disponibiliteEstimee ? "Informer le client de la date estimée." : "Consulter l'état et préparer une communication au client." });
      });
    }

    // Nettoyage et préparation
    var net = tachesDe("nettoyage").concat(tachesDe("preparation"));
    var etatNet = PRET.indexOf(s) >= 0 ? "Terminee" : s === "NettoyageEnCours" ? "EnCours" : "NonCommencee";
    var netTaches = etatTaches(net);
    if (netTaches && netTaches !== "Terminee" && etatNet === "Terminee") etatNet = netTaches;
    c.etape("vehicule", "nettoyage", etatNet, "atelier", net.filter(function (x) { return x.statut !== "Terminee"; }).map(function (x) { return x.libelle; }).join(" · ") || null);

    // Prêt
    var pret = PRET.indexOf(s) >= 0 && ["inspection", "reparations", "nettoyage"].every(function (k) { return ["Terminee", "NonApplicable"].indexOf(c.etapes[k].etat) >= 0; });
    c.etape("vehicule", "pret", pret ? "Terminee" : "NonCommencee", "atelier", pret ? null : a.disponibiliteEstimee ? "Disponibilité estimée par l'atelier : " + new Date(a.disponibiliteEstimee).toLocaleDateString("fr-CA") + "." : "Date de disponibilité non communiquée.");
    if (!pret && s && etatNet !== "Terminee" && !regression && insp === "Terminee" && etatRep !== "Bloquee") {
      c.signaler({ code: "preparation", niveau: "attente", axe: "vehicule", etape: "nettoyage", departement: "atelier", depuis: dernier ? dernier.date : t.dateCreation,
        nature: s === "NettoyageEnCours" ? "Nettoyage en cours." : "Nettoyage et préparation à faire.", impact: "Le véhicule ne peut pas être déclaré prêt.",
        action: "Terminer la préparation du véhicule.", actionVendeur: null });
    }
    if (!pret && !a.disponibiliteEstimee && s) {
      c.signaler({ code: "disponibilite-inconnue", niveau: "information", axe: "vehicule", etape: "pret", departement: "atelier", depuis: dernier ? dernier.date : t.dateCreation,
        nature: "Date de disponibilité du véhicule non communiquée.", impact: "La date de livraison ne peut pas encore être fixée.",
        action: "Communiquer une date estimée lorsqu'elle est connue.", actionVendeur: null });
    }
  }
  function libelleVehicule(c, s) {
    return c.ref.statutsVehicule ? c.ref.statutsVehicule[s] || s : s;
  }

  // ---------- Axe 4 : livraison ----------
  function axeLivraison(c) {
    var t = c.t, adm = t.administratif || {}, liv = t.livraison || {};
    var autresPrets = ["commercial", "paiement", "vehicule"].every(function (axe) { return axeTermine(c, axe); });

    if (adm.statut === "Confirme") c.etape("livraison", "administratif", "Terminee", "administration", "Éléments administratifs confirmés ; vente enregistrée.", adm.depuis);
    else if (adm.statut === "EnCours") {
      c.etape("livraison", "administratif", "EnCours", "administration", null, adm.depuis);
      c.signaler({ code: "administratif", niveau: "attente", axe: "livraison", etape: "administratif", departement: "administration", depuis: adm.depuis,
        nature: "Éléments administratifs en cours de vérification.", impact: "La vente ne peut pas être enregistrée ni le véhicule livré.",
        action: "Vérifier et confirmer les éléments administratifs requis.", actionVendeur: null });
    } else {
      c.etape("livraison", "administratif", "NonCommencee", "administration");
      // Sans date de début connue, cette attente n'est pas considérée comme prolongée.
      c.signaler({ code: "administratif", niveau: autresPrets ? "attente" : "information", axe: "livraison", etape: "administratif", departement: "administration", depuis: adm.depuis || null,
        nature: "Éléments administratifs requis non confirmés.", impact: autresPrets ? "Dernière condition avant la livraison." : "Requis avant la livraison, sans bloquer les étapes en cours.",
        action: "Vérifier les éléments administratifs requis.", actionVendeur: null });
    }

    var date = liv.datePrevue;
    c.etape("livraison", "date", date ? "Terminee" : "NonCommencee", "conseiller", date ? new Date(date).toLocaleDateString("fr-CA") : "Non confirmée.");
    var rdv = c.rdvLivraison;
    if (rdv) c.etape("livraison", "rendezvous", rdv.statut === "Termine" || rdv.statut === "Confirme" || rdv.statut === "EnCours" ? "Terminee" : "EnCours", "conseiller",
      (c.ref.statutsRendezVous && c.ref.statutsRendezVous[rdv.statut]) || rdv.statut, rdv.debut);
    else c.etape("livraison", "rendezvous", "NonCommencee", "conseiller");

    c.etape("livraison", "remise-vehicule", liv.remiseLe ? "Terminee" : "NonCommencee", "conseiller", null, liv.remiseLe);
    c.etape("livraison", "livraison", liv.confirmeeLe ? "Terminee" : "NonCommencee", "conseiller", null, liv.confirmeeLe);
  }

  // La validation commerciale est entamée dès qu'une confirmation, une demande de remise ou une évaluation a eu lieu.
  function validationEntamee(t) {
    var com = t.commercial || {}, r = t.reprise;
    return !!(com.prixConfirme || com.optionsConfirmees || ["Demandee", "Approuvee", "Refusee"].indexOf(com.remise) >= 0 ||
      (r && ["Envisagee", "InformationsManquantes"].indexOf(r.statut) < 0));
  }

  function axeTermine(c, axe) {
    return Object.keys(c.etapes).filter(function (k) { return c.etapes[k].axe === axe; })
      .every(function (k) { return ["Terminee", "NonApplicable"].indexOf(c.etapes[k].etat) >= 0; });
  }

  // ---------- Préparation à la livraison ----------
  // Les conditions sont vérifiées une par une : un pourcentage élevé ne suffit jamais.
  function conditionsLivraison(c) {
    var t = c.t, f = t.financement || {};
    var conds = [];
    function cond(cle, libelle, ok, responsable, detail) {
      conds.push({ cle: cle, libelle: libelle, ok: !!ok, responsable: responsable, responsableLibelle: c.departement(responsable).libelle, detail: detail || null });
    }
    cond("proposition", "Proposition retenue (version figée)", !t.brouillon && !!t.proposition, "conseiller");
    cond("commercial", "Validation commerciale effectuée", axeTermine(c, "commercial"), premierResponsable(c, "commercial"));
    cond("mode", "Mode d'achat déterminé", t.modeAchat && t.modeAchat !== "indetermine" && f.statut !== "Annule", "conseiller");
    if (avecFinancement(t)) {
      var ok = f.statut === "Approuve" || (f.statut === "ApprouveSousConditions" && (f.conditions || []).every(function (x) { return x.remplie; }));
      cond("financement", "Financement confirmé par F&A", ok, "fa", c.ref.statutsFinancement[f.statut]);
    }
    var paiementOk = ["depot", "paiement"].every(function (k) { return ["Terminee", "NonApplicable"].indexOf(c.etapes[k].etat) >= 0; });
    cond("paiement", "Conditions de paiement remplies", paiementOk, paiementOk ? "administration" : premierResponsable(c, "paiement", ["depot", "paiement"]));
    if (t.reprise) cond("reprise", "Reprise finalisée", t.reprise.statut === "Acceptee", t.reprise.statut === "Acceptee" ? "client" : premierResponsable(c, "commercial", ["reprise"]), c.ref.statutsReprise[t.reprise.statut]);
    cond("vehicule", "Véhicule prêt", axeTermine(c, "vehicule"), "atelier");
    cond("administratif", "Éléments administratifs confirmés", (t.administratif || {}).statut === "Confirme", "administration");
    var critiques = c.elements.filter(function (e) { return e.niveau === "critique"; });
    cond("blocages", "Aucun blocage critique restant", !critiques.length, critiques.length ? critiques[0].departement : "conseiller", critiques.length ? critiques.length + " blocage(s)" : null);
    return conds;
  }
  function premierResponsable(c, axe, cles) {
    var e = Object.keys(c.etapes).map(function (k) { return c.etapes[k]; }).filter(function (x) {
      return x.axe === axe && (!cles || cles.indexOf(x.cle) >= 0) && ["Terminee", "NonApplicable"].indexOf(x.etat) < 0;
    })[0];
    return e && e.responsable ? e.responsable : "conseiller";
  }

  // ---------- Analyse complète ----------
  function analyser(t, ctx) {
    var c = new Contexte(t, ctx);
    axeCommercial(c);
    axePaiement(c);
    axeVehicule(c);
    axeLivraison(c);

    var actif = CLOS.indexOf(t.statut) < 0;
    // Une transaction close garde ses étapes, mais plus aucune alerte.
    if (!actif) c.elements = [];

    var axes = c.ref.axes.map(function (a) {
      var etapes = Object.keys(c.etapes).map(function (k) { return c.etapes[k]; }).filter(function (e) { return e.axe === a.cle; });
      var applicables = etapes.filter(function (e) { return e.etat !== "NonApplicable"; });
      var faites = applicables.filter(function (e) { return e.etat === "Terminee"; }).length;
      var etat = faites === applicables.length ? "Terminee"
        : etapes.some(function (e) { return e.etat === "Bloquee"; }) ? "Bloquee"
        : etapes.some(function (e) { return e.etat === "EnAttente"; }) ? "EnAttente"
        : faites || etapes.some(function (e) { return e.etat === "EnCours"; }) ? "EnCours" : "NonCommencee";
      return { cle: a.cle, libelle: a.libelle, etapes: etapes, faites: faites, total: applicables.length, etat: etat };
    });
    var total = axes.reduce(function (s, a) { return s + a.total; }, 0);
    var faites = axes.reduce(function (s, a) { return s + a.faites; }, 0);
    var prerequis = Object.keys(c.etapes).map(function (k) { return c.etapes[k]; }).filter(function (e) {
      return e.etat !== "NonApplicable" && (e.axe !== "livraison" || e.cle === "administratif");
    });
    var prerequisFaits = prerequis.filter(function (e) { return e.etat === "Terminee"; }).length;

    var conditions = conditionsLivraison(c);
    var pret = actif && conditions.every(function (x) { return x.ok; });
    var ordre = { critique: 0, action: 1, attente: 2, information: 3 };
    var elements = c.elements.slice().sort(function (a, b) { return ordre[a.niveau] - ordre[b.niveau]; });
    var critiques = elements.filter(function (e) { return e.niveau === "critique"; });

    var statut = t.statut === "Annulee" ? "Annulee" : t.statut === "Cloturee" ? "Cloturee" : t.statut === "Livree" ? "Livree" : t.statut === "EnAttente" ? "EnAttente"
      : pret && ctx.rdvLivraison ? "LivraisonPlanifiee" : pret ? "PreteALivrer" : critiques.length ? "Bloquee" : "Active";

    var etapePipeline = statut === "Annulee" || statut === "Cloturee" ? "Terminee" : statut === "Livree" ? "Livree" : pret ? "PreteALivrer"
      : t.brouillon || !t.proposition ? "Ouverte"
      : !axeTermine(c, "commercial") ? (validationEntamee(t) ? "ValidationCommerciale" : "PropositionRetenue")
      : !axeTermine(c, "paiement") ? "PaiementFinancement" : "PreparationVehicule";

    var departementsAttendus = [];
    elements.forEach(function (e) {
      if (e.proprietaire === "departement" && e.niveau !== "information" && departementsAttendus.indexOf(e.departement) < 0) departementsAttendus.push(e.departement);
    });

    return {
      axes: axes,
      etapes: c.etapes,
      elements: elements,
      blocages: critiques,
      actionsVendeur: elements.filter(function (e) { return e.proprietaire === "vendeur" && e.niveau !== "information"; }),
      departementsAttendus: departementsAttendus.map(function (k) { return c.departement(k); }),
      conditions: conditions,
      conditionsRestantes: conditions.filter(function (x) { return !x.ok; }),
      pret: pret,
      progression: { faites: faites, total: total, pct: total ? Math.round((faites * 100) / total) : 0 },
      // Complétude des prérequis de la livraison : indicative, ne remplace jamais les conditions.
      preparation: { faites: prerequisFaits, total: prerequis.length, pct: prerequis.length ? Math.round((prerequisFaits * 100) / prerequis.length) : 0 },
      statut: statut,
      etapePipeline: etapePipeline,
      prochaineAction: prochaineAction(t, elements, pret, ctx.rdvLivraison, c),
    };
  }

  // Recommandation locale et déterministe, limitée à cette transaction.
  function prochaineAction(t, elements, pret, rdv, c) {
    if (t.statut === "Annulee") return { texte: "Aucune : transaction annulée.", responsable: null };
    if (t.statut === "Cloturee") return { texte: "Aucune : dossier clôturé.", responsable: null };
    if (t.statut === "Livree") return { texte: "Clôturer le dossier une fois les derniers éléments réglés.", responsable: c.departement("conseiller") };
    if (t.statut === "EnAttente") return { texte: "Reprendre la transaction lorsque le client est prêt.", responsable: c.departement("conseiller") };
    var vendeur = elements.filter(function (e) { return e.proprietaire === "vendeur" && e.niveau !== "information" && e.actionVendeur; })[0];
    var critique = elements.filter(function (e) { return e.niveau === "critique"; })[0];
    if (critique && critique.proprietaire === "vendeur") return { texte: critique.actionVendeur || critique.action, responsable: c.departement("conseiller"), code: critique.code };
    if (vendeur) return { texte: vendeur.actionVendeur, responsable: c.departement("conseiller"), code: vendeur.code };
    if (critique) return { texte: critique.action, responsable: c.departement(critique.departement), code: critique.code };
    if (pret && !rdv) return { texte: "Planifier le rendez-vous de livraison avec le client.", responsable: c.departement("conseiller"), code: "planifier-livraison" };
    if (pret && !(t.livraison || {}).remiseLe) return { texte: "Préparer la livraison prévue.", responsable: c.departement("conseiller"), code: "livrer" };
    if (pret) return { texte: "Confirmer la livraison.", responsable: c.departement("conseiller"), code: "confirmer-livraison" };
    var attente = elements.filter(function (e) { return e.niveau === "attente"; })[0];
    if (attente) return { texte: "Suivre : " + attente.action.charAt(0).toLowerCase() + attente.action.slice(1), responsable: c.departement(attente.departement), code: attente.code };
    return { texte: "Faire le point avec le client.", responsable: c.departement("conseiller") };
  }

  var api = { analyser: analyser, avecFinancement: avecFinancement, ordreVehicule: ORDRE_VEHICULE, vehiculePret: PRET, clos: CLOS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else racine.TransactionsRegles = api;
})(this);
