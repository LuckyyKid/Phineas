// Page « Soumissions » (Views/Soumissions/Index.cshtml, maquette 10) : compteurs, recherche, filtres et tableau.
// Les données viennent du store des soumissions (window.Soumissions) et des prospects (window.Prospects).
// Le tableau s'affiche 6 soumissions par page, avec une barre de pagination en pied de carte.
(function () {
  "use strict";

  var S = window.Soumissions, P = window.Prospects, UI = window.SoumissionsUI;
  if (!S || !P || !UI) return;
  var esc = P.esc;

  // Nombre de soumissions par page.
  var SOUMISSIONS_PAR_PAGE = 6;
  // Page affichée ; revient à 1 à chaque nouvelle recherche ou nouveau filtre.
  var pageCourante = 1;

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

  // ---------- Pagination ----------
  // Numéros affichés : toutes les pages jusqu'à 7, sinon la première, la dernière et les voisines de la page courante.
  // Un null marque un trou entre deux numéros (affiché « … »). Exemple pour 10 pages, page 5 : 1 … 4 5 6 … 10.
  // Même règle que la liste des prospects et le Centre d'actions.
  function numerosPages(nbPages, page) {
    var numeros = [];
    var precedent = 0;
    for (var n = 1; n <= nbPages; n++) {
      var estAuBord = n === 1 || n === nbPages;
      var estVoisine = Math.abs(n - page) <= 1;
      if (nbPages <= 7 || estAuBord || estVoisine) {
        if (n - precedent > 1) numeros.push(null);
        numeros.push(n);
        precedent = n;
      }
    }
    return numeros;
  }

  function boutonPage(numero, libelle, contenu, desactive, courant) {
    var classe = "sl-page-btn";
    if (courant) classe += " is-active";
    return '<button type="button" class="' + classe + '" data-aller-page="' + numero + '"' +
      (desactive ? " disabled" : "") + (courant ? ' aria-current="page"' : "") + ' aria-label="' + libelle + '">' + contenu + "</button>";
  }

  // Barre « 1 à 6 sur 24 », flèches et numéros ; vide si tout tient sur une page.
  function htmlPagination(total, nbPages) {
    if (nbPages <= 1) return "";
    var debut = (pageCourante - 1) * SOUMISSIONS_PAR_PAGE + 1;
    var fin = Math.min(total, pageCourante * SOUMISSIONS_PAR_PAGE);
    var html = '<span class="sl-pages-info">' + debut + " à " + fin + " sur " + total + "</span>" +
      '<div class="sl-pages">' +
      boutonPage(pageCourante - 1, "Page précédente", '<i class="bi bi-chevron-left"></i>', pageCourante === 1, false);
    numerosPages(nbPages, pageCourante).forEach(function (numero) {
      if (numero === null) html += '<span class="sl-pages-trou" aria-hidden="true">…</span>';
      else html += boutonPage(numero, "Page " + numero, String(numero), false, numero === pageCourante);
    });
    html += boutonPage(pageCourante + 1, "Page suivante", '<i class="bi bi-chevron-right"></i>', pageCourante === nbPages, false) + "</div>";
    return html;
  }

  function rendre() {
    compteurs();
    remplirOpportunites();
    var items = S.liste().filter(correspond).sort(function (a, b) { return new Date(S.dateModification(b)) - new Date(S.dateModification(a)); });
    // La liste a pu raccourcir (filtre, statut changé) : on reste sur une page qui existe.
    var nbPages = Math.max(1, Math.ceil(items.length / SOUMISSIONS_PAR_PAGE));
    if (pageCourante > nbPages) pageCourante = nbPages;
    var debut = (pageCourante - 1) * SOUMISSIONS_PAR_PAGE;
    corps.innerHTML = items.slice(debut, debut + SOUMISSIONS_PAR_PAGE).map(ligne).join("");

    var aucuneSoumission = S.liste().length === 0;
    zone.hidden = items.length === 0;
    aucun.hidden = !aucuneSoumission;
    vide.hidden = aucuneSoumission || items.length > 0;

    // Pied de carte : la pagination, seulement s'il y a plus d'une page.
    pied.innerHTML = htmlPagination(items.length, nbPages);
    pied.hidden = nbPages <= 1;

    resultat.textContent = items.length + " soumission" + (items.length > 1 ? "s" : "") + (filtresActifs() ? " correspondant" + (items.length > 1 ? "s" : "") + " aux critères" : "");
    document.querySelector(".sl-outils [data-effacer-filtres]").hidden = !filtresActifs();
  }

  // Une nouvelle recherche ou un nouveau filtre repart de la page 1.
  function relancer() {
    pageCourante = 1;
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
  // Clic sur la pagination : change de page, garde le focus sur le numéro choisi et remonte la carte en vue.
  pied.addEventListener("click", function (e) {
    var bouton = e.target.closest("[data-aller-page]");
    if (!bouton || bouton.disabled) return;
    pageCourante = Number(bouton.dataset.allerPage);
    rendre();
    var numeroChoisi = pied.querySelector('[aria-current="page"]');
    if (numeroChoisi) numeroChoisi.focus();
    document.querySelector(".sl-module").scrollIntoView({ block: "start", behavior: "smooth" });
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
