// Test de bout en bout de la fonctionnalité 24 : essais routiers planifiés d'une opportunité réelle, sur l'application
// réelle et MySQL. Planifiés depuis la fiche (véhicule envisagé de l'opportunité ou description), interprétés dans le
// fuseau commercial (America/Toronto) et enregistrés en UTC ; retrouvés après actualisation et reconnexion ; propres à
// leur opportunité ; protégés contre une page périmée et les autres utilisateurs ; aucune réservation, aucun permis ni
// assurance vérifiés, aucun résultat ; la démonstration reste à part ; rien d'autre ne change.
// Prérequis et variables : les mêmes que rendezvous-reels.e2e.js (BASE_URL, CHROMIUM_PATH, MYSQL_CONTAINER, E2E_DB).
// Lancement : node essais-routiers.e2e.js   (le paquet « playwright » doit être installé)
// Code de sortie 0 si tout le parcours passe, 1 sinon.
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");

const BASE_URL = process.env.BASE_URL || "http://localhost:5180";
const CONTENEUR = process.env.MYSQL_CONTAINER || "phineas-mysql";
const BASE = process.env.E2E_DB || "phineas_test_e2e";
if (!/^phineas_test/.test(BASE)) throw new Error("Ce test n'écrit que dans une base de test (phineas_test…), pas dans " + BASE + ".");

const SOPHIE = "sophie.gagnon@autoprestige.example";
const MOT_DE_PASSE = "Phineas2026!";
const FUSEAU = "America/Toronto";
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

// Essais d'une opportunité en base, dans l'ordre d'ajout : « 2024 Kia Sportage|ve|2027-01-15 19:00|45 ».
function enBase(oppId) {
  return sql("SELECT IFNULL(GROUP_CONCAT(CONCAT_WS('|', VehiculeLibelle, IF(VehiculeEnvisageId IS NULL, '-', 've'), DATE_FORMAT(DebutUtc, '%Y-%m-%d %H:%i'), DureeMinutes) ORDER BY Id SEPARATOR ' ; '), '') FROM EssaisRoutiers WHERE OpportuniteId = " + oppId);
}
function nombre() { return sql("SELECT COUNT(*) FROM EssaisRoutiers"); }
// Ce que planifier un essai ne doit jamais toucher.
function etatOpportunite(oppId) {
  return sql("SELECT CONCAT_WS('|', Etape, IFNULL(ProchaineAction,'-'), DerniereActivite, IFNULL(Categorie,'-'), " +
    "(SELECT COUNT(*) FROM HistoriquesSuiviOpportunite h WHERE h.OpportuniteId = o.Id), (SELECT COUNT(*) FROM HistoriquesEtapeOpportunite e WHERE e.OpportuniteId = o.Id), " +
    "(SELECT COUNT(*) FROM NotesProspect n WHERE n.OpportuniteId = o.Id), (SELECT GROUP_CONCAT(CONCAT(Marque, Modele)) FROM VehiculesEnvisages v WHERE v.OpportuniteId = o.Id), " +
    "(SELECT GROUP_CONCAT(CONCAT(Type, Statut)) FROM RendezVousCommerciaux r WHERE r.OpportuniteId = o.Id), (SELECT COUNT(*) FROM VeillesRecommandation w WHERE w.OpportuniteId = o.Id)) " +
    "FROM OpportunitesVente o WHERE o.Id = " + oppId);
}
function inventaire() { return sql("SELECT CONCAT((SELECT COUNT(*) FROM Vehicules), '/', (SELECT COUNT(*) FROM HistoriquesStatut), '/', (SELECT IFNULL(GROUP_CONCAT(StatutActuel ORDER BY Id), '') FROM Vehicules))"); }

async function nouvellePage(navigateur, options) {
  return (await navigateur.newContext(Object.assign({ viewport: { width: 1440, height: 900 }, timezoneId: FUSEAU }, options || {}))).newPage();
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

// Même adresse que la page affichée (fragment compris) : goto ne recharge pas, donc on recharge pour relire le serveur.
async function ouvrirOpportunites(page, prospectId, opportunite) {
  const adresse = BASE_URL + "/Prospects/Fiche/pe-" + prospectId + (opportunite ? "?opportunite=oe-" + opportunite : "") + "#opportunites";
  if (page.url() === adresse) await page.reload();
  else await page.goto(adresse);
  await page.waitForTimeout(700);
  await page.click("#onglet-opportunites");
  await page.waitForTimeout(250);
}

async function message(page) {
  const toast = page.locator("#sv-toast [data-toast-texte]");
  await toast.waitFor({ state: "visible" });
  return (await toast.textContent()).trim();
}

async function horaires(page, oppId) {
  return page.locator('[data-essais-reels="oe-' + oppId + '"] [data-essai-horaire]').allTextContents();
}
async function vehicules(page, oppId) {
  return page.locator('[data-essais-reels="oe-' + oppId + '"] [data-essai-vehicule]').allTextContents();
}

// Remplit la fenêtre « Planifier un essai routier ». e.vehicule : identifiant « ve-… » ; sinon e.description.
async function remplir(page, oppId, e) {
  await page.click('[data-essai-planifier="oe-' + oppId + '"]');
  await page.waitForSelector("#modal-essai.show");
  await page.selectOption("#er-vehicule", e.vehicule || "");
  if (!e.vehicule) await page.fill("#er-description", e.description);
  await page.fill("#er-date", e.date);
  await page.fill("#er-heure", e.heure);
  await page.selectOption("#er-duree", String(e.duree || 45));
}

async function planifier(page, oppId, e) {
  await remplir(page, oppId, e);
  await Promise.all([page.waitForNavigation(), page.click("#form-essai [data-essai-envoyer]")]);
  await page.waitForTimeout(500);
}

async function ajouterVehicule(page, prospectId, oppId, marque, modele, annee) {
  await ouvrirOpportunites(page, prospectId, oppId);
  await page.click('[data-vehicule-action="ajouter"][data-opp="oe-' + oppId + '"]');
  await page.waitForSelector("#modal-vehicule.show");
  await page.fill("#v-marque", marque);
  await page.fill("#v-modele", modele);
  if (annee) await page.fill("#v-annee", annee);
  await Promise.all([page.waitForNavigation(), page.click("#form-vehicule [data-vehicule-envoyer]")]);
  await page.waitForTimeout(400);
  return sql("SELECT MAX(Id) FROM VehiculesEnvisages WHERE OpportuniteId = " + oppId);
}

async function creerOpportunite(page, prospectId, titre) {
  await ouvrirOpportunites(page, prospectId);
  await page.click('#panneau-opportunites [data-action="opportunite"]');
  await page.waitForSelector("#modal-opportunite.show");
  await page.fill("#o-titre", titre);
  await page.selectOption("#o-etape", "Nouveau");
  await Promise.all([page.waitForNavigation(), page.click('#form-opportunite button[type="submit"]')]);
  await page.waitForTimeout(400);
  return sql("SELECT MAX(Id) FROM OpportunitesVente WHERE ProspectId = " + prospectId);
}

(async function () {
  const navigateur = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const erreurs = [];
  try {
    const page = await nouvellePage(navigateur);
    page.on("pageerror", function (e) { if (String(e.message).indexOf("ViewTransition") < 0) erreurs.push(e.message); });
    await connecter(page, SOPHIE);

    // ---------- Parcours A : premier essai ----------
    const p = await creerProspect(page, "Essai" + suffixe);
    const a = sql("SELECT Id FROM OpportunitesVente WHERE ProspectId = " + p);
    const ve = await ajouterVehicule(page, p, a, "Kia", "Sportage", "2024");
    const avantA = etatOpportunite(a);
    const inventaireAvant = inventaire();
    const rdvAvant = sql("SELECT COUNT(*) FROM RendezVousCommerciaux");
    await ouvrirOpportunites(page, p, a);
    verifier((await page.locator('[data-essais-reels="oe-' + a + '"] [data-essai-vide]').count()) === 1, "opportunité neuve : « Aucun essai routier planifié », rien d'inventé");
    await remplir(page, a, { vehicule: "ve-" + ve, date: "2027-01-15", heure: "14:00" });
    const fenetre = await page.evaluate(function () {
      return { mention: document.querySelector("[data-essai-mention]").textContent, fuseau: document.querySelector("[data-essai-fuseau]").textContent,
        options: Array.from(document.querySelectorAll("#er-vehicule option")).map(function (o) { return o.textContent; }).join(","),
        description: document.querySelector("[data-essai-description]").hidden };
    });
    verifier(fenetre.mention.includes("aucun véhicule n'est réservé") && fenetre.mention.includes("le permis et l'assurance ne sont pas vérifiés") &&
      fenetre.mention.includes("aucune invitation") && fenetre.fuseau.includes(FUSEAU) && fenetre.options === "2024 Kia Sportage,Autre véhicule (le décrire)" && fenetre.description,
      "fenêtre : véhicules envisagés de CETTE opportunité, ni réservation, ni permis ou assurance vérifiés, fuseau affiché (" + fenetre.options + ")");
    await Promise.all([page.waitForNavigation(), page.click("#form-essai [data-essai-envoyer]")]);
    await page.waitForTimeout(500);
    verifier((await message(page)) === "Essai routier planifié dans le dossier. La disponibilité du véhicule et les autorisations de conduite ne sont pas vérifiées par cet enregistrement." &&
      new URL(page.url()).search === "?opportunite=oe-" + a, "planification confirmée par le serveur avec ses limites, retour sur cette opportunité");
    verifier(enBase(a) === "2024 Kia Sportage|ve|2027-01-15 19:00|45", "en base : véhicule envisagé référencé, 14 h Toronto en hiver = 19 h UTC");
    await page.reload(); await page.waitForTimeout(600); await page.click("#onglet-opportunites"); await page.waitForTimeout(200);
    verifier(JSON.stringify(await horaires(page, a)) === JSON.stringify(["vendredi 15 janvier 2027, de 14 h 00 à 14 h 45"]) &&
      JSON.stringify(await vehicules(page, a)) === JSON.stringify(["2024 Kia Sportage"]), "après actualisation : véhicule et horaire relus");
    await deconnecter(page);
    await connecter(page, SOPHIE);
    await ouvrirOpportunites(page, p, a);
    verifier((await horaires(page, a)).length === 1, "après reconnexion : toujours là");

    // ---------- Parcours B et D : plusieurs essais, véhicule décrit ----------
    await planifier(page, a, { description: "Hyundai Tucson hybride", date: "2027-07-15", heure: "14:00", duree: 60 });
    await planifier(page, a, { vehicule: "ve-" + ve, date: "2027-03-01", heure: "09:30", duree: 30 });
    verifier(enBase(a) === "2024 Kia Sportage|ve|2027-01-15 19:00|45 ; Hyundai Tucson hybride|-|2027-07-15 18:00|60 ; 2024 Kia Sportage|ve|2027-03-01 14:30|30" &&
      sql("SELECT COUNT(DISTINCT Id) FROM EssaisRoutiers WHERE OpportuniteId = " + a) === "3", "trois essais distincts, dont deux sur le même véhicule et un décrit ; 14 h l'été = 18 h UTC");
    verifier(JSON.stringify(await horaires(page, a)) === JSON.stringify(["vendredi 15 janvier 2027, de 14 h 00 à 14 h 45", "lundi 1 mars 2027, de 9 h 30 à 10 h 00", "jeudi 15 juillet 2027, de 14 h 00 à 15 h 00"]),
      "affichage chronologique, heures commerciales conservées");
    verifier(inventaire() === inventaireAvant && sql("SELECT COUNT(*) FROM RendezVousCommerciaux") === rdvAvant, "aucun véhicule d'inventaire touché, aucun rendez-vous créé");

    // ---------- Parcours C : opportunités multiples ----------
    const b = await creerOpportunite(page, p, "Projet B " + suffixe);
    const veB = await ajouterVehicule(page, p, b, "Mazda", "CX-5", "");
    await ouvrirOpportunites(page, p, b);
    await page.click('[data-essai-planifier="oe-' + b + '"]');
    await page.waitForSelector("#modal-essai.show");
    const optionsB = await page.evaluate(function () { return Array.from(document.querySelectorAll("#er-vehicule option")).map(function (o) { return o.textContent; }).join(","); });
    await page.click("#modal-essai .btn-close");
    await page.waitForSelector("#modal-essai", { state: "hidden" });
    await planifier(page, b, { vehicule: "ve-" + veB, date: "2027-12-12", heure: "10:00" });
    await ouvrirOpportunites(page, p, a);
    verifier(optionsB === "Mazda CX-5,Autre véhicule (le décrire)" && (await horaires(page, a)).length === 3 && JSON.stringify(await vehicules(page, b)) === JSON.stringify(["Mazda CX-5"]) &&
      enBase(b) === "Mazda CX-5|ve|2027-12-12 15:00|45", "A et B : chacune propose ses véhicules et affiche ses propres essais");

    // ---------- Parcours E : fuseaux, heures invalides ----------
    for (const fuseauPoste of ["UTC", "Asia/Tokyo"]) {
      const v = await nouvellePage(navigateur, { timezoneId: fuseauPoste });
      await connecter(v, SOPHIE);
      await ouvrirOpportunites(v, p, a);
      const vus = await horaires(v, a);
      verifier(vus[0] === "vendredi 15 janvier 2027, de 14 h 00 à 14 h 45" && vus[2] === "jeudi 15 juillet 2027, de 14 h 00 à 15 h 00",
        "navigateur en " + fuseauPoste + " : même heure commerciale affichée");
      await v.context().close();
    }
    const total = nombre();
    const refus = [];
    for (const [e, attendu] of [
      [{ description: "X", date: "2027-03-14", heure: "02:30" }, "n'existe pas"],
      [{ description: "X", date: "2027-11-07", heure: "01:30" }, "existe deux fois"],
      [{ description: "X", date: "2027-03-14", heure: "01:30", duree: 60 }, "changement d'heure"],
      [{ description: "X", date: "2026-01-05", heure: "10:00" }, "déjà passé"],
    ]) {
      await ouvrirOpportunites(page, p, a);
      await remplir(page, a, e);
      await page.evaluate(function () { document.getElementById("er-date").removeAttribute("min"); });
      await Promise.all([page.waitForNavigation(), page.click("#form-essai [data-essai-envoyer]")]);
      const m = await message(page);
      refus.push(m.indexOf("Essai routier non enregistré.") === 0 && m.includes(attendu));
    }
    verifier(refus.every(Boolean) && nombre() === total, "heure inexistante, ambiguë, changement d'heure traversé, moment passé : refusés, rien d'écrit (" + JSON.stringify(refus) + ")");

    // ---------- Parcours F : concurrence ----------
    const autreOnglet = await nouvellePage(navigateur);
    await connecter(autreOnglet, SOPHIE);
    await ouvrirOpportunites(autreOnglet, p, b);
    await ouvrirOpportunites(page, p, b);
    await planifier(page, b, { description: "Toyota RAV4", date: "2027-12-20", heure: "11:00" });
    await planifier(autreOnglet, b, { description: "Honda CR-V", date: "2027-12-21", heure: "11:00" });
    verifier((await message(autreOnglet)).includes("modifié entre-temps") && enBase(b) === "Mazda CX-5|ve|2027-12-12 15:00|45 ; Toyota RAV4|-|2027-12-20 16:00|45",
      "deux sessions depuis la même version : la seconde est refusée, aucun essai en trop");
    await autreOnglet.click("#onglet-opportunites"); await autreOnglet.waitForTimeout(200);
    verifier((await horaires(autreOnglet, b)).length === 2, "la page refusée affiche maintenant les essais actuels");
    await autreOnglet.context().close();

    // ---------- Parcours G : sécurité ----------
    await ouvrirOpportunites(page, p, a);
    const jeton = await page.locator('#form-essai input[name="__RequestVerificationToken"]').inputValue();
    const version = await page.evaluate(function (id) { return window.Prospects.contact(id).version; }, "pe-" + p);
    const autre = await creerProspect(page, "Autre" + suffixe);
    const oppAutre = sql("SELECT Id FROM OpportunitesVente WHERE ProspectId = " + autre);
    const totalSecurite = nombre();
    async function forger(champs, client, sansJeton) {
      const form = Object.assign({ prospectId: "pe-" + p, opportuniteId: "oe-" + a, version: version, vehiculeId: "", vehicule: "Kia", date: "2027-06-01", heure: "10:00", dureeMinutes: "45" }, champs);
      if (!sansJeton) form.__RequestVerificationToken = jeton;
      return (await (client || page).request.post(BASE_URL + "/Prospects/PlanifierEssaiRoutier", { form: form, maxRedirects: 0 })).status();
    }
    const forges = [await forger({ opportuniteId: "oe-" + oppAutre }), await forger({ opportuniteId: "oe-999999999" }), await forger({ prospectId: "pe-" + autre }),
      await forger({ vehiculeId: "ve-" + veB }), await forger({ vehiculeId: "ve-999999999" }), await forger({ vehiculeId: "ve-abc" })];
    const sansJeton = await forger({}, null, true);
    const parGet = (await page.request.get(BASE_URL + "/Prospects/PlanifierEssaiRoutier?prospectId=pe-" + p + "&opportuniteId=oe-" + a + "&version=" + version + "&vehicule=Kia&date=2027-06-01&heure=10:00&dureeMinutes=45", { maxRedirects: 0 })).status();
    const perimee = await forger({ version: "ancienne" });
    verifier(forges.join(",") === "404,404,404,404,404,404" && sansJeton === 400 && parGet !== 302 && perimee === 302 && nombre() === totalSecurite && enBase(oppAutre) === "",
      "autre prospect, opportunité inexistante, véhicule de B ou forgé (404), sans jeton (400), GET, version périmée : rien d'écrit");
    function creerUtilisateur(courriel, concession, role) {
      sql("INSERT INTO AspNetUsers (Id, FirstName, LastName, DealershipId, IsActive, MustChangePassword, CreatedAt, UserName, NormalizedUserName, Email, NormalizedEmail, EmailConfirmed, PasswordHash, SecurityStamp, ConcurrencyStamp, PhoneNumberConfirmed, TwoFactorEnabled, LockoutEnabled, AccessFailedCount) " +
        "SELECT UUID(), 'Autre', 'Personne', " + concession + ", 1, 0, NOW(), '" + courriel + "', UPPER('" + courriel + "'), '" + courriel + "', UPPER('" + courriel + "'), 1, PasswordHash, UUID(), UUID(), 0, 0, 1, 0 FROM AspNetUsers WHERE Email = '" + SOPHIE + "'");
      sql("INSERT INTO AspNetUserRoles (UserId, RoleId) SELECT u.Id, r.Id FROM AspNetUsers u, AspNetRoles r WHERE u.Email = '" + courriel + "' AND r.Name = '" + role + "'");
    }
    sql("UPDATE Dealerships SET IsActive = 1 WHERE Name = 'Garage Saint-Laurent'");
    const memeConcession = "(SELECT DealershipId FROM (SELECT DealershipId FROM AspNetUsers WHERE Email = '" + SOPHIE + "') x)";
    for (const [nom, courriel, concession, role] of [
      ["collègue", "collegue.essai." + suffixe + "@autoprestige.example", memeConcession, "Conseiller"],
      ["autre concession", "ailleurs.essai." + suffixe + "@garagestl.example", "(SELECT Id FROM Dealerships WHERE Name = 'Garage Saint-Laurent')", "Conseiller"],
      ["directeur", "directeur.essai." + suffixe + "@autoprestige.example", memeConcession, "Directeur"],
    ]) {
      creerUtilisateur(courriel, concession, role);
      const v = await nouvellePage(navigateur);
      await connecter(v, courriel);
      await v.goto(BASE_URL + (role === "Conseiller" ? "/Prospects" : "/"));
      const j = await v.locator('input[name="__RequestVerificationToken"]').first().inputValue().catch(function () { return ""; });
      const r = await v.request.post(BASE_URL + "/Prospects/PlanifierEssaiRoutier", { form: { prospectId: "pe-" + p, opportuniteId: "oe-" + a, version: version, vehiculeId: "ve-" + ve,
        date: "2027-06-01", heure: "10:00", dureeMinutes: "45", __RequestVerificationToken: j }, maxRedirects: 0 });
      const accepte = r.status() === 302 && String(r.headers().location || "").indexOf("/Prospects/Fiche") >= 0;
      verifier(!accepte && (role !== "Conseiller" || r.status() === 404) && nombre() === totalSecurite, nom + " : rien n'est planifié (statut " + r.status() + ")");
      await v.context().close();
    }

    // ---------- Parcours H : démonstration et absence d'annonce trompeuse ----------
    await page.goto(BASE_URL + "/Prospects/Fiche/chloe-bouchard#opportunites"); await page.waitForTimeout(700);
    await page.click("#onglet-opportunites"); await page.waitForTimeout(200);
    verifier((await page.locator("[data-essais-reels], [data-essai-planifier]").count()) === 0, "fiche de démonstration : aucun bloc ni bouton d'essai enregistré");
    const bandeau = await page.locator("[data-mention-donnees]").first().textContent();
    verifier(bandeau.includes("essais routiers planifiés") && bandeau.includes("rendez-vous de démonstration restent également fictifs"),
      "bandeau : les essais routiers des dossiers enregistrés sont annoncés enregistrés, la démonstration fictive");
    await ouvrirOpportunites(page, p, a);
    const carte = (await page.locator('[data-essais-reels="oe-' + a + '"]').textContent()).replace(/\s+/g, " ");
    verifier(carte.includes("Planifié") && carte.includes("aucun véhicule réservé") && carte.includes("permis et assurance non vérifiés") &&
      !/Confirmé|Réservé|Permis vérifié|Assurance validée|Essai terminé|Résultat/.test(carte) &&
      (await page.locator('[data-essais-reels="oe-' + a + '"] [data-essai-id] button, [data-essais-reels="oe-' + a + '"] a').count()) === 0,
      "carte réelle : « Planifié », aucune réservation, permis ou assurance annoncés vérifiés, aucun résultat, aucune commande F25");

    // ---------- Parcours I : ce que planifier un essai ne change pas ----------
    sql("UPDATE OpportunitesVente SET DateCreation = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 DAY) WHERE Id = " + a);
    verifier(etatOpportunite(a) === avantA && inventaire() === inventaireAvant && sql("SELECT COUNT(*) FROM RendezVousCommerciaux") === rdvAvant,
      "en base : étape, suivi, activité, qualification, véhicules envisagés, rendez-vous, notes, historiques, veilles et inventaire inchangés");
    await page.goto(BASE_URL + "/Intelligence"); await page.waitForTimeout(1000);
    const moteur = await page.evaluate(function (id) {
      const l = window.Intelligence.actives().filter(function (x) { return x.opportuniteId === "oe-" + id; }).map(function (x) { return x.regle; });
      return { premiere: l.indexOf("premiere-reponse") >= 0, essai: l.some(function (r) { return r.indexOf("essai") >= 0 || r.indexOf("rdv-") === 0; }) };
    }, a);
    verifier(moteur.premiere && !moteur.essai, "la première réponse reste due et aucune recommandation d'essai ou de rendez-vous n'est créée");

    // ---------- Parcours J : affichage 320, 390 et 1440 px, clair et sombre, clavier ----------
    for (const [largeur, theme] of [[320, "clair"], [320, "sombre"], [390, "clair"], [390, "sombre"], [1440, "clair"], [1440, "sombre"]]) {
      const v = await nouvellePage(navigateur, { viewport: { width: largeur, height: 900 }, hasTouch: largeur < 1000 });
      await connecter(v, SOPHIE);
      await ouvrirOpportunites(v, p, a);
      if (theme === "sombre") await v.evaluate(function () { document.documentElement.dataset.theme = "sombre"; });
      const liste = await v.evaluate(function (id) {
        const lignes = Array.from(document.querySelectorAll('[data-essais-reels="oe-' + id + '"] [data-essai-horaire]'));
        return lignes.length === 3 && lignes.every(function (x) { const r = x.getBoundingClientRect(); return r.width > 0 && r.right <= window.innerWidth; });
      }, a);
      // Ouverture au clavier : focus sur le bouton puis Entrée.
      await v.focus('[data-essai-planifier="oe-' + a + '"]');
      await v.keyboard.press("Enter");
      await v.waitForSelector("#modal-essai.show");
      await v.selectOption("#er-vehicule", "");
      const champs = await v.evaluate(function () {
        return ["er-vehicule", "er-description", "er-date", "er-heure", "er-duree"].every(function (id) { const r = document.getElementById(id).getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= window.innerWidth; }) &&
          document.querySelector("[data-essai-fuseau]").getBoundingClientRect().height > 0;
      });
      await v.click("#form-essai [data-essai-envoyer]");
      await v.waitForTimeout(300);
      const invalide = await v.evaluate(function () { return ["er-description", "er-date", "er-heure"].every(function (id) { return document.getElementById(id).classList.contains("is-invalid"); }); });
      const debord = await v.evaluate(function () { return document.documentElement.scrollWidth - document.documentElement.clientWidth; });
      await v.screenshot({ path: "essais-" + largeur + "-" + theme + ".png" });
      verifier(liste && champs && invalide && debord === 0 && new URL(v.url()).pathname.indexOf("/Prospects/Fiche/") === 0,
        largeur + " px, thème " + theme + " : liste lisible, fenêtre ouverte au clavier, champs et fuseau visibles, erreurs affichées, rien d'envoyé, aucun débordement (" +
        JSON.stringify({ liste: liste, champs: champs, invalide: invalide, debord: debord }) + ")");
      await v.context().close();
    }
    verifier(nombre() === totalSecurite, "les essais d'affichage n'ont rien enregistré");

    verifier(erreurs.length === 0, "aucune erreur JavaScript (" + JSON.stringify(erreurs) + ")");
    console.log("\nParcours des essais routiers enregistrés réussi (" + etape + " vérifications).");
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await navigateur.close();
  }
})();
