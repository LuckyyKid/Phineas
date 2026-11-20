// Pagination des listes des pages « Outils » (Assistant vendeur, Studio d'annonces, Acquisition commerciale).
// Au-delà de 6 éléments, une liste se découpe en pages : la page reste courte, sans défilement sans fin.
// Même règle et même rendu que la pagination du Centre d'actions. Styles : .og-pagination dans outils.css.
//
// Utilisation dans une page :
//   var pages = {};                                   // page courante de chaque liste, par id (ex. pages.liens = 2)
//   var morceau = OutilsPagination.decouper(pages, "liens", tousLesLiens);
//   ... afficher morceau.elements, puis :
//   OutilsPagination.afficherBarre(racine, "liens", morceau.pagination);
//   OutilsPagination.ecouterClics(racine, pages, rendre);  // une seule fois, au chargement
// La barre s'écrit dans l'élément <div data-pagination="liens"> placé sous la liste dans la vue.
(function () {
  "use strict";

  var ELEMENTS_PAR_PAGE = 6;

  // Numéros affichés : toutes les pages jusqu'à 7, sinon la première, la dernière et les voisines de la page courante.
  // Un null marque un trou entre deux numéros (affiché « … »). Exemple pour 10 pages, page 5 : 1 … 4 5 6 … 10.
  function numerosPages(nbPages, pageCourante) {
    var numeros = [];
    var precedent = 0;
    for (var page = 1; page <= nbPages; page++) {
      var estAuBord = page === 1 || page === nbPages;
      var estVoisine = Math.abs(page - pageCourante) <= 1;
      if (nbPages <= 7 || estAuBord || estVoisine) {
        if (page - precedent > 1) numeros.push(null);
        numeros.push(page);
        precedent = page;
      }
    }
    return numeros;
  }

  // Page à afficher : la page demandée, ramenée entre 1 et la dernière page (la liste a pu raccourcir).
  function pageValide(pageDemandee, total) {
    var nbPages = Math.max(1, Math.ceil(total / ELEMENTS_PAR_PAGE));
    return Math.min(Math.max(1, pageDemandee || 1), nbPages);
  }

  function boutonPage(idListe, numero, libelle, contenu, desactive, courant) {
    var classe = "og-page-btn";
    if (courant) classe += " is-active";
    return '<button type="button" class="' + classe + '" data-liste="' + idListe + '" data-aller-page="' + numero + '"' +
      (desactive ? " disabled" : "") + (courant ? ' aria-current="page"' : "") + ' aria-label="' + libelle + '">' + contenu + "</button>";
  }

  // Barre « 1 à 6 sur 14 », flèches et numéros, ou "" si tout tient sur une page.
  function htmlPagination(idListe, total, page) {
    var nbPages = Math.ceil(total / ELEMENTS_PAR_PAGE);
    if (nbPages <= 1) return "";
    var debut = (page - 1) * ELEMENTS_PAR_PAGE + 1;
    var fin = Math.min(total, page * ELEMENTS_PAR_PAGE);
    var html = '<nav class="og-pagination" aria-label="Pagination">' +
      '<span class="og-pages-info">' + debut + " à " + fin + " sur " + total + "</span>" +
      '<div class="og-pages">' +
      boutonPage(idListe, page - 1, "Page précédente", '<i class="bi bi-chevron-left"></i>', page === 1, false);
    numerosPages(nbPages, page).forEach(function (numero) {
      if (numero === null) html += '<span class="og-pages-trou" aria-hidden="true">…</span>';
      else html += boutonPage(idListe, numero, "Page " + numero, String(numero), false, numero === page);
    });
    html += boutonPage(idListe, page + 1, "Page suivante", '<i class="bi bi-chevron-right"></i>', page === nbPages, false) +
      "</div></nav>";
    return html;
  }

  // Éléments de la page courante d'une liste, et la barre de pagination à afficher sous la liste.
  // La page retenue est rangée dans pages[idListe].
  function decouper(pages, idListe, elements) {
    var page = pageValide(pages[idListe], elements.length);
    pages[idListe] = page;
    var debut = (page - 1) * ELEMENTS_PAR_PAGE;
    return {
      elements: elements.slice(debut, debut + ELEMENTS_PAR_PAGE),
      pagination: htmlPagination(idListe, elements.length, page),
    };
  }

  // Écrit la barre dans <div data-pagination="idListe"> (s'il existe dans la page).
  function afficherBarre(racine, idListe, html) {
    var conteneur = racine.querySelector('[data-pagination="' + idListe + '"]');
    if (conteneur) conteneur.innerHTML = html;
  }

  // Clic sur un bouton de pagination : change de page, redessine, puis garde le focus sur le numéro choisi.
  function ecouterClics(racine, pages, rendre) {
    racine.addEventListener("click", function (e) {
      var bouton = e.target.closest("[data-aller-page]");
      if (!bouton || bouton.disabled) return;
      var idListe = bouton.dataset.liste;
      pages[idListe] = Number(bouton.dataset.allerPage);
      rendre();
      var pageCourante = racine.querySelector('[data-liste="' + idListe + '"][aria-current="page"]');
      if (pageCourante) pageCourante.focus();
    });
  }

  window.OutilsPagination = {
    ELEMENTS_PAR_PAGE: ELEMENTS_PAR_PAGE,
    pageValide: pageValide,
    htmlPagination: htmlPagination,
    decouper: decouper,
    afficherBarre: afficherBarre,
    ecouterClics: ecouterClics,
  };
})();
