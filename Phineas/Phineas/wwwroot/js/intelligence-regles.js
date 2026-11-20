// Phineas Sales Intelligence Engine — détection et priorisation (prototype frontend).
// Fonctions pures : aucune lecture du DOM ni du stockage. Le store construit un « instantané » à partir des modules
// existants (en réutilisant leurs propres règles : actions requises des rendez-vous, analyse du Deal Control Tower)
// et ce module en déduit des recommandations.
//
// Identifiant stable = règle + objet + clé d'événement : la même situation donne toujours le même identifiant ;
// un nouvel événement pertinent (nouvelle version, nouveau contact, nouvelle échéance) en donne un nouveau.
(function (racine) {
  "use strict";

  var NIVEAUX = ["Faible", "Normal", "Eleve", "Urgent"];
  // Seules ces règles peuvent atteindre « Urgent » : la priorité n'est jamais gonflée arbitrairement.
  var URGENCE_POSSIBLE = ["premiere-reponse", "nouveau-prospect-recommande", "rdv-vehicule-indisponible", "rdv-a-confirmer", "soumission-expire"];
  // Interactions qui comptent comme un échange avec le client (un brouillon n'en est pas un).
  var ECHANGES = ["appel", "courriel", "visite", "texto", "relance", "note"];
  var HEURE = 3600000, JOUR = 86400000;
  var DATE_LISIBLE = { day: "numeric", month: "long" };

  function cleJour(d) {
    var x = new Date(d);
    return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
  }
  function debutJour(d) {
    var x = new Date(d); x.setHours(0, 0, 0, 0); return x;
  }
  function ecartJours(d, maintenant) {
    return Math.round((debutJour(d) - debutJour(maintenant)) / JOUR);
  }
  function joursDepuis(d, maintenant) {
    return Math.floor((maintenant - new Date(d)) / JOUR);
  }
  function plusRecent(a, b) {
    if (!a) return b; if (!b) return a;
    return new Date(a) > new Date(b) ? a : b;
  }

  function Moteur(ctx) {
    this.ctx = ctx;
    this.m = ctx.maintenant || new Date();
    this.cfg = ctx.ref.config;
    this.regles = {};
    var self = this;
    ctx.ref.regles.forEach(function (r) { self.regles[r.cle] = r; });
    this.actions = [];
    this.suspendues = [];
    this.parOpp = {};
    this.contacts = {}; ctx.contacts.forEach(function (c) { self.contacts[c.id] = c; });
    this.opps = {}; ctx.opportunites.forEach(function (o) { self.opps[o.id] = o; });
  }
  Moteur.prototype.oppActive = function (id) {
    var o = this.opps[id];
    return o && ["Gagne", "Perdu"].indexOf(o.etape) < 0;
  };
  Moteur.prototype.interactions = function (prospectId, oppId) {
    return this.ctx.interactions.filter(function (i) { return i.prospectId === prospectId && (!oppId || !i.opportuniteId || i.opportuniteId === oppId); });
  };
  Moteur.prototype.dernierEchange = function (prospectId, oppId, apres) {
    var l = this.interactions(prospectId, oppId).filter(function (i) { return ECHANGES.indexOf(i.type) >= 0 && (!apres || new Date(i.date) > new Date(apres)); });
    l.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    return l[0] || null;
  };
  Moteur.prototype.nomClient = function (pid) {
    var c = this.contacts[pid];
    return c ? c.prenom + " " + c.nom : "Prospect inconnu";
  };

  // Ajoute une recommandation (déduplication par identifiant) après application des préférences de contact.
  Moteur.prototype.ajouter = function (x) {
    var r = this.regles[x.regle];
    x.regleLibelle = r.libelle;
    x.categorie = r.categorie;
    x.nature = r.nature;
    x.client = this.nomClient(x.prospectId);
    x.conseillerId = x.conseillerId || (this.opps[x.opportuniteId] || {}).conseillerId || (this.contacts[x.prospectId] || {}).conseillerId;
    x.departement = x.departement || "conseiller";
    var pref = (this.ctx.preferences || {})[x.prospectId];
    var pause = (this.ctx.pauses || {})[x.opportuniteId];
    var pauseActive = pause && new Date(pause.jusqua) > this.m;
    var arret = pref && (pref.nePlusContacter || pref.consentement === "retire");
    // Sollicitations commerciales et rappels internes : suspendus si le client l'a demandé.
    if (x.nature !== "dossier" && arret) return this.suspendre(x, "Le client a demandé à ne plus être sollicité" + (pref.demandeArretLe ? " (le " + new Date(pref.demandeArretLe).toLocaleDateString("fr-CA", DATE_LISIBLE) + ")" : "") + ".");
    if (x.nature !== "dossier" && pauseActive) return this.suspendre(x, "Suivi en pause jusqu'au " + new Date(pause.jusqua).toLocaleDateString("fr-CA", DATE_LISIBLE) + " : " + pause.motif + ".");
    if (x.nature === "dossier" && arret) {
      x.avertissement = "Le client ne souhaite plus être sollicité : limitez-vous aux communications nécessaires au traitement de son dossier (distinction à valider juridiquement).";
    }
    if (pref && x.nature !== "interne") x.consentement = pref.consentement;
    if (this.actions.some(function (a) { return a.id === x.id; })) return null;
    prioriser(x, this);
    this.actions.push(x);
    (this.parOpp[x.opportuniteId] = this.parOpp[x.opportuniteId] || []).push(x);
    return x;
  };
  Moteur.prototype.suspendre = function (x, raison) {
    x.raisonSuspension = raison;
    if (!this.suspendues.some(function (a) { return a.id === x.id; })) this.suspendues.push(x);
    return null;
  };

  // ---------- Priorisation déterministe et explicable ----------
  function prioriser(x, mo) {
    // Priorité de base du catalogue, ou celle de l'objet lorsqu'il en porte une (ex. priorité d'un problème client).
    var base = x.prioriteBase || mo.regles[x.regle].priorite;
    var niveau = NIVEAUX.indexOf(base);
    var raisons = [x.prioriteBase ? "Priorité indiquée dans le dossier : " + mo.ctx.ref.libellesPriorite[base].toLowerCase() + "." : "Importance de la situation : " + mo.ctx.ref.libellesPriorite[base].toLowerCase() + " (règle « " + x.regleLibelle + " »)."];
    var m = mo.m;
    if (x.echeance) {
      var e = new Date(x.echeance);
      if (e < m) {
        niveau++;
        raisons.push("Échéance dépassée depuis " + (Math.floor((m - e) / JOUR) >= 1 ? Math.floor((m - e) / JOUR) + " j" : Math.max(1, Math.floor((m - e) / HEURE)) + " h") + ".");
      } else if (e - m < 6 * HEURE && niveau < 2) {
        niveau++;
        raisons.push("Échéance dans moins de 6 h.");
      }
    }
    if (x.blocageCritique) { niveau++; raisons.push("Un blocage critique empêche la prochaine étape."); }
    if (x.departement !== "conseiller") { niveau--; raisons.push("L'action dépend d'abord d'un autre département."); }
    if (x.etapePlanifiee) { niveau--; raisons.push("Une prochaine étape est déjà planifiée."); }
    if (x.horizon === "plus-tard") { niveau--; raisons.push("Achat prévu plus tard."); }
    niveau = Math.max(0, Math.min(3, niveau));
    if (niveau === 3 && URGENCE_POSSIBLE.indexOf(x.regle) < 0) { niveau = 2; raisons.push("Plafonné à « Élevé » : cette règle n'autorise pas l'urgence."); }
    x.priorite = NIVEAUX[niveau];
    x.raisonsPriorite = raisons;
    // Ordre de tri technique (jamais une probabilité d'achat) : niveau, puis échéance la plus proche.
    var ech = x.echeance ? new Date(x.echeance).getTime() : m.getTime() + 30 * JOUR;
    x.ordre = niveau * 1e13 - ech / 1000;
  }

  // ---------- Nouveaux prospects ----------
  function prospects(mo) {
    var c = mo.ctx, cfg = mo.cfg;
    c.opportunites.forEach(function (o) {
      if (!mo.oppActive(o.id)) return;
      var echange = mo.dernierEchange(o.prospectId, null, o.dateCreation);
      // Un rendez-vous déjà confirmé, tenu ou annulé par le client prouve un premier contact.
      if (o.etape === "Nouveau" && !echange && !o.rdvContact) {
        // Prospect recommandé : même délai de première réponse, avec l'attribution de la recommandation (une seule action).
        if (o.recommandation) {
          mo.ajouter({
            id: "nouveau-prospect-recommande:" + o.id, regle: "nouveau-prospect-recommande", prospectId: o.prospectId, opportuniteId: o.id, objet: { type: "opportunite", id: o.id },
            declencheur: "Demande reçue " + relatif(o.dateCreation, mo.m) + " par recommandation (" + o.recommandation.reference + ").", detecteLe: o.dateCreation,
            echeance: new Date(new Date(o.dateCreation).getTime() + cfg.delaiPremiereReponseHeures * HEURE).toISOString(),
            motif: "Le prospect a manifesté lui-même son intérêt ; aucune première réponse n'est encore enregistrée.", actionProposee: "Prendre en charge la nouvelle opportunité",
            contexte: [o.titre, "Attribution : " + o.recommandation.attribution + (o.recommandation.parrain ? " — recommandé par un client (" + o.recommandation.parrain + ")" : "")],
            resolution: "Un premier échange est enregistré.", expiration: "L'opportunité est clôturée.", relance: "premiere-reponse",
          });
          return;
        }
        mo.ajouter({
          id: "premiere-reponse:" + o.id, regle: "premiere-reponse", prospectId: o.prospectId, opportuniteId: o.id, objet: { type: "opportunite", id: o.id },
          declencheur: "Demande reçue " + relatif(o.dateCreation, mo.m) + ".", detecteLe: o.dateCreation,
          echeance: new Date(new Date(o.dateCreation).getTime() + cfg.delaiPremiereReponseHeures * HEURE).toISOString(),
          motif: "Aucune première réponse n'est enregistrée depuis la demande.", actionProposee: "Préparer une réponse initiale",
          contexte: [o.titre + (o.vehiculesEnvisages && o.vehiculesEnvisages.length ? " — " + o.vehiculesEnvisages.join(", ") : "")]
            .concat(o.provenance ? ["Provenance : " + o.provenance.source + " — " + o.provenance.methode + (o.provenance.campagne ? ", campagne « " + o.provenance.campagne + " »" : "") + (o.provenance.annonce ? ", annonce " + o.provenance.annonce : "")] : []),
          resolution: "Un premier échange (appel, courriel, visite…) est enregistré.", expiration: "L'opportunité est clôturée.",
          relance: "premiere-reponse",
        });
        return;
      }
      if ((o.etape === "Nouveau" || o.etape === "AQualifier") && o.completude && o.completude.remplis < cfg.seuilQualification) {
        mo.ajouter({
          id: "qualification-manquante:" + o.id, regle: "qualification-manquante", prospectId: o.prospectId, opportuniteId: o.id, objet: { type: "opportunite", id: o.id },
          declencheur: "Opportunité « " + o.titre + " » au stade « " + o.etapeLibelle + " ».", detecteLe: o.dateCreation, horizon: (o.qualification || {}).horizon,
          motif: "Qualification à " + o.completude.remplis + " / " + o.completude.total + " : " + o.completude.manquants.slice(0, 3).join(", ").toLowerCase() + (o.completude.manquants.length > 3 ? "…" : "."),
          actionProposee: "Compléter la qualification avec le client", contexte: ["Informations manquantes : " + o.completude.manquants.join(", ")],
          etapePlanifiee: o.rdvFutur, resolution: "Au moins " + cfg.seuilQualification + " informations de qualification renseignées.", expiration: "L'opportunité est clôturée.",
        });
      }
    });
  }

  // ---------- Soumissions ----------
  function soumissions(mo) {
    var cfg = mo.cfg;
    mo.ctx.soumissions.forEach(function (s) {
      if (!mo.oppActive(s.opportuniteId)) return;
      var v = s.courante;
      var base = { prospectId: s.prospectId, opportuniteId: s.opportuniteId, objet: { type: "soumission", id: s.id }, vehicule: v.vehiculeNom, conseillerId: s.conseillerId };
      function ajout(x) { var o = {}; Object.keys(base).forEach(function (k) { o[k] = base[k]; }); Object.keys(x).forEach(function (k) { o[k] = x[k]; }); return mo.ajouter(o); }
      var actif = ["Brouillon", "PreteAEnvoyer", "Envoyee", "EnAttente"].indexOf(v.statut) >= 0;

      if (actif && ["Vendu", "Livre"].indexOf(v.vehiculeStatut) >= 0) {
        ajout({ id: "soumission-vehicule-indisponible:" + s.id + ":v" + v.numero, regle: "soumission-vehicule-indisponible",
          declencheur: "Le véhicule de " + s.reference + " est maintenant « " + v.vehiculeStatutLibelle + " ».", detecteLe: v.date,
          motif: "La proposition porte sur un véhicule qui n'est plus disponible.", actionProposee: "Proposer un véhicule alternatif",
          contexte: s.alternatives && s.alternatives.length ? ["Alternatives compatibles en inventaire : " + s.alternatives.join(", ")] : ["Aucune alternative compatible trouvée dans l'inventaire."],
          resolution: "Nouvelle version sur un véhicule disponible, ou soumission clôturée.", expiration: "La soumission est refusée, expirée ou annulée." });
        return;
      }
      if (v.statut === "PreteAEnvoyer") {
        ajout({ id: "soumission-a-envoyer:" + s.id + ":v" + v.numero, regle: "soumission-a-envoyer", declencheur: s.reference + " v" + v.numero + " marquée « prête à envoyer ».",
          detecteLe: v.dateModification || v.date, echeance: v.dateValidite, motif: "La proposition est prête mais n'a pas encore été transmise au client.",
          actionProposee: "Transmettre la soumission au client", contexte: [s.reference + " · " + v.vehiculeNom + (v.montant ? " · " + v.montant : "")],
          resolution: "La soumission est marquée envoyée.", expiration: "La validité est dépassée ou la soumission est annulée.", relance: "soumission" });
      }
      if (v.statut === "Envoyee" || v.statut === "EnAttente") {
        var jours = ecartJours(v.dateValidite, mo.m);
        var echange = mo.dernierEchange(s.prospectId, s.opportuniteId, v.date);
        var depuis = echange ? echange.date : v.date;
        if (jours >= 0 && jours <= cfg.expirationProcheJours) {
          ajout({ id: "soumission-expire:" + s.id + ":v" + v.numero, regle: "soumission-expire",
            declencheur: s.reference + " v" + v.numero + " expire " + (jours === 0 ? "aujourd'hui" : jours === 1 ? "demain" : "dans " + jours + " jours") + ".", detecteLe: v.date, echeance: finJour(v.dateValidite),
            motif: "Proposition envoyée " + relatif(v.date, mo.m) + (echange ? ", dernier échange " + relatif(echange.date, mo.m) : ", aucun échange depuis") + " ; validité bientôt atteinte.",
            actionProposee: "Faire le point avec le client sur la proposition", contexte: [s.reference + " · " + v.vehiculeNom],
            dernierContact: echange, resolution: "Réponse du client (acceptation, refus) ou nouvelle version.", expiration: "La validité est dépassée.", relance: "soumission" });
        } else if (jours > cfg.expirationProcheJours && joursDepuis(depuis, mo.m) >= cfg.delaiRelanceSoumissionJours) {
          ajout({ id: "soumission-sans-reponse:" + s.id + ":v" + v.numero + ":" + cleJour(depuis), regle: "soumission-sans-reponse",
            declencheur: s.reference + " v" + v.numero + " envoyée " + relatif(v.date, mo.m) + ".", detecteLe: depuis,
            echeance: new Date(new Date(depuis).getTime() + cfg.delaiRelanceSoumissionJours * JOUR).toISOString(),
            motif: "Aucune réponse ni relance enregistrée depuis " + joursDepuis(depuis, mo.m) + " jours (règle de démonstration : " + cfg.delaiRelanceSoumissionJours + " jours).",
            actionProposee: "Préparer un suivi personnalisé sur la proposition", contexte: [s.reference + " · " + v.vehiculeNom + (v.montant ? " · " + v.montant : "")],
            dernierContact: echange, resolution: "Un échange avec le client est enregistré ou la soumission change de statut.", expiration: "La soumission est acceptée, refusée, expirée ou l'opportunité close.", relance: "soumission" });
        }
      }
      if (s.acceptee && !s.transaction) {
        ajout({ id: "soumission-acceptee:" + s.id + ":v" + s.acceptee.numero, regle: "soumission-acceptee", declencheur: s.reference + " v" + s.acceptee.numero + " acceptée par le client.",
          detecteLe: s.acceptee.date, echeance: new Date(new Date(s.acceptee.date).getTime() + JOUR).toISOString(),
          motif: "Une soumission acceptée n'est pas une vente conclue : aucune transaction n'est ouverte pour suivre la finalisation.",
          actionProposee: "Ouvrir la transaction", contexte: [s.reference + " v" + s.acceptee.numero + " · " + s.acceptee.vehiculeNom],
          resolution: "Une transaction est ouverte pour l'opportunité.", expiration: "L'opportunité est clôturée." });
      }
    });
  }

  // ---------- Rendez-vous (codes calculés par le module Rendez-vous) ----------
  function rendezVous(mo) {
    var cfg = mo.cfg, m = mo.m;
    mo.ctx.rendezVous.forEach(function (r) {
      if (!mo.oppActive(r.opportuniteId)) return;
      var base = { prospectId: r.prospectId, opportuniteId: r.opportuniteId, objet: { type: "rendezvous", id: r.id }, vehicule: r.vehiculeNom, conseillerId: r.conseillerId };
      function ajout(x) { var o = {}; Object.keys(base).forEach(function (k) { o[k] = base[k]; }); Object.keys(x).forEach(function (k) { o[k] = x[k]; }); return mo.ajouter(o); }
      var codes = r.codes || [];
      var dans = (new Date(r.debut) - m) / HEURE;
      var vehiculeCode = codes.filter(function (k) { return k === "vehicule-indisponible" || k === "conflit-vehicule"; })[0];
      if (vehiculeCode && dans > -1) {
        ajout({ id: "rdv-vehicule-indisponible:" + r.id + ":" + vehiculeCode, regle: "rdv-vehicule-indisponible", declencheur: r.typeLibelle + " " + r.creneau + ".", detecteLe: r.dateCreation,
          echeance: r.debut, blocageCritique: dans <= 48, motif: r.textes[vehiculeCode], actionProposee: "Changer de véhicule ou replanifier",
          contexte: [r.typeLibelle + " · " + r.creneau], resolution: "Véhicule disponible associé ou rendez-vous replanifié.", expiration: "Le rendez-vous est passé ou annulé." });
      }
      if (codes.indexOf("a-confirmer") >= 0 && dans >= 0 && dans <= cfg.horizonConfirmationHeures) {
        ajout({ id: "rdv-a-confirmer:" + r.id + ":" + cleJour(r.debut), regle: "rdv-a-confirmer", declencheur: r.typeLibelle + " " + r.creneau + ".", detecteLe: r.dateCreation,
          echeance: new Date(new Date(r.debut).getTime() - 2 * HEURE).toISOString(), blocageCritique: dans <= 3,
          motif: "Le client n'a pas encore confirmé sa présence (statut « " + r.statutLibelle + " »).", actionProposee: "Préparer un rappel de confirmation",
          contexte: [r.typeLibelle + " · " + r.creneau + (r.vehiculeNom ? " · " + r.vehiculeNom : "")], resolution: "Le rendez-vous est confirmé, annulé ou replanifié.", expiration: "L'heure du rendez-vous est passée.", relance: "rdv-confirmation" });
      } else if (r.actif && r.type !== "Livraison" && dans >= 0 && dans <= cfg.horizonPreparationHeures && r.checklistFaits < r.checklistTotal) {
        ajout({ id: "rdv-a-preparer:" + r.id + ":" + cleJour(r.debut), regle: "rdv-a-preparer", declencheur: r.typeLibelle + " " + r.creneau + ".", detecteLe: r.dateCreation, echeance: r.debut,
          motif: "Préparation " + r.checklistFaits + " / " + r.checklistTotal + " : des points de la checklist restent à faire.", actionProposee: "Préparer le rendez-vous",
          contexte: [r.typeLibelle + " · " + r.creneau], resolution: "Checklist complétée ou rendez-vous commencé.", expiration: "Le rendez-vous est commencé, passé ou annulé." });
      }
      if (codes.indexOf("statut-passe") >= 0 || codes.indexOf("resultat-manquant") >= 0) {
        ajout({ id: "rdv-sans-resultat:" + r.id, regle: "rdv-sans-resultat", declencheur: r.typeLibelle + " " + r.creneau + ".", detecteLe: r.fin, echeance: new Date(new Date(r.fin).getTime() + JOUR).toISOString(),
          motif: codes.indexOf("statut-passe") >= 0 ? "Le créneau est passé et le statut n'a pas été mis à jour (terminé, client absent ?)." : "La rencontre est terminée mais aucun résultat n'est enregistré.",
          actionProposee: "Enregistrer le résultat du rendez-vous", contexte: [r.typeLibelle + " · " + r.creneau], resolution: "Statut et résultat enregistrés.", expiration: "L'opportunité est clôturée." });
      }
      if (codes.indexOf("a-replanifier") >= 0) {
        ajout({ id: "rdv-client-absent:" + r.id, regle: "rdv-client-absent", declencheur: r.typeLibelle + " " + r.creneau + " : " + r.statutLibelle.toLowerCase() + ".", detecteLe: r.fin,
          echeance: new Date(new Date(r.fin).getTime() + JOUR).toISOString(),
          motif: r.statut === "ClientAbsent" ? "Le client ne s'est pas présenté ; un nouveau créneau devait lui être proposé." : "Annulé par le client avec l'intention de replanifier.",
          actionProposee: "Proposer un nouveau créneau", contexte: [r.typeLibelle + " · " + r.creneau + (r.vehiculeNom ? " · " + r.vehiculeNom : "")],
          resolution: "Un nouveau rendez-vous est planifié.", expiration: "L'opportunité est clôturée.", relance: "rdv-absent" });
      }
      // Après un essai : le résultat demande une suite et rien n'a été fait depuis.
      if (r.type === "EssaiRoutier" && r.statut === "Termine" && r.resultat && r.resultat.prochaineAction && r.resultat.prochaineAction !== "aucune" && r.resultat.resultat !== "abandon") {
        var apres = mo.dernierEchange(r.prospectId, r.opportuniteId, r.resultat.date);
        if (!apres && !r.rdvSuivant) {
          var ech = r.resultat.dateSuivi || new Date(new Date(r.resultat.date).getTime() + JOUR).toISOString();
          ajout({ id: "essai-sans-suite:" + r.id, regle: "essai-sans-suite", declencheur: "Essai routier terminé " + relatif(r.fin, m) + ".", detecteLe: r.resultat.date, echeance: finJour(ech),
            motif: "Résultat « " + r.resultat.resultatLibelle + " » ; prochaine action prévue : " + r.resultat.actionLibelle.toLowerCase() + ". Aucun échange depuis.",
            actionProposee: "Reprendre les points exprimés pendant l'essai",
            contexte: [r.resultat.observations ? "Observations : " + r.resultat.observations : null, r.resultat.objections ? "Objections : " + r.resultat.objections : null, r.resultat.vehiculeAlternatif ? "Véhicule alternatif envisagé : " + r.resultat.vehiculeAlternatif : null].filter(Boolean),
            resolution: "Un échange est enregistré ou un nouveau rendez-vous est planifié.", expiration: "L'opportunité est clôturée.", relance: "essai" });
        }
      }
    });
  }

  // ---------- Transactions (analyse du Deal Control Tower, sans second moteur de blocage) ----------
  function transactions(mo) {
    var cfg = mo.cfg, m = mo.m;
    mo.ctx.transactions.forEach(function (t) {
      if (t.statut !== "Active") return;
      var a = t.analyse;
      var base = { prospectId: t.prospectId, opportuniteId: t.opportuniteId, objet: { type: "transaction", id: t.id }, vehicule: t.vehiculeNom, conseillerId: t.conseillerId };
      function ajout(x) { var o = {}; Object.keys(base).forEach(function (k) { o[k] = base[k]; }); Object.keys(x).forEach(function (k) { o[k] = x[k]; }); return mo.ajouter(o); }
      var vendeur = a.elements.filter(function (e) { return e.proprietaire === "vendeur" && (e.niveau === "critique" || e.niveau === "action"); });
      if (vendeur.length) {
        var critique = vendeur.some(function (e) { return e.niveau === "critique"; });
        ajout({ id: "transaction-action-vendeur:" + t.id + ":" + vendeur.map(function (e) { return e.code; }).sort().join("+"), regle: "transaction-action-vendeur",
          declencheur: t.reference + " : " + vendeur.length + " action(s) vous reviennent.", detecteLe: vendeur.map(function (e) { return e.depuis; }).filter(Boolean).sort()[0] || t.dateCreation,
          blocageCritique: critique, motif: vendeur[0].nature, actionProposee: a.prochaineAction.texte,
          contexte: vendeur.map(function (e) { return (e.niveau === "critique" ? "Bloquant : " : "À faire : ") + e.nature; }),
          resolution: "Les éléments signalés par le Deal Control Tower sont résolus.", expiration: "La transaction est livrée, clôturée, annulée ou mise en attente.", source: "Deal Control Tower" });
      }
      var depts = a.blocages.filter(function (e) { return e.proprietaire === "departement"; });
      if (depts.length) {
        var dep = depts[0];
        ajout({ id: "transaction-attente-departement:" + t.id + ":" + depts.map(function (e) { return e.code; }).sort().join("+"), regle: "transaction-attente-departement",
          declencheur: t.reference + " bloquée par : " + dep.departementLibelle + ".", detecteLe: dep.depuis || t.dateCreation, departement: dep.departement, blocageCritique: true,
          motif: dep.nature, actionProposee: dep.actionVendeur || "Suivre avec " + dep.departementLibelle.toLowerCase(),
          contexte: depts.map(function (e) { return e.nature + " — responsable : " + e.departementLibelle + (e.personne ? " (" + e.personne + ", fictif)" : ""); }),
          resolution: "Le blocage est levé par le département responsable.", expiration: "La transaction est close ou annulée.", source: "Deal Control Tower", relance: dep.departement === "client" || dep.code === "vehicule-regression" ? "transaction-client" : null });
      }
      (t.blocagesResolus || []).forEach(function (r) {
        if (m - new Date(r.le) > cfg.delaiBlocageResoluJours * JOUR) return;
        ajout({ id: "transaction-blocage-resolu:" + t.id + ":" + r.code + ":" + cleJour(r.le), regle: "transaction-blocage-resolu", declencheur: "Blocage levé " + relatif(r.le, m) + " : " + r.libelle + ".",
          detecteLe: r.le, echeance: new Date(new Date(r.le).getTime() + cfg.delaiBlocageResoluJours * JOUR).toISOString(),
          motif: "Une étape de " + t.reference + " peut reprendre ; le client attend peut-être des nouvelles.", actionProposee: "Informer le client de l'avancement",
          contexte: ["Étape débloquée : " + r.libelle, "Prochaine action du dossier : " + a.prochaineAction.texte], resolution: "Action marquée comme réalisée.",
          expiration: cfg.delaiBlocageResoluJours + " jours après la levée du blocage.", source: "Deal Control Tower", relance: "transaction-client" });
      });
      if (a.pret && !t.rdvLivraison) {
        ajout({ id: "transaction-prete:" + t.id, regle: "transaction-prete", declencheur: t.reference + " : toutes les conditions de livraison sont remplies.", detecteLe: t.dernierEvenement,
          motif: "Le dossier est prêt mais aucun rendez-vous de livraison n'est planifié.", actionProposee: "Planifier la livraison avec le client",
          contexte: ["Mode d'achat : " + t.modeLibelle], resolution: "Un rendez-vous de livraison est planifié.", expiration: "La transaction n'est plus prête ou est close.", source: "Deal Control Tower" });
      }
      if (a.statut === "LivraisonPlanifiee" && t.rdvLivraison && (new Date(t.rdvLivraison.debut) - m) / HEURE <= cfg.horizonLivraisonHeures) {
        ajout({ id: "livraison-a-preparer:" + t.id + ":" + cleJour(t.rdvLivraison.debut), regle: "livraison-a-preparer", declencheur: "Livraison prévue " + t.rdvLivraison.texte + ".",
          detecteLe: t.dernierEvenement, echeance: t.rdvLivraison.debut, motif: "Livraison imminente : vérifier le véhicule, les documents et la présentation des commandes.",
          actionProposee: "Préparer la livraison", contexte: [t.reference + " · " + t.vehiculeNom], resolution: "Livraison confirmée.", expiration: "Le rendez-vous de livraison est annulé ou passé." });
      }
    });
  }

  // ---------- Opportunités : correspondances, suivis, reprise, surveillance ----------
  function opportunites(mo) {
    var cfg = mo.cfg, m = mo.m, c = mo.ctx;
    (c.correspondances || []).forEach(function (x) {
      mo.ajouter({ id: "nouvelle-correspondance:" + x.demandeId + ":" + x.vehiculeId, regle: "nouvelle-correspondance", prospectId: x.prospectId, opportuniteId: x.opportuniteId,
        objet: { type: "demande", id: x.demandeId }, vehiculeId: x.vehiculeId, vehicule: x.vehiculeNom, horizon: x.horizon,
        declencheur: x.vehiculeNom + " est disponible en inventaire.", detecteLe: x.depuis || m.toISOString(),
        motif: "Compatible avec la recherche du client" + (x.score != null ? " (compatibilité " + x.score + " %, couverture " + x.couverture + " %)" : "") + ".",
        actionProposee: "Consulter le véhicule et décider de le présenter", contexte: x.raisons,
        resolution: "Le conseiller présente le véhicule, ou la demande est mise en pause ou clôturée.", expiration: "Le véhicule devient indisponible ou ne correspond plus.", relance: "correspondance" });
    });
    c.opportunites.forEach(function (o) {
      if (!mo.oppActive(o.id)) return;
      var pause = (c.pauses || {})[o.id];
      if (pause && new Date(pause.jusqua) <= m) {
        mo.ajouter({ id: "achat-reporte:" + o.id + ":" + cleJour(pause.jusqua), regle: "achat-reporte", prospectId: o.prospectId, opportuniteId: o.id, objet: { type: "opportunite", id: o.id },
          declencheur: "Date de reprise souhaitée par le client : " + new Date(pause.jusqua).toLocaleDateString("fr-CA", DATE_LISIBLE) + ".", detecteLe: pause.jusqua, echeance: finJour(pause.jusqua),
          motif: "Le client avait demandé une pause (« " + pause.motif + " ») ; la date choisie est atteinte.", actionProposee: "Reprendre contact comme convenu",
          contexte: [o.titre], resolution: "Un échange est enregistré ou une nouvelle date est convenue.", expiration: "L'opportunité est clôturée.", relance: "reprise" });
      }
    });
    // Suivi à date : seulement si aucune autre recommandation de contact ne couvre déjà l'opportunité.
    c.opportunites.forEach(function (o) {
      if (!mo.oppActive(o.id) || !o.dateProchaineAction || !o.prochaineAction) return;
      if (ecartJours(o.dateProchaineAction, m) > 0) return;
      if ((mo.parOpp[o.id] || []).length) return;
      if (mo.suspendues.some(function (a) { return a.opportuniteId === o.id && ["prospects", "soumissions", "rendezvous"].indexOf(a.categorie) >= 0; })) return;
      mo.ajouter({ id: "suivi-echeance:" + o.id + ":" + cleJour(o.dateProchaineAction), regle: "suivi-echeance", prospectId: o.prospectId, opportuniteId: o.id, objet: { type: "opportunite", id: o.id },
        declencheur: "Suivi prévu " + (ecartJours(o.dateProchaineAction, m) === 0 ? "aujourd'hui" : "le " + new Date(o.dateProchaineAction).toLocaleDateString("fr-CA", DATE_LISIBLE)) + ".",
        detecteLe: o.dateProchaineAction, echeance: finJour(o.dateProchaineAction), horizon: (o.qualification || {}).horizon,
        motif: "Prochaine action enregistrée : « " + o.prochaineAction + " ».", actionProposee: o.prochaineAction,
        contexte: [o.titre], resolution: "Le suivi est réalisé ou une nouvelle date est planifiée.", expiration: "L'opportunité est clôturée.", relance: "suivi" });
    });
    // Commercial Opportunity Monitor : une recommandation par opportunité qui stagne, avec tous les constats.
    c.opportunites.forEach(function (o) {
      if (!mo.oppActive(o.id) || (mo.parOpp[o.id] || []).length) return;
      if (o.transactionEnCours) return;
      var q = o.qualification || {};
      var constats = [];
      var inactif = joursDepuis(o.derniereActivite, m);
      if (!o.prochaineAction && !o.rdvFutur) constats.push({ regle: "opportunite-sans-action", texte: "Aucune prochaine action ni rendez-vous à venir." });
      if (["Qualifie", "EssaiRoutier", "Negociation"].indexOf(o.etape) >= 0 && !o.nbSoumissions && !(o.vehiculesEnvisages || []).length) constats.push({ regle: "qualifiee-sans-vehicule", texte: "Opportunité qualifiée sans véhicule envisagé ni soumission." });
      if ((q.horizon === "immediat" || q.horizon === "30j" || (q.dateCible && ecartJours(q.dateCible, m) <= 30)) && !o.nbSoumissions && o.etape !== "Nouveau") constats.push({ regle: "horizon-sans-proposition", texte: "Achat prévu « " + (o.horizonLibelle || q.horizon) + " » et aucune proposition préparée." });
      if (inactif >= cfg.delaiInactiviteJours) constats.push({ regle: "opportunite-inactive", texte: "Aucune activité depuis " + inactif + " jours (seuil de démonstration : " + cfg.delaiInactiviteJours + " jours)." });
      if (!constats.length) return;
      var r = constats[0].regle;
      mo.ajouter({ id: r + ":" + o.id + ":" + cleJour(o.derniereActivite), regle: r, prospectId: o.prospectId, opportuniteId: o.id, objet: { type: "opportunite", id: o.id },
        declencheur: "Dernière activité " + relatif(o.derniereActivite, m) + ".", detecteLe: o.derniereActivite, horizon: q.horizon, monitor: true,
        motif: constats.map(function (x) { return x.texte; }).join(" "), actionProposee: r === "qualifiee-sans-vehicule" || r === "horizon-sans-proposition" ? "Chercher des véhicules compatibles et préparer une proposition" : "Définir la prochaine action avec le client",
        contexte: ["L'inactivité ne signifie pas que le client n'est plus intéressé."], constats: constats,
        resolution: "Une prochaine action est planifiée ou une activité est enregistrée.", expiration: "L'opportunité est clôturée (jamais automatiquement)." });
    });
  }

  // ---------- Relations clients (phase 07) : ventes perdues, après-vente, référencement ----------
  // Les états (récupération, éligibilité) sont calculés par relations-regles.js ; ici, seulement les recommandations.
  function relations(mo) {
    var rel = mo.ctx.relations;
    if (!rel) return;
    var cfg = rel.config, m = mo.m;
    // Les champs communs (client, opportunité, objet) complètent l'action sans écraser ses propres champs.
    function base(x, extra) { Object.keys(extra || {}).forEach(function (k) { if (!(k in x)) x[k] = extra[k]; }); return mo.ajouter(x); }

    rel.clotures.forEach(function (c) {
      if (c.reactivation || c.etapeOpp !== "Perdu") return;
      var b = { prospectId: c.prospectId, opportuniteId: c.opportuniteId, objet: { type: "cloture", id: c.opportuniteId }, vehicule: c.vehicule, conseillerId: c.conseillerId };
      var declencheur = "Opportunité « " + c.titre + " » clôturée " + relatif(c.date, m) + ".";
      // Motif inconnu ou supposé : vérifier si une information est disponible (sans jamais l'inventer).
      if ((c.motif === "inconnu" || c.origine === "hypothese" || c.origine === "inconnu") && !c.retour && joursDepuis(c.date, m) <= cfg.fenetreVerificationMotifJours) {
        base({ id: "perte-motif-inconnu:" + c.opportuniteId + ":" + c.motif + ":" + c.origine, regle: "perte-motif-inconnu", declencheur: declencheur, detecteLe: c.date,
          motif: c.origine === "hypothese" ? "Motif supposé (« " + c.motifLibelle.toLowerCase() + " ») : il n'est pas confirmé par le client." : "Aucun motif de perte n'est connu.",
          actionProposee: "Vérifier si une information supplémentaire est disponible",
          contexte: ["L'absence de réponse ne prouve pas que le client a acheté ailleurs.", "Un retour volontaire du client peut être recueilli (formulaire facultatif)."],
          resolution: "Le motif est confirmé ou un retour du client est reçu.", expiration: cfg.fenetreVerificationMotifJours + " jours après la clôture (règle de démonstration)." }, b);
      }
      if (c.motif === "experience-insatisfaisante" && joursDepuis(c.date, m) <= cfg.fenetreVerificationMotifJours) {
        base({ id: "client-insatisfait:" + c.opportuniteId, regle: "client-insatisfait", declencheur: declencheur, detecteLe: c.date,
          motif: "Opportunité perdue en raison d'une expérience insatisfaisante" + (c.commentaire ? " : « " + c.commentaire + " »" : "."),
          actionProposee: "Prendre contact pour comprendre et résoudre le problème (action de service)", contexte: ["Il ne s'agit pas d'une relance commerciale."],
          resolution: "L'action de service est réalisée.", expiration: cfg.fenetreVerificationMotifJours + " jours après la clôture." }, b);
      }
      if (["a-verifier", "attente-evenement", "suivi-planifie"].indexOf(c.etat) < 0) return;
      // Achat reporté : la date de reprise souhaitée par le client est atteinte.
      if (c.etat === "suivi-planifie" && c.dateReprise && new Date(c.dateReprise) <= m && joursDepuis(c.dateReprise, m) <= cfg.fenetreRepriseJours && !mo.dernierEchange(c.prospectId, c.opportuniteId, c.dateReprise)) {
        base({ id: "perte-achat-reporte:" + c.opportuniteId + ":" + cleJour(c.dateReprise), regle: "perte-achat-reporte", declencheur: "Date de reprise souhaitée : " + new Date(c.dateReprise).toLocaleDateString("fr-CA", DATE_LISIBLE) + ".",
          detecteLe: c.dateReprise, echeance: finJour(new Date(new Date(c.dateReprise).getTime() + 2 * JOUR)), motif: "Le client avait reporté son achat" + (c.commentaire ? " (« " + c.commentaire + " »)" : "") + " ; la date convenue est atteinte.",
          actionProposee: "Reprendre contact comme convenu et mettre à jour les besoins", contexte: ["Projet initial : " + c.titre, "Une réactivation reste une décision du conseiller."],
          resolution: "Un échange est enregistré ou l'opportunité est réactivée.", expiration: cfg.fenetreRepriseJours + " jours après la date de reprise.", relance: "perte-reprise" }, b);
      }
      // Véhicule correspondant à une ancienne demande (Vehicle Matching Engine).
      if ((c.correspondances || []).length) {
        var v = c.correspondances;
        base({ id: "perte-correspondance:" + c.opportuniteId + ":" + v.map(function (x) { return x.vehiculeId; }).sort().join("+"), regle: "perte-correspondance", vehiculeId: v[0].vehiculeId,
          declencheur: v.length + " véhicule(s) disponible(s) correspondant à l'ancienne recherche.", detecteLe: v[0].depuis || c.date, horizon: c.horizon,
          motif: "Opportunité perdue (" + c.motifLibelle.toLowerCase() + ") : " + v.map(function (x) { return x.vehiculeNom; }).join(", ") + " respecte(nt) les critères connus.",
          actionProposee: "Examiner la correspondance et préparer une présentation", vehicule: v.map(function (x) { return x.vehiculeNom; }).join(", "),
          contexte: v.map(function (x) { return x.vehiculeNom + (x.score != null ? " — " + x.score + " % des critères connus (couverture " + x.couverture + " %)" : "") + (x.ecarts.length ? " ; écarts : " + x.ecarts.join(", ") : "") + (x.inconnus.length ? " ; à vérifier : " + x.inconnus.join(", ") : "") + (x.disponibilite ? " ; " + x.disponibilite.charAt(0).toLowerCase() + x.disponibilite.slice(1) : ""); })
            .concat(["Prix affiché en inventaire seulement : aucune remise ni condition non confirmée."]),
          resolution: "Le véhicule est présenté, l'opportunité est réactivée ou classée sans suite.", expiration: "Le véhicule n'est plus disponible ou ne correspond plus.", relance: "perte-correspondance" }, b);
      }
      // Événement déclaré ou retour du client : examiner les nouvelles conditions (aucune réactivation automatique).
      var ev = c.evenement || (c.retour && c.retour.informerSiDisponible === true ? { texte: "Le client accepte d'être informé si un véhicule correspondant devient disponible.", le: c.retour.recuLe } : null);
      if (ev && joursDepuis(ev.le, m) <= cfg.fenetreEvenementJours) {
        base({ id: "perte-recuperable:" + c.opportuniteId + ":" + cleJour(ev.le), regle: "perte-recuperable", declencheur: "Nouvel élément " + relatif(ev.le, m) + " : " + ev.texte, detecteLe: ev.le,
          motif: "Opportunité perdue (" + c.motifLibelle.toLowerCase() + ") potentiellement récupérable" + (c.conditions ? " ; condition notée : " + c.conditions : "") + ".",
          actionProposee: "Examiner les nouvelles conditions et décider d'une réactivation", contexte: ["Une recommandation de récupération n'est pas une preuve que le client achètera."],
          resolution: "L'opportunité est réactivée ou classée sans suite.", expiration: cfg.fenetreEvenementJours + " jours après l'événement." }, b);
      }
    });

    rel.livraisons.forEach(function (l) {
      var b = { prospectId: l.prospectId, opportuniteId: l.opportuniteId, vehicule: l.vehiculeNom, conseillerId: l.conseillerId };
      // Une livraison confirmée (pas une soumission acceptée ni une livraison planifiée) déclenche le suivi.
      if (!l.enquete && joursDepuis(l.confirmeeLe, m) <= cfg.fenetreSatisfactionJours) {
        base({ id: "satisfaction-a-planifier:" + l.transactionId, regle: "satisfaction-a-planifier", objet: { type: "livraison", id: l.transactionId },
          declencheur: l.reference + " : livraison confirmée " + relatif(l.confirmeeLe, m) + ".", detecteLe: l.confirmeeLe,
          echeance: finJour(new Date(new Date(l.confirmeeLe).getTime() + cfg.delaiSuiviSatisfactionJours * JOUR)),
          motif: "Aucun suivi de satisfaction n'est enregistré depuis la livraison (délai de démonstration : " + cfg.delaiSuiviSatisfactionJours + " jours).",
          actionProposee: "Planifier un suivi de satisfaction", contexte: ["Vérifier que tout se passe bien, sans sollicitation commerciale."],
          resolution: "Un retour de satisfaction est reçu ou le suivi est déclaré réalisé.", expiration: cfg.fenetreSatisfactionJours + " jours après la livraison.", relance: "satisfaction" }, b);
      }
      if (l.eligible) {
        base({ id: "invitation-referencement:" + l.transactionId, regle: "invitation-referencement", objet: { type: "invitation", id: l.transactionId },
          declencheur: l.reference + " : client satisfait, aucun problème ouvert.", detecteLe: l.confirmeeLe,
          motif: "Les conditions préalables sont réunies ; une bonne note n'est pas, à elle seule, un consentement à être sollicité.",
          actionProposee: "Préparer une invitation facultative à recommander", contexte: ["Invitation modifiable, sans récompense ni urgence ; aucun envoi automatique."],
          resolution: "Une invitation est préparée.", expiration: "Un problème est ouvert, ou la fenêtre de démonstration est dépassée." }, b);
      }
    });

    rel.enquetes.forEach(function (e) {
      if (!e.insatisfait || e.problemeLie) return;
      base({ id: "client-insatisfait:" + e.transactionId + ":" + e.id, regle: "client-insatisfait", prospectId: e.prospectId, opportuniteId: e.opportuniteId, objet: { type: "enquete", id: e.transactionId },
        vehicule: e.vehiculeNom, conseillerId: e.conseillerId, declencheur: "Retour de satisfaction reçu " + relatif(e.recueLe, m) + ".", detecteLe: e.recueLe,
        echeance: finJour(new Date(new Date(e.recueLe).getTime() + JOUR)),
        motif: "Insatisfaction exprimée" + (e.dimensionsInsatisfaites.length ? " : " + e.dimensionsInsatisfaites.join(", ").toLowerCase() : " (satisfaction globale)") + "." + (e.recontacter ? " Le client accepte d'être recontacté." : ""),
        actionProposee: "Prendre en charge ou transférer le problème", contexte: ["Chaque dimension est évaluée séparément : le conseiller n'est pas responsable de tous les départements."],
        resolution: "Un dossier de suivi est ouvert ou l'action est réalisée.", expiration: "Jamais automatiquement." });
    });

    rel.problemes.forEach(function (p) {
      var b = { prospectId: p.prospectId, opportuniteId: p.opportuniteId, objet: { type: "probleme", id: p.id }, vehicule: p.vehiculeNom, conseillerId: p.conseillerId };
      if (p.statut === "Nouveau" || p.statut === "EnCours") {
        base({ id: "probleme-a-traiter:" + p.id + ":" + p.statut, regle: "probleme-a-traiter", prioriteBase: p.priorite, declencheur: "Problème signalé " + relatif(p.signaleLe, m) + " (" + p.statutLibelle.toLowerCase() + ").",
          detecteLe: p.signaleLe, motif: p.nature, actionProposee: p.prochaineAction || (p.statut === "Nouveau" ? "Prendre en charge ou transférer au département concerné" : "Définir la prochaine action"),
          contexte: ["Département concerné : " + p.departementLibelle], resolution: "Le problème est résolu ou transféré au département concerné.", expiration: "Le problème est clôturé." }, b);
      }
      if (p.statut === "Resolu" && !p.verifieLe) {
        base({ id: "probleme-resolu-verifier:" + p.id + ":" + cleJour(p.resoluLe), regle: "probleme-resolu-verifier", declencheur: "Problème déclaré résolu " + relatif(p.resoluLe, m) + ".", detecteLe: p.resoluLe,
          echeance: finJour(new Date(new Date(p.resoluLe).getTime() + cfg.delaiVerificationResolutionJours * JOUR)), motif: p.nature,
          actionProposee: "Vérifier avec le client que la résolution répond à son besoin", contexte: ["Résolu par : " + p.departementLibelle],
          resolution: "La résolution est vérifiée (dossier clôturé) ou le problème est rouvert.", expiration: "Le problème est clôturé." }, b);
      }
    });
  }

  function relatif(d, m) {
    var h = (m - new Date(d)) / HEURE;
    if (h < 0) {
      var j = ecartJours(d, m);
      return j === 0 ? "aujourd'hui" : j === 1 ? "demain" : "dans " + j + " jours";
    }
    if (h < 1) return "il y a " + Math.max(1, Math.round(h * 60)) + " min";
    if (h < 24) return "il y a " + Math.floor(h) + " h";
    return "il y a " + Math.floor(h / 24) + " j";
  }
  function finJour(d) {
    var x = new Date(d); x.setHours(23, 59, 0, 0); return x.toISOString();
  }

  function analyser(ctx) {
    var mo = new Moteur(ctx);
    // Ordre : situations précises d'abord ; les suivis génériques et la surveillance seulement s'il ne reste rien.
    transactions(mo);
    relations(mo);
    soumissions(mo);
    rendezVous(mo);
    prospects(mo);
    opportunites(mo);
    mo.actions.sort(function (a, b) { return b.ordre - a.ordre; });
    mo.actions.forEach(function (a) { a.monitor = !!a.monitor || ["soumission-sans-reponse", "rdv-sans-resultat"].indexOf(a.regle) >= 0; });
    return { actions: mo.actions, suspendues: mo.suspendues };
  }

  var api = { analyser: analyser, niveaux: NIVEAUX, cleJour: cleJour, echanges: ECHANGES, relatif: relatif };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else racine.IntelligenceRegles = api;
})(this);
