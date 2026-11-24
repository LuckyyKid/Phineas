// Tests unitaires de la reconnaissance du premier contact déclaré (fonctionnalité 10) : règle estPremiereReponse de
// wwwroot/js/intelligence-regles.js et recommandation « Première réponse ». Une note ordinaire, une tâche terminée et
// un contact déclaré produisent trois comportements différents.
// Les types de contact sont lus dans le code C# (ReferentielsVente.TypesContactDeclare), le catalogue des règles aussi.
// Lancement (Node 22 ou plus, aucune dépendance), depuis le dossier Phineas : node --test "Phineas.Tests/Js/*.test.js"
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const racine = path.join(__dirname, "..", "..", "Phineas");
const Regles = require(path.join(racine, "wwwroot", "js", "intelligence-regles.js"));

// ---------- Référentiels lus dans le code C# ----------
const sourceIntel = fs.readFileSync(path.join(racine, "Models", "ViewModels", "Conseiller", "IntelligenceViewModels.cs"), "utf8");
const sourceVente = fs.readFileSync(path.join(racine, "Models", "ViewModels", "Conseiller", "ProspectsViewModels.cs"), "utf8");
const regles = [];
for (const m of sourceIntel.matchAll(/\("([a-z-]+)", "([^"]+)", "([a-z]+)", "(Faible|Normal|Eleve|Urgent)", "([a-z]+)"\)/g)) {
  regles.push({ cle: m[1], libelle: m[2], categorie: m[3], priorite: m[4], nature: m[5] });
}
const config = {};
for (const m of sourceIntel.matchAll(/public const int (\w+) = (\d+);/g)) config[m[1].charAt(0).toLowerCase() + m[1].slice(1)] = Number(m[2]);
const typesContact = JSON.parse(sourceVente.match(/TypesContactDeclare = (\[[^\]]*\]);/)[1]);
const blocTypesNote = sourceVente.match(/TypesNote =\s*\[([\s\S]*?)\];/)[1];
const typesNote = [...blocTypesNote.matchAll(/\("([a-z]+)"/g)].map((m) => m[1]);

const HEURE = 3600000, JOUR = 86400000;
const MAINTENANT = new Date(2026, 10, 24, 14, 0, 0);
const CREATION = new Date(MAINTENANT.getTime() - 2 * JOUR).toISOString(); // demande reçue il y a 2 jours
const apresDemande = (ms) => new Date(new Date(CREATION).getTime() + ms).toISOString();

function opportunite(id, prospectId, suivi) {
  return {
    id: id, prospectId: prospectId, titre: "Opportunité " + id, etape: "Nouveau", etapeLibelle: "Nouveau", conseillerId: "moi",
    dateCreation: CREATION, derniereActivite: CREATION, vehiculesEnvisages: [],
    prochaineAction: suivi === undefined ? null : "Préparer le dossier de financement",
    dateProchaineAction: suivi === undefined ? null : new Date(2026, 10, 24 + suivi, 9, 0, 0).toISOString(),
  };
}
let numero = 0;
// Note enregistrée (identifiant serveur « ie-n… ») ; local = true : saisie du navigateur seulement (« i-local-… »).
function note(type, prospectId, oppId, date, local, resume) {
  numero += 1;
  return { id: (local ? "i-local-" : type.indexOf("suivi-") === 0 ? "ie-s" : type === "etape" ? "ie-e" : "ie-n") + numero,
    prospectId: prospectId, opportuniteId: oppId, date: date, type: type, auteur: "Moi", resume: resume || type };
}
function contexte(opportunites, interactions) {
  const pids = [...new Set(opportunites.map((o) => o.prospectId))];
  return {
    maintenant: MAINTENANT, ref: { config: config, regles: regles, libellesPriorite: { Faible: "Faible", Normal: "Normal", Eleve: "Élevé", Urgent: "Urgent" } },
    contacts: pids.map((id) => ({ id: id, prenom: "Client", nom: id, conseillerId: "moi" })), opportunites: opportunites, interactions: interactions || [],
    typesContact: typesContact, soumissions: [], rendezVous: [], transactions: [], relations: null, preferences: {}, pauses: {}, correspondances: [],
  };
}
function premieresReponses(ctx) {
  return Regles.analyser(ctx).actions.filter((a) => a.regle === "premiere-reponse").map((a) => a.opportuniteId).sort();
}

test("source unique : les types de contact sont des types de note existants, et « note » n'en fait pas partie", () => {
  assert.deepEqual(typesContact, ["appel", "courriel", "visite"]);
  assert.ok(typesContact.every((t) => typesNote.includes(t)));
  assert.ok(typesNote.includes("note") && !typesContact.includes("note"));
});

// Note ordinaire, tâche terminée, contact déclaré : trois comportements différents (critère de l'architecte).
test("note ordinaire, suivi réalisé, contact déclaré : seule la déclaration de contact satisfait la première réponse", () => {
  const notesSimple = [note("note", "pe-1", "oe-1", apresDemande(HEURE), false, "Client intéressé par les véhicules hybrides.")];
  const tache = [note("suivi-realise", "pe-1", "oe-1", apresDemande(HEURE), false, "Suivi réalisé : « Préparer le dossier de financement »")];
  const contact = [note("appel", "pe-1", "oe-1", apresDemande(HEURE))];
  assert.deepEqual(premieresReponses(contexte([opportunite("oe-1", "pe-1")], notesSimple)), ["oe-1"]);
  assert.deepEqual(premieresReponses(contexte([opportunite("oe-1", "pe-1")], tache)), ["oe-1"]);
  assert.deepEqual(premieresReponses(contexte([opportunite("oe-1", "pe-1")], contact)), []);
});

// Régression : une note ordinaire ne compte jamais comme contact. Échoue si « toute note compte comme échange » revient.
test("régression : une note ordinaire contenant « appeler » ne satisfait pas la première réponse", () => {
  const ctx = contexte([opportunite("oe-1", "pe-1")], [note("note", "pe-1", "oe-1", apresDemande(HEURE), false, "Appeler le client demain")]);
  assert.deepEqual(premieresReponses(ctx), ["oe-1"]);
});

for (const type of ["appel", "courriel", "visite"]) {
  test("contact déclaré de type « " + type + " », lié à l'opportunité, après la demande : reconnu", () => {
    assert.deepEqual(premieresReponses(contexte([opportunite("oe-1", "pe-1")], [note(type, "pe-1", "oe-1", apresDemande(HEURE))])), []);
  });
}

test("ni un changement d'étape, ni un suivi reporté ou remplacé, ni un autre événement ne sont un contact", () => {
  for (const type of ["etape", "suivi-reporte", "suivi-remplace", "creation", "qualification", "rendezvous", "soumission", "brouillon", "action"]) {
    const ctx = contexte([opportunite("oe-1", "pe-1")], [note(type, "pe-1", "oe-1", apresDemande(HEURE))]);
    assert.deepEqual(premieresReponses(ctx), ["oe-1"], type + " ne doit pas compter");
  }
});

// Scénario C : deux opportunités ; scénario D : note générale.
test("un contact pour l'opportunité A ne satisfait pas l'opportunité B du même prospect", () => {
  const ctx = contexte([opportunite("oe-1", "pe-1"), opportunite("oe-2", "pe-1")], [note("appel", "pe-1", "oe-1", apresDemande(HEURE))]);
  assert.deepEqual(premieresReponses(ctx), ["oe-2"]);
});

test("un contact général (sans opportunité) ne satisfait aucune opportunité, même s'il n'y en a qu'une", () => {
  assert.deepEqual(premieresReponses(contexte([opportunite("oe-1", "pe-1")], [note("appel", "pe-1", null, apresDemande(HEURE))])), ["oe-1"]);
  const deux = contexte([opportunite("oe-1", "pe-1"), opportunite("oe-2", "pe-1")], [note("visite", "pe-1", null, apresDemande(HEURE))]);
  assert.deepEqual(premieresReponses(deux), ["oe-1", "oe-2"]);
});

// Scénario E et chronologie.
test("chronologie : avant la demande, non ; au même instant ou après, oui", () => {
  assert.deepEqual(premieresReponses(contexte([opportunite("oe-1", "pe-1")], [note("appel", "pe-1", "oe-1", apresDemande(-1))])), ["oe-1"]);
  assert.deepEqual(premieresReponses(contexte([opportunite("oe-1", "pe-1")], [note("appel", "pe-1", "oe-1", apresDemande(-3 * JOUR))])), ["oe-1"]);
  assert.deepEqual(premieresReponses(contexte([opportunite("oe-1", "pe-1")], [note("appel", "pe-1", "oe-1", apresDemande(0))])), []);
  assert.deepEqual(premieresReponses(contexte([opportunite("oe-1", "pe-1")], [note("appel", "pe-1", "oe-1", apresDemande(1))])), []);
});

test("plusieurs contacts valides, ou un ancien et un nouveau : satisfaite une fois, sans erreur", () => {
  const ctx = contexte([opportunite("oe-1", "pe-1")], [
    note("appel", "pe-1", "oe-1", apresDemande(-JOUR)), note("courriel", "pe-1", "oe-1", apresDemande(HEURE)), note("visite", "pe-1", "oe-1", apresDemande(2 * HEURE)),
  ]);
  assert.deepEqual(premieresReponses(ctx), []);
});

test("sans aucune interaction : la première réponse est due", () => {
  assert.deepEqual(premieresReponses(contexte([opportunite("oe-1", "pe-1")], [])), ["oe-1"]);
});

// Source de vérité : sur un dossier enregistré, seule une note enregistrée en base compte.
test("dossier enregistré : une déclaration locale du navigateur ne compte pas ; dossier de démonstration : elle compte", () => {
  assert.deepEqual(premieresReponses(contexte([opportunite("oe-1", "pe-1")], [note("appel", "pe-1", "oe-1", apresDemande(HEURE), true)])), ["oe-1"]);
  assert.deepEqual(premieresReponses(contexte([opportunite("o-demo", "p-demo")], [note("appel", "p-demo", "o-demo", apresDemande(HEURE), true)])), []);
});

test("dossier enregistré : un rendez-vous local ne prouve pas le contact ; dossier de démonstration : il le prouve", () => {
  const reel = opportunite("oe-1", "pe-1"); reel.rdvContact = true;
  const demo = opportunite("o-demo", "p-demo"); demo.rdvContact = true;
  assert.deepEqual(premieresReponses(contexte([reel, demo], [])), ["oe-1"]);
});

// Isolation : une interaction d'un autre prospect ne compte jamais, même si elle cite la même opportunité.
test("isolation : la note d'un autre prospect ne satisfait pas l'opportunité", () => {
  const ctx = contexte([opportunite("oe-1", "pe-1"), opportunite("oe-9", "pe-9")], [note("appel", "pe-9", "oe-1", apresDemande(HEURE))]);
  assert.deepEqual(premieresReponses(ctx), ["oe-1", "oe-9"]);
});

// Réévaluation et regroupement (fonctionnalité 09) : le contact retire la seule raison « Première réponse ».
test("réévaluation : après un contact déclaré, la ligne regroupée garde le suivi actif, et le compteur baisse seulement si la ligne disparaît", () => {
  const avant = contexte([opportunite("oe-1", "pe-1", 0), opportunite("oe-2", "pe-1")]);
  const relances = (ctx) => Regles.analyser(ctx).actions.filter((a) => a.relance);
  const lignesAvant = Regles.regrouperObligations(relances(avant));
  assert.equal(lignesAvant.length, 2);
  assert.equal(lignesAvant.find((g) => g.id === "contact:oe-1").raisons.length, 2);

  const apres = contexte(avant.opportunites, [note("appel", "pe-1", "oe-1", apresDemande(HEURE))]);
  const lignesApres = Regles.regrouperObligations(relances(apres));
  assert.equal(lignesApres.length, 2); // oe-1 : le suivi reste ; oe-2 : sa première réponse reste
  const oe1 = lignesApres.find((g) => g.id === "contact:oe-1");
  assert.deepEqual(oe1.raisons.map((a) => a.regle), ["suivi-echeance"]);
  assert.deepEqual(lignesApres.find((g) => g.id === "contact:oe-2").raisons.map((a) => a.regle), ["premiere-reponse"]);

  const sansSuivi = contexte([opportunite("oe-1", "pe-1"), opportunite("oe-2", "pe-1")], [note("appel", "pe-1", "oe-1", apresDemande(HEURE))]);
  assert.equal(Regles.regrouperObligations(relances(sansSuivi)).length, 1); // la ligne de oe-1 disparaît, celle de oe-2 reste
});

test("estPremiereReponse : la règle exportée est la même que celle du moteur", () => {
  const o = opportunite("oe-1", "pe-1");
  assert.equal(Regles.estPremiereReponse(note("appel", "pe-1", "oe-1", apresDemande(HEURE)), o, typesContact), true);
  assert.equal(Regles.estPremiereReponse(note("note", "pe-1", "oe-1", apresDemande(HEURE)), o, typesContact), false);
});
