// Tests unitaires de la fonctionnalité 22 (rendez-vous commerciaux enregistrés) côté navigateur : collection propre à
// chaque opportunité, affichage TOUJOURS dans le fuseau commercial enregistré (même heure depuis Toronto, UTC ou
// Tokyo), envoi au serveur sans rien écrire dans l'onglet, démonstration jamais mêlée aux rendez-vous réels.
// Lancement (Node 22 ou plus, aucune dépendance), depuis le dossier Phineas : node --test "Phineas.Tests/Js/*.test.js"
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const racine = path.join(__dirname, "..", "..", "Phineas");
const CREATION = new Date(2026, 10, 20, 10, 0, 0).toISOString();

function rdv(id, debutUtc, duree) {
  return { id: id, type: "Consultation", typeLibelle: "Consultation automobile", debutUtc: debutUtc, fuseau: "America/Toronto", dureeMinutes: duree || 45,
    mode: "concession", modeLibelle: "En concession", lieu: null, objectif: null, commentaire: null };
}
// Prospect réel pe-1 : A (hiver et été), B (un rendez-vous), C clôturée ; démonstration chloe.
const A = [rdv("rv-1", "2027-01-15T19:00:00Z"), rdv("rv-2", "2027-07-15T18:00:00Z", 60)];
const B = [rdv("rv-3", "2027-12-12T15:00:00Z")];

function opp(id, prospectId, etape, liste) {
  return { id: id, prospectId: prospectId, titre: id, etape: etape, dateCreation: CREATION, derniereActivite: CREATION, qualification: {},
    vehiculesEnvisages: [], rendezVousEnregistres: liste };
}
function charge() {
  return { referentiels: { typesContact: ["appel"], etapes: [{ cle: "Nouveau", libelle: "Nouveau" }] }, jeton: "jeton",
    urlFiche: "/Prospects/Fiche/__id__", urlPlanifierRendezVous: "/Prospects/PlanifierRendezVous",
    donnees: { conseillerConnecteId: "moi", conseillers: [{ id: "moi", nom: "Moi", estFictif: false }],
      contacts: [{ id: "pe-1", prenom: "Ana", nom: "Reel", conseillerId: "moi", enregistre: true, version: "V1" }, { id: "chloe", prenom: "Chloé", nom: "Démo", conseillerId: "moi" }],
      opportunites: [opp("oe-1", "pe-1", "Nouveau", A), opp("oe-2", "pe-1", "Nouveau", B), opp("oe-3", "pe-1", "Perdu", []), opp("o-chloe", "chloe", "Nouveau", undefined)],
      interactions: [] } };
}

// prospects-store.js chargé comme dans le navigateur. demo : faux module Rendez-vous (rendez-vous locaux de l'onglet).
function chargerProspects(stockage, demo) {
  const code = fs.readFileSync(path.join(racine, "wwwroot", "js", "prospects-store.js"), "utf8");
  const ch = charge();
  stockage = stockage || {};
  const window = { sessionStorage: { getItem: (k) => (k in stockage ? stockage[k] : null), setItem: (k, v) => { stockage[k] = v; }, removeItem: (k) => { delete stockage[k]; } } };
  if (demo) window.RendezVous = { parOpportunite: () => [{ id: "r-local-1", debut: "2027-02-01T15:00:00Z", statut: "Confirme" }] };
  const document = { getElementById: (id) => (id === "prospects-donnees" ? { textContent: JSON.stringify(ch) } : null), querySelector: () => null, addEventListener: () => {},
    createElement: () => ({ appendChild: () => {}, submit: () => {} }), body: { appendChild: () => {} } };
  vm.runInNewContext(code, { window: window, document: document, console: console, Date: Date, JSON: JSON, Math: Math, Intl: Intl, encodeURIComponent: encodeURIComponent });
  return { P: window.Prospects, stockage: stockage };
}

function formulaire() {
  const f = { envois: 0, submit: () => { f.envois += 1; }, elements: { opportuniteId: { value: "" }, version: { value: "" } } };
  return f;
}
const ids = (liste) => Array.from(liste, (r) => r.id);

test("F22 : chaque opportunité n'a que ses propres rendez-vous enregistrés ; la démonstration n'en a aucun", () => {
  const { P } = chargerProspects();
  assert.deepEqual(ids(P.rendezVousDe("oe-1")), ["rv-1", "rv-2"]);
  assert.deepEqual(ids(P.rendezVousDe("oe-2")), ["rv-3"]);
  assert.deepEqual(ids(P.rendezVousDe("oe-3")), []);
  assert.deepEqual(ids(P.rendezVousDe("o-chloe")), []);
  assert.deepEqual(ids(P.rendezVousDe("oe-inconnue")), []);
});

test("F22 : 14 h à Toronto s'affiche 14 h, en hiver comme en été, depuis un poste à Toronto, en UTC ou à Tokyo", () => {
  const avant = process.env.TZ;
  try {
    for (const fuseauDuPoste of ["America/Toronto", "UTC", "Asia/Tokyo"]) {
      process.env.TZ = fuseauDuPoste;
      const { P } = chargerProspects();
      const hiver = P.formaterRendezVous(A[0]);
      const ete = P.formaterRendezVous(A[1]);
      assert.deepEqual([hiver.jour, hiver.debut, hiver.fin], ["vendredi 15 janvier 2027", "14 h 00", "14 h 45"], fuseauDuPoste);
      assert.deepEqual([ete.jour, ete.debut, ete.fin], ["jeudi 15 juillet 2027", "14 h 00", "15 h 00"], fuseauDuPoste);
      assert.equal(hiver.fuseau, "America/Toronto");
      // Contrôle indépendant : à ce même instant, l'heure du poste diffère quand il n'est pas à Toronto.
      if (fuseauDuPoste === "Asia/Tokyo") assert.equal(new Date(A[0].debutUtc).getHours(), 4);
    }
  } finally {
    if (avant === undefined) delete process.env.TZ; else process.env.TZ = avant;
  }
});

test("F22 : la planification part au serveur une seule fois (bonne opportunité, empreinte) sans rien écrire dans l'onglet", () => {
  const { P } = chargerProspects();
  const f = formulaire();
  assert.equal(P.envoyerRendezVous("oe-2", f), true);
  assert.equal(f.envois, 1);
  assert.deepEqual([f.elements.opportuniteId.value, f.elements.version.value], ["oe-2", "V1"]);
  assert.deepEqual(ids(P.rendezVousDe("oe-2")), ["rv-3"], "rien n'est ajouté avant la réponse du serveur");
});

test("F22 : ni démonstration, ni opportunité clôturée, ni opportunité inconnue ne partent au serveur", () => {
  const { P } = chargerProspects();
  const f = formulaire();
  assert.equal(P.envoyerRendezVous("o-chloe", f), false);
  assert.equal(P.envoyerRendezVous("oe-3", f), false);
  assert.equal(P.envoyerRendezVous("oe-inconnue", f), false);
  assert.equal(f.envois, 0);
});

test("F22 : un rendez-vous local de démonstration n'est jamais présenté comme un rendez-vous enregistré", () => {
  const { P } = chargerProspects(null, true);
  assert.deepEqual(ids(P.rendezVousDe("oe-1")), ["rv-1", "rv-2"]);
  assert.ok(!ids(P.rendezVousDe("oe-1")).includes("r-local-1"));
});

test("F22 : un ancien état de l'onglet ne remplace jamais les rendez-vous du serveur d'un dossier réel", () => {
  const premier = chargerProspects();
  const etat = JSON.parse(JSON.stringify({ contacts: charge().donnees.contacts, opportunites: charge().donnees.opportunites, interactions: [], suivant: 1 }));
  etat.opportunites[0].rendezVousEnregistres = [rdv("rv-99", "2027-03-01T15:00:00Z")];
  etat.opportunites[3].titre = "Témoin local"; // la démonstration de l'onglet doit être gardée (état bien relu)
  const cle = Object.keys(premier.stockage)[0] || "phineas.salesos.prospects.v1:Moi";
  const stockage = {};
  stockage[cle] = JSON.stringify(etat);
  const { P } = chargerProspects(stockage);
  assert.equal(P.opportunite("o-chloe").titre, "Témoin local", "l'état de l'onglet a bien été relu");
  assert.deepEqual(ids(P.rendezVousDe("oe-1")), ["rv-1", "rv-2"]);
});

// Depuis F23, le libellé du statut vient du serveur (statutLibelle) et les commandes du cycle de vie existent : elles
// sont vérifiées par cycle-vie-rendezvous.test.js. Ce test garde ce que F22 interdisait toujours d'annoncer.
test("F22 : la fiche n'annonce ni invitation envoyée, ni confirmation du client, ni réservation", () => {
  const fiche = fs.readFileSync(path.join(racine, "wwwroot", "js", "prospects-fiche.js"), "utf8");
  const debut = fiche.indexOf("function rendezVousEnregistresHtml");
  const bloc = fiche.slice(debut, fiche.indexOf("\n  }\n", debut));
  assert.ok(bloc.includes("r.statutLibelle") && bloc.includes("aucune invitation envoyée") && bloc.includes("formaterRendezVous"));
  assert.ok(!/Confirmé|Invitation envoyée|Réservé/.test(bloc));
  assert.ok(!/Rendez-vous enregistré dans le dossier/.test(fiche), "la confirmation vient du serveur seulement");
});
