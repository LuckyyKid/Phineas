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

  // Retire un élément d'une liste avec possibilité d'annuler.
  function retirer(el, message, apres) {
    var annule = false;
    el.classList.add("is-leaving");
    setTimeout(function () {
      el.classList.remove("is-leaving");
      if (annule) return;
      el.hidden = true;
      apres();
    }, 200);
    notifier(message, function () {
      annule = true;
      el.hidden = false;
      apres();
    });
  }

  // ---------- Actions prioritaires ----------
  var priorites = document.getElementById("sv-priorites");
  if (priorites) {
    var cartes = Array.prototype.slice.call(priorites.querySelectorAll(".sv-prio"));
    var puces = Array.prototype.slice.call(priorites.querySelectorAll("[data-filtre]"));
    var videPrio = priorites.querySelector("[data-vide]");
    var filtre = "toutes";

    var correspond = {
      toutes: function () {
        return true;
      },
      aujourdhui: function (c) {
        return c.dataset.aujourdhui === "1";
      },
      critique: function (c) {
        return c.dataset.urgence === "critique";
      },
    };

    function actualiser() {
      var visibles = 0;
      cartes.forEach(function (c) {
        var montre = !c.dataset.traite && correspond[filtre](c);
        c.hidden = !montre;
        if (montre) visibles++;
      });
      puces.forEach(function (p) {
        var f = p.dataset.filtre;
        var actif = f === filtre;
        p.classList.toggle("is-active", actif);
        p.setAttribute("aria-pressed", actif ? "true" : "false");
        p.querySelector("span").textContent = cartes.filter(function (c) {
          return !c.dataset.traite && correspond[f](c);
        }).length;
      });
      videPrio.classList.toggle("d-none", visibles > 0);
    }

    puces.forEach(function (p) {
      p.addEventListener("click", function () {
        filtre = p.dataset.filtre;
        actualiser();
      });
    });

    priorites.addEventListener("click", function (e) {
      var bouton = e.target.closest("[data-traiter]");
      if (!bouton) return;
      var carte = bouton.closest(".sv-prio");
      var nom = carte.querySelector(".sv-prio-who strong").textContent;
      carte.dataset.traite = "1";
      retirer(carte, nom + " : marqué comme traité (non enregistré).", function () {
        if (!carte.hidden) delete carte.dataset.traite;
        actualiser();
      });
    });
  }

  // ---------- Alertes ----------
  var alertes = document.getElementById("sv-alertes");
  if (alertes) {
    var videAlertes = alertes.querySelector("[data-vide]");

    function actualiserAlertes() {
      var restantes = alertes.querySelectorAll(".sv-alert:not([hidden])").length;
      videAlertes.classList.toggle("d-none", restantes > 0);
    }

    alertes.addEventListener("click", function (e) {
      var bouton = e.target.closest("[data-ignorer]");
      if (!bouton) return;
      retirer(bouton.closest(".sv-alert"), "Alerte masquée (non enregistrée).", actualiserAlertes);
    });
  }
})();
