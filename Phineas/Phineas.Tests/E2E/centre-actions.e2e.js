// Test de bout en bout : regroupement et commandes du Centre d'actions (fonctionnalité 12), sur l'application réelle
// et MySQL. Une prise de contact (première réponse + suivi échu) forme une seule carte ; chaque raison garde SES
// commandes : réaliser le suivi ne satisfait pas la première réponse, déclarer un contact ne réalise pas le suivi, et
// une première réponse d'un dossier réel propose « Déclarer le contact dans la fiche » au lieu d'une clôture simulée.
// Prérequis et variables : les mêmes que modification-prospect.e2e.js (BASE_URL, CHROMIUM_PATH, MYSQL_CONTAINER, E2E_DB).
// Lancement : node centre-actions.e2e.js   (le paquet « playwright » doit être installé)
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
const TACHE = "Préparer le dossier de financement";

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

// Prospect réel (étape « Nouveau » : première réponse attendue), avec un suivi du jour planifié par la fiche.
async function creer(page, nom, suivi) {
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
  if (suivi) {
    await page.goto(BASE_URL + "/Prospects/Fiche/pe-" + ids[0]);
    await page.waitForTimeout(600);
    await page.click('[data-action="suivi"]');
    await page.waitForSelector("#modal-suivi.show");
    await page.fill("#s-action", suivi);
    await page.fill("#s-date", jour(0));
    await Promise.all([page.waitForNavigation(), page.click('#form-suivi button[type="submit"]')]);
  }
  return { prospectId: ids[0], oppId: ids[1] };
}

async function noterAppel(page, prospectId, oppId) {
  await page.goto(BASE_URL + "/Prospects/Fiche/pe-" + prospectId);
  await page.click("#onglet-historique");
  await page.locator("#form-note").waitFor({ state: "visible" });
  await page.selectOption("#n-type", "appel");
  await page.selectOption("#n-opp", "oe-" + oppId);
  await page.fill("#n-resume", "Premier appel au client.");
  await Promise.all([page.waitForNavigation(), page.click('#form-note button[type="submit"]')]);
}

async function ouvrirCentre(page) {
  await page.goto(BASE_URL + "/Intelligence");
  await page.waitForTimeout(900);
}

// Carte de la file « À traiter » qui correspond au sélecteur, page après page (depuis la page 1) ; null si absente.
async function carte(page, selecteur) {
  const premiere = page.locator('#file [data-aller-page="1"]:not([disabled])');
  if (await premiere.count()) { await premiere.first().click(); await page.waitForTimeout(150); }
  for (let numero = 1; numero <= 40; numero++) {
    const c = page.locator("#file article" + selecteur);
    if (await c.count()) return c.first();
    const suivante = page.locator('#file [data-aller-page="' + (numero + 1) + '"]:not([disabled])');
    if (!(await suivante.count())) return null;
    await suivante.first().click();
    await page.waitForTimeout(150);
  }
  return null;
}
const carteObligation = (page, oppId) => carte(page, '[data-obligation="contact:oe-' + oppId + '"]');

// Toutes les cartes de la file, toutes pages : obligation et nombre de raisons.
async function toutesLesCartes(page) {
  const premiere = page.locator('#file [data-aller-page="1"]:not([disabled])');
  if (await premiere.count()) { await premiere.first().click(); await page.waitForTimeout(150); }
  const l = [];
  for (let numero = 1; numero <= 40; numero++) {
    l.push.apply(l, await page.$$eval("#file article", function (a) { return a.map(function (x) { return x.dataset.obligation || "action:" + x.dataset.actionId; }); }));
    const suivante = page.locator('#file [data-aller-page="' + (numero + 1) + '"]:not([disabled])');
    if (!(await suivante.count())) break;
    await suivante.first().click();
    await page.waitForTimeout(150);
  }
  return l;
}

// Ouvre le détail d'une carte et retourne la section de la raison demandée.
async function raison(page, c, regle) {
  if ((await c.locator(".iv-action-detail").getAttribute("hidden")) !== null) await c.locator("[data-iv-ouvrir]").click();
  return c.locator('[data-raison="' + regle + '"]');
}

// Ferme la fenêtre ouverte par son bouton de fermeture, puis attend qu'elle soit masquée.
async function fermerFenetre(page) {
  await page.locator('#ia-modale [data-bs-dismiss="modal"]').first().click();
  await page.waitForSelector("#ia-modale", { state: "hidden" });
}

async function messageAffiche(page) {
  const toast = page.locator("#sv-toast [data-toast-texte]");
  await toast.waitFor({ state: "visible" });
  return toast.innerText();
}

async function regles(page, oppId) {
  return page.evaluate(function (id) { return window.Intelligence.actives().filter(function (a) { return a.opportuniteId === id; }).map(function (a) { return a.regle; }).sort(); }, "oe-" + oppId);
}

(async () => {
  const navigateur = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await nouvellePage(navigateur);
  const envois = [];
  page.on("request", function (r) { if (r.method() === "POST") envois.push(new URL(r.url()).pathname); });
  let code = 0;

  try {
    // ---------- Scénario principal ----------
    await connecter(page, SOPHIE);
    const a = await creer(page, "Centre" + suffixe, TACHE);
    await ouvrirCentre(page);
    let c = await carteObligation(page, a.oppId);
    verifier(c !== null && (await c.getAttribute("data-nb-raisons")) === "2" && (await c.innerText()).includes("Prise de contact · 2 raisons"), "une seule carte regroupe les deux raisons (première réponse et suivi)");
    const attendu = await page.evaluate(function (id) {
      const g = window.IntelligenceRegles.regrouperObligations(window.Intelligence.actives()).find(function (x) { return x.id === "contact:" + id; });
      const retard = g.echeance && new Date(g.echeance) < new Date();
      return { priorite: g.priorite, echeance: retard ? "En retard" : window.IntelligenceUI.echeanceTexte(g.echeance), raisons: g.raisons.map(function (r) { return r.id; }) };
    }, "oe-" + a.oppId);
    verifier(await c.locator(".iv-prio-" + attendu.priorite).count() === 1 && (await c.locator(".iv-action-echeance").innerText()) === attendu.echeance,
      "priorité (" + attendu.priorite + ") et échéance la plus proche (« " + attendu.echeance + " ») de l'obligation");
    let s1 = await raison(page, c, "premiere-reponse");
    let s2 = await raison(page, c, "suivi-echeance");
    verifier(await s1.locator('[data-ia="terminer"]').count() === 0 && await s1.locator("[data-declarer-contact]").count() === 1,
      "raison « Première réponse » : pas de « Marquer comme réalisée », mais « Déclarer le contact dans la fiche »");
    verifier(await s2.locator('[data-ia="terminer"]').count() === 1, "raison « Suivi » : « Marquer comme réalisée » (réalisation réelle du suivi)");

    const compteurs = await page.evaluate(function () {
      const moi = window.Prospects.moiId;
      // Fonctionnalité 16 : « à traiter » compte les obligations que le conseiller garde (sans les actions confiées),
      // même ensemble que l'onglet « À traiter » et l'Accueil.
      const recos = window.IntelligenceRegles.actionsGardees(window.Intelligence.actives({ conseiller: moi }));
      return { obligations: window.IntelligenceRegles.regrouperObligations(recos).length, recommandations: recos.length,
        chiffre: Number(document.querySelector('[data-compteur="aTraiter"]').textContent),
        barre: Number((document.querySelector(".ph-nav a .ph-nav-count") || {}).textContent),
        onglet: Number(document.querySelector('[data-champ="nb-file"]').textContent), resultat: document.getElementById("resultat").textContent };
    });
    const cartes = await toutesLesCartes(page);
    verifier(compteurs.chiffre === compteurs.obligations && compteurs.barre === compteurs.obligations && compteurs.onglet === compteurs.obligations && compteurs.recommandations > compteurs.obligations,
      "compteurs « à traiter » (chiffre et barre latérale) = " + compteurs.obligations + " obligations, pour " + compteurs.recommandations + " recommandations");
    verifier(cartes.length === compteurs.onglet && new Set(cartes).size === cartes.length && compteurs.resultat.includes("recommandations"),
      "pagination : " + cartes.length + " cartes, chacune une seule fois ; « " + compteurs.resultat + " »");
    await page.reload(); await page.waitForTimeout(900);
    c = await carteObligation(page, a.oppId);
    verifier(c !== null && (await c.getAttribute("data-action-id")) === attendu.raisons[0] && (await toutesLesCartes(page)).join() === cartes.join(), "après actualisation : même regroupement, même ordre");

    // Scénario A : réaliser le suivi (tâche administrative).
    c = await carteObligation(page, a.oppId);
    s2 = await raison(page, c, "suivi-echeance");
    await Promise.all([page.waitForNavigation(), s2.locator('[data-ia="terminer"]').click()]);
    verifier((await messageAffiche(page)).includes("marqué comme réalisé"), "suivi réalisé (écriture serveur)");
    verifier((await regles(page, a.oppId)).join() === "premiere-reponse", "réévaluation : le suivi disparaît, la première réponse reste (aucun contact déclaré)");
    c = await carte(page, '[data-action-id="premiere-reponse:oe-' + a.oppId + '"]');
    verifier(c !== null && (await c.getAttribute("data-obligation")) === null, "la carte est recalculée avec la seule raison restante (carte simple)");
    if ((await c.locator(".iv-action-detail").getAttribute("hidden")) !== null) await c.locator("[data-iv-ouvrir]").click();
    verifier(await c.locator('[data-ia="terminer"]').count() === 0 && await c.locator("[data-declarer-contact]").count() === 1, "carte restante : « Déclarer le contact dans la fiche », jamais une clôture simulée");
    verifier(sql("SELECT CONCAT(IFNULL(o.ProchaineAction, 'aucune'), ' | ', h.Cloture) FROM OpportunitesVente o JOIN HistoriquesSuiviOpportunite h ON h.OpportuniteId = o.Id WHERE o.Id = " + a.oppId) === "aucune | Realise", "en base : suivi réalisé, historique conservé");

    // Déclarer le contact par la fiche.
    await Promise.all([page.waitForNavigation(), c.locator("[data-declarer-contact]").click()]);
    verifier(new URL(page.url()).pathname === "/Prospects/Fiche/pe-" + a.prospectId, "« Déclarer le contact dans la fiche » ouvre la bonne fiche");
    await noterAppel(page, a.prospectId, a.oppId);
    await ouvrirCentre(page);
    const restantes = await regles(page, a.oppId);
    verifier(restantes.indexOf("premiere-reponse") < 0 && restantes.indexOf("suivi-echeance") < 0, "après l'appel déclaré : la première réponse disparaît (" + (restantes.join(", ") || "aucune autre recommandation") + ")");
    verifier(sql("SELECT CONCAT(Type, ' | ', OpportuniteId) FROM NotesProspect WHERE ProspectId = " + a.prospectId) === "appel | " + a.oppId, "en base : note « appel » liée à l'opportunité");

    // ---------- Scénario B : contact déclaré avant la réalisation du suivi ----------
    const b = await creer(page, "Contact" + suffixe, TACHE);
    await noterAppel(page, b.prospectId, b.oppId);
    await ouvrirCentre(page);
    c = await carte(page, '[data-action-id^="suivi-echeance:oe-' + b.oppId + ':"]');
    const reglesB = await regles(page, b.oppId);
    verifier(reglesB.indexOf("premiere-reponse") < 0 && reglesB.indexOf("suivi-echeance") >= 0 && c !== null, "contact déclaré : la première réponse disparaît, le suivi reste à traiter (" + reglesB.join(", ") + ")");
    if ((await c.locator(".iv-action-detail").getAttribute("hidden")) !== null) await c.locator("[data-iv-ouvrir]").click();
    verifier(await c.locator('[data-ia="terminer"]').count() === 1 && sql("SELECT CONCAT(ProchaineAction, ' | ', (SELECT COUNT(*) FROM HistoriquesSuiviOpportunite WHERE OpportuniteId = " + b.oppId + ")) FROM OpportunitesVente WHERE Id = " + b.oppId) === TACHE + " | 0",
      "aucune réalisation implicite : le suivi est toujours actif en base et réalisable");

    // ---------- Scénario C : report vers le futur ----------
    const r = await creer(page, "Report" + suffixe, TACHE);
    await ouvrirCentre(page);
    c = await carteObligation(page, r.oppId);
    s2 = await raison(page, c, "suivi-echeance");
    await s2.locator(".dropdown-toggle").click();
    await s2.locator('[data-ia="reporter"]').click();
    await page.waitForSelector("#ia-modale.show");
    verifier((await page.locator("#ia-modale-titre").innerText()) === "Reporter le suivi", "« Reporter » de la raison suivi : fenêtre du report enregistré (fonctionnalité 07)");
    await page.fill("#ia-date", jour(4));
    await Promise.all([page.waitForNavigation(), page.click("#ia-modale [data-ia-valider]")]);
    await messageAffiche(page);
    verifier((await regles(page, r.oppId)).join() === "premiere-reponse", "report : la raison de suivi échu disparaît, la première réponse reste");
    await page.goto(BASE_URL + "/Intelligence/Suivis?vue=a-venir"); await page.waitForTimeout(900);
    verifier(await page.evaluate(function (id) { return JSON.parse(document.getElementById("suivis-planifies").textContent).some(function (x) { return x.opportuniteId === id; }); }, "oe-" + r.oppId) &&
      sql("SELECT Cloture FROM HistoriquesSuiviOpportunite WHERE OpportuniteId = " + r.oppId) === "Reporte", "le suivi est dans « À venir », historique « Reporte » en base");

    // ---------- Scénario D : deux opportunités du même client ----------
    const d = await creer(page, "DeuxOpp" + suffixe, TACHE);
    sql("INSERT INTO OpportunitesVente (ProspectId, Titre, Etape, ProchaineAction, DateProchaineAction, DateCreation, DerniereActivite) VALUES (" + d.prospectId + ", 'Deuxième véhicule', 'Nouveau', 'Rappeler pour le deuxième véhicule', TIMESTAMP(CURDATE(), '09:00:00'), NOW(), NOW())");
    const oppB = sql("SELECT Id FROM OpportunitesVente WHERE ProspectId = " + d.prospectId + " AND Titre = 'Deuxième véhicule'");
    await ouvrirCentre(page);
    verifier((await carteObligation(page, d.oppId)) !== null && (await carteObligation(page, oppB)) !== null, "deux opportunités du même client : deux cartes distinctes");
    c = await carteObligation(page, d.oppId);
    s2 = await raison(page, c, "suivi-echeance");
    await Promise.all([page.waitForNavigation(), s2.locator('[data-ia="terminer"]').click()]);
    await messageAffiche(page);
    c = await carteObligation(page, oppB);
    verifier(c !== null && (await c.getAttribute("data-nb-raisons")) === "2", "l'autre opportunité garde ses deux raisons : aucune terminaison en cascade");

    // ---------- Commandes locales sur un dossier réel ----------
    c = await carteObligation(page, oppB);
    s1 = await raison(page, c, "premiere-reponse");
    // Fonctionnalité 15 : sur un dossier réel, « Ignorer », « Commencer » et « Confier » (statuts locaux sans effet en
    // base) ne sont plus proposés ; une explication les remplace dans le menu.
    await s1.locator(".dropdown-toggle").click();
    await s1.locator("[data-statuts-indisponibles]").waitFor({ state: "visible" });
    verifier(await s1.locator('[data-ia="ignorer"], [data-ia="commencer"], [data-ia="transferer"]').count() === 0,
      "« Ignorer », « Commencer » et « Confier » ne sont plus proposés sur un dossier réel ; une explication les remplace");
    // Les commandes enregistrées restent : « Mettre en veille » (fonctionnalité 14) et « Déclarer le contact dans la fiche ».
    verifier(await s1.locator('.dropdown-menu [data-ia="veille"]').count() === 1 && await s1.locator("[data-declarer-contact]").count() === 1,
      "commandes enregistrées toujours proposées : « Mettre en veille » et « Déclarer le contact dans la fiche »");
    verifier(await page.evaluate(function (id) { return window.Intelligence.action("premiere-reponse:oe-" + id).statut; }, oppB) === "ATraiter" &&
      (await carteObligation(page, oppB)) !== null, "l'obligation reste à traiter (aucune commande ne l'a considérée terminée)");
    await s1.locator(".dropdown-toggle").click();
    s1 = await raison(page, await carteObligation(page, oppB), "premiere-reponse");
    await s1.locator('[data-ia="relance"]').click();
    await page.waitForSelector("#ia-modale.show");
    verifier(await page.locator('#ia-modale [data-ia-relance="brouillon"]').count() === 0 && await page.locator('#ia-modale [data-ia-relance="suivi"]').count() === 0 && (await page.locator("#ia-modale").innerText()).includes("Planifier le suivi dans la fiche"),
      "fenêtre de relance d'un dossier réel : ni brouillon ni suivi locaux, le suivi se planifie dans la fiche");
    await fermerFenetre(page);

    // ---------- Données de démonstration ----------
    const avant = envois.length;
    const demo = await page.evaluate(function () {
      const g = window.IntelligenceRegles.regrouperObligations(window.Intelligence.actives());
      const ines = g.filter(function (x) { return x.principale.opportuniteId === "o-ines-cx5"; }).length;
      const local = window.Intelligence.actives().find(function (x) { return x.regle === "premiere-reponse" && String(x.opportuniteId).indexOf("o-") === 0; });
      return { ines: ines, local: local ? local.id : null, commande: local ? window.IntelligenceRegles.commandeRealisation(local) : null };
    });
    verifier(demo.ines === 2 && demo.commande === "realiser-local", "démonstration : rendez-vous et première réponse d'Inès restent deux cartes ; commande locale conservée");
    c = await carte(page, '[data-action-id="' + demo.local + '"]');
    if ((await c.locator(".iv-action-detail").getAttribute("hidden")) !== null) await c.locator("[data-iv-ouvrir]").click();
    verifier(await c.locator('.dropdown-menu [data-ia="ignorer"]').count() === 1 && await c.locator('.dropdown-menu [data-ia="transferer"]').count() === 1 &&
      await c.locator("[data-statuts-indisponibles]").count() === 0, "démonstration : « Ignorer » et « Confier » restent proposés (comportement local conservé)");
    await c.locator('[data-ia="terminer"]').click();
    verifier((await messageAffiche(page)).includes("Action marquée comme réalisée") && envois.length === avant, "démonstration : réalisation locale, aucun envoi au serveur");

    // ---------- Reconnexion ----------
    await page.click('form[action="/Account/Logout"] button[type="submit"]');
    await page.waitForURL(function (url) { return url.pathname.indexOf("/Intelligence") !== 0; });
    await connecter(page, SOPHIE);
    await ouvrirCentre(page);
    verifier((await regles(page, a.oppId)).indexOf("premiere-reponse") < 0 && (await regles(page, r.oppId)).join() === "premiere-reponse" && (await carteObligation(page, oppB)) !== null, "après reconnexion : mêmes obligations");

    // ---------- Isolation ----------
    function creerConseiller(courriel, concession) {
      sql("INSERT INTO AspNetUsers (Id, FirstName, LastName, DealershipId, IsActive, MustChangePassword, CreatedAt, UserName, NormalizedUserName, Email, NormalizedEmail, EmailConfirmed, PasswordHash, SecurityStamp, ConcurrencyStamp, PhoneNumberConfirmed, TwoFactorEnabled, LockoutEnabled, AccessFailedCount) " +
        "SELECT UUID(), 'Autre', 'Conseiller', " + concession + ", 1, 0, NOW(), '" + courriel + "', UPPER('" + courriel + "'), '" + courriel + "', UPPER('" + courriel + "'), 1, PasswordHash, UUID(), UUID(), 0, 0, 1, 0 FROM AspNetUsers WHERE Email = '" + SOPHIE + "'");
      sql("INSERT INTO AspNetUserRoles (UserId, RoleId) SELECT u.Id, x.Id FROM AspNetUsers u, AspNetRoles x WHERE u.Email = '" + courriel + "' AND x.Name = 'Conseiller'");
    }
    sql("UPDATE Dealerships SET IsActive = 1 WHERE Name = 'Garage Saint-Laurent'");
    const collegue = "collegue.centre." + suffixe + "@autoprestige.example";
    const ailleurs = "ailleurs.centre." + suffixe + "@garagestl.example";
    creerConseiller(collegue, "(SELECT DealershipId FROM (SELECT DealershipId FROM AspNetUsers WHERE Email = '" + SOPHIE + "') x)");
    creerConseiller(ailleurs, "(SELECT Id FROM Dealerships WHERE Name = 'Garage Saint-Laurent')");
    for (const courriel of [collegue, ailleurs]) {
      const autre = await nouvellePage(navigateur);
      await connecter(autre, courriel);
      const html = await (await autre.goto(BASE_URL + "/Intelligence")).text();
      await autre.waitForTimeout(800);
      const siennes = await autre.evaluate(function () { return window.Intelligence.actives().filter(function (x) { return String(x.opportuniteId).indexOf("oe-") === 0; }).length; });
      verifier(!html.includes("DeuxOpp" + suffixe) && !html.includes("Centre" + suffixe) && siennes === 0, (courriel === collegue ? "collègue" : "autre concession") + " : aucune obligation de ces dossiers");
    }

    // ---------- Largeurs et thèmes ----------
    for (const [largeur, theme] of [[320, "sombre"], [390, "clair"], [390, "sombre"], [1440, "sombre"]]) {
      const p = await nouvellePage(navigateur, { viewport: { width: largeur, height: 900 } });
      await connecter(p, SOPHIE);
      await ouvrirCentre(p);
      if (theme === "sombre") await p.evaluate(function () { document.documentElement.dataset.theme = "sombre"; });
      const k = await carteObligation(p, oppB);
      await k.locator("[data-iv-ouvrir]").click();
      await p.waitForTimeout(300);
      await k.scrollIntoViewIfNeeded();
      const debord = await p.evaluate(function () { return document.documentElement.scrollWidth - document.documentElement.clientWidth; });
      await k.screenshot({ path: "centre-carte-" + largeur + "-" + theme + ".png" });
      verifier(debord === 0, largeur + " px, thème " + theme + " : carte regroupée ouverte, aucun défilement horizontal");
    }

    console.log("\nParcours du Centre d'actions réussi (" + etape + " vérifications).");
  } catch (erreur) {
    console.error("\n" + erreur.message);
    await page.screenshot({ path: "e2e-centre-echec.png" });
    code = 1;
  } finally {
    await navigateur.close();
  }
  process.exit(code);
})();
