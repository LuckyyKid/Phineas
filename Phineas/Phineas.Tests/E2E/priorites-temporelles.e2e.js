// Test de bout en bout du billet #87 : priorités et compteurs vendeur à des instants FIXES de l'horloge du navigateur,
// de part et d'autre de minuit UTC (19 h à Toronto) et de minuit local ; données de démonstration toujours présentes et
// compteurs cohérents dans chaque chargement. La règle des six heures (avant et après 17 h 59) est vérifiée par
// veille-recommandations.e2e.js. Le minuit du SERVEUR ne se pilote pas d'ici (aucun point d'entrée pour régler son
// heure) : il est couvert par PrioritesTemporellesTests.cs, avec une horloge fixée côté .NET.
// Prérequis et variables : les mêmes que modification-prospect.e2e.js (BASE_URL, CHROMIUM_PATH, MYSQL_CONTAINER, E2E_DB).
// Lancement : node priorites-temporelles.e2e.js   (le paquet « playwright » doit être installé)
// Code de sortie 0 si tout le parcours passe, 1 sinon.
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");

const BASE_URL = process.env.BASE_URL || "http://localhost:5180";
const CONTENEUR = process.env.MYSQL_CONTAINER || "phineas-mysql";
const BASE = process.env.E2E_DB || "phineas_test_e2e";
if (!/^phineas_test/.test(BASE)) throw new Error("Ce test n'écrit que dans une base de test (phineas_test…), pas dans " + BASE + ".");

const SOPHIE = "sophie.gagnon@autoprestige.example";
const MOT_DE_PASSE = "Phineas2026!";
const suffixe = Date.now().toString(36);
const FUSEAU = "America/Toronto"; // minuit UTC = 19 h (heure normale de l'Est)

let etape = 0;
function verifier(condition, message) {
  etape += 1;
  if (!condition) throw new Error("Étape " + etape + " échouée : " + message);
  console.log("ok " + etape + " : " + message);
}

function sql(requete) {
  return execFileSync("docker", ["exec", CONTENEUR, "mysql", "-uphineas", "-pphineas_dev_password", "-N", "-B", "--default-character-set=utf8mb4", BASE, "-e", requete], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

// Jour civil à Toronto (le jour du suivi enregistré), décalé de n jours.
function jourToronto(decalage) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const d = new Date(p + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + decalage);
  return d.toISOString().slice(0, 10);
}
// Instant à une heure de Toronto donnée (heure normale de l'Est, UTC-5) pour un jour donné.
function aToronto(jourIso, heure, minute, seconde) {
  return new Date(jourIso + "T" + String(heure).padStart(2, "0") + ":" + String(minute).padStart(2, "0") + ":" + String(seconde).padStart(2, "0") + "-05:00");
}

async function nouvellePage(navigateur, instant) {
  const p = await (await navigateur.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: FUSEAU })).newPage();
  if (instant) await p.clock.setFixedTime(instant);
  return p;
}

async function connecter(page) {
  await page.goto(BASE_URL + "/Account/Login");
  await page.fill("#Email", SOPHIE);
  await page.fill("#Password", MOT_DE_PASSE);
  await Promise.all([page.waitForNavigation(), page.click("button[type=submit]")]);
}

// Prospect réel, contact déjà déclaré, suivi planifié pour le jour donné : il ne reste que le suivi.
async function creerAvecSuivi(page, nom, jourSuivi) {
  await page.goto(BASE_URL + "/Prospects");
  await page.click(".pr-entete [data-ouvrir-creation]");
  await page.waitForSelector("#tiroir-prospect.show");
  await page.fill("#p-prenom", "Ana");
  await page.fill("#p-nom", nom);
  await page.fill("#p-courriel", nom.toLowerCase() + "@exemple.test");
  await page.click('label[for="p-pref-courriel"]');
  await page.selectOption("#p-source", "appel");
  await Promise.all([page.waitForNavigation(), page.click('#tiroir-prospect button[type="submit"]', { position: { x: 15, y: 15 } })]);
  const ids = sql("SELECT p.Id, o.Id FROM Prospects p JOIN OpportunitesVente o ON o.ProspectId = p.Id WHERE p.Nom = '" + nom + "'").split("\t");
  // Base jetable : suivi du jour voulu et premier contact déjà enregistré (la première réponse n'est plus due). Création
  // il y a 3 jours, appel il y a 2 jours : passés pour tous les instants fixes du test, quelle que soit l'heure réelle.
  sql("UPDATE OpportunitesVente SET ProchaineAction = 'Rappeler " + nom + "', DateProchaineAction = '" + jourSuivi + " 00:00:00', " +
    "DateCreation = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 3 DAY) WHERE Id = " + ids[1]);
  sql("INSERT INTO NotesProspect (ProspectId, OpportuniteId, AuteurId, Type, Contenu, DateCreation, JetonSoumission) SELECT " + ids[0] + ", " + ids[1] +
    ", Id, 'appel', 'Premier appel.', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 DAY), UUID() FROM AspNetUsers WHERE Email = '" + SOPHIE + "'");
  return { prospectId: ids[0], oppId: ids[1], cle: "suivi-echeance:oe-" + ids[1] + ":" + jourSuivi };
}

// Tout ce qu'un chargement de l'Intelligence montre pour la comparaison : données d'entrée réelles, recommandations,
// obligations regroupées, priorités, compteurs, Accueil, et la part de démonstration.
async function charger(page, cle, oppId) {
  await page.goto(BASE_URL + "/Intelligence");
  await page.waitForTimeout(900);
  const vue = await page.evaluate(function (args) {
    const R = window.IntelligenceRegles, I = window.Intelligence, moi = window.Prospects.moiId;
    const brut = JSON.parse(document.getElementById("prospects-donnees").textContent).donnees;
    const gardees = R.actionsGardees(I.actives({ conseiller: moi }));
    const reelles = gardees.filter(function (a) { return R.estDossierReel(a); });
    const groupes = R.regrouperObligations(reelles);
    const x = I.action(args.cle);
    const nbFile = document.querySelector('[data-champ="nb-file"]');
    return {
      entrees: brut.opportunites.filter(function (o) { return o.id.indexOf("oe-") === 0; }).map(function (o) { return o.id + "|" + o.dateProchaineAction + "|" + o.prochaineAction; }).sort(),
      recommandations: reelles.map(function (a) { return a.id + "|" + a.priorite; }).sort(),
      obligations: groupes.map(function (g) { return g.id + "=" + g.raisons.map(function (r) { return r.regle; }).sort().join("+"); }).sort(),
      clesUniques: groupes.length === new Set(groupes.map(function (g) { return g.id; })).size,
      suivi: x ? { priorite: x.priorite, statut: x.statut } : null,
      accueil: R.prioritesAccueil(gardees, new Date(), 1000).filter(function (g) { return g.raisons.some(function (r) { return r.opportuniteId === args.opp; }); }).length,
      retardReel: R.compterObligations(reelles, new Date()).retard,
      compteurs: I.compteurs(moi),
      nbFile: nbFile ? Number(nbFile.textContent) : null,
      fictives: gardees.filter(function (a) { return !R.estDossierReel(a); }).length,
      opportunitesFictives: brut.opportunites.filter(function (o) { return o.id.indexOf("oe-") !== 0; }).length,
    };
  }, { cle: cle, opp: "oe-" + oppId });
  return vue;
}

(async function () {
  const navigateur = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const erreurs = [];
  try {
    const page = await nouvellePage(navigateur, null);
    await connecter(page);
    const jourJ = jourToronto(0);
    const s = await creerAvecSuivi(page, "Temporel" + suffixe, jourJ);
    const historique = sql("SELECT COUNT(*) FROM HistoriquesSuiviOpportunite WHERE OpportuniteId = " + s.oppId);
    verifier(!!s.oppId, "dossier réel créé : contact déclaré, suivi le " + jourJ);

    // ---------- Scénario C : minuit UTC (19 h à Toronto), deux chargements de part et d'autre ----------
    const vues = {};
    for (const [nom, instant] of [["avant", aToronto(jourJ, 18, 59, 50)], ["apres", aToronto(jourJ, 19, 0, 10)]]) {
      const p = await nouvellePage(navigateur, instant);
      p.on("pageerror", function (e) { if (String(e.message).indexOf("ViewTransition") < 0) erreurs.push(e.message); });
      await connecter(p);
      vues[nom] = await charger(p, s.cle, s.oppId);
      await p.context().close();
    }
    const av = vues.avant, ap = vues.apres;
    verifier(JSON.stringify(ap.entrees) === JSON.stringify(av.entrees), "minuit UTC : mêmes données d'entrée réelles (" + av.entrees.length + " opportunité(s))");
    verifier(JSON.stringify(ap.recommandations) === JSON.stringify(av.recommandations), "minuit UTC : mêmes recommandations réelles et mêmes priorités");
    verifier(JSON.stringify(ap.obligations) === JSON.stringify(av.obligations) && av.clesUniques && ap.clesUniques,
      "minuit UTC : mêmes obligations regroupées, aucune comptée deux fois");
    verifier(av.suivi && ap.suivi && av.suivi.priorite === "Eleve" && ap.suivi.priorite === "Eleve" && av.suivi.statut === "ATraiter" && ap.suivi.statut === "ATraiter",
      "minuit UTC : le suivi du jour reste « Élevé » (moins de six heures) et à traiter des deux côtés");
    verifier(av.accueil === 1 && ap.accueil === 1, "minuit UTC : le suivi est sur l'Accueil des deux côtés");

    // ---------- Scénario D : démonstration présente, compteurs cohérents dans chaque chargement ----------
    for (const [nom, v] of [["avant", av], ["après", ap]]) {
      verifier(v.opportunitesFictives > 0 && v.fictives > 0, nom + " minuit UTC : données de démonstration présentes (" + v.opportunitesFictives + " opportunités, " + v.fictives + " recommandations)");
      verifier(v.nbFile === v.compteurs.aTraiter, nom + " minuit UTC : chiffre de la file = compteur « à traiter » (" + v.nbFile + ")");
    }

    // ---------- Minuit local : le suivi d'hier garde son identifiant et passe en retard, compté une fois ----------
    // 23 h 58 min 30 s : avant l'échéance du suivi du jour (23 h 59 min 00 s), puis 00 h 00 min 30 s le lendemain.
    const veille = await nouvellePage(navigateur, aToronto(jourJ, 23, 58, 30));
    await connecter(veille);
    const v1 = await charger(veille, s.cle, s.oppId);
    await veille.context().close();
    const lendemain = await nouvellePage(navigateur, aToronto(jourToronto(1), 0, 0, 30));
    await connecter(lendemain);
    const v2 = await charger(lendemain, s.cle, s.oppId);
    await lendemain.context().close();
    verifier(v1.suivi && v2.suivi && v2.suivi.statut === "ATraiter", "minuit local : même recommandation (" + s.cle + "), toujours à traiter");
    verifier(v1.retardReel === 0 && v2.retardReel === 1, "minuit local : pas en retard avant l'échéance de 23 h 59, en retard le lendemain (" + v1.retardReel + " puis " + v2.retardReel + ")");
    // Le lendemain, d'autres règles peuvent légitimement s'appliquer au dossier (ex. qualification manquante) : seule la
    // prise de contact doit rester une obligation unique, avec le suivi comme raison.
    verifier(v2.obligations.filter(function (o) { return o.indexOf("contact:oe-" + s.oppId + "=") === 0; }).join() === "contact:oe-" + s.oppId + "=suivi-echeance" && v2.clesUniques,
      "minuit local : une seule prise de contact pour ce dossier, aucune obligation comptée deux fois (" + v2.obligations.join(", ") + ")");

    // ---------- Aucune écriture : lectures seulement ----------
    verifier(sql("SELECT COUNT(*) FROM HistoriquesSuiviOpportunite WHERE OpportuniteId = " + s.oppId) === historique &&
      sql("SELECT CONCAT(ProchaineAction, '|', DATE(DateProchaineAction)) FROM OpportunitesVente WHERE Id = " + s.oppId) === "Rappeler Temporel" + suffixe + "|" + jourJ,
      "en base : suivi inchangé, aucune réalisation ni aucun report");
    verifier(erreurs.length === 0, "aucune erreur JavaScript (" + JSON.stringify(erreurs) + ")");

    console.log("\nParcours des priorités temporelles réussi (" + etape + " vérifications).");
  } catch (erreur) {
    console.error("\n" + erreur.message);
    process.exitCode = 1;
  } finally {
    await navigateur.close();
  }
})();
