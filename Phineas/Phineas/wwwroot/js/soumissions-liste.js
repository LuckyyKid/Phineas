// Page « Soumissions » (Views/Soumissions/Index.cshtml, maquette 10) : compteurs, recherche, filtres et tableau.
// Les données viennent du store des soumissions (window.Soumissions) et des prospects (window.Prospects).
// Le tableau s'affiche par lots de 10 : « Afficher les suivantes » ajoute le lot suivant.
(function () {
  "use strict";

  var S = window.Soumissions, P = window.Prospects, UI = window.SoumissionsUI;
  if (!S || !P || !UI) return;
  var esc = P.esc;

  // Nombre de soumissions ajoutées à chaque clic sur « Afficher les suivantes ».
  var TAILLE_LOT = 10;
  // Nombre de lignes actuellement affichées ; revient à un lot à chaque nouvelle recherche ou nouveau filtre.
  var nbAffichees = TAILLE_LOT;

  var f = {
    recherche: document.getElementById("f-recherche"),
    statut: document.getElementById("f-statut"),
    periode: document.getElementById("f-periode"),
    conseiller: document.getElementById("f-conseiller"),
    opportunite: document.getElementById("f-opportunite"),
  };
  var corps = document.getElementById("liste-corps");
  var zone = document.getElementById("zone-liste");
  var pied = document.getElementById("pied-liste");
  var vide = document.getElementById("etat-vide");
  var aucun = document.getElementById("etat-aucun");
  var resultat = document.getElementById("resultat");
  var boutonSuivantes = document.querySelector("[data-afficher-suivantes]");

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

  // Statut : un point (creux ou plein, selon sl-st-<statut> dans la feuille de style) suivi du libellé, sans fond.
  function statut(cle) {
    return '<span class="sl-statut sl-st-' + esc(cle) + '"><span class="sl-statut-point" aria-hidden="true"></span>' + esc(S.libelleStatut(cle)) + "</span>";
  }

  // Troisième ligne rouge sous le véhicule quand il n'est plus disponible (ex. « Véhicule réservé »).
  function alerteVehicule(v) {
    var ecart = S.ecartInventaire(v);
    if (!ecart.introuvable && ecart.disponible) return "";
    var etat = ecart.introuvable ? "introuvable" : S.libelleStatutVehicule(ecart.statut).toLowerCase();
    return '<span class="sl-alerte"><i class="bi bi-exclamation-triangle" aria-hidden="true"></i>Véhicule ' + esc(etat) + "</span>";
  }

  function ligne(s) {
    var v = S.versionCourante(s);
    var c = P.contact(s.prospectId);
    var o = P.opportunite(s.opportuniteId);
    var conseiller = P.conseiller(s.conseillerId);
    var url = S.urlDetail(s.id);
    var r = window.SoumissionsCalcul.calculer(v.offre, S.parametres);
    var prix = r.prixApresRemise + r.totalOptions;
    var nomClient = c ? c.prenom + " " + c.nom : "Client inconnu";

    var version = "Version " + v.numero;
    if (s.versions.length > 1) version += " sur " + s.versions.length;

    // Le conseiller n'est rappelé que si ce n'est pas moi (la maquette évite « Moi » sur chaque ligne).
    var autreConseiller = "";
    if (!conseiller.moi) {
      var nomConseiller = conseiller.nom;
      if (conseiller.fictif) nomConseiller += " (fictif)";
      autreConseiller = '<span class="sl-sous">' + esc(nomConseiller) + "</span>";
    }

    var depassee = S.validiteDepassee(v);
    var validite = "Jusqu'au " + P.dateCourte(v.offre.dateValidite);
    if (depassee) validite = "Validité dépassée le " + P.dateCourte(v.offre.dateValidite);

    return (
      '<tr data-url="' + esc(url) + '">' +
      '<td><span class="sl-reference">' + esc(s.reference) + '</span><span class="sl-sous">' + esc(version) + "</span></td>" +
      '<td><span class="sl-nom">' + esc(nomClient) + '</span><span class="sl-sous">' + esc(o ? o.titre : "Opportunité introuvable") + "</span>" + autreConseiller + "</td>" +
      "<td><span>" + esc(S.nomVehicule(v.vehicule)) + '</span><span class="sl-sous">N° ' + esc(v.vehicule.numeroStock) + "</span>" + alerteVehicule(v) + "</td>" +
      '<td class="sl-droite"><span class="sl-prix">' + esc(P.argent(prix / 100)) + '</span><span class="sl-sous">avant taxes</span></td>' +
      '<td title="Créée le ' + esc(P.dateCourte(s.dateCreation)) + '"><span class="' + (depassee ? "sl-texte-depasse" : "") + '">' + esc(validite) + "</span>" +
      '<span class="sl-sous">Modifiée ' + esc(P.relatif(S.dateModification(s))) + "</span></td>" +
      "<td>" + statut(v.statut) + "</td>" +
      '<td class="sl-cellule-ouvrir"><a class="sl-ouvrir" href="' + esc(url) + '" aria-label="Ouvrir la soumission ' + esc(s.reference) + '"><i class="bi bi-arrow-right"></i></a></td>' +
      "</tr>"
    );
  }

  function rendre() {
    compteurs();
    remplirOpportunites();
    var items = S.liste().filter(correspond).sort(function (a, b) { return new Date(S.dateModification(b)) - new Date(S.dateModification(a)); });
    var affichees = items.slice(0, nbAffichees);
    corps.innerHTML = affichees.map(ligne).join("");

    var aucuneSoumission = S.liste().length === 0;
    zone.hidden = items.length === 0;
    aucun.hidden = !aucuneSoumission;
    vide.hidden = aucuneSoumission || items.length > 0;

    // Pied : « 10 affichées sur 24 » et le bouton tant qu'il en reste à afficher.
    pied.hidden = items.length === 0;
    document.querySelector("[data-compte-affichees]").textContent = affichees.length + " affichée" + (affichees.length > 1 ? "s" : "") + " sur " + items.length;
    boutonSuivantes.hidden = affichees.length >= items.length;

    resultat.textContent = items.length + " soumission" + (items.length > 1 ? "s" : "") + (filtresActifs() ? " correspondant" + (items.length > 1 ? "s" : "") + " aux critères" : "");
    document.querySelector(".sl-outils [data-effacer-filtres]").hidden = !filtresActifs();
  }

  // Une nouvelle recherche ou un nouveau filtre repart du premier lot.
  function relancer() {
    nbAffichees = TAILLE_LOT;
    rendre();
  }

  f.recherche.addEventListener("input", relancer);
  ["statut", "periode", "conseiller", "opportunite"].forEach(function (k) { f[k].addEventListener("change", relancer); });
  document.querySelectorAll("[data-effacer-filtres]").forEach(function (b) {
    b.addEventListener("click", function () {
      f.recherche.value = f.statut.value = f.periode.value = f.conseiller.value = f.opportunite.value = "";
      relancer();
      f.recherche.focus();
    });
  });
  boutonSuivantes.addEventListener("click", function () {
    nbAffichees += TAILLE_LOT;
    rendre();
  });
  // Un clic n'importe où sur la ligne ouvre la soumission (sauf sur un lien ou pendant une sélection de texte).
  corps.addEventListener("click", function (e) {
    if (e.target.closest("a")) return;
    var tr = e.target.closest("tr[data-url]");
    if (tr && !window.getSelection().toString()) window.location.href = tr.dataset.url;
  });

  S.abonner(rendre);
  P.abonner(rendre);
  rendre();
})();
