// Test de bout en bout : carte « Priorité » de l'Accueil vendeur (fonctionnalité 13), sur l'application réelle et MySQL.
// Mêmes règles que le Centre d'actions : un suivi réel se réalise en base (route existante), une première réponse réelle
// renvoie à la fiche, une carte de démonstration reste une simulation locale. Aucune carte n'est « terminée » sur
// l'Accueil sans opération confirmée par le serveur.
// Les cartes de démonstration occupent souvent les 3 places : chaque dossier réel du test reçoit une date de création
// plus ancienne (base jetable), pour que sa première réponse soit en retard (Urgent) et passe en tête.
// Prérequis et variables : les mêmes que modification-prospect.e2e.js (BASE_URL, CHROMIUM_PATH, MYSQL_CONTAINER, E2E_DB).
// Lancement : node accueil-priorites.e2e.js   (le paquet « playwright » doit être installé)
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
let recul = 30; // jours de recul de la demande, augmentés à chaque dossier pour qu'il passe en tête

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

// Prospect réel (« Nouveau ») avec un suivi du jour ; sa demande est reculée pour passer en tête des priorités.
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
  recul += 10;
  sql("UPDATE OpportunitesVente SET DateCreation = DATE_SUB(NOW(), INTERVAL " + recul + " DAY) WHERE Id = " + ids[1]);
  await planifier(page, ids[0], TACHE, 0);
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

async function accueil(page) {
  await page.goto(BASE_URL + "/Conseiller");
  await page.waitForTimeout(900);
}

// Carte « Priorité » d'une opportunité (cartes masquées comprises) : obligation, raisons, commandes ; null si absente.
async function carte(page, oppId) {
  return page.evaluate(function (id) {
    const a = [].slice.call(document.querySelectorAll("#ph-focus [data-priorite]")).find(function (x) {
      return x.dataset.obligation === "contact:" + id || x.dataset.actionId.indexOf(id + ":") >= 0 || x.dataset.actionId.endsWith(id);
    });
    if (!a) return null;
    return { obligation: a.dataset.obligation, visible: !a.hidden, type: a.querySelector(".ph-focus-type").innerText,
      commandes: [].slice.call(a.querySelectorAll(".ph-focus-actions [data-realiser-suivi], .ph-focus-actions [data-declarer-contact], .ph-focus-actions [data-valider], .ph-focus-actions [data-ouvrir-dossier]")).map(function (x) {
        return x.hasAttribute("data-realiser-suivi") ? "realiser-serveur" : x.hasAttribute("data-declarer-contact") ? "declarer-contact" : x.hasAttribute("data-valider") ? "realiser-local" : "aucune";
      }) };
  }, "oe-" + oppId);
}

async function regles(page, oppId) {
  return page.evaluate(function (id) { return window.Intelligence.actives().filter(function (a) { return a.opportuniteId === id; }).map(function (a) { return a.regle; }).sort(); }, "oe-" + oppId);
}

async function messageAffiche(page) {
  const toast = page.locator("#sv-toast [data-toast-texte]");
  await toast.waitFor({ state: "visible" });
  return toast.innerText();
}

(async () => {
  const navigateur = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await nouvellePage(navigateur);
  const envois = [];
  page.on("request", function (r) { if (r.method() === "POST") envois.push(new URL(r.url()).pathname); });
  let code = 0;

  try {
    await connecter(page, SOPHIE);
    // Les cartes de démonstration occupent les places tant qu'aucun dossier réel n'est en retard : vérifiées d'abord.
    // ---------- Démonstration ----------
    await accueil(page);
    const avant = envois.length;
    const demo = await page.evaluate(function () {
      const a = [].slice.call(document.querySelectorAll("#ph-focus [data-priorite]")).find(function (x) { return x.querySelector("[data-valider]"); });
      return a ? { obligation: a.dataset.obligation, type: a.querySelector(".ph-focus-type").innerText } : null;
    });
    const carteDemo = page.locator('#ph-focus [data-priorite][data-obligation="' + demo.obligation + '"]');
    for (let i = 0; i < 3 && await carteDemo.isHidden(); i++) await page.locator("#ph-focus [data-priorite]:not([hidden]) [data-plus-tard]").click();
    await carteDemo.locator("[data-valider]").click();
    verifier(demo.type.includes("Démonstration") && (await messageAffiche(page)).includes("démonstration, rien n'est enregistré") && envois.length === avant,
      "carte de démonstration : signalée, réalisée localement, aucun envoi au serveur");


    // ---------- Scénario principal ----------
    const a = await creer(page, "Accueil" + suffixe);
    await accueil(page);
    let c = await carte(page, a.oppId);
    const attendues = await page.evaluate(function () {
      return window.IntelligenceRegles.prioritesAccueil(window.Intelligence.actives({ conseiller: window.Prospects.moiId }).filter(function (x) { return !x.assignation; }), new Date(), 3).map(function (g) { return g.id; });
    });
    const affichees = await page.$$eval("#ph-focus [data-priorite]", function (l) { return l.map(function (x) { return x.dataset.obligation; }); });
    verifier(affichees.join() === attendues.join() && affichees[0] === "contact:oe-" + a.oppId, "la carte « Priorité » montre les obligations du moteur, le dossier réel en tête");
    verifier(c.visible && c.type.includes("Prise de contact · 2 raisons") && c.commandes.join() === "declarer-contact,realiser-serveur",
      "une carte pour la prise de contact (2 raisons) : « Déclarer le contact dans la fiche » et « Marquer le suivi comme réalisé », aucune clôture locale");
    const badge = await page.evaluate(function () { return { barre: Number(document.querySelector(".ph-nav .ph-nav-count").textContent), obligations: window.Intelligence.compteurs(window.Prospects.moiId).aTraiter }; });
    verifier(badge.barre === badge.obligations, "compteur de la barre latérale = obligations à traiter (" + badge.barre + "), comme sur le Centre d'actions");

    // Réalisation du suivi au clavier : la commande reçoit le focus, Entrée l'active.
    const bouton = page.locator('#ph-focus [data-realiser-suivi="oe-' + a.oppId + '"]');
    await bouton.focus();
    verifier(await bouton.evaluate(function (x) { return document.activeElement === x; }), "clavier : la commande « Marquer le suivi comme réalisé » reçoit le focus");
    await Promise.all([page.waitForNavigation(), page.keyboard.press("Enter")]);
    verifier(new URL(page.url()).pathname === "/Conseiller" && (await messageAffiche(page)).includes("marqué comme réalisé"), "confirmation du serveur, retour à l'Accueil");
    await page.reload(); await page.waitForTimeout(900);
    c = await carte(page, a.oppId);
    verifier(c && c.commandes.join() === "declarer-contact", "après actualisation : le suivi n'est plus actif ; la première réponse reste, avec « Déclarer le contact dans la fiche »");
    await page.goto(BASE_URL + "/Intelligence"); await page.waitForTimeout(900);
    verifier((await regles(page, a.oppId)).join() === "premiere-reponse", "Centre d'actions : la première réponse reste, plus de suivi à réaliser");
    await page.goto(BASE_URL + "/Intelligence/Suivis"); await page.waitForTimeout(900);
    verifier(await page.locator('#relances [data-realiser-suivi="oe-' + a.oppId + '"]').count() === 0, "« Mes suivis » : le suivi n'est plus à faire");
    await page.goto(BASE_URL + "/Prospects/Fiche/pe-" + a.prospectId); await page.click("#onglet-historique"); await page.waitForTimeout(400);
    verifier((await page.locator('#panneau-historique [data-zone="timeline"]').innerText()).includes("Suivi réalisé"), "fiche : historique « Suivi réalisé »");
    verifier(sql("SELECT CONCAT(IFNULL(o.ProchaineAction, 'aucune'), ' | ', h.Cloture, ' | ', (SELECT COUNT(*) FROM NotesProspect WHERE ProspectId = o.ProspectId)) FROM OpportunitesVente o JOIN HistoriquesSuiviOpportunite h ON h.OpportuniteId = o.Id WHERE o.Id = " + a.oppId) === "aucune | Realise | 0",
      "en base : suivi réalisé, historique, aucune note de contact créée");
    await page.click('form[action="/Account/Logout"] button[type="submit"]');
    await page.waitForURL(function (url) { return url.pathname.indexOf("/Prospects") !== 0; });
    await connecter(page, SOPHIE);
    await accueil(page);
    c = await carte(page, a.oppId);
    verifier(c && c.commandes.join() === "declarer-contact", "après reconnexion : même état");

    // Déclarer le contact depuis la carte : la fiche, puis une note « Appel effectué ».
    await Promise.all([page.waitForNavigation(), page.locator('#ph-focus [data-declarer-contact]').first().click()]);
    verifier(new URL(page.url()).pathname === "/Prospects/Fiche/pe-" + a.prospectId, "« Déclarer le contact dans la fiche » ouvre la bonne fiche (aucune clôture depuis la carte)");
    await noterAppel(page, a.prospectId, a.oppId);
    await accueil(page);
    verifier((await carte(page, a.oppId)) === null && (await regles(page, a.oppId)).indexOf("premiere-reponse") < 0, "après l'appel déclaré : plus de priorité pour ce dossier");

    // ---------- Contact déclaré avant la réalisation du suivi ----------
    const b = await creer(page, "Contact" + suffixe);
    await noterAppel(page, b.prospectId, b.oppId);
    await accueil(page);
    const cb = await carte(page, b.oppId);
    verifier((cb === null || cb.commandes.indexOf("declarer-contact") < 0) && (await regles(page, b.oppId)).indexOf("suivi-echeance") >= 0 &&
      sql("SELECT CONCAT(ProchaineAction, ' | ', (SELECT COUNT(*) FROM HistoriquesSuiviOpportunite WHERE OpportuniteId = " + b.oppId + ")) FROM OpportunitesVente WHERE Id = " + b.oppId) === TACHE + " | 0",
      "contact déclaré : la première réponse disparaît de l'Accueil, le suivi reste actif (aucune réalisation implicite)");

    // ---------- Suivi réalisé depuis le Centre, puis Accueil ----------
    const d = await creer(page, "Centre" + suffixe);
    await page.goto(BASE_URL + "/Intelligence"); await page.waitForTimeout(900);
    const k = page.locator('#file article[data-obligation="contact:oe-' + d.oppId + '"]');
    for (let n = 1; n <= 30 && !(await k.count()); n++) { const sv = page.locator('#file [data-aller-page="' + (n + 1) + '"]:not([disabled])'); if (!(await sv.count())) break; await sv.first().click(); await page.waitForTimeout(150); }
    await k.locator("[data-iv-ouvrir]").click();
    await Promise.all([page.waitForNavigation(), k.locator('[data-raison="suivi-echeance"] [data-ia="terminer"]').click()]);
    await messageAffiche(page);
    await accueil(page);
    verifier((await carte(page, d.oppId)).commandes.join() === "declarer-contact", "réalisé depuis le Centre : l'Accueil ne propose plus de réaliser ce suivi");

    // ---------- Report vers le futur ----------
    const r = await creer(page, "Report" + suffixe);
    await page.goto(BASE_URL + "/Prospects/Fiche/pe-" + r.prospectId); await page.waitForTimeout(500);
    await planifier(page, r.prospectId, TACHE, 4); // même action, autre date : report (fonctionnalité 07)
    await accueil(page);
    verifier((await carte(page, r.oppId)).commandes.join() === "declarer-contact" && sql("SELECT Cloture FROM HistoriquesSuiviOpportunite WHERE OpportuniteId = " + r.oppId) === "Reporte",
      "report au futur : le suivi n'est plus présenté comme échu sur l'Accueil ; historique « Reporte »");
    await page.goto(BASE_URL + "/Intelligence/Suivis?vue=a-venir"); await page.waitForTimeout(800);
    verifier(await page.locator('#a-venir [data-suivi="oe-' + r.oppId + '"]').count() + (await page.evaluate(function (id) { return JSON.parse(document.getElementById("suivis-planifies").textContent).filter(function (s) { return s.opportuniteId === id; }).length; }, "oe-" + r.oppId)) >= 1,
      "le suivi reporté est dans « À venir »");

    // ---------- Deux opportunités du même prospect ----------
    const m = await creer(page, "DeuxOpp" + suffixe);
    sql("INSERT INTO OpportunitesVente (ProspectId, Titre, Etape, ProchaineAction, DateProchaineAction, DateCreation, DerniereActivite) VALUES (" + m.prospectId + ", 'Deuxième véhicule', 'Nouveau', 'Rappeler pour le deuxième véhicule', TIMESTAMP(CURDATE(), '09:00:00'), DATE_SUB(NOW(), INTERVAL " + (recul + 1) + " DAY), NOW())");
    const oppB = sql("SELECT Id FROM OpportunitesVente WHERE ProspectId = " + m.prospectId + " AND Titre = 'Deuxième véhicule'");
    await accueil(page);
    const ca = await carte(page, m.oppId), cbb = await carte(page, oppB);
    verifier(ca && cbb && ca.obligation !== cbb.obligation, "deux opportunités du même prospect : deux cartes distinctes");
    await page.evaluate(function () { return true; });
    let p2 = page.locator('#ph-focus [data-priorite][data-obligation="contact:oe-' + oppB + '"]');
    // Afficher la carte B (« Plus tard » fait défiler les priorités), puis réaliser son suivi.
    for (let i = 0; i < 3 && await p2.isHidden(); i++) await page.locator("#ph-focus [data-priorite]:not([hidden]) [data-plus-tard]").click();
    await Promise.all([page.waitForNavigation(), p2.locator("[data-realiser-suivi]").click()]);
    await messageAffiche(page);
    verifier((await carte(page, m.oppId)).commandes.join() === "declarer-contact,realiser-serveur", "réaliser le suivi de B ne touche pas A (aucune clôture en cascade)");

    // ---------- Page périmée, double envoi ----------
    const s = await creer(page, "Perime" + suffixe);
    const ancienne = await nouvellePage(navigateur);
    await connecter(ancienne, SOPHIE);
    await accueil(ancienne);
    verifier((await carte(ancienne, s.oppId)).commandes.indexOf("realiser-serveur") >= 0, "page ouverte avant le remplacement : le suivi est proposé");
    await planifier(page, s.prospectId, "Nouvelle action " + suffixe, 0); // remplacement ailleurs
    await Promise.all([ancienne.waitForNavigation(), ancienne.locator('#ph-focus [data-realiser-suivi="oe-' + s.oppId + '"]').click()]);
    verifier((await messageAffiche(ancienne)).includes("changé entre-temps") && sql("SELECT ProchaineAction FROM OpportunitesVente WHERE Id = " + s.oppId) === "Nouvelle action " + suffixe,
      "page périmée : refus du serveur expliqué, la nouvelle action n'est pas réalisée à sa place");
    await accueil(page);
    const version = await page.evaluate(function (id) { return window.Prospects.opportunite(id).versionSuivi; }, "oe-" + s.oppId);
    const jeton = await page.locator('input[name="__RequestVerificationToken"]').first().inputValue();
    const formulaire = { opportuniteId: "oe-" + s.oppId, versionSuivi: version, retour: "/Conseiller", __RequestVerificationToken: jeton };
    await page.request.post(BASE_URL + "/Prospects/RealiserSuivi", { form: formulaire, maxRedirects: 0 });
    await page.request.post(BASE_URL + "/Prospects/RealiserSuivi", { form: formulaire, maxRedirects: 0 });
    verifier(sql("SELECT COUNT(*) FROM HistoriquesSuiviOpportunite WHERE OpportuniteId = " + s.oppId + " AND Cloture = 'Realise'") === "1", "double envoi : une seule réalisation en base");

    // ---------- Message destiné à l'Accueil, page Rendez-vous chargée d'abord ----------
    // Lire le message côté serveur le consomme : l'agenda (même composant de données) ne doit ni l'afficher ni l'effacer.
    const g = await creer(page, "Agenda" + suffixe);
    await accueil(page);
    const versionG = await page.evaluate(function (id) { return window.Prospects.opportunite(id).versionSuivi; }, "oe-" + g.oppId);
    const jetonG = await page.locator('input[name="__RequestVerificationToken"]').first().inputValue();
    await page.request.post(BASE_URL + "/Prospects/RealiserSuivi", { form: { opportuniteId: "oe-" + g.oppId, versionSuivi: versionG, retour: "/Conseiller", __RequestVerificationToken: jetonG }, maxRedirects: 0 });
    await page.goto(BASE_URL + "/RendezVous");
    await page.waitForTimeout(900);
    verifier(!(await page.locator("#sv-toast [data-toast-texte]").isVisible()), "page Rendez-vous : le message destiné à l'Accueil n'y est pas affiché");
    await accueil(page);
    verifier((await messageAffiche(page)).includes("marqué comme réalisé"), "puis l'Accueil l'affiche (il n'a pas été consommé par l'agenda)");
    await accueil(page);
    verifier(!(await page.locator("#sv-toast [data-toast-texte]").isVisible()), "nouvelle visite de l'Accueil : le message n'est pas répété");

    // ---------- Collègue et autre concession ----------
    function creerConseiller(courriel, concession) {
      sql("INSERT INTO AspNetUsers (Id, FirstName, LastName, DealershipId, IsActive, MustChangePassword, CreatedAt, UserName, NormalizedUserName, Email, NormalizedEmail, EmailConfirmed, PasswordHash, SecurityStamp, ConcurrencyStamp, PhoneNumberConfirmed, TwoFactorEnabled, LockoutEnabled, AccessFailedCount) " +
        "SELECT UUID(), 'Autre', 'Conseiller', " + concession + ", 1, 0, NOW(), '" + courriel + "', UPPER('" + courriel + "'), '" + courriel + "', UPPER('" + courriel + "'), 1, PasswordHash, UUID(), UUID(), 0, 0, 1, 0 FROM AspNetUsers WHERE Email = '" + SOPHIE + "'");
      sql("INSERT INTO AspNetUserRoles (UserId, RoleId) SELECT u.Id, x.Id FROM AspNetUsers u, AspNetRoles x WHERE u.Email = '" + courriel + "' AND x.Name = 'Conseiller'");
    }
    sql("UPDATE Dealerships SET IsActive = 1 WHERE Name = 'Garage Saint-Laurent'");
    const collegue = "collegue.accueil." + suffixe + "@autoprestige.example";
    const ailleurs = "ailleurs.accueil." + suffixe + "@garagestl.example";
    creerConseiller(collegue, "(SELECT DealershipId FROM (SELECT DealershipId FROM AspNetUsers WHERE Email = '" + SOPHIE + "') x)");
    creerConseiller(ailleurs, "(SELECT Id FROM Dealerships WHERE Name = 'Garage Saint-Laurent')");
    const versionM = sql("SELECT ProchaineAction FROM OpportunitesVente WHERE Id = " + m.oppId);
    for (const courriel of [collegue, ailleurs]) {
      const autre = await nouvellePage(navigateur);
      await connecter(autre, courriel);
      const html = await (await autre.goto(BASE_URL + "/Conseiller")).text();
      await autre.waitForTimeout(700);
      const jetonAutre = await autre.locator('input[name="__RequestVerificationToken"]').first().inputValue();
      const tentative = await autre.request.post(BASE_URL + "/Prospects/RealiserSuivi", { form: { opportuniteId: "oe-" + m.oppId, versionSuivi: version, retour: "/Conseiller", __RequestVerificationToken: jetonAutre }, maxRedirects: 0 });
      verifier(!html.includes("DeuxOpp" + suffixe) && (await carte(autre, m.oppId)) === null && tentative.status() === 404 && sql("SELECT ProchaineAction FROM OpportunitesVente WHERE Id = " + m.oppId) === versionM,
        (courriel === collegue ? "collègue" : "autre concession") + " : aucune carte de ce dossier, réalisation refusée (404), rien n'a changé");
    }

    // ---------- Largeurs et thèmes ----------
    for (const [largeur, theme] of [[320, "clair"], [320, "sombre"], [390, "clair"], [390, "sombre"], [1440, "clair"], [1440, "sombre"]]) {
      const v = await nouvellePage(navigateur, { viewport: { width: largeur, height: 900 } });
      await connecter(v, SOPHIE);
      await accueil(v);
      if (theme === "sombre") await v.evaluate(function () { document.documentElement.dataset.theme = "sombre"; });
      await v.waitForTimeout(200);
      const carteVisible = v.locator("#ph-focus [data-priorite]:not([hidden])");
      const commandes = carteVisible.locator(".ph-focus-actions a, .ph-focus-actions button");
      let problemes = 0;
      for (let i = 0; i < await commandes.count(); i++) {
        const e = commandes.nth(i);
        await e.scrollIntoViewIfNeeded(); await v.waitForTimeout(60);
        if (!(await e.evaluate(function (x) { const w = document.documentElement.clientWidth, r = x.getBoundingClientRect(); const d = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return r.width > 0 && r.left >= 0 && r.right <= w + 0.5 && !!d && (d === x || x.contains(d)); }))) problemes++;
      }
      const debord = await v.evaluate(function () { return document.documentElement.scrollWidth - document.documentElement.clientWidth; });
      await carteVisible.screenshot({ path: "accueil-carte-" + largeur + "-" + theme + ".png" });
      verifier(debord === 0 && problemes === 0, largeur + " px, thème " + theme + " : carte « Priorité » sans débordement, commandes visibles et cliquables");
    }

    console.log("\nParcours de l'Accueil réussi (" + etape + " vérifications).");
  } catch (erreur) {
    console.error("\n" + erreur.message);
    await page.screenshot({ path: "e2e-accueil-echec.png" });
    code = 1;
  } finally {
    await navigateur.close();
  }
  process.exit(code);
})();
