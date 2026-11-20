// Module Transactions : état local de démonstration (même principe que prospects-store.js, soumissions-store.js
// et rendezvous-store.js). Aucun appel réseau, aucun paiement, aucune écriture en base : tout reste dans le
// sessionStorage de l'onglet. Le véhicule est lu dans l'inventaire partagé du module Soumissions, jamais modifié.
//
// Séparation des rôles :
//   - les fonctions de premier niveau sont les actions qu'un conseiller peut faire (confirmer, déclarer, demander…) ;
//   - les décisions d'autres départements (F&A, direction, atelier, évaluateur, administration) n'existent que dans
//     Transactions.simulation, clairement identifié comme fictif. Aucune fonction ne permet au conseiller
//     d'approuver un financement, de confirmer un paiement ou de changer l'état mécanique d'un véhicule.
(function () {
  "use strict";

  var source = document.getElementById("transactions-donnees");
  if (!source) return;
  var charge = JSON.parse(source.textContent);
  var P = window.Prospects, S = window.Soumissions, R = window.RendezVous, C = window.SoumissionsCalcul, Regles = window.TransactionsRegles;
  if (!P || !S || !Regles) return;
  var d = charge.donnees;
  var ref = charge.referentiels;
  var CLE = "phineas.salesos.transactions.v1:" + charge.conseillerNom;
  var ACTIVES = ["Active", "EnAttente"];
  var RDV_INACTIFS = ["Annule", "ClientAbsent", "Replanifie"];

  // Libellés empruntés aux autres modules (une seule source).
  ref.statutsVehicule = {};
  ["Recu", "EnInspection", "InspectionTerminee", "NettoyageEnCours", "PretPourVente", "Reserve", "Vendu", "Livre"].forEach(function (k) {
    ref.statutsVehicule[k] = S.libelleStatutVehicule(k);
  });
  ref.statutsRendezVous = {};
  if (R) R.ref.statuts.forEach(function (s) { ref.statutsRendezVous[s.cle] = s.libelle; });

  function cloner(o) {
    return JSON.parse(JSON.stringify(o));
  }
  function initial() {
    return { transactions: cloner(d.transactions), atelier: cloner(d.atelier), statutsSimules: {}, compteur: 0 };
  }
  function lire() {
    try {
      var brut = window.sessionStorage.getItem(CLE);
      return brut ? JSON.parse(brut) : null;
    } catch (e) {
      return null;
    }
  }
  function ecrire() {
    try {
      window.sessionStorage.setItem(CLE, JSON.stringify(etat));
    } catch (e) {}
  }
  var etat = lire() || initial();
  var modifie = !!lire();
  var abonnes = [];
  var cache = {};
  function changer() {
    modifie = true;
    cache = {};
    ecrire();
    abonnes.forEach(function (f) { f(); });
    if (P) P.rafraichir();
  }
  // Les autres modules (rendez-vous, soumissions) influencent l'analyse : on invalide le cache quand ils changent.
  function invalider() {
    cache = {};
    abonnes.forEach(function (f) { f(); });
  }
  if (R) R.abonner(invalider);
  S.abonner(invalider);

  function maintenant() {
    return new Date();
  }
  function iso() {
    return maintenant().toISOString();
  }

  // ---------- Lecture ----------
  function liste() {
    return etat.transactions;
  }
  function transaction(id) {
    return etat.transactions.filter(function (t) { return t.id === id; })[0] || null;
  }
  function trierRecentes(l) {
    return l.slice().sort(function (a, b) { return new Date(b.dateCreation) - new Date(a.dateCreation); });
  }
  function parOpportunite(oppId) {
    return trierRecentes(etat.transactions.filter(function (t) { return t.opportuniteId === oppId; }));
  }
  function parProspect(id) {
    return trierRecentes(etat.transactions.filter(function (t) { return t.prospectId === id; }));
  }
  function parSoumission(id) {
    return trierRecentes(etat.transactions.filter(function (t) { return t.soumissionId === id; }));
  }
  function estActive(t) {
    return ACTIVES.indexOf(t.statut) >= 0;
  }
  // Une opportunité ne peut avoir qu'un seul dossier d'achat en cours (actif ou livré, non clôturé).
  function enCoursPourOpportunite(oppId, sauf) {
    return etat.transactions.filter(function (t) {
      return t.opportuniteId === oppId && t.id !== sauf && ["Active", "EnAttente", "Livree"].indexOf(t.statut) >= 0;
    })[0] || null;
  }
  function autrePourVehicule(t) {
    return etat.transactions.filter(function (x) {
      return x.id !== t.id && x.vehiculeId === t.vehiculeId && estActive(x) && estActive(t);
    })[0] || null;
  }
  function atelier(vehiculeId) {
    return etat.atelier.filter(function (a) { return a.vehiculeId === vehiculeId; })[0] || null;
  }
  function vehiculeActuel(id) {
    return S.vehicule(id);
  }
  // Statut du véhicule : inventaire partagé, sauf événement d'atelier simulé dans cet onglet.
  function statutVehicule(id) {
    if (etat.statutsSimules[id]) return etat.statutsSimules[id];
    var v = S.vehicule(id);
    return v ? v.statutActuel : null;
  }
  function nomVehicule(t) {
    var v = (t.proposition && t.proposition.vehicule) || S.vehicule(t.vehiculeId);
    return v ? S.nomVehicule(v) : "Véhicule introuvable";
  }
  function vehiculeDe(t) {
    return (t.proposition && t.proposition.vehicule) || S.vehicule(t.vehiculeId);
  }
  function nomClient(t) {
    var c = P.contact(t.prospectId);
    return c ? c.prenom + " " + c.nom : "Prospect introuvable";
  }
  function versionEnvisagee(t) {
    var s = t.soumissionId ? S.soumission(t.soumissionId) : null;
    if (!s) return null;
    return (t.versionNumero && S.version(s, t.versionNumero)) || S.versionCourante(s);
  }
  // Offre de référence : l'instantané figé ; pour un brouillon, la version envisagée (non figée).
  function offre(t) {
    if (t.proposition) return t.proposition.offre;
    var v = versionEnvisagee(t);
    return v ? v.offre : null;
  }

  // Rendez-vous liés : livraison, financement, finalisation (même opportunité ; véhicule pour la livraison).
  function rendezVous(t, type) {
    if (!R) return [];
    return R.parOpportunite(t.opportuniteId).filter(function (r) {
      return r.type === type && (type !== "Livraison" || !r.vehiculeId || r.vehiculeId === t.vehiculeId);
    });
  }
  function rdvLivraison(t) {
    var l = rendezVous(t, "Livraison").filter(function (r) { return RDV_INACTIFS.indexOf(r.statut) < 0; });
    return l[l.length - 1] || null;
  }

  function contexte(t) {
    var r = rdvLivraison(t);
    return {
      ref: ref,
      maintenant: maintenant(),
      statutVehicule: statutVehicule(t.vehiculeId),
      atelier: atelier(t.vehiculeId),
      rdvLivraison: r ? { id: r.id, statut: r.statut, debut: r.debut } : null,
      autreTransaction: autrePourVehicule(t),
      offreEnvisagee: t.proposition ? null : offre(t),
    };
  }
  function analyse(t) {
    if (!cache[t.id]) cache[t.id] = Regles.analyser(t, contexte(t));
    return cache[t.id];
  }
  function statutAffiche(cle) {
    return ref.statutsAffiches.filter(function (s) { return s.cle === cle; })[0] || { cle: cle, libelle: cle, icone: "bi-circle" };
  }

  // Montants : calculés avec le module de calcul des soumissions (aucun second moteur financier).
  function montants(t) {
    var o = offre(t);
    if (!o || !C) return null;
    var calc = C.calculer(o, S.parametres);
    var res = { calcul: calc, figee: !!t.proposition, totalEstime: calc.totalEstime, ajuste: null };
    // Reprise acceptée à une valeur différente : recalcul sur une COPIE de l'offre, l'instantané reste intact.
    var rp = t.reprise;
    if (rp && rp.statut === "Acceptee" && rp.valeurConfirmee != null && o.reprise && Number(rp.valeurConfirmee) !== Number(o.reprise.valeurEstimee)) {
      var copie = cloner(o);
      copie.reprise.valeurEstimee = rp.valeurConfirmee;
      res.ajuste = C.calculer(copie, S.parametres);
    }
    return res;
  }

  // Écarts entre la proposition figée et l'état actuel (nouvelle version, prix ou statut en inventaire).
  function ecarts(t) {
    var e = [];
    var s = t.soumissionId ? S.soumission(t.soumissionId) : null;
    if (s && t.versionNumero && S.versionCourante(s).numero > t.versionNumero) {
      var vc = S.versionCourante(s);
      e.push({ code: "version", texte: "Une version plus récente de la soumission existe (v" + vc.numero + ", " + S.libelleStatut(vc.statut).toLowerCase() + "). La transaction reste basée sur la version " + t.versionNumero + " retenue." });
    }
    if (t.proposition) {
      var actuel = S.vehicule(t.vehiculeId);
      if (actuel && actuel.prixDemande !== t.proposition.vehicule.prixDemande) {
        e.push({ code: "prix", texte: "Le prix en inventaire est maintenant de " + P.argent(actuel.prixDemande) + " (" + P.argent(t.proposition.vehicule.prixDemande) + " dans la proposition figée). La transaction n'est pas modifiée." });
      }
      var st = statutVehicule(t.vehiculeId);
      if (st && st !== t.proposition.vehicule.statutActuel) {
        e.push({ code: "statut", texte: "Statut du véhicule : « " + ref.statutsVehicule[t.proposition.vehicule.statutActuel] + " » au moment de la proposition, « " + ref.statutsVehicule[st] + " » aujourd'hui." });
      }
    }
    return e;
  }

  // ---------- Écritures (actions du conseiller, locales) ----------
  function auteur() {
    return charge.conseillerNom;
  }
  function historiser(t, ev) {
    t.historique = t.historique || [];
    t.historique.push({
      date: iso(), type: ev.type, origine: ev.origine || "conseiller", auteur: ev.auteur || auteur(),
      departement: ev.departement || (ev.origine === "simulation" ? null : "conseiller"),
      description: ev.description, ancien: ev.ancien || null, nouveau: ev.nouveau || null,
    });
  }
  // Ajoute l'événement à l'historique commercial de l'opportunité (timeline du prospect).
  function journaliser(t, texte, prochaine) {
    if (P.contact(t.prospectId)) P.ajouterNote(t.prospectId, { type: "transaction", opportuniteId: t.opportuniteId, resume: t.reference + " · " + texte, prochaineAction: prochaine || null, date: prochaine ? maintenant() : null });
  }
  function avecAnnulation(t, action) {
    var avant = cloner(t);
    var avantSimules = cloner(etat.statutsSimules);
    var a = atelier(t.vehiculeId);
    var avantAtelier = a ? cloner(a) : null;
    var nbInteractions = P.interactionsDe(t.prospectId).length;
    var resultat = action();
    if (resultat === false) return null;
    changer();
    return function () {
      Object.keys(t).forEach(function (k) { delete t[k]; });
      Object.keys(avant).forEach(function (k) { t[k] = avant[k]; });
      etat.statutsSimules = avantSimules;
      if (a && avantAtelier) {
        Object.keys(a).forEach(function (k) { delete a[k]; });
        Object.keys(avantAtelier).forEach(function (k) { a[k] = avantAtelier[k]; });
      }
      changer();
      while (P.interactionsDe(t.prospectId).length > nbInteractions) P.retirerDerniereInteraction(t.prospectId);
    };
  }
  // Une transaction en attente est suspendue : seules la reprise et l'annulation restent possibles.
  function modifiable(t) {
    return !!t && t.statut === "Active";
  }

  // Règles vérifiées par le store lui-même, quel que soit l'écran.
  function invalide(x) {
    if (!x.prospectId || !x.opportuniteId) return "Choisissez un client et une opportunité.";
    var o = P.opportunite(x.opportuniteId);
    if (!o || o.prospectId !== x.prospectId) return "Opportunité introuvable pour ce client.";
    if (!P.estActive(o)) return "L'opportunité n'est plus active.";
    if (!x.vehiculeId) return "Choisissez le véhicule retenu.";
    var v = S.vehicule(x.vehiculeId);
    if (!v) return "Véhicule introuvable dans l'inventaire.";
    if (["Vendu", "Livre"].indexOf(statutVehicule(v.id)) >= 0) return "Ce véhicule est déjà vendu ou livré à un autre client.";
    var doublon = enCoursPourOpportunite(x.opportuniteId);
    if (doublon) return "Une transaction est déjà en cours pour cette opportunité (" + doublon.reference + ").";
    var autre = etat.transactions.filter(function (t) { return t.vehiculeId === x.vehiculeId && estActive(t); })[0];
    if (autre) return "Ce véhicule est déjà retenu par la transaction " + autre.reference + ".";
    if (ref.modesAchat[x.modeAchat] === undefined) return "Choisissez un mode d'achat.";
    if (x.soumissionId) {
      var s = S.soumission(x.soumissionId);
      if (!s || s.opportuniteId !== x.opportuniteId) return "Soumission introuvable pour cette opportunité.";
      var ver = S.version(s, x.versionNumero);
      if (!ver) return "Version de soumission introuvable.";
      if (ver.vehicule.id !== x.vehiculeId) return "Le véhicule ne correspond pas à la version retenue.";
    }
    if (x.depot != null && x.depot !== "" && !(Number(x.depot) >= 0)) return "Montant de dépôt invalide.";
    return null;
  }
  function versionAcceptee(x) {
    var s = x.soumissionId ? S.soumission(x.soumissionId) : null;
    var v = s ? S.version(s, x.versionNumero) : null;
    return v && v.statut === "Acceptee" ? v : null;
  }
  function nouvelleReference() {
    etat.compteur = (etat.compteur || 0) + 1;
    return "TRX-" + new Date().getFullYear() + "-L" + String(etat.compteur).padStart(2, "0");
  }

  // Construit la transaction sans l'enregistrer (utilisé par l'aperçu du parcours de création et par creer).
  function construire(x) {
    var acceptee = versionAcceptee(x);
    var sObj = x.soumissionId ? S.soumission(x.soumissionId) : null;
    var ver = sObj ? S.version(sObj, x.versionNumero) : null;
    var o = ver ? ver.offre : null;
    var depot = x.depot != null && x.depot !== "" ? Number(x.depot) : null;
    var acompte = o && Number(o.acompteVerse) > 0 ? Number(o.acompteVerse) : null;
    var rp = x.reprise || (o && o.reprise ? { description: o.reprise.vehicule } : null);
    var t = {
      id: "t-local-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      reference: "TRX-" + new Date().getFullYear() + "-L??",
      prospectId: x.prospectId,
      opportuniteId: x.opportuniteId,
      conseillerId: x.conseillerId || P.moiId,
      vehiculeId: x.vehiculeId,
      soumissionId: x.soumissionId || null,
      versionNumero: x.soumissionId ? x.versionNumero : null,
      // Instantané : copie profonde de la version acceptée, figée à cet instant.
      proposition: acceptee ? { dateFigee: iso(), vehicule: cloner(acceptee.vehicule), offre: cloner(acceptee.offre) } : null,
      brouillon: !acceptee,
      modeAchat: x.modeAchat,
      statut: "Active",
      dateCreation: iso(),
      commercial: {
        prixConfirme: false, optionsConfirmees: false,
        remise: o && Number(o.remise || 0) > ref.seuilRemiseApprobation ? "ADemander" : "NonRequise",
        remiseDepuis: null,
        accordClient: acceptee ? (acceptee.dateModification || acceptee.date) : null,
      },
      financement: { statut: Regles.avecFinancement({ modeAchat: x.modeAchat }) ? "NonCommence" : x.modeAchat === "comptant" ? "NonApplicable" : "NonCommence", depuis: iso(), pieces: [], conditions: [], preparation: {} },
      reprise: rp ? {
        description: rp.description || "Véhicule repris",
        marque: rp.marque || null, modele: rp.modele || null, annee: rp.annee ? Number(rp.annee) : null,
        kilometrage: rp.kilometrage != null && rp.kilometrage !== "" ? Number(rp.kilometrage) : null,
        valeurEstimee: o && o.reprise ? o.reprise.valeurEstimee : null, valeurConfirmee: null,
        // Le solde n'est connu que s'il a été déclaré au conseiller dans la soumission.
        solde: o && o.reprise && o.reprise.soldePret != null ? o.reprise.soldePret : null,
        soldeVisible: !!(o && o.reprise && o.reprise.soldePret != null),
        statut: "Envisagee", depuis: iso(),
      } : null,
      paiement: { depotPrevu: acompte || depot, depot: acompte ? "Declare" : depot ? "EnAttente" : "Aucun", versement: "EnAttente", depotDepuis: acompte || depot ? iso() : null, versementDepuis: null },
      administratif: { statut: "NonCommence", depuis: null },
      livraison: { datePrevue: null, remiseLe: null, confirmeeLe: null },
      attente: null,
      annulation: null,
      clotureLe: null,
      historique: [],
      aConfirmer: x.aConfirmer || null,
    };
    if (t.reprise && (!t.reprise.marque || !t.reprise.modele || !t.reprise.annee || t.reprise.kilometrage == null)) t.reprise.statut = "InformationsManquantes";
    return t;
  }
  // Aperçu : analyse du dossier tel qu'il serait créé (rien n'est enregistré).
  function apercu(x) {
    if (!x.prospectId || !x.vehiculeId || !S.vehicule(x.vehiculeId)) return null;
    var t = construire(x);
    return { transaction: t, analyse: Regles.analyser(t, contexte(t)) };
  }

  function creer(x) {
    if (invalide(x)) return null;
    var acceptee = versionAcceptee(x);
    var o = x.soumissionId ? S.version(S.soumission(x.soumissionId), x.versionNumero).offre : null;
    var acompte = o && Number(o.acompteVerse) > 0 ? Number(o.acompteVerse) : null;
    var t = construire(x);
    t.reference = nouvelleReference();
    historiser(t, { type: "creation", description: t.brouillon ? "Transaction ouverte en brouillon : aucune version acceptée n'est retenue." : "Transaction ouverte.", nouveau: t.brouillon ? "Brouillon" : "En cours" });
    if (acceptee) historiser(t, { type: "proposition", description: "Proposition retenue : " + S.soumission(x.soumissionId).reference + " version " + x.versionNumero + " (instantané figé).", nouveau: "v" + x.versionNumero });
    if (acompte) historiser(t, { type: "paiement", description: "Acompte de " + P.argent(acompte) + " indiqué dans la soumission : déclaré, à confirmer par une personne autorisée.", nouveau: ref.statutsPaiement.Declare });
    etat.transactions.push(t);
    journaliser(t, (t.brouillon ? "Transaction ouverte en brouillon" : "Transaction ouverte") + " : " + nomVehicule(t) + " (" + ref.modesAchat[t.modeAchat].toLowerCase() + ").");
    changer();
    return t;
  }

  function confirmer(id, cle) {
    var t = transaction(id);
    if (!modifiable(t) || t.brouillon || ["prixConfirme", "optionsConfirmees"].indexOf(cle) < 0 || t.commercial[cle]) return null;
    return avecAnnulation(t, function () {
      t.commercial[cle] = true;
      historiser(t, { type: "validation", description: cle === "prixConfirme" ? "Prix de la proposition confirmé avec le client." : "Options confirmées avec le client.", nouveau: "Confirmé" });
    });
  }

  // Demande de validation de remise : préparée par le conseiller, transmise HORS Phineas (rien n'est envoyé).
  function noterDemandeRemise(id) {
    var t = transaction(id);
    if (!modifiable(t) || t.commercial.remise !== "ADemander") return null;
    return avecAnnulation(t, function () {
      t.commercial.remise = "Demandee";
      t.commercial.remiseDepuis = iso();
      historiser(t, { type: "validation", description: "Demande de validation de la remise transmise au directeur des ventes (hors Phineas).", ancien: ref.statutsRemise.ADemander, nouveau: ref.statutsRemise.Demandee });
      journaliser(t, "Validation de la remise demandée au directeur des ventes.");
    });
  }

  function completerReprise(id, patch) {
    var t = transaction(id);
    if (!modifiable(t) || !t.reprise || ["Envisagee", "InformationsManquantes"].indexOf(t.reprise.statut) < 0) return null;
    return avecAnnulation(t, function () {
      ["marque", "modele"].forEach(function (k) { if (patch[k] !== undefined) t.reprise[k] = String(patch[k] || "").trim() || null; });
      if (patch.annee !== undefined) t.reprise.annee = patch.annee ? Number(patch.annee) : null;
      if (patch.kilometrage !== undefined) t.reprise.kilometrage = patch.kilometrage !== "" && patch.kilometrage != null ? Number(patch.kilometrage) : null;
      var complet = t.reprise.marque && t.reprise.modele && t.reprise.annee && t.reprise.kilometrage != null;
      var avant = t.reprise.statut;
      t.reprise.statut = complet ? "Envisagee" : "InformationsManquantes";
      historiser(t, { type: "reprise", description: "Informations de la reprise complétées par le conseiller.", ancien: ref.statutsReprise[avant], nouveau: ref.statutsReprise[t.reprise.statut] });
    });
  }
  function demanderEvaluation(id) {
    var t = transaction(id);
    if (!modifiable(t) || !t.reprise || t.reprise.statut !== "Envisagee") return null;
    return avecAnnulation(t, function () {
      t.reprise.statut = "EvaluationDemandee";
      t.reprise.depuis = iso();
      historiser(t, { type: "reprise", description: "Évaluation de la reprise demandée au personnel autorisé (hors Phineas).", ancien: ref.statutsReprise.Envisagee, nouveau: ref.statutsReprise.EvaluationDemandee });
      journaliser(t, "Évaluation de la reprise demandée.");
    });
  }
  // Décision du client sur la valeur confirmée (déclarée par le conseiller). La proposition figée n'est pas modifiée.
  function decisionReprise(id, accepte) {
    var t = transaction(id);
    if (!modifiable(t) || !t.reprise || t.reprise.statut !== "ValeurConfirmee") return null;
    return avecAnnulation(t, function () {
      t.reprise.statut = accepte ? "Acceptee" : "Refusee";
      t.reprise.depuis = iso();
      historiser(t, { type: "reprise", description: accepte ? "Le client accepte la valeur de reprise confirmée (" + P.argent(t.reprise.valeurConfirmee) + ")." : "Le client refuse la valeur de reprise confirmée.", ancien: ref.statutsReprise.ValeurConfirmee, nouveau: ref.statutsReprise[t.reprise.statut] });
      journaliser(t, accepte ? "Reprise acceptée par le client." : "Reprise refusée par le client : proposition à revoir.");
    });
  }

  // Mode d'achat : ne touche jamais une décision F&A existante, sauf pour la marquer non applicable (comptant).
  function choisirMode(id, mode) {
    var t = transaction(id);
    if (!modifiable(t) || ref.modesAchat[mode] === undefined || t.modeAchat === mode) return null;
    var f = t.financement;
    if (["Approuve", "ApprouveSousConditions", "EnAnalyse", "Transmis", "InformationRequise"].indexOf(f.statut) >= 0 && mode !== "comptant" && Regles.avecFinancement(t)) return null;
    return avecAnnulation(t, function () {
      var avant = t.modeAchat;
      t.modeAchat = mode;
      var fAvant = f.statut;
      if (mode === "comptant") {
        f.statut = "NonApplicable";
        f.depuis = iso();
      } else if (["NonApplicable", "Annule", "Refuse"].indexOf(f.statut) >= 0) {
        f.statut = "NonCommence"; f.depuis = iso(); f.pieces = []; f.conditions = []; f.preparation = {};
      }
      historiser(t, { type: "mode", description: "Mode d'achat enregistré : " + ref.modesAchat[mode] + "." + (fAvant !== f.statut ? " Financement : " + ref.statutsFinancement[fAvant] + " → " + ref.statutsFinancement[f.statut] + "." : ""), ancien: ref.modesAchat[avant], nouveau: ref.modesAchat[mode] });
      journaliser(t, "Mode d'achat : " + ref.modesAchat[avant].toLowerCase() + " → " + ref.modesAchat[mode].toLowerCase() + ".");
    });
  }
  // Assistant de préparation du financement : seuls « client » et « documents » sont cochés par le conseiller.
  function cocherPreparation(id, cle, valeur) {
    var t = transaction(id);
    if (!modifiable(t) || !Regles.avecFinancement(t) || ["client", "documents"].indexOf(cle) < 0) return false;
    if (["NonCommence", "EnPreparation", "DossierIncomplet"].indexOf(t.financement.statut) < 0) return false;
    t.financement.preparation = t.financement.preparation || {};
    t.financement.preparation[cle] = !!valeur;
    if (t.financement.statut === "NonCommence" && valeur) { t.financement.statut = "EnPreparation"; t.financement.depuis = iso(); }
    changer();
    return true;
  }
  function preparationFinancement(t) {
    var f = t.financement || {}, prep = f.preparation || {};
    var transmis = ["Transmis", "EnAnalyse", "InformationRequise", "Approuve", "ApprouveSousConditions", "Refuse"].indexOf(f.statut) >= 0;
    var c = P.contact(t.prospectId);
    var auto = {
      mode: t.modeAchat && t.modeAchat !== "indetermine",
      infos: !!(c && (c.telephone || c.courriel) && P.opportunite(t.opportuniteId)),
      proposition: !t.brouillon && !!t.proposition,
      // Confirmée par F&A uniquement : le dossier est entré en analyse (ou a reçu une décision).
      completude: ["EnAnalyse", "Approuve", "ApprouveSousConditions", "Refuse"].indexOf(f.statut) >= 0,
      transmission: transmis,
    };
    return ref.preparationFinancement.map(function (x) {
      var manuel = x.cle === "client" || x.cle === "documents";
      return { cle: x.cle, libelle: x.libelle, coche: manuel ? !!prep[x.cle] || transmis : !!auto[x.cle], manuel: manuel, parFA: x.cle === "completude" };
    });
  }
  function peutTransmettre(t) {
    if (!modifiable(t) || !Regles.avecFinancement(t) || t.brouillon) return false;
    if (["NonCommence", "EnPreparation", "DossierIncomplet"].indexOf(t.financement.statut) < 0) return false;
    var p = t.financement.preparation || {};
    return !!(p.client && p.documents);
  }
  // Le conseiller note qu'il a transmis le dossier (hors Phineas). La suite appartient au service F&A.
  function transmettreFinancement(id) {
    var t = transaction(id);
    if (!peutTransmettre(t)) return null;
    return avecAnnulation(t, function () {
      var avant = t.financement.statut;
      t.financement.statut = "Transmis";
      t.financement.depuis = iso();
      historiser(t, { type: "financement", description: "Dossier de financement transmis au service F&A (hors Phineas).", ancien: ref.statutsFinancement[avant], nouveau: ref.statutsFinancement.Transmis });
      journaliser(t, "Dossier de financement transmis au service F&A.");
    });
  }
  // Le conseiller relaie au client une demande de pièce : il ne reçoit ni ne consulte le document.
  function noterRelancePiece(id) {
    var t = transaction(id);
    if (!modifiable(t) || !(t.financement.pieces || []).some(function (p) { return p.statut === "Requise"; })) return null;
    return avecAnnulation(t, function () {
      historiser(t, { type: "financement", description: "Client informé de la pièce requise par F&A (message préparé dans Phineas, transmis par le conseiller)." });
      journaliser(t, "Client informé de la pièce requise par le service F&A.", "Vérifier auprès de F&A la réception de la pièce");
    });
  }

  // Après un refus : le conseiller peut demander à F&A de réexaminer les options. Aucune solution n'est garantie.
  function noterReexamen(id) {
    var t = transaction(id);
    if (!modifiable(t) || t.financement.statut !== "Refuse") return null;
    return avecAnnulation(t, function () {
      historiser(t, { type: "financement", description: "Demande de réexamen des options disponibles transmise au service F&A (hors Phineas). Aucune solution n'est garantie." });
      journaliser(t, "Réexamen des options de financement demandé au service F&A.");
    });
  }

  // Paiements : le conseiller peut seulement noter ce que le client DÉCLARE avoir payé.
  function declarerPaiement(id, cle) {
    var t = transaction(id);
    var champ = cle === "depot" ? "depot" : "versement";
    if (!modifiable(t) || ["EnAttente", "Aucun"].indexOf(t.paiement[champ]) < 0) return null;
    if (champ === "depot" && !t.paiement.depotPrevu) return null;
    return avecAnnulation(t, function () {
      var avant = t.paiement[champ];
      t.paiement[champ] = "Declare";
      t.paiement[champ + "Depuis"] = iso();
      historiser(t, { type: "paiement", description: (champ === "depot" ? "Dépôt" : "Paiement") + " déclaré par le client, à confirmer par une personne autorisée.", ancien: ref.statutsPaiement[avant], nouveau: ref.statutsPaiement.Declare });
    });
  }
  function definirDepot(id, montant) {
    var t = transaction(id);
    var m = Number(montant);
    if (!modifiable(t) || !(m > 0) || ["Declare", "Confirme"].indexOf(t.paiement.depot) >= 0) return null;
    return avecAnnulation(t, function () {
      t.paiement.depotPrevu = m;
      t.paiement.depot = "EnAttente";
      t.paiement.depotDepuis = iso();
      historiser(t, { type: "paiement", description: "Dépôt envisagé : " + P.argent(m) + ".", nouveau: ref.statutsPaiement.EnAttente });
    });
  }

  function definirDateLivraison(id, date) {
    var t = transaction(id);
    if (!modifiable(t) || !date || P.ecartJours(date) < 0) return null;
    return avecAnnulation(t, function () {
      var avant = t.livraison.datePrevue;
      t.livraison.datePrevue = new Date(date).toISOString();
      historiser(t, { type: "livraison", description: "Date de livraison envisagée : " + P.dateCourte(date) + ".", ancien: avant ? P.dateCourte(avant) : null, nouveau: P.dateCourte(date) });
    });
  }

  // Remise et livraison : seulement lorsque toutes les conditions applicables sont satisfaites.
  function refusLivraison(t) {
    if (!t || !estActive(t)) return "Transaction non active.";
    if (t.statut === "EnAttente") return "Transaction en attente : reprenez-la d'abord.";
    var a = analyse(t);
    if (!a.pret) return "Conditions non remplies : " + a.conditionsRestantes.map(function (x) { return x.libelle.toLowerCase(); }).join(", ") + ".";
    return null;
  }
  function declarerRemise(id) {
    var t = transaction(id);
    if (refusLivraison(t) || t.livraison.remiseLe) return null;
    return avecAnnulation(t, function () {
      t.livraison.remiseLe = iso();
      historiser(t, { type: "livraison", description: "Remise du véhicule au client déclarée par le conseiller.", nouveau: "Véhicule remis" });
    });
  }
  function confirmerLivraison(id) {
    var t = transaction(id);
    if (refusLivraison(t) || !t.livraison.remiseLe) return null;
    return avecAnnulation(t, function () {
      t.livraison.confirmeeLe = iso();
      t.statut = "Livree";
      historiser(t, { type: "statut", description: "Livraison confirmée.", ancien: "Prête à livrer", nouveau: "Livrée" });
      journaliser(t, "Véhicule livré : " + nomVehicule(t) + ".");
    });
  }
  // Clôture administrative : distincte de la livraison.
  function refusCloture(t) {
    if (!t || t.statut !== "Livree") return "Seule une transaction livrée peut être clôturée.";
    var a = analyse(t);
    var restants = a.axes.filter(function (x) { return x.cle !== "livraison"; }).some(function (x) { return x.etat !== "Terminee"; });
    if (restants) return "Des étapes restent ouvertes.";
    return null;
  }
  function cloturer(id) {
    var t = transaction(id);
    if (refusCloture(t)) return null;
    return avecAnnulation(t, function () {
      t.statut = "Cloturee";
      t.clotureLe = iso();
      historiser(t, { type: "statut", description: "Dossier clôturé.", ancien: "Livrée", nouveau: "Clôturée" });
      journaliser(t, "Dossier de transaction clôturé.");
    });
  }

  function mettreEnAttente(id, motif) {
    var t = transaction(id);
    if (!t || t.statut !== "Active" || !ref.motifsAttente[motif]) return null;
    return avecAnnulation(t, function () {
      t.statut = "EnAttente";
      t.attente = { motif: motif, depuis: iso() };
      historiser(t, { type: "statut", description: "Transaction mise en attente : " + ref.motifsAttente[motif].toLowerCase() + ".", ancien: "En cours", nouveau: "En attente" });
      journaliser(t, "Transaction mise en attente : " + ref.motifsAttente[motif].toLowerCase() + ".");
    });
  }
  function reprendre(id) {
    var t = transaction(id);
    if (!t || t.statut !== "EnAttente") return null;
    return avecAnnulation(t, function () {
      t.statut = "Active";
      t.attente = null;
      historiser(t, { type: "statut", description: "Transaction reprise.", ancien: "En attente", nouveau: "En cours" });
    });
  }

  // Annulation : la transaction reste dans l'historique ; l'opportunité n'est pas marquée perdue.
  function annuler(id, a) {
    var t = transaction(id);
    if (!t || !estActive(t) || !ref.motifsAnnulation[a.motif] || !ref.auteursAnnulation[a.auteur]) return null;
    return avecAnnulation(t, function () {
      var avant = statutAffiche(analyse(t).statut).libelle;
      t.statut = "Annulee";
      t.annulation = { motif: a.motif, auteur: a.auteur, date: iso(), commentaire: a.commentaire || null, reprendre: !!a.reprendre };
      historiser(t, { type: "annulation", description: "Transaction annulée par " + ref.auteursAnnulation[a.auteur].toLowerCase() + " : " + ref.motifsAnnulation[a.motif].toLowerCase() + "." + (a.commentaire ? " " + a.commentaire : ""), ancien: avant, nouveau: "Annulée" });
      journaliser(t, "Transaction annulée : " + ref.motifsAnnulation[a.motif].toLowerCase() + "." + (a.reprendre ? " Le client pourrait reprendre la discussion." : ""),
        a.reprendre ? "Reprendre contact avec le client" : null);
    });
  }

  // Changement explicite d'étape de l'opportunité (jamais automatique).
  function peutMarquerGagnee(t) {
    var o = t && P.opportunite(t.opportuniteId);
    return !!(o && P.estActive(o) && (t.statut === "Livree" || t.statut === "Cloturee" || (t.administratif && t.administratif.statut === "Confirme")));
  }
  function marquerGagnee(id) {
    var t = transaction(id);
    if (!peutMarquerGagnee(t)) return null;
    var annulerEtape = P.changerEtape(t.opportuniteId, "Gagne");
    if (!annulerEtape) return null;
    historiser(t, { type: "opportunite", description: "Opportunité marquée « Gagné » par le conseiller.", nouveau: "Gagné" });
    changer();
    return function () {
      t.historique.pop();
      annulerEtape();
      changer();
    };
  }

  // Remplace la proposition retenue par une autre version ACCEPTÉE (après refus, nouvelle version, autre véhicule).
  function remplacerProposition(id, soumissionId, numero) {
    var t = transaction(id);
    var s = S.soumission(soumissionId);
    var v = s ? S.version(s, numero) : null;
    if (!modifiable(t) || !v || v.statut !== "Acceptee" || s.opportuniteId !== t.opportuniteId) return null;
    if (t.soumissionId === soumissionId && t.versionNumero === numero && !t.brouillon) return null;
    var st = statutVehicule(v.vehicule.id);
    if (["Vendu", "Livre"].indexOf(st) >= 0) return null;
    if (etat.transactions.some(function (x) { return x.id !== t.id && x.vehiculeId === v.vehicule.id && estActive(x); })) return null;
    return avecAnnulation(t, function () {
      var avant = t.soumissionId ? (S.soumission(t.soumissionId) || {}).reference + " v" + t.versionNumero : "Aucune";
      t.soumissionId = s.id;
      t.versionNumero = numero;
      t.vehiculeId = v.vehicule.id;
      t.proposition = { dateFigee: iso(), vehicule: cloner(v.vehicule), offre: cloner(v.offre) };
      t.brouillon = false;
      t.commercial = { prixConfirme: false, optionsConfirmees: false, remise: Number(v.offre.remise || 0) > ref.seuilRemiseApprobation ? "ADemander" : "NonRequise", remiseDepuis: null, accordClient: v.dateModification || v.date };
      if (t.financement.statut === "Refuse") { t.financement.statut = "EnPreparation"; t.financement.depuis = iso(); t.financement.preparation = {}; t.financement.pieces = []; t.financement.conditions = []; }
      historiser(t, { type: "proposition", description: "Proposition retenue remplacée : " + s.reference + " version " + numero + " (nouvel instantané figé). Les validations commerciales sont à refaire.", ancien: avant, nouveau: s.reference + " v" + numero });
      journaliser(t, "Proposition retenue : " + s.reference + " version " + numero + ".");
    });
  }
  // Versions acceptées pouvant devenir la proposition retenue.
  function versionsRetenables(t) {
    var res = [];
    S.parOpportunite(t.opportuniteId).forEach(function (s) {
      s.versions.forEach(function (v) {
        if (v.statut === "Acceptee" && !(s.id === t.soumissionId && v.numero === t.versionNumero && !t.brouillon)) res.push({ soumission: s, version: v });
      });
    });
    return res;
  }

  // ---------- Brouillons de messages (rien n'est envoyé) ----------
  function brouillon(t, type) {
    var c = P.contact(t.prospectId);
    var prenom = c ? c.prenom : "";
    var a = analyse(t);
    var o = offre(t);
    if (type === "remise") {
      return "Bonjour,\n\nJe sollicite votre approbation pour la remise prévue dans la transaction " + t.reference + " (" + nomClient(t) + ").\n" +
        "Véhicule : " + nomVehicule(t) + "\nRemise : " + P.argent(o ? o.remise : 0) + (o && o.motifRemise ? " — " + o.motifRemise : "") +
        "\n\nMerci de me confirmer votre décision.\n\n" + auteur();
    }
    if (type === "reexamen") {
      return "Bonjour,\n\nLe financement de la transaction " + t.reference + " (" + nomClient(t) + ", " + nomVehicule(t) + ") a été refusé.\n" +
        "Pourriez-vous m'indiquer si d'autres options peuvent être examinées (montant, durée, mise de fonds, autre véhicule) ? Je n'ai rien promis au client.\n\nMerci,\n" + auteur();
    }
    if (type === "piece") {
      var pieces = (t.financement.pieces || []).filter(function (p) { return p.statut === "Requise"; }).map(function (p) { return "- " + p.libelle; }).join("\n");
      return "Bonjour " + prenom + ",\n\nPour poursuivre l'analyse de votre dossier de financement, le service Financement et assurance a besoin de l'élément suivant :\n" + pieces +
        "\n\nMerci de le remettre directement au service F&A. N'hésitez pas à m'appeler si vous avez des questions.\n\n" + auteur();
    }
    // Communication au client sur l'avancement (sans promesse de date si elle n'est pas connue).
    var vehicule = a.axes.filter(function (x) { return x.cle === "vehicule"; })[0];
    var at = atelier(t.vehiculeId);
    return "Bonjour " + prenom + ",\n\nVoici où en est votre dossier pour le " + nomVehicule(t) + ".\n" +
      (vehicule.etat === "Terminee" ? "Le véhicule est prêt." : "Le véhicule est en cours de préparation par notre atelier" + (at && at.disponibiliteEstimee ? " ; disponibilité estimée le " + P.dateCourte(at.disponibiliteEstimee) + "." : " ; je vous confirmerai une date dès qu'elle sera connue.")) +
      "\n\nJe reste disponible pour toute question.\n\n" + auteur();
  }

  // ---------- Simulation d'événements d'autres départements (FICTIF) ----------
  // Ces événements remplacent, pour la démonstration, ce que l'atelier, F&A, la direction ou l'administration
  // feraient depuis leurs propres espaces. Ils sont marqués « simulation » dans l'historique.
  function tache(a, type, statut) {
    (a.taches || []).filter(function (x) { return x.type === type && x.statut !== "Terminee"; }).forEach(function (x) { x.statut = statut; x.depuis = iso(); });
  }
  function changerStatutVehicule(t, nouveau, commentaire) {
    var ancien = statutVehicule(t.vehiculeId);
    etat.statutsSimules[t.vehiculeId] = nouveau;
    var a = atelier(t.vehiculeId);
    if (!a) {
      a = { vehiculeId: t.vehiculeId, disponibiliteEstimee: null, taches: [], historique: [] };
      etat.atelier.push(a);
    }
    a.historique.push({ date: iso(), ancien: ancien, nouveau: nouveau, departement: "atelier", commentaire: "Simulation : " + commentaire });
    return ancien;
  }
  var EVENEMENTS = [
    { code: "atelier-inspection-debut", departement: "atelier", libelle: "L'atelier commence l'inspection",
      applicable: function (t) { return statutVehicule(t.vehiculeId) === "Recu"; },
      appliquer: function (t) { var an = changerStatutVehicule(t, "EnInspection", "inspection commencée"); tache(atelier(t.vehiculeId), "inspection", "EnCours"); return [an, "EnInspection"]; } },
    { code: "atelier-inspection-fin", departement: "atelier", libelle: "L'atelier termine l'inspection",
      applicable: function (t) { return statutVehicule(t.vehiculeId) === "EnInspection"; },
      appliquer: function (t) { var an = changerStatutVehicule(t, "InspectionTerminee", "inspection terminée"); tache(atelier(t.vehiculeId), "inspection", "Terminee"); return [an, "InspectionTerminee"]; } },
    { code: "atelier-reparation-fin", departement: "atelier", libelle: "L'atelier termine les réparations",
      applicable: function (t) { var a = atelier(t.vehiculeId); return !!a && a.taches.some(function (x) { return x.type === "reparation" && x.statut !== "Terminee"; }); },
      appliquer: function (t) { tache(atelier(t.vehiculeId), "reparation", "Terminee"); return null; } },
    { code: "atelier-nettoyage-debut", departement: "atelier", libelle: "L'atelier commence le nettoyage",
      applicable: function (t) { return statutVehicule(t.vehiculeId) === "InspectionTerminee" && !reparationsOuvertes(t); },
      appliquer: function (t) { var an = changerStatutVehicule(t, "NettoyageEnCours", "nettoyage commencé"); tache(atelier(t.vehiculeId), "nettoyage", "EnCours"); return [an, "NettoyageEnCours"]; } },
    { code: "atelier-pret", departement: "atelier", libelle: "L'atelier déclare le véhicule prêt",
      applicable: function (t) { return ["InspectionTerminee", "NettoyageEnCours"].indexOf(statutVehicule(t.vehiculeId)) >= 0 && !reparationsOuvertes(t); },
      appliquer: function (t) { var a = atelier(t.vehiculeId); var an = changerStatutVehicule(t, "PretPourVente", "véhicule prêt pour la vente"); tache(a, "nettoyage", "Terminee"); tache(a, "preparation", "Terminee"); return [an, "PretPourVente"]; } },
    { code: "fa-analyse", departement: "fa", libelle: "F&A commence l'analyse du dossier",
      applicable: function (t) { return t.financement.statut === "Transmis"; },
      appliquer: function (t) { return financement(t, "EnAnalyse"); } },
    { code: "fa-piece-requise", departement: "fa", libelle: "F&A demande une pièce justificative",
      applicable: function (t) { return t.financement.statut === "EnAnalyse"; },
      appliquer: function (t) { t.financement.pieces.push({ libelle: "Justificatif de résidence", statut: "Requise", depuis: iso() }); return financement(t, "InformationRequise"); } },
    { code: "fa-piece-recue", departement: "fa", libelle: "F&A reçoit et vérifie la pièce",
      applicable: function (t) { return t.financement.statut === "InformationRequise"; },
      appliquer: function (t) { t.financement.pieces.forEach(function (p) { if (p.statut === "Requise") { p.statut = "Verifiee"; p.depuis = iso(); } }); return financement(t, "EnAnalyse"); } },
    { code: "fa-approuve", departement: "fa", libelle: "F&A approuve le financement",
      applicable: function (t) { return t.financement.statut === "EnAnalyse"; },
      appliquer: function (t) { return financement(t, "Approuve"); } },
    { code: "fa-approuve-conditions", departement: "fa", libelle: "F&A approuve sous conditions",
      applicable: function (t) { return t.financement.statut === "EnAnalyse"; },
      appliquer: function (t) { t.financement.conditions = [{ libelle: "Preuve d'assurance du véhicule à fournir", responsable: "client", remplie: false }]; return financement(t, "ApprouveSousConditions"); } },
    { code: "fa-refuse", departement: "fa", libelle: "F&A refuse le financement",
      applicable: function (t) { return t.financement.statut === "EnAnalyse"; },
      appliquer: function (t) { return financement(t, "Refuse"); } },
    { code: "fa-condition", departement: "fa", libelle: "F&A confirme qu'une condition est remplie",
      applicable: function (t) { return t.financement.statut === "ApprouveSousConditions" && t.financement.conditions.some(function (x) { return !x.remplie; }); },
      appliquer: function (t) { var x = t.financement.conditions.filter(function (y) { return !y.remplie; })[0]; x.remplie = true; return ["Condition en attente", "Condition remplie : " + x.libelle]; } },
    { code: "direction-remise-ok", departement: "direction", libelle: "Le directeur approuve la remise",
      applicable: function (t) { return t.commercial.remise === "Demandee"; },
      appliquer: function (t) { t.commercial.remise = "Approuvee"; t.commercial.remiseDepuis = iso(); return [ref.statutsRemise.Demandee, ref.statutsRemise.Approuvee]; } },
    { code: "direction-remise-refus", departement: "direction", libelle: "Le directeur refuse la remise",
      applicable: function (t) { return t.commercial.remise === "Demandee"; },
      appliquer: function (t) { t.commercial.remise = "Refusee"; t.commercial.remiseDepuis = iso(); return [ref.statutsRemise.Demandee, ref.statutsRemise.Refusee]; } },
    { code: "evaluation-debut", departement: "evaluation", libelle: "L'évaluateur commence l'évaluation",
      applicable: function (t) { return t.reprise && t.reprise.statut === "EvaluationDemandee"; },
      appliquer: function (t) { return reprise(t, "EvaluationEnCours"); } },
    { code: "evaluation-valeur", departement: "evaluation", libelle: "L'évaluateur confirme une valeur (montant fictif)",
      applicable: function (t) { return t.reprise && t.reprise.statut === "EvaluationEnCours"; },
      appliquer: function (t) {
        // Montant fictif de démonstration (estimation de la proposition moins 500 $) : aucune évaluation de marché.
        var base = t.reprise.valeurEstimee != null ? Number(t.reprise.valeurEstimee) : 5000;
        t.reprise.valeurConfirmee = Math.max(0, base - 500);
        return reprise(t, "ValeurConfirmee");
      } },
    { code: "paiement-depot", departement: "administration", libelle: "L'administration confirme le dépôt",
      applicable: function (t) { return t.paiement.depot === "Declare"; },
      appliquer: function (t) { t.paiement.depot = "Confirme"; t.paiement.depotDepuis = iso(); return [ref.statutsPaiement.Declare, ref.statutsPaiement.Confirme]; } },
    { code: "paiement-versement", departement: "administration", libelle: "L'administration confirme le paiement du client",
      applicable: function (t) { return t.paiement.versement === "Declare"; },
      appliquer: function (t) { t.paiement.versement = "Confirme"; t.paiement.versementDepuis = iso(); return [ref.statutsPaiement.Declare, ref.statutsPaiement.Confirme]; } },
    { code: "admin-confirme", departement: "administration", libelle: "L'administration confirme les éléments administratifs",
      applicable: function (t) { return t.administratif.statut !== "Confirme" && !t.brouillon; },
      appliquer: function (t) { var an = t.administratif.statut; t.administratif.statut = "Confirme"; t.administratif.depuis = iso(); return [ref.statutsAdministratifs[an], ref.statutsAdministratifs.Confirme]; } },
  ];
  function reparationsOuvertes(t) {
    var a = atelier(t.vehiculeId);
    return !!a && a.taches.some(function (x) { return x.type === "reparation" && x.statut !== "Terminee"; });
  }
  function financement(t, nouveau) {
    var an = t.financement.statut;
    t.financement.statut = nouveau;
    t.financement.depuis = iso();
    return [ref.statutsFinancement[an], ref.statutsFinancement[nouveau]];
  }
  function reprise(t, nouveau) {
    var an = t.reprise.statut;
    t.reprise.statut = nouveau;
    t.reprise.depuis = iso();
    return [ref.statutsReprise[an], ref.statutsReprise[nouveau]];
  }
  function evenementsDisponibles(id) {
    var t = transaction(id);
    if (!modifiable(t)) return [];
    return EVENEMENTS.filter(function (e) { return e.applicable(t); }).map(function (e) {
      return { code: e.code, libelle: e.libelle, departement: e.departement, departementLibelle: ref.departements[e.departement].libelle };
    });
  }
  function simuler(id, code) {
    var t = transaction(id);
    var e = EVENEMENTS.filter(function (x) { return x.code === code; })[0];
    if (!modifiable(t) || !e || !e.applicable(t)) return null;
    return avecAnnulation(t, function () {
      var res = e.appliquer(t);
      var ancien = res && res[0] ? (ref.statutsVehicule[res[0]] || res[0]) : null;
      var nouveau = res && res[1] ? (ref.statutsVehicule[res[1]] || res[1]) : null;
      historiser(t, { type: "simulation", origine: "simulation", auteur: ref.departements[e.departement].libelle + " (simulation)", departement: e.departement,
        description: e.libelle + " — événement fictif de démonstration.", ancien: ancien, nouveau: nouveau });
    });
  }

  function reinitialiser() {
    try {
      window.sessionStorage.removeItem(CLE);
    } catch (e) {}
    etat = initial();
    modifie = false;
    cache = {};
    abonnes.forEach(function (f) { f(); });
  }

  window.Transactions = {
    ref: ref,
    conseillerNom: charge.conseillerNom,
    urlDetail: function (id) { return charge.urlDetail.replace("__id__", encodeURIComponent(id)); },
    urlNouvelle: function (p) {
      var q = Object.keys(p || {}).filter(function (k) { return p[k] != null && p[k] !== ""; }).map(function (k) { return k + "=" + encodeURIComponent(p[k]); }).join("&");
      return charge.urlNouvelle + (q ? "?" + q : "");
    },
    urlListe: charge.urlListe,
    abonner: function (f) { abonnes.push(f); },
    // lecture
    liste: liste,
    transaction: transaction,
    parOpportunite: parOpportunite,
    parProspect: parProspect,
    parSoumission: parSoumission,
    estActive: estActive,
    enCoursPourOpportunite: enCoursPourOpportunite,
    analyse: analyse,
    statutAffiche: statutAffiche,
    statutVehicule: statutVehicule,
    vehiculeActuel: vehiculeActuel,
    vehiculeDe: vehiculeDe,
    atelier: atelier,
    nomVehicule: nomVehicule,
    nomClient: nomClient,
    offre: offre,
    versionEnvisagee: versionEnvisagee,
    montants: montants,
    ecarts: ecarts,
    rendezVous: rendezVous,
    rdvLivraison: rdvLivraison,
    preparationFinancement: preparationFinancement,
    peutTransmettre: peutTransmettre,
    refusLivraison: refusLivraison,
    refusCloture: refusCloture,
    peutMarquerGagnee: peutMarquerGagnee,
    versionsRetenables: versionsRetenables,
    invalide: invalide,
    apercu: apercu,
    brouillon: brouillon,
    // écriture (conseiller)
    creer: creer,
    confirmer: confirmer,
    noterDemandeRemise: noterDemandeRemise,
    completerReprise: completerReprise,
    demanderEvaluation: demanderEvaluation,
    decisionReprise: decisionReprise,
    choisirMode: choisirMode,
    cocherPreparation: cocherPreparation,
    transmettreFinancement: transmettreFinancement,
    noterRelancePiece: noterRelancePiece,
    noterReexamen: noterReexamen,
    declarerPaiement: declarerPaiement,
    definirDepot: definirDepot,
    definirDateLivraison: definirDateLivraison,
    declarerRemise: declarerRemise,
    confirmerLivraison: confirmerLivraison,
    cloturer: cloturer,
    mettreEnAttente: mettreEnAttente,
    reprendre: reprendre,
    annuler: annuler,
    marquerGagnee: marquerGagnee,
    remplacerProposition: remplacerProposition,
    // démonstration uniquement : événements d'autres départements
    simulation: { evenements: evenementsDisponibles, simuler: simuler },
  };

  P.enregistrerModule({ estModifie: function () { return modifie; }, reinitialiser: reinitialiser });
})();
