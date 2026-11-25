// Test de bout en bout de la fonctionnalité 18 : plusieurs opportunités réelles pour un même prospect, sur
// l'application réelle et MySQL. Création depuis la fiche (jamais un deuxième prospect), sélection explicite, étapes,
// suivis et recommandations propres à chaque opportunité, sécurité conseiller / concession, ancien dossier à une
// seule opportunité, affichage 320, 390 et 1440 px en thèmes clair et sombre.
// Prérequis et variables : les mêmes que modification-prospect.e2e.js (BASE_URL, CHROMIUM_PATH, MYSQL_CONTAINER, E2E_DB).
// Lancement : node opportunites-multiples.e2e.js   (le paquet « playwright » doit être installé)
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

// Jour local du test (AAAA-MM-JJ), décalé de n jours : celui du navigateur.
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

// Ferme une fenêtre ou le tiroir par son bouton de fermeture, puis attend qu'il soit masqué.
async function fermer(page, selecteur) {
  await page.locator(selecteur + ' [data-bs-dismiss]').first().click();
  await page.waitForSelector(selecteur + ".show", { state: "detached" });
  await page.waitForTimeout(300);
}

async function onglet(page, nom) {
  await page.click("#onglet-" + nom);
  await page.waitForTimeout(250);
}

// Fenêtre « Nouvelle opportunité » de l'onglet Opportunités, remplie et envoyée.
async function creerOpportunite(page, titre, categorie, etapeInitiale) {
  await onglet(page, "opportunites");
  await page.click('#panneau-opportunites [data-action="opportunite"]');
  await page.waitForSelector("#modal-opportunite.show");
  await page.fill("#o-titre", titre);
  if (categorie) await page.selectOption("#o-categorie", categorie);
  await page.selectOption("#o-etape", etapeInitiale);
  await Promise.all([page.waitForNavigation(), page.click('#form-opportunite button[type="submit"]')]);
  await page.waitForTimeout(500);
}

const opportunites = (prospectId) => sql("SELECT GROUP_CONCAT(CONCAT(Id, ':', Etape, ':', IFNULL(ProchaineAction, '-')) ORDER BY Id SEPARATOR ',') FROM OpportunitesVente WHERE ProspectId = " + prospectId);
const ids = (prospectId) => sql("SELECT GROUP_CONCAT(Id ORDER BY Id) FROM OpportunitesVente WHERE ProspectId = " + prospectId).split(",");

(async function () {
  const navigateur = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const erreurs = [];
  try {
    const page = await nouvellePage(navigateur);
    page.on("pageerror", function (e) { if (String(e.message).indexOf("ViewTransition") < 0) erreurs.push(e.message); });
    await connecter(page, SOPHIE);

    // ---------- Parcours A : deuxième opportunité ----------
    const p = await creerProspect(page, "Multi" + suffixe);
    const prospectsAvant = sql("SELECT COUNT(*) FROM Prospects");
    await ouvrirFiche(page, p);
    await onglet(page, "opportunites");
    verifier(await page.locator("#panneau-opportunites article.pr-opp").count() === 1, "fiche : la première opportunité (création) est affichée");
    await page.click('#panneau-opportunites [data-action="opportunite"]');
    await page.waitForSelector("#modal-opportunite.show");
    verifier(await page.locator("[data-vehicules-locaux]").isHidden() && (await page.locator("[data-opp-mention]").textContent()).includes("enregistré dans son dossier"),
      "fenêtre : dossier enregistré, enregistrement annoncé, pas de véhicules envisagés locaux");
    await fermer(page, "#modal-opportunite");
    const titreB = "Deuxième véhicule " + suffixe;
    await creerOpportunite(page, titreB, "berline", "Nouveau");
    const [a, b] = ids(p);
    verifier(new URL(page.url()).search === "?opportunite=oe-" + b, "réussite serveur : retour sur la fiche, la nouvelle opportunité sélectionnée (" + page.url() + ")");
    verifier(sql("SELECT COUNT(*) FROM Prospects") === prospectsAvant && opportunites(p) === a + ":Nouveau:-," + b + ":Nouveau:-", "en base : un seul prospect, deux opportunités distinctes (" + opportunites(p) + ")");
    verifier(sql("SELECT CONCAT(Titre, '|', IFNULL(Categorie, '-')) FROM OpportunitesVente WHERE Id = " + b) === titreB + "|berline", "en base : titre et type de véhicule de la nouvelle opportunité");
    await page.reload(); await page.waitForTimeout(700);
    await onglet(page, "opportunites");
    verifier(await page.locator("#panneau-opportunites article.pr-opp").count() === 2, "après actualisation : les deux opportunités sont affichées");

    // Double clic sur « Créer l'opportunité » : une seule création.
    await onglet(page, "opportunites");
    await page.click('#panneau-opportunites [data-action="opportunite"]');
    await page.waitForSelector("#modal-opportunite.show");
    await page.fill("#o-titre", "Troisième projet " + suffixe);
    await Promise.all([page.waitForNavigation(), page.dblclick('#form-opportunite button[type="submit"]')]);
    await page.waitForTimeout(600);
    const c = ids(p)[2];
    verifier(ids(p).length === 3, "double clic : une seule opportunité de plus (" + ids(p).length + " au total)");

    // ---------- Parcours B : sélection explicite ----------
    await ouvrirFiche(page, p, "oe-" + a);
    await onglet(page, "qualification");
    const choix = async function () {
      return page.evaluate(function () {
        return Array.from(document.querySelectorAll('[data-zone="choix-opportunite"] [data-choix-opp]')).filter(function (x) { return x.getAttribute("aria-pressed") === "true"; }).map(function (x) { return x.dataset.choixOpp; });
      });
    };
    verifier((await choix()).join() === "oe-" + a && await page.locator('[data-zone="choix-opportunite"]').isVisible(), "adresse ?opportunite=oe-" + a + " : l'opportunité A est sélectionnée et le choix est visible");
    verifier(await page.inputValue("#n-opp") === "oe-" + a, "note : l'opportunité sélectionnée (A) est proposée, pas la première par défaut d'une autre");
    await page.click('[data-choix-opp="oe-' + b + '"]');
    await page.waitForTimeout(300);
    verifier((await choix()).join() === "oe-" + b && await page.inputValue("#n-opp") === "oe-" + b, "sélection de B : B est la seule opportunité sélectionnée, la note la suit");
    await page.click('[data-action="modifier"]');
    await page.waitForSelector("#tiroir-prospect.show");
    verifier((await page.locator("#tiroir-prospect").textContent()).includes("Opportunité modifiée : " + titreB), "« Modifier » indique clairement l'opportunité visée (B)");
    await fermer(page, "#tiroir-prospect");
    await page.click('[data-choix-opp="oe-' + a + '"]');
    await page.waitForTimeout(300);
    verifier((await choix()).join() === "oe-" + a && opportunites(p).split(",").length === 3, "retour à A : sélection exacte, aucune donnée modifiée");

    // ---------- Parcours C : étapes indépendantes ----------
    await ouvrirFiche(page, p);
    await onglet(page, "opportunites");
    await Promise.all([page.waitForNavigation(), page.selectOption('[data-etape-opp="oe-' + b + '"]', "Qualifie")]);
    await page.waitForTimeout(500);
    verifier(sql("SELECT Etape FROM OpportunitesVente WHERE Id = " + b) === "Qualifie" && sql("SELECT Etape FROM OpportunitesVente WHERE Id = " + a) === "Nouveau" &&
      sql("SELECT Etape FROM OpportunitesVente WHERE Id = " + c) === "AQualifier", "étape de B : « Qualifié » ; A et C inchangées");
    verifier(sql("SELECT COUNT(*) FROM HistoriquesEtapeOpportunite WHERE OpportuniteId = " + b) === "1" &&
      sql("SELECT COUNT(*) FROM HistoriquesEtapeOpportunite WHERE OpportuniteId IN (" + a + ", " + c + ")") === "0", "historique d'étape : celui de B seulement");
    verifier(new URL(page.url()).search === "?opportunite=oe-" + b, "après le changement : la fiche reste sur B");
    await onglet(page, "opportunites");
    verifier(await page.inputValue('[data-etape-opp="oe-' + a + '"]') === "Nouveau" && await page.inputValue('[data-etape-opp="oe-' + b + '"]') === "Qualifie", "fiche : chaque carte montre sa propre étape");

    // ---------- Parcours D : suivis indépendants ----------
    await page.click('[data-action="suivi"]');
    await page.waitForSelector("#modal-suivi.show");
    verifier(await page.inputValue("#s-opp") === "", "suivi ouvert sans opportunité : aucune n'est choisie à la place du conseiller");
    await page.fill("#s-action", "Rappeler pour A");
    await page.fill("#s-date", jour(0));
    await page.click('#form-suivi button[type="submit"]');
    await page.waitForTimeout(300);
    verifier(await page.locator("#modal-suivi.show").count() === 1 && await page.locator("#s-opp.is-invalid").count() === 1 && opportunites(p).indexOf("Rappeler") < 0,
      "envoi sans opportunité : refusé dans la fenêtre, rien d'enregistré");
    await page.selectOption("#s-opp", "oe-" + a);
    await Promise.all([page.waitForNavigation(), page.click('#form-suivi button[type="submit"]')]);
    await page.waitForTimeout(500);
    await page.click('[data-action="suivi"]');
    await page.waitForSelector("#modal-suivi.show");
    await page.selectOption("#s-opp", "oe-" + b);
    await page.fill("#s-action", "Rappeler pour B");
    await page.fill("#s-date", jour(1));
    await Promise.all([page.waitForNavigation(), page.click('#form-suivi button[type="submit"]')]);
    await page.waitForTimeout(500);
    verifier(sql("SELECT ProchaineAction FROM OpportunitesVente WHERE Id = " + a) === "Rappeler pour A" && sql("SELECT ProchaineAction FROM OpportunitesVente WHERE Id = " + b) === "Rappeler pour B",
      "en base : un suivi par opportunité");
    await page.goto(BASE_URL + "/Intelligence/Suivis"); await page.waitForTimeout(900);
    let realiser = page.locator('#relances [data-realiser-suivi="oe-' + a + '"]');
    for (let i = 0; i < 30 && !(await realiser.count()); i++) {
      const suivante = page.locator('[data-zone="pagination-relances"] [data-aller-page="' + (i + 2) + '"]:not([disabled])');
      if (!(await suivante.count())) break;
      await suivante.first().click(); await page.waitForTimeout(150);
    }
    await Promise.all([page.waitForNavigation(), realiser.first().click()]);
    await page.waitForTimeout(500);
    verifier(sql("SELECT IFNULL(ProchaineAction, '-') FROM OpportunitesVente WHERE Id = " + a) === "-" && sql("SELECT Cloture FROM HistoriquesSuiviOpportunite WHERE OpportuniteId = " + a) === "Realise",
      "réalisation du suivi de A : archivé « Réalisé »");
    verifier(sql("SELECT ProchaineAction FROM OpportunitesVente WHERE Id = " + b) === "Rappeler pour B" && sql("SELECT COUNT(*) FROM HistoriquesSuiviOpportunite WHERE OpportuniteId = " + b) === "0",
      "le suivi de B reste actif, sans historique");

    // ---------- Parcours E : intelligence commerciale ----------
    sql("UPDATE OpportunitesVente SET DateCreation = DATE_SUB(NOW(), INTERVAL 2 DAY) WHERE ProspectId = " + p);
    await page.goto(BASE_URL + "/Intelligence"); await page.waitForTimeout(1000);
    const intel = await page.evaluate(function (args) {
      const R = window.IntelligenceRegles, I = window.Intelligence;
      const groupes = R.regrouperObligations(I.actives({ conseiller: window.Prospects.moiId })).filter(function (g) { return g.raisons.some(function (r) { return r.prospectId === args.p; }); });
      return {
        groupes: groupes.map(function (g) { return g.id; }).sort(),
        opportunites: Array.from(new Set(groupes.map(function (g) { return g.principale.opportuniteId; }))).sort(),
        melange: groupes.some(function (g) { return new Set(g.raisons.map(function (r) { return r.opportuniteId; })).size > 1; }),
        liens: Array.from(document.querySelectorAll('a[href*="/Prospects/Fiche/' + args.p + '?opportunite="]')).map(function (x) { return x.getAttribute("href").split("=")[1]; }),
      };
    }, { p: "pe-" + p });
    // A (« Nouveau », créée il y a 2 jours) : prise de contact due. B (« Qualifié », suivi demain) et C (« À qualifier ») ont
    // leurs propres obligations, d'une autre nature : chacune reste rattachée à son opportunité.
    verifier(intel.groupes.indexOf("contact:oe-" + a) >= 0 && intel.opportunites.join() === ["oe-" + a, "oe-" + b, "oe-" + c].sort().join() && !intel.melange,
      "recommandations : chaque opportunité a ses obligations, aucune n'en mélange deux (" + intel.groupes.join(", ") + ")");
    verifier(intel.liens.length > 0 && intel.liens.every(function (x) { return ["oe-" + a, "oe-" + b, "oe-" + c].indexOf(x) >= 0; }),
      "liens vers la fiche : ils désignent l'opportunité concernée (" + Array.from(new Set(intel.liens)).join(", ") + ")");
    const jeton = await page.locator('input[name="__RequestVerificationToken"]').first().inputValue();
    await page.request.post(BASE_URL + "/Intelligence/MettreEnVeille", { form: { cle: "premiere-reponse:oe-" + a, jours: "3", etape: "Nouveau", retour: "/Intelligence", __RequestVerificationToken: jeton }, maxRedirects: 0 });
    await page.goto(BASE_URL + "/Intelligence"); await page.waitForTimeout(1000);
    const apresVeille = await page.evaluate(function (args) {
      const I = window.Intelligence;
      return { enVeille: I.enVeille().filter(function (x) { return x.prospectId === args.p; }).map(function (x) { return x.id; }),
        presentees: I.actives().filter(function (x) { return x.prospectId === args.p; }).map(function (x) { return x.id; }) };
    }, { p: "pe-" + p });
    const deBetC = apresVeille.presentees.filter(function (x) { return x.indexOf(":oe-" + b) >= 0 || x.indexOf(":oe-" + c) >= 0; });
    verifier(apresVeille.enVeille.join() === "premiere-reponse:oe-" + a && apresVeille.presentees.indexOf("premiere-reponse:oe-" + a) < 0 && deBetC.length >= 2,
      "veille de la première réponse de A : seule elle est en veille, les obligations de B et C restent présentées (" + deBetC.join(", ") + ")");
    const lienB = await page.evaluate(function (args) { return window.Prospects.urlFiche(args.p, args.o); }, { p: "pe-" + p, o: "oe-" + b });
    const ficheB = await page.goto(BASE_URL + lienB);
    await page.waitForTimeout(700);
    await onglet(page, "qualification");
    verifier(lienB === "/Prospects/Fiche/pe-" + p + "?opportunite=oe-" + b && ficheB.status() === 200 && (await choix()).join() === "oe-" + b,
      "lien d'une recommandation de B (" + lienB + ") : la fiche s'ouvre sur B");

    // ---------- Parcours F : sécurité ----------
    function creerConseiller(courriel, concession) {
      sql("INSERT INTO AspNetUsers (Id, FirstName, LastName, DealershipId, IsActive, MustChangePassword, CreatedAt, UserName, NormalizedUserName, Email, NormalizedEmail, EmailConfirmed, PasswordHash, SecurityStamp, ConcurrencyStamp, PhoneNumberConfirmed, TwoFactorEnabled, LockoutEnabled, AccessFailedCount) " +
        "SELECT UUID(), 'Autre', 'Conseiller', " + concession + ", 1, 0, NOW(), '" + courriel + "', UPPER('" + courriel + "'), '" + courriel + "', UPPER('" + courriel + "'), 1, PasswordHash, UUID(), UUID(), 0, 0, 1, 0 FROM AspNetUsers WHERE Email = '" + SOPHIE + "'");
      sql("INSERT INTO AspNetUserRoles (UserId, RoleId) SELECT u.Id, r.Id FROM AspNetUsers u, AspNetRoles r WHERE u.Email = '" + courriel + "' AND r.Name = 'Conseiller'");
    }
    sql("UPDATE Dealerships SET IsActive = 1 WHERE Name = 'Garage Saint-Laurent'");
    const collegue = "collegue.multi." + suffixe + "@autoprestige.example";
    const ailleurs = "ailleurs.multi." + suffixe + "@garagestl.example";
    creerConseiller(collegue, "(SELECT DealershipId FROM (SELECT DealershipId FROM AspNetUsers WHERE Email = '" + SOPHIE + "') x)");
    creerConseiller(ailleurs, "(SELECT Id FROM Dealerships WHERE Name = 'Garage Saint-Laurent')");
    const etatAvant = opportunites(p);
    for (const courriel of [collegue, ailleurs]) {
      const v = await nouvellePage(navigateur);
      await connecter(v, courriel);
      const fiche = await v.goto(BASE_URL + "/Prospects/Fiche/pe-" + p + "?opportunite=oe-" + b);
      await v.goto(BASE_URL + "/Prospects");
      const jetonIntrus = await v.locator('input[name="__RequestVerificationToken"]').first().inputValue();
      const creation = await v.request.post(BASE_URL + "/Prospects/CreerOpportunite", { form: { prospectId: "pe-" + p, titre: "Intrusion", etape: "Nouveau", version: "x", __RequestVerificationToken: jetonIntrus }, maxRedirects: 0 });
      const etapeIntrus = await v.request.post(BASE_URL + "/Prospects/ChangerEtape", { form: { opportuniteId: "oe-" + b, etape: "Negociation", version: "x", prospectId: "pe-" + p, retour: "fiche", __RequestVerificationToken: jetonIntrus }, maxRedirects: 0 });
      verifier(fiche.status() === 404 && creation.status() === 404 && etapeIntrus.status() === 404 && opportunites(p) === etatAvant,
        (courriel === collegue ? "collègue" : "autre concession") + " : fiche, création et changement d'étape refusés (404), rien n'a changé");
      await v.context().close();
    }
    const autre = await creerProspect(page, "Seul" + suffixe);
    const oppAutre = ids(autre)[0];
    verifier((await ouvrirFiche(page, p, "oe-" + oppAutre)).status() === 404 && (await ouvrirFiche(page, p, "oe-999999999")).status() === 404,
      "adresse avec l'opportunité d'un autre prospect ou inexistante : refusée, jamais une autre opportunité par défaut");

    // ---------- Parcours G : ancien dossier à une seule opportunité ----------
    await ouvrirFiche(page, autre);
    await onglet(page, "qualification");
    verifier(await page.locator('[data-zone="choix-opportunite"]').isHidden(), "dossier à une opportunité : pas de choix à faire");
    await page.click('[data-action="suivi"]');
    await page.waitForSelector("#modal-suivi.show");
    verifier(await page.inputValue("#s-opp") === "oe-" + oppAutre, "dossier à une opportunité : le suivi la propose directement, comme avant");
    await fermer(page, "#modal-suivi");

    // ---------- Affichage : 320, 390 et 1440 px, clair et sombre ----------
    for (const [largeur, theme] of [[320, "clair"], [320, "sombre"], [390, "clair"], [390, "sombre"], [1440, "clair"], [1440, "sombre"]]) {
      const v = await nouvellePage(navigateur, { viewport: { width: largeur, height: 900 } });
      await connecter(v, SOPHIE);
      await ouvrirFiche(v, p, "oe-" + b);
      if (theme === "sombre") await v.evaluate(function () { document.documentElement.dataset.theme = "sombre"; });
      let debord = 0;
      for (const nom of ["qualification", "opportunites"]) {
        await onglet(v, nom);
        debord += await v.evaluate(function () { return document.documentElement.scrollWidth - document.documentElement.clientWidth; });
      }
      await onglet(v, "qualification");
      const chipsVisibles = await v.locator('[data-choix-opp="oe-' + a + '"]').isVisible() && await v.locator('[data-choix-opp="oe-' + b + '"]').isVisible();
      await onglet(v, "opportunites");
      await v.click('#panneau-opportunites [data-action="opportunite"]');
      await v.waitForSelector("#modal-opportunite.show");
      debord += await v.evaluate(function () { return document.documentElement.scrollWidth - document.documentElement.clientWidth; });
      const boutonVisible = await v.locator('#form-opportunite button[type="submit"]').isVisible();
      await v.screenshot({ path: "multi-" + largeur + "-" + theme + ".png" });
      verifier(debord === 0 && chipsVisibles && boutonVisible, largeur + " px, thème " + theme + " : choix d'opportunité et création utilisables, sans débordement");
      await v.context().close();
    }

    verifier(erreurs.length === 0, "aucune erreur JavaScript (" + JSON.stringify(erreurs) + ")");
    console.log("\nParcours des opportunités multiples réussi (" + etape + " vérifications).");
  } catch (erreur) {
    console.error("\n" + erreur.message);
    process.exitCode = 1;
  } finally {
    await navigateur.close();
  }
})();
