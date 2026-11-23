// Page d'accueil publique (Views/Home/Index.cshtml) : deux comportements, rien d'autre.
//   1. Le fond animé du haut de page (canvas [data-fond-anime]) : une grille fine, de petits carrés verts
//      qui pulsent lentement, quelques diagonales, et les carrés qui s'allument près de la souris.
//   2. La démonstration des statuts ([data-demo-statuts]) : un groupe de boutons radio.
// Aucun appel serveur. Le fond est purement décoratif (aria-hidden dans la vue).
(function () {
  "use strict";

  // ---------- Réglages du fond animé ----------
  var TAILLE_CASE = 68;                 // côté d'une case de la grille, en pixels
  var PROPORTION_CARRES = 0.4;          // environ 4 croisements sur 10 portent un carré
  var PROPORTION_DIAGONALES = 0.1;      // environ 1 carré sur 10 est relié à un croisement voisin
  var TAILLE_CARRE_MIN = 3;             // en pixels
  var TAILLE_CARRE_MAX = 9;
  var OPACITE_MIN = 0.16;               // les carrés pulsent entre ces deux opacités
  var OPACITE_MAX = 0.66;
  var DUREE_PULSATION_MIN = 4000;       // en millisecondes : une pulsation lente
  var DUREE_PULSATION_MAX = 10000;
  var RAYON_SOURIS = 190;               // les carrés à moins de 190 px de la souris s'allument
  var GROSSISSEMENT_SOURIS = 4;         // pixels ajoutés au carré le plus proche de la souris
  // Couleurs du motif selon le thème (rouge, vert, bleu sans l'opacité pour les carrés et les diagonales).
  // Thème clair : vert sapin sur fond blanc. Thème sombre : menthe très discrète sur fond presque noir.
  // « intensite » multiplie l'opacité des carrés et des diagonales.
  var COULEURS_CLAIR = { lignes: "rgba(23, 97, 79, 0.075)", carres: "29, 154, 130", diagonales: "23, 97, 79", intensite: 1 };
  var COULEURS_SOMBRE = { lignes: "rgba(255, 255, 255, 0.045)", carres: "95, 224, 192", diagonales: "95, 224, 192", intensite: 0.62 };
  // Ellipse presque effacée derrière le titre, pour la lisibilité (proportions de la largeur et de la hauteur).
  var ELLIPSE_CENTRE_Y = 0.36;
  var ELLIPSE_RAYON_X = 0.36;
  var ELLIPSE_RAYON_Y = 0.24;
  var ELLIPSE_OPACITE_RESTANTE = 0.08;  // ce qui reste visible au centre de l'ellipse

  var canvas = document.querySelector("[data-fond-anime]");
  if (canvas && canvas.getContext) {
    demarrerFondAnime(canvas);
  }

  var groupeStatuts = document.querySelector("[data-demo-statuts]");
  if (groupeStatuts) {
    brancherDemoStatuts(groupeStatuts);
  }

  // Thème actif, lu dans le contrat commun (wwwroot/js/theme.js) ; sans ce script : thème clair.
  function couleursDuTheme() {
    var sombre = window.PhineasTheme && window.PhineasTheme.obtenir() === "sombre";
    return sombre ? COULEURS_SOMBRE : COULEURS_CLAIR;
  }

  // ---------- 1. Fond animé ----------
  function demarrerFondAnime(canvas) {
    var contexte = canvas.getContext("2d");
    var mouvementsReduits = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var largeur = 0;
    var hauteur = 0;
    var carres = [];
    var souris = null;            // position de la souris dans le canvas, ou null si elle est ailleurs
    var animationEnCours = false;
    var visibleAEcran = true;

    // Un nombre au hasard entre min et max.
    function auHasard(min, max) {
      return min + Math.random() * (max - min);
    }

    // Construit la liste des carrés posés sur les croisements de la grille.
    function preparer() {
      var ratio = window.devicePixelRatio || 1;
      largeur = canvas.clientWidth;
      hauteur = canvas.clientHeight;
      canvas.width = Math.round(largeur * ratio);
      canvas.height = Math.round(hauteur * ratio);
      contexte.setTransform(ratio, 0, 0, ratio, 0, 0);

      carres = [];
      for (var x = 0; x <= largeur; x += TAILLE_CASE) {
        for (var y = 0; y <= hauteur; y += TAILLE_CASE) {
          if (Math.random() > PROPORTION_CARRES) continue;
          var avecDiagonale = Math.random() < PROPORTION_DIAGONALES;
          // La diagonale va vers le croisement voisin en haut à droite ou en bas à droite.
          var sensDiagonale = Math.random() < 0.5 ? -1 : 1;
          carres.push({
            x: x,
            y: y,
            taille: Math.round(auHasard(TAILLE_CARRE_MIN, TAILLE_CARRE_MAX)),
            duree: auHasard(DUREE_PULSATION_MIN, DUREE_PULSATION_MAX),
            decalage: Math.random() * Math.PI * 2,
            diagonale: avecDiagonale ? { x: x + TAILLE_CASE, y: y + sensDiagonale * TAILLE_CASE } : null,
          });
        }
      }
    }

    // Opacité d'un carré à l'instant donné : une vague lente entre OPACITE_MIN et OPACITE_MAX.
    function opacitePulsee(carre, temps) {
      var vague = (Math.sin((temps / carre.duree) * Math.PI * 2 + carre.decalage) + 1) / 2;
      return OPACITE_MIN + vague * (OPACITE_MAX - OPACITE_MIN);
    }

    // Proximité de la souris : 1 juste dessous, 0 au-delà de RAYON_SOURIS.
    function proximiteSouris(carre) {
      if (!souris) return 0;
      var distance = Math.hypot(carre.x - souris.x, carre.y - souris.y);
      if (distance >= RAYON_SOURIS) return 0;
      return 1 - distance / RAYON_SOURIS;
    }

    function dessinerGrille() {
      contexte.strokeStyle = couleurs.lignes;
      contexte.lineWidth = 1;
      contexte.beginPath();
      for (var x = 0; x <= largeur; x += TAILLE_CASE) {
        contexte.moveTo(x + 0.5, 0);
        contexte.lineTo(x + 0.5, hauteur);
      }
      for (var y = 0; y <= hauteur; y += TAILLE_CASE) {
        contexte.moveTo(0, y + 0.5);
        contexte.lineTo(largeur, y + 0.5);
      }
      contexte.stroke();
    }

    function dessinerCarres(temps) {
      for (var i = 0; i < carres.length; i++) {
        var carre = carres[i];
        var opacite = opacitePulsee(carre, temps);
        var proximite = proximiteSouris(carre);
        // Près de la souris, le carré s'allume et grossit un peu.
        var opaciteFinale = (opacite + (1 - opacite) * proximite) * couleurs.intensite;
        var taille = carre.taille + GROSSISSEMENT_SOURIS * proximite;

        if (carre.diagonale) {
          // La diagonale apparaît puis disparaît, sur le même rythme que son carré.
          var opaciteDiagonale = Math.max(0, Math.sin((temps / carre.duree) * Math.PI * 2 + carre.decalage)) * 0.45 * couleurs.intensite;
          contexte.strokeStyle = "rgba(" + couleurs.diagonales + ", " + opaciteDiagonale.toFixed(3) + ")";
          contexte.beginPath();
          contexte.moveTo(carre.x, carre.y);
          contexte.lineTo(carre.diagonale.x, carre.diagonale.y);
          contexte.stroke();
        }

        contexte.fillStyle = "rgba(" + couleurs.carres + ", " + opaciteFinale.toFixed(3) + ")";
        contexte.fillRect(carre.x - taille / 2, carre.y - taille / 2, taille, taille);
      }
    }

    // Efface presque tout le motif dans une ellipse derrière le titre.
    function effacerDerriereLeTitre() {
      var centreX = largeur / 2;
      var centreY = hauteur * ELLIPSE_CENTRE_Y;
      var rayonX = largeur * ELLIPSE_RAYON_X;
      var rayonY = hauteur * ELLIPSE_RAYON_Y;

      contexte.save();
      contexte.globalCompositeOperation = "destination-out";
      // On dessine un cercle étiré en hauteur : l'échelle verticale le transforme en ellipse.
      contexte.translate(centreX, centreY);
      contexte.scale(1, rayonY / rayonX);
      var degrade = contexte.createRadialGradient(0, 0, 0, 0, 0, rayonX);
      degrade.addColorStop(0, "rgba(0, 0, 0, " + (1 - ELLIPSE_OPACITE_RESTANTE) + ")");
      degrade.addColorStop(0.6, "rgba(0, 0, 0, " + (1 - ELLIPSE_OPACITE_RESTANTE) + ")");
      degrade.addColorStop(1, "rgba(0, 0, 0, 0)");
      contexte.fillStyle = degrade;
      contexte.beginPath();
      contexte.arc(0, 0, rayonX, 0, Math.PI * 2);
      contexte.fill();
      contexte.restore();
    }

    function dessiner(temps) {
      contexte.clearRect(0, 0, largeur, hauteur);
      dessinerGrille();
      dessinerCarres(temps);
      effacerDerriereLeTitre();
    }

    function boucle(temps) {
      if (!animationEnCours) return;
      dessiner(temps);
      window.requestAnimationFrame(boucle);
    }

    // L'animation tourne seulement si l'onglet est affiché et le haut de page visible.
    function mettreAJourAnimation() {
      var doitTourner = !mouvementsReduits && !document.hidden && visibleAEcran;
      if (doitTourner && !animationEnCours) {
        animationEnCours = true;
        window.requestAnimationFrame(boucle);
      } else if (!doitTourner) {
        animationEnCours = false;
      }
    }

    preparer();

    // Changement de thème : on reprend les couleurs ; une image fixe (ou en pause) est redessinée tout de suite.
    var couleurs = couleursDuTheme();
    document.addEventListener("phineas:theme", function () {
      couleurs = couleursDuTheme();
      if (!animationEnCours) dessiner(0);
    });

    if (mouvementsReduits) {
      // Image fixe : un seul dessin, sans mouvement ni réaction à la souris.
      dessiner(0);
      window.addEventListener("resize", function () {
        preparer();
        dessiner(0);
      });
      return;
    }

    var minuterieRedimension = null;
    window.addEventListener("resize", function () {
      window.clearTimeout(minuterieRedimension);
      minuterieRedimension = window.setTimeout(preparer, 150);
    });

    window.addEventListener("pointermove", function (evenement) {
      var cadre = canvas.getBoundingClientRect();
      var x = evenement.clientX - cadre.left;
      var y = evenement.clientY - cadre.top;
      var dansLeCanvas = x >= 0 && y >= 0 && x <= cadre.width && y <= cadre.height;
      souris = dansLeCanvas ? { x: x, y: y } : null;
    }, { passive: true });
    document.addEventListener("pointerleave", function () { souris = null; });

    document.addEventListener("visibilitychange", mettreAJourAnimation);
    if ("IntersectionObserver" in window) {
      var observateur = new IntersectionObserver(function (entrees) {
        visibleAEcran = entrees[0].isIntersecting;
        mettreAJourAnimation();
      });
      observateur.observe(canvas);
    }
    mettreAJourAnimation();
  }

  // ---------- 2. Démonstration des statuts ----------
  // Un seul statut choisi à la fois. Au clavier : flèches pour passer d'un statut à l'autre (comme des boutons radio).
  function brancherDemoStatuts(groupe) {
    var boutons = Array.prototype.slice.call(groupe.querySelectorAll('[role="radio"]'));

    function choisir(boutonChoisi, donnerLeFocus) {
      boutons.forEach(function (bouton) {
        var estChoisi = bouton === boutonChoisi;
        bouton.classList.toggle("is-choisi", estChoisi);
        bouton.setAttribute("aria-checked", estChoisi ? "true" : "false");
        bouton.tabIndex = estChoisi ? 0 : -1;
      });
      if (donnerLeFocus) boutonChoisi.focus();
    }

    groupe.addEventListener("click", function (evenement) {
      var bouton = evenement.target.closest('[role="radio"]');
      if (bouton) choisir(bouton, false);
    });

    groupe.addEventListener("keydown", function (evenement) {
      var position = boutons.indexOf(document.activeElement);
      if (position < 0) return;
      var nouvellePosition = null;
      if (evenement.key === "ArrowRight" || evenement.key === "ArrowDown") nouvellePosition = (position + 1) % boutons.length;
      if (evenement.key === "ArrowLeft" || evenement.key === "ArrowUp") nouvellePosition = (position - 1 + boutons.length) % boutons.length;
      if (evenement.key === "Home") nouvellePosition = 0;
      if (evenement.key === "End") nouvellePosition = boutons.length - 1;
      if (nouvellePosition === null) return;
      evenement.preventDefault();
      choisir(boutons[nouvellePosition], true);
    });
  }
})();

// ---------- Vidéo de présentation (section À propos) ----------
// La vidéo est affichée dans la section ; sa première image sert d'aperçu.
// Si la vidéo reste visible DELAI_LECTURE_MS sans interruption, elle démarre seule, une seule fois.
// Les navigateurs refusent le démarrage automatique avec le son : elle démarre en sourdine
// et le bouton « Activer le son » apparaît. Elle se met en pause quand on quitte la section.
(function () {
  "use strict";

  var DELAI_LECTURE_MS = 5000;
  // Part de la vidéo qui doit être à l'écran pour la considérer « dans la section ».
  var PART_VISIBLE = 0.6;

  var cadre = document.querySelector("[data-video-section]");
  if (!cadre || !("IntersectionObserver" in window)) return;
  var video = cadre.querySelector("[data-video]");
  var boutonSon = cadre.querySelector("[data-activer-son]");

  // Respecte le réglage « réduire les animations » du système : pas de démarrage automatique.
  var reduireAnimations = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var minuterie = null;
  var dejaLanceeSeule = false;
  // Vrai si la pause vient de nous (sortie de la section), pour pouvoir reprendre au retour.
  var enPauseParLaSection = false;

  function lancerEnSourdine() {
    minuterie = null;
    dejaLanceeSeule = true;
    // La personne a déjà lancé la vidéo elle-même : on ne touche ni au son ni à la lecture.
    if (!video.paused) return;
    video.muted = true;
    video.play()
      .then(function () { boutonSon.hidden = false; })
      .catch(function () { /* lecture refusée : la personne peut appuyer sur lecture */ });
  }

  function entrerDansLaSection() {
    if (enPauseParLaSection) {
      enPauseParLaSection = false;
      video.play().catch(function () {});
      return;
    }
    if (dejaLanceeSeule || reduireAnimations || !video.paused) return;
    minuterie = setTimeout(lancerEnSourdine, DELAI_LECTURE_MS);
  }

  function sortirDeLaSection() {
    clearTimeout(minuterie);
    minuterie = null;
    if (!video.paused) {
      video.pause();
      enPauseParLaSection = true;
    }
  }

  var observateur = new IntersectionObserver(function (entrees) {
    var entree = entrees[0];
    if (entree.isIntersecting) {
      entrerDansLaSection();
    } else {
      sortirDeLaSection();
    }
  }, { threshold: PART_VISIBLE });
  observateur.observe(cadre);

  boutonSon.addEventListener("click", function () {
    video.muted = false;
    boutonSon.hidden = true;
  });

  // Si la personne remet le son avec les contrôles de la vidéo, le bouton n'a plus d'utilité.
  video.addEventListener("volumechange", function () {
    if (!video.muted) boutonSon.hidden = true;
  });

  // Une pause demandée par la personne n'est pas reprise automatiquement au retour dans la section.
  video.addEventListener("pause", function () {
    if (!enPauseParLaSection) dejaLanceeSeule = true;
  });
})();

