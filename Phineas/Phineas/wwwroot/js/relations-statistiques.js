// Statistiques relationnelles (Views/Relations/Statistiques.cshtml) : trois onglets, un seul visible à la fois.
// Chaque onglet : une phrase de résumé en mots, 3 à 5 cartes de chiffres, un ou deux graphiques doux, et la limite de lecture
// en pied de carte. Tous les chiffres viennent de RelationsClients.statistiques (relations-store.js) : rien n'est inventé,
// une valeur absente s'affiche « Non disponible ».
(function () {
  "use strict";

  var RC = window.RelationsClients, P = window.Prospects;
  var racine = document.getElementById("statistiques");
  if (!RC || !P || !racine) return;
  var esc = P.esc, ref = RC.ref;
  var periode = document.getElementById("f-periode");

  // Nombre d'observations à partir duquel on accepte de tirer une conclusion (réglage partagé, seuil indicatif).
  var SEUIL_OBSERVATIONS = ref.config.observationsMinimales;
  // Note sur 5 à partir de laquelle une dimension est dite « bien notée » (réglage partagé).
  var SEUIL_BIEN_NOTE = ref.config.seuilSatisfait;
  var NOTE_MAX = 5;
  // Anneau des taux : rayon du cercle SVG (viewBox de 40 sur 40, trait de 5).
  var RAYON_ANNEAU = 16;

  // Nom court et genre de chaque dimension, pour la phrase de résumé (« le conseiller et la transparence sont bien notés »).
  var NOMS_DIMENSIONS = {
    conseiller: { nom: "le conseiller", feminin: false },
    transparence: { nom: "la transparence", feminin: true },
    administratif: { nom: "l'administratif", feminin: false },
    livraison: { nom: "la livraison", feminin: true },
  };
  // Libellés d'affichage des étapes du parcours des recommandations (les clés viennent de relations-regles.js).
  var LIBELLES_PARCOURS = { prospects: "Prospects recommandés" };

  // ---------- Petits outils de texte ----------

  // « 1 opportunité perdue », « 2 opportunités perdues » : 0 et 1 restent au singulier, comme en français.
  function accorder(n, singulier, pluriel) {
    if (n <= 1) return n + " " + singulier;
    return n + " " + pluriel;
  }
  function majuscule(texte) {
    return texte.charAt(0).toUpperCase() + texte.slice(1);
  }
  function nombreDecimal(n) {
    return String(n).replace(".", ",");
  }
  // « a, b et c »
  function enumerer(liste) {
    if (liste.length <= 1) return liste.join("");
    return liste.slice(0, -1).join(", ") + " et " + liste[liste.length - 1];
  }
  // Limite de lecture d'un graphique selon le nombre d'observations.
  function texteEchantillon(n) {
    if (!n) return "Aucune observation sur la période.";
    if (n < SEUIL_OBSERVATIONS) {
      return accorder(n, "observation", "observations") + " : échantillon insuffisant pour conclure (seuil indicatif : " + SEUIL_OBSERVATIONS + ").";
    }
    return accorder(n, "observation", "observations") + ".";
  }

  // ---------- Briques d'affichage ----------

  function phrase(texte) {
    return '<p class="rs-resume">' + esc(texte) + "</p>";
  }

  // Petit anneau de 40 px qui montre une proportion (0 à 100).
  function anneau(pourcentage) {
    var circonference = 2 * Math.PI * RAYON_ANNEAU;
    var plein = circonference * pourcentage / 100;
    return '<svg class="rs-anneau" viewBox="0 0 40 40" aria-hidden="true">' +
      '<circle class="rs-anneau-piste" cx="20" cy="20" r="' + RAYON_ANNEAU + '"></circle>' +
      '<circle class="rs-anneau-arc" cx="20" cy="20" r="' + RAYON_ANNEAU + '" stroke-dasharray="' + plein.toFixed(2) + " " + circonference.toFixed(2) + '"></circle></svg>';
  }

  // Carte de chiffre. valeur null = « Non disponible ». tauxPourAnneau : pourcentage à dessiner, sinon rien.
  function carteChiffre(valeur, libelle, precision, tauxPourAnneau) {
    var texteValeur = valeur == null ? "Non disponible" : String(valeur);
    var classeValeur = "rs-chiffre-valeur";
    if (valeur == null) classeValeur += " is-indisponible";
    var tete = '<span class="' + classeValeur + '">' + esc(texteValeur) + "</span>";
    if (tauxPourAnneau != null) tete = '<span class="rs-chiffre-tete">' + anneau(tauxPourAnneau) + tete + "</span>";
    return '<div class="rs-chiffre">' + tete + '<span class="rs-chiffre-libelle">' + esc(libelle) + "</span>" +
      (precision ? '<span class="rs-chiffre-precision">' + esc(precision) + "</span>" : "") + "</div>";
  }
  function rangeeChiffres(cartes) {
    return '<div class="rs-chiffres rs-chiffres-' + cartes.length + '">' + cartes.join("") + "</div>";
  }

  // Ligne de répartition : libellé (+ précision grise), valeur à droite, barre fine dessous.
  // largeur : 0 à 100. infobulle : texte affiché au survol et au focus clavier.
  function ligneRepartition(libelle, precision, texteValeur, largeur, infobulle) {
    return '<li class="rs-ligne" tabindex="0" data-infobulle="' + esc(infobulle) + '">' +
      '<span class="rs-ligne-tete"><span class="rs-ligne-libelle">' + esc(libelle) +
      (precision ? ' <span class="rs-ligne-precision">' + esc(precision) + "</span>" : "") + "</span>" +
      '<span class="rs-ligne-valeur">' + esc(texteValeur) + "</span></span>" +
      '<span class="rs-piste" aria-hidden="true"><span class="rs-barre-fine" style="width:' + largeur + '%"></span></span></li>';
  }

  // Ligne de parcours : libellé et précision à gauche, barre épaisse au centre, valeur à droite.
  function ligneParcours(libelle, precision, valeur, largeur) {
    return '<li class="rs-etape" tabindex="0" data-infobulle="' + esc(libelle + " : " + valeur) + '">' +
      '<span class="rs-etape-texte"><span class="rs-etape-libelle">' + esc(libelle) + '</span><span class="rs-etape-precision">' + esc(precision) + "</span></span>" +
      '<span class="rs-etape-piste" aria-hidden="true"><span class="rs-barre-epaisse" style="width:' + largeur + '%"></span></span>' +
      '<span class="rs-etape-valeur">' + valeur + "</span></li>";
  }

  // Carte de graphique : titre, sous-titre, contenu, puis limite de lecture après un filet.
  function carteGraphique(titre, sousTitre, contenu, limite) {
    return '<section class="rs-carte rs-graphique"><h2 class="rs-carte-titre">' + esc(titre) + "</h2>" +
      '<p class="rs-carte-sous-titre">' + esc(sousTitre) + "</p>" + contenu +
      '<p class="rs-limite">' + esc(limite) + "</p></section>";
  }

  // Largeur d'une barre en pourcentage de la plus grande valeur (0 si tout est vide).
  function largeur(valeur, max) {
    if (!max) return 0;
    return Math.round(valeur / max * 100);
  }

  // ---------- Onglet 1 : ventes perdues ----------

  // Origine des motifs d'une ligne : « Confirmé », « Hypothèse », ou un mélange (« 2 confirmés, 1 hypothèse »).
  function precisionMotif(m) {
    if (m.motif === "inconnu") return "";
    var morceaux = [];
    if (m.confirmes) morceaux.push(m.confirmes === m.total ? "Confirmé" : accorder(m.confirmes, "confirmé", "confirmés"));
    if (m.hypotheses) morceaux.push(m.hypotheses === m.total ? "Hypothèse" : accorder(m.hypotheses, "hypothèse", "hypothèses"));
    if (m.inconnus) morceaux.push(m.inconnus === m.total ? "Origine inconnue" : accorder(m.inconnus, "origine inconnue", "origines inconnues"));
    return morceaux.join(", ");
  }

  function resumePertes(p) {
    if (!p.total) return "Aucune opportunité perdue sur la période.";
    var texte = accorder(p.total, "opportunité perdue", "opportunités perdues");
    if (p.reactivees) texte += ", dont " + accorder(p.reactivees, "réactivée", "réactivées");
    texte += ".";
    if (p.total < SEUIL_OBSERVATIONS) texte += " C'est trop peu d'observations pour en tirer une conclusion.";
    return texte;
  }

  // Phrase de pied du graphique des étapes : l'étape la plus fréquente, et la taille de l'échantillon.
  function limiteEtapes(p, etapes) {
    var plusFrequente = null;
    etapes.forEach(function (e) {
      if (!plusFrequente || p.parEtape[e.cle] > p.parEtape[plusFrequente.cle]) plusFrequente = e;
    });
    if (!plusFrequente) return "Aucune étape renseignée.";
    var nombre = p.parEtape[plusFrequente.cle];
    var debut = nombre > p.total / 2 ? "La plupart des pertes arrivent à l'étape « " : "L'étape la plus fréquente est « ";
    var fin = p.total < SEUIL_OBSERVATIONS ? " », mais sur " + accorder(p.total, "dossier", "dossiers") + " seulement." : " ».";
    return debut + plusFrequente.libelle + fin;
  }

  function rendrePertes(s) {
    var p = s.pertes;
    // Les opportunités perdues sans clôture enregistrée n'ont pas de motif : elles comptent comme motif inconnu.
    var inconnus = p.inconnus + s.sansCloture;
    var precisionReactivees = "Reprises par vous";
    if (p.recuperees) {
      var tauxRecuperation = RC.regles.taux(p.recuperees, p.reactivees);
      precisionReactivees = "Dont " + accorder(p.recuperees, "récupérée", "récupérées") + " avec vente livrée (" + tauxRecuperation + " %)";
    }
    var html = phrase(resumePertes(p)) + rangeeChiffres([
      carteChiffre(p.total, p.total <= 1 ? "Opportunité perdue" : "Opportunités perdues", "Pendant la période"),
      carteChiffre(p.confirmes, p.confirmes <= 1 ? "Motif confirmé" : "Motifs confirmés", "Calculé à partir des données enregistrées"),
      carteChiffre(p.hypotheses, p.hypotheses <= 1 ? "Hypothèse" : "Hypothèses", "Motif supposé, non confirmé"),
      carteChiffre(inconnus, inconnus <= 1 ? "Motif inconnu" : "Motifs inconnus", "Information absente"),
      carteChiffre(p.reactivees, p.reactivees <= 1 ? "Réactivée" : "Réactivées", precisionReactivees),
    ]);
    if (!p.total) return html + '<p class="rs-vide">Aucune vente perdue sur la période : rien à répartir.</p>';

    var maxMotif = 0;
    p.parMotif.forEach(function (m) { maxMotif = Math.max(maxMotif, m.total); });
    var lignesMotifs = p.parMotif.map(function (m) {
      var libelle = ref.motifsPerte[m.motif];
      return ligneRepartition(libelle, precisionMotif(m), String(m.total), largeur(m.total, maxMotif), libelle + " : " + m.total);
    }).join("");

    // Étapes dans l'ordre du pipeline, seulement celles qui ont au moins une perte.
    var etapes = P.etapes.filter(function (e) { return p.parEtape[e.cle]; });
    var maxEtape = 0;
    etapes.forEach(function (e) { maxEtape = Math.max(maxEtape, p.parEtape[e.cle]); });
    var lignesEtapes = etapes.map(function (e) {
      var n = p.parEtape[e.cle];
      return ligneRepartition(e.libelle, "", String(n), largeur(n, maxEtape), e.libelle + " : " + n);
    }).join("");

    return html + '<div class="rs-graphiques">' +
      carteGraphique("Répartition par motif", "Chaque motif, avec l'origine de l'information.", '<ul class="rs-repartition">' + lignesMotifs + "</ul>", texteEchantillon(p.total)) +
      carteGraphique("Étape commerciale atteinte", "Jusqu'où l'opportunité était allée avant d'être perdue.", '<ul class="rs-repartition">' + lignesEtapes + "</ul>", limiteEtapes(p, etapes)) +
      "</div>";
  }

  // ---------- Onglet 2 : satisfaction ----------

  // « Le conseiller et la transparence sont bien notés ; l'administratif et la livraison le sont moins. »
  function phraseDimensions(dimensions) {
    var bien = [], moins = [];
    dimensions.forEach(function (d) {
      if (d.moyenne == null) return;
      var nom = NOMS_DIMENSIONS[d.cle] || { nom: d.libelle.toLowerCase(), feminin: false };
      if (d.moyenne >= SEUIL_BIEN_NOTE) bien.push(nom);
      else moins.push(nom);
    });
    if (!bien.length && !moins.length) return "";
    if (!moins.length) return " Toutes les dimensions évaluées sont bien notées.";
    if (!bien.length) return " Aucune dimension n'atteint " + SEUIL_BIEN_NOTE + " sur " + NOTE_MAX + ".";

    var noms = bien.map(function (x) { return x.nom; });
    var toutFeminin = bien.every(function (x) { return x.feminin; });
    var accordNote = toutFeminin ? "notée" : "noté";
    var debut = bien.length === 1 ? enumerer(noms) + " est bien " + accordNote : enumerer(noms) + " sont bien " + accordNote + "s";
    var nomsMoins = moins.map(function (x) { return x.nom; });
    var fin = moins.length === 1 ? enumerer(nomsMoins) + " l'est moins" : enumerer(nomsMoins) + " le sont moins";
    return " " + majuscule(debut) + " ; " + fin + ".";
  }

  function resumeSatisfaction(x) {
    if (!x.livraisons) return "Aucune livraison confirmée sur la période.";
    var texte;
    if (!x.reponses) texte = "Aucun retour reçu sur " + accorder(x.livraisons, "livraison", "livraisons") + ".";
    else texte = accorder(x.reponses, "retour reçu", "retours reçus") + " sur " + accorder(x.livraisons, "livraison", "livraisons") + ".";
    return texte + phraseDimensions(x.parDimension);
  }

  function rendreSatisfaction(s) {
    var x = s.satisfaction;
    var precisionTaux = "Aucune livraison : non calculable";
    if (x.livraisons) precisionTaux = x.reponses + " sur " + accorder(x.livraisons, "livraison", "livraisons");
    var precisionProblemes = "Aucun résolu";
    if (x.problemesResolus) precisionProblemes = accorder(x.problemesResolus, "autre résolu", "autres résolus");
    var delai = x.delaiMoyenResolutionJours == null ? null : nombreDecimal(x.delaiMoyenResolutionJours) + " j";

    var html = phrase(resumeSatisfaction(x)) + rangeeChiffres([
      carteChiffre(x.livraisons, x.livraisons <= 1 ? "Livraison confirmée" : "Livraisons confirmées", "Pendant la période"),
      carteChiffre(x.reponses, x.reponses <= 1 ? "Retour reçu" : "Retours reçus", "Réception simulée"),
      carteChiffre(x.tauxReponse == null ? null : x.tauxReponse + " %", "Taux de réponse", precisionTaux, x.tauxReponse),
      carteChiffre(x.problemesOuverts, x.problemesOuverts <= 1 ? "Problème ouvert" : "Problèmes ouverts", precisionProblemes),
      carteChiffre(delai, "Délai de résolution", x.observationsDelai ? accorder(x.observationsDelai, "observation", "observations") : "Aucun problème résolu"),
    ]);

    var lignesDimensions = x.parDimension.map(function (d) {
      var texteValeur = d.moyenne == null ? "Non disponible" : nombreDecimal(d.moyenne) + " / " + NOTE_MAX;
      var largeurNote = d.moyenne == null ? 0 : Math.round(d.moyenne / NOTE_MAX * 100);
      var infobulle = d.libelle + " : " + texteValeur + " (" + accorder(d.observations, "observation", "observations") + ")";
      return ligneRepartition(d.libelle, "", texteValeur, largeurNote, infobulle);
    }).join("");

    // Échelle de la plus haute note à la plus basse (« Très satisfait » en premier).
    var cles = Object.keys(ref.echelle).sort(function (a, b) { return Number(b) - Number(a); });
    var maxReponses = 0;
    cles.forEach(function (k) { maxReponses = Math.max(maxReponses, x.repartition[k]); });
    var lignesGlobale = cles.map(function (k) {
      var n = x.repartition[k];
      return ligneRepartition(ref.echelle[k], "", String(n), largeur(n, maxReponses), ref.echelle[k] + " : " + n);
    }).join("");

    var limiteGlobale;
    if (!x.reponses) limiteGlobale = "Aucune réponse sur la période.";
    else if (x.reponses < SEUIL_OBSERVATIONS) limiteGlobale = (x.reponses === 1 ? "1 réponse seulement" : x.reponses + " réponses seulement") + " : une de plus peut tout changer.";
    else limiteGlobale = accorder(x.reponses, "réponse", "réponses") + ".";

    return html + '<div class="rs-graphiques">' +
      carteGraphique("Satisfaction par dimension", "Moyenne des éléments évalués, sur " + NOTE_MAX + ".", '<ul class="rs-repartition">' + lignesDimensions + "</ul>",
        "Chaque dimension relève d'un département différent. " + texteEchantillon(x.reponses)) +
      carteGraphique("Satisfaction globale déclarée", "La réponse de chaque client à la question générale.", '<ul class="rs-repartition">' + lignesGlobale + "</ul>", limiteGlobale) +
      "</div>";
  }

  // ---------- Onglet 3 : recommandations ----------

  function resumeReseau(r) {
    if (!r.prospects) return "Aucun prospect issu de votre réseau sur la période.";
    var texte = accorder(r.prospects, "prospect issu", "prospects issus") + " de votre réseau. ";
    if (!r.transactions) texte += "Aucune transaction conclue";
    else if (r.transactions === 1) texte += "1 transaction est conclue";
    else texte += r.transactions + " transactions sont conclues";
    if (!r.livrees) texte += ", aucune vente livrée pour le moment.";
    else texte += ", " + accorder(r.livrees, "vente livrée", "ventes livrées") + ".";
    return texte;
  }

  function precisionEtape(e) {
    if (e.denominateur == null) return "Point de départ";
    if (e.taux == null) return "Étape précédente vide";
    return e.taux + " % de l'étape précédente";
  }

  function rendreReseau(s) {
    var r = s.reseau;
    var precisionProspects = "Recommandations reçues";
    if (r.doublons) precisionProspects = r.doublons === 1 ? "1 doublon rattaché, non compté" : r.doublons + " doublons rattachés, non comptés";

    var html = phrase(resumeReseau(r)) + rangeeChiffres([
      carteChiffre(r.prospects, r.prospects <= 1 ? "Prospect issu du réseau" : "Prospects issus du réseau", precisionProspects),
      carteChiffre(r.transactions, r.transactions <= 1 ? "Transaction conclue" : "Transactions conclues", "Vente enregistrée"),
      carteChiffre(r.livrees, r.livrees <= 1 ? "Vente livrée" : "Ventes livrées", "Issue du réseau"),
    ]);

    var depart = r.entonnoir.length ? r.entonnoir[0].nombre : 0;
    var lignes = r.entonnoir.map(function (e) {
      var libelle = LIBELLES_PARCOURS[e.cle] || e.libelle;
      return ligneParcours(libelle, precisionEtape(e), e.nombre, largeur(e.nombre, depart));
    }).join("");

    var autres = '<section class="rs-carte rs-autres"><h2 class="rs-label">Autres chiffres</h2><ul class="rs-autres-liste">' +
      '<li><span><span class="rs-autres-libelle">Revenus des ventes recommandées</span> <span class="rs-autres-precision">Aucune donnée de revenu autorisée dans ce prototype</span></span>' +
      '<span class="rs-autres-valeur">Non disponible</span></li></ul></section>';

    return html +
      carteGraphique("Progression commerciale", "Des prospects recommandés jusqu'aux transactions.", '<ol class="rs-parcours">' + lignes + "</ol>", texteEchantillon(r.prospects)) +
      autres;
  }

  // ---------- Onglets ----------

  var onglets = Array.prototype.slice.call(racine.querySelectorAll("[data-onglet]"));
  var ONGLETS_VALIDES = ["pertes", "satisfaction", "recommandations"];

  function afficherOnglet(cle, donnerFocus) {
    onglets.forEach(function (o) {
      var actif = o.dataset.onglet === cle;
      o.setAttribute("aria-selected", actif ? "true" : "false");
      o.tabIndex = actif ? 0 : -1;
      o.classList.toggle("is-active", actif);
      document.getElementById(o.getAttribute("aria-controls")).hidden = !actif;
      if (actif && donnerFocus) o.focus();
    });
  }

  racine.querySelector('[role="tablist"]').addEventListener("click", function (e) {
    var onglet = e.target.closest("[data-onglet]");
    if (onglet) afficherOnglet(onglet.dataset.onglet, false);
  });
  // Flèches gauche et droite pour passer d'un onglet à l'autre au clavier.
  racine.querySelector('[role="tablist"]').addEventListener("keydown", function (e) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    var position = onglets.indexOf(document.activeElement);
    if (position < 0) return;
    var pas = e.key === "ArrowRight" ? 1 : -1;
    var suivant = onglets[(position + pas + onglets.length) % onglets.length];
    afficherOnglet(suivant.dataset.onglet, true);
    e.preventDefault();
  });

  // ---------- Rendu ----------

  function rendre() {
    var s = RC.statistiques(periode.value ? Number(periode.value) : null);
    racine.querySelector('[data-zone="pertes"]').innerHTML = rendrePertes(s);
    racine.querySelector('[data-zone="satisfaction"]').innerHTML = rendreSatisfaction(s);
    racine.querySelector('[data-zone="recommandations"]').innerHTML = rendreReseau(s);
  }
  periode.addEventListener("change", rendre);
  RC.abonner(rendre);
  rendre();

  // ?onglet=satisfaction ouvre directement un onglet (ex. lien depuis une autre page).
  var demande = new URLSearchParams(window.location.search).get("onglet");
  afficherOnglet(ONGLETS_VALIDES.indexOf(demande) >= 0 ? demande : "pertes", false);
})();
