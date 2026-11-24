// Tests unitaires de la protection des obligations réelles contre les états locaux (fonctionnalité 15) :
// statuts du navigateur (Ignorée, Commencée, Confiée, Terminée, report local), préférences de contact et pauses ne
// masquent, ne suspendent et ne clôturent jamais une obligation d'un dossier réel (« oe- », « pe- »). La démonstration
// garde son comportement local, et la veille enregistrée (fonctionnalité 14) reste la seule mise de côté valable.
// Même enchaînement que intelligence-store.js : Regles.statutPresente, puis statuts actifs ATraiter et EnCours.
// Lancement (Node 22 ou plus, aucune dépendance), depuis le dossier Phineas : node --test "Phineas.Tests/Js/*.test.js"
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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

const HEURE = 3600000, JOUR = 86400000;
const MAINTENANT = new Date(2026, 10, 24, 14, 0, 0);
const CREATION = new Date(MAINTENANT.getTime() - 2 * JOUR).toISOString();
const apresDemande = (ms) => new Date(new Date(CREATION).getTime() + ms).toISOString();
const jourA9h = (d) => new Date(2026, 10, 24 + d, 9, 0, 0).toISOString();
const dans = (ms) => new Date(MAINTENANT.getTime() + ms).toISOString();
const ACTIFS = ["ATraiter", "EnCours"];

function opportunite(id, prospectId, suivi) {
  return { id: id, prospectId: prospectId, titre: "Opportunité " + id, etape: "Nouveau", etapeLibelle: "Nouveau", conseillerId: "moi",
    dateCreation: CREATION, derniereActivite: CREATION, vehiculesEnvisages: [],
    prochaineAction: suivi === undefined ? null : "Préparer le dossier de financement", dateProchaineAction: suivi === undefined ? null : jourA9h(suivi) };
}
let numero = 0;
function note(type, prospectId, oppId, date) {
  numero += 1;
  const prefixe = type.indexOf("suivi-") === 0 ? "ie-s" : String(prospectId).indexOf("pe-") === 0 ? "ie-n" : "i-";
  return { id: prefixe + numero, prospectId: prospectId, opportuniteId: oppId, date: date, type: type, auteur: "Moi", resume: type };
}
function contexte(opps, options) {
  options = options || {};
  const pids = [...new Set(opps.map((o) => o.prospectId))];
  return { maintenant: MAINTENANT, ref: { config: config, regles: regles, libellesPriorite: { Faible: "Faible", Normal: "Normal", Eleve: "Élevé", Urgent: "Urgent" } },
    contacts: pids.map((id) => ({ id: id, prenom: "Client", nom: id, conseillerId: "moi" })), opportunites: opps, interactions: options.interactions || [], typesContact: typesContact,
    soumissions: [], rendezVous: [], transactions: [], relations: null, preferences: options.preferences || {}, pauses: options.pauses || {}, correspondances: [] };
}

// Recommandations présentées, comme intelligence-store.js (actives) : statut présenté, puis statuts actifs.
// etatsLocaux : { identifiant: état local du navigateur } ; veilles : veilles enregistrées (fonctionnalité 14).
function presentees(ctx, etatsLocaux, veilles) {
  return Regles.analyser(ctx).actions.filter((x) => ACTIFS.indexOf(Regles.statutPresente(x, (etatsLocaux || {})[x.id], veilles || {}, MAINTENANT).statut) >= 0);
}
const regleDe = (l) => l.map((a) => a.regle).sort();

// États locaux tels que les enregistrait l'ancienne interface (sessionStorage « phineas.salesos.intelligence.v1 »).
const IGNOREE = { statut: "Ignoree", motif: "deja-fait", historique: [] };
const CONFIEE = { statut: "ATraiter", assignation: { collegueId: "c-antoine", collegue: "Antoine", motif: "absence" }, historique: [] };
const COMMENCEE = { statut: "EnCours", historique: [] };
const TERMINEE = { statut: "Terminee", termineeLe: dans(-HEURE), historique: [] };
const REPORTEE = { statut: "Reportee", reporteJusqua: dans(5 * JOUR), historique: [] };

// ---------- Dossier réel ----------
test("estDossierReel : opportunité « oe- » ou prospect « pe- » seulement", () => {
  assert.equal(Regles.estDossierReel({ opportuniteId: "oe-3" }), true);
  assert.equal(Regles.estDossierReel({ prospectId: "pe-3" }), true);
  assert.equal(Regles.estDossierReel({ opportuniteId: "o-chloe-rav4", prospectId: "chloe-bouchard" }), false);
  assert.equal(Regles.estDossierReel({ opportuniteId: "o-local-1", prospectId: "p-local-1" }), false);
  assert.equal(Regles.estDossierReel({}), false);
});

for (const [nom, etat] of [["Ignorée", IGNOREE], ["Terminée (ancien état)", TERMINEE], ["reportée localement", REPORTEE], ["Commencée", COMMENCEE]]) {
  test("dossier réel : un statut local « " + nom + " » ne retire ni le suivi échu ni la première réponse", () => {
    const ctx = contexte([opportunite("oe-1", "pe-1", 0)]);
    const etats = { "suivi-echeance:oe-1:2026-11-24": etat, "premiere-reponse:oe-1": etat };
    assert.deepEqual(regleDe(presentees(ctx, etats)), ["premiere-reponse", "suivi-echeance"]);
    Regles.analyser(ctx).actions.forEach((x) => assert.equal(Regles.statutPresente(x, etat, {}, MAINTENANT).statut, "ATraiter"));
  });
}

test("dossier réel : « Confiée » localement ne transfère rien, l'obligation reste au conseiller propriétaire", () => {
  const x = Regles.analyser(contexte([opportunite("oe-1", "pe-1", 0)])).actions[0];
  const r = Regles.statutPresente(x, CONFIEE, {}, MAINTENANT);
  assert.equal(r.assignation, null);
  assert.equal(r.statut, "ATraiter");
  assert.equal(x.conseillerId, "moi");
});

test("dossier réel : une préférence « ne plus contacter » locale ne suspend pas ses obligations", () => {
  const prefs = { "pe-1": { prospectId: "pe-1", nePlusContacter: true, consentement: "retire" } };
  const r = Regles.analyser(contexte([opportunite("oe-1", "pe-1", 0)], { preferences: prefs }));
  assert.deepEqual(regleDe(r.actions), ["premiere-reponse", "suivi-echeance"]);
  assert.equal(r.suspendues.length, 0);
});

test("dossier réel : une pause locale ne suspend pas le suivi échu et ne crée pas d'obligation « achat reporté »", () => {
  const active = { "oe-1": { jusqua: dans(5 * JOUR), motif: "Achat au printemps", depuis: dans(-JOUR) } };
  assert.deepEqual(regleDe(Regles.analyser(contexte([opportunite("oe-1", "pe-1", 0)], { pauses: active })).actions), ["premiere-reponse", "suivi-echeance"]);
  const echue = { "oe-1": { jusqua: dans(-HEURE), motif: "Achat au printemps", depuis: dans(-5 * JOUR) } };
  const ctx = contexte([opportunite("oe-1", "pe-1")], { pauses: echue, interactions: [note("appel", "pe-1", "oe-1", apresDemande(HEURE))] });
  assert.ok(Regles.analyser(ctx).actions.every((a) => a.regle !== "achat-reporte"));
});

// ---------- Démonstration : comportement local inchangé ----------
test("démonstration : Ignorée, Confiée, Terminée et report local s'appliquent toujours", () => {
  const ctx = contexte([opportunite("o-demo", "p-demo")]);
  const id = "premiere-reponse:o-demo";
  assert.equal(presentees(ctx, { [id]: IGNOREE }).length, 0);
  assert.equal(presentees(ctx, { [id]: TERMINEE }).length, 0);
  assert.equal(presentees(ctx, { [id]: REPORTEE }).length, 0);
  const x = Regles.analyser(ctx).actions[0];
  assert.equal(Regles.statutPresente(x, CONFIEE, {}, MAINTENANT).assignation.collegue, "Antoine");
  assert.equal(Regles.statutPresente(x, COMMENCEE, {}, MAINTENANT).statut, "EnCours");
});

test("démonstration : préférences et pauses locales suspendent toujours, et la pause échue crée « achat reporté »", () => {
  const prefs = { "p-demo": { prospectId: "p-demo", nePlusContacter: true, consentement: "retire" } };
  assert.equal(Regles.analyser(contexte([opportunite("o-demo", "p-demo", 0)], { preferences: prefs })).actions.length, 0);
  const echue = { "o-demo": { jusqua: dans(-HEURE), motif: "Printemps", depuis: dans(-5 * JOUR) } };
  const ctx = contexte([opportunite("o-demo", "p-demo")], { pauses: echue, interactions: [note("appel", "p-demo", "o-demo", apresDemande(HEURE))] });
  assert.ok(Regles.analyser(ctx).actions.some((a) => a.regle === "achat-reporte"));
});

test("un état local de démonstration ne touche jamais un dossier réel, même avec le même nom d'action", () => {
  const ctx = contexte([opportunite("oe-1", "pe-1", 0), opportunite("o-demo", "p-demo", 0)]);
  const etats = { "premiere-reponse:o-demo": IGNOREE, "premiere-reponse:oe-1": IGNOREE };
  const l = presentees(ctx, etats);
  assert.ok(l.some((a) => a.id === "premiere-reponse:oe-1"));
  assert.ok(!l.some((a) => a.id === "premiere-reponse:o-demo"));
});

// ---------- Cartes regroupées, plusieurs opportunités ----------
test("carte regroupée : un état local sur une raison ou sur toute la carte ne retire aucune raison réelle", () => {
  const ctx = contexte([opportunite("oe-1", "pe-1", 0)]);
  const surUne = presentees(ctx, { "premiere-reponse:oe-1": IGNOREE });
  const surTout = presentees(ctx, { "premiere-reponse:oe-1": CONFIEE, "suivi-echeance:oe-1:2026-11-24": IGNOREE });
  [surUne, surTout].forEach((l) => {
    const g = Regles.regrouperObligations(l);
    assert.equal(g.length, 1);
    assert.deepEqual(g[0].raisons.map((r) => r.regle).sort(), ["premiere-reponse", "suivi-echeance"]);
  });
});

test("deux opportunités du même prospect : chacune garde ses obligations malgré les états locaux", () => {
  const ctx = contexte([opportunite("oe-1", "pe-1", 0), opportunite("oe-2", "pe-1", 0)]);
  const etats = { "premiere-reponse:oe-1": IGNOREE, "suivi-echeance:oe-2:2026-11-24": TERMINEE };
  const g = Regles.regrouperObligations(presentees(ctx, etats));
  assert.deepEqual(g.map((x) => x.id).sort(), ["contact:oe-1", "contact:oe-2"]);
  g.forEach((x) => assert.equal(x.raisons.length, 2));
});

// ---------- Opérations enregistrées : inchangées ----------
test("veille enregistrée (fonctionnalité 14) : toujours appliquée, et elle seule met de côté une raison réelle", () => {
  const ctx = contexte([opportunite("oe-1", "pe-1", 0)]);
  const veilles = { "premiere-reponse:oe-1": { depuis: dans(-HEURE), jusqua: dans(3 * JOUR) } };
  assert.deepEqual(regleDe(presentees(ctx, { "premiere-reponse:oe-1": IGNOREE }, veilles)), ["suivi-echeance"]);
  const x = Regles.analyser(ctx).actions.find((a) => a.regle === "premiere-reponse");
  assert.equal(Regles.statutPresente(x, IGNOREE, veilles, MAINTENANT).statut, "EnVeille");
  // Réactivation (veille levée en base) : la raison revient, l'ancien statut local ne la retient pas.
  assert.deepEqual(regleDe(presentees(ctx, { "premiere-reponse:oe-1": IGNOREE }, {})), ["premiere-reponse", "suivi-echeance"]);
});

test("réalisation enregistrée (fonctionnalité 06) : le suivi disparaît, la première réponse reste malgré un ancien « Terminée »", () => {
  const ctx = contexte([opportunite("oe-1", "pe-1")], { interactions: [note("suivi-realise", "pe-1", "oe-1", apresDemande(HEURE))] });
  assert.deepEqual(regleDe(presentees(ctx, { "premiere-reponse:oe-1": TERMINEE })), ["premiere-reponse"]);
});

test("report enregistré (fonctionnalité 07) : le suivi reporté n'est plus échu, la première réponse reste", () => {
  const ctx = contexte([opportunite("oe-1", "pe-1", 4)], { interactions: [note("suivi-reporte", "pe-1", "oe-1", apresDemande(HEURE))] });
  assert.deepEqual(regleDe(presentees(ctx, { "premiere-reponse:oe-1": IGNOREE })), ["premiere-reponse"]);
});

test("contact déclaré enregistré : la première réponse disparaît, le suivi reste (aucune satisfaction automatique)", () => {
  const ctx = contexte([opportunite("oe-1", "pe-1", 0)], { interactions: [note("appel", "pe-1", "oe-1", apresDemande(HEURE))] });
  assert.deepEqual(regleDe(presentees(ctx, { "suivi-echeance:oe-1:2026-11-24": IGNOREE })), ["suivi-echeance"]);
});

// ---------- Compteurs, Accueil, réévaluation ----------
test("compteurs d'obligations et priorités de l'Accueil identiques avec ou sans états locaux sur les dossiers réels", () => {
  const ctx = contexte([opportunite("oe-1", "pe-1", -1), opportunite("oe-2", "pe-2", 0), opportunite("oe-3", "pe-3")]);
  const etats = { "premiere-reponse:oe-1": IGNOREE, "suivi-echeance:oe-1:2026-11-23": CONFIEE, "premiere-reponse:oe-2": TERMINEE, "premiere-reponse:oe-3": REPORTEE };
  const sans = presentees(ctx, {});
  const avec = presentees(ctx, etats);
  assert.deepEqual(Regles.compterObligations(avec, MAINTENANT), Regles.compterObligations(sans, MAINTENANT));
  assert.deepEqual(Regles.prioritesAccueil(avec, MAINTENANT, 3).map((g) => g.id), Regles.prioritesAccueil(sans, MAINTENANT, 3).map((g) => g.id));
  assert.equal(Regles.prioritesAccueil(avec, MAINTENANT, 3).length, 3);
});

test("réévaluation après actualisation : mêmes données et mêmes anciens états, mêmes obligations (aucune disparition)", () => {
  const etats = { "premiere-reponse:oe-1": IGNOREE, "suivi-echeance:oe-1:2026-11-24": TERMINEE };
  const premier = presentees(contexte([opportunite("oe-1", "pe-1", 0)]), etats).map((a) => a.id);
  const second = presentees(contexte([opportunite("oe-1", "pe-1", 0)]), etats).map((a) => a.id);
  assert.deepEqual(second, premier);
  assert.equal(premier.length, 2);
});
