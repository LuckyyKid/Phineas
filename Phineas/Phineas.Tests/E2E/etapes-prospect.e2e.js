// Test de bout en bout : changement d'étape d'une opportunité enregistrée (fiche et pipeline), dans un vrai navigateur.
// Prérequis et variables : les mêmes que modification-prospect.e2e.js (BASE_URL, CHROMIUM_PATH, MYSQL_CONTAINER, E2E_DB).
// La base de test est lue et préparée par « docker exec » (vérification, conseiller d'une autre concession).
// Lancement : node etapes-prospect.e2e.js   (le paquet « playwright » doit être installé)
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
const prospect = { prenom: "Leo", nom: "Etape" + suffixe, courriel: "leo.etape." + suffixe + "@exemple.test", modele: "Nissan Rogue" };
const nomComplet = prospect.prenom + " " + prospect.nom;

let etape = 0;
function verifier(condition, message) {
  etape += 1;
  if (!condition) throw new Error("Étape " + etape + " échouée : " + message);
  console.log("ok " + etape + " : " + message);
}

function sql(requete) {
  return execFileSync("docker", ["exec", CONTENEUR, "mysql", "-uphineas", "-pphineas_dev_password", "-N", "-B", BASE, "-e", requete], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

async function connecter(page, courriel) {
  await page.goto(BASE_URL + "/Account/Login");
  await page.fill("#Email", courriel);
  await page.fill("#Password", MOT_DE_PASSE);
  await Promise.all([page.waitForNavigation(), page.click("button[type=submit]")]);
}

// Ouvre la fiche puis l'onglet Opportunités ; retourne le menu « Étape » de l'opportunité.
async function ongletOpportunites(page, prospectId, oppId) {
  await page.goto(BASE_URL + "/Prospects/Fiche/pe-" + prospectId);
  await page.click("#onglet-opportunites");
  const menu = page.locator("#opp-etape-oe-" + oppId);
  await menu.waitFor({ state: "visible" });
  return menu;
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
    // 1 à 3 : connexion et création réelle (fonctionnalité 01), à l'étape « Nouveau ».
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
    verifier(/^\d+$/.test(prospectId) && /^\d+$/.test(oppId), "prospect et opportunité créés (pe-" + prospectId + ", oe-" + oppId + ")");

    // 4 et 5 : l'étape affichée vient de la base.
    let menu = await ongletOpportunites(page, prospectId, oppId);
    verifier(await menu.inputValue() === "Nouveau", "étape initiale affichée : Nouveau");

    // 6 à 9 : changement avec le menu existant de la fiche.
    await Promise.all([page.waitForNavigation(), menu.selectOption("Negociation")]);
    verifier((await messageAffiche(page)).includes("Étape enregistrée"), "confirmation affichée");
    menu = await ongletOpportunites(page, prospectId, oppId);
    verifier(await menu.inputValue() === "Negociation", "la fiche affiche « Négociation »");
    await page.click("#onglet-historique");
    await page.waitForTimeout(300);
    verifier((await page.locator("body").innerText()).includes("Étape : Nouveau → Négociation."), "l'onglet Historique montre le changement");

    // 10 et 11 : actualisation.
    await page.reload();
    menu = await ongletOpportunites(page, prospectId, oppId);
    verifier(await menu.inputValue() === "Negociation", "après actualisation : toujours « Négociation »");

    // 12 à 14 : déconnexion, reconnexion, puis navigateur neuf (sans stockage local).
    await page.click('form[action="/Account/Logout"] button[type="submit"]');
    await page.waitForURL(function (url) { return url.pathname.indexOf("/Prospects") !== 0; });
    await connecter(page, SOPHIE);
    menu = await ongletOpportunites(page, prospectId, oppId);
    verifier(await menu.inputValue() === "Negociation", "après reconnexion : toujours « Négociation »");
    const neuf = await (await navigateur.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await connecter(neuf, SOPHIE);
    verifier(await (await ongletOpportunites(neuf, prospectId, oppId)).inputValue() === "Negociation", "navigateur neuf : toujours « Négociation »");

    // 15 et 16 : en base, l'étape et l'historique.
    verifier(sql("SELECT Etape FROM OpportunitesVente WHERE Id = " + oppId) === "Negociation", "en base : étape Negociation");
    const historique = sql("SELECT h.AncienneEtape, h.NouvelleEtape, u.Email FROM HistoriquesEtapeOpportunite h JOIN AspNetUsers u ON u.Id = h.UtilisateurId WHERE h.OpportuniteId = " + oppId).split("\n");
    verifier(historique.length === 1 && historique[0] === "Nouveau\tNegociation\t" + SOPHIE, "en base : un historique Nouveau → Negociation par Sophie");

    // Le contrôle du pipeline (liste) passe aussi par le serveur.
    await page.goto(BASE_URL + "/Prospects");
    await page.click('label[for="vue-pipeline"]');
    const deplacer = page.locator("#etape-oe-" + oppId);
    await deplacer.waitFor({ state: "visible" });
    await Promise.all([page.waitForNavigation(), deplacer.selectOption("Soumission")]);
    verifier(new URL(page.url()).pathname === "/Prospects" && (await messageAffiche(page)).includes("Soumission"), "pipeline : retour à la liste avec confirmation");
    verifier(sql("SELECT Etape FROM OpportunitesVente WHERE Id = " + oppId) === "Soumission", "pipeline : étape Soumission en base");
    verifier(sql("SELECT COUNT(*) FROM HistoriquesEtapeOpportunite WHERE OpportuniteId = " + oppId) === "2", "pipeline : deuxième événement d'historique");

    // Échec : « Perdu » demande un motif qui n'est pas encore en base.
    menu = await ongletOpportunites(page, prospectId, oppId);
    await Promise.all([page.waitForNavigation(), menu.selectOption("Perdu")]);
    const refus = await messageAffiche(page);
    verifier(refus.includes("Étape non modifiée") && refus.includes("motif"), "« Perdu » refusé avec le motif expliqué");
    menu = await ongletOpportunites(page, prospectId, oppId);
    verifier(await menu.inputValue() === "Soumission", "après refus : la fiche affiche toujours « Soumission »");
    verifier(sql("SELECT Etape FROM OpportunitesVente WHERE Id = " + oppId) === "Soumission", "après refus : étape inchangée en base");
    verifier(sql("SELECT COUNT(*) FROM HistoriquesEtapeOpportunite WHERE OpportuniteId = " + oppId) === "2", "après refus : aucun historique ajouté");

    // Échec : « Gagné » attend la confirmation d'une transaction ; « Finalisation » reste possible.
    menu = await ongletOpportunites(page, prospectId, oppId);
    await Promise.all([page.waitForNavigation(), menu.selectOption("Finalisation")]);
    verifier((await messageAffiche(page)).includes("Finalisation"), "« Finalisation » est acceptée");
    menu = await ongletOpportunites(page, prospectId, oppId);
    await Promise.all([page.waitForNavigation(), menu.selectOption("Gagne")]);
    const refusGagne = await messageAffiche(page);
    verifier(refusGagne.includes("Étape non modifiée") && refusGagne.includes("transaction"), "« Gagné » refusé avec la raison expliquée");
    menu = await ongletOpportunites(page, prospectId, oppId);
    verifier(await menu.inputValue() === "Finalisation", "après refus de « Gagné » : la fiche affiche toujours « Finalisation »");
    verifier(sql("SELECT Etape FROM OpportunitesVente WHERE Id = " + oppId) === "Finalisation", "après refus de « Gagné » : étape inchangée en base");
    verifier(sql("SELECT COUNT(*) FROM HistoriquesEtapeOpportunite WHERE OpportuniteId = " + oppId) === "3", "après refus de « Gagné » : aucun historique ajouté");

    // Sécurité : un conseiller d'une autre concession (créé dans la base de test) ne peut pas changer l'étape.
    const courrielHugo = "hugo.etape." + suffixe + "@garagestl.example";
    sql("INSERT INTO AspNetUsers (Id, FirstName, LastName, DealershipId, IsActive, MustChangePassword, CreatedAt, UserName, NormalizedUserName, Email, NormalizedEmail, EmailConfirmed, PasswordHash, SecurityStamp, ConcurrencyStamp, PhoneNumberConfirmed, TwoFactorEnabled, LockoutEnabled, AccessFailedCount) " +
      "SELECT UUID(), 'Hugo', 'Ailleurs', (SELECT Id FROM Dealerships WHERE Name = 'Garage Saint-Laurent'), 1, 0, NOW(), '" + courrielHugo + "', UPPER('" + courrielHugo + "'), '" + courrielHugo + "', UPPER('" + courrielHugo + "'), 1, PasswordHash, UUID(), UUID(), 0, 0, 1, 0 " +
      "FROM AspNetUsers WHERE Email = '" + SOPHIE + "'");
    sql("INSERT INTO AspNetUserRoles (UserId, RoleId) SELECT u.Id, r.Id FROM AspNetUsers u, AspNetRoles r WHERE u.Email = '" + courrielHugo + "' AND r.Name = 'Conseiller'");
    sql("UPDATE Dealerships SET IsActive = 1 WHERE Name = 'Garage Saint-Laurent'");
    const hugo = await (await navigateur.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await connecter(hugo, courrielHugo);
    await hugo.goto(BASE_URL + "/Prospects");
    const jeton = await hugo.locator('#form-prospect input[name="__RequestVerificationToken"]').inputValue();
    const version = await page.evaluate(function (id) { return window.Prospects.contact("pe-" + id).version; }, prospectId);
    const tentative = await hugo.request.post(BASE_URL + "/Prospects/ChangerEtape", {
      form: { opportuniteId: "oe-" + oppId, prospectId: "pe-" + prospectId, etape: "Finalisation", version: version, retour: "fiche", __RequestVerificationToken: jeton },
      maxRedirects: 0,
    });
    verifier(tentative.status() === 404, "autre concession : changement refusé (404)");
    verifier(sql("SELECT Etape FROM OpportunitesVente WHERE Id = " + oppId) === "Finalisation", "autre concession : étape intacte en base");
    verifier(sql("SELECT COUNT(*) FROM HistoriquesEtapeOpportunite WHERE OpportuniteId = " + oppId) === "3", "autre concession : aucun historique ajouté");

    // Les données des fonctionnalités 01 et 02 sont intactes.
    const donnees = sql("SELECT p.Prenom, p.Courriel, o.Modele, o.Titre FROM Prospects p JOIN OpportunitesVente o ON o.ProspectId = p.Id WHERE p.Id = " + prospectId).split("\t");
    verifier(donnees[0] === prospect.prenom && donnees[1] === prospect.courriel && donnees[2] === prospect.modele && donnees[3] === prospect.modele,
      "contact, modèle et titre inchangés (" + donnees.join(", ") + ")");

    console.log("\nParcours des étapes réussi (" + etape + " vérifications) pour " + nomComplet + ".");
  } catch (erreur) {
    console.error("\n" + erreur.message);
    await page.screenshot({ path: "e2e-etapes-echec.png" });
    code = 1;
  } finally {
    await navigateur.close();
  }
  process.exit(code);
})();
