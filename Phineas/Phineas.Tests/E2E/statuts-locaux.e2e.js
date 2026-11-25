// Test de bout en bout : les états locaux du navigateur ne masquent plus les obligations réelles (fonctionnalité 15),
// sur l'application réelle et MySQL. Un ancien état local (Ignorée, Confiée, Terminée, report local, préférence
// « ne plus contacter », pause) est injecté avec la vraie structure de sessionStorage (clé
// « phineas.salesos.intelligence.v1:<nom du conseiller> ») : le suivi échu et la première réponse restent dus sur
// l'Accueil, le Centre d'actions et Mes suivis. Les opérations enregistrées (réalisation, report, veille) fonctionnent.
// Prérequis et variables : les mêmes que modification-prospect.e2e.js (BASE_URL, CHROMIUM_PATH, MYSQL_CONTAINER, E2E_DB).
// Lancement : node statuts-locaux.e2e.js   (le paquet « playwright » doit être installé)
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
let recul = 2; // jours de recul de la demande : première réponse en retard (Urgent), sans passer devant les autres parcours

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

async function deconnecter(page) {
  await page.click('form[action="/Account/Logout"] button[type="submit"]');
  await page.waitForURL(function (url) { return url.pathname === "/" || url.pathname.indexOf("/Home") === 0; });
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

// Prospect réel (« Nouveau ») avec un suivi enregistré pour aujourd'hui : première réponse et suivi échu.
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
  return { prospectId: ids[0], oppId: ids[1], premiere: "premiere-reponse:oe-" + ids[1], suivi: "suivi-echeance:oe-" + ids[1] + ":" + jour(0) };
}

async function ouvrir(page, chemin) {
  await page.goto(BASE_URL + chemin);
  await page.waitForTimeout(900);
}

// Ce que voit le conseiller pour une opportunité, sur la page courante (moteur et store du navigateur).
async function vue(page, oppId) {
  return page.evaluate(function (id) {
    const I = window.Intelligence, R = window.IntelligenceRegles, P = window.Prospects;
    const mes = I.actives({ conseiller: P.moiId });
    return {
      presentees: I.actives().filter(function (a) { return a.opportuniteId === id; }).map(function (a) { return a.regle + ":" + a.statut + (a.assignation ? ":confiee" : ""); }).sort(),
      accueil: R.prioritesAccueil(mes.filter(function (a) { return !a.assignation; }), new Date(), 1000).filter(function (g) { return g.raisons.some(function (r) { return r.opportuniteId === id; }); }).map(function (g) { return g.raisons.length; }),
      aTraiter: I.compteurs(P.moiId).aTraiter,
      terminees: I.compteurs(P.moiId).terminees,
      horsFile: ["Terminee", "Ignoree", "Reportee"].reduce(function (n, s) { return n + I.horsFile(s).filter(function (a) { return a.opportuniteId === id; }).length; }, 0),
      suspendues: I.suspendues().filter(function (a) { return a.opportuniteId === id; }).length,
    };
  }, "oe-" + oppId);
}

// Injecte d'anciens états locaux avec la vraie structure de sessionStorage, puis recharge la page.
async function injecter(page, d, options) {
  await page.evaluate(function (x) {
    const nom = JSON.parse(document.getElementById("intelligence-donnees").textContent).conseillerNom;
    const cle = "phineas.salesos.intelligence.v1:" + nom;
    const etat = JSON.parse(sessionStorage.getItem(cle));
    const h = [{ date: new Date().toISOString(), de: "ATraiter", vers: "Ignoree", texte: "Ignorée.", auteur: nom }];
    etat.actions[x.d.premiere] = Object.assign({}, etat.actions[x.d.premiere] || {}, { statut: x.statutPremiere, motif: "deja-fait", historique: h, termineeLe: new Date().toISOString() });
    etat.actions[x.d.suivi] = Object.assign({}, etat.actions[x.d.suivi] || {}, { statut: "ATraiter", historique: h,
      assignation: { collegueId: "c-antoine", collegue: "Antoine Roy", motif: "absence", le: new Date().toISOString(), par: nom } });
    if (x.preference) etat.preferences["pe-" + x.d.prospectId] = { prospectId: "pe-" + x.d.prospectId, consentement: "retire", nePlusContacter: true, demandeArretLe: new Date().toISOString(), note: null };
    if (x.pause) etat.pauses["oe-" + x.d.oppId] = { jusqua: new Date(Date.now() + 10 * 86400000).toISOString(), motif: "Achat reporté", depuis: new Date().toISOString() };
    sessionStorage.setItem(cle, JSON.stringify(etat));
  }, { d: d, statutPremiere: options.statutPremiere || "Ignoree", preference: !!options.preference, pause: !!options.pause });
  await page.reload();
  await page.waitForTimeout(900);
}

async function messageAffiche(page) {
  const toast = page.locator("#sv-toast [data-toast-texte]");
  await toast.waitFor({ state: "visible" });
  return toast.innerText();
}

// Ligne du Centre (pagination parcourue) d'une opportunité.
async function ligneCentre(page, oppId) {
  const selecteur = '#file article[data-obligation="contact:oe-' + oppId + '"], #file article[data-action-id*=":oe-' + oppId + '"]';
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

function dossier(oppId) {
  return sql("SELECT CONCAT(IFNULL(o.ProchaineAction, 'aucune'), '|', o.Etape, '|', p.ConseillerId = u.Id, '|', (SELECT COUNT(*) FROM HistoriquesSuiviOpportunite h WHERE h.OpportuniteId = o.Id), '|', (SELECT COUNT(*) FROM NotesProspect n WHERE n.ProspectId = o.ProspectId)) " +
    "FROM OpportunitesVente o JOIN Prospects p ON p.Id = o.ProspectId JOIN AspNetUsers u ON u.Email = '" + SOPHIE + "' WHERE o.Id = " + oppId);
}

(async () => {
  const navigateur = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await nouvellePage(navigateur);
  const erreurs = [];
  page.on("pageerror", function (e) { if (e.message.indexOf("ViewTransition") < 0) erreurs.push(e.message); });
  const envois = [];
  page.on("request", function (r) { if (r.method() === "POST") envois.push(new URL(r.url()).pathname); });
  let code = 0;

  try {
    await connecter(page, SOPHIE);

    // ---------- Démonstration : commandes locales conservées ----------
    await ouvrir(page, "/Intelligence");
    const demo = await page.evaluate(function () {
      const a = window.Intelligence.actives().find(function (x) { return !window.IntelligenceRegles.estDossierReel(x) && x.statut === "ATraiter" && !x.assignation; });
      return a ? a.id : null;
    });
    const avantDemo = envois.length;
    await page.evaluate(function (id) { return window.Intelligence.ignorer(id, "deja-fait") !== null; }, demo);
    const ignoreeDemo = await page.evaluate(function (id) { return window.Intelligence.action(id).statut; }, demo);
    verifier(ignoreeDemo === "Ignoree" && envois.length === avantDemo, "démonstration : « Ignorer » reste une simulation locale, sans envoi");
    await page.evaluate(function (id) { window.Intelligence.reactiver(id); }, demo);

    // ---------- Parcours principal ----------
    const a = await creer(page, "Statut" + suffixe);
    const avantDossier = dossier(a.oppId);
    await ouvrir(page, "/Intelligence/Suivis");
    verifier(await page.locator('#relances tr[data-obligation="contact:oe-' + a.oppId + '"]').count() + (await page.evaluate(function (id) { return window.Intelligence.actives().some(function (x) { return x.opportuniteId === id && x.regle === "suivi-echeance"; }); }, "oe-" + a.oppId) ? 1 : 0) >= 1,
      "Mes suivis : le suivi enregistré pour aujourd'hui est à traiter");
    await ouvrir(page, "/Intelligence");
    const reference = await vue(page, a.oppId);
    verifier(reference.presentees.join() === "premiere-reponse:ATraiter,suivi-echeance:ATraiter" && reference.accueil.join() === "2",
      "Centre d'actions et Accueil : une obligation à deux raisons (première réponse, suivi)");

    // Commandes proposées pour un dossier réel : plus de « Commencer », « Ignorer » ni « Confier ».
    const l = await ligneCentre(page, a.oppId);
    await l.locator("[data-iv-ouvrir]").first().click();
    const menus = await l.evaluate(function (x) {
      return [].slice.call(x.querySelectorAll("[data-raison]")).map(function (s) {
        return { raison: s.dataset.raison, commandes: [].slice.call(s.querySelectorAll(".dropdown-menu [data-ia]")).map(function (b) { return b.dataset.ia; }).sort().join(),
          explication: !!s.querySelector("[data-statuts-indisponibles]") };
      });
    });
    verifier(menus.length === 2 && menus.every(function (m) { return m.explication && !/commencer|ignorer|transferer/.test(m.commandes); }),
      "menus « Plus » d'un dossier réel : commandes sans effet en base retirées, explication affichée");
    verifier(menus.find(function (m) { return m.raison === "premiere-reponse"; }).commandes === "historique,veille" &&
      menus.find(function (m) { return m.raison === "suivi-echeance"; }).commandes === "historique,reporter",
      "restent les commandes enregistrées : « Mettre en veille » (première réponse), « Reporter » (suivi réel)");
    await ouvrir(page, "/Intelligence/Suivis");
    verifier(await page.locator('#relances [data-preferences="pe-' + a.prospectId + '"]').count() === 0, "Mes suivis : pas de « Préférences » (pause locale) pour un dossier réel");

    // Anciens états locaux injectés : Ignorée, Confiée, préférence « ne plus contacter », pause.
    await ouvrir(page, "/Intelligence");
    await injecter(page, a, { preference: true, pause: true });
    let v = await vue(page, a.oppId);
    verifier(v.presentees.join() === "premiere-reponse:ATraiter,suivi-echeance:ATraiter" && v.accueil.join() === "2" && v.suspendues === 0 && v.horsFile === 0,
      "après injection d'anciens états (Ignorée, Confiée, préférence, pause) : les deux raisons restent dues, rien de suspendu ni d'ignoré");
    verifier(v.aTraiter === reference.aTraiter && v.terminees === reference.terminees, "compteurs inchangés (à traiter " + v.aTraiter + ", terminées " + v.terminees + ")");
    verifier((await ligneCentre(page, a.oppId)) !== null, "Centre d'actions : la carte reste dans « À traiter »");
    await ouvrir(page, "/Conseiller");
    verifier((await vue(page, a.oppId)).accueil.join() === "2", "Accueil : la priorité reste proposée");
    await ouvrir(page, "/Intelligence/Suivis");
    verifier((await vue(page, a.oppId)).presentees.length === 2 && await page.locator('#relances tr[data-obligation="contact:oe-' + a.oppId + '"]').count() === 1,
      "Mes suivis : le suivi reste à traiter");
    await page.goto(BASE_URL + "/Prospects/Fiche/pe-" + a.prospectId); await page.waitForTimeout(700);
    verifier(!(await page.locator("body").innerText()).includes("en pause jusqu'au"), "fiche : aucune pause locale affichée pour un dossier réel");

    // Ancien « Terminée » sans opération en base.
    await ouvrir(page, "/Intelligence");
    await injecter(page, a, { statutPremiere: "Terminee" });
    v = await vue(page, a.oppId);
    verifier(v.presentees.join() === "premiere-reponse:ATraiter,suivi-echeance:ATraiter" && v.terminees === reference.terminees, "ancien « Terminée » local : la première réponse reste due, rien n'est compté comme terminé");
    verifier(dossier(a.oppId) === avantDossier, "en base : aucune réalisation, attribution, note ni historique créés");

    // Reconnexion dans le même onglet : l'état local subsiste, mais ne masque rien.
    await deconnecter(page);
    await connecter(page, SOPHIE);
    await ouvrir(page, "/Intelligence");
    verifier((await vue(page, a.oppId)).presentees.length === 2, "après déconnexion et reconnexion : obligations toujours dues");

    // Réalisation enregistrée : seul le suivi disparaît.
    await ouvrir(page, "/Intelligence/Suivis");
    await Promise.all([page.waitForNavigation(), page.locator('#relances [data-realiser-suivi="oe-' + a.oppId + '"]').click()]);
    verifier((await messageAffiche(page)).indexOf("marqué comme réalisé") >= 0, "réalisation par le serveur confirmée");
    await page.waitForTimeout(500);
    v = await vue(page, a.oppId);
    verifier(v.presentees.join() === "premiere-reponse:ATraiter" && sql("SELECT GROUP_CONCAT(Cloture) FROM HistoriquesSuiviOpportunite WHERE OpportuniteId = " + a.oppId) === "Realise",
      "après réalisation : le suivi disparaît, historique « Réalisé » en base ; la première réponse reste malgré l'ancien état local");

    // Veille enregistrée (fonctionnalité 14) : toujours appliquée, puis réactivation.
    await ouvrir(page, "/Intelligence");
    await injecter(page, a, {});
    const lv = await ligneCentre(page, a.oppId);
    await lv.locator("[data-iv-ouvrir]").first().click();
    await lv.locator(".dropdown-toggle").first().click();
    await lv.locator('[data-ia="veille"]').first().click();
    await page.waitForSelector(".modal.show #ia-duree");
    await Promise.all([page.waitForNavigation(), page.click(".modal.show [data-ia-valider]")]);
    await messageAffiche(page);
    verifier((await page.evaluate(function (cle) { return window.Intelligence.action(cle).statut; }, a.premiere)) === "EnVeille" && (await vue(page, a.oppId)).presentees.length === 0,
      "veille enregistrée : la première réponse est en veille (pas neutralisée par la protection)");
    await page.click("#onglet-reportees");
    const zone = page.locator('#veilles article[data-action-id="' + a.premiere + '"]');
    await zone.locator("[data-iv-ouvrir]").click();
    await Promise.all([page.waitForNavigation(), zone.locator('.iv-action-boutons [data-ia="reactiver-veille"]').click()]);
    await messageAffiche(page);
    verifier((await vue(page, a.oppId)).presentees.join() === "premiere-reponse:ATraiter", "réactivation : la première réponse revient, l'ancien « Ignorée » ne la retient pas");

    // ---------- Report enregistré (fonctionnalité 07) avec ancien état local ----------
    const r = await creer(page, "Report" + suffixe);
    await ouvrir(page, "/Intelligence/Suivis");
    await injecter(page, r, { statutPremiere: "Reportee" });
    await page.locator('#relances [data-ia="reporter"][data-id="' + r.suivi + '"]').click();
    await page.waitForSelector(".modal.show #ia-date");
    await page.fill(".modal.show #ia-date", jour(3));
    await Promise.all([page.waitForNavigation(), page.click(".modal.show [data-ia-valider]")]);
    await messageAffiche(page);
    v = await vue(page, r.oppId);
    verifier(v.presentees.join() === "premiere-reponse:ATraiter" && sql("SELECT Cloture FROM HistoriquesSuiviOpportunite WHERE OpportuniteId = " + r.oppId) === "Reporte",
      "report enregistré : le suivi passe « À venir » ; la première réponse reste due malgré un ancien report local");

    // ---------- Deux opportunités du même prospect ----------
    // Billet #87 : « aujourd'hui » est le jour de l'utilisateur (jour(0), celui du navigateur), jamais CURDATE() (jour UTC
    // de MySQL, déjà le lendemain le soir à Toronto : le suivi serait « demain » pour le navigateur).
    sql("INSERT INTO OpportunitesVente (ProspectId, Titre, Etape, ProchaineAction, DateProchaineAction, DateCreation, DerniereActivite) VALUES (" + a.prospectId + ", 'Deuxième véhicule', 'Nouveau', 'Rappeler', TIMESTAMP('" + jour(0) + "', '09:00:00'), DATE_SUB(NOW(), INTERVAL 3 DAY), NOW())");
    const b = sql("SELECT MAX(Id) FROM OpportunitesVente WHERE ProspectId = " + a.prospectId);
    await ouvrir(page, "/Intelligence");
    await injecter(page, { prospectId: a.prospectId, oppId: b, premiere: "premiere-reponse:oe-" + b, suivi: "suivi-echeance:oe-" + b + ":" + jour(0) }, { preference: true });
    verifier((await vue(page, b)).presentees.join() === "premiere-reponse:ATraiter,suivi-echeance:ATraiter" && (await vue(page, a.oppId)).presentees.join() === "premiere-reponse:ATraiter",
      "deux opportunités : chacune garde ses obligations, la préférence locale ne suspend ni l'une ni l'autre");

    // ---------- Autre conseiller dans le même navigateur, puis autre concession ----------
    function creerConseiller(courriel, prenom, concession) {
      sql("INSERT INTO AspNetUsers (Id, FirstName, LastName, DealershipId, IsActive, MustChangePassword, CreatedAt, UserName, NormalizedUserName, Email, NormalizedEmail, EmailConfirmed, PasswordHash, SecurityStamp, ConcurrencyStamp, PhoneNumberConfirmed, TwoFactorEnabled, LockoutEnabled, AccessFailedCount) " +
        "SELECT UUID(), '" + prenom + "', 'Conseiller', " + concession + ", 1, 0, NOW(), '" + courriel + "', UPPER('" + courriel + "'), '" + courriel + "', UPPER('" + courriel + "'), 1, PasswordHash, UUID(), UUID(), 0, 0, 1, 0 FROM AspNetUsers WHERE Email = '" + SOPHIE + "'");
      sql("INSERT INTO AspNetUserRoles (UserId, RoleId) SELECT u.Id, x.Id FROM AspNetUsers u, AspNetRoles x WHERE u.Email = '" + courriel + "' AND x.Name = 'Conseiller'");
    }
    sql("UPDATE Dealerships SET IsActive = 1 WHERE Name = 'Garage Saint-Laurent'");
    const collegue = "collegue.statuts." + suffixe + "@autoprestige.example";
    const ailleurs = "ailleurs.statuts." + suffixe + "@garagestl.example";
    creerConseiller(collegue, "Lea", "(SELECT DealershipId FROM (SELECT DealershipId FROM AspNetUsers WHERE Email = '" + SOPHIE + "') x)");
    creerConseiller(ailleurs, "Max", "(SELECT Id FROM Dealerships WHERE Name = 'Garage Saint-Laurent')");
    for (const courriel of [collegue, ailleurs]) {
      await deconnecter(page);
      await connecter(page, courriel);
      const c = await creer(page, "Second" + suffixe + (courriel === collegue ? "a" : "b"));
      await ouvrir(page, "/Intelligence");
      const visibleA = await page.evaluate(function (id) { return window.Prospects.opportunite(id) !== null; }, "oe-" + a.oppId);
      await injecter(page, c, { preference: true, pause: true });
      v = await vue(page, c.oppId);
      verifier(!visibleA && v.presentees.join() === "premiere-reponse:ATraiter,suivi-echeance:ATraiter" && v.accueil.join() === "2",
        (courriel === collegue ? "autre conseiller" : "autre concession") + ", même navigateur : dossiers de Sophie invisibles, ses propres obligations non masquées par les anciens états locaux");
    }
    await deconnecter(page);
    await connecter(page, SOPHIE);
    await ouvrir(page, "/Intelligence");
    verifier((await vue(page, b)).presentees.length === 2 && dossier(a.oppId).split("|")[2] === "1", "retour de Sophie : obligations intactes, dossier toujours attribué à Sophie");

    // ---------- Largeurs et thèmes : menu d'un dossier réel ----------
    for (const [largeur, theme] of [[320, "clair"], [320, "sombre"], [390, "clair"], [390, "sombre"], [1440, "clair"], [1440, "sombre"]]) {
      const p2 = await nouvellePage(navigateur, { viewport: { width: largeur, height: 900 } });
      await connecter(p2, SOPHIE);
      await ouvrir(p2, "/Intelligence");
      if (theme === "sombre") await p2.evaluate(function () { document.documentElement.dataset.theme = "sombre"; });
      const lw = await ligneCentre(p2, b);
      await lw.locator("[data-iv-ouvrir]").first().click();
      const bouton = lw.locator('[data-raison="suivi-echeance"] .dropdown-toggle');
      await bouton.scrollIntoViewIfNeeded();
      await bouton.click();
      const texte = lw.locator('[data-raison="suivi-echeance"] [data-statuts-indisponibles]');
      await texte.waitFor({ state: "visible" });
      const ok = await texte.evaluate(function (x) { const w = document.documentElement.clientWidth, r = x.getBoundingClientRect(); return r.width > 0 && r.left >= -0.5 && r.right <= w + 0.5; });
      const debord = await p2.evaluate(function () { return document.documentElement.scrollWidth - document.documentElement.clientWidth; });
      await lw.locator('[data-raison="suivi-echeance"] .dropdown-menu').screenshot({ path: "statuts-" + largeur + "-" + theme + ".png" });
      verifier(ok && debord === 0, largeur + " px, thème " + theme + " : explication lisible dans le menu, sans débordement");
      await p2.context().close();
    }

    verifier(erreurs.length === 0, "aucune erreur JavaScript (" + JSON.stringify(erreurs) + ")");
    console.log("\nParcours des statuts locaux réussi (" + etape + " vérifications).");
  } catch (erreur) {
    console.error("\n" + erreur.message);
    await page.screenshot({ path: "e2e-statuts-echec.png" });
    code = 1;
  } finally {
    await navigateur.close();
  }
  process.exit(code);
})();
