// Tests unitaires de la fonctionnalité 18 (plusieurs opportunités réelles par prospect) côté navigateur :
// liens vers la bonne opportunité, envoi de la création au serveur pour un dossier enregistré, et séparation des
// opportunités d'un même prospect dans le moteur (obligations, veilles, réalisations).
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
const typesContact = JSON.parse(sourceVente.match(/TypesContactDeclare = (\[[^\]]*\]);/)[1]);
const regles = [];
for (const m of sourceIntel.matchAll(/\("([a-z-]+)", "([^"]+)", "([a-z]+)", "(Faible|Normal|Eleve|Urgent)", "([a-z]+)"\)/g)) {
  regles.push({ cle: m[1], libelle: m[2], categorie: m[3], priorite: m[4], nature: m[5] });
}
const config = {};
for (const m of sourceIntel.matchAll(/public const int (\w+) = (\d+);/g)) config[m[1].charAt(0).toLowerCase() + m[1].slice(1)] = Number(m[2]);

const JOUR = 86400000;
const MAINTENANT = new Date(2026, 10, 24, 14, 0, 0);
const CREATION = new Date(MAINTENANT.getTime() - 2 * JOUR).toISOString();

// prospects-store.js chargé comme dans le navigateur, avec un faux document ; formulaires postés capturés.
function chargerProspects(opportunitesRemplacees) {
  const code = fs.readFileSync(path.join(racine, "wwwroot", "js", "prospects-store.js"), "utf8");
  const charge = { referentiels: { typesContact: typesContact, etapes: [{ cle: "Nouveau", libelle: "Nouveau" }] }, jeton: "jeton",
    urlFiche: "/Prospects/Fiche/__id__", urlCreerOpportunite: "/Prospects/CreerOpportunite",
    donnees: { conseillerConnecteId: "moi", conseillers: [{ id: "moi", nom: "Moi", estFictif: false }],
      contacts: [{ id: "pe-1", prenom: "Ana", nom: "Reel", conseillerId: "moi", enregistre: true, version: "V1" }, { id: "chloe", prenom: "Chloé", nom: "Démo", conseillerId: "moi" }],
      opportunites: [{ id: "oe-1", prospectId: "pe-1", titre: "A", etape: "Nouveau", dateCreation: CREATION, derniereActivite: CREATION, vehiculesEnvisages: [] },
        { id: "oe-2", prospectId: "pe-1", titre: "B", etape: "Nouveau", dateCreation: CREATION, derniereActivite: CREATION, vehiculesEnvisages: [] },
        { id: "o-chloe", prospectId: "chloe", titre: "Démo", etape: "Nouveau", dateCreation: CREATION, derniereActivite: CREATION, vehiculesEnvisages: [] }],
      interactions: [] } };
  if (opportunitesRemplacees) charge.donnees.opportunites = opportunitesRemplacees;
  const postes = [];
  const stockage = {};
  function element(nom) {
    const e = { tag: nom, enfants: [], appendChild: (x) => { e.enfants.push(x); }, submit: () => { postes.push({ action: e.action, champs: Object.fromEntries(e.enfants.map((x) => [x.name, x.value])) }); } };
    return e;
  }
  const window = { sessionStorage: { getItem: (k) => stockage[k] || null, setItem: (k, v) => { stockage[k] = v; }, removeItem: (k) => { delete stockage[k]; } } };
  const document = { getElementById: (id) => (id === "prospects-donnees" ? { textContent: JSON.stringify(charge) } : null), querySelector: () => null, addEventListener: () => {},
    createElement: element, body: { appendChild: () => {} } };
  vm.runInNewContext(code, { window: window, document: document, console: console, Date: Date, JSON: JSON, Math: Math, encodeURIComponent: encodeURIComponent });
  return { P: window.Prospects, postes: postes };
}

// ---------- Liens et création ----------
test("lien vers la fiche : l'opportunité enregistrée est désignée, jamais une opportunité de démonstration", () => {
  const { P } = chargerProspects();
  assert.equal(P.urlFiche("pe-1", "oe-2"), "/Prospects/Fiche/pe-1?opportunite=oe-2");
  assert.equal(P.urlFiche("pe-1"), "/Prospects/Fiche/pe-1");
  assert.equal(P.urlFiche("chloe", "o-chloe"), "/Prospects/Fiche/chloe");
  assert.equal(P.urlFiche("chloe", "oe-2"), "/Prospects/Fiche/chloe", "un prospect fictif n'a jamais d'opportunité enregistrée");
});

test("nouvelle opportunité d'un dossier enregistré : envoyée au serveur avec l'empreinte, rien de créé localement", () => {
  const { P, postes } = chargerProspects();
  assert.equal(P.envoyerOpportunite("pe-1", { titre: "Projet C", categorie: "vus", etape: "Nouveau" }), true);
  assert.equal(postes.length, 1);
  assert.equal(postes[0].action, "/Prospects/CreerOpportunite");
  assert.deepEqual(postes[0].champs, { prospectId: "pe-1", version: "V1", titre: "Projet C", categorie: "vus", etape: "Nouveau", __RequestVerificationToken: "jeton" });
  assert.equal(P.opportunitesDe("pe-1").length, 2, "aucune opportunité locale ajoutée au dossier enregistré");
  assert.equal(P.envoyerOpportunite("chloe", { titre: "X", etape: "Nouveau" }), false, "un prospect de démonstration reste local");
  assert.equal(postes.length, 1);
});

// ---------- Moteur : deux opportunités d'un même prospect ----------
function opportunite(id, suivi) {
  return { id: id, prospectId: "pe-1", titre: "Projet " + id, etape: "Nouveau", etapeLibelle: "Nouveau", conseillerId: "moi", dateCreation: CREATION, derniereActivite: CREATION,
    vehiculesEnvisages: [], prochaineAction: suivi ? "Rappeler " + id : null, dateProchaineAction: suivi ? new Date(2026, 10, 24, 9, 0, 0).toISOString() : null };
}
function contexte(opps, interactions) {
  return { maintenant: MAINTENANT, ref: { config: config, regles: regles, libellesPriorite: { Faible: "Faible", Normal: "Normal", Eleve: "Élevé", Urgent: "Urgent" } },
    contacts: [{ id: "pe-1", prenom: "Ana", nom: "Reel", conseillerId: "moi" }], opportunites: opps, interactions: interactions || [], typesContact: typesContact,
    soumissions: [], rendezVous: [], transactions: [], relations: null, preferences: {}, pauses: {}, correspondances: [] };
}

test("deux opportunités d'un même prospect : deux obligations distinctes, jamais regroupées ensemble", () => {
  const actions = Regles.analyser(contexte([opportunite("oe-1", true), opportunite("oe-2", true)])).actions;
  const groupes = Regles.regrouperObligations(actions);
  assert.deepEqual(groupes.map((g) => g.id).filter((x) => x.indexOf("contact:") === 0).sort(), ["contact:oe-1", "contact:oe-2"]);
  groupes.forEach((g) => assert.equal(new Set(g.raisons.map((r) => r.opportuniteId)).size, 1, g.id));
  assert.equal(Regles.compterObligations(actions, MAINTENANT).aTraiter, groupes.length);
});

test("la veille de la première réponse de A laisse celle de B présentée", () => {
  const actions = Regles.analyser(contexte([opportunite("oe-1", false), opportunite("oe-2", false)])).actions;
  const veilles = { "premiere-reponse:oe-1": { depuis: MAINTENANT.toISOString(), jusqua: new Date(MAINTENANT.getTime() + 3 * JOUR).toISOString() } };
  const r = Regles.separerVeilles(actions, veilles, MAINTENANT);
  assert.deepEqual(r.enVeille.map((a) => a.id), ["premiere-reponse:oe-1"]);
  assert.ok(r.presentees.some((a) => a.id === "premiere-reponse:oe-2"));
});

test("une réalisation enregistrée sur A n'est jamais attribuée au suivi de B, même action et même jour", () => {
  const evenement = { id: "ie-s1", prospectId: "pe-1", opportuniteId: "oe-1", date: MAINTENANT.toISOString(), type: "suivi-realise", auteur: "Moi", resume: "Fait",
    datePrevue: new Date(2026, 10, 24, 9, 0, 0).toISOString(), actionPrevue: "Rappeler" };
  assert.equal(Regles.issueSuiviEnregistree("suivi-echeance:oe-1:2026-11-24", [evenement], "Rappeler").issue, "realise");
  assert.equal(Regles.issueSuiviEnregistree("suivi-echeance:oe-2:2026-11-24", [evenement], "Rappeler"), null);
});

test("un contact déclaré sur A ne satisfait pas la première réponse de B (règle F10 : contact lié à l'opportunité)", () => {
  const appelA = { id: "ie-n1", prospectId: "pe-1", opportuniteId: "oe-1", date: new Date(new Date(CREATION).getTime() + 3600000).toISOString(), type: "appel", auteur: "Moi", resume: "Appel" };
  const actions = Regles.analyser(contexte([opportunite("oe-1", false), opportunite("oe-2", false)], [appelA])).actions;
  assert.ok(!actions.some((a) => a.id === "premiere-reponse:oe-1"));
  assert.ok(actions.some((a) => a.id === "premiere-reponse:oe-2"));
});

// ---------- Fonctionnalité 19 : identité du projet sur les cartes ----------
function opp(id, titre, jour) {
  const d = new Date(2026, 10, jour, 10, 0, 0).toISOString();
  return { id: id, prospectId: "pe-1", titre: titre, etape: "Nouveau", dateCreation: d, derniereActivite: d, vehiculesEnvisages: [] };
}

test("F19 : une seule opportunité, aucun libellé de projet (carte aussi simple qu'avant)", () => {
  const { P } = chargerProspects([opp("oe-1", "Kia Sportage", 20)]);
  assert.equal(P.projet("oe-1"), null);
  assert.equal(P.projet("oe-inconnue"), null);
});

test("F19 : deux projets aux titres différents, chacun nommé par son titre", () => {
  const { P } = chargerProspects([opp("oe-1", "VUS familial", 20), opp("oe-2", "Deuxième véhicule", 21)]);
  assert.equal(P.projet("oe-1"), "VUS familial");
  assert.equal(P.projet("oe-2"), "Deuxième véhicule");
});

test("F19 : même titre, jours différents : la date d'ouverture les distingue", () => {
  const { P } = chargerProspects([opp("oe-1", "Kia Sportage", 20), opp("oe-2", " kia sportage ", 22)]);
  const a = P.projet("oe-1"), b = P.projet("oe-2");
  assert.notEqual(a, b);
  assert.match(a, /^Kia Sportage · ouverte le /);
  assert.doesNotMatch(a, /n° /);
});

test("F19 : même titre, même jour : le numéro de l'opportunité les distingue, rien n'est inventé", () => {
  const { P } = chargerProspects([opp("oe-11", "Kia Sportage", 20), opp("oe-12", "Kia Sportage", 20)]);
  assert.match(P.projet("oe-11"), /· n° 11$/);
  assert.match(P.projet("oe-12"), /· n° 12$/);
  assert.notEqual(P.projet("oe-11"), P.projet("oe-12"));
});
