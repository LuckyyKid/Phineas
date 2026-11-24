// Test de bout en bout : vue « À venir » de « Mes suivis », sur des suivis réellement planifiés en MySQL.
// Passage « À venir » → « À traiter » au changement de jour (horloge du navigateur figée par Playwright), report,
// réalisation, remplacement, pagination indépendante, isolation entre conseillers et concessions, 390 px et thème sombre.
// Prérequis et variables : les mêmes que modification-prospect.e2e.js (BASE_URL, CHROMIUM_PATH, MYSQL_CONTAINER, E2E_DB).
// Lancement : node a-venir-suivis.e2e.js   (le paquet « playwright » doit être installé, version 1.45 ou plus)
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

// Date « AAAA-MM-JJ » locale, dans N jours (comme le champ <input type="date">).
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

// Crée un prospect par le vrai formulaire puis planifie son suivi par la vraie fenêtre de la fiche ; retourne ses ids.
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

// Fenêtre « Planifier un suivi » de la fiche (fonctionnalité 05) : même action et autre date = report.
async function planifier(page, prospectId, action, decalage) {
  await page.goto(BASE_URL + "/Prospects/Fiche/pe-" + prospectId);
  await page.waitForTimeout(600);
  await page.click('[data-action="suivi"]');
  await page.waitForSelector("#modal-suivi.show");
  await page.fill("#s-action", action);
  await page.fill("#s-date", jour(decalage));
  await Promise.all([page.waitForNavigation(), page.click('#form-suivi button[type="submit"]')]);
}

async function ouvrirSuivis(page, vue) {
  await page.goto(BASE_URL + "/Intelligence/Suivis" + (vue === "a-venir" ? "?vue=a-venir" : ""));
  await page.waitForTimeout(800);
}

async function ouvrirAVenir(page) {
  await ouvrirSuivis(page);
  await page.click("#onglet-a-venir");
  await page.waitForSelector("#panneau-a-venir.show");
}

// Ligne d'une liste (« a-venir » ou « relances ») qui correspond au sélecteur, page après page ; null si absente.
async function trouver(page, liste, selecteur) {
  // Repartir de la page 1 (la liste a pu rester sur une autre page après une recherche précédente).
  const premiere = page.locator('[data-zone="pagination-' + liste + '"] [data-aller-page="1"]:not([disabled])');
  if (await premiere.count()) {
    await premiere.first().click();
    await page.waitForTimeout(150);
  }
  for (let numero = 1; numero <= 40; numero++) {
    const ligne = page.locator("#" + liste + " tr").filter({ has: page.locator(selecteur) });
    if (await ligne.count()) return ligne.first();
    const suivante = page.locator('[data-zone="pagination-' + liste + '"] [data-aller-page="' + (numero + 1) + '"]:not([disabled])');
    if (!(await suivante.count())) return null;
    await suivante.first().click();
    await page.waitForTimeout(150);
  }
  return null;
}

// Ligne de « À venir » d'une opportunité, et ligne « suivi-echeance » de « À traiter » (celle qui a « Reporter »).
const ligneAVenir = (page, oppId) => trouver(page, "a-venir", '[data-reporter-suivi="oe-' + oppId + '"]');
const ligneATraiter = (page, oppId) => trouver(page, "relances", '[data-realiser-suivi="oe-' + oppId + '"]');

async function messageAffiche(page) {
  const toast = page.locator("#sv-toast [data-toast-texte]");
  await toast.waitFor({ state: "visible" });
  return toast.innerText();
}

// Page courante d'une pagination (numéro marqué aria-current), ou 1 s'il n'y a pas de pagination.
async function pageCourante(page, liste) {
  const courant = page.locator('[data-zone="pagination-' + liste + '"] [aria-current="page"]');
  return (await courant.count()) ? Number(await courant.first().getAttribute("data-aller-page")) : 1;
}

(async () => {
  const navigateur = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await nouvellePage(navigateur);
  let code = 0;

  try {
    // ---------- Scénario principal ----------
    await connecter(page, SOPHIE);
    const action = "Appeler pour l'essai de vendredi " + suffixe;
    const a = await creerAvecSuivi(page, "Avenir" + suffixe, action, 3);
    const titre = sql("SELECT Titre FROM OpportunitesVente WHERE Id = " + a.oppId);
    verifier(sql("SELECT CONCAT(ProchaineAction, ' | ', DATE(DateProchaineAction)) FROM OpportunitesVente WHERE Id = " + a.oppId) === action + " | " + jour(3), "suivi planifié dans 3 jours, en base (oe-" + a.oppId + ")");

    await ouvrirAVenir(page);
    verifier(new URL(page.url()).search === "?vue=a-venir", "la vue choisie est gardée dans l'adresse");
    let ligne = await ligneAVenir(page, a.oppId);
    verifier(ligne !== null, "« À venir » affiche le suivi");
    let texte = await ligne.innerText();
    verifier(texte.includes("Ana Avenir" + suffixe) && texte.includes(titre) && texte.includes(action), "bon prospect, bonne opportunité (« " + titre + " ») et bonne action");
    verifier(texte.includes("Dans 3 jours") && texte.includes(await page.evaluate(function (j) { return new Intl.DateTimeFormat("fr-CA", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(j + "T09:00:00")); }, jour(3))), "date prévue affichée (jour complet et « Dans 3 jours »)");
    await page.click("#onglet-a-traiter");
    verifier((await ligneATraiter(page, a.oppId)) === null, "le suivi futur n'est pas dans « À traiter »");

    await ouvrirSuivis(page, "a-venir");
    verifier(await page.locator("#onglet-a-venir.active").count() === 1 && (await ligneAVenir(page, a.oppId)) !== null, "après actualisation : même vue, suivi toujours visible");

    ligne = await ligneAVenir(page, a.oppId);
    await Promise.all([page.waitForNavigation(), ligne.locator("a.iv-nom").click()]);
    verifier(new URL(page.url()).pathname === "/Prospects/Fiche/pe-" + a.prospectId, "le lien ouvre la bonne fiche");
    await planifier(page, a.prospectId, action, 6); // même action, autre date future : report
    verifier((await messageAffiche(page)).length > 0, "report depuis la fiche confirmé");

    await ouvrirAVenir(page);
    texte = await (await ligneAVenir(page, a.oppId)).innerText();
    verifier(texte.includes("Dans 6 jours"), "« À venir » montre la nouvelle échéance");

    await page.click('form[action="/Account/Logout"] button[type="submit"]');
    await page.waitForURL(function (url) { return url.pathname.indexOf("/Intelligence") !== 0; });
    await connecter(page, SOPHIE);
    await ouvrirAVenir(page);
    texte = await (await ligneAVenir(page, a.oppId)).innerText();
    verifier(texte.includes(action) && texte.includes("Dans 6 jours"), "après reconnexion : le suivi est toujours à venir, à sa nouvelle date");
    verifier(sql("SELECT CONCAT(ProchaineAction, ' | ', DATE(DateProchaineAction), ' | ', (SELECT GROUP_CONCAT(Cloture) FROM HistoriquesSuiviOpportunite WHERE OpportuniteId = " + a.oppId + ")) FROM OpportunitesVente WHERE Id = " + a.oppId) === action + " | " + jour(6) + " | Reporte", "en base : même action, nouvelle date, un événement « Reporte »");

    // ---------- Suivi du jour et suivi en retard : « À traiter », jamais « À venir » ----------
    const j = await creerAvecSuivi(page, "Jour" + suffixe, "Suivi du jour " + suffixe, 0);
    const r = await creerAvecSuivi(page, "Retard" + suffixe, "Suivi en retard " + suffixe, 1);
    sql("UPDATE OpportunitesVente SET DateProchaineAction = DATE_SUB(DateProchaineAction, INTERVAL 3 DAY) WHERE Id = " + r.oppId);
    await ouvrirSuivis(page);
    verifier((await ligneATraiter(page, j.oppId)) !== null && (await ligneATraiter(page, r.oppId)) !== null, "suivis du jour et en retard dans « À traiter »");
    await page.click("#onglet-a-venir");
    verifier((await ligneAVenir(page, j.oppId)) === null && (await ligneAVenir(page, r.oppId)) === null, "ni l'un ni l'autre dans « À venir »");

    // ---------- Passage au jour suivant (horloge du navigateur), autour de minuit ----------
    const demain = await creerAvecSuivi(page, "Demain" + suffixe, "Suivi de demain " + suffixe, 1);
    const veilleMinuit = new Date(); veilleMinuit.setHours(23, 59, 30, 0);
    const lendemain = new Date(veilleMinuit.getTime() + 60 * 1000); // 00 h 00 min 30 s le lendemain
    const avantMinuit = await nouvellePage(navigateur);
    await avantMinuit.clock.setFixedTime(veilleMinuit);
    await connecter(avantMinuit, SOPHIE);
    await ouvrirAVenir(avantMinuit);
    verifier((await ligneAVenir(avantMinuit, demain.oppId)) !== null && (await (await ligneAVenir(avantMinuit, demain.oppId)).innerText()).includes("Demain"), "23 h 59 : le suivi de demain est « À venir » (« Demain »), jamais en retard");
    const apresMinuit = await nouvellePage(navigateur);
    await apresMinuit.clock.setFixedTime(lendemain);
    await connecter(apresMinuit, SOPHIE);
    await ouvrirAVenir(apresMinuit);
    verifier((await ligneAVenir(apresMinuit, demain.oppId)) === null, "00 h 00 le lendemain : il quitte « À venir », sans modification en base");
    await apresMinuit.click("#onglet-a-traiter");
    ligne = await ligneATraiter(apresMinuit, demain.oppId);
    verifier(ligne !== null && !(await ligne.innerText()).includes("En retard"), "… et rejoint « À traiter » (dû aujourd'hui, pas en retard)");
    verifier(sql("SELECT DATE(DateProchaineAction) FROM OpportunitesVente WHERE Id = " + demain.oppId) === jour(1), "la date en base n'a pas changé");

    // ---------- Reporter depuis « À venir » (fenêtre existante) ----------
    await ouvrirAVenir(page);
    await (await ligneAVenir(page, a.oppId)).locator("[data-reporter-suivi]").click();
    await page.waitForSelector("#ia-modale.show");
    const fenetre = await page.locator("#ia-modale .modal-body").innerText();
    verifier(fenetre.includes(action) && fenetre.includes("Échéance actuelle") && fenetre.includes(titre), "« Reporter » ouvre la fenêtre de la bonne opportunité");
    await page.fill("#ia-date", jour(9));
    await Promise.all([page.waitForNavigation(), page.click("#ia-modale [data-ia-valider]")]);
    verifier((await messageAffiche(page)).includes("Suivi reporté au") && new URL(page.url()).search === "?vue=a-venir" && await page.locator("#onglet-a-venir.active").count() === 1, "report confirmé, retour dans « À venir »");
    verifier((await (await ligneAVenir(page, a.oppId)).innerText()).includes("Dans 9 jours") && sql("SELECT DATE(DateProchaineAction) FROM OpportunitesVente WHERE Id = " + a.oppId) === jour(9), "nouvelle échéance affichée et en base");

    // ---------- Réaliser depuis « À venir » ----------
    const f = await creerAvecSuivi(page, "Realise" + suffixe, "Réalisé en avance " + suffixe, 4);
    await ouvrirAVenir(page);
    await Promise.all([page.waitForNavigation(), (await ligneAVenir(page, f.oppId)).locator("[data-realiser-suivi]").click()]);
    verifier((await messageAffiche(page)).includes("marqué comme réalisé") && (await ligneAVenir(page, f.oppId)) === null, "un suivi futur réalisé disparaît de « À venir »");
    verifier(sql("SELECT CONCAT(IFNULL(o.ProchaineAction, 'aucune'), ' | ', h.Cloture) FROM OpportunitesVente o JOIN HistoriquesSuiviOpportunite h ON h.OpportuniteId = o.Id WHERE o.Id = " + f.oppId) === "aucune | Realise", "en base : plus d'action courante, historique « Realise »");

    // ---------- Remplacement : une seule ligne, la nouvelle action ----------
    const m = await creerAvecSuivi(page, "Remplace" + suffixe, "Ancienne action " + suffixe, 2);
    await planifier(page, m.prospectId, "Nouvelle action " + suffixe, 5);
    await ouvrirAVenir(page);
    const lignesOpp = page.locator('#a-venir tr[data-suivi="oe-' + m.oppId + '"]');
    await ligneAVenir(page, m.oppId);
    verifier(await lignesOpp.count() === 1 && (await lignesOpp.innerText()).includes("Nouvelle action") && !(await page.locator("#a-venir").innerText()).includes("Ancienne action " + suffixe), "remplacement : une seule ligne, avec la nouvelle action");

    // ---------- Données de démonstration : aucune ligne fictive dans « À venir » ----------
    const idsAffiches = await page.evaluate(function () { return JSON.parse(document.getElementById("suivis-planifies").textContent).map(function (s) { return s.opportuniteId; }); });
    verifier(idsAffiches.length > 0 && idsAffiches.every(function (id) { return id.indexOf("oe-") === 0; }), "seules des opportunités enregistrées (oe-…) sont transmises à « À venir »");

    // ---------- Pagination : ordre, égalités, indépendance des deux vues ----------
    const p = a.prospectId;
    const valeurs = [];
    for (let i = 0; i < 9; i++) valeurs.push("(" + p + ", 'Pagination " + i + " " + suffixe + "', 'Qualifie', 'Pagination " + i + " " + suffixe + "', TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL " + (i < 2 ? 12 : 13 + i) + " DAY), '09:00:00'), NOW(), NOW())");
    sql("INSERT INTO OpportunitesVente (ProspectId, Titre, Etape, ProchaineAction, DateProchaineAction, DateCreation, DerniereActivite) VALUES " + valeurs.join(", "));
    await ouvrirAVenir(page);
    const ordre = [];
    for (let numero = 1; numero <= 40; numero++) {
      ordre.push.apply(ordre, await page.$$eval("#a-venir tr", function (l) { return l.map(function (tr) { return tr.getAttribute("data-suivi"); }); }));
      const suivante = page.locator('[data-zone="pagination-a-venir"] [data-aller-page="' + (numero + 1) + '"]:not([disabled])');
      if (!(await suivante.count())) break;
      await suivante.first().click();
      await page.waitForTimeout(150);
    }
    const attendu = await page.evaluate(function () {
      const P = window.Prospects;
      return JSON.parse(document.getElementById("suivis-planifies").textContent).filter(function (s) { return P.ecartJours(s.datePrevue) > 0; }).map(function (s) { return s.opportuniteId; });
    });
    const enBase = sql("SELECT CONCAT('oe-', o.Id) FROM OpportunitesVente o JOIN Prospects x ON x.Id = o.ProspectId JOIN AspNetUsers u ON u.Id = x.ConseillerId WHERE u.Email = '" + SOPHIE + "' AND o.ProchaineAction IS NOT NULL AND DATE(o.DateProchaineAction) > CURDATE() AND o.Etape NOT IN ('Gagne', 'Perdu') ORDER BY o.DateProchaineAction, o.Id").split("\n");
    verifier(ordre.length === enBase.length && ordre.join() === enBase.join() && ordre.join() === attendu.join(), "toutes les pages réunies : les " + ordre.length + " suivis à venir de la base, par date puis par opportunité");
    const egaux = sql("SELECT CONCAT('oe-', Id) FROM OpportunitesVente WHERE ProchaineAction IN ('Pagination 0 " + suffixe + "', 'Pagination 1 " + suffixe + "') ORDER BY Id").split("\n");
    verifier(ordre.indexOf(egaux[0]) + 1 === ordre.indexOf(egaux[1]), "à date égale, ordre stable par opportunité");

    await ouvrirSuivis(page);
    const pagesATraiter = await page.locator('[data-zone="pagination-relances"] [data-aller-page]').count();
    if (pagesATraiter) await page.locator('[data-zone="pagination-relances"] [data-aller-page="2"]').first().click();
    const pageTraiterAvant = await pageCourante(page, "relances");
    await page.click("#onglet-a-venir");
    await page.locator('[data-zone="pagination-a-venir"] [data-aller-page="2"]').first().click();
    await page.click("#onglet-a-traiter");
    await page.click("#onglet-a-venir");
    verifier(await pageCourante(page, "a-venir") === 2 && await pageCourante(page, "relances") === pageTraiterAvant, "pagination indépendante : « À venir » page 2, « À traiter » reste page " + pageTraiterAvant + " après les changements de vue");

    // ---------- Isolation : collègue de la même concession, conseiller d'une autre concession ----------
    function creerConseiller(courriel, concession) {
      sql("INSERT INTO AspNetUsers (Id, FirstName, LastName, DealershipId, IsActive, MustChangePassword, CreatedAt, UserName, NormalizedUserName, Email, NormalizedEmail, EmailConfirmed, PasswordHash, SecurityStamp, ConcurrencyStamp, PhoneNumberConfirmed, TwoFactorEnabled, LockoutEnabled, AccessFailedCount) " +
        "SELECT UUID(), 'Autre', 'Conseiller', " + concession + ", 1, 0, NOW(), '" + courriel + "', UPPER('" + courriel + "'), '" + courriel + "', UPPER('" + courriel + "'), 1, PasswordHash, UUID(), UUID(), 0, 0, 1, 0 FROM AspNetUsers WHERE Email = '" + SOPHIE + "'");
      sql("INSERT INTO AspNetUserRoles (UserId, RoleId) SELECT u.Id, r.Id FROM AspNetUsers u, AspNetRoles r WHERE u.Email = '" + courriel + "' AND r.Name = 'Conseiller'");
    }
    sql("UPDATE Dealerships SET IsActive = 1 WHERE Name = 'Garage Saint-Laurent'");
    const collegue = "collegue.avenir." + suffixe + "@autoprestige.example";
    const ailleurs = "ailleurs.avenir." + suffixe + "@garagestl.example";
    creerConseiller(collegue, "(SELECT DealershipId FROM (SELECT DealershipId FROM AspNetUsers WHERE Email = '" + SOPHIE + "') x)");
    creerConseiller(ailleurs, "(SELECT Id FROM Dealerships WHERE Name = 'Garage Saint-Laurent')");
    for (const courriel of [collegue, ailleurs]) {
      const autre = await nouvellePage(navigateur);
      await connecter(autre, courriel);
      const reponse = await autre.goto(BASE_URL + "/Intelligence/Suivis?vue=a-venir&prospect=pe-" + a.prospectId + "&conseiller=moi&page=3");
      const html = await reponse.text();
      await autre.waitForTimeout(600);
      verifier(!html.includes(action) && !html.includes("Avenir" + suffixe) && await autre.locator("#a-venir tr").count() === 0 && await autre.locator("#a-venir-vide").isVisible(), (courriel === collegue ? "collègue de la même concession" : "autre concession") + " : rien de ce suivi, ni dans la page ni dans les données, même avec des paramètres manipulés");
    }

    // ---------- 390 px et thème sombre ----------
    const mobile = await nouvellePage(navigateur, { viewport: { width: 390, height: 844 } });
    await connecter(mobile, SOPHIE);
    await ouvrirAVenir(mobile);
    await mobile.evaluate(function () { document.documentElement.dataset.theme = "sombre"; });
    await mobile.waitForTimeout(300);
    const mesures = await mobile.evaluate(function () {
      const largeur = document.documentElement.clientWidth;
      const droite = function (sel) { return Math.round(document.querySelector(sel).getBoundingClientRect().right); };
      return { largeur: largeur, tete: droite("#suivis .iv-carte-tete-onglets"), onglets: droite("#onglet-a-venir"), panneau: droite("#panneau-a-venir"), defile: droite('[data-zone="tableau-a-venir"]'), puces: droite(".iv-puces") };
    });
    verifier(mesures.tete <= mesures.largeur && mesures.onglets <= mesures.largeur && mesures.panneau <= mesures.largeur && mesures.defile <= mesures.largeur, "390 px : onglets, panneau et tableau « À venir » restent dans l'écran (le tableau défile dans son cadre) " + JSON.stringify(mesures));
    // Toute la page : le seul débordement admis est celui, antérieur, des pastilles de l'en-tête (iv-puces) ; une fois
    // neutralisé par le correctif proposé (retour à la ligne de .iv-haut et .iv-puces), la vue « À venir » n'en ajoute aucun.
    await mobile.addStyleTag({ content: ".iv-haut, .iv-puces { flex-wrap: wrap; }" });
    await mobile.waitForTimeout(200);
    const debordement = await mobile.evaluate(function () { return document.documentElement.scrollWidth - document.documentElement.clientWidth; });
    verifier(debordement === 0, "390 px : la vue « À venir » n'ajoute aucun défilement horizontal à la page (" + debordement + " px)");
    await mobile.screenshot({ path: "a-venir-390-sombre.png", fullPage: false });
    await (await ligneAVenir(page, a.oppId)).screenshot({ path: "a-venir-ligne-clair.png" });

    console.log("\nParcours « À venir » réussi (" + etape + " vérifications).");
  } catch (erreur) {
    console.error("\n" + erreur.message);
    await page.screenshot({ path: "e2e-a-venir-echec.png" });
    code = 1;
  } finally {
    await navigateur.close();
  }
  process.exit(code);
})();
