// Test de bout en bout de la fonctionnalité 21 : véhicules envisagés enregistrés d'une opportunité réelle, sur
// l'application réelle et MySQL. Ajout, modification, retrait ; retrouvés après actualisation et reconnexion ; propres
// à leur opportunité ; protégés contre une page périmée et contre les autres conseillers ; la démonstration reste
// locale ; un ancien état de l'onglet ne masque jamais la liste du serveur ; ni qualification, ni étape, ni suivi
// changés ; aucune réservation, soumission ou opération d'inventaire.
// Prérequis et variables : les mêmes que modification-prospect.e2e.js (BASE_URL, CHROMIUM_PATH, MYSQL_CONTAINER, E2E_DB).
// Lancement : node vehicules-envisages.e2e.js   (le paquet « playwright » doit être installé)
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

// Véhicules d'une opportunité en base, dans l'ordre d'ajout : « Kia Sportage 2024 EX ; Honda CR-V - - ».
function enBase(oppId) {
  return sql("SELECT IFNULL(GROUP_CONCAT(CONCAT_WS(' ', Marque, Modele, IFNULL(Annee,'-'), IFNULL(Finition,'-')) ORDER BY Id SEPARATOR ' ; '), '') FROM VehiculesEnvisages WHERE OpportuniteId = " + oppId);
}
function idsEnBase(oppId) {
  return sql("SELECT IFNULL(GROUP_CONCAT(Id ORDER BY Id), '') FROM VehiculesEnvisages WHERE OpportuniteId = " + oppId).split(",").filter(Boolean);
}

async function nouvellePage(navigateur, options) {
  const page = await (await navigateur.newContext(Object.assign({ viewport: { width: 1440, height: 900 } }, options || {}))).newPage();
  page.on("dialog", function (d) { d.accept(); }); // confirmation du retrait : acceptée par défaut
  return page;
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

// Libellés affichés dans la carte d'une opportunité.
async function affiches(page, oppId) {
  return page.locator('[data-vehicules="oe-' + oppId + '"] .pr-vehicule-nom').allTextContents();
}

async function remplir(page, v) {
  await page.waitForSelector("#modal-vehicule.show");
  if ("marque" in v) await page.fill("#v-marque", v.marque);
  if ("modele" in v) await page.fill("#v-modele", v.modele);
  if ("annee" in v) await page.fill("#v-annee", v.annee);
  if ("finition" in v) await page.fill("#v-finition", v.finition);
}

async function ajouter(page, oppId, v) {
  await page.click('[data-vehicule-action="ajouter"][data-opp="oe-' + oppId + '"]');
  await remplir(page, v);
  await Promise.all([page.waitForNavigation(), page.click("#form-vehicule [data-vehicule-envoyer]")]);
  await page.waitForTimeout(500);
}

async function modifier(page, oppId, vehiculeId, v) {
  await page.click('[data-vehicule-action="modifier"][data-vehicule="ve-' + vehiculeId + '"]');
  await remplir(page, v);
  await Promise.all([page.waitForNavigation(), page.click("#form-vehicule [data-vehicule-envoyer]")]);
  await page.waitForTimeout(500);
}

async function retirer(page, vehiculeId) {
  await Promise.all([page.waitForNavigation(), page.click('[data-vehicule-action="retirer"][data-vehicule="ve-' + vehiculeId + '"]')]);
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
    const inventaireAvant = sql("SELECT COUNT(*) FROM Vehicules");

    // ---------- Parcours A : ajout ----------
    const p = await creerProspect(page, "Vehic" + suffixe);
    const a = sql("SELECT Id FROM OpportunitesVente WHERE ProspectId = " + p);
    const avantA = sql("SELECT CONCAT(Etape, '|', IFNULL(ProchaineAction,'-'), '|', DerniereActivite, '|', IFNULL(Categorie,'-'), '|', IFNULL(Modele,'-')) FROM OpportunitesVente WHERE Id = " + a);
    await ouvrirOpportunites(page, p);
    verifier((await page.locator("[data-vehicules-vide]").count()) === 1 && (await affiches(page, a)).length === 0,
      "opportunité neuve : état vide explicite, aucun véhicule inventé");
    await ajouter(page, a, { marque: "Kia", modele: "Sportage", annee: "2024", finition: "EX" });
    verifier(await message(page) === "Véhicule envisagé ajouté." && new URL(page.url()).search === "?opportunite=oe-" + a && new URL(page.url()).hash === "#opportunites",
      "ajout confirmé par le serveur, retour sur les opportunités avec ce projet sélectionné");
    verifier(enBase(a) === "Kia Sportage 2024 EX", "en base : le véhicule, sur la bonne opportunité");
    await page.reload(); await page.waitForTimeout(600);
    await page.click("#onglet-opportunites"); await page.waitForTimeout(200);
    verifier(JSON.stringify(await affiches(page, a)) === JSON.stringify(["2024 Kia Sportage EX"]), "après actualisation : relu du serveur");
    await deconnecter(page);
    await connecter(page, SOPHIE);
    await ouvrirOpportunites(page, p);
    verifier(JSON.stringify(await affiches(page, a)) === JSON.stringify(["2024 Kia Sportage EX"]), "après reconnexion : toujours là");

    // ---------- Parcours B : plusieurs véhicules ----------
    await ajouter(page, a, { marque: "Honda", modele: "CR-V", annee: "2022" });
    await ajouter(page, a, { marque: "Mazda", modele: "CX-5" });
    let ids = idsEnBase(a);
    verifier(ids.length === 3 && new Set(ids).size === 3 && (await affiches(page, a)).length === 3, "trois véhicules, trois identifiants distincts, trois lignes affichées");
    await modifier(page, a, ids[1], { finition: "Touring" });
    verifier(await message(page) === "Véhicule envisagé modifié." && enBase(a) === "Kia Sportage 2024 EX ; Honda CR-V 2022 Touring ; Mazda CX-5 - -",
      "le deuxième est modifié ; le premier et le troisième sont inchangés");
    page.once("dialog", function () {}); // refus de la confirmation : rien n'est envoyé
    page.removeAllListeners("dialog");
    page.on("dialog", function (d) { d.dismiss(); });
    await page.click('[data-vehicule-action="retirer"][data-vehicule="ve-' + ids[0] + '"]');
    await page.waitForTimeout(400);
    verifier(idsEnBase(a).length === 3, "confirmation refusée : rien n'est retiré");
    page.removeAllListeners("dialog");
    page.on("dialog", function (d) { d.accept(); });
    await retirer(page, ids[0]);
    verifier(await message(page) === "Véhicule envisagé retiré." && enBase(a) === "Honda CR-V 2022 Touring ; Mazda CX-5 - -", "retrait du premier : les deux autres restent enregistrés");

    // ---------- Parcours C : opportunités multiples ----------
    const b = await creerOpportunite(page, p, "Projet B " + suffixe);
    await ouvrirOpportunites(page, p, b);
    await ajouter(page, b, { marque: "Ford", modele: "Escape", annee: "2021" });
    await ouvrirOpportunites(page, p, a);
    verifier(JSON.stringify(await affiches(page, a)) === JSON.stringify(["2022 Honda CR-V Touring", "Mazda CX-5"]) &&
      JSON.stringify(await affiches(page, b)) === JSON.stringify(["2021 Ford Escape"]), "A et B : chacune affiche sa propre collection");
    ids = idsEnBase(a);
    await modifier(page, a, ids[1], { annee: "2025" });
    verifier(enBase(b) === "Ford Escape 2021 -" && enBase(a) === "Honda CR-V 2022 Touring ; Mazda CX-5 2025 -", "modifier un véhicule de A ne change pas B");
    await retirer(page, idsEnBase(b)[0]);
    verifier(enBase(b) === "" && enBase(a) === "Honda CR-V 2022 Touring ; Mazda CX-5 2025 -", "retirer le véhicule de B ne change pas A");

    // ---------- Parcours D : concurrence ----------
    const autreOnglet = await nouvellePage(navigateur);
    await connecter(autreOnglet, SOPHIE);
    await ouvrirOpportunites(autreOnglet, p, a);
    await ouvrirOpportunites(page, p, a);
    ids = idsEnBase(a);
    await modifier(page, a, ids[0], { finition: "EX-L" });
    await autreOnglet.click('[data-vehicule-action="modifier"][data-vehicule="ve-' + ids[0] + '"]');
    await remplir(autreOnglet, { finition: "Sport" });
    await Promise.all([autreOnglet.waitForNavigation(), autreOnglet.click("#form-vehicule [data-vehicule-envoyer]")]);
    const refusModif = await message(autreOnglet);
    verifier(refusModif.includes("modifié entre-temps") && enBase(a) === "Honda CR-V 2022 EX-L ; Mazda CX-5 2025 -",
      "modification depuis une page périmée : refus expliqué, la valeur la plus récente est gardée");
    await autreOnglet.click("#onglet-opportunites"); await autreOnglet.waitForTimeout(200);
    verifier((await affiches(autreOnglet, a))[0] === "2022 Honda CR-V EX-L", "la page refusée affiche maintenant les valeurs actuelles");
    // Retrait depuis la première page, puis l'autre (ancienne version) tente de modifier le véhicule retiré.
    await retirer(page, ids[1]);
    await autreOnglet.click('[data-vehicule-action="modifier"][data-vehicule="ve-' + ids[1] + '"]');
    await remplir(autreOnglet, { finition: "Recréé" });
    await Promise.all([autreOnglet.waitForNavigation(), autreOnglet.click("#form-vehicule [data-vehicule-envoyer]")]);
    verifier((await message(autreOnglet)).includes("modifié entre-temps") && enBase(a) === "Honda CR-V 2022 EX-L" &&
      sql("SELECT COUNT(*) FROM VehiculesEnvisages WHERE Finition = 'Recréé'") === "0", "modification d'un véhicule retiré entre-temps : refusée, rien n'est recréé");
    await autreOnglet.context().close();

    // ---------- Parcours E : sécurité ----------
    function creerConseiller(courriel, concession) {
      sql("INSERT INTO AspNetUsers (Id, FirstName, LastName, DealershipId, IsActive, MustChangePassword, CreatedAt, UserName, NormalizedUserName, Email, NormalizedEmail, EmailConfirmed, PasswordHash, SecurityStamp, ConcurrencyStamp, PhoneNumberConfirmed, TwoFactorEnabled, LockoutEnabled, AccessFailedCount) " +
        "SELECT UUID(), 'Autre', 'Conseiller', " + concession + ", 1, 0, NOW(), '" + courriel + "', UPPER('" + courriel + "'), '" + courriel + "', UPPER('" + courriel + "'), 1, PasswordHash, UUID(), UUID(), 0, 0, 1, 0 FROM AspNetUsers WHERE Email = '" + SOPHIE + "'");
      sql("INSERT INTO AspNetUserRoles (UserId, RoleId) SELECT u.Id, r.Id FROM AspNetUsers u, AspNetRoles r WHERE u.Email = '" + courriel + "' AND r.Name = 'Conseiller'");
    }
    sql("UPDATE Dealerships SET IsActive = 1 WHERE Name = 'Garage Saint-Laurent'");
    const collegue = "collegue.vehic." + suffixe + "@autoprestige.example";
    const ailleurs = "ailleurs.vehic." + suffixe + "@garagestl.example";
    creerConseiller(collegue, "(SELECT DealershipId FROM (SELECT DealershipId FROM AspNetUsers WHERE Email = '" + SOPHIE + "') x)");
    creerConseiller(ailleurs, "(SELECT Id FROM Dealerships WHERE Name = 'Garage Saint-Laurent')");
    const veA = idsEnBase(a)[0];
    const total = sql("SELECT COUNT(*) FROM VehiculesEnvisages");
    const etatA = enBase(a);
    for (const courriel of [collegue, ailleurs]) {
      const v = await nouvellePage(navigateur);
      await connecter(v, courriel);
      await v.goto(BASE_URL + "/Prospects");
      const jeton = await v.locator('input[name="__RequestVerificationToken"]').first().inputValue();
      const statuts = [];
      for (const [action, vehicule] of [["AjouterVehicule", ""], ["ModifierVehicule", "ve-" + veA], ["RetirerVehicule", "ve-" + veA]]) {
        const r = await v.request.post(BASE_URL + "/Prospects/" + action, { form: { prospectId: "pe-" + p, opportuniteId: "oe-" + a, vehiculeId: vehicule, version: "x",
          champs: "marque,modele", marque: "Intrusion", modele: "X", __RequestVerificationToken: jeton }, maxRedirects: 0 });
        statuts.push(r.status());
      }
      verifier(statuts.join(",") === "404,404,404" && sql("SELECT COUNT(*) FROM VehiculesEnvisages") === total && enBase(a) === etatA,
        (courriel === collegue ? "collègue" : "autre concession") + " : ajout, modification et retrait refusés (404), rien d'écrit");
      await v.context().close();
    }
    const autre = await creerProspect(page, "Autre" + suffixe);
    const oppAutre = sql("SELECT Id FROM OpportunitesVente WHERE ProspectId = " + autre);
    await ouvrirOpportunites(page, autre);
    await ajouter(page, oppAutre, { marque: "Toyota", modele: "RAV4" });
    const veAutre = idsEnBase(oppAutre)[0];
    await ouvrirOpportunites(page, p, a);
    const version = await page.evaluate(function (id) { return window.Prospects.contact(id).version; }, "pe-" + p);
    const jetonSophie = await page.locator('input[name="__RequestVerificationToken"]').first().inputValue();
    async function poster(action, champs) {
      const r = await page.request.post(BASE_URL + "/Prospects/" + action, { form: Object.assign({ prospectId: "pe-" + p, version: version, champs: "marque,modele", marque: "Pirate", modele: "X", __RequestVerificationToken: jetonSophie }, champs), maxRedirects: 0 });
      return r.status();
    }
    const forges = [
      await poster("RetirerVehicule", { opportuniteId: "oe-" + b, vehiculeId: "ve-" + veA }),
      await poster("ModifierVehicule", { opportuniteId: "oe-" + a, vehiculeId: "ve-" + veAutre }),
      await poster("AjouterVehicule", { opportuniteId: "oe-" + oppAutre }),
      await poster("ModifierVehicule", { opportuniteId: "oe-" + a, vehiculeId: "ve-999999999" }),
      await poster("ModifierVehicule", { opportuniteId: "oe-" + a, vehiculeId: "ve-abc" }),
    ];
    const sansJeton = (await page.request.post(BASE_URL + "/Prospects/RetirerVehicule", { form: { prospectId: "pe-" + p, opportuniteId: "oe-" + a, vehiculeId: "ve-" + veA, version: version }, maxRedirects: 0 })).status();
    const perimee = await poster("RetirerVehicule", { opportuniteId: "oe-" + a, vehiculeId: "ve-" + veA, version: "ancienne" });
    verifier(forges.join(",") === "404,404,404,404,404" && sansJeton === 400 && perimee === 302 && enBase(a) === etatA && enBase(oppAutre) === "Toyota RAV4 - -" &&
      sql("SELECT COUNT(*) FROM VehiculesEnvisages") === String(Number(total) + 1),
      "véhicule d'une autre opportunité ou d'un autre prospect, opportunité étrangère, identifiants forgés (404), sans jeton (400), version périmée (refus) : rien d'écrit");

    // ---------- Parcours F : démonstration, ancien état de l'onglet, catalogue ----------
    await page.goto(BASE_URL + "/Prospects/Fiche/chloe-bouchard#opportunites"); await page.waitForTimeout(700);
    await page.click("#onglet-opportunites"); await page.waitForTimeout(200);
    verifier((await page.locator("[data-vehicule-action]").count()) === 0, "démonstration : pas de commande d'enregistrement, la liste locale reste affichée comme avant");
    // Action locale de démonstration (qualification) : l'état de l'onglet est écrit, comme après une vraie séance.
    await page.click("#onglet-qualification"); await page.waitForTimeout(200);
    await page.click('#form-qualification button[type="submit"]');
    verifier((await message(page)).includes("localement"), "démonstration : l'action reste locale et le dit");
    await page.evaluate(function (id) {
      const cle = Object.keys(sessionStorage).filter(function (k) { return k.indexOf("phineas.salesos.prospects.v1:") === 0; })[0];
      const etat = JSON.parse(sessionStorage.getItem(cle));
      etat.opportunites.forEach(function (o) {
        if (o.id === "oe-" + id) {
          o.vehiculesEnvisages = ["2019 Ancienne Locale"];
          o.vehiculesDetail = [{ id: "ve-1", marque: "Ancienne", modele: "Locale", annee: 2019, finition: null, libelle: "2019 Ancienne Locale" }];
        }
      });
      sessionStorage.setItem(cle, JSON.stringify(etat));
    }, a);
    await ouvrirOpportunites(page, p, a);
    verifier(JSON.stringify(await affiches(page, a)) === JSON.stringify(["2022 Honda CR-V EX-L"]), "ancien état de l'onglet pour un dossier réel : la liste du serveur est affichée");
    const carte = await page.locator('[data-vehicules="oe-' + a + '"]').textContent();
    verifier(!/Réservé|Disponible en stock|Prix confirmé|Soumission enregistrée/.test(carte) && sql("SELECT COUNT(*) FROM Vehicules") === inventaireAvant,
      "aucune mention de réservation, de stock ou de prix confirmé ; inventaire réel inchangé");
    await page.goto(BASE_URL + "/Intelligence/Vehicules?opportunite=oe-" + a); await page.waitForTimeout(1200);
    const catalogue = await page.content();
    verifier(catalogue.indexOf("data-envisager-fiche") >= 0 && catalogue.indexOf("pas encore enregistrables") < 0 && enBase(a) === "Honda CR-V 2022 EX-L",
      "catalogue de démonstration, dossier réel : renvoi vers la fiche, rien n'est ajouté depuis le catalogue");

    // ---------- Parcours G : compatibilité ----------
    verifier(sql("SELECT CONCAT(Etape, '|', IFNULL(ProchaineAction,'-'), '|', DerniereActivite, '|', IFNULL(Categorie,'-'), '|', IFNULL(Modele,'-')) FROM OpportunitesVente WHERE Id = " + a) === avantA &&
      sql("SELECT COUNT(*) FROM NotesProspect WHERE ProspectId = " + p) === "0" && sql("SELECT COUNT(*) FROM HistoriquesSuiviOpportunite WHERE OpportuniteId IN (" + a + "," + b + ")") === "0" &&
      sql("SELECT COUNT(*) FROM HistoriquesEtapeOpportunite WHERE OpportuniteId IN (" + a + "," + b + ")") === "0" && sql("SELECT COUNT(*) FROM VeillesRecommandation WHERE OpportuniteId IN (" + a + "," + b + ")") === "0",
      "en base : étape, suivi, activité, qualification, notes, historiques et veilles inchangés");
    sql("UPDATE OpportunitesVente SET DateCreation = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 DAY) WHERE Id = " + a);
    await page.goto(BASE_URL + "/Intelligence"); await page.waitForTimeout(1000);
    verifier(await page.evaluate(function (id) { return window.Intelligence.actives().some(function (x) { return x.id === "premiere-reponse:oe-" + id; }); }, a),
      "la première réponse reste due : un véhicule envisagé n'est pas un contact déclaré");
    // Règle existante « qualifiée sans véhicule envisagé ni soumission » : lue sur la collection enregistrée.
    sql("UPDATE OpportunitesVente SET Etape = 'Qualifie', ProchaineAction = 'Rappeler', DateProchaineAction = DATE_ADD(CURDATE(), INTERVAL 5 DAY) WHERE Id = " + b);
    async function constatSansVehicule() {
      await page.goto(BASE_URL + "/Intelligence"); await page.waitForTimeout(1000);
      return page.evaluate(function (id) {
        return window.Intelligence.actives().some(function (x) { return x.opportuniteId === "oe-" + id && (x.constats || []).some(function (c) { return c.regle === "qualifiee-sans-vehicule"; }); });
      }, b);
    }
    const avantVehicule = await constatSansVehicule();
    await ouvrirOpportunites(page, p, b);
    await ajouter(page, b, { marque: "Hyundai", modele: "Tucson" });
    const apresVehicule = await constatSansVehicule();
    verifier(avantVehicule && !apresVehicule, "B qualifiée : « sans véhicule envisagé » signalé, puis levé par le véhicule enregistré");
    await page.goto(BASE_URL + "/Prospects/Fiche/pe-" + p + "?opportunite=oe-" + b); await page.waitForTimeout(600);
    verifier(await page.evaluate(function () { return document.querySelector("#onglet-qualification") !== null; }) && new URL(page.url()).search === "?opportunite=oe-" + b,
      "lien F19 vers une opportunité précise : la fiche s'ouvre sur ce projet");

    // ---------- Parcours H : affichage 320, 390 et 1440 px, clair et sombre ----------
    for (const [largeur, theme] of [[320, "clair"], [320, "sombre"], [390, "clair"], [390, "sombre"], [1440, "clair"], [1440, "sombre"]]) {
      const v = await nouvellePage(navigateur, { viewport: { width: largeur, height: 900 } });
      await connecter(v, SOPHIE);
      await ouvrirOpportunites(v, p, a);
      if (theme === "sombre") await v.evaluate(function () { document.documentElement.dataset.theme = "sombre"; });
      const boutons = await v.evaluate(function (id) {
        const liste = Array.from(document.querySelectorAll('[data-vehicules="oe-' + id + '"] [data-vehicule-action]'));
        const ajouter = document.querySelector('[data-vehicule-action="ajouter"][data-opp="oe-' + id + '"]');
        return liste.concat([ajouter]).every(function (b) {
          const r = b.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= window.innerWidth;
        }) && liste.length === 2;
      }, a);
      const ecart = await v.evaluate(function (id) {
        const m = document.querySelector('[data-vehicules="oe-' + id + '"] [data-vehicule-action="modifier"]').getBoundingClientRect();
        const r = document.querySelector('[data-vehicules="oe-' + id + '"] [data-vehicule-action="retirer"]').getBoundingClientRect();
        return r.left - m.right;
      }, a);
      await v.click('[data-vehicule-action="ajouter"][data-opp="oe-' + a + '"]');
      await v.waitForSelector("#modal-vehicule.show");
      await v.fill("#v-annee", "1700");
      await v.click("#form-vehicule [data-vehicule-envoyer]");
      await v.waitForTimeout(300);
      const invalide = await v.evaluate(function () {
        return ["v-marque", "v-modele", "v-annee"].every(function (id) { return document.getElementById(id).classList.contains("is-invalid"); });
      });
      const debord = await v.evaluate(function () { return document.documentElement.scrollWidth - document.documentElement.clientWidth; });
      await v.screenshot({ path: "vehicules-" + largeur + "-" + theme + ".png" });
      verifier(boutons && ecart >= 12 && invalide && debord === 0 && new URL(v.url()).pathname.indexOf("/Prospects/Fiche/") === 0,
        largeur + " px, thème " + theme + " : commandes visibles sans survol, « Retirer » séparé de « Modifier », erreurs affichées, rien d'envoyé, aucun débordement (" +
        JSON.stringify({ boutons: boutons, ecart: Math.round(ecart), invalide: invalide, debord: debord }) + ")");
      await v.context().close();
    }
    verifier(enBase(a) === "Honda CR-V 2022 EX-L", "les essais d'affichage n'ont rien enregistré");

    verifier(erreurs.length === 0, "aucune erreur JavaScript (" + JSON.stringify(erreurs) + ")");
    console.log("\nParcours des véhicules envisagés réussi (" + etape + " vérifications).");
  } catch (erreur) {
    console.error("\n" + erreur.message);
    process.exitCode = 1;
  } finally {
    await navigateur.close();
  }
})();
