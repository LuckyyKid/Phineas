// Page publique d'un conseiller, en aperçu (Views/Relations/Recommande.cshtml) : accueil, parcours « Je recherche
// un véhicule » en 3 étapes, demande de rendez-vous et confirmation, sans rechargement de la page.
// Cette page ne lit AUCUNE donnée interne : seulement le profil public du conseiller. La demande est déposée dans une
// « boîte » de l'onglet (sessionStorage) ; l'espace conseiller la traite (relations-store.js, recevoirDemande) :
// attribution, doublons. Rien n'est envoyé ailleurs. Règles de validation : RelationsRegles.validerDemandePublique.
(function () {
  "use strict";

  var source = document.getElementById("profil-public");
  var Regles = window.RelationsRegles;
  if (!source || !Regles) return;

  // ---------- Réglages ----------
  var CLE_BOITE = "phineas.salesos.relations.v1:demandes-recues";
  var CLE_PROFIL = "phineas.salesos.relations.v1:profil-public";
  var ECRAN_ACCUEIL = "accueil";
  var ECRANS = ["accueil", "recherche", "rendez-vous", "confirmation"];
  var NB_ETAPES_RECHERCHE = 3;
  var TITRES_ETAPES = {
    1: "Parlons de votre prochain véhicule",
    2: "Qu'est-ce qui compte le plus pour vous ?",
    3: "Comment {prenom} pourra vous joindre ?",
  };
  var MOTS_IGNORES_MONOGRAMME = ["de", "du", "des", "la", "le", "les", "et", "l", "d"];
  var JOURS_COURTS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  var LIBELLES_CONTACT = { telephone: "Téléphone", courriel: "Courriel", texto: "Texto" };
  var MOYENS_REPONSE = { telephone: "par téléphone", courriel: "par courriel", texto: "par texto" };

  var profil = JSON.parse(source.textContent);
  var params = new URLSearchParams(window.location.search);
  var racine = document.getElementById("parcours");
  var formRecherche = document.getElementById("form-recherche");
  var formRdv = document.getElementById("form-rdv");
  var mouvementReduit = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Modifications locales du profil (présentation, coordonnées autorisées) faites dans l'espace conseiller.
  try {
    var local = JSON.parse(window.sessionStorage.getItem(CLE_PROFIL) || "null");
    if (local) {
      ["presentation", "telephone", "courriel", "langues", "formeRole", "anneeArrivee", "ville"].forEach(function (cle) {
        if (cle in local) profil[cle] = local[cle];
      });
    }
  } catch (e) {
    // Stockage indisponible (navigation privée) : on garde le profil transmis par le serveur.
  }

  // ---------- Profil du conseiller ----------
  var prenom = String(profil.nom || "").trim().split(/\s+/)[0] || "Votre conseiller";

  function initiales(texte) {
    var mots = String(texte || "").trim().split(/\s+/).filter(Boolean);
    return mots.slice(0, 2).map(function (m) { return m.charAt(0).toUpperCase(); }).join("");
  }

  // Monogramme de la concession : premières lettres des deux premiers mots utiles (« Auto Prestige Brossard » : AP).
  function monogramme(concession) {
    var mots = String(concession || "").split(/[\s'’-]+/).filter(function (m) {
      return m && MOTS_IGNORES_MONOGRAMME.indexOf(m.toLowerCase()) < 0;
    });
    return mots.slice(0, 2).map(function (m) { return m.charAt(0).toUpperCase(); }).join("");
  }

  // « Français et anglais » : les langues après la première passent en minuscules, comme en français courant.
  function texteLangues(langues) {
    var liste = (langues || []).map(function (l, i) { return i === 0 ? l : String(l).toLowerCase(); });
    if (liste.length < 2) return liste.join("");
    return liste.slice(0, -1).join(", ") + " et " + liste[liste.length - 1];
  }

  // Textes accordés selon la forme du rôle (« Conseillère aux ventes »…) ; sans forme choisie : formulation neutre.
  function textesRole() {
    var textes = profil.formesRole && profil.formesRole[profil.formeRole];
    return textes || profil.formeRoleNeutre;
  }

  // « Brossard (Québec) » devient « Brossard » : la carte de rappel du rendez-vous n'affiche que la ville.
  function villeSansProvince(ville) {
    return String(ville || "").replace(/\s*\(.*\)\s*$/, "").trim();
  }

  // Concession suivie de la ville quand elle est connue : « Auto Prestige Brossard, Brossard (Québec) ».
  function concessionEtVille(ville) {
    if (!ville) return profil.concession || "";
    return (profil.concession || "") + ", " + ville;
  }

  function remplirTexte(nom, texte) {
    racine.querySelectorAll('[data-pub="' + nom + '"]').forEach(function (el) { el.textContent = texte; });
  }

  function ligneCoordonnee(icone, texte) {
    var li = document.createElement("li");
    var i = document.createElement("i");
    i.className = "bi " + icone;
    i.setAttribute("aria-hidden", "true");
    var span = document.createElement("span");
    span.textContent = texte;
    li.appendChild(i);
    li.appendChild(span);
    return li;
  }

  function remplirProfil() {
    remplirTexte("nom", profil.nom || "");
    remplirTexte("prenom", prenom);
    var textes = textesRole();
    remplirTexte("role-long", textes.roleLong);
    remplirTexte("interlocuteur", textes.interlocuteur);
    remplirTexte("recommandation", textes.recommandation);
    // Sous le nom, sur la carte : l'ancienneté si elle est connue, sinon le rôle.
    var sousTitreCarte = textes.role;
    if (profil.anneeArrivee) sousTitreCarte = "À la concession depuis " + profil.anneeArrivee;
    remplirTexte("sous-titre-carte", sousTitreCarte);
    remplirTexte("concession-ville", concessionEtVille(villeSansProvince(profil.ville)));
    remplirTexte("concession", profil.concession || "");
    remplirTexte("initiales", initiales(profil.nom));
    remplirTexte("monogramme", monogramme(profil.concession));

    var presentation = String(profil.presentation || "").trim();
    racine.querySelectorAll('[data-pub="presentation"]').forEach(function (el) {
      el.textContent = presentation;
      el.hidden = !presentation;
    });

    // Seules les coordonnées que le conseiller a choisi d'afficher arrivent ici.
    var liste = racine.querySelector('[data-pub="coordonnees"]');
    liste.innerHTML = "";
    if ((profil.langues || []).length) liste.appendChild(ligneCoordonnee("bi-translate", texteLangues(profil.langues)));
    if (profil.telephone) liste.appendChild(ligneCoordonnee("bi-telephone", profil.telephone));
    if (profil.courriel) liste.appendChild(ligneCoordonnee("bi-envelope", profil.courriel));
    if (profil.concession) liste.appendChild(ligneCoordonnee("bi-geo-alt", concessionEtVille(profil.ville)));
  }

  // ---------- État des réponses ----------
  var recherche = nouvelleRecherche();
  var rdv = nouveauRdv();
  var etapeRecherche = 1;
  var derniereDemande = null; // résumé affiché sur l'écran de confirmation

  function nouvelleRecherche() {
    return { type: null, etat: null, horizon: null, criteres: [], contactPrefere: "telephone" };
  }

  function nouveauRdv() {
    return { typeRencontre: null, date: null, moment: null };
  }

  function reponsesDuFormulaire(form) {
    return form === formRdv ? rdv : recherche;
  }

  // ---------- Tuiles et pilules ----------
  // Choix unique (role radio) ou multiple (role checkbox), mémorisé dans l'état du formulaire concerné.
  function cocher(bouton, coche) {
    bouton.setAttribute("aria-checked", coche ? "true" : "false");
    bouton.classList.toggle("is-choisi", coche);
  }

  function synchroniserChoix(form) {
    var reponses = reponsesDuFormulaire(form);
    form.querySelectorAll("[data-choix-unique]").forEach(function (groupe) {
      var valeur = reponses[groupe.dataset.choixUnique];
      groupe.querySelectorAll("[data-valeur]").forEach(function (b) { cocher(b, b.dataset.valeur === valeur); });
    });
    form.querySelectorAll("[data-choix-multiple]").forEach(function (groupe) {
      var valeurs = reponses[groupe.dataset.choixMultiple] || [];
      groupe.querySelectorAll("[data-valeur]").forEach(function (b) { cocher(b, valeurs.indexOf(b.dataset.valeur) >= 0); });
    });
  }

  function choisir(bouton) {
    var form = bouton.closest("form");
    var reponses = reponsesDuFormulaire(form);
    var groupeUnique = bouton.closest("[data-choix-unique]");
    var groupeMultiple = bouton.closest("[data-choix-multiple]");
    if (groupeUnique) {
      reponses[groupeUnique.dataset.choixUnique] = bouton.dataset.valeur;
    } else if (groupeMultiple) {
      var liste = reponses[groupeMultiple.dataset.choixMultiple];
      var position = liste.indexOf(bouton.dataset.valeur);
      if (position >= 0) liste.splice(position, 1);
      else liste.push(bouton.dataset.valeur);
    }
    synchroniserChoix(form);
    mettreAJourBoutons();
    mettreAJourRappelRdv();
  }

  // ---------- Calendrier (demande de rendez-vous) ----------
  // Aucun créneau n'est proposé : on indique seulement un jour souhaité, à partir de demain.
  var aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);
  var moisAffiche = premierDuMoisCourant();

  function premierDuMoisCourant() {
    return new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), 1);
  }

  function memeJour(a, b) {
    return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function majuscule(texte) {
    return texte.charAt(0).toUpperCase() + texte.slice(1);
  }

  function texteDate(date) {
    return date.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" });
  }

  function boutonFleche(sens, libelle, icone, desactive) {
    return '<button type="button" class="pub-cal-fleche" data-mois="' + sens + '" aria-label="' + libelle + '"' + (desactive ? " disabled" : "") +
      '><i class="bi ' + icone + '" aria-hidden="true"></i></button>';
  }

  function rendreCalendrier() {
    var zone = racine.querySelector('[data-zone="calendrier"]');
    var annee = moisAffiche.getFullYear();
    var mois = moisAffiche.getMonth();
    var estMoisCourant = moisAffiche.getTime() === premierDuMoisCourant().getTime();
    var titre = majuscule(moisAffiche.toLocaleDateString("fr-CA", { month: "long", year: "numeric" }));

    var html = '<div class="pub-cal-tete">' +
      boutonFleche(-1, "Mois précédent", "bi-chevron-left", estMoisCourant) +
      '<p class="pub-cal-mois" aria-live="polite">' + titre + "</p>" +
      boutonFleche(1, "Mois suivant", "bi-chevron-right", false) + "</div>";

    html += '<div class="pub-cal-grille">';
    JOURS_COURTS.forEach(function (j) { html += '<span class="pub-cal-jour-nom" aria-hidden="true">' + j + "</span>"; });

    // Cases vides avant le premier jour du mois (la semaine commence le dimanche).
    var premierJour = new Date(annee, mois, 1).getDay();
    for (var vide = 0; vide < premierJour; vide++) html += '<span class="pub-cal-vide" aria-hidden="true"></span>';

    var nbJours = new Date(annee, mois + 1, 0).getDate();
    for (var jour = 1; jour <= nbJours; jour++) {
      var date = new Date(annee, mois, jour);
      var passe = date <= aujourdhui; // le jour même n'est pas proposé non plus
      var choisi = memeJour(date, rdv.date);
      html += '<button type="button" class="pub-cal-jour' + (choisi ? " is-choisi" : "") + '" data-jour="' + jour + '"' +
        ' aria-label="' + texteDate(date) + '" aria-pressed="' + (choisi ? "true" : "false") + '"' + (passe ? " disabled" : "") + ">" + jour + "</button>";
    }
    html += "</div>";
    zone.innerHTML = html;
  }

  function changerMois(sens) {
    var nouveau = new Date(moisAffiche.getFullYear(), moisAffiche.getMonth() + sens, 1);
    if (nouveau < premierDuMoisCourant()) return; // on ne remonte pas avant le mois en cours
    moisAffiche = nouveau;
    rendreCalendrier();
    var fleche = racine.querySelector('[data-mois="' + sens + '"]');
    if (fleche && !fleche.disabled) fleche.focus();
  }

  function choisirJour(jour) {
    rdv.date = new Date(moisAffiche.getFullYear(), moisAffiche.getMonth(), jour);
    rendreCalendrier();
    var bouton = racine.querySelector('[data-jour="' + jour + '"]');
    if (bouton) bouton.focus();
    mettreAJourBoutons();
    mettreAJourRappelRdv();
  }

  // Carte « Votre demande » : se remplit à mesure des choix ; ce qui manque est écrit en gris.
  function mettreAJourRappelRdv() {
    var lignes = [
      { cle: "typeRencontre", texte: rdv.typeRencontre, defaut: "À choisir" },
      { cle: "date", texte: rdv.date ? texteDate(rdv.date) : null, defaut: "À choisir" },
      { cle: "moment", texte: rdv.moment, defaut: "Sans préférence" },
    ];
    lignes.forEach(function (ligne) {
      var el = racine.querySelector('[data-rappel="' + ligne.cle + '"]');
      el.textContent = ligne.texte || ligne.defaut;
      el.classList.toggle("is-manquant", !ligne.texte);
    });
  }

  // ---------- Validation et états des boutons ----------
  function texteChamp(form, nom) {
    return String(form.elements[nom].value || "").trim();
  }

  // « Prénom et nom » dans un seul champ : le premier mot est le prénom, le reste le nom.
  function separerNom(nomComplet) {
    var mots = String(nomComplet || "").trim().split(/\s+/).filter(Boolean);
    return { prenom: mots[0] || "", nom: mots.slice(1).join(" ") };
  }

  function coordonneesCompletes(form, telephoneObligatoire) {
    var noms = separerNom(texteChamp(form, "nomComplet"));
    var aUnNom = noms.prenom !== "" && noms.nom !== "";
    var telephone = texteChamp(form, "telephone");
    var courriel = texteChamp(form, "courriel");
    var aUnContact = telephoneObligatoire ? telephone !== "" : telephone !== "" || courriel !== "";
    return aUnNom && aUnContact && form.elements.consentementContact.checked;
  }

  function etapeRechercheComplete(numero) {
    if (numero === 1) return !!recherche.type;
    if (numero === 2) return true; // étape entièrement facultative
    return coordonneesCompletes(formRecherche, false);
  }

  function mettreAJourBoutons() {
    racine.querySelector('[data-action="recherche-suivant"]').disabled = !etapeRechercheComplete(etapeRecherche);
    var rdvComplet = !!rdv.typeRencontre && !!rdv.date && coordonneesCompletes(formRdv, true);
    racine.querySelector('[data-action="rdv-envoyer"]').disabled = !rdvComplet;
  }

  // Erreurs renvoyées par RelationsRegles, affichées sous le champ concerné.
  function afficherErreurs(form, erreurs) {
    form.querySelectorAll("[data-erreur]").forEach(function (p) { p.hidden = true; p.textContent = ""; });
    form.querySelectorAll(".is-invalide").forEach(function (c) { c.classList.remove("is-invalide"); c.removeAttribute("aria-invalid"); });
    var champs = { prenom: "nomComplet", nom: "nomComplet", contact: "telephone", courriel: "courriel", telephone: "telephone" };
    Object.keys(erreurs).forEach(function (cle) {
      var nomChamp = champs[cle];
      if (!nomChamp) return;
      var champ = form.elements[nomChamp];
      champ.classList.add("is-invalide");
      champ.setAttribute("aria-invalid", "true");
      var message = form.querySelector('[data-erreur="' + nomChamp + '"]');
      message.textContent = erreurs[cle];
      message.hidden = false;
    });
    var premier = form.querySelector(".is-invalide");
    if (premier) premier.focus();
  }

  // ---------- Envoi (simulation dans l'onglet) ----------
  function nombreDepuisTexte(texte) {
    var chiffres = String(texte || "").replace(/[^\d]/g, "");
    var nombre = Number(chiffres);
    return chiffres && nombre > 0 ? nombre : null;
  }

  function deposerDansLaBoite(demande) {
    try {
      var boite = JSON.parse(window.sessionStorage.getItem(CLE_BOITE) || "[]");
      boite.push(demande);
      window.sessionStorage.setItem(CLE_BOITE, JSON.stringify(boite));
    } catch (e) {
      // Stockage indisponible : la démonstration continue, mais la demande ne sera pas reprise dans l'espace conseiller.
    }
  }

  // Champs communs attendus par recevoirDemande (relations-store.js).
  function demandeDeBase(form, contactPrefere) {
    var noms = separerNom(texteChamp(form, "nomComplet"));
    return {
      prenom: noms.prenom,
      nom: noms.nom,
      courriel: texteChamp(form, "courriel"),
      telephone: texteChamp(form, "telephone"),
      contactPrefere: contactPrefere,
      consentementContact: form.elements.consentementContact.checked,
      consentementInformation: form.elements.consentementInformation.checked,
      code: params.get("code") || profil.code,
      parrainage: params.get("p") || null,
      envoyeeLe: new Date().toISOString(),
    };
  }

  function envoyerRecherche() {
    var demande = demandeDeBase(formRecherche, recherche.contactPrefere);
    var marque = texteChamp(formRecherche, "marque");
    var typeConnu = recherche.type && recherche.type !== "Je ne sais pas encore";
    demande.vehicule = [typeConnu ? recherche.type : "", marque].filter(Boolean).join(" · ");
    demande.budget = nombreDepuisTexte(formRecherche.elements.budget.value);
    demande.horizon = recherche.horizon && recherche.horizon !== "inconnu" ? recherche.horizon : "";

    // Ce qui n'a pas de champ dans la fiche prospect est transmis dans le message.
    var precisions = [];
    if (recherche.etat) precisions.push("Neuf ou d'occasion : " + recherche.etat + ".");
    if (recherche.criteres.length) precisions.push("Ce qui compte : " + recherche.criteres.join(", ") + ".");
    var projet = texteChamp(formRecherche, "projet");
    if (projet) precisions.push(projet);
    demande.commentaire = precisions.join(" ");

    var erreurs = Regles.validerDemandePublique(demande);
    afficherErreurs(formRecherche, erreurs);
    if (Object.keys(erreurs).length) return;

    deposerDansLaBoite(demande);
    derniereDemande = {
      lignes: [
        ["Votre recherche", recherche.type || "Non précisée"],
        ["Ce qui compte pour vous", recherche.criteres.length ? recherche.criteres.join(", ") : "Non précisé"],
        ["Vos coordonnées", (demande.prenom + " " + demande.nom).trim()],
        ["Contact préféré", LIBELLES_CONTACT[recherche.contactPrefere]],
      ],
      prochaine: prenom + " lit votre demande, puis vous répond " + MOYENS_REPONSE[recherche.contactPrefere] + ".",
    };
    reinitialiserRecherche();
    aller("confirmation");
  }

  function envoyerRdv() {
    var demande = demandeDeBase(formRdv, "telephone");
    demande.vehicule = texteChamp(formRdv, "vehicule");
    demande.budget = null;
    demande.horizon = "";
    var moment = rdv.moment ? ", " + rdv.moment.toLowerCase() : "";
    // Même début qu'avant la refonte (« Souhaite un rendez-vous ») : l'espace conseiller le lit dans le message.
    demande.commentaire = "Souhaite un rendez-vous : " + rdv.typeRencontre + ", " + texteDate(rdv.date) + moment + ".";

    var erreurs = Regles.validerDemandePublique(demande);
    afficherErreurs(formRdv, erreurs);
    if (Object.keys(erreurs).length) return;

    deposerDansLaBoite(demande);
    var lignes = [
      ["Type de rencontre", rdv.typeRencontre],
      ["Moment souhaité", texteDate(rdv.date) + moment],
      ["Vos coordonnées", (demande.prenom + " " + demande.nom).trim()],
    ];
    if (demande.vehicule) lignes.push(["Véhicule envisagé", demande.vehicule]);
    derniereDemande = {
      lignes: lignes,
      prochaine: prenom + " vous appelle pour confirmer le rendez-vous et convenir d'une heure précise.",
    };
    reinitialiserRdv();
    aller("confirmation");
  }

  function reinitialiserRecherche() {
    formRecherche.reset();
    recherche = nouvelleRecherche();
    etapeRecherche = 1;
    afficherErreurs(formRecherche, {});
    synchroniserChoix(formRecherche);
  }

  function reinitialiserRdv() {
    formRdv.reset();
    rdv = nouveauRdv();
    moisAffiche = premierDuMoisCourant();
    afficherErreurs(formRdv, {});
    synchroniserChoix(formRdv);
    rendreCalendrier();
    mettreAJourRappelRdv();
  }

  function rendreConfirmation() {
    var resume = racine.querySelector('[data-zone="resume"]');
    resume.innerHTML = "";
    derniereDemande.lignes.forEach(function (ligne) {
      var div = document.createElement("div");
      var dt = document.createElement("dt");
      var dd = document.createElement("dd");
      dt.textContent = ligne[0];
      dd.textContent = ligne[1];
      div.appendChild(dt);
      div.appendChild(dd);
      resume.appendChild(div);
    });
    racine.querySelector('[data-zone="prochaine"]').textContent = derniereDemande.prochaine;
  }

  // ---------- Navigation entre écrans (sans rechargement) ----------
  // Écrans : accueil, recherche-1 à recherche-3, rendez-vous, confirmation. L'adresse (#…) suit l'écran,
  // ce qui fait fonctionner le bouton Précédent du navigateur.
  function ecranDepuisAdresse() {
    return window.location.hash.replace("#", "") || ECRAN_ACCUEIL;
  }

  function rendreEtapeRecherche() {
    formRecherche.querySelectorAll("[data-etape]").forEach(function (bloc) {
      bloc.hidden = Number(bloc.dataset.etape) !== etapeRecherche;
    });
    racine.querySelector('[data-champ="etape-numero"]').textContent = "Étape " + etapeRecherche + " sur " + NB_ETAPES_RECHERCHE;
    racine.querySelector('[data-champ="etape-titre"]').textContent = TITRES_ETAPES[etapeRecherche].replace("{prenom}", prenom);
    racine.querySelectorAll("[data-segment]").forEach(function (seg) {
      seg.classList.toggle("is-atteint", Number(seg.dataset.segment) <= etapeRecherche);
    });

    var precedent = racine.querySelector('[data-action="recherche-precedent"]');
    precedent.textContent = etapeRecherche === 1 ? "Retour" : "Précédent";
    var suivant = racine.querySelector('[data-action="recherche-suivant"]');
    var libelle = etapeRecherche === NB_ETAPES_RECHERCHE ? "Envoyer ma demande" : "Continuer";
    suivant.innerHTML = libelle + '<i class="bi bi-arrow-right" aria-hidden="true"></i>';
  }

  function afficher(nom) {
    var ecran = nom;
    var numero = 1;
    if (ecran.indexOf("recherche-") === 0) {
      numero = Number(ecran.split("-")[1]) || 1;
      numero = Math.min(Math.max(numero, 1), NB_ETAPES_RECHERCHE);
      // On ne saute pas une étape incomplète (ex. arrivée directe sur #recherche-3).
      while (numero > 1 && !etapeRechercheComplete(numero - 1)) numero--;
      ecran = "recherche";
    }
    if (ecran === "confirmation" && !derniereDemande) ecran = ECRAN_ACCUEIL;
    if (ECRANS.indexOf(ecran) < 0) ecran = ECRAN_ACCUEIL;

    racine.querySelectorAll("[data-ecran]").forEach(function (s) { s.hidden = s.dataset.ecran !== ecran; });
    racine.querySelector("[data-lien-profil]").hidden = ecran === ECRAN_ACCUEIL;

    var cibleFocus = null;
    if (ecran === "recherche") {
      etapeRecherche = numero;
      rendreEtapeRecherche();
      cibleFocus = racine.querySelector('[data-champ="etape-titre"]');
    } else if (ecran === "rendez-vous") {
      cibleFocus = racine.querySelector('[data-champ="rdv-titre"]');
    } else if (ecran === "confirmation") {
      rendreConfirmation();
      cibleFocus = racine.querySelector('[data-champ="confirmation-titre"]');
    }

    // Chaque changement d'écran ou d'étape remonte en haut de la page.
    window.scrollTo({ top: 0, behavior: mouvementReduit ? "auto" : "smooth" });
    if (cibleFocus) cibleFocus.focus({ preventScroll: true });
    mettreAJourBoutons();
  }

  function aller(nom) {
    if (window.location.hash !== "#" + nom) window.history.pushState({ ecran: nom }, "", "#" + nom);
    afficher(nom);
  }

  // ---------- Événements ----------
  racine.addEventListener("click", function (e) {
    var lien = e.target.closest("[data-aller]");
    if (lien) {
      e.preventDefault();
      aller(lien.dataset.aller);
      return;
    }
    var choix = e.target.closest(".pub-tuile, .pub-pilule");
    if (choix && choix.closest("form")) {
      choisir(choix);
      return;
    }
    var fleche = e.target.closest("[data-mois]");
    if (fleche) {
      if (!fleche.disabled) changerMois(Number(fleche.dataset.mois));
      return;
    }
    var jour = e.target.closest("[data-jour]");
    if (jour) {
      if (!jour.disabled) choisirJour(Number(jour.dataset.jour));
      return;
    }
    var action = e.target.closest("[data-action]");
    if (!action || action.disabled) return;
    if (action.dataset.action === "recherche-precedent") {
      if (etapeRecherche === 1) aller(ECRAN_ACCUEIL);
      else aller("recherche-" + (etapeRecherche - 1));
    } else if (action.dataset.action === "recherche-suivant") {
      if (etapeRecherche < NB_ETAPES_RECHERCHE) aller("recherche-" + (etapeRecherche + 1));
      else envoyerRecherche();
    } else if (action.dataset.action === "rdv-envoyer") {
      envoyerRdv();
    }
  });

  // Les champs texte et les cases de consentement changent l'état des boutons principaux.
  [formRecherche, formRdv].forEach(function (form) {
    form.addEventListener("input", mettreAJourBoutons);
    form.addEventListener("change", mettreAJourBoutons);
    form.addEventListener("submit", function (e) { e.preventDefault(); });
  });

  window.addEventListener("popstate", function () { afficher(ecranDepuisAdresse()); });

  // ---------- Démarrage ----------
  remplirProfil();
  synchroniserChoix(formRecherche);
  synchroniserChoix(formRdv);
  rendreCalendrier();
  mettreAJourRappelRdv();
  afficher(ecranDepuisAdresse());
})();
