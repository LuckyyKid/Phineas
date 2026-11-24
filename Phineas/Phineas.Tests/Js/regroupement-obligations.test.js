// Tests unitaires du moteur de recommandations (wwwroot/js/intelligence-regles.js, fonctions pures) :
// regroupement des obligations de « Mes suivis » et réévaluation après un suivi réalisé, remplacé ou reporté.
// Le catalogue des règles et les délais sont lus dans Models/ViewModels/Conseiller/IntelligenceViewModels.cs
// (une seule source de vérité avec l'application).
// Lancement (Node 22 ou plus, aucune dépendance), depuis le dossier Phineas : node --test "Phineas.Tests/Js/*.test.js"
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const racine = path.join(__dirname, "..", "..", "Phineas");
const Regles = require(path.join(racine, "wwwroot", "js", "intelligence-regles.js"));

// ---------- Référentiel lu dans le code C# ----------
const source = fs.readFileSync(path.join(racine, "Models", "ViewModels", "Conseiller", "IntelligenceViewModels.cs"), "utf8");
const regles = [];
for (const m of source.matchAll(/\("([a-z-]+)", "([^"]+)", "([a-z]+)", "(Faible|Normal|Eleve|Urgent)", "([a-z]+)"\)/g)) {
  regles.push({ cle: m[1], libelle: m[2], categorie: m[3], priorite: m[4], nature: m[5] });
}
const config = {};
for (const m of source.matchAll(/public const int (\w+) = (\d+);/g)) config[m[1].charAt(0).toLowerCase() + m[1].slice(1)] = Number(m[2]);
const libellesPriorite = { Faible: "Faible", Normal: "Normal", Eleve: "Élevé", Urgent: "Urgent" };
// Types de contact déclaré (ReferentielsVente.TypesContactDeclare, ProspectsViewModels.cs).
const sourceVente = fs.readFileSync(path.join(racine, "Models", "ViewModels", "Conseiller", "ProspectsViewModels.cs"), "utf8");
const typesContact = JSON.parse(sourceVente.match(/TypesContactDeclare = (\[[^\]]*\]);/)[1]);

const HEURE = 3600000, JOUR = 86400000;
const MAINTENANT = new Date(2026, 10, 24, 14, 0, 0); // mardi 24 novembre 2026, 14 h (heure locale)
const ilYa = (ms) => new Date(MAINTENANT.getTime() - ms).toISOString();
const jourA9h = (decalage) => new Date(2026, 10, 24 + decalage, 9, 0, 0).toISOString();

function contact(id) {
  return { id: id, prenom: "Client", nom: id, conseillerId: "moi" };
}
// Opportunité « Nouveau » créée il y a 2 jours (première réponse attendue), avec un suivi au jour donné (ou aucun).
function opportunite(id, prospectId, suivi) {
  return {
    id: id, prospectId: prospectId, titre: "Opportunité " + id, etape: "Nouveau", etapeLibelle: "Nouveau", conseillerId: "moi",
    dateCreation: ilYa(2 * JOUR), derniereActivite: ilYa(2 * JOUR), vehiculesEnvisages: [],
    prochaineAction: suivi === undefined ? null : "Appeler le client", dateProchaineAction: suivi === undefined ? null : jourA9h(suivi),
  };
}
function contexte(opportunites, interactions, extra) {
  const pids = [...new Set(opportunites.map((o) => o.prospectId))];
  return Object.assign({
    maintenant: MAINTENANT, ref: { config: config, regles: regles, libellesPriorite: libellesPriorite },
    contacts: pids.map(contact), opportunites: opportunites, interactions: interactions || [], typesContact: typesContact,
    soumissions: [], rendezVous: [], transactions: [], relations: null, preferences: {}, pauses: {}, correspondances: [],
  }, extra || {});
}
// Recommandations de « Mes suivis » (relances) puis obligations, comme intelligence-suivis.js.
function obligations(ctx) {
  const actions = Regles.analyser(ctx).actions.filter((a) => a.relance);
  return { actions: actions, obligations: Regles.regrouperObligations(actions) };
}
// Interaction enregistrée en base (identifiant serveur « ie-n… » d'une note, « ie-s… » d'un événement de suivi).
let numero = 0;
function interaction(type, prospectId, oppId, date) {
  numero += 1;
  const prefixe = type.indexOf("suivi-") === 0 ? "ie-s" : "ie-n";
  return { id: prefixe + numero, prospectId: prospectId, opportuniteId: oppId, date: date, type: type, auteur: "Moi", resume: type };
}

// Action synthétique déjà priorisée (pour les cas que le moteur ne produit pas avec des données minimales).
function action(id, opp, relance, objet, priorite, echeance, extra) {
  return Object.assign({ id: id, regle: id.split(":")[0], regleLibelle: id, opportuniteId: opp, prospectId: "p", relance: relance,
    objet: { type: objet, id: objet === "opportunite" ? opp : objet + "-1" }, priorite: priorite, echeance: echeance, departement: "conseiller" }, extra || {});
}

test("le catalogue des règles est bien lu dans le code C#", () => {
  assert.ok(regles.length >= 30);
  assert.equal(config.delaiPremiereReponseHeures, 1);
});

// 1 et 2 : première réponse et suivi du jour sur la même opportunité, une seule obligation avec deux raisons.
test("première réponse et suivi échu sur la même opportunité : une obligation, deux raisons", () => {
  const r = obligations(contexte([opportunite("oe-1", "pe-1", 0)]));
  assert.deepEqual(r.actions.map((a) => a.regle).sort(), ["premiere-reponse", "suivi-echeance"]);
  assert.equal(r.obligations.length, 1);
  const o = r.obligations[0];
  assert.equal(o.regroupee, true);
  assert.deepEqual(o.raisons.map((a) => a.regle).sort(), ["premiere-reponse", "suivi-echeance"]);
});

test("trois raisons de prise de contact (première réponse, suivi, reprise) : une seule obligation", () => {
  const groupes = Regles.regrouperObligations([
    action("premiere-reponse:oe-1", "oe-1", "premiere-reponse", "opportunite", "Eleve", ilYa(HEURE)),
    action("suivi-echeance:oe-1:2026-11-24", "oe-1", "suivi", "opportunite", "Normal", jourA9h(0)),
    action("achat-reporte:oe-1:2026-11-20", "oe-1", "reprise", "opportunite", "Normal", jourA9h(-4)),
  ]);
  assert.equal(groupes.length, 1);
  assert.equal(groupes[0].raisons.length, 3);
});

// 3 : obligations distinctes (audit : rendez-vous, soumission, transaction, autre responsable) gardées séparées.
test("rendez-vous à confirmer, soumission, transaction ou autre responsable : jamais regroupés avec la prise de contact", () => {
  const contactAction = action("premiere-reponse:o-ines", "o-ines", "premiere-reponse", "opportunite", "Eleve", ilYa(HEURE));
  const cas = [
    action("rdv-a-confirmer:r1", "o-ines", "rdv-confirmation", "rendezvous", "Urgent", ilYa(HEURE)),
    action("soumission-sans-reponse:s1", "o-ines", "soumission", "soumission", "Normal", ilYa(HEURE)),
    action("transaction-blocage-resolu:t1", "o-ines", "transaction-client", "transaction", "Normal", ilYa(HEURE)),
    action("achat-reporte:o-ines:x", "o-ines", "reprise", "opportunite", "Normal", ilYa(HEURE), { departement: "financement" }),
  ];
  for (const autre of cas) {
    const groupes = Regles.regrouperObligations([contactAction, autre]);
    assert.equal(groupes.length, 2, autre.id + " doit rester séparé");
  }
});

// Une prise de contact qui porte sur autre chose que l'opportunité elle-même (ex. une demande de véhicule ou une
// transaction, si une règle future le faisait) reste séparée : dans le doute, on ne regroupe pas.
test("une prise de contact dont l'objet n'est pas l'opportunité reste séparée", () => {
  const groupes = Regles.regrouperObligations([
    action("premiere-reponse:oe-1", "oe-1", "premiere-reponse", "opportunite", "Eleve", ilYa(HEURE)),
    action("reprise-demande:d1", "oe-1", "reprise", "demande", "Normal", ilYa(HEURE)),
    action("suivi-transaction:t1", "oe-1", "suivi", "transaction", "Normal", ilYa(HEURE)),
  ]);
  assert.equal(groupes.length, 3);
});

// 4 : deux opportunités du même client.
test("deux opportunités du même client restent deux obligations", () => {
  const r = obligations(contexte([opportunite("oe-1", "pe-1", 0), opportunite("oe-2", "pe-1", 0)]));
  assert.equal(r.obligations.length, 2);
  assert.deepEqual(r.obligations.map((o) => o.raisons[0].opportuniteId).sort(), ["oe-1", "oe-2"]);
});

// 5 : sources conservées, rien n'est supprimé ni modifié.
test("le regroupement conserve chaque recommandation, son identifiant et sa source, sans modifier la liste", () => {
  const r = obligations(contexte([opportunite("oe-1", "pe-1", 0), opportunite("oe-2", "pe-2")]));
  const avant = r.actions.map((a) => a.id);
  const ids = [].concat(...r.obligations.map((o) => o.raisons.map((a) => a.id)));
  assert.deepEqual(ids.slice().sort(), avant.slice().sort());
  assert.deepEqual(r.actions.map((a) => a.id), avant);
  assert.ok(r.obligations.every((o) => o.raisons.every((a) => a.regle && a.relance && a.objet)));
});

// 6 et 7 : priorité de la raison la plus prioritaire ; échéance la plus proche, jamais masquée.
test("priorité : la plus élevée ; échéance : la plus proche de toutes les raisons", () => {
  const g = Regles.regrouperObligations([
    action("suivi-echeance:oe-1:x", "oe-1", "suivi", "opportunite", "Urgent", jourA9h(1)),
    action("premiere-reponse:oe-1", "oe-1", "premiere-reponse", "opportunite", "Normal", ilYa(3 * HEURE)),
  ])[0];
  assert.equal(g.priorite, "Urgent");
  assert.equal(g.principale.regle, "suivi-echeance");
  assert.equal(g.echeance, ilYa(3 * HEURE)); // l'échéance dépassée de la première réponse reste visible
});

test("à priorité égale, la raison principale est la plus proche, puis le suivi planifié (plus concret)", () => {
  const procheEnPremier = Regles.regrouperObligations([
    action("suivi-echeance:oe-1:x", "oe-1", "suivi", "opportunite", "Eleve", jourA9h(1)),
    action("premiere-reponse:oe-1", "oe-1", "premiere-reponse", "opportunite", "Eleve", ilYa(HEURE)),
  ])[0];
  assert.equal(procheEnPremier.principale.regle, "premiere-reponse");
  const egalite = Regles.regrouperObligations([
    action("premiere-reponse:oe-1", "oe-1", "premiere-reponse", "opportunite", "Eleve", jourA9h(0)),
    action("suivi-echeance:oe-1:x", "oe-1", "suivi", "opportunite", "Eleve", jourA9h(0)),
  ])[0];
  assert.equal(egalite.principale.regle, "suivi-echeance");
});

// 8 : compteurs.
test("compteur : une obligation par prise de contact, une par obligation distincte", () => {
  const groupes = Regles.regrouperObligations([
    action("premiere-reponse:oe-1", "oe-1", "premiere-reponse", "opportunite", "Eleve", ilYa(HEURE)),
    action("suivi-echeance:oe-1:x", "oe-1", "suivi", "opportunite", "Normal", jourA9h(0)),
    action("rdv-a-confirmer:r1", "oe-1", "rdv-confirmation", "rendezvous", "Normal", jourA9h(1)),
    action("premiere-reponse:oe-2", "oe-2", "premiere-reponse", "opportunite", "Eleve", ilYa(HEURE)),
  ]);
  assert.equal(groupes.length, 3);
});

// 9 et 10 : ordre déterministe (chaque obligation à la place de sa raison la mieux classée) ; pagination sur les obligations.
test("ordre stable : chaque obligation prend la place de sa première raison, à chaque calcul", () => {
  const liste = [];
  for (let i = 0; i < 9; i++) {
    liste.push(action("premiere-reponse:oe-" + i, "oe-" + i, "premiere-reponse", "opportunite", "Eleve", ilYa(HEURE)));
  }
  liste.push(action("suivi-echeance:oe-0:x", "oe-0", "suivi", "opportunite", "Normal", jourA9h(0)));
  liste.push(action("suivi-echeance:oe-7:x", "oe-7", "suivi", "opportunite", "Normal", jourA9h(0)));
  const a = Regles.regrouperObligations(liste).map((g) => g.id);
  const b = Regles.regrouperObligations(liste).map((g) => g.id);
  assert.deepEqual(a, b);
  assert.deepEqual(a, ["contact:oe-0", "contact:oe-1", "contact:oe-2", "contact:oe-3", "contact:oe-4", "contact:oe-5", "contact:oe-6", "contact:oe-7", "contact:oe-8"]);
  // Pagination de « Mes suivis » (6 par page) : 9 obligations, 2 pages, sans ligne répétée d'une page à l'autre.
  const page1 = a.slice(0, 6), page2 = a.slice(6, 12);
  assert.equal(page2.length, 3);
  assert.equal(new Set(page1.concat(page2)).size, 9);
});

// 11 (scénario A) : après « Marquer comme réalisé », le suivi disparaît ; la première réponse reste tant qu'aucun
// contact n'est déclaré ; les obligations indépendantes ne bougent pas. Aucune réalisation en cascade.
test("après réalisation du suivi : le suivi disparaît, la première réponse reste seule, l'autre opportunité est intacte", () => {
  const avant = contexte([opportunite("oe-1", "pe-1", 0), opportunite("oe-2", "pe-1", 0)]);
  assert.equal(obligations(avant).obligations.length, 2);

  const oe1 = opportunite("oe-1", "pe-1"); // le suivi réalisé n'est plus l'action courante
  const apres = contexte([oe1, opportunite("oe-2", "pe-1", 0)], [interaction("suivi-realise", "pe-1", "oe-1", ilYa(HEURE))]);
  const r = obligations(apres);
  assert.deepEqual(r.actions.filter((a) => a.opportuniteId === "oe-1").map((a) => a.regle), ["premiere-reponse"]);
  const ligne = r.obligations.find((o) => o.id === "contact:oe-1");
  assert.equal(ligne.regroupee, false);
  assert.deepEqual(r.actions.filter((a) => a.opportuniteId === "oe-2").map((a) => a.regle).sort(), ["premiere-reponse", "suivi-echeance"]);
});

// Régression explicite : une tâche accomplie qui n'est pas un contact client ne satisfait jamais la première réponse.
// Ce test échoue si l'ancien comportement (suivi réalisé = première réponse) est réintroduit.
test("régression : un suivi réalisé sans contact client (« Préparer le dossier de financement ») ne satisfait pas la première réponse", () => {
  const o = opportunite("oe-1", "pe-1");
  const realise = interaction("suivi-realise", "pe-1", "oe-1", ilYa(HEURE));
  realise.resume = "Suivi réalisé, déclaré par le conseiller : « Préparer le dossier de financement » (prévu le 24 novembre 2026).";
  const r = obligations(contexte([o], [realise]));
  assert.ok(r.actions.some((a) => a.id === "premiere-reponse:oe-1"), "la première réponse doit rester");
  assert.ok(!Regles.estContactDeclare(realise, typesContact), "un suivi réalisé n'est pas un contact déclaré");
});

// Scénario B : le signal structuré existant (note de la fonctionnalité 04 de type « Appel effectué », « Courriel »
// ou « Visite en concession », déclarée par le conseiller) satisfait la première réponse ; le suivi reste à faire.
for (const type of ["appel", "courriel", "visite"]) {
  test("première réponse satisfaite par une note déclarée de type « " + type + " » : seul le suivi reste", () => {
    const r = obligations(contexte([opportunite("oe-1", "pe-1", 0)], [interaction(type, "pe-1", "oe-1", ilYa(HEURE))]));
    assert.deepEqual(r.actions.filter((a) => a.opportuniteId === "oe-1").map((a) => a.regle), ["suivi-echeance"]);
  });
}

test("un contact déclaré avant la demande ne satisfait pas la première réponse", () => {
  const r = obligations(contexte([opportunite("oe-1", "pe-1")], [interaction("appel", "pe-1", "oe-1", ilYa(3 * JOUR))]));
  assert.ok(r.actions.some((a) => a.id === "premiere-reponse:oe-1"));
});

// 12 : un report n'est pas une prise de contact : la première réponse reste, seule.
test("après report du suivi à plus tard : la première réponse reste, seule (aucun contact déclaré)", () => {
  const ctx = contexte([opportunite("oe-1", "pe-1", 5)], [interaction("suivi-reporte", "pe-1", "oe-1", ilYa(HEURE))]);
  const r = obligations(ctx);
  assert.equal(r.obligations.length, 1);
  assert.deepEqual(r.obligations[0].raisons.map((a) => a.regle), ["premiere-reponse"]);
});

test("après remplacement du suivi : la première réponse reste (remplacer n'est pas réaliser)", () => {
  const ctx = contexte([opportunite("oe-1", "pe-1", 0)], [interaction("suivi-remplace", "pe-1", "oe-1", ilYa(HEURE))]);
  assert.equal(obligations(ctx).obligations[0].raisons.length, 2);
});

// 13 : recommandation devenue obsolète (un premier échange est enregistré) : il ne reste que le suivi, en une ligne simple.
test("après un premier échange : la première réponse est obsolète, l'obligation garde la seule raison du suivi", () => {
  const ctx = contexte([opportunite("oe-1", "pe-1", 0)], [interaction("appel", "pe-1", "oe-1", ilYa(HEURE))]);
  const r = obligations(ctx);
  assert.equal(r.obligations.length, 1);
  assert.equal(r.obligations[0].regroupee, false);
  assert.equal(r.obligations[0].principale.regle, "suivi-echeance");
});

// 14 : données de démonstration (ids « o-… ») : même règle, pas de traitement particulier ; cas de l'audit conservés.
test("données de démonstration : le cas « rendez-vous à confirmer + première réponse » de l'audit reste en deux lignes", () => {
  const groupes = Regles.regrouperObligations([
    action("rdv-a-confirmer:r-ines", "o-ines-cx5", "rdv-confirmation", "rendezvous", "Urgent", ilYa(HEURE)),
    action("premiere-reponse:o-ines-cx5", "o-ines-cx5", "premiere-reponse", "opportunite", "Eleve", ilYa(HEURE)),
  ]);
  assert.equal(groupes.length, 2);
});

// 15 : isolation. Le regroupement ne relie jamais deux opportunités : la clé contient l'opportunité, et « Mes suivis »
// ne reçoit que les dossiers du conseiller (filtre serveur, voir ProspectsDeduplicationControllerTests).
test("une recommandation sans opportunité ou d'une autre opportunité n'est jamais rattachée", () => {
  const groupes = Regles.regrouperObligations([
    action("premiere-reponse:oe-1", "oe-1", "premiere-reponse", "opportunite", "Eleve", ilYa(HEURE)),
    action("premiere-reponse:oe-9", "oe-9", "premiere-reponse", "opportunite", "Eleve", ilYa(HEURE), { conseillerId: "autre" }),
    Object.assign(action("x:1", null, "premiere-reponse", "opportunite", "Eleve", ilYa(HEURE)), { opportuniteId: null }),
  ]);
  assert.equal(groupes.length, 3);
});
