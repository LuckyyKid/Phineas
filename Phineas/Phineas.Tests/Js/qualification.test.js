// Tests unitaires de la fonctionnalité 20 (qualification enregistrée d'une opportunité réelle) côté navigateur :
// envoi au serveur, refus de toute qualification locale sur un dossier réel, valeur du serveur jamais masquée par un
// ancien état de l'onglet ; la démonstration garde sa qualification locale.
// Lancement (Node 22 ou plus, aucune dépendance), depuis le dossier Phineas : node --test "Phineas.Tests/Js/*.test.js"
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const racine = path.join(__dirname, "..", "..", "Phineas");
const CREATION = new Date(2026, 10, 20, 10, 0, 0).toISOString();

// Qualification telle que l'envoie le serveur pour l'opportunité réelle oe-1.
const QUALIF_SERVEUR = { categorie: "vus", etat: "occasion", marques: ["Kia"], modeles: ["Sportage"], places: 5, caracteristiques: ["ti"], elementsDecision: [], budgetTotal: 32000 };

function charge() {
  return { referentiels: { typesContact: ["appel", "courriel", "visite"], etapes: [{ cle: "Nouveau", libelle: "Nouveau" }] }, jeton: "jeton",
    urlFiche: "/Prospects/Fiche/__id__", urlQualifier: "/Prospects/Qualifier",
    donnees: { conseillerConnecteId: "moi", conseillers: [{ id: "moi", nom: "Moi", estFictif: false }],
      contacts: [{ id: "pe-1", prenom: "Ana", nom: "Reel", conseillerId: "moi", enregistre: true, version: "V1" }, { id: "chloe", prenom: "Chloé", nom: "Démo", conseillerId: "moi" }],
      opportunites: [{ id: "oe-1", prospectId: "pe-1", titre: "A", etape: "Nouveau", dateCreation: CREATION, derniereActivite: CREATION, vehiculesEnvisages: [], qualification: QUALIF_SERVEUR },
        { id: "o-chloe", prospectId: "chloe", titre: "Démo", etape: "Nouveau", dateCreation: CREATION, derniereActivite: CREATION, vehiculesEnvisages: [], qualification: {} }],
      interactions: [] } };
}

// prospects-store.js chargé comme dans le navigateur ; stockage : sessionStorage déjà rempli (ancien état de l'onglet).
function chargerProspects(stockage) {
  const code = fs.readFileSync(path.join(racine, "wwwroot", "js", "prospects-store.js"), "utf8");
  const ch = charge();
  stockage = stockage || {};
  const window = { sessionStorage: { getItem: (k) => (k in stockage ? stockage[k] : null), setItem: (k, v) => { stockage[k] = v; }, removeItem: (k) => { delete stockage[k]; } } };
  const document = { getElementById: (id) => (id === "prospects-donnees" ? { textContent: JSON.stringify(ch) } : null), querySelector: () => null, addEventListener: () => {},
    createElement: () => ({}), body: { appendChild: () => {} } };
  vm.runInNewContext(code, { window: window, document: document, console: console, Date: Date, JSON: JSON, Math: Math, encodeURIComponent: encodeURIComponent });
  return { P: window.Prospects, stockage: stockage };
}

// Formulaire factice : garde les champs cachés ajoutés et compte les envois.
function formulaire() {
  const f = { enfants: [], envois: 0, appendChild: (x) => { f.enfants.push(x); }, submit: () => { f.envois += 1; } };
  return f;
}
const CHAMPS = ["categorie", "etat", "objections"];

test("F20 : la qualification d'une opportunité réelle part au serveur (opportunité, empreinte, champs, jeton), une seule fois", () => {
  const { P } = chargerProspects();
  const f = formulaire();
  assert.equal(P.envoyerQualification("oe-1", f, CHAMPS), true);
  assert.equal(f.envois, 1);
  assert.equal(f.method, "post");
  assert.equal(f.action, "/Prospects/Qualifier");
  assert.deepEqual(Object.fromEntries(f.enfants.map((x) => [x.name, x.value])),
    { prospectId: "pe-1", opportuniteId: "oe-1", version: "V1", champs: "categorie,etat,objections", __RequestVerificationToken: "jeton" });
});

test("F20 : une opportunité de démonstration n'est jamais envoyée au serveur", () => {
  const { P } = chargerProspects();
  const f = formulaire();
  assert.equal(P.envoyerQualification("o-chloe", f, CHAMPS), false);
  assert.equal(P.envoyerQualification("oe-inconnue", f, CHAMPS), false);
  assert.equal(f.envois, 0);
});

test("F20 : aucune qualification locale sur un dossier réel (ni valeur, ni événement, ni préférence de contact)", () => {
  const { P } = chargerProspects();
  const avant = JSON.stringify(P.opportunite("oe-1").qualification);
  assert.equal(P.enregistrerQualification("oe-1", { categorie: "berline" }, { contactPrefere: "telephone" }), false);
  assert.equal(JSON.stringify(P.opportunite("oe-1").qualification), avant);
  assert.equal(P.contact("pe-1").contactPrefere, undefined);
  assert.equal(P.interactionsDe("pe-1").length, 0);
});

test("F20 : la démonstration garde sa qualification locale, annoncée comme telle par la fiche", () => {
  const { P } = chargerProspects();
  P.enregistrerQualification("o-chloe", { categorie: "berline", elementsDecision: [] });
  assert.equal(P.opportunite("o-chloe").qualification.categorie, "berline");
  assert.equal(P.interactionsDe("chloe")[0].type, "qualification");
  const fiche = fs.readFileSync(path.join(racine, "wwwroot", "js", "prospects-fiche.js"), "utf8");
  assert.ok(fiche.includes("Qualification enregistrée localement (non enregistrée en base)."));
});

test("F20 : un ancien état de l'onglet ne remplace jamais la qualification du serveur d'un dossier réel", () => {
  // Session précédente : une qualification locale avait été posée sur oe-1 (avant la fonctionnalité 20).
  const premier = chargerProspects();
  const etat = JSON.parse(JSON.stringify({ contacts: charge().donnees.contacts, opportunites: charge().donnees.opportunites, interactions: [], suivant: 1 }));
  etat.opportunites[0].qualification = { categorie: "coupe", etat: "neuf", objections: "Ancienne valeur locale" };
  // Témoin : une qualification locale de démonstration, qui doit être gardée (preuve que l'état sauvegardé a été lu).
  etat.opportunites[1].qualification = { categorie: "fourgonnette" };
  const cle = Object.keys(premier.stockage)[0] || "phineas.salesos.prospects.v1:Moi";
  const stockage = {};
  stockage[cle] = JSON.stringify(etat);
  const { P } = chargerProspects(stockage);
  assert.equal(P.opportunite("o-chloe").qualification.categorie, "fourgonnette", "l'état de l'onglet a bien été relu");
  assert.deepEqual(JSON.parse(JSON.stringify(P.opportunite("oe-1").qualification)), QUALIF_SERVEUR);
});
