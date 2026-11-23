// Vehicle Matching Engine (prototype frontend) : fonctions pures, sans DOM ni stockage, utilisables dans Node.
// Compare des critères (qualification d'une opportunité ou demande de recherche) aux véhicules de l'inventaire partagé.
//
// Chaque critère est « satisfait », « non satisfait », « inconnu » (information absente : jamais comptée comme
// satisfaite) ou « non applicable » (non demandé). Le score n'utilise que les critères connus ; la couverture indique
// la part des critères applicables réellement évalués. Les pondérations sont illustratives (référentiel C#).
// Compatibilité d'un véhicule ≠ probabilité d'achat.
(function (racine) {
  "use strict";

  var CARROSSERIES = { vus: ["VUS"], camionnette: ["Camionnette"], berline: ["Berline"], fourgonnette: ["Fourgonnette"], coupe: ["Coupé", "Cabriolet"], compacte: ["Hatchback", "Compacte"] };
  // Caractéristiques connues par le carburant (certaines) ; les autres sont lues dans la fiche du véhicule.
  var PAR_CARBURANT = { hybride: "Hybride", electrique: "Électrique" };
  var LIBELLES_FICHE = {
    ti: ["Traction intégrale", "4x4"],
    "sieges-chauffants": ["Sièges chauffants"],
    carplay: ["Apple CarPlay / Android Auto"],
    aides: ["Aides à la conduite"],
    coffre: ["Grand espace de chargement"],
    remorquage: ["Attelage de remorque"],
    demarreur: ["Démarreur à distance"],
  };
  var INDISPONIBLES = ["Vendu", "Livre"];
  var EN_PREPARATION = ["Recu", "EnInspection", "InspectionTerminee", "NettoyageEnCours"];

  function argent(n) {
    return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
  }
  function norm(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  }

  // ---------- Construction des critères ----------
  function depuisOpportunite(o, indispensables) {
    var q = (o && o.qualification) || {};
    return {
      source: "opportunite",
      categorie: q.categorie || null,
      budgetMax: q.budgetTotal != null ? Number(q.budgetTotal) : null,
      budgetMensuel: q.budgetMensuel != null ? Number(q.budgetMensuel) : null,
      marques: q.marques || [],
      modeles: q.modeles || [],
      caracteristiques: q.caracteristiques || [],
      places: q.places || null,
      etat: q.etat || null,
      // La qualification ne comporte ni année ni kilométrage : ces critères ne peuvent pas être évalués.
      anneeMin: undefined,
      kilometrageMax: undefined,
      horizon: q.horizon || null,
      indispensables: indispensables || [],
    };
  }
  function depuisDemande(d) {
    return {
      source: "demande",
      categorie: d.categorie || null,
      budgetMax: d.budgetMax != null ? Number(d.budgetMax) : null,
      budgetMensuel: null,
      marques: d.marques || [],
      modeles: [],
      caracteristiques: d.caracteristiques || [],
      places: d.places || null,
      etat: d.etat || null,
      anneeMin: d.anneeMin != null ? Number(d.anneeMin) : null,
      kilometrageMax: d.kilometrageMax != null ? Number(d.kilometrageMax) : null,
      horizon: d.horizon || null,
      indispensables: d.indispensables || [],
    };
  }

  // ---------- Évaluation ----------
  function evaluer(c, v, ref) {
    var items = [];
    var libCar = (ref && ref.caracteristiques) || {};
    function item(groupe, cle, libelle, statut, detail) {
      items.push({ groupe: groupe, cle: cle, libelle: libelle, statut: statut, detail: detail, indispensable: c.indispensables.indexOf(groupe) >= 0 || c.indispensables.indexOf(cle) >= 0 });
    }

    // Budget
    if (c.budgetMax != null) {
      var ecart = v.prixDemande - c.budgetMax;
      item("budget", "budget", "Budget maximal", ecart <= 0 ? "satisfait" : "non-satisfait",
        ecart <= 0 ? "Prix " + argent(v.prixDemande) + " ≤ budget " + argent(c.budgetMax) + "." : "Prix " + argent(v.prixDemande) + " : dépasse le budget de " + argent(ecart) + ".");
    } else if (c.budgetMensuel != null) {
      item("budget", "budget", "Budget maximal", "inconnu", "Seul un budget mensuel (" + argent(c.budgetMensuel) + ") est connu : comparaison impossible sans simulation.");
    } else item("budget", "budget", "Budget maximal", "inconnu", "Budget non renseigné.");

    // Catégorie
    if (c.categorie) {
      var attendues = CARROSSERIES[c.categorie] || [];
      if (!v.carrosserie) item("categorie", "categorie", "Catégorie", "inconnu", "Carrosserie non renseignée pour ce véhicule.");
      else if (attendues.indexOf(v.carrosserie) >= 0) item("categorie", "categorie", "Catégorie", "satisfait", "Catégorie " + v.carrosserie + " respectée.");
      else if (c.categorie === "compacte" && v.carrosserie === "Berline") item("categorie", "categorie", "Catégorie", "inconnu", "Berline : format compact à vérifier.");
      else item("categorie", "categorie", "Catégorie", "non-satisfait", "Catégorie " + v.carrosserie + " au lieu de « " + c.categorie + " ».");
    } else item("categorie", "categorie", "Catégorie", "inconnu", "Catégorie non renseignée.");

    // Caractéristiques importantes (et nombre de places)
    (c.caracteristiques || []).forEach(function (k) {
      var nom = libCar[k] || k;
      if (PAR_CARBURANT[k]) {
        item("caracteristiques", k, nom, v.carburant === PAR_CARBURANT[k] ? "satisfait" : "non-satisfait",
          v.carburant ? "Motorisation : " + v.carburant + "." : "Motorisation non renseignée.");
      } else if (LIBELLES_FICHE[k]) {
        var present = (v.caracteristiques || []).some(function (x) { return LIBELLES_FICHE[k].indexOf(x) >= 0; });
        item("caracteristiques", k, nom, present ? "satisfait" : "inconnu", present ? nom + " indiqué dans la fiche." : "Non indiqué dans la fiche du véhicule : à vérifier.");
      } else item("caracteristiques", k, nom, "inconnu", "Caractéristique non évaluable avec l'inventaire actuel.");
    });
    if (c.places) {
      var m = (v.caracteristiques || []).map(function (x) { return /^(\d+) places$/.exec(x); }).filter(Boolean)[0];
      if (m) item("caracteristiques", "places", "Nombre de places", Number(m[1]) >= c.places ? "satisfait" : "non-satisfait", m[1] + " places pour " + c.places + " demandées.");
      else item("caracteristiques", "places", "Nombre de places", "inconnu", "Nombre de places non indiqué dans la fiche (" + c.places + " demandées).");
    }
    if (!(c.caracteristiques || []).length && !c.places) item("caracteristiques", "caracteristiques", "Caractéristiques importantes", "non-applicable", "Aucune caractéristique demandée.");

    // Neuf ou occasion, année, kilométrage
    if (c.etat && c.etat !== "indifferent") {
      var neuf = c.etat === "neuf";
      item("etat", "etat", "Neuf ou occasion", !!v.neuf === neuf ? "satisfait" : "non-satisfait", v.neuf ? "Véhicule neuf." : "Véhicule d'occasion.");
    } else item("etat", "etat", "Neuf ou occasion", c.etat === "indifferent" ? "non-applicable" : "inconnu", c.etat === "indifferent" ? "Indifférent pour le client." : "Préférence non renseignée.");
    if (c.anneeMin === undefined) item("etat", "annee", "Année et kilométrage", "non-applicable", "Non demandés dans la qualification : non évaluables.");
    else {
      if (c.anneeMin != null) item("etat", "annee", "Année minimale", v.annee >= c.anneeMin ? "satisfait" : "non-satisfait", v.annee + " pour " + c.anneeMin + " minimum.");
      if (c.kilometrageMax != null) item("etat", "kilometrage", "Kilométrage maximal", v.kilometrage <= c.kilometrageMax ? "satisfait" : "non-satisfait",
        v.kilometrage.toLocaleString("fr-CA") + " km pour " + c.kilometrageMax.toLocaleString("fr-CA") + " km maximum.");
    }

    // Marque et modèle (préférence)
    if ((c.marques || []).length || (c.modeles || []).length) {
      var okMarque = (c.marques || []).some(function (x) { return norm(x) === norm(v.marque); });
      var okModele = (c.modeles || []).some(function (x) { return norm(v.modele).indexOf(norm(x)) >= 0; });
      item("marque", "marque", "Marque ou modèle préféré", okMarque || okModele ? "satisfait" : "non-satisfait",
        okModele ? "Modèle préféré." : okMarque ? "Marque préférée." : v.marque + " ne fait pas partie des préférences (" + c.marques.concat(c.modeles).join(", ") + ").");
    } else item("marque", "marque", "Marque ou modèle préféré", "non-applicable", "Aucune préférence de marque.");

    return items;
  }

  function disponibilite(statut, retenuPar) {
    if (retenuPar) return { cle: "indisponible", texte: "Retenu par la transaction " + retenuPar + " d'un autre client." };
    if (INDISPONIBLES.indexOf(statut) >= 0) return { cle: "indisponible", texte: "Vendu ou livré : indisponible." };
    if (statut === "Reserve") return { cle: "reserve", texte: "Réservé : vérifier qu'il n'est pas retenu pour un autre client." };
    if (EN_PREPARATION.indexOf(statut) >= 0) return { cle: "preparation", texte: "En préparation : disponibilité à confirmer avec l'atelier." };
    return { cle: "disponible", texte: "Prêt pour la vente." };
  }

  function comparer(c, v, ref, options) {
    options = options || {};
    var poids = {};
    ((ref && ref.criteres) || []).forEach(function (x) { poids[x.cle] = x.poids; });
    var items = evaluer(c, v, ref);
    // Le poids d'un groupe est partagé entre ses critères applicables.
    var parGroupe = {};
    items.forEach(function (i) { if (i.statut !== "non-applicable") parGroupe[i.groupe] = (parGroupe[i.groupe] || 0) + 1; });
    var applicable = 0, connu = 0, satisfait = 0;
    items.forEach(function (i) {
      if (i.statut === "non-applicable") { i.poids = 0; return; }
      i.poids = (poids[i.groupe] || 0) / parGroupe[i.groupe];
      applicable += i.poids;
      if (i.statut !== "inconnu") connu += i.poids;
      if (i.statut === "satisfait") satisfait += i.poids;
    });
    var nbConnus = items.filter(function (i) { return i.statut === "satisfait" || i.statut === "non-satisfait"; }).length;
    var couverture = applicable ? Math.round((connu * 100) / applicable) : 0;
    var seuilCouverture = (ref && ref.config && ref.config.couvertureMinimale) || 50;
    var seuil = (ref && ref.config && ref.config.seuilCompatibilite) || 70;
    var suffisant = couverture >= seuilCouverture && nbConnus >= 2;
    var score = suffisant && connu ? Math.round((satisfait * 100) / connu) : null;

    var indispNonSatisfait = items.filter(function (i) { return i.indispensable && i.statut === "non-satisfait"; });
    var indispInconnu = items.filter(function (i) { return i.indispensable && i.statut === "inconnu"; });
    // Un écart sur un critère principal (budget, catégorie, caractéristique importante) empêche « compatible » ;
    // seules les préférences flexibles (marque, état) peuvent ne pas être satisfaites.
    var ecartsMajeurs = items.filter(function (i) { return i.statut === "non-satisfait" && ["budget", "categorie", "caracteristiques"].indexOf(i.groupe) >= 0; });
    var niveau = indispNonSatisfait.length ? "incompatible" : !suffisant || indispInconnu.length ? "a-verifier" : score >= seuil && !ecartsMajeurs.length ? "compatible" : "partiel";
    var dispo = disponibilite(options.statut || v.statutActuel, options.retenuPar);
    return {
      vehiculeId: v.id,
      score: score,
      couverture: couverture,
      niveau: niveau,
      disponibilite: dispo,
      items: items,
      satisfaits: items.filter(function (i) { return i.statut === "satisfait"; }),
      ecarts: items.filter(function (i) { return i.statut === "non-satisfait"; }),
      inconnus: items.filter(function (i) { return i.statut === "inconnu"; }),
      indispensablesNonSatisfaits: indispNonSatisfait,
    };
  }

  var ORDRE_NIVEAU = { compatible: 0, partiel: 1, "a-verifier": 2, incompatible: 3 };
  // Classe les véhicules : compatibilité d'abord, puis score et couverture. Les véhicules indisponibles sont exclus
  // (ou placés en fin de liste si options.inclureIndisponibles).
  function classer(c, vehicules, ref, options) {
    options = options || {};
    var statut = options.statut || function (v) { return v.statutActuel; };
    var retenu = options.retenuPar || function () { return null; };
    return vehicules.map(function (v) { return comparer(c, v, ref, { statut: statut(v), retenuPar: retenu(v) }); })
      .filter(function (r) { return options.inclureIndisponibles || r.disponibilite.cle !== "indisponible"; })
      .sort(function (a, b) {
        var ia = a.disponibilite.cle === "indisponible" ? 1 : 0, ib = b.disponibilite.cle === "indisponible" ? 1 : 0;
        return ia - ib || ORDRE_NIVEAU[a.niveau] - ORDRE_NIVEAU[b.niveau] || (b.score || 0) - (a.score || 0) || b.couverture - a.couverture;
      });
  }

  var api = { depuisOpportunite: depuisOpportunite, depuisDemande: depuisDemande, comparer: comparer, classer: classer, disponibilite: disponibilite };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else racine.IntelligenceMatching = api;
})(this);
