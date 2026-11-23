// Module Soumissions : état local de démonstration (même principe que prospects-store.js).
// Soumission → versions (instantanés indépendants du véhicule et de l'offre). Aucun appel réseau ;
// les modifications restent dans le sessionStorage de l'onglet. Seule cette couche sera à remplacer
// par de vrais appels de service.
(function () {
  "use strict";

  var source = document.getElementById("soumissions-donnees");
  if (!source) return;
  var charge = JSON.parse(source.textContent);
  var P = window.Prospects;
  var d = charge.donnees;
  var CLE = "phineas.salesos.soumissions.v1:" + charge.conseiller.nom;

  var MODIFIABLES = ["Brouillon", "PreteAEnvoyer"];
  // Statuts qui figent la version : toute modification passe par une nouvelle version.
  var NOUVELLE_VERSION_POSSIBLE = ["Envoyee", "EnAttente", "Acceptee", "Refusee", "Expiree"];
  var TRANSITIONS = {
    Brouillon: ["PreteAEnvoyer", "Annulee"],
    PreteAEnvoyer: ["Brouillon", "Envoyee", "Annulee"],
    Envoyee: ["EnAttente", "Acceptee", "Refusee", "Expiree", "Annulee"],
    EnAttente: ["Acceptee", "Refusee", "Expiree", "Annulee"],
    Acceptee: [],
    Refusee: [],
    Expiree: [],
    Annulee: [],
  };
  var ACTIONS_STATUT = {
    PreteAEnvoyer: "Marquer comme prête à envoyer",
    Brouillon: "Repasser en brouillon",
    Envoyee: "Marquer comme envoyée (envoi fait hors Phineas)",
    EnAttente: "Marquer en attente de réponse",
    Acceptee: "Noter l'acceptation déclarée par le client",
    Refusee: "Noter le refus du client",
    Expiree: "Marquer comme expirée",
    Annulee: "Annuler la soumission",
  };

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
  var etat = lire() || { soumissions: cloner(d.soumissions), compteur: 0 };
  var modifie = !!lire();
  var abonnes = [];
  function changer() {
    modifie = true;
    ecrire();
    abonnes.forEach(function (f) { f(); });
    if (P) P.rafraichir();
  }

  // ---------- Lecture ----------
  function liste() {
    return etat.soumissions;
  }
  function soumission(id) {
    return etat.soumissions.filter(function (s) { return s.id === id; })[0] || null;
  }
  function parOpportunite(oppId) {
    return etat.soumissions.filter(function (s) { return s.opportuniteId === oppId; });
  }
  function versionCourante(s) {
    return s.versions[s.versions.length - 1];
  }
  function version(s, numero) {
    return s.versions.filter(function (v) { return v.numero === numero; })[0] || null;
  }
  function statut(s) {
    return versionCourante(s).statut;
  }
  function estModifiable(s) {
    return MODIFIABLES.indexOf(statut(s)) >= 0;
  }
  function peutNouvelleVersion(s) {
    return NOUVELLE_VERSION_POSSIBLE.indexOf(statut(s)) >= 0;
  }
  function transitions(s) {
    return (TRANSITIONS[statut(s)] || []).map(function (c) { return { cle: c, action: ACTIONS_STATUT[c] }; });
  }
  function libelleStatut(cle) {
    var x = charge.referentiels.statuts.filter(function (s) { return s.cle === cle; })[0];
    return x ? x.libelle : cle;
  }
  function libelleStatutVehicule(cle) {
    return charge.referentiels.statutsVehicule[cle] || cle;
  }
  function dateModification(s) {
    var v = versionCourante(s);
    return v.dateModification || v.date;
  }
  // Inventaire partagé : données du serveur, plus les arrivées fictives simulées dans cet onglet (phase 06).
  function inventaire() {
    return d.inventaire.concat(etat.vehiculesSimules || []);
  }
  function vehicule(id) {
    return inventaire().filter(function (v) { return v.id === id; })[0] || null;
  }
  function ajouterVehiculeSimule(v) {
    if (!v || !v.id || vehicule(v.id)) return false;
    etat.vehiculesSimules = (etat.vehiculesSimules || []).concat([v]);
    changer();
    return true;
  }
  function disponible(v) {
    return v && v.statutActuel === "PretPourVente";
  }
  // Compare l'instantané d'une version à l'inventaire actuel, sans jamais le réécrire.
  function ecartInventaire(versionObj) {
    var actuel = vehicule(versionObj.vehicule.id);
    if (!actuel) return { introuvable: true };
    return {
      statut: actuel.statutActuel !== versionObj.vehicule.statutActuel || !disponible(actuel) ? actuel.statutActuel : null,
      disponible: disponible(actuel),
      prix: actuel.prixDemande !== versionObj.vehicule.prixDemande ? actuel.prixDemande : null,
    };
  }
  function validiteDepassee(versionObj) {
    if (["Acceptee", "Refusee", "Expiree", "Annulee"].indexOf(versionObj.statut) >= 0) return false;
    return P.ecartJours(versionObj.offre.dateValidite) < 0;
  }

  // Scénarios proposés par défaut : comptant, financement de l'offre, durée plus longue.
  function scenariosParDefaut(v) {
    var o = v.offre;
    var avecReprise = !!o.reprise;
    var duree = o.dureeMois || 60;
    var plusLongue = d.parametres.durees.filter(function (x) { return x > duree; })[0] || d.parametres.durees[0];
    return [
      { nom: "Achat comptant", modeAchat: "comptant", miseDeFonds: 0, dureeMois: duree, tauxAnnuel: null, avecReprise: avecReprise },
      { nom: "Financement " + duree + " mois", modeAchat: "financement", miseDeFonds: o.miseDeFonds || 0, dureeMois: duree, tauxAnnuel: o.tauxAnnuel, avecReprise: avecReprise },
      { nom: "Financement " + plusLongue + " mois", modeAchat: "financement", miseDeFonds: o.miseDeFonds || 0, dureeMois: plusLongue, tauxAnnuel: o.tauxAnnuel, avecReprise: avecReprise },
    ];
  }

  // Résumé des écarts entre deux versions (champs principaux).
  function differences(a, b) {
    var res = [];
    function ajouter(libelle, x, y, format) {
      var fx = format ? format(x) : x, fy = format ? format(y) : y;
      if (JSON.stringify(fx) !== JSON.stringify(fy)) res.push({ libelle: libelle, avant: fx, apres: fy });
    }
    var argent = function (v) { return v == null || v === "" ? "—" : P.argent(v); };
    ajouter("Véhicule", a.vehicule.numeroStock + " " + nomVehicule(a.vehicule), b.vehicule.numeroStock + " " + nomVehicule(b.vehicule));
    ajouter("Prix annoncé", a.offre.prixAnnonce, b.offre.prixAnnonce, argent);
    ajouter("Remise", a.offre.remise || 0, b.offre.remise || 0, argent);
    ajouter("Options", optionsTexte(a.offre), optionsTexte(b.offre));
    ajouter("Reprise", repriseTexte(a.offre), repriseTexte(b.offre));
    ajouter("Mise de fonds", a.offre.miseDeFonds || 0, b.offre.miseDeFonds || 0, argent);
    ajouter("Acompte versé", a.offre.acompteVerse || 0, b.offre.acompteVerse || 0, argent);
    ajouter("Mode d'achat", a.offre.modeAchat === "comptant" ? "Comptant" : "Financement", b.offre.modeAchat === "comptant" ? "Comptant" : "Financement");
    if (a.offre.modeAchat === "financement" || b.offre.modeAchat === "financement") {
      ajouter("Durée", a.offre.dureeMois + " mois", b.offre.dureeMois + " mois");
      ajouter("Taux hypothétique", tauxTexte(a.offre.tauxAnnuel), tauxTexte(b.offre.tauxAnnuel));
    }
    ajouter("Taxes estimées", a.offre.inclureTaxes ? "Incluses" : "Non incluses", b.offre.inclureTaxes ? "Incluses" : "Non incluses");
    ajouter("Validité", P.dateCourte(a.offre.dateValidite), P.dateCourte(b.offre.dateValidite));
    ajouter("Commentaires", a.offre.commentaires || "—", b.offre.commentaires || "—");
    return res;
  }
  function nomVehicule(v) {
    return v.annee + " " + v.marque + " " + v.modele + (v.version ? " " + v.version : "");
  }
  function optionsTexte(o) {
    return (o.options || []).map(function (x) { return x.libelle; }).join(", ") || "Aucune";
  }
  function repriseTexte(o) {
    if (!o.reprise) return "Aucune";
    return o.reprise.vehicule + " (" + (o.reprise.valeurEstimee != null ? P.argent(o.reprise.valeurEstimee) : "valeur à confirmer") + ")";
  }
  function tauxTexte(t) {
    return t == null || t === "" ? "À saisir" : String(t).replace(".", ",") + " %";
  }

  // ---------- Écritures (locales) ----------
  function maintenant() {
    return new Date().toISOString();
  }
  function auteur() {
    return charge.conseiller.nom;
  }
  function journaliser(s, texte) {
    if (P && P.contact(s.prospectId)) P.ajouterNote(s.prospectId, { type: "soumission", opportuniteId: s.opportuniteId, resume: texte });
  }
  function nouvelleReference() {
    etat.compteur = (etat.compteur || 0) + 1;
    return "SOU-" + new Date().getFullYear() + "-L" + String(etat.compteur).padStart(2, "0");
  }

  function creer(donnees) {
    var s = {
      id: "s-local-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      reference: nouvelleReference(),
      prospectId: donnees.prospectId,
      opportuniteId: donnees.opportuniteId,
      conseillerId: donnees.conseillerId,
      dateCreation: maintenant(),
      versions: [{
        numero: 1,
        date: maintenant(),
        auteur: auteur(),
        statut: "Brouillon",
        note: "Proposition initiale",
        vehicule: cloner(donnees.vehicule),
        offre: cloner(donnees.offre),
        scenarios: [],
      }],
    };
    etat.soumissions.push(s);
    journaliser(s, "Soumission " + s.reference + " créée en brouillon : " + nomVehicule(donnees.vehicule) + ".");
    changer();
    return s;
  }

  // Modifie la version courante uniquement si elle n'a pas été émise.
  function enregistrerOffre(id, offre, vehiculeObj) {
    var s = soumission(id);
    if (!s || !estModifiable(s)) return false;
    var v = versionCourante(s);
    v.offre = cloner(offre);
    if (vehiculeObj) v.vehicule = cloner(vehiculeObj);
    v.dateModification = maintenant();
    var repasse = v.statut === "PreteAEnvoyer";
    if (repasse) v.statut = "Brouillon";
    changer();
    return repasse ? "repasse-brouillon" : true;
  }

  function enregistrerScenarios(id, scenarios) {
    var s = soumission(id);
    if (!s || !estModifiable(s)) return false;
    versionCourante(s).scenarios = cloner(scenarios);
    versionCourante(s).dateModification = maintenant();
    changer();
    return true;
  }

  // Nouvelle version : copie de la version courante, qui reste figée telle quelle.
  function nouvelleVersion(id, note) {
    var s = soumission(id);
    if (!s || !peutNouvelleVersion(s)) return null;
    var courante = versionCourante(s);
    var v = cloner(courante);
    v.numero = courante.numero + 1;
    v.date = maintenant();
    delete v.dateModification;
    v.auteur = auteur();
    v.statut = "Brouillon";
    v.note = note || "Nouvelle version";
    s.versions.push(v);
    journaliser(s, "Soumission " + s.reference + " : version " + v.numero + " préparée.");
    changer();
    return v;
  }

  function changerStatut(id, nouveau) {
    var s = soumission(id);
    if (!s || (TRANSITIONS[statut(s)] || []).indexOf(nouveau) < 0) return null;
    var v = versionCourante(s);
    var avant = v.statut;
    var nbInteractions = P ? P.interactionsDe(s.prospectId).length : 0;
    v.statut = nouveau;
    v.dateModification = maintenant();
    journaliser(s, "Soumission " + s.reference + " (v" + v.numero + ") : " + libelleStatut(avant) + " → " + libelleStatut(nouveau) + " (statut local).");
    changer();
    return function () {
      v.statut = avant;
      changer();
      if (P && P.interactionsDe(s.prospectId).length > nbInteractions) P.retirerDerniereInteraction(s.prospectId);
    };
  }

  function dupliquer(id) {
    var s = soumission(id);
    if (!s) return null;
    var v = cloner(versionCourante(s));
    var validite = new Date(v.offre.dateValidite);
    if (P.ecartJours(validite) < 0) {
      var dans7 = new Date();
      dans7.setDate(dans7.getDate() + 7);
      v.offre.dateValidite = dans7.toISOString();
    }
    return creer({
      prospectId: s.prospectId,
      opportuniteId: s.opportuniteId,
      conseillerId: s.conseillerId,
      vehicule: v.vehicule,
      offre: v.offre,
    });
  }

  function reinitialiser() {
    try {
      window.sessionStorage.removeItem(CLE);
    } catch (e) {}
    etat = { soumissions: cloner(d.soumissions), compteur: 0 };
    modifie = false;
    abonnes.forEach(function (f) { f(); });
  }

  window.Soumissions = {
    parametres: d.parametres,
    options: d.options,
    statuts: charge.referentiels.statuts,
    conseiller: charge.conseiller,
    concession: charge.concession,
    urlDetail: function (id) { return charge.urlDetail.replace("__id__", encodeURIComponent(id)); },
    urlNouvelle: function (oppId) { return charge.urlNouvelle + (oppId ? "?opportunite=" + encodeURIComponent(oppId) : ""); },
    urlListe: charge.urlListe,
    abonner: function (f) { abonnes.push(f); },
    // lecture
    liste: liste,
    soumission: soumission,
    parOpportunite: parOpportunite,
    versionCourante: versionCourante,
    version: version,
    statut: statut,
    estModifiable: estModifiable,
    peutNouvelleVersion: peutNouvelleVersion,
    transitions: transitions,
    libelleStatut: libelleStatut,
    libelleStatutVehicule: libelleStatutVehicule,
    dateModification: dateModification,
    inventaire: inventaire,
    vehicule: vehicule,
    ajouterVehiculeSimule: ajouterVehiculeSimule,
    disponible: disponible,
    ecartInventaire: ecartInventaire,
    validiteDepassee: validiteDepassee,
    scenariosParDefaut: scenariosParDefaut,
    differences: differences,
    nomVehicule: nomVehicule,
    tauxTexte: tauxTexte,
    // écriture
    creer: creer,
    enregistrerOffre: enregistrerOffre,
    enregistrerScenarios: enregistrerScenarios,
    nouvelleVersion: nouvelleVersion,
    changerStatut: changerStatut,
    dupliquer: dupliquer,
  };

  if (P) P.enregistrerModule({ estModifie: function () { return modifie; }, reinitialiser: reinitialiser });
})();
