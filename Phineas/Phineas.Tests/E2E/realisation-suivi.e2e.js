// Test de bout en bout : « Marquer comme réalisé » depuis « Mes suivis », sur un suivi réellement planifié en MySQL,
// et archivage d'un suivi remplacé. Aucune carte ni donnée locale n'est injectée : tout part de l'application réelle.
// Prérequis et variables : les mêmes que modification-prospect.e2e.js (BASE_URL, CHROMIUM_PATH, MYSQL_CONTAINER, E2E_DB).
// Lancement : node realisation-suivi.e2e.js   (le paquet « playwright » doit être installé)
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

// Date « AAAA-MM-JJ » du navigateur, dans N jours (comme le champ <input type="date">).
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

async function connecter(page, courriel) {
  await page.goto(BASE_URL + "/Account/Login");
  await page.fill("#Email", courriel);
  await page.fill("#Password", MOT_DE_PASSE);
  await Promise.all([page.waitForNavigation(), page.click("button[type=submit]")]);
}

// Crée un prospect par le vrai formulaire puis planifie son suivi par la vraie fenêtre ; retourne ses ids.
async function creerAvecSuivi(page, nom, action, decalage) {
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
  await planifier(page, ids[0], action, decalage);
  return { prospectId: ids[0], oppId: ids[1] };
}

async function planifier(page, prospectId, action, decalage) {
  await page.goto(BASE_URL + "/Prospects/Fiche/pe-" + prospectId);
  await page.waitForTimeout(600);
  await page.click('[data-action="suivi"]');
  await page.waitForSelector("#modal-suivi.show");
  await page.fill("#s-action", action);
  await page.fill("#s-date", jour(decalage));
  await Promise.all([page.waitForNavigation(), page.click('#form-suivi button[type="submit"]')]);
}

// Cherche dans « Mes suivis » la ligne du suivi (texte de l'action ET bouton « Marquer comme réalisé »), page après page.
// Une autre recommandation du même prospect peut aussi citer l'action (« prévu : … ») : elle n'est pas retenue.
async function trouverLigne(page, texte) {
  await page.goto(BASE_URL + "/Intelligence/Suivis");
  await page.waitForTimeout(800);
  for (let numero = 1; numero <= 30; numero++) {
    const ligne = page.locator("#relances tr", { hasText: texte, has: page.locator("[data-realiser-suivi]") });
    if (await ligne.count()) return ligne.first();
    // Le bouton « Page suivante » de la dernière page porte aussi ce numéro, mais il est désactivé.
    const suivante = page.locator('[data-zone="pagination-relances"] [data-aller-page="' + (numero + 1) + '"]:not([disabled])');
    if (!(await suivante.count())) return null;
    await suivante.first().click();
    await page.waitForTimeout(200);
  }
  return null;
}

async function messageAffiche(page) {
  const toast = page.locator("#sv-toast [data-toast-texte]");
  await toast.waitFor({ state: "visible" });
  return toast.innerText();
}

// Textes de l'onglet Historique de la fiche.
async function historique(page, prospectId) {
  await page.goto(BASE_URL + "/Prospects/Fiche/pe-" + prospectId);
  await page.click("#onglet-historique");
  await page.waitForTimeout(400);
  return page.locator('#panneau-historique [data-zone="timeline"]').innerText();
}

(async () => {
  const navigateur = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await (await navigateur.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  let code = 0;

  try {
    // ---------- Scénario principal : un suivi du jour réalisé depuis « Mes suivis » ----------
    await connecter(page, SOPHIE);
    const action = "Appeler pour l'essai " + suffixe;
    const a = await creerAvecSuivi(page, "Realise" + suffixe, action, 0);
    verifier(sql("SELECT ProchaineAction FROM OpportunitesVente WHERE Id = " + a.oppId) === action, "suivi du jour planifié en base (oe-" + a.oppId + ")");

    let ligne = await trouverLigne(page, action);
    verifier(ligne !== null, "« Mes suivis » affiche le suivi réel");
    const texteLigne = await ligne.innerText();
    verifier(texteLigne.includes("Ana Realise" + suffixe) && texteLigne.includes("Suivi demandé arrivé à échéance"), "bon prospect et bonne catégorie (« Suivi demandé arrivé à échéance »)");
    await page.reload(); await page.waitForTimeout(600);
    verifier((await trouverLigne(page, action)) !== null, "après actualisation : le suivi est toujours listé");

    ligne = await trouverLigne(page, action);
    await Promise.all([page.waitForNavigation(), ligne.locator("[data-realiser-suivi]").click()]);
    verifier((await messageAffiche(page)).includes("marqué comme réalisé"), "confirmation de la réalisation");
    verifier((await trouverLigne(page, action)) === null, "le suivi n'est plus parmi les suivis actifs");

    let texteHistorique = await historique(page, a.prospectId);
    verifier(texteHistorique.includes("Suivi réalisé") && texteHistorique.includes(action), "l'historique du dossier montre « Suivi réalisé »");
    await page.reload(); await page.click("#onglet-historique"); await page.waitForTimeout(400);
    verifier((await page.locator('#panneau-historique [data-zone="timeline"]').innerText()).includes(action), "après actualisation : l'événement est toujours là");

    await page.click('form[action="/Account/Logout"] button[type="submit"]');
    await page.waitForURL(function (url) { return url.pathname.indexOf("/Prospects") !== 0; });
    await connecter(page, SOPHIE);
    verifier((await historique(page, a.prospectId)).includes(action), "après reconnexion : l'événement est toujours là");
    verifier((await trouverLigne(page, action)) === null, "après reconnexion : toujours absent des suivis actifs");

    const enBase = sql("SELECT h.Cloture, h.Action, DATE(h.DatePrevue), u.Email FROM HistoriquesSuiviOpportunite h JOIN AspNetUsers u ON u.Id = h.AuteurId WHERE h.OpportuniteId = " + a.oppId).split("\n");
    const champs = enBase[0].split("\t");
    verifier(enBase.length === 1 && champs[0] === "Realise" && champs[1] === action && champs[2] === jour(0) && champs[3] === SOPHIE, "en base : un événement « Realise », action, date prévue et auteur exacts");
    verifier(sql("SELECT IFNULL(ProchaineAction, 'aucune') FROM OpportunitesVente WHERE Id = " + a.oppId) === "aucune", "en base : plus d'action courante");

    // ---------- Suivi en retard : réalisable ----------
    const actionRetard = "Relance en retard " + suffixe;
    const r = await creerAvecSuivi(page, "Retard" + suffixe, actionRetard, 1);
    sql("UPDATE OpportunitesVente SET DateProchaineAction = DATE_SUB(DateProchaineAction, INTERVAL 5 DAY) WHERE Id = " + r.oppId);
    ligne = await trouverLigne(page, actionRetard);
    verifier(ligne !== null, "suivi en retard listé dans « Mes suivis »");
    await Promise.all([page.waitForNavigation(), ligne.locator("[data-realiser-suivi]").click()]);
    await messageAffiche(page);
    verifier(sql("SELECT Cloture FROM HistoriquesSuiviOpportunite WHERE OpportuniteId = " + r.oppId) === "Realise", "suivi en retard réalisé en base");

    // ---------- Suivi futur : pas encore dans « Mes suivis » ----------
    const actionFuture = "Appel futur " + suffixe;
    await creerAvecSuivi(page, "Futur" + suffixe, actionFuture, 6);
    verifier((await trouverLigne(page, actionFuture)) === null, "suivi futur non listé (seulement ce qui est dû)");

    // ---------- Remplacement ----------
    const ancienne = "Ancienne action " + suffixe;
    const nouvelle = "Nouvelle action " + suffixe;
    const m = await creerAvecSuivi(page, "Remplace" + suffixe, ancienne, 0);
    // Page « Mes suivis » ouverte AVANT le remplacement (elle montre encore l'ancienne action).
    const anciennePage = await (await navigateur.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await connecter(anciennePage, SOPHIE);
    const ligneAncienne = await trouverLigne(anciennePage, ancienne);
    verifier(ligneAncienne !== null, "ancienne page : l'ancienne action est affichée");
    await planifier(page, m.prospectId, nouvelle, 0);
    texteHistorique = await historique(page, m.prospectId);
    verifier(texteHistorique.includes("Suivi remplacé") && texteHistorique.includes(ancienne), "l'ancienne action apparaît comme remplacée");
    verifier(!texteHistorique.includes("Suivi réalisé"), "l'ancienne action n'est pas présentée comme réalisée");
    verifier((await trouverLigne(page, nouvelle)) !== null, "la nouvelle action est active dans « Mes suivis »");
    // L'ancienne page tente de réaliser l'ancienne action : refus, la nouvelle reste active.
    await Promise.all([anciennePage.waitForNavigation(), ligneAncienne.locator("[data-realiser-suivi]").click()]);
    verifier((await messageAffiche(anciennePage)).includes("changé entre-temps"), "ancienne page : refus expliqué");
    verifier(sql("SELECT ProchaineAction FROM OpportunitesVente WHERE Id = " + m.oppId) === nouvelle, "en base : la nouvelle action reste active");
    verifier(sql("SELECT CONCAT(SUM(Cloture = 'Remplace'), '/', SUM(Cloture = 'Realise')) FROM HistoriquesSuiviOpportunite WHERE OpportuniteId = " + m.oppId) === "1/0", "en base : 1 remplacé, 0 réalisé");

    // ---------- Double envoi : un seul événement ----------
    const d = await creerAvecSuivi(page, "Double" + suffixe, "Double clic " + suffixe, 0);
    await page.goto(BASE_URL + "/Intelligence/Suivis");
    const formulaire = {
      opportuniteId: "oe-" + d.oppId,
      versionSuivi: await page.evaluate(function (id) { return window.Prospects.opportunite("oe-" + id).versionSuivi; }, d.oppId),
      retour: "/Intelligence/Suivis",
      __RequestVerificationToken: await page.locator('input[name="__RequestVerificationToken"]').first().inputValue(),
    };
    await page.request.post(BASE_URL + "/Prospects/RealiserSuivi", { form: formulaire, maxRedirects: 0 });
    await page.request.post(BASE_URL + "/Prospects/RealiserSuivi", { form: formulaire, maxRedirects: 0 });
    verifier(sql("SELECT COUNT(*) FROM HistoriquesSuiviOpportunite WHERE OpportuniteId = " + d.oppId) === "1", "double envoi : un seul événement en base");

    // ---------- Antiforgery invalide et conseiller non autorisé ----------
    const s = await creerAvecSuivi(page, "Securite" + suffixe, "Suivi protégé " + suffixe, 0);
    await page.goto(BASE_URL + "/Intelligence/Suivis");
    const version = await page.evaluate(function (id) { return window.Prospects.opportunite("oe-" + id).versionSuivi; }, s.oppId);
    const sansJeton = await page.request.post(BASE_URL + "/Prospects/RealiserSuivi", { form: { opportuniteId: "oe-" + s.oppId, versionSuivi: version, __RequestVerificationToken: "jeton-invalide" }, maxRedirects: 0 });
    verifier(sansJeton.status() === 400, "jeton antiforgery invalide : refus (400)");
    const courrielHugo = "hugo.realise." + suffixe + "@garagestl.example";
    sql("INSERT INTO AspNetUsers (Id, FirstName, LastName, DealershipId, IsActive, MustChangePassword, CreatedAt, UserName, NormalizedUserName, Email, NormalizedEmail, EmailConfirmed, PasswordHash, SecurityStamp, ConcurrencyStamp, PhoneNumberConfirmed, TwoFactorEnabled, LockoutEnabled, AccessFailedCount) " +
      "SELECT UUID(), 'Hugo', 'Ailleurs', (SELECT Id FROM Dealerships WHERE Name = 'Garage Saint-Laurent'), 1, 0, NOW(), '" + courrielHugo + "', UPPER('" + courrielHugo + "'), '" + courrielHugo + "', UPPER('" + courrielHugo + "'), 1, PasswordHash, UUID(), UUID(), 0, 0, 1, 0 " +
      "FROM AspNetUsers WHERE Email = '" + SOPHIE + "'");
    sql("INSERT INTO AspNetUserRoles (UserId, RoleId) SELECT u.Id, r.Id FROM AspNetUsers u, AspNetRoles r WHERE u.Email = '" + courrielHugo + "' AND r.Name = 'Conseiller'");
    sql("UPDATE Dealerships SET IsActive = 1 WHERE Name = 'Garage Saint-Laurent'");
    const hugo = await (await navigateur.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await connecter(hugo, courrielHugo);
    await hugo.goto(BASE_URL + "/Intelligence/Suivis");
    const tentative = await hugo.request.post(BASE_URL + "/Prospects/RealiserSuivi", {
      form: { opportuniteId: "oe-" + s.oppId, versionSuivi: version, __RequestVerificationToken: await hugo.locator('input[name="__RequestVerificationToken"]').first().inputValue() },
      maxRedirects: 0,
    });
    verifier(tentative.status() === 404, "autre concession : refus (404)");
    verifier(sql("SELECT COUNT(*) FROM HistoriquesSuiviOpportunite WHERE OpportuniteId = " + s.oppId) === "0", "refus : aucun événement en base");

    console.log("\nParcours de réalisation réussi (" + etape + " vérifications).");
  } catch (erreur) {
    console.error("\n" + erreur.message);
    await page.screenshot({ path: "e2e-realisation-echec.png" });
    code = 1;
  } finally {
    await navigateur.close();
  }
  process.exit(code);
})();
