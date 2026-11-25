// Assistant « Nouveau rendez-vous » (et replanification) : 1. client et contexte, 2. type, 3. planification, 4. véhicule,
// puis écran « Rendez-vous créé ». Appelé par Views/RendezVous/Nouveau.cshtml.
// Lit et écrit les données de démonstration via window.RendezVous, window.Prospects et window.Soumissions ; rien n'est envoyé au serveur.
(function () {
  "use strict";

  // ---------- Réglages ----------
  // Durée proposée selon le type (modifiable dans « Durée, lieu, conseiller et objectif »).
  var DUREES_PAR_TYPE = {
    PremiereRencontre: 30,
    Consultation: 45,
    PresentationVehicule: 45,
    EssaiRoutier: 45,
    DiscussionSoumission: 30,
    Negociation: 45,
    Financement: 30,
    Livraison: 30,
    SuiviApresVente: 30,
    Autre: 30,
  };
  var NB_CRENEAUX = 4; // créneaux libres proposés en tuiles
  var CRENEAUX_PAR_JOUR = 2; // pour proposer plusieurs jours plutôt qu'un seul après-midi
  var ECART_MINUTES = 120; // écart minimal entre deux créneaux proposés le même jour
  var PAS_MINUTES = 30; // les créneaux commencent à l'heure ou à la demie
  var JOURS_RECHERCHE = 7; // nombre de jours parcourus pour trouver des créneaux libres
  var VEHICULES_PAR_PAGE = 8;

  var R = window.RendezVous;
  var P = window.Prospects;
  var S = window.Soumissions;
  var UI = window.RendezVousUI;
  var racine = document.getElementById("parcours");
  if (!R || !P || !S || !UI || !racine) return;
  var esc = P.esc;

  var etat = {
    etape: 1,
    etapeMax: 1,
    prospectId: null,
    oppId: null,
    soumissionId: null,
    type: null,
    vehiculeId: null,
    creneau: null, // clé de la tuile choisie (« 2026-11-19T14:00 ») ou « autre »
    chevauchementAccepte: false,
  };
  var pageVehicules = 1;
  var ancien = racine.dataset.replanifier ? R.rdv(racine.dataset.replanifier) : null;
  var form = document.getElementById("form-planification");
  var assistant = racine.querySelector("[data-assistant]");
  var ecranFin = racine.querySelector("[data-fin]");
  var aide = racine.querySelector("[data-aide]");
  var boutonSuivant = racine.querySelector("[data-suivant]");
  var boutonCreer = racine.querySelector("[data-creer]");
  var rechercheClient = document.getElementById("n-recherche-client");
  var rechercheVehicule = document.getElementById("n-recherche-vehicule");
  var urlAgenda = racine.querySelector(".nr-retour").href;

  function zone(nom) {
    return racine.querySelector('[data-zone="' + nom + '"]');
  }
  // Minuscules sans accents, pour que « helene » trouve « Hélène ».
  function normaliser(texte) {
    return String(texte || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  function exigeVehicule() {
    return etat.type === "EssaiRoutier";
  }
  function deuxChiffres(nombre) {
    return String(nombre).padStart(2, "0");
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
    // Démonstration seulement (fonctionnalité 19) : un dossier enregistré n'est jamais proposé, pour qu'aucun élément fictif ne
    // soit rattaché à une opportunité réelle (il apparaîtrait sur sa fiche et dans ses recommandations).
    P.contacts().forEach(function (contact) {
      if (contact.enregistre) return;
      var texte = normaliser(contact.prenom + " " + contact.nom + " " + (contact.courriel || "") + " " + (contact.telephone || ""));
      if (recherche === "" || texte.indexOf(recherche) >= 0) clients.push(contact);
    });
    clients.sort(comparerClients);

    if (clients.length === 0) {
      zone("clients").innerHTML = '<p class="nr-vide-texte">Aucun prospect ne correspond.</p>';
      return;
    }
    var html = "";
    clients.forEach(function (contact) {
      var choisi = contact.id === etat.prospectId;
      var coordonnee = contact.courriel || contact.telephone || "Aucune coordonnée";
      html +=
        '<button type="button" role="radio" aria-checked="' + choisi + '" class="nr-client' + (choisi ? " is-choisi" : "") + '" data-prospect="' + esc(contact.id) + '">' +
        '<span class="nr-avatar" aria-hidden="true">' + esc(P.initiales(contact)) + "</span>" +
        '<span class="nr-client-id"><strong>' + esc(contact.prenom + " " + contact.nom) + "</strong><span>" + esc(coordonnee) + "</span></span>" +
        (choisi ? '<i class="bi bi-check-lg nr-coche" aria-hidden="true"></i>' : "") +
        "</button>";
    });
    zone("clients").innerHTML = html;
  }

  // ---------- Étape 1 : opportunité et soumission associée ----------
  function ligneDetail(titre, valeur) {
    var texte = '<span class="nr-attenue">À préciser</span>';
    if (valeur) texte = esc(valeur);
    return "<div><dt>" + esc(titre) + "</dt><dd>" + texte + "</dd></div>";
  }

  function pilule(attribut, valeur, texte, choisie) {
    return '<button type="button" role="radio" aria-checked="' + choisie + '" class="nr-pilule-choix' + (choisie ? " is-choisi" : "") + '" ' + attribut + '="' + esc(valeur) + '">' + esc(texte) + "</button>";
  }

  // Soumission facultative : si elle porte un véhicule, il sera proposé à l'étape 4.
  function htmlSoumissions() {
    var html = '<p class="nr-label nr-label-petit">Soumission associée (facultative)</p><div class="nr-pilules" role="radiogroup" aria-label="Soumission associée">';
    html += pilule("data-soumission", "", "Aucune", !etat.soumissionId);
    S.parOpportunite(etat.oppId).forEach(function (soumission) {
      var version = S.versionCourante(soumission);
      var texte = soumission.reference + " · " + S.libelleStatut(version.statut);
      html += pilule("data-soumission", soumission.id, texte, soumission.id === etat.soumissionId);
    });
    return html + "</div>";
  }

  // Opportunité utilisable : active, ou gagnée pour un suivi après-vente (relation après la vente).
  function selectionnable(opp) {
    if (!opp) return false;
    if (P.estActive(opp)) return true;
    return opp.etape === "Gagne" && etat.type === "SuiviApresVente";
  }

  function rendreOpportunite() {
    var cible = zone("opportunite");
    if (!etat.prospectId) {
      cible.innerHTML = '<div class="nr-vide"><i class="bi bi-person"></i><span>Choisissez d\'abord un prospect.</span></div>';
      return;
    }

    var contact = P.contact(etat.prospectId);
    var actives = P.opportunitesDe(etat.prospectId).filter(selectionnable);
    var html = '<h3 class="nr-opp-nom">' + esc(contact.prenom + " " + contact.nom) + "</h3>";
    if (actives.length === 0) {
      cible.innerHTML = html + '<p class="nr-vide-texte">Ce prospect n\'a aucune opportunité active. Créez-en une depuis sa fiche.</p>';
      return;
    }
    if (actives.length > 1) {
      html += '<div class="nr-pilules" role="radiogroup" aria-label="Opportunité">';
      actives.forEach(function (opp) {
        var titre = opp.titre;
        if (!P.estActive(opp)) titre += " (suivi après-vente)";
        html += pilule("data-opp", opp.id, titre, opp.id === etat.oppId);
      });
      html += "</div>";
    }

    var opp = etat.oppId ? P.opportunite(etat.oppId) : null;
    if (!opp) {
      cible.innerHTML = html + '<p class="nr-vide-texte">Choisissez l\'opportunité concernée.</p>';
      return;
    }

    var conseiller = P.conseiller(contact.conseillerId);
    var nomConseiller = conseiller.nom;
    if (conseiller.moi) nomConseiller += " (moi)";
    var aVenir = 0;
    R.parOpportunite(opp.id).forEach(function (r) {
      if (R.estActif(r) && R.fin(r) >= new Date()) aVenir++;
    });

    html += '<dl class="nr-details-opp">' +
      ligneDetail("Recherche", P.resumeVehicule(opp)) +
      ligneDetail("Étape", P.libelleEtape(opp.etape)) +
      ligneDetail("Budget", P.resumeBudget(opp.qualification || {})) +
      ligneDetail("Conseiller", nomConseiller) +
      ligneDetail("Contact préféré", UI.moyenPrefere(contact));
    if (aVenir > 0) html += ligneDetail("Rendez-vous à venir", String(aVenir));
    html += "</dl>" + htmlSoumissions();
    cible.innerHTML = html;
  }

  // ---------- Étape 2 : type ----------
  function rendreTypes() {
    var html = "";
    R.ref.types.forEach(function (type) {
      var choisi = type.cle === etat.type;
      var note = "";
      if (type.cle === "EssaiRoutier") note = "Véhicule obligatoire";
      if (type.cle === "Financement" || type.cle === "Livraison") note = "Événement d'agenda seulement";
      html +=
        '<button type="button" role="radio" aria-checked="' + choisi + '" class="nr-tuile' + (choisi ? " is-choisi" : "") + '" data-type="' + esc(type.cle) + '">' +
        "<strong>" + esc(type.libelle) + "</strong><span>" + (DUREES_PAR_TYPE[type.cle] || 30) + " min</span>" +
        (note ? "<small>" + esc(note) + "</small>" : "") + "</button>";
    });
    zone("types").innerHTML = html;
  }

  // ---------- Étape 3 : planification ----------
  // Créneau lu dans le formulaire (date, heure, durée), ou null s'il est incomplet.
  function creneau() {
    var date = form.elements.date.value;
    var heure = form.elements.heure.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(heure)) return null;
    var morceauxDate = date.split("-");
    var morceauxHeure = heure.split(":");
    var debut = new Date(+morceauxDate[0], +morceauxDate[1] - 1, +morceauxDate[2], +morceauxHeure[0], +morceauxHeure[1]);
    if (isNaN(debut)) return null;
    return { debut: debut, dureeMinutes: Number(form.elements.duree.value) };
  }
  function modeChoisi() {
    var coche = form.querySelector('input[name="mode"]:checked');
    return coche ? coche.value : null;
  }
  function conflitsPour(debut, dureeMinutes) {
    return R.conflits({
      id: null,
      exclure: ancien ? ancien.id : null,
      debut: debut,
      dureeMinutes: dureeMinutes,
      conseillerId: form.elements.conseiller.value,
      vehiculeId: etat.vehiculeId,
    });
  }
  function verification() {
    var c = creneau();
    if (!c) return null;
    return conflitsPour(c.debut, c.dureeMinutes);
  }

  // Clé d'une tuile de créneau : « 2026-11-19T14:00 ».
  function cleCreneau(date) {
    return P.versChampDate(date) + "T" + deuxChiffres(date.getHours()) + ":" + deuxChiffres(date.getMinutes());
  }

  // Premiers créneaux libres pour le conseiller (et le véhicule déjà choisi), répartis sur plusieurs jours.
  function creneauxLibres() {
    var duree = Number(form.elements.duree.value);
    var maintenant = new Date();
    var trouves = [];

    for (var jour = 0; jour < JOURS_RECHERCHE && trouves.length < NB_CRENEAUX; jour++) {
      var date = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() + jour);
      var duJour = 0;
      var dernier = null;
      for (var minutes = R.heureOuverture * 60; minutes + duree <= R.heureFermeture * 60; minutes += PAS_MINUTES) {
        if (trouves.length === NB_CRENEAUX || duJour === CRENEAUX_PAR_JOUR) break;
        var debut = new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(minutes / 60), minutes % 60);
        // Au moins 30 minutes pour se préparer avant un rendez-vous d'aujourd'hui.
        if (debut.getTime() < maintenant.getTime() + 30 * 60000) continue;
        if (dernier && debut.getTime() - dernier.getTime() < ECART_MINUTES * 60000) continue;
        var conflits = conflitsPour(debut, duree);
        if (conflits.passe || conflits.conseiller.length > 0 || conflits.vehicule.length > 0) continue;
        trouves.push(debut);
        dernier = debut;
        duJour++;
      }
    }
    return trouves;
  }

  function rendreCreneaux() {
    var libres = creneauxLibres();
    var cles = libres.map(cleCreneau);
    // Le créneau choisi n'est plus proposé (durée ou conseiller modifié) : on le garde en « Autre moment ».
    if (etat.creneau && etat.creneau !== "autre" && cles.indexOf(etat.creneau) < 0) etat.creneau = "autre";

    var html = "";
    libres.forEach(function (debut) {
      var cle = cleCreneau(debut);
      var choisi = cle === etat.creneau;
      html +=
        '<button type="button" role="radio" aria-checked="' + choisi + '" class="nr-tuile' + (choisi ? " is-choisi" : "") + '" data-creneau="' + cle + '">' +
        "<strong>" + esc(R.jourTexte(debut)) + "</strong><span>" + esc(R.heure(debut)) + "</span></button>";
    });
    var autre = etat.creneau === "autre";
    html +=
      '<button type="button" role="radio" aria-checked="' + autre + '" class="nr-tuile' + (autre ? " is-choisi" : "") + '" data-creneau="autre">' +
      "<strong>Autre moment</strong><span>Choisir la date et l'heure</span></button>";
    zone("creneaux").innerHTML = html;
    zone("autre-moment").hidden = !autre;
    if (libres.length === 0) {
      zone("creneaux").insertAdjacentHTML("afterbegin", '<p class="nr-vide-texte nr-pleine-largeur">Aucun créneau libre dans les ' + JOURS_RECHERCHE + " prochains jours : choisissez un autre moment.</p>");
    }
    rendreVerification();
  }

  function choisirCreneau(cle) {
    etat.creneau = cle;
    etat.chevauchementAccepte = false;
    if (cle !== "autre") {
      var morceaux = cle.split("T");
      form.elements.date.value = morceaux[0];
      form.elements.heure.value = morceaux[1];
    }
    aide.textContent = "";
    rendre();
  }

  // Heure de fin et conflits du créneau saisi (les créneaux proposés n'en ont pas, sauf « Autre moment »).
  function rendreVerification() {
    var c = creneau();
    var cible = zone("verification");
    var fin = null;
    if (c) fin = new Date(c.debut.getTime() + c.dureeMinutes * 60000);

    var texteFin = "—";
    if (fin) {
      texteFin = R.heure(fin);
      if (!R.memeJour(fin, c.debut)) texteFin += " (le lendemain)";
    }
    document.getElementById("p-fin").textContent = texteFin;

    if (!c || !etat.creneau) {
      cible.innerHTML = "";
      return;
    }
    var conflits = verification();
    var lignes = [];
    if (conflits.passe) lignes.push({ niveau: "critique", texte: "Le créneau sélectionné est dans le passé." });
    conflits.conseiller.forEach(function (r) {
      lignes.push({ niveau: "attention", texte: "Le conseiller a déjà un rendez-vous de " + R.plage(r) + " (" + UI.nomClient(r) + ", " + R.type(r.type).libelle.toLowerCase() + ")." });
    });
    if (etat.vehiculeId) {
      conflits.vehicule.forEach(function (r) {
        lignes.push({ niveau: "critique", texte: "Le véhicule choisi est déjà prévu de " + R.plage(r) + " (" + UI.nomClient(r) + ")." });
      });
    }

    var html = '<p class="nr-creneau-texte">' + esc(R.jourTexte(c.debut)) + ", " + esc(R.heure(c.debut)) + " à " + esc(R.heure(fin)) + "</p>";
    if (lignes.length > 0) {
      html += UI.alertes(lignes);
    } else {
      html += '<p class="nr-ok"><i class="bi bi-check-circle-fill"></i>Aucun conflit dans l\'agenda de démonstration.</p>';
    }
    if (conflits.conseiller.length > 0) {
      html += '<label class="nr-case"><input type="checkbox" id="p-chevauchement"' + (etat.chevauchementAccepte ? " checked" : "") + " />" +
        "Je confirme vouloir planifier ce chevauchement (exceptionnel).</label>";
    }
    cible.innerHTML = html;
  }

  // Créneau proposé à l'ouverture : la date demandée dans l'adresse, sinon la prochaine demi-heure.
  function dateParDefaut() {
    var demandee = null;
    if (racine.dataset.date && /^\d{4}-\d{2}-\d{2}$/.test(racine.dataset.date)) demandee = racine.dataset.date;
    var maintenant = new Date();
    if (demandee && demandee !== P.aujourdhuiChamp()) return { date: demandee, heure: "10:00" };

    var dans30 = new Date(maintenant.getTime() + 30 * 60000);
    var minutes = dans30.getMinutes() < 30 ? 30 : 60;
    var debut = new Date(dans30.getFullYear(), dans30.getMonth(), dans30.getDate(), dans30.getHours(), minutes);
    if (debut.getHours() >= R.heureFermeture || !R.memeJour(debut, maintenant)) {
      var demain = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() + 1, 9, 0);
      return { date: P.versChampDate(demain), heure: "09:00" };
    }
    return { date: P.versChampDate(debut), heure: deuxChiffres(debut.getHours()) + ":" + deuxChiffres(debut.getMinutes()) };
  }

  // Le lieu par défaut de la concession suit le moyen « En concession ».
  function definirMode(mode) {
    var bouton = document.getElementById("p-mode-" + mode);
    if (bouton) bouton.checked = true;
    var lieu = form.elements.lieu;
    if (mode === "concession" && !lieu.value) lieu.value = R.lieuParDefaut;
    if (mode !== "concession" && lieu.value === R.lieuParDefaut) lieu.value = "";
  }

  // ---------- Étape 4 : véhicule ----------
  function vehiculeSoumission() {
    var soumission = etat.soumissionId ? S.soumission(etat.soumissionId) : null;
    if (!soumission) return null;
    return S.versionCourante(soumission).vehicule.id;
  }

  // Véhicule de la soumission d'abord, puis les sélectionnables, puis le moins cher.
  function comparerVehicules(a, b) {
    var deSoumission = vehiculeSoumission();
    if (a.id === deSoumission && b.id !== deSoumission) return -1;
    if (b.id === deSoumission && a.id !== deSoumission) return 1;
    var aOk = R.etatVehicule(a, etat.type, vehiculeSoumission()).selectionnable;
    var bOk = R.etatVehicule(b, etat.type, vehiculeSoumission()).selectionnable;
    if (aOk && !bOk) return -1;
    if (bOk && !aOk) return 1;
    return a.prixDemande - b.prixDemande;
  }

  function listeVehicules() {
    var recherche = normaliser(rechercheVehicule.value.trim());
    var liste = [];
    S.inventaire().forEach(function (vehicule) {
      var texte = normaliser([vehicule.marque, vehicule.modele, vehicule.version, vehicule.annee, vehicule.numeroStock].join(" "));
      if (recherche === "" || texte.indexOf(recherche) >= 0) liste.push(vehicule);
    });
    return liste.sort(comparerVehicules);
  }

  // Raison pour laquelle un véhicule ne peut pas être choisi (ou mérite une remarque), sinon "".
  function raisonVehicule(vehicule, conflitsVehicule) {
    var etatVehicule = R.etatVehicule(vehicule, etat.type, vehiculeSoumission());
    if (!etatVehicule.selectionnable) return etatVehicule.message;
    if (conflitsVehicule.length > 0) {
      var plages = conflitsVehicule.map(function (r) { return R.plage(r) + " (" + UI.nomClient(r) + ")"; });
      return "Déjà prévu de " + plages.join(", ") + " : non sélectionnable sur ce créneau.";
    }
    if (etatVehicule.niveau === "attention") return etatVehicule.message;
    return "";
  }

  function rendrePaginationVehicules(total, nbPages) {
    var cible = zone("pagination-vehicules");
    cible.hidden = nbPages <= 1;
    if (nbPages <= 1) return;
    var debut = (pageVehicules - 1) * VEHICULES_PAR_PAGE + 1;
    var fin = Math.min(total, pageVehicules * VEHICULES_PAR_PAGE);
    var html = '<span class="nr-pages-info">' + debut + " à " + fin + " sur " + total + '</span><div class="nr-pages">';
    html += '<button type="button" class="nr-page-btn" data-page-vehicules="' + (pageVehicules - 1) + '"' + (pageVehicules === 1 ? " disabled" : "") + ' aria-label="Page précédente"><i class="bi bi-chevron-left"></i></button>';
    for (var page = 1; page <= nbPages; page++) {
      var courante = page === pageVehicules;
      html += '<button type="button" class="nr-page-btn' + (courante ? " is-active" : "") + '" data-page-vehicules="' + page + '"' +
        (courante ? ' aria-current="page"' : "") + ' aria-label="Page ' + page + '">' + page + "</button>";
    }
    html += '<button type="button" class="nr-page-btn" data-page-vehicules="' + (pageVehicules + 1) + '"' + (pageVehicules === nbPages ? " disabled" : "") + ' aria-label="Page suivante"><i class="bi bi-chevron-right"></i></button></div>';
    cible.innerHTML = html;
  }

  function rendreVehicules() {
    var opp = P.opportunite(etat.oppId);
    var rappel = exigeVehicule() ? "Essai routier : un véhicule est obligatoire." : "Véhicule facultatif pour ce type de rendez-vous.";
    if (opp && P.resumeVehicule(opp)) rappel += " Besoin : " + P.resumeVehicule(opp) + ".";
    zone("rappel-vehicule").textContent = rappel;

    var c = creneau();
    var deSoumission = vehiculeSoumission();
    var liste = listeVehicules();
    var nbPages = Math.max(1, Math.ceil(liste.length / VEHICULES_PAR_PAGE));
    if (pageVehicules > nbPages) pageVehicules = nbPages;
    var visibles = liste.slice((pageVehicules - 1) * VEHICULES_PAR_PAGE, pageVehicules * VEHICULES_PAR_PAGE);

    var html = "";
    if (!exigeVehicule()) {
      var aucun = !etat.vehiculeId;
      html += '<button type="button" role="radio" aria-checked="' + aucun + '" class="nr-tuile' + (aucun ? " is-choisi" : "") + '" data-vehicule="">' +
        "<strong>Aucun véhicule</strong><span>Le rendez-vous ne porte pas sur un véhicule précis.</span></button>";
    }
    visibles.forEach(function (vehicule) {
      var conflitsVehicule = [];
      if (c) {
        conflitsVehicule = R.conflits({ exclure: ancien ? ancien.id : null, debut: c.debut, dureeMinutes: c.dureeMinutes, conseillerId: "__aucun", vehiculeId: vehicule.id }).vehicule;
      }
      var bloque = !R.etatVehicule(vehicule, etat.type, vehiculeSoumission()).selectionnable || conflitsVehicule.length > 0;
      var choisi = vehicule.id === etat.vehiculeId;
      var raison = raisonVehicule(vehicule, conflitsVehicule);

      html += '<button type="button" role="radio" aria-checked="' + choisi + '" class="nr-tuile' + (choisi ? " is-choisi" : "") + '" data-vehicule="' + esc(vehicule.id) + '"' +
        (bloque ? ' disabled aria-disabled="true"' : "") + ">" +
        "<strong>" + esc(vehicule.marque + " " + vehicule.modele + " " + vehicule.annee) + "</strong>" +
        "<span>" + esc(P.argent(vehicule.prixDemande)) + "</span>";
      if (vehicule.id === deSoumission) html += '<small class="nr-pertinence">Véhicule de la soumission</small>';
      if (raison) html += '<small class="nr-avertissement">' + esc(raison) + "</small>";
      html += "</button>";
    });
    zone("vehicules").innerHTML = html;
    rendrePaginationVehicules(liste.length, nbPages);
  }

  // ---------- Navigation entre les étapes ----------
  // Message d'erreur qui empêche de quitter l'étape, ou null (mêmes règles qu'avant la refonte).
  function erreurEtape(numero) {
    if (numero === 1 && !etat.prospectId) return "Choisissez un prospect.";
    if (numero === 1 && !etat.oppId) return "Choisissez une opportunité active.";
    if (numero === 2 && !etat.type) return "Choisissez le type de rendez-vous.";
    if (numero === 3) {
      if (!etat.creneau) return "Choisissez un créneau.";
      var c = creneau();
      var messageDate = form.querySelector('[data-message="date"]');
      messageDate.textContent = "";
      if (!c) return "Indiquez une date et une heure valides.";
      if (!modeChoisi()) return "Choisissez le moyen de rencontre.";
      var conflits = verification();
      if (conflits.passe) {
        messageDate.textContent = "Le créneau est dans le passé.";
        return "Le créneau sélectionné est dans le passé.";
      }
      if (conflits.conseiller.length > 0 && !etat.chevauchementAccepte) return "Corrigez le créneau ou confirmez explicitement le chevauchement.";
    }
    if (numero === 4) {
      if (exigeVehicule() && !etat.vehiculeId) return "Un essai routier exige un véhicule.";
      if (etat.vehiculeId) {
        if (!R.etatVehicule(S.vehicule(etat.vehiculeId), etat.type, vehiculeSoumission()).selectionnable) return "Ce véhicule n'est pas disponible.";
        var verif = verification();
        if (verif && verif.vehicule.length > 0) return "Ce véhicule est déjà prévu sur ce créneau.";
      }
    }
    return null;
  }

  // Le bouton « Suivant » reste grisé tant que rien n'est choisi à l'étape courante.
  function etapeChoisie(numero) {
    if (numero === 1) return Boolean(etat.prospectId && etat.oppId);
    if (numero === 2) return Boolean(etat.type);
    if (numero === 3) return Boolean(etat.creneau);
    if (numero === 4) return !exigeVehicule() || Boolean(etat.vehiculeId);
    return false;
  }

  function allerA(numero) {
    for (var i = 1; i < numero; i++) {
      var erreur = erreurEtape(i);
      if (erreur) {
        aide.textContent = erreur;
        numero = i;
        break;
      }
    }
    if (numero === etat.etape && aide.textContent) {
      rendre();
      return;
    }
    aide.textContent = "";
    etat.etape = numero;
    etat.etapeMax = Math.max(etat.etapeMax, numero);
    rendre();
    // Place le focus clavier au début de la nouvelle étape.
    var section = racine.querySelector('[data-etape="' + numero + '"]');
    section.setAttribute("tabindex", "-1");
    section.focus({ preventScroll: true });
  }

  function rendreEtapes() {
    racine.querySelectorAll(".nr-etapes li").forEach(function (li, index) {
      var numero = index + 1;
      var courante = numero === etat.etape;
      var faite = numero < etat.etape;
      li.classList.toggle("is-courante", courante);
      li.classList.toggle("is-faite", faite);

      var bouton = li.querySelector("button");
      // En replanification, le client et le type sont fixés.
      bouton.disabled = numero > etat.etapeMax || (ancien !== null && numero < 3);
      if (courante) {
        bouton.setAttribute("aria-current", "step");
      } else {
        bouton.removeAttribute("aria-current");
      }
      var pastille = li.querySelector(".nr-num");
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

    var derniere = etat.etape === 4;
    boutonSuivant.hidden = derniere;
    boutonCreer.hidden = !derniere;
    boutonSuivant.disabled = !etapeChoisie(etat.etape);
    boutonCreer.disabled = !etapeChoisie(4);

    var pourClient = "";
    if (etat.prospectId) pourClient = "Pour " + UI.nomClient({ prospectId: etat.prospectId });
    [2, 3, 4].forEach(function (numero) {
      zone("pour-client-" + numero).textContent = pourClient;
    });

    if (etat.etape === 1) {
      rendreClients();
      rendreOpportunite();
    }
    if (etat.etape === 2) rendreTypes();
    if (etat.etape === 3) rendreCreneaux();
    if (etat.etape === 4) rendreVehicules();
  }

  // Un changement de contexte oblige à repasser par les étapes suivantes.
  function reinitialiserApres(numero) {
    etat.etapeMax = Math.min(etat.etapeMax, numero);
  }

  // ---------- Création et écran final ----------
  function ligneRecap(titre, valeur) {
    return "<div><dt>" + esc(titre) + "</dt><dd>" + esc(valeur) + "</dd></div>";
  }

  function creer() {
    for (var numero = 1; numero <= 4; numero++) {
      var erreur = erreurEtape(numero);
      if (erreur) {
        if (numero !== etat.etape) allerA(numero);
        aide.textContent = erreur;
        return;
      }
    }
    var c = creneau();
    var donnees = {
      prospectId: etat.prospectId,
      opportuniteId: etat.oppId,
      soumissionId: etat.soumissionId,
      vehiculeId: etat.vehiculeId,
      conseillerId: form.elements.conseiller.value,
      type: etat.type,
      debut: c.debut,
      dureeMinutes: c.dureeMinutes,
      mode: modeChoisi(),
      lieu: form.elements.lieu.value.trim(),
      objectif: form.elements.objectif.value.trim(),
      commentaire: form.elements.commentaire.value.trim(),
      chevauchementAccepte: etat.chevauchementAccepte && verification().conseiller.length > 0,
    };

    var rdv = null;
    if (ancien) {
      rdv = R.replanifier(ancien.id, donnees);
    } else {
      rdv = R.planifier(donnees);
    }
    if (!rdv) {
      // Motif exact du refus (fonctionnalité 16) : une création n'est jamais une « replanification ».
      var motif = R.invalide(donnees);
      if (ancien && !R.peutReplanifier(ancien)) motif = "Ce rendez-vous ne peut plus être replanifié.";
      aide.textContent = motif || "Rendez-vous non créé : vérifiez les informations.";
      return;
    }

    var vehicule = rdv.vehiculeId ? S.vehicule(rdv.vehiculeId) : null;
    zone("recap").innerHTML =
      ligneRecap("Client", UI.nomClient(rdv)) +
      ligneRecap("Type", R.type(rdv.type).libelle) +
      ligneRecap("Planification", R.creneauTexte(rdv)) +
      ligneRecap("Véhicule", vehicule ? S.nomVehicule(vehicule) : "Aucun");
    racine.querySelector("[data-ouvrir]").href = R.urlDetail(rdv.id) + "#apercu";
    assistant.hidden = true;
    ecranFin.hidden = false;
    ecranFin.focus();
  }

  // ---------- Événements ----------
  racine.addEventListener("click", function (e) {
    var bouton = e.target.closest("button");
    if (!bouton || bouton.disabled) return;

    if (bouton.dataset.prospect) {
      if (etat.prospectId !== bouton.dataset.prospect) {
        etat.prospectId = bouton.dataset.prospect;
        var actives = P.opportunitesDe(etat.prospectId).filter(selectionnable);
        etat.oppId = actives.length === 1 ? actives[0].id : null;
        etat.soumissionId = null;
        reinitialiserApres(1);
      }
      aide.textContent = "";
      rendre();
    } else if (bouton.dataset.opp) {
      if (etat.oppId !== bouton.dataset.opp) {
        etat.oppId = bouton.dataset.opp;
        etat.soumissionId = null;
        reinitialiserApres(1);
      }
      aide.textContent = "";
      rendre();
    } else if (bouton.dataset.soumission !== undefined) {
      etat.soumissionId = bouton.dataset.soumission || null;
      // Le véhicule de la soumission est repris s'il est disponible.
      var vehiculeDeSoumission = vehiculeSoumission();
      if (vehiculeDeSoumission && R.etatVehicule(S.vehicule(vehiculeDeSoumission), etat.type, vehiculeSoumission()).selectionnable) etat.vehiculeId = vehiculeDeSoumission;
      rendre();
    } else if (bouton.dataset.type) {
      etat.type = bouton.dataset.type;
      // Une vente gagnée n'accepte qu'un suivi après-vente.
      if (etat.oppId && !selectionnable(P.opportunite(etat.oppId))) etat.oppId = null;
      form.elements.duree.value = String(DUREES_PAR_TYPE[etat.type] || 30);
      var gardeVehicule = etat.type === "EssaiRoutier" || R.avecVehicule.indexOf(etat.type) >= 0 || vehiculeSoumission();
      if (!gardeVehicule) etat.vehiculeId = null;
      reinitialiserApres(2);
      aide.textContent = "";
      rendre();
    } else if (bouton.dataset.creneau) {
      choisirCreneau(bouton.dataset.creneau);
    } else if (bouton.dataset.vehicule !== undefined) {
      etat.vehiculeId = bouton.dataset.vehicule || null;
      aide.textContent = "";
      rendre();
    } else if (bouton.dataset.pageVehicules) {
      pageVehicules = Number(bouton.dataset.pageVehicules);
      rendreVehicules();
      zone("pagination-vehicules").querySelector('[aria-current="page"]').focus();
    } else if (bouton.dataset.aller) {
      allerA(Number(bouton.dataset.aller));
    } else if (bouton.hasAttribute("data-suivant")) {
      allerA(etat.etape + 1);
    } else if (bouton.hasAttribute("data-precedent")) {
      // Depuis la première étape accessible, « Précédent » ramène à l'agenda.
      var premiere = ancien ? 3 : 1;
      if (etat.etape === premiere) {
        window.location.href = urlAgenda;
      } else {
        allerA(etat.etape - 1);
      }
    } else if (bouton.hasAttribute("data-creer")) {
      creer();
    }
  });

  rechercheClient.addEventListener("input", rendreClients);
  // Une nouvelle recherche de véhicule repart de la première page.
  rechercheVehicule.addEventListener("input", function () {
    pageVehicules = 1;
    rendreVehicules();
  });
  // La case de confirmation du chevauchement est dans la zone de vérification, rendue à part.
  zone("verification").addEventListener("change", function (e) {
    if (e.target.id !== "p-chevauchement") return;
    etat.chevauchementAccepte = e.target.checked;
    aide.textContent = "";
  });
  form.addEventListener("input", function (e) {
    if (["date", "heure", "duree", "conseiller"].indexOf(e.target.name) >= 0) etat.chevauchementAccepte = false;
    if (e.target.name === "mode") definirMode(e.target.value);
    rendreVerification();
  });
  // Durée ou conseiller modifiés : les créneaux libres changent.
  form.addEventListener("change", function (e) {
    if (e.target.name === "duree" || e.target.name === "conseiller") {
      etat.chevauchementAccepte = false;
      rendreCreneaux();
    }
  });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
  });

  // ---------- Préremplissage ----------
  var defaut = dateParDefaut();
  form.elements.date.value = defaut.date;
  form.elements.heure.value = defaut.heure;
  form.elements.duree.value = "45";
  form.elements.conseiller.value = P.moiId;
  form.elements.date.min = P.aujourdhuiChamp();
  definirMode("concession");
  // Une date demandée depuis l'agenda (bouton + d'un jour) ouvre directement le choix libre.
  if (racine.dataset.date && racine.dataset.date !== P.aujourdhuiChamp()) etat.creneau = "autre";

  // Type demandé dans l'adresse (ex. suivi après-vente depuis les relations clients), sauf en replanification.
  var typeExiste = R.ref.types.some(function (t) { return t.cle === racine.dataset.type; });
  if (racine.dataset.type && typeExiste && !ancien) {
    etat.type = racine.dataset.type;
    form.elements.duree.value = String(DUREES_PAR_TYPE[etat.type] || 30);
  }

  var depuisSoumission = racine.dataset.soumission ? S.soumission(racine.dataset.soumission) : null;
  var depuisOpportunite = racine.dataset.opportunite ? P.opportunite(racine.dataset.opportunite) : null;
  if (depuisOpportunite && P.estEnregistree(depuisOpportunite.id)) depuisOpportunite = null; // dossier réel : jamais présélectionné
  if (ancien) {
    // Replanification : tout est repris, seul le créneau change.
    etat.prospectId = ancien.prospectId;
    etat.oppId = ancien.opportuniteId;
    etat.soumissionId = ancien.soumissionId;
    etat.type = ancien.type;
    if (ancien.vehiculeId && R.etatVehicule(S.vehicule(ancien.vehiculeId), ancien.type, R.vehiculeAttendu(ancien.soumissionId)).selectionnable) etat.vehiculeId = ancien.vehiculeId;
    form.elements.duree.value = String(ancien.dureeMinutes);
    form.elements.conseiller.value = ancien.conseillerId;
    definirMode(ancien.mode);
    form.elements.lieu.value = ancien.lieu || "";
    form.elements.objectif.value = ancien.objectif || "";
    form.elements.commentaire.value = ancien.commentaire || "";
    var note = zone("replanification");
    note.hidden = false;
    note.innerHTML = '<i class="bi bi-arrow-repeat"></i><span>Replanification de « ' + esc(R.type(ancien.type).libelle) + " » avec " + esc(UI.nomClient(ancien)) +
      ". Ancien créneau : <strong>" + esc(R.creneauTexte(ancien)) + "</strong> (" + esc(R.statut(ancien.statut).libelle.toLowerCase()) + "). Il reste dans l'historique.</span>";
    etat.etape = 3;
    etat.etapeMax = 3;
    if (!R.peutReplanifier(ancien)) aide.textContent = "Ce rendez-vous a déjà été replanifié ou ne peut plus l'être.";
  } else if (depuisSoumission) {
    etat.prospectId = depuisSoumission.prospectId;
    var oppSoumission = P.opportunite(depuisSoumission.opportuniteId);
    if (oppSoumission && selectionnable(oppSoumission)) etat.oppId = oppSoumission.id;
    etat.soumissionId = depuisSoumission.id;
    var vehiculeSoumis = S.versionCourante(depuisSoumission).vehicule.id;
    if (R.etatVehicule(S.vehicule(vehiculeSoumis), etat.type, vehiculeSoumission()).selectionnable) etat.vehiculeId = vehiculeSoumis;
  } else if (depuisOpportunite) {
    etat.prospectId = depuisOpportunite.prospectId;
    if (selectionnable(depuisOpportunite)) etat.oppId = depuisOpportunite.id;
  } else if (racine.dataset.prospect && P.contact(racine.dataset.prospect) && !P.contact(racine.dataset.prospect).enregistre) {
    etat.prospectId = racine.dataset.prospect;
    var activesProspect = P.opportunitesDe(etat.prospectId).filter(selectionnable);
    if (activesProspect.length === 1) etat.oppId = activesProspect[0].id;
  }
  // Véhicule présélectionné (ex. essai depuis les recommandations de véhicules), s'il est sélectionnable.
  var vehiculeDemande = racine.dataset.vehicule ? S.vehicule(racine.dataset.vehicule) : null;
  if (vehiculeDemande && !ancien && R.etatVehicule(vehiculeDemande, etat.type).selectionnable) etat.vehiculeId = vehiculeDemande.id;
  rendre();
})();
