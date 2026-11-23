// Page « Studio d'annonces » (Views/Outils/Annonces.cshtml, maquettes 28 à 31).
// 1. La liste des annonces : recherche, filtres statut et canal, pagination à 6 (outils-pagination.js).
// 2. La fenêtre « Nouvelle annonce » : 4 étapes (véhicule, objectif, style, édition et validation) avec un aperçu à droite.
//    Les textes viennent de AnnoncesModeles.generer (déterministe, à partir de la fiche d'inventaire) ; rien n'est
//    enregistré avant « Enregistrer le brouillon » ou « Envoyer en révision ».
// 3. La même fenêtre ouvre une annonce existante pour la modifier, comparer des variantes et changer son statut.
// Données : window.OutilsVendeur (outils-store.js). Aucune publication n'est faite par Phineas.
(function () {
  "use strict";

  var P = window.Prospects, S = window.Soumissions, OV = window.OutilsVendeur, A = window.AnnoncesModeles;
  var racine = document.getElementById("annonces");
  var fenetre = document.getElementById("fenetre-annonce");
  if (!P || !S || !OV || !A || !racine || !fenetre) return;
  var esc = P.esc, ref = OV.ref;
  var Pagination = window.OutilsPagination;

  // ---------- Réglages ----------
  var ETAPES = ["Véhicule", "Objectif", "Style", "Édition et validation"];
  // Phrase d'aide sous le titre de la fenêtre, une par étape.
  var AIDES = {
    1: "Choisissez le véhicule de l'inventaire à annoncer.",
    2: "À quoi doit servir cette annonce ?",
    3: "Où sera-t-elle publiée, et sur quel ton ?",
    4: "Relisez, corrigez au besoin, puis envoyez en révision.",
    edition: "Modifiez le texte, comparez des variantes et faites avancer l'annonce.",
  };
  // Précision affichée sous chaque objectif (les objectifs viennent du référentiel des outils).
  var PRECISIONS_OBJECTIF = {
    "presentation": "Les faits principaux de la fiche",
    "equipements": "Mettre en avant l'équipement indiqué",
    "en-ligne": "Un texte complet pour un site d'annonces",
    "reseau-social": "Un texte court pour un réseau social",
    "prospect": "Une présentation courte pour un client",
    "arrivee": "Faire savoir qu'il vient d'entrer en inventaire",
  };
  // Précision affichée sous chaque ton (les styles viennent du référentiel des outils).
  var PRECISIONS_STYLE = {
    "professionnel": "Les faits, sur un ton neutre",
    "informatif": "Les faits et le numéro de stock",
    "concis": "Phrases très courtes",
    "dynamique": "Une touche d'enthousiasme",
    "premium": "Une présentation soignée, pour le haut de gamme",
  };
  // Champs de la fiche montrés sous l'aperçu (« Champs utilisés »), dans cet ordre.
  var CHAMPS_APERCU = [
    { cle: "annee", libelle: "Année" },
    { cle: "modele", libelle: "Modèle" },
    { cle: "etat", libelle: "État" },
    { cle: "couleur", libelle: "Couleur" },
    { cle: "kilometrage", libelle: "Kilométrage" },
    { cle: "prix", libelle: "Prix" },
  ];
  // Libellés des boutons de changement de statut d'une annonce existante.
  var LIBELLES_TRANSITION = {
    EnRevision: "Envoyer en révision",
    Approuvee: "Approuver (validation humaine)",
    PretePublication: "Marquer prête à publier",
    Archivee: "Archiver",
  };
  var FORMAT_ARGENT = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

  // Page affichée de chaque liste (liste des annonces, historique d'une annonce), par id de liste. Absente = page 1.
  var pages = {};

  // État de la fenêtre. mode : "nouvelle" (4 étapes) ou "edition" (annonce existante).
  var ed = nouvelEtat();
  function nouvelEtat() {
    return { mode: "nouvelle", etape: 1, vehiculeId: null, objectif: null, style: null, canal: null,
      annonceId: null, composeePour: null, avertissements: [] };
  }
  // Bouton qui a ouvert la fenêtre : il reprend le focus à la fermeture.
  var ouvreur = null;

  // ---------- Petits outils ----------
  function champ(id) { return document.getElementById(id); }
  function zone(nom) { return fenetre.querySelector('[data-zone="' + nom + '"]'); }
  function plateforme(cle) { return (ref.plateformesParCle[cle] || {}).libelle || cle; }
  function vehicule(id) { return id ? OV.vehiculeDe({ vehiculeId: id }) : null; }
  function majuscule(texte) { return texte ? texte.charAt(0).toUpperCase() + texte.slice(1) : texte; }
  function argent(n) { return n == null ? "" : FORMAT_ARGENT.format(n); }
  function erreur(texte) {
    var e = zone("erreur");
    e.hidden = !texte;
    e.textContent = texte || "";
  }

  // Statut d'une annonce : un point suivi du libellé, sans fond (ambre seulement pour « En révision »).
  function htmlStatut(statut) {
    return '<span class="anv-statut anv-statut-' + esc(statut) + '"><span class="anv-statut-point" aria-hidden="true"></span>' +
      esc(ref.statutsAnnonce[statut] || statut) + "</span>";
  }
  // « Validée par vous » quand c'est le conseiller connecté, sinon son nom.
  function texteValidation(a) {
    if (!a.valideePar) return "";
    var moi = P.conseiller(P.moiId).nom;
    return a.valideePar === moi ? "Validée par vous" : "Validée par " + a.valideePar;
  }

  // ---------- Liste des annonces ----------
  function filtresActifs() {
    return !!(champ("f-recherche").value || champ("f-statut").value || champ("f-canal").value);
  }
  function filtrer(annonces) {
    var recherche = String(champ("f-recherche").value || "").toLowerCase();
    var statut = champ("f-statut").value;
    var canal = champ("f-canal").value;
    return annonces.filter(function (a) {
      var v = S.vehicule(a.vehiculeId);
      var texte = (a.reference + " " + a.titre + " " + (v ? S.nomVehicule(v) : "")).toLowerCase();
      if (recherche && texte.indexOf(recherche) < 0) return false;
      if (statut && a.statut !== statut) return false;
      if (canal && a.canal !== canal) return false;
      return true;
    });
  }
  function ligneAnnonce(a) {
    var v = OV.vehiculeDe(a);
    var dispo = A.disponibilite(v);
    var liens = OV.liens().filter(function (k) { return k.annonceId === a.id; });
    var provenance = liens.length
      ? liens.map(function (k) { return '<code class="anv-etiquette">' + esc(k.reference) + "</code>"; }).join(" ")
      : '<span class="anv-attenue">Aucun lien</span>';
    var alerte = dispo.cle === "indisponible" || dispo.cle === "inconnu"
      ? '<span class="anv-alerte"><i class="bi bi-exclamation-triangle" aria-hidden="true"></i>' + esc(dispo.texte) + "</span>" : "";
    var validation = texteValidation(a);
    return '<tr data-ligne="' + esc(a.id) + '">' +
      '<td><button type="button" class="anv-ref" data-an="ouvrir" data-id="' + esc(a.id) + '" aria-label="Ouvrir l\'annonce ' + esc(a.reference) + '">' + esc(a.reference) + "</button></td>" +
      '<td class="anv-col-titre"><strong class="anv-fort">' + esc(a.titre) + '</strong><span class="anv-extrait">' + esc(a.description) + "</span>" + alerte + "</td>" +
      "<td>" + esc(plateforme(a.canal)) + "</td>" +
      "<td>" + esc(majuscule(P.relatif(a.dateModification))) + '<span class="anv-sous">Créée le ' + esc(P.dateCourte(a.dateCreation)) + "</span></td>" +
      "<td>" + htmlStatut(a.statut) + (validation ? '<span class="anv-sous">' + esc(validation) + "</span>" : "") + "</td>" +
      "<td>" + provenance + "</td></tr>";
  }
  function rendreListe() {
    var annonces = filtrer(OV.annonces()).slice().sort(function (a, b) { return new Date(b.dateModification) - new Date(a.dateModification); });
    var morceau = Pagination.decouper(pages, "liste-corps", annonces);
    Pagination.afficherBarre(racine, "liste-corps", morceau.pagination);
    champ("liste-corps").innerHTML = morceau.elements.map(ligneAnnonce).join("");
    champ("table-annonces").hidden = annonces.length === 0;
    champ("etat-vide").hidden = annonces.length > 0;
    var compte = annonces.length + (annonces.length > 1 ? " annonces" : " annonce");
    champ("nb-annonces").textContent = compte;
    champ("resultat").textContent = compte;
    racine.querySelector("[data-effacer-filtres]").hidden = !filtresActifs();
  }
  function relancerListe() {
    pages["liste-corps"] = 1;
    rendreListe();
  }

  // ---------- Fenêtre : ouverture, fermeture, focus ----------
  function elementsFocusables() {
    var selecteur = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.prototype.filter.call(fenetre.querySelectorAll(selecteur), function (el) {
      return el.offsetParent !== null;
    });
  }
  function ouvrirFenetre() {
    ouvreur = document.activeElement;
    fenetre.hidden = false;
    document.body.classList.add("anv-sans-defilement");
    var premier = elementsFocusables()[0];
    if (premier) premier.focus();
  }
  function fermerFenetre() {
    fenetre.hidden = true;
    document.body.classList.remove("anv-sans-defilement");
    ed = nouvelEtat();
    sectionAffichee = null;
    if (ouvreur && ouvreur.focus) ouvreur.focus();
  }

  // ---------- Fenêtre : bandeau des étapes et boutons du pied ----------
  function rendreEtapes() {
    var liste = zone("etapes");
    liste.hidden = ed.mode !== "nouvelle";
    if (ed.mode !== "nouvelle") return;
    var html = "";
    for (var i = 0; i < ETAPES.length; i++) {
      var numero = i + 1;
      if (numero < ed.etape) {
        html += '<li class="is-faite"><span class="anv-etape-rond"><i class="bi bi-check2" aria-hidden="true"></i></span>' + esc(ETAPES[i]) + "</li>";
      } else if (numero === ed.etape) {
        html += '<li class="is-courante" aria-current="step"><span class="anv-etape-rond">' + numero + "</span>" + esc(ETAPES[i]) + "</li>";
      } else {
        html += '<li><span class="anv-etape-rond">' + numero + "</span>" + esc(ETAPES[i]) + "</li>";
      }
    }
    liste.innerHTML = html;
  }
  // L'étape est-elle complète ? Le bouton principal reste gris tant qu'elle ne l'est pas.
  function etapeComplete() {
    if (ed.etape === 1) return !!ed.vehiculeId;
    if (ed.etape === 2) return !!ed.objectif;
    if (ed.etape === 3) return !!ed.canal && !!ed.style;
    var titre = champ("ed-titre").value.trim();
    var texte = champ("ed-description").value.trim();
    return champ("ed-relu").checked && titre !== "" && texte !== "";
  }
  function rendrePied() {
    var retour = fenetre.querySelector('[data-an="retour"]');
    var brouillon = fenetre.querySelector('[data-an="brouillon"]');
    var avancer = fenetre.querySelector('[data-an="avancer"]');
    if (ed.mode === "edition") {
      var a = OV.annonce(ed.annonceId);
      var verrou = !a || a.statut === "Publiee" || a.statut === "Archivee";
      retour.textContent = "Fermer";
      brouillon.hidden = true;
      avancer.innerHTML = "Enregistrer";
      avancer.disabled = verrou;
      return;
    }
    retour.textContent = ed.etape === 1 ? "Annuler" : "Précédent";
    brouillon.hidden = ed.etape !== 4;
    brouillon.disabled = champ("ed-titre").value.trim() === "";
    avancer.innerHTML = (ed.etape === 4 ? "Envoyer en révision" : "Suivant") + '<i class="bi bi-arrow-right" aria-hidden="true"></i>';
    avancer.disabled = !etapeComplete();
  }

  // ---------- Fenêtre : tuiles des étapes 1 à 3 ----------
  function htmlTuile(attribut, valeur, titre, precision, choisie, desactivee) {
    return '<button type="button" role="radio" class="anv-tuile' + (choisie ? " is-choisie" : "") + '" ' + attribut + '="' + esc(valeur) + '"' +
      ' aria-checked="' + (choisie ? "true" : "false") + '"' + (desactivee ? " disabled" : "") + ">" +
      '<span class="anv-tuile-titre">' + esc(titre) + "</span>" + (precision ? '<span class="anv-tuile-precision">' + esc(precision) + "</span>" : "") + "</button>";
  }
  function rendreTuilesVehicules() {
    zone("tuiles-vehicules").innerHTML = S.inventaire().map(function (v) {
      var actuel = vehicule(v.id);
      var dispo = A.disponibilite(actuel);
      var precision = argent(v.prixDemande) + (v.neuf ? " · neuf" : " · " + Number(v.kilometrage || 0).toLocaleString("fr-CA") + " km");
      if (!dispo.ok) precision = "Vendu ou livré : non disponible";
      else if (dispo.cle !== "disponible") precision += " · " + (dispo.cle === "reserve" ? "réservé" : "en préparation");
      return htmlTuile("data-vehicule", v.id, S.nomVehicule(v), precision, v.id === ed.vehiculeId, !dispo.ok);
    }).join("");
  }
  function rendreTuilesObjectifs() {
    zone("tuiles-objectifs").innerHTML = Object.keys(ref.objectifsAnnonce).map(function (cle) {
      return htmlTuile("data-objectif", cle, ref.objectifsAnnonce[cle], PRECISIONS_OBJECTIF[cle], cle === ed.objectif, false);
    }).join("");
  }
  function rendreTuilesStyle() {
    zone("tuiles-canaux").innerHTML = ref.plateformes.map(function (p) {
      return htmlTuile("data-canal", p.cle, p.libelle, "", p.cle === ed.canal, false);
    }).join("");
    zone("tuiles-styles").innerHTML = Object.keys(ref.stylesAnnonce).map(function (cle) {
      return htmlTuile("data-style", cle, ref.stylesAnnonce[cle], PRECISIONS_STYLE[cle], cle === ed.style, false);
    }).join("");
  }

  // ---------- Fenêtre : étape 4 (texte composé, puis relu) ----------
  // Compose le titre et le texte à partir des choix, seulement si les choix ont changé : les corrections tapées restent.
  function composerSiBesoin() {
    var cle = ed.vehiculeId + "|" + ed.objectif + "|" + ed.style;
    if (ed.composeePour === cle) return;
    var g = A.generer(vehicule(ed.vehiculeId), { objectif: ed.objectif, style: ed.style });
    champ("ed-titre").value = g.titre;
    champ("ed-description").value = g.description;
    champ("ed-points").value = (g.pointsForts || []).join("\n");
    champ("ed-appel").value = g.appelAction;
    champ("ed-relu").checked = false;
    ed.avertissements = g.avertissements || [];
    ed.composeePour = cle;
  }
  function lireChamps(prefixe) {
    return {
      titre: champ(prefixe + "-titre").value.trim(),
      description: champ(prefixe + "-description").value.trim(),
      appelAction: champ(prefixe + "-appel").value.trim(),
      pointsForts: champ(prefixe + "-points").value.split("\n").map(function (x) { return x.trim(); }).filter(Boolean),
    };
  }
  // Points à vérifier (mentions sensibles, cohérence avec la fiche, informations absentes de la fiche).
  function elementsAVerifier(annonce) {
    var x = OV.verifications(annonce);
    var lignes = [];
    x.mentions.forEach(function (m) { lignes.push({ alerte: true, texte: "« " + m.extrait + " » : " + m.raison }); });
    x.coherence.forEach(function (c) { lignes.push({ alerte: true, texte: c }); });
    if (x.disponibilite.cle !== "disponible") lignes.push({ alerte: true, texte: x.disponibilite.texte });
    if (x.champs) x.champs.manquants.forEach(function (m) { lignes.push({ alerte: false, texte: m + " : absent de la fiche, ne pas l'affirmer." }); });
    return lignes;
  }
  function htmlAVerifier(lignes) {
    if (!lignes.length) return '<li class="anv-attenue">Aucune mention à vérifier détectée.</li>';
    return lignes.map(function (l) { return '<li class="' + (l.alerte ? "is-alerte" : "") + '">' + esc(l.texte) + "</li>"; }).join("");
  }
  function rendreVerificationNouvelle() {
    var texte = lireChamps("ed");
    var pseudo = { vehiculeId: ed.vehiculeId, titre: texte.titre, description: texte.description, pointsForts: texte.pointsForts, appelAction: texte.appelAction };
    var avertissements = ed.avertissements.map(function (t) { return '<li class="is-alerte">' + esc(t) + "</li>"; }).join("");
    zone("verifier-nouvelle").innerHTML = '<h3 class="anv-sous-titre">À vérifier avant l\'envoi</h3><ul class="anv-verifier">' + avertissements + htmlAVerifier(elementsAVerifier(pseudo)) + "</ul>";
  }

  // ---------- Fenêtre : aperçu à droite ----------
  function htmlBarres(nombre) {
    var html = "";
    for (var i = 0; i < nombre; i++) html += '<span class="anv-barre-vide' + (i === nombre - 1 ? " is-courte" : "") + '"></span>';
    return html;
  }
  // Aperçu : titre, texte (avec l'appel à l'action à la ligne) et prix. Barres grises tant qu'un élément manque.
  function rendreApercu(v, canal, texte) {
    zone("apercu-canal").textContent = canal ? plateforme(canal) : "Canal à choisir";
    var titre = texte && texte.titre ? '<h3 class="anv-apercu-titre">' + esc(texte.titre) + "</h3>" : '<div class="anv-barres">' + htmlBarres(1) + "</div>";
    var corps;
    if (texte && texte.description) {
      var points = texte.pointsForts && texte.pointsForts.length
        ? '<ul class="anv-apercu-points">' + texte.pointsForts.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "";
      corps = '<p class="anv-apercu-texte">' + esc(texte.description) + (texte.appelAction ? "\n" + esc(texte.appelAction) : "") + "</p>" + points;
    } else {
      corps = '<div class="anv-barres">' + htmlBarres(3) + "</div>";
    }
    var prix = v ? '<p class="anv-apercu-prix">' + esc(argent(v.prixDemande)) + ' <span>avant taxes</span></p>' : "";
    var nom = v && !(texte && texte.titre) ? '<p class="anv-apercu-nom">' + esc(S.nomVehicule(v)) + "</p>" : "";
    zone("apercu").innerHTML =
      '<div class="anv-photo"><i class="bi bi-car-front" aria-hidden="true"></i><span>photo de la fiche d\'inventaire</span></div>' +
      '<div class="anv-apercu-corps">' + nom + titre + corps + prix + "</div>";

    // « Champs utilisés » : dès qu'un véhicule est choisi, les champs de sa fiche qui servent au texte.
    if (!v) {
      zone("champs-utilises").innerHTML = "";
      return;
    }
    var fiche = A.champsInventaire(v);
    var connus = fiche.connus.map(function (c) { return c.cle; });
    var etiquettes = [];
    CHAMPS_APERCU.forEach(function (c) {
      if (connus.indexOf(c.cle) >= 0) etiquettes.push(c.libelle);
    });
    if (fiche.equipements.length) etiquettes.splice(etiquettes.length - 1, 0, "Équipement");
    zone("champs-utilises").innerHTML = '<span class="anv-champs-libelle">Champs utilisés</span>' +
      etiquettes.map(function (e) { return '<span class="anv-etiquette-menthe">' + esc(e) + "</span>"; }).join("");
  }

  // ---------- Fenêtre : nouvelle annonce ----------
  // Affiche la section de l'étape. La colonne remonte en haut seulement quand l'étape change (pas après un clic sur une tuile).
  var sectionAffichee = null;
  function afficherSection(nom) {
    fenetre.querySelectorAll("[data-etape]").forEach(function (s) { s.hidden = s.dataset.etape !== String(nom); });
    if (sectionAffichee !== String(nom)) zone("gauche").scrollTop = 0;
    sectionAffichee = String(nom);
  }
  function rendreNouvelle() {
    afficherSection(ed.etape);
    champ("fenetre-titre").textContent = "Nouvelle annonce";
    champ("fenetre-aide").textContent = AIDES[ed.etape];
    zone("inventaire").hidden = true;
    rendreEtapes();
    if (ed.etape === 1) rendreTuilesVehicules();
    if (ed.etape === 2) rendreTuilesObjectifs();
    if (ed.etape === 3) rendreTuilesStyle();
    if (ed.etape === 4) {
      composerSiBesoin();
      rendreVerificationNouvelle();
    }
    var texte = ed.etape === 4 ? lireChamps("ed") : null;
    rendreApercu(vehicule(ed.vehiculeId), ed.canal, texte);
    rendrePied();
  }
  function nouvelle(vehiculeId) {
    ed = nouvelEtat();
    erreur(null);
    var v = vehicule(vehiculeId);
    if (v && A.disponibilite(v).ok) ed.vehiculeId = v.id;
    ouvrirFenetre();
    rendreNouvelle();
  }
  // Enregistre la nouvelle annonce (brouillon), puis l'envoie en révision si demandé.
  function enregistrerNouvelle(versRevision) {
    var r = OV.creerAnnonce({ vehiculeId: ed.vehiculeId, objectif: ed.objectif, style: ed.style, canal: ed.canal });
    if (r.erreur) return erreur(r.erreur);
    var id = r.annonce.id;
    var texte = lireChamps("ed");
    // Le store n'écrit « Texte modifié » dans l'historique que si le texte a vraiment été corrigé.
    var corrige = texte.titre !== r.annonce.titre || texte.description !== r.annonce.description ||
      texte.appelAction !== r.annonce.appelAction || texte.pointsForts.join("\n") !== (r.annonce.pointsForts || []).join("\n");
    if (corrige) OV.modifierAnnonce(id, texte);
    var message = "Brouillon enregistré.";
    if (versRevision) {
      var s = OV.changerStatut(id, "EnRevision");
      message = s.erreur ? "Brouillon enregistré, mais l'envoi en révision a échoué : " + s.erreur : "Annonce envoyée en révision.";
    }
    pages["liste-corps"] = 1;
    fermerFenetre();
    rendreListe();
    P.notifier(message + (r.avertissements.length ? " " + r.avertissements.join(" ") : ""));
  }

  // ---------- Fenêtre : annonce existante ----------
  function remplirChampsEdition(a) {
    var verrou = a.statut === "Publiee" || a.statut === "Archivee";
    var valeurs = { "ex-titre": a.titre, "ex-description": a.description, "ex-points": (a.pointsForts || []).join("\n"), "ex-appel": a.appelAction };
    Object.keys(valeurs).forEach(function (id) {
      // On ne remplace pas un champ en cours de saisie.
      if (document.activeElement !== champ(id)) champ(id).value = valeurs[id];
      champ(id).disabled = verrou;
    });
    fenetre.querySelector('[data-an="variantes"]').disabled = verrou;
  }
  function htmlFicheInventaire(v) {
    var c = A.champsInventaire(v);
    var html = c.connus.map(function (x) { return "<div><dt>" + esc(x.libelle) + "</dt><dd>" + esc(x.valeur) + "</dd></div>"; }).join("");
    html += "<div><dt>Équipements</dt><dd>" + (c.equipements.length ? esc(c.equipements.join(", ")) : '<span class="anv-attenue">Non indiqués</span>') + "</dd></div>";
    if (c.manquants.length) html += '<div><dt>Absent de la fiche</dt><dd class="anv-manquant">' + esc(c.manquants.join(", ")) + "</dd></div>";
    return html;
  }
  function rendreVariantes(a) {
    if (!a.variantes || !a.variantes.length) {
      zone("variantes").innerHTML = "";
      return;
    }
    var comparaison = A.comparer(a.variantes);
    var libelles = {};
    ref.variantesAnnonce.forEach(function (x) { libelles[x.cle] = x; });
    var verrou = a.statut === "Publiee" || a.statut === "Archivee";
    var cartes = a.variantes.map(function (x, i) {
      var info = libelles[x.cle] || {};
      var retenue = a.varianteRetenue === x.cle;
      var propres = comparaison.differences[i].propres.slice(0, 6).join(", ") || "aucune";
      return '<article class="anv-variante' + (retenue ? " is-retenue" : "") + '">' +
        "<h4>" + esc(info.libelle || x.cle) + (retenue ? ' <span class="anv-attenue">(retenue)</span>' : "") + "</h4>" +
        '<p class="anv-attenue">' + esc(info.description || "") + "</p>" +
        '<p class="anv-fort">' + esc(x.titre) + "</p><p>" + esc(x.description) + "</p>" +
        '<p class="anv-attenue">' + x.description.length + " caractères. Propre à cette variante : " + esc(propres) + ".</p>" +
        (verrou || retenue ? "" : '<button type="button" class="anv-btn-blanc anv-btn-petit" data-an="retenir" data-cle="' + esc(x.cle) + '">Retenir cette variante</button>') +
        "</article>";
    }).join("");
    zone("variantes").innerHTML = '<p class="anv-aide-petite">Variantes rédactionnelles composées par modèles déterministes : leur performance n\'est pas connue.</p>' +
      '<div class="anv-variantes">' + cartes + "</div>" +
      '<p class="anv-aide-petite">Informations communes aux trois versions : ' + esc(comparaison.communs.slice(0, 12).join(", ") || "aucune") + ".</p>";
  }
  function rendreValidation(a) {
    var transitions = OV.transitions(a.statut);
    var validation = texteValidation(a);
    var html = '<p class="anv-validation-statut">' + htmlStatut(a.statut) +
      (validation ? '<span class="anv-attenue">' + esc(validation) + " le " + esc(P.dateCourte(a.valideeLe)) + "</span>" : "") + "</p>";
    if (transitions.indexOf("Approuvee") >= 0) {
      html += '<label class="anv-relecture"><input class="form-check-input" type="checkbox" id="ex-relu" />' +
        "<span>J'ai relu le texte et vérifié chaque information auprès de la fiche du véhicule.</span></label>";
    }
    html += '<div class="anv-rangee-boutons">' + transitions.map(function (statut) {
      var libelle = LIBELLES_TRANSITION[statut] || statut;
      if (statut === "Brouillon") libelle = a.statut === "Archivee" ? "Restaurer en brouillon" : "Renvoyer en brouillon";
      return '<button type="button" class="anv-btn-blanc anv-btn-petit" data-an="statut" data-statut="' + esc(statut) + '">' + esc(libelle) + "</button>";
    }).join("");
    if (["Approuvee", "PretePublication", "Publiee"].indexOf(a.statut) >= 0) {
      html += '<a class="anv-btn-blanc anv-btn-petit" href="' + esc(ref.urls.acquisition + "?onglet=publications") + '">Suivre la publication</a>';
    }
    html += '</div><p class="anv-aide-petite">Aucune approbation automatique. « Publiée » ne s\'obtient qu\'en déclarant une publication faite hors Phineas.</p>';
    zone("validation").innerHTML = html;
  }
  function rendreHistorique(a) {
    var historique = Pagination.decouper(pages, "historique", (a.historique || []).slice().reverse());
    Pagination.afficherBarre(fenetre, "historique", historique.pagination);
    zone("historique").innerHTML = historique.elements.map(function (h) {
      return '<li><time datetime="' + esc(h.date) + '">' + esc(P.dateComplete(h.date)) + "</time><span>" + esc(h.texte) +
        ' <span class="anv-attenue">(' + esc(h.auteur) + ")</span></span></li>";
    }).join("");
  }
  function rendreEdition() {
    var a = OV.annonce(ed.annonceId);
    if (!a) return;
    var v = OV.vehiculeDe(a);
    afficherSectionSansRemonter("edition");
    champ("fenetre-titre").textContent = a.reference + (v ? ", " + S.nomVehicule(v) : "");
    champ("fenetre-aide").textContent = AIDES.edition;
    rendreEtapes();
    remplirChampsEdition(a);
    rendreVariantes(a);
    zone("verifier").innerHTML = htmlAVerifier(elementsAVerifier(a));
    rendreValidation(a);
    rendreHistorique(a);
    rendreApercu(v, a.canal, lireChamps("ex"));
    zone("inventaire").hidden = !v;
    zone("inventaire").innerHTML = v ? htmlFicheInventaire(v) : "";
    rendrePied();
  }
  // En édition, la fenêtre se redessine après chaque action : on garde la position de défilement.
  function afficherSectionSansRemonter(nom) {
    fenetre.querySelectorAll("[data-etape]").forEach(function (s) { s.hidden = s.dataset.etape !== String(nom); });
    sectionAffichee = String(nom);
  }
  function ouvrir(id) {
    ed = nouvelEtat();
    ed.mode = "edition";
    ed.annonceId = id;
    pages.historique = 1;
    erreur(null);
    ouvrirFenetre();
    zone("gauche").scrollTop = 0;
    rendreEdition();
  }

  // ---------- Fenêtre : boutons du pied ----------
  function retour() {
    if (ed.mode === "edition" || ed.etape === 1) return fermerFenetre();
    ed.etape--;
    erreur(null);
    rendreNouvelle();
  }
  function avancer() {
    if (ed.mode === "edition") {
      var ok = OV.modifierAnnonce(ed.annonceId, lireChamps("ex"));
      P.notifier(ok ? "Annonce enregistrée." : "Annonce non modifiable dans cet état.");
      return;
    }
    if (!etapeComplete()) return;
    if (ed.etape < 4) {
      ed.etape++;
      erreur(null);
      rendreNouvelle();
      var premier = elementsFocusables().filter(function (el) { return zone("gauche").contains(el); })[0];
      if (premier) premier.focus();
      return;
    }
    enregistrerNouvelle(true);
  }

  // ---------- Événements ----------
  racine.addEventListener("click", function (e) {
    var bouton = e.target.closest("[data-an], [data-effacer-filtres]");
    if (bouton && bouton.hasAttribute("data-effacer-filtres")) {
      champ("f-recherche").value = "";
      champ("f-statut").value = "";
      champ("f-canal").value = "";
      return relancerListe();
    }
    if (bouton && bouton.dataset.an === "ouvrir") return ouvrir(bouton.dataset.id);
    // Un clic ailleurs sur la ligne ouvre aussi l'annonce (les liens gardent leur comportement).
    var ligne = e.target.closest("tr[data-ligne]");
    if (ligne && !e.target.closest("a, button")) ouvrir(ligne.dataset.ligne);
  });
  document.querySelector('[data-an="nouvelle"]').addEventListener("click", function () { nouvelle(null); });
  ["f-recherche", "f-statut", "f-canal"].forEach(function (id) {
    champ(id).addEventListener(id === "f-recherche" ? "input" : "change", relancerListe);
  });

  fenetre.addEventListener("click", function (e) {
    if (e.target.closest("[data-fermer-fenetre]")) return fermerFenetre();
    var tuile = e.target.closest(".anv-tuile");
    if (tuile && !tuile.disabled) {
      if (tuile.dataset.vehicule) ed.vehiculeId = tuile.dataset.vehicule;
      if (tuile.dataset.objectif) ed.objectif = tuile.dataset.objectif;
      if (tuile.dataset.canal) ed.canal = tuile.dataset.canal;
      if (tuile.dataset.style) ed.style = tuile.dataset.style;
      rendreNouvelle();
      // Garde le focus sur la tuile choisie après le nouveau rendu.
      var attribut = tuile.dataset.vehicule ? "data-vehicule" : tuile.dataset.objectif ? "data-objectif" : tuile.dataset.canal ? "data-canal" : "data-style";
      var memeTuile = fenetre.querySelector("[" + attribut + '="' + tuile.getAttribute(attribut) + '"]');
      if (memeTuile) memeTuile.focus();
      return;
    }
    var bouton = e.target.closest("[data-an]");
    if (!bouton || bouton.disabled) return;
    var action = bouton.dataset.an;
    if (action === "retour") retour();
    else if (action === "avancer") avancer();
    else if (action === "brouillon") enregistrerNouvelle(false);
    else if (action === "variantes") {
      OV.modifierAnnonce(ed.annonceId, lireChamps("ex"));
      OV.genererVariantes(ed.annonceId);
      P.notifier("Trois variantes préparées par modèles déterministes : aucune performance n'est connue.");
    } else if (action === "retenir") {
      OV.retenirVariante(ed.annonceId, bouton.dataset.cle);
      P.notifier("Variante retenue : le texte de l'annonce est remplacé, et reste modifiable.");
    } else if (action === "statut") {
      // La case « relu » est lue AVANT l'enregistrement du texte, qui redessine la zone de validation.
      var relu = champ("ex-relu") ? champ("ex-relu").checked : false;
      if (["Brouillon", "EnRevision", "Approuvee"].indexOf(OV.annonce(ed.annonceId).statut) >= 0) OV.modifierAnnonce(ed.annonceId, lireChamps("ex"));
      var r = OV.changerStatut(ed.annonceId, bouton.dataset.statut, { relu: relu });
      if (r.erreur) erreur(r.erreur);
      else {
        erreur(null);
        P.notifier("Statut : " + ref.statutsAnnonce[bouton.dataset.statut] + ".");
      }
    }
  });
  // Saisie à l'étape 4 ou en édition : l'aperçu suit en direct, le bouton principal suit la case de relecture.
  fenetre.addEventListener("input", function (e) {
    if (ed.mode === "nouvelle" && ed.etape === 4) {
      rendreApercu(vehicule(ed.vehiculeId), ed.canal, lireChamps("ed"));
      if (e.target.id !== "ed-relu") rendreVerificationNouvelle();
      rendrePied();
    } else if (ed.mode === "edition") {
      var a = OV.annonce(ed.annonceId);
      rendreApercu(a ? OV.vehiculeDe(a) : null, a ? a.canal : null, lireChamps("ex"));
    }
  });
  fenetre.addEventListener("change", function (e) {
    if (e.target.id === "ed-relu") rendrePied();
  });
  // Échap ferme la fenêtre ; Tab reste piégé dans la fenêtre.
  document.addEventListener("keydown", function (e) {
    if (fenetre.hidden) return;
    if (e.key === "Escape") {
      e.preventDefault();
      fermerFenetre();
      return;
    }
    if (e.key !== "Tab") return;
    var focusables = elementsFocusables();
    if (!focusables.length) return;
    var premier = focusables[0];
    var dernier = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === premier) {
      e.preventDefault();
      dernier.focus();
    } else if (!e.shiftKey && document.activeElement === dernier) {
      e.preventDefault();
      premier.focus();
    } else if (!fenetre.contains(document.activeElement)) {
      e.preventDefault();
      premier.focus();
    }
  });

  // La fenêtre passe à la fin du <body> : son voile couvre toute la page, barre latérale comprise.
  document.body.appendChild(fenetre);

  function rendre() {
    rendreListe();
    if (!fenetre.hidden && ed.mode === "edition") rendreEdition();
  }
  Pagination.ecouterClics(racine, pages, rendreListe);
  Pagination.ecouterClics(fenetre, pages, rendreEdition);
  OV.abonner(rendre);
  rendre();

  // Ouverture ciblée : ?annonce=… ou ?vehicule=… (depuis l'assistant ou l'inventaire).
  if (racine.dataset.annonce && OV.annonce(racine.dataset.annonce)) ouvrir(racine.dataset.annonce);
  else if (racine.dataset.vehicule && S.vehicule(racine.dataset.vehicule)) nouvelle(racine.dataset.vehicule);
  window.AnnoncesPage = { ouvrir: ouvrir, nouvelle: nouvelle, etat: function () { return ed; } };
})();
