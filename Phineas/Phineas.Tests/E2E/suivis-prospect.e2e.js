// Test de bout en bout : planification persistante du prochain suivi d'une opportunité enregistrée.
// Prérequis et variables : les mêmes que modification-prospect.e2e.js (BASE_URL, CHROMIUM_PATH, MYSQL_CONTAINER, E2E_DB).
// La base de test est lue et préparée par « docker exec » (vérification, conseiller d'une autre concession).
// Lancement : node suivis-prospect.e2e.js   (le paquet « playwright » doit être installé)
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
const prospect = { prenom: "Lou", nom: "Suivi" + suffixe, courriel: "lou.suivi." + suffixe + "@exemple.test", modele: "Kia Niro" };
const premiereAction = "Envoyer la soumission " + suffixe;
const deuxiemeAction = "Confirmer l'essai routier " + suffixe;
const actionAvecNote = "Préparer le financement " + suffixe;

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

async function ouvrirFiche(page, prospectId) {
  await page.goto(BASE_URL + "/Prospects/Fiche/pe-" + prospectId);
  await page.waitForTimeout(600); // animation d'entrée de la fiche
}

async function ouvrirFenetreSuivi(page) {
  await page.click('[data-action="suivi"]');
  await page.waitForSelector("#modal-suivi.show");
}

// Prochaine action et date de l'opportunité telles que la page les a reçues du serveur.
async function suiviAffiche(page, oppId) {
  return page.evaluate(function (id) {
    var o = window.Prospects.opportunite("oe-" + id);
    return { action: o.prochaineAction, date: o.dateProchaineAction ? String(o.dateProchaineAction).slice(0, 10) : null };
  }, oppId);
}

async function messageAffiche(page) {
  const toast = page.locator("#sv-toast [data-toast-texte]");
  await toast.waitFor({ state: "visible" });
  return toast.innerText();
}

(async () => {
  const navigateur = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await (await navigateur.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  let code = 0;

  try {
    // 1 et 2 : connexion et création réelle (fonctionnalité 01), sans suivi au départ.
    await connecter(page, SOPHIE);
    await page.goto(BASE_URL + "/Prospects");
    await page.click(".pr-entete [data-ouvrir-creation]");
    await page.waitForSelector("#tiroir-prospect.show");
    await page.fill("#p-prenom", prospect.prenom);
    await page.fill("#p-nom", prospect.nom);
    await page.fill("#p-courriel", prospect.courriel);
    await page.click('label[for="p-pref-courriel"]');
    await page.selectOption("#p-source", "appel");
    await page.fill("#p-modele", prospect.modele);
    await Promise.all([page.waitForNavigation(), page.click('#tiroir-prospect button[type="submit"]', { position: { x: 15, y: 15 } })]);
    const ids = sql("SELECT p.Id, o.Id FROM Prospects p JOIN OpportunitesVente o ON o.ProspectId = p.Id WHERE p.Courriel = '" + prospect.courriel + "'").split("\t");
    const prospectId = ids[0];
    const oppId = ids[1];
    verifier(sql("SELECT IFNULL(ProchaineAction, 'aucune') FROM OpportunitesVente WHERE Id = " + oppId) === "aucune", "prospect créé sans prochaine action (pe-" + prospectId + ")");

    // 3 à 8 : fenêtre « Planifier un suivi », opportunité, action, date, enregistrement, confirmation.
    await ouvrirFiche(page, prospectId);
    await ouvrirFenetreSuivi(page);
    verifier(await page.inputValue("#s-opp") === "oe-" + oppId, "l'opportunité enregistrée est sélectionnée");
    verifier(await page.locator("[data-suivi-actuel]").isHidden(), "aucune action actuelle à remplacer");
    await page.fill("#s-action", premiereAction);
    await page.fill("#s-date", jour(5));
    await Promise.all([page.waitForNavigation(), page.click('#form-suivi button[type="submit"]')]);
    verifier((await messageAffiche(page)).includes("Suivi planifié"), "confirmation « Suivi planifié »");

    // 9 : la fiche affiche l'action et la date enregistrées.
    let affiche = await suiviAffiche(page, oppId);
    verifier(affiche.action === premiereAction && affiche.date === jour(5), "la fiche reçoit l'action et la date (" + affiche.date + ")");
    verifier((await page.locator("body").innerText()).includes(premiereAction), "l'action est affichée dans la fiche");

    // 10 à 14 : actualisation, reconnexion, navigateur neuf.
    await page.reload();
    await page.waitForTimeout(600);
    affiche = await suiviAffiche(page, oppId);
    verifier(affiche.action === premiereAction && affiche.date === jour(5), "après actualisation : mêmes action et date");
    await page.click('form[action="/Account/Logout"] button[type="submit"]');
    await page.waitForURL(function (url) { return url.pathname.indexOf("/Prospects") !== 0; });
    await connecter(page, SOPHIE);
    await ouvrirFiche(page, prospectId);
    affiche = await suiviAffiche(page, oppId);
    verifier(affiche.action === premiereAction && affiche.date === jour(5), "après reconnexion : mêmes action et date");
    const neuf = await (await navigateur.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await connecter(neuf, SOPHIE);
    await ouvrirFiche(neuf, prospectId);
    verifier((await suiviAffiche(neuf, oppId)).action === premiereAction, "navigateur neuf : même action");

    // 15 : directement en base (le jour choisi, sans décalage).
    let enBase = sql("SELECT ProchaineAction, DATE(DateProchaineAction), Etape, Titre FROM OpportunitesVente WHERE Id = " + oppId).split("\t");
    verifier(enBase[0] === premiereAction && enBase[1] === jour(5), "en base : action et jour exacts (" + enBase[1] + ")");
    verifier(enBase[2] === "Nouveau" && enBase[3] === prospect.modele, "en base : étape et titre inchangés");

    // Remplacement explicite : la fenêtre annonce l'action actuelle, qui est remplacée.
    await ouvrirFenetreSuivi(page);
    const annonce = await page.locator("[data-suivi-actuel]").innerText();
    verifier(annonce.includes(premiereAction) && annonce.includes("remplacée"), "la fenêtre annonce l'action actuelle et son remplacement");
    await page.fill("#s-action", deuxiemeAction);
    await page.fill("#s-date", jour(8));
    await Promise.all([page.waitForNavigation(), page.click('#form-suivi button[type="submit"]')]);
    await messageAffiche(page);
    verifier(sql("SELECT ProchaineAction FROM OpportunitesVente WHERE Id = " + oppId) === deuxiemeAction, "remplacement enregistré en base");

    // Note et suivi dans le même formulaire : les deux sont enregistrés.
    await page.click("#onglet-historique");
    await page.locator("#form-note").waitFor({ state: "visible" });
    await page.selectOption("#n-opp", "oe-" + oppId);
    await page.fill("#n-resume", "Appel du client " + suffixe);
    await page.fill("#n-action", actionAvecNote);
    await page.fill("#n-date", jour(3));
    await Promise.all([page.waitForNavigation(), page.click('#form-note button[type="submit"]')]);
    verifier((await messageAffiche(page)).includes("Note enregistrée"), "note avec suivi : confirmation");
    enBase = sql("SELECT ProchaineAction, DATE(DateProchaineAction) FROM OpportunitesVente WHERE Id = " + oppId).split("\t");
    verifier(enBase[0] === actionAvecNote && enBase[1] === jour(3), "note avec suivi : suivi enregistré en base");
    verifier(sql("SELECT COUNT(*) FROM NotesProspect WHERE ProspectId = " + prospectId) === "1", "note avec suivi : une note en base");

    // Validation : une date passée est refusée par le serveur (envoi direct), rien ne change.
    await ouvrirFiche(page, prospectId);
    const jetonPage = await page.inputValue('#form-suivi input[name="__RequestVerificationToken"]');
    const version = await page.evaluate(function (id) { return window.Prospects.contact("pe-" + id).version; }, prospectId);
    const datePassee = await page.request.post(BASE_URL + "/Prospects/PlanifierSuivi", {
      form: { prospectId: "pe-" + prospectId, opportuniteId: "oe-" + oppId, action: "Trop tard", date: jour(-10), version: version, __RequestVerificationToken: jetonPage },
      maxRedirects: 0,
    });
    verifier(datePassee.status() === 200 && (await datePassee.text()).includes("\"champ\":\"date\""), "date passée refusée par le serveur");
    verifier(sql("SELECT ProchaineAction FROM OpportunitesVente WHERE Id = " + oppId) === actionAvecNote, "date passée : suivi inchangé en base");

    // Double envoi du même formulaire : reconnu, rien n'est réécrit.
    const formulaire = { prospectId: "pe-" + prospectId, opportuniteId: "oe-" + oppId, action: "Double envoi " + suffixe, date: jour(9), version: version, __RequestVerificationToken: jetonPage };
    const envoi1 = await page.request.post(BASE_URL + "/Prospects/PlanifierSuivi", { form: formulaire, maxRedirects: 0 });
    const envoi2 = await page.request.post(BASE_URL + "/Prospects/PlanifierSuivi", { form: formulaire, maxRedirects: 0 });
    verifier(envoi1.status() === 302 && envoi2.status() === 302, "double envoi : les deux envois sont acceptés sans conflit");
    verifier(sql("SELECT ProchaineAction FROM OpportunitesVente WHERE Id = " + oppId) === "Double envoi " + suffixe, "double envoi : un seul suivi en base");

    // « Mes suivis » reçoit les données réelles de l'opportunité.
    await page.goto(BASE_URL + "/Intelligence/Suivis");
    const recu = await page.evaluate(function (id) { var o = window.Prospects.opportunite("oe-" + id); return o ? o.prochaineAction : null; }, oppId);
    verifier(recu === "Double envoi " + suffixe, "« Mes suivis » reçoit le suivi enregistré");

    // Sécurité : un conseiller d'une autre concession (créé dans la base de test) ne peut pas planifier.
    const courrielHugo = "hugo.suivi." + suffixe + "@garagestl.example";
    sql("INSERT INTO AspNetUsers (Id, FirstName, LastName, DealershipId, IsActive, MustChangePassword, CreatedAt, UserName, NormalizedUserName, Email, NormalizedEmail, EmailConfirmed, PasswordHash, SecurityStamp, ConcurrencyStamp, PhoneNumberConfirmed, TwoFactorEnabled, LockoutEnabled, AccessFailedCount) " +
      "SELECT UUID(), 'Hugo', 'Ailleurs', (SELECT Id FROM Dealerships WHERE Name = 'Garage Saint-Laurent'), 1, 0, NOW(), '" + courrielHugo + "', UPPER('" + courrielHugo + "'), '" + courrielHugo + "', UPPER('" + courrielHugo + "'), 1, PasswordHash, UUID(), UUID(), 0, 0, 1, 0 " +
      "FROM AspNetUsers WHERE Email = '" + SOPHIE + "'");
    sql("INSERT INTO AspNetUserRoles (UserId, RoleId) SELECT u.Id, r.Id FROM AspNetUsers u, AspNetRoles r WHERE u.Email = '" + courrielHugo + "' AND r.Name = 'Conseiller'");
    sql("UPDATE Dealerships SET IsActive = 1 WHERE Name = 'Garage Saint-Laurent'");
    const hugo = await (await navigateur.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await connecter(hugo, courrielHugo);
    await hugo.goto(BASE_URL + "/Prospects");
    const tentative = await hugo.request.post(BASE_URL + "/Prospects/PlanifierSuivi", {
      form: { prospectId: "pe-" + prospectId, opportuniteId: "oe-" + oppId, action: "Suivi pirate", date: jour(4), version: version,
        __RequestVerificationToken: await hugo.locator('#form-prospect input[name="__RequestVerificationToken"]').inputValue() },
      maxRedirects: 0,
    });
    verifier(tentative.status() === 404, "autre concession : planification refusée (404)");
    verifier(sql("SELECT ProchaineAction FROM OpportunitesVente WHERE Id = " + oppId) === "Double envoi " + suffixe, "autre concession : suivi intact en base");

    console.log("\nParcours des suivis réussi (" + etape + " vérifications) pour " + prospect.prenom + " " + prospect.nom + ".");
  } catch (erreur) {
    console.error("\n" + erreur.message);
    await page.screenshot({ path: "e2e-suivis-echec.png" });
    code = 1;
  } finally {
    await navigateur.close();
  }
  process.exit(code);
})();
