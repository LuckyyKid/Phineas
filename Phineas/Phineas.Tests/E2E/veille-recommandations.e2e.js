// Test de bout en bout : mise en veille persistante et réversible d'une recommandation (fonctionnalité 14), sur
// l'application réelle et MySQL. La veille est enregistrée en base, retrouvée après actualisation et reconnexion,
// réactivable, et n'est jamais une réalisation : ni « Réalisé » dans l'historique, ni note, ni suivi modifié.
// Chaque dossier réel du test reçoit une date de création reculée de quelques jours (base jetable) : sa première
// réponse est en retard (Urgent), donc une priorité de l'Accueil selon le moteur, sans passer devant les dossiers plus
// anciens des autres parcours (accueil-priorites.e2e.js suppose les siens en tête). L'ordre des parcours est donc libre.
// Prérequis et variables : les mêmes que modification-prospect.e2e.js (BASE_URL, CHROMIUM_PATH, MYSQL_CONTAINER, E2E_DB).
// Lancement : node veille-recommandations.e2e.js   (le paquet « playwright » doit être installé)
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
const JOUR = 86400000;
let recul = 2;

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

async function planifier(page, prospectId, action, decalage) {
  await page.goto(BASE_URL + "/Prospects/Fiche/pe-" + prospectId);
  await page.waitForTimeout(600);
  await page.click('[data-action="suivi"]');
  await page.waitForSelector("#modal-suivi.show");
  await page.fill("#s-action", action);
  await page.fill("#s-date", jour(decalage));
  await Promise.all([page.waitForNavigation(), page.click('#form-suivi button[type="submit"]')]);
}

// Prospect réel (« Nouveau ») avec un suivi du jour : première réponse en retard et suivi échu, une prise de contact.
async function creer(page, nom) {
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
  recul += 1;
  sql("UPDATE OpportunitesVente SET DateCreation = DATE_SUB(NOW(), INTERVAL " + recul + " DAY) WHERE Id = " + ids[1]);
  await planifier(page, ids[0], TACHE, 0);
  return { prospectId: ids[0], oppId: ids[1], cle: "premiere-reponse:oe-" + ids[1] };
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

async function centre(page) {
  await page.goto(BASE_URL + "/Intelligence");
  await page.waitForTimeout(900);
}

// Ligne de la file « À traiter » d'une opportunité (pagination parcourue depuis la page 1), ou null.
async function ligneFile(page, oppId) {
  const selecteur = '#file article[data-obligation="contact:oe-' + oppId + '"], #file article[data-action-id$=":oe-' + oppId + '"], #file article[data-action-id*=":oe-' + oppId + ':"]';
  const premiere = page.locator('#file [data-aller-page="1"]:not([disabled])');
  if (await premiere.count()) { await premiere.first().click(); await page.waitForTimeout(150); }
  for (let n = 1; n <= 30; n++) {
    const l = page.locator(selecteur);
    if (await l.count()) return l.first();
    const suivante = page.locator('#file [data-aller-page="' + (n + 1) + '"]:not([disabled])');
    if (!(await suivante.count())) return null;
    await suivante.first().click();
    await page.waitForTimeout(150);
  }
  return null;
}

// Recommandations présentées (statut, sans les veilles) et en veille, pour une opportunité.
async function etat(page, oppId) {
  return page.evaluate(function (id) {
    const I = window.Intelligence;
    return {
      presentees: I.actives().filter(function (a) { return a.opportuniteId === id; }).map(function (a) { return a.regle; }).sort(),
      enVeille: I.enVeille().filter(function (a) { return a.opportuniteId === id; }).map(function (a) { return a.regle; }).sort(),
    };
  }, "oe-" + oppId);
}

// L'obligation de cette opportunité fait-elle partie des priorités de l'Accueil (règle du moteur, sans limite) ?
async function prioriteAccueil(page, oppId) {
  return page.evaluate(function (id) {
    const actions = window.Intelligence.actives({ conseiller: window.Prospects.moiId }).filter(function (a) { return !a.assignation; });
    return window.IntelligenceRegles.prioritesAccueil(actions, new Date(), 1000).filter(function (g) {
      return g.raisons.some(function (r) { return r.opportuniteId === id; });
    }).map(function (g) { return g.raisons.map(function (r) { return r.regle; }).sort().join("+"); });
  }, "oe-" + oppId);
}

async function messageAffiche(page) {
  const toast = page.locator("#sv-toast [data-toast-texte]");
  await toast.waitFor({ state: "visible" });
  return toast.innerText();
}

// Ouvre la fenêtre « Mettre en veille » de la raison « Première réponse » depuis le Centre, choisit la durée, envoie.
async function mettreEnVeille(page, d, jours) {
  await centre(page);
  const l = await ligneFile(page, d.oppId);
  await l.locator("[data-iv-ouvrir]").first().click();
  const raison = l.locator('[data-raison="premiere-reponse"]');
  await raison.locator(".dropdown-toggle").click();
  await raison.locator('[data-ia="veille"]').click();
  await page.waitForSelector(".modal.show #ia-duree");
  await page.selectOption("#ia-duree", String(jours));
  await Promise.all([page.waitForNavigation(), page.click(".modal.show [data-ia-valider]")]);
}

function veilles(oppId) {
  return sql("SELECT CONCAT(CleRecommandation, '|', IFNULL(CleActive, 'close'), '|', IF(ReactiveeLeUtc IS NULL, 'non', 'reactivee'), '|', ROUND(TIMESTAMPDIFF(MINUTE, DebutUtc, FinUtc) / 60)) FROM VeillesRecommandation WHERE OpportuniteId = " + oppId + " ORDER BY Id");
}
function dossier(oppId) {
  return sql("SELECT CONCAT(IFNULL(o.ProchaineAction, 'aucune'), '|', o.Etape, '|', (SELECT COUNT(*) FROM HistoriquesSuiviOpportunite h WHERE h.OpportuniteId = o.Id), '|', (SELECT COUNT(*) FROM NotesProspect n WHERE n.ProspectId = o.ProspectId)) FROM OpportunitesVente o WHERE o.Id = " + oppId);
}

(async () => {
  const navigateur = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await nouvellePage(navigateur);
  const erreurs = [];
  page.on("pageerror", function (e) {
    // Transition entre pages (@view-transition, lumiere.css) interrompue par une navigation rapide du test :
    // message du navigateur, sans lien avec le code de la page.
    if (e.message.indexOf("ViewTransition") >= 0) return;
    erreurs.push(e.message);
  });
  let code = 0;

  try {
    // ---------- Démonstration : comportement local inchangé ----------
    await connecter(page, SOPHIE);
    await centre(page);
    const demo = await page.evaluate(function () {
      const a = window.Intelligence.actives().find(function (x) { return x.regle === "premiere-reponse" && String(x.opportuniteId).indexOf("o-") === 0; });
      return a ? a.id : null;
    });
    const menuDemo = await page.evaluate(function (id) {
      const b = document.querySelectorAll('[data-id="' + id + '"]');
      return [].slice.call(b).map(function (x) { return x.getAttribute("data-ia"); });
    }, demo);
    verifier(demo && menuDemo.indexOf("veille") < 0, "dossier de démonstration : pas de « Mettre en veille » enregistrée, le report reste local");

    // ---------- Parcours principal ----------
    const a = await creer(page, "Veille" + suffixe);
    const avantDossier = dossier(a.oppId);
    await page.goto(BASE_URL + "/Conseiller"); await page.waitForTimeout(900);
    const accueilAvant = (await prioriteAccueil(page, a.oppId)).join() === "premiere-reponse+suivi-echeance";
    await centre(page);
    verifier(accueilAvant && (await etat(page, a.oppId)).presentees.join() === "premiere-reponse,suivi-echeance", "dossier réel : priorité de l'Accueil, deux raisons présentées au Centre");
    const avant = await page.evaluate(function () { return window.Intelligence.compteurs(window.Prospects.moiId); });

    await mettreEnVeille(page, a, 3);
    verifier((await messageAffiche(page)) === "Recommandation mise en veille pour 3 jours. Elle n'est pas marquée comme réalisée : le dossier ne change pas.", "confirmation du serveur");
    let e = await etat(page, a.oppId);
    verifier(e.presentees.join() === "suivi-echeance" && e.enVeille.join() === "premiere-reponse", "seule la première réponse est en veille ; le suivi reste présenté");
    const ligne = await ligneFile(page, a.oppId);
    verifier(ligne && (await ligne.getAttribute("data-nb-raisons")) === null && (await ligne.getAttribute("data-action-id")).indexOf("suivi-echeance:") === 0, "la carte regroupée se recalcule : une seule raison, le suivi");
    const apres = await page.evaluate(function () { return window.Intelligence.compteurs(window.Prospects.moiId); });
    verifier(apres.aTraiter === avant.aTraiter && apres.enVeille === avant.enVeille + 1 && apres.terminees === avant.terminees,
      "compteurs : l'obligation reste à traiter (suivi), « en veille » + 1, « terminées » inchangé");
    verifier(await page.evaluate(function (cle) { return window.Intelligence.action(cle).statut; }, a.cle) === "EnVeille", "statut « En veille », pas « Terminée »");
    verifier(veilles(a.oppId) === a.cle + "|" + a.cle + "|non|72" && dossier(a.oppId) === avantDossier, "en base : une veille de 72 h ; suivi, étape, historique et notes inchangés");
    await page.goto(BASE_URL + "/Conseiller"); await page.waitForTimeout(900);
    verifier((await prioriteAccueil(page, a.oppId)).length === 0,
      "Accueil : la première réponse en veille n'est plus une priorité immédiate (le suivi du jour, Normal, n'en est pas une)");

    await centre(page);
    await page.reload(); await page.waitForTimeout(900);
    verifier((await etat(page, a.oppId)).enVeille.join() === "premiere-reponse", "après actualisation : toujours en veille");
    await page.click('form[action="/Account/Logout"] button[type="submit"]');
    await page.waitForURL(function (url) { return url.pathname.indexOf("/Intelligence") !== 0; });
    await connecter(page, SOPHIE);
    await centre(page);
    verifier((await etat(page, a.oppId)).enVeille.join() === "premiere-reponse", "après reconnexion : toujours en veille");

    await page.click("#onglet-reportees");
    const zone = page.locator('#veilles article[data-action-id="' + a.cle + '"]');
    await zone.locator("[data-iv-ouvrir]").click();
    const texte = await zone.locator("[data-veille-texte]").innerText();
    verifier(texte.indexOf("En veille jusqu'au") >= 0 && texte.indexOf("Ce n'est pas une réalisation") >= 0 &&
      (await page.locator('[data-champ="nb-veilles"]').innerText()) !== "0", "onglet « En veille et reportées » : jusqu'à quand, et que ce n'est pas une réalisation");

    await Promise.all([page.waitForNavigation(), zone.locator('.iv-action-boutons [data-ia="reactiver-veille"]').click()]);
    verifier((await messageAffiche(page)).indexOf("Recommandation réactivée") === 0, "réactivation confirmée par le serveur");
    e = await etat(page, a.oppId);
    verifier(e.presentees.join() === "premiere-reponse,suivi-echeance" && e.enVeille.length === 0, "la recommandation réapparaît (sa règle s'applique toujours)");
    verifier(veilles(a.oppId) === a.cle + "|close|reactivee|72" && dossier(a.oppId) === avantDossier, "en base : veille réactivée, dossier toujours inchangé");

    // ---------- Expiration (horloge du navigateur avancée) ----------
    const x = await creer(page, "Expire" + suffixe);
    await mettreEnVeille(page, x, 1);
    await messageAffiche(page);
    const horloge = await nouvellePage(navigateur);
    await horloge.clock.install({ time: new Date(Date.now() + 2 * JOUR) });
    await connecter(horloge, SOPHIE);
    await centre(horloge);
    e = await etat(horloge, x.oppId);
    verifier(e.enVeille.length === 0 && e.presentees.indexOf("premiere-reponse") >= 0 && veilles(x.oppId).indexOf("|non|24") > 0,
      "après la fin prévue (horloge + 2 jours) : la recommandation revient, sans écriture ni réalisation");
    await horloge.context().close();

    // Expiration côté serveur : fin dépassée dans la base jetable, horloge réelle du navigateur.
    sql("UPDATE VeillesRecommandation SET FinUtc = DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 1 MINUTE) WHERE OpportuniteId = " + x.oppId + " AND CleActive IS NOT NULL");
    await centre(page);
    e = await etat(page, x.oppId);
    const transmises = await page.evaluate(function () { return JSON.parse(document.getElementById("intelligence-donnees").textContent).donnees.veilles.map(function (v) { return v.cle; }); });
    verifier(e.enVeille.length === 0 && e.presentees.indexOf("premiere-reponse") >= 0 && transmises.indexOf(x.cle) < 0,
      "expiration serveur (fin dépassée en base) : veille plus transmise, la recommandation réapparaît");
    await mettreEnVeille(page, x, 3);
    verifier((await messageAffiche(page)).indexOf("mise en veille pour 3 jours") >= 0 && (await etat(page, x.oppId)).enVeille.join() === "premiere-reponse",
      "nouvelle mise en veille de la même recommandation : acceptée (l'index unique ne bloque pas)");
    // La première veille a sa fin avancée dans le passé (ci-dessus) : on ne compare pas sa durée.
    const lignesX = veilles(x.oppId).split(String.fromCharCode(10));
    verifier(lignesX.length === 2 && lignesX[0].indexOf(x.cle + "|close|non|") === 0 && lignesX[1] === x.cle + "|" + x.cle + "|non|72",
      "en base : l'ancienne veille close (expirée, non réactivée), une seule veille ouverte");

    // ---------- Deux opportunités du même prospect ----------
    const m = await creer(page, "DeuxOpp" + suffixe);
    sql("INSERT INTO OpportunitesVente (ProspectId, Titre, Etape, DateCreation, DerniereActivite) VALUES ((SELECT ProspectId FROM (SELECT ProspectId FROM OpportunitesVente WHERE Id = " + m.oppId + ") t), 'Deuxième véhicule', 'Nouveau', DATE_SUB(NOW(), INTERVAL 3 DAY), NOW())");
    const oppB = sql("SELECT MAX(Id) FROM OpportunitesVente WHERE Titre = 'Deuxième véhicule'");
    await mettreEnVeille(page, m, 7);
    await messageAffiche(page);
    verifier((await etat(page, oppB)).presentees.join() === "premiere-reponse" && (await etat(page, m.oppId)).enVeille.join() === "premiere-reponse",
      "deux opportunités : la veille de l'une laisse la première réponse de l'autre présentée");

    // ---------- Suivi réalisé puis reporté pendant la veille ----------
    const s = await creer(page, "Pendant" + suffixe);
    await mettreEnVeille(page, s, 3);
    await messageAffiche(page);
    const l = await ligneFile(page, s.oppId);
    await l.locator("[data-iv-ouvrir]").first().click();
    await Promise.all([page.waitForNavigation(), l.locator('[data-ia="terminer"]').click()]);
    await messageAffiche(page);
    e = await etat(page, s.oppId);
    verifier(e.presentees.length === 0 && e.enVeille.join() === "premiere-reponse" && sql("SELECT GROUP_CONCAT(Cloture) FROM HistoriquesSuiviOpportunite WHERE OpportuniteId = " + s.oppId) === "Realise",
      "suivi réalisé pendant la veille : un seul « Réalisé » (le suivi), la veille de la première réponse reste");
    await planifier(page, s.prospectId, TACHE, 0);
    await planifier(page, s.prospectId, TACHE, 4); // même action, autre date : report
    await centre(page);
    verifier((await etat(page, s.oppId)).enVeille.join() === "premiere-reponse" && sql("SELECT GROUP_CONCAT(Cloture ORDER BY Id) FROM HistoriquesSuiviOpportunite WHERE OpportuniteId = " + s.oppId) === "Realise,Reporte",
      "suivi reporté pendant la veille : la veille ne bouge pas, l'historique du suivi est le sien");

    // ---------- Recommandation devenue obsolète ----------
    await noterAppel(page, s.prospectId, s.oppId);
    await centre(page);
    e = await etat(page, s.oppId);
    verifier(e.enVeille.length === 0 && e.presentees.indexOf("premiere-reponse") < 0 && veilles(s.oppId).split("\n").length === 1,
      "contact déclaré : la première réponse disparaît, ne revient pas et n'est plus listée en veille ; aucune écriture de veille");

    // ---------- Double soumission et page périmée ----------
    const d = await creer(page, "Double" + suffixe);
    await centre(page);
    const jeton = await page.locator('input[name="__RequestVerificationToken"]').first().inputValue();
    const formulaire = { cle: d.cle, jours: "3", etape: "Nouveau", retour: "/Intelligence", __RequestVerificationToken: jeton };
    await Promise.all([
      page.request.post(BASE_URL + "/Intelligence/MettreEnVeille", { form: formulaire, maxRedirects: 0 }),
      page.request.post(BASE_URL + "/Intelligence/MettreEnVeille", { form: formulaire, maxRedirects: 0 }),
    ]);
    verifier(sql("SELECT COUNT(*) FROM VeillesRecommandation WHERE OpportuniteId = " + d.oppId + " AND CleActive IS NOT NULL") === "1", "double soumission : une seule veille ouverte");

    const p = await creer(page, "Perime" + suffixe);
    const ancienne = await nouvellePage(navigateur);
    await connecter(ancienne, SOPHIE);
    await centre(ancienne);
    sql("UPDATE OpportunitesVente SET Etape = 'AQualifier' WHERE Id = " + p.oppId); // changement d'étape ailleurs
    const lp = await ligneFile(ancienne, p.oppId);
    await lp.locator("[data-iv-ouvrir]").first().click();
    await lp.locator('[data-raison="premiere-reponse"] .dropdown-toggle').click();
    await lp.locator('[data-raison="premiere-reponse"] [data-ia="veille"]').click();
    await ancienne.waitForSelector(".modal.show #ia-duree");
    await Promise.all([ancienne.waitForNavigation(), ancienne.click(".modal.show [data-ia-valider]")]);
    verifier((await messageAffiche(ancienne)).indexOf("Le dossier a changé entre-temps") >= 0 && veilles(p.oppId) === "", "page périmée : refus expliqué, aucune veille");
    await ancienne.context().close();

    // ---------- Collègue et autre concession ----------
    function creerConseiller(courriel, concession) {
      sql("INSERT INTO AspNetUsers (Id, FirstName, LastName, DealershipId, IsActive, MustChangePassword, CreatedAt, UserName, NormalizedUserName, Email, NormalizedEmail, EmailConfirmed, PasswordHash, SecurityStamp, ConcurrencyStamp, PhoneNumberConfirmed, TwoFactorEnabled, LockoutEnabled, AccessFailedCount) " +
        "SELECT UUID(), 'Autre', 'Conseiller', " + concession + ", 1, 0, NOW(), '" + courriel + "', UPPER('" + courriel + "'), '" + courriel + "', UPPER('" + courriel + "'), 1, PasswordHash, UUID(), UUID(), 0, 0, 1, 0 FROM AspNetUsers WHERE Email = '" + SOPHIE + "'");
      sql("INSERT INTO AspNetUserRoles (UserId, RoleId) SELECT u.Id, r.Id FROM AspNetUsers u, AspNetRoles r WHERE u.Email = '" + courriel + "' AND r.Name = 'Conseiller'");
    }
    sql("UPDATE Dealerships SET IsActive = 1 WHERE Name = 'Garage Saint-Laurent'");
    const collegue = "collegue.veille." + suffixe + "@autoprestige.example";
    const ailleurs = "ailleurs.veille." + suffixe + "@garagestl.example";
    creerConseiller(collegue, "(SELECT DealershipId FROM (SELECT DealershipId FROM AspNetUsers WHERE Email = '" + SOPHIE + "') x)");
    creerConseiller(ailleurs, "(SELECT Id FROM Dealerships WHERE Name = 'Garage Saint-Laurent')");
    const avantIsolation = veilles(m.oppId);
    for (const courriel of [collegue, ailleurs]) {
      const autre = await nouvellePage(navigateur);
      await connecter(autre, courriel);
      const html = await (await autre.goto(BASE_URL + "/Intelligence")).text();
      const jetonAutre = await autre.locator('input[name="__RequestVerificationToken"]').first().inputValue();
      const poser = await autre.request.post(BASE_URL + "/Intelligence/MettreEnVeille", { form: { cle: m.cle, jours: "14", etape: "Nouveau", retour: "/Intelligence", __RequestVerificationToken: jetonAutre }, maxRedirects: 0 });
      const lever = await autre.request.post(BASE_URL + "/Intelligence/ReactiverVeille", { form: { cle: m.cle, retour: "/Intelligence", __RequestVerificationToken: jetonAutre }, maxRedirects: 0 });
      verifier(html.indexOf(m.cle) < 0 && poser.status() === 404 && lever.status() === 404 && veilles(m.oppId) === avantIsolation,
        (courriel === collegue ? "collègue" : "autre concession") + " : veille invisible, ni posée ni réactivée (404), rien n'a changé");
      await autre.context().close();
    }

    // ---------- Largeurs et thèmes ----------
    for (const [largeur, theme] of [[320, "clair"], [320, "sombre"], [390, "clair"], [390, "sombre"], [1440, "clair"], [1440, "sombre"]]) {
      const v = await nouvellePage(navigateur, { viewport: { width: largeur, height: 900 } });
      await connecter(v, SOPHIE);
      await centre(v);
      if (theme === "sombre") await v.evaluate(function () { document.documentElement.dataset.theme = "sombre"; });
      await v.click("#onglet-reportees");
      const z = v.locator('#veilles article[data-action-id="' + m.cle + '"]');
      await z.locator("[data-iv-ouvrir]").click();
      const reactiver = z.locator('.iv-action-boutons [data-ia="reactiver-veille"]');
      await reactiver.scrollIntoViewIfNeeded(); await v.waitForTimeout(80);
      const cliquable = await reactiver.evaluate(function (x) { const w = document.documentElement.clientWidth, r = x.getBoundingClientRect(); const d = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return r.width > 0 && r.left >= 0 && r.right <= w + 0.5 && !!d && (d === x || x.contains(d)); });
      const debord = await v.evaluate(function () { return document.documentElement.scrollWidth - document.documentElement.clientWidth; });
      await z.screenshot({ path: "veille-" + largeur + "-" + theme + ".png" });
      // Fenêtre « Mettre en veille » d'un autre dossier encore présenté.
      await v.click("#onglet-file");
      const lv = await ligneFile(v, oppB);
      await lv.locator("[data-iv-ouvrir]").first().click();
      await lv.locator(".dropdown-toggle").first().click();
      await lv.locator('[data-ia="veille"]').first().click();
      await v.waitForSelector(".modal.show #ia-duree");
      const debordFenetre = await v.evaluate(function () { const m = document.querySelector(".modal.show .modal-dialog").getBoundingClientRect(); return document.documentElement.scrollWidth - document.documentElement.clientWidth + (m.right > document.documentElement.clientWidth + 0.5 ? 1 : 0); });
      await v.locator(".modal.show .modal-dialog").screenshot({ path: "veille-fenetre-" + largeur + "-" + theme + ".png" });
      verifier(debord === 0 && cliquable && debordFenetre === 0, largeur + " px, thème " + theme + " : veille lisible, « Réactiver » cliquable, fenêtre sans débordement");
      await v.context().close();
    }

    verifier(erreurs.length === 0, "aucune erreur JavaScript (" + JSON.stringify(erreurs) + ")");
    console.log("\nParcours de mise en veille réussi (" + etape + " vérifications).");
  } catch (erreur) {
    console.error("\n" + erreur.message);
    await page.screenshot({ path: "e2e-veille-echec.png" });
    code = 1;
  } finally {
    await navigateur.close();
  }
  process.exit(code);
})();
