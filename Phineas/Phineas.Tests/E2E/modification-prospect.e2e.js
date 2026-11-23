// Test de bout en bout : consultation et modification d'un prospect enregistré, dans un vrai navigateur.
// Prérequis : l'application tourne (dotnet run) sur une base MySQL de test, avec les comptes de démonstration.
//   BASE_URL         adresse de l'application (défaut http://localhost:5180)
//   CHROMIUM_PATH    chrome.exe à utiliser (facultatif ; sinon le navigateur installé par Playwright)
//   MYSQL_CONTAINER  conteneur Docker MySQL (défaut phineas-mysql) ; E2E_DB : base de test (défaut phineas_test_e2e)
// La base est lue et préparée par « docker exec » (vérification des valeurs, conseiller d'une autre concession).
// Lancement : node modification-prospect.e2e.js   (le paquet « playwright » doit être installé)
// Code de sortie 0 si tout le parcours passe, 1 sinon. Des captures sont écrites dans le dossier courant.
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");

const BASE_URL = process.env.BASE_URL || "http://localhost:5180";
const CONTENEUR = process.env.MYSQL_CONTAINER || "phineas-mysql";
const BASE = process.env.E2E_DB || "phineas_test_e2e";
if (!/^phineas_test/.test(BASE)) throw new Error("Ce test n'écrit que dans une base de test (phineas_test…), pas dans " + BASE + ".");

const SOPHIE = "sophie.gagnon@autoprestige.example";
const MOT_DE_PASSE = "Phineas2026!";

const suffixe = Date.now().toString(36);
const numero = String(Date.now() % 10000).padStart(4, "0");
const prospect = {
  prenom: "Noe",
  nom: "Edition" + suffixe,
  courriel: "noe.edition." + suffixe + "@exemple.test",
  telephone: "514-555-" + numero,
  modele: "Kia Seltos",
};
const nouvelles = { telephone: "438-555-" + numero, modele: "Hyundai Kona", budget: "27500" };
const autre = { prenom: "Ana", nom: "Autre" + suffixe, courriel: "ana.autre." + suffixe + "@exemple.test", telephone: "450-555-" + numero };
const nomComplet = prospect.prenom + " " + prospect.nom;

let etape = 0;
function verifier(condition, message) {
  etape += 1;
  if (!condition) throw new Error("Étape " + etape + " échouée : " + message);
  console.log("ok " + etape + " : " + message);
}

// Requête SQL dans la base de test ; retourne les lignes en texte (colonnes séparées par des tabulations).
function sql(requete) {
  const sortie = execFileSync("docker", ["exec", CONTENEUR, "mysql", "-uphineas", "-pphineas_dev_password", "-N", "-B", BASE, "-e", requete], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return sortie.trim();
}

async function connecter(page, courriel) {
  await page.goto(BASE_URL + "/Account/Login");
  await page.fill("#Email", courriel);
  await page.fill("#Password", MOT_DE_PASSE);
  await Promise.all([page.waitForNavigation(), page.click("button[type=submit]")]);
}

async function deconnecter(page) {
  await page.click('form[action="/Account/Logout"] button[type="submit"]');
  await page.waitForURL(function (url) { return !url.pathname.startsWith("/Prospects"); });
}

// Clic sur la partie gauche du bouton du tiroir : la mascotte flottante (bas à droite) en recouvre le centre.
async function envoyerTiroir(page) {
  await Promise.all([
    page.waitForNavigation(),
    page.click('#tiroir-prospect button[type="submit"]', { position: { x: 15, y: 15 } }),
  ]);
}

async function creer(page, p) {
  await page.goto(BASE_URL + "/Prospects");
  await page.click(".pr-entete [data-ouvrir-creation]");
  await page.waitForSelector("#tiroir-prospect.show");
  await page.fill("#p-prenom", p.prenom);
  await page.fill("#p-nom", p.nom);
  await page.fill("#p-courriel", p.courriel);
  await page.fill("#p-telephone", p.telephone);
  await page.selectOption("#p-source", "appel");
  if (p.modele) {
    await page.selectOption("#p-categorie", "vus");
    await page.fill("#p-modele", p.modele);
    await page.fill("#p-budget", "25000");
  }
  await envoyerTiroir(page);
}

async function ouvrirFiche(page) {
  await page.goto(BASE_URL + "/Prospects");
  await page.fill("#f-recherche", prospect.nom);
  await Promise.all([page.waitForNavigation(), page.locator("#liste-corps a.pr-nom", { hasText: nomComplet }).first().click()]);
  await page.waitForTimeout(600); // animation d'entrée de la fiche
}

async function texteFiche(page) {
  return page.locator("body").innerText();
}

async function ouvrirModification(page) {
  await page.click('[data-action="modifier"]');
  await page.waitForSelector("#tiroir-prospect.show");
}

(async () => {
  const lancement = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
  const navigateur = await chromium.launch(lancement);
  const page = await (await navigateur.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  let code = 0;

  try {
    // 1 à 3 : connexion et création réelle (fonctionnalité 01).
    await connecter(page, SOPHIE);
    await creer(page, prospect);
    await creer(page, autre);
    const id = sql("SELECT Id FROM Prospects WHERE Courriel = '" + prospect.courriel + "'");
    verifier(/^\d+$/.test(id), "les deux prospects de test sont créés en base (id " + id + ")");

    // 4 et 5 : la fiche affiche les valeurs enregistrées.
    await ouvrirFiche(page);
    verifier(new URL(page.url()).pathname === "/Prospects/Fiche/pe-" + id, "la fiche du prospect enregistré s'ouvre");
    let texte = await texteFiche(page);
    verifier(texte.includes(prospect.telephone) && texte.includes(prospect.modele), "la fiche affiche le téléphone et le modèle enregistrés");

    // 6 : le formulaire « Modifier » est prérempli avec les valeurs de la base.
    await ouvrirModification(page);
    verifier(await page.inputValue("#p-telephone") === prospect.telephone, "le téléphone est prérempli");
    verifier(await page.inputValue("#p-modele") === prospect.modele, "le premier intérêt (modèle) est prérempli");
    verifier(await page.inputValue("#p-budget") === "25000.00" || await page.inputValue("#p-budget") === "25000", "le budget est prérempli");
    verifier(await page.locator("[data-opportunite-ciblee]").isVisible(), "l'opportunité modifiée est indiquée");
    await page.screenshot({ path: "e2e-modif-1-formulaire.png" });

    // 7 à 9 : modification et confirmation.
    await page.fill("#p-telephone", nouvelles.telephone);
    await page.fill("#p-modele", nouvelles.modele);
    await page.fill("#p-budget", nouvelles.budget);
    await envoyerTiroir(page);
    verifier(new URL(page.url()).pathname === "/Prospects/Fiche/pe-" + id, "retour à la fiche après l'envoi (Post/Redirect/Get)");
    const toast = page.locator("#sv-toast [data-toast-texte]");
    await toast.waitFor({ state: "visible" });
    verifier((await toast.innerText()).includes("Modifications enregistrées"), "message de confirmation affiché");
    texte = await texteFiche(page);
    verifier(texte.includes(nouvelles.telephone) && texte.includes(nouvelles.modele), "la fiche affiche les nouvelles valeurs");

    // 10 et 11 : actualisation.
    await page.reload();
    await page.waitForTimeout(600);
    texte = await texteFiche(page);
    verifier(texte.includes(nouvelles.telephone) && !texte.includes(prospect.telephone), "après actualisation : nouveau téléphone, plus l'ancien");
    verifier(texte.includes(nouvelles.modele), "après actualisation : nouveau modèle");

    // 12 à 14 : déconnexion, reconnexion.
    await deconnecter(page);
    await connecter(page, SOPHIE);
    await ouvrirFiche(page);
    texte = await texteFiche(page);
    verifier(texte.includes(nouvelles.telephone) && texte.includes(nouvelles.modele), "après reconnexion : les modifications sont toujours là");

    // 15 : directement en base.
    const enBase = sql("SELECT p.Telephone, o.Modele, o.BudgetTotal, o.Etape FROM Prospects p JOIN OpportunitesVente o ON o.ProspectId = p.Id WHERE p.Id = " + id).split("\t");
    verifier(enBase[0] === nouvelles.telephone && enBase[1] === nouvelles.modele && enBase[2] === "27500.00",
      "en base : téléphone, modèle et budget modifiés (" + enBase.slice(0, 3).join(", ") + ")");
    verifier(enBase[3] === "Nouveau", "en base : l'étape de l'opportunité n'a pas changé");

    // Parcours d'erreur : le téléphone d'un autre prospect est refusé par le serveur (doublon).
    await ouvrirModification(page);
    await page.fill("#p-telephone", autre.telephone);
    await envoyerTiroir(page);
    await page.waitForSelector("#tiroir-prospect.show");
    const erreurTelephone = await page.evaluate(function () {
      var champ = document.getElementById("p-telephone");
      return { invalide: champ.classList.contains("is-invalid"), message: champ.closest("div").querySelector(".invalid-feedback").textContent };
    });
    verifier(erreurTelephone.invalide && erreurTelephone.message.includes(autre.nom), "doublon : message d'erreur sur le téléphone (« " + erreurTelephone.message + " »)");
    verifier(!(await page.locator("#sv-toast.show").count()), "doublon : aucune fausse confirmation");
    await page.screenshot({ path: "e2e-modif-2-erreur.png" });
    verifier(sql("SELECT Telephone FROM Prospects WHERE Id = " + id) === nouvelles.telephone, "doublon : les valeurs enregistrées restent intactes");

    // Sécurité : un conseiller d'une autre concession (créé dans la base de test) ne voit ni ne modifie ce prospect.
    const courrielHugo = "hugo." + suffixe + "@garagestl.example";
    sql("INSERT INTO AspNetUsers (Id, FirstName, LastName, DealershipId, IsActive, MustChangePassword, CreatedAt, UserName, NormalizedUserName, Email, NormalizedEmail, EmailConfirmed, PasswordHash, SecurityStamp, ConcurrencyStamp, PhoneNumberConfirmed, TwoFactorEnabled, LockoutEnabled, AccessFailedCount) " +
      "SELECT UUID(), 'Hugo', 'Ailleurs', (SELECT Id FROM Dealerships WHERE Name = 'Garage Saint-Laurent'), 1, 0, NOW(), '" + courrielHugo + "', UPPER('" + courrielHugo + "'), '" + courrielHugo + "', UPPER('" + courrielHugo + "'), 1, PasswordHash, UUID(), UUID(), 0, 0, 1, 0 " +
      "FROM AspNetUsers WHERE Email = '" + SOPHIE + "'");
    sql("INSERT INTO AspNetUserRoles (UserId, RoleId) SELECT u.Id, r.Id FROM AspNetUsers u, AspNetRoles r WHERE u.Email = '" + courrielHugo + "' AND r.Name = 'Conseiller'");
    sql("UPDATE Dealerships SET IsActive = 1 WHERE Name = 'Garage Saint-Laurent'");
    const hugo = await (await navigateur.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await connecter(hugo, courrielHugo);
    const reponse = await hugo.goto(BASE_URL + "/Prospects/Fiche/pe-" + id);
    const texteHugo = await hugo.locator("body").innerText();
    verifier(reponse.status() === 404 && texteHugo.includes("Prospect introuvable"), "autre concession : fiche « Prospect introuvable » (404)");
    verifier(!texteHugo.includes(prospect.nom) && !texteHugo.includes(nouvelles.telephone), "autre concession : aucune donnée du prospect affichée");
    const jeton = await hugo.locator('#form-prospect input[name="__RequestVerificationToken"]').inputValue();
    const tentative = await hugo.request.post(BASE_URL + "/Prospects/Modifier", {
      form: { prospectId: "pe-" + id, version: "", prenom: "Pirate", nom: "Pirate", telephone: "819-555-0000", contactPrefere: "telephone", source: "appel", conseillerId: "moi", __RequestVerificationToken: jeton },
    });
    verifier(tentative.status() === 404, "autre concession : la modification est refusée (404)");
    verifier(sql("SELECT Nom FROM Prospects WHERE Id = " + id) === prospect.nom, "autre concession : le prospect est intact en base");

    console.log("\nParcours complet réussi (" + etape + " vérifications) pour " + nomComplet + ".");
  } catch (erreur) {
    console.error("\n" + erreur.message);
    await page.screenshot({ path: "e2e-modif-echec.png" });
    code = 1;
  } finally {
    await navigateur.close();
  }
  process.exit(code);
})();
