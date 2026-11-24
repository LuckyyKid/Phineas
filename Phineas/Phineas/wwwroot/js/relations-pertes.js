// Page « Ventes perdues » (Views/Relations/Pertes.cshtml) : phrase de résumé, chiffres, liste filtrable et paginée,
// et fiche d'analyse d'une vente perdue (?opportunite=…). Les données viennent de window.RelationsClients (relations-store.js) :
// les indicateurs sont calculés à partir des clôtures enregistrées, aucune statistique n'est codée à la main.
(function () {
  "use strict";

  var RC = window.RelationsClients, P = window.Prospects, I = window.Intelligence, UI = window.IntelligenceUI, RUI = window.RelationsUI;
  var racine = document.getElementById("pertes");
  if (!RC || !P || !UI || !RUI || !racine) return;
  var esc = P.esc, ref = RC.ref;
  var oppId = racine.dataset.opportunite || null;
  var JOUR = 86400000;
  // Au-delà de LIGNES_PAR_PAGE, le tableau se découpe en pages : la page reste courte.
  var LIGNES_PAR_PAGE = 6;
  var page = 1;

  function champ(id) { return document.getElementById(id); }
  var F = ["f-recherche", "f-periode", "f-motif", "f-origine", "f-vehicule", "f-conseiller", "f-recuperable", "f-reactivees", "f-manquantes"];
  function valeur(id) { var e = champ(id); return e.type === "checkbox" ? e.checked : e.value; }
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }

  // Accorde un nom selon le nombre, ex. accord(2, "opportunité", "opportunités") → « 2 opportunités ».
  function accord(nombre, singulier, pluriel) {
    return nombre + " " + (nombre > 1 ? pluriel : singulier);
  }

  function filtrer(l) {
    var q = norm(valeur("f-recherche")), per = Number(valeur("f-periode")) || 0, m = new Date();
    return l.filter(function (x) {
      var cl = x.cloture;
      if (q && norm(x.client + " " + x.opportunite.titre + " " + x.vehicule).indexOf(q) < 0) return false;
      if (per && (m - new Date(cl.date)) / JOUR > per) return false;
      if (valeur("f-motif") && cl.motif !== valeur("f-motif")) return false;
      if (valeur("f-origine") && cl.origine !== valeur("f-origine")) return false;
      if (valeur("f-vehicule") && x.vehicule !== valeur("f-vehicule")) return false;
      if (valeur("f-conseiller") && x.conseillerId !== valeur("f-conseiller")) return false;
      if (valeur("f-recuperable") === "oui" && !x.recuperable) return false;
      if (valeur("f-recuperable") === "non" && x.etat.cle !== "aucune") return false;
      if (valeur("f-reactivees") && !x.reactivee) return false;
      if (valeur("f-manquantes") && !x.informationsManquantes.length) return false;
      return true;
    });
  }
  function filtresActifs() {
    return F.some(function (id) { return id !== "f-conseiller" && valeur(id); }) || valeur("f-conseiller") !== P.moiId;
  }

  // ---------- États : un point de 8 px et un libellé (sans pastille à fond) ----------
  // Origine de l'information sur le motif : plein vert = déclaré, plein gris foncé = confirmé, creux ambre = hypothèse, creux gris = rien.
  var ORIGINES = {
    client: { point: "vert-plein", libelle: "Déclaré par le client" },
    "vendeur-confirme": { point: "gris-plein", libelle: "Confirmé par le conseiller" },
    hypothese: { point: "ambre-creux", libelle: "Hypothèse du conseiller, non confirmée" },
    inconnu: { point: "gris-creux", libelle: "Non renseigné" },
  };
  // Récupération : creux ambre = à vérifier, plein ambre = en attente, creux gris = aucune, creux vert = à faire ou reprise, plein vert = réussie.
  var RECUPERATIONS = {
    "a-verifier": { point: "ambre-creux", libelle: "Récupération à vérifier" },
    "attente-evenement": { point: "ambre-plein", libelle: "En attente d'un événement" },
    aucune: { point: "gris-creux", libelle: "Aucune récupération envisagée" },
    "suivi-planifie": { point: "vert-creux", libelle: "Suivi planifié" },
    reactivee: { point: "vert-creux", libelle: "Réactivée" },
    recuperee: { point: "vert-plein", libelle: "Récupérée avec succès" },
  };

  function etat(definition, precision, infobulle) {
    var d = definition || { point: "gris-creux", libelle: "Non renseigné" };
    return '<span class="rp-etat rp-etat-' + d.point + '"' + (infobulle ? ' title="' + esc(infobulle) + '"' : "") + ">" +
      '<span class="rp-point" aria-hidden="true"></span>' + esc(d.libelle) + "</span>" +
      (precision ? '<span class="rp-sous">' + esc(precision) + "</span>" : "");
  }

  // Précision sous l'état de récupération : ce qui manque, sinon le détail utile (condition, événement, vente).
  function precisionRecuperation(x) {
    var cl = x.cloture, cle = x.etat.cle;
    if (x.informationsManquantes.length) {
      var texte = x.informationsManquantes.join(", ").toLowerCase();
      return texte.charAt(0).toUpperCase() + texte.slice(1);
    }
    if (cle === "reactivee" && cl.reactivation) return cl.reactivation.evenement;
    if (cle === "recuperee" || cle === "suivi-planifie") return x.etat.raison;
    if (cle === "attente-evenement" && cl.conditions) return cl.conditions;
    return "";
  }

  function ligne(x) {
    var cl = x.cloture, a = x.prochaineAction;
    var vehicule = x.soumission
      ? x.soumission.reference + ", " + x.soumission.statutLibelle.toLowerCase()
      : "Aucune soumission";
    // Le conseiller n'est nommé que si le dossier appartient à un collègue.
    var conseiller = x.conseillerId === P.moiId ? "" : '<span class="rp-sous">Conseiller : ' + esc(x.conseiller) + " (fictif)</span>";
    return '<tr data-opp="' + esc(x.opportunite.id) + '">' +
      '<td><a class="rp-nom" href="' + esc(RC.urlAnalyse(x.opportunite.id)) + '">' + esc(x.client) + '</a><span class="rp-sous">' + esc(x.opportunite.titre) + "</span>" + conseiller + "</td>" +
      "<td>" + esc(x.vehicule) + '<span class="rp-sous">' + esc(vehicule) + "</span></td>" +
      "<td>" + esc(P.dateCourte(cl.date)) + '<span class="rp-sous">Étape : ' + esc(P.libelleEtape(cl.etapeAtteinte)) + "</span></td>" +
      '<td><span class="rp-motif">' + esc(ref.motifsPerte[cl.motif]) + "</span>" + etat(ORIGINES[cl.origine]) + "</td>" +
      "<td>" + etat(RECUPERATIONS[x.etat.cle], precisionRecuperation(x), x.etat.raison) + "</td>" +
      "<td>" + (a ? esc(a.actionProposee) : '<span class="rp-attenue">Aucune</span>') + "</td></tr>";
  }

  // ---------- Phrase de résumé, en mots ----------
  function phraseResume(k) {
    var phrase;
    if (k.perdues === 0) phrase = "Aucune opportunité n'est perdue.";
    else if (k.perdues === 1) phrase = "1 opportunité est perdue.";
    else phrase = k.perdues + " opportunités sont perdues.";

    var reprise;
    if (k.recuperables === 0) reprise = " Aucune ne semble pouvoir être reprise pour l'instant";
    else if (k.recuperables === 1) reprise = " 1 pourrait être reprise si la situation change";
    else reprise = " " + k.recuperables + " pourraient être reprises si la situation change";

    var reactivees = "";
    if (k.reactivees === 1) reactivees = ", et 1 autre a déjà été réactivée";
    else if (k.reactivees > 1) reactivees = ", et " + k.reactivees + " autres ont déjà été réactivées";

    return phrase + reprise + reactivees + ".";
  }

  // ---------- Pagination ----------
  // Numéros affichés : toutes les pages jusqu'à 7, sinon la première, la dernière et les voisines de la page courante.
  // Un null marque un trou entre deux numéros (affiché « … »). Même règle que les autres listes en verre.
  function numerosPages(nbPages, pageCourante) {
    var numeros = [];
    var precedent = 0;
    for (var n = 1; n <= nbPages; n++) {
      var estAuBord = n === 1 || n === nbPages;
      var estVoisine = Math.abs(n - pageCourante) <= 1;
      if (nbPages <= 7 || estAuBord || estVoisine) {
        if (n - precedent > 1) numeros.push(null);
        numeros.push(n);
        precedent = n;
      }
    }
    return numeros;
  }
  // Un bouton de pagination porte l'id de sa liste (data-liste) : la liste principale est « liste »,
  // les listes de la fiche d'analyse ont chacune le leur (ex. « interactions »).
  function boutonPage(idListe, numero, libelle, contenu, desactive, courant) {
    return '<button type="button" class="rp-page-btn' + (courant ? " is-active" : "") + '" data-liste="' + idListe + '" data-aller-page="' + numero + '"' +
      (desactive ? " disabled" : "") + (courant ? ' aria-current="page"' : "") + ' aria-label="' + libelle + '">' + contenu + "</button>";
  }
  // Barre « 1 à 6 sur 14 », flèches et numéros, ou "" si tout tient sur une page.
  function htmlPagination(idListe, total, pageCourante) {
    var nbPages = Math.ceil(total / LIGNES_PAR_PAGE);
    if (nbPages <= 1) return "";
    var debut = (pageCourante - 1) * LIGNES_PAR_PAGE + 1;
    var fin = Math.min(total, pageCourante * LIGNES_PAR_PAGE);
    var html = '<span class="rp-pages-info">' + debut + " à " + fin + " sur " + total + "</span>" +
      boutonPage(idListe, pageCourante - 1, "Page précédente", '<i class="bi bi-chevron-left"></i>', pageCourante === 1, false);
    numerosPages(nbPages, pageCourante).forEach(function (n) {
      if (n === null) html += '<span class="rp-pages-trou" aria-hidden="true">…</span>';
      else html += boutonPage(idListe, n, "Page " + n, String(n), false, n === pageCourante);
    });
    html += boutonPage(idListe, pageCourante + 1, "Page suivante", '<i class="bi bi-chevron-right"></i>', pageCourante === nbPages, false);
    return html;
  }
  function rendrePagination(total) {
    var zone = racine.querySelector('[data-zone="pagination"]');
    var html = htmlPagination("liste", total, page);
    zone.hidden = !html;
    zone.innerHTML = html;
  }

  function rendreListe() {
    var tout = RC.pertes();
    var mes = tout.filter(function (x) { return !valeur("f-conseiller") || x.conseillerId === valeur("f-conseiller"); });
    var k = RC.compteursPertes(mes);
    Object.keys(k).forEach(function (c) { var e = racine.querySelector('[data-compteur="' + c + '"]'); if (e) e.textContent = String(k[c]); });
    racine.querySelector('[data-zone="resume"]').textContent = phraseResume(k);
    var detailConnus = "Confirmés";
    if (k.hypotheses) detailConnus += ", " + accord(k.hypotheses, "hypothèse", "hypothèses") + " à part";
    racine.querySelector('[data-detail="hypotheses"]').textContent = detailConnus;
    racine.querySelector('[data-libelle="recuperees"]').textContent = k.recuperees > 1 ? "Récupérées" : "Récupérée";

    // Liste des véhicules recherchés (filtre), recalculée à partir des données.
    var sel = champ("f-vehicule"), choisi = sel.value;
    var vehicules = tout.map(function (x) { return x.vehicule; }).filter(function (v, i, t) { return v && t.indexOf(v) === i; }).sort();
    sel.innerHTML = '<option value="">Tous les véhicules</option>' + vehicules.map(function (v) { return '<option value="' + esc(v) + '"' + (v === choisi ? " selected" : "") + ">" + esc(v) + "</option>"; }).join("");

    var l = filtrer(tout);
    // La liste a pu raccourcir (filtre, réactivation) : on reste sur une page qui existe.
    var nbPages = Math.max(1, Math.ceil(l.length / LIGNES_PAR_PAGE));
    if (page > nbPages) page = nbPages;
    var debut = (page - 1) * LIGNES_PAR_PAGE;
    champ("liste-corps").innerHTML = l.slice(debut, debut + LIGNES_PAR_PAGE).map(ligne).join("");
    champ("etat-vide").hidden = l.length > 0;
    racine.querySelector(".rp-defile").hidden = !l.length;
    champ("resultat").textContent = accord(l.length, "opportunité perdue ou réactivée", "opportunités perdues ou réactivées");
    rendrePagination(l.length);
    racine.querySelectorAll("[data-effacer-filtres]").forEach(function (b) { if (b.closest(".rp-plus")) b.hidden = !filtresActifs(); });

    var sans = RC.pertesSansCloture();
    var noms = sans.map(function (o) { var c = P.contact(o.prospectId); return c ? c.prenom + " " + c.nom : o.titre; }).join(", ");
    var texteSans = "";
    if (sans.length === 1) texteSans = "1 opportunité est marquée « Perdu » sans clôture enregistrée : motif inconnu (" + noms + ").";
    else if (sans.length > 1) texteSans = sans.length + " opportunités sont marquées « Perdu » sans clôture enregistrée : motif inconnu (" + noms + ").";
    var zoneSans = racine.querySelector('[data-zone="sans-cloture"]');
    zoneSans.textContent = texteSans;
    zoneSans.hidden = !texteSans;
  }

  // ---------- Fiche d'analyse (?opportunite=…) ----------
  // Même style verre que la liste : haut propre, phrase en mots, quatre cartes clés sur une rangée, puis des cartes
  // regroupées par thème. Toutes les informations de l'ancienne fiche sont gardées ; seules la forme et l'ordre changent.
  // Les boutons data-rc (préciser, futur suivi, événement, réactiver, retour) ouvrent les fenêtres de relations-composants.js.

  // Page affichée de chaque liste de la fiche, rangée par id de liste. Absente = page 1.
  var pagesFiche = {};

  // Éléments de la page courante d'une liste de la fiche, et sa barre de pagination.
  function paginerFiche(idListe, elements) {
    var nbPages = Math.max(1, Math.ceil(elements.length / LIGNES_PAR_PAGE));
    var pageCourante = Math.min(pagesFiche[idListe] || 1, nbPages);
    pagesFiche[idListe] = pageCourante;
    var debut = (pageCourante - 1) * LIGNES_PAR_PAGE;
    return {
      elements: elements.slice(debut, debut + LIGNES_PAR_PAGE),
      pagination: htmlPagination(idListe, elements.length, pageCourante),
    };
  }

  // Carte en verre avec un titre et un contenu déjà construit.
  function carteFiche(titre, contenu, droite) {
    return '<section class="rp-verre rp-carte"><header class="rp-carte-tete"><h2 class="rp-carte-titre">' + titre + "</h2>" + (droite || "") + "</header>" + contenu + "</section>";
  }

  // Liste de lignes séparées par des filets, paginée à 6, ou un texte gris si elle est vide.
  function lignesFiche(idListe, lignes, vide) {
    if (!lignes.length) return vide ? '<p class="rp-fiche-vide">' + esc(vide) + "</p>" : "";
    var morceau = paginerFiche(idListe, lignes);
    var pagination = morceau.pagination ? '<nav class="rp-pagination rp-pagination-fiche" aria-label="Pagination">' + morceau.pagination + "</nav>" : "";
    return '<ul class="rp-lignes">' + morceau.elements.join("") + "</ul>" + pagination;
  }

  // Ligne libellé et valeur (tableau de définitions).
  function definition(libelle, valeur) {
    return "<div><dt>" + esc(libelle) + "</dt><dd>" + valeur + "</dd></div>";
  }

  // Ligne datée : date en mono à gauche, texte à droite.
  function ligneDatee(date, texteHtml) {
    return '<li class="rp-ligne-datee"><span class="rp-date">' + esc(P.dateCourte(date)) + "</span><span>" + texteHtml + "</span></li>";
  }

  // Une petite carte clé : libellé, valeur, précision grise.
  function carteCle(libelle, valeurHtml, precisionHtml) {
    return '<div class="rp-verre rp-chiffre rp-cle"><span class="rp-chiffre-libelle">' + esc(libelle) + "</span>" +
      '<span class="rp-cle-valeur">' + valeurHtml + "</span>" + (precisionHtml ? '<span class="rp-chiffre-detail">' + precisionHtml + "</span>" : "") + "</div>";
  }

  // Phrase qui dit en mots ce qu'il faut retenir sur cette perte.
  function phraseFiche(dsr) {
    var cl = dsr.cloture, c = dsr.contact;
    var motif = String(ref.motifsPerte[cl.motif] || cl.motif).toLowerCase();
    var origine = String((ORIGINES[cl.origine] || ORIGINES.inconnu).libelle).toLowerCase();
    var phrase = P.terminerPhrase(c.prenom + " n'a pas conclu à l'étape « " + P.libelleEtape(cl.etapeAtteinte) + " », le " + P.dateCourte(cl.date));
    if (cl.motif === "inconnu") phrase += " Le motif n'est pas connu : il ne faut pas le deviner.";
    else phrase += " Motif : " + motif + " (" + origine + ").";
    if (dsr.etat.raison) phrase += " " + dsr.etat.raison;
    return phrase;
  }

  function rendreFiche() {
    var dsr = RC.dossierPerte(oppId);
    var zone = racine.querySelector('[data-zone="fiche"]');
    var retour = '<a href="' + esc(ref.urls.pertes) + '" class="rp-retour"><i class="bi bi-arrow-left" aria-hidden="true"></i>Toutes les ventes perdues</a>';
    if (!dsr) {
      zone.innerHTML = '<p class="rp-fiche-retour">' + retour + "</p>" +
        '<div class="rp-verre rp-carte rp-fiche-absente"><i class="bi bi-question-circle" aria-hidden="true"></i><strong>Aucune clôture enregistrée</strong>' +
        "<span>Cette opportunité n'a pas été clôturée comme perdue dans Phineas.</span></div>";
      return;
    }
    var cl = dsr.cloture, o = dsr.opportunite, c = dsr.contact, q = o.qualification || {}, an = dsr.analyse, e = dsr.etat;
    var actif = !cl.reactivation && o.etape === "Perdu";
    var nomClient = c.prenom + " " + c.nom;
    var recommandees = I ? I.actives().filter(function (a) { return a.opportuniteId === o.id; }) : [];

    // ----- Haut de page et en-tête -----
    var haut =
      '<div class="rp-haut"><nav class="rp-ariane" aria-label="Fil d\'Ariane"><span>Sales OS</span><i class="bi bi-chevron-right" aria-hidden="true"></i>' +
      '<a href="' + esc(ref.urls.pertes) + '">Ventes perdues</a><i class="bi bi-chevron-right" aria-hidden="true"></i><span aria-current="page">' + esc(nomClient) + "</span></nav>" +
      '<div class="rp-puces" role="note" title="Clients, ventes et recommandations fictifs. Rien n\'est enregistré en base.">' +
      '<span class="rp-chip-demo">Démo</span><span class="rp-en-ligne"><span class="rp-point-vert" aria-hidden="true"></span>En ligne</span></div></div>';
    var entete =
      '<p class="rp-fiche-retour">' + retour + "</p>" +
      '<header class="rp-entete"><div><p class="rp-label">Vente perdue</p><h1 class="rp-titre">' + esc(nomClient) + "</h1>" +
      '<p class="rp-intro">' + esc(o.titre) + " · étape actuelle : " + esc(P.libelleEtape(o.etape)) + "</p></div>" +
      '<div class="rp-boutons"><a class="rp-btn-verre" href="' + esc(P.urlFiche(c.id)) + '"><i class="bi bi-person" aria-hidden="true"></i>Fiche du prospect</a></div></header>';

    // ----- Phrase et quatre cartes clés -----
    var origineMotif = ORIGINES[cl.origine] || ORIGINES.inconnu;
    var recuperation = RECUPERATIONS[e.cle] || { point: "gris-creux", libelle: e.cle };
    var cles =
      '<section class="rp-chiffres rp-cles" aria-label="L\'essentiel de cette perte">' +
      carteCle("Motif de perte", esc(ref.motifsPerte[cl.motif] || cl.motif), etat(origineMotif)) +
      carteCle("Récupération", etat(recuperation, "", e.raison), esc(cl.dateReprise ? "Reprise souhaitée le " + P.dateCourte(cl.dateReprise) : "Date de reprise non connue")) +
      carteCle("Clôturée le", esc(P.dateCourte(cl.date)), esc("Par " + cl.auteur)) +
      carteCle("Dernière étape atteinte", esc(P.libelleEtape(cl.etapeAtteinte)), esc("Qualification : " + dsr.completude.remplis + " sur " + dsr.completude.total + " informations")) +
      "</section>";

    // ----- Motif et clôture -----
    var motifContenu =
      '<p class="rp-motif-grand">' + esc(ref.motifsPerte[cl.motif] || cl.motif) + "</p>" + etat(origineMotif) +
      (cl.origine === "hypothese" ? '<p class="rp-remarque"><i class="bi bi-lightbulb" aria-hidden="true"></i>Hypothèse du conseiller : ce n\'est pas une raison confirmée.</p>' : "") +
      '<dl class="rp-def">' +
      definition("Clôturée le", esc(P.dateComplete(cl.date))) +
      definition("Par", esc(cl.auteur)) +
      definition("Dernière étape atteinte", esc(P.libelleEtape(cl.etapeAtteinte))) +
      definition("Restrictions de communication", esc(ref.restrictions[cl.restriction] || "Aucune")) +
      "</dl>" +
      (cl.commentaire ? '<p class="rp-commentaire"><span class="rp-chiffre-libelle">Commentaire</span>' + esc(cl.commentaire) + "</p>" : "");

    // ----- Récupération et actions -----
    var boutons = "";
    if (actif) {
      boutons += '<button type="button" class="rp-btn-blanc" data-rc="preciser" data-opp="' + esc(o.id) + '"><i class="bi bi-pencil" aria-hidden="true"></i>Préciser le motif</button>';
      boutons += '<button type="button" class="rp-btn-blanc" data-rc="suivi" data-opp="' + esc(o.id) + '"><i class="bi bi-calendar-check" aria-hidden="true"></i>Futur suivi</button>';
      if (e.cle !== "aucune") boutons += '<button type="button" class="rp-btn-blanc" data-rc="evenement" data-opp="' + esc(o.id) + '"><i class="bi bi-lightning" aria-hidden="true"></i>Déclarer un événement</button>';
      // Seul bouton vert plein de la fiche.
      if (!dsr.refusReactivation) boutons += '<button type="button" class="rp-btn-vert" data-rc="reactiver" data-opp="' + esc(o.id) + '"><i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>Réactiver l\'opportunité</button>';
    }
    var recuperationContenu =
      etat(recuperation) + '<p class="rp-raison">' + esc(e.raison) + "</p>" +
      '<dl class="rp-def">' +
      definition("Futur suivi", cl.suiviPossible ? "Possible" : "Non envisagé") +
      definition("Date de reprise", esc(cl.dateReprise ? P.dateCourte(cl.dateReprise) : "Non connue")) +
      definition("Conditions de réactivation", esc(cl.conditions || "Non précisées")) +
      (cl.evenement ? definition("Événement déclaré", esc(cl.evenement.texte)) : "") +
      (cl.reactivation ? definition("Réactivée le", esc(P.dateComplete(cl.reactivation.le)) + '<span class="rp-sous">' + esc(cl.reactivation.evenement) + "</span>") : "") +
      "</dl>" +
      (cl.motif === "financement-refuse" && actif
        ? '<div class="rp-encart"><strong>Alternatives commerciales autorisées à examiner avec le client</strong><ul>' +
          ref.alternativesFinancement.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") +
          "</ul><p>Aucune approbation de crédit n'est recommandée ni promise ; aucun contact automatique n'est fait.</p></div>"
        : "") +
      (actif && ["vehicule-indisponible", "budget-incompatible", "caracteristiques-absentes"].indexOf(cl.motif) >= 0
        ? '<p class="rp-remarque"><a class="rp-lien" href="' + esc((I && I.ref.urlVehicules || "#") + "?opportunite=" + encodeURIComponent(o.id)) + '"><i class="bi bi-car-front" aria-hidden="true"></i>Voir les véhicules compatibles avec l\'ancienne recherche</a></p>'
        : "") +
      (actif && cl.motif === "achat-ailleurs" && RC.regles.estConfirme(cl)
        ? '<p class="rp-remarque">Aucune relance commerciale. Si le client manifeste un nouveau projet, créez une nouvelle opportunité distincte depuis sa fiche.</p>'
        : "") +
      (dsr.refusReactivation && actif ? '<p class="rp-remarque"><i class="bi bi-lock" aria-hidden="true"></i>Réactivation impossible : ' + esc(dsr.refusReactivation) + "</p>" : "") +
      (boutons ? '<div class="rp-actions">' + boutons + "</div>" : "");

    var deuxColonnes = '<div class="rp-fiche-grille">' +
      carteFiche('<i class="bi bi-x-octagon" aria-hidden="true"></i>Motif et clôture', motifContenu) +
      carteFiche('<i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>Récupération', recuperationContenu) + "</div>";

    // ----- Analyse : faits, inconnus, interprétations -----
    function puces(l) { return l.map(function (x) { return "<li>" + esc(x) + "</li>"; }); }
    var analyse = '<div class="rp-fiche-grille rp-fiche-grille-3">' +
      carteFiche('<i class="bi bi-check2-square" aria-hidden="true"></i>Ce que nous savons', lignesFiche("faits", puces(an.faits), "Aucun fait enregistré.")) +
      carteFiche('<i class="bi bi-question-diamond" aria-hidden="true"></i>Ce qui reste inconnu', lignesFiche("inconnus", puces(an.inconnus), "Rien d'important ne semble manquer.")) +
      (an.interpretations.length ? carteFiche('<i class="bi bi-lightbulb" aria-hidden="true"></i>Interprétations, non confirmées', lignesFiche("interpretations", puces(an.interpretations), "")) : "") +
      "</div>";

    // ----- Actions recommandées (mêmes cartes que le Centre d'actions) -----
    var actions = recommandees.length
      ? carteFiche('<i class="bi bi-lightning-charge" aria-hidden="true"></i>Actions recommandées',
          '<div class="ia-file rp-actions-moteur">' + recommandees.map(function (a) { return UI.carte(a, { compacte: true }); }).join("") + "</div>",
          '<a class="rp-lien" href="' + esc(I.ref.urlActions) + '">Centre d\'actions</a>')
      : "";

    // ----- Le dossier : besoins, véhicules, rendez-vous, blocages -----
    var besoins = '<dl class="rp-def">' +
      definition("Recherche", esc(P.resumeVehicule(o) || o.titre)) +
      definition("Budget", esc(P.resumeBudget(q) || "Non renseigné")) +
      definition("Horizon d'achat", esc(P.libelle("horizons", q.horizon) || "Non renseigné")) +
      definition("Qualification", esc(dsr.completude.remplis + " sur " + dsr.completude.total + " informations")) +
      "</dl>";
    var vehicules = (o.vehiculesEnvisages || []).map(function (v) { return "<li>" + esc(v) + '<span class="rp-sous">Véhicule envisagé</span></li>'; })
      .concat(dsr.soumissions.map(function (s) {
        var versions = s.versions > 1 ? s.versions + " versions" : "1 version";
        return '<li><a class="rp-nom" href="' + esc(s.url) + '">' + esc(s.reference) + "</a>, " + esc(s.vehicule) +
          '<span class="rp-sous">' + esc(versions + ", " + s.statutLibelle.toLowerCase()) + "</span></li>";
      }));
    var rendezVous = dsr.rendezVous.map(function (r) {
      return '<li><a class="rp-nom" href="' + esc(r.url) + '">' + esc(r.typeLibelle) + "</a>, " + esc(r.creneau.toLowerCase()) +
        '<span class="rp-sous">' + esc(r.statutLibelle) + "</span>" +
        (r.resultat && r.resultat.objections ? '<span class="rp-sous">Objections : ' + esc(r.resultat.objections) + "</span>" : "") + "</li>";
    });
    var dossier = '<div class="rp-fiche-grille">' +
      carteFiche('<i class="bi bi-clipboard-check" aria-hidden="true"></i>Besoins initiaux', besoins) +
      carteFiche('<i class="bi bi-car-front" aria-hidden="true"></i>Véhicules proposés', lignesFiche("vehicules", vehicules, "Aucun véhicule proposé.")) +
      carteFiche('<i class="bi bi-calendar-event" aria-hidden="true"></i>Rendez-vous', lignesFiche("rendez-vous", rendezVous, "Aucun rendez-vous.")) +
      carteFiche('<i class="bi bi-sign-stop" aria-hidden="true"></i>Blocages rencontrés', lignesFiche("blocages", puces(dsr.blocages), "Aucune transaction ouverte : aucun blocage enregistré.")) +
      "</div>";

    // ----- Interactions : toutes, dans l'ordre du store, paginées à 6 (l'ancienne fiche n'en montrait que 6) -----
    var interactions = carteFiche('<i class="bi bi-clock-history" aria-hidden="true"></i>Dernières interactions',
      lignesFiche("interactions", dsr.interactions.map(function (i) { return ligneDatee(i.date, esc(i.resume)); }), "Aucune interaction."));

    // ----- Retour volontaire du client -----
    var reponses = { oui: "Oui", non: "Non", "en-partie": "En partie" };
    var retourContenu = dsr.retour
      ? '<dl class="rp-def">' +
        definition("Reçu le", esc(P.dateComplete(dsr.retour.recuLe) + (dsr.retour.simule ? " (simulation)" : ""))) +
        definition(RUI.questionsRetour[0], esc(reponses[dsr.retour.vehiculeTrouve] || "Sans réponse")) +
        definition(RUI.questionsRetour[1], esc(dsr.retour.raison || "Sans réponse")) +
        definition(RUI.questionsRetour[2], esc(dsr.retour.amelioration || "Sans réponse")) +
        definition(RUI.questionsRetour[3], esc(dsr.retour.informerSiDisponible == null ? "Sans réponse" : dsr.retour.informerSiDisponible ? "Oui" : "Non")) +
        "</dl>"
      : '<p class="rp-fiche-vide">Aucun retour reçu. Le client peut, s\'il le souhaite, répondre à un formulaire court (aucun envoi réel dans ce prototype).</p>';
    retourContenu += '<div class="rp-actions"><button type="button" class="rp-btn-blanc" data-rc="apercu-retour"><i class="bi bi-eye" aria-hidden="true"></i>Prévisualiser le formulaire client</button>' +
      (actif || cl.reactivation ? '<button type="button" class="rp-btn-blanc" data-rc="retour" data-opp="' + esc(o.id) + '"><i class="bi bi-cone-striped" aria-hidden="true"></i>Simuler la réception d\'un retour</button>' : "") + "</div>";
    var retourClient = carteFiche('<i class="bi bi-chat-square-text" aria-hidden="true"></i>Retour volontaire du client', retourContenu, '<span class="rp-chip-neutre">Facultatif</span>');

    // ----- Historique de la clôture -----
    var historique = dsr.historique.map(function (h) {
      var texte = "Clôture : " + esc(ref.motifsPerte[h.motif]) + " (" + esc(ref.originesMotif[h.origine].toLowerCase()) + ")" +
        (h.reactivation ? ", réactivée le " + esc(P.dateCourte(h.reactivation.le)) : "");
      return ligneDatee(h.date, texte);
    }).concat((cl.historique || []).map(function (h) { return ligneDatee(h.date, esc(h.texte)); }));
    var historiqueCarte = historique.length ? carteFiche('<i class="bi bi-journal-text" aria-hidden="true"></i>Historique de la clôture', lignesFiche("historique", historique, "")) : "";

    zone.innerHTML = haut + entete +
      '<p class="rp-resume">' + esc(phraseFiche(dsr)) + "</p>" +
      cles + deuxColonnes + analyse + actions + dossier +
      '<div class="rp-fiche-grille">' + interactions + retourClient + "</div>" +
      historiqueCarte;
  }

  function rendre() {
    racine.querySelector('[data-mode="liste"]').hidden = !!oppId;
    racine.querySelector('[data-mode="fiche"]').hidden = !oppId;
    document.querySelectorAll("[data-entete-liste]").forEach(function (bloc) { bloc.hidden = !!oppId; });
    if (oppId) rendreFiche(); else rendreListe();
  }

  // Un nouveau filtre ou une nouvelle recherche repart de la première page.
  function relancer() {
    page = 1;
    rendre();
  }
  F.forEach(function (id) { var e = champ(id); if (e) e.addEventListener(e.type === "search" ? "input" : "change", relancer); });

  racine.addEventListener("click", function (e) {
    var pagination = e.target.closest("[data-aller-page]");
    if (pagination && !pagination.disabled) {
      var idListe = pagination.dataset.liste;
      var numero = Number(pagination.dataset.allerPage);
      if (idListe === "liste") page = numero;
      else pagesFiche[idListe] = numero;
      rendre();
      // Le focus reste sur le numéro choisi de la même liste.
      var courante = racine.querySelector('[data-liste="' + idListe + '"][aria-current="page"]');
      if (courante) courante.focus();
      if (idListe === "liste") racine.querySelector(".rp-module").scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
    if (!e.target.closest("[data-effacer-filtres]")) return;
    F.forEach(function (id) { var x = champ(id); if (x.type === "checkbox") x.checked = false; else x.value = id === "f-conseiller" ? P.moiId : ""; });
    relancer();
  });

  // « Plus de filtres » : période, source du motif, véhicule et conseiller, repliés par défaut.
  var boutonPlus = racine.querySelector("[data-plus-filtres]");
  boutonPlus.addEventListener("click", function () {
    var zone = champ("plus-filtres");
    zone.hidden = !zone.hidden;
    boutonPlus.setAttribute("aria-expanded", zone.hidden ? "false" : "true");
    boutonPlus.textContent = zone.hidden ? "Plus de filtres" : "Moins de filtres";
  });

  champ("f-conseiller").value = P.moiId;
  RC.abonner(rendre);
  P.abonner(rendre);
  if (I) I.abonner(rendre);
  rendre();
})();
