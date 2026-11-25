// Tests unitaires de la fonctionnalité 21 (véhicules envisagés enregistrés) côté navigateur : collection propre à
// chaque opportunité, envoi au serveur (ajout, modification, retrait) sans rien écrire dans l'onglet, ancien état de
// l'onglet jamais prioritaire ; la démonstration garde son ajout local.
// Lancement (Node 22 ou plus, aucune dépendance), depuis le dossier Phineas : node --test "Phineas.Tests/Js/*.test.js"
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const racine = path.join(__dirname, "..", "..", "Phineas");
const CREATION = new Date(2026, 10, 20, 10, 0, 0).toISOString();

function vehicule(id, marque, modele, annee) {
  return { id: id, marque: marque, modele: modele, annee: annee || null, finition: null, libelle: (annee ? annee + " " : "") + marque + " " + modele };
}
// Prospect réel pe-1 : opportunité A (deux véhicules), B (un véhicule), C (aucun) ; dossier de démonstration chloe.
const A = [vehicule("ve-1", "Kia", "Sportage", 2024), vehicule("ve-2", "Kia", "Sportage", 2023)];
const B = [vehicule("ve-3", "Honda", "Civic")];

function opp(id, prospectId, detail) {
  return { id: id, prospectId: prospectId, titre: id, etape: "Nouveau", dateCreation: CREATION, derniereActivite: CREATION, qualification: {},
    vehiculesEnvisages: detail ? detail.map((v) => v.libelle) : [], vehiculesDetail: detail || undefined };
}
function charge() {
  return { referentiels: { typesContact: ["appel"], etapes: [{ cle: "Nouveau", libelle: "Nouveau" }] }, jeton: "jeton",
    urlFiche: "/Prospects/Fiche/__id__", urlAjouterVehicule: "/Prospects/AjouterVehicule", urlModifierVehicule: "/Prospects/ModifierVehicule",
    urlRetirerVehicule: "/Prospects/RetirerVehicule",
    donnees: { conseillerConnecteId: "moi", conseillers: [{ id: "moi", nom: "Moi", estFictif: false }],
      contacts: [{ id: "pe-1", prenom: "Ana", nom: "Reel", conseillerId: "moi", enregistre: true, version: "V1" }, { id: "chloe", prenom: "Chloé", nom: "Démo", conseillerId: "moi" }],
      opportunites: [opp("oe-1", "pe-1", A), opp("oe-2", "pe-1", B), opp("oe-3", "pe-1", []), opp("o-chloe", "chloe", null)],
      interactions: [] } };
}

// prospects-store.js chargé comme dans le navigateur ; envois : formulaires créés par posterSuivi (retrait).
function chargerProspects(stockage) {
  const code = fs.readFileSync(path.join(racine, "wwwroot", "js", "prospects-store.js"), "utf8");
  const ch = charge();
  stockage = stockage || {};
  const envois = [];
  const window = { sessionStorage: { getItem: (k) => (k in stockage ? stockage[k] : null), setItem: (k, v) => { stockage[k] = v; }, removeItem: (k) => { delete stockage[k]; } } };
  const document = {
    getElementById: (id) => (id === "prospects-donnees" ? { textContent: JSON.stringify(ch) } : null), querySelector: () => null, addEventListener: () => {},
    createElement: () => {
      const e = { enfants: [], appendChild: (x) => e.enfants.push(x), submit: () => envois.push(e) };
      return e;
    },
    body: { appendChild: () => {} },
  };
  vm.runInNewContext(code, { window: window, document: document, console: console, Date: Date, JSON: JSON, Math: Math, encodeURIComponent: encodeURIComponent });
  return { P: window.Prospects, stockage: stockage, envois: envois };
}

// Fenêtre « Véhicule envisagé » factice : champs cachés et envois comptés.
function formulaire() {
  const f = { envois: 0, submit: () => { f.envois += 1; },
    elements: { opportuniteId: { value: "" }, vehiculeId: { value: "" }, version: { value: "" } } };
  return f;
}
// Les tableaux venus du store (contexte vm) sont recopiés ici pour être comparés.
const ids = (liste) => Array.from(liste, (v) => v.id);
const libelles = (o) => Array.from(o.vehiculesEnvisages);

test("F21 : chaque opportunité n'affiche que ses propres véhicules (A, B, aucun), jamais ceux du prospect entier", () => {
  const { P } = chargerProspects();
  assert.deepEqual(ids(P.vehiculesDe("oe-1")), ["ve-1", "ve-2"]);
  assert.deepEqual(ids(P.vehiculesDe("oe-2")), ["ve-3"]);
  assert.deepEqual(ids(P.vehiculesDe("oe-3")), []);
  assert.deepEqual(ids(P.vehiculesDe("o-chloe")), []);
  assert.deepEqual(ids(P.vehiculesDe("oe-inconnue")), []);
});

test("F21 : un ajout part au serveur (bonne opportunité, empreinte, aucun véhicule), une seule fois, sans rien écrire dans l'onglet", () => {
  const { P } = chargerProspects();
  const f = formulaire();
  assert.equal(P.envoyerVehicule("oe-2", null, f), true);
  assert.equal(f.envois, 1);
  assert.equal(f.action, "/Prospects/AjouterVehicule");
  assert.deepEqual([f.elements.opportuniteId.value, f.elements.vehiculeId.value, f.elements.version.value], ["oe-2", "", "V1"]);
  assert.deepEqual(ids(P.vehiculesDe("oe-2")), ["ve-3"]);
  assert.deepEqual(libelles(P.opportunite("oe-2")), ["Honda Civic"]);
});

test("F21 : une modification cible le véhicule exact de cette opportunité ; un véhicule d'une autre opportunité est refusé", () => {
  const { P } = chargerProspects();
  const f = formulaire();
  assert.equal(P.envoyerVehicule("oe-1", "ve-2", f), true);
  assert.equal(f.action, "/Prospects/ModifierVehicule");
  assert.equal(f.elements.vehiculeId.value, "ve-2");
  const autre = formulaire();
  assert.equal(P.envoyerVehicule("oe-1", "ve-3", autre), false);
  assert.equal(P.envoyerVehicule("oe-3", "ve-1", autre), false);
  assert.equal(autre.envois, 0);
});

test("F21 : un retrait envoie l'identifiant exact et l'empreinte ; véhicule d'une autre opportunité ou démonstration refusé", () => {
  const { P, envois } = chargerProspects();
  assert.equal(P.envoyerRetraitVehicule("oe-1", "ve-3"), false);
  assert.equal(P.envoyerRetraitVehicule("o-chloe", "ve-1"), false);
  assert.equal(envois.length, 0);
  assert.equal(P.envoyerRetraitVehicule("oe-1", "ve-1"), true);
  assert.equal(envois.length, 1);
  assert.equal(envois[0].action, "/Prospects/RetirerVehicule");
  assert.deepEqual(Object.fromEntries(envois[0].enfants.map((x) => [x.name, x.value])),
    { prospectId: "pe-1", opportuniteId: "oe-1", vehiculeId: "ve-1", version: "V1", __RequestVerificationToken: "jeton" });
  assert.deepEqual(ids(P.vehiculesDe("oe-1")), ["ve-1", "ve-2"], "rien n'est retiré avant la réponse du serveur");
});

test("F21 : aucun ajout local sur un dossier réel ; la démonstration garde son ajout local (ancienne liste de libellés)", () => {
  const { P } = chargerProspects();
  assert.equal(P.ajouterVehiculeEnvisage("oe-1", "2022 Ford Escape"), false);
  assert.deepEqual(libelles(P.opportunite("oe-1")), ["2024 Kia Sportage", "2023 Kia Sportage"]);
  assert.equal(P.envoyerVehicule("o-chloe", null, formulaire()), false);
  assert.notEqual(P.ajouterVehiculeEnvisage("o-chloe", "2022 Ford Escape"), false);
  assert.deepEqual(libelles(P.opportunite("o-chloe")), ["2022 Ford Escape"]);
  assert.deepEqual(ids(P.vehiculesDe("o-chloe")), []);
});

test("F21 : un ancien état de l'onglet ne remplace jamais les véhicules du serveur d'un dossier réel", () => {
  const premier = chargerProspects();
  const etat = JSON.parse(JSON.stringify({ contacts: charge().donnees.contacts, opportunites: charge().donnees.opportunites, interactions: [], suivant: 1 }));
  etat.opportunites[0].vehiculesEnvisages = ["2019 Ancienne Locale"];
  etat.opportunites[0].vehiculesDetail = [vehicule("ve-99", "Ancienne", "Locale", 2019)];
  // Témoin : la démonstration de l'onglet doit être gardée (preuve que l'état sauvegardé a été relu).
  etat.opportunites[3].vehiculesEnvisages = ["2021 Toyota RAV4"];
  const cle = Object.keys(premier.stockage)[0] || "phineas.salesos.prospects.v1:Moi";
  const stockage = {};
  stockage[cle] = JSON.stringify(etat);
  const { P } = chargerProspects(stockage);
  assert.deepEqual(libelles(P.opportunite("o-chloe")), ["2021 Toyota RAV4"], "l'état de l'onglet a bien été relu");
  assert.deepEqual(ids(P.vehiculesDe("oe-1")), ["ve-1", "ve-2"]);
  assert.deepEqual(libelles(P.opportunite("oe-1")), ["2024 Kia Sportage", "2023 Kia Sportage"]);
});

test("F21 : la fiche n'annonce rien avant le serveur et ne recopie pas le catalogue fictif dans un dossier réel", () => {
  const fiche = fs.readFileSync(path.join(racine, "wwwroot", "js", "prospects-fiche.js"), "utf8");
  const catalogue = fs.readFileSync(path.join(racine, "wwwroot", "js", "intelligence-vehicules.js"), "utf8");
  assert.ok(!/ajouterVehiculeEnvisage/.test(fiche), "la fiche ne fait aucun ajout local");
  assert.ok(!/Véhicule envisagé (ajouté|modifié|retiré)/.test(fiche), "les confirmations viennent du serveur seulement");
  assert.ok(/data-envisager-fiche/.test(catalogue) && !/pas encore enregistrables/.test(catalogue));
  assert.ok(!/(Réservé|Disponible en stock|Prix confirmé)/.test(fiche));
});
