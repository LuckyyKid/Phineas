// Test de bout en bout : deux onglets modifient le même prospect enregistré (conflit de modification).
// Prérequis et variables : les mêmes que modification-prospect.e2e.js (BASE_URL, CHROMIUM_PATH, MYSQL_CONTAINER, E2E_DB).
// Lancement : node conflit-prospect.e2e.js   (le paquet « playwright » doit être installé)
// Code de sortie 0 si tout le parcours passe, 1 sinon.
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");

const BASE_URL = process.env.BASE_URL || "http://localhost:5180";
const CONTENEUR = process.env.MYSQL_CONTAINER || "phineas-mysql";
const BASE = process.env.E2E_DB || "phineas_test_e2e";
if (!/^phineas_test/.test(BASE)) throw new Error("Ce test ne lit qu'une base de test (phineas_test…), pas " + BASE + ".");

const suffixe = Date.now().toString(36);
const numero = String(Date.now() % 10000).padStart(4, "0");
const prospect = { prenom: "Ines", nom: "Conflit" + suffixe, courriel: "ines.conflit." + suffixe + "@exemple.test", telephone: "514-555-" + numero };
const telephoneOngletA = "438-555-" + numero;
const nomOngletB = "Conflitb" + suffixe;

let etape = 0;
function verifier(condition, message) {
  etape += 1;
  if (!condition) throw new Error("Étape " + etape + " échouée : " + message);
  console.log("ok " + etape + " : " + message);
}

function sql(requete) {
  return execFileSync("docker", ["exec", CONTENEUR, "mysql", "-uphineas", "-pphineas_dev_password", "-N", "-B", BASE, "-e", requete], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

// Clic sur la partie gauche du bouton du tiroir : la mascotte flottante (bas à droite) en recouvre le centre.
async function envoyerTiroir(page) {
  await Promise.all([page.waitForNavigation(), page.click('#tiroir-prospect button[type="submit"]', { position: { x: 15, y: 15 } })]);
}

async function ouvrirModification(page) {
  await page.click('[data-action="modifier"]');
  await page.waitForSelector("#tiroir-prospect.show");
}

async function resumeErreurs(page) {
  await page.waitForSelector("#tiroir-prospect.show");
  return page.locator("[data-resume-erreurs]").innerText();
}

(async () => {
  const navigateur = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const contexte = await navigateur.newContext({ viewport: { width: 1440, height: 900 } });
  const ongletA = await contexte.newPage();
  let code = 0;

  try {
    // Connexion et création du prospect (fonctionnalité 01).
    await ongletA.goto(BASE_URL + "/Account/Login");
    await ongletA.fill("#Email", "sophie.gagnon@autoprestige.example");
    await ongletA.fill("#Password", "Phineas2026!");
    await Promise.all([ongletA.waitForNavigation(), ongletA.click("button[type=submit]")]);
    await ongletA.goto(BASE_URL + "/Prospects");
    await ongletA.click(".pr-entete [data-ouvrir-creation]");
    await ongletA.waitForSelector("#tiroir-prospect.show");
    await ongletA.fill("#p-prenom", prospect.prenom);
    await ongletA.fill("#p-nom", prospect.nom);
    await ongletA.fill("#p-courriel", prospect.courriel);
    await ongletA.fill("#p-telephone", prospect.telephone);
    await ongletA.selectOption("#p-source", "appel");
    await envoyerTiroir(ongletA);
    const id = sql("SELECT Id FROM Prospects WHERE Courriel = '" + prospect.courriel + "'");
    verifier(/^\d+$/.test(id), "prospect créé (id " + id + ")");

    // Les deux onglets ouvrent la fiche et le formulaire « Modifier » sur les mêmes valeurs.
    const fiche = BASE_URL + "/Prospects/Fiche/pe-" + id;
    const ongletB = await contexte.newPage();
    await ongletA.goto(fiche);
    await ongletB.goto(fiche);
    await ouvrirModification(ongletA);
    await ouvrirModification(ongletB);

    // L'onglet A enregistre en premier.
    await ongletA.fill("#p-telephone", telephoneOngletA);
    await envoyerTiroir(ongletA);
    await ongletA.locator("#sv-toast [data-toast-texte]").waitFor({ state: "visible" });
    verifier(sql("SELECT Telephone FROM Prospects WHERE Id = " + id) === telephoneOngletA, "onglet A : téléphone enregistré");

    // L'onglet B, ouvert avant, est refusé.
    await ongletB.fill("#p-nom", nomOngletB);
    await envoyerTiroir(ongletB);
    let message = await resumeErreurs(ongletB);
    verifier(message.includes("modifié entre-temps") && message.includes("pas été enregistrés"), "onglet B : conflit expliqué (« " + message.slice(0, 70) + "… »)");
    verifier(!(await ongletB.locator("#sv-toast.show").count()), "onglet B : aucune fausse confirmation");
    verifier(await ongletB.inputValue("#p-nom") === nomOngletB, "onglet B : la saisie est conservée dans le formulaire");
    await ongletB.screenshot({ path: "e2e-conflit-1.png" });

    // Second clic sur « Enregistrer » sans rechargement : toujours refusé.
    await envoyerTiroir(ongletB);
    message = await resumeErreurs(ongletB);
    verifier(message.includes("modifié entre-temps"), "onglet B : le second clic est refusé lui aussi");
    const apresSecondClic = sql("SELECT Telephone, Nom FROM Prospects WHERE Id = " + id).split("\t");
    verifier(apresSecondClic[0] === telephoneOngletA && apresSecondClic[1] === prospect.nom, "en base : la modification de l'onglet A est intacte, rien de l'onglet B");

    // Rechargement volontaire : fermer, rouvrir « Modifier » (valeurs actuelles), refaire le changement.
    await ongletB.click('#tiroir-prospect [data-bs-dismiss="offcanvas"].btn');
    await ongletB.waitForSelector("#tiroir-prospect.show", { state: "detached" }).catch(function () {});
    await ongletB.waitForTimeout(400);
    await ouvrirModification(ongletB);
    verifier(await ongletB.inputValue("#p-telephone") === telephoneOngletA, "onglet B rouvert : le téléphone de l'onglet A est affiché");
    await ongletB.fill("#p-nom", nomOngletB);
    await envoyerTiroir(ongletB);
    await ongletB.locator("#sv-toast [data-toast-texte]").waitFor({ state: "visible" });
    verifier((await ongletB.locator("#sv-toast [data-toast-texte]").innerText()).includes("Modifications enregistrées"), "onglet B : confirmation après rechargement");
    const final = sql("SELECT Telephone, Nom FROM Prospects WHERE Id = " + id).split("\t");
    verifier(final[0] === telephoneOngletA && final[1] === nomOngletB, "en base : les deux modifications sont présentes (" + final.join(", ") + ")");

    console.log("\nParcours de conflit réussi (" + etape + " vérifications).");
  } catch (erreur) {
    console.error("\n" + erreur.message);
    await ongletA.screenshot({ path: "e2e-conflit-echec.png" });
    code = 1;
  } finally {
    await navigateur.close();
  }
  process.exit(code);
})();
