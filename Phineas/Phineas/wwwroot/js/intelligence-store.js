// Phineas Sales Intelligence Engine : état local de démonstration (même principe que les autres stores).
// Construit un instantané à partir des modules existants, lance le moteur (intelligence-regles.js) et réconcilie
// les recommandations détectées avec l'état des actions (à traiter, en cours, reportée, terminée, ignorée, obsolète).
// Aucun appel réseau : les statuts restent dans le sessionStorage de l'onglet. Seule exception (fonctionnalité 14) :
// les veilles enregistrées en base (charge.donnees.veilles), lues ici, et posées ou levées par un formulaire envoyé
// au serveur (envoyerVeille, envoyerReactivation) ; une veille n'est jamais une réalisation.
(function () {
  "use strict";

  var source = document.getElementById("intelligence-donnees");
  if (!source) return;
  var charge = JSON.parse(source.textContent);
  var P = window.Prospects, S = window.Soumissions, R = window.RendezVous, T = window.Transactions, C = window.SoumissionsCalcul;
  var Regles = window.IntelligenceRegles, M = window.IntelligenceMatching;
  // Relations clients (phase 07) : facultatif ; une page sans ces données ne produit simplement pas ces règles.
  var RC = window.RelationsClients || null;
  // Outils du vendeur (phase 08) : provenance des prospects ; facultatif.
  var OV = window.OutilsVendeur || null;
  // Tous les modules sont requis : sans eux, des recommandations seraient à tort considérées comme obsolètes.
  if (!P || !S || !R || !T || !Regles || !M) return;
  var d = charge.donnees;
  var ref = charge.referentiels;
  var CLE = "phineas.salesos.intelligence.v1:" + charge.conseillerNom;
  var ACTIVES = ["ATraiter", "EnCours"];
  var JOUR = 86400000;

  ref.conseillerNom = charge.conseillerNom;
  ref.urlActions = charge.urlActions;
  ref.urlSuivis = charge.urlSuivis;
  ref.urlVehicules = charge.urlVehicules;
  ref.urlMettreEnVeille = charge.urlMettreEnVeille;
  ref.urlReactiverVeille = charge.urlReactiverVeille;

  // Veilles enregistrées et actives (ServiceVeillesRecommandations.ActivesAsync), par identifiant de recommandation.
  // Jamais copiées dans le sessionStorage : la base est la seule source.
  var veilles = {};
  (d.veilles || []).forEach(function (v) {
    veilles[v.cle] = { depuis: v.depuis, jusqua: v.jusqua, opportuniteId: v.opportuniteId };
  });
  ref.libellesPriorite = {};
  ref.priorites.forEach(function (p) { ref.libellesPriorite[p.cle] = p.libelle; });
  ref.caracteristiques = P.ref.caracteristiques || {};
  var refRegles = {};
  ref.regles.forEach(function (r) { refRegles[r.cle] = r; });

  function cloner(o) {
    return JSON.parse(JSON.stringify(o));
  }
  function iso() {
    return new Date().toISOString();
  }
  function initial() {
    var vus = {};
    Object.keys(d.blocagesConnus || {}).forEach(function (tid) {
      vus[tid] = d.blocagesConnus[tid].map(function (x) { var p = x.split("|"); return { code: p[0], libelle: p[1] || p[0] }; });
    });
    var pauses = {};
    (d.pauses || []).forEach(function (p) { pauses[p.opportuniteId] = { jusqua: p.jusqua, motif: p.motif, depuis: p.depuis }; });
    var prefs = {};
    (d.preferences || []).forEach(function (p) { prefs[p.prospectId] = cloner(p); });
    var indisp = {};
    Object.keys(d.indispensables || {}).forEach(function (k) { indisp[k] = d.indispensables[k].slice(); });
    return { actions: {}, demandes: cloner(d.demandes), pauses: pauses, preferences: prefs, indispensables: indisp, blocagesVus: vus, resolus: {}, arrivees: {}, semences: false };
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
  var resultat = { actions: [], suspendues: [] };
  var enCalcul = false;

  // ---------- Instantané des modules existants ----------
  function statutVehicule(id) {
    if (T) return T.statutVehicule(id);
    var v = S.vehicule(id);
    return v ? v.statutActuel : null;
  }
  function toutesInteractions() {
    var l = [];
    P.contacts().forEach(function (c) { l = l.concat(P.interactionsDe(c.id)); });
    return l;
  }
  function rdvFuturs(oppId) {
    if (!R) return [];
    var m = new Date();
    return R.parOpportunite(oppId).filter(function (r) { return R.estActif(r) && R.fin(r) >= m; });
  }
  function nomVehiculeInv(v) {
    return v ? S.nomVehicule(v) : null;
  }
  // Véhicule retenu par la transaction en cours d'un autre client : indisponible pour les autres opportunités.
  function retenuPar(vehiculeId, oppId) {
    var t = T.liste().filter(function (x) { return x.vehiculeId === vehiculeId && ["Active", "EnAttente", "Livree", "Cloturee"].indexOf(x.statut) >= 0; })[0];
    return t && t.opportuniteId !== oppId ? t.reference : null;
  }
  function criteresOpp(o) {
    return M.depuisOpportunite(o, etat.indispensables[o.id] || []);
  }

  function instantane() {
    var m = new Date();
    // Phase 07 : faits des relations clients ; les correspondances des opportunités perdues réutilisent le matching.
    var rel = RC ? RC.pourMoteur() : null;
    if (rel) rel.clotures.forEach(function (c) { c.correspondances = c.matching ? correspondancesPerte(c) : []; });
    var opps = P.toutesOpportunites().map(function (o) {
      var x = cloner(o);
      var c = P.contact(o.prospectId);
      x.conseillerId = c ? c.conseillerId : null;
      x.completude = P.completude(o.qualification);
      x.etapeLibelle = P.libelleEtape(o.etape);
      x.horizonLibelle = P.libelle("horizons", (o.qualification || {}).horizon);
      x.rdvFutur = rdvFuturs(o.id).length > 0;
      x.rdvContact = R.parOpportunite(o.id).some(function (r) { return r.statut !== "Planifie"; });
      x.nbSoumissions = S.parOpportunite(o.id).length;
      x.transactionEnCours = T ? !!T.enCoursPourOpportunite(o.id) : false;
      x.recommandation = rel ? rel.recommandationsParOpp[o.id] || null : null;
      x.provenance = OV ? OV.provenance(o.id) : null;
      return x;
    });
    var soumissions = S.liste().map(function (s) {
      var v = S.versionCourante(s);
      var st = statutVehicule(v.vehicule.id);
      var acceptee = s.versions.filter(function (x) { return x.statut === "Acceptee"; }).pop();
      var o = P.opportunite(s.opportuniteId);
      var x = {
        id: s.id, reference: s.reference, prospectId: s.prospectId, opportuniteId: s.opportuniteId, conseillerId: s.conseillerId,
        courante: { numero: v.numero, statut: v.statut, date: v.date, dateModification: v.dateModification, dateValidite: v.offre.dateValidite,
          vehiculeId: v.vehicule.id, vehiculeNom: S.nomVehicule(v.vehicule), vehiculeStatut: st, vehiculeStatutLibelle: st ? S.libelleStatutVehicule(st).toLowerCase() : "inconnu",
          montant: C ? P.argent(Math.round(C.calculer(v.offre, S.parametres).totalEstime) / 100) : null },
        acceptee: acceptee ? { numero: acceptee.numero, date: acceptee.dateModification || acceptee.date, vehiculeNom: S.nomVehicule(acceptee.vehicule) } : null,
        transaction: T ? T.parOpportunite(s.opportuniteId).some(function (t) { return t.statut !== "Annulee"; }) : false,
      };
      if (["Vendu", "Livre"].indexOf(st) >= 0 && o) {
        x.alternatives = M.classer(criteresOpp(o), S.inventaire().filter(function (iv) { return iv.id !== v.vehicule.id; }), ref, { statut: function (iv) { return statutVehicule(iv.id); }, retenuPar: function (iv) { return retenuPar(iv.id, o.id); } })
          .filter(function (r) { return r.niveau === "compatible" || r.niveau === "partiel"; }).slice(0, 3)
          .map(function (r) { return nomVehiculeInv(S.vehicule(r.vehiculeId)) + (r.score != null ? " (" + r.score + " %)" : ""); });
      }
      return x;
    });
    var rendezVous = R ? R.liste().map(function (r) {
      var acts = R.actionsRequises(r);
      var textes = {};
      acts.forEach(function (a) { textes[a.code] = a.texte; });
      var cles = (R.estEssai(r) ? R.ref.checklistEssai : R.ref.checklistPreparation).map(function (x) { return x.cle; });
      var res = r.resultat ? cloner(r.resultat) : null;
      if (res) {
        res.resultatLibelle = R.libelle("resultats", res.resultat) || res.resultat;
        res.actionLibelle = R.libelle("prochainesActions", res.prochaineAction) || res.prochaineAction || "";
      }
      var v = r.vehiculeId ? S.vehicule(r.vehiculeId) : null;
      return {
        id: r.id, prospectId: r.prospectId, opportuniteId: r.opportuniteId, conseillerId: r.conseillerId, type: r.type, typeLibelle: R.type(r.type).libelle,
        statut: r.statut, statutLibelle: R.statut(r.statut).libelle, debut: r.debut, fin: R.fin(r).toISOString(), creneau: R.creneauTexte(r).toLowerCase(),
        actif: R.estActif(r), dateCreation: r.dateCreation, codes: acts.map(function (a) { return a.code; }), textes: textes,
        checklistTotal: cles.length, checklistFaits: cles.filter(function (k) { return r.checklist && r.checklist[k]; }).length,
        resultat: res, vehiculeNom: nomVehiculeInv(v),
        rdvSuivant: R.parOpportunite(r.opportuniteId).some(function (x) { return x.id !== r.id && new Date(x.debut) > new Date(r.debut) && ["Annule", "ClientAbsent"].indexOf(x.statut) < 0; }),
      };
    }) : [];
    var transactions = T ? T.liste().map(function (t) {
      var a = T.analyse(t);
      var liv = T.rdvLivraison(t);
      suivreBlocages(t, a);
      return {
        id: t.id, reference: t.reference, prospectId: t.prospectId, opportuniteId: t.opportuniteId, conseillerId: t.conseillerId, statut: t.statut, analyse: a,
        rdvLivraison: liv ? { debut: liv.debut, texte: R.creneauTexte(liv).toLowerCase() } : null, vehiculeNom: T.nomVehicule(t), modeLibelle: T.ref.modesAchat[t.modeAchat],
        dateCreation: t.dateCreation, dernierEvenement: (t.historique || []).length ? t.historique[t.historique.length - 1].date : t.dateCreation,
        blocagesResolus: etat.resolus[t.id] || [],
      };
    }) : [];
    return {
      maintenant: m, ref: ref, moiId: P.moiId, contacts: P.contacts(), opportunites: opps, interactions: toutesInteractions(), typesContact: P.typesContact(),
      soumissions: soumissions, rendezVous: rendezVous, transactions: transactions,
      preferences: etat.preferences, pauses: etat.pauses, correspondances: correspondances(), relations: rel,
    };
  }
  // Ancienne demande (opportunité perdue) × inventaire : véhicules compatibles et disponibles, mêmes règles de matching.
  function correspondancesPerte(c) {
    var o = P.opportunite(c.opportuniteId);
    if (!o) return [];
    return M.classer(criteresOpp(o), S.inventaire(), ref, { statut: function (v) { return statutVehicule(v.id); }, retenuPar: function (v) { return retenuPar(v.id, o.id); } })
      .filter(function (r) { return r.niveau === "compatible" && r.disponibilite.cle !== "indisponible"; }).slice(0, 3)
      .map(function (r) {
        return { vehiculeId: r.vehiculeId, vehiculeNom: S.nomVehicule(S.vehicule(r.vehiculeId)), score: r.score, couverture: r.couverture, depuis: etat.arrivees[r.vehiculeId] || null,
          disponibilite: r.disponibilite.cle === "disponible" ? null : r.disponibilite.texte,
          ecarts: r.items.filter(function (i) { return i.statut === "non-satisfait"; }).map(function (i) { return i.libelle; }),
          inconnus: r.inconnus.map(function (i) { return i.libelle; }) };
      });
  }

  // Mémoire des blocages vus : un blocage qui disparaît devient « récemment résolu ».
  function suivreBlocages(t, a) {
    if (T && !T.estActive(t)) return;
    var actuels = a.elements.filter(function (e) { return e.niveau === "critique" || e.niveau === "attente"; }).map(function (e) { return { code: e.code, libelle: e.etapeLibelle }; });
    var vus = etat.blocagesVus[t.id] || [];
    vus.forEach(function (v) {
      if (actuels.some(function (x) { return x.code === v.code; })) return;
      etat.resolus[t.id] = (etat.resolus[t.id] || []).filter(function (r) { return r.code !== v.code; });
      etat.resolus[t.id].push({ code: v.code, libelle: v.libelle, le: iso() });
    });
    etat.blocagesVus[t.id] = actuels;
  }

  // Demandes de recherche actives × inventaire : correspondances compatibles et disponibles.
  function correspondances() {
    var l = [];
    etat.demandes.forEach(function (dm) {
      if (["Active", "CorrespondanceTrouvee"].indexOf(dm.statut) < 0) return;
      var o = P.opportunite(dm.opportuniteId);
      if (!o || ["Gagne", "Perdu"].indexOf(o.etape) >= 0) return;
      S.inventaire().forEach(function (v) {
        var r = M.comparer(M.depuisDemande(dm), v, ref, { statut: statutVehicule(v.id), retenuPar: retenuPar(v.id, dm.opportuniteId) });
        if (r.niveau !== "compatible" || r.disponibilite.cle === "indisponible") return;
        l.push({ demandeId: dm.id, prospectId: o.prospectId, opportuniteId: o.id, vehiculeId: v.id, vehiculeNom: S.nomVehicule(v), score: r.score, couverture: r.couverture,
          horizon: dm.horizon, depuis: etat.arrivees[v.id] || null,
          raisons: r.satisfaits.map(function (i) { return "✓ " + i.detail; }).concat(r.inconnus.map(function (i) { return "? " + i.libelle + " : " + i.detail; })).concat([r.disponibilite.texte]) });
      });
    });
    return l;
  }

  // ---------- Recalcul et réconciliation ----------
  function historiser(a, vers, texte, extra) {
    a.historique = a.historique || [];
    var h = { date: iso(), de: a.statut || null, vers: vers, texte: texte, auteur: extra && extra.auteur || charge.conseillerNom };
    a.historique.push(h);
    a.statut = vers;
  }
  function recalculer() {
    if (enCalcul) return;
    enCalcul = true;
    try {
      resultat = Regles.analyser(instantane());
      var vus = {};
      var maintenant = new Date();
      resultat.actions.forEach(function (x) {
        vus[x.id] = true;
        var a = etat.actions[x.id];
        if (!a) {
          a = etat.actions[x.id] = { statut: null, detecteLe: iso(), historique: [] };
          historiser(a, "ATraiter", "Détectée : " + x.motif, { auteur: "Phineas" });
        } else if (a.statut === "Reportee" && a.reporteJusqua && new Date(a.reporteJusqua) <= maintenant) {
          historiser(a, "ATraiter", "Report échu : l'action revient dans la file.", { auteur: "Phineas" });
          a.reporteJusqua = null;
        } else if (a.statut === "Obsolete") {
          historiser(a, "ATraiter", "Situation de nouveau détectée.", { auteur: "Phineas" });
        }
        a.snapshot = { titre: x.regleLibelle, client: x.client, categorie: x.categorie, motif: x.motif, prospectId: x.prospectId, opportuniteId: x.opportuniteId, objet: x.objet, regle: x.regle };
      });
      if (!etat.semences) appliquerSemences();
      Object.keys(etat.actions).forEach(function (id) {
        var a = etat.actions[id];
        if (vus[id] || ["ATraiter", "EnCours", "Reportee"].indexOf(a.statut) < 0) return;
        historiser(a, "Obsolete", "Situation résolue ou plus pertinente : l'action est retirée de la file.", { auteur: "Phineas" });
        a.obsoleteLe = iso();
      });
      ecrire();
    } finally {
      enCalcul = false;
    }
    abonnes.forEach(function (f) { f(); });
  }
  // États de démonstration (reportée, terminée, transférée, obsolète) désignés par règle et objet.
  function appliquerSemences() {
    (d.etatsActions || []).forEach(function (s) {
      var x = resultat.actions.filter(function (a) { return a.regle === s.regle && a.objet && a.objet.id === s.objetId; })[0];
      var id = x ? x.id : s.regle + ":" + s.objetId + ":demo";
      var a = etat.actions[id] || (etat.actions[id] = { statut: null, detecteLe: s.date, historique: [] });
      if (!x) a.snapshot = { titre: refRegles[s.regle].libelle, client: nomClientObjet(s.objetId), categorie: refRegles[s.regle].categorie, motif: "Action de démonstration.", objet: { type: "", id: s.objetId }, regle: s.regle };
      var statut = s.statut;
      if (s.collegueId) {
        a.assignation = { collegueId: s.collegueId, collegue: P.conseiller(s.collegueId).nom, motif: s.motifTransfert, le: s.date, par: charge.conseillerNom };
        a.historique.push({ date: s.date, de: a.statut, vers: a.statut || "ATraiter", texte: "Prise en charge temporaire par " + a.assignation.collegue + " : " + (ref.motifsTransfert[s.motifTransfert] || s.motifTransfert).toLowerCase() + ".", auteur: charge.conseillerNom });
        statut = s.statut;
      }
      a.historique.push({ date: s.date, de: a.statut, vers: statut, texte: libelleTransition(statut, s), auteur: charge.conseillerNom });
      a.statut = statut;
      if (s.reporteJusqua) a.reporteJusqua = s.reporteJusqua;
      if (s.motif) a.motif = s.motif;
      if (statut === "Terminee") a.termineeLe = s.date;
    });
    etat.semences = true;
  }
  function nomClientObjet(objetId) {
    var t = T && T.transaction(objetId), s = S.soumission(objetId), r = R && R.rdv(objetId), o = P.opportunite(objetId);
    var pid = t ? t.prospectId : s ? s.prospectId : r ? r.prospectId : o ? o.prospectId : null;
    var c = pid && P.contact(pid);
    return c ? c.prenom + " " + c.nom : "";
  }
  function libelleTransition(statut, s) {
    if (statut === "Reportee") return "Reportée au " + new Date(s.reporteJusqua).toLocaleDateString("fr-CA") + (s.motif ? " : " + s.motif : "") + ".";
    if (statut === "Terminee") return "Marquée comme réalisée.";
    if (statut === "Ignoree") return "Ignorée" + (s.motif ? " : " + (ref.motifsIgnorer[s.motif] || s.motif).toLowerCase() : "") + ".";
    if (statut === "EnCours") return "Traitement commencé.";
    return "À traiter.";
  }

  function changer() {
    modifie = true;
    recalculer();
  }
  function surChangementExterne() {
    recalculer();
  }
  P.abonner(surChangementExterne);
  S.abonner(surChangementExterne);
  if (R) R.abonner(surChangementExterne);
  if (T) T.abonner(surChangementExterne);
  if (RC) RC.abonner(surChangementExterne);
  if (OV) OV.abonner(surChangementExterne);

  // ---------- Lecture ----------
  function enrichir(x) {
    var a = etat.actions[x.id] || {};
    var o = cloner(x);
    o.statut = a.statut || "ATraiter";
    // Veille enregistrée encore active : la recommandation quitte les priorités (statut « En veille »), sans être
    // terminée. À la fin prévue, elle revient d'elle-même si le moteur la produit toujours.
    var veille = Regles.veilleActive(veilles, x.id, new Date());
    o.veille = null;
    if (veille) {
      o.statut = "EnVeille";
      o.veille = { depuis: veille.depuis, jusqua: veille.jusqua };
    }
    o.reporteJusqua = a.reporteJusqua || null;
    o.motifEtat = a.motif || null;
    o.assignation = a.assignation || null;
    o.historique = a.historique || [];
    o.detecteLe = o.detecteLe || a.detecteLe;
    return o;
  }
  function toutes() {
    return resultat.actions.map(enrichir);
  }
  // Recommandations présentées : celles en veille enregistrée sont écartées par Regles.separerVeilles (par identifiant).
  function actives(options) {
    options = options || {};
    var presentees = Regles.separerVeilles(resultat.actions, veilles, new Date()).presentees;
    return presentees.map(enrichir).filter(function (a) {
      return ACTIVES.indexOf(a.statut) >= 0 && (!options.conseiller || a.conseillerId === options.conseiller);
    });
  }
  function action(id) {
    var x = resultat.actions.filter(function (a) { return a.id === id; })[0];
    if (x) return enrichir(x);
    var a = etat.actions[id];
    if (!a) return null;
    var s = a.snapshot || {};
    return { id: id, regle: s.regle, regleLibelle: s.titre, client: s.client, categorie: s.categorie, motif: s.motif, prospectId: s.prospectId, opportuniteId: s.opportuniteId,
      objet: s.objet, statut: a.statut, historique: a.historique || [], assignation: a.assignation || null, horsFile: true, priorite: "Faible", raisonsPriorite: [], contexte: [] };
  }
  // Recommandations en veille enregistrée (encore produites par le moteur), du conseiller s'il est précisé. Une veille
  // dont la recommandation n'existe plus (situation résolue) n'est pas listée : elle ne revient jamais artificiellement.
  function enVeille(conseiller) {
    var mises = Regles.separerVeilles(resultat.actions, veilles, new Date()).enVeille;
    return mises.map(enrichir).filter(function (a) {
      return !conseiller || a.conseillerId === conseiller;
    });
  }
  // Actions hors de la file active (reportées, terminées, ignorées, obsolètes), y compris celles qui ne sont plus détectées.
  function horsFile(statut) {
    return Object.keys(etat.actions).filter(function (id) { return etat.actions[id].statut === statut; }).map(action);
  }
  function parProspect(pid) {
    return actives().filter(function (a) { return a.prospectId === pid; });
  }
  function parObjet(type, id) {
    return actives().filter(function (a) { return a.objet && a.objet.type === type && a.objet.id === id; });
  }
  function aujourdhui(d0) {
    return d0 && new Date(d0).toDateString() === new Date().toDateString();
  }
  // Chiffres du Centre d'actions et compteur de la barre latérale. « À traiter », « prioritaires », « échéance sous
  // 24 h » et « en retard » comptent des OBLIGATIONS (Regles.regrouperObligations : une prise de contact regroupée compte
  // une fois, avec sa priorité la plus haute et son échéance la plus proche). « Terminées aujourd'hui » et « reportées »
  // comptent des recommandations traitées localement dans ce navigateur. « En veille » compte les veilles enregistrées :
  // ni à traiter, ni terminées (une veille n'est pas une réalisation).
  function compteurs(conseiller) {
    var c = Regles.compterObligations(actives({ conseiller: conseiller }), new Date());
    return {
      aTraiter: c.aTraiter,
      recommandations: c.recommandations,
      prioritaires: c.prioritaires,
      echeance: c.echeance,
      retard: c.retard,
      terminees: Object.keys(etat.actions).filter(function (id) { var a = etat.actions[id]; return a.statut === "Terminee" && aujourdhui(a.termineeLe); }).length,
      reportees: horsFile("Reportee").length,
      enVeille: enVeille(conseiller).length,
    };
  }

  // ---------- Veille enregistrée (fonctionnalité 14) ----------
  // Formulaire envoyé à IntelligenceController.MettreEnVeille : identifiant de la recommandation, durée en jours et
  // étape affichée de l'opportunité (le serveur refuse si elle a changé). La page revient avec le message du serveur.
  function envoyerVeille(id, jours, retour) {
    var x = action(id);
    var o = x ? P.opportunite(x.opportuniteId) : null;
    if (!o || !ref.urlMettreEnVeille) return false;
    P.posterFormulaire(ref.urlMettreEnVeille, { cle: id, jours: String(jours), etape: o.etape, retour: retour });
    return true;
  }
  // Formulaire envoyé à IntelligenceController.ReactiverVeille.
  function envoyerReactivation(id, retour) {
    if (!ref.urlReactiverVeille) return false;
    P.posterFormulaire(ref.urlReactiverVeille, { cle: id, retour: retour });
    return true;
  }
  function urlObjet(a) {
    var o = a.objet || {};
    var u = RC ? RC.urlObjet(o, a) : null;
    if (u) return u;
    if (o.type === "soumission") return S.urlDetail(o.id);
    if (o.type === "rendezvous" && R) return R.urlDetail(o.id);
    if (o.type === "transaction" && T) return T.urlDetail(o.id);
    return a.prospectId ? P.urlFiche(a.prospectId) : "#";
  }

  // ---------- Cycle de vie (actions du conseiller, locales) ----------
  function transition(id, vers, texte, patch) {
    var a = etat.actions[id];
    if (!a) return null;
    var avant = cloner(a);
    historiser(a, vers, texte);
    Object.keys(patch || {}).forEach(function (k) { a[k] = patch[k]; });
    changer();
    return function () {
      etat.actions[id] = avant;
      changer();
    };
  }
  function commencer(id) {
    var a = etat.actions[id];
    if (!a || a.statut !== "ATraiter") return null;
    return transition(id, "EnCours", "Traitement commencé.");
  }
  // Terminer : l'action ne réapparaît que si un nouvel événement pertinent produit un nouvel identifiant.
  function terminer(id, note) {
    var a = etat.actions[id];
    var x = action(id);
    if (!a || ACTIVES.indexOf(a.statut) < 0) return null;
    var nbI = x && x.prospectId ? P.interactionsDe(x.prospectId).length : 0;
    var annuler = transition(id, "Terminee", "Marquée comme réalisée" + (note ? " : " + note : "") + ".", { termineeLe: iso() });
    if (x && x.prospectId && P.contact(x.prospectId)) P.ajouterNote(x.prospectId, { type: "action", opportuniteId: x.opportuniteId, resume: "Action réalisée : " + x.regleLibelle.toLowerCase() + (note ? " — " + note : "") + "." });
    return function () {
      annuler();
      if (x && x.prospectId) while (P.interactionsDe(x.prospectId).length > nbI) P.retirerDerniereInteraction(x.prospectId);
    };
  }
  function reporter(id, date, motif) {
    var a = etat.actions[id];
    if (!a || ACTIVES.indexOf(a.statut) < 0 || !date || new Date(date) <= new Date()) return null;
    return transition(id, "Reportee", "Reportée au " + new Date(date).toLocaleDateString("fr-CA") + (motif ? " : " + motif : "") + ".", { reporteJusqua: new Date(date).toISOString() });
  }
  function ignorer(id, motif) {
    var a = etat.actions[id];
    if (!a || ACTIVES.indexOf(a.statut) < 0) return null;
    return transition(id, "Ignoree", "Ignorée" + (motif ? " : " + (ref.motifsIgnorer[motif] || motif).toLowerCase() : "") + ".", { motif: motif || null });
  }
  function reactiver(id) {
    var a = etat.actions[id];
    if (!a || ["Reportee", "Ignoree"].indexOf(a.statut) < 0 || !resultat.actions.some(function (x) { return x.id === id; })) return null;
    return transition(id, "ATraiter", "Remise dans la file par le conseiller.", { reporteJusqua: null });
  }
  // Continuité : prise en charge temporaire par un collègue. La propriété commerciale du prospect ne change pas.
  function transferer(id, collegueId, motif) {
    var a = etat.actions[id];
    var c = P.conseiller(collegueId);
    if (!a || ACTIVES.indexOf(a.statut) < 0 || !collegueId || collegueId === P.moiId || !ref.motifsTransfert[motif]) return null;
    return transition(id, a.statut, "Prise en charge temporaire par " + c.nom + " : " + ref.motifsTransfert[motif].toLowerCase() + ". Le prospect reste attribué à " + charge.conseillerNom + ".",
      { assignation: { collegueId: collegueId, collegue: c.nom, motif: motif, le: iso(), par: charge.conseillerNom } });
  }
  function reprendreEnCharge(id) {
    var a = etat.actions[id];
    if (!a || !a.assignation) return null;
    return transition(id, a.statut, "Reprise en charge par " + charge.conseillerNom + " (fin de la prise en charge par " + a.assignation.collegue + ").", { assignation: null });
  }
  // Actions à couvrir avant une date de retour : échéance avant cette date et non déjà prises en charge.
  function aCouvrirAvant(date) {
    var limite = new Date(date);
    return actives({ conseiller: P.moiId }).filter(function (a) { return !a.assignation && (!a.echeance || new Date(a.echeance) <= limite) && (a.priorite === "Urgent" || a.priorite === "Eleve" || a.echeance); });
  }

  // ---------- Relances ----------
  function contexteRelance(id) {
    var x = action(id);
    if (!x) return null;
    var c = P.contact(x.prospectId);
    var o = P.opportunite(x.opportuniteId);
    var q = (o && o.qualification) || {};
    var soums = o ? S.parOpportunite(o.id) : [];
    var s = x.objet && x.objet.type === "soumission" ? S.soumission(x.objet.id) : soums[soums.length - 1] || null;
    var rdvs = R && o ? R.parOpportunite(o.id) : [];
    var rdv = x.objet && x.objet.type === "rendezvous" && R ? R.rdv(x.objet.id) : rdvs[rdvs.length - 1] || null;
    // Dernier contact déclaré avec le client (vue globale du prospect) ; une note interne ne l'est pas.
    var derniere = c ? Regles.contactsDeclares(P.interactionsDe(c.id), P.typesContact())[0] || null : null;
    var pref = etat.preferences[x.prospectId];
    var canal = c ? (P.libelle("moyensContact", c.contactPrefere) || "Non précisé") : "Non précisé";
    var coord = c ? (c.contactPrefere === "courriel" ? c.courriel : c.telephone) || c.telephone || c.courriel : null;
    var vehicule = x.vehicule || (s ? S.nomVehicule(S.versionCourante(s).vehicule) : null) || (o && P.resumeVehicule(o)) || null;
    var aVerifier = [];
    if (!coord) aVerifier.push("Coordonnée pour le moyen préféré");
    if (!vehicule) aVerifier.push("Véhicule concerné");
    if (!q.modeAchat) aVerifier.push("Mode d'achat envisagé");
    if (!derniere) aVerifier.push("Aucun contact déclaré avec le client");
    var utilisees = [
      { libelle: "Prénom du client", valeur: c ? c.prenom : null },
      { libelle: "Véhicule", valeur: vehicule },
      { libelle: "Soumission", valeur: s ? s.reference + " v" + S.versionCourante(s).numero + " (" + S.libelleStatut(S.statut(s)).toLowerCase() + ")" : null },
      { libelle: "Dernier rendez-vous", valeur: rdv ? R.type(rdv.type).libelle + " · " + R.creneauTexte(rdv).toLowerCase() + " (" + R.statut(rdv.statut).libelle.toLowerCase() + ")" : null },
      { libelle: "Préférences exprimées", valeur: (q.elementsDecision || []).map(function (k) { return P.libelle("elementsDecision", k); }).filter(Boolean).join(", ") || null },
      { libelle: "Dernier contact déclaré", valeur: derniere ? P.relatif(derniere.date) + " : " + derniere.resume : null },
      { libelle: "Prochaine action", valeur: o && o.prochaineAction ? o.prochaineAction : null },
      { libelle: "Moyen préféré", valeur: canal + (coord ? " · " + coord : "") },
    ];
    return { action: x, contact: c, opportunite: o, soumission: s, rdv: rdv, derniere: derniere, canal: canal, canalCle: c ? c.contactPrefere : null, coordonnee: coord, vehicule: vehicule,
      preference: pref || null, utilisees: utilisees, aVerifier: aVerifier, essai: rdv && rdv.resultat ? rdv.resultat : null };
  }

  // Modèles déterministes : uniquement des faits du dossier, sans urgence, rabais ni promesse de financement.
  var OUVERTURES = {
    professionnel: function (p) { return "Bonjour " + p + ","; },
    chaleureux: function (p) { return "Bonjour " + p + ", j'espère que vous allez bien."; },
    concis: function (p) { return "Bonjour " + p + ","; },
    informatif: function (p) { return "Bonjour " + p + ","; },
  };
  var FERMETURES = {
    professionnel: "Je reste à votre disposition pour toute question.",
    chaleureux: "N'hésitez pas à me faire signe, ce sera un plaisir d'en discuter avec vous.",
    concis: "Au plaisir de vous lire.",
    informatif: "Je peux vous transmettre toute information complémentaire utile à votre décision.",
  };
  function corps(ctx0, ton) {
    var x = ctx0.action, v = ctx0.vehicule ? "le " + ctx0.vehicule : "le véhicule dont nous avons parlé";
    var s = ctx0.soumission, e = ctx0.essai;
    var concis = ton === "concis";
    switch (x.relance) {
      case "premiere-reponse":
        return concis ? "Merci pour votre demande concernant " + v + ". Quand puis-je vous joindre ?"
          : "Merci pour votre demande concernant " + v + ". J'aimerais mieux comprendre ce que vous recherchez afin de vous proposer les options les plus adaptées. À quel moment puis-je vous joindre ?";
      case "soumission":
        return concis ? "Je reviens sur la proposition " + (s ? s.reference + " " : "") + "concernant " + v + ". Avez-vous des questions ?"
          : "Je voulais revenir sur la proposition " + (s ? s.reference + " " : "") + "concernant " + v + " que je vous ai transmise. Si vous avez des questions sur le prix, les options ou les différentes façons d'acheter, je serai disponible pour en discuter avec vous." +
            (ton === "informatif" && s ? "\nPour rappel, la proposition est valide jusqu'au " + P.dateCourte(S.versionCourante(s).offre.dateValidite) + "." : "");
      case "rdv-confirmation":
        return "Je vous écris pour confirmer notre rendez-vous " + (ctx0.rdv ? "(" + R.type(ctx0.rdv.type).libelle.toLowerCase() + ") " + R.creneauTexte(ctx0.rdv).toLowerCase() : "") + ". Pouvez-vous me confirmer votre présence ?";
      case "rdv-absent":
        return "Nous devions nous voir " + (ctx0.rdv ? R.creneauTexte(ctx0.rdv).toLowerCase() : "récemment") + ". Si vous souhaitez toujours " + (ctx0.rdv && R.estEssai(ctx0.rdv) ? "faire l'essai de " + v : "en discuter") + ", je peux vous proposer un autre moment qui vous convient mieux.";
      case "essai":
        var points = [e && e.pointsAimes ? "vous aviez apprécié : " + e.pointsAimes.toLowerCase() : null, e && e.questions ? "vous vous posiez la question suivante : " + e.questions.replace(/\?$/, "") : null,
          e && e.objections ? "vous aviez mentionné : " + e.objections.replace(/\.$/, "").toLowerCase() : null].filter(Boolean);
        return "Merci encore pour l'essai de " + v + "." + (points.length ? " Lors de l'essai, " + points.join(" ; ") + "." : "") + (concis ? "" : " Je peux préparer les informations qui vous seraient utiles pour la suite.");
      case "transaction-client":
        return "Je vous donne des nouvelles de votre dossier pour " + v + ". " + (x.regle === "transaction-blocage-resolu" ? "Une étape vient d'avancer : " + x.contexte[0].replace(/^Étape débloquée : /, "").toLowerCase() + "." : x.motif) +
          (concis ? "" : " Je vous tiens informé de la suite.");
      case "correspondance":
        return "Un véhicule qui pourrait correspondre à votre recherche est arrivé chez nous : " + v + ". Souhaitez-vous que je vous en présente les caractéristiques ?";
      case "satisfaction":
        return concis ? "Comment se passent vos premiers jours avec votre " + (ctx0.vehicule || "véhicule") + " ?"
          : "Je voulais prendre de vos nouvelles depuis la livraison de votre " + (ctx0.vehicule || "véhicule") + ". Tout se passe-t-il comme vous le souhaitiez ? Si quelque chose ne vous convient pas, je m'en occupe avec l'équipe concernée.";
      case "perte-reprise":
        return "Lors de notre dernier échange, vous préfériez reporter votre projet" + (ctx0.opportunite ? " (" + ctx0.opportunite.titre.toLowerCase() + ")" : "") + " à cette période. Est-ce un bon moment pour en reparler ?" +
          (concis ? "" : " Vos besoins ont peut-être changé : j'en tiendrai compte.");
      case "perte-correspondance":
        return "Vous recherchiez" + (ctx0.opportunite ? " un " + ctx0.opportunite.titre.toLowerCase() : " un véhicule") + ". Un véhicule qui pourrait correspondre à vos critères est disponible : " + v + "." +
          (concis ? " Souhaitez-vous en savoir plus ?" : " Souhaitez-vous que je vous en présente les caractéristiques ? Je préfère vérifier avec vous qu'il répond bien à vos besoins.");
      case "reprise":
        return "Comme convenu, je reprends contact au sujet de votre projet" + (ctx0.opportunite ? " (" + ctx0.opportunite.titre.toLowerCase() + ")" : "") + ". Est-ce un bon moment pour en reparler ?";
      default:
        return concis ? "Je reviens vers vous au sujet de " + v + "." : "Je reviens vers vous au sujet de votre projet" + (ctx0.opportunite ? " (" + ctx0.opportunite.titre.toLowerCase() + ")" : "") + ". " + (ctx0.opportunite && ctx0.opportunite.prochaineAction ? "Comme prévu : " + ctx0.opportunite.prochaineAction.charAt(0).toLowerCase() + ctx0.opportunite.prochaineAction.slice(1) + "." : "");
    }
  }
  function brouillon(id, ton) {
    var ctx0 = contexteRelance(id);
    if (!ctx0) return "";
    ton = OUVERTURES[ton] ? ton : "professionnel";
    var prenom = ctx0.contact ? ctx0.contact.prenom : "";
    return OUVERTURES[ton](prenom) + "\n\n" + corps(ctx0, ton) + "\n\n" + FERMETURES[ton] + "\n\n" + charge.conseillerNom;
  }
  // Conditions empêchant une sollicitation : renvoie le motif, ou null.
  function suspensionContact(prospectId, opportuniteId, nature, horsPipeline) {
    var pref = etat.preferences[prospectId];
    if (pref && (pref.nePlusContacter || pref.consentement === "retire") && nature !== "dossier") return "Le client a demandé à ne plus être sollicité.";
    var p = etat.pauses[opportuniteId];
    if (p && new Date(p.jusqua) > new Date() && nature !== "dossier") return P.terminerPhrase("Suivi en pause jusqu'au " + P.dateCourte(p.jusqua));
    var o = P.opportunite(opportuniteId);
    if (o && ["Gagne", "Perdu"].indexOf(o.etape) >= 0 && !horsPipeline) return "L'opportunité est clôturée.";
    return null;
  }
  // Brouillon enregistré : identifié comme brouillon, ne compte pas comme un contact.
  function enregistrerBrouillon(id, texte) {
    var x = action(id);
    if (!x || !String(texte || "").trim()) return null;
    var nb = P.interactionsDe(x.prospectId).length;
    P.ajouterNote(x.prospectId, { type: "brouillon", opportuniteId: x.opportuniteId, resume: "Brouillon de relance préparé (non envoyé) : « " + String(texte).trim().slice(0, 160) + (String(texte).trim().length > 160 ? "…" : "") + " »" });
    return function () { while (P.interactionsDe(x.prospectId).length > nb) P.retirerDerniereInteraction(x.prospectId); };
  }
  // Contact déclaré explicitement par le conseiller (fait hors Phineas) : compte comme un échange et termine l'action.
  // Dossier enregistré : refusé, le contact se déclare par une note de la fiche (enregistrée en base), jamais ici en local.
  function declarerContact(id, canal, resume) {
    var x = action(id);
    if (x && P.estEnregistree(x.opportuniteId || "")) return null;
    var raison = x && suspensionContact(x.prospectId, x.opportuniteId, x.nature, x.categorie === "relations");
    if (!x || raison) return null;
    var nb = P.interactionsDe(x.prospectId).length;
    var types = { telephone: "appel", courriel: "courriel", texto: "texto" };
    // L'action est terminée AVANT l'ajout de l'échange : sinon le recalcul déclenché par l'échange la classerait
    // « devenue obsolète » au lieu de « terminée ».
    var annulerAction = etat.actions[id] && ACTIVES.indexOf(etat.actions[id].statut) >= 0 ? transition(id, "Terminee", "Contact déclaré par le conseiller.", { termineeLe: iso() }) : null;
    P.ajouterNote(x.prospectId, { type: types[canal] || "note", opportuniteId: x.opportuniteId, resume: "Relance effectuée par " + (P.libelle("moyensContact", canal) || canal).toLowerCase() + " (déclarée par le conseiller)" + (resume ? " : " + resume : "") + "." });
    return function () {
      while (P.interactionsDe(x.prospectId).length > nb) P.retirerDerniereInteraction(x.prospectId);
      if (annulerAction) annulerAction();
    };
  }
  function programmerSuivi(id, date, texte) {
    var x = action(id);
    if (!x || !x.opportuniteId || !date || !String(texte || "").trim()) return false;
    P.planifierSuivi(x.opportuniteId, String(texte).trim(), new Date(date));
    return true;
  }
  // Préférences de contact (déclarées par le conseiller) et pause du suivi.
  function definirPreferences(prospectId, patch) {
    var p = etat.preferences[prospectId] || (etat.preferences[prospectId] = { prospectId: prospectId, consentement: "inconnu", nePlusContacter: false, demandeArretLe: null, note: null });
    Object.keys(patch).forEach(function (k) { p[k] = patch[k]; });
    if (patch.nePlusContacter) p.demandeArretLe = iso();
    changer();
  }
  function mettreEnPause(oppId, jusqua, motif) {
    if (!oppId || !jusqua || new Date(jusqua) <= new Date()) return false;
    etat.pauses[oppId] = { jusqua: new Date(jusqua).toISOString(), motif: motif || "À la demande du client", depuis: iso() };
    changer();
    return true;
  }
  function leverPause(oppId) {
    delete etat.pauses[oppId];
    changer();
  }

  // ---------- Matching ----------
  function vehiculesPour(oppId, options) {
    var o = P.opportunite(oppId);
    if (!o) return [];
    return M.classer(criteresOpp(o), S.inventaire(), ref, { inclureIndisponibles: options && options.inclureIndisponibles, statut: function (v) { return statutVehicule(v.id); },
      retenuPar: function (v) { return retenuPar(v.id, oppId); } });
  }
  function prospectsPour(vehiculeId) {
    var v = S.vehicule(vehiculeId);
    if (!v) return [];
    var st = statutVehicule(v.id);
    var l = P.toutesOpportunites().filter(function (o) { return ["Gagne", "Perdu"].indexOf(o.etape) < 0; }).map(function (o) {
      var r = M.comparer(criteresOpp(o), v, ref, { statut: st, retenuPar: retenuPar(v.id, o.id) });
      r.opportunite = o;
      r.contact = P.contact(o.prospectId);
      r.suspension = suspensionContact(o.prospectId, o.id, "commerciale");
      return r;
    });
    return l.sort(function (a, b) {
      var ord = { compatible: 0, partiel: 1, "a-verifier": 2, incompatible: 3 };
      return ord[a.niveau] - ord[b.niveau] || (b.score || 0) - (a.score || 0) || b.couverture - a.couverture;
    });
  }
  function indispensables(oppId) {
    return (etat.indispensables[oppId] || []).slice();
  }
  function basculerIndispensable(oppId, groupe) {
    var l = etat.indispensables[oppId] = etat.indispensables[oppId] || [];
    var i = l.indexOf(groupe);
    if (i >= 0) l.splice(i, 1); else l.push(groupe);
    changer();
  }

  // ---------- Demandes de recherche et arrivées simulées ----------
  function demandes() {
    return etat.demandes;
  }
  function creerDemande(x) {
    if (!x.opportuniteId || !P.opportunite(x.opportuniteId)) return null;
    var dm = { id: "dm-local-" + Date.now().toString(36), opportuniteId: x.opportuniteId, categorie: x.categorie || null, budgetMax: x.budgetMax ? Number(x.budgetMax) : null,
      marques: x.marques || [], caracteristiques: x.caracteristiques || [], places: x.places ? Number(x.places) : null, etat: x.etat || null,
      anneeMin: x.anneeMin ? Number(x.anneeMin) : null, kilometrageMax: x.kilometrageMax ? Number(x.kilometrageMax) : null, indispensables: x.indispensables || [],
      alternatives: x.alternatives || null, horizon: (P.opportunite(x.opportuniteId).qualification || {}).horizon || null, statut: "Active", conseillerId: P.moiId, dateCreation: iso() };
    etat.demandes.push(dm);
    P.ajouterNote(P.opportunite(x.opportuniteId).prospectId, { type: "note", opportuniteId: x.opportuniteId, resume: "Demande de recherche enregistrée (véhicule non disponible en inventaire)." });
    changer();
    return dm;
  }
  function changerStatutDemande(id, statut) {
    var dm = etat.demandes.filter(function (x) { return x.id === id; })[0];
    if (!dm || !ref.statutsDemande[statut] || dm.statut === statut) return null;
    var avant = dm.statut;
    dm.statut = statut;
    changer();
    return function () { dm.statut = avant; changer(); };
  }
  function vehiculesSimules() {
    return (d.vehiculesSimules || []).map(function (x) { return { vehicule: x.vehicule, evenement: x.evenement, arrive: !!S.vehicule(x.vehicule.id) }; });
  }
  // Arrivée fictive : le véhicule rejoint l'inventaire partagé de l'onglet, puis le moteur réévalue les demandes.
  function simulerArrivee(vehiculeId) {
    var x = (d.vehiculesSimules || []).filter(function (v) { return v.vehicule.id === vehiculeId; })[0];
    if (!x || S.vehicule(vehiculeId) || !S.ajouterVehiculeSimule) return null;
    // Liste « avant » relevée AVANT l'ajout : l'ajout à l'inventaire déclenche lui-même un recalcul.
    var avant = resultat.actions.map(function (a) { return a.id; });
    etat.arrivees[vehiculeId] = iso();
    S.ajouterVehiculeSimule(cloner(x.vehicule));
    changer();
    return resultat.actions.filter(function (a) { return avant.indexOf(a.id) < 0 && a.regle === "nouvelle-correspondance"; });
  }

  function reinitialiser() {
    try {
      window.sessionStorage.removeItem(CLE);
    } catch (e) {}
    etat = initial();
    modifie = false;
    recalculer();
  }

  window.Intelligence = {
    ref: ref,
    abonner: function (f) { abonnes.push(f); },
    recalculer: recalculer,
    // lecture
    toutes: toutes,
    actives: actives,
    action: action,
    horsFile: horsFile,
    enVeille: enVeille,
    envoyerVeille: envoyerVeille,
    envoyerReactivation: envoyerReactivation,
    suspendues: function () { return resultat.suspendues.slice(); },
    surveillance: function () { return actives().filter(function (a) { return a.monitor; }); },
    parProspect: parProspect,
    parObjet: parObjet,
    compteurs: compteurs,
    urlObjet: urlObjet,
    regle: function (cle) { return refRegles[cle]; },
    // cycle de vie
    commencer: commencer,
    terminer: terminer,
    reporter: reporter,
    ignorer: ignorer,
    reactiver: reactiver,
    transferer: transferer,
    reprendreEnCharge: reprendreEnCharge,
    aCouvrirAvant: aCouvrirAvant,
    // relances
    contexteRelance: contexteRelance,
    brouillon: brouillon,
    suspensionContact: suspensionContact,
    enregistrerBrouillon: enregistrerBrouillon,
    declarerContact: declarerContact,
    programmerSuivi: programmerSuivi,
    preferences: function (pid) { return etat.preferences[pid] || null; },
    pause: function (oppId) { return etat.pauses[oppId] || null; },
    definirPreferences: definirPreferences,
    mettreEnPause: mettreEnPause,
    leverPause: leverPause,
    // matching
    vehiculesPour: vehiculesPour,
    prospectsPour: prospectsPour,
    comparer: function (oppId, vehiculeId) { var o = P.opportunite(oppId), v = S.vehicule(vehiculeId); return o && v ? M.comparer(criteresOpp(o), v, ref, { statut: statutVehicule(v.id), retenuPar: retenuPar(v.id, oppId) }) : null; },
    retenuPar: retenuPar,
    indispensables: indispensables,
    basculerIndispensable: basculerIndispensable,
    statutVehicule: statutVehicule,
    // demandes
    demandes: demandes,
    creerDemande: creerDemande,
    changerStatutDemande: changerStatutDemande,
    vehiculesSimules: vehiculesSimules,
    simulerArrivee: simulerArrivee,
  };

  P.enregistrerModule({ estModifie: function () { return modifie; }, reinitialiser: reinitialiser });
  recalculer();
})();
