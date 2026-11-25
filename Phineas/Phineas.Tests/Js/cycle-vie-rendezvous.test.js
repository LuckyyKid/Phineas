// Tests unitaires de la fonctionnalité 23 (cycle de vie des rendez-vous commerciaux enregistrés) côté navigateur :
// actions proposées selon le statut et l'heure (même règle que le serveur), horaire repris dans le fuseau du rendez-vous,
// envois au serveur sans rien écrire dans l'onglet, et rdvFutur du moteur d'intelligence calculé à partir des seuls
// rendez-vous enregistrés planifiés et à venir (intelligence-store.js chargé avec le vrai moteur de règles).
// Lancement (Node 22 ou plus, aucune dépendance), depuis le dossier Phineas : node --test "Phineas.Tests/Js/*.test.js"
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const racine = path.join(__dirname, "..", "..", "Phineas");
const JOUR = 86400000;
// Horloge fixe de tous les tests : 10 janvier 2027, 15 h UTC (10 h à Toronto). Aucune dépendance à l'heure réelle.
const MAINTENANT = Date.parse("2027-01-10T15:00:00Z");

// Date dont « maintenant » est MAINTENANT (new Date() et Date.now()) ; toute autre date est inchangée.
class DateFixe extends Date {
  constructor(...valeurs) {
    if (valeurs.length === 0) super(MAINTENANT);
    else super(...valeurs);
  }
  static now() {
    return MAINTENANT;
  }
}

// Rendez-vous tel que le serveur le projette (RendezVousEnregistreVue).
function rdv(id, debutUtc, statut, extra) {
  return Object.assign({ id: id, type: "Consultation", typeLibelle: "Consultation automobile", debutUtc: debutUtc, fuseau: "America/Toronto", dureeMinutes: 45,
    mode: "concession", modeLibelle: "En concession", lieu: "Salle A", objectif: null, commentaire: null, statut: statut || "Planifie",
    statutLibelle: statut || "Planifié", historique: [{ type: "Creation", date: "2027-01-05T12:00:00Z", auteur: "", texte: "Rendez-vous planifié." }] }, extra || {});
}
const CREATION = new Date(MAINTENANT - 20 * JOUR).toISOString();
const HIER = new Date(MAINTENANT - JOUR).toISOString();
function opp(id, prospectId, liste, extra) {
  return Object.assign({ id: id, prospectId: prospectId, titre: "Projet " + id, etape: "Qualifie", dateCreation: CREATION, derniereActivite: HIER,
    prochaineAction: null, dateProchaineAction: null, qualification: { categorie: "vus" }, vehiculesEnvisages: ["Kia Sportage"], rendezVousEnregistres: liste }, extra || {});
}

// Données de la fiche, comme ProspectsController les sérialise. opportunites : remplace les opportunités par défaut.
function chargeProspects(opportunites) {
  return { referentiels: { typesContact: ["appel"], etapes: [{ cle: "Nouveau", libelle: "Nouveau" }, { cle: "Qualifie", libelle: "Qualifié" }] }, jeton: "jeton",
    urlFiche: "/Prospects/Fiche/__id__", urlPlanifierRendezVous: "/Prospects/PlanifierRendezVous", urlModifierRendezVous: "/Prospects/ModifierRendezVous",
    urlReplanifierRendezVous: "/Prospects/ReplanifierRendezVous", urlChangerStatutRendezVous: "/Prospects/ChangerStatutRendezVous",
    donnees: { conseillerConnecteId: "moi", conseillers: [{ id: "moi", nom: "Moi", estFictif: false }],
      contacts: [{ id: "pe-1", prenom: "Ana", nom: "Reel", conseillerId: "moi", enregistre: true, version: "V1" }, { id: "chloe", prenom: "Chloé", nom: "Démo", conseillerId: "moi" }],
      opportunites: opportunites || [
        opp("oe-1", "pe-1", [rdv("rv-1", "2027-01-15T19:00:00Z"), rdv("rv-2", "2027-01-08T15:00:00Z"), rdv("rv-3", "2027-01-20T15:00:00Z", "Annule")]),
        opp("oe-2", "pe-1", [rdv("rv-4", "2027-02-01T15:00:00Z")]),
        opp("o-chloe", "chloe", undefined),
      ],
      interactions: [] } };
}

// Faux document : les balises de données, et les formulaires créés par posterSuivi (gardés pour être vérifiés).
function documentDe(balises, postes) {
  return {
    getElementById: (id) => (id in balises ? { textContent: JSON.stringify(balises[id]) } : null),
    querySelector: () => null, addEventListener: () => {},
    createElement: () => {
      const f = { champs: {}, appendChild: (i) => { f.champs[i.name] = i.value; }, submit: () => postes.push(f) };
      return f;
    },
    body: { appendChild: () => {} },
  };
}
function contexteVm(window, document) {
  return { window: window, document: document, console: console, Date: DateFixe, JSON: JSON, Math: Math, Intl: Intl, encodeURIComponent: encodeURIComponent };
}

// prospects-store.js seul, comme sur la fiche.
function chargerProspects(opportunites) {
  const postes = [];
  const stockage = {};
  const window = { sessionStorage: { getItem: (k) => (k in stockage ? stockage[k] : null), setItem: (k, v) => { stockage[k] = v; }, removeItem: (k) => { delete stockage[k]; } } };
  const document = documentDe({ "prospects-donnees": chargeProspects(opportunites) }, postes);
  vm.runInNewContext(fs.readFileSync(path.join(racine, "wwwroot", "js", "prospects-store.js"), "utf8"), contexteVm(window, document));
  return { P: window.Prospects, postes: postes };
}

// Référentiels du moteur lus dans le code C# (une seule source), comme veille-recommandations.test.js.
const sourceIntel = fs.readFileSync(path.join(racine, "Models", "ViewModels", "Conseiller", "IntelligenceViewModels.cs"), "utf8");
const regles = [];
for (const m of sourceIntel.matchAll(/\("([a-z-]+)", "([^"]+)", "([a-z]+)", "(Faible|Normal|Eleve|Urgent)", "([a-z]+)"\)/g)) {
  regles.push({ cle: m[1], libelle: m[2], categorie: m[3], priorite: m[4], nature: m[5] });
}
const config = {};
for (const m of sourceIntel.matchAll(/public const int (\w+) = (\d+);/g)) config[m[1].charAt(0).toLowerCase() + m[1].slice(1)] = Number(m[2]);

// prospects-store.js, puis le vrai moteur (intelligence-regles.js) et intelligence-store.js, dans la même fenêtre.
// Les modules de démonstration (soumissions, transactions, matching) sont vides ; demoRendezVous : rendez-vous locaux
// fictifs du module Rendez-vous, éventuellement rattachés (à tort) à une opportunité réelle.
function chargerMoteur(opportunites, demoRendezVous) {
  const postes = [];
  const stockage = {};
  const window = { sessionStorage: { getItem: (k) => (k in stockage ? stockage[k] : null), setItem: (k, v) => { stockage[k] = v; }, removeItem: (k) => { delete stockage[k]; } } };
  const chargeIntel = { donnees: { veilles: [], blocagesConnus: {}, pauses: [], preferences: [], indispensables: {}, demandes: [], etatsActions: [] },
    referentiels: { priorites: [{ cle: "Faible", libelle: "Faible" }, { cle: "Normal", libelle: "Normal" }, { cle: "Eleve", libelle: "Élevé" }, { cle: "Urgent", libelle: "Urgent" }],
      regles: regles, config: config }, conseillerNom: "Moi" };
  const document = documentDe({ "prospects-donnees": chargeProspects(opportunites), "intelligence-donnees": chargeIntel }, postes);
  const ctx = vm.createContext(contexteVm(window, document));
  const lancer = (fichier) => vm.runInContext(fs.readFileSync(path.join(racine, "wwwroot", "js", fichier), "utf8"), ctx);
  lancer("prospects-store.js");
  const locaux = demoRendezVous || [];
  window.Soumissions = { abonner: () => {}, parOpportunite: () => [], liste: () => [], inventaire: () => [], vehicule: () => null, nomVehicule: () => "" };
  window.Transactions = { abonner: () => {}, liste: () => [], parOpportunite: () => [], enCoursPourOpportunite: () => null, statutVehicule: () => null };
  window.RendezVous = {
    abonner: () => {}, parOpportunite: (id) => locaux.filter((r) => r.opportuniteId === id), liste: () => [],
    estActif: (r) => ["Planifie", "AConfirmer", "Confirme", "EnCours"].indexOf(r.statut) >= 0,
    fin: (r) => new Date(new Date(r.debut).getTime() + r.dureeMinutes * 60000),
  };
  window.IntelligenceMatching = { depuisOpportunite: () => ({}), classer: () => [] };
  lancer("intelligence-regles.js");
  window.IntelligenceRegles = ctx.IntelligenceRegles; // le moteur s'inscrit sur l'objet global du script
  lancer("intelligence-store.js");
  return { P: window.Prospects, I: window.Intelligence };
}
// Copie simple d'une valeur venue de la VM (ses tableaux et objets ont un autre prototype).
const simple = (x) => JSON.parse(JSON.stringify(x));
const regleSansAction = (I, oppId) => I.actives().filter((a) => a.opportuniteId === oppId && a.regle === "opportunite-sans-action");

// ---------- Actions proposées ----------

test("F23 : avant le début, modifier, replanifier ou annuler ; à partir du début, déclarer ; un statut définitif n'a plus rien", () => {
  const { P } = chargerProspects();
  const m = new DateFixe();
  const debut = "2027-01-15T19:00:00Z";
  assert.deepEqual(simple(P.actionsRendezVous(rdv("rv-a", debut), m)), ["modifier", "replanifier", "annuler"]);
  assert.deepEqual(simple(P.actionsRendezVous(rdv("rv-a", debut), new Date(Date.parse(debut) - 60000))), ["modifier", "replanifier", "annuler"]);
  assert.deepEqual(simple(P.actionsRendezVous(rdv("rv-a", debut), new Date(debut))), ["realiser", "absent"]);
  assert.deepEqual(simple(P.actionsRendezVous(rdv("rv-a", debut), new Date(Date.parse(debut) + 3 * JOUR))), ["realiser", "absent"]);
  for (const statut of ["Annule", "Termine", "ClientAbsent"]) {
    assert.deepEqual(simple(P.actionsRendezVous(rdv("rv-a", debut, statut), m)), [], statut);
    assert.deepEqual(simple(P.actionsRendezVous(rdv("rv-a", debut, statut), new Date(Date.parse(debut) + JOUR))), [], statut);
  }
  assert.deepEqual(simple(P.actionsRendezVous(null, m)), []);
});

test("F23 : un rendez-vous passé reste « Planifié » côté navigateur (aucune absence déduite de l'heure)", () => {
  const { P } = chargerProspects();
  const passe = P.rendezVousEnregistre("oe-1", "rv-2");
  assert.equal(passe.statut, "Planifie");
  assert.deepEqual(simple(P.actionsRendezVous(passe, new DateFixe())), ["realiser", "absent"]);
});

test("F23 : l'horaire repris pour la replanification est celui du fuseau du rendez-vous, depuis Toronto, UTC ou Tokyo", () => {
  const avant = process.env.TZ;
  try {
    for (const fuseauDuPoste of ["America/Toronto", "UTC", "Asia/Tokyo"]) {
      process.env.TZ = fuseauDuPoste;
      const { P } = chargerProspects();
      assert.deepEqual(simple(P.champsHoraire(rdv("x", "2027-01-15T19:00:00Z"))), { date: "2027-01-15", heure: "14:00" }, "hiver " + fuseauDuPoste);
      assert.deepEqual(simple(P.champsHoraire(rdv("x", "2027-07-15T18:00:00Z"))), { date: "2027-07-15", heure: "14:00" }, "été " + fuseauDuPoste);
      // 23 h 30 à Toronto : déjà le lendemain en UTC et à Tokyo, mais la date commerciale reste le 20.
      assert.deepEqual(simple(P.champsHoraire(rdv("x", "2027-01-21T04:30:00Z"))), { date: "2027-01-20", heure: "23:30" }, "passage de date " + fuseauDuPoste);
      // Minuit commercial : « 00:00 », jamais « 24:00 ».
      assert.deepEqual(simple(P.champsHoraire(rdv("x", "2027-01-21T05:00:00Z"))), { date: "2027-01-21", heure: "00:00" }, "minuit " + fuseauDuPoste);
    }
  } finally {
    if (avant === undefined) delete process.env.TZ; else process.env.TZ = avant;
  }
});

// ---------- Envois au serveur ----------

test("F23 : modifier et replanifier envoient le formulaire à leur adresse avec l'opportunité, le rendez-vous et l'empreinte", () => {
  const { P } = chargerProspects();
  for (const [operation, url] of [["modifier", "/Prospects/ModifierRendezVous"], ["replanifier", "/Prospects/ReplanifierRendezVous"]]) {
    const f = { envois: 0, action: "", submit: () => { f.envois += 1; }, elements: { opportuniteId: { value: "" }, rendezVousId: { value: "" }, version: { value: "" } } };
    assert.equal(P.envoyerCycleRendezVous("oe-1", "rv-1", f, operation), true);
    assert.deepEqual([f.envois, f.action, f.elements.opportuniteId.value, f.elements.rendezVousId.value, f.elements.version.value], [1, url, "oe-1", "rv-1", "V1"]);
  }
  assert.equal(P.rendezVousEnregistre("oe-1", "rv-1").lieu, "Salle A", "rien n'est écrit dans l'onglet avant la réponse du serveur");
});

test("F23 : changer le statut poste un formulaire (jeton compris) et rien n'est changé dans l'onglet", () => {
  const { P, postes } = chargerProspects();
  assert.equal(P.envoyerStatutRendezVous("oe-1", "rv-1", "Annule"), true);
  assert.equal(postes.length, 1);
  assert.equal(postes[0].action, "/Prospects/ChangerStatutRendezVous");
  assert.deepEqual(postes[0].champs, { prospectId: "pe-1", opportuniteId: "oe-1", rendezVousId: "rv-1", statut: "Annule", version: "V1", __RequestVerificationToken: "jeton" });
  assert.equal(P.rendezVousEnregistre("oe-1", "rv-1").statut, "Planifie");
});

test("F23 : un rendez-vous d'une autre opportunité, inconnu ou de démonstration ne part jamais au serveur", () => {
  const { P, postes } = chargerProspects();
  const f = { envois: 0, submit: () => { f.envois += 1; }, elements: { opportuniteId: { value: "" }, rendezVousId: { value: "" }, version: { value: "" } } };
  assert.equal(P.envoyerCycleRendezVous("oe-2", "rv-1", f, "modifier"), false, "rv-1 est à oe-1");
  assert.equal(P.envoyerCycleRendezVous("oe-1", "rv-99", f, "replanifier"), false);
  assert.equal(P.envoyerCycleRendezVous("o-chloe", "rv-1", f, "modifier"), false);
  assert.equal(P.envoyerStatutRendezVous("oe-2", "rv-1", "Annule"), false);
  assert.equal(P.envoyerStatutRendezVous("o-chloe", "rv-1", "Termine"), false);
  assert.equal(P.rendezVousEnregistre("oe-2", "rv-1"), null);
  assert.equal(f.envois + postes.length, 0);
});

// ---------- Rendez-vous à venir (rdvFutur) ----------

test("F23 : seuls les rendez-vous planifiés et pas encore commencés de CETTE opportunité sont « à venir »", () => {
  const { P } = chargerProspects();
  const m = new DateFixe();
  assert.deepEqual(simple(P.rendezVousFuturs("oe-1", m).map((r) => r.id)), ["rv-1"], "rv-2 est passé, rv-3 est annulé");
  assert.deepEqual(simple(P.rendezVousFuturs("oe-2", m).map((r) => r.id)), ["rv-4"]);
  assert.deepEqual(simple(P.rendezVousFuturs("o-chloe", m)), []);
  // Début atteint : il ne compte plus, sans changer de statut.
  assert.deepEqual(simple(P.rendezVousFuturs("oe-1", new Date("2027-01-15T19:00:00Z")).map((r) => r.id)), []);
});

test("F23 : moteur, A avec un rendez-vous à venir n'a pas « sans action » ; B sans rendez-vous l'a, indépendamment de A", () => {
  const A = opp("oe-a", "pe-1", [rdv("rv-a", "2027-01-15T19:00:00Z")]);
  const B = opp("oe-b", "pe-1", []);
  const { I } = chargerMoteur([A, B]);
  assert.equal(regleSansAction(I, "oe-a").length, 0);
  assert.equal(regleSansAction(I, "oe-b").length, 1);
  assert.match(regleSansAction(I, "oe-b")[0].motif, /Aucune prochaine action ni rendez-vous à venir/);
});

for (const [statut, nom] of [["Annule", "annulé"], ["Termine", "réalisé"], ["ClientAbsent", "absent"]]) {
  test("F23 : moteur, un rendez-vous " + nom + " ne compte plus comme rendez-vous à venir", () => {
    const A = opp("oe-a", "pe-1", [rdv("rv-a", "2027-01-15T19:00:00Z", statut)]);
    const { I } = chargerMoteur([A]);
    assert.equal(regleSansAction(I, "oe-a").length, 1);
  });
}

test("F23 : moteur, un rendez-vous planifié dont le début est passé ne compte plus comme à venir", () => {
  const { I } = chargerMoteur([opp("oe-a", "pe-1", [rdv("rv-a", "2027-01-10T14:00:00Z")])]);
  assert.equal(regleSansAction(I, "oe-a").length, 1);
});

test("F23 : moteur, un rendez-vous fictif de démonstration n'est jamais la preuve d'un rendez-vous réel", () => {
  const fictif = { id: "r-local-1", opportuniteId: "oe-a", debut: "2027-01-20T15:00:00Z", dureeMinutes: 45, statut: "Confirme" };
  const { I } = chargerMoteur([opp("oe-a", "pe-1", [])], [fictif]);
  assert.equal(regleSansAction(I, "oe-a").length, 1);
  // Contrôle : le même rendez-vous fictif compte toujours pour une opportunité de démonstration.
  const demo = opp("o-demo", "chloe", undefined);
  const { I: I2 } = chargerMoteur([demo], [Object.assign({}, fictif, { opportuniteId: "o-demo" })]);
  assert.equal(regleSansAction(I2, "o-demo").length, 0);
});

test("F23 : moteur, la qualification manquante reste détectée avec un rendez-vous à venir (seule la raison de priorité change)", () => {
  const nouveau = { etape: "AQualifier", qualification: {}, vehiculesEnvisages: [] };
  const sans = chargerMoteur([opp("oe-a", "pe-1", [], nouveau)]).I.actives().filter((a) => a.regle === "qualification-manquante");
  const avec = chargerMoteur([opp("oe-a", "pe-1", [rdv("rv-a", "2027-01-15T19:00:00Z")], nouveau)]).I.actives().filter((a) => a.regle === "qualification-manquante");
  assert.equal(sans.length, 1);
  assert.equal(avec.length, 1, "un rendez-vous ne supprime pas l'obligation de qualifier");
  assert.ok(avec[0].raisonsPriorite.some((r) => /prochaine étape est déjà planifiée/.test(r)));
  assert.ok(!sans[0].raisonsPriorite.some((r) => /prochaine étape est déjà planifiée/.test(r)));
});

test("F23 : moteur, un rendez-vous réalisé ne crée ni première réponse, ni contact, ni suivi", () => {
  const nouveau = { etape: "Nouveau" };
  const realise = chargerMoteur([opp("oe-a", "pe-1", [rdv("rv-a", "2027-01-08T15:00:00Z", "Termine")], nouveau)]).I;
  const absent = chargerMoteur([opp("oe-a", "pe-1", [rdv("rv-a", "2027-01-08T15:00:00Z", "ClientAbsent")], nouveau)]).I;
  for (const I of [realise, absent]) {
    assert.equal(I.actives().filter((a) => a.regle === "premiere-reponse").length, 1, "la première réponse reste à faire");
    assert.equal(I.actives().filter((a) => a.regle === "suivi-echeance").length, 0);
  }
});

test("F23 : moteur, aucune règle de rendez-vous de démonstration n'est produite pour un rendez-vous réel", () => {
  const { I } = chargerMoteur([opp("oe-a", "pe-1", [rdv("rv-a", "2027-01-10T16:00:00Z"), rdv("rv-b", "2027-01-08T15:00:00Z")])]);
  const regles = I.actives().map((a) => a.regle);
  for (const r of ["rdv-a-confirmer", "rdv-a-preparer", "rdv-sans-resultat", "rdv-client-absent"]) assert.ok(regles.indexOf(r) < 0, r);
});

// ---------- Fiche ----------

test("F23 : la fiche montre le statut en mots, l'historique et seulement les actions permises ; aucune annonce trompeuse", () => {
  const fiche = fs.readFileSync(path.join(racine, "wwwroot", "js", "prospects-fiche.js"), "utf8");
  const debut = fiche.indexOf("function actionsRendezVousHtml");
  const bloc = fiche.slice(debut, fiche.indexOf("function rendezVousHtml", debut));
  assert.ok(bloc.includes("P.actionsRendezVous(r, new Date())"), "les boutons suivent la même règle que le serveur");
  assert.ok(bloc.includes("r.statutLibelle") && bloc.includes("data-rendezvous-historique"));
  assert.ok(!/Invitation envoyée|Confirmé avec le client|Réservé/.test(bloc));
  const confirmations = fiche.slice(fiche.indexOf("var CHANGEMENTS_STATUT_RENDEZVOUS"), fiche.indexOf("function changerStatutRendezVous"));
  assert.ok(/définitif/.test(confirmations) && /aucun contact ni suivi n'est enregistré automatiquement/.test(confirmations));
});
