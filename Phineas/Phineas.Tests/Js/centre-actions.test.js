// Tests unitaires du Centre d'actions (fonctionnalité 12) : commande de fin d'une recommandation (commandeRealisation),
// réévaluation d'une obligation regroupée après chaque action, et compteurs par obligation (compterObligations).
// Même moteur que « Mes suivis » (wwwroot/js/intelligence-regles.js) ; catalogue et délais lus dans le code C#.
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

function opportunite(id, prospectId, suivi, action) {
  return { id: id, prospectId: prospectId, titre: "Opportunité " + id, etape: "Nouveau", etapeLibelle: "Nouveau", conseillerId: "moi",
    dateCreation: CREATION, derniereActivite: CREATION, vehiculesEnvisages: [],
    prochaineAction: suivi === undefined ? null : action || "Préparer le dossier de financement", dateProchaineAction: suivi === undefined ? null : jourA9h(suivi) };
}
let numero = 0;
function note(type, prospectId, oppId, date) {
  numero += 1;
  const prefixe = type.indexOf("suivi-") === 0 ? "ie-s" : type === "etape" ? "ie-e" : String(prospectId).indexOf("pe-") === 0 ? "ie-n" : "i-";
  return { id: prefixe + numero, prospectId: prospectId, opportuniteId: oppId, date: date, type: type, auteur: "Moi", resume: type };
}
function contexte(opps, interactions) {
  const pids = [...new Set(opps.map((o) => o.prospectId))];
  return { maintenant: MAINTENANT, ref: { config: config, regles: regles, libellesPriorite: { Faible: "Faible", Normal: "Normal", Eleve: "Élevé", Urgent: "Urgent" } },
    contacts: pids.map((id) => ({ id: id, prenom: "Client", nom: id, conseillerId: "moi" })), opportunites: opps, interactions: interactions || [], typesContact: typesContact,
    soumissions: [], rendezVous: [], transactions: [], relations: null, preferences: {}, pauses: {}, correspondances: [] };
}
const actions = (ctx) => Regles.analyser(ctx).actions;
const obligations = (ctx) => Regles.regrouperObligations(actions(ctx));
const ligne = (ctx, oppId) => obligations(ctx).find((g) => g.raisons.some((r) => r.opportuniteId === oppId)) || null;
const raisons = (g) => (g ? g.raisons.map((r) => r.regle).sort() : []);

// ---------- Commande de fin (exigence de l'architecte) ----------
test("commande de fin : suivi réel = réalisation en base ; première réponse réelle = déclarer le contact ; autre réelle = aucune", () => {
  assert.equal(Regles.commandeRealisation({ regle: "suivi-echeance", opportuniteId: "oe-1", prospectId: "pe-1" }), "realiser-serveur");
  assert.equal(Regles.commandeRealisation({ regle: "premiere-reponse", opportuniteId: "oe-1", prospectId: "pe-1" }), "declarer-contact");
  assert.equal(Regles.commandeRealisation({ regle: "nouveau-prospect-recommande", opportuniteId: "oe-1", prospectId: "pe-1" }), "declarer-contact");
  for (const r of ["qualification-manquante", "opportunite-inactive", "soumission-sans-reponse", "rdv-a-confirmer"]) {
    assert.equal(Regles.commandeRealisation({ regle: r, opportuniteId: "oe-1", prospectId: "pe-1" }), "aucune", r);
  }
  assert.equal(Regles.commandeRealisation({ regle: "probleme-a-traiter", opportuniteId: null, prospectId: "pe-1" }), "aucune");
});

test("commande de fin : données de démonstration, réalisation locale comme avant", () => {
  for (const r of ["premiere-reponse", "suivi-echeance", "qualification-manquante", "rdv-a-confirmer"]) {
    assert.equal(Regles.commandeRealisation({ regle: r, opportuniteId: "o-demo", prospectId: "p-demo" }), "realiser-local", r);
  }
});

test("carte regroupée : chaque raison garde sa propre commande (jamais une clôture commune)", () => {
  const g = ligne(contexte([opportunite("oe-1", "pe-1", 0)]), "oe-1");
  assert.equal(g.regroupee, true);
  const commandes = {};
  g.raisons.forEach((r) => { commandes[r.regle] = Regles.commandeRealisation(r); });
  assert.deepEqual(commandes, { "premiere-reponse": "declarer-contact", "suivi-echeance": "realiser-serveur" });
});

// ---------- Scénarios A à D ----------
test("A : suivi réalisé sans contact : le suivi disparaît, la première réponse reste, la carte est recalculée", () => {
  const ctx = contexte([opportunite("oe-1", "pe-1")], [note("suivi-realise", "pe-1", "oe-1", apresDemande(HEURE))]);
  const g = ligne(ctx, "oe-1");
  assert.deepEqual(raisons(g), ["premiere-reponse"]);
  assert.equal(g.regroupee, false);
  assert.equal(Regles.commandeRealisation(g.principale), "declarer-contact");
});

test("B : contact déclaré, suivi toujours actif : la première réponse disparaît, le suivi reste réalisable", () => {
  const ctx = contexte([opportunite("oe-1", "pe-1", 0)], [note("appel", "pe-1", "oe-1", apresDemande(HEURE))]);
  const g = ligne(ctx, "oe-1");
  assert.deepEqual(raisons(g), ["suivi-echeance"]);
  assert.equal(Regles.commandeRealisation(g.principale), "realiser-serveur");
});

test("C : suivi reporté au futur : il quitte la file immédiate, la première réponse reste", () => {
  const ctx = contexte([opportunite("oe-1", "pe-1", 4)], [note("suivi-reporte", "pe-1", "oe-1", apresDemande(HEURE))]);
  assert.deepEqual(raisons(ligne(ctx, "oe-1")), ["premiere-reponse"]);
});

test("D : deux opportunités du même client : terminer l'une ne touche pas l'autre", () => {
  const avant = contexte([opportunite("oe-1", "pe-1", 0), opportunite("oe-2", "pe-1", 0)]);
  assert.equal(obligations(avant).length, 2);
  const apres = contexte([opportunite("oe-1", "pe-1"), opportunite("oe-2", "pe-1", 0)], [note("suivi-realise", "pe-1", "oe-1", apresDemande(HEURE))]);
  assert.deepEqual(raisons(ligne(apres, "oe-2")), ["premiere-reponse", "suivi-echeance"]);
  assert.deepEqual(raisons(ligne(apres, "oe-1")), ["premiere-reponse"]);
});

test("remplacement et changement d'étape : ni l'un ni l'autre ne satisfont la première réponse", () => {
  const remplace = contexte([opportunite("oe-1", "pe-1", 0, "Nouvelle action")], [note("suivi-remplace", "pe-1", "oe-1", apresDemande(HEURE))]);
  assert.deepEqual(raisons(ligne(remplace, "oe-1")), ["premiere-reponse", "suivi-echeance"]);
  const etape = contexte([opportunite("oe-1", "pe-1", 0)], [note("etape", "pe-1", "oe-1", apresDemande(HEURE))]);
  assert.deepEqual(raisons(ligne(etape, "oe-1")), ["premiere-reponse", "suivi-echeance"]);
});

// ---------- Compteurs, priorité, ordre ----------
test("compteurs : une obligation regroupée compte une fois ; priorité et retard viennent de l'obligation", () => {
  const ctx = contexte([opportunite("oe-1", "pe-1", 0), opportunite("oe-2", "pe-2", -2), opportunite("oe-3", "pe-3")]);
  const liste = actions(ctx).filter((a) => a.relance);
  const c = Regles.compterObligations(liste, MAINTENANT);
  assert.equal(c.recommandations, liste.length);
  assert.equal(c.aTraiter, 3);                      // oe-1 et oe-2 : 2 raisons chacune ; oe-3 : 1
  assert.ok(c.recommandations > c.aTraiter);
  const groupes = Regles.regrouperObligations(liste);
  assert.equal(c.prioritaires, groupes.filter((g) => g.priorite === "Urgent" || g.priorite === "Eleve").length);
  assert.equal(c.retard, groupes.filter((g) => g.echeance && new Date(g.echeance) < MAINTENANT).length);
});

test("compteurs : deux obligations distinctes (rendez-vous et prise de contact) comptent deux fois", () => {
  const l = [
    { id: "premiere-reponse:o-1", regle: "premiere-reponse", opportuniteId: "o-1", relance: "premiere-reponse", objet: { type: "opportunite", id: "o-1" }, priorite: "Eleve", echeance: jourA9h(0), departement: "conseiller" },
    { id: "rdv-a-confirmer:r-1", regle: "rdv-a-confirmer", opportuniteId: "o-1", relance: "rdv-confirmation", objet: { type: "rendezvous", id: "r-1" }, priorite: "Urgent", echeance: jourA9h(0), departement: "conseiller" },
  ];
  assert.equal(Regles.compterObligations(l, MAINTENANT).aTraiter, 2);
});

test("ordre stable et identique à chaque actualisation (même entrée, même sortie)", () => {
  const opps = [];
  for (let i = 0; i < 8; i++) opps.push(opportunite("oe-" + i, "pe-" + i, i % 2 ? 0 : undefined));
  const a = obligations(contexte(opps)).map((g) => g.id);
  const b = obligations(contexte(opps)).map((g) => g.id);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, a.length);
});

test("réévaluation après actualisation : ajouter un appel ne retire que la raison « Première réponse »", () => {
  const opps = [opportunite("oe-1", "pe-1", 0)];
  const avant = ligne(contexte(opps), "oe-1");
  const apres = ligne(contexte(opps, [note("appel", "pe-1", "oe-1", apresDemande(HEURE))]), "oe-1");
  assert.deepEqual(raisons(avant), ["premiere-reponse", "suivi-echeance"]);
  assert.deepEqual(raisons(apres), ["suivi-echeance"]);
  assert.equal(apres.principale.id, avant.raisons.find((r) => r.regle === "suivi-echeance").id); // même identifiant de source
});
