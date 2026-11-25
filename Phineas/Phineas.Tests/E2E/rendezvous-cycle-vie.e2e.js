// Test de bout en bout de la fonctionnalité 23 : cycle de vie des rendez-vous commerciaux enregistrés, sur l'application
// réelle et MySQL. Modifier, replanifier et annuler avant le début ; déclarer la rencontre réalisée ou l'absence du client
// à partir du début ; états définitifs ; historique persistant ; rdvFutur du moteur recalculé à partir des rendez-vous
// enregistrés ; opportunités séparées ; requêtes forgées refusées ; fuseaux ; affichage ; démonstration à part.
// Le serveur garde son horloge réelle : pour qu'un rendez-vous « commence », son début est reculé dans la base de test
// (même effet qu'attendre l'heure prévue) ; les règles de temps à instant fixe sont couvertes par RendezVousCycleVieTests.
// Prérequis et variables : les mêmes que rendezvous-reels.e2e.js (BASE_URL, CHROMIUM_PATH, MYSQL_CONTAINER, E2E_DB).
// Lancement : node rendezvous-cycle-vie.e2e.js   (le paquet « playwright » doit être installé)
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

// Un rendez-vous en base : « Statut|Type|2027-01-15 19:00|45|Mode|Lieu ».
function rdvEnBase(id) {
  return sql("SELECT CONCAT_WS('|', Statut, Type, DATE_FORMAT(DebutUtc, '%Y-%m-%d %H:%i'), DureeMinutes, Mode, IFNULL(Lieu,'-')) FROM RendezVousCommerciaux WHERE Id = " + id);
}
// Son historique en base, dans l'ordre : « Modification:Modalité, Lieu ; Replanification:2027-01-15 19:00/45 ».
function historiqueEnBase(id) {
  return sql("SELECT IFNULL(GROUP_CONCAT(CONCAT(Type, ':', IFNULL(Champs, ''), IFNULL(CONCAT(DATE_FORMAT(AncienDebutUtc, '%Y-%m-%d %H:%i'), '/', AncienneDureeMinutes), '')) ORDER BY Id SEPARATOR ' ; '), '') FROM EvenementsRendezVousCommerciaux WHERE RendezVousId = " + id);
}
function nombreRendezVous() { return sql("SELECT COUNT(*) FROM RendezVousCommerciaux"); }
function nombreEvenements() { return sql("SELECT COUNT(*) FROM EvenementsRendezVousCommerciaux"); }
function dernierRendezVous(oppId) { return sql("SELECT MAX(Id) FROM RendezVousCommerciaux WHERE OpportuniteId = " + oppId); }
// « Le temps passe » pour ce rendez-vous : son début est reculé d'une heure avant maintenant (horloge réelle du serveur).
function commencerIlYaUneHeure(id) { sql("UPDATE RendezVousCommerciaux SET DebutUtc = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR) WHERE Id = " + id); }
// Ce que le cycle de vie ne doit jamais toucher sur une opportunité.
function etatOpportunite(oppId) {
  return sql("SELECT CONCAT_WS('|', Etape, IFNULL(ProchaineAction,'-'), IFNULL(DateProchaineAction,'-'), DerniereActivite, IFNULL(Categorie,'-'), IFNULL(Modele,'-'), " +
    "(SELECT COUNT(*) FROM HistoriquesSuiviOpportunite h WHERE h.OpportuniteId = o.Id), (SELECT COUNT(*) FROM HistoriquesEtapeOpportunite e WHERE e.OpportuniteId = o.Id), " +
    "(SELECT COUNT(*) FROM NotesProspect n WHERE n.OpportuniteId = o.Id), (SELECT COUNT(*) FROM VehiculesEnvisages v WHERE v.OpportuniteId = o.Id)) FROM OpportunitesVente o WHERE o.Id = " + oppId);
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

async function planifier(page, oppId, r) {
  await page.click('[data-rendezvous-planifier="oe-' + oppId + '"]');
  await page.waitForSelector("#modal-rendezvous.show");
  await page.selectOption("#rv-type", r.type || "Consultation");
  await page.fill("#rv-date", r.date);
  await page.fill("#rv-heure", r.heure);
  await page.selectOption("#rv-duree", String(r.duree || 45));
  await page.selectOption("#rv-mode", r.mode || "concession");
  if (r.lieu) await page.fill("#rv-lieu", r.lieu);
  await Promise.all([page.waitForNavigation(), page.click("#form-rendezvous [data-rendezvous-envoyer]")]);
  await page.waitForTimeout(500);
  return dernierRendezVous(oppId);
}

function bouton(rvId, action) {
  return '[data-rendezvous-action="' + action + '"][data-rendezvous="rv-' + rvId + '"]';
}
async function boutons(page, rvId) {
  return page.locator('[data-rendezvous-id="rv-' + rvId + '"] [data-rendezvous-action]').evaluateAll(function (l) { return l.map(function (b) { return b.dataset.rendezvousAction; }).join(","); });
}
async function carte(page, rvId) {
  return (await page.locator('[data-rendezvous-id="rv-' + rvId + '"]').textContent()).replace(/\s+/g, " ");
}

// Annuler, déclarer réalisé ou déclarer l'absence : la confirmation du navigateur est acceptée, puis la page se recharge.
async function changerStatut(page, rvId, action) {
  page.once("dialog", function (d) { d.accept(); });
  await Promise.all([page.waitForNavigation(), page.click(bouton(rvId, action))]);
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

// Recommandations « sans action » du moteur pour une opportunité, lues sur la page Centre d'actions.
async function sansAction(page, oppId) {
  await page.goto(BASE_URL + "/Intelligence"); await page.waitForTimeout(1000);
  return page.evaluate(function (id) { return window.Intelligence.actives().filter(function (x) { return x.opportuniteId === "oe-" + id && x.regle === "opportunite-sans-action"; }).length; }, oppId);
}

(async function () {
  const navigateur = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const erreurs = [];
  try {
    const page = await nouvellePage(navigateur);
    page.on("pageerror", function (e) { if (String(e.message).indexOf("ViewTransition") < 0) erreurs.push(e.message); });
    await connecter(page, SOPHIE);

    // ---------- Parcours A : modification ----------
    const p = await creerProspect(page, "Cycle" + suffixe);
    const a = sql("SELECT Id FROM OpportunitesVente WHERE ProspectId = " + p);
    const avantA = etatOpportunite(a);
    await ouvrirOpportunites(page, p);
    const r1 = await planifier(page, a, { type: "Consultation", date: "2027-01-15", heure: "14:00", duree: 45, lieu: "Salle A" });
    verifier(rdvEnBase(r1) === "Planifie|Consultation|2027-01-15 19:00|45|concession|Salle A" && (await boutons(page, r1)) === "modifier,replanifier,annuler",
      "rendez-vous planifié à venir : statut « Planifie » en base, actions Modifier, Replanifier, Annuler");
    await page.click(bouton(r1, "modifier"));
    await page.waitForSelector("#modal-rendezvous.show");
    const fenetre = await page.evaluate(function () {
      return { titre: document.getElementById("modal-rendezvous-titre").textContent, date: document.getElementById("rv-date").offsetParent !== null,
        lieu: document.getElementById("rv-lieu").value, dateActive: !document.getElementById("rv-date").disabled };
    });
    verifier(fenetre.titre === "Modifier le rendez-vous" && !fenetre.date && !fenetre.dateActive && fenetre.lieu === "Salle A",
      "fenêtre de modification : valeurs actuelles reprises, date et heure masquées et non envoyées");
    await page.selectOption("#rv-mode", "virtuel");
    await page.fill("#rv-lieu", "Lien Teams");
    await Promise.all([page.waitForNavigation(), page.click("#form-rendezvous [data-rendezvous-envoyer]")]);
    await page.waitForTimeout(500);
    verifier((await message(page)).indexOf("Rendez-vous modifié dans le dossier") === 0 && rdvEnBase(r1) === "Planifie|Consultation|2027-01-15 19:00|45|virtuel|Lien Teams" &&
      historiqueEnBase(r1) === "Modification:Modalité, Lieu" && sql("SELECT COUNT(*) FROM RendezVousCommerciaux WHERE OpportuniteId = " + a) === "1" &&
      etatOpportunite(a) === avantA,
      "modification confirmée par le serveur ; en base : même rendez-vous, même horaire, historique « Modalité, Lieu », opportunité inchangée");
    await page.reload(); await page.waitForTimeout(600); await page.click("#onglet-opportunites"); await page.waitForTimeout(200);
    verifier((await carte(page, r1)).includes("Rencontre virtuelle, Lien Teams") && (await carte(page, r1)).includes("Informations modifiées : Modalité, Lieu."),
      "après actualisation : nouvelles valeurs et ligne d'historique affichées");

    // ---------- Parcours B : replanification ----------
    await page.click(bouton(r1, "replanifier"));
    await page.waitForSelector("#modal-rendezvous.show");
    const prerempli = await page.evaluate(function () {
      return [document.getElementById("rv-date").value, document.getElementById("rv-heure").value, document.getElementById("rv-duree").value, document.getElementById("rv-type").offsetParent === null];
    });
    verifier(JSON.stringify(prerempli) === JSON.stringify(["2027-01-15", "14:00", "45", true]), "fenêtre de replanification : horaire actuel repris, informations masquées");
    await page.fill("#rv-date", "2027-07-15");
    await page.fill("#rv-heure", "14:00");
    await page.selectOption("#rv-duree", "60");
    await Promise.all([page.waitForNavigation(), page.click("#form-rendezvous [data-rendezvous-envoyer]")]);
    await page.waitForTimeout(500);
    verifier((await message(page)).indexOf("Rendez-vous replanifié dans le dossier") === 0 && rdvEnBase(r1) === "Planifie|Consultation|2027-07-15 18:00|60|virtuel|Lien Teams" &&
      historiqueEnBase(r1) === "Modification:Modalité, Lieu ; Replanification:2027-01-15 19:00/45" && dernierRendezVous(a) === r1,
      "replanifié : même identifiant, 14 h l'été = 18 h UTC, ancien horaire gardé dans l'historique, aucun second rendez-vous");
    await deconnecter(page);
    await connecter(page, SOPHIE);
    await ouvrirOpportunites(page, p, a);
    const texteB = await carte(page, r1);
    verifier(texteB.includes("jeudi 15 juillet 2027, de 14 h 00 à 15 h 00") && texteB.includes("Ancien horaire : vendredi 15 janvier 2027, de 14 h 00 à 14 h 45."),
      "après reconnexion : nouvel horaire affiché, ancien horaire dans l'historique");

    // ---------- Parcours C : annulation ----------
    const r2 = await planifier(page, a, { date: "2027-02-10", heure: "10:00" });
    page.once("dialog", function (d) { d.dismiss(); });
    await page.click(bouton(r2, "annuler"));
    await page.waitForTimeout(400);
    verifier(rdvEnBase(r2).indexOf("Planifie|") === 0 && historiqueEnBase(r2) === "", "confirmation refusée dans le navigateur : rien n'est envoyé");
    await changerStatut(page, r2, "annuler");
    verifier((await message(page)).indexOf("Rendez-vous annulé dans le dossier") === 0 && rdvEnBase(r2) === "Annule|Consultation|2027-02-10 15:00|45|concession|-" &&
      historiqueEnBase(r2) === "Annulation:", "annulé : ligne conservée avec son contenu, statut « Annule », historique d'annulation");
    await page.reload(); await page.waitForTimeout(600); await page.click("#onglet-opportunites"); await page.waitForTimeout(200);
    verifier((await carte(page, r2)).includes("Annulé") && (await boutons(page, r2)) === "", "après actualisation : « Annulé » écrit en toutes lettres, plus aucune action");

    // ---------- Parcours D : réalisation ----------
    sql("UPDATE OpportunitesVente SET DateCreation = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 DAY) WHERE Id = " + a);
    const avantD = etatOpportunite(a);
    const r3 = await planifier(page, a, { date: "2027-03-01", heure: "09:30" });
    commencerIlYaUneHeure(r3);
    await ouvrirOpportunites(page, p, a);
    verifier((await boutons(page, r3)) === "realiser,absent" && (await carte(page, r3)).includes("L'heure prévue est atteinte"),
      "heure prévue atteinte : seulement Déclarer réalisé et Déclarer une absence, le statut reste « Planifié »");
    await changerStatut(page, r3, "realiser");
    verifier((await message(page)) === "Rencontre déclarée réalisée dans le dossier." && rdvEnBase(r3).indexOf("Termine|") === 0 && historiqueEnBase(r3) === "Realisation:",
      "réalisé : statut « Termine », historique de réalisation");
    verifier(etatOpportunite(a) === avantD, "réalisation : ni contact, ni note, ni suivi, ni étape, ni activité, ni véhicule modifiés");
    await page.goto(BASE_URL + "/Intelligence"); await page.waitForTimeout(1000);
    verifier(await page.evaluate(function (id) { return window.Intelligence.actives().some(function (x) { return x.id === "premiere-reponse:oe-" + id; }); }, a),
      "la première réponse reste due : un rendez-vous réalisé n'est pas un contact déclaré");

    // ---------- Parcours E : absence ----------
    await ouvrirOpportunites(page, p, a);
    const r4 = await planifier(page, a, { date: "2027-03-02", heure: "11:00" });
    commencerIlYaUneHeure(r4);
    await ouvrirOpportunites(page, p, a);
    await changerStatut(page, r4, "absent");
    verifier((await message(page)) === "Absence du client déclarée dans le dossier." && rdvEnBase(r4).indexOf("ClientAbsent|") === 0 && historiqueEnBase(r4) === "Absence:" &&
      etatOpportunite(a) === avantD, "absent : statut « ClientAbsent », historique d'absence, ni réalisation ni contact");
    verifier((await carte(page, r4)).includes("Client absent") && (await carte(page, r3)).includes("Réalisé") && (await boutons(page, r4)) === "",
      "fiche : « Client absent » et « Réalisé » écrits en toutes lettres, sans action");

    // ---------- Parcours F : opportunités multiples ----------
    const b = await creerOpportunite(page, p, "Projet B " + suffixe);
    await ouvrirOpportunites(page, p, b);
    const rb = await planifier(page, b, { type: "Autre", date: "2027-12-12", heure: "10:00" });
    const r1Avant = rdvEnBase(r1);
    await changerStatut(page, rb, "annuler");
    verifier(rdvEnBase(rb).indexOf("Annule|") === 0 && rdvEnBase(r1) === r1Avant && historiqueEnBase(r1) === "Modification:Modalité, Lieu ; Replanification:2027-01-15 19:00/45",
      "annuler le rendez-vous de B ne touche pas ceux de A");
    const liens = await page.locator('[data-rendezvous-reels="oe-' + b + '"] [data-rendezvous-action]').evaluateAll(function (l) { return l.map(function (x) { return x.dataset.opp; }); });
    const liensA = await page.locator('[data-rendezvous-reels="oe-' + a + '"] [data-rendezvous-action]').evaluateAll(function (l) { return l.map(function (x) { return x.dataset.opp; }); });
    verifier(liens.length === 0 && liensA.length > 0 && liensA.every(function (x) { return x === "oe-" + a; }), "chaque bouton vise l'opportunité de sa carte");

    // ---------- Parcours G : intelligence commerciale (rdvFutur) ----------
    const p2 = await creerProspect(page, "Moteur" + suffixe);
    const g = sql("SELECT Id FROM OpportunitesVente WHERE ProspectId = " + p2);
    sql("UPDATE OpportunitesVente SET Etape = 'Qualifie', ProchaineAction = NULL, DateProchaineAction = NULL, DerniereActivite = UTC_TIMESTAMP() WHERE Id = " + g);
    sql("INSERT INTO VehiculesEnvisages (OpportuniteId, Marque, Modele) VALUES (" + g + ", 'Kia', 'Sportage')");
    verifier((await sansAction(page, g)) === 1, "opportunité qualifiée sans action ni rendez-vous : « sans action » détectée");
    await ouvrirOpportunites(page, p2, g);
    const rg = await planifier(page, g, { date: "2027-04-05", heure: "10:00" });
    verifier((await sansAction(page, g)) === 0, "rendez-vous réel à venir : rdvFutur vrai, « sans action » disparaît");
    await ouvrirOpportunites(page, p2, g);
    await changerStatut(page, rg, "annuler");
    verifier((await sansAction(page, g)) === 1, "rendez-vous annulé : rdvFutur recalculé, « sans action » revient");
    await page.reload(); await page.waitForTimeout(1000);
    verifier(await page.evaluate(function (id) { return window.Intelligence.actives().filter(function (x) { return x.opportuniteId === "oe-" + id && x.regle === "opportunite-sans-action"; }).length; }, g) === 1,
      "après actualisation : aucun ancien état gardé dans l'onglet ne masque l'annulation");
    // Un rendez-vous fictif de démonstration rattaché (à la main) au dossier réel n'est jamais une preuve.
    const fictif = await page.evaluate(function (ids) {
      const R = window.RendezVous;
      const r = R.planifier({ prospectId: ids.p, opportuniteId: ids.o, conseillerId: window.Prospects.moiId, type: "Consultation", debut: "2027-04-06T15:00:00Z", dureeMinutes: 45, mode: "concession" });
      return !!r;
    }, { p: "pe-" + p2, o: "oe-" + g });
    verifier(fictif && (await sansAction(page, g)) === 1 && sql("SELECT COUNT(*) FROM RendezVousCommerciaux WHERE OpportuniteId = " + g) === "1",
      "rendez-vous fictif sur un dossier réel : jamais compté comme rendez-vous à venir, rien d'écrit en base");

    // ---------- Parcours H : sécurité ----------
    await ouvrirOpportunites(page, p, a);
    const r5 = await planifier(page, a, { date: "2027-05-10", heure: "10:00" });
    const jeton = await page.locator('#form-rendezvous input[name="__RequestVerificationToken"]').inputValue();
    const version = await page.evaluate(function (id) { return window.Prospects.contact(id).version; }, "pe-" + p);
    const autre = await creerProspect(page, "Autre" + suffixe);
    const oppAutre = sql("SELECT Id FROM OpportunitesVente WHERE ProspectId = " + autre);
    const evenementsAvant = nombreEvenements();
    const r5Avant = rdvEnBase(r5);
    async function forger(action, champs, client, sansJeton) {
      const form = Object.assign({ prospectId: "pe-" + p, opportuniteId: "oe-" + a, rendezVousId: "rv-" + r5, version: version, type: "Consultation", mode: "virtuel",
        date: "2027-06-01", heure: "10:00", dureeMinutes: "45", statut: "Annule" }, champs);
      if (!sansJeton) form.__RequestVerificationToken = jeton;
      const r = await (client || page).request.post(BASE_URL + "/Prospects/" + action, { form: form, maxRedirects: 0 });
      return r.status();
    }
    const actions = ["ModifierRendezVous", "ReplanifierRendezVous", "ChangerStatutRendezVous"];
    const statuts = [];
    for (const action of actions) {
      statuts.push(await forger(action, { rendezVousId: "rv-" + rb }));
      statuts.push(await forger(action, { opportuniteId: "oe-" + oppAutre }));
      statuts.push(await forger(action, { rendezVousId: "rv-999999999" }));
      statuts.push(await forger(action, { rendezVousId: "rv-abc" }));
      statuts.push(await forger(action, { prospectId: "pe-" + autre }));
    }
    verifier(statuts.every(function (s) { return s === 404; }), "rendez-vous d'une autre opportunité, autre prospect, identifiants inexistants ou forgés : 404 (" + statuts.join(",") + ")");
    const sansJeton = [];
    const parGet = [];
    for (const action of actions) {
      sansJeton.push(await forger(action, {}, null, true));
      parGet.push((await page.request.get(BASE_URL + "/Prospects/" + action + "?prospectId=pe-" + p + "&opportuniteId=oe-" + a + "&rendezVousId=rv-" + r5 + "&version=" + version + "&statut=Annule", { maxRedirects: 0 })).status());
    }
    const perimee = await forger("ChangerStatutRendezVous", { version: "ancienne" });
    await page.goto(BASE_URL + "/Prospects/Fiche/pe-" + p); await page.waitForTimeout(500);
    const refusPerimee = await message(page);
    const terminal = await forger("ChangerStatutRendezVous", { rendezVousId: "rv-" + r3, statut: "Annule", version: await page.evaluate(function (id) { return window.Prospects.contact(id).version; }, "pe-" + p) });
    await page.goto(BASE_URL + "/Prospects/Fiche/pe-" + p); await page.waitForTimeout(500);
    const refusTerminal = await message(page);
    const statutForge = await forger("ChangerStatutRendezVous", { statut: "Planifie", version: await page.evaluate(function (id) { return window.Prospects.contact(id).version; }, "pe-" + p) });
    verifier(sansJeton.join(",") === "400,400,400" && parGet.every(function (s) { return s !== 302; }) && perimee === 302 && refusPerimee.includes("modifié entre-temps") &&
      terminal === 302 && refusTerminal.includes("ne peut plus être modifié ni changer de statut") && statutForge === 302 &&
      rdvEnBase(r5) === r5Avant && rdvEnBase(r3).indexOf("Termine|") === 0 && nombreEvenements() === evenementsAvant,
      "sans jeton (400), GET, version périmée, statut définitif et statut forgé : refusés, aucune écriture ni historique");
    function creerUtilisateur(courriel, concession, role) {
      sql("INSERT INTO AspNetUsers (Id, FirstName, LastName, DealershipId, IsActive, MustChangePassword, CreatedAt, UserName, NormalizedUserName, Email, NormalizedEmail, EmailConfirmed, PasswordHash, SecurityStamp, ConcurrencyStamp, PhoneNumberConfirmed, TwoFactorEnabled, LockoutEnabled, AccessFailedCount) " +
        "SELECT UUID(), 'Autre', 'Personne', " + concession + ", 1, 0, NOW(), '" + courriel + "', UPPER('" + courriel + "'), '" + courriel + "', UPPER('" + courriel + "'), 1, PasswordHash, UUID(), UUID(), 0, 0, 1, 0 FROM AspNetUsers WHERE Email = '" + SOPHIE + "'");
      sql("INSERT INTO AspNetUserRoles (UserId, RoleId) SELECT u.Id, r.Id FROM AspNetUsers u, AspNetRoles r WHERE u.Email = '" + courriel + "' AND r.Name = '" + role + "'");
    }
    sql("UPDATE Dealerships SET IsActive = 1 WHERE Name = 'Garage Saint-Laurent'");
    const memeConcession = "(SELECT DealershipId FROM (SELECT DealershipId FROM AspNetUsers WHERE Email = '" + SOPHIE + "') x)";
    for (const [nom, courriel, concession, role] of [
      ["collègue", "collegue.cycle." + suffixe + "@autoprestige.example", memeConcession, "Conseiller"],
      ["autre concession", "ailleurs.cycle." + suffixe + "@garagestl.example", "(SELECT Id FROM Dealerships WHERE Name = 'Garage Saint-Laurent')", "Conseiller"],
      ["directeur", "directeur.cycle." + suffixe + "@autoprestige.example", memeConcession, "Directeur"],
    ]) {
      creerUtilisateur(courriel, concession, role);
      const v = await nouvellePage(navigateur);
      await connecter(v, courriel);
      await v.goto(BASE_URL + (role === "Conseiller" ? "/Prospects" : "/"));
      const j = await v.locator('input[name="__RequestVerificationToken"]').first().inputValue().catch(function () { return ""; });
      const codes = [];
      for (const action of actions) {
        const r = await v.request.post(BASE_URL + "/Prospects/" + action, { form: { prospectId: "pe-" + p, opportuniteId: "oe-" + a, rendezVousId: "rv-" + r5, version: version,
          type: "Consultation", mode: "virtuel", date: "2027-06-01", heure: "10:00", dureeMinutes: "45", statut: "Annule", __RequestVerificationToken: j }, maxRedirects: 0 });
        const traite = r.status() === 302 && String(r.headers().location || "").indexOf("/Prospects/Fiche") >= 0;
        codes.push(traite ? "traité" : r.status());
      }
      verifier(codes.indexOf("traité") < 0 && (role !== "Conseiller" || codes.every(function (c) { return c === 404; })) && rdvEnBase(r5) === r5Avant && nombreEvenements() === evenementsAvant,
        nom + " : aucune modification, replanification ni changement de statut (" + codes.join(",") + ")");
      await v.context().close();
    }

    // ---------- Parcours I : dates et fuseaux ----------
    for (const fuseauPoste of ["UTC", "Asia/Tokyo"]) {
      const v = await nouvellePage(navigateur, { timezoneId: fuseauPoste });
      await connecter(v, SOPHIE);
      await ouvrirOpportunites(v, p, a);
      await v.click(bouton(r5, "replanifier"));
      await v.waitForSelector("#modal-rendezvous.show");
      const repris = await v.evaluate(function () { return document.getElementById("rv-date").value + " " + document.getElementById("rv-heure").value; });
      verifier(repris === "2027-05-10 10:00", "navigateur en " + fuseauPoste + " : l'horaire repris est l'heure commerciale de Toronto (" + repris + ")");
      await v.context().close();
    }
    const refus = [];
    for (const [r, attendu] of [
      [{ date: "2027-03-14", heure: "02:30", duree: "45" }, "n'existe pas"],
      [{ date: "2027-11-07", heure: "01:30", duree: "45" }, "existe deux fois"],
      [{ date: "2027-03-14", heure: "01:30", duree: "60" }, "changement d'heure"],
      [{ date: "2026-01-05", heure: "10:00", duree: "45" }, "déjà passé"],
    ]) {
      await ouvrirOpportunites(page, p, a);
      await page.click(bouton(r5, "replanifier"));
      await page.waitForSelector("#modal-rendezvous.show");
      await page.evaluate(function () { document.getElementById("rv-date").removeAttribute("min"); });
      await page.fill("#rv-date", r.date);
      await page.fill("#rv-heure", r.heure);
      await page.selectOption("#rv-duree", r.duree);
      await Promise.all([page.waitForNavigation(), page.click("#form-rendezvous [data-rendezvous-envoyer]")]);
      const m = await message(page);
      refus.push(m.indexOf("Rendez-vous non replanifié.") === 0 && m.includes(attendu));
    }
    verifier(refus.every(Boolean) && rdvEnBase(r5) === r5Avant && nombreEvenements() === evenementsAvant,
      "replanification vers une heure inexistante, ambiguë, traversant un changement d'heure ou passée : refusée, rien d'écrit (" + JSON.stringify(refus) + ")");
    await ouvrirOpportunites(page, p, a);
    await page.click(bouton(r5, "replanifier"));
    await page.waitForSelector("#modal-rendezvous.show");
    await page.fill("#rv-date", "2027-03-14"); await page.fill("#rv-heure", "03:00");
    await Promise.all([page.waitForNavigation(), page.click("#form-rendezvous [data-rendezvous-envoyer]")]);
    const ete = rdvEnBase(r5);
    await ouvrirOpportunites(page, p, a);
    await page.click(bouton(r5, "replanifier"));
    await page.waitForSelector("#modal-rendezvous.show");
    await page.fill("#rv-date", "2027-01-20"); await page.fill("#rv-heure", "23:30");
    await Promise.all([page.waitForNavigation(), page.click("#form-rendezvous [data-rendezvous-envoyer]")]);
    await page.waitForTimeout(400);
    verifier(ete.includes("2027-03-14 07:00") && rdvEnBase(r5).includes("2027-01-21 04:30") && (await carte(page, r5)).includes("mercredi 20 janvier 2027, de 23 h 30 à 0 h 15"),
      "3 h après le passage à l'heure d'été = 7 h UTC ; 23 h 30 à Toronto = lendemain 4 h 30 UTC, affiché le 20 janvier");

    // ---------- Parcours J : affichage 320, 390 et 1440 px, clair et sombre, clavier ----------
    for (const [largeur, theme] of [[320, "clair"], [320, "sombre"], [390, "clair"], [390, "sombre"], [1440, "clair"], [1440, "sombre"]]) {
      const v = await nouvellePage(navigateur, { viewport: { width: largeur, height: 900 } });
      await connecter(v, SOPHIE);
      await ouvrirOpportunites(v, p, a);
      if (theme === "sombre") await v.evaluate(function () { document.documentElement.dataset.theme = "sombre"; });
      const visibles = await v.evaluate(function (id) {
        const bs = Array.from(document.querySelectorAll('[data-rendezvous-id="rv-' + id + '"] [data-rendezvous-action]'));
        return bs.length === 3 && bs.every(function (x) { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= window.innerWidth; });
      }, r5);
      const statutsTexte = await v.evaluate(function (ids) {
        return ids.map(function (id) { return document.querySelector('[data-rendezvous-id="rv-' + id + '"] .rv-statut').textContent.trim(); }).join(",");
      }, [r2, r3, r4, r5]);
      // Historique ouvert au clavier (Tab jusqu'au résumé, puis Entrée).
      await v.focus('[data-rendezvous-id="rv-' + r1 + '"] [data-rendezvous-historique] summary');
      await v.keyboard.press("Enter");
      const ouvert = await v.evaluate(function (id) {
        const d = document.querySelector('[data-rendezvous-id="rv-' + id + '"] [data-rendezvous-historique]');
        const r = d.querySelector("ul").getBoundingClientRect();
        return d.open && r.width > 0 && r.right <= window.innerWidth;
      }, r1);
      // Action au clavier : le bouton Annuler s'atteint et demande une confirmation (refusée ici).
      let question = "";
      v.once("dialog", function (d) { question = d.message(); d.dismiss(); });
      await v.focus(bouton(r5, "annuler"));
      await v.keyboard.press("Enter");
      await v.waitForTimeout(300);
      const debord = await v.evaluate(function () { return document.documentElement.scrollWidth - document.documentElement.clientWidth; });
      await v.screenshot({ path: "cycle-vie-" + largeur + "-" + theme + ".png", fullPage: false });
      verifier(visibles && statutsTexte === "Annulé,Réalisé,Client absent,Planifié" && ouvert && question.includes("définitif") && debord === 0 && rdvEnBase(r5).indexOf("Planifie|") === 0,
        largeur + " px, thème " + theme + " : actions visibles sans survol, statuts en toutes lettres, historique au clavier, confirmation lisible, aucun débordement (" +
        JSON.stringify({ visibles: visibles, statuts: statutsTexte, ouvert: ouvert, debord: debord }) + ")");
      await v.context().close();
    }

    // ---------- Parcours K : démonstration ----------
    const avantK = nombreRendezVous() + "/" + nombreEvenements();
    await page.goto(BASE_URL + "/Prospects/Fiche/chloe-bouchard#opportunites"); await page.waitForTimeout(700);
    await page.click("#onglet-opportunites"); await page.waitForTimeout(200);
    verifier((await page.locator("[data-rendezvous-action], [data-rendezvous-reels]").count()) === 0, "fiche de démonstration : aucune commande de cycle de vie réel");
    await page.goto(BASE_URL + "/RendezVous"); await page.waitForTimeout(800);
    const demoAnnulee = await page.evaluate(function () {
      const R = window.RendezVous;
      const r = R.liste().filter(function (x) { return R.estActif(x) && new Date(x.debut) > new Date(); })[0];
      if (!r) return null;
      R.annuler(r.id, { motif: "autre", auteur: "conseiller" });
      return R.rdv(r.id).statut;
    });
    verifier(demoAnnulee === "Annule" && nombreRendezVous() + "/" + nombreEvenements() === avantK,
      "annulation d'un rendez-vous fictif : locale à l'onglet, aucun rendez-vous ni historique réel touché");

    verifier(erreurs.length === 0, "aucune erreur JavaScript (" + JSON.stringify(erreurs) + ")");
    console.log("\nParcours du cycle de vie des rendez-vous réussi (" + etape + " vérifications).");
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await navigateur.close();
  }
})();
