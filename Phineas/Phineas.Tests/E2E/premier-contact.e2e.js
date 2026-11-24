// Test de bout en bout : reconnaissance du premier contact déclaré (fonctionnalité 10), sur l'application réelle et MySQL.
// Une note ordinaire, une tâche terminée (suivi réalisé) et un contact déclaré (note « Appel effectué », « Courriel
// (résumé) » ou « Visite en concession » liée à l'opportunité, après la demande) produisent trois comportements différents.
// Prérequis et variables : les mêmes que modification-prospect.e2e.js (BASE_URL, CHROMIUM_PATH, MYSQL_CONTAINER, E2E_DB).
// Lancement : node premier-contact.e2e.js   (le paquet « playwright » doit être installé)
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

function jour(decalage) {
  const d = new Date();
  d.setDate(d.getDate() + decalage);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

let etape = 0;
function verifier(condition, message) {
  etape += 1;
  if (!condition) throw new Error("Étape " + etape + " échouée : " + message);
  console.log("ok " + etape + " : " + message);
}

function sql(requete) {
  return execFileSync("docker", ["exec", CONTENEUR, "mysql", "-uphineas", "-pphineas_dev_password", "-N", "-B", "--default-character-set=utf8mb4", BASE, "-e", requete], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

async function nouvellePage(navigateur, options) {
  return (await navigateur.newContext(Object.assign({ viewport: { width: 1440, height: 900 } }, options || {}))).newPage();
}

async function connecter(page, courriel) {
  await page.goto(BASE_URL + "/Account/Login");
  await page.fill("#Email", courriel);
  await page.fill("#Password", MOT_DE_PASSE);
  await Promise.all([page.waitForNavigation(), page.click("button[type=submit]")]);
}

// Prospect réel (étape « Nouveau » : une première réponse est attendue), avec ou sans suivi planifié (fenêtre de la fiche).
async function creer(page, nom, suivi) {
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
  if (suivi) {
    await page.goto(BASE_URL + "/Prospects/Fiche/pe-" + ids[0]);
    await page.waitForTimeout(600);
    await page.click('[data-action="suivi"]');
    await page.waitForSelector("#modal-suivi.show");
    await page.fill("#s-action", suivi);
    await page.fill("#s-date", jour(0));
    await Promise.all([page.waitForNavigation(), page.click('#form-suivi button[type="submit"]')]);
  }
  return { prospectId: ids[0], oppId: ids[1] };
}

// Formulaire « Ajouter une note » de la fiche. opp : « oe-… » ou "" (« Le contact (général) »).
async function noter(page, prospectId, type, opp, texte) {
  await page.goto(BASE_URL + "/Prospects/Fiche/pe-" + prospectId);
  await page.click("#onglet-historique");
  await page.locator("#form-note").waitFor({ state: "visible" });
  await page.selectOption("#n-type", type);
  await page.selectOption("#n-opp", opp);
  await page.fill("#n-resume", texte);
  await Promise.all([page.waitForNavigation(), page.click('#form-note button[type="submit"]')]);
}

// Recommandations actives d'une opportunité, après un nouveau chargement de « Mes suivis ».
async function recommandations(page, oppId) {
  await page.goto(BASE_URL + "/Intelligence/Suivis");
  await page.waitForTimeout(900);
  return page.evaluate(function (id) {
    return window.Intelligence.actives({ conseiller: window.Prospects.moiId }).filter(function (a) { return a.opportuniteId === id; }).map(function (a) { return a.regle; }).sort();
  }, oppId);
}
const attendPremiereReponse = async (page, oppId) => (await recommandations(page, "oe-" + oppId)).indexOf("premiere-reponse") >= 0;

// Ligne de « À traiter » d'une opportunité (raisons listées), en parcourant les pages ; null si absente.
async function raisonsLigne(page, oppId) {
  const premiere = page.locator('[data-zone="pagination-relances"] [data-aller-page="1"]:not([disabled])');
  if (await premiere.count()) { await premiere.first().click(); await page.waitForTimeout(150); }
  for (let numero = 1; numero <= 40; numero++) {
    const ligne = page.locator('#relances tr[data-obligation="contact:oe-' + oppId + '"]');
    if (await ligne.count()) return ligne.first().locator("[data-raison]").evaluateAll(function (l) { return l.map(function (x) { return x.dataset.raison; }).sort(); });
    const suivante = page.locator('[data-zone="pagination-relances"] [data-aller-page="' + (numero + 1) + '"]:not([disabled])');
    if (!(await suivante.count())) return null;
    await suivante.first().click();
    await page.waitForTimeout(150);
  }
  return null;
}

(async () => {
  const navigateur = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await nouvellePage(navigateur);
  let code = 0;

  try {
    // ---------- Parcours principal ----------
    await connecter(page, SOPHIE);
    const a = await creer(page, "Contact" + suffixe, "Préparer le dossier de financement");
    verifier(await attendPremiereReponse(page, a.oppId), "prospect réel créé : « Première réponse » est recommandée (oe-" + a.oppId + ")");
    verifier((await raisonsLigne(page, a.oppId)).join() === "premiere-reponse,suivi-echeance", "« Mes suivis » : une ligne, deux raisons (première réponse et suivi)");

    await noter(page, a.prospectId, "note", "oe-" + a.oppId, "Client intéressé par les véhicules hybrides.");
    verifier(sql("SELECT CONCAT(Type, ' | ', OpportuniteId) FROM NotesProspect WHERE ProspectId = " + a.prospectId) === "note | " + a.oppId, "note ordinaire enregistrée en base, liée à l'opportunité");
    await page.click("#onglet-historique");
    verifier((await page.locator('#panneau-historique [data-zone="timeline"]').innerText()).includes("Client intéressé par les véhicules hybrides."), "la note apparaît dans l'historique");
    verifier(await attendPremiereReponse(page, a.oppId), "après actualisation : « Première réponse » est toujours due (une note n'est pas un contact)");

    await noter(page, a.prospectId, "note", "oe-" + a.oppId, "Appeler le client demain");
    verifier(await attendPremiereReponse(page, a.oppId), "une note ordinaire qui contient « appeler » ne compte pas non plus");

    await noter(page, a.prospectId, "appel", "oe-" + a.oppId, "Premier appel : le client souhaite un essai.");
    verifier(sql("SELECT COUNT(*) FROM NotesProspect WHERE ProspectId = " + a.prospectId + " AND Type = 'appel' AND OpportuniteId = " + a.oppId) === "1", "note « Appel effectué » enregistrée, liée à la bonne opportunité");
    verifier(!(await attendPremiereReponse(page, a.oppId)), "contact déclaré reconnu : « Première réponse » a disparu");
    verifier((await raisonsLigne(page, a.oppId)).join() === "suivi-echeance", "l'autre obligation reste : la ligne garde le suivi planifié, toujours actif");
    verifier(sql("SELECT CONCAT(ProchaineAction, ' | ', (SELECT COUNT(*) FROM HistoriquesSuiviOpportunite WHERE OpportuniteId = " + a.oppId + ")) FROM OpportunitesVente WHERE Id = " + a.oppId) === "Préparer le dossier de financement | 0", "en base : le suivi n'a pas été réalisé automatiquement");

    await page.click('form[action="/Account/Logout"] button[type="submit"]');
    await page.waitForURL(function (url) { return url.pathname.indexOf("/Intelligence") !== 0; });
    await connecter(page, SOPHIE);
    verifier(!(await attendPremiereReponse(page, a.oppId)) && (await raisonsLigne(page, a.oppId)).join() === "suivi-echeance", "après reconnexion : même résultat");

    // ---------- Courriel (résumé) et visite en concession ----------
    for (const type of ["courriel", "visite"]) {
      const x = await creer(page, type + suffixe);
      verifier(await attendPremiereReponse(page, x.oppId), type + " : première réponse due au départ");
      await noter(page, x.prospectId, type, "oe-" + x.oppId, "Contact déclaré (" + type + ").");
      verifier(!(await attendPremiereReponse(page, x.oppId)) && sql("SELECT Type FROM NotesProspect WHERE ProspectId = " + x.prospectId) === type, type + " : contact déclaré reconnu, note en base");
    }

    // ---------- Deux opportunités d'un même prospect ----------
    const d = await creer(page, "DeuxOpp" + suffixe);
    sql("INSERT INTO OpportunitesVente (ProspectId, Titre, Etape, DateCreation, DerniereActivite) VALUES (" + d.prospectId + ", 'Deuxième véhicule', 'Nouveau', NOW(), NOW())");
    const b = sql("SELECT Id FROM OpportunitesVente WHERE ProspectId = " + d.prospectId + " AND Titre = 'Deuxième véhicule'");
    await noter(page, d.prospectId, "appel", "oe-" + d.oppId, "Appel pour la première demande.");
    verifier(!(await attendPremiereReponse(page, d.oppId)) && await attendPremiereReponse(page, b), "deux opportunités : l'appel satisfait A seulement, B attend toujours sa première réponse");

    // ---------- Contact général (sans opportunité) ----------
    const g = await creer(page, "General" + suffixe);
    await page.goto(BASE_URL + "/Prospects/Fiche/pe-" + g.prospectId);
    await page.click("#onglet-historique");
    await page.locator("#form-note").waitFor({ state: "visible" });
    await page.selectOption("#n-type", "appel");
    await page.selectOption("#n-opp", "");
    verifier(await page.locator("#n-aide-contact").isVisible(), "formulaire : l'aide explique qu'un contact doit concerner une opportunité pour compter");
    await page.selectOption("#n-opp", "oe-" + g.oppId);
    verifier(!(await page.locator("#n-aide-contact").isVisible()), "… et disparaît quand l'opportunité est choisie");
    await page.selectOption("#n-type", "note"); await page.selectOption("#n-opp", "");
    verifier(!(await page.locator("#n-aide-contact").isVisible()), "… et n'apparaît pas pour une note ordinaire générale (toujours permise)");
    await noter(page, g.prospectId, "appel", "", "Appel général au client.");
    verifier(sql("SELECT CONCAT(Type, ' | ', IFNULL(OpportuniteId, 'aucune')) FROM NotesProspect WHERE ProspectId = " + g.prospectId) === "appel | aucune", "contact général conservé en base, sans opportunité");
    verifier(await attendPremiereReponse(page, g.oppId), "un contact général ne satisfait pas la première réponse de l'opportunité");

    // ---------- Contact antérieur à la demande ----------
    const e = await creer(page, "Ancien" + suffixe);
    await noter(page, e.prospectId, "appel", "oe-" + e.oppId, "Appel d'une ancienne demande.");
    verifier(!(await attendPremiereReponse(page, e.oppId)), "contact postérieur à la demande : reconnu");
    sql("UPDATE NotesProspect n JOIN OpportunitesVente o ON o.Id = n.OpportuniteId SET n.DateCreation = DATE_SUB(o.DateCreation, INTERVAL 3 DAY) WHERE n.ProspectId = " + e.prospectId);
    verifier(await attendPremiereReponse(page, e.oppId), "le même contact daté d'avant la demande (date serveur) : ne la satisfait pas");
    await page.goto(BASE_URL + "/Prospects/Fiche/pe-" + e.prospectId); await page.click("#onglet-historique"); await page.waitForTimeout(400);
    verifier((await page.locator('#panneau-historique [data-zone="timeline"]').innerText()).includes("Appel d'une ancienne demande."), "… et reste dans l'historique");

    // ---------- Suivi marqué réalisé sans contact ----------
    const f = await creer(page, "Tache" + suffixe, "Préparer le dossier de financement");
    await page.goto(BASE_URL + "/Intelligence/Suivis"); await page.waitForTimeout(900);
    await raisonsLigne(page, f.oppId);
    await Promise.all([page.waitForNavigation(), page.locator('#relances tr[data-obligation="contact:oe-' + f.oppId + '"] [data-realiser-suivi]').click()]);
    verifier(await attendPremiereReponse(page, f.oppId) && sql("SELECT Cloture FROM HistoriquesSuiviOpportunite WHERE OpportuniteId = " + f.oppId) === "Realise", "suivi réalisé (historique « Realise ») : la première réponse reste due");

    // ---------- Fenêtre « Préparer une relance » : pas de contact local sur un dossier enregistré ----------
    await page.goto(BASE_URL + "/Intelligence/Suivis"); await page.waitForTimeout(900);
    await raisonsLigne(page, g.oppId);
    await page.locator('#relances tr[data-obligation="contact:oe-' + g.oppId + '"] [data-ia="relance"]').click();
    await page.waitForSelector("#ia-modale.show");
    verifier(await page.locator('#ia-modale [data-ia-relance="contact"]').count() === 0 && (await page.locator("#ia-modale a.btn-primary").getAttribute("href")) === "/Prospects/Fiche/pe-" + g.prospectId,
      "dossier réel : la fenêtre de relance renvoie à la fiche pour déclarer le contact (aucune déclaration locale)");
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    const demo = await page.evaluate(function () { const x = window.Intelligence.actives().find(function (y) { return y.relance && String(y.opportuniteId).indexOf("o-") === 0; }); return x ? x.id : null; });
    await page.evaluate(function (id) { window.IntelligenceUI.ouvrirRelance(id); }, demo);
    await page.waitForSelector("#ia-modale.show");
    verifier(await page.locator('#ia-modale [data-ia-relance="contact"]').count() === 1, "dossier de démonstration : « J'ai contacté le client » reste disponible (démonstration locale)");
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);

    // ---------- Protection entre conseillers et entre concessions ----------
    function creerConseiller(courriel, concession) {
      sql("INSERT INTO AspNetUsers (Id, FirstName, LastName, DealershipId, IsActive, MustChangePassword, CreatedAt, UserName, NormalizedUserName, Email, NormalizedEmail, EmailConfirmed, PasswordHash, SecurityStamp, ConcurrencyStamp, PhoneNumberConfirmed, TwoFactorEnabled, LockoutEnabled, AccessFailedCount) " +
        "SELECT UUID(), 'Autre', 'Conseiller', " + concession + ", 1, 0, NOW(), '" + courriel + "', UPPER('" + courriel + "'), '" + courriel + "', UPPER('" + courriel + "'), 1, PasswordHash, UUID(), UUID(), 0, 0, 1, 0 FROM AspNetUsers WHERE Email = '" + SOPHIE + "'");
      sql("INSERT INTO AspNetUserRoles (UserId, RoleId) SELECT u.Id, r.Id FROM AspNetUsers u, AspNetRoles r WHERE u.Email = '" + courriel + "' AND r.Name = 'Conseiller'");
    }
    sql("UPDATE Dealerships SET IsActive = 1 WHERE Name = 'Garage Saint-Laurent'");
    const collegue = "collegue.contact." + suffixe + "@autoprestige.example";
    const ailleurs = "ailleurs.contact." + suffixe + "@garagestl.example";
    creerConseiller(collegue, "(SELECT DealershipId FROM (SELECT DealershipId FROM AspNetUsers WHERE Email = '" + SOPHIE + "') x)");
    creerConseiller(ailleurs, "(SELECT Id FROM Dealerships WHERE Name = 'Garage Saint-Laurent')");
    for (const courriel of [collegue, ailleurs]) {
      const autre = await nouvellePage(navigateur);
      await connecter(autre, courriel);
      const html = await (await autre.goto(BASE_URL + "/Intelligence/Suivis")).text();
      const fiche = await autre.goto(BASE_URL + "/Prospects/Fiche/pe-" + a.prospectId);
      verifier(!html.includes("Premier appel : le client souhaite un essai.") && !html.includes("Contact" + suffixe) && fiche.status() === 404, (courriel === collegue ? "collègue" : "autre concession") + " : aucune note ni dossier visible, fiche refusée (404)");
    }

    // ---------- Thème sombre et 390 px ----------
    const mobile = await nouvellePage(navigateur, { viewport: { width: 390, height: 844 } });
    await connecter(mobile, SOPHIE);
    await mobile.goto(BASE_URL + "/Prospects/Fiche/pe-" + g.prospectId);
    await mobile.evaluate(function () { document.documentElement.dataset.theme = "sombre"; });
    await mobile.click("#onglet-historique");
    await mobile.locator("#form-note").waitFor({ state: "visible" });
    await mobile.selectOption("#n-type", "appel"); await mobile.selectOption("#n-opp", "");
    await mobile.locator("#n-aide-contact").scrollIntoViewIfNeeded();
    const debordFiche = await mobile.evaluate(function () { return document.documentElement.scrollWidth - document.documentElement.clientWidth; });
    await mobile.locator("#form-note").screenshot({ path: "contact-form-390-sombre.png" });
    await mobile.goto(BASE_URL + "/Intelligence/Suivis"); await mobile.waitForTimeout(800);
    await mobile.evaluate(function () { document.documentElement.dataset.theme = "sombre"; });
    const debordSuivis = await mobile.evaluate(function () { return document.documentElement.scrollWidth - document.documentElement.clientWidth; });
    verifier(debordFiche === 0 && debordSuivis === 0 && await mobile.locator("#n-aide-contact").count() === 0, "390 px, thème sombre : fiche (aide visible) et « Mes suivis » sans défilement horizontal");

    console.log("\nParcours du premier contact réussi (" + etape + " vérifications).");
  } catch (erreur) {
    console.error("\n" + erreur.message);
    await page.screenshot({ path: "e2e-contact-echec.png" });
    code = 1;
  } finally {
    await navigateur.close();
  }
  process.exit(code);
})();
