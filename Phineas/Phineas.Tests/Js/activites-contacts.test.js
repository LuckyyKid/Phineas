// Tests unitaires : activité du dossier et contact client déclaré (fonctionnalité 11).
// Définition unique : estContactDeclare / contactsDeclares (wwwroot/js/intelligence-regles.js), utilisée par
// « Mes suivis », la fiche, l'Assistant vendeur, les performances (performances-calcul.js), les ventes perdues
// (relations-regles.js) et les règles de relance du moteur.
// Lancement (Node 22 ou plus, aucune dépendance), depuis le dossier Phineas : node --test "Phineas.Tests/Js/*.test.js"
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const racine = path.join(__dirname, "..", "..", "Phineas");
const js = (f) => require(path.join(racine, "wwwroot", "js", f));
const Regles = js("intelligence-regles.js");
const Performances = js("performances-calcul.js");
const Relations = js("relations-regles.js");
const Coach = js("coach-regles.js");

const sourceIntel = fs.readFileSync(path.join(racine, "Models", "ViewModels", "Conseiller", "IntelligenceViewModels.cs"), "utf8");
const sourceVente = fs.readFileSync(path.join(racine, "Models", "ViewModels", "Conseiller", "ProspectsViewModels.cs"), "utf8");
const typesContact = JSON.parse(sourceVente.match(/TypesContactDeclare = (\[[^\]]*\]);/)[1]);
const regles = [];
for (const m of sourceIntel.matchAll(/\("([a-z-]+)", "([^"]+)", "([a-z]+)", "(Faible|Normal|Eleve|Urgent)", "([a-z]+)"\)/g)) {
  regles.push({ cle: m[1], libelle: m[2], categorie: m[3], priorite: m[4], nature: m[5] });
}
const config = {};
for (const m of sourceIntel.matchAll(/public const int (\w+) = (\d+);/g)) config[m[1].charAt(0).toLowerCase() + m[1].slice(1)] = Number(m[2]);

const JOUR = 86400000, HEURE = 3600000;
const MAINTENANT = new Date(2026, 10, 24, 14, 0, 0);
const le = (jour) => new Date(2026, 10, jour, 10, 0, 0).toISOString(); // jour de novembre 2026, 10 h

let numero = 0;
// Interaction enregistrée (« ie-n… ») d'un prospect réel par défaut ; local : saisie du navigateur (« i-local-… »).
function inter(type, prospectId, oppId, date, local) {
  numero += 1;
  const prefixe = local ? "i-local-" : type.indexOf("suivi-") === 0 ? "ie-s" : type === "etape" ? "ie-e" : String(prospectId).indexOf("pe-") === 0 ? "ie-n" : "i-";
  return { id: prefixe + numero, prospectId: prospectId, opportuniteId: oppId, date: date, type: type, auteur: "Moi", resume: type + " " + date.slice(0, 10) };
}
const contact = (i) => Regles.estContactDeclare(i, typesContact);
const dernier = (liste, oppId) => (Regles.contactsDeclares(liste, typesContact, oppId)[0] || null);

// ---------- Classification ----------
test("note simple, suivi réalisé, reporté, remplacé, étape : activités, jamais des contacts", () => {
  for (const type of ["note", "suivi-realise", "suivi-reporte", "suivi-remplace", "etape", "creation", "qualification", "brouillon", "action", "rendezvous"]) {
    assert.equal(contact(inter(type, "pe-1", "oe-1", le(20))), false, type);
  }
});

for (const type of ["appel", "courriel", "visite"]) {
  test("« " + type + " » enregistré sur un dossier réel : contact déclaré", () => {
    assert.equal(contact(inter(type, "pe-1", "oe-1", le(20))), true);
  });
}

test("dossier réel : une saisie locale du navigateur n'est jamais un contact ; le « texto » de démonstration non plus", () => {
  assert.equal(contact(inter("appel", "pe-1", "oe-1", le(20), true)), false);
  assert.equal(contact(inter("texto", "pe-1", "oe-1", le(20))), false);
});

test("données de démonstration : appel, courriel, visite et texto restent des contacts ; la note, non", () => {
  for (const type of ["appel", "courriel", "visite", "texto"]) assert.equal(contact(inter(type, "p-demo", "o-demo", le(20))), true, type);
  assert.equal(contact(inter("note", "p-demo", "o-demo", le(20))), false);
});

test("le texte libre n'est jamais interprété : une note « Appel effectué au client » reste une note", () => {
  const i = inter("note", "pe-1", "oe-1", le(20)); i.resume = "Appel effectué au client, il rappellera.";
  assert.equal(contact(i), false);
});

// ---------- Dernier contact déclaré ----------
test("scénario A : une note du 20 novembre ne remplace pas l'appel du 18 comme dernier contact", () => {
  const liste = [inter("appel", "pe-1", "oe-1", le(18)), inter("note", "pe-1", "oe-1", le(20))];
  assert.equal(dernier(liste).date, le(18));
});

test("scénario B : seulement des notes, aucun contact déclaré", () => {
  assert.equal(dernier([inter("note", "pe-1", null, le(19)), inter("note", "pe-1", "oe-1", le(21))]), null);
});

test("plusieurs contacts de dates différentes : le plus récent d'abord, quel que soit l'ordre reçu", () => {
  const l = [inter("visite", "pe-1", "oe-1", le(12)), inter("courriel", "pe-1", "oe-1", le(22)), inter("appel", "pe-1", null, le(15))];
  assert.deepEqual(Regles.contactsDeclares(l, typesContact).map((i) => i.date), [le(22), le(15), le(12)]);
});

test("portée : vue globale du prospect, ou une opportunité (ses contacts et les contacts généraux, jamais ceux d'une autre)", () => {
  const l = [inter("appel", "pe-1", "oe-1", le(10)), inter("courriel", "pe-1", "oe-2", le(20)), inter("visite", "pe-1", null, le(15))];
  assert.equal(dernier(l).date, le(20));         // vue du prospect : le courriel de oe-2
  assert.equal(dernier(l, "oe-1").date, le(15)); // vue de oe-1 : la visite générale, jamais le courriel de oe-2
  assert.equal(dernier(l, "oe-2").date, le(20));
});

test("un contact antérieur à une nouvelle demande reste le dernier contact du prospect, sans satisfaire sa première réponse", () => {
  const o = { id: "oe-2", prospectId: "pe-1", dateCreation: le(21) };
  const ancien = inter("appel", "pe-1", "oe-2", le(18));
  assert.equal(dernier([ancien]).date, le(18));
  assert.equal(Regles.estPremiereReponse(ancien, o, typesContact), false);
});

// ---------- Règle de relance « soumission sans réponse » (moteur réel) ----------
function contexteSoumission(interactions) {
  const o = { id: "oe-1", prospectId: "pe-1", titre: "VUS", etape: "Soumission", etapeLibelle: "Soumission", conseillerId: "moi", dateCreation: le(1), derniereActivite: le(1), vehiculesEnvisages: [] };
  const s = { id: "s-1", reference: "SOU-1", prospectId: "pe-1", opportuniteId: "oe-1", conseillerId: "moi",
    courante: { numero: 1, statut: "Envoyee", date: le(17), dateValidite: new Date(2026, 11, 20).toISOString(), vehiculeNom: "Kia Niro", vehiculeStatut: "Disponible" } };
  return { maintenant: MAINTENANT, ref: { config: config, regles: regles, libellesPriorite: { Faible: "Faible", Normal: "Normal", Eleve: "Élevé", Urgent: "Urgent" } },
    contacts: [{ id: "pe-1", prenom: "Ana", nom: "Test", conseillerId: "moi" }], opportunites: [o], interactions: interactions, typesContact: typesContact,
    soumissions: [s], rendezVous: [], transactions: [], relations: null, preferences: {}, pauses: {}, correspondances: [] };
}
const relancesSoumission = (ctx) => Regles.analyser(ctx).actions.filter((a) => a.regle === "soumission-sans-reponse");

test("soumission sans réponse : une note interne après l'envoi ne la fait pas disparaître ; un contact déclaré, oui", () => {
  assert.equal(relancesSoumission(contexteSoumission([])).length, 1);
  const avecNote = relancesSoumission(contexteSoumission([inter("note", "pe-1", "oe-1", le(23))]));
  assert.equal(avecNote.length, 1);
  assert.match(avecNote[0].motif, /Aucun contact déclaré/);
  assert.equal(relancesSoumission(contexteSoumission([inter("appel", "pe-1", "oe-1", le(23))])).length, 0);
});

// ---------- Indicateur de performance : délai de première réponse ----------
function instantane(interactions) {
  return { maintenant: MAINTENANT, periode: null, moi: "moi", typesContact: typesContact,
    contacts: [{ id: "pe-1", conseillerId: "moi", dateCreation: le(10), source: "appel" }],
    opportunites: [{ id: "oe-1", prospectId: "pe-1", etape: "Nouveau", dateCreation: le(10) }],
    interactions: interactions, soumissions: [], rendezVous: [], transactions: [], recommandations: [], attributions: [] };
}

test("performances : une note interne ne compte pas comme première réponse ; un contact déclaré lié, oui", () => {
  const sansContact = Performances.acquisition(instantane([inter("note", "pe-1", "oe-1", le(11))]));
  assert.equal(sansContact.delais.length, 0);
  assert.equal(sansContact.sansReponse, 1);
  const avecContact = Performances.acquisition(instantane([inter("note", "pe-1", "oe-1", le(11)), inter("appel", "pe-1", "oe-1", le(12))]));
  assert.deepEqual(avecContact.delais, [48]);
});

// ---------- Ventes perdues : faits ----------
test("vente perdue : le fait compte les contacts déclarés reçus, pas les notes", () => {
  const d = {
    cloture: { date: le(20), auteur: "Moi", etapeAtteinte: "Soumission", motif: "prix", origine: "client" },
    soumissions: [], rendezVous: [], interactions: [inter("note", "p-x", "o-x", le(19))], contacts: [], etapeLibelle: "Soumission",
  };
  const ref = { motifsPerte: { prix: "Prix", inconnu: "Inconnu" }, originesMotif: { client: "Confirmé par le client", hypothese: "Hypothèse" } };
  const sans = Relations.analyse(d, ref).faits.join(" ");
  assert.doesNotMatch(sans, /contact\(s\) déclaré|échange/);
  d.contacts = [inter("appel", "p-x", "o-x", le(18))];
  assert.match(Relations.analyse(d, ref).faits.join(" "), /1 contact\(s\) déclaré\(s\) avec le client/);
});

// ---------- Réévaluation et regroupement (fonctionnalités 09 et 10) ----------
test("réévaluation : ajouter un contact déclaré change le dernier contact ; ajouter une note ne le change pas", () => {
  const liste = [inter("appel", "pe-1", "oe-1", le(18))];
  liste.push(inter("note", "pe-1", "oe-1", le(22)));
  assert.equal(dernier(liste).date, le(18));
  liste.push(inter("courriel", "pe-1", "oe-1", le(23)));
  assert.equal(dernier(liste).date, le(23));
});

test("la définition n'altère pas la liste reçue (aucune donnée transformée)", () => {
  const liste = [inter("note", "pe-1", "oe-1", le(22)), inter("appel", "pe-1", "oe-1", le(18))];
  const copie = JSON.stringify(liste);
  Regles.contactsDeclares(liste, typesContact);
  assert.equal(JSON.stringify(liste), copie);
});

// ---------- Assistant vendeur : préparation de rendez-vous ----------
test("assistant : un contact déclaré et une note interne sont présentés différemment, jamais comme « échange »", () => {
  const texte = JSON.stringify(Coach.preparationRendezVous({
    interactions: [{ date: "18 nov.", texte: "Premier appel", nature: "contact" }, { date: "20 nov.", texte: "Client intéressé par les hybrides", nature: "note" }],
    rdv: { typeLibelle: "Essai routier", creneau: "jeudi 10 h", statutLibelle: "Confirmé" }, preferences: [], objections: [],
  }));
  assert.match(texte, /Contact déclaré \(18 nov\.\) : Premier appel/);
  assert.match(texte, /Note interne \(20 nov\.\) : Client intéressé par les hybrides/);
  assert.doesNotMatch(texte, /Dernier échange/);
});
