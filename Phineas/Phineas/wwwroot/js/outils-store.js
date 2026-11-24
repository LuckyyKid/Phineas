// Outils du vendeur : état local de démonstration (même principe que les autres stores).
// Une seule source par objet : contacts, opportunités et historiques restent dans le store Prospects, l'inventaire
// dans le store Soumissions. Ce store ne garde que les annonces, publications déclarées, liens de provenance,
// attributions, la prospection personnelle et l'historique de l'assistant. Aucun envoi, aucune publication réelle.
(function () {
  "use strict";

  var source = document.getElementById("outils-donnees");
  if (!source) return;
  var charge = JSON.parse(source.textContent);
  var P = window.Prospects, S = window.Soumissions, T = window.Transactions, R = window.RendezVous, A = window.AnnoncesModeles;
  if (!P || !S || !A) return;
  var d = charge.donnees;
  var ref = charge.referentiels;
  var CLE = "phineas.salesos.outils.v1:" + charge.conseillerNom;

  ref.conseillerNom = charge.conseillerNom;
  ref.concession = charge.concession;
  ref.urls = charge.urls;
  ref.plateformesParCle = {};
  ref.plateformes.forEach(function (p) { ref.plateformesParCle[p.cle] = p; });

  function cloner(o) {
    return JSON.parse(JSON.stringify(o));
  }
  function iso() {
    return new Date().toISOString();
  }
  function initial() {
    var x = cloner(d);
    x.compteur = 0;
    return x;
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
  function changer() {
    modifie = true;
    ecrire();
    abonnes.forEach(function (f) { f(); });
  }
  function nouvelId(prefixe) {
    etat.compteur = (etat.compteur || 0) + 1;
    return prefixe + "-local-" + Date.now().toString(36) + etat.compteur;
  }
  function RC() { return window.RelationsClients || null; }
  function I() { return window.Intelligence || null; }

  // ---------- Annonces ----------
  function annonces() { return etat.annonces; }
  function annonce(id) { return etat.annonces.filter(function (a) { return a.id === id; })[0] || null; }
  function historiser(a, texte) {
    a.historique = a.historique || [];
    a.historique.push({ date: iso(), texte: texte, auteur: charge.conseillerNom });
    a.dateModification = iso();
  }
  function prochaineReference() {
    var max = etat.annonces.reduce(function (m, a) { var k = parseInt(String(a.reference).split("-").pop(), 10); return k > m ? k : m; }, 0);
    return "ANN-" + new Date().getFullYear() + "-" + String(max + 1).padStart(4, "0");
  }
  // Création guidée : le texte vient uniquement de la fiche d'inventaire (modèle déterministe, aucune IA).
  function creerAnnonce(x) {
    var v = S.vehicule(x.vehiculeId);
    var dispo = A.disponibilite(v ? Object.assign({}, v, { statutActuel: statutVehicule(v.id) }) : null);
    if (!dispo.ok) return { erreur: dispo.texte };
    if (!ref.objectifsAnnonce[x.objectif]) return { erreur: "Choisissez l'objectif de l'annonce." };
    if (!ref.stylesAnnonce[x.style]) return { erreur: "Choisissez un style rédactionnel." };
    var g = A.generer(v, { objectif: x.objectif, style: x.style });
    var a = {
      id: nouvelId("an"), reference: prochaineReference(), vehiculeId: v.id, titre: g.titre, description: g.description, pointsForts: g.pointsForts, appelAction: g.appelAction,
      objectif: x.objectif, style: x.style, canal: x.canal || "site-web", langue: "fr", statut: "Brouillon", conseillerId: P.moiId, dateCreation: iso(), dateModification: iso(),
      variantes: [], varianteRetenue: null, valideePar: null, valideeLe: null, historique: [],
    };
    historiser(a, "Brouillon créé à partir de la fiche d'inventaire " + v.numeroStock + " (modèle déterministe, aucune IA).");
    etat.annonces.push(a);
    changer();
    return { annonce: a, avertissements: g.avertissements.concat(dispo.cle !== "disponible" ? [dispo.texte] : []) };
  }
  // Une annonce approuvée puis modifiée doit être relue à nouveau.
  function modifierAnnonce(id, patch) {
    var a = annonce(id);
    if (!a || a.statut === "Archivee" || a.statut === "Publiee") return false;
    var texte = ["titre", "description", "pointsForts", "appelAction"].some(function (k) { return k in patch && JSON.stringify(patch[k]) !== JSON.stringify(a[k]); });
    Object.keys(patch).forEach(function (k) { if (["titre", "description", "pointsForts", "appelAction", "canal"].indexOf(k) >= 0) a[k] = patch[k]; });
    if (texte && (a.statut === "Approuvee" || a.statut === "PretePublication")) {
      a.statut = "EnRevision"; a.valideePar = null; a.valideeLe = null;
      historiser(a, "Texte modifié après approbation : nouvelle relecture nécessaire.");
    } else historiser(a, "Texte modifié manuellement.");
    changer();
    return true;
  }
  function genererVariantes(id) {
    var a = annonce(id), v = a && S.vehicule(a.vehiculeId);
    if (!a || !v) return null;
    a.variantes = A.variantes(v, { objectif: a.objectif, style: a.style }, ref).map(function (x) { return { cle: x.cle, titre: x.titre, description: x.description }; });
    historiser(a, "Trois variantes préparées par modèles déterministes (performance non connue).");
    changer();
    return a.variantes;
  }
  function retenirVariante(id, cle) {
    var a = annonce(id);
    var x = a && a.variantes.filter(function (v) { return v.cle === cle; })[0];
    if (!x) return false;
    var r = modifierAnnonce(id, { titre: x.titre, description: x.description });
    a.varianteRetenue = cle;
    historiser(a, "Variante retenue : " + cle + ".");
    changer();
    return r;
  }
  var TRANSITIONS = {
    Brouillon: ["EnRevision", "Archivee"],
    EnRevision: ["Approuvee", "Brouillon", "Archivee"],
    Approuvee: ["PretePublication", "EnRevision", "Archivee"],
    PretePublication: ["Approuvee", "Archivee"],
    Publiee: ["Archivee"],
    Archivee: ["Brouillon"],
  };
  function statutVehicule(id) {
    return T ? T.statutVehicule(id) : (S.vehicule(id) || {}).statutActuel;
  }
  function vehiculeActuel(a) {
    var v = S.vehicule(a.vehiculeId);
    return v ? Object.assign({}, v, { statutActuel: statutVehicule(v.id) }) : null;
  }
  // « Publiée » ne s'obtient que par une publication déclarée (declarerPublication).
  function changerStatut(id, vers, options) {
    var a = annonce(id);
    if (!a || (TRANSITIONS[a.statut] || []).indexOf(vers) < 0) return { erreur: "Transition impossible depuis « " + ref.statutsAnnonce[(a || {}).statut] + " »." };
    var v = vehiculeActuel(a);
    if (vers === "Approuvee") {
      var refus = A.refusApprobation(a, v, options && options.relu, ref);
      if (refus) return { erreur: refus };
      a.valideePar = charge.conseillerNom; a.valideeLe = iso();
    }
    // Véhicule vendu ou livré : l'annonce ne peut plus avancer, seulement être archivée.
    if (vers !== "Archivee" && !A.disponibilite(v).ok) return { erreur: A.disponibilite(v).texte };
    var avant = a.statut;
    a.statut = vers;
    historiser(a, vers === "Approuvee" ? "Approuvée après relecture humaine par " + charge.conseillerNom + "." : "Statut : " + ref.statutsAnnonce[avant] + " → " + ref.statutsAnnonce[vers] + ".");
    if (vers === "Archivee") etat.publications.forEach(function (p) { if (p.annonceId === id && p.statut !== "Retiree") p.statut = "Retiree"; });
    changer();
    return { annonce: a };
  }
  function verifications(a) {
    var v = vehiculeActuel(a);
    return { mentions: A.verifier(a.titre + " " + a.description + " " + (a.pointsForts || []).join(" ") + " " + a.appelAction, ref), coherence: v ? A.coherence(a.titre + " " + a.description, v) : [],
      disponibilite: A.disponibilite(v), champs: v ? A.champsInventaire(v) : null };
  }

  // ---------- Publications (suivi local, aucune publication automatique) ----------
  function publications() { return etat.publications; }
  function planifierPublication(annonceId, plateforme, datePrevue) {
    var a = annonce(annonceId);
    if (!a || ["Approuvee", "PretePublication", "Publiee"].indexOf(a.statut) < 0) return { erreur: "Seule une annonce approuvée peut être planifiée." };
    if (!ref.plateformesParCle[plateforme]) return { erreur: "Choisissez une plateforme." };
    if (etat.publications.some(function (p) { return p.annonceId === annonceId && p.plateforme === plateforme && p.statut !== "Retiree"; })) return { erreur: "Une publication est déjà suivie pour cette plateforme." };
    var p = { id: nouvelId("pub"), annonceId: annonceId, plateforme: plateforme, statut: datePrevue ? "Prevue" : "APreparer", datePrevue: datePrevue ? new Date(datePrevue).toISOString() : null,
      declareeLe: null, url: null, conseillerId: P.moiId, lienId: null };
    etat.publications.push(p);
    if (a.statut === "Approuvee") { a.statut = "PretePublication"; historiser(a, "Prête à publier : publication prévue sur " + ref.plateformesParCle[plateforme].libelle + "."); }
    changer();
    return { publication: p };
  }
  // Déclaration par le conseiller : aucune vérification auprès de la plateforme, aucun identifiant fabriqué.
  function declarerPublication(id, url) {
    var p = etat.publications.filter(function (x) { return x.id === id; })[0];
    if (!p || p.statut === "Publiee" || p.statut === "Retiree") return { erreur: "Publication introuvable ou déjà déclarée." };
    if (url && !/^https?:\/\/\S+$/.test(String(url).trim())) return { erreur: "Adresse invalide (laisser vide si inconnue)." };
    var a = annonce(p.annonceId);
    if (!a || ["Approuvee", "PretePublication", "Publiee"].indexOf(a.statut) < 0) return { erreur: "L'annonce doit être approuvée." };
    if (!A.disponibilite(vehiculeActuel(a)).ok) return { erreur: A.disponibilite(vehiculeActuel(a)).texte };
    p.statut = "Publiee"; p.declareeLe = iso(); p.url = url ? String(url).trim() : null;
    a.statut = "Publiee";
    historiser(a, "Publication déclarée par le conseiller : " + ref.plateformesParCle[p.plateforme].libelle + (p.url ? " (" + p.url + ")" : " (adresse non connue)") + ".");
    changer();
    return { publication: p };
  }
  function retirerPublication(id) {
    var p = etat.publications.filter(function (x) { return x.id === id; })[0];
    if (!p || p.statut === "Retiree") return false;
    p.statut = "Retiree";
    changer();
    return true;
  }

  // ---------- Liens de provenance (fictifs) ----------
  function liens() { return etat.liens; }
  function lien(id) { return etat.liens.filter(function (l) { return l.id === id; })[0] || null; }
  function urlLien(l) {
    var v = S.vehicule(l.vehiculeId), a = l.annonceId ? annonce(l.annonceId) : null;
    var r = v ? A.construireLien({ source: l.source, support: l.support, campagne: l.campagne, vehicule: v, annonceRef: a ? a.reference : null, reference: l.reference }, ref) : null;
    return r && r.url;
  }
  function creerLien(x) {
    var a = x.annonceId ? annonce(x.annonceId) : null;
    var vid = x.vehiculeId || (a && a.vehiculeId);
    var v = vid ? S.vehicule(vid) : null;
    var reference = "PH-" + A.slug(v ? v.numeroStock : "x").toUpperCase() + "-" + String(etat.liens.length + 1).padStart(3, "0");
    var r = A.construireLien({ source: x.source, support: x.support, campagne: x.campagne, vehicule: v, annonceRef: a ? a.reference : null, reference: reference }, ref);
    if (r.erreurs) return { erreurs: r.erreurs };
    var l = { id: nouvelId("lk"), reference: reference, annonceId: a ? a.id : null, vehiculeId: v.id, source: x.source, support: x.support, campagne: r.campagne, conseillerId: x.conseillerId || P.moiId, dateCreation: iso() };
    etat.liens.push(l);
    changer();
    return { lien: l, url: r.url };
  }

  // ---------- Provenance et origine des prospects ----------
  function attributions() { return etat.attributions; }
  function attributionDe(prospectId, oppId) {
    return etat.attributions.filter(function (a) { return a.prospectId === prospectId && (!oppId || !a.opportuniteId || a.opportuniteId === oppId); })[0] || null;
  }
  // Pour le moteur et les fiches : provenance établie d'une opportunité (jamais devinée).
  function provenance(oppId) {
    var o = P.opportunite(oppId);
    if (!o) return null;
    var a = attributionDe(o.prospectId, oppId);
    if (!a) return null;
    var l = a.lienId ? lien(a.lienId) : null, an = a.annonceId ? annonce(a.annonceId) : null;
    return { source: (P.libelle("sources", a.source) || a.source), methode: ref.methodesAttribution[a.methode], campagne: a.campagne || null, annonce: an ? an.reference : null, lien: l ? l.reference : null };
  }
  function origine(contactId) {
    var c = P.contact(contactId);
    if (!c) return null;
    var rc = RC();
    if (rc && rc.recommandations().some(function (r) { return r.contact && r.contact.id === contactId && !r.recommandation.doublon; })) return "referral";
    if (etat.attributionsConcession.some(function (a) { return a.prospectId === contactId; })) return "concession";
    if (c.source === "prospection" || etat.prospection.some(function (p) { return p.prospectId === contactId; })) return "prospection";
    if (c.source === "recommandation") return "reseau";
    return "entrant";
  }
  function chercherDoublon(x) {
    var RR = window.RelationsRegles;
    return RR ? RR.chercherDoublon(P.contacts(), x) : null;
  }
  // Prospect entrant (démonstration) : rattachement au contact existant ou création, opportunité, provenance conservée.
  function enregistrerEntrant(x) {
    var e = {};
    if (!String(x.prenom || "").trim()) e.prenom = "Prénom obligatoire.";
    if (!String(x.nom || "").trim()) e.nom = "Nom obligatoire.";
    if (!String(x.courriel || "").trim() && !String(x.telephone || "").trim()) e.contact = "Un courriel ou un téléphone est nécessaire.";
    if (!x.source) e.source = "Indiquez la source déclarée (« Source inconnue » est accepté).";
    if (Object.keys(e).length) return { erreurs: e };
    var l = x.lienId ? lien(x.lienId) : null;
    var vid = x.vehiculeId || (l && l.vehiculeId) || null;
    var v = vid ? S.vehicule(vid) : null;
    var titre = v ? S.nomVehicule(v) : String(x.vehicule || "").trim() || "Premier intérêt";
    var dbl = chercherDoublon(x);
    var c, o, statut;
    if (dbl && dbl.contact) {
      c = dbl.contact;
      o = P.opportunitesDe(c.id).filter(P.estActive)[0] || null;
      if (!o) o = P.ajouterOpportunite(c.id, { titre: titre, etape: "Nouveau", vehicules: v ? [S.nomVehicule(v)] : [] });
      P.ajouterNote(c.id, { type: "note", opportuniteId: o.id, resume: "Nouvelle demande entrante (" + (P.libelle("sources", x.source) || x.source) + ") rattachée au contact existant : aucun doublon créé." });
      statut = "rattache";
    } else {
      c = P.ajouterProspect({ prenom: String(x.prenom).trim(), nom: String(x.nom).trim(), courriel: String(x.courriel || "").trim() || null, telephone: String(x.telephone || "").trim() || null,
        contactPrefere: x.contactPrefere || (x.courriel ? "courriel" : "telephone"), source: x.source,
        sourceDetail: l ? "Lien de provenance " + l.reference + (l.campagne ? " — campagne " + l.campagne : "") : x.campagne ? "Campagne déclarée : " + x.campagne + " (non synchronisée)" : null,
        conseillerId: P.moiId, etape: "Nouveau", modele: titre, commentaire: x.commentaire ? "Message : « " + String(x.commentaire).trim() + " »" : null });
      o = P.opportunitesDe(c.id)[0];
      if (v) P.ajouterVehiculeEnvisage(o.id, S.nomVehicule(v));
      statut = "cree";
    }
    var at = { id: nouvelId("at"), prospectId: c.id, opportuniteId: o.id, source: x.source, lienId: l ? l.id : null, annonceId: l ? l.annonceId : null,
      campagne: l ? l.campagne : (x.campagne ? A.slug(x.campagne) : null), vehiculeId: v ? v.id : null, methode: l ? "lien-suivi" : x.source === "inconnue" ? "saisie-conseiller" : "declaree", etablieLe: iso(), conseillerId: P.moiId };
    if (!etat.attributions.some(function (a) { return a.prospectId === c.id && a.opportuniteId === o.id; })) etat.attributions.push(at);
    changer();
    return { statut: statut, contact: c, opportunite: o, attribution: at };
  }

  // ---------- Prospection personnelle ----------
  function prospection() { return etat.prospection; }
  function ajouterProspection(x) {
    if (!String(x.nom || "").trim()) return { erreurs: { nom: "Indiquez la personne ou l'entreprise." } };
    if (!ref.typesProspection[x.type]) return { erreurs: { type: "Choisissez la source." } };
    var p = { id: nouvelId("pp"), nom: String(x.nom).trim(), entreprise: String(x.entreprise || "").trim() || null, type: x.type, vehiculeInteret: String(x.vehiculeInteret || "").trim() || null,
      contexte: String(x.contexte || "").trim() || null, premierContact: x.premierContact ? new Date(x.premierContact).toISOString() : null, moyenContactAutorise: String(x.moyenContactAutorise || "").trim() || null,
      prochaineAction: String(x.prochaineAction || "").trim() || null, dateProchaineAction: x.dateProchaineAction ? new Date(x.dateProchaineAction).toISOString() : null, prospectId: null, opportuniteId: null };
    etat.prospection.push(p);
    changer();
    return { prospection: p };
  }
  // Transformation en opportunité : réutilise Prospects (qualification, suivi), sans doublon.
  function convertirProspection(id, x) {
    var p = etat.prospection.filter(function (y) { return y.id === id; })[0];
    if (!p || p.opportuniteId) return { erreurs: { general: "Déjà transformée en opportunité." } };
    var noms = p.nom.split(" ");
    var r = enregistrerEntrant({ prenom: x.prenom || noms[0], nom: x.nom || noms.slice(1).join(" ") || p.nom, courriel: x.courriel, telephone: x.telephone, contactPrefere: x.contactPrefere,
      source: "prospection", vehicule: p.vehiculeInteret, commentaire: p.contexte });
    if (r.erreurs) return r;
    if (r.statut === "cree") P.modifierContact(r.contact.id, { sourceDetail: ref.typesProspection[p.type] + (p.entreprise ? " — " + p.entreprise : "") });
    if (p.prochaineAction) P.planifierSuivi(r.opportunite.id, p.prochaineAction, p.dateProchaineAction ? new Date(p.dateProchaineAction) : new Date());
    p.prospectId = r.contact.id;
    p.opportuniteId = r.opportunite.id;
    changer();
    return r;
  }

  // ---------- Assistant vendeur : historique local ----------
  function consultations() { return etat.consultations.slice().sort(function (a, b) { return new Date(b.le) - new Date(a.le); }); }
  function enregistrerConsultation(x) {
    var c = { id: nouvelId("cc"), le: iso(), mode: x.mode, contexteType: x.contexteType || null, contexteId: x.contexteId || null, question: String(x.question || "").slice(0, 300) };
    etat.consultations.push(c);
    changer();
    return c;
  }

  // ---------- Instantané pour les statistiques (lecture seule des autres stores) ----------
  function instantanePerformances(periode) {
    var rc = RC();
    var fermetures = {};
    if (rc) rc.pertes().forEach(function (x) { fermetures[x.opportunite.id] = x.cloture.date; });
    var interactions = [];
    P.contacts().forEach(function (c) { interactions = interactions.concat(P.interactionsDe(c.id)); });
    return {
      maintenant: new Date(), periode: periode || null, moi: P.moiId,
      contacts: P.contacts(),
      opportunites: P.toutesOpportunites().map(function (o) { var x = cloner(o); x.dateFermeture = fermetures[o.id] || null; return x; }),
      interactions: interactions,
      typesContact: P.typesContact(),
      soumissions: S.liste().map(function (s) { return { id: s.id, opportuniteId: s.opportuniteId, conseillerId: s.conseillerId, dateCreation: s.dateCreation, versions: s.versions.map(function (v) { return { numero: v.numero, statut: v.statut, date: v.date, dateModification: v.dateModification }; }) }; }),
      rendezVous: R ? R.liste().map(function (r) { return { id: r.id, prospectId: r.prospectId, opportuniteId: r.opportuniteId, conseillerId: r.conseillerId, type: r.type, statut: r.statut, debut: r.debut, resultat: r.resultat }; }) : [],
      transactions: T ? T.liste().map(function (t) {
        return { id: t.id, opportuniteId: t.opportuniteId, conseillerId: t.conseillerId, statut: t.statut, dateCreation: t.dateCreation, livraison: t.livraison, administratifConfirme: !!(t.administratif && t.administratif.statut === "Confirme"),
          blocages: T.estActive(t) ? T.analyse(t).blocages.map(function (b) { return { departement: b.proprietaire === "departement" ? b.departement : "conseiller", departementLibelle: b.proprietaire === "departement" ? b.departementLibelle : "Conseiller" }; }) : [] };
      }) : [],
      attributions: etat.attributions,
      recommandations: rc ? rc.recommandations().map(function (r) { return { prospectId: r.recommandation.prospectId, opportuniteId: r.recommandation.opportuniteId, doublon: r.recommandation.doublon }; }) : [],
    };
  }

  function reinitialiser() {
    try {
      window.sessionStorage.removeItem(CLE);
    } catch (e) {}
    etat = initial();
    modifie = false;
    abonnes.forEach(function (f) { f(); });
  }

  window.OutilsVendeur = {
    ref: ref,
    abonner: function (f) { abonnes.push(f); },
    // annonces
    annonces: annonces, annonce: annonce, creerAnnonce: creerAnnonce, modifierAnnonce: modifierAnnonce, genererVariantes: genererVariantes, retenirVariante: retenirVariante,
    changerStatut: changerStatut, transitions: function (statut) { return TRANSITIONS[statut] || []; }, verifications: verifications, vehiculeDe: vehiculeActuel,
    // publications et liens
    publications: publications, planifierPublication: planifierPublication, declarerPublication: declarerPublication, retirerPublication: retirerPublication,
    liens: liens, lien: lien, creerLien: creerLien, urlLien: urlLien,
    // provenance
    attributions: attributions, attributionDe: attributionDe, provenance: provenance, origine: origine, attributionsConcession: function () { return etat.attributionsConcession; },
    enregistrerEntrant: enregistrerEntrant,
    // prospection
    prospection: prospection, ajouterProspection: ajouterProspection, convertirProspection: convertirProspection,
    // assistant
    consultations: consultations, enregistrerConsultation: enregistrerConsultation,
    // statistiques
    instantanePerformances: instantanePerformances,
  };

  P.enregistrerModule({ estModifie: function () { return modifie; }, reinitialiser: reinitialiser });
})();
