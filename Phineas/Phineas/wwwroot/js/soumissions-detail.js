// Détail d'une soumission : en-tête, offre (édition du brouillon ou lecture), scénarios, aperçu client, versions.
(function () {
  "use strict";

  var S = window.Soumissions, P = window.Prospects, UI = window.SoumissionsUI, C = window.SoumissionsCalcul;
  var racine = document.getElementById("soumission");
  if (!S || !P || !UI || !racine) return;
  var esc = P.esc;
  var id = racine.dataset.soumissionId;

  var form = document.getElementById("form-offre");
  var indicateur = racine.querySelector("[data-indicateur-modifie]");
  var offreModifiee = false;
  var scenariosModifies = false;
  var versionRemplie = null; // « id|numéro » de la version chargée dans l'éditeur
  var versionApercu = null;
  var editeur = window.EditeurOffre(form, {
    surChangement: function (offre) {
      definirModifiee(true);
      zone("detail-prix").innerHTML = UI.detailPrix(offre);
    },
  });

  function zone(nom) {
    return racine.querySelector('[data-zone="' + nom + '"]');
  }
  function remplir(nom, html) {
    racine.querySelectorAll('[data-champ="' + nom + '"]').forEach(function (x) { x.innerHTML = html; });
  }
  function onglet(nom) {
    bootstrap.Tab.getOrCreateInstance(document.getElementById("onglet-" + nom)).show();
  }
  function definirModifiee(v) {
    offreModifiee = v;
    indicateur.hidden = !v;
  }
  function confirmerAbandon() {
    return !(offreModifiee || scenariosModifies) || window.confirm("Abandonner les modifications non enregistrées ?");
  }

  // ---------- En-tête et alertes ----------
  function rendreTete(s, v) {
    var c = P.contact(s.prospectId);
    var o = P.opportunite(s.opportuniteId);
    var r = C.calculer(v.offre, S.parametres);
    document.title = s.reference + " · Phineas";
    remplir("reference", esc(s.reference));
    remplir("badges", UI.pastilleStatut(v.statut) + '<span class="badge-soft">Version ' + v.numero + (s.versions.length > 1 ? " sur " + s.versions.length : "") + "</span>" +
      (S.estModifiable(s) ? "" : '<span class="badge-soft"><i class="bi bi-lock"></i>Figée</span>'));
    remplir("client", c
      ? '<a href="' + esc(P.urlFiche(c.id)) + '">' + esc(c.prenom + " " + c.nom) + "</a>" + '<span class="pr-sous d-block">' + esc(c.telephone || c.courriel || "") + "</span>"
      : '<span class="text-muted">Prospect introuvable</span>');
    remplir("opportunite", o
      ? '<a href="' + esc(P.urlFiche(o.prospectId) + "#opportunites") + '">' + esc(o.titre) + '</a><span class="pr-sous d-block">' + esc(P.libelleEtape(o.etape)) + "</span>"
      : '<span class="text-muted">Opportunité introuvable</span>');
    remplir("vehicule", esc(S.nomVehicule(v.vehicule)) + '<span class="pr-sous d-block">N° ' + esc(v.vehicule.numeroStock) + "</span>");
    var depassee = S.validiteDepassee(v);
    remplir("validite", esc(P.dateCourte(v.offre.dateValidite)) + (depassee ? '<span class="so-texte-alerte d-block">Validité dépassée</span>' : '<span class="pr-sous d-block">' + esc(P.echeance(v.offre.dateValidite)) + "</span>"));
    var montant = v.offre.modeAchat === "financement"
      ? (r.financement.etat === "ok" ? esc(UI.montant(r.financement.versement)) + " / mois" : '<span class="so-a-confirmer">Versement à calculer</span>') + '<span class="pr-sous d-block">simulation, ' + esc(v.offre.dureeMois) + " mois</span>"
      : esc(UI.montant(r.totalEstime)) + '<span class="pr-sous d-block">comptant, ' + (r.taxes === null ? "avant taxes" : "taxes estimées") + "</span>";
    remplir("montant", montant);
    remplir("nb-versions", String(s.versions.length));
    remplir("numero-version", String(v.numero));

    racine.querySelectorAll('[data-action="modifier"]').forEach(function (b) { b.hidden = !S.estModifiable(s); });
    racine.querySelectorAll('[data-action="version"]').forEach(function (b) { b.hidden = !S.peutNouvelleVersion(s); });
    var transitions = S.transitions(s);
    zone("menu-statut").hidden = transitions.length === 0;
    zone("transitions").innerHTML = transitions.map(function (t) {
      return '<li><button type="button" class="dropdown-item" data-statut="' + esc(t.cle) + '">' + esc(t.action) + "</button></li>";
    }).join("") + '<li><hr class="dropdown-divider" /></li><li><span class="dropdown-item-text small text-muted">Statuts déclarés localement : aucun envoi ni réponse réels.</span></li>';
  }

  function rendreAlertes(s, v) {
    var a = [];
    var ecart = S.ecartInventaire(v);
    if (ecart.introuvable) a.push(["danger", "Le véhicule de cette version n'existe plus dans l'inventaire de démonstration."]);
    else {
      if (!ecart.disponible) a.push(["warning", "Le véhicule est maintenant « " + S.libelleStatutVehicule(ecart.statut) + " » dans l'inventaire : la vente n'est pas garantie. Proposez un autre véhicule dans une nouvelle version ou un brouillon."]);
      if (ecart.prix !== null) a.push(["info", "Le prix d'inventaire actuel (" + P.argent(ecart.prix) + ") diffère de celui de cette version (" + P.argent(v.vehicule.prixDemande) + "). La version n'est pas modifiée automatiquement."]);
    }
    if (S.validiteDepassee(v)) a.push(["warning", "La date de validité est dépassée."]);
    if (v.offre.modeAchat === "financement" && (v.offre.tauxAnnuel === null || v.offre.tauxAnnuel === undefined)) a.push(["info", "Taux hypothétique à saisir pour calculer la simulation de financement."]);
    zone("alertes").innerHTML = a.map(function (x) {
      var icone = x[0] === "info" ? "bi-info-circle" : "bi-exclamation-triangle";
      return '<div class="alert alert-' + x[0] + ' d-flex gap-2 align-items-start small" role="status"><i class="bi ' + icone + '"></i><span>' + esc(x[1]) + "</span></div>";
    }).join("");
  }

  // ---------- Offre ----------
  function rendreOffre(s, v) {
    var modifiable = S.estModifiable(s);
    zone("offre-edition").hidden = !modifiable;
    zone("offre-lecture").hidden = modifiable;
    var cle = s.id + "|" + v.numero;
    if (modifiable) {
      if (versionRemplie !== cle || !offreModifiee) {
        editeur.remplir(v.offre, v.vehicule);
        versionRemplie = cle;
        definirModifiee(false);
      }
      zone("detail-prix").innerHTML = UI.detailPrix(offreModifiee ? editeur.lire() : v.offre);
    } else {
      versionRemplie = null;
      definirModifiee(false);
      var o = v.offre;
      zone("offre-resume").innerHTML = '<dl class="pr-liste-def pr-liste-def-compacte so-resume-offre">' +
        "<div><dt>Véhicule</dt><dd>" + esc(S.nomVehicule(v.vehicule)) + " · N° " + esc(v.vehicule.numeroStock) + "</dd></div>" +
        "<div><dt>Mode d'achat</dt><dd>" + (o.modeAchat === "comptant" ? "Comptant" : "Financement, " + esc(o.dureeMois) + " mois, taux hypothétique " + esc(S.tauxTexte(o.tauxAnnuel))) + "</dd></div>" +
        "<div><dt>Options</dt><dd>" + esc((o.options || []).map(function (x) { return x.libelle; }).join(", ") || "Aucune") + "</dd></div>" +
        "<div><dt>Commentaires</dt><dd>" + esc(o.commentaires || "—") + "</dd></div></dl>";
      zone("detail-prix").innerHTML = UI.detailPrix(o);
    }
  }

  // ---------- Scénarios ----------
  var comparateur = null;
  function rendreScenarios(s, v) {
    if (scenariosModifies && comparateur) return;
    var scenarios = v.scenarios && v.scenarios.length ? v.scenarios : S.scenariosParDefaut(v);
    var modifiable = S.estModifiable(s);
    var conteneur = zone("comparateur");
    var copie = conteneur.cloneNode(false); // retire les anciens écouteurs
    conteneur.parentNode.replaceChild(copie, conteneur);
    comparateur = UI.comparateur(copie, {
      offre: offreModifiee ? editeur.lire() : v.offre,
      scenarios: scenarios,
      modifiable: modifiable,
      surChangement: function () {
        scenariosModifies = true;
        racine.querySelector("[data-enregistrer-scenarios]").hidden = false;
      },
    });
    racine.querySelector("[data-enregistrer-scenarios]").hidden = true;
  }

  // ---------- Aperçu ----------
  var selApercu = document.getElementById("apercu-version");
  function rendreApercu(s) {
    if (!versionApercu || !S.version(s, versionApercu)) versionApercu = S.versionCourante(s).numero;
    selApercu.innerHTML = s.versions.slice().reverse().map(function (x) {
      return '<option value="' + x.numero + '">Version ' + x.numero + " · " + esc(S.libelleStatut(x.statut)) + (x.numero === S.versionCourante(s).numero ? " (actuelle)" : "") + "</option>";
    }).join("");
    selApercu.value = String(versionApercu);
    zone("document").innerHTML = UI.documentClient(s, S.version(s, versionApercu));
  }

  // ---------- Versions ----------
  var selA = document.getElementById("comparer-a"), selB = document.getElementById("comparer-b");
  function rendreVersions(s) {
    zone("versions").innerHTML = s.versions.slice().reverse().map(function (v) {
      var precedente = S.version(s, v.numero - 1);
      var diffs = precedente ? S.differences(precedente, v) : [];
      return '<li class="so-version">' +
        '<div class="so-version-tete"><strong>Version ' + v.numero + "</strong>" + UI.pastilleStatut(v.statut) +
        '<span class="pr-sous">' + esc(P.dateCourte(v.date)) + " · " + esc(v.auteur) + "</span></div>" +
        (v.note ? "<p>" + esc(v.note) + "</p>" : "") +
        (precedente
          ? (diffs.length ? '<ul class="so-diffs">' + diffs.map(function (d) { return "<li><span>" + esc(d.libelle) + "</span> " + esc(d.avant) + ' <i class="bi bi-arrow-right"></i> ' + esc(d.apres) + "</li>"; }).join("") + "</ul>" : '<p class="pr-sous">Aucun changement sur les éléments principaux.</p>')
          : '<p class="pr-sous">Proposition initiale.</p>') +
        '<button type="button" class="btn btn-sm btn-link p-0" data-voir-version="' + v.numero + '">Prévisualiser cette version</button>' +
        "</li>";
    }).join("");

    var options = s.versions.map(function (v) { return '<option value="' + v.numero + '">Version ' + v.numero + "</option>"; }).join("");
    var a = selA.value, b = selB.value;
    selA.innerHTML = selB.innerHTML = options;
    var n = s.versions.length;
    selA.value = a && S.version(s, Number(a)) ? a : String(Math.max(1, n - 1));
    selB.value = b && S.version(s, Number(b)) ? b : String(n);
    comparerVersions(s);
  }
  function comparerVersions(s) {
    var va = S.version(s, Number(selA.value)), vb = S.version(s, Number(selB.value));
    var z = zone("comparaison-versions");
    if (!va || !vb) { z.innerHTML = ""; return; }
    if (va.numero === vb.numero) { z.innerHTML = '<p class="text-muted small mb-0">Choisissez deux versions différentes.</p>'; return; }
    var diffs = S.differences(va, vb);
    var ra = C.calculer(va.offre, S.parametres), rb = C.calculer(vb.offre, S.parametres);
    function cout(r, o) { return o.modeAchat === "comptant" ? r.totalEstime : r.financement.etat === "ok" ? r.financement.coutTotal : null; }
    var ca = cout(ra, va.offre), cb = cout(rb, vb.offre);
    z.innerHTML = (diffs.length
      ? '<table class="table table-sm so-table-diff"><thead><tr><th scope="col">Élément</th><th scope="col">v' + va.numero + '</th><th scope="col">v' + vb.numero + "</th></tr></thead><tbody>" +
        diffs.map(function (d) { return '<tr><th scope="row">' + esc(d.libelle) + "</th><td>" + esc(d.avant) + "</td><td>" + esc(d.apres) + "</td></tr>"; }).join("") +
        '<tr class="so-ligne-cout"><th scope="row">Coût total estimé</th><td>' + (ca === null ? "À confirmer" : esc(UI.montant(ca))) + "</td><td>" + (cb === null ? "À confirmer" : esc(UI.montant(cb))) + "</td></tr></tbody></table>"
      : '<p class="text-muted small">Aucune différence sur les éléments principaux.</p>') +
      '<p class="pr-note mb-0">Chaque version est un instantané : la modifier n\'altère jamais les précédentes.</p>';
  }
  selA.addEventListener("change", function () { comparerVersions(S.soumission(id)); });
  selB.addEventListener("change", function () { comparerVersions(S.soumission(id)); });

  // ---------- Rendu global ----------
  function rendre() {
    var s = S.soumission(id);
    document.getElementById("soumission-introuvable").hidden = !!s;
    racine.hidden = !s;
    if (!s) return;
    var v = S.versionCourante(s);
    rendreTete(s, v);
    rendreAlertes(s, v);
    rendreOffre(s, v);
    rendreScenarios(s, v);
    rendreApercu(s);
    rendreVersions(s);
  }

  // ---------- Actions ----------
  racine.querySelector("[data-enregistrer-offre]").addEventListener("click", function () {
    if (!editeur.valider()) return;
    var resultat = S.enregistrerOffre(id, editeur.lire(), editeur.vehicule());
    if (!resultat) return P.notifier("Cette version n'est plus modifiable.");
    definirModifiee(false);
    scenariosModifies = false;
    rendre();
    P.notifier(resultat === "repasse-brouillon"
      ? "Offre enregistrée localement. Modifiée, elle repasse en brouillon."
      : "Offre enregistrée localement (non enregistrée en base).");
  });
  racine.querySelector("[data-annuler-offre]").addEventListener("click", function () {
    definirModifiee(false);
    versionRemplie = null;
    rendre();
  });
  racine.querySelector("[data-enregistrer-scenarios]").addEventListener("click", function () {
    if (!comparateur || !S.enregistrerScenarios(id, comparateur.scenarios())) return;
    scenariosModifies = false;
    rendre();
    P.notifier("Scénarios enregistrés avec cette version (localement).");
  });
  selApercu.addEventListener("change", function () {
    versionApercu = Number(selApercu.value);
    rendreApercu(S.soumission(id));
  });

  var modalVersion = bootstrap.Modal.getOrCreateInstance(document.getElementById("modal-version"));
  var formVersion = document.getElementById("form-version");
  formVersion.addEventListener("submit", function (e) {
    e.preventDefault();
    var note = formVersion.elements.note;
    note.classList.toggle("is-invalid", !note.value.trim());
    if (!note.value.trim()) return note.focus();
    var v = S.nouvelleVersion(id, note.value.trim());
    modalVersion.hide();
    if (!v) return;
    versionRemplie = null;
    versionApercu = v.numero;
    rendre();
    onglet("offre");
    P.notifier("Version " + v.numero + " créée en brouillon. La version précédente reste inchangée.");
  });
  document.getElementById("modal-version").addEventListener("shown.bs.modal", function () { formVersion.elements.note.focus(); });

  racine.addEventListener("click", function (e) {
    var b = e.target.closest("[data-action], [data-statut], [data-voir-version], [data-retour-edition], [data-imprimer]");
    if (!b) return;
    var s = S.soumission(id);
    if (b.dataset.statut) return changerStatut(s, b.dataset.statut);
    if (b.dataset.voirVersion) {
      versionApercu = Number(b.dataset.voirVersion);
      rendreApercu(s);
      return onglet("apercu");
    }
    if (b.hasAttribute("data-retour-edition")) return onglet("offre");
    if (b.hasAttribute("data-imprimer")) return window.print();
    switch (b.dataset.action) {
      case "modifier":
        onglet("offre");
        form.elements.prixAnnonce.focus();
        break;
      case "version":
        formVersion.reset();
        formVersion.elements.note.classList.remove("is-invalid");
        modalVersion.show();
        break;
      case "apercu":
        versionApercu = S.versionCourante(s).numero;
        rendreApercu(s);
        onglet("apercu");
        break;
      case "dupliquer":
        if (!confirmerAbandon()) return;
        if (!window.confirm("Créer une nouvelle soumission (brouillon) à partir de la version " + S.versionCourante(s).numero + " ?")) return;
        var copie = S.dupliquer(id);
        if (copie) {
          offreModifiee = scenariosModifies = false;
          window.location.href = S.urlDetail(copie.id) + "#offre";
        }
        break;
    }
  });

  // Les statuts « émis » exigent une offre complète ; tous restent des déclarations locales.
  function changerStatut(s, cible) {
    var v = S.versionCourante(s);
    if (offreModifiee) return P.notifier("Enregistrez ou annulez d'abord les modifications de l'offre.");
    if (cible === "PreteAEnvoyer" || cible === "Envoyee") {
      var erreurs = C.valider(v.offre, S.parametres);
      var r = C.calculer(v.offre, S.parametres);
      var ecart = S.ecartInventaire(v);
      var bloquant = Object.keys(erreurs).length ? "L'offre contient des champs à corriger."
        : v.offre.modeAchat === "financement" && r.financement.etat !== "ok" ? "La simulation de financement est incomplète (taux hypothétique à saisir)."
        : ecart.introuvable || (ecart.statut === "Vendu" || ecart.statut === "Livre") ? "Le véhicule n'est plus disponible."
        : S.validiteDepassee(v) ? "La date de validité est dépassée."
        : null;
      if (bloquant) return P.notifier("Impossible : " + bloquant);
    }
    var messages = {
      Envoyee: "Confirmez que la soumission a été transmise au client en dehors de Phineas. Aucun envoi n'est effectué.",
      Acceptee: "Confirmez que le client a déclaré accepter cette proposition. Ce statut reste local et ne vaut pas signature.",
      Refusee: "Noter le refus du client ?",
      Annulee: "Annuler cette soumission ?",
    };
    if (messages[cible] && !window.confirm(messages[cible])) return;
    var annuler = S.changerStatut(s.id, cible);
    if (!annuler) return;
    rendre();
    P.notifier("Statut : « " + S.libelleStatut(cible) + " » (déclaration locale).", function () { annuler(); rendre(); });
  }

  racine.querySelectorAll('[data-bs-toggle="tab"]').forEach(function (t) {
    t.addEventListener("shown.bs.tab", function () {
      history.replaceState(null, "", "#" + t.id.replace("onglet-", ""));
      if (t.id === "onglet-scenarios" && !scenariosModifies) rendreScenarios(S.soumission(id), S.versionCourante(S.soumission(id)));
    });
  });
  window.addEventListener("beforeunload", function (e) {
    if (offreModifiee || scenariosModifies) { e.preventDefault(); e.returnValue = ""; }
  });

  S.abonner(rendre);
  rendre();
  var hash = window.location.hash.replace("#", "");
  if (["offre", "scenarios", "apercu", "versions"].indexOf(hash) >= 0 && !racine.hidden) onglet(hash);
})();
