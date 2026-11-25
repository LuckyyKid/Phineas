// Test de bout en bout de la fonctionnalité 20 : qualification commerciale enregistrée d'une opportunité réelle, sur
// l'application réelle et MySQL. Enregistrée en base, retrouvée après actualisation et reconnexion, propre à son
// opportunité, protégée contre une page périmée et contre les autres conseillers ; la démonstration reste locale et
// l'annonce ; un ancien état de l'onglet ne masque jamais la valeur du serveur ; ni contact, ni étape, ni suivi.
// Prérequis et variables : les mêmes que modification-prospect.e2e.js (BASE_URL, CHROMIUM_PATH, MYSQL_CONTAINER, E2E_DB).
// Lancement : node qualification-opportunites.e2e.js   (le paquet « playwright » doit être installé)
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

// Qualification enregistrée d'une opportunité, en une ligne comparable.
function enBase(oppId) {
  return sql("SELECT CONCAT_WS('|', IFNULL(Categorie,'-'), IFNULL(EtatVehicule,'-'), IFNULL(Marques,'-'), IFNULL(Modele,'-'), IFNULL(Places,'-'), IFNULL(Caracteristiques,'-'), " +
    "IFNULL(Utilisation,'-'), IFNULL(BudgetTotal,'-'), IFNULL(BudgetMensuel,'-'), IFNULL(ModeAchat,'-'), IFNULL(Reprise,'-'), IFNULL(RepriseDetail,'-'), IFNULL(Horizon,'-'), " +
    "IFNULL(DATE_FORMAT(DateCible,'%Y-%m-%d'),'-'), IFNULL(ElementsDecision,'-'), IFNULL(Objections,'-')) FROM OpportunitesVente WHERE Id = " + oppId);
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

async function ouvrirQualification(page, prospectId, opportunite) {
  await page.goto(BASE_URL + "/Prospects/Fiche/pe-" + prospectId + (opportunite ? "?opportunite=" + opportunite : ""));
  await page.waitForTimeout(700);
  await page.click("#onglet-qualification");
  await page.waitForTimeout(250);
}

async function cocher(page, id) {
  await page.click('label[for="' + id + '"]');
}

async function enregistrer(page) {
  await Promise.all([page.waitForNavigation(), page.click('#form-qualification button[type="submit"]')]);
  await page.waitForTimeout(600);
}

async function message(page) {
  const toast = page.locator("#sv-toast [data-toast-texte]");
  await toast.waitFor({ state: "visible" });
  return (await toast.textContent()).trim();
}

// Valeurs affichées par le formulaire (celles qu'il enverrait).
async function formulaire(page) {
  return page.evaluate(function () {
    const f = document.getElementById("form-qualification");
    const coches = function (nom) { return Array.from(f.querySelectorAll('input[name="' + nom + '"]:checked')).map(function (x) { return x.value; }).join(","); };
    return { categorie: f.elements.categorie.value, etat: coches("etat"), marques: f.elements.marques.value, modeles: f.elements.modeles.value, places: f.elements.places.value,
      caracteristiques: coches("caracteristiques"), budgetMensuel: f.elements.budgetMensuel.value, objections: f.elements.objections.value,
      decision: coches("elementsDecision"), preferenceVerrouillee: f.elements.contactPrefere.disabled };
  });
}

async function choisirOpportunite(page, oppId) {
  await page.click('[data-choix-opp="oe-' + oppId + '"]');
  await page.waitForTimeout(300);
}

(async function () {
  const navigateur = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const erreurs = [];
  try {
    const page = await nouvellePage(navigateur);
    page.on("pageerror", function (e) { if (String(e.message).indexOf("ViewTransition") < 0) erreurs.push(e.message); });
    await connecter(page, SOPHIE);

    // ---------- Parcours A : première qualification ----------
    const p = await creerProspect(page, "Qualif" + suffixe);
    const a = sql("SELECT Id FROM OpportunitesVente WHERE ProspectId = " + p);
    const etapeAvant = sql("SELECT CONCAT(Etape, '|', IFNULL(ProchaineAction,'-'), '|', DerniereActivite) FROM OpportunitesVente WHERE Id = " + a);
    await ouvrirQualification(page, p);
    let f = await formulaire(page);
    verifier(await page.locator('[data-zone="choix-opportunite"]').isHidden() && f.etat === "" && f.objections === "" && f.preferenceVerrouillee,
      "projet unique : qualification directement accessible, vide (rien d'inventé), préférences du contact en lecture seule");
    await page.selectOption("#q-categorie", "vus");
    await cocher(page, "q-etat-occasion");
    await page.fill("#q-marques", "Kia, Hyundai");
    await page.fill("#q-modeles", "Sportage");
    await page.selectOption("#q-places", "5");
    await cocher(page, "q-car-ti");
    await page.fill("#q-budget-total", "32000");
    await page.fill("#q-budget-mensuel", "450");
    await cocher(page, "q-reprise-oui");
    await page.fill("#q-reprise-detail", "Civic 2016");
    await cocher(page, "q-horizon-30j");
    await cocher(page, "q-dec-prix");
    await page.fill("#q-objections", "Hésite sur la mensualité " + suffixe);
    await enregistrer(page);
    verifier(new URL(page.url()).search === "?opportunite=oe-" + a && new URL(page.url()).hash === "#qualification" && await message(page) === "Qualification enregistrée.",
      "réussite confirmée par le serveur, retour sur la qualification de cette opportunité");
    const attenduA = "vus|occasion|Kia, Hyundai|Sportage|5|ti|-|32000.00|450.00|-|oui|Civic 2016|30j|-|prix|Hésite sur la mensualité " + suffixe;
    verifier(enBase(a) === attenduA, "en base : la qualification complète, sur la bonne opportunité (" + enBase(a) + ")");
    await page.reload(); await page.waitForTimeout(700);
    await page.click("#onglet-qualification"); await page.waitForTimeout(250);
    f = await formulaire(page);
    verifier(f.etat === "occasion" && f.marques === "Kia, Hyundai" && f.caracteristiques === "ti" && f.objections === "Hésite sur la mensualité " + suffixe, "après actualisation : valeurs relues du serveur");
    await deconnecter(page);
    await connecter(page, SOPHIE);
    await ouvrirQualification(page, p);
    f = await formulaire(page);
    verifier(f.budgetMensuel === "450.00" || f.budgetMensuel === "450", "après reconnexion : mêmes valeurs (budget mensuel « " + f.budgetMensuel + " »)");

    // ---------- Parcours B : modification ----------
    await page.fill("#q-budget-mensuel", "520");
    await enregistrer(page);
    verifier(enBase(a) === attenduA.replace("450.00", "520.00"), "modification : le budget mensuel change, tout le reste est conservé");

    // ---------- Parcours C : deux opportunités ----------
    await page.goto(BASE_URL + "/Prospects/Fiche/pe-" + p); await page.waitForTimeout(600);
    await page.click("#onglet-opportunites");
    await page.click('#panneau-opportunites [data-action="opportunite"]');
    await page.waitForSelector("#modal-opportunite.show");
    await page.fill("#o-titre", "Deuxième véhicule " + suffixe);
    await page.selectOption("#o-etape", "Nouveau");
    await Promise.all([page.waitForNavigation(), page.click('#form-opportunite button[type="submit"]')]);
    await page.waitForTimeout(500);
    const b = sql("SELECT MAX(Id) FROM OpportunitesVente WHERE ProspectId = " + p);
    await ouvrirQualification(page, p, "oe-" + b);
    f = await formulaire(page);
    verifier(f.etat === "" && f.objections === "" && f.categorie === "", "B : sa qualification est vide, rien de A n'est recopié");
    await page.selectOption("#q-categorie", "berline");
    await cocher(page, "q-etat-neuf");
    await page.fill("#q-objections", "Projet B " + suffixe);
    await enregistrer(page);
    await choisirOpportunite(page, a);
    const fa = await formulaire(page);
    await choisirOpportunite(page, b);
    const fb = await formulaire(page);
    verifier(fa.categorie === "vus" && fa.etat === "occasion" && fb.categorie === "berline" && fb.etat === "neuf" && fb.objections === "Projet B " + suffixe,
      "sélection de A puis de B : chacune affiche sa propre qualification");
    await choisirOpportunite(page, a);
    await page.selectOption("#q-places", "7");
    await enregistrer(page);
    verifier(enBase(a).split("|")[4] === "7" && enBase(b) === "berline|neuf|-|-|-|-|-|-|-|-|-|-|-|-|-|Projet B " + suffixe, "modification de A : B reste inchangée");

    // ---------- Parcours D : concurrence ----------
    const autreOnglet = await nouvellePage(navigateur);
    await connecter(autreOnglet, SOPHIE);
    await ouvrirQualification(autreOnglet, p, "oe-" + a);
    await ouvrirQualification(page, p, "oe-" + a);
    await page.fill("#q-budget-mensuel", "600");
    await enregistrer(page);
    await autreOnglet.fill("#q-budget-mensuel", "999");
    await enregistrer(autreOnglet);
    const refus = await message(autreOnglet);
    await autreOnglet.click("#onglet-qualification"); await autreOnglet.waitForTimeout(250);
    verifier(refus.includes("modifié entre-temps") && enBase(a).split("|")[8] === "600.00" && (await formulaire(autreOnglet)).budgetMensuel.indexOf("600") === 0,
      "page périmée : refus expliqué, aucune réussite annoncée, la valeur la plus récente (600) est gardée et réaffichée");
    await autreOnglet.context().close();

    // ---------- Parcours E : sécurité ----------
    function creerConseiller(courriel, concession) {
      sql("INSERT INTO AspNetUsers (Id, FirstName, LastName, DealershipId, IsActive, MustChangePassword, CreatedAt, UserName, NormalizedUserName, Email, NormalizedEmail, EmailConfirmed, PasswordHash, SecurityStamp, ConcurrencyStamp, PhoneNumberConfirmed, TwoFactorEnabled, LockoutEnabled, AccessFailedCount) " +
        "SELECT UUID(), 'Autre', 'Conseiller', " + concession + ", 1, 0, NOW(), '" + courriel + "', UPPER('" + courriel + "'), '" + courriel + "', UPPER('" + courriel + "'), 1, PasswordHash, UUID(), UUID(), 0, 0, 1, 0 FROM AspNetUsers WHERE Email = '" + SOPHIE + "'");
      sql("INSERT INTO AspNetUserRoles (UserId, RoleId) SELECT u.Id, r.Id FROM AspNetUsers u, AspNetRoles r WHERE u.Email = '" + courriel + "' AND r.Name = 'Conseiller'");
    }
    sql("UPDATE Dealerships SET IsActive = 1 WHERE Name = 'Garage Saint-Laurent'");
    const collegue = "collegue.qualif." + suffixe + "@autoprestige.example";
    const ailleurs = "ailleurs.qualif." + suffixe + "@garagestl.example";
    creerConseiller(collegue, "(SELECT DealershipId FROM (SELECT DealershipId FROM AspNetUsers WHERE Email = '" + SOPHIE + "') x)");
    creerConseiller(ailleurs, "(SELECT Id FROM Dealerships WHERE Name = 'Garage Saint-Laurent')");
    const avantIntrus = enBase(a);
    for (const courriel of [collegue, ailleurs]) {
      const v = await nouvellePage(navigateur);
      await connecter(v, courriel);
      await v.goto(BASE_URL + "/Prospects");
      const jeton = await v.locator('input[name="__RequestVerificationToken"]').first().inputValue();
      const r = await v.request.post(BASE_URL + "/Prospects/Qualifier", { form: { prospectId: "pe-" + p, opportuniteId: "oe-" + a, version: "x", champs: "objections", objections: "Intrusion", __RequestVerificationToken: jeton }, maxRedirects: 0 });
      verifier(r.status() === 404 && enBase(a) === avantIntrus, (courriel === collegue ? "collègue" : "autre concession") + " : qualification refusée (404), rien d'écrit");
      await v.context().close();
    }
    const autre = await creerProspect(page, "Autre" + suffixe);
    const oppAutre = sql("SELECT Id FROM OpportunitesVente WHERE ProspectId = " + autre);
    await page.goto(BASE_URL + "/Prospects/Fiche/pe-" + p); await page.waitForTimeout(500);
    const jetonSophie = await page.locator('input[name="__RequestVerificationToken"]').first().inputValue();
    const croise = await page.request.post(BASE_URL + "/Prospects/Qualifier", { form: { prospectId: "pe-" + p, opportuniteId: "oe-" + oppAutre, version: "x", champs: "objections", objections: "Croisé", __RequestVerificationToken: jetonSophie }, maxRedirects: 0 });
    const sansJeton = await page.request.post(BASE_URL + "/Prospects/Qualifier", { form: { prospectId: "pe-" + p, opportuniteId: "oe-" + a, version: "x", champs: "objections", objections: "Sans jeton" }, maxRedirects: 0 });
    verifier(croise.status() === 404 && sansJeton.status() === 400 && enBase(a) === avantIntrus && sql("SELECT IFNULL(Objections, '-') FROM OpportunitesVente WHERE Id = " + oppAutre) === "-",
      "opportunité d'un autre prospect (404) et envoi sans jeton (400) : rien d'écrit");

    // ---------- Parcours F : démonstration et ancien état de l'onglet ----------
    await page.goto(BASE_URL + "/Prospects/Fiche/chloe-bouchard"); await page.waitForTimeout(700);
    await page.click("#onglet-qualification"); await page.waitForTimeout(250);
    verifier(!(await formulaire(page)).preferenceVerrouillee, "démonstration : préférences modifiables comme avant");
    await page.click('#form-qualification button[type="submit"]');
    verifier((await message(page)).includes("localement (non enregistrée en base)"), "démonstration : la qualification reste locale et le dit");
    await page.evaluate(function (id) {
      const cle = Object.keys(sessionStorage).filter(function (k) { return k.indexOf("phineas.salesos.prospects.v1:") === 0; })[0];
      const etat = JSON.parse(sessionStorage.getItem(cle));
      etat.opportunites.forEach(function (o) { if (o.id === "oe-" + id) o.qualification = { categorie: "coupe", objections: "Ancienne valeur locale" }; });
      sessionStorage.setItem(cle, JSON.stringify(etat));
    }, a);
    await ouvrirQualification(page, p, "oe-" + a);
    f = await formulaire(page);
    verifier(f.categorie === "vus" && f.objections === "Hésite sur la mensualité " + suffixe, "ancien état de l'onglet pour un dossier réel : la valeur du serveur est affichée, pas l'ancienne valeur locale");

    // ---------- Parcours G : ce que la qualification ne change pas ----------
    verifier(sql("SELECT CONCAT(Etape, '|', IFNULL(ProchaineAction,'-'), '|', DerniereActivite) FROM OpportunitesVente WHERE Id = " + a) === etapeAvant &&
      sql("SELECT COUNT(*) FROM NotesProspect WHERE ProspectId = " + p) === "0" && sql("SELECT COUNT(*) FROM HistoriquesSuiviOpportunite WHERE OpportuniteId IN (" + a + "," + b + ")") === "0" &&
      sql("SELECT COUNT(*) FROM HistoriquesEtapeOpportunite WHERE OpportuniteId IN (" + a + "," + b + ")") === "0",
      "en base : étape, suivi, activité, notes et historiques inchangés par les qualifications");
    sql("UPDATE OpportunitesVente SET DateCreation = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 DAY) WHERE Id = " + a);
    await page.goto(BASE_URL + "/Intelligence"); await page.waitForTimeout(1000);
    const premiere = await page.evaluate(function (id) { return window.Intelligence.actives().some(function (x) { return x.id === "premiere-reponse:oe-" + id; }); }, a);
    verifier(premiere, "la première réponse reste due : une qualification n'est pas un contact déclaré");

    // ---------- Parcours H : complétude et « qualification manquante » à partir des valeurs enregistrées ----------
    // Règle existante (intelligence-regles.js) : opportunité « Nouveau » ou « À qualifier » sans première réponse due,
    // moins de 5 informations sur les 10 comptées par prospects-store.js (CHAMPS_QUALIF). Les caractéristiques, la mise
    // de fonds, la précision de reprise et les objections sont enregistrées mais ne sont pas comptées.
    async function nouvelleOpportunite(titre) {
      await page.goto(BASE_URL + "/Prospects/Fiche/pe-" + p); await page.waitForTimeout(500);
      await page.click("#onglet-opportunites");
      await page.click('#panneau-opportunites [data-action="opportunite"]');
      await page.waitForSelector("#modal-opportunite.show");
      await page.fill("#o-titre", titre);
      await page.selectOption("#o-etape", "AQualifier");
      await Promise.all([page.waitForNavigation(), page.click('#form-opportunite button[type="submit"]')]);
      await page.waitForTimeout(400);
      return sql("SELECT MAX(Id) FROM OpportunitesVente WHERE ProspectId = " + p);
    }
    async function regleManquante(oppId) {
      await page.goto(BASE_URL + "/Intelligence"); await page.waitForTimeout(1000);
      return page.evaluate(function (id) {
        const x = window.Intelligence.actives().filter(function (r) { return r.id === "qualification-manquante:oe-" + id; })[0];
        return x ? x.motif : null;
      }, oppId);
    }
    const c = await nouvelleOpportunite("Projet C " + suffixe);
    const d = await nouvelleOpportunite("Projet D " + suffixe);
    verifier((await regleManquante(c) || "").indexOf("Qualification à 0 / 10") === 0 && (await regleManquante(d) || "").indexOf("Qualification à 0 / 10") === 0,
      "C et D « À qualifier », rien d'enregistré : « qualification manquante », 0 / 10 pour chacune");
    await ouvrirQualification(page, p, "oe-" + d);
    await cocher(page, "q-car-ti");
    await page.fill("#q-mise", "3000");
    await page.fill("#q-objections", "Seulement des champs non comptés");
    await enregistrer(page);
    verifier((await regleManquante(d) || "").indexOf("Qualification à 0 / 10") === 0 && enBase(d).split("|")[5] === "ti",
      "D : caractéristiques, mise de fonds et objections enregistrées, mais non comptées (toujours 0 / 10)");
    await ouvrirQualification(page, p, "oe-" + c);
    await page.selectOption("#q-categorie", "vus");
    await cocher(page, "q-etat-neuf");
    await page.selectOption("#q-places", "5");
    await page.selectOption("#q-utilisation", "famille");
    await enregistrer(page);
    verifier((await regleManquante(c) || "").indexOf("Qualification à 4 / 10") === 0, "C, 4 informations comptées enregistrées : la recommandation reste (4 / 10, sous le seuil de 5)");
    await ouvrirQualification(page, p, "oe-" + c);
    await cocher(page, "q-mode-financement");
    await enregistrer(page);
    await page.reload(); await page.waitForTimeout(600);
    await page.click("#onglet-qualification"); await page.waitForTimeout(250);
    const resume = await page.locator('[data-zone="qualif-resume"]').textContent();
    verifier(await regleManquante(c) === null && (await regleManquante(d) || "").indexOf("Qualification à 0 / 10") === 0,
      "C, 5e information enregistrée et relue : la recommandation disparaît pour C seulement ; D reste à 0 / 10");
    verifier(/5\s*\/\s*10/.test(resume), "fiche de C après actualisation : la complétude affichée vient des valeurs enregistrées (« " + resume.replace(/\s+/g, " ").trim().slice(0, 80) + " »)");
    await page.evaluate(function (id) {
      const cle = Object.keys(sessionStorage).filter(function (k) { return k.indexOf("phineas.salesos.prospects.v1:") === 0; })[0];
      const etat = JSON.parse(sessionStorage.getItem(cle));
      etat.opportunites.forEach(function (o) {
        if (o.id === "oe-" + id) o.qualification = { categorie: "vus", etat: "neuf", marques: ["Kia"], modeles: [], places: 5, utilisation: "famille", budgetTotal: 1, modeAchat: "comptant",
          reprise: "non", horizon: "30j", elementsDecision: ["prix"], caracteristiques: [] };
      });
      sessionStorage.setItem(cle, JSON.stringify(etat));
    }, d);
    verifier((await regleManquante(d) || "").indexOf("Qualification à 0 / 10") === 0, "ancien état de l'onglet complet pour D : ignoré, le moteur garde la valeur enregistrée (0 / 10)");

    // ---------- Affichage : 320, 390 et 1440 px, clair et sombre ----------
    for (const [largeur, theme] of [[320, "clair"], [320, "sombre"], [390, "clair"], [390, "sombre"], [1440, "clair"], [1440, "sombre"]]) {
      const v = await nouvellePage(navigateur, { viewport: { width: largeur, height: 900 } });
      await connecter(v, SOPHIE);
      await ouvrirQualification(v, p, "oe-" + a);
      if (theme === "sombre") await v.evaluate(function () { document.documentElement.dataset.theme = "sombre"; });
      await v.fill("#q-budget-total", "999999");
      await v.click('#form-qualification button[type="submit"]');
      await v.waitForTimeout(300);
      const invalide = await v.evaluate(function () {
        const c = document.getElementById("q-budget-total");
        const r = c.getBoundingClientRect();
        return c.classList.contains("is-invalid") && r.top >= 0 && r.bottom <= window.innerHeight;
      });
      const debord = await v.evaluate(function () { return document.documentElement.scrollWidth - document.documentElement.clientWidth; });
      const bouton = v.locator('#form-qualification button[type="submit"]');
      await bouton.scrollIntoViewIfNeeded();
      await v.screenshot({ path: "qualif-" + largeur + "-" + theme + ".png" });
      const boutonVisible = await bouton.isVisible();
      verifier(invalide && debord === 0 && boutonVisible && new URL(v.url()).pathname.indexOf("/Prospects/Fiche/") === 0,
        largeur + " px, thème " + theme + " : erreur visible à l'écran, formulaire utilisable, aucun débordement, rien d'envoyé (" +
        JSON.stringify({ invalide: invalide, debord: debord, bouton: boutonVisible, url: new URL(v.url()).pathname }) + ")");
      await v.context().close();
    }
    verifier(enBase(a).split("|")[7] === "32000.00", "les essais d'affichage n'ont rien enregistré (budget total toujours 32000)");

    verifier(erreurs.length === 0, "aucune erreur JavaScript (" + JSON.stringify(erreurs) + ")");
    console.log("\nParcours de qualification réussi (" + etape + " vérifications).");
  } catch (erreur) {
    console.error("\n" + erreur.message);
    process.exitCode = 1;
  } finally {
    await navigateur.close();
  }
})();
