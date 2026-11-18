// Module Rendez-vous : état local de démonstration (même principe que prospects-store.js et soumissions-store.js).
// Les rendez-vous sont des événements d'agenda locaux : aucune réservation réelle, aucun envoi, aucun appel réseau.
// Le véhicule est lu dans l'inventaire de démonstration du module Soumissions (une seule source), jamais modifié.
(function () {
  "use strict";

  var source = document.getElementById("rendezvous-donnees");
  if (!source) return;
  var charge = JSON.parse(source.textContent);
  var P = window.Prospects, S = window.Soumissions;
  var d = charge.donnees;
  var ref = charge.referentiels;
  var CLE = "phineas.salesos.rendezvous.v1:" + charge.conseillerNom;

  var ACTIFS = ["Planifie", "AConfirmer", "Confirme", "EnCours"];
  var CLOS = ["Termine", "Annule", "ClientAbsent", "Replanifie"];
  var TRANSITIONS = {
    // « En cours » sans confirmation préalable : le client s'est présenté (possible seulement à l'heure prévue).
    Planifie: ["AConfirmer", "Confirme", "EnCours", "Annule", "ClientAbsent"],
    AConfirmer: ["Confirme", "EnCours", "Annule", "ClientAbsent"],
    Confirme: ["EnCours", "Annule", "ClientAbsent"],
    EnCours: ["Termine"],
    Termine: [],
    Annule: [],
    ClientAbsent: [],
    Replanifie: [],
  };
  var VEHICULE_INDISPONIBLE = ["Vendu", "Livre"];
  var VEHICULE_A_PREPARER = ["Recu", "EnInspection", "InspectionTerminee", "NettoyageEnCours"];
  // Types pour lesquels un véhicule est proposé (obligatoire pour l'essai routier).
  var AVEC_VEHICULE = ["EssaiRoutier", "PresentationVehicule", "Livraison", "DiscussionSoumission", "Negociation"];

  function cloner(o) {
    return JSON.parse(JSON.stringify(o));
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
  var etat = lire() || { rendezVous: cloner(d.rendezVous), compteur: 0 };
  var modifie = !!lire();
  var abonnes = [];
  function changer() {
    modifie = true;
    ecrire();
    abonnes.forEach(function (f) { f(); });
    if (P) P.rafraichir();
  }

  // ---------- Dates ----------
  function maintenant() {
    return new Date();
  }
  function debut(r) {
    return new Date(r.debut);
  }
  function fin(r) {
    return new Date(new Date(r.debut).getTime() + r.dureeMinutes * 60000);
  }
  function memeJour(a, b) {
    a = new Date(a); b = new Date(b);
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  // Chevauchement strict : un rendez-vous qui finit à 10 h et un autre qui commence à 10 h ne se chevauchent pas.
  function chevauche(debutA, finA, debutB, finB) {
    return debutA < finB && debutB < finA;
  }
  var fmtHeure = new Intl.DateTimeFormat("fr-CA", { hour: "numeric", minute: "2-digit" });
  var fmtJour = new Intl.DateTimeFormat("fr-CA", { weekday: "long", day: "numeric", month: "long" });
  var fmtJourCourt = new Intl.DateTimeFormat("fr-CA", { weekday: "short", day: "numeric", month: "short" });
  function heure(x) {
    return fmtHeure.format(new Date(x));
  }
  function jourTexte(x) {
    var e = P.ecartJours(x);
    if (e === 0) return "Aujourd'hui";
    if (e === 1) return "Demain";
    if (e === -1) return "Hier";
    var t = fmtJour.format(new Date(x));
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function jourCourt(x) {
    return fmtJourCourt.format(new Date(x));
  }
  function plage(r) {
    return heure(debut(r)) + " – " + heure(fin(r));
  }
  function creneauTexte(r) {
    return jourTexte(r.debut) + ", " + plage(r);
  }

  // ---------- Lecture ----------
  function liste() {
    return etat.rendezVous;
  }
  function rdv(id) {
    return etat.rendezVous.filter(function (r) { return r.id === id; })[0] || null;
  }
  function trier(l) {
    return l.slice().sort(function (a, b) { return debut(a) - debut(b); });
  }
  function parOpportunite(oppId) {
    return trier(etat.rendezVous.filter(function (r) { return r.opportuniteId === oppId; }));
  }
  function parProspect(id) {
    return trier(etat.rendezVous.filter(function (r) { return r.prospectId === id; }));
  }
  function parSoumission(id) {
    return trier(etat.rendezVous.filter(function (r) { return r.soumissionId === id; }));
  }
  function estActif(r) {
    return ACTIFS.indexOf(r.statut) >= 0;
  }
  function estModifiable(r) {
    return ["Planifie", "AConfirmer", "Confirme"].indexOf(r.statut) >= 0;
  }
  function type(cle) {
    return ref.types.filter(function (t) { return t.cle === cle; })[0] || { cle: cle, libelle: cle, icone: "bi-calendar-event" };
  }
  function statutRef(cle) {
    return ref.statuts.filter(function (s) { return s.cle === cle; })[0] || { cle: cle, libelle: cle, icone: "bi-circle" };
  }
  function libelle(liste, cle) {
    return cle && ref[liste] && ref[liste][cle] ? ref[liste][cle] : null;
  }
  function estEssai(r) {
    return r.type === "EssaiRoutier";
  }
  function vehicule(id) {
    return id && S ? S.vehicule(id) : null;
  }
  function nomVehicule(v) {
    return v ? (S ? S.nomVehicule(v) : v.marque + " " + v.modele) : null;
  }

  // Disponibilité d'un véhicule pour un rendez-vous (lecture seule de l'inventaire de démonstration).
  function etatVehicule(v) {
    if (!v) return { selectionnable: false, niveau: "bloque", message: "Véhicule introuvable dans l'inventaire de démonstration." };
    if (VEHICULE_INDISPONIBLE.indexOf(v.statutActuel) >= 0) return { selectionnable: false, niveau: "bloque", message: "Véhicule « " + S.libelleStatutVehicule(v.statutActuel).toLowerCase() + " » : indisponible pour un rendez-vous." };
    if (VEHICULE_A_PREPARER.indexOf(v.statutActuel) >= 0) return { selectionnable: true, niveau: "attention", message: "Préparation à vérifier : « " + S.libelleStatutVehicule(v.statutActuel).toLowerCase() + " »." };
    if (v.statutActuel === "Reserve") return { selectionnable: true, niveau: "attention", message: "Véhicule réservé : vérifier qu'il peut être présenté." };
    return { selectionnable: true, niveau: "ok", message: "Prêt pour la vente." };
  }

  // Conflits pour un créneau (exclut le rendez-vous lui-même et celui qu'on replanifie).
  function conflits(c) {
    var d1 = new Date(c.debut);
    var f1 = new Date(d1.getTime() + c.dureeMinutes * 60000);
    var exclus = [c.id, c.exclure].filter(Boolean);
    var autres = etat.rendezVous.filter(function (r) {
      return exclus.indexOf(r.id) < 0 && estActif(r) && chevauche(d1, f1, debut(r), fin(r));
    });
    return {
      conseiller: autres.filter(function (r) { return r.conseillerId === c.conseillerId; }),
      vehicule: c.vehiculeId ? autres.filter(function (r) { return r.vehiculeId === c.vehiculeId; }) : [],
      passe: d1 < maintenant(),
    };
  }

  // Ce qui demande une action du conseiller, du plus grave au moins grave. Chaque élément a un texte (jamais la couleur seule).
  function actionsRequises(r) {
    var a = [];
    var maintenant_ = maintenant();
    var v = vehicule(r.vehiculeId);
    if (estActif(r) && fin(r) < maintenant_) a.push({ code: "statut-passe", niveau: "critique", texte: "Créneau passé : indiquez s'il a eu lieu (terminé, client absent) ou replanifiez." });
    if (estActif(r)) {
      if (estEssai(r) && !r.vehiculeId) a.push({ code: "essai-sans-vehicule", niveau: "critique", texte: "Essai routier sans véhicule." });
      if (r.vehiculeId) {
        var ev = etatVehicule(v);
        if (ev.niveau === "bloque") a.push({ code: "vehicule-indisponible", niveau: "critique", texte: ev.message });
        else if (ev.niveau === "attention") a.push({ code: "vehicule-preparation", niveau: "attention", texte: ev.message });
      }
      var c = conflits(r);
      if (c.vehicule.length) a.push({ code: "conflit-vehicule", niveau: "critique", texte: "Véhicule déjà prévu pour un autre rendez-vous (" + c.vehicule.map(function (x) { return plage(x); }).join(", ") + ")." });
      if (c.conseiller.length) a.push({ code: "conflit-conseiller", niveau: "attention", texte: "Chevauchement avec un autre rendez-vous du conseiller (" + c.conseiller.map(function (x) { return plage(x); }).join(", ") + ")." });
      if (r.statut === "AConfirmer" || (r.statut === "Planifie" && P.ecartJours(r.debut) <= 1 && fin(r) >= maintenant_)) a.push({ code: "a-confirmer", niveau: "attention", texte: "Confirmation du client à obtenir." });
    }
    if (r.statut === "Termine" && !r.resultat) a.push({ code: "resultat-manquant", niveau: "attention", texte: "Résultat de la rencontre à enregistrer." });
    if (!r.replanifieVers && ((r.statut === "Annule" && r.annulation && r.annulation.intentionReplanifier) || (r.statut === "ClientAbsent" && r.absence && r.absence.prochaineAction === "autre-date"))) {
      a.push({ code: "a-replanifier", niveau: "attention", texte: "Nouveau créneau à proposer au client." });
    }
    return a;
  }
  function suiviRequis(r) {
    return actionsRequises(r).some(function (x) { return ["statut-passe", "resultat-manquant", "a-replanifier"].indexOf(x.code) >= 0; });
  }

  // Actions de statut proposées, avec le motif quand elles sont impossibles.
  function transitions(r) {
    return (TRANSITIONS[r.statut] || []).map(function (cible) {
      return { cle: cible, motif: refus(r, cible) };
    });
  }
  function refus(r, cible) {
    if ((TRANSITIONS[r.statut] || []).indexOf(cible) < 0) return "Transition impossible depuis « " + statutRef(r.statut).libelle + " ».";
    var m = maintenant();
    if (cible === "Confirme" && fin(r) < m) return "Le créneau est passé : déclarez une absence ou replanifiez.";
    if (cible === "ClientAbsent" && debut(r) > m) return "Possible seulement une fois l'heure du rendez-vous passée.";
    if (cible === "EnCours") {
      if (r.statut !== "Confirme" && debut(r).getTime() - 30 * 60000 > m.getTime()) return "Sans confirmation, possible seulement à l'arrivée du client (30 min avant l'heure prévue au plus tôt).";
      if (debut(r) > m && !memeJour(r.debut, m)) return "Le rendez-vous ne peut commencer que le jour prévu.";
      if (estEssai(r)) {
        if (!r.vehiculeId) return "Un essai routier exige un véhicule.";
        if (!etatVehicule(vehicule(r.vehiculeId)).selectionnable) return "Le véhicule n'est plus disponible.";
      }
    }
    return null;
  }
  function peutReplanifier(r) {
    if (r.replanifieVers) return false;
    return estModifiable(r) || r.statut === "Annule" || r.statut === "ClientAbsent";
  }

  // ---------- Écritures (locales) ----------
  function auteur() {
    return charge.conseillerNom;
  }
  function historiser(r, typeEv, texte) {
    r.historique = r.historique || [];
    r.historique.push({ date: maintenant().toISOString(), type: typeEv, auteur: auteur(), texte: texte });
  }
  // Ajoute l'événement à l'historique commercial de l'opportunité (timeline du prospect).
  function journaliser(r, texte, prochaine, dateSuivi) {
    if (P && P.contact(r.prospectId)) {
      P.ajouterNote(r.prospectId, { type: "rendezvous", opportuniteId: r.opportuniteId, resume: texte, prochaineAction: prochaine || null, date: dateSuivi || null });
    }
  }
  // Exécute une modification et retourne une fonction d'annulation (état du rendez-vous et entrée d'historique).
  function avecAnnulation(r, action) {
    var avant = cloner(r);
    var nbInteractions = P ? P.interactionsDe(r.prospectId).length : 0;
    action();
    changer();
    return function () {
      Object.keys(r).forEach(function (k) { delete r[k]; });
      Object.keys(avant).forEach(function (k) { r[k] = avant[k]; });
      changer();
      if (P && P.interactionsDe(r.prospectId).length > nbInteractions) P.retirerDerniereInteraction(r.prospectId);
    };
  }

  function nouvelId() {
    etat.compteur = (etat.compteur || 0) + 1;
    return "r-local-" + etat.compteur + "-" + Date.now().toString(36);
  }

  // Règles vérifiées par le store lui-même, quel que soit l'écran qui l'appelle.
  function invalide(x) {
    if (!x.prospectId || !x.opportuniteId || !x.type || !x.debut || !(x.dureeMinutes > 0)) return "Rendez-vous incomplet.";
    if (x.type === "EssaiRoutier" && !x.vehiculeId) return "Un essai routier exige un véhicule.";
    if (x.vehiculeId && !etatVehicule(vehicule(x.vehiculeId)).selectionnable) return "Véhicule indisponible.";
    if (new Date(x.debut) < maintenant()) return "Le créneau est dans le passé.";
    var c = conflits({ exclure: x.replanifieDepuis, debut: x.debut, dureeMinutes: x.dureeMinutes, conseillerId: x.conseillerId, vehiculeId: x.vehiculeId });
    if (c.vehicule.length) return "Véhicule déjà prévu sur ce créneau.";
    if (c.conseiller.length && !x.chevauchementAccepte) return "Chevauchement non confirmé.";
    return null;
  }

  function creer(x) {
    var r = {
      id: nouvelId(),
      prospectId: x.prospectId,
      opportuniteId: x.opportuniteId,
      soumissionId: x.soumissionId || null,
      vehiculeId: x.vehiculeId || null,
      conseillerId: x.conseillerId,
      type: x.type,
      statut: "Planifie",
      debut: new Date(x.debut).toISOString(),
      dureeMinutes: x.dureeMinutes,
      mode: x.mode,
      lieu: x.lieu || null,
      objectif: x.objectif || null,
      commentaire: x.commentaire || null,
      dateCreation: maintenant().toISOString(),
      checklist: {},
      debutEssai: null,
      finEssai: null,
      annulation: null,
      absence: null,
      resultat: null,
      replanifieDepuis: x.replanifieDepuis || null,
      replanifieVers: null,
      historique: [],
    };
    historiser(r, "creation", x.replanifieDepuis ? "Rendez-vous créé par replanification." : "Rendez-vous créé.");
    if (x.chevauchementAccepte) historiser(r, "note", "Chevauchement avec un autre rendez-vous du conseiller accepté explicitement.");
    etat.rendezVous.push(r);
    return r;
  }

  function planifier(x) {
    if (invalide(x)) return null;
    var r = creer(x);
    journaliser(r, type(r.type).libelle + " planifié : " + jourTexte(r.debut).toLowerCase() + " " + plage(r) + (r.vehiculeId ? " · " + nomVehicule(vehicule(r.vehiculeId)) : "") + ".");
    changer();
    return r;
  }

  // Replanification : l'ancien créneau est conservé (statut « Replanifié » s'il était encore actif) et pointe vers le nouveau.
  function replanifier(ancienId, x) {
    var ancien = rdv(ancienId);
    if (!ancien || !peutReplanifier(ancien)) return null;
    x.replanifieDepuis = ancien.id;
    if (invalide(x)) return null;
    var r = creer(x);
    ancien.replanifieVers = r.id;
    var ancienCreneau = creneauTexte(ancien);
    if (estActif(ancien)) {
      ancien.statut = "Replanifie";
      historiser(ancien, "replanification", "Replanifié : ancien créneau " + ancienCreneau + " → " + creneauTexte(r) + ".");
    } else {
      historiser(ancien, "replanification", "Nouveau rendez-vous planifié : " + creneauTexte(r) + ".");
    }
    journaliser(r, type(r.type).libelle + " replanifié : " + ancienCreneau.toLowerCase() + " → " + creneauTexte(r).toLowerCase() + ".");
    changer();
    return r;
  }

  // Modification des informations (pas du créneau : il passe par une replanification qui garde l'historique).
  function modifier(id, patch) {
    var r = rdv(id);
    if (!r || !estModifiable(r)) return null;
    var champs = { objectif: "Objectif", commentaire: "Commentaire", lieu: "Lieu", mode: "Moyen de rencontre", conseillerId: "Conseiller", vehiculeId: "Véhicule", soumissionId: "Soumission" };
    var changes = Object.keys(patch).filter(function (k) { return (patch[k] || null) !== (r[k] || null); });
    if (!changes.length) return function () {};
    return avecAnnulation(r, function () {
      changes.forEach(function (k) { r[k] = patch[k] || null; });
      historiser(r, "modification", "Modifié : " + changes.map(function (k) { return champs[k] || k; }).join(", ") + ".");
    });
  }

  function changerStatut(id, cible) {
    var r = rdv(id);
    if (!r || refus(r, cible)) return null;
    var avant = r.statut;
    return avecAnnulation(r, function () {
      r.statut = cible;
      var m = maintenant().toISOString();
      if (cible === "EnCours" && estEssai(r)) r.debutEssai = m;
      if (cible === "Termine" && estEssai(r)) r.finEssai = m;
      var textes = {
        AConfirmer: "Confirmation demandée au client.",
        Confirme: "Confirmé avec le client (déclaration du conseiller).",
        EnCours: estEssai(r) ? "Essai routier commencé." : "Rencontre commencée.",
        Termine: estEssai(r) ? "Essai routier terminé." : "Rencontre terminée.",
      };
      historiser(r, cible === "Confirme" ? "confirmation" : cible === "EnCours" || cible === "Termine" ? (estEssai(r) ? "essai" : "statut") : "statut",
        (textes[cible] || "") + " " + statutRef(avant).libelle + " → " + statutRef(cible).libelle + ".");
      if (cible === "Confirme") journaliser(r, type(r.type).libelle + " confirmé : " + creneauTexte(r).toLowerCase() + ".");
      if (cible === "Termine") journaliser(r, type(r.type).libelle + " terminé. Résultat à enregistrer.");
    });
  }

  function annuler(id, a) {
    var r = rdv(id);
    if (!r || refus(r, "Annule")) return null;
    return avecAnnulation(r, function () {
      r.statut = "Annule";
      r.annulation = { motif: a.motif, auteur: a.auteur, date: maintenant().toISOString(), commentaire: a.commentaire || null, intentionReplanifier: !!a.intentionReplanifier };
      var texte = "Annulé par " + (libelle("auteursAnnulation", a.auteur) || a.auteur).toLowerCase() + " : " + (libelle("motifsAnnulation", a.motif) || a.motif).toLowerCase() + ".";
      historiser(r, "annulation", texte);
      journaliser(r, type(r.type).libelle + " du " + jourCourt(r.debut) + " annulé. " + texte.replace("Annulé par", "Par") + (a.commentaire ? " " + a.commentaire : ""),
        a.intentionReplanifier ? "Proposer un nouveau créneau" : null, a.intentionReplanifier ? maintenant() : null);
    });
  }

  function declarerAbsence(id, a) {
    var r = rdv(id);
    if (!r || refus(r, "ClientAbsent")) return null;
    return avecAnnulation(r, function () {
      r.statut = "ClientAbsent";
      r.absence = { date: maintenant().toISOString(), prochaineAction: a.prochaineAction, commentaire: a.commentaire || null };
      var action = libelle("actionsAbsence", a.prochaineAction) || a.prochaineAction;
      historiser(r, "absence", "Client absent. Prochaine action : " + action.toLowerCase() + ".");
      var suivie = ["contacter", "autre-date"].indexOf(a.prochaineAction) >= 0;
      journaliser(r, "Client absent au rendez-vous du " + jourCourt(r.debut) + " (" + heure(r.debut) + ")." + (a.commentaire ? " " + a.commentaire : ""),
        suivie ? action + (a.moyen ? " (" + a.moyen + ")" : "") : null, suivie ? a.dateSuivi || maintenant() : null);
    });
  }

  function cocher(id, cle, valeur) {
    var r = rdv(id);
    if (!r || CLOS.indexOf(r.statut) >= 0) return false;
    r.checklist = r.checklist || {};
    r.checklist[cle] = !!valeur;
    changer();
    return true;
  }

  // Résultat déclaré : produit une interaction dans l'historique de l'opportunité et, si précisée, la prochaine action.
  // L'étape de l'opportunité n'est jamais modifiée automatiquement.
  function enregistrerResultat(id, res) {
    var r = rdv(id);
    if (!r || r.statut !== "Termine") return null;
    var premier = !r.resultat;
    return avecAnnulation(r, function () {
      res.date = maintenant().toISOString();
      r.resultat = res;
      var lib = libelle("resultats", res.resultat) || res.resultat;
      var action = res.prochaineAction && res.prochaineAction !== "aucune" ? (libelle("prochainesActions", res.prochaineAction) || res.prochaineAction) + (res.precisionAction ? " : " + res.precisionAction : "") : null;
      historiser(r, "resultat", (premier ? "Résultat : " : "Résultat modifié : ") + lib.toLowerCase() + ".");
      var morceaux = [type(r.type).libelle + " terminé — " + lib.toLowerCase() + "."];
      if (res.observations) morceaux.push(res.observations);
      if (res.objections) morceaux.push("Objections : " + res.objections);
      if (res.vehiculeAlternatif) morceaux.push("Véhicule alternatif envisagé : " + res.vehiculeAlternatif + ".");
      journaliser(r, morceaux.join(" "), action, res.dateSuivi ? new Date(res.dateSuivi) : null);
    });
  }

  // Brouillon de rappel à transmettre par le conseiller lui-même : rien n'est envoyé.
  function brouillonRappel(r) {
    var c = P.contact(r.prospectId);
    var lieu = r.mode === "telephone" ? "par téléphone" : r.mode === "virtuel" ? "en rencontre virtuelle" : "à la concession" + (charge.concession ? " (" + charge.concession + ")" : "");
    var v = vehicule(r.vehiculeId);
    return "Bonjour " + (c ? c.prenom : "") + ",\n\nJe vous confirme notre rendez-vous (" + type(r.type).libelle.toLowerCase() + ") " +
      jourTexte(r.debut).toLowerCase() + " de " + plage(r) + ", " + lieu + "." + (v ? "\nVéhicule : " + nomVehicule(v) + "." : "") +
      "\n\nPouvez-vous me confirmer votre présence ?\n\n" + charge.conseillerNom;
  }

  function reinitialiser() {
    try {
      window.sessionStorage.removeItem(CLE);
    } catch (e) {}
    etat = { rendezVous: cloner(d.rendezVous), compteur: 0 };
    modifie = false;
    abonnes.forEach(function (f) { f(); });
  }

  window.RendezVous = {
    ref: ref,
    heureOuverture: d.heureOuverture,
    heureFermeture: d.heureFermeture,
    lieuParDefaut: d.lieuParDefaut,
    conseillerNom: charge.conseillerNom,
    concession: charge.concession,
    actifs: ACTIFS,
    avecVehicule: AVEC_VEHICULE,
    urlDetail: function (id) { return charge.urlDetail.replace("__id__", encodeURIComponent(id)); },
    urlNouveau: function (p) {
      var q = Object.keys(p || {}).filter(function (k) { return p[k]; }).map(function (k) { return k + "=" + encodeURIComponent(p[k]); }).join("&");
      return charge.urlNouveau + (q ? "?" + q : "");
    },
    urlAgenda: function (date) { return charge.urlAgenda + (date ? "?date=" + encodeURIComponent(date) : ""); },
    abonner: function (f) { abonnes.push(f); },
    // lecture
    liste: liste,
    rdv: rdv,
    parOpportunite: parOpportunite,
    parProspect: parProspect,
    parSoumission: parSoumission,
    estActif: estActif,
    estModifiable: estModifiable,
    estEssai: estEssai,
    type: type,
    statut: statutRef,
    libelle: libelle,
    vehicule: vehicule,
    nomVehicule: nomVehicule,
    etatVehicule: etatVehicule,
    conflits: conflits,
    chevauche: chevauche,
    actionsRequises: actionsRequises,
    suiviRequis: suiviRequis,
    transitions: transitions,
    refus: refus,
    invalide: invalide,
    peutReplanifier: peutReplanifier,
    brouillonRappel: brouillonRappel,
    // dates
    debut: debut,
    fin: fin,
    memeJour: memeJour,
    heure: heure,
    plage: plage,
    jourTexte: jourTexte,
    jourCourt: jourCourt,
    creneauTexte: creneauTexte,
    // écriture
    planifier: planifier,
    replanifier: replanifier,
    modifier: modifier,
    changerStatut: changerStatut,
    annuler: annuler,
    declarerAbsence: declarerAbsence,
    cocher: cocher,
    enregistrerResultat: enregistrerResultat,
  };

  if (P) P.enregistrerModule({ estModifie: function () { return modifie; }, reinitialiser: reinitialiser });
})();
