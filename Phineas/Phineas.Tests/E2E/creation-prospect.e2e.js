// Test de bout en bout : création réelle d'un prospect par une conseillère, dans un vrai navigateur.
// Prérequis : l'application tourne (dotnet run) sur une base de test, avec les comptes de démonstration.
//   BASE_URL       adresse de l'application (défaut http://localhost:5180)
//   CHROMIUM_PATH  chrome.exe à utiliser (facultatif ; sinon le navigateur installé par Playwright)
// Lancement : node creation-prospect.e2e.js   (le paquet « playwright » doit être installé)
// Code de sortie 0 si tout le parcours passe, 1 sinon. Des captures sont écrites dans le dossier courant.
const { chromium } = require("playwright");

const BASE_URL = process.env.BASE_URL || "http://localhost:5180";
const COURRIEL_CONSEILLERE = "sophie.gagnon@autoprestige.example";
const MOT_DE_PASSE = "Phineas2026!";

// Données uniques pour ce passage.
const suffixe = Date.now().toString(36);
const prospect = {
  prenom: "Zoe",
  nom: "Essai" + suffixe,
  courriel: "zoe.essai." + suffixe + "@exemple.test",
  telephone: "514-555-" + String(Date.now() % 10000).padStart(4, "0"),
  precision: "Salon de l'auto " + suffixe,
  modele: "Mazda CX-30",
  budget: "28500",
};
const nomComplet = prospect.prenom + " " + prospect.nom;

let etape = 0;
function verifier(condition, message) {
  etape += 1;
  if (!condition) throw new Error("Étape " + etape + " échouée : " + message);
  console.log("ok " + etape + " : " + message);
}

async function connecter(page) {
  await page.goto(BASE_URL + "/Account/Login");
  await page.fill("#Email", COURRIEL_CONSEILLERE);
  await page.fill("#Password", MOT_DE_PASSE);
  await Promise.all([page.waitForNavigation(), page.click("button[type=submit]")]);
}

async function ligneDuProspect(page) {
  await page.fill("#f-recherche", prospect.nom);
  return page.locator("#liste-corps a.pr-nom", { hasText: nomComplet });
}

async function verifierFiche(page, moment) {
  const lien = await ligneDuProspect(page);
  await Promise.all([page.waitForNavigation(), lien.first().click()]);
  const texte = await page.locator("main, body").first().innerText();
  verifier(page.url().includes("/Prospects/Fiche"), "la fiche s'ouvre (" + moment + ")");
  verifier(texte.includes(nomComplet), "la fiche affiche le nom (" + moment + ")");
  verifier(texte.includes(prospect.courriel), "la fiche affiche le courriel (" + moment + ")");
  verifier(texte.includes(prospect.telephone), "la fiche affiche le téléphone (" + moment + ")");
  verifier(texte.includes(prospect.modele), "la fiche affiche l'opportunité « " + prospect.modele + " » (" + moment + ")");
}

(async () => {
  const lancement = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
  const navigateur = await chromium.launch(lancement);
  const contexte = await navigateur.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await contexte.newPage();
  let code = 0;

  try {
    // 1 à 4 : connexion, page Prospects, ouverture du formulaire.
    await connecter(page);
    verifier(!page.url().includes("/Account/Login"), "connexion de la conseillère");
    await page.goto(BASE_URL + "/Prospects");
    verifier(await page.locator("h1", { hasText: "Prospects" }).isVisible(), "la page Prospects s'ouvre");
    await page.click(".pr-entete [data-ouvrir-creation]");
    await page.waitForSelector("#tiroir-prospect.show");
    verifier(true, "le formulaire « Nouveau prospect » s'ouvre");
    await page.screenshot({ path: "e2e-1-formulaire.png" });

    // 5 et 6 : saisie et envoi.
    await page.fill("#p-prenom", prospect.prenom);
    await page.fill("#p-nom", prospect.nom);
    await page.fill("#p-courriel", prospect.courriel);
    await page.fill("#p-telephone", prospect.telephone);
    await page.click('label[for="p-pref-courriel"]');
    await page.selectOption("#p-source", "visite");
    await page.fill("#p-source-detail", prospect.precision);
    await page.selectOption("#p-categorie", "vus");
    await page.fill("#p-modele", prospect.modele);
    await page.fill("#p-budget", prospect.budget);
    // Clic sur la partie gauche du bouton : la mascotte flottante (bas à droite) en recouvre le centre.
    await Promise.all([
      page.waitForNavigation(),
      page.click('#tiroir-prospect button[type="submit"]', { position: { x: 15, y: 15 } }),
    ]);

    // 7 : confirmation après la redirection.
    verifier(new URL(page.url()).pathname === "/Prospects", "retour à la liste après l'envoi (Post/Redirect/Get)");
    const toast = page.locator("#sv-toast [data-toast-texte]");
    await toast.waitFor({ state: "visible" });
    verifier((await toast.innerText()).includes("enregistré dans vos prospects"), "message de confirmation affiché");
    await page.screenshot({ path: "e2e-2-confirmation.png" });

    // 8 : le prospect est dans la liste.
    verifier((await (await ligneDuProspect(page)).count()) === 1, "le prospect apparaît une seule fois dans la liste");

    // 9 et 10 : actualisation.
    await page.reload();
    verifier((await (await ligneDuProspect(page)).count()) === 1, "le prospect est toujours là après actualisation");

    // 11 et 12 : le dossier.
    await verifierFiche(page, "après création");

    // 13 et 14 : déconnexion, reconnexion, et même vérification dans un navigateur neuf (aucun stockage local).
    await page.click('form[action="/Account/Logout"] button[type="submit"]');
    await page.waitForURL(function (url) { return !url.pathname.startsWith("/Prospects"); });
    await page.goto(BASE_URL + "/Prospects");
    verifier(page.url().includes("/Account/Login"), "après déconnexion, la page Prospects demande de se connecter");
    await connecter(page);
    await page.goto(BASE_URL + "/Prospects");
    await verifierFiche(page, "après reconnexion");

    const neuf = await (await navigateur.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await connecter(neuf);
    await neuf.goto(BASE_URL + "/Prospects");
    await verifierFiche(neuf, "nouveau navigateur sans stockage local");
    await neuf.screenshot({ path: "e2e-3-fiche.png" });

    console.log("\nParcours complet réussi (" + etape + " vérifications) pour " + nomComplet + ".");
  } catch (erreur) {
    console.error("\n" + erreur.message);
    await page.screenshot({ path: "e2e-echec.png" });
    code = 1;
  } finally {
    await navigateur.close();
  }
  process.exit(code);
})();
