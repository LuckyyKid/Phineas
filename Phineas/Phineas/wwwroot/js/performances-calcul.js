// Mes performances commerciales — calculs statistiques centralisés (prototype frontend, phase 08).
// Fonctions pures, indépendantes du DOM, utilisables dans Node. Elles lisent un instantané des stores existants
// (prospects, soumissions, rendez-vous, transactions, provenance) ; les statistiques relationnelles restent celles de la
// phase 07 (relations-regles.js), sans second moteur.
//
// Règles : une vente est comptée une seule fois par opportunité (quel que soit le nombre de soumissions ou de
// transactions) ; une valeur inconnue n'est jamais transformée en zéro ; un taux sans dénominateur est « non disponible ».
(function (racine) {
  "use strict";

  var JOUR = 86400000, HEURE = 3600000;
  var ACTIVES = ["Nouveau", "AQualifier", "Qualifie", "Soumission", "EssaiRoutier", "Negociation", "Finalisation"];
  var QUALIFIEES = ["Qualifie", "Soumission", "EssaiRoutier", "Negociation", "Finalisation", "Gagne"];
  var ECHANGES = ["appel", "courriel", "visite", "texto", "relance", "note"];
  var ENVOYEES = ["Envoyee", "EnAttente", "Acceptee", "Refusee", "Expiree"];

  // ---------- Valeurs qualifiées ----------
  // statut : "observe" (valeur mesurée, y compris zéro), "non-disponible" (pas de données), "non-applicable".
  function obs(valeur, note) { return { valeur: valeur, statut: "observe", note: note || null }; }
  function nd(note) { return { valeur: null, statut: "non-disponible", note: note || "Données insuffisantes." }; }
  function na(note) { return { valeur: null, statut: "non-applicable", note: note || null }; }
  function taux(num, den, note) {
    return den ? obs(Math.round(num / den * 100), num + " sur " + den + (note ? " — " + note : "")) : nd("Dénominateur nul : aucune observation pour calculer ce taux.");
  }
  function moyenne(l, unite) {
    if (!l.length) return nd("Aucune observation.");
    var m = l.reduce(function (s, v) { return s + v; }, 0) / l.length;
    return obs(Math.round(m * 10) / 10, l.length + " observation(s)" + (unite ? " — en " + unite : ""));
  }
  function mediane(l) {
    if (!l.length) return nd("Aucune observation.");
    var t = l.slice().sort(function (a, b) { return a - b; }), k = Math.floor(t.length / 2);
    return obs(Math.round((t.length % 2 ? t[k] : (t[k - 1] + t[k]) / 2) * 10) / 10, l.length + " observation(s)");
  }
  function dansPeriode(date, periode, m) {
    if (!date) return false;
    var d = new Date(date);
    if (isNaN(d)) return false;
    return d <= m && (!periode || (m - d) / JOUR <= periode);
  }
  function uniques(l, cle) {
    var vus = {};
    return l.filter(function (x) { var k = x[cle || "id"]; if (vus[k]) return false; vus[k] = true; return true; });
  }

  // ---------- Préparation de l'instantané ----------
  // s : { maintenant, periode, moi, contacts, opportunites, interactions, soumissions, rendezVous, transactions, attributions, recommandations }
  function preparer(s) {
    var m = s.maintenant ? new Date(s.maintenant) : new Date();
    var mesContacts = {};
    s.contacts.forEach(function (c) { if (!s.moi || c.conseillerId === s.moi) mesContacts[c.id] = c; });
    var opps = uniques(s.opportunites).filter(function (o) { return mesContacts[o.prospectId]; });
    var parOpp = function (l) { var x = {}; l.forEach(function (e) { (x[e.opportuniteId] = x[e.opportuniteId] || []).push(e); }); return x; };
    return {
      m: m, periode: s.periode || null, contacts: mesContacts, opps: opps,
      soumParOpp: parOpp(s.soumissions), rdvParOpp: parOpp(s.rendezVous), trxParOpp: parOpp(s.transactions),
      soumissions: s.soumissions.filter(function (x) { return !s.moi || x.conseillerId === s.moi; }),
      rendezVous: s.rendezVous.filter(function (x) { return !s.moi || x.conseillerId === s.moi; }),
      transactions: s.transactions.filter(function (x) { return !s.moi || x.conseillerId === s.moi; }),
      interactions: s.interactions, attributions: s.attributions || [], recommandations: s.recommandations || [],
    };
  }
  function venteConclue(t) {
    return t.statut !== "Annulee" && (t.statut === "Livree" || t.statut === "Cloturee" || t.administratifConfirme);
  }
  // Date de conclusion d'une opportunité gagnée : livraison confirmée, sinon dernière activité (signalée).
  function dateGagnee(o, p) {
    var t = (p.trxParOpp[o.id] || []).filter(function (x) { return x.livraison && x.livraison.confirmeeLe; })[0];
    return t ? t.livraison.confirmeeLe : o.etape === "Gagne" ? o.dateFermeture || o.derniereActivite : null;
  }
  function estGagnee(o, p) {
    return o.etape === "Gagne" || (p.trxParOpp[o.id] || []).some(function (t) { return t.statut === "Livree" || t.statut === "Cloturee"; });
  }

  // ---------- Section 1 : acquisition ----------
  function acquisition(s) {
    var p = preparer(s);
    var datesManquantes = 0;
    var cohorte = Object.keys(p.contacts).map(function (k) { return p.contacts[k]; }).filter(function (c) {
      if (!c.dateCreation) { datesManquantes++; return false; }
      return dansPeriode(c.dateCreation, p.periode, p.m);
    });
    var parSource = {};
    cohorte.forEach(function (c) { var k = c.source || "inconnue"; parSource[k] = (parSource[k] || 0) + 1; });
    var ids = cohorte.map(function (c) { return c.id; });
    var recos = uniques(p.recommandations.filter(function (r) { return !r.doublon && ids.indexOf(r.prospectId) >= 0; }), "prospectId");
    var annonces = uniques(p.attributions.filter(function (a) { return ids.indexOf(a.prospectId) >= 0 && (a.annonceId || a.lienId); }), "prospectId");
    var oppsCreees = p.opps.filter(function (o) { return dansPeriode(o.dateCreation, p.periode, p.m); });
    // Délai de première réponse : premier échange après la création ; une opportunité sans échange n'est pas un zéro.
    var delais = [], sansReponse = 0;
    oppsCreees.forEach(function (o) {
      var e = p.interactions.filter(function (i) {
        return i.prospectId === o.prospectId && (!i.opportuniteId || i.opportuniteId === o.id) && ECHANGES.indexOf(i.type) >= 0 && new Date(i.date) >= new Date(o.dateCreation);
      }).sort(function (a, b) { return new Date(a.date) - new Date(b.date); })[0];
      if (e) delais.push((new Date(e.date) - new Date(o.dateCreation)) / HEURE); else sansReponse++;
    });
    return {
      nouveaux: obs(cohorte.length), parSource: parSource, opportunitesCreees: obs(oppsCreees.length),
      recommandations: obs(recos.length), annonces: obs(annonces.length),
      sourcesInconnues: obs(parSource.inconnue || 0), sansAttribution: obs(cohorte.filter(function (c) { return !p.attributions.some(function (a) { return a.prospectId === c.id; }) && !recos.some(function (r) { return r.prospectId === c.id; }); }).length),
      delaiPremiereReponse: mediane(delais), delais: delais, sansReponse: sansReponse, datesManquantes: datesManquantes,
    };
  }

  // ---------- Section 2 : pipeline ----------
  function pipeline(s) {
    var p = preparer(s);
    var parEtape = {};
    p.opps.forEach(function (o) { parEtape[o.etape] = (parEtape[o.etape] || 0) + 1; });
    var gagnees = p.opps.filter(function (o) { return estGagnee(o, p) && dansPeriode(dateGagnee(o, p), p.periode, p.m); });
    var perdues = p.opps.filter(function (o) { return o.etape === "Perdu" && dansPeriode(o.dateFermeture || o.derniereActivite, p.periode, p.m); });
    var durees = gagnees.map(function (o) { return (new Date(dateGagnee(o, p)) - new Date(o.dateCreation)) / JOUR; }).filter(function (d) { return d >= 0; });
    return {
      actives: obs(p.opps.filter(function (o) { return ACTIVES.indexOf(o.etape) >= 0 && !estGagnee(o, p); }).length),
      parEtape: parEtape,
      gagnees: obs(gagnees.length), perdues: obs(perdues.length),
      // Taux de réussite : parmi les opportunités CLOSES pendant la période (gagnées ou perdues), part des gagnées.
      tauxReussite: taux(gagnees.length, gagnees.length + perdues.length, "opportunités closes pendant la période"),
      dureeCommerciale: moyenne(durees, "jours"),
    };
  }
  // Entonnoir de cohorte : opportunités CRÉÉES pendant la période ; chaque étape compte celles qui l'ont atteinte.
  function entonnoir(s) {
    var p = preparer(s);
    var cohorte = p.opps.filter(function (o) { return dansPeriode(o.dateCreation, p.periode, p.m); });
    function a(o, test) { return test(o) ? 1 : 0; }
    var etapes = [
      { cle: "prospects", libelle: "Opportunités créées", test: function () { return true; } },
      { cle: "qualifies", libelle: "Qualifiées", test: function (o) { return QUALIFIEES.indexOf(o.etape) >= 0 || (p.soumParOpp[o.id] || []).length > 0 || (p.trxParOpp[o.id] || []).length > 0; } },
      { cle: "soumissions", libelle: "Avec soumission", test: function (o) { return (p.soumParOpp[o.id] || []).length > 0; } },
      { cle: "rendezvous", libelle: "Avec rendez-vous tenu ou prévu", test: function (o) { return (p.rdvParOpp[o.id] || []).some(function (r) { return r.statut !== "Annule"; }); } },
      { cle: "transactions", libelle: "Avec transaction ouverte", test: function (o) { return (p.trxParOpp[o.id] || []).some(function (t) { return t.statut !== "Annulee"; }); } },
      { cle: "ventes", libelle: "Ventes conclues", test: function (o) { return o.etape === "Gagne" || (p.trxParOpp[o.id] || []).some(venteConclue); } },
    ];
    return etapes.map(function (e) {
      var n = cohorte.reduce(function (s0, o) { return s0 + a(o, e.test); }, 0);
      return { cle: e.cle, libelle: e.libelle, nombre: n, taux: e.cle === "prospects" ? null : taux(n, cohorte.length, "de la cohorte") };
    });
  }

  // ---------- Section 3 : soumissions ----------
  function soumissions(s) {
    var p = preparer(s);
    var l = p.soumissions.filter(function (x) { return dansPeriode(x.dateCreation, p.periode, p.m); });
    function a(x, statut) { return x.versions.some(function (v) { return v.statut === statut; }); }
    var envoyees = l.filter(function (x) { return x.versions.some(function (v) { return ENVOYEES.indexOf(v.statut) >= 0; }); });
    var acceptees = l.filter(function (x) { return a(x, "Acceptee"); });
    var refusees = l.filter(function (x) { return !a(x, "Acceptee") && a(x, "Refusee"); });
    var expirees = l.filter(function (x) { return !a(x, "Acceptee") && !a(x, "Refusee") && a(x, "Expiree"); });
    var delais = acceptees.concat(refusees).map(function (x) {
      var envoi = x.versions.filter(function (v) { return ENVOYEES.indexOf(v.statut) >= 0; })[0];
      var dec = x.versions.filter(function (v) { return v.statut === "Acceptee" || v.statut === "Refusee"; }).pop();
      return envoi && dec ? (new Date(dec.dateModification || dec.date) - new Date(envoi.date)) / JOUR : null;
    }).filter(function (d) { return d != null && d >= 0; });
    var oppsAcceptees = uniques(acceptees, "opportuniteId");
    return {
      creees: obs(l.length), envoyees: obs(envoyees.length), acceptees: obs(acceptees.length), refusees: obs(refusees.length), expirees: obs(expirees.length),
      opportunitesAvecPlusieurs: obs(Object.keys(p.soumParOpp).filter(function (k) { return p.soumParOpp[k].filter(function (x) { return l.indexOf(x) >= 0; }).length > 1; }).length),
      opportunitesAcceptees: obs(oppsAcceptees.length),
      // Taux d'acceptation : parmi les soumissions ayant reçu une réponse (acceptée, refusée ou expirée).
      tauxAcceptation: taux(acceptees.length, acceptees.length + refusees.length + expirees.length, "soumissions ayant reçu une réponse"),
      delaiReponse: moyenne(delais, "jours"),
    };
  }

  // ---------- Section 4 : rendez-vous ----------
  function rendezVous(s) {
    var p = preparer(s);
    // Rendez-vous de la période (passés) et rendez-vous à venir déjà planifiés.
    var l = p.rendezVous.filter(function (r) { return new Date(r.debut) > p.m || dansPeriode(r.debut, p.periode, p.m); });
    var passes = l.filter(function (r) { return new Date(r.debut) <= p.m; });
    var realises = passes.filter(function (r) { return r.statut === "Termine"; });
    var absences = passes.filter(function (r) { return r.statut === "ClientAbsent"; });
    var essais = l.filter(function (r) { return r.type === "EssaiRoutier"; });
    var resultats = {};
    essais.forEach(function (r) { if (r.resultat && r.resultat.resultat) resultats[r.resultat.resultat] = (resultats[r.resultat.resultat] || 0) + 1; });
    var prospects = uniques(l, "prospectId").length;
    return {
      planifies: obs(l.length), aVenir: obs(l.length - passes.length),
      confirmes: obs(l.filter(function (r) { return r.statut === "Confirme"; }).length),
      realises: obs(realises.length), absences: obs(absences.length), annules: obs(l.filter(function (r) { return r.statut === "Annule"; }).length),
      essais: obs(essais.length), resultatsEssais: resultats, prospectsDistincts: obs(prospects),
      // Taux de présence : parmi les rendez-vous passés dont l'issue est connue (réalisé ou absence).
      tauxPresence: taux(realises.length, realises.length + absences.length, "rendez-vous passés à l'issue connue"),
    };
  }

  // ---------- Section 5 : transactions ----------
  function transactions(s) {
    var p = preparer(s);
    var l = p.transactions;
    var livrees = l.filter(function (t) { return t.livraison && t.livraison.confirmeeLe && dansPeriode(t.livraison.confirmeeLe, p.periode, p.m); });
    var durees = livrees.map(function (t) { return (new Date(t.livraison.confirmeeLe) - new Date(t.dateCreation)) / JOUR; }).filter(function (d) { return d >= 0; });
    var blocages = {};
    l.filter(function (t) { return t.statut === "Active" || t.statut === "EnAttente"; }).forEach(function (t) {
      (t.blocages || []).forEach(function (b) { var k = b.departementLibelle || b.departement; blocages[k] = (blocages[k] || 0) + 1; });
    });
    return {
      ouvertes: obs(l.filter(function (t) { return t.statut === "Active" || t.statut === "EnAttente"; }).length),
      bloquees: obs(l.filter(function (t) { return (t.statut === "Active" || t.statut === "EnAttente") && (t.blocages || []).length; }).length),
      finalisees: obs(l.filter(function (t) { return t.statut === "Livree" || t.statut === "Cloturee"; }).length),
      annulees: obs(l.filter(function (t) { return t.statut === "Annulee"; }).length),
      livraisons: obs(livrees.length),
      dureeOuvertureLivraison: moyenne(durees, "jours"),
      typesBlocage: blocages,
    };
  }

  // ---------- Évolution : gagnées et perdues par semaine ----------
  function evolution(s, semaines) {
    var p = preparer(s);
    semaines = semaines || 8;
    var l = [];
    for (var k = semaines - 1; k >= 0; k--) {
      var fin = new Date(p.m.getTime() - k * 7 * JOUR), debut = new Date(fin.getTime() - 7 * JOUR);
      l.push({ debut: debut.toISOString(), fin: fin.toISOString(),
        gagnees: p.opps.filter(function (o) { var d = estGagnee(o, p) ? dateGagnee(o, p) : null; return d && new Date(d) > debut && new Date(d) <= fin; }).length,
        perdues: p.opps.filter(function (o) { var d = o.etape === "Perdu" ? o.dateFermeture || o.derniereActivite : null; return d && new Date(d) > debut && new Date(d) <= fin; }).length });
    }
    return l;
  }

  // ---------- Axes d'amélioration : constats descriptifs, jamais causaux ----------
  // x : compléments déjà calculés par les autres modules (actions du moteur, statistiques relationnelles).
  function axes(s, x) {
    var p = preparer(s);
    var c = [];
    if (x.rdvSansResultat) c.push({ cle: "rdv", n: x.rdvSansResultat, texte: x.rdvSansResultat + " rendez-vous passé(s) sans résultat enregistré.", lien: "actions" });
    var sansSuite = p.opps.filter(function (o) {
      if (ACTIVES.indexOf(o.etape) < 0 || o.prochaineAction) return false;
      return (p.soumParOpp[o.id] || []).some(function (s0) { var v = s0.versions[s0.versions.length - 1]; return v && (v.statut === "Envoyee" || v.statut === "EnAttente"); });
    });
    if (sansSuite.length) c.push({ cle: "soumissions", n: sansSuite.length, texte: sansSuite.length + " opportunité(s) avec une soumission envoyée et aucune prochaine action planifiée.", lien: "prospects" });
    if (x.qualifieesSansVehicule) c.push({ cle: "vehicule", n: x.qualifieesSansVehicule, texte: x.qualifieesSansVehicule + " opportunité(s) qualifiée(s) sans véhicule proposé.", lien: "actions" });
    (x.motifsFrequents || []).forEach(function (mf) { c.push({ cle: "perte-" + mf.motif, n: mf.total, texte: "Motif de perte observé " + mf.total + " fois : « " + mf.libelle + " ».", lien: "pertes" }); });
    var acq = acquisition(s);
    var lents = acq.delais.filter(function (h) { return h > (x.cibleHeures || 1); }).length;
    if (lents) c.push({ cle: "delai", n: lents, texte: lents + " première(s) réponse(s) au-delà de " + (x.cibleHeures || 1) + " h (cible de démonstration).", lien: "prospects" });
    if (acq.sansReponse) c.push({ cle: "sans-reponse", n: acq.sansReponse, texte: acq.sansReponse + " opportunité(s) récente(s) sans premier échange enregistré.", lien: "actions" });
    return c;
  }

  var api = {
    obs: obs, nd: nd, na: na, taux: taux, moyenne: moyenne, mediane: mediane, dansPeriode: dansPeriode,
    acquisition: acquisition, pipeline: pipeline, entonnoir: entonnoir, soumissions: soumissions, rendezVous: rendezVous,
    transactions: transactions, evolution: evolution, axes: axes, venteConclue: venteConclue,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else racine.PerformancesCalcul = api;
})(this);
