// Test de bout en bout de la fonctionnalité 19 : parcours vendeur avec plusieurs opportunités réelles d'un même
// prospect, sur l'application réelle et MySQL. Chaque carte nomme son projet (Accueil, Centre d'actions, Mes suivis),
// chaque lien ouvre la bonne opportunité, chaque action reste sur son opportunité ; les modules de démonstration ne se
// rattachent jamais à un dossier réel ; un dossier à une seule opportunité reste aussi simple qu'avant.
// Prérequis et variables : les mêmes que modification-prospect.e2e.js (BASE_URL, CHROMIUM_PATH, MYSQL_CONTAINER, E2E_DB).
// Lancement : node parcours-multi-opportunites.e2e.js   (le paquet « playwright » doit être installé)
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

let etape = 0;
function verifier(condition, message) {
  etape += 1;
  if (!condition) throw new Error("Étape " + etape + " échouée : " + message);
  console.log("ok " + etape + " : " + message);
}

function sql(requete) {
  return execFileSync("docker", ["exec", CONTENEUR, "mysql", "-uphineas", "-pphineas_dev_password", "-N", "-B", "--default-character-set=utf8mb4", BASE, "-e", requete], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function jour(decalage) {
  const d = new Date();
  d.setDate(d.getDate() + decalage);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
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

async function creerProspect(page, nom) {
  await page.goto(BASE_URL + "/Prospects");
  await page.click(".pr-entete [data-ouvrir-creation]");
  await page.waitForSelector("#tiroir-prospect.show");
  await page.fill("#p-prenom", "Ana");
  await page.fill("#p-nom", nom);
  await page.fill("#p-courriel", nom.toLowerCase() + "@exemple.test");
  await page.click('label[for="p-pref-courriel"]');
  await page.selectOption("#p-source", "appel");
  await Promise.all([page.waitForNavigation(), page.click('#tiroir-prospect button[type="submit"]', { position: { x: 15, y: 15 } })]);
  return sql("SELECT Id FROM Prospects WHERE Nom = '" + nom + "'");
}

async function ouvrirFiche(page, prospectId, opportunite) {
  const reponse = await page.goto(BASE_URL + "/Prospects/Fiche/pe-" + prospectId + (opportunite ? "?opportunite=" + opportunite : ""));
  await page.waitForTimeout(700);
  return reponse;
}

async function onglet(page, nom) {
  await page.click("#onglet-" + nom);
  await page.waitForTimeout(250);
}

async function creerOpportunite(page, prospectId, titre) {
  await ouvrirFiche(page, prospectId);
  await onglet(page, "opportunites");
  await page.click('#panneau-opportunites [data-action="opportunite"]');
  await page.waitForSelector("#modal-opportunite.show");
  await page.fill("#o-titre", titre);
  await page.selectOption("#o-etape", "Nouveau");
  await Promise.all([page.waitForNavigation(), page.click('#form-opportunite button[type="submit"]')]);
  await page.waitForTimeout(400);
}

async function planifier(page, prospectId, oppId, action, decalage) {
  await ouvrirFiche(page, prospectId);
  await page.click('[data-action="suivi"]');
  await page.waitForSelector("#modal-suivi.show");
  await page.selectOption("#s-opp", "oe-" + oppId);
  await page.fill("#s-action", action);
  await page.fill("#s-date", jour(decalage));
  await Promise.all([page.waitForNavigation(), page.click('#form-suivi button[type="submit"]')]);
  await page.waitForTimeout(400);
}

// Opportunité sélectionnée sur la fiche (pastilles « Opportunité : … » de l'onglet Qualification).
async function selection(page) {
  await onglet(page, "qualification");
  return page.evaluate(function () {
    return Array.from(document.querySelectorAll('[data-zone="choix-opportunite"] [data-choix-opp]')).filter(function (x) { return x.getAttribute("aria-pressed") === "true"; }).map(function (x) { return x.dataset.choixOpp; }).join();
  });
}

// Ligne de « Mes suivis » (vue À traiter ou À venir) pour un sélecteur, en parcourant les pages.
async function ligne(page, liste, selecteur) {
  const premiere = page.locator('[data-zone="pagination-' + liste + '"] [data-aller-page="1"]:not([disabled])');
  if (await premiere.count()) { await premiere.first().click(); await page.waitForTimeout(150); }
  for (let numero = 1; numero <= 40; numero++) {
    const l = page.locator("#" + liste + " " + selecteur);
    if (await l.count()) return l.first();
    const suivante = page.locator('[data-zone="pagination-' + liste + '"] [data-aller-page="' + (numero + 1) + '"]:not([disabled])');
    if (!(await suivante.count())) return null;
    await suivante.first().click();
    await page.waitForTimeout(150);
  }
  return null;
}

(async function () {
  const navigateur = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const erreurs = [];
  try {
    const page = await nouvellePage(navigateur);
    page.on("pageerror", function (e) { if (String(e.message).indexOf("ViewTransition") < 0) erreurs.push(e.message); });
    await connecter(page, SOPHIE);

    // Prospect réel à deux projets : A (création) et B (fiche) ; demandes antidatées : première réponse due pour les deux.
    const p = await creerProspect(page, "Parcours" + suffixe);
    const titreA = sql("SELECT Titre FROM OpportunitesVente WHERE ProspectId = " + p);
    const titreB = "Deuxième véhicule " + suffixe;
    await creerOpportunite(page, p, titreB);
    const [a, b] = sql("SELECT GROUP_CONCAT(Id ORDER BY Id) FROM OpportunitesVente WHERE ProspectId = " + p).split(",");
    sql("UPDATE OpportunitesVente SET DateCreation = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 DAY) WHERE ProspectId = " + p);
    verifier(!!a && !!b && a !== b && titreA !== titreB, "prospect réel à deux opportunités : « " + titreA + " » et « " + titreB + " »");

    // ---------- Parcours A : Accueil ----------
    await page.goto(BASE_URL + "/Conseiller"); await page.waitForTimeout(1000);
    const accueil = await page.evaluate(function (ids) {
      return ids.map(function (id) {
        const carte = document.querySelector('[data-priorite][data-obligation="contact:oe-' + id + '"]');
        if (!carte) return null;
        return { type: carte.querySelector(".ph-focus-type").textContent, lien: carte.querySelector(".ph-focus-nom a").getAttribute("href") };
      });
    }, [a, b]);
    verifier(accueil[0] && accueil[1] && accueil[0].type.includes("Projet : " + titreA) && accueil[1].type.includes("Projet : " + titreB),
      "Accueil : deux priorités du même client, chacune nomme son projet (« " + (accueil[0] || {}).type + " » / « " + (accueil[1] || {}).type + " »)");
    await page.goto(BASE_URL + accueil[0].lien);
    verifier(await selection(page) === "oe-" + a, "Accueil, priorité de A : la fiche s'ouvre sur A");
    await page.goto(BASE_URL + "/Conseiller"); await page.waitForTimeout(800);
    await page.goto(BASE_URL + accueil[1].lien);
    verifier(await selection(page) === "oe-" + b, "retour à l'Accueil puis priorité de B : la fiche s'ouvre sur B");

    // ---------- Parcours B : Centre d'actions ----------
    await page.goto(BASE_URL + "/Intelligence"); await page.waitForTimeout(1000);
    const centre = await page.evaluate(function (ids) {
      return ids.map(function (id) {
        const carte = document.querySelector('[data-action-id="premiere-reponse:oe-' + id + '"]');
        // Ligne de la file du Centre (ou carte détaillée) : projet nommé ; « Fiche du client » vers l'opportunité.
        const fiche = Array.from(carte ? carte.querySelectorAll("a") : []).filter(function (x) { return (x.getAttribute("href") || "").indexOf("/Prospects/Fiche/") >= 0; })[0];
        return carte ? { projet: (carte.querySelector("[data-projet]") || {}).textContent || "", lien: fiche ? fiche.getAttribute("href") : "" } : null;
      });
    }, [a, b]);
    verifier(centre[0] && centre[1] && centre[0].projet.includes(titreA) && centre[1].projet.includes(titreB) &&
      centre[0].lien.endsWith("?opportunite=oe-" + a) && centre[1].lien.endsWith("?opportunite=oe-" + b),
      "Centre d'actions : deux cartes, chacune nomme son projet et ouvre sa propre opportunité");
    const jeton = await page.locator('input[name="__RequestVerificationToken"]').first().inputValue();
    await page.request.post(BASE_URL + "/Intelligence/MettreEnVeille", { form: { cle: "premiere-reponse:oe-" + a, jours: "3", etape: "Nouveau", retour: "/Intelligence", __RequestVerificationToken: jeton }, maxRedirects: 0 });
    await page.goto(BASE_URL + "/Intelligence"); await page.waitForTimeout(1000);
    const apresVeille = await page.evaluate(function (ids) {
      const I = window.Intelligence;
      return { veille: I.enVeille().map(function (x) { return x.id; }).filter(function (x) { return x.indexOf("pe-") < 0 && (x.indexOf(":oe-" + ids[0]) >= 0 || x.indexOf(":oe-" + ids[1]) >= 0); }),
        b: I.actives().some(function (x) { return x.id === "premiere-reponse:oe-" + ids[1]; }) };
    }, [a, b]);
    verifier(apresVeille.veille.join() === "premiere-reponse:oe-" + a && apresVeille.b && sql("SELECT COUNT(*) FROM VeillesRecommandation WHERE OpportuniteId = " + b) === "0",
      "veille de la première réponse de A : B reste présentée, aucune veille en base pour B");

    // ---------- Parcours C : Mes suivis ----------
    await planifier(page, p, a, "Rappeler A " + suffixe, 0);
    await planifier(page, p, b, "Rappeler B " + suffixe, 1);
    await page.goto(BASE_URL + "/Intelligence/Suivis"); await page.waitForTimeout(900);
    const ligneA = await ligne(page, "relances", 'tr[data-obligation="contact:oe-' + a + '"]');
    verifier(ligneA && (await ligneA.locator("[data-projet]").textContent()).includes(titreA) &&
      (await ligneA.locator("a.iv-nom").getAttribute("href")).endsWith("?opportunite=oe-" + a), "Mes suivis, À traiter : le suivi de A nomme son projet et ouvre A");
    await page.click("#onglet-a-venir"); await page.waitForTimeout(300);
    const ligneB = await ligne(page, "a-venir", 'tr[data-suivi="oe-' + b + '"]');
    verifier(ligneB && (await ligneB.textContent()).includes(titreB) && (await ligneB.locator("a.iv-nom").getAttribute("href")).endsWith("?opportunite=oe-" + b),
      "Mes suivis, À venir : le suivi de B nomme son projet et ouvre B");
    await page.click("#onglet-a-traiter"); await page.waitForTimeout(300);
    const realiserA = await ligne(page, "relances", 'tr[data-obligation="contact:oe-' + a + '"]');
    await Promise.all([page.waitForNavigation(), realiserA.locator("[data-realiser-suivi]").click()]);
    await page.waitForTimeout(500);
    verifier(sql("SELECT Cloture FROM HistoriquesSuiviOpportunite WHERE OpportuniteId = " + a) === "Realise" &&
      sql("SELECT ProchaineAction FROM OpportunitesVente WHERE Id = " + b) === "Rappeler B " + suffixe && sql("SELECT COUNT(*) FROM HistoriquesSuiviOpportunite WHERE OpportuniteId = " + b) === "0",
      "réalisation du suivi de A : B reste actif, sans historique");

    // ---------- Parcours D : fiche, notes et sélection ----------
    await ouvrirFiche(page, p, "oe-" + a);
    verifier(await selection(page) === "oe-" + a && await page.inputValue("#n-opp") === "oe-" + a, "fiche sur A : la note proposera A");
    await onglet(page, "historique");
    await page.selectOption("#n-type", "note");
    await page.fill("#n-resume", "Note sur A " + suffixe);
    await Promise.all([page.waitForNavigation(), page.click('#form-note button[type="submit"]')]);
    await page.waitForTimeout(500);
    verifier(sql("SELECT OpportuniteId FROM NotesProspect WHERE Contenu = 'Note sur A " + suffixe + "'") === a, "en base : la note est rattachée à A");
    await ouvrirFiche(page, p, "oe-" + b);
    await onglet(page, "historique");
    await page.selectOption("#n-opp", "");
    await page.selectOption("#n-type", "note");
    await page.fill("#n-resume", "Note générale " + suffixe);
    await Promise.all([page.waitForNavigation(), page.click('#form-note button[type="submit"]')]);
    await page.waitForTimeout(500);
    verifier(sql("SELECT IFNULL(OpportuniteId, 'aucune') FROM NotesProspect WHERE Contenu = 'Note générale " + suffixe + "'") === "aucune", "note volontairement générale : aucune opportunité, comme choisi");
    await ouvrirFiche(page, p, "oe-" + b);
    await page.reload(); await page.waitForTimeout(700);
    verifier(await selection(page) === "oe-" + b && sql("SELECT COUNT(*) FROM NotesProspect WHERE OpportuniteId = " + b) === "0", "après actualisation : toujours B, aucune note de A sur B");
    const bandeau = await page.locator("[data-mention-donnees]").first().textContent();
    verifier(bandeau.includes("et les opportunités ajoutées à leur fiche") && bandeau.indexOf("nouvelles opportunités, rendez-vous") < 0,
      "bandeau de la fiche : les opportunités ajoutées sont annoncées enregistrées (plus de mention locale trompeuse)");

    // ---------- Parcours E : soumissions et autres modules de démonstration ----------
    await onglet(page, "opportunites");
    const carteReelle = await page.evaluate(function () {
      const zone = document.querySelector('[data-zone="opportunites"]');
      return { creer: zone.querySelectorAll('a[href*="Nouvelle"], a[href*="Nouveau"]').length, mention: (zone.querySelector("[data-modules-demonstration]") || {}).textContent || "",
        lies: Array.from(zone.querySelectorAll("[data-modules-demonstration] a")).filter(function (x) { return x.getAttribute("href").indexOf("opportunite") >= 0; }).length };
    });
    verifier(carteReelle.creer === 0 && carteReelle.mention.includes("Pas encore enregistrés dans les dossiers réels") && carteReelle.mention.includes("Voir la démonstration des soumissions") && carteReelle.lies === 0,
      "opportunité réelle : aucune création de soumission, de rendez-vous ou de transaction ; la démonstration est annoncée, sans y rattacher le dossier");
    const etatAvant = sql("SELECT GROUP_CONCAT(CONCAT(Id, ':', Etape, ':', IFNULL(ProchaineAction, '-')) ORDER BY Id) FROM OpportunitesVente WHERE ProspectId = " + p);
    for (const url of ["/Soumissions/Nouvelle?opportunite=oe-" + b, "/RendezVous/Nouveau?opportunite=oe-" + b, "/Transactions/Nouvelle?opportunite=oe-" + b]) {
      await page.goto(BASE_URL + url); await page.waitForTimeout(800);
      const vue = await page.evaluate(function (nom) {
        return { note: !!document.querySelector("[data-demonstration-seulement]"), listeReel: document.querySelector('[data-zone="clients"]').textContent.indexOf(nom) >= 0 };
      }, "Parcours" + suffixe);
      verifier(vue.note && !vue.listeReel, url.split("?")[0] + " : démonstration annoncée, le dossier réel n'est ni proposé ni présélectionné");
    }
    verifier(sql("SELECT GROUP_CONCAT(CONCAT(Id, ':', Etape, ':', IFNULL(ProchaineAction, '-')) ORDER BY Id) FROM OpportunitesVente WHERE ProspectId = " + p) === etatAvant, "en base : rien n'a changé sur les opportunités réelles");

    // ---------- Parcours F : sécurité ----------
    function creerConseiller(courriel, concession) {
      sql("INSERT INTO AspNetUsers (Id, FirstName, LastName, DealershipId, IsActive, MustChangePassword, CreatedAt, UserName, NormalizedUserName, Email, NormalizedEmail, EmailConfirmed, PasswordHash, SecurityStamp, ConcurrencyStamp, PhoneNumberConfirmed, TwoFactorEnabled, LockoutEnabled, AccessFailedCount) " +
        "SELECT UUID(), 'Autre', 'Conseiller', " + concession + ", 1, 0, NOW(), '" + courriel + "', UPPER('" + courriel + "'), '" + courriel + "', UPPER('" + courriel + "'), 1, PasswordHash, UUID(), UUID(), 0, 0, 1, 0 FROM AspNetUsers WHERE Email = '" + SOPHIE + "'");
      sql("INSERT INTO AspNetUserRoles (UserId, RoleId) SELECT u.Id, r.Id FROM AspNetUsers u, AspNetRoles r WHERE u.Email = '" + courriel + "' AND r.Name = 'Conseiller'");
    }
    sql("UPDATE Dealerships SET IsActive = 1 WHERE Name = 'Garage Saint-Laurent'");
    const collegue = "collegue.parcours." + suffixe + "@autoprestige.example";
    const ailleurs = "ailleurs.parcours." + suffixe + "@garagestl.example";
    creerConseiller(collegue, "(SELECT DealershipId FROM (SELECT DealershipId FROM AspNetUsers WHERE Email = '" + SOPHIE + "') x)");
    creerConseiller(ailleurs, "(SELECT Id FROM Dealerships WHERE Name = 'Garage Saint-Laurent')");
    for (const courriel of [collegue, ailleurs]) {
      const v = await nouvellePage(navigateur);
      await connecter(v, courriel);
      const fiche = await v.goto(BASE_URL + "/Prospects/Fiche/pe-" + p + "?opportunite=oe-" + b);
      await v.goto(BASE_URL + "/Conseiller"); await v.waitForTimeout(800);
      const accueilIntrus = await v.content();
      await v.goto(BASE_URL + "/Intelligence/Suivis"); await v.waitForTimeout(800);
      const suivisIntrus = await v.content();
      verifier(fiche.status() === 404 && accueilIntrus.indexOf("Parcours" + suffixe) < 0 && suivisIntrus.indexOf("Parcours" + suffixe) < 0 && suivisIntrus.indexOf(titreB) < 0,
        (courriel === collegue ? "collègue" : "autre concession") + " : fiche refusée (404), aucun projet de ce client à l'Accueil ni dans Mes suivis");
      await v.context().close();
    }
    const seul = await creerProspect(page, "Seul" + suffixe);
    const oppSeul = sql("SELECT Id FROM OpportunitesVente WHERE ProspectId = " + seul);
    verifier((await ouvrirFiche(page, p, "oe-" + oppSeul)).status() === 404 && (await ouvrirFiche(page, p, "oe-999999999")).status() === 404 && (await ouvrirFiche(page, p, "oe-x")).status() === 404,
      "adresse forgée (opportunité d'un autre prospect, inexistante, illisible) : refusée, jamais une autre opportunité");

    // ---------- Parcours G : dossier à une seule opportunité ----------
    sql("UPDATE OpportunitesVente SET DateCreation = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 DAY) WHERE ProspectId = " + seul);
    await page.goto(BASE_URL + "/Conseiller"); await page.waitForTimeout(1000);
    const typeSeul = await page.evaluate(function (id) { const c = document.querySelector('[data-priorite][data-obligation="contact:oe-' + id + '"]'); return c ? c.querySelector(".ph-focus-type").textContent : null; }, oppSeul);
    verifier(typeSeul !== null && typeSeul.indexOf("Projet :") < 0, "dossier à une opportunité : la carte de l'Accueil reste comme avant, sans mention de projet");

    // ---------- Parcours H : projets semblables ----------
    const sem = await creerProspect(page, "Semblable" + suffixe);
    const titreSem = sql("SELECT Titre FROM OpportunitesVente WHERE ProspectId = " + sem);
    await creerOpportunite(page, sem, titreSem);
    const [s1, s2] = sql("SELECT GROUP_CONCAT(Id ORDER BY Id) FROM OpportunitesVente WHERE ProspectId = " + sem).split(",");
    sql("UPDATE OpportunitesVente SET DateCreation = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 DAY) WHERE ProspectId = " + sem);
    await page.goto(BASE_URL + "/Intelligence"); await page.waitForTimeout(1000);
    const semblables = await page.evaluate(function (ids) {
      return ids.map(function (id) { const c = document.querySelector('[data-action-id="premiere-reponse:oe-' + id + '"] [data-projet]'); return c ? c.textContent : ""; });
    }, [s1, s2]);
    verifier(semblables[0] && semblables[1] && semblables[0] !== semblables[1] && semblables[0].includes("n° " + s1) && semblables[1].includes("n° " + s2),
      "deux projets au même titre ouverts le même jour : distingués par leur numéro (« " + semblables.join(" » / « ") + " »)");

    // ---------- Affichage : 320, 390 et 1440 px, clair et sombre ----------
    for (const [largeur, theme] of [[320, "clair"], [320, "sombre"], [390, "clair"], [390, "sombre"], [1440, "clair"], [1440, "sombre"]]) {
      const v = await nouvellePage(navigateur, { viewport: { width: largeur, height: 900 } });
      await connecter(v, SOPHIE);
      let debord = 0;
      let projetVisible = true;
      for (const chemin of ["/Conseiller", "/Intelligence", "/Intelligence/Suivis", "/Prospects/Fiche/pe-" + p + "?opportunite=oe-" + b]) {
        await v.goto(BASE_URL + chemin); await v.waitForTimeout(800);
        if (theme === "sombre") await v.evaluate(function () { document.documentElement.dataset.theme = "sombre"; });
        debord += await v.evaluate(function () { return document.documentElement.scrollWidth - document.documentElement.clientWidth; });
        if (chemin === "/Intelligence") {
          projetVisible = projetVisible && await v.locator('[data-action-id="premiere-reponse:oe-' + b + '"] [data-projet]').first().isVisible();
        }
      }
      await v.screenshot({ path: "parcours-" + largeur + "-" + theme + ".png" });
      verifier(debord === 0 && projetVisible, largeur + " px, thème " + theme + " : projet lisible sans survol, aucun débordement");
      await v.context().close();
    }

    verifier(erreurs.length === 0, "aucune erreur JavaScript (" + JSON.stringify(erreurs) + ")");
    console.log("\nParcours multi-opportunités réussi (" + etape + " vérifications).");
  } catch (erreur) {
    console.error("\n" + erreur.message);
    process.exitCode = 1;
  } finally {
    await navigateur.close();
  }
})();
