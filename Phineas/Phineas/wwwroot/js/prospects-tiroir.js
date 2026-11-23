// Tiroir « Nouveau prospect » / « Modifier le prospect » : validation et écriture locale.
(function () {
  "use strict";

  var P = window.Prospects;
  var el = document.getElementById("tiroir-prospect");
  if (!P || !el || !window.bootstrap) return;

  var tiroir = bootstrap.Offcanvas.getOrCreateInstance(el);
  var form = document.getElementById("form-prospect");
  var resumeErreurs = form.querySelector("[data-resume-erreurs]");
  var titre = el.querySelector("#tiroir-titre");
  var soumettre = el.querySelector('button[type="submit"]');
  var modeModification = null; // id du contact modifié, sinon création
  var apresEnregistrement = null;

  function champ(nom) {
    return form.elements[nom];
  }
  function valeur(nom) {
    var c = champ(nom);
    return c ? String(c.value || "").trim() : "";
  }

  function definirMode(contactId) {
    modeModification = contactId || null;
    var creation = !modeModification;
    titre.textContent = creation ? titre.dataset.titreCreation : titre.dataset.titreModification;
    soumettre.textContent = creation ? soumettre.dataset.libelleCreation : soumettre.dataset.libelleModification;
    form.querySelectorAll("[data-creation-seulement]").forEach(function (x) { x.hidden = !creation; });
    form.querySelector("[data-num-attribution]").textContent = creation ? "4" : "3";
  }

  function reinitialiserFormulaire() {
    form.reset();
    form.classList.remove("was-validated");
    form.querySelectorAll(".is-invalid").forEach(function (x) { x.classList.remove("is-invalid"); });
    resumeErreurs.classList.add("d-none");
    champ("conseillerId").value = P.moiId;
    champ("dateSuivi").min = P.aujourdhuiChamp();
  }

  function ouvrirCreation(callback) {
    reinitialiserFormulaire();
    definirMode(null);
    apresEnregistrement = callback || null;
    tiroir.show();
  }

  function ouvrirModification(contactId, callback) {
    var c = P.contact(contactId);
    if (!c) return;
    reinitialiserFormulaire();
    definirMode(contactId);
    apresEnregistrement = callback || null;
    champ("prenom").value = c.prenom;
    champ("nom").value = c.nom;
    champ("courriel").value = c.courriel || "";
    champ("telephone").value = c.telephone || "";
    var pref = form.querySelector('input[name="contactPrefere"][value="' + c.contactPrefere + '"]');
    if (pref) pref.checked = true;
    champ("source").value = c.source;
    champ("sourceDetail").value = c.sourceDetail || "";
    champ("conseillerId").value = c.conseillerId;
    tiroir.show();
  }

  // ---------- Validation ----------
  function invalider(nom, message) {
    var c = champ(nom);
    c.classList.add("is-invalid");
    var fb = c.closest("div").querySelector(".invalid-feedback") || c.parentElement.querySelector(".invalid-feedback");
    if (fb && message) fb.textContent = message;
    return { champ: c, message: message };
  }

  function valider() {
    form.querySelectorAll(".is-invalid").forEach(function (x) { x.classList.remove("is-invalid"); });
    var erreurs = [];
    var creation = !modeModification;

    if (!valeur("prenom")) erreurs.push(invalider("prenom", "Indiquez le prénom."));
    if (!valeur("nom")) erreurs.push(invalider("nom", "Indiquez le nom."));

    var courriel = valeur("courriel");
    var tel = valeur("telephone");
    var chiffres = tel.replace(/\D/g, "");
    var pref = (form.querySelector('input[name="contactPrefere"]:checked') || {}).value;

    if (courriel && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(courriel)) {
      erreurs.push(invalider("courriel", "Adresse courriel invalide (ex. : nom@domaine.ca)."));
    }
    if (tel && !(chiffres.length === 10 || (chiffres.length === 11 && chiffres[0] === "1"))) {
      erreurs.push(invalider("telephone", "Numéro invalide : 10 chiffres attendus."));
    }
    if (!courriel && !tel) {
      erreurs.push(invalider("courriel", "Indiquez un courriel ou un téléphone."));
      invalider("telephone", "Indiquez un courriel ou un téléphone.");
    } else if (pref === "courriel" && !courriel) {
      erreurs.push(invalider("courriel", "Requis : le courriel est le moyen de contact préféré."));
    } else if ((pref === "telephone" || pref === "texto") && !tel) {
      erreurs.push(invalider("telephone", "Requis : le téléphone est le moyen de contact préféré."));
    }

    if (!valeur("source")) erreurs.push(invalider("source", "Choisissez la provenance."));

    if (creation) {
      var budget = valeur("budget");
      if (budget !== "" && (isNaN(+budget) || +budget < 0 || +budget > 500000)) {
        erreurs.push(invalider("budget", "Montant entre 0 et 500 000 $."));
      }
      var date = valeur("dateSuivi");
      if (date && date < P.aujourdhuiChamp()) erreurs.push(invalider("dateSuivi", "La date ne peut pas être passée."));
    }

    if (erreurs.length) {
      resumeErreurs.textContent = erreurs.length === 1
        ? "Un champ est à corriger avant d'enregistrer."
        : erreurs.length + " champs sont à corriger avant d'enregistrer.";
      resumeErreurs.classList.remove("d-none");
      erreurs[0].champ.focus();
      return false;
    }
    resumeErreurs.classList.add("d-none");
    return true;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!valider()) return;

    var commun = {
      prenom: valeur("prenom"),
      nom: valeur("nom"),
      courriel: valeur("courriel") || null,
      telephone: valeur("telephone") || null,
      contactPrefere: form.querySelector('input[name="contactPrefere"]:checked').value,
      source: valeur("source"),
      sourceDetail: valeur("sourceDetail") || null,
      conseillerId: valeur("conseillerId"),
    };

    if (modeModification) {
      P.modifierContact(modeModification, commun);
      tiroir.hide();
      P.notifier("Prospect mis à jour (modification locale, non enregistrée).");
      if (apresEnregistrement) apresEnregistrement(modeModification);
      return;
    }

    commun.categorie = valeur("categorie") || null;
    commun.modele = valeur("modele") || null;
    commun.budget = valeur("budget") === "" ? null : +valeur("budget");
    commun.horizon = valeur("horizon") || null;
    commun.commentaire = valeur("commentaire") || null;
    commun.etape = valeur("etape");
    commun.prochaineAction = valeur("prochaineAction") || null;
    commun.dateSuivi = P.depuisChampDate(valeur("dateSuivi"));

    var c = P.ajouterProspect(commun);
    tiroir.hide();
    P.notifier(c.prenom + " " + c.nom + " ajouté aux données de démonstration (non enregistré en base).");
    if (apresEnregistrement) apresEnregistrement(c.id);
  });

  // Correction en direct : le message disparaît dès que le champ est modifié.
  form.addEventListener("input", function (e) {
    if (e.target.classList.contains("is-invalid")) e.target.classList.remove("is-invalid");
  });

  window.ProspectsTiroir = { ouvrirCreation: ouvrirCreation, ouvrirModification: ouvrirModification };
})();
