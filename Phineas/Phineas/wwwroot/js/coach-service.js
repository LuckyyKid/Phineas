// Assistant vendeur — service de réponses (prototype frontend, phase 08).
// Contrat remplaçable : SalesCoachService.repondre(requete) → Promise<reponse>. Aujourd'hui, le fournisseur
// « demonstration » assemble la réponse localement (coach-regles.js) à partir des stores existants ; AUCUNE IA n'est
// appelée. Une future intégration serveur gardera la même forme de réponse : sections typées (vérifié, à vérifier,
// suggestion), références aux données utilisées et contexte transmis minimal.
(function () {
  "use strict";

  var P = window.Prospects, S = window.Soumissions, R = window.RendezVous, T = window.Transactions, I = window.Intelligence;
  var CR = window.CoachRegles, A = window.AnnoncesModeles, C = window.SoumissionsCalcul, OV = window.OutilsVendeur;
  if (!P || !S || !CR || !A || !OV) return;
  var ref = OV.ref;
  var FOURNISSEUR = "Réponses de démonstration préparées par modèles déterministes — aucune IA n'a été appelée.";

  // ---------- Résolution du contexte : uniquement les objets réellement liés au dossier choisi ----------
  function resoudre(ctx) {
    var x = { type: ctx && ctx.type || "aucun" };
    var id = ctx && ctx.id;
    if (x.type === "rendezvous" && R) { x.rdv = R.rdv(id); if (x.rdv) { x.opp = P.opportunite(x.rdv.opportuniteId); x.soumission = x.rdv.soumissionId ? S.soumission(x.rdv.soumissionId) : null; x.vehicule = x.rdv.vehiculeId ? S.vehicule(x.rdv.vehiculeId) : null; } }
    if (x.type === "soumission") { x.soumission = S.soumission(id); if (x.soumission) { x.opp = P.opportunite(x.soumission.opportuniteId); x.vehicule = S.vehicule(S.versionCourante(x.soumission).vehicule.id) || S.versionCourante(x.soumission).vehicule; } }
    if (x.type === "transaction" && T) { x.transaction = T.transaction(id); if (x.transaction) { x.opp = P.opportunite(x.transaction.opportuniteId); x.vehicule = S.vehicule(x.transaction.vehiculeId); } }
    if (x.type === "opportunite") x.opp = P.opportunite(id);
    if (x.type === "prospect") { x.contact = P.contact(id); x.opp = x.contact ? P.opportunitesDe(id).filter(P.estActive)[0] || null : null; }
    if (x.type === "vehicule") x.vehicule = S.vehicule(id);
    if (x.opp) {
      x.contact = x.contact || P.contact(x.opp.prospectId);
      if (!x.soumission) { var l = S.parOpportunite(x.opp.id); x.soumission = l[l.length - 1] || null; }
      if (!x.vehicule && x.soumission) x.vehicule = S.vehicule(S.versionCourante(x.soumission).vehicule.id);
    }
    if (x.vehicule) x.vehicule = Object.assign({}, x.vehicule, { statutActuel: T ? T.statutVehicule(x.vehicule.id) : x.vehicule.statutActuel });
    return x;
  }
  function references(x) {
    var l = [];
    if (x.contact) l.push({ libelle: "Prospect : " + x.contact.prenom + " " + x.contact.nom, url: P.urlFiche(x.contact.id) });
    if (x.opp) l.push({ libelle: "Opportunité : " + x.opp.titre + " (" + P.libelleEtape(x.opp.etape) + ")", url: P.urlFiche(x.opp.prospectId, x.opp.id) });
    if (x.rdv) l.push({ libelle: "Rendez-vous : " + R.type(x.rdv.type).libelle + " · " + R.creneauTexte(x.rdv).toLowerCase(), url: R.urlDetail(x.rdv.id) });
    if (x.soumission) l.push({ libelle: "Soumission : " + x.soumission.reference + " v" + S.versionCourante(x.soumission).numero, url: S.urlDetail(x.soumission.id) });
    if (x.transaction) l.push({ libelle: "Transaction : " + x.transaction.reference, url: T.urlDetail(x.transaction.id) });
    if (x.vehicule) l.push({ libelle: "Véhicule : " + S.nomVehicule(x.vehicule) + " (stock " + x.vehicule.numeroStock + ")", url: (ref.urls.vehicules || "#") + "?vehicule=" + encodeURIComponent(x.vehicule.id) });
    return l;
  }
  function notes(x) {
    if (!x.contact) return [];
    // Contacts déclarés et notes internes du dossier, étiquetés : une note interne n'est jamais présentée comme un échange.
    var types = P.typesContact();
    var Regles = window.IntelligenceRegles;
    return P.interactionsDe(x.contact.id).filter(function (i) {
      var contact = Regles.estContactDeclare(i, types);
      return (!x.opp || !i.opportuniteId || i.opportuniteId === x.opp.id) && (contact || i.type === "note");
    }).slice(0, 3)
      .map(function (i) { return { date: P.dateCourte(i.date), texte: i.resume, nature: Regles.estContactDeclare(i, types) ? "contact" : "note" }; });
  }
  function contexteTransmis(x) {
    var q = (x.opp && x.opp.qualification) || {};
    return CR.contexteMinimal({ prenom: x.contact ? x.contact.prenom : null, opportunite: x.opp ? x.opp.titre : null, vehicule: x.vehicule ? S.nomVehicule(x.vehicule) : null,
      etape: x.opp ? P.libelleEtape(x.opp.etape) : null, budget: P.resumeBudget(q), preferences: (q.elementsDecision || []).map(function (k) { return P.libelle("elementsDecision", k); }).filter(Boolean), notes: notes(x) });
  }
  function disponibiliteTexte(v) {
    return A.disponibilite(v).texte + " (statut : " + S.libelleStatutVehicule(v.statutActuel).toLowerCase() + ")";
  }
  function montantSoumission(s) {
    if (!s || !C) return null;
    return C.calculer(S.versionCourante(s).offre, S.parametres);
  }

  // ---------- Modes ----------
  function preparation(x) {
    var rdv = x.rdv;
    if (!rdv && x.opp && R) rdv = R.parOpportunite(x.opp.id).filter(function (r) { return R.estActif(r) && new Date(r.debut) >= new Date(); })[0] || null;
    if (!rdv) return { horsContexte: "Sélectionnez un rendez-vous (ou une opportunité ayant un rendez-vous à venir) : la fiche de préparation ne peut pas être construite sans lui." };
    if (!x.rdv) { x.rdv = rdv; if (!x.vehicule && rdv.vehiculeId) x.vehicule = S.vehicule(rdv.vehiculeId); }
    var o = x.opp, q = (o && o.qualification) || {};
    var objections = [];
    if (q.objections) objections.push(q.objections);
    R.parOpportunite(rdv.opportuniteId).forEach(function (r) { if (r.resultat && r.resultat.objections) objections.push(r.resultat.objections); });
    var essai = R.estEssai(rdv);
    var defs = essai ? R.ref.checklistEssai : R.ref.checklistPreparation;
    var calc = montantSoumission(x.soumission);
    var v = x.vehicule ? Object.assign({}, x.vehicule, { statutActuel: T ? T.statutVehicule(x.vehicule.id) : x.vehicule.statutActuel }) : null;
    return { sections: CR.preparationRendezVous({
      rdv: { type: rdv.type, typeLibelle: R.type(rdv.type).libelle, creneau: R.creneauTexte(rdv).toLowerCase(), statutLibelle: R.statut(rdv.statut).libelle },
      objectif: rdv.objectif || null, budget: P.resumeBudget(q),
      preferences: (q.elementsDecision || []).map(function (k) { return P.libelle("elementsDecision", k); }).concat((q.caracteristiques || []).map(function (k) { return P.libelle("caracteristiques", k); })).filter(Boolean),
      vehicule: v ? { nom: S.nomVehicule(v), disponibilite: disponibiliteTexte(v), pret: v.statutActuel === "PretPourVente" || v.statutActuel === "Reserve" } : null,
      soumission: x.soumission ? { reference: x.soumission.reference, statutLibelle: S.libelleStatut(S.statut(x.soumission)), montant: calc ? CR.argent(calc.totalEstime) : null } : null,
      interactions: notes(x), objections: objections, completude: o ? P.completude(q) : null,
      checklist: defs.map(function (c) { return { libelle: c.libelle, fait: !!(rdv.checklist && rdv.checklist[c.cle]) }; }),
      prochaineEtape: CR.prochaineEtape(rdv.type, !!x.soumission),
    }) };
  }
  function vehicule(x) {
    if (!x.vehicule) return { horsContexte: "Sélectionnez un véhicule (ou un dossier associé à un véhicule)." };
    var v = x.vehicule;
    var compat = x.opp && I ? I.comparer(x.opp.id, v.id) : null;
    return { sections: CR.syntheseVehicule(v, A.champsInventaire(v), A.disponibilite(v), compat, ref),
      liens: [{ libelle: "Voir dans les recommandations de véhicules (inventaire)", url: (ref.urls.vehicules || "#") + "?vehicule=" + encodeURIComponent(v.id) },
        { libelle: "Créer une annonce pour ce véhicule", url: ref.urls.annonces + "?vehicule=" + encodeURIComponent(v.id) }]
        .concat(x.opp ? [{ libelle: "Ouvrir l'opportunité concernée", url: P.urlFiche(x.opp.prospectId, x.opp.id) }] : []),
      provenance: "Fiche d'inventaire " + v.numeroStock + " (données de démonstration)" + (compat ? " et Vehicle Matching Engine (phase 06)" : "") };
  }
  function objection(x, cle) {
    if (!cle) return { horsContexte: "Choisissez l'objection à préparer." };
    var faits = [];
    if (x.opp) {
      var q = x.opp.qualification || {};
      faits.push("Budget déclaré : " + (P.resumeBudget(q) || "non renseigné"));
      if ((q.elementsDecision || []).length) faits.push("Éléments de décision : " + q.elementsDecision.map(function (k) { return P.libelle("elementsDecision", k); }).join(", "));
      if (q.objections) faits.push("Objection notée : « " + q.objections + " »");
    }
    if (x.soumission) {
      var calc = montantSoumission(x.soumission), off = S.versionCourante(x.soumission).offre;
      faits.push(x.soumission.reference + " : total estimé " + CR.argent(calc.totalEstime) + (off.remise ? ", remise déjà accordée " + CR.argent(calc.remise) : ", aucune remise"));
      if (calc.financement.etat === "ok") faits.push("Mensualité estimée " + CR.argent(calc.financement.versement) + " sur " + calc.financement.dureeMois + " mois (taux hypothétique).");
    }
    if (cle === "remise" && T && T.ref.seuilRemiseApprobation != null) faits.push("Remise au-delà de " + CR.argent(T.ref.seuilRemiseApprobation * 100) + " : approbation du directeur des ventes requise.");
    return { sections: CR.objection(cle, faits, ref) };
  }
  function scenario(x) {
    if (!x.soumission || !C) return { horsContexte: "Sélectionnez une soumission : seuls les montants déjà calculés par le module Soumissions sont expliqués." };
    var ver = S.versionCourante(x.soumission);
    return { sections: CR.scenario(C.calculer(ver.offre, S.parametres), ver.offre, S.libelleStatut(S.statut(x.soumission))), provenance: "Calculs de la soumission " + x.soumission.reference + " v" + ver.numero + " (module Soumissions)" };
  }
  function procedure(x, cle) {
    if (!cle) return { sections: [{ type: "verifie", titre: "Procédures disponibles", items: ref.procedures.map(function (p) { return p.libelle + (p.documentee ? " — " + p.module : " — non documentée, à confirmer"); }) }] };
    return { sections: CR.procedure(cle, ref) };
  }
  function relance(x) {
    if (!I) return { horsContexte: "Le moteur de relances n'est pas chargé sur cette page." };
    var l = I.actives().filter(function (a) { return a.relance && (!x.contact || a.prospectId === x.contact.id) && (!x.opp || a.opportuniteId === x.opp.id); });
    return { sections: [{ type: "suggestion", titre: "Relances proposées par le Smart Follow-up Engine", items: l.map(function (a) { return a.client + " — " + a.regleLibelle + " : " + a.actionProposee; }), vide: "Aucune relance recommandée pour ce dossier." }],
      relances: l.map(function (a) { return { id: a.id, libelle: a.client + " — " + a.regleLibelle }; }) };
  }

  var MODES = { "preparation-rdv": preparation, vehicule: vehicule, objection: objection, scenario: scenario, procedure: procedure, relance: relance };
  // requete : { mode, contexte: { type, id }, question, parametres: { objection, procedure } }
  function construire(req) {
    var x = resoudre(req.contexte);
    var mode = req.mode || CR.router(req.question);
    var base = { simulee: true, fournisseur: FOURNISSEUR, question: req.question || null, contexte: x.type, avertissements: [] };
    if (!mode || !MODES[mode]) {
      base.mode = null;
      base.horsContexte = "Cette question n'entre dans aucun des modes de l'assistant de démonstration : aucune réponse n'est inventée. Choisissez un mode ou consultez un collègue.";
      base.donnees = references(x); base.contexteTransmis = contexteTransmis(x);
      return base;
    }
    var r = MODES[mode](x, (req.parametres || {})[mode === "objection" ? "objection" : "procedure"]);
    Object.keys(r).forEach(function (k) { base[k] = r[k]; });
    base.mode = mode;
    base.modeLibelle = ref.modesCoach.filter(function (m0) { return m0.cle === mode; })[0].libelle;
    base.donnees = references(x);
    base.contexteTransmis = contexteTransmis(x);
    // Notes du dossier qui ressemblent à des consignes : affichées comme données, jamais suivies.
    if (base.contexteTransmis.notes.some(function (n) { return CR.ressembleAConsigne(n.texte); })) base.avertissements.push("Une note du dossier contient un texte qui ressemble à une consigne : elle est traitée comme une simple donnée.");
    return base;
  }

  window.SalesCoachService = {
    fournisseur: "demonstration",
    repondre: function (req) { return Promise.resolve(construire(req)); },
    construire: construire,
  };
})();
