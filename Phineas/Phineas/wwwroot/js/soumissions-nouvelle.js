// Assistant « Nouvelle soumission » : 1. client et opportunité, 2. véhicule, 3. offre, puis écran « Soumission prête ».
// Appelé par Views/Soumissions/Nouvelle.cshtml. Lit et écrit les données de démonstration via
// window.Prospects (prospects-store.js) et window.Soumissions (soumissions-store.js) ; rien n'est envoyé au serveur.
(function () {
  "use strict";

  // ---------- Réglages ----------
  var RABAIS_PROPOSE = 1000; // en dollars, tuile « Rabais de 1 000 $ »
  var MOTIF_RABAIS = "Rabais proposé à la création de la soumission";
  var JOURS_VALIDITE = 7; // durée de validité de l'offre
  var DUREE_FINANCEMENT_MOIS = 60;
  var ECHANGE_PAR_DEFAUT = "Véhicule d'échange à évaluer";
  var VEHICULES_PAR_PAGE = 8; // deux rangées de quatre tuiles

  var S = window.Soumissions;
  var P = window.Prospects;
  var C = window.SoumissionsCalcul;
  var racine = document.getElementById("parcours");
  if (!S || !P || !C || !racine) return;
  var esc = P.esc;

  var assistant = racine.querySelector("[data-assistant]");
  var ecranFin = racine.querySelector("[data-fin]");
  var aide = racine.querySelector("[data-aide]");
  var boutonPrecedent = racine.querySelector("[data-precedent]");
  var boutonSuivant = racine.querySelector("[data-suivant]");
  var boutonCreer = racine.querySelector("[data-creer]");
  var rechercheClient = document.getElementById("n-recherche-client");
  var rechercheVehicule = document.getElementById("n-recherche-vehicule");
  var urlListe = racine.querySelector(".ns-retour").href;

  // Tout ce que l'utilisateur a choisi. offre : clé d'une des tuiles de l'étape 3.
  var etat = { etape: 1, prospectId: null, oppId: null, vehiculeId: null, offre: null };
  var pageVehicules = 1;

  function zone(nom) {
    return racine.querySelector('[data-zone="' + nom + '"]');
  }
  // Minuscules sans accents, pour que « helene » trouve « Hélène ».
  function normaliser(texte) {
    return String(texte || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  function nomComplet(contact) {
    return contact.prenom + " " + contact.nom;
  }

  // ---------- Étape 1 : client ----------
  // Les prospects qui ont une opportunité active passent en premier, puis ordre alphabétique.
  function comparerClients(a, b) {
    var aActif = P.opportunitesDe(a.id).some(P.estActive);
    var bActif = P.opportunitesDe(b.id).some(P.estActive);
    if (aActif && !bActif) return -1;
    if (bActif && !aActif) return 1;
    return (a.nom + a.prenom).localeCompare(b.nom + b.prenom, "fr-CA");
  }

  function rendreClients() {
    var recherche = normaliser(rechercheClient.value.trim());
    var clients = [];
    P.contacts().forEach(function (contact) {
      var texte = normaliser(nomComplet(contact) + " " + (contact.courriel || "") + " " + (contact.telephone || ""));
      if (recherche === "" || texte.indexOf(recherche) >= 0) clients.push(contact);
    });
    clients.sort(comparerClients);

    if (clients.length === 0) {
      zone("clients").innerHTML = '<p class="ns-vide-texte">Aucun prospect ne correspond.</p>';
      return;
    }

    var html = "";
    clients.forEach(function (contact) {
      var choisi = contact.id === etat.prospectId;
      var coordonnee = contact.courriel || contact.telephone || "Aucune coordonnée";
      html +=
        '<button type="button" role="radio" aria-checked="' + choisi + '" class="ns-client' + (choisi ? " is-choisi" : "") + '" data-prospect="' + esc(contact.id) + '">' +
        '<span class="ns-avatar" aria-hidden="true">' + esc(P.initiales(contact)) + "</span>" +
        '<span class="ns-client-id"><strong>' + esc(nomComplet(contact)) + "</strong><span>" + esc(coordonnee) + "</span></span>" +
        (choisi ? '<i class="bi bi-check-lg ns-coche" aria-hidden="true"></i>' : "") +
        "</button>";
    });
    zone("clients").innerHTML = html;
  }

  // ---------- Étape 1 : opportunité ----------
  function opportunitesActives(prospectId) {
    return P.opportunitesDe(prospectId).filter(P.estActive);
  }

  function ligneDetail(titre, valeur) {
    var texte = '<span class="ns-attenue">À préciser</span>';
    if (valeur) texte = esc(valeur);
    return "<div><dt>" + esc(titre) + "</dt><dd>" + texte + "</dd></div>";
  }

  function rendreOpportunite() {
    var cible = zone("opportunite");
    if (!etat.prospectId) {
      cible.innerHTML = '<div class="ns-vide"><i class="bi bi-person"></i><span>Choisissez d\'abord un prospect.</span></div>';
      return;
    }

    var contact = P.contact(etat.prospectId);
    var actives = opportunitesActives(etat.prospectId);
    var html = '<h3 class="ns-opp-nom">' + esc(nomComplet(contact)) + "</h3>";

    if (actives.length === 0) {
      cible.innerHTML = html + '<p class="ns-vide-texte">Ce prospect n\'a aucune opportunité active. Créez-en une depuis sa fiche.</p>';
      return;
    }

    // Plusieurs opportunités actives : le conseiller choisit laquelle chiffrer.
    if (actives.length > 1) {
      html += '<div class="ns-opp-choix" role="radiogroup" aria-label="Opportunité">';
      actives.forEach(function (opp) {
        var choisie = opp.id === etat.oppId;
        html += '<button type="button" role="radio" aria-checked="' + choisie + '" class="ns-opp-pilule' + (choisie ? " is-choisi" : "") + '" data-opp="' + esc(opp.id) + '">' + esc(opp.titre) + "</button>";
      });
      html += "</div>";
    }

    var opp = etat.oppId ? P.opportunite(etat.oppId) : null;
    if (!opp) {
      cible.innerHTML = html + '<p class="ns-vide-texte">Choisissez l\'opportunité à chiffrer.</p>';
      return;
    }

    var conseiller = P.conseiller(contact.conseillerId);
    var nomConseiller = conseiller.nom;
    if (conseiller.moi) nomConseiller += " (moi)";
    var nbSoumissions = S.parOpportunite(opp.id).length;

    html += '<dl class="ns-details">' +
      ligneDetail("Recherche", P.resumeVehicule(opp)) +
      ligneDetail("Étape", P.libelleEtape(opp.etape)) +
      ligneDetail("Budget", P.resumeBudget(opp.qualification || {})) +
      ligneDetail("Conseiller", nomConseiller);
    if (nbSoumissions > 0) html += ligneDetail("Soumissions existantes", String(nbSoumissions));
    html += "</dl>";
    cible.innerHTML = html;
  }

  // ---------- Étape 2 : véhicule ----------
  var CARROSSERIES = { vus: "VUS", camionnette: "Camionnette", berline: "Berline", compacte: "Berline" };

  // Raisons pour lesquelles un véhicule correspond au besoin qualifié (indication, pas une recommandation automatique).
  function raisonsPertinence(vehicule, qualification) {
    var raisons = [];
    var modeleVoulu = false;
    (qualification.modeles || []).forEach(function (modele) {
      if (modele && normaliser(vehicule.modele).indexOf(normaliser(modele)) >= 0) modeleVoulu = true;
    });
    var marquesVoulues = (qualification.marques || []).map(normaliser);

    if (modeleVoulu) {
      raisons.push("Modèle envisagé");
    } else if (marquesVoulues.indexOf(normaliser(vehicule.marque)) >= 0) {
      raisons.push("Marque préférée");
    }
    if (qualification.categorie && CARROSSERIES[qualification.categorie] === vehicule.carrosserie) {
      raisons.push("Catégorie recherchée");
    }
    return raisons;
  }

  function estVendu(vehicule) {
    return vehicule.statutActuel === "Vendu" || vehicule.statutActuel === "Livre";
  }

  // Les plus pertinents d'abord, puis les disponibles, puis le moins cher.
  function comparerVehicules(a, b) {
    if (a.raisons.length !== b.raisons.length) return b.raisons.length - a.raisons.length;
    var aDispo = S.disponible(a.vehicule);
    var bDispo = S.disponible(b.vehicule);
    if (aDispo && !bDispo) return -1;
    if (bDispo && !aDispo) return 1;
    return a.vehicule.prixDemande - b.vehicule.prixDemande;
  }

  function titreVehicule(vehicule) {
    return vehicule.marque + " " + vehicule.modele + " " + vehicule.annee;
  }

  // Véhicules non vendus qui correspondent à la recherche, triés du plus pertinent au moins pertinent.
  function listeVehicules() {
    var opp = P.opportunite(etat.oppId);
    var qualification = (opp && opp.qualification) || {};
    var recherche = normaliser(rechercheVehicule.value.trim());

    var liste = [];
    S.inventaire().forEach(function (vehicule) {
      if (estVendu(vehicule)) return;
      var texte = normaliser([vehicule.marque, vehicule.modele, vehicule.version, vehicule.annee, vehicule.numeroStock].join(" "));
      if (recherche !== "" && texte.indexOf(recherche) < 0) return;
      liste.push({ vehicule: vehicule, raisons: raisonsPertinence(vehicule, qualification) });
    });
    liste.sort(comparerVehicules);
    return liste;
  }

  // Page où se trouve le véhicule choisi, pour le retrouver en revenant à l'étape 2.
  function pageDuVehiculeChoisi() {
    var liste = listeVehicules();
    for (var i = 0; i < liste.length; i++) {
      if (liste[i].vehicule.id === etat.vehiculeId) return Math.floor(i / VEHICULES_PAR_PAGE) + 1;
    }
    return 1;
  }

  // « 1 à 8 sur 11 », flèches et numéros de page. Cachée quand tout tient sur une page.
  function rendrePaginationVehicules(total, nbPages) {
    var cible = zone("pagination-vehicules");
    cible.hidden = nbPages <= 1;
    if (nbPages <= 1) return;

    var debut = (pageVehicules - 1) * VEHICULES_PAR_PAGE + 1;
    var fin = Math.min(total, pageVehicules * VEHICULES_PAR_PAGE);
    var html = '<span class="ns-pages-info">' + debut + " à " + fin + " sur " + total + "</span><div class=\"ns-pages\">";
    html += '<button type="button" class="ns-page-btn" data-page-vehicules="' + (pageVehicules - 1) + '"' + (pageVehicules === 1 ? " disabled" : "") + ' aria-label="Page précédente"><i class="bi bi-chevron-left"></i></button>';
    for (var page = 1; page <= nbPages; page++) {
      var courante = page === pageVehicules;
      html += '<button type="button" class="ns-page-btn' + (courante ? " is-active" : "") + '" data-page-vehicules="' + page + '"' +
        (courante ? ' aria-current="page"' : "") + ' aria-label="Page ' + page + '">' + page + "</button>";
    }
    html += '<button type="button" class="ns-page-btn" data-page-vehicules="' + (pageVehicules + 1) + '"' + (pageVehicules === nbPages ? " disabled" : "") + ' aria-label="Page suivante"><i class="bi bi-chevron-right"></i></button>';
    html += "</div>";
    cible.innerHTML = html;
  }

  function rendreVehicules() {
    var liste = listeVehicules();
    var nbPages = Math.max(1, Math.ceil(liste.length / VEHICULES_PAR_PAGE));
    if (pageVehicules > nbPages) pageVehicules = nbPages;
    var debut = (pageVehicules - 1) * VEHICULES_PAR_PAGE;
    var visibles = liste.slice(debut, debut + VEHICULES_PAR_PAGE);

    var html = "";
    visibles.forEach(function (element) {
      var vehicule = element.vehicule;
      var choisi = vehicule.id === etat.vehiculeId;
      html +=
        '<button type="button" role="radio" aria-checked="' + choisi + '" class="ns-tuile' + (choisi ? " is-choisi" : "") + '" data-vehicule="' + esc(vehicule.id) + '">' +
        "<strong>" + esc(titreVehicule(vehicule)) + "</strong>" +
        "<span>" + esc(P.argent(vehicule.prixDemande)) + "</span>";
      if (element.raisons.length > 0) {
        html += '<small class="ns-pertinence">' + esc(element.raisons.join(" · ")) + "</small>";
      }
      if (!S.disponible(vehicule)) {
        html += '<small class="ns-avertissement">Disponibilité à confirmer (' + esc(S.libelleStatutVehicule(vehicule.statutActuel).toLowerCase()) + ")</small>";
      }
      html += "</button>";
    });
    zone("vehicules").innerHTML = html;
    zone("vehicules-vide").hidden = liste.length > 0;
    rendrePaginationVehicules(liste.length, nbPages);
  }

  // ---------- Étape 3 : offre ----------
  // Les trois points de départ proposés. Le détail se règle ensuite dans la fiche de la soumission.
  function tuilesOffre(vehicule) {
    return [
      { cle: "affiche", titre: "Prix affiché", detail: P.argent(vehicule.prixDemande) },
      { cle: "rabais", titre: "Rabais de " + P.argent(RABAIS_PROPOSE), detail: P.argent(vehicule.prixDemande - RABAIS_PROPOSE) },
      { cle: "echange", titre: "Avec véhicule d'échange", detail: "Évaluation à joindre" },
    ];
  }

  function rendreOffres() {
    var vehicule = S.vehicule(etat.vehiculeId);
    var html = "";
    tuilesOffre(vehicule).forEach(function (tuile) {
      var choisie = tuile.cle === etat.offre;
      html +=
        '<button type="button" role="radio" aria-checked="' + choisie + '" class="ns-tuile' + (choisie ? " is-choisi" : "") + '" data-offre="' + tuile.cle + '">' +
        "<strong>" + esc(tuile.titre) + "</strong><span>" + esc(tuile.detail) + "</span></button>";
    });
    zone("offres").innerHTML = html;
  }

  // Offre complète enregistrée dans la soumission, construite à partir de la tuile choisie.
  function construireOffre(cleOffre, vehicule, opp) {
    var qualification = (opp && opp.qualification) || {};
    var validite = new Date();
    validite.setDate(validite.getDate() + JOURS_VALIDITE);

    var modeAchat = "financement";
    if (qualification.modeAchat === "comptant") modeAchat = "comptant";

    var offre = {
      prixAnnonce: vehicule.prixDemande,
      remise: 0,
      motifRemise: null,
      options: [],
      reprise: null,
      miseDeFonds: qualification.miseDeFonds || 0,
      acompteVerse: 0,
      modeAchat: modeAchat,
      dureeMois: DUREE_FINANCEMENT_MOIS,
      tauxAnnuel: null,
      inclureTaxes: true,
      commentaires: null,
      dateValidite: validite.toISOString(),
    };

    if (cleOffre === "rabais") {
      offre.remise = RABAIS_PROPOSE;
      offre.motifRemise = MOTIF_RABAIS;
    }
    if (cleOffre === "echange") {
      offre.reprise = { vehicule: qualification.repriseDetail || ECHANGE_PAR_DEFAUT, valeurEstimee: null, soldePret: null };
    }
    return offre;
  }

  // ---------- Navigation entre les étapes ----------
  function etapeComplete(numero) {
    if (numero === 1) return Boolean(etat.prospectId && etat.oppId);
    if (numero === 2) return Boolean(etat.vehiculeId);
    if (numero === 3) return Boolean(etat.offre);
    return false;
  }

  // On peut aller à une étape seulement si toutes les précédentes sont complètes.
  function etapeAccessible(numero) {
    for (var i = 1; i < numero; i++) {
      if (!etapeComplete(i)) return false;
    }
    return true;
  }

  function rendreEtapes() {
    racine.querySelectorAll(".ns-etapes li").forEach(function (li, index) {
      var numero = index + 1;
      var courante = numero === etat.etape;
      var faite = numero < etat.etape;
      li.classList.toggle("is-courante", courante);
      li.classList.toggle("is-faite", faite);

      var bouton = li.querySelector("button");
      bouton.disabled = !etapeAccessible(numero);
      if (courante) {
        bouton.setAttribute("aria-current", "step");
      } else {
        bouton.removeAttribute("aria-current");
      }
      // Une étape faite affiche une coche à la place de son numéro.
      var pastille = li.querySelector(".ns-num");
      if (faite) {
        pastille.innerHTML = '<i class="bi bi-check2" aria-hidden="true"></i><span class="visually-hidden">Faite :</span>';
      } else {
        pastille.textContent = String(numero);
      }
    });
  }

  function rendre() {
    racine.querySelectorAll("[data-etape]").forEach(function (section) {
      section.hidden = Number(section.dataset.etape) !== etat.etape;
    });
    rendreEtapes();

    var derniere = etat.etape === 3;
    boutonSuivant.hidden = derniere;
    boutonCreer.hidden = !derniere;
    // Suivant reste grisé tant que rien n'est choisi à l'étape courante.
    boutonSuivant.disabled = !etapeComplete(etat.etape);
    boutonCreer.disabled = !etapeComplete(3);

    var client = etat.prospectId ? P.contact(etat.prospectId) : null;
    var pourClient = client ? "Pour " + nomComplet(client) : "";

    if (etat.etape === 1) {
      rendreClients();
      rendreOpportunite();
    }
    if (etat.etape === 2) {
      zone("pour-client-2").textContent = pourClient;
      rendreVehicules();
    }
    if (etat.etape === 3) {
      zone("pour-client-3").textContent = pourClient;
      rendreOffres();
    }
  }

  function allerA(numero) {
    if (!etapeAccessible(numero)) return;
    aide.textContent = "";
    if (numero === 2) pageVehicules = pageDuVehiculeChoisi();
    etat.etape = numero;
    rendre();
    // Place le focus clavier au début de la nouvelle étape.
    var section = racine.querySelector('[data-etape="' + numero + '"]');
    section.setAttribute("tabindex", "-1");
    section.focus({ preventScroll: true });
  }

  // ---------- Création et écran final ----------
  function ligneRecap(titre, valeur) {
    return "<div><dt>" + esc(titre) + "</dt><dd>" + esc(valeur) + "</dd></div>";
  }

  function creer() {
    var contact = P.contact(etat.prospectId);
    var opp = P.opportunite(etat.oppId);
    var vehicule = S.vehicule(etat.vehiculeId);
    var offre = construireOffre(etat.offre, vehicule, opp);

    // Même contrôle que l'éditeur d'offre : on ne crée pas une soumission invalide.
    var erreurs = C.valider(offre, S.parametres);
    var messages = Object.keys(erreurs).map(function (champ) { return erreurs[champ]; });
    if (messages.length > 0) {
      aide.textContent = "Impossible de créer la soumission : " + messages.join(" ");
      return;
    }

    var soumission = S.creer({
      prospectId: etat.prospectId,
      opportuniteId: etat.oppId,
      conseillerId: contact.conseillerId,
      vehicule: vehicule,
      offre: offre,
    });

    var tuileChoisie = null;
    tuilesOffre(vehicule).forEach(function (tuile) {
      if (tuile.cle === etat.offre) tuileChoisie = tuile;
    });

    zone("recap").innerHTML =
      ligneRecap("Client", nomComplet(contact)) +
      ligneRecap("Véhicule", titreVehicule(vehicule) + " · " + P.argent(vehicule.prixDemande)) +
      ligneRecap("Offre", tuileChoisie.titre + " · " + tuileChoisie.detail);
    racine.querySelector("[data-ouvrir]").href = S.urlDetail(soumission.id) + "#offre";

    assistant.hidden = true;
    ecranFin.hidden = false;
    ecranFin.focus();
  }

  function recommencer() {
    etat = { etape: 1, prospectId: null, oppId: null, vehiculeId: null, offre: null };
    rechercheClient.value = "";
    rechercheVehicule.value = "";
    pageVehicules = 1;
    aide.textContent = "";
    ecranFin.hidden = true;
    assistant.hidden = false;
    rendre();
    rechercheClient.focus();
  }

  // ---------- Choix d'un prospect ----------
  // Si le prospect n'a qu'une opportunité active, elle est choisie d'office.
  function choisirProspect(prospectId) {
    if (etat.prospectId === prospectId) return;
    etat.prospectId = prospectId;
    etat.oppId = null;
    var actives = opportunitesActives(prospectId);
    if (actives.length === 1) etat.oppId = actives[0].id;
  }

  // ---------- Événements ----------
  racine.addEventListener("click", function (e) {
    var bouton = e.target.closest("button");
    if (!bouton || bouton.disabled) return;

    if (bouton.dataset.prospect) {
      choisirProspect(bouton.dataset.prospect);
      rendre();
    } else if (bouton.dataset.opp) {
      etat.oppId = bouton.dataset.opp;
      rendre();
    } else if (bouton.dataset.vehicule) {
      etat.vehiculeId = bouton.dataset.vehicule;
      rendre();
    } else if (bouton.dataset.pageVehicules) {
      pageVehicules = Number(bouton.dataset.pageVehicules);
      rendreVehicules();
      zone("pagination-vehicules").querySelector('[aria-current="page"]').focus();
    } else if (bouton.dataset.offre) {
      etat.offre = bouton.dataset.offre;
      rendre();
    } else if (bouton.dataset.aller) {
      allerA(Number(bouton.dataset.aller));
    } else if (bouton.hasAttribute("data-suivant")) {
      allerA(etat.etape + 1);
    } else if (bouton.hasAttribute("data-precedent")) {
      // Depuis l'étape 1, « Précédent » ramène à la liste des soumissions.
      if (etat.etape === 1) {
        window.location.href = urlListe;
      } else {
        allerA(etat.etape - 1);
      }
    } else if (bouton.hasAttribute("data-creer")) {
      creer();
    } else if (bouton.hasAttribute("data-recommencer")) {
      recommencer();
    }
  });
  rechercheClient.addEventListener("input", rendreClients);
  // Une nouvelle recherche repart de la première page.
  rechercheVehicule.addEventListener("input", function () {
    pageVehicules = 1;
    rendreVehicules();
  });

  // ---------- Présélection depuis une opportunité ou une fiche prospect (?opportunite= ou ?prospect=) ----------
  var oppDemandee = null;
  if (racine.dataset.opportunite) oppDemandee = P.opportunite(racine.dataset.opportunite);
  if (oppDemandee) {
    etat.prospectId = oppDemandee.prospectId;
    if (P.estActive(oppDemandee)) etat.oppId = oppDemandee.id;
  } else if (racine.dataset.prospect && P.contact(racine.dataset.prospect)) {
    choisirProspect(racine.dataset.prospect);
  }
  rendre();
})();
