// Test de bout en bout de la fonctionnalité 22 : rendez-vous commerciaux enregistrés d'une opportunité réelle, sur
// l'application réelle et MySQL. Planifiés depuis la fiche, interprétés dans le fuseau commercial (America/Toronto) et
// enregistrés en UTC ; retrouvés après actualisation et reconnexion ; affichés à la même heure depuis des navigateurs
// dans d'autres fuseaux ; propres à leur opportunité ; protégés contre une page périmée et les autres utilisateurs ;
// heures inexistantes, ambiguës ou passées refusées ; la démonstration reste à part ; rien d'autre ne change.
// Prérequis et variables : les mêmes que modification-prospect.e2e.js (BASE_URL, CHROMIUM_PATH, MYSQL_CONTAINER, E2E_DB).
// Lancement : node rendezvous-reels.e2e.js   (le paquet « playwright » doit être installé)
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

// Rendez-vous d'une opportunité en base, dans l'ordre d'ajout : « Consultation 2027-01-15 19:00 America/Toronto 45 ».
function enBase(oppId) {
  return sql("SELECT IFNULL(GROUP_CONCAT(CONCAT_WS(' ', Type, DATE_FORMAT(DebutUtc, '%Y-%m-%d %H:%i'), Fuseau, DureeMinutes) ORDER BY Id SEPARATOR ' ; '), '') FROM RendezVousCommerciaux WHERE OpportuniteId = " + oppId);
}
function nombre() { return sql("SELECT COUNT(*) FROM RendezVousCommerciaux"); }

// Jour et heure « maintenant » dans le fuseau commercial, calculés ici indépendamment de l'application.
function maintenantCommercial(decalageMinutes) {
  const d = new Date(Date.now() + (decalageMinutes || 0) * 60000);
  const parties = {};
  new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(d).forEach(function (x) { parties[x.type] = x.value; });
  return { date: parties.year + "-" + parties.month + "-" + parties.day, heure: parties.hour + ":" + parties.minute };
}

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

async function ouvrirOpportunites(page, prospectId, opportunite) {
  await page.goto(BASE_URL + "/Prospects/Fiche/pe-" + prospectId + (opportunite ? "?opportunite=oe-" + opportunite : "") + "#opportunites");
  await page.waitForTimeout(700);
  await page.click("#onglet-opportunites");
  await page.waitForTimeout(250);
}

async function message(page) {
  const toast = page.locator("#sv-toast [data-toast-texte]");
  await toast.waitFor({ state: "visible" });
  return (await toast.textContent()).trim();
}

// Horaires affichés dans la carte d'une opportunité (« vendredi 15 janvier 2027, de 14 h 00 à 14 h 45 »).
async function horaires(page, oppId) {
  return page.locator('[data-rendezvous-reels="oe-' + oppId + '"] [data-rendezvous-horaire]').allTextContents();
}

async function remplir(page, oppId, r) {
  await page.click('[data-rendezvous-planifier="oe-' + oppId + '"]');
  await page.waitForSelector("#modal-rendezvous.show");
  await page.selectOption("#rv-type", r.type || "Consultation");
  await page.fill("#rv-date", r.date);
  await page.fill("#rv-heure", r.heure);
  await page.selectOption("#rv-duree", String(r.duree || 45));
  await page.selectOption("#rv-mode", r.mode || "concession");
  if (r.lieu) await page.fill("#rv-lieu", r.lieu);
}

async function planifier(page, oppId, r) {
  await remplir(page, oppId, r);
  await Promise.all([page.waitForNavigation(), page.click("#form-rendezvous [data-rendezvous-envoyer]")]);
  await page.waitForTimeout(500);
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

    // ---------- Parcours A : premier rendez-vous réel ----------
    const p = await creerProspect(page, "Rdv" + suffixe);
    const a = sql("SELECT Id FROM OpportunitesVente WHERE ProspectId = " + p);
    const avantA = sql("SELECT CONCAT_WS('|', Etape, IFNULL(ProchaineAction,'-'), DerniereActivite, IFNULL(Categorie,'-'), IFNULL(Modele,'-')) FROM OpportunitesVente WHERE Id = " + a);
    await ouvrirOpportunites(page, p);
    verifier((await page.locator('[data-rendezvous-reels="oe-' + a + '"] [data-rendezvous-vide]').count()) === 1, "opportunité neuve : « Aucun rendez-vous planifié », rien d'inventé");
    await remplir(page, a, { type: "Consultation", date: "2027-01-15", heure: "14:00", duree: 45, lieu: "Salle d'exposition" });
    const mention = await page.locator("[data-rendezvous-mention]").textContent();
    const fuseauVisible = await page.locator("[data-rendezvous-fuseau]").textContent();
    const typesProposes = await page.locator("#rv-type option").evaluateAll(function (o) { return o.map(function (x) { return x.value; }).filter(Boolean).join(","); });
    verifier(mention.includes("aucune invitation") && mention.includes("réservé") && fuseauVisible.includes(FUSEAU) &&
      typesProposes === "PremiereRencontre,Consultation,PresentationVehicule,Negociation,Autre",
      "fenêtre : aucune invitation ni réservation annoncée, fuseau affiché, types permis seulement (" + typesProposes + ")");
    await Promise.all([page.waitForNavigation(), page.click("#form-rendezvous [data-rendezvous-envoyer]")]);
    await page.waitForTimeout(500);
    verifier((await message(page)).indexOf("Rendez-vous enregistré dans le dossier") === 0 && new URL(page.url()).search === "?opportunite=oe-" + a,
      "création confirmée par le serveur, retour sur cette opportunité");
    verifier(enBase(a) === "Consultation 2027-01-15 19:00 America/Toronto 45", "en base : 14 h Toronto en hiver = 19 h UTC, avec le fuseau");
    await page.reload(); await page.waitForTimeout(600);
    await page.click("#onglet-opportunites"); await page.waitForTimeout(200);
    verifier(JSON.stringify(await horaires(page, a)) === JSON.stringify(["vendredi 15 janvier 2027, de 14 h 00 à 14 h 45"]), "après actualisation : 14 h 00 à 14 h 45");
    await deconnecter(page);
    await connecter(page, SOPHIE);
    await ouvrirOpportunites(page, p);
    verifier((await horaires(page, a)).length === 1, "après reconnexion : toujours là");

    // ---------- Parcours B : plusieurs rendez-vous ----------
    await planifier(page, a, { type: "Negociation", date: "2027-07-15", heure: "14:00", duree: 60, mode: "virtuel" });
    await planifier(page, a, { type: "PremiereRencontre", date: "2027-03-01", heure: "09:30", duree: 30 });
    verifier(enBase(a) === "Consultation 2027-01-15 19:00 America/Toronto 45 ; Negociation 2027-07-15 18:00 America/Toronto 60 ; PremiereRencontre 2027-03-01 14:30 America/Toronto 30" &&
      sql("SELECT COUNT(DISTINCT Id) FROM RendezVousCommerciaux WHERE OpportuniteId = " + a) === "3",
      "trois rendez-vous distincts ; 14 h en été = 18 h UTC ; rien d'écrasé");
    verifier(JSON.stringify(await horaires(page, a)) === JSON.stringify(["vendredi 15 janvier 2027, de 14 h 00 à 14 h 45", "lundi 1 mars 2027, de 9 h 30 à 10 h 00", "jeudi 15 juillet 2027, de 14 h 00 à 15 h 00"]),
      "affichage chronologique, heures commerciales conservées");

    // ---------- Parcours C : opportunités multiples ----------
    const b = await creerOpportunite(page, p, "Projet B " + suffixe);
    await ouvrirOpportunites(page, p, b);
    await planifier(page, b, { type: "Autre", date: "2027-12-12", heure: "10:00" });
    await ouvrirOpportunites(page, p, a);
    verifier((await horaires(page, a)).length === 3 && JSON.stringify(await horaires(page, b)) === JSON.stringify(["dimanche 12 décembre 2027, de 10 h 00 à 10 h 45"]) &&
      enBase(b) === "Autre 2027-12-12 15:00 America/Toronto 45", "A et B : chacune affiche ses propres rendez-vous");

    // ---------- Parcours D : dates, heures et fuseaux ----------
    for (const fuseauPoste of ["UTC", "Asia/Tokyo"]) {
      const v = await nouvellePage(navigateur, { timezoneId: fuseauPoste });
      await connecter(v, SOPHIE);
      await ouvrirOpportunites(v, p, a);
      const vus = await horaires(v, a);
      const heurePoste = await v.evaluate(function () { return new Date("2027-01-15T19:00:00Z").getHours(); });
      verifier(vus[0] === "vendredi 15 janvier 2027, de 14 h 00 à 14 h 45" && vus[2] === "jeudi 15 juillet 2027, de 14 h 00 à 15 h 00" && heurePoste !== 14,
        "navigateur en " + fuseauPoste + " : même heure commerciale affichée (le poste, lui, voit " + heurePoste + " h)");
      await v.context().close();
    }
    const total = nombre();
    const hier = maintenantCommercial(-24 * 60);
    const ilYaUneHeure = maintenantCommercial(-60);
    const refus = [];
    for (const [r, attendu] of [
      [{ date: "2027-03-14", heure: "02:30" }, "n'existe pas"],
      [{ date: "2027-11-07", heure: "01:30" }, "existe deux fois"],
      [{ date: "2027-03-14", heure: "01:30", duree: 45 }, "changement d'heure"],
      [{ date: hier.date, heure: "23:00" }, "déjà passé"],
    ].concat(ilYaUneHeure.date === maintenantCommercial().date ? [[{ date: ilYaUneHeure.date, heure: ilYaUneHeure.heure }, "déjà passé"]] : [])) {
      await ouvrirOpportunites(page, p, a);
      await remplir(page, a, r);
      // Le champ date du navigateur refuse un jour passé (min) : on retire ce garde-fou, le serveur reste l'autorité.
      await page.evaluate(function () { document.getElementById("rv-date").removeAttribute("min"); });
      await Promise.all([page.waitForNavigation(), page.click("#form-rendezvous [data-rendezvous-envoyer]")]);
      const m = await message(page);
      refus.push(m.indexOf("Rendez-vous non enregistré.") === 0 && m.includes(attendu));
    }
    verifier(refus.every(Boolean) && nombre() === total, "heure inexistante, heure ambiguë, changement d'heure traversé, veille et heure déjà passée : refusés, rien d'écrit (" + JSON.stringify(refus) + ")");
    await ouvrirOpportunites(page, p, a);
    const jeton = await page.locator('#form-rendezvous input[name="__RequestVerificationToken"]').inputValue();
    const version = await page.evaluate(function (id) { return window.Prospects.contact(id).version; }, "pe-" + p);
    async function poster(champs, client) {
      const r = await (client || page).request.post(BASE_URL + "/Prospects/PlanifierRendezVous", { form: Object.assign({ prospectId: "pe-" + p, opportuniteId: "oe-" + a, version: version,
        type: "Consultation", date: "2027-02-10", heure: "10:00", dureeMinutes: "45", mode: "concession", __RequestVerificationToken: jeton }, champs), maxRedirects: 0 });
      return r.status();
    }
    await poster({ heure: "25:00" });
    await poster({ type: "EssaiRoutier" });
    await poster({ type: "Livraison" });
    verifier(nombre() === total, "heure invalide et types exclus (essai routier, livraison) envoyés à la main : refusés par le serveur");

    // ---------- Parcours E : concurrence ----------
    const autreOnglet = await nouvellePage(navigateur);
    await connecter(autreOnglet, SOPHIE);
    await ouvrirOpportunites(autreOnglet, p, b);
    await ouvrirOpportunites(page, p, b);
    await planifier(page, b, { date: "2027-12-20", heure: "11:00" });
    await planifier(autreOnglet, b, { date: "2027-12-21", heure: "11:00" });
    verifier((await message(autreOnglet)).includes("modifié entre-temps") && enBase(b) === "Autre 2027-12-12 15:00 America/Toronto 45 ; Consultation 2027-12-20 16:00 America/Toronto 45",
      "deux sessions depuis la même version : la seconde est refusée, aucun rendez-vous en trop");
    await autreOnglet.click("#onglet-opportunites"); await autreOnglet.waitForTimeout(200);
    verifier((await horaires(autreOnglet, b)).length === 2, "la page refusée affiche maintenant les rendez-vous actuels");
    await autreOnglet.context().close();

    // ---------- Parcours F : sécurité ----------
    function creerUtilisateur(courriel, concession, role) {
      sql("INSERT INTO AspNetUsers (Id, FirstName, LastName, DealershipId, IsActive, MustChangePassword, CreatedAt, UserName, NormalizedUserName, Email, NormalizedEmail, EmailConfirmed, PasswordHash, SecurityStamp, ConcurrencyStamp, PhoneNumberConfirmed, TwoFactorEnabled, LockoutEnabled, AccessFailedCount) " +
        "SELECT UUID(), 'Autre', 'Personne', " + concession + ", 1, 0, NOW(), '" + courriel + "', UPPER('" + courriel + "'), '" + courriel + "', UPPER('" + courriel + "'), 1, PasswordHash, UUID(), UUID(), 0, 0, 1, 0 FROM AspNetUsers WHERE Email = '" + SOPHIE + "'");
      sql("INSERT INTO AspNetUserRoles (UserId, RoleId) SELECT u.Id, r.Id FROM AspNetUsers u, AspNetRoles r WHERE u.Email = '" + courriel + "' AND r.Name = '" + role + "'");
    }
    sql("UPDATE Dealerships SET IsActive = 1 WHERE Name = 'Garage Saint-Laurent'");
    const memeConcession = "(SELECT DealershipId FROM (SELECT DealershipId FROM AspNetUsers WHERE Email = '" + SOPHIE + "') x)";
    const intrus = [
      ["collègue", "collegue.rdv." + suffixe + "@autoprestige.example", memeConcession, "Conseiller"],
      ["autre concession", "ailleurs.rdv." + suffixe + "@garagestl.example", "(SELECT Id FROM Dealerships WHERE Name = 'Garage Saint-Laurent')", "Conseiller"],
      ["directeur", "directeur.rdv." + suffixe + "@autoprestige.example", memeConcession, "Directeur"],
    ];
    const totalSecurite = nombre();
    for (const [nom, courriel, concession, role] of intrus) {
      creerUtilisateur(courriel, concession, role);
      const v = await nouvellePage(navigateur);
      await connecter(v, courriel);
      await v.goto(BASE_URL + (role === "Conseiller" ? "/Prospects" : "/"));
      const j = await v.locator('input[name="__RequestVerificationToken"]').first().inputValue().catch(function () { return ""; });
      const r = await v.request.post(BASE_URL + "/Prospects/PlanifierRendezVous", { form: { prospectId: "pe-" + p, opportuniteId: "oe-" + a, version: version, type: "Consultation",
        date: "2027-02-10", heure: "10:00", dureeMinutes: "45", mode: "concession", __RequestVerificationToken: j }, maxRedirects: 0 });
      const accepte = r.status() === 302 && String(r.headers().location || "").indexOf("/Prospects/Fiche") >= 0;
      verifier(!accepte && (role !== "Conseiller" || r.status() === 404) && nombre() === totalSecurite, nom + " : rien n'est planifié (statut " + r.status() + ")");
      await v.context().close();
    }
    const autre = await creerProspect(page, "Autre" + suffixe);
    const oppAutre = sql("SELECT Id FROM OpportunitesVente WHERE ProspectId = " + autre);
    await ouvrirOpportunites(page, p, a);
    const versionA = await page.evaluate(function (id) { return window.Prospects.contact(id).version; }, "pe-" + p);
    const jetonA = await page.locator('#form-rendezvous input[name="__RequestVerificationToken"]').inputValue();
    async function forger(champs) {
      const r = await page.request.post(BASE_URL + "/Prospects/PlanifierRendezVous", { form: Object.assign({ prospectId: "pe-" + p, opportuniteId: "oe-" + a, version: versionA,
        type: "Consultation", date: "2027-02-10", heure: "10:00", dureeMinutes: "45", mode: "concession", __RequestVerificationToken: jetonA }, champs), maxRedirects: 0 });
      return r.status();
    }
    const forges = [await forger({ opportuniteId: "oe-" + oppAutre }), await forger({ opportuniteId: "oe-999999999" }), await forger({ opportuniteId: "oe-abc" }), await forger({ prospectId: "pe-999999999" })];
    const sansJeton = (await page.request.post(BASE_URL + "/Prospects/PlanifierRendezVous", { form: { prospectId: "pe-" + p, opportuniteId: "oe-" + a, version: versionA, type: "Consultation",
      date: "2027-02-10", heure: "10:00", dureeMinutes: "45", mode: "concession" }, maxRedirects: 0 })).status();
    const parGet = (await page.request.get(BASE_URL + "/Prospects/PlanifierRendezVous?prospectId=pe-" + p + "&opportuniteId=oe-" + a + "&version=" + versionA +
      "&type=Consultation&date=2027-02-10&heure=10:00&dureeMinutes=45&mode=concession", { maxRedirects: 0 })).status();
    const perimee = await forger({ version: "ancienne" });
    verifier(forges.join(",") === "404,404,404,404" && sansJeton === 400 && parGet !== 302 && perimee === 302 && nombre() === totalSecurite && enBase(oppAutre) === "",
      "opportunité d'un autre prospect, identifiants inexistants ou forgés (404), sans jeton (400), GET, version périmée : rien d'écrit");

    // ---------- Parcours G : démonstration ----------
    await page.goto(BASE_URL + "/RendezVous/Nouveau?opportunite=oe-" + a); await page.waitForTimeout(800);
    const demo = await page.evaluate(function (nom) {
      return { note: !!document.querySelector("[data-demonstration-seulement]"), reel: document.querySelector('[data-zone="clients"]').textContent.indexOf(nom) >= 0 };
    }, "Rdv" + suffixe);
    verifier(demo.note && !demo.reel && nombre() === totalSecurite, "formulaire de démonstration : toujours fictif, le dossier réel n'y est pas proposé");
    await page.goto(BASE_URL + "/Prospects/Fiche/chloe-bouchard#opportunites"); await page.waitForTimeout(700);
    await page.click("#onglet-opportunites"); await page.waitForTimeout(200);
    verifier((await page.locator("[data-rendezvous-reels], [data-rendezvous-planifier]").count()) === 0, "fiche de démonstration : aucun bloc ni bouton de rendez-vous enregistré");
    await ouvrirOpportunites(page, p, a);
    const carte = await page.locator('[data-rendezvous-reels="oe-' + a + '"]').textContent();
    verifier(carte.includes("Planifié") && carte.includes("aucune invitation envoyée") && !/Confirmé|Invitation envoyée|Réservé|Annuler|Replanifier|Réalisé/.test(carte) &&
      (await page.locator('[data-rendezvous-reels="oe-' + a + '"] a, [data-rendezvous-reels="oe-' + a + '"] [data-rendezvous-id] button').count()) === 0,
      "carte réelle : « Planifié » seulement, ni confirmation, ni invitation, ni réservation, ni commande F23");

    // ---------- Parcours H : ce que planifier ne change pas ----------
    verifier(sql("SELECT CONCAT_WS('|', Etape, IFNULL(ProchaineAction,'-'), DerniereActivite, IFNULL(Categorie,'-'), IFNULL(Modele,'-')) FROM OpportunitesVente WHERE Id = " + a) === avantA &&
      sql("SELECT COUNT(*) FROM NotesProspect WHERE ProspectId = " + p) === "0" && sql("SELECT COUNT(*) FROM HistoriquesSuiviOpportunite WHERE OpportuniteId IN (" + a + "," + b + ")") === "0" &&
      sql("SELECT COUNT(*) FROM HistoriquesEtapeOpportunite WHERE OpportuniteId IN (" + a + "," + b + ")") === "0" && sql("SELECT COUNT(*) FROM VeillesRecommandation WHERE OpportuniteId IN (" + a + "," + b + ")") === "0" &&
      sql("SELECT COUNT(*) FROM VehiculesEnvisages WHERE OpportuniteId IN (" + a + "," + b + ")") === "0",
      "en base : étape, suivi, activité, qualification, véhicules, notes, historiques et veilles inchangés");
    sql("UPDATE OpportunitesVente SET DateCreation = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 DAY) WHERE Id = " + a);
    await page.goto(BASE_URL + "/Intelligence"); await page.waitForTimeout(1000);
    verifier(await page.evaluate(function (id) { return window.Intelligence.actives().some(function (x) { return x.id === "premiere-reponse:oe-" + id; }); }, a),
      "la première réponse reste due : planifier un rendez-vous n'est pas un contact déclaré");

    // ---------- Parcours I : affichage 320, 390 et 1440 px, clair et sombre ----------
    for (const [largeur, theme] of [[320, "clair"], [320, "sombre"], [390, "clair"], [390, "sombre"], [1440, "clair"], [1440, "sombre"]]) {
      const v = await nouvellePage(navigateur, { viewport: { width: largeur, height: 900 } });
      await connecter(v, SOPHIE);
      await ouvrirOpportunites(v, p, a);
      if (theme === "sombre") await v.evaluate(function () { document.documentElement.dataset.theme = "sombre"; });
      const liste = await v.evaluate(function (id) {
        const lignes = Array.from(document.querySelectorAll('[data-rendezvous-reels="oe-' + id + '"] [data-rendezvous-horaire]'));
        return lignes.length === 3 && lignes.every(function (x) { const r = x.getBoundingClientRect(); return r.width > 0 && r.right <= window.innerWidth; });
      }, a);
      await v.click('[data-rendezvous-planifier="oe-' + a + '"]');
      await v.waitForSelector("#modal-rendezvous.show");
      const champs = await v.evaluate(function () {
        return ["rv-type", "rv-date", "rv-heure", "rv-duree", "rv-mode"].every(function (id) { const r = document.getElementById(id).getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= window.innerWidth; }) &&
          document.querySelector("[data-rendezvous-fuseau]").getBoundingClientRect().height > 0;
      });
      await v.click("#form-rendezvous [data-rendezvous-envoyer]");
      await v.waitForTimeout(300);
      const invalide = await v.evaluate(function () { return ["rv-type", "rv-date", "rv-heure"].every(function (id) { return document.getElementById(id).classList.contains("is-invalid"); }); });
      const debord = await v.evaluate(function () { return document.documentElement.scrollWidth - document.documentElement.clientWidth; });
      await v.screenshot({ path: "rendezvous-" + largeur + "-" + theme + ".png" });
      verifier(liste && champs && invalide && debord === 0 && new URL(v.url()).pathname.indexOf("/Prospects/Fiche/") === 0,
        largeur + " px, thème " + theme + " : liste lisible, champs et fuseau visibles sans survol, erreurs affichées, rien d'envoyé, aucun débordement (" +
        JSON.stringify({ liste: liste, champs: champs, invalide: invalide, debord: debord }) + ")");
      await v.context().close();
    }
    verifier(nombre() === totalSecurite, "les essais d'affichage n'ont rien enregistré");

    verifier(erreurs.length === 0, "aucune erreur JavaScript (" + JSON.stringify(erreurs) + ")");
    console.log("\nParcours des rendez-vous enregistrés réussi (" + etape + " vérifications).");
  } catch (erreur) {
    console.error("\n" + erreur.message);
    process.exitCode = 1;
  } finally {
    await navigateur.close();
  }
})();
