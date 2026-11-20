// Page « Satisfaction et après-vente » (Views/Relations/Satisfaction.cshtml, maquettes 33 à 35) :
// phrase de résumé, 5 chiffres, suivis après livraison, problèmes clients et actions après-vente.
// Les données viennent de relations-store.js (window.RelationsClients) ; les suivis à effectuer et les actions
// viennent du moteur d'intelligence (window.Intelligence), la même source que le Centre d'actions.
// Les fenêtres [data-rc] sont ouvertes par relations-composants.js, les boutons [data-ia] par intelligence-composants.js.
(function () {
  "use strict";

  var RC = window.RelationsClients, P = window.Prospects, T = window.Transactions, I = window.Intelligence, UI = window.IntelligenceUI, RUI = window.RelationsUI;
  var racine = document.getElementById("satisfaction");
  if (!RC || !P || !T || !UI || !RUI || !racine) return;
  var esc = P.esc, ref = RC.ref;
  var focus = racine.dataset.transaction || null;
  var urlRdv = racine.dataset.rdvUrl || "#";

  // Nombre d'éléments par page dans chaque liste (cartes de suivis, tableau des problèmes, actions).
  var ELEMENTS_PAR_PAGE = 6;
  // Règles du moteur qui relèvent de l'après-vente (mêmes actions que dans le Centre d'actions).
  var APRES_VENTE = ["satisfaction-a-planifier", "client-insatisfait", "probleme-a-traiter", "probleme-resolu-verifier", "invitation-referencement"];
  // Page affichée de chaque liste, rangée par nom de liste (ex. pages.problemes = 2). Absente = page 1.
  var pages = {};

  function champ(id) { return document.getElementById(id); }
  function conseiller() { return champ("f-conseiller").value || null; }

  // ---------- Petits outils d'affichage ----------

  // Accord simple : « 1 problème », « 2 problèmes ».
  function pluriel(nombre, singulier, plurielTexte) {
    return nombre > 1 ? plurielTexte : singulier;
  }
  function majuscule(texte) {
    return texte ? texte.charAt(0).toUpperCase() + texte.slice(1) : texte;
  }
  // Note écrite à la française : 4.8 devient « 4,8 ».
  function note(valeur) {
    return String(valeur).replace(".", ",");
  }
  // Point d'état de 8 px suivi de son libellé. ton : vert, ambre, gris ou fonce ; creux : point vide.
  function etat(ton, creux, libelle, precision) {
    return '<span class="sa-etat sa-etat-' + ton + (creux ? " is-creux" : "") + '"><span class="sa-point" aria-hidden="true"></span>' + esc(libelle) + "</span>" +
      (precision ? '<span class="sa-sous">' + esc(precision) + "</span>" : "");
  }
  // Avatar rond avec les initiales du client.
  function avatar(prospectId, nom) {
    var c = P.contact(prospectId);
    var lettres = c ? P.initiales(c) : String(nom || "?").slice(0, 2).toUpperCase();
    return '<span class="sa-avatar" aria-hidden="true">' + esc(lettres) + "</span>";
  }

  // ---------- Pagination ----------

  // Numéros affichés : toutes les pages jusqu'à 7, sinon la première, la dernière et les voisines de la page courante.
  // Un null marque un trou entre deux numéros (affiché « … »). Même règle que les autres listes en verre.
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
  function boutonPage(liste, numero, libelle, contenu, desactive, courant) {
    return '<button type="button" class="sa-page-btn' + (courant ? " is-active" : "") + '" data-liste="' + liste + '" data-aller-page="' + numero + '"' +
      (desactive ? " disabled" : "") + (courant ? ' aria-current="page"' : "") + ' aria-label="' + libelle + '">' + contenu + "</button>";
  }
  // Découpe une liste : éléments de la page courante, et la barre de pagination (vide si tout tient sur une page).
  function paginer(liste, elements) {
    var nbPages = Math.max(1, Math.ceil(elements.length / ELEMENTS_PAR_PAGE));
    // La liste a pu raccourcir (filtre, problème résolu) : on reste sur une page qui existe.
    var page = Math.min(pages[liste] || 1, nbPages);
    pages[liste] = page;
    var debut = (page - 1) * ELEMENTS_PAR_PAGE;
    var barre = "";
    if (nbPages > 1) {
      var fin = Math.min(elements.length, page * ELEMENTS_PAR_PAGE);
      barre = '<nav class="sa-pagination" aria-label="Pagination"><span class="sa-pages-info">' + (debut + 1) + " à " + fin + " sur " + elements.length + "</span><div class=\"sa-pages\">" +
        boutonPage(liste, page - 1, "Page précédente", '<i class="bi bi-chevron-left"></i>', page === 1, false);
      numerosPages(nbPages, page).forEach(function (numero) {
        if (numero === null) barre += '<span class="sa-pages-trou" aria-hidden="true">…</span>';
        else barre += boutonPage(liste, numero, "Page " + numero, String(numero), false, numero === page);
      });
      barre += boutonPage(liste, page + 1, "Page suivante", '<i class="bi bi-chevron-right"></i>', page === nbPages, false) + "</div></nav>";
    }
    racine.querySelector('[data-pagination="' + liste + '"]').innerHTML = barre;
    return elements.slice(debut, debut + ELEMENTS_PAR_PAGE);
  }

  // ---------- Données ----------

  function actionsDe(tid, regle) {
    return I ? I.actives().filter(function (a) { return a.objet && a.objet.id === tid && (!regle || a.regle === regle); }) : [];
  }
  function livraisonsFiltrees() {
    var filtre = champ("f-etat").value;
    return RC.livraisons().filter(function (x) { return !conseiller() || x.conseillerId === conseiller(); }).filter(function (x) {
      if (filtre === "a-faire") return !x.enquete && actionsDe(x.transaction.id, "satisfaction-a-planifier").length;
      if (filtre === "recu") return !!x.enquete;
      if (filtre === "probleme") return x.problemes.some(RC.regles.problemeOuvert);
      return true;
    });
  }
  function actionsApresVente() {
    if (!I) return [];
    return I.actives({ conseiller: conseiller() }).filter(function (a) { return APRES_VENTE.indexOf(a.regle) >= 0; });
  }

  // ---------- Onglet 1 : suivis après livraison ----------

  // État du suivi en haut à droite de la carte.
  function etatSuivi(enquete, suivi) {
    if (enquete) return etat("vert", false, "Retour reçu le " + P.dateCourte(enquete.recueLe));
    if (suivi) return etat("ambre", false, "Suivi à effectuer " + P.echeance(suivi.echeance));
    return etat("gris", true, "Aucun retour enregistré");
  }
  // Bloc « Satisfaction globale » et les 4 dimensions en barres fines.
  function blocRetour(l) {
    var e = l.enquete;
    var gauche = '<div class="sa-globale"><span class="sa-sous">Satisfaction globale</span>' +
      '<p class="sa-note-globale"><span class="sa-note-chiffre">' + e.globale + '</span><span class="sa-note-sur">/ 5</span><strong>' + esc(ref.echelle[String(e.globale)]) + "</strong></p>" +
      (e.commentaire ? '<p class="sa-citation">« ' + esc(e.commentaire) + " »</p>" : "") +
      (e.simule ? '<p class="sa-sous">Retour représenté par simulation.</p>' : "") + "</div>";
    var droite = '<div class="sa-dimensions">' + l.dimensions.map(function (d) {
      // Point faible : même règle qu'avant (une réponse sous le seuil d'insatisfaction).
      var pointFaible = d.minimum != null && d.minimum <= ref.config.seuilInsatisfait;
      var valeur = d.moyenne == null ? "Non évalué" : note(d.moyenne) + " / 5";
      var largeur = d.moyenne == null ? 0 : Math.round(d.moyenne / 5 * 100);
      var infobulle = d.libelle + " : " + valeur + " (" + d.evalues + " sur " + d.total + " " + pluriel(d.total, "élément évalué", "éléments évalués") + ")";
      return '<div class="sa-dimension" title="' + esc(infobulle) + '"><div class="sa-dimension-ligne"><span>' + esc(d.libelle) +
        (pointFaible ? '<span class="sa-point-faible"><span class="sa-point" aria-hidden="true"></span>Point faible</span>' : "") + "</span><strong>" + esc(valeur) + "</strong></div>" +
        '<span class="sa-piste" role="img" aria-label="' + esc(infobulle) + '"><span class="sa-remplissage" style="width:' + largeur + '%"></span></span></div>';
    }).join("") + "</div>";
    return '<div class="sa-retour">' + gauche + droite + "</div>";
  }
  // Un problème lié : bande ambre très pâle s'il est ouvert, gris pâle sinon. Le texte ouvre le détail du problème.
  function bandeProbleme(p) {
    var ouvert = RC.regles.problemeOuvert(p);
    return '<div class="sa-bande' + (ouvert ? " is-ouvert" : "") + '"><i class="bi bi-exclamation-circle" aria-hidden="true"></i>' +
      '<button type="button" class="sa-bande-texte" data-rc="probleme-detail" data-id="' + esc(p.id) + '">' + esc(p.nature) + "</button>" +
      '<span class="sa-bande-etat">' + esc(ouvert ? "Problème " + (ref.statutsProbleme[p.statut] || p.statut).toLowerCase() : ref.statutsProbleme[p.statut] || p.statut) + "</span></div>";
  }
  function texteInvitation(l, t) {
    if (l.invitation) return "préparée le " + esc(P.dateCourte(l.invitation.prepareeLe)) + (l.invitation.partageeLe ? ", déclarée partagée" : "");
    if (l.eligibilite.eligible) return 'envisageable, à valider par vous. <a class="sa-lien-vert" href="' + esc(ref.urls.reseau + "?transaction=" + encodeURIComponent(t.id)) + '">Préparer l\'invitation</a>';
    return "non proposée, " + esc(l.eligibilite.raisons.join(" ").toLowerCase());
  }
  function carteLivraison(l) {
    var t = l.transaction, e = l.enquete;
    var suivi = actionsDe(t.id, "satisfaction-a-planifier")[0];
    var collegue = t.conseillerId !== P.moiId ? " · " + esc(P.conseiller(t.conseillerId).nom) + " (fictif)" : "";
    var boutons = "";
    if (!e) boutons += '<button type="button" class="sa-btn" data-rc="enquete" data-transaction="' + esc(t.id) + '">Saisir un retour reçu (simulation)</button>';
    boutons += '<button type="button" class="sa-btn" data-rc="probleme" data-transaction="' + esc(t.id) + '"' + (e ? ' data-enquete="' + esc(e.id) + '"' : "") + ">Signaler un problème</button>";
    if (P.contact(t.prospectId)) boutons += '<a class="sa-btn" href="' + esc(urlRdv + "?opportunite=" + encodeURIComponent(t.opportuniteId) + "&type=SuiviApresVente") + '">Planifier une rencontre</a>';
    // Seule la carte dont le suivi est dû porte le bouton vert plein.
    if (suivi) boutons += '<button type="button" class="sa-btn sa-btn-sapin" data-ia="relance" data-id="' + esc(suivi.id) + '"><i class="bi bi-pencil-square" aria-hidden="true"></i>Préparer le suivi</button>';

    return '<article class="sa-verre sa-carte' + (t.id === focus ? " is-focus" : "") + '" id="livraison-' + esc(t.id) + '" aria-labelledby="lv-' + esc(t.id) + '">' +
      '<header class="sa-carte-tete">' + avatar(t.prospectId, l.client) +
      '<div class="sa-carte-qui"><h2 class="sa-nom" id="lv-' + esc(t.id) + '"><a href="' + esc(P.urlFiche(t.prospectId)) + '">' + esc(l.client) + "</a></h2>" +
      '<span class="sa-sous">' + esc(l.vehicule) + ' · <a class="sa-ref" href="' + esc(T.urlDetail(t.id)) + '">' + esc(t.reference) + "</a> · livré le " + esc(P.dateCourte(l.confirmeeLe)) + collegue + "</span></div>" +
      '<div class="sa-carte-etat">' + etatSuivi(e, suivi) + "</div></header>" +
      (e ? blocRetour(l) : '<div class="sa-sans-retour"><i class="bi bi-chat-dots" aria-hidden="true"></i>Aucun retour reçu pour le moment.</div>') +
      l.problemes.map(bandeProbleme).join("") +
      '<footer class="sa-carte-pied"><p class="sa-invitation"><strong>Invitation à recommander :</strong> ' + texteInvitation(l, t) + "</p>" +
      '<div class="sa-boutons">' + boutons + "</div></footer></article>";
  }
  function rendreLivraisons() {
    var liste = livraisonsFiltrees();
    champ("livraisons").innerHTML = paginer("livraisons", liste).map(carteLivraison).join("");
    champ("livraisons-vide").hidden = liste.length > 0;
  }

  // ---------- Onglet 2 : problèmes clients ----------

  // État d'un problème : en cours ou en attente = ambre plein ; nouveau = à faire (vert creux) ; résolu = vert plein ; clôturé = neutre.
  function etatProbleme(p) {
    var libelle = ref.statutsProbleme[p.statut] || p.statut;
    var precision = p.priorite === "Eleve" || p.priorite === "Urgent" ? "Priorité élevée" : "Priorité normale";
    if (p.statut === "Resolu") return etat("vert", false, libelle, precision);
    if (p.statut === "Cloture") return etat("fonce", false, libelle, precision);
    if (p.statut === "Nouveau") return etat("vert", true, libelle, precision);
    return etat("ambre", false, libelle, precision);
  }
  function ligneProbleme(x) {
    var p = x.probleme;
    var departement = (T.ref.departements[p.departement] || {}).libelle || p.departement;
    var prochaine = p.prochaineAction || (p.statut === "Resolu" ? "Vérifier avec le client" : "");
    return '<tr id="probleme-' + esc(p.id) + '"' + (x.ouvert ? "" : ' class="is-clos"') + ">" +
      '<td data-label="Client"><a class="sa-nom-ligne" href="' + esc(P.urlFiche(x.transaction.prospectId)) + '">' + esc(x.client) + '</a><span class="sa-sous">' + esc(x.vehicule) + "</span></td>" +
      '<td data-label="Problème"><button type="button" class="sa-texte-bouton" data-rc="probleme-detail" data-id="' + esc(p.id) + '">' + esc(p.nature) + '</button><span class="sa-sous">' + esc(ref.typesProbleme[p.type] || "") + "</span></td>" +
      '<td data-label="Signalé le">' + esc(P.dateCourte(p.signaleLe)) + "</td>" +
      '<td data-label="Département">' + esc(departement) + (p.responsable ? '<span class="sa-sous">' + esc(p.responsable) + "</span>" : "") + "</td>" +
      '<td data-label="État">' + etatProbleme(p) + "</td>" +
      '<td data-label="Prochaine action">' + (prochaine ? esc(prochaine) : '<span class="sa-gris">Aucune</span>') + "</td></tr>";
  }
  function rendreProblemes() {
    var liste = RC.problemes().filter(function (x) { return x.transaction && (!conseiller() || x.transaction.conseillerId === conseiller()); });
    champ("problemes-corps").innerHTML = paginer("problemes", liste).map(ligneProbleme).join("");
    champ("problemes-vide").hidden = liste.length > 0;
    racine.querySelector(".sa-table").hidden = !liste.length;
    var ouverts = liste.filter(function (x) { return x.ouvert; }).length;
    racine.querySelector('[data-champ="nb-problemes"]').textContent = ouverts ? String(ouverts) : "";
  }

  // ---------- Onglet 3 : actions après-vente ----------

  function etatPriorite(cle) {
    if (cle === "Urgent") return etat("ambre", false, "Priorité urgente");
    if (cle === "Eleve") return etat("ambre", false, "Priorité élevée");
    if (cle === "Faible") return etat("gris", true, "Priorité faible");
    return etat("gris", true, "Priorité normale");
  }
  // Trois informations sous l'action : la précision de la règle (département, résolu par, transaction), l'échéance, le responsable.
  function informations(a) {
    var infos = [];
    var precision = (a.contexte || [])[0] || "";
    var separation = precision.indexOf(" : ");
    if (a.regle === "satisfaction-a-planifier" && a.objet) {
      var t = T.transaction(a.objet.id);
      if (t) infos.push(["Transaction", t.reference]);
    } else if (separation > 0) {
      var libelle = precision.slice(0, separation).replace("Département concerné", "Département");
      infos.push([libelle, precision.slice(separation + 3)]);
    }
    infos.push(["Échéance", UI.echeanceTexte(a.echeance)]);
    var responsable = a.departement === "conseiller" ? "Vous" : ((T.ref.departements[a.departement] || {}).libelle || a.departement || "Vous");
    infos.push(["Responsable", responsable]);
    return '<dl class="sa-infos">' + infos.map(function (x) { return "<div><dt>" + esc(x[0]) + "</dt><dd>" + esc(x[1]) + "</dd></div>"; }).join("") + "</dl>";
  }
  // Menu « Plus » : les autres gestes du Centre d'actions (reporter, ignorer, confier, historique), gardés discrets.
  function menuPlus(a) {
    var items = [
      ["reporter", "bi-clock", "Reporter"],
      ["ignorer", "bi-eye-slash", "Ignorer"],
      [a.assignation ? "reprendre-charge" : "transferer", "bi-people", a.assignation ? "Reprendre en charge" : "Confier à un collègue"],
      ["historique", "bi-clock-history", "Historique de l'action"],
    ];
    return '<div class="dropdown"><button type="button" class="sa-btn" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Autres gestes">Plus</button>' +
      '<div class="dropdown-menu dropdown-menu-end sa-menu">' + items.map(function (x) {
        return '<button type="button" class="dropdown-item" data-ia="' + x[0] + '" data-id="' + esc(a.id) + '"><i class="bi ' + x[1] + '" aria-hidden="true"></i>' + esc(x[2]) + "</button>";
      }).join("") + "</div></div>";
  }
  function carteAction(a) {
    var qui = esc(a.client || "") + (a.vehicule ? " · " + esc(a.vehicule) : "");
    var contexte = [a.declencheur, a.motif].filter(Boolean).map(esc).join(" ");
    return '<article class="sa-verre sa-carte sa-action" data-action-id="' + esc(a.id) + '">' +
      '<header class="sa-action-tete"><div><p class="sa-label">' + esc(a.regleLibelle || "") + '</p><h2 class="sa-action-titre">' + esc(a.actionProposee || "") + "</h2>" +
      '<p class="sa-action-contexte">' + qui + (qui ? ". " : "") + contexte + "</p></div>" +
      '<div class="sa-carte-etat">' + etatPriorite(a.priorite) + "</div></header>" +
      '<footer class="sa-action-pied">' + informations(a) +
      '<div class="sa-boutons"><a class="sa-btn" href="' + esc(I.urlObjet(a)) + '">Consulter le dossier</a>' +
      '<button type="button" class="sa-btn" data-ia="terminer" data-id="' + esc(a.id) + '"><i class="bi bi-check2 sa-vert" aria-hidden="true"></i>Marquer comme réalisée</button>' +
      menuPlus(a) + "</div></footer></article>";
  }
  function rendreActions() {
    var liste = actionsApresVente();
    champ("actions").innerHTML = liste.length ? paginer("actions", liste).map(carteAction).join("")
      : '<div class="sa-verre sa-vide"><i class="bi bi-check2-circle" aria-hidden="true"></i><strong>Aucune action après-vente à traiter</strong></div>';
    if (!liste.length) racine.querySelector('[data-pagination="actions"]').innerHTML = "";
    racine.querySelector('[data-champ="nb-actions"]').textContent = liste.length ? String(liste.length) : "";
  }

  // ---------- Résumé et chiffres ----------

  // « Un suivi est à faire demain », « 2 suivis sont à faire », « Aucun suivi n'est à faire ».
  function phraseSuivis(nombre) {
    if (!nombre) return "Aucun suivi n'est à faire";
    if (nombre > 1) return nombre + " suivis sont à faire";
    var suivi = actionsApresVente().filter(function (a) { return a.regle === "satisfaction-a-planifier"; })[0];
    if (!suivi || !suivi.echeance) return "Un suivi est à faire";
    var quand = P.echeance(suivi.echeance);
    if (quand.indexOf("en retard") === 0) return "Un suivi est " + quand;
    if (quand === "aujourd'hui" || quand === "demain") return "Un suivi est à faire " + quand;
    return "Un suivi est à faire le " + quand;
  }
  function phraseProblemes(nombre) {
    if (!nombre) return "aucun problème n'est ouvert";
    if (nombre === 1) return "un problème est encore ouvert";
    return nombre + " problèmes sont encore ouverts";
  }
  function rendreResume(k) {
    var livres = k.livres || 0;
    var debut = livres ? (livres === 1 ? "1 véhicule livré récemment." : livres + " véhicules livrés récemment.") : "Aucun véhicule livré récemment.";
    var suite = k.suivis == null ? majuscule(phraseProblemes(k.ouverts)) + "." : phraseSuivis(k.suivis) + ", et " + phraseProblemes(k.ouverts) + ".";
    racine.querySelector("[data-resume]").textContent = debut + " " + suite;
  }
  function rendreChiffres(k) {
    Object.keys(k).forEach(function (cle) {
      var el = racine.querySelector('[data-compteur="' + cle + '"]');
      if (el) el.textContent = k[cle] == null ? "Non disponible" : String(k[cle]);
    });
    racine.querySelector('[data-detail="livres"]').textContent = "Confirmés depuis " + ref.config.fenetreLivraisonRecenteJours + " jours";
    // Libellés accordés selon la valeur.
    var libelles = { suivis: ["Suivi à effectuer", "Suivis à effectuer"], retours: ["Retour reçu", "Retours reçus"], ouverts: ["Problème ouvert", "Problèmes ouverts"], resolus: ["Problème résolu", "Problèmes résolus"] };
    Object.keys(libelles).forEach(function (cle) {
      var el = racine.querySelector('[data-libelle="' + cle + '"]');
      if (el) el.textContent = pluriel(k[cle] || 0, libelles[cle][0], libelles[cle][1]);
    });
    racine.querySelector('[data-alerte="suivis"]').hidden = !k.suivis;
    racine.querySelector('[data-alerte="ouverts"]').hidden = !k.ouverts;
    // L'intérêt à recommander n'a plus de carte (5 chiffres au plus) : il est rappelé dans la note de l'onglet 1.
    var interet = racine.querySelector("[data-interet]");
    if (interet) interet.textContent = k.interet ? " " + k.interet + " " + pluriel(k.interet, "client a déclaré", "clients ont déclaré") + " un intérêt à recommander dans l'enquête." : "";
  }

  function rendre() {
    var k = RC.compteursSatisfaction(conseiller());
    rendreResume(k);
    rendreChiffres(k);
    rendreLivraisons();
    rendreProblemes();
    rendreActions();
  }

  // ---------- Événements ----------

  // Un filtre change : chaque liste repart de sa première page.
  function relancer() {
    pages = {};
    rendre();
  }
  champ("f-conseiller").addEventListener("change", relancer);
  champ("f-etat").addEventListener("change", relancer);

  // Pagination : change de page, garde le focus sur le numéro choisi et remonte en haut de la liste.
  racine.addEventListener("click", function (e) {
    var bouton = e.target.closest("[data-aller-page]");
    if (!bouton || bouton.disabled) return;
    var liste = bouton.dataset.liste;
    pages[liste] = Number(bouton.dataset.allerPage);
    rendre();
    var courant = racine.querySelector('[data-liste="' + liste + '"][aria-current="page"]');
    if (courant) courant.focus();
    var zone = racine.querySelector('[data-pagination="' + liste + '"]').previousElementSibling;
    if (zone && zone.scrollIntoView) zone.scrollIntoView({ block: "start", behavior: "smooth" });
  });

  // Ouverture ciblée sur une transaction : on affiche d'abord la page de la liste qui contient sa carte.
  if (focus) {
    var livraisons = livraisonsFiltrees();
    for (var i = 0; i < livraisons.length; i++) {
      if (livraisons[i].transaction.id === focus) pages.livraisons = Math.floor(i / ELEMENTS_PAR_PAGE) + 1;
    }
  }

  RC.abonner(rendre);
  T.abonner(rendre);
  if (I) I.abonner(rendre);
  rendre();

  // Ouverture ciblée : ?transaction=… (carte mise en évidence) et #probleme-… (dossier ouvert).
  var cible = focus && document.getElementById("livraison-" + focus);
  if (cible && cible.scrollIntoView) cible.scrollIntoView({ block: "center" });
  var h = /^#probleme-(.+)$/.exec(window.location.hash || "");
  if (h && RC.probleme(decodeURIComponent(h[1]))) RUI.ouvrirDetailProbleme(decodeURIComponent(h[1]));
})();
