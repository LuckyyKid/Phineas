// Assistant vendeur (Sales Coach) — règles de composition des réponses (prototype frontend, phase 08).
// Fonctions pures, utilisables dans Node. AUCUNE IA : chaque réponse est assemblée à partir des données du dossier
// fournies en entrée ; ce qui est absent reste « à vérifier ». Chaque section est typée : « verifie » (donnée du dossier),
// « a-verifier » (absente ou incertaine) ou « suggestion » (piste de travail, à valider par le conseiller).
(function (racine) {
  "use strict";

  function argent(cents) {
    return cents == null ? null : new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 2 }).format(cents / 100);
  }
  function section(type, titre, items, vide) {
    return { type: type, titre: titre, items: (items || []).filter(Boolean), vide: vide || null };
  }

  // ---------- Garde-fous des données transmises ----------
  // Données qui seraient transmises au futur service d'IA : minimum nécessaire, sans coordonnées.
  function contexteMinimal(ctx) {
    var c = ctx || {};
    return {
      prenom: c.prenom || null,
      opportunite: c.opportunite || null,
      vehicule: c.vehicule || null,
      etape: c.etape || null,
      budget: c.budget || null,
      preferences: c.preferences || [],
      notes: (c.notes || []).map(function (n) { return { date: n.date, texte: n.texte, nature: "donnee-du-dossier" }; }),
      exclus: ["Nom de famille", "Courriel", "Téléphone", "Renseignements financiers confidentiels (F&A)"],
    };
  }
  // Une note client qui ressemble à une consigne est affichée comme donnée, jamais suivie.
  var CONSIGNES = /(ignore|oublie|ne tiens pas compte)[^.]{0,40}(instruction|consigne|règle)|tu es maintenant|system prompt|réponds? uniquement|affiche (tous|toutes) les/i;
  function ressembleAConsigne(texte) {
    return CONSIGNES.test(String(texte || ""));
  }

  // ---------- Questions libres : routage vers un mode, ou réponse « hors contexte » ----------
  var MOTS = [
    { mode: "scenario", re: /mensualit|paiement|financ|taux|co[uû]t total|versement/i },
    { mode: "objection", re: /objection|trop cher|remise|rabais|h[ée]site|comparer|frais/i },
    { mode: "preparation-rdv", re: /rendez-vous|rdv|essai|pr[ée]parer|visite/i },
    { mode: "vehicule", re: /v[ée]hicule|[ée]quipement|caract[ée]ristique|kilom|moteur|version/i },
    { mode: "relance", re: /relance|rappeler|recontacter|message/i },
    { mode: "procedure", re: /proc[ée]dure|comment (faire|ouvrir|planifier|transf[ée]rer)|[ée]tape/i },
  ];
  function router(question) {
    var m = MOTS.filter(function (x) { return x.re.test(String(question || "")); })[0];
    return m ? m.mode : null;
  }

  // ---------- Préparer un rendez-vous ----------
  // d : { rdv, contact, opportunite, completude, budget, preferences, objectif, soumission, interactions, objections, vehicule, checklist, prochaineEtape }
  function preparationRendezVous(d) {
    var savons = [], verifier = [], questions = [], documents = [];
    savons.push("Rendez-vous : " + d.rdv.typeLibelle.toLowerCase() + ", " + d.rdv.creneau + " (" + d.rdv.statutLibelle.toLowerCase() + ").");
    if (d.objectif) savons.push("Objectif noté : " + d.objectif);
    if (d.budget) savons.push("Budget déclaré : " + d.budget + ".");
    else verifier.push("Budget : non renseigné.");
    if ((d.preferences || []).length) savons.push("Préférences déclarées : " + d.preferences.join(", ") + ".");
    else verifier.push("Préférences et critères de décision : non renseignés.");
    if (d.vehicule) savons.push("Véhicule : " + d.vehicule.nom + " — " + d.vehicule.disponibilite + ".");
    else verifier.push("Véhicule : aucun véhicule associé au rendez-vous.");
    if (d.vehicule && !d.vehicule.pret) verifier.push("État de préparation du véhicule : " + d.vehicule.disponibilite.toLowerCase());
    if (d.soumission) savons.push("Soumission associée : " + d.soumission.reference + " (" + d.soumission.statutLibelle.toLowerCase() + ")" + (d.soumission.montant ? ", total estimé " + d.soumission.montant : "") + ".");
    (d.interactions || []).forEach(function (i) { savons.push((i.nature === "contact" ? "Contact déclaré" : "Note interne") + " (" + i.date + ") : " + i.texte); });
    (d.objections || []).forEach(function (o) { savons.push("Objection enregistrée : « " + o + " »"); });
    if (!(d.objections || []).length) verifier.push("Objections : aucune n'est enregistrée (ne pas en supposer).");
    (d.completude && d.completude.manquants || []).forEach(function (m) { verifier.push("Qualification : " + m.toLowerCase() + " non renseigné(e)."); });
    // Questions : uniquement à partir de ce qui manque ou de ce qui a été dit.
    (d.completude && d.completude.manquants || []).slice(0, 3).forEach(function (m) { questions.push("Pouvez-vous me préciser : " + m.toLowerCase() + " ?"); });
    (d.objections || []).slice(0, 2).forEach(function (o) { questions.push("Vous aviez mentionné « " + o.replace(/[.]$/, "") + " » : est-ce toujours une préoccupation ?"); });
    if (d.rdv.type === "EssaiRoutier") questions.push("Qu'aimeriez-vous vérifier en priorité pendant l'essai ?");
    if (!questions.length) questions.push("Qu'est-ce qui serait le plus utile pour vous lors de cette rencontre ?");
    (d.checklist || []).forEach(function (c) { documents.push((c.fait ? "✓ " : "☐ ") + c.libelle); });
    if (d.soumission) documents.push("Version imprimable de " + d.soumission.reference);
    return [
      section("verifie", "Ce que nous savons", savons),
      section("a-verifier", "Ce qu'il faut vérifier", verifier, "Aucune information manquante détectée."),
      section("suggestion", "Questions pertinentes", questions),
      section("verifie", "Documents et informations utiles", documents),
      section("suggestion", "Prochaine étape probable du processus", [d.prochaineEtape], null),
    ];
  }
  // Étape procédurale suivant un type de rendez-vous (jamais une prédiction de la décision du client).
  function prochaineEtape(type, aSoumission) {
    if (type === "EssaiRoutier") return "Après l'essai : enregistrer le résultat, puis " + (aSoumission ? "mettre à jour ou discuter la soumission." : "préparer une soumission si le client le souhaite.");
    if (type === "DiscussionSoumission" || type === "Negociation") return "Après la rencontre : enregistrer la réponse du client ; une soumission acceptée permet d'ouvrir une transaction.";
    if (type === "Financement") return "Après la rencontre : suivre la décision du Service F&A dans la transaction.";
    if (type === "Livraison") return "Après la livraison : confirmer la livraison, puis le suivi de satisfaction.";
    if (type === "SuiviApresVente") return "Après le suivi : enregistrer le retour ou un éventuel problème après-vente.";
    return "Après la rencontre : enregistrer le résultat et la prochaine action.";
  }

  // ---------- Comprendre un véhicule ----------
  // champs : sortie de AnnoncesModeles.champsInventaire ; compat : résultat du Vehicle Matching Engine (facultatif).
  function syntheseVehicule(v, champs, disponibilite, compat, ref) {
    var verifies = champs.connus.map(function (c) { return c.libelle + " : " + c.valeur; });
    if (champs.equipements.length) verifies.push("Équipements indiqués dans la fiche : " + champs.equipements.join(", "));
    verifies.push("Disponibilité : " + disponibilite.texte);
    var pertinents = compat ? compat.satisfaits.map(function (i) { return i.libelle + " — " + i.detail; }) : [];
    var ecarts = compat ? compat.ecarts.map(function (i) { return i.libelle + " — " + i.detail; }) : [];
    var aConfirmer = champs.manquants.map(function (m) { return m + " : absent de la fiche."; })
      .concat(ref.informationsHorsInventaire.map(function (m) { return m + " : non documenté dans l'inventaire."; }))
      .concat(compat ? compat.inconnus.map(function (i) { return i.libelle + " : " + i.detail; }) : []);
    var questions = ["Quels équipements sont indispensables pour vous ?", "Comment utiliserez-vous principalement le véhicule ?"];
    if (compat && compat.inconnus.length) questions.unshift("Pouvez-vous me confirmer : " + compat.inconnus.map(function (i) { return i.libelle.toLowerCase(); }).join(", ") + " ?");
    return [
      section("verifie", "Informations vérifiées (fiche d'inventaire)", verifies),
      compat ? section("verifie", "Caractéristiques pertinentes pour ce client", pertinents.concat(ecarts.map(function (e) { return "Écart : " + e; })), "Aucun critère du client n'est satisfait de façon vérifiable.") : null,
      section("a-verifier", "À confirmer avant d'en parler au client", aConfirmer),
      section("suggestion", "Questions commerciales possibles", questions),
    ].filter(Boolean);
  }

  // ---------- Comprendre une objection ----------
  // faits : informations vérifiées du dossier (budget, montant de soumission, remise…), déjà formatées.
  function objection(cle, faits, ref) {
    var g = ref.objections.filter(function (o) { return o.cle === cle; })[0];
    if (!g) return null;
    return [
      section("suggestion", "Méthode : clarifier avant de répondre", [g.clarifier]),
      section("verifie", "Ce que le dossier indique", faits || [], "Aucun dossier sélectionné : choisissez une opportunité pour voir les faits."),
      section("a-verifier", "Informations à vérifier", g.verifier),
      section("suggestion", "Questions utiles", g.questions),
      section("a-verifier", "À éviter", ["Toute pression, fausse urgence ou promesse non confirmée (remise, financement, disponibilité)."]),
    ];
  }

  // ---------- Expliquer un scénario d'achat (calculs de la phase 03, aucun nouveau montant) ----------
  // r : résultat de SoumissionsCalcul.calculer ; offre : offre de la version ; statut : statut de la soumission.
  function scenario(r, offre, statut) {
    var couts = ["Prix affiché : " + argent(r.prixAnnonce), r.remise ? "Remise : − " + argent(r.remise) : null,
      r.totalOptions ? "Options : " + argent(r.totalOptions) : null, r.taxes != null ? "Taxes estimées : " + argent(r.taxes) : "Taxes : non incluses",
      "Total estimé : " + argent(r.totalEstime)];
    var f = r.financement, mens = [];
    if (offre.modeAchat === "comptant") mens.push("Achat comptant : solde estimé " + argent(r.comptant.solde) + " (aucune mensualité).");
    else if (f.etat === "ok") {
      mens.push("Mensualité estimée : " + argent(f.versement) + " sur " + f.dureeMois + " mois.");
      mens.push("Le prix total et la mensualité sont deux mesures différentes : sur la durée, les versements totalisent " + argent(f.totalVersements) + ", dont " + argent(f.interets) + " d'intérêts estimés.");
    } else mens.push("Mensualité non calculable : " + (f.etat === "taux-manquant" ? "taux non renseigné." : f.etat === "duree-manquante" ? "durée non renseignée." : "montant financé négatif."));
    var hyp = [offre.modeAchat ? "Mode d'achat : " + offre.modeAchat : null, f.taux != null ? "Taux annuel hypothétique : " + String(f.taux).replace(".", ",") + " %" : null,
      f.dureeMois ? "Durée : " + f.dureeMois + " mois" : null, r.miseDeFonds ? "Mise de fonds : " + argent(r.miseDeFonds) : null,
      r.reprise ? "Reprise : " + (r.reprise.net != null ? "net " + argent(r.reprise.net) : "montant net inconnu") : null];
    var conf = r.aConfirmer.slice();
    if (f.taux != null) conf.push("Le taux est une hypothèse : seule une décision du Service F&A le confirme.");
    if (statut !== "Acceptee") conf.push("Proposition non acceptée par le client (statut : " + statut + ").");
    return [
      section("verifie", "Résumé des coûts (calcul de la soumission)", couts),
      section("verifie", "Prix total et mensualités", mens),
      section("verifie", "Hypothèses utilisées", hyp),
      section("a-verifier", "Conditions non confirmées", conf, "Aucune condition en attente."),
    ];
  }

  // ---------- Comprendre une procédure ----------
  function procedure(cle, ref) {
    var p = ref.procedures.filter(function (x) { return x.cle === cle; })[0];
    if (!p) return null;
    if (!p.documentee) return [section("a-verifier", p.libelle, ["Cette procédure n'est pas documentée dans Phineas : à confirmer avec la direction avant d'agir."])];
    return [section("verifie", p.libelle + " (module " + p.module + ")", p.etapes.map(function (e, i) { return (i + 1) + ". " + e; }))];
  }

  var api = {
    contexteMinimal: contexteMinimal,
    ressembleAConsigne: ressembleAConsigne,
    router: router,
    preparationRendezVous: preparationRendezVous,
    prochaineEtape: prochaineEtape,
    syntheseVehicule: syntheseVehicule,
    objection: objection,
    scenario: scenario,
    procedure: procedure,
    argent: argent,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else racine.CoachRegles = api;
})(this);
