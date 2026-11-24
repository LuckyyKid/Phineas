// Test de bout en bout : note persistante sur un prospect enregistré (onglet Historique), dans un vrai navigateur.
// Prérequis et variables : les mêmes que modification-prospect.e2e.js (BASE_URL, CHROMIUM_PATH, MYSQL_CONTAINER, E2E_DB).
// La base de test est lue et préparée par « docker exec » (vérification, conseiller d'une autre concession).
// Lancement : node notes-prospect.e2e.js   (le paquet « playwright » doit être installé)
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
const prospect = { prenom: "Eva", nom: "Note" + suffixe, courriel: "eva.note." + suffixe + "@exemple.test", modele: "Mazda CX-50" };
// Texte avec du HTML et des caractères spéciaux : il doit s'afficher tel quel, sans être interprété.
const texteNote = "Essai samedi <b>urgent</b> & « confirmé » " + suffixe;

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

async function ouvrirHistorique(page, prospectId) {
  await page.goto(BASE_URL + "/Prospects/Fiche/pe-" + prospectId);
  await page.click("#onglet-historique");
  await page.locator("#form-note").waitFor({ state: "visible" });
}

// Élément de la frise de l'onglet Historique qui contient le texte de la note (s'il existe).
// La fiche affiche aussi une frise dans « Vue d'ensemble » : on ne regarde que celle de l'Historique.
function elementNote(page) {
  return page.locator('#panneau-historique [data-zone="timeline"] li.pr-tl', { hasText: "Essai samedi" });
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
    // 1 et 2 : connexion et création réelle (fonctionnalité 01), puis passage à « Négociation » (fonctionnalité 03).
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
    await page.goto(BASE_URL + "/Prospects/Fiche/pe-" + prospectId);
    await page.click("#onglet-opportunites");
    await Promise.all([page.waitForNavigation(), page.locator("#opp-etape-oe-" + oppId).selectOption("Negociation")]);
    verifier(sql("SELECT Etape FROM OpportunitesVente WHERE Id = " + oppId) === "Negociation", "prospect créé et passé à « Négociation » (pe-" + prospectId + ")");

    // 3 à 6 : la note est écrite dans le formulaire existant et enregistrée.
    await ouvrirHistorique(page, prospectId);
    verifier(await page.inputValue("#n-opp") === "oe-" + oppId, "« Concerne » propose l'opportunité enregistrée");
    await page.selectOption("#n-type", "appel");
    await page.fill("#n-resume", texteNote);
    await Promise.all([page.waitForNavigation(), page.click('#form-note button[type="submit"]')]);
    verifier((await messageAffiche(page)).includes("Note enregistrée"), "confirmation « Note enregistrée »");

    // 7 à 9 : la note est dans l'historique, avec son auteur, et son HTML est affiché comme du texte.
    await page.locator("#form-note").waitFor({ state: "visible" });
    let note = elementNote(page);
    verifier(await note.count() === 1, "la note apparaît une fois dans l'historique");
    const texteAffiche = await note.innerText();
    verifier(texteAffiche.includes(texteNote), "le texte s'affiche tel quel, balises comprises");
    verifier(await note.locator("b").count() === 0, "aucune balise <b> n'est interprétée");
    verifier(texteAffiche.includes("Sophie Gagnon") && texteAffiche.includes("Appel"), "auteur « Sophie Gagnon » et type « Appel » affichés");
    verifier(await page.locator('#panneau-historique [data-zone="timeline"] li.pr-tl', { hasText: "Étape : Nouveau → Négociation." }).count() === 1, "le changement d'étape reste dans l'historique");
    await page.screenshot({ path: "e2e-notes-1.png" });

    // 10 et 11 : actualisation.
    await page.reload();
    await page.locator("#form-note").waitFor({ state: "visible" });
    verifier(await elementNote(page).count() === 1, "après actualisation : la note est toujours là, une seule fois");

    // 12 à 14 : déconnexion, reconnexion, puis navigateur neuf (sans stockage local).
    await page.click('form[action="/Account/Logout"] button[type="submit"]');
    await page.waitForURL(function (url) { return url.pathname.indexOf("/Prospects") !== 0; });
    await connecter(page, SOPHIE);
    await ouvrirHistorique(page, prospectId);
    verifier((await elementNote(page).innerText()).includes("Sophie Gagnon"), "après reconnexion : la note et son auteur sont là");
    const neuf = await (await navigateur.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await connecter(neuf, SOPHIE);
    await ouvrirHistorique(neuf, prospectId);
    verifier(await elementNote(neuf).count() === 1, "navigateur neuf : la note est là");

    // 15 : directement en base.
    const enBase = sql("SELECT n.Contenu, n.Type, n.OpportuniteId, u.Email FROM NotesProspect n JOIN AspNetUsers u ON u.Id = n.AuteurId WHERE n.ProspectId = " + prospectId).split("\n");
    const champs = enBase[0].split("\t");
    verifier(enBase.length === 1 && champs[0] === texteNote && champs[1] === "appel" && champs[2] === oppId && champs[3] === SOPHIE,
      "en base : une note, texte exact, type appel, opportunité " + oppId + ", auteur Sophie");
    verifier(sql("SELECT Etape FROM OpportunitesVente WHERE Id = " + oppId) === "Negociation", "en base : l'étape n'a pas changé");

    // Suivis : pas encore disponibles pour un prospect enregistré. Champs désactivés et expliqués dans la page…
    verifier(await page.isDisabled("#n-action") && await page.isDisabled("#n-date"), "suivi : « Prochaine action » et « Pour le » sont désactivés");
    verifier(await page.locator("[data-suivi-indisponible]").isVisible(), "suivi : l'explication est affichée");
    // …et refusés par le serveur si on contourne la page (envoi direct avec ces champs remplis).
    const contournement = await page.request.post(BASE_URL + "/Prospects/AjouterNote", {
      form: {
        prospectId: "pe-" + prospectId, jeton: "contournement-" + suffixe, type: "note", opportuniteId: "",
        resume: "Note avec suivi " + suffixe, prochaineAction: "Rappeler", date: "2030-01-15",
        __RequestVerificationToken: await page.inputValue('#form-note input[name="__RequestVerificationToken"]'),
      },
      maxRedirects: 0,
    });
    verifier(contournement.status() === 200 && (await contournement.text()).includes("\"champ\":\"prochaineAction\""), "suivi : envoi direct refusé par le serveur");
    verifier(sql("SELECT COUNT(*) FROM NotesProspect WHERE ProspectId = " + prospectId) === "1", "suivi : aucune note ajoutée en base");

    // Double envoi du même formulaire (même jeton) : une seule note.
    await ouvrirHistorique(page, prospectId);
    const formulaire = {
      prospectId: "pe-" + prospectId,
      jeton: await page.inputValue('#form-note input[name="jeton"]'),
      type: "note",
      opportuniteId: "",
      resume: "Double envoi " + suffixe,
      prochaineAction: "",
      date: "",
      __RequestVerificationToken: await page.inputValue('#form-note input[name="__RequestVerificationToken"]'),
    };
    await page.request.post(BASE_URL + "/Prospects/AjouterNote", { form: formulaire, maxRedirects: 0 });
    await page.request.post(BASE_URL + "/Prospects/AjouterNote", { form: formulaire, maxRedirects: 0 });
    verifier(sql("SELECT COUNT(*) FROM NotesProspect WHERE ProspectId = " + prospectId + " AND Contenu = 'Double envoi " + suffixe + "'") === "1", "double envoi : une seule note en base");

    // Sécurité : un conseiller d'une autre concession (créé dans la base de test) ne peut pas écrire de note.
    const courrielHugo = "hugo.note." + suffixe + "@garagestl.example";
    sql("INSERT INTO AspNetUsers (Id, FirstName, LastName, DealershipId, IsActive, MustChangePassword, CreatedAt, UserName, NormalizedUserName, Email, NormalizedEmail, EmailConfirmed, PasswordHash, SecurityStamp, ConcurrencyStamp, PhoneNumberConfirmed, TwoFactorEnabled, LockoutEnabled, AccessFailedCount) " +
      "SELECT UUID(), 'Hugo', 'Ailleurs', (SELECT Id FROM Dealerships WHERE Name = 'Garage Saint-Laurent'), 1, 0, NOW(), '" + courrielHugo + "', UPPER('" + courrielHugo + "'), '" + courrielHugo + "', UPPER('" + courrielHugo + "'), 1, PasswordHash, UUID(), UUID(), 0, 0, 1, 0 " +
      "FROM AspNetUsers WHERE Email = '" + SOPHIE + "'");
    sql("INSERT INTO AspNetUserRoles (UserId, RoleId) SELECT u.Id, r.Id FROM AspNetUsers u, AspNetRoles r WHERE u.Email = '" + courrielHugo + "' AND r.Name = 'Conseiller'");
    sql("UPDATE Dealerships SET IsActive = 1 WHERE Name = 'Garage Saint-Laurent'");
    const hugo = await (await navigateur.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await connecter(hugo, courrielHugo);
    await hugo.goto(BASE_URL + "/Prospects");
    const tentative = await hugo.request.post(BASE_URL + "/Prospects/AjouterNote", {
      form: { prospectId: "pe-" + prospectId, jeton: "jeton-hugo", type: "note", opportuniteId: "", resume: "Note pirate", prochaineAction: "", date: "",
        __RequestVerificationToken: await hugo.locator('#form-prospect input[name="__RequestVerificationToken"]').inputValue() },
      maxRedirects: 0,
    });
    verifier(tentative.status() === 404, "autre concession : note refusée (404)");
    verifier(sql("SELECT COUNT(*) FROM NotesProspect WHERE ProspectId = " + prospectId + " AND Contenu = 'Note pirate'") === "0", "autre concession : aucune note en base");

    console.log("\nParcours des notes réussi (" + etape + " vérifications) pour " + prospect.prenom + " " + prospect.nom + ".");
  } catch (erreur) {
    console.error("\n" + erreur.message);
    await page.screenshot({ path: "e2e-notes-echec.png" });
    code = 1;
  } finally {
    await navigateur.close();
  }
  process.exit(code);
})();
