// Tests unitaires de la carte « Priorité » de l'Accueil vendeur (fonctionnalité 13) : sélection des priorités
// (prioritesAccueil, par obligation) et commandes de chaque carte (commandesObligation, dérivées de commandeRealisation).
// Même moteur que le Centre d'actions et « Mes suivis » ; catalogue et délais lus dans le code C#.
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
const CREATION = new Date(MAINTENANT.getTime() - 2 * JOUR).toISOString(); // demande d'il y a 2 jours : première réponse en retard
const apresDemande = (ms) => new Date(new Date(CREATION).getTime() + ms).toISOString();
const jourA9h = (d) => new Date(2026, 10, 24 + d, 9, 0, 0).toISOString();

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
function contexte(opps, interactions) {
  const pids = [...new Set(opps.map((o) => o.prospectId))];
  return { maintenant: MAINTENANT, ref: { config: config, regles: regles, libellesPriorite: { Faible: "Faible", Normal: "Normal", Eleve: "Élevé", Urgent: "Urgent" } },
    contacts: pids.map((id) => ({ id: id, prenom: "Client", nom: id, conseillerId: "moi" })), opportunites: opps, interactions: interactions || [], typesContact: typesContact,
    soumissions: [], rendezVous: [], transactions: [], relations: null, preferences: {}, pauses: {}, correspondances: [] };
}
const priorites = (ctx) => Regles.prioritesAccueil(Regles.analyser(ctx).actions, MAINTENANT, 3);
const carte = (ctx, oppId) => priorites(ctx).find((g) => g.raisons.some((r) => r.opportuniteId === oppId)) || null;
const commandes = (g) => (g ? Regles.commandesObligation(g).map((c) => c.commande) : []);

function action(id, opp, prospect, priorite, echeance, extra) {
  return Object.assign({ id: id, regle: id.split(":")[0], opportuniteId: opp, prospectId: prospect, relance: null, objet: { type: "opportunite", id: opp },
    priorite: priorite, echeance: echeance, departement: "conseiller" }, extra || {});
}

// ---------- Commandes d'une carte ----------
test("priorité réelle avec suivi échu et première réponse : « Déclarer le contact » puis « Marquer le suivi comme réalisé »", () => {
  const g = carte(contexte([opportunite("oe-1", "pe-1", 0)]), "oe-1");
  assert.equal(g.regroupee, true);
  assert.equal(g.priorite, "Urgent");
  assert.deepEqual(commandes(g), ["declarer-contact", "realiser-serveur"]);
});

test("priorité réelle : première réponse seule = déclarer le contact ; suivi seul (contact déjà déclaré) = réaliser en base", () => {
  assert.deepEqual(commandes(carte(contexte([opportunite("oe-1", "pe-1")]), "oe-1")), ["declarer-contact"]);
  const suiviEnRetard = opportunite("oe-2", "pe-2", -2);
  const g = carte(contexte([suiviEnRetard], [note("appel", "pe-2", "oe-2", apresDemande(HEURE))]), "oe-2");
  assert.deepEqual(commandes(g), ["realiser-serveur"]);
});

test("autre recommandation réelle sans opération persistante : aucune clôture, seulement le dossier", () => {
  const g = Regles.regrouperObligations([action("rdv-a-confirmer:r-1", "oe-9", "pe-9", "Urgent", jourA9h(0), { objet: { type: "rendezvous", id: "r-1" } })])[0];
  assert.deepEqual(commandes(g), ["aucune"]);
});

test("priorité de démonstration : réalisation locale, comme avant", () => {
  const g = Regles.regrouperObligations([action("premiere-reponse:o-demo", "o-demo", "p-demo", "Urgent", jourA9h(0))])[0];
  assert.deepEqual(commandes(g), ["realiser-local"]);
});

test("statut local sans écriture : aucune recommandation d'un dossier réel n'est jamais « réalisable localement »", () => {
  for (const r of regles) {
    const c = Regles.commandeRealisation({ regle: r.cle, opportuniteId: "oe-1", prospectId: "pe-1" });
    assert.notEqual(c, "realiser-local", r.cle);
  }
});

test("réutilisation : chaque commande de la carte est celle de commandeRealisation pour sa raison", () => {
  const g = carte(contexte([opportunite("oe-1", "pe-1", 0)]), "oe-1");
  Regles.commandesObligation(g).forEach((c) => assert.equal(c.commande, Regles.commandeRealisation(c.raison)));
});

// ---------- Réévaluation ----------
test("réalisation du suivi : la carte garde la première réponse, sans contact créé", () => {
  const g = carte(contexte([opportunite("oe-1", "pe-1")], [note("suivi-realise", "pe-1", "oe-1", apresDemande(HEURE))]), "oe-1");
  assert.deepEqual(commandes(g), ["declarer-contact"]);
});

test("contact déclaré : la première réponse quitte la carte, le suivi n'est jamais réalisé implicitement", () => {
  const ctx = contexte([opportunite("oe-1", "pe-1", 0)], [note("appel", "pe-1", "oe-1", apresDemande(HEURE))]);
  const toutes = Regles.analyser(ctx).actions.filter((a) => a.opportuniteId === "oe-1").map((a) => a.regle);
  assert.ok(toutes.indexOf("suivi-echeance") >= 0 && toutes.indexOf("premiere-reponse") < 0);
  assert.equal(carte(ctx, "oe-1"), null); // le suivi du jour (Normal) n'est pas une priorité de l'Accueil
});

test("report au futur et remplacement : la carte ne propose plus de réaliser le suivi reporté ; remplacer n'est pas réaliser", () => {
  const reporte = carte(contexte([opportunite("oe-1", "pe-1", 4)], [note("suivi-reporte", "pe-1", "oe-1", apresDemande(HEURE))]), "oe-1");
  assert.deepEqual(commandes(reporte), ["declarer-contact"]);
  const remplace = carte(contexte([opportunite("oe-1", "pe-1", 0)], [note("suivi-remplace", "pe-1", "oe-1", apresDemande(HEURE))]), "oe-1");
  assert.deepEqual(commandes(remplace), ["declarer-contact", "realiser-serveur"]);
});

// ---------- Sélection, ordre, compteurs ----------
test("une prise de contact regroupée n'occupe qu'une carte ; deux opportunités du même prospect en ont deux", () => {
  const ctx = contexte([opportunite("oe-1", "pe-1", 0), opportunite("oe-2", "pe-1", 0)]);
  const ids = priorites(ctx).map((g) => g.id);
  assert.deepEqual(ids.slice().sort(), ["contact:oe-1", "contact:oe-2"]);
});

test("sélection : seulement Urgent ou Élevé, échéance aujourd'hui ou dépassée, au plus 3, les plus fortes puis les plus anciennes", () => {
  const l = [
    action("a:1", "o-1", "p-1", "Normal", jourA9h(-1)),
    action("a:2", "o-2", "p-2", "Eleve", jourA9h(-3)),
    action("a:3", "o-3", "p-3", "Urgent", jourA9h(0)),
    action("a:4", "o-4", "p-4", "Urgent", jourA9h(-1)),
    action("a:5", "o-5", "p-5", "Eleve", jourA9h(2)),   // future : jamais
    action("a:6", "o-6", "p-6", "Eleve", jourA9h(-1)),
  ];
  const ids = Regles.prioritesAccueil(l, MAINTENANT, 3).map((g) => g.principale.id);
  assert.deepEqual(ids, ["a:4", "a:3", "a:2"]);
  assert.deepEqual(Regles.prioritesAccueil(l, MAINTENANT, 3).map((g) => g.principale.id), ids); // ordre stable
});

test("compteurs cohérents : chaque carte est une obligation distincte, jamais comptée deux fois", () => {
  const ctx = contexte([opportunite("oe-1", "pe-1", 0), opportunite("oe-2", "pe-2", 0), opportunite("oe-3", "pe-3")]);
  const actions = Regles.analyser(ctx).actions;
  const cartes = Regles.prioritesAccueil(actions, MAINTENANT, 10);
  const c = Regles.compterObligations(actions, MAINTENANT);
  assert.equal(new Set(cartes.map((g) => g.id)).size, cartes.length);
  assert.ok(cartes.length <= c.aTraiter);
  assert.ok(c.recommandations > c.aTraiter); // deux prises de contact regroupées
});
