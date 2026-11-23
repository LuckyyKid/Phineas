// Tiroir « Nouveau prospect » / « Modifier le prospect ».
// Création : validation ici, puis envoi réel du formulaire à ProspectsController.Creer (enregistrement en base).
// Modification : validation ici, puis écriture locale dans le store (pas encore de backend).
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
    soumettre.disabled = false;
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

    // Création : le serveur valide à nouveau, enregistre, puis renvoie vers la liste (ou rouvre ce tiroir avec ses erreurs).
    // form.submit() n'émet pas d'autre événement « submit » ; le bouton est désactivé contre le double envoi.
    soumettre.disabled = true;
    form.submit();
  });

  // Création refusée par le serveur : on rouvre le tiroir avec la saisie envoyée et les messages reçus.
  function afficherRefusServeur(saisie, erreurs) {
    ouvrirCreation();
    Object.keys(saisie).forEach(function (nom) {
      var v = saisie[nom];
      if (v == null) return;
      if (nom === "contactPrefere") {
        var radio = form.querySelector('input[name="contactPrefere"][value="' + v + '"]');
        if (radio) radio.checked = true;
        return;
      }
      // champ() renvoie un élément unique ; les groupes de boutons radio (sans tagName) sont traités plus haut.
      var c = champ(nom);
      if (!c || !c.tagName) return;
      // Une date arrive au format « 2026-11-30T00:00:00 » : le champ date attend « 2026-11-30 ».
      c.value = nom === "dateSuivi" ? String(v).slice(0, 10) : v;
    });

    var generales = [];
    erreurs.forEach(function (e) {
      var c = e.champ ? champ(e.champ) : null;
      if (c && c.tagName) invalider(e.champ, e.message);
      else generales.push(e.message);
    });
    resumeErreurs.textContent = generales.length
      ? generales.join(" ")
      : (erreurs.length === 1 ? "Un champ est à corriger avant d'enregistrer." : erreurs.length + " champs sont à corriger avant d'enregistrer.");
    resumeErreurs.classList.remove("d-none");
  }

  var retour = P.enregistrement;
  if (retour.saisie && retour.erreurs && retour.erreurs.length) afficherRefusServeur(retour.saisie, retour.erreurs);
  if (retour.confirmation) P.notifier(retour.confirmation);

  // Correction en direct : le message disparaît dès que le champ est modifié.
  form.addEventListener("input", function (e) {
    if (e.target.classList.contains("is-invalid")) e.target.classList.remove("is-invalid");
  });

  window.ProspectsTiroir = { ouvrirCreation: ouvrirCreation, ouvrirModification: ouvrirModification };
})();
