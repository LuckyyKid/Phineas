// Tests unitaires de la fiabilité des confirmations, états et indicateurs vendeur (fonctionnalité 16).
// G1 : mentions réel/démonstration (MentionsDonnees, une seule source C#) sur chaque écran vendeur.
// G2 : aucune modification locale d'un dossier réel (prospects-store.js chargé dans un faux DOM) : note, suivi, étape
//      (« Gagné », « Perdu ») et véhicule envisagé sont refusés, la démonstration garde ses actions locales.
// G5 : définitions des compteurs (recommandations, obligations, actions gardées, priorités de l'Accueil).
// G8 : réalisation prouvée en base (IntelligenceRegles.issueSuiviEnregistree) distincte d'une simple obsolescence.
// Lancement (Node 22 ou plus, aucune dépendance), depuis le dossier Phineas : node --test "Phineas.Tests/Js/*.test.js"
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const racine = path.join(__dirname, "..", "..", "Phineas");
const Regles = require(path.join(racine, "wwwroot", "js", "intelligence-regles.js"));
const sourceIntel = fs.readFileSync(path.join(racine, "Models", "ViewModels", "Conseiller", "IntelligenceViewModels.cs"), "utf8");
const sourceVente = fs.readFileSync(path.join(racine, "Models", "ViewModels", "Conseiller", "ProspectsViewModels.cs"), "utf8");
const sourceMentions = fs.readFileSync(path.join(racine, "Models", "Constants", "MentionsDonnees.cs"), "utf8");
const typesContact = JSON.parse(sourceVente.match(/TypesContactDeclare = (\[[^\]]*\]);/)[1]);
const regles = [];
for (const m of sourceIntel.matchAll(/\("([a-z-]+)", "([^"]+)", "([a-z]+)", "(Faible|Normal|Eleve|Urgent)", "([a-z]+)"\)/g)) {
  regles.push({ cle: m[1], libelle: m[2], categorie: m[3], priorite: m[4], nature: m[5] });
}
const config = {};
for (const m of sourceIntel.matchAll(/public const int (\w+) = (\d+);/g)) config[m[1].charAt(0).toLowerCase() + m[1].slice(1)] = Number(m[2]);

const HEURE = 3600000, JOUR = 86400000;
const MAINTENANT = new Date(2026, 10, 24, 14, 0, 0);
const CREATION = new Date(MAINTENANT.getTime() - 2 * JOUR).toISOString();
const jourA9h = (d) => new Date(2026, 10, 24 + d, 9, 0, 0).toISOString();
const apresDemande = (ms) => new Date(new Date(CREATION).getTime() + ms).toISOString();

function opportunite(id, prospectId, suivi) {
  return { id: id, prospectId: prospectId, titre: "Opportunité " + id, etape: "Nouveau", etapeLibelle: "Nouveau", conseillerId: "moi",
    dateCreation: CREATION, derniereActivite: CREATION, vehiculesEnvisages: [],
    prochaineAction: suivi === undefined ? null : "Préparer le dossier de financement", dateProchaineAction: suivi === undefined ? null : jourA9h(suivi) };
}
function contexte(opps, interactions) {
  const pids = [...new Set(opps.map((o) => o.prospectId))];
  return { maintenant: MAINTENANT, ref: { config: config, regles: regles, libellesPriorite: { Faible: "Faible", Normal: "Normal", Eleve: "Élevé", Urgent: "Urgent" } },
    contacts: pids.map((id) => ({ id: id, prenom: "Client", nom: id, conseillerId: "moi" })), opportunites: opps, interactions: interactions || [], typesContact: typesContact,
    soumissions: [], rendezVous: [], transactions: [], relations: null, preferences: {}, pauses: {}, correspondances: [] };
}
// Événement de suivi enregistré, tel que l'envoie ServiceProspects (id « ie-s… », jour et action prévus).
const ACTION_A = "Préparer le dossier de financement";
const ACTION_B = "Rappeler pour l'essai";
function evenement(type, oppId, jourPrevu, quand, action) {
  return { id: "ie-s" + Math.random().toString(36).slice(2, 7), prospectId: "pe-1", opportuniteId: oppId, date: quand || MAINTENANT.toISOString(), type: type,
    auteur: "Moi", resume: type, datePrevue: jourPrevu, actionPrevue: action === undefined ? ACTION_A : action };
}

// ---------- G1 : mentions réel/démonstration ----------
const constante = (nom) => sourceMentions.match(new RegExp(nom + " =\\s*([\\s\\S]*?);"))[1].replace(/"\s*\+\s*"/g, "").replace(/^\s*"|"\s*$/g, "");
const vue = (chemin) => fs.readFileSync(path.join(racine, "Views", chemin), "utf8");
const MIXTES = ["Intelligence/Index.cshtml", "Intelligence/Suivis.cshtml", "Prospects/Index.cshtml"];
const SIMULES = ["Intelligence/Vehicules.cshtml", "Outils/Acquisition.cshtml", "Outils/Annonces.cshtml", "Outils/Assistant.cshtml", "Outils/Performances.cshtml",
  "Relations/Pertes.cshtml", "Relations/Reseau.cshtml", "Relations/Satisfaction.cshtml", "Relations/Statistiques.cshtml", "RendezVous/Index.cshtml",
  "RendezVous/Nouveau.cshtml", "Soumissions/Index.cshtml", "Soumissions/Nouvelle.cshtml", "Transactions/Index.cshtml", "Transactions/Nouvelle.cshtml"];

test("G1 : un écran mixte annonce ce qui est enregistré, sans dire que rien ne l'est", () => {
  const mixte = constante("EcranMixte");
  assert.ok(mixte.includes("sont enregistrés en base") && !/rien n.est enregistré/i.test(mixte));
  MIXTES.forEach((v) => assert.ok(vue(v).includes('title="@MentionsDonnees.EcranMixte"') && vue(v).includes("@MentionsDonnees.LibelleMixte"), v));
  assert.ok(vue("Conseiller/Index.cshtml").includes("@MentionsDonnees.Accueil"));
  assert.ok(!/rien n.est enregistré/i.test(constante("Accueil")));
});

test("G1 : un module entièrement simulé le dit clairement, et ne promet rien au dossier réel", () => {
  const simule = constante("ModuleSimule");
  assert.ok(simule.includes("ne sont pas enregistrées en base") && simule.includes("rien de ce que vous faites ici"));
  SIMULES.forEach((v) => assert.ok(vue(v).includes('title="@MentionsDonnees.ModuleSimule"'), v));
});

test("G1 : plus aucune vue vendeur n'affiche l'ancienne mention générale « Rien n'est enregistré en base »", () => {
  MIXTES.concat(SIMULES, ["Conseiller/Index.cshtml", "Prospects/_BandeauDemo.cshtml"]).forEach((v) => assert.ok(!/Rien n.est enregistré en base/.test(vue(v)), v));
  assert.ok(vue("Prospects/_BandeauDemo.cshtml").includes("@MentionsDonnees.BandeauTexte"));
  assert.ok(constante("BandeauTexte").includes("notes, étapes intermédiaires et suivis"));
});

// ---------- G2 : prospects-store.js dans un faux DOM ----------
function chargerProspects() {
  const code = fs.readFileSync(path.join(racine, "wwwroot", "js", "prospects-store.js"), "utf8");
  const maintenant = new Date().toISOString();
  const charge = { referentiels: { typesContact: typesContact, etapes: [{ cle: "Finalisation", libelle: "Finalisation" }, { cle: "Gagne", libelle: "Gagné" }, { cle: "Perdu", libelle: "Perdu" }] }, jeton: "jeton", urlChangerEtape: "/Prospects/ChangerEtape",
    donnees: { conseillerConnecteId: "moi", conseillers: [{ id: "moi", nom: "Moi", estFictif: false }],
      contacts: [{ id: "pe-1", prenom: "Ana", nom: "Reel", conseillerId: "moi", enregistre: true }, { id: "chloe-bouchard", prenom: "Chloé", nom: "Bouchard", conseillerId: "moi" }],
      opportunites: [{ id: "oe-1", prospectId: "pe-1", titre: "Réelle", etape: "Finalisation", dateCreation: maintenant, derniereActivite: maintenant, vehiculesEnvisages: [] },
        { id: "o-chloe", prospectId: "chloe-bouchard", titre: "Démo", etape: "Finalisation", dateCreation: maintenant, derniereActivite: maintenant, vehiculesEnvisages: [] }],
      interactions: [] } };
  const stockage = {};
  const window = { sessionStorage: { getItem: (k) => stockage[k] || null, setItem: (k, v) => { stockage[k] = v; }, removeItem: (k) => { delete stockage[k]; } } };
  const document = { getElementById: (id) => (id === "prospects-donnees" ? { textContent: JSON.stringify(charge) } : null), querySelector: () => null, addEventListener: () => {} };
  vm.runInNewContext(code, { window: window, document: document, console: console, Date: Date, JSON: JSON, Math: Math });
  return window.Prospects;
}

test("G2 : « Gagné » et « Perdu » locaux refusés sur un dossier réel, l'étape réelle ne bouge pas", () => {
  const P = chargerProspects();
  assert.equal(P.changerEtape("oe-1", "Gagne"), null);
  assert.equal(P.changerEtape("oe-1", "Perdu"), null);
  assert.equal(P.opportunite("oe-1").etape, "Finalisation");
  assert.equal(P.interactionsDe("pe-1").length, 0);
});

test("G2 : note et suivi locaux refusés sur un dossier réel (rien ne se présente comme enregistré)", () => {
  const P = chargerProspects();
  assert.equal(P.ajouterNote("pe-1", { type: "note", opportuniteId: "oe-1", resume: "Véhicule repéré" }), null);
  assert.equal(P.planifierSuivi("oe-1", "Présenter le véhicule", new Date()), false);
  assert.equal(P.ajouterVehiculeEnvisage("oe-1", "Kia Sportage"), false);
  assert.equal(P.interactionsDe("pe-1").length, 0);
  assert.equal(P.opportunite("oe-1").prochaineAction || null, null);
});

test("G2 : la démonstration garde ses actions locales (étape, note, suivi, véhicule envisagé)", () => {
  const P = chargerProspects();
  assert.equal(typeof P.changerEtape("o-chloe", "Gagne"), "function");
  assert.ok(P.ajouterNote("chloe-bouchard", { type: "note", opportuniteId: "o-chloe", resume: "Note" }));
  assert.equal(P.planifierSuivi("o-chloe", "Rappeler", new Date()), true);
  assert.equal(P.ajouterVehiculeEnvisage("o-chloe", "Kia Sportage"), true);
});

// ---------- G8 : réalisation prouvée contre obsolescence ----------
const ID = "suivi-echeance:oe-1:2026-11-24";
test("G8 scénario A : la réalisation enregistrée du même suivi (opportunité, jour et action) est reconnue", () => {
  const r = Regles.issueSuiviEnregistree(ID, [evenement("suivi-realise", "oe-1", jourA9h(0))], ACTION_A);
  assert.equal(r.issue, "realise");
});

test("G8 : un report ou un remplacement n'est jamais une réalisation", () => {
  assert.equal(Regles.issueSuiviEnregistree(ID, [evenement("suivi-reporte", "oe-1", jourA9h(0))], ACTION_A).issue, "reporte");
  assert.equal(Regles.issueSuiviEnregistree(ID, [evenement("suivi-remplace", "oe-1", jourA9h(0))], ACTION_A).issue, "remplace");
});

test("G8 scénario B : A réalisé puis B (même jour) reporté ou remplacé : B n'est jamais reconnu réalisé", () => {
  const aRealise = evenement("suivi-realise", "oe-1", jourA9h(0), apresDemande(HEURE), ACTION_A);
  ["suivi-reporte", "suivi-remplace"].forEach((type) => {
    const l = [aRealise, evenement(type, "oe-1", jourA9h(0), apresDemande(2 * HEURE), ACTION_B)];
    const r = Regles.issueSuiviEnregistree(ID, l, ACTION_B);
    assert.notEqual(r.issue, "realise", type);
    // La ligne de A, si elle subsiste, n'est pas qualifiée par la clôture de B (dernière clôture du jour : autre action).
    assert.equal(Regles.issueSuiviEnregistree(ID, l, ACTION_A), null, type);
  });
});

test("G8 scénario C : A reporté, puis C du même jour réalisé ailleurs : la ligne de A n'est pas « réalisée »", () => {
  const l = [evenement("suivi-reporte", "oe-1", jourA9h(0), apresDemande(HEURE), ACTION_A), evenement("suivi-realise", "oe-1", jourA9h(0), apresDemande(2 * HEURE), ACTION_B)];
  assert.equal(Regles.issueSuiviEnregistree(ID, l, ACTION_A), null);
  assert.equal(Regles.issueSuiviEnregistree(ID, l, ACTION_B).issue, "realise");
});

test("G8 scénario D : sans action connue (ancien état local) ou sans action dans l'événement, aucune réalisation n'est attribuée", () => {
  const l = [evenement("suivi-realise", "oe-1", jourA9h(0))];
  assert.equal(Regles.issueSuiviEnregistree(ID, l, undefined), null);
  assert.equal(Regles.issueSuiviEnregistree(ID, [evenement("suivi-realise", "oe-1", jourA9h(0), undefined, null)], ACTION_A), null);
});

test("G8 : sans preuve (autre jour, autre opportunité, contact déclaré, note), la disparition reste une obsolescence", () => {
  assert.equal(Regles.issueSuiviEnregistree(ID, [evenement("suivi-realise", "oe-1", jourA9h(-3))], ACTION_A), null);
  assert.equal(Regles.issueSuiviEnregistree(ID, [evenement("suivi-realise", "oe-2", jourA9h(0))], ACTION_A), null);
  assert.equal(Regles.issueSuiviEnregistree(ID, [{ id: "ie-n1", opportuniteId: "oe-1", type: "appel", date: MAINTENANT.toISOString() }], ACTION_A), null);
  assert.equal(Regles.issueSuiviEnregistree(ID, [Object.assign(evenement("suivi-realise", "oe-1", null))], ACTION_A), null);
  assert.equal(Regles.issueSuiviEnregistree("premiere-reponse:oe-1", [evenement("suivi-realise", "oe-1", jourA9h(0))], ACTION_A), null);
  assert.equal(Regles.issueSuiviEnregistree("suivi-echeance:o-demo:2026-11-24", [evenement("suivi-realise", "o-demo", jourA9h(0))], ACTION_A), null);
});

test("G8 : la dernière clôture du jour l'emporte (reporté puis réalisé = réalisé)", () => {
  const l = [evenement("suivi-reporte", "oe-1", jourA9h(0), apresDemande(HEURE)), evenement("suivi-realise", "oe-1", jourA9h(0), apresDemande(2 * HEURE))];
  assert.equal(Regles.issueSuiviEnregistree(ID, l, ACTION_A).issue, "realise");
  assert.equal(Regles.issueSuiviEnregistree(ID, l.slice().reverse(), ACTION_A).issue, "realise");
});

test("G8 : après réalisation, la recommandation disparaît ; la première réponse reste (aucun contact créé)", () => {
  const l = Regles.analyser(contexte([opportunite("oe-1", "pe-1")], [evenement("suivi-realise", "oe-1", jourA9h(0), apresDemande(HEURE))])).actions;
  assert.deepEqual(l.map((a) => a.regle), ["premiere-reponse"]);
});

// ---------- G5 : définitions des compteurs ----------
test("G5 : deux raisons d'une même prise de contact = 2 recommandations, 1 obligation", () => {
  const c = Regles.compterObligations(Regles.analyser(contexte([opportunite("oe-1", "pe-1", 0)])).actions, MAINTENANT);
  assert.equal(c.recommandations, 2);
  assert.equal(c.aTraiter, 1);
});

test("G5 : deux opportunités du même prospect = deux obligations distinctes", () => {
  const c = Regles.compterObligations(Regles.analyser(contexte([opportunite("oe-1", "pe-1", 0), opportunite("oe-2", "pe-1", 0)])).actions, MAINTENANT);
  assert.equal(c.aTraiter, 2);
  assert.equal(c.recommandations, 4);
});

test("G5 : « à traiter » ne compte pas les actions confiées (même ensemble que l'onglet et l'Accueil)", () => {
  const l = Regles.analyser(contexte([opportunite("o-a", "p-a", 0), opportunite("o-b", "p-b", 0)])).actions;
  l.filter((a) => a.opportuniteId === "o-b").forEach((a) => { a.assignation = { collegue: "Antoine" }; });
  assert.equal(Regles.compterObligations(Regles.actionsGardees(l), MAINTENANT).aTraiter, 1);
  assert.equal(Regles.compterObligations(l, MAINTENANT).aTraiter, 2);
});

test("G5 : la phrase de l'Accueil compte toutes les priorités du jour, les cartes au plus 3", () => {
  const opps = [1, 2, 3, 4, 5].map((n) => opportunite("oe-" + n, "pe-" + n, -1));
  const actions = Regles.analyser(contexte(opps)).actions;
  assert.equal(Regles.prioritesAccueil(actions, MAINTENANT, 3).length, 3);
  assert.equal(Regles.prioritesAccueil(actions, MAINTENANT, Infinity).length, 5);
});

test("réévaluation après actualisation : mêmes données, mêmes compteurs et même issue", () => {
  const evts = [evenement("suivi-realise", "oe-1", jourA9h(0))];
  assert.deepEqual(Regles.issueSuiviEnregistree(ID, evts, ACTION_A), Regles.issueSuiviEnregistree(ID, evts, ACTION_A));
  const ctx = () => contexte([opportunite("oe-1", "pe-1", 0)]);
  assert.deepEqual(Regles.compterObligations(Regles.analyser(ctx()).actions, MAINTENANT), Regles.compterObligations(Regles.analyser(ctx()).actions, MAINTENANT));
});
