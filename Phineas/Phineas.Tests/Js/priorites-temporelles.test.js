// Tests unitaires du billet #87 : priorités et compteurs du moteur selon l'heure, avec des instants fixes et documentés.
// Le fuseau du processus est imposé (Toronto) : le résultat ne dépend ni du poste ni de l'heure du lancement.
// Règle ratifiée : une recommandation dont l'échéance arrive dans MOINS de six heures monte d'un niveau (Normal devient
// Élevé). Un suivi du jour a pour échéance 23 h 59 (heure locale) : il passe donc « Élevé » après 17 h 59.
// Lancement (Node 22 ou plus, aucune dépendance), depuis le dossier Phineas : node --test "Phineas.Tests/Js/*.test.js"
process.env.TZ = "America/Toronto";

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
// Jour de référence : mardi 24 novembre 2026, heure de Toronto (UTC-5).
const a = (heure, minute, seconde, jour) => new Date(2026, 10, jour || 24, heure, minute || 0, seconde || 0);
const SEUIL = a(17, 59, 0); // 23 h 59 moins 6 h : à partir de cet instant (exclu), le suivi du jour devient « Élevé »
const CREATION = new Date(a(12, 0).getTime() - 2 * JOUR).toISOString(); // demande d'il y a 2 jours : première réponse en retard
const PREMIERE = "premiere-reponse:oe-1";
const SUIVI = "suivi-echeance:oe-1:2026-11-24";

function opportunite(id, prospectId, jourSuivi) {
  return { id: id, prospectId: prospectId, titre: "Opportunité " + id, etape: "Nouveau", etapeLibelle: "Nouveau", conseillerId: "moi",
    dateCreation: CREATION, derniereActivite: CREATION, vehiculesEnvisages: [],
    prochaineAction: jourSuivi === null ? null : "Préparer le dossier de financement", dateProchaineAction: jourSuivi === null ? null : jourSuivi };
}
// Contact déclaré (premier échange) : la première réponse n'est plus due, il ne reste que le suivi.
function contactDeclare(prospectId, oppId) {
  return { id: "ie-n1", prospectId: prospectId, opportuniteId: oppId, date: new Date(new Date(CREATION).getTime() + HEURE).toISOString(), type: typesContact[0], auteur: "Moi", resume: "Appel" };
}
function contexte(maintenant, opps, interactions) {
  const pids = [...new Set(opps.map((o) => o.prospectId))];
  return { maintenant: maintenant, ref: { config: config, regles: regles, libellesPriorite: { Faible: "Faible", Normal: "Normal", Eleve: "Élevé", Urgent: "Urgent" } },
    contacts: pids.map((id) => ({ id: id, prenom: "Client", nom: id, conseillerId: "moi" })), opportunites: opps, interactions: interactions || [], typesContact: typesContact,
    soumissions: [], rendezVous: [], transactions: [], relations: null, preferences: {}, pauses: {}, correspondances: [] };
}
const SUIVI_DU_JOUR = a(9, 0).toISOString();
// Veille de la première réponse (fonctionnalité 14), du 24 à midi pour trois jours.
const VEILLE = { [PREMIERE]: { depuis: a(12, 0).toISOString(), jusqua: new Date(a(12, 0).getTime() + 3 * JOUR).toISOString() } };

// Ce que voient l'Accueil et le Centre à l'instant m : recommandations présentées et en veille, priorités, compteurs.
function vue(m, opps, interactions, veilles) {
  const actions = Regles.analyser(contexte(m, opps, interactions)).actions;
  const separees = Regles.separerVeilles(actions, veilles || {}, m);
  const gardees = Regles.actionsGardees(separees.presentees);
  return {
    action: (id) => actions.find((x) => x.id === id) || null,
    presentees: separees.presentees.map((x) => x.id).sort(),
    enVeille: separees.enVeille.map((x) => x.id),
    accueil: Regles.prioritesAccueil(gardees, m, 3),
    compteurs: Regles.compterObligations(gardees, m),
  };
}
const raisonsAccueil = (v, oppId) => v.accueil.filter((g) => g.raisons.some((r) => r.opportuniteId === oppId)).map((g) => g.raisons.map((r) => r.regle).sort().join("+"));

// ---------- Seuil des six heures ----------
test("suivi du jour : « Normal » avant le seuil, au seuil exact, puis « Élevé » une seconde après", () => {
  const opps = [opportunite("oe-1", "pe-1", SUIVI_DU_JOUR)];
  const priorite = (m) => vue(m, opps, [contactDeclare("pe-1", "oe-1")]).action(SUIVI).priorite;
  assert.equal(priorite(a(12, 0)), "Normal", "12 h : échéance dans près de 12 h");
  assert.equal(priorite(new Date(SEUIL.getTime() - 1000)), "Normal", "17 h 58 min 59 s");
  assert.equal(priorite(SEUIL), "Normal", "17 h 59 pile : il reste exactement 6 h, ce n'est pas « moins de six heures »");
  assert.equal(priorite(new Date(SEUIL.getTime() + 1000)), "Eleve", "17 h 59 min 01 s : moins de six heures");
  assert.equal(priorite(a(19, 0)), "Eleve");
});

test("le seuil se lit sur l'échéance (fin du jour local), pas sur l'heure du suivi ni sur le jour UTC", () => {
  const v = vue(a(19, 0), [opportunite("oe-1", "pe-1", SUIVI_DU_JOUR)], [contactDeclare("pe-1", "oe-1")]);
  assert.equal(new Date(v.action(SUIVI).echeance).getTime(), a(23, 59).getTime());
  assert.ok(v.action(SUIVI).raisonsPriorite.some((r) => r.indexOf("moins de 6 h") >= 0));
});

// ---------- Première réponse en veille, suivi distinct ----------
test("avant le seuil : première réponse en veille, suivi présenté « Normal », pas de priorité sur l'Accueil, une obligation à traiter", () => {
  const v = vue(a(12, 0), [opportunite("oe-1", "pe-1", SUIVI_DU_JOUR)], [], VEILLE);
  assert.deepEqual(v.enVeille, [PREMIERE]);
  assert.deepEqual(v.presentees, [SUIVI]);
  assert.equal(v.action(SUIVI).priorite, "Normal");
  assert.deepEqual(raisonsAccueil(v, "oe-1"), []);
  assert.equal(v.compteurs.aTraiter, 1);
});

test("après le seuil : le suivi devient « Élevé » et va sur l'Accueil SEUL ; la première réponse reste en veille", () => {
  const v = vue(a(19, 0), [opportunite("oe-1", "pe-1", SUIVI_DU_JOUR)], [], VEILLE);
  assert.deepEqual(v.enVeille, [PREMIERE]);
  assert.equal(v.action(SUIVI).priorite, "Eleve");
  assert.deepEqual(raisonsAccueil(v, "oe-1"), ["suivi-echeance"], "la raison en veille ne revient pas par la carte regroupée");
  assert.equal(v.compteurs.aTraiter, 1);
  assert.equal(v.compteurs.prioritaires, 1);
});

test("sans veille, les deux raisons forment une seule obligation (jamais comptée deux fois), avant comme après le seuil", () => {
  [a(12, 0), a(19, 0)].forEach((m) => {
    const v = vue(m, [opportunite("oe-1", "pe-1", SUIVI_DU_JOUR)], []);
    assert.deepEqual(v.presentees, [PREMIERE, SUIVI]);
    assert.equal(v.compteurs.aTraiter, 1);
    assert.equal(v.compteurs.recommandations, 2);
    assert.deepEqual(raisonsAccueil(v, "oe-1"), ["premiere-reponse+suivi-echeance"], "première réponse en retard : priorité immédiate à toute heure");
  });
});

test("plusieurs opportunités : après le seuil, seul le suivi du jour monte ; un suivi de demain reste hors de l'Accueil", () => {
  const opps = [opportunite("oe-1", "pe-1", SUIVI_DU_JOUR), opportunite("oe-2", "pe-2", a(9, 0, 0, 25).toISOString())];
  const interactions = [contactDeclare("pe-1", "oe-1"), Object.assign(contactDeclare("pe-2", "oe-2"), { id: "ie-n2" })];
  const v = vue(a(19, 0), opps, interactions);
  assert.deepEqual(raisonsAccueil(v, "oe-1"), ["suivi-echeance"]);
  assert.deepEqual(raisonsAccueil(v, "oe-2"), []);
  assert.equal(v.action("suivi-echeance:oe-2:2026-11-25"), null, "un suivi futur n'est pas encore une recommandation");
});

test("l'Accueil se calcule à l'instant de référence fourni, jamais sur l'heure réelle du poste", () => {
  // Instants très éloignés de l'heure réelle : une lecture de l'horloge du poste donnerait l'inverse.
  const action = (echeance) => ({ id: "x:" + echeance.getTime(), regle: "rdv-a-preparer", opportuniteId: "o-x", objet: { type: "rendezvous", id: "r-x" },
    priorite: "Eleve", echeance: echeance.toISOString(), departement: "conseiller" });
  const passe = new Date(2020, 0, 15, 19, 0, 0);
  assert.equal(Regles.prioritesAccueil([action(new Date(2020, 0, 16, 10, 0, 0))], passe, 3).length, 0, "échéance demain (2020) : pas une priorité de ce jour");
  const futur = new Date(2040, 0, 15, 9, 0, 0);
  assert.equal(Regles.prioritesAccueil([action(new Date(2040, 0, 15, 20, 0, 0))], futur, 3).length, 1, "échéance ce jour (2040) : priorité du jour");
});

// ---------- Passages de jour ----------
test("minuit UTC (19 h à Toronto) ne change rien pour un dossier réel : mêmes recommandations, priorités et compteurs", () => {
  const opps = [opportunite("oe-1", "pe-1", SUIVI_DU_JOUR)];
  const avant = vue(new Date(Date.UTC(2026, 10, 24, 23, 59, 50)), opps, [], VEILLE);
  const apres = vue(new Date(Date.UTC(2026, 10, 25, 0, 0, 10)), opps, [], VEILLE);
  assert.deepEqual(apres.presentees, avant.presentees);
  assert.deepEqual(apres.enVeille, avant.enVeille);
  assert.equal(apres.action(SUIVI).priorite, avant.action(SUIVI).priorite);
  assert.deepEqual(apres.compteurs, avant.compteurs);
  assert.deepEqual(raisonsAccueil(apres, "oe-1"), raisonsAccueil(avant, "oe-1"));
});

test("minuit local : le suivi d'hier garde le même identifiant (veille et réalisation restent rattachées), passe en retard, compte une fois", () => {
  const opps = [opportunite("oe-1", "pe-1", SUIVI_DU_JOUR)];
  const avant = vue(a(23, 58, 30), opps, [contactDeclare("pe-1", "oe-1")]);
  const apres = vue(a(0, 0, 30, 25), opps, [contactDeclare("pe-1", "oe-1")]);
  assert.ok(avant.action(SUIVI) && apres.action(SUIVI));
  assert.equal(avant.compteurs.retard, 0);
  assert.equal(apres.compteurs.retard, 1);
  assert.equal(apres.compteurs.aTraiter, 1);
});

test("veille expirée : la première réponse revient d'elle-même, sans réalisation", () => {
  const apresFin = new Date(new Date(VEILLE[PREMIERE].jusqua).getTime() + 1000);
  const v = vue(apresFin, [opportunite("oe-1", "pe-1", SUIVI_DU_JOUR)], [], VEILLE);
  assert.deepEqual(v.enVeille, []);
  assert.ok(v.presentees.indexOf(PREMIERE) >= 0);
});

// ---------- Suivi réalisé ou reporté pendant la veille ----------
test("suivi réalisé (prochaine action archivée) : plus de suivi présenté, la veille de la première réponse reste", () => {
  const v = vue(a(19, 0), [opportunite("oe-1", "pe-1", null)], [], VEILLE);
  assert.deepEqual(v.presentees, []);
  assert.deepEqual(v.enVeille, [PREMIERE]);
  assert.equal(v.compteurs.aTraiter, 0);
});

test("suivi reporté à dans 4 jours : rien n'est présenté aujourd'hui, aucune réalisation inventée, la veille reste", () => {
  const v = vue(a(19, 0), [opportunite("oe-1", "pe-1", a(9, 0, 0, 28).toISOString())], [], VEILLE);
  assert.deepEqual(v.presentees, []);
  assert.deepEqual(v.enVeille, [PREMIERE]);
});

// ---------- Données de démonstration au minuit du serveur (cause de l'étape 6) ----------
// Le serveur (conteneur en UTC) date les suivis fictifs « demain » à j + 1, minuit de SON jour. Pour un navigateur à
// Toronto le 24 au soir, minuit UTC du 25 est le 24 à 19 h : « aujourd'hui ». Au minuit du serveur, le jeu fictif est
// recalculé (j + 1 devient le 26 minuit UTC, soit le 25 à 19 h à Toronto) : le suivi fictif quitte « à traiter ».
test("minuit du serveur : le jeu fictif change de jour, le total « à traiter » change, les obligations réelles non", () => {
  const m = a(19, 30);
  const reel = opportunite("oe-1", "pe-1", SUIVI_DU_JOUR);
  const fictifAvant = Object.assign(opportunite("o-demo", "p-demo", "2026-11-25T00:00:00+00:00"), { dateCreation: CREATION });
  const fictifApres = Object.assign(opportunite("o-demo", "p-demo", "2026-11-26T00:00:00+00:00"), { dateCreation: CREATION });
  const contacts = [contactDeclare("p-demo", "o-demo"), Object.assign(contactDeclare("pe-1", "oe-1"), { id: "ie-n2" })];
  const avant = vue(m, [reel, fictifAvant], contacts);
  const apres = vue(m, [reel, fictifApres], contacts);
  assert.equal(avant.compteurs.aTraiter, 2, "avant : suivi réel + suivi fictif « aujourd'hui » pour le navigateur");
  assert.equal(apres.compteurs.aTraiter, 1, "après : le suivi fictif est « demain » pour le navigateur");
  // Seules les recommandations des dossiers réels sont stables : c'est sur elles que l'E2E compare deux chargements.
  const reellesPresentees = (v) => v.presentees.filter((id) => Regles.estDossierReel(v.action(id)));
  assert.deepEqual(reellesPresentees(avant), [SUIVI]);
  assert.deepEqual(reellesPresentees(apres), reellesPresentees(avant));
});

// ---------- Soumissions fictives aux instants représentatifs (étape 19 de activites-contacts) ----------
// Données construites comme ServiceSoumissionsDemo : envoyées il y a 4 jours (n - 4), validité j + 3 (Karim) et j + 6
// (Éric), j = minuit du jour LOCAL du serveur. Règle : « sans réponse » si la validité est à plus de 2 jours du jour du
// navigateur, « expire bientôt » si elle est à 0, 1 ou 2 jours.
function soumissionsFictives(instant, minuitServeur) {
  const n = instant.getTime();
  const soumission = (id, opp, joursValidite) => ({ id: id, reference: id.toUpperCase(), prospectId: "p-" + id, opportuniteId: opp, conseillerId: "moi",
    courante: { numero: 1, statut: "Envoyee", date: new Date(n - 4 * JOUR).toISOString(), dateValidite: new Date(minuitServeur + joursValidite * JOUR).toISOString(),
      vehiculeId: "v", vehiculeNom: "Véhicule", vehiculeStatut: "Disponible", vehiculeStatutLibelle: "disponible", montant: null },
    acceptee: null, transaction: false });
  return [soumission("s-karim-outback", "o-karim", 3), soumission("s-eric-cx5", "o-eric", 6)];
}
function reglesSoumissions(instant, minuitServeur) {
  const ctx = contexte(instant, [opportunite("o-karim", "p-s-karim-outback", null), opportunite("o-eric", "p-s-eric-cx5", null)], []);
  ctx.soumissions = soumissionsFictives(instant, minuitServeur);
  return Regles.analyser(ctx).actions.filter((x) => x.regle.indexOf("soumission-") === 0).map((x) => x.regle + ":" + x.id.split(":")[1]).sort();
}
const minuitUtc = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

test("serveur UTC, navigateur Toronto : la règle donne 1, 2, 2 puis 1 soumission sans réponse aux quatre instants, toujours Éric", () => {
  const attendu = {
    "2026-11-24T23:30:00Z": "expire", // 18 h 30 à Toronto, même jour civil des deux côtés : Karim à 2 jours
    "2026-11-25T00:30:00Z": "sans-reponse", // 19 h 30 à Toronto, le serveur est déjà le 25 : Karim à 3 jours
    "2026-11-25T04:30:00Z": "sans-reponse", // 23 h 30 à Toronto : toujours un jour d'écart
    "2026-11-25T05:30:00Z": "expire", // 00 h 30 le 25 à Toronto : de nouveau le même jour civil
  };
  Object.keys(attendu).forEach((iso) => {
    const instant = new Date(iso);
    const r = reglesSoumissions(instant, minuitUtc(instant));
    assert.ok(r.indexOf("soumission-sans-reponse:s-eric-cx5") >= 0, iso + " : Éric");
    assert.ok(r.indexOf("soumission-" + attendu[iso] + ":s-karim-outback") >= 0, iso + " : Karim " + attendu[iso] + " (" + r.join() + ")");
    assert.equal(r.filter((x) => x.indexOf("karim") >= 0).length, 1, iso + " : une seule recommandation pour Karim");
  });
});

test("même fuseau des deux côtés (serveur et navigateur à Toronto) : Karim est toujours à 3 jours, donc sans réponse", () => {
  ["2026-11-24T23:30:00Z", "2026-11-25T00:30:00Z", "2026-11-25T04:30:00Z", "2026-11-25T05:30:00Z"].forEach((iso) => {
    const instant = new Date(iso);
    const minuitToronto = new Date(instant.getFullYear(), instant.getMonth(), instant.getDate()).getTime();
    assert.deepEqual(reglesSoumissions(instant, minuitToronto), ["soumission-sans-reponse:s-eric-cx5", "soumission-sans-reponse:s-karim-outback"], iso);
  });
});

test("une soumission sans réponse n'est jamais un contact déclaré : son motif parle de contacts déclarés, aucune interaction n'est créée", () => {
  const instant = new Date("2026-11-25T00:30:00Z");
  const ctx = contexte(instant, [opportunite("o-eric", "p-s-eric-cx5", null)], []);
  ctx.soumissions = soumissionsFictives(instant, minuitUtc(instant)).filter((s) => s.id === "s-eric-cx5");
  const x = Regles.analyser(ctx).actions.find((a) => a.regle === "soumission-sans-reponse");
  assert.match(x.motif, /contact déclaré/);
  assert.equal(Regles.contactsDeclares(ctx.interactions, typesContact, null).length, 0);
});
