// Test de bout en bout : « Reporter » un suivi réellement planifié en MySQL, depuis « Mes suivis » et depuis la fiche.
// La même action reste à faire avec une nouvelle échéance, et l'événement « Suivi reporté » est dans l'historique.
// Aussi : conflit entre report et réalisation, refus d'un utilisateur non autorisé, jeton antiforgery invalide.
// Prérequis et variables : les mêmes que modification-prospect.e2e.js (BASE_URL, CHROMIUM_PATH, MYSQL_CONTAINER, E2E_DB).
// Lancement : node report-suivi.e2e.js   (le paquet « playwright » doit être installé)
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
  await page.goto(BASE_URL + "/Prospects/Fiche/pe-" + ids[0]);
  await page.waitForTimeout(600);
  await page.click('[data-action="suivi"]');
  await page.waitForSelector("#modal-suivi.show");
  await page.fill("#s-action", action);
  await page.fill("#s-date", jour(decalage));
  await Promise.all([page.waitForNavigation(), page.click('#form-suivi button[type="submit"]')]);
  return { prospectId: ids[0], oppId: ids[1] };
}

// Cherche dans « Mes suivis » la ligne du suivi (texte de l'action ET bouton « Reporter »), page après page.
async function trouverLigne(page, texte) {
  await page.goto(BASE_URL + "/Intelligence/Suivis");
  await page.waitForTimeout(800);
  for (let numero = 1; numero <= 30; numero++) {
    const ligne = page.locator("#relances tr", { hasText: texte, has: page.locator('[data-ia="reporter"]') });
    if (await ligne.count()) return ligne.first();
    // Le bouton « Page suivante » de la dernière page porte aussi ce numéro, mais il est désactivé.
    const suivante = page.locator('[data-zone="pagination-relances"] [data-aller-page="' + (numero + 1) + '"]:not([disabled])');
    if (!(await suivante.count())) return null;
    await suivante.first().click();
    await page.waitForTimeout(200);
  }
  return null;
}

// Ouvre la fenêtre « Reporter le suivi » depuis un bouton et retourne son texte.
async function ouvrirFenetre(page, bouton) {
  await bouton.click();
  await page.waitForSelector("#ia-modale.show");
  return page.locator("#ia-modale .modal-body").innerText();
}

// Choisit la nouvelle date dans la fenêtre ouverte et valide (envoi au serveur, puis retour à la page).
async function reporterA(page, date) {
  await page.fill("#ia-date", date);
  await Promise.all([page.waitForNavigation(), page.click("#ia-modale [data-ia-valider]")]);
}

async function messageAffiche(page) {
  const toast = page.locator("#sv-toast [data-toast-texte]");
  await toast.waitFor({ state: "visible" });
  return toast.innerText();
}

// Échéance affichée par la page pour cette opportunité (données reçues du serveur), au format AAAA-MM-JJ.
async function echeanceAffichee(page, oppId) {
  return page.evaluate(function (id) {
    const o = window.Prospects.opportunite("oe-" + id);
    return o && o.dateProchaineAction ? window.Prospects.versChampDate(o.dateProchaineAction) + " | " + o.prochaineAction : "aucune";
  }, oppId);
}

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
    // ---------- Scénario principal : report depuis « Mes suivis » ----------
    await connecter(page, SOPHIE);
    const action = "Rappeler pour le financement " + suffixe;
    const a = await creerAvecSuivi(page, "Reporte" + suffixe, action, 0);
    verifier(sql("SELECT CONCAT(ProchaineAction, ' | ', DATE(DateProchaineAction)) FROM OpportunitesVente WHERE Id = " + a.oppId) === action + " | " + jour(0), "suivi du jour planifié en base (oe-" + a.oppId + ")");

    let ligne = await trouverLigne(page, action);
    verifier(ligne !== null, "« Mes suivis » affiche le suivi avec le bouton « Reporter »");
    const texteFenetre = await ouvrirFenetre(page, ligne.locator('[data-ia="reporter"]'));
    verifier(texteFenetre.includes(action) && texteFenetre.includes("Échéance actuelle"), "la fenêtre montre l'action et l'échéance actuelle");
    await page.fill("#ia-date", jour(0));
    await page.click("#ia-modale [data-ia-valider]");
    verifier(await page.locator("#ia-date.is-invalid").count() === 1, "même date que l'échéance actuelle : refusée dans la fenêtre, rien n'est envoyé");
    await reporterA(page, jour(5));
    verifier((await messageAffiche(page)).includes("Suivi reporté au"), "confirmation du report");
    verifier((await trouverLigne(page, action)) === null, "échéance future : le suivi quitte « Qui relancer » jusqu'à sa date");
    verifier((await echeanceAffichee(page, a.oppId)) === jour(5) + " | " + action, "la page reçoit la même action avec la nouvelle échéance");

    let texteHistorique = await historique(page, a.prospectId);
    verifier(texteHistorique.includes("Suivi reporté") && texteHistorique.includes(action), "l'historique du dossier montre « Suivi reporté »");
    verifier(!texteHistorique.includes("Suivi réalisé") && !texteHistorique.includes("Suivi remplacé"), "le report n'est ni « réalisé » ni « remplacé »");
    await page.reload(); await page.waitForTimeout(500);
    verifier((await echeanceAffichee(page, a.oppId)) === jour(5) + " | " + action, "après actualisation : nouvelle échéance conservée");

    await page.click('form[action="/Account/Logout"] button[type="submit"]');
    await page.waitForURL(function (url) { return url.pathname.indexOf("/Prospects") !== 0; });
    await connecter(page, SOPHIE);
    texteHistorique = await historique(page, a.prospectId);
    verifier((await echeanceAffichee(page, a.oppId)) === jour(5) + " | " + action && texteHistorique.includes("Suivi reporté"), "après reconnexion : échéance et événement conservés");

    const enBase = sql("SELECT h.Cloture, h.Action, DATE(h.DatePrevue), DATE(h.NouvelleDatePrevue), u.Email FROM HistoriquesSuiviOpportunite h JOIN AspNetUsers u ON u.Id = h.AuteurId WHERE h.OpportuniteId = " + a.oppId).split("\n");
    const champs = enBase[0].split("\t");
    verifier(enBase.length === 1 && champs[0] === "Reporte" && champs[1] === action && champs[2] === jour(0) && champs[3] === jour(5) && champs[4] === SOPHIE, "en base : un événement « Reporte », ancienne et nouvelle dates, auteur exacts");
    verifier(sql("SELECT CONCAT(ProchaineAction, ' | ', DATE(DateProchaineAction)) FROM OpportunitesVente WHERE Id = " + a.oppId) === action + " | " + jour(5), "en base : la même action reste active, à la nouvelle date");

    // ---------- Suivi en retard reporté à aujourd'hui : il reste dans la liste ----------
    const actionRetard = "Relance en retard " + suffixe;
    const r = await creerAvecSuivi(page, "Retard" + suffixe, actionRetard, 1);
    sql("UPDATE OpportunitesVente SET DateProchaineAction = DATE_SUB(DateProchaineAction, INTERVAL 4 DAY) WHERE Id = " + r.oppId);
    ligne = await trouverLigne(page, actionRetard);
    verifier(ligne !== null && (await ligne.innerText()).includes("En retard"), "suivi en retard listé « En retard »");
    await ouvrirFenetre(page, ligne.locator('[data-ia="reporter"]'));
    await reporterA(page, jour(0));
    await messageAffiche(page);
    ligne = await trouverLigne(page, actionRetard);
    verifier(ligne !== null && !(await ligne.innerText()).includes("En retard"), "reporté à aujourd'hui : toujours listé, plus en retard");
    verifier(sql("SELECT CONCAT(DATE(DateProchaineAction), ' | ', (SELECT Cloture FROM HistoriquesSuiviOpportunite WHERE OpportuniteId = " + r.oppId + ")) FROM OpportunitesVente WHERE Id = " + r.oppId) === jour(0) + " | Reporte", "en base : date d'aujourd'hui et événement « Reporte »");

    // ---------- Report depuis la fiche (menu « Plus » de la carte du suivi) ----------
    const actionFiche = "Suivi depuis la fiche " + suffixe;
    const f = await creerAvecSuivi(page, "Fiche" + suffixe, actionFiche, 0);
    const idAction = await page.evaluate(function (o) { const x = window.Intelligence.actives().find(function (y) { return y.regle === "suivi-echeance" && y.opportuniteId === o; }); return x ? x.id : null; }, "oe-" + f.oppId);
    const boutonFiche = page.locator('[data-ia="reporter"][data-id="' + idAction + '"]').first();
    // Le bouton est dans le menu « Plus » de la carte : ouvrir d'abord ce menu (div.dropdown > bouton + div.dropdown-menu).
    await boutonFiche.locator("xpath=ancestor::div[contains(concat(' ', @class, ' '), ' dropdown ')][1]/*[@data-bs-toggle='dropdown']").click();
    await ouvrirFenetre(page, boutonFiche);
    await reporterA(page, jour(3));
    verifier((await messageAffiche(page)).includes("Suivi reporté au") && new URL(page.url()).pathname === "/Prospects/Fiche/pe-" + f.prospectId, "fiche : report confirmé, retour à la fiche");
    verifier(sql("SELECT DATE(DateProchaineAction) FROM OpportunitesVente WHERE Id = " + f.oppId) === jour(3), "fiche : nouvelle date en base");

    // ---------- Conflit : la page montre encore le suivi, il est réalisé ailleurs, puis on tente de le reporter ----------
    const actionConflit = "Suivi en conflit " + suffixe;
    const c = await creerAvecSuivi(page, "Conflit" + suffixe, actionConflit, 0);
    const anciennePage = await (await navigateur.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await connecter(anciennePage, SOPHIE);
    const ligneAncienne = await trouverLigne(anciennePage, actionConflit);
    verifier(ligneAncienne !== null, "ancienne page : le suivi est affiché");
    ligne = await trouverLigne(page, actionConflit);
    await Promise.all([page.waitForNavigation(), ligne.locator("[data-realiser-suivi]").click()]);
    await messageAffiche(page);
    await ouvrirFenetre(anciennePage, ligneAncienne.locator('[data-ia="reporter"]'));
    await reporterA(anciennePage, jour(6));
    verifier((await messageAffiche(anciennePage)).includes("changé entre-temps"), "ancienne page : report refusé et expliqué");
    verifier(sql("SELECT CONCAT(IFNULL(o.ProchaineAction, 'aucune'), ' | ', GROUP_CONCAT(h.Cloture)) FROM OpportunitesVente o JOIN HistoriquesSuiviOpportunite h ON h.OpportuniteId = o.Id WHERE o.Id = " + c.oppId + " GROUP BY o.Id") === "aucune | Realise", "en base : l'action réalisée n'est pas recréée, aucun report");

    // ---------- Antiforgery invalide et conseiller non autorisé ----------
    const s = await creerAvecSuivi(page, "Securite" + suffixe, "Suivi protégé " + suffixe, 0);
    await page.goto(BASE_URL + "/Intelligence/Suivis");
    const version = await page.evaluate(function (id) { return window.Prospects.opportunite("oe-" + id).versionSuivi; }, s.oppId);
    const sansJeton = await page.request.post(BASE_URL + "/Prospects/ReporterSuivi", { form: { opportuniteId: "oe-" + s.oppId, versionSuivi: version, date: jour(4), __RequestVerificationToken: "jeton-invalide" }, maxRedirects: 0 });
    verifier(sansJeton.status() === 400, "jeton antiforgery invalide : refus (400)");
    const courrielHugo = "hugo.report." + suffixe + "@garagestl.example";
    sql("INSERT INTO AspNetUsers (Id, FirstName, LastName, DealershipId, IsActive, MustChangePassword, CreatedAt, UserName, NormalizedUserName, Email, NormalizedEmail, EmailConfirmed, PasswordHash, SecurityStamp, ConcurrencyStamp, PhoneNumberConfirmed, TwoFactorEnabled, LockoutEnabled, AccessFailedCount) " +
      "SELECT UUID(), 'Hugo', 'Ailleurs', (SELECT Id FROM Dealerships WHERE Name = 'Garage Saint-Laurent'), 1, 0, NOW(), '" + courrielHugo + "', UPPER('" + courrielHugo + "'), '" + courrielHugo + "', UPPER('" + courrielHugo + "'), 1, PasswordHash, UUID(), UUID(), 0, 0, 1, 0 " +
      "FROM AspNetUsers WHERE Email = '" + SOPHIE + "'");
    sql("INSERT INTO AspNetUserRoles (UserId, RoleId) SELECT u.Id, r.Id FROM AspNetUsers u, AspNetRoles r WHERE u.Email = '" + courrielHugo + "' AND r.Name = 'Conseiller'");
    sql("UPDATE Dealerships SET IsActive = 1 WHERE Name = 'Garage Saint-Laurent'");
    const hugo = await (await navigateur.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await connecter(hugo, courrielHugo);
    await hugo.goto(BASE_URL + "/Intelligence/Suivis");
    const tentative = await hugo.request.post(BASE_URL + "/Prospects/ReporterSuivi", {
      form: { opportuniteId: "oe-" + s.oppId, versionSuivi: version, date: jour(4), __RequestVerificationToken: await hugo.locator('input[name="__RequestVerificationToken"]').first().inputValue() },
      maxRedirects: 0,
    });
    verifier(tentative.status() === 404, "autre concession : refus (404)");
    verifier(sql("SELECT CONCAT(DATE(DateProchaineAction), ' | ', (SELECT COUNT(*) FROM HistoriquesSuiviOpportunite WHERE OpportuniteId = " + s.oppId + ")) FROM OpportunitesVente WHERE Id = " + s.oppId) === jour(0) + " | 0", "refus : date inchangée, aucun événement en base");

    console.log("\nParcours de report réussi (" + etape + " vérifications).");
  } catch (erreur) {
    console.error("\n" + erreur.message);
    await page.screenshot({ path: "e2e-report-echec.png" });
    code = 1;
  } finally {
    await navigateur.close();
  }
  process.exit(code);
})();
