// Module Prospects : état local de démonstration.
// Le serveur fournit les données fictives (balise #prospects-donnees) ; toutes les modifications restent
// dans le sessionStorage de l'onglet. Aucun appel réseau. Lorsque le backend existera, seule cette couche
// devra être remplacée par de vrais appels de service.
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
  var etat = lire() || cloner(donneesInitiales);
  var modifie = !!lire();
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

  // Retourne une fonction d'annulation.
  function changerEtape(oppId, etape) {
    var o = opportunite(oppId);
    if (!o || o.etape === etape) return null;
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

  function enregistrerQualification(oppId, q, preferencesContact) {
    var o = opportunite(oppId);
    if (!o) return;
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
    if (!o || !libelle || (o.vehiculesEnvisages || []).indexOf(libelle) >= 0) return false;
    o.vehiculesEnvisages = (o.vehiculesEnvisages || []).concat([libelle]);
    o.derniereActivite = iso(maintenant());
    // Entrée « qualification » : un changement interne, pas un échange avec le client (ne résout pas une première réponse).
    journaliser(o.prospectId, o.id, "qualification", "Véhicule ajouté aux options envisagées : " + libelle + ".");
    changer();
    return true;
  }

  function planifierSuivi(oppId, action, date) {
    var o = opportunite(oppId);
    if (!o) return;
    o.prochaineAction = action;
    o.dateProchaineAction = iso(date);
    journaliser(o.prospectId, o.id, "suivi", "Suivi planifié pour le " + dateCourte(date) + " : " + action);
    changer();
  }

  function ajouterNote(contactId, d) {
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
    urlFiche: function (id) { return charge.urlFiche.replace("__id__", encodeURIComponent(id)); },
    urlListe: charge.urlListe,
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
