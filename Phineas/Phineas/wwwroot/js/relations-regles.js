// Relations clients — règles métier locales (prototype frontend, phase 07).
// Fonctions pures : aucune lecture du DOM ni du stockage, utilisables dans Node. Le store (relations-store.js) leur
// fournit des données déjà rassemblées ; les recommandations d'action restent produites par le moteur de la phase 06
// (intelligence-regles.js), qui consomme les états calculés ici.
//
// Principes : un motif supposé n'est jamais présenté comme confirmé ; aucune probabilité de récupération, de
// satisfaction ou de recommandation n'est calculée ; un taux sans dénominateur est « non disponible ».
(function (racine) {
  "use strict";

  var JOUR = 86400000;
  var RECUPERABLES = ["a-verifier", "attente-evenement", "suivi-planifie"];
  // Motifs pour lesquels un événement extérieur (véhicule, budget, financement…) peut changer la situation.
  var MOTIFS_EVENEMENT = ["vehicule-indisponible", "budget-incompatible", "caracteristiques-absentes", "financement-refuse", "prix-eleve", "delais", "conditions-refusees"];
  // Motifs pour lesquels une correspondance d'inventaire peut répondre au besoin (Vehicle Matching Engine).
  var MOTIFS_MATCHING = ["vehicule-indisponible", "budget-incompatible", "caracteristiques-absentes"];
  var PROBLEMES_OUVERTS = ["Nouveau", "EnCours", "AttenteDepartement", "AttenteClient"];
  var CONFIRMEES = ["client", "vendeur-confirme"];

  function jours(a, b) {
    return (new Date(b) - new Date(a)) / JOUR;
  }

  // ---------- Clôture d'une opportunité perdue ----------
  // Ne force jamais une raison : « motif inconnu » est une réponse valable, mais il ne peut pas être « confirmé ».
  function validerCloture(x, ref) {
    var erreurs = {};
    if (!x.motif || !ref.motifsPerte[x.motif]) erreurs.motif = "Choisissez un motif (« Motif inconnu » est accepté).";
    if (!x.origine || !ref.originesMotif[x.origine]) erreurs.origine = "Indiquez l'origine du motif.";
    if (x.motif === "inconnu" && x.origine && x.origine !== "inconnu") erreurs.origine = "Un motif inconnu ne peut pas être déclaré ou confirmé.";
    if (x.motif && x.motif !== "inconnu" && x.origine === "inconnu") erreurs.origine = "Choisissez « hypothèse » si le motif n'est pas confirmé.";
    if (x.motif === "autre" && !String(x.commentaire || "").trim()) erreurs.commentaire = "Précisez le motif « Autre » en commentaire.";
    if (x.restriction && !ref.restrictions[x.restriction]) erreurs.restriction = "Restriction inconnue.";
    if (x.dateReprise && !x.suiviPossible) erreurs.dateReprise = "Une date de reprise suppose qu'un futur suivi est possible.";
    return erreurs;
  }
  function estConfirme(cl) {
    return CONFIRMEES.indexOf(cl.origine) >= 0 && cl.motif !== "inconnu";
  }

  // ---------- Opportunity Recovery Engine ----------
  // ctx : { opportunite, transactions (de l'opportunité), arret (bool), maintenant }.
  // Renvoie { cle, raison } ; aucune probabilité, seulement une catégorie justifiée.
  function etatRecuperation(cl, ctx) {
    var o = ctx.opportunite || {};
    if (cl.reactivation) {
      var vendue = o.etape === "Gagne" || (ctx.transactions || []).some(function (t) { return t.statut === "Livree" || t.statut === "Cloturee"; });
      if (vendue) return { cle: "recuperee", raison: "Réactivée le " + dateTexte(cl.reactivation.le) + ", puis vente conclue et livrée." };
      return { cle: "reactivee", raison: "Réactivée par le conseiller : " + cl.reactivation.evenement };
    }
    if (cl.restriction === "ne-plus-contacter" || ctx.arret) return { cle: "aucune", raison: "Le client ne souhaite plus être sollicité : aucune démarche de récupération." };
    if (!cl.suiviPossible) return { cle: "aucune", raison: "Le conseiller n'envisage pas de futur suivi." };
    // Un motif supposé ou inconnu doit d'abord être vérifié (l'absence de réponse ne prouve pas un achat ailleurs).
    if (cl.motif === "inconnu" || cl.origine === "hypothese" || cl.origine === "inconnu") return { cle: "a-verifier", raison: cl.origine === "hypothese" ? "Motif supposé, non confirmé : à vérifier avant toute démarche." : "Motif inconnu : vérifier si une information est disponible." };
    if (cl.motif === "achat-ailleurs") return { cle: "aucune", raison: "Le client a acheté ailleurs : aucune relance commerciale. Un futur projet donnera lieu à une nouvelle opportunité distincte." };
    if (cl.motif === "experience-insatisfaisante") return { cle: "a-verifier", raison: "Expérience insatisfaisante : une action de service est prioritaire, pas une relance commerciale." };
    if (cl.dateReprise) return { cle: "suivi-planifie", raison: "Reprise de contact souhaitée le " + dateTexte(cl.dateReprise) + "." };
    if (cl.conditions || MOTIFS_EVENEMENT.indexOf(cl.motif) >= 0) return { cle: "attente-evenement", raison: cl.conditions ? "Condition de réactivation : " + cl.conditions : "Un changement de situation pourrait justifier une reprise." };
    return { cle: "a-verifier", raison: "Aucune condition de récupération définie." };
  }
  function estRecuperable(cle) {
    return RECUPERABLES.indexOf(cle) >= 0;
  }
  // Une réactivation n'est possible que sur décision du conseiller, après un événement pertinent, sans restriction.
  function refusReactivation(cl, ctx) {
    if (!cl) return "Aucune clôture enregistrée pour cette opportunité.";
    if (cl.reactivation) return "L'opportunité a déjà été réactivée.";
    if (cl.restriction === "ne-plus-contacter" || ctx.arret) return "Le client a demandé à ne plus être sollicité.";
    if (cl.motif === "achat-ailleurs" && estConfirme(cl)) return "Le client a acheté ailleurs : créez une nouvelle opportunité distincte s'il manifeste un nouveau projet.";
    if (!String(ctx.evenement || "").trim()) return "Décrivez l'événement pertinent qui justifie la reprise.";
    return null;
  }

  // ---------- Fiche d'analyse : faits enregistrés et inconnues ----------
  // d : { cloture, opportunite, soumissions:[{reference, statut, numero}], rendezVous:[{type, statut}], interactions, retour, completude }
  function analyse(d, ref) {
    var cl = d.cloture, o = d.opportunite || {}, q = o.qualification || {};
    var faits = [], inconnus = [], interpretations = [];
    faits.push("Opportunité clôturée comme perdue le " + dateTexte(cl.date) + " par " + cl.auteur + ", à l'étape « " + (d.etapeLibelle || cl.etapeAtteinte) + " ».");
    if (d.soumissions.length) faits.push(d.soumissions.length + " soumission(s) : " + d.soumissions.map(function (s) { return s.reference + " v" + s.numero + " (" + s.statutLibelle.toLowerCase() + ")"; }).join(", ") + ".");
    else inconnus.push("Aucune soumission n'a été préparée : le client n'a pas reçu de proposition chiffrée.");
    if (d.rendezVous.length) faits.push(d.rendezVous.length + " rendez-vous : " + d.rendezVous.map(function (r) { return r.typeLibelle.toLowerCase() + " (" + r.statutLibelle.toLowerCase() + ")"; }).join(", ") + ".");
    var contacts = d.contacts || [];
    if (contacts.length) faits.push(contacts.length + " contact(s) déclaré(s) avec le client, le dernier " + dateTexte(contacts[0].date) + ".");
    if (estConfirme(cl)) faits.push("Motif : " + ref.motifsPerte[cl.motif].toLowerCase() + " — " + ref.originesMotif[cl.origine].toLowerCase() + ".");
    else if (cl.origine === "hypothese") interpretations.push("Hypothèse du conseiller : " + ref.motifsPerte[cl.motif].toLowerCase() + ". Elle n'est pas confirmée par le client.");
    if (cl.motif === "inconnu") inconnus.push("La raison pour laquelle le client n'a pas poursuivi.");
    if (cl.origine === "hypothese") inconnus.push("La confirmation du motif par le client.");
    if (d.retour) {
      faits.push("Retour volontaire du client reçu le " + dateTexte(d.retour.recuLe) + (d.retour.raison ? " : « " + d.retour.raison + " »" : "") + ".");
      if (d.retour.informerSiDisponible === true) faits.push("Le client accepte d'être informé si un véhicule correspondant devient disponible.");
      if (d.retour.informerSiDisponible === false) faits.push("Le client ne souhaite pas être informé de nouveaux véhicules.");
    } else inconnus.push("Le point de vue du client : aucun retour volontaire reçu.");
    if (d.completude && d.completude.manquants.length) inconnus.push("Besoins non qualifiés : " + d.completude.manquants.join(", ").toLowerCase() + ".");
    if (cl.motif === "achat-ailleurs" && cl.origine !== "client") inconnus.push("Le véhicule acheté et la concession choisie (non déclarés par le client).");
    if (cl.commentaire) (estConfirme(cl) ? faits : interpretations).push("Note du conseiller : « " + cl.commentaire + " »");
    if (!q.budgetTotal && !q.budgetMensuel) inconnus.push("Le budget du client.");
    return { faits: faits, inconnus: inconnus, interpretations: interpretations };
  }

  // ---------- Satisfaction ----------
  // Moyennes par dimension (éléments non évalués exclus) ; jamais de « note du vendeur » globale déduite.
  function dimensions(enquete, ref) {
    return ref.dimensions.map(function (d) {
      var notes = d.elements.map(function (e) { return enquete.reponses[e.cle]; }).filter(function (v) { return typeof v === "number"; });
      var moyenne = notes.length ? Math.round(notes.reduce(function (s, v) { return s + v; }, 0) / notes.length * 10) / 10 : null;
      return { cle: d.cle, libelle: d.libelle, departement: d.departement, moyenne: moyenne, minimum: notes.length ? Math.min.apply(null, notes) : null, evalues: notes.length, total: d.elements.length };
    });
  }
  function insatisfactions(enquete, ref) {
    var cfg = ref.config;
    var dims = dimensions(enquete, ref).filter(function (d) { return d.minimum != null && d.minimum <= cfg.seuilInsatisfait; });
    return { globale: enquete.globale <= cfg.seuilInsatisfait, dimensions: dims };
  }
  function estSatisfait(enquete, ref) {
    return enquete.globale >= ref.config.seuilSatisfait;
  }
  function problemeOuvert(p) {
    return PROBLEMES_OUVERTS.indexOf(p.statut) >= 0;
  }
  // Conditions préalables à une invitation facultative. Une excellente note n'est pas un consentement : le conseiller
  // valide toujours la démarche ; ici, on indique seulement si elle peut être envisagée et pourquoi.
  // ctx : { transaction, enquete, problemes, arret, consentement, invitation, maintenant }
  function eligibiliteInvitation(ctx, ref) {
    var cfg = ref.config, raisons = [], t = ctx.transaction;
    var livree = t && (t.statut === "Livree" || t.statut === "Cloturee") && t.livraison && t.livraison.confirmeeLe;
    if (!livree) raisons.push("La livraison n'est pas confirmée.");
    if (!ctx.enquete) raisons.push("Aucun suivi de satisfaction n'a été reçu.");
    else if (!estSatisfait(ctx.enquete, ref)) raisons.push("Le client ne s'est pas déclaré satisfait.");
    else if (ctx.enquete.interetRecommander === false) raisons.push("Le client a indiqué ne pas souhaiter recommander.");
    var ouverts = (ctx.problemes || []).filter(problemeOuvert);
    if (ouverts.length) raisons.push(ouverts.length + " problème(s) après-vente ouvert(s).");
    var aVerifier = (ctx.problemes || []).filter(function (p) { return p.statut === "Resolu" && !p.verifieLe; });
    if (aVerifier.length) raisons.push("Résolution d'un problème à vérifier avec le client.");
    if (ctx.arret) raisons.push("Le client ne souhaite plus être sollicité.");
    if (ctx.consentement === "retire") raisons.push("Consentement retiré.");
    if (ctx.invitation) raisons.push("Une invitation a déjà été préparée (" + dateTexte(ctx.invitation.prepareeLe) + ").");
    if (livree && jours(t.livraison.confirmeeLe, ctx.maintenant) > cfg.fenetreInvitationJours) raisons.push("Livraison il y a plus de " + cfg.fenetreInvitationJours + " jours (règle de démonstration).");
    return { eligible: raisons.length === 0, raisons: raisons };
  }

  // ---------- Referral Loop ----------
  function normaliserCourriel(c) {
    return String(c || "").trim().toLowerCase();
  }
  function normaliserTelephone(t) {
    var x = String(t || "").replace(/\D/g, "");
    return x.length === 11 && x.charAt(0) === "1" ? x.slice(1) : x;
  }
  function normaliserNom(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");
  }
  // Doublon : même courriel ou même téléphone ; un homonyme sans coordonnée commune n'est pas un doublon.
  function chercherDoublon(contacts, d) {
    var c = normaliserCourriel(d.courriel), t = normaliserTelephone(d.telephone);
    var trouve = contacts.filter(function (x) {
      return (c && normaliserCourriel(x.courriel) === c) || (t && t.length >= 10 && normaliserTelephone(x.telephone) === t);
    })[0];
    if (trouve) return { contact: trouve, raison: c && normaliserCourriel(trouve.courriel) === c ? "courriel" : "telephone" };
    var homonyme = contacts.filter(function (x) { return normaliserNom(x.prenom + x.nom) === normaliserNom(d.prenom + d.nom); })[0];
    return homonyme ? { contact: null, homonyme: homonyme } : null;
  }
  function validerDemandePublique(d) {
    var e = {};
    if (!String(d.prenom || "").trim()) e.prenom = "Indiquez votre prénom.";
    if (!String(d.nom || "").trim()) e.nom = "Indiquez votre nom.";
    if (!String(d.courriel || "").trim() && !String(d.telephone || "").trim()) e.contact = "Indiquez un courriel ou un téléphone.";
    if (d.courriel && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(d.courriel).trim())) e.courriel = "Courriel invalide.";
    if (d.telephone && normaliserTelephone(d.telephone).length < 10) e.telephone = "Téléphone invalide.";
    if (!d.consentementContact) e.consentementContact = "Votre accord est nécessaire pour que le conseiller vous réponde.";
    return e;
  }
  // État d'une recommandation, lu dans le pipeline commercial normal (aucun parcours parallèle).
  function etatRecommandation(o, transactions) {
    if (!o) return "nouveau";
    if (o.etape === "Gagne" || (transactions || []).some(function (t) { return t.statut === "Livree" || t.statut === "Cloturee"; })) return "gagne";
    if (o.etape === "Perdu") return "perdu";
    if (o.etape === "Nouveau") return "nouveau";
    if (o.etape === "AQualifier") return "qualification";
    return "en-cours";
  }
  // Entonnoir sur une population cohérente : chaque étape ne compte que les prospects ayant franchi les précédentes.
  // items : [{ qualifiee, rendezVous, transaction, livree }] ; taux = null si le dénominateur est nul.
  function entonnoir(items) {
    var etapes = [
      { cle: "prospects", libelle: "Nouveaux prospects recommandés", test: function () { return true; } },
      { cle: "qualifiees", libelle: "Opportunités qualifiées", test: function (x) { return x.qualifiee; } },
      { cle: "rendezvous", libelle: "Rendez-vous obtenus", test: function (x) { return x.rendezVous; } },
      { cle: "transactions", libelle: "Transactions conclues", test: function (x) { return x.transaction; } },
    ];
    var pop = items.slice(), prec = null;
    return etapes.map(function (e) {
      pop = pop.filter(e.test);
      var r = { cle: e.cle, libelle: e.libelle, nombre: pop.length, taux: prec == null ? null : prec === 0 ? null : Math.round(pop.length / prec * 100), denominateur: prec };
      prec = pop.length;
      return r;
    });
  }
  function taux(num, den) {
    return den ? Math.round(num / den * 100) : null;
  }

  // ---------- Relationship Analytics ----------
  function dansPeriode(date, periode, maintenant) {
    if (!periode) return true;
    return jours(date, maintenant) <= periode && new Date(date) <= new Date(maintenant);
  }
  // clotures : [{ motif, origine, etapeAtteinte, date, etatRecuperation }]
  function statistiquesPertes(clotures) {
    var parMotif = {}, parEtape = {};
    clotures.forEach(function (c) {
      var m = parMotif[c.motif] = parMotif[c.motif] || { motif: c.motif, confirmes: 0, hypotheses: 0, inconnus: 0, total: 0 };
      m.total++;
      if (c.motif === "inconnu" || c.origine === "inconnu") m.inconnus++;
      else if (c.origine === "hypothese") m.hypotheses++;
      else m.confirmes++;
      parEtape[c.etapeAtteinte] = (parEtape[c.etapeAtteinte] || 0) + 1;
    });
    var reactivees = clotures.filter(function (c) { return c.etatRecuperation === "reactivee" || c.etatRecuperation === "recuperee"; });
    return {
      total: clotures.length,
      confirmes: clotures.filter(function (c) { return estConfirme(c); }).length,
      hypotheses: clotures.filter(function (c) { return c.origine === "hypothese"; }).length,
      inconnus: clotures.filter(function (c) { return c.motif === "inconnu"; }).length,
      parMotif: Object.keys(parMotif).map(function (k) { return parMotif[k]; }).sort(function (a, b) { return b.total - a.total; }),
      parEtape: parEtape,
      recuperables: clotures.filter(function (c) { return estRecuperable(c.etatRecuperation); }).length,
      reactivees: reactivees.length,
      recuperees: clotures.filter(function (c) { return c.etatRecuperation === "recuperee"; }).length,
    };
  }
  // livraisons : transactions livrées de la période ; enquetes : enquêtes de ces transactions ; problemes : de ces transactions.
  function statistiquesSatisfaction(livraisons, enquetes, problemes, ref) {
    var parDimension = ref.dimensions.map(function (d) {
      var moyennes = enquetes.map(function (e) { return dimensions(e, ref).filter(function (x) { return x.cle === d.cle; })[0].moyenne; }).filter(function (v) { return v != null; });
      return { cle: d.cle, libelle: d.libelle, observations: moyennes.length, moyenne: moyennes.length ? Math.round(moyennes.reduce(function (s, v) { return s + v; }, 0) / moyennes.length * 10) / 10 : null };
    });
    var repartition = {};
    Object.keys(ref.echelle).forEach(function (k) { repartition[k] = 0; });
    enquetes.forEach(function (e) { repartition[String(e.globale)]++; });
    var resolus = problemes.filter(function (p) { return p.resoluLe; });
    var delais = resolus.map(function (p) { return jours(p.signaleLe, p.resoluLe); });
    return {
      livraisons: livraisons.length,
      reponses: enquetes.length,
      tauxReponse: taux(enquetes.length, livraisons.length),
      repartition: repartition,
      parDimension: parDimension,
      problemesOuverts: problemes.filter(problemeOuvert).length,
      problemesResolus: problemes.filter(function (p) { return !problemeOuvert(p); }).length,
      delaiMoyenResolutionJours: delais.length ? Math.round(delais.reduce(function (s, v) { return s + v; }, 0) / delais.length * 10) / 10 : null,
      observationsDelai: delais.length,
    };
  }
  // Une conclusion n'est proposée qu'au-delà d'un nombre minimal d'observations.
  function echantillon(n, ref) {
    var min = ref.config.observationsMinimales;
    if (!n) return { suffisant: false, texte: "Aucune observation sur la période." };
    if (n < min) return { suffisant: false, texte: n + " observation(s) : échantillon insuffisant pour tirer une conclusion (seuil indicatif : " + min + ")." };
    return { suffisant: true, texte: n + " observations." };
  }

  function dateTexte(d) {
    return d ? new Date(d).toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" }) : "—";
  }

  var api = {
    validerCloture: validerCloture,
    estConfirme: estConfirme,
    etatRecuperation: etatRecuperation,
    estRecuperable: estRecuperable,
    refusReactivation: refusReactivation,
    motifsMatching: MOTIFS_MATCHING,
    analyse: analyse,
    dimensions: dimensions,
    insatisfactions: insatisfactions,
    estSatisfait: estSatisfait,
    problemeOuvert: problemeOuvert,
    eligibiliteInvitation: eligibiliteInvitation,
    normaliserCourriel: normaliserCourriel,
    normaliserTelephone: normaliserTelephone,
    chercherDoublon: chercherDoublon,
    validerDemandePublique: validerDemandePublique,
    etatRecommandation: etatRecommandation,
    entonnoir: entonnoir,
    taux: taux,
    dansPeriode: dansPeriode,
    statistiquesPertes: statistiquesPertes,
    statistiquesSatisfaction: statistiquesSatisfaction,
    echantillon: echantillon,
    dateTexte: dateTexte,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else racine.RelationsRegles = api;
})(this);
