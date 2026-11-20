// Page de connexion (Views/Account/Login.cshtml) : trois petits comportements, tous facultatifs.
// 1. Le bouton œil affiche ou masque le mot de passe.
// 2. Le bouton « Se connecter » paraît gris tant que le courriel ou le mot de passe est vide.
//    Il n'est JAMAIS bloqué : l'autoremplissage et la touche Entrée doivent toujours fonctionner,
//    et la validation du serveur (et de jquery.validate) reste la vraie garde.
// 3. Des petits carrés menthe pulsent sur les croisements de la grille du panneau vert.
(function () {
  "use strict";

  // ---------- Réglages ----------
  var TAILLE_CASE = 68;          // écart de la grille, même valeur que background-size dans connexion.css
  var PROPORTION_CARRES = 0.3;   // environ 3 croisements sur 10 portent un carré
  var CARRE_MIN = 3;             // taille d'un carré, en px
  var CARRE_MAX = 8;
  var DUREE_MIN = 4;             // durée d'une pulsation, en secondes
  var DUREE_MAX = 9;
  var DELAIS_RELECTURE = [150, 600, 1500]; // relectures des champs après le chargement (autoremplissage tardif)

  var reduireMouvements = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- 1. Œil du mot de passe ----------
  var motDePasse = document.getElementById("Password");
  var boutonOeil = document.getElementById("toggle-password");
  if (motDePasse && boutonOeil) {
    boutonOeil.addEventListener("click", function () {
      var afficher = motDePasse.type === "password";
      motDePasse.type = afficher ? "text" : "password";
      boutonOeil.setAttribute("aria-pressed", afficher ? "true" : "false");
      boutonOeil.setAttribute("aria-label", afficher ? "Masquer le mot de passe" : "Afficher le mot de passe");
      boutonOeil.querySelector("i").className = afficher ? "bi bi-eye-slash" : "bi bi-eye";
    });
  }

  // ---------- 2. Apparence du bouton « Se connecter » ----------
  var champs = Array.prototype.slice.call(document.querySelectorAll("[data-champ-requis]"));
  var boutonConnexion = document.querySelector("[data-bouton-connexion]");

  // Un champ rempli par le navigateur peut avoir une valeur encore illisible pour le script :
  // on le compte aussi comme rempli quand il porte l'état « autofill ».
  function estRempli(champ) {
    if (champ.value.trim() !== "") return true;
    try {
      return champ.matches(":-webkit-autofill") || champ.matches(":autofill");
    } catch (e) {
      return false;
    }
  }

  function majBouton() {
    if (!boutonConnexion) return;
    var tousRemplis = champs.every(estRempli);
    boutonConnexion.classList.toggle("is-inactif", !tousRemplis);
  }

  champs.forEach(function (champ) {
    champ.addEventListener("input", majBouton);
    champ.addEventListener("change", majBouton);
  });
  majBouton();
  DELAIS_RELECTURE.forEach(function (delai) { setTimeout(majBouton, delai); });
  window.addEventListener("pageshow", majBouton); // retour arrière : le navigateur peut remettre les valeurs

  // ---------- 3. Carrés du panneau vert ----------
  var fond = document.querySelector("[data-carres-panneau]");
  if (!fond) return;

  function nombreAuHasard(min, max) {
    return min + Math.random() * (max - min);
  }

  // Pose un carré sur environ 3 croisements sur 10, chacun avec sa taille, sa durée et son décalage.
  function dessinerCarres() {
    fond.querySelectorAll(".cx-carre").forEach(function (carre) { carre.remove(); });
    var largeur = fond.clientWidth;
    var hauteur = fond.clientHeight;
    for (var x = TAILLE_CASE; x < largeur; x += TAILLE_CASE) {
      for (var y = TAILLE_CASE; y < hauteur; y += TAILLE_CASE) {
        if (Math.random() > PROPORTION_CARRES) continue;
        var taille = Math.round(nombreAuHasard(CARRE_MIN, CARRE_MAX));
        var duree = nombreAuHasard(DUREE_MIN, DUREE_MAX);
        var carre = document.createElement("span");
        carre.className = "cx-carre";
        carre.style.width = taille + "px";
        carre.style.height = taille + "px";
        carre.style.left = (x - taille / 2) + "px";
        carre.style.top = (y - taille / 2) + "px";
        carre.style.setProperty("--duree", duree.toFixed(2) + "s");
        // Délai négatif : chaque carré démarre déjà à un moment différent de sa pulsation.
        carre.style.setProperty("--delai", (-nombreAuHasard(0, duree)).toFixed(2) + "s");
        if (reduireMouvements) carre.style.setProperty("--opacite-fixe", nombreAuHasard(0.15, 0.6).toFixed(2));
        fond.appendChild(carre);
      }
    }
  }

  dessinerCarres();

  // Redessine après un redimensionnement (attente de 200 ms pour ne pas recalculer à chaque pixel).
  var minuterie = null;
  window.addEventListener("resize", function () {
    clearTimeout(minuterie);
    minuterie = setTimeout(dessinerCarres, 200);
  });
})();
