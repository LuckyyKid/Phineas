// Relations clients : état local de démonstration (même principe que les autres stores).
// Une seule source par objet : les opportunités, contacts et historiques restent dans le store Prospects, les
// transactions dans le store Transactions ; ce store ne garde que les faits propres aux relations clients (clôtures,
// retours, enquêtes, problèmes, profil, invitations, recommandations) et les relie aux objets existants.
// Aucun envoi, aucun appel réseau : tout reste dans le sessionStorage de l'onglet.
(function () {
  "use strict";

  var source = document.getElementById("relations-donnees");
  if (!source) return;
  var charge = JSON.parse(source.textContent);
  var P = window.Prospects, S = window.Soumissions, R = window.RendezVous, T = window.Transactions, Regles = window.RelationsRegles;
  if (!P || !S || !T || !Regles) return;
  var d = charge.donnees;
  var ref = charge.referentiels;
  var CLE = "phineas.salesos.relations.v1:" + charge.conseillerNom;
  // Boîte des demandes envoyées depuis la prévisualisation du parcours public (aucune donnée interne n'y est lue).
  var CLE_BOITE = "phineas.salesos.relations.v1:demandes-recues";
  var CLE_PROFIL_PUBLIC = "phineas.salesos.relations.v1:profil-public";
  var JOUR = 86400000;

  ref.conseillerNom = charge.conseillerNom;
  ref.concession = charge.concession;
  ref.urls = charge.urls;
  ref.libellesEtats = {};
  ref.etatsRecuperation.forEach(function (e) { ref.libellesEtats[e.cle] = e; });

  function cloner(o) {
    return JSON.parse(JSON.stringify(o));
  }
  function iso() {
    return new Date().toISOString();
  }
  function initial() {
    var x = cloner(d);
    x.clotures.forEach(function (c) { c.historique = []; });
    x.problemes.forEach(function (p) { p.historique = p.historique || []; });
    x.compteur = 0;
    return x;
  }
  function lire(cle) {
    try {
      var brut = window.sessionStorage.getItem(cle);
      return brut ? JSON.parse(brut) : null;
    } catch (e) {
      return null;
    }
  }
  function ecrireCle(cle, v) {
    try {
      window.sessionStorage.setItem(cle, JSON.stringify(v));
    } catch (e) {}
  }
  var etat = lire(CLE) || initial();
  var modifie = !!lire(CLE);

  // Profil enregistré dans l'onglet par une version précédente, sans forme du rôle, année d'arrivée ni ville :
  // on complète seulement les champs absents avec les valeurs de démonstration (jamais d'erreur, rien n'est écrasé).
  var CHAMPS_PROFIL_AJOUTES = ["formeRole", "anneeArrivee", "villeConcession"];
  CHAMPS_PROFIL_AJOUTES.forEach(function (cle) {
    if (!(cle in etat.profil)) {
      etat.profil[cle] = d.profil[cle] === undefined ? null : d.profil[cle];
    }
  });
  var abonnes = [];

  function changer() {
    modifie = true;
    ecrireCle(CLE, etat);
    publierProfil();
    abonnes.forEach(function (f) { f(); });
  }
  function nouvelId(prefixe) {
    etat.compteur = (etat.compteur || 0) + 1;
    return prefixe + "-local-" + Date.now().toString(36) + etat.compteur;
  }
  function I() {
    return window.Intelligence || null;
  }
  function arret(pid) {
    var pref = I() ? I().preferences(pid) : null;
    return !!(pref && (pref.nePlusContacter || pref.consentement === "retire"));
  }
  function nomContact(pid) {
    var c = P.contact(pid);
    return c ? c.prenom + " " + c.nom : "Prospect inconnu";
  }

  // ---------- Ventes perdues ----------
  function cloturesDe(oppId) {
    return etat.clotures.filter(function (c) { return c.opportuniteId === oppId; });
  }
  function clotureCourante(oppId) {
    var l = cloturesDe(oppId);
    return l[l.length - 1] || null;
  }
  function retourDe(oppId) {
    return etat.retours.filter(function (r) { return r.opportuniteId === oppId; }).sort(function (a, b) { return new Date(b.recuLe) - new Date(a.recuLe); })[0] || null;
  }
  function etatDe(cl) {
    var o = P.opportunite(cl.opportuniteId);
    return Regles.etatRecuperation(cl, { opportunite: o, transactions: T.parOpportunite(cl.opportuniteId), arret: o ? arret(o.prospectId) : false, maintenant: new Date() });
  }
  function derniereSoumission(oppId) {
    var l = S.parOpportunite(oppId);
    var s = l[l.length - 1];
    if (!s) return null;
    var v = S.versionCourante(s);
    return { id: s.id, reference: s.reference, numero: v.numero, statut: S.statut(s), statutLibelle: S.libelleStatut(S.statut(s)), vehicule: S.nomVehicule(v.vehicule), url: S.urlDetail(s.id) };
  }
  function vehiculeRecherche(o) {
    var s = derniereSoumission(o.id);
    return s ? s.vehicule : P.resumeVehicule(o) || (o.vehiculesEnvisages || [])[0] || o.titre;
  }
  // Ligne de la liste « Ventes perdues » : uniquement des faits et des états calculés, rien d'inventé.
  function enrichirPerte(cl) {
    var o = P.opportunite(cl.opportuniteId);
    if (!o) return null;
    var c = P.contact(o.prospectId);
    var e = etatDe(cl);
    var actions = I() ? I().actives().filter(function (a) { return a.opportuniteId === o.id && a.categorie === "relations"; }) : [];
    var manquantes = [];
    if (cl.motif === "inconnu") manquantes.push("Motif inconnu");
    if (cl.origine === "hypothese") manquantes.push("Motif non confirmé");
    if (cl.suiviPossible && !cl.dateReprise && !cl.conditions && e.cle !== "reactivee" && e.cle !== "recuperee") manquantes.push("Condition de réactivation non précisée");
    return {
      cloture: cl, opportunite: o, contact: c, client: c ? c.prenom + " " + c.nom : "—", vehicule: vehiculeRecherche(o), soumission: derniereSoumission(o.id),
      etat: e, recuperable: Regles.estRecuperable(e.cle), reactivee: !!cl.reactivation, conseillerId: c ? c.conseillerId : null, conseiller: c ? P.conseiller(c.conseillerId).nom : "—",
      prochaineAction: actions[0] || null, informationsManquantes: manquantes, retour: retourDe(o.id), confirme: Regles.estConfirme(cl),
    };
  }
  function pertes() {
    // Clôture courante de chaque opportunité perdue, ou réactivée depuis (pour suivre la récupération).
    var vus = {};
    var l = [];
    etat.clotures.slice().reverse().forEach(function (cl) {
      if (vus[cl.opportuniteId]) return;
      vus[cl.opportuniteId] = true;
      var o = P.opportunite(cl.opportuniteId);
      if (!o || (o.etape !== "Perdu" && !cl.reactivation)) return;
      var x = enrichirPerte(cl);
      if (x) l.push(x);
    });
    return l.sort(function (a, b) { return new Date(b.cloture.date) - new Date(a.cloture.date); });
  }
  // Opportunités marquées « Perdu » sans clôture enregistrée (ex. avant la phase 07) : motif inconnu, jamais inventé.
  function pertesSansCloture() {
    return P.toutesOpportunites().filter(function (o) { return o.etape === "Perdu" && !clotureCourante(o.id); });
  }
  function compteursPertes(liste) {
    liste = liste || pertes();
    var perdues = liste.filter(function (x) { return x.opportunite.etape === "Perdu"; });
    return {
      perdues: perdues.length + pertesSansCloture().length,
      // « Connu » = confirmé (déclaré par le client ou vérifié) ; une hypothèse est comptée à part.
      connus: perdues.filter(function (x) { return x.confirme; }).length,
      inconnus: perdues.filter(function (x) { return x.cloture.motif === "inconnu"; }).length + pertesSansCloture().length,
      hypotheses: perdues.filter(function (x) { return x.cloture.origine === "hypothese"; }).length,
      recuperables: liste.filter(function (x) { return x.recuperable; }).length,
      reactivees: liste.filter(function (x) { return x.reactivee; }).length,
      recuperees: liste.filter(function (x) { return x.etat.cle === "recuperee"; }).length,
    };
  }

  function refusCloture(oppId) {
    var o = P.opportunite(oppId);
    if (!o) return "Opportunité introuvable.";
    if (!P.estActive(o)) return "Seule une opportunité active peut être clôturée comme perdue.";
    if (T.enCoursPourOpportunite(oppId)) return "Une transaction est en cours : annulez-la d'abord dans le module Transactions (motif conservé).";
    return null;
  }
  // Clôture rapide : l'historique complet de l'opportunité est conservé (rien n'est supprimé).
  function cloturer(oppId, x) {
    var refus = refusCloture(oppId);
    if (refus) return { erreurs: { general: refus } };
    var o = P.opportunite(oppId);
    var erreurs = Regles.validerCloture(x, ref);
    if (Object.keys(erreurs).length) return { erreurs: erreurs };
    var cl = {
      id: nouvelId("cl"), opportuniteId: oppId, motif: x.motif, origine: x.origine, etapeAtteinte: x.etapeAtteinte || o.etape, commentaire: String(x.commentaire || "").trim() || null,
      suiviPossible: !!x.suiviPossible, dateReprise: x.dateReprise ? new Date(x.dateReprise).toISOString() : null, conditions: String(x.conditions || "").trim() || null,
      restriction: x.restriction || "aucune", date: iso(), auteur: charge.conseillerNom, evenement: null, reactivation: null, historique: [],
    };
    var nb = P.interactionsDe(o.prospectId).length;
    var annulerEtape = P.changerEtape(oppId, "Perdu");
    P.ajouterNote(o.prospectId, { type: "perte", opportuniteId: oppId, resume: "Opportunité clôturée comme perdue : " + ref.motifsPerte[cl.motif].toLowerCase() + " (" + ref.originesMotif[cl.origine].toLowerCase() + ")." +
      (cl.suiviPossible ? " Futur suivi possible" + (cl.dateReprise ? " à partir du " + P.dateCourte(cl.dateReprise) : "") + "." : " Aucun futur suivi envisagé.") });
    var prefAvant = I() ? cloner(I().preferences(o.prospectId)) : null;
    if (cl.restriction === "ne-plus-contacter" && I()) I().definirPreferences(o.prospectId, { nePlusContacter: true, consentement: "retire", note: "Demande exprimée lors de la clôture de l'opportunité." });
    etat.clotures.push(cl);
    changer();
    return {
      cloture: cl,
      annuler: function () {
        etat.clotures = etat.clotures.filter(function (c) { return c.id !== cl.id; });
        // L'entrée « étape » est retirée par son identifiant, puis la note de clôture.
        if (annulerEtape) annulerEtape();
        while (P.interactionsDe(o.prospectId).length > nb) P.retirerDerniereInteraction(o.prospectId);
        if (cl.restriction === "ne-plus-contacter" && I()) I().definirPreferences(o.prospectId, prefAvant || { nePlusContacter: false, consentement: "inconnu", demandeArretLe: null });
        changer();
      },
    };
  }
  function historiserCloture(cl, texte) {
    cl.historique = cl.historique || [];
    cl.historique.push({ date: iso(), texte: texte, auteur: charge.conseillerNom });
  }
  // Information obtenue après coup : le motif peut être confirmé ou précisé, l'ancien reste dans l'historique.
  function preciserMotif(oppId, x) {
    var cl = clotureCourante(oppId);
    if (!cl || cl.reactivation) return null;
    var erreurs = Regles.validerCloture({ motif: x.motif, origine: x.origine, commentaire: x.commentaire || cl.commentaire, restriction: cl.restriction, suiviPossible: cl.suiviPossible, dateReprise: cl.dateReprise }, ref);
    if (Object.keys(erreurs).length) return { erreurs: erreurs };
    var avant = ref.motifsPerte[cl.motif] + " (" + ref.originesMotif[cl.origine].toLowerCase() + ")";
    cl.motif = x.motif;
    cl.origine = x.origine;
    if (x.commentaire) cl.commentaire = x.commentaire;
    historiserCloture(cl, "Motif mis à jour : " + avant + " → " + ref.motifsPerte[cl.motif] + " (" + ref.originesMotif[cl.origine].toLowerCase() + ").");
    var o = P.opportunite(oppId);
    P.ajouterNote(o.prospectId, { type: "perte", opportuniteId: oppId, resume: "Motif de perte mis à jour : " + ref.motifsPerte[cl.motif].toLowerCase() + " (" + ref.originesMotif[cl.origine].toLowerCase() + ")." });
    changer();
    return { cloture: cl };
  }
  function definirSuivi(oppId, x) {
    var cl = clotureCourante(oppId);
    if (!cl || cl.reactivation) return false;
    cl.suiviPossible = !!x.suiviPossible;
    cl.dateReprise = cl.suiviPossible && x.dateReprise ? new Date(x.dateReprise).toISOString() : null;
    cl.conditions = cl.suiviPossible ? String(x.conditions || "").trim() || null : null;
    historiserCloture(cl, cl.suiviPossible ? "Suivi futur possible" + (cl.dateReprise ? " à partir du " + P.dateCourte(cl.dateReprise) : "") + (cl.conditions ? " ; condition : " + cl.conditions : "") + "." : "Classée sans suite : aucune récupération envisagée.");
    changer();
    return true;
  }
  // Événement pertinent déclaré par le conseiller : il ne réactive rien, il propose d'examiner la situation.
  function declarerEvenement(oppId, texte) {
    var cl = clotureCourante(oppId);
    if (!cl || cl.reactivation || !String(texte || "").trim()) return false;
    cl.evenement = { texte: String(texte).trim(), le: iso() };
    historiserCloture(cl, "Événement déclaré : " + cl.evenement.texte);
    changer();
    return true;
  }
  // Réactivation : décision explicite du conseiller, jamais automatique.
  function reactiver(oppId, x) {
    var cl = clotureCourante(oppId);
    var o = P.opportunite(oppId);
    var refus = Regles.refusReactivation(cl, { arret: o ? arret(o.prospectId) : false, evenement: x.evenement });
    if (refus) return { erreur: refus };
    var etape = x.etape && P.actives.indexOf(x.etape) >= 0 ? x.etape : "AQualifier";
    var nb = P.interactionsDe(o.prospectId).length;
    var annulerEtape = P.changerEtape(oppId, etape);
    cl.reactivation = { le: iso(), evenement: String(x.evenement).trim(), par: charge.conseillerNom, etape: etape };
    historiserCloture(cl, "Opportunité réactivée : " + cl.reactivation.evenement);
    var demain = new Date(); demain.setDate(demain.getDate() + 1);
    P.ajouterNote(o.prospectId, { type: "recuperation", opportuniteId: oppId, resume: "Opportunité réactivée par le conseiller : " + cl.reactivation.evenement, prochaineAction: "Mettre à jour les besoins du client", date: demain });
    changer();
    return {
      annuler: function () {
        cl.reactivation = null;
        cl.historique.pop();
        if (annulerEtape) annulerEtape();
        while (P.interactionsDe(o.prospectId).length > nb) P.retirerDerniereInteraction(o.prospectId);
        changer();
      },
    };
  }
  // Client ayant acheté ailleurs : un futur projet est une nouvelle opportunité distincte, à sa demande.
  function nouveauProjet(contactId, titre) {
    if (!P.contact(contactId) || !String(titre || "").trim()) return null;
    if (arret(contactId)) return null;
    var o = P.ajouterOpportunite(contactId, { titre: String(titre).trim(), etape: "Nouveau" });
    P.ajouterNote(contactId, { type: "recuperation", opportuniteId: o.id, resume: "Nouveau projet d'achat manifesté par le client : nouvelle opportunité distincte (l'opportunité perdue reste close)." });
    return o;
  }
  // Retour volontaire du client : réception SIMULÉE (aucun formulaire public, aucun envoi).
  function enregistrerRetour(oppId, x) {
    var o = P.opportunite(oppId);
    if (!o || !clotureCourante(oppId)) return null;
    var r = { id: nouvelId("rt"), opportuniteId: oppId, recuLe: iso(), vehiculeTrouve: x.vehiculeTrouve || null, raison: String(x.raison || "").trim() || null,
      amelioration: String(x.amelioration || "").trim() || null, informerSiDisponible: x.informerSiDisponible == null ? null : !!x.informerSiDisponible, simule: true };
    etat.retours.push(r);
    P.ajouterNote(o.prospectId, { type: "note", opportuniteId: oppId, resume: "Retour volontaire du client reçu (réception simulée)" + (r.raison ? " : « " + r.raison + " »" : "") + "." });
    changer();
    return r;
  }
  function dossierPerte(oppId) {
    var cl = clotureCourante(oppId);
    var o = P.opportunite(oppId);
    if (!cl || !o) return null;
    var soums = S.parOpportunite(oppId).map(function (s) {
      var v = S.versionCourante(s);
      return { id: s.id, reference: s.reference, numero: v.numero, versions: s.versions.length, statutLibelle: S.libelleStatut(S.statut(s)), vehicule: S.nomVehicule(v.vehicule), url: S.urlDetail(s.id) };
    });
    var rdvs = R ? R.parOpportunite(oppId).map(function (r) { return { id: r.id, typeLibelle: R.type(r.type).libelle, statutLibelle: R.statut(r.statut).libelle, creneau: R.creneauTexte(r), url: R.urlDetail(r.id), resultat: r.resultat || null }; }) : [];
    var inters = P.interactionsDe(o.prospectId).filter(function (i) { return !i.opportuniteId || i.opportuniteId === oppId; });
    var trs = T.parOpportunite(oppId);
    var x = { cloture: cl, opportunite: o, contact: P.contact(o.prospectId), soumissions: soums, rendezVous: rdvs, interactions: inters, retour: retourDe(oppId),
      completude: P.completude(o.qualification), etapeLibelle: P.libelleEtape(cl.etapeAtteinte), transactions: trs, historique: cloturesDe(oppId),
      // Contacts déclarés avec le client pour cette opportunité (intelligence-regles.js) ; les notes internes n'en sont pas.
      contacts: window.IntelligenceRegles ? window.IntelligenceRegles.contactsDeclares(inters, P.typesContact(), oppId) : [] };
    x.analyse = Regles.analyse(x, ref);
    x.etat = etatDe(cl);
    x.blocages = trs.map(function (t) {
      return t.reference + " : " + (t.statut === "Annulee" && t.annulation ? "annulée — " + (T.ref.motifsAnnulation[t.annulation.motif] || t.annulation.motif).toLowerCase() + (t.annulation.commentaire ? " (" + t.annulation.commentaire + ")" : "") : T.statutAffiche(T.analyse(t).statut).libelle.toLowerCase());
    });
    x.refusReactivation = Regles.refusReactivation(cl, { arret: arret(o.prospectId), evenement: "x" });
    return x;
  }

  // ---------- Satisfaction et après-vente ----------
  function enqueteDe(tid) {
    return etat.enquetes.filter(function (e) { return e.transactionId === tid; })[0] || null;
  }
  function problemesDe(tid) {
    return etat.problemes.filter(function (p) { return p.transactionId === tid; });
  }
  function invitationDe(tid) {
    return etat.invitations.filter(function (x) { return x.transactionId === tid; })[0] || null;
  }
  function estLivree(t) {
    return (t.statut === "Livree" || t.statut === "Cloturee") && t.livraison && t.livraison.confirmeeLe;
  }
  function eligibilite(t) {
    var pref = I() ? I().preferences(t.prospectId) : null;
    return Regles.eligibiliteInvitation({ transaction: t, enquete: enqueteDe(t.id), problemes: problemesDe(t.id), arret: arret(t.prospectId), consentement: pref ? pref.consentement : null,
      invitation: invitationDe(t.id), maintenant: new Date() }, ref);
  }
  // Livraisons confirmées (seul déclencheur du suivi de satisfaction : une livraison planifiée ne suffit pas).
  function livraisons() {
    return T.liste().filter(estLivree).map(function (t) {
      var e = enqueteDe(t.id);
      return { transaction: t, client: nomContact(t.prospectId), vehicule: T.nomVehicule(t), confirmeeLe: t.livraison.confirmeeLe, enquete: e, problemes: problemesDe(t.id), invitation: invitationDe(t.id),
        eligibilite: eligibilite(t), dimensions: e ? Regles.dimensions(e, ref) : null, insatisfactions: e ? Regles.insatisfactions(e, ref) : null, conseillerId: t.conseillerId };
    }).sort(function (a, b) { return new Date(b.confirmeeLe) - new Date(a.confirmeeLe); });
  }
  function compteursSatisfaction(conseiller) {
    var l = livraisons().filter(function (x) { return !conseiller || x.conseillerId === conseiller; });
    var m = new Date();
    var probs = etat.problemes.filter(function (p) { var t = T.transaction(p.transactionId); return t && (!conseiller || t.conseillerId === conseiller); });
    var suivis = I() ? I().actives({ conseiller: conseiller }).filter(function (a) { return a.regle === "satisfaction-a-planifier"; }).length : null;
    return {
      livres: l.filter(function (x) { return (m - new Date(x.confirmeeLe)) / JOUR <= ref.config.fenetreLivraisonRecenteJours; }).length,
      suivis: suivis,
      retours: l.filter(function (x) { return x.enquete; }).length,
      ouverts: probs.filter(Regles.problemeOuvert).length,
      resolus: probs.filter(function (p) { return !Regles.problemeOuvert(p); }).length,
      interet: l.filter(function (x) { return x.enquete && x.enquete.interetRecommander === true; }).length,
    };
  }
  function validerEnquete(x) {
    var e = {};
    if (!(x.globale >= 1 && x.globale <= 5)) e.globale = "Indiquez le niveau de satisfaction globale.";
    Object.keys(x.reponses || {}).forEach(function (k) { if (!(x.reponses[k] >= 1 && x.reponses[k] <= 5)) e[k] = "Valeur invalide."; });
    return e;
  }
  // Représentation d'un retour reçu : saisie identifiée comme simulée, une seule par transaction.
  function enregistrerEnquete(tid, x) {
    var t = T.transaction(tid);
    if (!t || !estLivree(t)) return { erreurs: { general: "Seule une transaction réellement livrée peut recevoir un retour de satisfaction." } };
    if (enqueteDe(tid)) return { erreurs: { general: "Un retour est déjà enregistré pour cette transaction." } };
    var erreurs = validerEnquete(x);
    if (Object.keys(erreurs).length) return { erreurs: erreurs };
    var e = { id: nouvelId("e"), transactionId: tid, recueLe: iso(), reponses: x.reponses || {}, globale: Number(x.globale), commentaire: String(x.commentaire || "").trim() || null,
      recontacterProbleme: !!x.recontacterProbleme, interetRecommander: x.interetRecommander == null ? null : !!x.interetRecommander, simule: true };
    etat.enquetes.push(e);
    P.ajouterNote(t.prospectId, { type: "satisfaction", opportuniteId: t.opportuniteId, resume: "Retour de satisfaction reçu (réception simulée) : " + ref.echelle[String(e.globale)].toLowerCase() + "." });
    changer();
    return { enquete: e };
  }
  function probleme(id) {
    return etat.problemes.filter(function (p) { return p.id === id; })[0] || null;
  }
  function problemes() {
    return etat.problemes.map(function (p) {
      var t = T.transaction(p.transactionId);
      return { probleme: p, transaction: t, client: t ? nomContact(t.prospectId) : "—", vehicule: t ? T.nomVehicule(t) : "—", ouvert: Regles.problemeOuvert(p) };
    }).sort(function (a, b) { return (b.ouvert - a.ouvert) || new Date(b.probleme.signaleLe) - new Date(a.probleme.signaleLe); });
  }
  function journalProbleme(p, texte, vers) {
    p.historique.push({ date: iso(), texte: texte, auteur: charge.conseillerNom, de: p.statut, vers: vers || p.statut });
    if (vers) p.statut = vers;
  }
  function creerProbleme(x) {
    var t = T.transaction(x.transactionId);
    var e = {};
    if (!t || !estLivree(t)) e.transactionId = "Choisissez une transaction livrée.";
    if (!ref.typesProbleme[x.type]) e.type = "Choisissez la nature du problème.";
    if (!String(x.nature || "").trim()) e.nature = "Décrivez le problème.";
    if (!x.departement || !T.ref.departements[x.departement]) e.departement = "Choisissez le département concerné.";
    if (Object.keys(e).length) return { erreurs: e };
    var p = { id: nouvelId("pb"), transactionId: t.id, type: x.type, nature: String(x.nature).trim(), signaleLe: iso(), departement: x.departement,
      responsable: String(x.responsable || "").trim() || (x.departement === "conseiller" ? charge.conseillerNom : (T.ref.departements[x.departement].personne ? T.ref.departements[x.departement].personne + " (fictif)" : null)),
      priorite: x.priorite === "Normal" ? "Normal" : "Eleve", statut: "Nouveau", prochaineAction: String(x.prochaineAction || "").trim() || null, enqueteId: x.enqueteId || null,
      resoluLe: null, verifieLe: null, historique: [] };
    journalProbleme(p, "Problème enregistré : " + p.nature, "Nouveau");
    etat.problemes.push(p);
    P.ajouterNote(t.prospectId, { type: "probleme", opportuniteId: t.opportuniteId, resume: "Problème après-vente enregistré : " + p.nature });
    changer();
    return { probleme: p };
  }
  var TRANSITIONS = {
    Nouveau: ["EnCours", "AttenteDepartement", "AttenteClient", "Resolu"],
    EnCours: ["AttenteDepartement", "AttenteClient", "Resolu"],
    AttenteDepartement: ["EnCours", "AttenteClient", "Resolu"],
    AttenteClient: ["EnCours", "AttenteDepartement", "Resolu"],
    Resolu: ["EnCours"],
    Cloture: [],
  };
  function changerStatutProbleme(id, statut, note) {
    var p = probleme(id);
    if (!p || TRANSITIONS[p.statut].indexOf(statut) < 0) return null;
    var avant = cloner(p);
    var texte = statut === "Resolu" ? "Problème déclaré résolu" : statut === "EnCours" && p.statut === "Resolu" ? "Problème rouvert" : "Statut : " + ref.statutsProbleme[statut];
    journalProbleme(p, texte + (note ? " : " + note : "") + ".", statut);
    if (statut === "Resolu") p.resoluLe = iso();
    if (avant.statut === "Resolu" && statut === "EnCours") p.resoluLe = null;
    changer();
    return function () { etat.problemes[etat.problemes.indexOf(p)] = avant; changer(); };
  }
  // Transfert préparé : aucun message n'est envoyé au département, le conseiller le contacte lui-même.
  function transfererProbleme(id, departement, note) {
    var p = probleme(id);
    if (!p || !Regles.problemeOuvert(p) || !T.ref.departements[departement] || departement === "conseiller" || departement === "client") return null;
    var avant = cloner(p);
    p.departement = departement;
    p.responsable = T.ref.departements[departement].personne ? T.ref.departements[departement].personne + " (fictif)" : T.ref.departements[departement].libelle;
    journalProbleme(p, "Transfert préparé vers " + T.ref.departements[departement].libelle + (note ? " : " + note : "") + " (aucun envoi automatique).", "AttenteDepartement");
    changer();
    return function () { etat.problemes[etat.problemes.indexOf(p)] = avant; changer(); };
  }
  function noterActionProbleme(id, texte, prochaine) {
    var p = probleme(id);
    if (!p || !String(texte || "").trim()) return null;
    var avant = cloner(p);
    if (prochaine != null) p.prochaineAction = String(prochaine).trim() || null;
    journalProbleme(p, "Action locale : " + String(texte).trim(), p.statut === "Nouveau" ? "EnCours" : null);
    changer();
    return function () { etat.problemes[etat.problemes.indexOf(p)] = avant; changer(); };
  }
  // Vérification avec le client : clôture si la résolution répond au besoin, sinon le dossier est rouvert.
  function verifierResolution(id, satisfaisante, note) {
    var p = probleme(id);
    if (!p || p.statut !== "Resolu") return null;
    var avant = cloner(p);
    if (satisfaisante) {
      p.verifieLe = iso();
      journalProbleme(p, "Résolution vérifiée avec le client" + (note ? " : " + note : "") + ".", "Cloture");
    } else {
      p.resoluLe = null;
      journalProbleme(p, "Le client indique que la résolution ne répond pas à son besoin" + (note ? " : " + note : "") + ".", "EnCours");
    }
    changer();
    return function () { etat.problemes[etat.problemes.indexOf(p)] = avant; changer(); };
  }

  // ---------- Profil, carte et Referral Loop ----------
  function profil() {
    return etat.profil;
  }
  function modifierProfil(patch) {
    Object.keys(patch).forEach(function (k) { if (k !== "codeRecommandation") etat.profil[k] = patch[k]; });
    changer();
  }
  // Textes accordés selon la forme du rôle (« Conseillère aux ventes »…) ; forme absente ou inconnue : formulation neutre.
  function textesRole(formeRole) {
    return (ref.formesRole && ref.formesRole[formeRole]) || ref.formeRoleNeutre;
  }
  // Seules les informations publiques autorisées sont exposées au parcours de démonstration.
  function profilPublic() {
    var p = etat.profil;
    return { nom: charge.conseillerNom, role: textesRole(p.formeRole).role, concession: ref.concession || "Concession de démonstration", presentation: p.presentation,
      telephone: p.afficherTelephone ? p.telephonePro : null, courriel: p.afficherCourriel ? p.courrielPro : null,
      langues: p.afficherLangues ? p.langues.map(function (l) { return ref.langues[l] || l; }) : [], photo: null, code: p.codeRecommandation,
      formeRole: p.formeRole || null, anneeArrivee: p.anneeArrivee || null, ville: p.villeConcession || null };
  }
  function publierProfil() {
    ecrireCle(CLE_PROFIL_PUBLIC, profilPublic());
  }
  // Lien FICTIF : aucun portail public n'existe ; il ne donne accès à rien.
  function lienDemo(invitationId) {
    return "https://phineas.exemple.test/r/" + encodeURIComponent(etat.profil.codeRecommandation) + (invitationId ? "?p=" + encodeURIComponent(invitationId) : "");
  }
  function urlApercu(invitationId) {
    return ref.urls.recommande + "?code=" + encodeURIComponent(etat.profil.codeRecommandation) + (invitationId ? "&p=" + encodeURIComponent(invitationId) : "");
  }
  function messagePartage(invitationId) {
    return etat.profil.messageCarte + "\n" + lienDemo(invitationId) + "\n\n" + charge.conseillerNom + (ref.concession ? " — " + ref.concession : "");
  }
  function brouillonInvitation(tid) {
    var t = T.transaction(tid);
    var c = t ? P.contact(t.prospectId) : null;
    return "Bonjour " + (c ? c.prenom : "") + ", merci encore pour votre confiance lors de l'achat de votre véhicule. Si un proche recherche éventuellement une voiture, vous pouvez lui partager ma carte professionnelle. " +
      "Je serai heureux de l'aider selon ses besoins, sans engagement.\n\n" + charge.conseillerNom;
  }
  function invitations() {
    return etat.invitations.map(function (x) {
      var t = T.transaction(x.transactionId);
      return { invitation: x, transaction: t, client: t ? nomContact(t.prospectId) : "—", recommandations: etat.recommandations.filter(function (r) { return r.invitationId === x.id || (t && r.parrainProspectId === t.prospectId); }).length };
    });
  }
  function preparerInvitation(tid, texte) {
    var t = T.transaction(tid);
    if (!t) return { erreur: "Transaction introuvable." };
    var el = eligibilite(t);
    if (!el.eligible) return { erreur: el.raisons.join(" ") };
    if (!String(texte || "").trim()) return { erreur: "Le message est vide." };
    var x = { id: nouvelId("inv"), transactionId: tid, texte: String(texte).trim(), prepareeLe: iso(), partageeLe: null };
    etat.invitations.push(x);
    P.ajouterNote(t.prospectId, { type: "recommandation", opportuniteId: t.opportuniteId, resume: "Invitation facultative à recommander le conseiller préparée (non envoyée)." });
    changer();
    return { invitation: x };
  }
  // Le partage est déclaré par le conseiller : Phineas n'envoie rien.
  function declarerPartagee(id) {
    var x = etat.invitations.filter(function (i) { return i.id === id; })[0];
    if (!x || x.partageeLe) return false;
    x.partageeLe = iso();
    var t = T.transaction(x.transactionId);
    if (t) P.ajouterNote(t.prospectId, { type: "recommandation", opportuniteId: t.opportuniteId, resume: "Invitation déclarée comme partagée par le conseiller (envoi fait hors Phineas)." });
    changer();
    return true;
  }
  function etatReco(r) {
    var o = r.opportuniteId ? P.opportunite(r.opportuniteId) : null;
    return Regles.etatRecommandation(o, o ? T.parOpportunite(o.id) : []);
  }
  // Historique des recommandations, vu par le conseiller seulement (le parrain n'y a jamais accès).
  function recommandations() {
    return etat.recommandations.map(function (r) {
      var o = r.opportuniteId ? P.opportunite(r.opportuniteId) : null;
      var c = P.contact(r.prospectId);
      return { recommandation: r, contact: c, prospect: c ? c.prenom + " " + c.nom : "—", opportunite: o, etape: o ? P.libelleEtape(o.etape) : "—", etat: etatReco(r),
        parrain: r.parrainProspectId ? nomContact(r.parrainProspectId) : null, conseiller: P.conseiller(r.conseillerId).nom };
    }).sort(function (a, b) { return new Date(b.recommandation.recueLe) - new Date(a.recommandation.recueLe); });
  }
  function populationReseau() {
    // Population cohérente : prospects recommandés distincts (les doublons ne comptent pas comme nouveaux prospects).
    return etat.recommandations.filter(function (r) { return !r.doublon && r.opportuniteId; }).map(function (r) {
      var o = P.opportunite(r.opportuniteId) || {};
      var trs = T.parOpportunite(r.opportuniteId).filter(function (t) { return t.statut !== "Annulee"; });
      return {
        recommandation: r,
        qualifiee: ["Qualifie", "Soumission", "EssaiRoutier", "Negociation", "Finalisation", "Gagne"].indexOf(o.etape) >= 0 || trs.length > 0,
        rendezVous: R ? R.parOpportunite(r.opportuniteId).some(function (x) { return ["Annule"].indexOf(x.statut) < 0; }) : false,
        transaction: trs.some(function (t) { return t.statut === "Livree" || t.statut === "Cloturee" || (t.administratif && t.administratif.statut === "Confirme"); }),
        livree: trs.some(function (t) { return t.statut === "Livree" || t.statut === "Cloturee"; }),
      };
    });
  }
  function indicateursReseau() {
    var pop = populationReseau();
    return {
      preparees: etat.invitations.length,
      partagees: etat.invitations.filter(function (x) { return x.partageeLe; }).length,
      prospects: pop.length,
      opportunites: pop.length,
      rendezVous: pop.filter(function (x) { return x.rendezVous; }).length,
      transactions: pop.filter(function (x) { return x.transaction; }).length,
      livrees: pop.filter(function (x) { return x.livree; }).length,
      doublons: etat.recommandations.filter(function (r) { return r.doublon; }).length,
      entonnoir: Regles.entonnoir(pop),
    };
  }
  function prochaineReference() {
    var max = etat.recommandations.reduce(function (m, r) { var n = parseInt(String(r.reference).split("-").pop(), 10); return n > m ? n : m; }, 0);
    return "REC-" + new Date().getFullYear() + "-" + String(max + 1).padStart(4, "0");
  }
  // Demande volontaire reçue par le formulaire de démonstration : attribution au conseiller, doublons traités,
  // aucune information interne renvoyée au formulaire.
  function recevoirDemande(x) {
    var erreurs = Regles.validerDemandePublique(x);
    if (Object.keys(erreurs).length) return { statut: "refuse", erreurs: erreurs };
    if (x.code !== etat.profil.codeRecommandation) return { statut: "refuse", erreurs: { code: "Lien de recommandation inconnu." } };
    var inv = x.parrainage ? etat.invitations.filter(function (i) { return i.id === x.parrainage; })[0] : null;
    var parrain = inv ? (T.transaction(inv.transactionId) || {}).prospectId || null : null;
    var dbl = Regles.chercherDoublon(P.contacts(), x);
    var reco = { id: nouvelId("rec"), reference: prochaineReference(), prospectId: null, opportuniteId: null, parrainProspectId: parrain, invitationId: inv ? inv.id : null,
      recueLe: iso(), attribution: "lien-personnel", conseillerId: P.moiId, doublon: false };
    var res;
    if (dbl && dbl.contact) {
      // Contact existant : aucune seconde fiche. Rattachement à l'opportunité en cours, ou nouveau projet distinct.
      var c = dbl.contact;
      var active = P.opportunitesDe(c.id).filter(P.estActive)[0];
      reco.prospectId = c.id;
      reco.doublon = true;
      if (active) {
        P.ajouterNote(c.id, { type: "recommandation", opportuniteId: active.id, resume: "Nouvelle demande reçue par la carte de recommandation : rattachée à l'opportunité en cours (aucun doublon créé)." });
        res = { statut: "rattache", contact: c, opportunite: active };
      } else if (arret(c.id)) {
        P.ajouterNote(c.id, { type: "recommandation", resume: "Demande reçue par la carte de recommandation de la part d'un contact ayant demandé à ne plus être sollicité : à examiner avant toute réponse." });
        res = { statut: "rattache", contact: c, opportunite: null };
      } else {
        var o = P.ajouterOpportunite(c.id, { titre: String(x.vehicule || "").trim() || "Nouveau projet", etape: "Nouveau" });
        reco.opportuniteId = o.id;
        reco.doublon = false;
        P.ajouterNote(c.id, { type: "recommandation", opportuniteId: o.id, resume: "Nouvelle demande reçue par la carte de recommandation : nouvelle opportunité pour un contact existant." });
        res = { statut: "rattache", contact: c, opportunite: o };
      }
    } else {
      var nc = P.ajouterProspect({ prenom: String(x.prenom).trim(), nom: String(x.nom).trim(), courriel: String(x.courriel || "").trim() || null, telephone: String(x.telephone || "").trim() || null,
        contactPrefere: x.courriel && x.contactPrefere !== "telephone" && x.contactPrefere !== "texto" ? "courriel" : x.telephone ? (x.contactPrefere === "texto" ? "texto" : "telephone") : "courriel",
        source: "recommandation", sourceDetail: "Carte de recommandation de " + charge.conseillerNom + " (démonstration)" + (parrain ? " — parrainage " + reco.reference : ""),
        conseillerId: P.moiId, etape: "Nouveau", modele: String(x.vehicule || "").trim() || null, budget: x.budget ? Number(x.budget) : null, horizon: x.horizon || null,
        commentaire: String(x.commentaire || "").trim() ? "Message du prospect : « " + String(x.commentaire).trim() + " »" : null });
      var no = P.opportunitesDe(nc.id)[0];
      reco.prospectId = nc.id;
      reco.opportuniteId = no ? no.id : null;
      if (I()) I().definirPreferences(nc.id, { consentement: x.consentementInformation ? "explicite" : "implicite", note: "Préférences exprimées dans le formulaire de recommandation (démonstration)." });
      res = { statut: "cree", contact: nc, opportunite: no };
    }
    etat.recommandations.push(reco);
    changer();
    res.recommandation = reco;
    return res;
  }
  // Traite la boîte alimentée par la prévisualisation du parcours public (même onglet).
  function traiterBoite() {
    var boite = lire(CLE_BOITE) || [];
    var resultats = [];
    boite.filter(function (x) { return !x.traitee; }).forEach(function (x) {
      x.traitee = true;
      resultats.push(recevoirDemande(x));
    });
    if (resultats.length) ecrireCle(CLE_BOITE, boite);
    return resultats;
  }

  // ---------- Relationship Analytics ----------
  function statistiques(periode) {
    var m = new Date();
    var cl = pertes().map(function (x) { return { motif: x.cloture.motif, origine: x.cloture.origine, etapeAtteinte: x.cloture.etapeAtteinte, date: x.cloture.date, etatRecuperation: x.etat.cle, conseillerId: x.conseillerId }; })
      .filter(function (c) { return c.conseillerId === P.moiId && Regles.dansPeriode(c.date, periode, m); });
    var livs = T.liste().filter(function (t) { return estLivree(t) && t.conseillerId === P.moiId && Regles.dansPeriode(t.livraison.confirmeeLe, periode, m); });
    var ids = livs.map(function (t) { return t.id; });
    var enqs = etat.enquetes.filter(function (e) { return ids.indexOf(e.transactionId) >= 0; });
    var probs = etat.problemes.filter(function (p) { return ids.indexOf(p.transactionId) >= 0; });
    var reco = indicateursReseau();
    var pop = populationReseau().filter(function (x) { return Regles.dansPeriode(x.recommandation.recueLe, periode, m); });
    return {
      periode: periode, pertes: Regles.statistiquesPertes(cl), satisfaction: Regles.statistiquesSatisfaction(livs, enqs, probs, ref),
      reseau: { prospects: pop.length, entonnoir: Regles.entonnoir(pop), livrees: pop.filter(function (x) { return x.livree; }).length, transactions: pop.filter(function (x) { return x.transaction; }).length, doublons: reco.doublons },
      sansCloture: pertesSansCloture().length,
    };
  }

  // ---------- Timeline relationnelle (lecture de l'historique existant, aucune copie) ----------
  var JALONS = {
    creation: "Premier contact", opportunite: "Nouveau projet", qualification: "Qualification", soumission: "Soumission", rendezvous: "Rendez-vous", transaction: "Transaction",
    perte: "Vente perdue", recuperation: "Récupération", satisfaction: "Suivi de satisfaction", probleme: "Problème signalé", recommandation: "Recommandation", etape: "Étape",
  };
  function timeline(contactId) {
    return P.interactionsDe(contactId).filter(function (i) { return JALONS[i.type]; }).map(function (i) {
      return { date: i.date, jalon: JALONS[i.type], type: i.type, texte: i.resume, opportuniteId: i.opportuniteId, auteur: i.auteur };
    });
  }

  // ---------- Entrées du moteur de la phase 06 ----------
  function pourMoteur() {
    var m = new Date();
    var recoParOpp = {};
    etat.recommandations.forEach(function (r) {
      if (!r.opportuniteId) return;
      recoParOpp[r.opportuniteId] = { reference: r.reference, attribution: ref.attributions[r.attribution], parrain: r.parrainProspectId ? nomContact(r.parrainProspectId) : null };
    });
    var clotures = [];
    var vus = {};
    etat.clotures.slice().reverse().forEach(function (cl) {
      if (vus[cl.opportuniteId]) return;
      vus[cl.opportuniteId] = true;
      var o = P.opportunite(cl.opportuniteId);
      if (!o) return;
      var c = P.contact(o.prospectId);
      var x = cloner(cl);
      x.etat = etatDe(cl).cle;
      x.prospectId = o.prospectId;
      x.conseillerId = c ? c.conseillerId : null;
      x.titre = o.titre;
      x.etapeOpp = o.etape;
      x.vehicule = vehiculeRecherche(o);
      x.retour = retourDe(o.id);
      x.motifLibelle = ref.motifsPerte[cl.motif];
      x.origineLibelle = ref.originesMotif[cl.origine];
      // Correspondances d'inventaire : seulement si le motif s'y prête et que le client n'a pas refusé d'être informé.
      x.matching = !cl.reactivation && o.etape === "Perdu" && Regles.motifsMatching.indexOf(cl.motif) >= 0 && (x.etat === "attente-evenement") && !(x.retour && x.retour.informerSiDisponible === false);
      clotures.push(x);
    });
    var livs = livraisons().map(function (l) {
      return { transactionId: l.transaction.id, reference: l.transaction.reference, prospectId: l.transaction.prospectId, opportuniteId: l.transaction.opportuniteId, conseillerId: l.transaction.conseillerId,
        confirmeeLe: l.confirmeeLe, vehiculeNom: l.vehicule, enquete: !!l.enquete, eligible: l.eligibilite.eligible, statut: l.transaction.statut };
    });
    var enqs = etat.enquetes.map(function (e) {
      var t = T.transaction(e.transactionId);
      var ins = Regles.insatisfactions(e, ref);
      return { id: e.id, transactionId: e.transactionId, prospectId: t ? t.prospectId : null, opportuniteId: t ? t.opportuniteId : null, conseillerId: t ? t.conseillerId : null, recueLe: e.recueLe,
        vehiculeNom: t ? T.nomVehicule(t) : null, globale: e.globale, insatisfait: ins.globale || ins.dimensions.length > 0, dimensionsInsatisfaites: ins.dimensions.map(function (x) { return x.libelle; }),
        recontacter: e.recontacterProbleme, problemeLie: etat.problemes.some(function (p) { return p.transactionId === e.transactionId && (p.enqueteId === e.id || new Date(p.signaleLe) >= new Date(e.recueLe)); }) };
    });
    var probs = etat.problemes.map(function (p) {
      var t = T.transaction(p.transactionId);
      return { id: p.id, transactionId: p.transactionId, prospectId: t ? t.prospectId : null, opportuniteId: t ? t.opportuniteId : null, conseillerId: t ? t.conseillerId : null, vehiculeNom: t ? T.nomVehicule(t) : null,
        statut: p.statut, statutLibelle: ref.statutsProbleme[p.statut], nature: p.nature, type: p.type, departement: p.departement, departementLibelle: (T.ref.departements[p.departement] || {}).libelle || p.departement,
        priorite: p.priorite, prochaineAction: p.prochaineAction, signaleLe: p.signaleLe, resoluLe: p.resoluLe, verifieLe: p.verifieLe, dernier: p.historique.length ? p.historique[p.historique.length - 1].date : p.signaleLe };
    });
    return { config: ref.config, maintenant: m, clotures: clotures, livraisons: livs, enquetes: enqs, problemes: probs, recommandationsParOpp: recoParOpp };
  }
  function urlObjet(objet, a) {
    if (!objet) return null;
    if (objet.type === "cloture") return ref.urls.pertes + "?opportunite=" + encodeURIComponent(objet.id);
    if (objet.type === "livraison" || objet.type === "enquete") return ref.urls.satisfaction + "?transaction=" + encodeURIComponent(objet.id);
    if (objet.type === "probleme") { var p = probleme(objet.id); return ref.urls.satisfaction + "?transaction=" + encodeURIComponent(p ? p.transactionId : "") + "#probleme-" + encodeURIComponent(objet.id); }
    if (objet.type === "invitation") return ref.urls.reseau + "?transaction=" + encodeURIComponent(objet.id);
    return null;
  }
  function urlAnalyse(oppId) {
    return ref.urls.pertes + "?opportunite=" + encodeURIComponent(oppId);
  }

  function reinitialiser() {
    try {
      window.sessionStorage.removeItem(CLE);
      window.sessionStorage.removeItem(CLE_BOITE);
    } catch (e) {}
    etat = initial();
    modifie = false;
    publierProfil();
    abonnes.forEach(function (f) { f(); });
  }

  window.RelationsClients = {
    ref: ref,
    regles: Regles,
    cleBoite: CLE_BOITE,
    cleProfilPublic: CLE_PROFIL_PUBLIC,
    abonner: function (f) { abonnes.push(f); },
    // ventes perdues
    pertes: pertes,
    pertesSansCloture: pertesSansCloture,
    compteursPertes: compteursPertes,
    clotureCourante: clotureCourante,
    clotures: cloturesDe,
    refusCloture: refusCloture,
    cloturer: cloturer,
    preciserMotif: preciserMotif,
    definirSuivi: definirSuivi,
    declarerEvenement: declarerEvenement,
    reactiver: reactiver,
    nouveauProjet: nouveauProjet,
    enregistrerRetour: enregistrerRetour,
    retour: retourDe,
    dossierPerte: dossierPerte,
    etatRecuperation: etatDe,
    // satisfaction
    livraisons: livraisons,
    compteursSatisfaction: compteursSatisfaction,
    enquete: enqueteDe,
    enregistrerEnquete: enregistrerEnquete,
    problemes: problemes,
    probleme: probleme,
    problemesDe: problemesDe,
    creerProbleme: creerProbleme,
    transitionsProbleme: function (statut) { return TRANSITIONS[statut] || []; },
    changerStatutProbleme: changerStatutProbleme,
    transfererProbleme: transfererProbleme,
    noterActionProbleme: noterActionProbleme,
    verifierResolution: verifierResolution,
    eligibilite: eligibilite,
    // référencement
    profil: profil,
    profilPublic: profilPublic,
    textesRole: textesRole,
    modifierProfil: modifierProfil,
    lienDemo: lienDemo,
    urlApercu: urlApercu,
    messagePartage: messagePartage,
    brouillonInvitation: brouillonInvitation,
    invitations: invitations,
    invitation: invitationDe,
    preparerInvitation: preparerInvitation,
    declarerPartagee: declarerPartagee,
    recommandations: recommandations,
    recommandationDe: function (oppId) { return etat.recommandations.filter(function (r) { return r.opportuniteId === oppId; })[0] || null; },
    indicateursReseau: indicateursReseau,
    recevoirDemande: recevoirDemande,
    traiterBoite: traiterBoite,
    // analyse
    statistiques: statistiques,
    timeline: timeline,
    // moteur
    pourMoteur: pourMoteur,
    urlObjet: urlObjet,
    urlAnalyse: urlAnalyse,
  };

  P.enregistrerModule({ estModifie: function () { return modifie; }, reinitialiser: reinitialiser });
  publierProfil();
  // Demandes envoyées depuis la prévisualisation publique pendant cette session de démonstration.
  var recues = traiterBoite();
  if (recues.length) setTimeout(function () {
    P.notifier(recues.length + " demande(s) reçue(s) par votre carte de recommandation (démonstration) : " + recues.map(function (r) { return r.statut === "cree" ? "prospect créé" : r.statut === "rattache" ? "rattachée à un contact existant" : "refusée"; }).join(", ") + ".");
  }, 0);
})();
