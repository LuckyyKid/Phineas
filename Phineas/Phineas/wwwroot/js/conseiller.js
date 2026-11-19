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
  var focus = document.getElementById("ph-focus");
  if (!focus) return;

  var priorites = Array.prototype.slice.call(focus.querySelectorAll("[data-priorite]"));
  var etapes = Array.prototype.slice.call(focus.querySelectorAll("[data-etape]"));
  var position = focus.querySelector("[data-position]");
  var fin = focus.querySelector("[data-fin]");
  var total = priorites.length;
  var file = priorites.slice();
  var faites = 0;

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
    var courante = file[0];
    if (courante) courante.hidden = false;
    fin.hidden = !!courante;

    etapes.forEach(function (e, i) {
      e.classList.toggle("is-done", i < faites);
      e.classList.toggle("is-current", !!courante && i === faites);
    });
    if (position) position.textContent = (courante ? faites + 1 : total) + "/" + total;

    if (focusDedans) {
      var cible = courante ? courante.querySelector("[data-valider]") : fin;
      if (!courante) fin.setAttribute("tabindex", "-1");
      cible.focus();
    }
  }

  focus.addEventListener("click", function (e) {
    var p = e.target.closest("[data-priorite]");
    if (!p) return;
    var nom = p.querySelector(".ph-focus-nom").textContent;

    if (e.target.closest("[data-valider]")) {
      file.shift();
      faites++;
      afficher();
      notifier(nom + " : c'est noté (non enregistré).", function () {
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

  afficher();
})();
