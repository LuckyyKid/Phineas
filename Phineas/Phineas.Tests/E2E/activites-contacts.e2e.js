// Test de bout en bout : activité du dossier et contact client déclaré (fonctionnalité 11), sur l'application réelle
// et MySQL. Une note interne est une activité ; seul un « Appel effectué », un « Courriel (résumé) » ou une « Visite en
// concession » enregistrés sont des contacts déclarés. Fiche : « Dernière activité » et « Dernier contact déclaré »
// distincts ; « Mes suivis » : colonne « Dernier contact ».
// Prérequis et variables : les mêmes que modification-prospect.e2e.js (BASE_URL, CHROMIUM_PATH, MYSQL_CONTAINER, E2E_DB).
// Lancement : node activites-contacts.e2e.js   (le paquet « playwright » doit être installé)
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

async function creer(page, nom, suivi) {
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
  if (suivi) {
    await page.goto(BASE_URL + "/Prospects/Fiche/pe-" + ids[0]);
    await page.waitForTimeout(600);
    await page.click('[data-action="suivi"]');
    await page.waitForSelector("#modal-suivi.show");
    await page.fill("#s-action", suivi);
    await page.fill("#s-date", jour(0));
    await Promise.all([page.waitForNavigation(), page.click('#form-suivi button[type="submit"]')]);
  }
  return { prospectId: ids[0], oppId: ids[1] };
}

async function noter(page, prospectId, type, opp, texte) {
  await page.goto(BASE_URL + "/Prospects/Fiche/pe-" + prospectId);
  await page.click("#onglet-historique");
  await page.locator("#form-note").waitFor({ state: "visible" });
  await page.selectOption("#n-type", type);
  await page.selectOption("#n-opp", opp);
  await page.fill("#n-resume", texte);
  await Promise.all([page.waitForNavigation(), page.click('#form-note button[type="submit"]')]);
}

// Champs « Dernière activité » et « Dernier contact déclaré » de la fiche, après un nouveau chargement.
async function fiche(page, prospectId) {
  await page.goto(BASE_URL + "/Prospects/Fiche/pe-" + prospectId);
  await page.waitForTimeout(600);
  return {
    activite: await page.locator('[data-champ="derniere"]').innerText(),
    contact: await page.locator('[data-champ="dernier-contact"]').innerText(),
  };
}

// Texte de la colonne « Dernier contact » de la ligne de « Mes suivis » d'une opportunité (toutes pages) ; null si absente.
async function colonneContact(page, oppId) {
  await page.goto(BASE_URL + "/Intelligence/Suivis");
  await page.waitForTimeout(900);
  for (let numero = 1; numero <= 40; numero++) {
    const ligne = page.locator('#relances tr[data-obligation="contact:oe-' + oppId + '"]');
    if (await ligne.count()) return ligne.first().locator("td").nth(2).innerText();
    const suivante = page.locator('[data-zone="pagination-relances"] [data-aller-page="' + (numero + 1) + '"]:not([disabled])');
    if (!(await suivante.count())) return null;
    await suivante.first().click();
    await page.waitForTimeout(150);
  }
  return null;
}

async function premiereReponseDue(page, oppId) {
  await page.goto(BASE_URL + "/Intelligence/Suivis");
  await page.waitForTimeout(900);
  return page.evaluate(function (id) {
    return window.Intelligence.actives().some(function (a) { return a.regle === "premiere-reponse" && a.opportuniteId === id; });
  }, "oe-" + oppId);
}

(async () => {
  const navigateur = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await nouvellePage(navigateur);
  let code = 0;

  try {
    // ---------- Parcours principal ----------
    await connecter(page, SOPHIE);
    const a = await creer(page, "Activite" + suffixe, "Préparer le dossier de financement");
    await noter(page, a.prospectId, "note", "oe-" + a.oppId, "Client intéressé par les véhicules hybrides.");
    let f = await fiche(page, a.prospectId);
    await page.click("#onglet-historique"); await page.waitForTimeout(300);
    verifier((await page.locator('#panneau-historique [data-zone="timeline"]').innerText()).includes("Client intéressé par les véhicules hybrides."), "la note simple figure dans l'historique");
    verifier(f.activite.includes("Client intéressé par les véhicules hybrides.") && f.contact === "Aucun contact déclaré", "fiche : la note est la dernière activité, aucun contact déclaré");
    verifier((await colonneContact(page, a.oppId)) === "Aucun contact déclaré", "« Mes suivis » : la note n'est pas un « Dernier contact »");

    await noter(page, a.prospectId, "appel", "oe-" + a.oppId, "Premier appel : souhaite un essai.");
    f = await fiche(page, a.prospectId);
    verifier(f.contact.includes("Premier appel : souhaite un essai."), "appel déclaré : reconnu comme dernier contact");

    await noter(page, a.prospectId, "note", "oe-" + a.oppId, "Penser à vérifier le financement.");
    f = await fiche(page, a.prospectId);
    verifier(f.activite.includes("Penser à vérifier le financement.") && f.contact.includes("Premier appel : souhaite un essai."), "note plus récente : dernière activité = la note, dernier contact = l'appel (non confondus)");
    let colonne = await colonneContact(page, a.oppId);
    verifier(colonne.includes("Premier appel : souhaite un essai.") && !colonne.includes("Penser à vérifier"), "« Mes suivis » : le dernier contact reste l'appel");
    await page.reload(); await page.waitForTimeout(900);
    verifier((await colonneContact(page, a.oppId)).includes("Premier appel"), "après actualisation : même résultat");
    await page.click('form[action="/Account/Logout"] button[type="submit"]');
    await page.waitForURL(function (url) { return url.pathname.indexOf("/Intelligence") !== 0; });
    await connecter(page, SOPHIE);
    f = await fiche(page, a.prospectId);
    verifier(f.contact.includes("Premier appel") && f.activite.includes("Penser à vérifier"), "après reconnexion : même résultat");
    verifier(sql("SELECT GROUP_CONCAT(Type ORDER BY Id) FROM NotesProspect WHERE ProspectId = " + a.prospectId) === "note,appel,note", "en base : note, appel, note (types d'origine, rien de transformé)");

    // ---------- Suivi réalisé sans contact (scénario C) ----------
    await page.goto(BASE_URL + "/Intelligence/Suivis"); await page.waitForTimeout(900);
    await colonneContact(page, a.oppId);
    await Promise.all([page.waitForNavigation(), page.locator('#relances tr[data-obligation="contact:oe-' + a.oppId + '"] [data-realiser-suivi]').click()]);
    f = await fiche(page, a.prospectId);
    verifier(f.activite.includes("Suivi réalisé") && f.contact.includes("Premier appel"), "suivi réalisé : nouvelle activité, dernier contact inchangé");
    verifier(sql("SELECT Cloture FROM HistoriquesSuiviOpportunite WHERE OpportuniteId = " + a.oppId) === "Realise", "en base : suivi « Realise », historique conservé");

    // ---------- Courriel (résumé) et visite en concession ----------
    for (const type of ["courriel", "visite"]) {
      const x = await creer(page, type + suffixe);
      await noter(page, x.prospectId, type, "oe-" + x.oppId, "Contact " + type + " " + suffixe);
      verifier((await fiche(page, x.prospectId)).contact.includes("Contact " + type), type + " : reconnu comme dernier contact déclaré");
    }

    // ---------- Aucun contact (scénario B) ----------
    const b = await creer(page, "Aucun" + suffixe);
    await noter(page, b.prospectId, "note", "", "Note générale seulement.");
    f = await fiche(page, b.prospectId);
    verifier(f.contact === "Aucun contact déclaré" && f.activite.includes("Note générale seulement."), "seulement des notes : aucun contact déclaré, activité visible");

    // ---------- Deux opportunités et contact général ----------
    const d = await creer(page, "DeuxOpp" + suffixe);
    sql("INSERT INTO OpportunitesVente (ProspectId, Titre, Etape, DateCreation, DerniereActivite) VALUES (" + d.prospectId + ", 'Deuxième véhicule', 'Nouveau', NOW(), NOW())");
    const oppB = sql("SELECT Id FROM OpportunitesVente WHERE ProspectId = " + d.prospectId + " AND Titre = 'Deuxième véhicule'");
    await noter(page, d.prospectId, "appel", "oe-" + oppB, "Appel pour le deuxième véhicule.");
    colonne = await colonneContact(page, d.oppId);
    verifier(colonne.includes("Appel pour le deuxième véhicule.") && await premiereReponseDue(page, d.oppId) && !(await premiereReponseDue(page, oppB)),
      "deux opportunités : le dernier contact du client (vue globale) est l'appel de B, mais seule B a sa première réponse satisfaite");
    const g = await creer(page, "General" + suffixe);
    await noter(page, g.prospectId, "visite", "", "Visite générale en concession.");
    verifier((await fiche(page, g.prospectId)).contact.includes("Visite générale") && await premiereReponseDue(page, g.oppId), "contact général : dernier contact du client, sans satisfaire la première réponse");

    // ---------- Contact antérieur à une nouvelle demande ----------
    const e = await creer(page, "Ancien" + suffixe);
    await noter(page, e.prospectId, "appel", "oe-" + e.oppId, "Appel d'une ancienne demande.");
    sql("UPDATE NotesProspect n JOIN OpportunitesVente o ON o.Id = n.OpportuniteId SET n.DateCreation = DATE_SUB(o.DateCreation, INTERVAL 5 DAY) WHERE n.ProspectId = " + e.prospectId);
    verifier((await fiche(page, e.prospectId)).contact.includes("Appel d'une ancienne demande.") && await premiereReponseDue(page, e.oppId), "contact antérieur : reste le dernier contact connu, sans satisfaire la nouvelle demande");

    // ---------- Règles de relance et données de démonstration ----------
    await page.goto(BASE_URL + "/Intelligence/Suivis"); await page.waitForTimeout(900);
    const demo = await page.evaluate(function () {
      const I = window.Intelligence;
      const lignes = I.actives({ conseiller: window.Prospects.moiId }).filter(function (x) { return x.relance; });
      const notesCommeContact = lignes.map(function (x) { return I.contexteRelance(x.id).derniere; }).filter(function (c) { return c && c.type === "note"; }).length;
      const soumission = I.actives().filter(function (x) { return x.regle === "soumission-sans-reponse"; }).map(function (x) { return x.motif; });
      const camille = lignes.filter(function (x) { return x.client === "Camille Lavoie"; }).map(function (x) { return I.contexteRelance(x.id).derniere; })[0];
      return { notesCommeContact: notesCommeContact, soumission: soumission, camille: camille ? camille.type : null };
    });
    verifier(demo.notesCommeContact === 0 && demo.camille === "appel", "démonstration : aucune note affichée comme dernier contact (Camille Lavoie : l'appel, plus la note)");
    verifier(demo.soumission.length === 1 && /contact déclaré/.test(demo.soumission[0]), "règle « soumission sans réponse » (démonstration) : conservée, formulée en contacts déclarés");

    await page.goto(BASE_URL + "/Outils/Performances"); await page.waitForTimeout(1200);
    const perf = await page.evaluate(function () { return [].slice.call(document.querySelectorAll(".pf-chiffre, li, div")).map(function (x) { return x.innerText || ""; }).join(" | "); });
    verifier(/Sans premier contact déclaré/.test(perf) && !/Sans premier échange/.test(perf), "performances : « Sans premier contact déclaré » (indicateur aligné sur la première réponse)");
    await page.goto(BASE_URL + "/Relations/Pertes"); await page.waitForTimeout(1200);
    const faits = await page.evaluate(function () {
      const RC = window.RelationsClients;
      return RC.pertes().map(function (x) { const dp = RC.dossierPerte(x.opportunite.id); return dp ? dp.analyse.faits.join(" ") : ""; }).join(" ");
    });
    verifier(/contact\(s\) déclaré\(s\) avec le client/.test(faits) && !/échange\(s\) enregistré/.test(faits), "ventes perdues (démonstration) : faits exprimés en contacts déclarés");

    // ---------- Isolation entre conseillers et concessions ----------
    function creerConseiller(courriel, concession) {
      sql("INSERT INTO AspNetUsers (Id, FirstName, LastName, DealershipId, IsActive, MustChangePassword, CreatedAt, UserName, NormalizedUserName, Email, NormalizedEmail, EmailConfirmed, PasswordHash, SecurityStamp, ConcurrencyStamp, PhoneNumberConfirmed, TwoFactorEnabled, LockoutEnabled, AccessFailedCount) " +
        "SELECT UUID(), 'Autre', 'Conseiller', " + concession + ", 1, 0, NOW(), '" + courriel + "', UPPER('" + courriel + "'), '" + courriel + "', UPPER('" + courriel + "'), 1, PasswordHash, UUID(), UUID(), 0, 0, 1, 0 FROM AspNetUsers WHERE Email = '" + SOPHIE + "'");
      sql("INSERT INTO AspNetUserRoles (UserId, RoleId) SELECT u.Id, r.Id FROM AspNetUsers u, AspNetRoles r WHERE u.Email = '" + courriel + "' AND r.Name = 'Conseiller'");
    }
    sql("UPDATE Dealerships SET IsActive = 1 WHERE Name = 'Garage Saint-Laurent'");
    const collegue = "collegue.activite." + suffixe + "@autoprestige.example";
    const ailleurs = "ailleurs.activite." + suffixe + "@garagestl.example";
    creerConseiller(collegue, "(SELECT DealershipId FROM (SELECT DealershipId FROM AspNetUsers WHERE Email = '" + SOPHIE + "') x)");
    creerConseiller(ailleurs, "(SELECT Id FROM Dealerships WHERE Name = 'Garage Saint-Laurent')");
    for (const courriel of [collegue, ailleurs]) {
      const autre = await nouvellePage(navigateur);
      await connecter(autre, courriel);
      let fuite = false;
      for (const adresse of ["/Intelligence/Suivis", "/Outils/Performances", "/Outils/Assistant", "/Relations/Pertes"]) {
        const html = await (await autre.goto(BASE_URL + adresse)).text();
        if (html.includes("Premier appel : souhaite un essai.") || html.includes("Activite" + suffixe)) fuite = true;
      }
      verifier(!fuite, (courriel === collegue ? "collègue" : "autre concession") + " : aucune note ni contact de ces dossiers (Mes suivis, performances, assistant, pertes)");
    }

    // ---------- Thèmes et 390 px ----------
    for (const theme of ["clair", "sombre"]) {
      const mobile = await nouvellePage(navigateur, { viewport: { width: 390, height: 844 } });
      await connecter(mobile, SOPHIE);
      await mobile.goto(BASE_URL + "/Prospects/Fiche/pe-" + a.prospectId);
      if (theme === "sombre") await mobile.evaluate(function () { document.documentElement.dataset.theme = "sombre"; });
      await mobile.waitForTimeout(600);
      const zone = mobile.locator('[data-champ="dernier-contact"]');
      await zone.scrollIntoViewIfNeeded();
      const debord = await mobile.evaluate(function () { return document.documentElement.scrollWidth - document.documentElement.clientWidth; });
      const texte = await zone.innerText();
      await mobile.locator('[data-champ="dernier-contact"]').locator("xpath=ancestor::dl[1]").screenshot({ path: "activite-fiche-390-" + theme + ".png" });
      verifier(debord === 0 && texte.includes("Premier appel"), "390 px, thème " + theme + " : fiche sans défilement horizontal, dernier contact affiché");
    }

    console.log("\nParcours activité / contact réussi (" + etape + " vérifications).");
  } catch (erreur) {
    console.error("\n" + erreur.message);
    await page.screenshot({ path: "e2e-activite-echec.png" });
    code = 1;
  } finally {
    await navigateur.close();
  }
  process.exit(code);
})();
