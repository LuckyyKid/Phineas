// Module Prospects : état local de démonstration.
// Le serveur fournit les données (balise #prospects-donnees) : prospects fictifs et prospects enregistrés en base
// (contacts avec « enregistre: true », créés par le tiroir via ProspectsController.Creer). Les autres modifications
// restent dans le sessionStorage de l'onglet ; les prospects enregistrés, eux, viennent toujours du serveur.
(function () {
  "use strict";

  var source = document.getElementById("prospects-donnees");
  if (!source) return;
  var charge = JSON.parse(source.textContent);
  var ref = charge.referentiels;
  var donneesInitiales = charge.donnees;

  var ACTIVES = ["Nouveau", "AQualifier", "Qualifie", "Soumission", "EssaiRoutier", "Negociation", "Finalisation"];
  var SYSTEME = "Phineas";
  var moiId = donneesInitiales.conseillerConnecteId;
  var moi = donneesInitiales.conseillers.filter(function (c) { return c.id === moiId; })[0];
  var CLE = "phineas.salesos.prospects.v1:" + (moi ? moi.nom : "");

  // ---------- Persistance (onglet courant uniquement) ----------
  function cloner(o) {
    return JSON.parse(JSON.stringify(o));
  }
  function lire() {
    try {
      var brut = window.sessionStorage.getItem(CLE);
      return brut ? JSON.parse(brut) : null;
    } catch (e) {
      return null;
    }
  }
  function ecrire() {
    try {
      window.sessionStorage.setItem(CLE, JSON.stringify(etat));
    } catch (e) {}
  }
  // Les prospects enregistrés en base viennent toujours du serveur : on retire de l'état sauvegardé ceux
  // qu'il contenait (copie peut-être périmée) puis on ajoute ceux que le serveur vient d'envoyer.
  function avecProspectsEnregistres(sauvegarde) {
    var anciens = {};
    sauvegarde.contacts.forEach(function (c) { if (c.enregistre) anciens[c.id] = true; });
    var gardes = {
      contacts: sauvegarde.contacts.filter(function (c) { return !anciens[c.id]; }),
      opportunites: sauvegarde.opportunites.filter(function (o) { return !anciens[o.prospectId]; }),
      interactions: sauvegarde.interactions.filter(function (i) { return !anciens[i.prospectId]; }),
    };

    var nouveaux = {};
    donneesInitiales.contacts.forEach(function (c) { if (c.enregistre) nouveaux[c.id] = true; });
    donneesInitiales.contacts.forEach(function (c) { if (nouveaux[c.id]) gardes.contacts.push(cloner(c)); });
    donneesInitiales.opportunites.forEach(function (o) { if (nouveaux[o.prospectId]) gardes.opportunites.push(cloner(o)); });
    donneesInitiales.interactions.forEach(function (i) { if (nouveaux[i.prospectId]) gardes.interactions.push(cloner(i)); });

    sauvegarde.contacts = gardes.contacts;
    sauvegarde.opportunites = gardes.opportunites;
    sauvegarde.interactions = gardes.interactions;
    return sauvegarde;
  }

  var sauvegarde = lire();
  var etat = sauvegarde ? avecProspectsEnregistres(sauvegarde) : cloner(donneesInitiales);
  var modifie = !!sauvegarde;
  var abonnes = [];
  // Autres modules locaux (ex. soumissions) partageant le bandeau de démonstration.
  var modules = [];

  function changer() {
    modifie = true;
    ecrire();
    abonnes.forEach(function (f) { f(); });
  }

  // ---------- Outils ----------
  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function maintenant() {
    return new Date();
  }
  function iso(d) {
    return d.toISOString();
  }
  function jour(d) {
    var x = new Date(d);
    return new Date(x.getFullYear(), x.getMonth(), x.getDate());
  }
  function ecartJours(d) {
    return Math.round((jour(d) - jour(maintenant())) / 86400000);
  }
  // Date d'un champ <input type="date"> (AAAA-MM-JJ) interprétée en heure locale.
  function depuisChampDate(v) {
    if (!v) return null;
    var p = v.split("-");
    return new Date(+p[0], +p[1] - 1, +p[2], 9, 0, 0);
  }
  function versChampDate(d) {
    if (!d) return "";
    var x = new Date(d);
    var m = String(x.getMonth() + 1).padStart(2, "0");
    var j = String(x.getDate()).padStart(2, "0");
    return x.getFullYear() + "-" + m + "-" + j;
  }
  function aujourdhuiChamp() {
    return versChampDate(maintenant());
  }

  var fmtArgent = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
  var fmtJour = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short" });
  var fmtJourAnnee = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", year: "numeric" });
  var fmtComplet = new Intl.DateTimeFormat("fr-CA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  var fmtHeure = new Intl.DateTimeFormat("fr-CA", { hour: "numeric", minute: "2-digit" });

  function argent(n) {
    return n == null || n === "" ? null : fmtArgent.format(n);
  }
  // Termine une phrase par un point, sans le doubler : une date abrégée finit déjà par un point (« 25 nov. »).
  function terminerPhrase(texte) {
    return /[.!?]$/.test(texte) ? texte : texte + ".";
  }
  function dateCourte(d) {
    var x = new Date(d);
    return x.getFullYear() === maintenant().getFullYear() ? fmtJour.format(x) : fmtJourAnnee.format(x);
  }
  function dateComplete(d) {
    return fmtComplet.format(new Date(d)) + ", " + fmtHeure.format(new Date(d));
  }
  // Passé : « il y a 3 j ». Même logique que FormatVente.Relatif côté serveur.
  function relatif(d) {
    var min = (maintenant() - new Date(d)) / 60000;
    if (min < 1) return "à l'instant";
    if (min < 60) return "il y a " + Math.floor(min) + " min";
    if (min < 1440) return "il y a " + Math.floor(min / 60) + " h";
    if (min < 2880) return "hier";
    if (min < 60 * 24 * 60) return "il y a " + Math.floor(min / 1440) + " j";
    return "le " + dateCourte(d);
  }
  // Échéance : « aujourd'hui », « demain », « en retard de 2 j », « 21 nov. ».
  function echeance(d) {
    var e = ecartJours(d);
    if (e === 0) return "aujourd'hui";
    if (e === 1) return "demain";
    if (e < 0) return "en retard de " + -e + " j";
    return dateCourte(d);
  }
  function initiales(c) {
    return ((c.prenom || " ")[0] + (c.nom || " ")[0]).toUpperCase();
  }
  function libelle(liste, cle) {
    return cle && ref[liste] && ref[liste][cle] ? ref[liste][cle] : null;
  }
  function libelleEtape(cle) {
    var e = ref.etapes.filter(function (x) { return x.cle === cle; })[0];
    return e ? e.libelle : cle;
  }
  function listeTexte(v) {
    return (v || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function nouvelId(prefixe) {
    return prefixe + "-local-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // ---------- Lecture ----------
  function contacts() {
    return etat.contacts;
  }
  function contact(id) {
    return etat.contacts.filter(function (c) { return c.id === id; })[0] || null;
  }
  function opportunite(id) {
    return etat.opportunites.filter(function (o) { return o.id === id; })[0] || null;
  }
  function opportunitesDe(contactId) {
    return etat.opportunites
      .filter(function (o) { return o.prospectId === contactId; })
      .sort(function (a, b) {
        var actA = estActive(a) ? 0 : 1, actB = estActive(b) ? 0 : 1;
        return actA - actB || new Date(b.derniereActivite) - new Date(a.derniereActivite);
      });
  }
  function interactionsDe(contactId) {
    return etat.interactions
      .filter(function (i) { return i.prospectId === contactId; })
      .sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
  }
  function conseiller(id) {
    var c = etat.conseillers.filter(function (x) { return x.id === id; })[0];
    if (!c) return { nom: "Non attribué", fictif: false, moi: false };
    return { nom: c.nom, fictif: c.estFictif, moi: c.id === moiId };
  }
  function estActive(o) {
    return ACTIVES.indexOf(o.etape) >= 0;
  }

  // Suivi requis : opportunité active dont le suivi est dû, en retard, ou absent.
  function suivi(o) {
    if (!estActive(o)) return null;
    if (!o.dateProchaineAction) return { requis: true, motif: "Aucun suivi planifié" };
    var e = ecartJours(o.dateProchaineAction);
    if (e < 0) return { requis: true, motif: "Suivi en retard" };
    if (e === 0) return { requis: true, motif: "Suivi prévu aujourd'hui" };
    return { requis: false, motif: null };
  }
  function suiviRequisContact(contactId) {
    return opportunitesDe(contactId).some(function (o) { var s = suivi(o); return s && s.requis; });
  }

  // Opportunité mise en avant pour un contact (la plus récente active, sinon la plus récente).
  function principale(contactId, etapeFiltre) {
    var liste = opportunitesDe(contactId);
    if (etapeFiltre) liste = liste.filter(function (o) { return o.etape === etapeFiltre; });
    return liste[0] || null;
  }
  // Libellé du projet d'une opportunité (fonctionnalité 19), seulement si son prospect en a plusieurs : sinon null, et
  // la carte reste aussi simple qu'avant. Deux projets au même titre (casse et espaces ignorés) : la date d'ouverture
  // les distingue ; ouverts le même jour, le numéro de l'opportunité aussi. Rien n'est inventé.
  function projet(oppId) {
    var o = opportunite(oppId);
    if (!o) return null;
    var soeurs = opportunitesDe(o.prospectId);
    if (soeurs.length < 2) return null;
    function cle(x) { return String(x.titre || "").trim().toLowerCase(); }
    var memesTitres = soeurs.filter(function (x) { return x.id !== o.id && cle(x) === cle(o); });
    var libelle = o.titre;
    if (!memesTitres.length) return libelle;
    var jourOuverture = dateCourte(o.dateCreation);
    libelle += " · ouverte le " + jourOuverture;
    var memeJour = memesTitres.some(function (x) { return dateCourte(x.dateCreation) === jourOuverture; });
    if (memeJour) libelle += " · n° " + String(o.id).replace(/^oe?-/, "");
    return libelle;
  }

  function derniereInteraction(contactId) {
    var i = interactionsDe(contactId)[0];
    if (i) return i;
    var c = contact(contactId);
    return c ? { date: c.dateCreation, type: "creation", resume: "Prospect créé" } : null;
  }
  // Prochaine action du contact : la plus proche parmi ses opportunités actives.
  function prochaineAction(contactId) {
    var avecAction = opportunitesDe(contactId).filter(function (o) { return estActive(o) && o.prochaineAction; });
    avecAction.sort(function (a, b) {
      return new Date(a.dateProchaineAction || 8.64e15) - new Date(b.dateProchaineAction || 8.64e15);
    });
    return avecAction[0] || null;
  }

  // ---------- Qualification ----------
  var CHAMPS_QUALIF = [
    { libelle: "Catégorie de véhicule", ok: function (q) { return !!q.categorie; } },
    { libelle: "Neuf ou occasion", ok: function (q) { return !!q.etat; } },
    { libelle: "Marque ou modèle", ok: function (q) { return (q.marques || []).length + (q.modeles || []).length > 0; } },
    { libelle: "Nombre de places", ok: function (q) { return !!q.places; } },
    { libelle: "Utilisation principale", ok: function (q) { return !!q.utilisation; } },
    { libelle: "Budget (total ou mensuel)", ok: function (q) { return q.budgetTotal != null || q.budgetMensuel != null; } },
    { libelle: "Mode d'achat", ok: function (q) { return !!q.modeAchat; } },
    { libelle: "Véhicule à reprendre", ok: function (q) { return !!q.reprise; } },
    { libelle: "Horizon d'achat", ok: function (q) { return !!q.horizon || !!q.dateCible; } },
    { libelle: "Éléments de décision", ok: function (q) { return (q.elementsDecision || []).length > 0; } },
  ];
  function completude(q) {
    q = q || {};
    var manquants = CHAMPS_QUALIF.filter(function (c) { return !c.ok(q); }).map(function (c) { return c.libelle; });
    return { remplis: CHAMPS_QUALIF.length - manquants.length, total: CHAMPS_QUALIF.length, manquants: manquants };
  }
  function resumeVehicule(o) {
    var q = o.qualification || {};
    var morceaux = [];
    var modeles = (q.marques || []).concat(q.modeles || []);
    if (o.vehiculesEnvisages && o.vehiculesEnvisages.length) return o.vehiculesEnvisages.join(" · ");
    if (q.modeles && q.modeles.length) morceaux.push(modeles.join(", "));
    else if (q.marques && q.marques.length) morceaux.push(q.marques.join(", "));
    if (q.categorie) morceaux.push(libelle("categories", q.categorie));
    return morceaux.join(" · ") || null;
  }
  function resumeBudget(q) {
    q = q || {};
    var parts = [];
    if (q.budgetTotal != null) parts.push(argent(q.budgetTotal));
    if (q.budgetMensuel != null) parts.push(argent(q.budgetMensuel) + " / mois");
    return parts.join(" · ") || null;
  }

  // ---------- Écritures (locales) ----------
  function journaliser(contactId, oppId, type, resume, auteur, prochaine) {
    var i = {
      id: nouvelId("i"),
      prospectId: contactId,
      opportuniteId: oppId || null,
      date: iso(maintenant()),
      type: type,
      auteur: auteur || (moi ? moi.nom : SYSTEME),
      resume: resume,
      prochaineAction: prochaine || null,
    };
    etat.interactions.push(i);
    return i;
  }

  function ajouterProspect(d) {
    var c = {
      id: nouvelId("p"),
      prenom: d.prenom,
      nom: d.nom,
      courriel: d.courriel || null,
      telephone: d.telephone || null,
      contactPrefere: d.contactPrefere,
      momentContact: null,
      source: d.source,
      sourceDetail: d.sourceDetail || null,
      conseillerId: d.conseillerId,
      dateCreation: iso(maintenant()),
    };
    etat.contacts.push(c);

    var q = { marques: [], modeles: [], caracteristiques: [], elementsDecision: [] };
    if (d.categorie) q.categorie = d.categorie;
    if (d.modele) q.modeles = [d.modele];
    if (d.budget != null) q.budgetTotal = d.budget;
    if (d.horizon) q.horizon = d.horizon;

    var o = {
      id: nouvelId("o"),
      prospectId: c.id,
      titre: d.modele || libelle("categories", d.categorie) || "Premier intérêt",
      etape: d.etape,
      dateCreation: c.dateCreation,
      derniereActivite: c.dateCreation,
      prochaineAction: d.prochaineAction || (d.dateSuivi ? "Premier contact" : null),
      dateProchaineAction: d.dateSuivi ? iso(d.dateSuivi) : null,
      vehiculesEnvisages: [],
      qualification: q,
    };
    etat.opportunites.push(o);

    journaliser(c.id, o.id, "creation", "Prospect créé manuellement. Provenance : " + (libelle("sources", d.source) || d.source) + (d.sourceDetail ? " (" + d.sourceDetail + ")" : "") + ".");
    if (d.commentaire) journaliser(c.id, o.id, "note", d.commentaire);
    changer();
    return c;
  }

  function modifierContact(id, patch) {
    var c = contact(id);
    if (!c) return;
    var avant = c.conseillerId;
    Object.keys(patch).forEach(function (k) { c[k] = patch[k]; });
    if (patch.conseillerId && patch.conseillerId !== avant) {
      journaliser(id, null, "note", "Conseiller responsable : " + conseiller(avant).nom + " → " + conseiller(patch.conseillerId).nom, SYSTEME);
    }
    changer();
  }

  // Opportunité enregistrée en base (id « oe-… ») : son étape se change sur le serveur, pas dans cet onglet.
  function estEnregistree(oppId) {
    return String(oppId).indexOf("oe-") === 0;
  }

  // Envoie le changement d'étape d'une opportunité enregistrée à ProspectsController.ChangerEtape, qui l'enregistre
  // avec son historique puis recharge la page d'origine (retour : "fiche" ou "liste") avec un message.
  // La version (empreinte du prospect) fait refuser le changement si le dossier a été modifié entre-temps.
  function envoyerEtape(oppId, etape, retour) {
    var o = opportunite(oppId);
    var c = o ? contact(o.prospectId) : null;
    if (!o || !c || !charge.urlChangerEtape) return;
    var form = document.createElement("form");
    form.method = "post";
    form.action = charge.urlChangerEtape;
    var champs = {
      opportuniteId: o.id,
      prospectId: c.id,
      etape: etape,
      version: c.version || "",
      retour: retour,
      __RequestVerificationToken: charge.jeton,
    };
    Object.keys(champs).forEach(function (nom) {
      var input = document.createElement("input");
      input.type = "hidden";
      input.name = nom;
      input.value = champs[nom];
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  }

  // Nouvelle opportunité d'un prospect enregistré (fonctionnalité 18) : envoi à ProspectsController.CreerOpportunite,
  // avec l'empreinte du prospect affichée (un deuxième envoi identique est refusé par le serveur). Retour : la fiche,
  // la nouvelle opportunité sélectionnée, avec un message.
  function envoyerOpportunite(contactId, d) {
    var c = contact(contactId);
    if (!c || !c.enregistre || !charge.urlCreerOpportunite) return false;
    posterSuivi(charge.urlCreerOpportunite, {
      prospectId: c.id,
      version: c.version || "",
      titre: d.titre,
      categorie: d.categorie || "",
      etape: d.etape,
    });
    return true;
  }

  // Qualification d'une opportunité enregistrée (fonctionnalité 20) : le formulaire de la fiche est envoyé tel quel à
  // ProspectsController.Qualifier, avec l'opportunité, l'empreinte du prospect affichée et la liste des champs envoyés
  // (champs : seuls ceux-là changent sur le serveur). Rien n'est écrit dans l'onglet : la fiche se recharge avec les
  // valeurs enregistrées et un message du serveur.
  function envoyerQualification(oppId, formulaire, champs) {
    var o = opportunite(oppId);
    var c = o ? contact(o.prospectId) : null;
    if (!o || !c || !c.enregistre || !estEnregistree(oppId) || !charge.urlQualifier) return false;
    var caches = { prospectId: c.id, opportuniteId: o.id, version: c.version || "", champs: champs.join(","), __RequestVerificationToken: charge.jeton };
    Object.keys(caches).forEach(function (nom) {
      var input = document.createElement("input");
      input.type = "hidden";
      input.name = nom;
      input.value = caches[nom];
      formulaire.appendChild(input);
    });
    formulaire.method = "post";
    formulaire.action = charge.urlQualifier;
    formulaire.submit();
    return true;
  }

  // « Marquer comme réalisé » du suivi d'une opportunité enregistrée : envoi à ProspectsController.RealiserSuivi,
  // qui archive l'action et revient à la page d'origine (retour : chemin local, ex. /Intelligence/Suivis) avec un message.
  // versionSuivi : empreinte de l'action affichée ; le serveur refuse si l'action a changé entre-temps.
  function envoyerRealisation(oppId, retour) {
    var o = opportunite(oppId);
    if (!o || !charge.urlRealiserSuivi) return;
    posterSuivi(charge.urlRealiserSuivi, {
      opportuniteId: o.id,
      versionSuivi: o.versionSuivi || "",
      retour: retour,
    });
  }

  // « Reporter » du suivi d'une opportunité enregistrée : envoi à ProspectsController.ReporterSuivi avec la nouvelle
  // date (AAAA-MM-JJ, champ <input type="date">). Même action, nouvelle échéance ; retour à la page d'origine.
  function envoyerReport(oppId, jour, retour) {
    var o = opportunite(oppId);
    if (!o || !charge.urlReporterSuivi) return;
    posterSuivi(charge.urlReporterSuivi, {
      opportuniteId: o.id,
      versionSuivi: o.versionSuivi || "",
      date: jour,
      retour: retour,
    });
  }

  // Formulaire caché envoyé au serveur (réalisation ou report d'un suivi), avec le jeton antiforgery de la page.
  function posterSuivi(url, champs) {
    var form = document.createElement("form");
    form.method = "post";
    form.action = url;
    champs.__RequestVerificationToken = charge.jeton;
    Object.keys(champs).forEach(function (nom) {
      var input = document.createElement("input");
      input.type = "hidden";
      input.name = nom;
      input.value = champs[nom];
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  }

  // Message du serveur après un Post/Redirect/Get (confirmation ou refus), affiché une seule fois par page,
  // quel que soit le script qui l'appelle (tiroir, fiche, Centre d'actions, « Mes suivis »).
  var messageServeurAffiche = false;
  function afficherMessageServeur() {
    if (messageServeurAffiche) return;
    messageServeurAffiche = true;
    var retour = charge.enregistrement || {};
    if (retour.confirmation) notifier(retour.confirmation);
    if (retour.erreur) notifier(retour.erreur);
  }

  // Opportunité fictive : changement local à l'onglet. Retourne une fonction d'annulation.
  // Dossier réel (fonctionnalité 16) : changer l'étape, ajouter une note, planifier un suivi ou un véhicule envisagé
  // en local n'aurait aucun effet en base et disparaîtrait au rechargement. Ces fonctions locales le refusent ; les
  // opérations réelles passent par les formulaires de la fiche (envoyerEtape, notes, suivis).
  function contactEnregistre(contactId) {
    return String(contactId || "").indexOf("pe-") === 0;
  }
  function changerEtape(oppId, etape) {
    var o = opportunite(oppId);
    if (!o || o.etape === etape || estEnregistree(oppId)) return null;
    var avant = { etape: o.etape, derniereActivite: o.derniereActivite };
    var i = journaliser(o.prospectId, o.id, "etape", "Étape : " + libelleEtape(o.etape) + " → " + libelleEtape(etape) + " (modification locale)", SYSTEME);
    o.etape = etape;
    o.derniereActivite = i.date;
    changer();
    return function () {
      o.etape = avant.etape;
      o.derniereActivite = avant.derniereActivite;
      etat.interactions = etat.interactions.filter(function (x) { return x.id !== i.id; });
      changer();
    };
  }

  function ajouterOpportunite(contactId, d) {
    var o = {
      id: nouvelId("o"),
      prospectId: contactId,
      titre: d.titre,
      etape: d.etape,
      dateCreation: iso(maintenant()),
      derniereActivite: iso(maintenant()),
      prochaineAction: null,
      dateProchaineAction: null,
      vehiculesEnvisages: d.vehicules || [],
      qualification: { categorie: d.categorie || null, marques: [], modeles: [], caracteristiques: [], elementsDecision: [] },
    };
    etat.opportunites.push(o);
    journaliser(contactId, o.id, "opportunite", "Nouvelle opportunité : " + d.titre);
    changer();
    return o;
  }

  // Démonstration seulement : une opportunité enregistrée se qualifie sur le serveur (envoyerQualification).
  function enregistrerQualification(oppId, q, preferencesContact) {
    var o = opportunite(oppId);
    if (!o || estEnregistree(oppId)) return false;
    o.qualification = q;
    o.derniereActivite = iso(maintenant());
    var c = contact(o.prospectId);
    if (c && preferencesContact) {
      c.contactPrefere = preferencesContact.contactPrefere || c.contactPrefere;
      c.momentContact = preferencesContact.momentContact || null;
    }
    var comp = completude(q);
    journaliser(o.prospectId, o.id, "qualification", "Qualification mise à jour (" + comp.remplis + "/" + comp.total + " informations).");
    changer();
  }

  // Ajoute un véhicule aux options envisagées d'une opportunité (ex. depuis les recommandations de véhicules).
  function ajouterVehiculeEnvisage(oppId, libelle) {
    var o = opportunite(oppId);
    if (!o || estEnregistree(oppId) || !libelle || (o.vehiculesEnvisages || []).indexOf(libelle) >= 0) return false;
    o.vehiculesEnvisages = (o.vehiculesEnvisages || []).concat([libelle]);
    o.derniereActivite = iso(maintenant());
    // Entrée « qualification » : un changement interne, pas un échange avec le client (ne résout pas une première réponse).
    journaliser(o.prospectId, o.id, "qualification", "Véhicule ajouté aux options envisagées : " + libelle + ".");
    changer();
    return true;
  }

  function planifierSuivi(oppId, action, date) {
    var o = opportunite(oppId);
    if (!o || estEnregistree(oppId)) return false;
    o.prochaineAction = action;
    o.dateProchaineAction = iso(date);
    journaliser(o.prospectId, o.id, "suivi", "Suivi planifié pour le " + dateCourte(date) + " : " + action);
    changer();
    return true;
  }

  function ajouterNote(contactId, d) {
    if (contactEnregistre(contactId) || estEnregistree(d.opportuniteId || "")) return null;
    var i = journaliser(contactId, d.opportuniteId, d.type, d.resume, null, d.prochaineAction);
    var o = d.opportuniteId ? opportunite(d.opportuniteId) : null;
    if (o) {
      o.derniereActivite = i.date;
      if (d.prochaineAction) {
        o.prochaineAction = d.prochaineAction;
        o.dateProchaineAction = d.date ? iso(d.date) : null;
      }
    }
    changer();
    return i;
  }

  // Sert à annuler une action d'un autre module qui avait ajouté une entrée d'historique.
  function retirerDerniereInteraction(contactId) {
    var derniere = interactionsDe(contactId)[0];
    if (!derniere) return;
    etat.interactions = etat.interactions.filter(function (x) { return x.id !== derniere.id; });
    changer();
  }

  function reinitialiser() {
    try {
      window.sessionStorage.removeItem(CLE);
    } catch (e) {}
    etat = cloner(donneesInitiales);
    modifie = false;
    modules.forEach(function (m) { m.reinitialiser(); });
    abonnes.forEach(function (f) { f(); });
  }
  function rafraichir() {
    abonnes.forEach(function (f) { f(); });
  }

  // ---------- Bandeau de démonstration (commun aux pages) ----------
  function brancherBandeau() {
    var marque = document.querySelector("[data-etat-demo]");
    var bouton = document.querySelector("[data-reinitialiser]");
    function maj() {
      var change = modifie || modules.some(function (m) { return m.estModifie(); });
      if (marque) marque.hidden = !change;
      if (bouton) bouton.hidden = !change;
    }
    if (bouton) {
      bouton.addEventListener("click", function () {
        if (!window.confirm("Réinitialiser les données de démonstration ? Vos ajouts et modifications locales seront perdus.")) return;
        reinitialiser();
        notifier("Données de démonstration réinitialisées.");
      });
    }
    abonnes.push(maj);
    maj();
  }
  function notifier(texte, annuler) {
    if (window.SalesOS) window.SalesOS.notifier(texte, annuler);
  }

  window.Prospects = {
    ref: ref,
    etapes: ref.etapes,
    actives: ACTIVES,
    moiId: moiId,
    // oppId (facultatif) : opportunité enregistrée à présenter sélectionnée sur la fiche (fonctionnalité 18).
    urlFiche: function (id, oppId) {
      var url = charge.urlFiche.replace("__id__", encodeURIComponent(id));
      return oppId && String(oppId).indexOf("oe-") === 0 && String(id).indexOf("pe-") === 0 ? url + "?opportunite=" + encodeURIComponent(oppId) : url;
    },
    envoyerOpportunite: envoyerOpportunite,
    envoyerQualification: envoyerQualification,
    projet: projet,
    urlListe: charge.urlListe,
    // Résultat de la dernière création envoyée au serveur : { confirmation, saisie, erreurs } (voir _DonneesProspects).
    enregistrement: charge.enregistrement || {},
    abonner: function (f) { abonnes.push(f); },
    enregistrerModule: function (m) { modules.push(m); rafraichir(); },
    rafraichir: rafraichir,
    notifier: notifier,
    // lecture
    contacts: contacts,
    contact: contact,
    opportunite: opportunite,
    opportunitesDe: opportunitesDe,
    interactionsDe: interactionsDe,
    toutesOpportunites: function () { return etat.opportunites; },
    conseiller: conseiller,
    conseillers: function () { return etat.conseillers; },
    estActive: estActive,
    suivi: suivi,
    suiviRequisContact: suiviRequisContact,
    principale: principale,
    derniereInteraction: derniereInteraction,
    prochaineAction: prochaineAction,
    completude: completude,
    resumeVehicule: resumeVehicule,
    resumeBudget: resumeBudget,
    // écriture
    ajouterProspect: ajouterProspect,
    modifierContact: modifierContact,
    changerEtape: changerEtape,
    estEnregistree: estEnregistree,
    envoyerEtape: envoyerEtape,
    envoyerRealisation: envoyerRealisation,
    envoyerReport: envoyerReport,
    // Envoi d'un formulaire POST avec le jeton antiforgery (ex. mise en veille, intelligence-store.js).
    posterFormulaire: posterSuivi,
    afficherMessageServeur: afficherMessageServeur,
    ajouterOpportunite: ajouterOpportunite,
    enregistrerQualification: enregistrerQualification,
    planifierSuivi: planifierSuivi,
    ajouterVehiculeEnvisage: ajouterVehiculeEnvisage,
    ajouterNote: ajouterNote,
    retirerDerniereInteraction: retirerDerniereInteraction,
    // outils
    esc: esc,
    argent: argent,
    relatif: relatif,
    echeance: echeance,
    ecartJours: ecartJours,
    dateCourte: dateCourte,
    terminerPhrase: terminerPhrase,
    // Types de note qui déclarent un contact (ReferentielsVente.TypesContactDeclare).
    typesContact: function () { return (ref.typesContact || []).slice(); },
    dateComplete: dateComplete,
    initiales: initiales,
    libelle: libelle,
    libelleEtape: libelleEtape,
    listeTexte: listeTexte,
    depuisChampDate: depuisChampDate,
    versChampDate: versChampDate,
    aujourdhuiChamp: aujourdhuiChamp,
  };

  brancherBandeau();
})();
