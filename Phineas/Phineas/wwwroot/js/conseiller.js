// Espace vendeur : interactions locales uniquement (aucun appel serveur, rien n'est enregistré).
(function () {
  "use strict";

  var toastEl = document.getElementById("sv-toast");
  var toast =
    toastEl && window.bootstrap
      ? bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 5000 })
      : null;
  var annulerBtn = toastEl && toastEl.querySelector("[data-toast-annuler]");
  var annulerAction = null;

  function notifier(texte, annuler) {
    if (!toast) return;
    toastEl.querySelector("[data-toast-texte]").textContent = texte;
    annulerAction = annuler || null;
    annulerBtn.classList.toggle("d-none", !annulerAction);
    toast.show();
  }

  // Partagé avec les autres pages de l'espace vendeur (ex. prospects).
  window.SalesOS = { notifier: notifier };

  if (annulerBtn) {
    annulerBtn.addEventListener("click", function () {
      if (annulerAction) annulerAction();
      annulerAction = null;
      toast.hide();
    });
  }

  // Fonctionnalités pas encore développées : on le dit clairement.
  document.addEventListener("click", function (e) {
    var cible = e.target.closest("[data-bientot]");
    if (cible) notifier(cible.getAttribute("data-bientot"));
  });

  // ---------- À faire en premier ----------
  // Une seule priorité visible : « valider » la retire, « plus tard » la remet en fin de file.
  // Les priorités sont écrites dans la carte par accueil-moteur.js, qui appelle ensuite SalesOS.rafraichirFocus().
  var focus = document.getElementById("ph-focus");
  if (!focus) return;

  var priorites = [];
  var etapes = [];
  var position = null;
  var fin = focus.querySelector("[data-fin]");
  var total = 0;
  var file = [];
  var faites = 0;

  // Relit les priorités présentes dans la carte et repart de la première.
  function rafraichirFocus() {
    priorites = Array.prototype.slice.call(focus.querySelectorAll("[data-priorite]"));
    etapes = Array.prototype.slice.call(focus.querySelectorAll("[data-etape]"));
    position = focus.querySelector("[data-position]");
    total = priorites.length;
    file = priorites.slice();
    faites = 0;
    afficher();
  }
  window.SalesOS.rafraichirFocus = rafraichirFocus;

  function fermerDossier(p) {
    p.querySelector("[data-dossier]").hidden = true;
    p.querySelector("[data-voir-dossier]").setAttribute("aria-expanded", "false");
  }

  function afficher() {
    // Garde le focus clavier dans la carte quand la priorité affichée change.
    var focusDedans = focus.contains(document.activeElement);
    priorites.forEach(function (p) {
      p.hidden = true;
      fermerDossier(p);
    });
    // La priorité affichée est toujours la première de la file ; file vide = tout est réglé.
    var courante = file[0];
    var resteAFaire = file.length > 0;
    if (resteAFaire) courante.hidden = false;
    fin.hidden = resteAFaire;

    // Points de progression : faits en menthe, courant en blanc.
    etapes.forEach(function (etape, index) {
      etape.classList.toggle("is-done", index < faites);
      etape.classList.toggle("is-current", resteAFaire && index === faites);
    });

    // « 2/3 » pendant le travail, « 3/3 » quand tout est fait.
    var numero = total;
    if (resteAFaire) numero = faites + 1;
    if (position) position.textContent = numero + "/" + total;

    if (focusDedans) {
      if (resteAFaire) {
        courante.querySelector("[data-valider]").focus();
      } else {
        fin.setAttribute("tabindex", "-1");
        fin.focus();
      }
    }
  }

  focus.addEventListener("click", function (e) {
    var p = e.target.closest("[data-priorite]");
    if (!p) return;
    var nom = p.querySelector(".ph-focus-nom").textContent;

    if (e.target.closest("[data-valider]")) {
      // Priorité venue du moteur : on la marque comme réalisée dans le Centre d'actions aussi.
      var annulerMoteur = null;
      var actionId = p.getAttribute("data-action-id");
      if (actionId && window.Intelligence) {
        annulerMoteur = window.Intelligence.terminer(actionId);
      }
      file.shift();
      faites++;
      afficher();
      notifier(nom + " : action marquée comme réalisée.", function () {
        if (annulerMoteur) annulerMoteur();
        file.unshift(p);
        faites--;
        afficher();
      });
    } else if (e.target.closest("[data-plus-tard]")) {
      if (file.length < 2) {
        notifier("C'est la dernière priorité du jour.");
        return;
      }
      file.push(file.shift());
      afficher();
    } else if (e.target.closest("[data-voir-dossier]")) {
      var dossier = p.querySelector("[data-dossier]");
      dossier.hidden = !dossier.hidden;
      e.target.closest("[data-voir-dossier]").setAttribute("aria-expanded", dossier.hidden ? "false" : "true");
    }
  });
})();
