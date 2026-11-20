// Page « Soumissions » : compteurs, recherche, filtres et tableau.
(function () {
  "use strict";

  var S = window.Soumissions, P = window.Prospects, UI = window.SoumissionsUI;
  if (!S || !P || !UI) return;
  var esc = P.esc;

  var f = {
    recherche: document.getElementById("f-recherche"),
    statut: document.getElementById("f-statut"),
    periode: document.getElementById("f-periode"),
    conseiller: document.getElementById("f-conseiller"),
    opportunite: document.getElementById("f-opportunite"),
  };
  var corps = document.getElementById("liste-corps");
  var zone = document.getElementById("zone-liste");
  var vide = document.getElementById("etat-vide");
  var aucun = document.getElementById("etat-aucun");
  var resultat = document.getElementById("resultat");

  function normaliser(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  function filtresActifs() {
    return !!(f.recherche.value.trim() || f.statut.value || f.periode.value || f.conseiller.value || f.opportunite.value);
  }

  // Les opportunités proposées dans le filtre sont celles qui ont au moins une soumission.
  function remplirOpportunites() {
    var actuel = f.opportunite.value;
    var vues = {};
    var options = [];
    S.liste().forEach(function (s) {
      if (vues[s.opportuniteId]) return;
      vues[s.opportuniteId] = true;
      var o = P.opportunite(s.opportuniteId), c = P.contact(s.prospectId);
      options.push({ id: s.opportuniteId, texte: (c ? c.prenom + " " + c.nom + " · " : "") + (o ? o.titre : s.opportuniteId) });
    });
    options.sort(function (a, b) { return a.texte.localeCompare(b.texte, "fr-CA"); });
    f.opportunite.innerHTML = '<option value="">Toutes les opportunités</option>' +
      options.map(function (o) { return '<option value="' + esc(o.id) + '">' + esc(o.texte) + "</option>"; }).join("");
    f.opportunite.value = vues[actuel] ? actuel : "";
  }

  function correspond(s) {
    var v = S.versionCourante(s);
    var c = P.contact(s.prospectId);
    var o = P.opportunite(s.opportuniteId);
    var q = normaliser(f.recherche.value.trim());
    if (q) {
      var texte = normaliser([s.reference, c ? c.prenom + " " + c.nom : "", o ? o.titre : "", S.nomVehicule(v.vehicule), v.vehicule.numeroStock].join(" "));
      if (texte.indexOf(q) < 0) return false;
    }
    if (f.statut.value && v.statut !== f.statut.value) return false;
    if (f.conseiller.value && s.conseillerId !== f.conseiller.value) return false;
    if (f.opportunite.value && s.opportuniteId !== f.opportunite.value) return false;
    if (f.periode.value === "expire") {
      if (!S.validiteDepassee(v)) return false;
    } else if (f.periode.value) {
      if (P.ecartJours(S.dateModification(s)) < -Number(f.periode.value)) return false;
    }
    return true;
  }

  function compteurs() {
    var l = S.liste();
    function nb(statuts) { return l.filter(function (s) { return statuts.indexOf(S.statut(s)) >= 0; }).length; }
    var valeurs = {
      total: l.length,
      preparation: nb(["Brouillon", "PreteAEnvoyer"]),
      envoyees: nb(["Envoyee"]),
      attente: nb(["EnAttente"]),
      acceptees: nb(["Acceptee"]),
    };
    Object.keys(valeurs).forEach(function (k) { document.querySelector('[data-compteur="' + k + '"]').textContent = valeurs[k]; });
  }

  function ligne(s) {
    var v = S.versionCourante(s);
    var c = P.contact(s.prospectId);
    var o = P.opportunite(s.opportuniteId);
    var cons = P.conseiller(s.conseillerId);
    var url = S.urlDetail(s.id);
    var ecart = S.ecartInventaire(v);
    var r = window.SoumissionsCalcul.calculer(v.offre, S.parametres);
    var prix = r.prixApresRemise + r.totalOptions;
    var alerte = ecart.introuvable || !ecart.disponible
      ? '<span class="so-alerte"><i class="bi bi-exclamation-triangle"></i>Véhicule ' + esc(ecart.introuvable ? "introuvable" : S.libelleStatutVehicule(ecart.statut).toLowerCase()) + "</span>"
      : "";
    var depassee = S.validiteDepassee(v);
    return (
      '<tr data-url="' + esc(url) + '">' +
      '<td data-label="Référence"><a class="pr-nom" href="' + esc(url) + '">' + esc(s.reference) + '</a><div class="pr-sous">Version ' + v.numero + (s.versions.length > 1 ? " sur " + s.versions.length : "") + "</div></td>" +
      '<td data-label="Client et opportunité"><div class="fw-semibold">' + esc(c ? c.prenom + " " + c.nom : "Client inconnu") + "</div>" +
      '<div class="pr-sous">' + esc(o ? o.titre : "Opportunité introuvable") + "</div>" +
      '<div class="pr-sous pr-conseiller"><i class="bi bi-person"></i>' + esc(cons.moi ? "Moi" : cons.nom + " (fictif)") + "</div></td>" +
      '<td data-label="Véhicule"><div>' + esc(S.nomVehicule(v.vehicule)) + '</div><div class="pr-sous">' + esc(v.vehicule.numeroStock) + "</div>" + alerte + "</td>" +
      '<td data-label="Prix proposé" class="text-end"><div class="fw-semibold">' + esc(P.argent(prix / 100)) + '</div><div class="pr-sous">avant taxes</div></td>' +
      '<td data-label="Dates"><div class="pr-sous">Créée le ' + esc(P.dateCourte(s.dateCreation)) + "</div>" +
      '<div class="pr-sous">Modifiée ' + esc(P.relatif(S.dateModification(s))) + "</div>" +
      '<div class="pr-sous' + (depassee ? " so-texte-alerte" : "") + '">Valide jusqu\'au ' + esc(P.dateCourte(v.offre.dateValidite)) + (depassee ? " (dépassée)" : "") + "</div></td>" +
      '<td data-label="Statut">' + UI.pastilleStatut(v.statut) + "</td>" +
      "</tr>"
    );
  }

  function rendre() {
    compteurs();
    remplirOpportunites();
    var items = S.liste().filter(correspond).sort(function (a, b) { return new Date(S.dateModification(b)) - new Date(S.dateModification(a)); });
    corps.innerHTML = items.map(ligne).join("");
    var aucuneSoumission = S.liste().length === 0;
    zone.hidden = items.length === 0;
    aucun.hidden = !aucuneSoumission;
    vide.hidden = aucuneSoumission || items.length > 0;
    resultat.hidden = aucuneSoumission;
    resultat.textContent = items.length + " soumission" + (items.length > 1 ? "s" : "") + (filtresActifs() ? " correspondant" + (items.length > 1 ? "s" : "") + " aux critères" : "");
    document.querySelector(".pr-filtres [data-effacer-filtres]").hidden = !filtresActifs();
  }

  f.recherche.addEventListener("input", rendre);
  ["statut", "periode", "conseiller", "opportunite"].forEach(function (k) { f[k].addEventListener("change", rendre); });
  document.querySelectorAll("[data-effacer-filtres]").forEach(function (b) {
    b.addEventListener("click", function () {
      f.recherche.value = f.statut.value = f.periode.value = f.conseiller.value = f.opportunite.value = "";
      rendre();
      f.recherche.focus();
    });
  });
  corps.addEventListener("click", function (e) {
    if (e.target.closest("a")) return;
    var tr = e.target.closest("tr[data-url]");
    if (tr && !window.getSelection().toString()) window.location.href = tr.dataset.url;
  });

  S.abonner(rendre);
  P.abonner(rendre);
  rendre();
})();
