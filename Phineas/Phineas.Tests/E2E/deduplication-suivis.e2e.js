// Test de bout en bout : regroupement des recommandations de « Mes suivis » (vue « À traiter ») sur des données MySQL
// réelles, puis réévaluation après « Marquer comme réalisé », après une note « Appel effectué » et après « Reporter ».
// Règle de l'architecte : une tâche accomplie n'est pas une prise de contact. Réaliser le suivi (ici une tâche sans
// contact client) le retire, mais la première réponse reste jusqu'à ce qu'un contact soit déclaré (note de type appel,
// courriel ou visite) ; aucune obligation indépendante ne bouge.
// Prérequis et variables : les mêmes que modification-prospect.e2e.js (BASE_URL, CHROMIUM_PATH, MYSQL_CONTAINER, E2E_DB).
// Lancement : node deduplication-suivis.e2e.js   (le paquet « playwright » doit être installé)
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

// Prospect créé par le vrai formulaire (étape « Nouveau » : une première réponse est attendue), puis suivi du jour
// planifié par la vraie fenêtre de la fiche : deux recommandations pour la même prise de contact.
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
  await page.goto(BASE_URL + "/Prospects/Fiche/pe-" + ids[0]);
  await page.waitForTimeout(600);
  await page.click('[data-action="suivi"]');
  await page.waitForSelector("#modal-suivi.show");
  await page.fill("#s-action", action);
  await page.fill("#s-date", jour(decalage));
  await Promise.all([page.waitForNavigation(), page.click('#form-suivi button[type="submit"]')]);
  return { prospectId: ids[0], oppId: ids[1] };
}

async function ouvrirSuivis(page) {
  await page.goto(BASE_URL + "/Intelligence/Suivis");
  await page.waitForTimeout(900);
}

// Toutes les lignes de « À traiter », page après page : [{ obligation, action, raisons, texte }].
async function lignesATraiter(page) {
  const premiere = page.locator('[data-zone="pagination-relances"] [data-aller-page="1"]:not([disabled])');
  if (await premiere.count()) { await premiere.first().click(); await page.waitForTimeout(150); }
  const lignes = [];
  for (let numero = 1; numero <= 40; numero++) {
    lignes.push.apply(lignes, await page.$$eval("#relances tr", function (l) {
      return l.map(function (tr) {
        return { obligation: tr.dataset.obligation, action: tr.dataset.actionId, raisons: [].slice.call(tr.querySelectorAll("[data-raison]")).map(function (r) { return r.dataset.raison; }), texte: tr.innerText };
      });
    }));
    const suivante = page.locator('[data-zone="pagination-relances"] [data-aller-page="' + (numero + 1) + '"]:not([disabled])');
    if (!(await suivante.count())) break;
    await suivante.first().click();
    await page.waitForTimeout(150);
  }
  return lignes;
}

// Ligne (locator) de « À traiter » dont l'obligation est celle donnée, en parcourant les pages ; null si absente.
async function trouverLigne(page, obligation) {
  const premiere = page.locator('[data-zone="pagination-relances"] [data-aller-page="1"]:not([disabled])');
  if (await premiere.count()) { await premiere.first().click(); await page.waitForTimeout(150); }
  for (let numero = 1; numero <= 40; numero++) {
    const ligne = page.locator('#relances tr[data-obligation="' + obligation + '"]');
    if (await ligne.count()) return ligne.first();
    const suivante = page.locator('[data-zone="pagination-relances"] [data-aller-page="' + (numero + 1) + '"]:not([disabled])');
    if (!(await suivante.count())) return null;
    await suivante.first().click();
    await page.waitForTimeout(150);
  }
  return null;
}

// Recommandations actives du moteur pour une opportunité (toutes vues confondues, Centre d'actions compris).
async function recommandations(page, oppId) {
  return page.evaluate(function (id) {
    return window.Intelligence.actives({ conseiller: window.Prospects.moiId }).filter(function (a) { return a.opportuniteId === id; }).map(function (a) { return a.regle; }).sort();
  }, "oe-" + oppId);
}

async function messageAffiche(page) {
  const toast = page.locator("#sv-toast [data-toast-texte]");
  await toast.waitFor({ state: "visible" });
  return toast.innerText();
}

(async () => {
  const navigateur = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await nouvellePage(navigateur);
  let code = 0;

  try {
    // ---------- Scénario principal : deux raisons, une seule action ----------
    await connecter(page, SOPHIE);
    const action = "Préparer le dossier de financement " + suffixe; // une tâche, pas un contact client
    const a = await creerAvecSuivi(page, "Dedup" + suffixe, action, 0);
    // Deuxième opportunité du même client, avec sa propre prise de contact (obligation indépendante).
    sql("INSERT INTO OpportunitesVente (ProspectId, Titre, Etape, ProchaineAction, DateProchaineAction, DateCreation, DerniereActivite) VALUES (" +
      a.prospectId + ", 'Deuxième véhicule', 'Nouveau', 'Rappeler pour le deuxième véhicule', TIMESTAMP(CURDATE(), '09:00:00'), NOW(), NOW())");
    const b = { oppId: sql("SELECT Id FROM OpportunitesVente WHERE ProspectId = " + a.prospectId + " AND Titre = 'Deuxième véhicule'") };
    verifier(sql("SELECT CONCAT(Etape, ' | ', ProchaineAction, ' | ', DATE(DateProchaineAction)) FROM OpportunitesVente WHERE Id = " + a.oppId) === "Nouveau | " + action + " | " + jour(0), "prospect réel « Nouveau » avec un suivi du jour, en base (oe-" + a.oppId + ")");

    await ouvrirSuivis(page);
    verifier((await recommandations(page, a.oppId)).join() === "premiere-reponse,suivi-echeance", "le moteur produit bien deux recommandations pour cette opportunité (première réponse et suivi)");
    let lignes = await lignesATraiter(page);
    let miennes = lignes.filter(function (l) { return l.obligation === "contact:oe-" + a.oppId; });
    verifier(miennes.length === 1 && !lignes.some(function (l) { return l.obligation !== "contact:oe-" + a.oppId && l.action && l.action.indexOf("oe-" + a.oppId) >= 0 && l.action.indexOf("oe-" + a.oppId + "0") < 0 && (l.action.endsWith("oe-" + a.oppId) || l.action.indexOf("oe-" + a.oppId + ":") >= 0); }), "une seule ligne pour cette prise de contact, sur toutes les pages");
    verifier(miennes[0].raisons.slice().sort().join() === "premiere-reponse,suivi-echeance" && miennes[0].texte.includes("Demande reçue sans première réponse") && miennes[0].texte.includes("Suivi demandé arrivé à échéance") && miennes[0].texte.includes("Même prise de contact : 2 raisons"), "les deux raisons restent visibles dans la ligne");
    // Échéance attendue : la plus proche des deux raisons (première réponse, une heure après la demande), calculée par le moteur.
    const echeances = await page.evaluate(function (id) {
      const raisons = window.Intelligence.actives({ conseiller: window.Prospects.moiId }).filter(function (x) { return x.relance && x.opportuniteId === id; });
      const proche = raisons.map(function (x) { return x.echeance; }).sort()[0];
      return { proche: window.IntelligenceUI.echeanceTexte(proche), suivi: window.IntelligenceUI.echeanceTexte(raisons.filter(function (x) { return x.regle === "suivi-echeance"; })[0].echeance) };
    }, "oe-" + a.oppId);
    verifier(miennes[0].texte.includes("Priorité : Élevé") && miennes[0].texte.includes("Préparer une réponse initiale · " + echeances.proche) && echeances.proche !== echeances.suivi, "priorité (Élevé) et échéance la plus proche (« " + echeances.proche + " », avant celle du suivi « " + echeances.suivi + " ») affichées");
    const autre = lignes.filter(function (l) { return l.obligation === "contact:oe-" + b.oppId; });
    verifier(autre.length === 1 && autre[0].texte.includes("Rappeler pour le deuxième véhicule"), "la deuxième opportunité du même client reste une ligne distincte");

    const compteur = Number(await page.locator('[data-champ="nb-relances"]').first().innerText());
    const brutes = await page.evaluate(function () { return window.Intelligence.actives({ conseiller: window.Prospects.moiId }).filter(function (x) { return x.relance; }).length; });
    verifier(compteur === lignes.length && compteur < brutes, "compteur « À traiter » = " + compteur + " obligations (lignes affichées), pour " + brutes + " recommandations : aucune obligation comptée deux fois");
    verifier(new Set(lignes.map(function (l) { return l.obligation; })).size === lignes.length, "pagination : chaque obligation apparaît une seule fois sur l'ensemble des pages");

    // Cas distincts des données de démonstration (audit) : même opportunité, obligations différentes, lignes séparées.
    const distinctes = await page.evaluate(function () {
      const groupes = window.IntelligenceRegles.regrouperObligations(window.Intelligence.actives({ conseiller: window.Prospects.moiId }).filter(function (x) { return x.relance; }));
      const parOpp = {};
      groupes.forEach(function (g) { (parOpp[g.principale.opportuniteId] = parOpp[g.principale.opportuniteId] || []).push(g.raisons.map(function (r) { return r.regle; }).join("+")); });
      return Object.keys(parOpp).filter(function (k) { return parOpp[k].length > 1; }).map(function (k) { return k + " : " + parOpp[k].join(" / "); });
    });
    verifier(distinctes.length >= 3 && distinctes.some(function (d) { return d.indexOf("rdv-a-confirmer") >= 0 && d.indexOf("premiere-reponse") >= 0; }), "obligations distinctes conservées (rendez-vous, soumission, prise de contact) : " + distinctes.join(" ; "));

    await page.reload(); await page.waitForTimeout(900);
    const apresActualisation = (await lignesATraiter(page)).filter(function (l) { return l.obligation === "contact:oe-" + a.oppId; });
    verifier(apresActualisation.length === 1 && apresActualisation[0].action === miennes[0].action && apresActualisation[0].raisons.join() === miennes[0].raisons.join(), "après actualisation : même regroupement, même raison principale (" + miennes[0].action + ")");

    // ---------- Action persistante : « Marquer comme réalisé » sur la ligne regroupée ----------
    let ligne = await trouverLigne(page, "contact:oe-" + a.oppId);
    await Promise.all([page.waitForNavigation(), ligne.locator('[data-realiser-suivi="oe-' + a.oppId + '"]').click()]);
    verifier((await messageAffiche(page)).includes("marqué comme réalisé"), "réalisation confirmée");
    await page.waitForTimeout(500);
    // Scénario A : le suivi disparaît, la première réponse reste seule (aucun contact déclaré), sans réalisation en cascade.
    ligne = await trouverLigne(page, "contact:oe-" + a.oppId);
    verifier(ligne !== null && (await ligne.getAttribute("data-nb-raisons")) === "1" && (await ligne.locator("[data-raison]").first().getAttribute("data-raison")) === "premiere-reponse" && (await ligne.locator("[data-realiser-suivi]").count()) === 0,
      "réévaluation : le suivi réalisé a disparu ; la première réponse reste, seule (une tâche accomplie n'est pas un contact)");
    verifier((await recommandations(page, a.oppId)).join() === "premiere-reponse", "le moteur ne recommande plus le suivi, et garde la première réponse");
    ligne = await trouverLigne(page, "contact:oe-" + b.oppId);
    verifier(ligne !== null && (await ligne.getAttribute("data-nb-raisons")) === "2", "obligation indépendante intacte : la deuxième opportunité garde sa prise de contact (2 raisons)");
    await page.goto(BASE_URL + "/Prospects/Fiche/pe-" + a.prospectId);
    await page.click("#onglet-historique"); await page.waitForTimeout(400);
    verifier((await page.locator('#panneau-historique [data-zone="timeline"]').innerText()).includes("Suivi réalisé"), "l'historique « Suivi réalisé » est conservé dans la fiche");
    await ouvrirSuivis(page);
    verifier((await trouverLigne(page, "contact:oe-" + a.oppId)) !== null && (await trouverLigne(page, "contact:oe-" + b.oppId)) !== null, "après actualisation : même résultat");
    verifier(sql("SELECT CONCAT(IFNULL(o.ProchaineAction, 'aucune'), ' | ', GROUP_CONCAT(h.Cloture)) FROM OpportunitesVente o JOIN HistoriquesSuiviOpportunite h ON h.OpportuniteId = o.Id WHERE o.Id = " + a.oppId + " GROUP BY o.Id") === "aucune | Realise" &&
      sql("SELECT CONCAT(ProchaineAction, ' | ', (SELECT COUNT(*) FROM HistoriquesSuiviOpportunite WHERE OpportuniteId = " + b.oppId + ")) FROM OpportunitesVente WHERE Id = " + b.oppId) === "Rappeler pour le deuxième véhicule | 0" &&
      sql("SELECT COUNT(*) FROM NotesProspect WHERE ProspectId = " + a.prospectId) === "0", "en base : suivi réalisé sur la première opportunité seulement, aucune note ni contact créé, la deuxième inchangée");

    // Scénario B : signal structuré existant. Le conseiller déclare le contact par une note « Appel effectué » (fonctionnalité 04).
    await page.goto(BASE_URL + "/Prospects/Fiche/pe-" + a.prospectId);
    await page.click("#onglet-historique");
    await page.locator("#form-note").waitFor({ state: "visible" });
    await page.selectOption("#n-opp", "oe-" + a.oppId);
    await page.selectOption("#n-type", "appel");
    await page.fill("#n-resume", "Premier appel au client " + suffixe);
    await Promise.all([page.waitForNavigation(), page.click('#form-note button[type="submit"]')]);
    await ouvrirSuivis(page);
    verifier((await trouverLigne(page, "contact:oe-" + a.oppId)) === null && (await recommandations(page, a.oppId)).indexOf("premiere-reponse") < 0, "après une note « Appel effectué » : la première réponse est satisfaite et disparaît");
    verifier((await trouverLigne(page, "contact:oe-" + b.oppId)) !== null, "la deuxième opportunité reste à traiter");
    verifier(sql("SELECT Type FROM NotesProspect WHERE ProspectId = " + a.prospectId) === "appel", "en base : la note de type « appel » est enregistrée");
    await page.click('form[action="/Account/Logout"] button[type="submit"]');
    await page.waitForURL(function (url) { return url.pathname.indexOf("/Intelligence") !== 0; });
    await connecter(page, SOPHIE);
    await ouvrirSuivis(page);
    verifier((await trouverLigne(page, "contact:oe-" + a.oppId)) === null && (await trouverLigne(page, "contact:oe-" + b.oppId)) !== null, "après reconnexion : même résultat");

    // ---------- Scénario D : report, la prise de contact n'est pas faite, la première réponse reste seule ----------
    const r = await creerAvecSuivi(page, "Report" + suffixe, "Rappeler plus tard " + suffixe, 0);
    await ouvrirSuivis(page);
    ligne = await trouverLigne(page, "contact:oe-" + r.oppId);
    verifier(ligne !== null && (await ligne.getAttribute("data-nb-raisons")) === "2", "deuxième dossier : une ligne, deux raisons");
    await ligne.locator('[data-ia="reporter"]').click();
    await page.waitForSelector("#ia-modale.show");
    verifier((await page.locator("#ia-modale .modal-body").innerText()).includes("Rappeler plus tard " + suffixe), "« Reporter » ouvre la fenêtre du suivi enregistré");
    await page.fill("#ia-date", jour(3));
    await Promise.all([page.waitForNavigation(), page.click("#ia-modale [data-ia-valider]")]);
    await messageAffiche(page);
    ligne = await trouverLigne(page, "contact:oe-" + r.oppId);
    verifier(ligne !== null && (await ligne.getAttribute("data-nb-raisons")) === "1" && (await ligne.locator("[data-raison]").first().getAttribute("data-raison")) === "premiere-reponse" && (await ligne.locator("[data-realiser-suivi]").count()) === 0, "après report : la première réponse reste seule (aucun contact déclaré), sans bouton de suivi");
    verifier(sql("SELECT CONCAT(DATE(DateProchaineAction), ' | ', (SELECT GROUP_CONCAT(Cloture) FROM HistoriquesSuiviOpportunite WHERE OpportuniteId = " + r.oppId + ")) FROM OpportunitesVente WHERE Id = " + r.oppId) === jour(3) + " | Reporte", "en base : date reportée, événement « Reporte »");
    await page.click("#onglet-a-venir");
    verifier(await page.locator('#a-venir tr[data-suivi="oe-' + r.oppId + '"]').count() === 1, "non-régression : le suivi reporté apparaît dans « À venir »");

    // ---------- Isolation : un collègue de la même concession ne voit rien de ces dossiers ----------
    const collegue = "collegue.dedup." + suffixe + "@autoprestige.example";
    sql("INSERT INTO AspNetUsers (Id, FirstName, LastName, DealershipId, IsActive, MustChangePassword, CreatedAt, UserName, NormalizedUserName, Email, NormalizedEmail, EmailConfirmed, PasswordHash, SecurityStamp, ConcurrencyStamp, PhoneNumberConfirmed, TwoFactorEnabled, LockoutEnabled, AccessFailedCount) " +
      "SELECT UUID(), 'Autre', 'Conseiller', DealershipId, 1, 0, NOW(), '" + collegue + "', UPPER('" + collegue + "'), '" + collegue + "', UPPER('" + collegue + "'), 1, PasswordHash, UUID(), UUID(), 0, 0, 1, 0 FROM AspNetUsers WHERE Email = '" + SOPHIE + "'");
    sql("INSERT INTO AspNetUserRoles (UserId, RoleId) SELECT u.Id, x.Id FROM AspNetUsers u, AspNetRoles x WHERE u.Email = '" + collegue + "' AND x.Name = 'Conseiller'");
    const autrePage = await nouvellePage(navigateur);
    await connecter(autrePage, collegue);
    const reponse = await autrePage.goto(BASE_URL + "/Intelligence/Suivis");
    const html = await reponse.text();
    await autrePage.waitForTimeout(800);
    const sesLignes = await lignesATraiter(autrePage);
    verifier(!html.includes("Dedup" + suffixe) && !html.includes("Report" + suffixe) && !sesLignes.some(function (l) { return l.obligation.indexOf("contact:oe-") === 0; }), "collègue : aucune donnée ni ligne de ces dossiers");

    // ---------- 390 px et thème sombre ----------
    const mobile = await nouvellePage(navigateur, { viewport: { width: 390, height: 844 } });
    await connecter(mobile, SOPHIE);
    await ouvrirSuivis(mobile);
    await mobile.evaluate(function () { document.documentElement.dataset.theme = "sombre"; });
    ligne = await trouverLigne(mobile, "contact:oe-" + b.oppId);
    await ligne.scrollIntoViewIfNeeded();
    const debordement = await mobile.evaluate(function () { return document.documentElement.scrollWidth - document.documentElement.clientWidth; });
    verifier(debordement === 0, "390 px, thème sombre : aucun défilement horizontal de la page (" + debordement + " px)");
    await mobile.screenshot({ path: "dedup-390-sombre.png" });
    await page.click("#onglet-a-traiter");
    ligne = await trouverLigne(page, "contact:oe-" + b.oppId);
    await ligne.screenshot({ path: "dedup-ligne-clair.png" });

    console.log("\nParcours de regroupement réussi (" + etape + " vérifications).");
  } catch (erreur) {
    console.error("\n" + erreur.message);
    await page.screenshot({ path: "e2e-dedup-echec.png" });
    code = 1;
  } finally {
    await navigateur.close();
  }
  process.exit(code);
})();
