// Tests unitaires de la mise en veille enregistrée d'une recommandation (fonctionnalité 14) : identité de la
// recommandation, séparation présentées / en veille (separerVeilles, utilisée par intelligence-store.js), regroupement,
// priorités de l'Accueil et compteurs recalculés, expiration, réactivation, obsolescence et commande proposée.
// Catalogue, délais et règles autorisées à la veille lus dans le code C# (une seule source).
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
const blocVeille = sourceIntel.match(/ReglesVeille = new HashSet<string>\s*\{([^}]*)\}/)[1];
const reglesVeille = [...blocVeille.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);

const HEURE = 3600000, JOUR = 86400000;
const MAINTENANT = new Date(2026, 10, 24, 14, 0, 0);
const CREATION = new Date(MAINTENANT.getTime() - 2 * JOUR).toISOString(); // première réponse en retard
const apresDemande = (ms) => new Date(new Date(CREATION).getTime() + ms).toISOString();
const jourA9h = (d) => new Date(2026, 10, 24 + d, 9, 0, 0).toISOString();
const dans = (ms) => new Date(MAINTENANT.getTime() + ms).toISOString();

function opportunite(id, prospectId, suivi, etape) {
  return { id: id, prospectId: prospectId, titre: "Opportunité " + id, etape: etape || "Nouveau", etapeLibelle: etape || "Nouveau", conseillerId: "moi",
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
const actions = (ctx) => Regles.analyser(ctx).actions;
const ids = (l) => l.map((a) => a.id).sort();
// Veille enregistrée (forme de VeilleRecommandationVue, indexée par identifiant comme dans intelligence-store.js).
function veille(cle, finDans) {
  const v = {};
  v[cle] = { depuis: dans(-HEURE), jusqua: dans(finDans) };
  return v;
}

// ---------- Identité ----------
test("identité : la même situation donne le même identifiant à chaque chargement ; règle et opportunité y figurent", () => {
  const ctx = () => contexte([opportunite("oe-12", "pe-12", 0)]);
  assert.deepEqual(ids(actions(ctx())), ids(actions(ctx())));
  assert.deepEqual(ids(actions(ctx())), ["premiere-reponse:oe-12", "suivi-echeance:oe-12:2026-11-24"]);
});

test("identité : une règle de stagnation porte le jour de la situation ; une nouvelle activité donne un nouvel identifiant", () => {
  const o = opportunite("oe-5", "pe-5", undefined, "Qualifie");
  const avant = actions(contexte([o])).map((a) => a.id);
  assert.deepEqual(avant, ["opportunite-sans-action:oe-5:" + Regles.cleJour(CREATION)]);
  const apres = actions(contexte([Object.assign({}, o, { derniereActivite: dans(-HEURE) })])).map((a) => a.id);
  assert.notDeepEqual(apres, avant);
});

test("deux recommandations indépendantes d'une même opportunité ont deux identifiants distincts", () => {
  const l = actions(contexte([opportunite("oe-1", "pe-1", 0)]));
  assert.equal(new Set(l.map((a) => a.id)).size, 2);
});

// ---------- Commande proposée ----------
test("commande : veille enregistrée pour un dossier réel ; report réel pour un suivi ; local pour la démonstration", () => {
  const l = actions(contexte([opportunite("oe-1", "pe-1", 0)]));
  const premiere = l.find((a) => a.regle === "premiere-reponse");
  const suivi = l.find((a) => a.regle === "suivi-echeance");
  assert.equal(Regles.commandeMiseDeCote(premiere, reglesVeille), "veille-serveur");
  assert.equal(Regles.commandeMiseDeCote(suivi, reglesVeille), "report-suivi");
  const demo = actions(contexte([opportunite("o-demo", "p-demo")])).find((a) => a.regle === "premiere-reponse");
  assert.equal(Regles.commandeMiseDeCote(demo, reglesVeille), "report-local");
  assert.equal(Regles.commandeMiseDeCote({ regle: "rdv-a-confirmer", opportuniteId: "oe-1" }, reglesVeille), "report-local");
});

test("la liste des règles autorisées ne contient jamais « suivi-echeance » et ne cite que des règles du catalogue", () => {
  assert.ok(reglesVeille.length > 0 && reglesVeille.indexOf("suivi-echeance") < 0);
  reglesVeille.forEach((r) => assert.ok(regles.some((x) => x.cle === r), r));
});

// ---------- Carte regroupée ----------
test("veille d'une seule raison : l'autre raison reste présentée et l'obligation se recalcule sur elle", () => {
  const l = actions(contexte([opportunite("oe-1", "pe-1", 0)]));
  const s = Regles.separerVeilles(l, veille("premiere-reponse:oe-1", 3 * JOUR), MAINTENANT);
  assert.deepEqual(ids(s.enVeille), ["premiere-reponse:oe-1"]);
  assert.deepEqual(ids(s.presentees), ["suivi-echeance:oe-1:2026-11-24"]);
  const g = Regles.regrouperObligations(s.presentees);
  assert.equal(g.length, 1);
  assert.equal(g[0].regroupee, false);
  assert.deepEqual(Regles.commandesObligation(g[0]).map((c) => c.commande), ["realiser-serveur"]);
});

test("priorités de l'Accueil recalculées : la raison en veille n'y figure plus, l'autre garde sa propre priorité", () => {
  const l = actions(contexte([opportunite("oe-1", "pe-1", -1)]));
  const avant = Regles.prioritesAccueil(l, MAINTENANT, 3);
  assert.equal(avant[0].raisons.length, 2);
  const s = Regles.separerVeilles(l, veille("premiere-reponse:oe-1", 3 * JOUR), MAINTENANT);
  const apres = Regles.prioritesAccueil(s.presentees, MAINTENANT, 3);
  assert.deepEqual(apres.map((g) => g.raisons.map((r) => r.regle)), [["suivi-echeance"]]);
});

test("compteurs : la veille quitte « à traiter » sans devenir une action terminée", () => {
  const l = actions(contexte([opportunite("oe-1", "pe-1", 0), opportunite("oe-2", "pe-2")]));
  const s = Regles.separerVeilles(l, veille("premiere-reponse:oe-2", JOUR), MAINTENANT);
  const avant = Regles.compterObligations(l, MAINTENANT);
  const apres = Regles.compterObligations(s.presentees, MAINTENANT);
  assert.equal(apres.aTraiter, avant.aTraiter - 1);
  assert.equal(s.enVeille.length, 1);
  assert.equal(s.presentees.length + s.enVeille.length, l.length); // rien n'est perdu ni compté comme réalisé
});

// ---------- Durée ----------
test("expiration : à la fin prévue, la recommandation revient si sa règle s'applique toujours", () => {
  const l = actions(contexte([opportunite("oe-1", "pe-1")]));
  const v = veille("premiere-reponse:oe-1", 2 * HEURE);
  assert.equal(Regles.separerVeilles(l, v, MAINTENANT).enVeille.length, 1);
  const plusTard = new Date(MAINTENANT.getTime() + 3 * HEURE);
  assert.equal(Regles.separerVeilles(l, v, plusTard).enVeille.length, 0);
  assert.equal(Regles.veilleActive(v, "premiere-reponse:oe-1", new Date(MAINTENANT.getTime() + 2 * HEURE)), null); // fin atteinte = expirée
});

test("réactivation : sans la veille (levée en base), la recommandation est de nouveau présentée", () => {
  const l = actions(contexte([opportunite("oe-1", "pe-1")]));
  assert.deepEqual(ids(Regles.separerVeilles(l, {}, MAINTENANT).presentees), ["premiere-reponse:oe-1"]);
});

// ---------- Obsolescence et nouvelles situations ----------
test("recommandation devenue obsolète (contact déclaré) : elle ne revient pas et n'est plus listée en veille", () => {
  const l = actions(contexte([opportunite("oe-1", "pe-1")], [note("appel", "pe-1", "oe-1", apresDemande(HEURE))]));
  const s = Regles.separerVeilles(l, veille("premiere-reponse:oe-1", 3 * JOUR), MAINTENANT);
  assert.equal(s.enVeille.length, 0);
  assert.ok(s.presentees.every((a) => a.regle !== "premiere-reponse"));
});

test("une nouvelle situation (nouvel identifiant) n'est pas masquée par l'ancienne veille", () => {
  const o = opportunite("oe-5", "pe-5", undefined, "Qualifie");
  const ancienne = veille("opportunite-sans-action:oe-5:" + Regles.cleJour(CREATION), 3 * JOUR);
  const nouvelle = actions(contexte([Object.assign({}, o, { derniereActivite: dans(-HEURE) })]));
  const s = Regles.separerVeilles(nouvelle, ancienne, MAINTENANT);
  assert.equal(s.enVeille.length, 0);
  assert.equal(s.presentees.length, 1);
});

test("suivi réalisé pendant la veille : il quitte la file, la veille de la première réponse est conservée", () => {
  const l = actions(contexte([opportunite("oe-1", "pe-1")], [note("suivi-realise", "pe-1", "oe-1", apresDemande(HEURE))]));
  const s = Regles.separerVeilles(l, veille("premiere-reponse:oe-1", 3 * JOUR), MAINTENANT);
  assert.deepEqual(ids(s.enVeille), ["premiere-reponse:oe-1"]);
  assert.deepEqual(s.presentees, []);
});

test("contact déclaré pendant la veille : la première réponse disparaît, le suivi reste présenté (jamais réalisé)", () => {
  const l = actions(contexte([opportunite("oe-1", "pe-1", 0)], [note("appel", "pe-1", "oe-1", apresDemande(HEURE))]));
  const s = Regles.separerVeilles(l, veille("premiere-reponse:oe-1", 3 * JOUR), MAINTENANT);
  assert.deepEqual(ids(s.presentees), ["suivi-echeance:oe-1:2026-11-24"]);
});

test("deux opportunités du même prospect : la veille de l'une ne touche pas l'autre", () => {
  const l = actions(contexte([opportunite("oe-1", "pe-1"), opportunite("oe-2", "pe-1")]));
  const s = Regles.separerVeilles(l, veille("premiere-reponse:oe-1", 3 * JOUR), MAINTENANT);
  assert.deepEqual(ids(s.presentees), ["premiere-reponse:oe-2"]);
});

test("démonstration : aucune veille enregistrée ne s'applique, les recommandations fictives restent présentées", () => {
  const l = actions(contexte([opportunite("o-demo", "p-demo", 0)]));
  const s = Regles.separerVeilles(l, veille("premiere-reponse:oe-1", 3 * JOUR), MAINTENANT);
  assert.equal(s.presentees.length, l.length);
});
