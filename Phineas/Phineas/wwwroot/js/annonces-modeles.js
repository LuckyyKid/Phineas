// Studio d'annonces : modèles déterministes et contrôles (prototype frontend, phase 08).
// Fonctions pures, utilisables dans Node. Aucune IA n'est appelée : les textes sont composés uniquement à partir des
// champs de la fiche d'inventaire. Ce module est le point de remplacement du futur service d'annonces IA de Phineas
// (même entrée : véhicule, objectif, style, variante ; même sortie : titre, description, points forts, sources, à vérifier).
(function (racine) {
  "use strict";

  var INDISPONIBLES = ["Vendu", "Livre"];
  var EN_PREPARATION = ["Recu", "EnInspection", "InspectionTerminee", "NettoyageEnCours"];

  function argent(n) {
    return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
  }
  function km(n) {
    return new Intl.NumberFormat("fr-CA").format(n) + " km";
  }
  function nom(v) {
    return [v.marque, v.modele, v.version, v.annee].filter(Boolean).join(" ");
  }
  function liste(l) {
    if (!l.length) return "";
    if (l.length === 1) return l[0];
    return l.slice(0, -1).join(", ") + " et " + l[l.length - 1];
  }
  function minuscule(s) {
    return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  }

  // Disponibilité : une annonce ne se prépare pas pour un véhicule vendu ou livré.
  function disponibilite(v) {
    if (!v) return { cle: "inconnu", ok: false, texte: "Véhicule introuvable dans l'inventaire." };
    if (INDISPONIBLES.indexOf(v.statutActuel) >= 0) return { cle: "indisponible", ok: false, texte: "Véhicule vendu ou livré : aucune annonce ne peut être préparée ni approuvée." };
    if (EN_PREPARATION.indexOf(v.statutActuel) >= 0) return { cle: "preparation", ok: true, texte: "Véhicule en préparation : vérifier la date de disponibilité avant de publier." };
    if (v.statutActuel === "Reserve") return { cle: "reserve", ok: true, texte: "Véhicule réservé : vérifier qu'il n'est pas retenu pour un client avant de publier." };
    return { cle: "disponible", ok: true, texte: "Prêt pour la vente." };
  }

  // Champs de la fiche réellement disponibles (provenance « Inventaire ») et informations manquantes.
  function champsInventaire(v) {
    var champs = [
      { cle: "marque", libelle: "Marque", valeur: v.marque },
      { cle: "modele", libelle: "Modèle", valeur: v.modele },
      { cle: "annee", libelle: "Année", valeur: v.annee },
      { cle: "version", libelle: "Version", valeur: v.version },
      { cle: "kilometrage", libelle: "Kilométrage", valeur: v.kilometrage != null ? km(v.kilometrage) : null },
      { cle: "carburant", libelle: "Motorisation", valeur: v.carburant },
      { cle: "transmission", libelle: "Transmission", valeur: v.transmission },
      { cle: "carrosserie", libelle: "Carrosserie", valeur: v.carrosserie },
      { cle: "couleur", libelle: "Couleur", valeur: v.couleur },
      { cle: "etat", libelle: "État", valeur: v.neuf == null ? null : v.neuf ? "Neuf" : "Occasion" },
      { cle: "prix", libelle: "Prix affiché", valeur: v.prixDemande != null ? argent(v.prixDemande) : null },
      { cle: "stock", libelle: "Numéro de stock", valeur: v.numeroStock },
    ];
    return {
      connus: champs.filter(function (c) { return c.valeur != null && c.valeur !== ""; }),
      manquants: champs.filter(function (c) { return c.valeur == null || c.valeur === ""; }).map(function (c) { return c.libelle; })
        .concat(!(v.caracteristiques || []).length ? ["Équipements"] : []).concat(!(v.photos || []).length ? ["Photos (aucune dans l'inventaire de démonstration)"] : []),
      equipements: (v.caracteristiques || []).slice(),
    };
  }

  // ---------- Génération déterministe ----------
  var APPELS = {
    professionnel: "Communiquez avec votre conseiller pour planifier un essai.",
    informatif: "Écrivez-nous pour connaître sa disponibilité et obtenir sa fiche complète.",
    concis: "Contactez-nous.",
    dynamique: "Venez l'essayer : votre conseiller vous attend.",
    premium: "Prenez rendez-vous pour une présentation personnalisée.",
  };
  function usage(v) {
    var c = (v.caracteristiques || []).join(" ").toLowerCase();
    if (v.carrosserie === "Camionnette") return c.indexOf("attelage") >= 0 ? "le travail et le remorquage" : "le travail";
    if (v.carrosserie === "VUS") return c.indexOf("chargement") >= 0 || c.indexOf("7 places") >= 0 ? "les déplacements en famille" : "les déplacements quotidiens";
    return "les déplacements quotidiens";
  }
  function premiumApproprie(v) {
    return !!v.neuf || v.prixDemande >= 40000;
  }
  // Entrée : véhicule de l'inventaire ; options : objectif, style, variante ("fonctionnelle" par défaut).
  function generer(v, o) {
    o = o || {};
    var style = o.style || "professionnel", objectif = o.objectif || "presentation", variante = o.variante || "fonctionnelle";
    var avert = [];
    if (style === "premium" && !premiumApproprie(v)) { avert.push("Style « Premium » peu approprié pour ce véhicule : style professionnel appliqué."); style = "professionnel"; }
    var eq = (v.caracteristiques || []).slice(0, 4);
    var etat = v.neuf ? "neuf" : "d'occasion";
    var base = nom(v);
    var titre, description;
    if (variante === "synthetique" || style === "concis" || objectif === "reseau-social") {
      titre = base + (eq.length ? ", " + eq[0] : "");
      description = base + ", " + etat + (v.neuf ? "" : ", " + km(v.kilometrage)) + (eq.length ? ". " + liste(eq) : "") + ". Prix affiché : " + argent(v.prixDemande) + ".";
    } else if (variante === "usage") {
      titre = (v.carrosserie || "Véhicule") + " " + etat + " pour " + usage(v);
      description = "Vous cherchez un véhicule pour " + usage(v) + " ? Ce " + base + " " + etat + (v.neuf ? "" : " (" + km(v.kilometrage) + ")") + " est équipé de : " + (eq.length ? liste(eq.map(minuscule)) : "équipements à confirmer") + ".";
    } else {
      titre = base + (eq.length ? " : " + liste(eq.slice(0, 3)) : "");
      description = base + " " + etat + (v.couleur ? ", " + v.couleur.toLowerCase() : "") + (v.neuf ? "" : ", " + km(v.kilometrage)) + ". " +
        (v.carburant ? "Motorisation " + v.carburant.toLowerCase() + (v.transmission ? ", transmission " + v.transmission.toLowerCase() : "") + ". " : "") +
        (eq.length ? "Équipements indiqués dans la fiche : " + liste(eq.map(minuscule)) + "." : "Équipements à confirmer.");
    }
    if (objectif === "arrivee") titre = "Nouveau en inventaire : " + titre;
    if (objectif === "prospect") description = "Voici un véhicule qui pourrait correspondre à votre recherche. " + description;
    if (style === "informatif") description += " Numéro de stock : " + v.numeroStock + ".";
    if (style === "dynamique") titre = titre + ", à découvrir";
    if (style === "premium") description = description.replace(/^/, "Une présentation soignée pour un véhicule " + etat + ". ");
    return {
      titre: titre,
      description: description,
      pointsForts: eq.slice(),
      appelAction: APPELS[style] || APPELS.professionnel,
      prix: v.prixDemande,
      sources: ["Fiche d'inventaire " + v.numeroStock + " (démonstration)"],
      avertissements: avert,
    };
  }
  function variantes(v, o, ref) {
    return ref.variantesAnnonce.map(function (x) {
      var g = generer(v, { objectif: o.objectif, style: o.style, variante: x.cle });
      return { cle: x.cle, libelle: x.libelle, titre: g.titre, description: g.description };
    });
  }
  // Comparaison : informations communes et différences entre variantes (mots significatifs).
  function comparer(vars) {
    function mots(s) { return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter(function (m) { return m.length > 3; }); }
    var ensembles = vars.map(function (x) { return mots(x.titre + " " + x.description); });
    var communs = ensembles[0].filter(function (m, i, t) { return t.indexOf(m) === i && ensembles.every(function (e) { return e.indexOf(m) >= 0; }); });
    return {
      communs: communs,
      differences: vars.map(function (x, i) {
        return { cle: x.cle, propres: ensembles[i].filter(function (m, k, t) { return t.indexOf(m) === k && communs.indexOf(m) < 0; }), longueur: x.description.length };
      }),
    };
  }

  // ---------- Vérifications avant validation ----------
  function verifier(texte, ref) {
    var t = String(texte || "");
    return ref.mentionsAVerifier.map(function (m) {
      var r = new RegExp(m.motif, "i").exec(t);
      return r ? { extrait: r[0], raison: m.raison } : null;
    }).filter(Boolean);
  }
  // Prix et kilométrage cités dans le texte : doivent correspondre à l'inventaire.
  function coherence(texte, v) {
    var ecarts = [];
    var prix = String(texte || "").match(/(\d{1,3}(?:[\s  ]\d{3})+|\d{4,6})\s?\$/g) || [];
    prix.forEach(function (p) { var x = Number(p.replace(/[^\d]/g, "")); if (x && x !== Number(v.prixDemande)) ecarts.push("Prix cité (" + p.trim() + ") différent du prix affiché en inventaire (" + argent(v.prixDemande) + ")."); });
    var kms = String(texte || "").match(/(\d{1,3}(?:[\s  ]\d{3})+|\d{3,6})\s?km/gi) || [];
    kms.forEach(function (k) { var x = Number(k.replace(/[^\d]/g, "")); if (x && x !== Number(v.kilometrage)) ecarts.push("Kilométrage cité (" + k.trim() + ") différent de l'inventaire (" + km(v.kilometrage) + ")."); });
    return ecarts;
  }
  // Une annonce ne peut être approuvée que par une personne, véhicule disponible, sans mention bloquante non relue.
  function refusApprobation(a, v, relu, ref) {
    var d = disponibilite(v);
    if (!d.ok) return d.texte;
    if (!relu) return "Confirmez avoir relu et vérifié les informations : la validation humaine est obligatoire.";
    if (!String(a.titre || "").trim() || !String(a.description || "").trim()) return "Le titre et la description sont obligatoires.";
    var c = coherence(a.titre + " " + a.description, v);
    if (c.length) return c[0];
    return null;
  }

  // ---------- Liens de provenance (fictifs) ----------
  function slug(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  // Aucun renseignement personnel dans les paramètres (courriel, téléphone, nom).
  function contientDonneePersonnelle(s) {
    return /@/.test(s) || /\d{3}[\s.-]?\d{3}[\s.-]?\d{4}/.test(s);
  }
  function construireLien(x, ref) {
    var erreurs = {};
    var pf = ref.plateformes.filter(function (p) { return p.cle === x.source; })[0];
    if (!pf) erreurs.source = "Choisissez une source.";
    if (!x.support || !ref.supports[x.support]) erreurs.support = "Choisissez un support.";
    if (!x.vehicule) erreurs.vehicule = "Choisissez un véhicule ou une annonce.";
    var campagne = slug(x.campagne);
    if (x.campagne && contientDonneePersonnelle(x.campagne)) erreurs.campagne = "Aucun renseignement personnel dans une campagne.";
    if (Object.keys(erreurs).length) return { erreurs: erreurs };
    var p = [["utm_source", pf.utmSource], ["utm_medium", x.support]];
    if (campagne) p.push(["utm_campaign", campagne]);
    if (x.annonceRef) p.push(["utm_content", slug(x.annonceRef)]);
    p.push(["ph_ref", x.reference]);
    var url = "https://exemple.test/vehicules/" + slug(x.vehicule.marque + " " + x.vehicule.modele) + "-" + slug(x.vehicule.numeroStock) + "?" + p.map(function (k) { return k[0] + "=" + encodeURIComponent(k[1]); }).join("&");
    return { url: url, parametres: p, campagne: campagne || null };
  }

  var api = {
    disponibilite: disponibilite,
    champsInventaire: champsInventaire,
    generer: generer,
    variantes: variantes,
    comparer: comparer,
    verifier: verifier,
    coherence: coherence,
    refusApprobation: refusApprobation,
    construireLien: construireLien,
    contientDonneePersonnelle: contientDonneePersonnelle,
    slug: slug,
    nom: nom,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else racine.AnnoncesModeles = api;
})(this);
