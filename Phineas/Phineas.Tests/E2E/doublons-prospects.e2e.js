// Test de bout en bout : création de prospects protégée contre les doublons et les divulgations (fonctionnalité 17),
// sur l'application réelle et MySQL. Doublon = même courriel ou même téléphone dans la concession (règle inchangée).
// Un collègue refusé ne voit jamais le dossier existant (ni nom, ni coordonnées, ni identifiant, ni conseiller) ;
// deux envois simultanés n'enregistrent qu'un dossier ; une autre concession reste indépendante.
// Prérequis et variables : les mêmes que modification-prospect.e2e.js (BASE_URL, CHROMIUM_PATH, MYSQL_CONTAINER, E2E_DB).
// Lancement : node doublons-prospects.e2e.js   (le paquet « playwright » doit être installé)
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
const numero = String(1000 + Math.floor(Math.random() * 8999));

// Dossier créé par Sophie : aucune de ces valeurs ne doit apparaître chez le collègue refusé.
const secret = { prenom: "Secretprenom" + suffixe, nom: "Secretnom" + suffixe, courriel: "secret." + suffixe + "@exemple.test", telephone: "(514) 555-" + numero };
const chiffres = "514555" + numero;
const NEUTRE_COURRIEL = "Un dossier correspondant à ce courriel existe déjà dans votre concession. Aucune nouvelle fiche n'a été créée.";
const NEUTRE_TELEPHONE = "Un dossier correspondant à ce téléphone existe déjà dans votre concession. Aucune nouvelle fiche n'a été créée.";

let etape = 0;
function verifier(condition, message) {
  etape += 1;
  if (!condition) throw new Error("Étape " + etape + " échouée : " + message);
  console.log("ok " + etape + " : " + message);
}

function sql(requete) {
  return execFileSync("docker", ["exec", CONTENEUR, "mysql", "-uphineas", "-pphineas_dev_password", "-N", "-B", "--default-character-set=utf8mb4", BASE, "-e", requete], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

// Prospects et opportunités enregistrés pour un courriel ou des chiffres de téléphone, toutes concessions confondues.
function compter(condition) {
  const prospects = sql("SELECT COUNT(*) FROM Prospects WHERE " + condition);
  const opportunites = sql("SELECT COUNT(*) FROM OpportunitesVente o JOIN Prospects p ON p.Id = o.ProspectId WHERE " + condition.replace(/\b(Courriel|TelephoneChiffres)\b/g, "p.$1"));
  return prospects + "/" + opportunites;
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

async function deconnecter(page) {
  await page.click('form[action="/Account/Logout"] button[type="submit"]');
  await page.waitForURL(function (url) { return url.pathname === "/" || url.pathname.indexOf("/Home") === 0; });
}

// Ouvre le tiroir de création et le remplit (sans envoyer).
async function remplir(page, p) {
  await page.goto(BASE_URL + "/Prospects");
  await page.click(".pr-entete [data-ouvrir-creation]");
  await page.waitForSelector("#tiroir-prospect.show");
  await page.fill("#p-prenom", p.prenom);
  await page.fill("#p-nom", p.nom);
  if (p.courriel) await page.fill("#p-courriel", p.courriel);
  if (p.telephone) await page.fill("#p-telephone", p.telephone);
  await page.click('label[for="p-pref-courriel"]');
  await page.selectOption("#p-source", "appel");
}

// Clic sur la partie gauche du bouton : la mascotte flottante (bas à droite) en recouvre le centre.
async function envoyer(page) {
  await Promise.all([
    page.waitForNavigation(),
    page.click('#tiroir-prospect button[type="submit"]', { position: { x: 15, y: 15 } }),
  ]);
}

async function creer(page, p) {
  await remplir(page, p);
  await envoyer(page);
}

// Message d'erreur affiché sous un champ du tiroir (vide si le champ est valide).
async function erreurDe(page, id) {
  return page.evaluate(function (id) {
    var champ = document.getElementById(id);
    if (!champ.classList.contains("is-invalid")) return "";
    return champ.closest("div").querySelector(".invalid-feedback").textContent.trim();
  }, id);
}

// Tout ce que le navigateur a reçu (HTML et données JSON), pour chercher une fuite sous n'importe quelle forme.
async function toutLeTexte(page) {
  return page.evaluate(function () {
    var donnees = document.getElementById("prospects-donnees");
    return document.documentElement.outerHTML + "\n" + (donnees ? JSON.stringify(JSON.parse(donnees.textContent)) : "");
  });
}

function sansFuite(texte, idSecret) {
  return [secret.prenom, secret.nom, secret.courriel, chiffres, "555-" + numero, "pe-" + idSecret + "\"", "/Fiche/pe-" + idSecret]
    .filter(function (v) { return texte.indexOf(v) >= 0; });
}

(async function () {
  const navigateur = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    // Collègue de Sophie (même concession) et conseiller d'une autre concession.
    function creerConseiller(courriel, concession) {
      sql("INSERT INTO AspNetUsers (Id, FirstName, LastName, DealershipId, IsActive, MustChangePassword, CreatedAt, UserName, NormalizedUserName, Email, NormalizedEmail, EmailConfirmed, PasswordHash, SecurityStamp, ConcurrencyStamp, PhoneNumberConfirmed, TwoFactorEnabled, LockoutEnabled, AccessFailedCount) " +
        "SELECT UUID(), 'Autre', 'Conseiller', " + concession + ", 1, 0, NOW(), '" + courriel + "', UPPER('" + courriel + "'), '" + courriel + "', UPPER('" + courriel + "'), 1, PasswordHash, UUID(), UUID(), 0, 0, 1, 0 FROM AspNetUsers WHERE Email = '" + SOPHIE + "'");
      sql("INSERT INTO AspNetUserRoles (UserId, RoleId) SELECT u.Id, r.Id FROM AspNetUsers u, AspNetRoles r WHERE u.Email = '" + courriel + "' AND r.Name = 'Conseiller'");
    }
    sql("UPDATE Dealerships SET IsActive = 1 WHERE Name = 'Garage Saint-Laurent'");
    const collegue = "collegue.doublons." + suffixe + "@autoprestige.example";
    const ailleurs = "ailleurs.doublons." + suffixe + "@garagestl.example";
    creerConseiller(collegue, "(SELECT DealershipId FROM (SELECT DealershipId FROM AspNetUsers WHERE Email = '" + SOPHIE + "') x)");
    creerConseiller(ailleurs, "(SELECT Id FROM Dealerships WHERE Name = 'Garage Saint-Laurent')");
    verifier(sql("SELECT COUNT(*) FROM AspNetUsers WHERE Email IN ('" + collegue + "', '" + ailleurs + "')") === "2", "collègue et conseiller d'une autre concession créés");

    // ---------- 1. Sophie crée le dossier ----------
    const a = await nouvellePage(navigateur);
    await connecter(a, SOPHIE);
    await creer(a, secret);
    verifier(new URL(a.url()).pathname === "/Prospects" && !(await a.locator("#tiroir-prospect.show").count()), "Sophie : création acceptée, retour à la liste");
    verifier(compter("Courriel = '" + secret.courriel + "'") === "1/1", "en base : un prospect et une opportunité pour ce courriel");
    const idSecret = sql("SELECT Id FROM Prospects WHERE Courriel = '" + secret.courriel + "'");

    // ---------- 2. Le collègue saisit le même courriel (autre casse) : refus neutre ----------
    const b = await nouvellePage(navigateur);
    await connecter(b, collegue);
    const saisieB = { prenom: "Bruno" + suffixe, nom: "Saisie", courriel: secret.courriel.toUpperCase() };
    await creer(b, saisieB);
    await b.waitForSelector("#tiroir-prospect.show");
    const erreurCourriel = await erreurDe(b, "p-courriel");
    verifier(erreurCourriel === NEUTRE_COURRIEL, "collègue, même courriel : message neutre (« " + erreurCourriel + " »)");
    verifier(!(await b.locator("#sv-toast.show").count()), "collègue : aucune fausse confirmation");
    verifier(await b.inputValue("#p-prenom") === saisieB.prenom && await b.inputValue("#p-courriel") === saisieB.courriel, "collègue : sa saisie est conservée dans le tiroir");
    let fuites = sansFuite(await toutLeTexte(b), idSecret);
    verifier(fuites.length === 0, "collègue : rien du dossier existant dans la page reçue (" + (fuites.join(", ") || "aucune fuite") + ")");
    verifier(erreurCourriel.indexOf("Sophie") < 0 && erreurCourriel.indexOf("Gagnon") < 0, "collègue : la conseillère responsable n'est pas nommée");
    verifier(compter("Courriel = '" + secret.courriel + "'") === "1/1", "en base : toujours un seul dossier pour ce courriel");
    await b.screenshot({ path: "doublons-1-refus-courriel.png" });

    // ---------- 3. Le collègue saisit le même téléphone (autre format) : refus neutre ----------
    await creer(b, { prenom: "Bruno" + suffixe, nom: "Saisie", courriel: "bruno." + suffixe + "@exemple.test", telephone: "514.555." + numero });
    await b.waitForSelector("#tiroir-prospect.show");
    const erreurTelephone = await erreurDe(b, "p-telephone");
    verifier(erreurTelephone === NEUTRE_TELEPHONE, "collègue, même téléphone : message neutre (« " + erreurTelephone + " »)");
    verifier(await erreurDe(b, "p-courriel") === "", "collègue : son propre courriel, nouveau, n'est pas en erreur");
    fuites = sansFuite(await toutLeTexte(b), idSecret);
    verifier(fuites.length === 0, "collègue : aucune fuite après le refus du téléphone (" + (fuites.join(", ") || "aucune") + ")");
    verifier(compter("TelephoneChiffres = '" + chiffres + "'") === "1/1" && sql("SELECT COUNT(*) FROM Prospects WHERE Courriel = 'bruno." + suffixe + "@exemple.test'") === "0", "en base : rien de créé pour le collègue");

    // ---------- 4. Rechargement et reconnexion : toujours rien ----------
    await b.goto(BASE_URL + "/Prospects");
    fuites = sansFuite(await toutLeTexte(b), idSecret);
    verifier(fuites.length === 0, "collègue, liste rechargée : le dossier de Sophie reste invisible");
    await deconnecter(b);
    await connecter(b, collegue);
    await b.goto(BASE_URL + "/Prospects");
    fuites = sansFuite(await toutLeTexte(b), idSecret);
    verifier(fuites.length === 0, "collègue, après reconnexion : toujours invisible");
    const reponseFiche = await b.goto(BASE_URL + "/Prospects/Fiche/pe-" + idSecret);
    const ficheTexte = await toutLeTexte(b);
    verifier(reponseFiche.status() === 404 || (ficheTexte.indexOf(secret.prenom) < 0 && ficheTexte.indexOf(secret.nom) < 0), "collègue : la fiche du dossier de Sophie reste fermée (statut " + reponseFiche.status() + ")");

    // ---------- 5. Sophie et son propre prospect : refus qui le nomme ----------
    await creer(a, { prenom: "Autre", nom: "Saisie", courriel: secret.courriel });
    await a.waitForSelector("#tiroir-prospect.show");
    const erreurPropre = await erreurDe(a, "p-courriel");
    verifier(erreurPropre === "Un de vos prospects a déjà ce courriel : " + secret.prenom + " " + secret.nom + ". Aucune nouvelle fiche n'a été créée.", "Sophie, son propre prospect : le nom l'aide à le retrouver (« " + erreurPropre + " »)");
    verifier(compter("Courriel = '" + secret.courriel + "'") === "1/1", "en base : toujours un seul dossier");

    // ---------- 6. Autre concession : le même courriel est permis ----------
    const c = await nouvellePage(navigateur);
    await connecter(c, ailleurs);
    await creer(c, { prenom: "Lou", nom: "Ailleurs" + suffixe, courriel: secret.courriel });
    verifier(new URL(c.url()).pathname === "/Prospects" && !(await c.locator("#tiroir-prospect.show").count()), "autre concession : création acceptée");
    verifier(compter("Courriel = '" + secret.courriel + "'") === "2/2", "en base : un dossier par concession");
    verifier(sql("SELECT COUNT(DISTINCT DealershipId) FROM Prospects WHERE Courriel = '" + secret.courriel + "'") === "2", "en base : les deux dossiers sont dans deux concessions différentes");

    // ---------- 7. Envois simultanés de Sophie et du collègue ----------
    const simultane = "simultane." + suffixe + "@exemple.test";
    await remplir(a, { prenom: "Prenomsimula", nom: "Sophie", courriel: simultane });
    await remplir(b, { prenom: "Prenomsimulb", nom: "Collegue", courriel: simultane });
    await Promise.all([envoyer(a), envoyer(b)]);
    verifier(compter("Courriel = '" + simultane + "'") === "1/1", "envois simultanés : un seul prospect et une seule opportunité en base");
    const gagnant = sql("SELECT Prenom FROM Prospects WHERE Courriel = '" + simultane + "'");
    const perdant = gagnant === "Prenomsimula" ? b : a;
    await perdant.waitForSelector("#tiroir-prospect.show");
    const erreurPerdant = await erreurDe(perdant, "p-courriel");
    verifier(erreurPerdant === NEUTRE_COURRIEL, "envois simultanés : l'autre conseiller reçoit le refus neutre (« " + erreurPerdant + " »)");
    verifier((await toutLeTexte(perdant)).indexOf(gagnant) < 0, "envois simultanés : le nom du dossier gagnant n'est pas divulgué");

    // ---------- 8. Affichage du refus : 320, 390 et 1440 px, clair et sombre ----------
    for (const [largeur, theme] of [[320, "clair"], [320, "sombre"], [390, "clair"], [390, "sombre"], [1440, "clair"], [1440, "sombre"]]) {
      const v = await nouvellePage(navigateur, { viewport: { width: largeur, height: 900 } });
      await connecter(v, collegue);
      await creer(v, { prenom: "Vue" + largeur, nom: "Saisie", courriel: secret.courriel });
      await v.waitForSelector("#tiroir-prospect.show");
      if (theme === "sombre") await v.evaluate(function () { document.documentElement.dataset.theme = "sombre"; });
      const debord = await v.evaluate(function () { return document.documentElement.scrollWidth - document.documentElement.clientWidth; });
      const message = await erreurDe(v, "p-courriel");
      const visible = await v.locator("#p-courriel ~ .invalid-feedback, #p-courriel + * .invalid-feedback").first().isVisible().catch(function () { return false; })
        || await v.evaluate(function () { var e = document.getElementById("p-courriel").closest("div").querySelector(".invalid-feedback"); return e && e.offsetHeight > 0; });
      await v.screenshot({ path: "doublons-refus-" + largeur + "-" + theme + ".png" });
      verifier(debord === 0 && message === NEUTRE_COURRIEL && visible, largeur + " px, thème " + theme + " : refus lisible, sans débordement");
      await v.context().close();
    }

    console.log("\nParcours doublons et confidentialité des prospects : " + etape + " étapes réussies.");
  } catch (erreur) {
    console.error("\n" + erreur.message);
    process.exitCode = 1;
  } finally {
    await navigateur.close();
  }
})();
