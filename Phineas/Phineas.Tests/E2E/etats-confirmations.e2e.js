// Test de bout en bout : fiabilité des confirmations, états et indicateurs vendeur (fonctionnalité 16), sur
// l'application réelle et MySQL. Une réalisation enregistrée apparaît comme réalisée (preuve en base), une
// recommandation devenue inapplicable reste « obsolète » ; aucune action locale sur un dossier réel n'annonce une réussite
// (« Gagné », « Perdu », note, suivi) ; les compteurs comparables concordent ; les mentions réel/démonstration sont
// exactes ; un message du serveur n'est pas consommé par une page qui ne l'affiche pas.
// Prérequis et variables : les mêmes que modification-prospect.e2e.js (BASE_URL, CHROMIUM_PATH, MYSQL_CONTAINER, E2E_DB).
// Lancement : node etats-confirmations.e2e.js   (le paquet « playwright » doit être installé)
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

// Prospect réel (« Nouveau ») avec un suivi enregistré pour aujourd'hui.
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
  return { prospectId: ids[0], oppId: ids[1], suivi: "suivi-echeance:oe-" + ids[1] + ":" + jour(0) };
}

async function ouvrir(page, chemin) {
  await page.goto(BASE_URL + chemin);
  await page.waitForTimeout(900);
}

async function messageAffiche(page) {
  const toast = page.locator("#sv-toast [data-toast-texte]");
  await toast.waitFor({ state: "visible" });
  return toast.innerText();
}
async function toastVisible(page) {
  return page.locator("#sv-toast [data-toast-texte]").isVisible();
}

// Compteurs du Centre d'actions tels qu'affichés, et ceux du store.
async function compteursCentre(page) {
  return page.evaluate(function () {
    const n = function (s) { const e = document.querySelector(s); return e ? Number(e.textContent.trim()) : null; };
    const c = window.Intelligence.compteurs(window.Prospects.moiId);
    return { aTraiter: n('[data-compteur="aTraiter"]'), terminees: n('[data-compteur="terminees"]'), onglet: n('[data-champ="nb-file"]'),
      barre: n(".ph-nav .ph-nav-count"), recommandations: c.recommandations, store: c.aTraiter };
  });
}

// Statut affiché par le Centre pour une action hors file (onglet « Traitées et obsolètes »).
async function statutHistorique(page, id) {
  return page.evaluate(function (x) {
    const I = window.Intelligence;
    const dans = function (s) { return I.horsFile(s).some(function (a) { return a.id === x; }); };
    const a = I.action(x);
    return { statut: a ? a.statut : null, terminees: dans("Terminee"), obsoletes: dans("Obsolete") };
  }, id);
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

    // ---------- G1 : mentions ----------
    await ouvrir(page, "/Intelligence");
    verifier((await page.locator(".iv-chip-demo").textContent()).trim() === "Réel et démo" && (await page.locator(".iv-puces").getAttribute("title")).includes("sont enregistrés en base"),
      "Centre d'actions : pastille « Réel et démo », mention de ce qui est enregistré");
    await ouvrir(page, "/RendezVous");
    verifier((await page.locator(".ag-chip-demo").textContent()).trim() === "Démo" && (await page.locator(".ag-puces").getAttribute("title")).includes("ne sont pas enregistrées en base"),
      "Rendez-vous : module de démonstration, clairement identifié");
    await ouvrir(page, "/Conseiller");
    verifier(!(await page.locator("body").innerText()).includes("rien n'est enregistré") && (await page.locator("[data-mention-donnees]").textContent()).includes("Prospects et suivis enregistrés : réels"),
      "Accueil : plus de « rien n'est enregistré », mention exacte réel / démonstration");

    // ---------- Scénario A : réalisation réelle, reconnue comme telle ----------
    const a = await creer(page, "Realise" + suffixe);
    await ouvrir(page, "/Intelligence");
    const avant = await compteursCentre(page);
    verifier(avant.aTraiter === avant.onglet && avant.aTraiter === avant.barre && avant.aTraiter === avant.store,
      "compteurs comparables égaux : chiffre « à traiter », onglet « À traiter », barre latérale (" + avant.aTraiter + ")");
    await ouvrir(page, "/Intelligence/Suivis");
    await Promise.all([page.waitForNavigation(), page.locator('#relances [data-realiser-suivi="oe-' + a.oppId + '"]').click()]);
    verifier((await messageAffiche(page)).indexOf("marqué comme réalisé") >= 0, "confirmation du serveur après la réalisation");
    // Billet #87 : le suivi a été prévu pour jour(0), le jour de l'utilisateur (pas CURDATE(), jour UTC de MySQL).
    verifier(sql("SELECT CONCAT(Cloture, '|', DATE(DatePrevue) = '" + jour(0) + "') FROM HistoriquesSuiviOpportunite WHERE OpportuniteId = " + a.oppId) === "Realise|1", "en base : historique « Réalisé » du suivi prévu aujourd'hui");
    await ouvrir(page, "/Intelligence");
    let h = await statutHistorique(page, a.suivi);
    let c = await compteursCentre(page);
    verifier(h.statut === "Realisee" && h.terminees && !h.obsoletes, "Centre : le suivi réalisé est « Réalisée, enregistrée », pas « Devenue obsolète »");
    verifier(c.terminees === avant.terminees + 1, "« terminées aujourd'hui » + 1 (réalisation prouvée en base)");
    await page.click("#onglet-traitees");
    await page.selectOption("#f-traitees", "Terminee");
    await page.waitForTimeout(300);
    const ligne = page.locator('#traitees article[data-action-id="' + a.suivi + '"]');
    verifier(await ligne.count() === 1 && (await ligne.textContent()).includes("Réalisée, enregistrée"), "onglet « Traitées » : la réalisation est listée avec la mention « Réalisée, enregistrée »");
    await deconnecter(page);
    await connecter(page, SOPHIE);
    await ouvrir(page, "/Intelligence");
    h = await statutHistorique(page, a.suivi);
    verifier(h.statut === "Realisee" && (await compteursCentre(page)).terminees === c.terminees, "après reconnexion : même état, même compteur");

    // ---------- Scénario B : recommandation devenue inapplicable sans réalisation ----------
    const b = await creer(page, "Reporte" + suffixe);
    await ouvrir(page, "/Intelligence");
    const avantB = await compteursCentre(page);
    await ouvrir(page, "/Intelligence/Suivis");
    await page.locator('#relances [data-ia="reporter"][data-id="' + b.suivi + '"]').click();
    await page.waitForSelector(".modal.show #ia-date");
    await page.fill(".modal.show #ia-date", jour(3));
    await Promise.all([page.waitForNavigation(), page.click(".modal.show [data-ia-valider]")]);
    await messageAffiche(page);
    await ouvrir(page, "/Intelligence");
    h = await statutHistorique(page, b.suivi);
    verifier(h.statut === "Obsolete" && h.obsoletes && !h.terminees && (await compteursCentre(page)).terminees === avantB.terminees,
      "suivi reporté : « Devenue obsolète », jamais compté comme réalisé");

    // ---------- Deux suivis prévus le même jour : la réalisation de A n'est jamais attribuée à B ----------
    const m = await creer(page, "MemeJour" + suffixe);
    await ouvrir(page, "/Intelligence");
    await ouvrir(page, "/Intelligence/Suivis");
    await Promise.all([page.waitForNavigation(), page.locator('#relances [data-realiser-suivi="oe-' + m.oppId + '"]').click()]);
    await messageAffiche(page);
    await ouvrir(page, "/Intelligence");
    const apresA = await compteursCentre(page);
    verifier((await statutHistorique(page, m.suivi)).statut === "Realisee", "même jour, suivi A réalisé : « Réalisée, enregistrée »");
    await planifier(page, m.prospectId, "Rappeler pour l'essai", 0); // B : autre action, même jour prévu
    await ouvrir(page, "/Intelligence");
    verifier((await statutHistorique(page, m.suivi)).statut === "ATraiter", "suivi B du même jour : de nouveau à traiter");
    await ouvrir(page, "/Intelligence/Suivis");
    await page.locator('#relances [data-ia="reporter"][data-id="' + m.suivi + '"]').click();
    await page.waitForSelector(".modal.show #ia-date");
    await page.fill(".modal.show #ia-date", jour(3));
    await Promise.all([page.waitForNavigation(), page.click(".modal.show [data-ia-valider]")]);
    await messageAffiche(page);
    await ouvrir(page, "/Intelligence");
    h = await statutHistorique(page, m.suivi);
    verifier(h.statut === "Obsolete" && !h.terminees && (await compteursCentre(page)).terminees === apresA.terminees &&
      sql("SELECT GROUP_CONCAT(Cloture ORDER BY Id) FROM HistoriquesSuiviOpportunite WHERE OpportuniteId = " + m.oppId) === "Realise,Reporte",
      "B reporté : « Devenue obsolète », jamais réalisé grâce à A ; compteur inchangé ; base : Realise, Reporte");

    // ---------- Scénario C : fausses ventes ----------
    // Une transaction locale rattachée à une opportunité réelle (ce que permet l'assistant « Nouvelle transaction ») :
    // on reprend une transaction de démonstration livrée et on la rattache au dossier réel, dans l'onglet seulement.
    const d = await creer(page, "Vente" + suffixe);
    const etapeAvant = sql("SELECT Etape FROM OpportunitesVente WHERE Id = " + d.oppId);
    await ouvrir(page, "/Transactions");
    const tx = await page.evaluate(function (x) {
      const T = window.Transactions;
      const t = T.liste().find(function (y) { return y.statut === "Livree" || y.statut === "Cloturee" || (y.administratif && y.administratif.statut === "Confirme"); });
      // Même clé et même état initial que transactions-store.js (l'état n'est écrit qu'au premier changement).
      const charge = JSON.parse(document.getElementById("transactions-donnees").textContent);
      const cle = "phineas.salesos.transactions.v1:" + charge.conseillerNom;
      const etat = JSON.parse(sessionStorage.getItem(cle) || "null") || { transactions: charge.donnees.transactions, atelier: charge.donnees.atelier, statutsSimules: {}, compteur: 0 };
      const brut = etat.transactions.find(function (y) { return y.id === t.id; });
      brut.opportuniteId = "oe-" + x.oppId; brut.prospectId = "pe-" + x.prospectId; brut.statut = "Livree";
      sessionStorage.setItem(cle, JSON.stringify(etat));
      return t.id;
    }, d);
    await ouvrir(page, "/Transactions/Detail/" + tx);
    const avantVente = envois.length;
    verifier(await page.locator('[data-action="gagnee"], [data-tx="gagnee"], button:has-text("Marquer l\'opportunité comme gagnée")').count() === 0 &&
      await page.locator("[data-gagne-indisponible]").count() === 1, "Transactions, dossier réel : pas de « Marquer comme gagnée », une explication à la place");
    const gagne = await page.evaluate(function (id) { return window.Transactions.marquerGagnee(id); }, tx);
    verifier(gagne === null && sql("SELECT Etape FROM OpportunitesVente WHERE Id = " + d.oppId) === etapeAvant && envois.length === avantVente,
      "« Gagné » local refusé : aucune réussite, étape réelle inchangée en base (" + etapeAvant + ")");
    await ouvrir(page, "/Relations/Pertes");
    const perdu = await page.evaluate(function (id) { return window.RelationsClients.cloturer(id, { motif: "prix", origine: "client", etapeAtteinte: "Nouveau", restriction: "aucune" }); }, "oe-" + d.oppId);
    verifier(perdu && perdu.erreurs && /pas encore enregistrable/.test(perdu.erreurs.general || "") && sql("SELECT Etape FROM OpportunitesVente WHERE Id = " + d.oppId) === etapeAvant,
      "Relations : « Perdu » refusé sur un dossier réel, explication, étape réelle inchangée");
    await page.click('[data-rc="cloturer"]');
    await page.waitForSelector(".modal.show #rc-opp");
    verifier(await page.locator('.modal.show #rc-opp option[value="oe-' + d.oppId + '"]').count() === 0, "fenêtre de clôture : les dossiers enregistrés ne sont pas proposés");
    await page.keyboard.press("Escape");

    // ---------- Scénario D : notes et suivis de la page Véhicules ----------
    await ouvrir(page, "/Intelligence/Vehicules?opportunite=oe-" + d.oppId);
    const menu = await page.evaluate(function () {
      const m = document.querySelector(".ivv-proposer .dropdown-menu");
      return m ? { noter: !!m.querySelector("[data-noter]"), envisager: !!m.querySelector("[data-envisager]"), fiche: (m.querySelector("[data-noter-fiche]") || {}).href || "" } : null;
    });
    verifier(menu && !menu.noter && !menu.envisager && menu.fiche.indexOf("/Prospects/Fiche/pe-" + d.prospectId + "?opportunite=oe-" + d.oppId + "#historique") >= 0, // F19 : l'opportunité est désignée
      "Véhicules, dossier réel : « Ajouter une note dans la fiche » (bon prospect), plus de note ni d'option envisagée locales");
    verifier(await page.evaluate(function (id) { return !document.querySelector('#d-opportunite option[value="' + id + '"]'); }, "oe-" + d.oppId),
      "demande de recherche : un dossier enregistré n'est pas proposé (aucune demande locale)");
    const avantNote = envois.length;
    const refus = await page.evaluate(function (x) {
      const P = window.Prospects;
      return { note: P.ajouterNote("pe-" + x.prospectId, { type: "note", opportuniteId: "oe-" + x.oppId, resume: "x" }), suivi: P.planifierSuivi("oe-" + x.oppId, "x", new Date()) };
    }, d);
    verifier(refus.note === null && refus.suivi === false && envois.length === avantNote && sql("SELECT COUNT(*) FROM NotesProspect WHERE ProspectId = " + d.prospectId) === "0",
      "note et suivi locaux refusés sur le dossier réel : rien d'annoncé, rien en base");
    await page.goto(menu.fiche); await page.waitForTimeout(600);
    verifier(new URL(page.url()).pathname === "/Prospects/Fiche/pe-" + d.prospectId, "le lien ouvre la fiche du bon prospect");
    await page.click("#onglet-historique");
    await page.locator("#form-note").waitFor({ state: "visible" });
    await page.selectOption("#n-type", "note");
    await page.selectOption("#n-opp", "oe-" + d.oppId);
    await page.fill("#n-resume", "Véhicule repéré : Kia Sportage.");
    await Promise.all([page.waitForNavigation(), page.click('#form-note button[type="submit"]')]);
    verifier(sql("SELECT COUNT(*) FROM NotesProspect WHERE ProspectId = " + d.prospectId) === "1", "la note saisie dans la fiche est enregistrée sur le bon dossier");
    await ouvrir(page, "/Intelligence/Vehicules?opportunite=o-chloe-rav4");
    const demoMenu = await page.evaluate(function () { const m = document.querySelector(".ivv-proposer .dropdown-menu"); return m ? !!m.querySelector("[data-noter]") : false; });
    if (demoMenu) {
      const avantDemo = envois.length;
      await page.locator(".ivv-proposer button[data-bs-toggle]").first().click();
      await page.locator(".ivv-proposer [data-noter]").first().click();
      verifier((await messageAffiche(page)).includes("démonstration") && envois.length === avantDemo, "démonstration : note locale signalée comme telle, aucun envoi");
    }

    // ---------- Scénario E : compteurs ----------
    const e = await creer(page, "Compte" + suffixe);
    await ouvrir(page, "/Intelligence");
    c = await compteursCentre(page);
    const resultat = await page.locator("#resultat").innerText();
    verifier(c.aTraiter === c.onglet && c.aTraiter === c.barre && c.recommandations > c.aTraiter && /\(\d+ recommandations\)/.test(resultat),
      "deux raisons, une obligation : « à traiter » " + c.aTraiter + " obligations, " + c.recommandations + " recommandations distinguées");
    await ouvrir(page, "/Conseiller");
    const phrase = await page.evaluate(function () {
      const R = window.IntelligenceRegles, I = window.Intelligence, P = window.Prospects;
      const n = R.prioritesAccueil(R.actionsGardees(I.actives({ conseiller: P.moiId })), new Date(), Infinity).length;
      return { n: n, texte: document.body.innerText };
    });
    verifier(phrase.n > 3 ? phrase.texte.includes(phrase.n + " priorités aujourd'hui") : true, "Accueil : la phrase compte toutes les priorités du jour (" + phrase.n + "), pas seulement les 3 cartes");

    // ---------- Scénario G : messages du serveur ----------
    const g = await creer(page, "Message" + suffixe);
    await ouvrir(page, "/Intelligence");
    const version = await page.evaluate(function (id) { return window.Prospects.opportunite(id).versionSuivi; }, "oe-" + g.oppId);
    const jeton = await page.locator('input[name="__RequestVerificationToken"]').first().inputValue();
    await page.request.post(BASE_URL + "/Prospects/RealiserSuivi", { form: { opportuniteId: "oe-" + g.oppId, versionSuivi: version, retour: "/Intelligence", __RequestVerificationToken: jeton }, maxRedirects: 0 });
    await ouvrir(page, "/Outils/Performances");
    verifier(!(await toastVisible(page)), "page Performances : le message n'y est ni affiché ni consommé");
    await ouvrir(page, "/Intelligence");
    verifier((await messageAffiche(page)).includes("marqué comme réalisé"), "puis le Centre d'actions l'affiche");
    await ouvrir(page, "/Intelligence");
    verifier(!(await toastVisible(page)), "il n'est pas répété ensuite");

    // ---------- Isolation : un collègue ne voit pas les réalisations de Sophie ----------
    sql("INSERT INTO AspNetUsers (Id, FirstName, LastName, DealershipId, IsActive, MustChangePassword, CreatedAt, UserName, NormalizedUserName, Email, NormalizedEmail, EmailConfirmed, PasswordHash, SecurityStamp, ConcurrencyStamp, PhoneNumberConfirmed, TwoFactorEnabled, LockoutEnabled, AccessFailedCount) " +
      "SELECT UUID(), 'Lea', 'Conseiller', DealershipId, 1, 0, NOW(), 'collegue.etats." + suffixe + "@autoprestige.example', UPPER('collegue.etats." + suffixe + "@autoprestige.example'), 'collegue.etats." + suffixe + "@autoprestige.example', UPPER('collegue.etats." + suffixe + "@autoprestige.example'), 1, PasswordHash, UUID(), UUID(), 0, 0, 1, 0 FROM AspNetUsers WHERE Email = '" + SOPHIE + "'");
    sql("INSERT INTO AspNetUserRoles (UserId, RoleId) SELECT u.Id, r.Id FROM AspNetUsers u, AspNetRoles r WHERE u.Email = 'collegue.etats." + suffixe + "@autoprestige.example' AND r.Name = 'Conseiller'");
    const autre = await nouvellePage(navigateur);
    await connecter(autre, "collegue.etats." + suffixe + "@autoprestige.example");
    await ouvrir(autre, "/Intelligence");
    const vuCollegue = await autre.evaluate(function (id) {
      const P = window.Prospects;
      const evenements = P.contacts().reduce(function (n, c) { return n + P.interactionsDe(c.id).filter(function (i) { return i.type === "suivi-realise" && String(i.id).indexOf("ie-s") === 0; }).length; }, 0);
      return { dossier: !!P.opportunite(id), evenements: evenements };
    }, "oe-" + a.oppId);
    verifier(!vuCollegue.dossier && vuCollegue.evenements === 0, "collègue : ne voit ni le dossier ni aucune réalisation enregistrée de Sophie");
    await autre.context().close();

    // ---------- Largeurs et thèmes ----------
    for (const [largeur, theme] of [[320, "clair"], [320, "sombre"], [390, "clair"], [390, "sombre"], [1440, "clair"], [1440, "sombre"]]) {
      const v = await nouvellePage(navigateur, { viewport: { width: largeur, height: 900 } });
      await connecter(v, SOPHIE);
      let debord = 0;
      for (const chemin of ["/Intelligence", "/Intelligence/Vehicules?opportunite=oe-" + d.oppId, "/Transactions/Detail/" + tx, "/Conseiller"]) {
        await ouvrir(v, chemin);
        if (theme === "sombre") await v.evaluate(function () { document.documentElement.dataset.theme = "sombre"; });
        await v.waitForTimeout(150);
        debord += await v.evaluate(function () { return document.documentElement.scrollWidth - document.documentElement.clientWidth; });
      }
      await v.goto(BASE_URL + "/Intelligence"); await v.waitForTimeout(700);
      if (theme === "sombre") await v.evaluate(function () { document.documentElement.dataset.theme = "sombre"; });
      await v.locator(".iv-puces").screenshot({ path: "etats-pastille-" + largeur + "-" + theme + ".png" });
      verifier(debord === 0, largeur + " px, thème " + theme + " : Centre, Véhicules, transaction et Accueil sans débordement");
      await v.context().close();
    }

    verifier(erreurs.length === 0, "aucune erreur JavaScript (" + JSON.stringify(erreurs) + ")");
    console.log("\nParcours des états et confirmations réussi (" + etape + " vérifications).");
  } catch (erreur) {
    console.error("\n" + erreur.message);
    await page.screenshot({ path: "e2e-etats-echec.png" });
    code = 1;
  } finally {
    await navigateur.close();
  }
  process.exit(code);
})();
