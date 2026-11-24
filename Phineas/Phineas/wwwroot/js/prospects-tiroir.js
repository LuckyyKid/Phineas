// Tiroir « Nouveau prospect » / « Modifier le prospect ».
// Création : validation ici, puis envoi réel du formulaire à ProspectsController.Creer (enregistrement en base).
// Modification d'un prospect enregistré : validation ici, puis envoi réel à ProspectsController.Modifier
//   (contact, et premier intérêt de l'opportunité visée).
// Modification d'un prospect fictif : validation ici, puis écriture locale dans le store (rien n'est enregistré).
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
  var modificationEnregistree = false; // true : le contact modifié est enregistré en base
  var interetVisible = false; // section « Premier intérêt » affichée (création, ou opportunité enregistrée)
  var apresEnregistrement = null;
  var actionCreation = form.getAttribute("action");
  var actionModification = form.dataset.actionModification;
  var opportuniteCiblee = form.querySelector("[data-opportunite-ciblee]");

  function champ(nom) {
    return form.elements[nom];
  }
  function valeur(nom) {
    var c = champ(nom);
    return c ? String(c.value || "").trim() : "";
  }

  // enregistre : le contact modifié vient de la base ; avecInteret : une opportunité enregistrée est visée.
  function definirMode(contactId, enregistre, avecInteret) {
    modeModification = contactId || null;
    var creation = !modeModification;
    modificationEnregistree = !creation && !!enregistre;
    interetVisible = creation || !!avecInteret;
    titre.textContent = creation ? titre.dataset.titreCreation : titre.dataset.titreModification;
    soumettre.textContent = creation ? soumettre.dataset.libelleCreation : soumettre.dataset.libelleModification;
    form.querySelectorAll("[data-creation-seulement]").forEach(function (x) { x.hidden = !creation; });
    form.querySelector("[data-premier-interet]").hidden = !interetVisible;
    form.querySelector("[data-num-attribution]").textContent = interetVisible ? "4" : "3";
    form.setAttribute("action", modificationEnregistree ? actionModification : actionCreation);
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
    definirMode(null, false, false);
    opportuniteCiblee.hidden = true;
    apresEnregistrement = callback || null;
    tiroir.show();
  }

  // opportuniteId : opportunité dont le premier intérêt sera modifié (sinon l'opportunité principale).
  function ouvrirModification(contactId, callback, opportuniteId) {
    var c = P.contact(contactId);
    if (!c) return;
    reinitialiserFormulaire();

    // Seule une opportunité enregistrée (id « oe-… ») d'un prospect enregistré a un premier intérêt modifiable.
    var o = opportuniteId ? P.opportunite(opportuniteId) : P.principale(contactId);
    var opportuniteEnregistree = !!(c.enregistre && o && o.prospectId === contactId && o.id.indexOf("oe-") === 0);
    definirMode(contactId, c.enregistre, opportuniteEnregistree);
    apresEnregistrement = callback || null;

    champ("prospectId").value = c.enregistre ? c.id : "";
    champ("version").value = c.enregistre ? c.version || "" : "";
    champ("opportuniteId").value = opportuniteEnregistree ? o.id : "";
    opportuniteCiblee.hidden = !opportuniteEnregistree;
    if (opportuniteEnregistree) {
      var q = o.qualification || {};
      opportuniteCiblee.textContent = "Opportunité modifiée : " + o.titre;
      champ("categorie").value = q.categorie || "";
      champ("modele").value = (q.modeles || []).join(", ");
      champ("budget").value = q.budgetTotal == null ? "" : q.budgetTotal;
      champ("horizon").value = q.horizon || "";
    }

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

    if (interetVisible) {
      var budget = valeur("budget");
      if (budget !== "" && (isNaN(+budget) || +budget < 0 || +budget > 500000)) {
        erreurs.push(invalider("budget", "Montant entre 0 et 500 000 $."));
      }
    }
    if (creation) {
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

    // Prospect fictif : la modification reste dans cet onglet, et le message le dit.
    if (modeModification && !modificationEnregistree) {
      P.modifierContact(modeModification, commun);
      tiroir.hide();
      P.notifier("Prospect mis à jour (modification locale, non enregistrée).");
      if (apresEnregistrement) apresEnregistrement(modeModification);
      return;
    }

    // Création ou prospect enregistré : le serveur valide à nouveau, enregistre, puis renvoie vers la liste ou la fiche
    // (ou rouvre ce tiroir avec ses erreurs). form.submit() n'émet pas d'autre événement « submit » ;
    // le bouton est désactivé contre le double envoi.
    soumettre.disabled = true;
    form.submit();
  });

  // Envoi refusé par le serveur : on rouvre le tiroir (création ou modification) avec la saisie envoyée et les messages reçus.
  // version : empreinte envoyée avec la saisie refusée. On la remet telle quelle, et non celle des valeurs actuelles :
  // après un conflit, cliquer de nouveau sur « Enregistrer » reste refusé. Pour repartir des valeurs actuelles,
  // l'utilisateur ferme le tiroir et clique sur « Modifier » (ouvrirModification lit alors la nouvelle empreinte).
  function afficherRefusServeur(saisie, erreurs, prospectId, opportuniteId, version) {
    if (prospectId) {
      ouvrirModification(prospectId, null, opportuniteId);
      champ("version").value = version || "";
    } else {
      ouvrirCreation();
    }
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
  if (retour.saisie && retour.erreurs && retour.erreurs.length) {
    afficherRefusServeur(retour.saisie, retour.erreurs, retour.prospectId, retour.opportuniteId, retour.version);
  }
  // Confirmation ou refus sans formulaire à rouvrir (ex. changement d'étape) : affiché une seule fois par page.
  P.afficherMessageServeur();

  // Correction en direct : le message disparaît dès que le champ est modifié.
  form.addEventListener("input", function (e) {
    if (e.target.classList.contains("is-invalid")) e.target.classList.remove("is-invalid");
  });

  window.ProspectsTiroir = { ouvrirCreation: ouvrirCreation, ouvrirModification: ouvrirModification };
})();
