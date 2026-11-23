// Thème clair / sombre de phineas, et réglages d'affichage mémorisés dans le navigateur.
//
// CONTRAT COMMUN (toutes les pages refaites le respectent) :
//   - Le thème actif est l'attribut data-theme="sombre" sur <html> ; sans cet attribut, la page est en thème clair.
//     Bootstrap reçoit aussi data-bs-theme="dark" pour que ses composants (menus, fenêtres, champs) suivent.
//   - Une feuille de style écrit ses règles sombres sous  html[data-theme="sombre"] .prefixe-page { … }
//     (ou redéfinit ses propres variables sous ce sélecteur), en utilisant la palette --ps-* de theme-sombre.css.
//   - La préférence est enregistrée dans localStorage, clé « phineas-theme », valeur « clair » ou « sombre ».
//     Sans préférence enregistrée : thème clair (le sombre est une option).
//   - Ce script est chargé de façon synchrone dans le <head>, avant l'affichage : la page s'ouvre directement
//     dans le bon thème, sans flash clair.
//   - API : window.PhineasTheme.obtenir()   -> "clair" ou "sombre"
//           window.PhineasTheme.appliquer(t) -> applique et enregistre le thème t
//           window.PhineasTheme.basculer()  -> passe de l'un à l'autre
//   - Événement : document reçoit « phineas:theme » à chaque changement, avec event.detail.theme.
//   - Bouton de bascule : tout élément [data-basculer-theme] (aria-pressed suit le thème sombre).
//     Il peut contenir une icône [data-theme-icone] (bi-moon en clair, bi-sun en sombre).
//   - Les onglets ouverts se synchronisent entre eux (événement storage).
//
// RÉGLAGE D'AFFICHAGE « Chiffres de l'accueil » (accueil vendeur) :
//   - Clé localStorage « phineas-accueil-chiffres », valeur « affiches » ou « masques » (sans valeur : affichés).
//   - Masqués : attribut data-accueil-chiffres="masques" sur <html> (la rangée .ph-stats est alors cachée en CSS).
//   - Interrupteur : toute case à cocher [data-reglage-chiffres] (cochée = chiffres affichés).
(function () {
  "use strict";

  var CLE_THEME = "phineas-theme";
  var CLE_CHIFFRES = "phineas-accueil-chiffres";
  var SOMBRE = "sombre";
  var CLAIR = "clair";
  var CHIFFRES_MASQUES = "masques";
  var CHIFFRES_AFFICHES = "affiches";
  var racine = document.documentElement;

  // ---------- Lecture et écriture protégées (navigation privée, stockage bloqué) ----------
  function lire(cle) {
    try {
      return window.localStorage.getItem(cle);
    } catch (e) {
      return null;
    }
  }
  function ecrire(cle, valeur) {
    try {
      window.localStorage.setItem(cle, valeur);
    } catch (e) {
      // Stockage indisponible : le choix vaut seulement pour cette page.
    }
  }

  // ---------- Thème ----------
  function obtenir() {
    return racine.getAttribute("data-theme") === SOMBRE ? SOMBRE : CLAIR;
  }

  // Met à jour l'état visible de chaque bouton de bascule (aria-pressed et icône).
  function majBoutons() {
    var sombre = obtenir() === SOMBRE;
    var boutons = document.querySelectorAll("[data-basculer-theme]");
    for (var i = 0; i < boutons.length; i++) {
      boutons[i].setAttribute("aria-pressed", sombre ? "true" : "false");
      var icone = boutons[i].querySelector("[data-theme-icone]");
      if (icone) {
        icone.classList.toggle("bi-moon", !sombre);
        icone.classList.toggle("bi-sun", sombre);
      }
    }
  }

  // Applique un thème à la page. enregistrer = true pour le retenir dans le navigateur.
  function poser(theme, enregistrer) {
    var sombre = theme === SOMBRE;
    if (sombre) {
      racine.setAttribute("data-theme", SOMBRE);
      racine.setAttribute("data-bs-theme", "dark");
    } else {
      racine.removeAttribute("data-theme");
      racine.removeAttribute("data-bs-theme");
    }
    racine.style.colorScheme = sombre ? "dark" : "light";
    if (enregistrer) ecrire(CLE_THEME, sombre ? SOMBRE : CLAIR);
    majBoutons();
    document.dispatchEvent(new CustomEvent("phineas:theme", { detail: { theme: sombre ? SOMBRE : CLAIR } }));
  }

  function appliquer(theme) {
    poser(theme === SOMBRE ? SOMBRE : CLAIR, true);
  }

  function basculer() {
    appliquer(obtenir() === SOMBRE ? CLAIR : SOMBRE);
  }

  // ---------- Chiffres de l'accueil ----------
  function chiffresAffiches() {
    return racine.getAttribute("data-accueil-chiffres") !== CHIFFRES_MASQUES;
  }

  function poserChiffres(affiches, enregistrer) {
    if (affiches) racine.removeAttribute("data-accueil-chiffres");
    else racine.setAttribute("data-accueil-chiffres", CHIFFRES_MASQUES);
    if (enregistrer) ecrire(CLE_CHIFFRES, affiches ? CHIFFRES_AFFICHES : CHIFFRES_MASQUES);
    var cases = document.querySelectorAll("[data-reglage-chiffres]");
    for (var i = 0; i < cases.length; i++) cases[i].checked = affiches;
  }

  // ---------- Au chargement : appliquer les préférences tout de suite (avant l'affichage) ----------
  poser(lire(CLE_THEME) === SOMBRE ? SOMBRE : CLAIR, false);
  poserChiffres(lire(CLE_CHIFFRES) !== CHIFFRES_MASQUES, false);

  window.PhineasTheme = { obtenir: obtenir, appliquer: appliquer, basculer: basculer };

  // Les boutons et interrupteurs n'existent qu'une fois la page lue : on met leur état à jour à ce moment-là.
  document.addEventListener("DOMContentLoaded", function () {
    majBoutons();
    poserChiffres(chiffresAffiches(), false);
  });

  // Un seul écouteur pour tous les boutons de bascule, même ajoutés plus tard.
  document.addEventListener("click", function (evenement) {
    var bouton = evenement.target.closest ? evenement.target.closest("[data-basculer-theme]") : null;
    if (bouton) basculer();
  });

  document.addEventListener("change", function (evenement) {
    if (evenement.target.matches && evenement.target.matches("[data-reglage-chiffres]")) {
      poserChiffres(evenement.target.checked, true);
    }
  });

  // Un changement fait dans un autre onglet s'applique ici aussi.
  window.addEventListener("storage", function (evenement) {
    if (evenement.key === CLE_THEME) poser(evenement.newValue === SOMBRE ? SOMBRE : CLAIR, false);
    if (evenement.key === CLE_CHIFFRES) poserChiffres(evenement.newValue !== CHIFFRES_MASQUES, false);
  });
})();
