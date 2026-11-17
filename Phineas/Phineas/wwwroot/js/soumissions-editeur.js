// Éditeur d'offre (formulaire _EditeurOffre) : remplissage, lecture, validation, visibilité conditionnelle.
// Utilisé par le parcours de création et par le détail d'une soumission modifiable.
(function () {
  "use strict";

  window.EditeurOffre = function (form, reglages) {
    var S = window.Soumissions, C = window.SoumissionsCalcul, P = window.Prospects;
    reglages = reglages || {};
    var vehicule = null;
    var optionsInstantane = {}; // prix des options déjà présentes dans la version (jamais repris du catalogue)
    var resume = form.querySelector("[data-resume-erreurs]");
    var boutonPrix = form.querySelector("[data-prix-inventaire]");
    var choixVehicule = form.querySelector("[data-choix-vehicule]");

    function champ(nom) {
      return form.elements[nom];
    }
    function texte(nom) {
      var c = champ(nom);
      return c ? String(c.value || "").trim() : "";
    }
    function nombreOuNull(nom) {
      var v = texte(nom);
      return v === "" ? null : Number(v);
    }
    function radio(nom) {
      var r = form.querySelector('input[name="' + nom + '"]:checked');
      return r ? r.value : null;
    }

    function majVisibilite() {
      var remise = Number(texte("remise")) > 0;
      form.querySelector("[data-si-remise]").hidden = !remise;
      form.querySelector("[data-si-reprise]").hidden = !champ("avecReprise").checked;
      var finance = radio("modeAchat") === "financement";
      form.querySelectorAll("[data-si-financement]").forEach(function (x) { x.hidden = !finance; });
      if (boutonPrix) {
        var actuel = vehicule ? S.vehicule(vehicule.id) : null;
        var different = actuel && Number(texte("prixAnnonce")) !== actuel.prixDemande;
        boutonPrix.hidden = !different;
        if (different) boutonPrix.textContent = "Reprendre le prix actuel de l'inventaire (" + P.argent(actuel.prixDemande) + ")";
      }
    }

    function remplirChoixVehicule() {
      if (!choixVehicule) return;
      choixVehicule.innerHTML = S.inventaire().filter(function (v) {
        return (v.statutActuel !== "Vendu" && v.statutActuel !== "Livre") || (vehicule && v.id === vehicule.id);
      }).map(function (v) {
        var etat = S.disponible(v) ? "" : " — " + S.libelleStatutVehicule(v.statutActuel);
        return '<option value="' + P.esc(v.id) + '">' + P.esc(v.numeroStock + " · " + S.nomVehicule(v) + " · " + P.argent(v.prixDemande) + etat) + "</option>";
      }).join("");
      if (vehicule) choixVehicule.value = vehicule.id;
    }

    function remplir(offre, veh) {
      vehicule = veh ? JSON.parse(JSON.stringify(veh)) : null;
      form.reset();
      effacerErreurs();
      champ("prixAnnonce").value = offre.prixAnnonce == null ? "" : offre.prixAnnonce;
      champ("remise").value = offre.remise || "";
      champ("motifRemise").value = offre.motifRemise || "";
      optionsInstantane = {};
      (offre.options || []).forEach(function (o) { optionsInstantane[o.code] = o; });
      form.querySelectorAll('input[name="options"]').forEach(function (x) { x.checked = !!optionsInstantane[x.value]; });
      champ("inclureTaxes").checked = offre.inclureTaxes !== false;
      champ("avecReprise").checked = !!offre.reprise;
      champ("repriseVehicule").value = offre.reprise ? offre.reprise.vehicule || "" : "";
      champ("repriseValeur").value = offre.reprise && offre.reprise.valeurEstimee != null ? offre.reprise.valeurEstimee : "";
      champ("repriseSolde").value = offre.reprise && offre.reprise.soldePret != null ? offre.reprise.soldePret : "";
      var mode = form.querySelector('input[name="modeAchat"][value="' + (offre.modeAchat || "financement") + '"]');
      if (mode) mode.checked = true;
      champ("acompteVerse").value = offre.acompteVerse || "";
      champ("miseDeFonds").value = offre.miseDeFonds || "";
      champ("dureeMois").value = String(offre.dureeMois || 60);
      champ("tauxAnnuel").value = offre.tauxAnnuel == null ? "" : offre.tauxAnnuel;
      champ("dateValidite").value = P.versChampDate(offre.dateValidite);
      champ("dateValidite").min = P.aujourdhuiChamp();
      champ("commentaires").value = offre.commentaires || "";
      remplirChoixVehicule();
      majVisibilite();
    }

    function lire() {
      var options = [];
      form.querySelectorAll('input[name="options"]:checked').forEach(function (x) {
        var o = optionsInstantane[x.value] || S.options.filter(function (c) { return c.code === x.value; })[0];
        if (o) options.push({ code: o.code, libelle: o.libelle, prix: o.prix });
      });
      var finance = radio("modeAchat") === "financement";
      var validite = P.depuisChampDate(texte("dateValidite"));
      return {
        prixAnnonce: nombreOuNull("prixAnnonce"),
        remise: Number(texte("remise")) || 0,
        motifRemise: Number(texte("remise")) > 0 ? texte("motifRemise") || null : null,
        options: options,
        reprise: champ("avecReprise").checked
          ? { vehicule: texte("repriseVehicule"), valeurEstimee: nombreOuNull("repriseValeur"), soldePret: nombreOuNull("repriseSolde") }
          : null,
        miseDeFonds: finance ? Number(texte("miseDeFonds")) || 0 : 0,
        acompteVerse: Number(texte("acompteVerse")) || 0,
        modeAchat: finance ? "financement" : "comptant",
        dureeMois: Number(texte("dureeMois")),
        tauxAnnuel: finance ? nombreOuNull("tauxAnnuel") : null,
        inclureTaxes: champ("inclureTaxes").checked,
        commentaires: texte("commentaires") || null,
        dateValidite: validite ? validite.toISOString() : null,
      };
    }

    function effacerErreurs() {
      form.querySelectorAll(".is-invalid").forEach(function (x) { x.classList.remove("is-invalid"); });
      if (resume) resume.classList.add("d-none");
    }

    function valider() {
      effacerErreurs();
      var offre = lire();
      var erreurs = C.valider(offre, S.parametres);
      if (offre.dateValidite && P.ecartJours(offre.dateValidite) < 0) erreurs.dateValidite = "La date de validité ne peut pas être passée.";
      var premiers = [];
      Object.keys(erreurs).forEach(function (cle) {
        var c = champ(cle);
        if (!c) return;
        c.classList.add("is-invalid");
        var fb = form.querySelector('[data-erreur="' + cle + '"]');
        if (fb) fb.textContent = erreurs[cle];
        premiers.push(c);
      });
      if (premiers.length) {
        if (resume) {
          resume.textContent = premiers.length === 1 ? "Un champ est à corriger." : premiers.length + " champs sont à corriger.";
          resume.classList.remove("d-none");
        }
        premiers[0].focus();
        return false;
      }
      return true;
    }

    function signaler() {
      majVisibilite();
      if (reglages.surChangement) reglages.surChangement(lire(), vehicule);
    }
    form.addEventListener("input", function (e) {
      e.target.classList.remove("is-invalid");
      signaler();
    });
    form.addEventListener("change", function (e) {
      if (e.target === choixVehicule) {
        var v = S.vehicule(choixVehicule.value);
        if (v) {
          vehicule = JSON.parse(JSON.stringify(v));
          champ("prixAnnonce").value = v.prixDemande;
        }
      }
      signaler();
    });
    if (boutonPrix) {
      boutonPrix.addEventListener("click", function () {
        var actuel = vehicule && S.vehicule(vehicule.id);
        if (!actuel) return;
        champ("prixAnnonce").value = actuel.prixDemande;
        vehicule = JSON.parse(JSON.stringify(actuel));
        signaler();
      });
    }
    form.addEventListener("submit", function (e) { e.preventDefault(); });

    return {
      remplir: remplir,
      lire: lire,
      valider: valider,
      vehicule: function () { return vehicule; },
    };
  };
})();
