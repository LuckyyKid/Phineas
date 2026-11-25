// Tests unitaires de la fonctionnalité 24 (essais routiers planifiés) côté navigateur : collection propre à chaque
// opportunité, affichage dans le fuseau commercial enregistré (même heure depuis Toronto, UTC ou Tokyo), envoi au
// serveur sans rien écrire dans l'onglet, démonstration jamais mêlée, aucune réservation ni vérification annoncée, et
// moteur d'intelligence non branché sur les essais réels.
// Lancement (Node 22 ou plus, aucune dépendance), depuis le dossier Phineas : node --test "Phineas.Tests/Js/*.test.js"
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const racine = path.join(__dirname, "..", "..", "Phineas");
const CREATION = "2026-11-20T15:00:00Z";
const fichier = (relatif) => fs.readFileSync(path.join(racine, relatif), "utf8");

// Essai tel que le serveur le projette (EssaiRoutierVue).
function essai(id, debutUtc, libelle, vehiculeId, duree) {
  return { id: id, vehiculeEnvisageId: vehiculeId || null, vehiculeLibelle: libelle, debutUtc: debutUtc, fuseau: "America/Toronto", dureeMinutes: duree || 45, commentaire: null };
}
// Prospect réel pe-1 : A (deux essais, hiver et été), B (un essai), C clôturée ; démonstration chloe.
const A = [essai("er-1", "2027-01-15T19:00:00Z", "2024 Kia Sportage EX", "ve-1"), essai("er-2", "2027-07-15T18:00:00Z", "Hyundai Tucson", null, 60)];
const B = [essai("er-3", "2027-12-12T15:00:00Z", "Kia Seltos")];

function opp(id, prospectId, etape, essais) {
  return { id: id, prospectId: prospectId, titre: id, etape: etape, dateCreation: CREATION, derniereActivite: CREATION, qualification: {},
    vehiculesEnvisages: [], vehiculesDetail: [], rendezVousEnregistres: [], essaisRoutiers: essais };
}
function charge() {
  return { referentiels: { typesContact: ["appel"], etapes: [{ cle: "Nouveau", libelle: "Nouveau" }] }, jeton: "jeton",
    urlFiche: "/Prospects/Fiche/__id__", urlPlanifierEssaiRoutier: "/Prospects/PlanifierEssaiRoutier",
    donnees: { conseillerConnecteId: "moi", conseillers: [{ id: "moi", nom: "Moi", estFictif: false }],
      contacts: [{ id: "pe-1", prenom: "Ana", nom: "Reel", conseillerId: "moi", enregistre: true, version: "V1" }, { id: "chloe", prenom: "Chloé", nom: "Démo", conseillerId: "moi" }],
      opportunites: [opp("oe-1", "pe-1", "Nouveau", A), opp("oe-2", "pe-1", "Nouveau", B), opp("oe-3", "pe-1", "Perdu", []), opp("o-chloe", "chloe", "Nouveau", undefined)],
      interactions: [] } };
}

// prospects-store.js chargé comme dans le navigateur. demo : faux module Rendez-vous avec un essai routier fictif.
function chargerProspects(stockage, demo) {
  stockage = stockage || {};
  const window = { sessionStorage: { getItem: (k) => (k in stockage ? stockage[k] : null), setItem: (k, v) => { stockage[k] = v; }, removeItem: (k) => { delete stockage[k]; } } };
  if (demo) window.RendezVous = { parOpportunite: () => [{ id: "r-local-1", type: "EssaiRoutier", debut: "2027-02-01T15:00:00Z", statut: "Confirme" }] };
  const document = { getElementById: (id) => (id === "prospects-donnees" ? { textContent: JSON.stringify(charge()) } : null), querySelector: () => null, addEventListener: () => {},
    createElement: () => ({ appendChild: () => {}, submit: () => {} }), body: { appendChild: () => {} } };
  vm.runInNewContext(fichier("wwwroot/js/prospects-store.js"), { window: window, document: document, console: console, Date: Date, JSON: JSON, Math: Math, Intl: Intl, encodeURIComponent: encodeURIComponent });
  return { P: window.Prospects, stockage: stockage };
}
function formulaire() {
  const f = { envois: 0, action: "", submit: () => { f.envois += 1; }, elements: { opportuniteId: { value: "" }, version: { value: "" } } };
  return f;
}
const ids = (liste) => Array.from(liste, (e) => e.id);

test("F24 : chaque opportunité n'a que ses propres essais enregistrés ; la démonstration n'en a aucun", () => {
  const { P } = chargerProspects();
  assert.deepEqual(ids(P.essaisRoutiersDe("oe-1")), ["er-1", "er-2"]);
  assert.deepEqual(ids(P.essaisRoutiersDe("oe-2")), ["er-3"]);
  assert.deepEqual(ids(P.essaisRoutiersDe("oe-3")), []);
  assert.deepEqual(ids(P.essaisRoutiersDe("o-chloe")), []);
  assert.deepEqual(ids(P.essaisRoutiersDe("oe-inconnue")), []);
});

test("F24 : un essai à 14 h à Toronto s'affiche 14 h, en hiver comme en été, depuis Toronto, UTC ou Tokyo", () => {
  const avant = process.env.TZ;
  try {
    for (const fuseauDuPoste of ["America/Toronto", "UTC", "Asia/Tokyo"]) {
      process.env.TZ = fuseauDuPoste;
      const { P } = chargerProspects();
      const hiver = P.formaterRendezVous(P.essaisRoutiersDe("oe-1")[0]);
      const ete = P.formaterRendezVous(P.essaisRoutiersDe("oe-1")[1]);
      assert.deepEqual([hiver.jour, hiver.debut, hiver.fin], ["vendredi 15 janvier 2027", "14 h 00", "14 h 45"], fuseauDuPoste);
      assert.deepEqual([ete.jour, ete.debut, ete.fin], ["jeudi 15 juillet 2027", "14 h 00", "15 h 00"], fuseauDuPoste);
    }
  } finally {
    if (avant === undefined) delete process.env.TZ; else process.env.TZ = avant;
  }
});

test("F24 : la planification part au serveur une seule fois (bonne opportunité, empreinte, adresse) sans rien écrire dans l'onglet", () => {
  const { P } = chargerProspects();
  const f = formulaire();
  assert.equal(P.envoyerEssaiRoutier("oe-2", f), true);
  assert.deepEqual([f.envois, f.action, f.elements.opportuniteId.value, f.elements.version.value], [1, "/Prospects/PlanifierEssaiRoutier", "oe-2", "V1"]);
  assert.deepEqual(ids(P.essaisRoutiersDe("oe-2")), ["er-3"], "rien n'est ajouté avant la réponse du serveur");
});

test("F24 : ni démonstration, ni opportunité clôturée, ni opportunité inconnue ne partent au serveur", () => {
  const { P } = chargerProspects();
  const f = formulaire();
  assert.equal(P.envoyerEssaiRoutier("o-chloe", f), false);
  assert.equal(P.envoyerEssaiRoutier("oe-3", f), false);
  assert.equal(P.envoyerEssaiRoutier("oe-inconnue", f), false);
  assert.equal(f.envois, 0);
});

test("F24 : un essai fictif de démonstration n'est jamais présenté comme un essai enregistré", () => {
  const { P } = chargerProspects(null, true);
  assert.deepEqual(ids(P.essaisRoutiersDe("oe-1")), ["er-1", "er-2"]);
});

test("F24 : un ancien état de l'onglet ne remplace jamais les essais du serveur d'un dossier réel", () => {
  const premier = chargerProspects();
  const etat = JSON.parse(JSON.stringify({ contacts: charge().donnees.contacts, opportunites: charge().donnees.opportunites, interactions: [], suivant: 1 }));
  etat.opportunites[0].essaisRoutiers = [essai("er-99", "2027-03-01T15:00:00Z", "Ancien essai local")];
  etat.opportunites[3].titre = "Témoin local";
  const cle = Object.keys(premier.stockage)[0] || "phineas.salesos.prospects.v1:Moi";
  const stockage = {};
  stockage[cle] = JSON.stringify(etat);
  const { P } = chargerProspects(stockage);
  assert.equal(P.opportunite("o-chloe").titre, "Témoin local", "l'état de l'onglet a bien été relu");
  assert.deepEqual(ids(P.essaisRoutiersDe("oe-1")), ["er-1", "er-2"]);
});

test("F24 : la fiche n'annonce ni réservation, ni permis ou assurance vérifiés, ni confirmation, ni résultat ; démonstration exclue", () => {
  const fiche = fichier("wwwroot/js/prospects-fiche.js");
  const debut = fiche.indexOf("function essaisRoutiersHtml");
  const bloc = fiche.slice(debut, fiche.indexOf("\n  }\n", debut));
  assert.ok(bloc.includes("if (!P.estEnregistree(o.id)) return \"\";"), "rien pour une opportunité de démonstration");
  assert.ok(bloc.includes("P.essaisRoutiersDe(o.id)") && bloc.includes("formaterRendezVous") && bloc.includes("data-essai-vide"));
  assert.ok(bloc.includes("aucun véhicule réservé") && bloc.includes("permis et assurance non vérifiés"));
  assert.ok(!/Confirmé|Réservé|Permis vérifié|Assurance validée|Essai terminé|Résultat|Annuler|Replanifier/.test(bloc));
  assert.ok(!/Essai routier planifié dans le dossier/.test(fiche), "la confirmation vient du serveur seulement");
});

test("F24 : le moteur d'intelligence ne lit pas les essais réels (aucune nouvelle obligation, rdvFutur inchangé)", () => {
  for (const f of ["wwwroot/js/intelligence-store.js", "wwwroot/js/intelligence-regles.js"]) assert.ok(!/essaisRoutiers/.test(fichier(f)), f);
  assert.ok(!/essaisRoutiers/.test(fichier("wwwroot/js/prospects-store.js").split("function rendezVousFuturs")[1].split("\n  }\n")[0]));
});

test("F24 : la fenêtre de planification ne demande ni permis, ni assurance, ni document d'identité", () => {
  const vue = fichier("Views/Prospects/Fiche.cshtml");
  const fenetre = vue.slice(vue.indexOf('id="modal-essai"'), vue.indexOf("Nouvelle opportunité ---------- *@"));
  const noms = Array.from(fenetre.matchAll(/name="([a-zA-Z]+)"/g), (m) => m[1]).sort();
  assert.deepEqual(noms, ["commentaire", "date", "dureeMinutes", "heure", "opportuniteId", "prospectId", "vehicule", "vehiculeId", "version"]);
  assert.ok(!/permis|assurance|identité|signature/i.test(fenetre.replace(/le permis et l'assurance ne sont pas vérifiés/, "")));
});
