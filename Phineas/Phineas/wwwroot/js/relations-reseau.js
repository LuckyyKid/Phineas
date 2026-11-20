// Page « Mon réseau et recommandations » (Views/Relations/Reseau.cshtml) : résumé en mots, chiffres et parcours calculés,
// historique des recommandations, invitations facultatives, profil commercial et carte de recommandation (fictive).
// Les données viennent de window.RelationsClients (relations-store.js) : ce fichier ne calcule rien, il affiche.
(function () {
  "use strict";

  var RC = window.RelationsClients, P = window.Prospects, T = window.Transactions;
  var racine = document.getElementById("reseau");
  if (!RC || !P || !T || !racine) return;
  var esc = P.esc, ref = RC.ref;
  var focus = racine.dataset.transaction || null;
  var editeur = null; // transaction de l'invitation en cours de préparation

  // Au-delà de LIGNES_PAR_PAGE, les listes (historique, clients invitables, invitations) se découpent en pages.
  var LIGNES_PAR_PAGE = 6;
  // Page affichée de chaque liste, rangée par nom de liste (ex. pages.recommandations = 2). Absente = page 1.
  var pages = {};

  function champ(id) { return document.getElementById(id); }
  function zone(nom) { return racine.querySelector('[data-zone="' + nom + '"]'); }

  // Accord simple : forme au singulier pour 0 et 1, au pluriel au-delà.
  function accord(nombre, singulier, pluriel) {
    return nombre > 1 ? pluriel : singulier;
  }

  function initialesNom(nom) {
    var mots = String(nom || "").split(" ").filter(Boolean);
    var initiales = "";
    for (var i = 0; i < mots.length && i < 2; i++) initiales += mots[i].charAt(0).toUpperCase();
    return initiales;
  }

  // Point d'état de 8 px suivi de son libellé. forme : "plein" ou "creux" ; ton : "vert", "ambre", "gris" ou "fonce".
  function etatPoint(forme, ton, libelle) {
    return '<span class="rr-etat rr-ton-' + ton + '"><span class="rr-point rr-point-' + forme + '" aria-hidden="true"></span>' + esc(libelle) + "</span>";
  }

  function copier(texte, message) {
    try {
      if (navigator.clipboard) navigator.clipboard.writeText(texte);
      else {
        var z = document.createElement("textarea");
        z.value = texte; document.body.appendChild(z); z.select(); document.execCommand("copy"); z.remove();
      }
      P.notifier(message);
    } catch (e) {
      P.notifier("Copie impossible : sélectionnez le texte manuellement.");
    }
    racine.dataset.dernierCopie = texte;
  }

  // ---------- Pagination (même rendu que les autres listes en verre) ----------
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

  function boutonPage(liste, numero, libelle, contenu, desactive, courant) {
    return '<button type="button" class="rr-page-btn' + (courant ? " is-active" : "") + '" data-liste="' + liste + '" data-aller-page="' + numero + '"' +
      (desactive ? " disabled" : "") + (courant ? ' aria-current="page"' : "") + ' aria-label="' + libelle + '">' + contenu + "</button>";
  }

  // Éléments de la page courante d'une liste, et la barre de pagination ("" si tout tient sur une page).
  function paginer(liste, elements) {
    var nbPages = Math.max(1, Math.ceil(elements.length / LIGNES_PAR_PAGE));
    // La liste a pu raccourcir : on reste sur une page qui existe.
    var page = Math.min(Math.max(1, pages[liste] || 1), nbPages);
    pages[liste] = page;
    var debut = (page - 1) * LIGNES_PAR_PAGE;
    var barre = "";
    if (nbPages > 1) {
      var fin = Math.min(elements.length, page * LIGNES_PAR_PAGE);
      barre = '<nav class="rr-pagination" aria-label="Pagination">' +
        '<span class="rr-pages-info">' + (debut + 1) + " à " + fin + " sur " + elements.length + '</span><div class="rr-pages">' +
        boutonPage(liste, page - 1, "Page précédente", '<i class="bi bi-chevron-left"></i>', page === 1, false);
      numerosPages(nbPages, page).forEach(function (numero) {
        if (numero === null) barre += '<span class="rr-pages-trou" aria-hidden="true">…</span>';
        else barre += boutonPage(liste, numero, "Page " + numero, String(numero), false, numero === page);
      });
      barre += boutonPage(liste, page + 1, "Page suivante", '<i class="bi bi-chevron-right"></i>', page === nbPages, false) + "</div></nav>";
    }
    return { elements: elements.slice(debut, debut + LIGNES_PAR_PAGE), pagination: barre };
  }

  // ---------- Résumé et chiffres ----------
  // Ex. « 4 prospects vous ont été recommandés. 2 ont obtenu un rendez-vous et 1 transaction est conclue. »
  function phraseResume(k) {
    if (k.prospects === 0) return "Aucun prospect ne vous a encore été recommandé. Votre carte et vos invitations sont prêtes dans les onglets ci-dessous.";
    var phrase = k.prospects === 1 ? "1 prospect vous a été recommandé. " : k.prospects + " prospects vous ont été recommandés. ";
    if (k.rendezVous === 0) phrase += "Aucun n'a encore obtenu de rendez-vous";
    else if (k.rendezVous === 1) phrase += "1 a obtenu un rendez-vous";
    else phrase += k.rendezVous + " ont obtenu un rendez-vous";
    if (k.transactions === 0) phrase += " et aucune transaction n'est conclue.";
    else if (k.transactions === 1) phrase += " et 1 transaction est conclue.";
    else phrase += " et " + k.transactions + " transactions sont conclues.";
    return phrase;
  }

  function texteDetailInvitations(k) {
    if (k.preparees === 0) return "Par vous";
    if (k.partagees === 0) return "Par vous, aucune déclarée partagée";
    if (k.partagees === k.preparees) return "Par vous, " + accord(k.partagees, "déclarée partagée", "déclarées partagées");
    return "Par vous, " + k.partagees + " " + accord(k.partagees, "déclarée partagée", "déclarées partagées");
  }

  function rendreChiffres(k) {
    ["preparees", "prospects", "rendezVous", "transactions", "livrees"].forEach(function (cle) {
      racine.querySelector('[data-compteur="' + cle + '"]').textContent = String(k[cle]);
    });
    racine.querySelector('[data-libelle="preparees"]').textContent = accord(k.preparees, "Invitation préparée", "Invitations préparées");
    racine.querySelector('[data-libelle="prospects"]').textContent = accord(k.prospects, "Prospect recommandé", "Prospects recommandés");
    racine.querySelector('[data-libelle="transactions"]').textContent = accord(k.transactions, "Transaction conclue", "Transactions conclues");
    racine.querySelector('[data-libelle="livrees"]').textContent = accord(k.livrees, "Vente livrée", "Ventes livrées");
    racine.querySelector('[data-detail="preparees"]').textContent = texteDetailInvitations(k);
    var detailProspects = accord(k.prospects, "Nouveau", "Nouveaux");
    if (k.doublons) detailProspects += ", " + k.doublons + " " + accord(k.doublons, "doublon rattaché", "doublons rattachés");
    racine.querySelector('[data-detail="doublons"]').textContent = detailProspects;
    racine.querySelector('[data-detail="rendezVous"]').textContent = accord(k.rendezVous, "Obtenu", "Obtenus");
    racine.querySelector("[data-resume]").textContent = phraseResume(k);
  }

  // ---------- Onglet 1 : parcours et historique ----------
  // Précision sous chaque étape du parcours : point de départ, ou part de l'étape précédente.
  function precisionEtape(e) {
    if (e.denominateur == null) return "Point de départ";
    if (e.taux == null) return "Non disponible";
    return e.taux + " % de l'étape précédente";
  }

  function rendreParcours(k) {
    var max = k.entonnoir[0].nombre || 1;
    champ("entonnoir").innerHTML = k.entonnoir.map(function (e) {
      var largeur = Math.round(e.nombre / max * 100);
      return '<li class="rr-etape" title="' + esc(e.libelle + " : " + e.nombre) + '">' +
        '<span class="rr-etape-texte"><span class="rr-etape-libelle">' + esc(e.libelle) + '</span><span class="rr-etape-precision">' + esc(precisionEtape(e)) + "</span></span>" +
        '<span class="rr-etape-piste" aria-hidden="true"><span class="rr-etape-barre" style="width:' + largeur + '%"></span></span>' +
        '<strong class="rr-etape-nombre">' + e.nombre + "</strong></li>";
    }).join("");
  }

  // Résultat d'une recommandation : point + libellé selon son état.
  function htmlResultat(x) {
    if (x.recommandation.doublon) return etatPoint("creux", "gris", "Doublon rattaché");
    var libelle = ref.etatsRecommandation[x.etat] || x.etat;
    if (x.etat === "nouveau") return etatPoint("creux", "vert", libelle);
    if (x.etat === "gagne") return etatPoint("plein", "vert", libelle);
    if (x.etat === "perdu") return etatPoint("plein", "fonce", libelle);
    return etatPoint("plein", "ambre", libelle); // en qualification ou en cours
  }

  function ligneRecommandation(x) {
    var r = x.recommandation;
    var nom = x.contact ? '<a class="rr-nom" href="' + esc(P.urlFiche(x.contact.id)) + '">' + esc(x.prospect) + "</a>" : '<span class="rr-nom">' + esc(x.prospect) + "</span>";
    var sousNom = "";
    if (r.doublon) sousNom = "Doublon : rattaché au contact existant";
    else if (x.parrain) sousNom = "Recommandé par " + x.parrain;
    var opportunite = x.opportunite
      ? esc(x.opportunite.titre) + '<span class="rr-sous">' + esc(x.etape) + "</span>"
      : '<span class="rr-attenue">Aucune nouvelle opportunité</span>';
    // Le conseiller n'est affiché que s'il ne s'agit pas de vous.
    var conseiller = r.conseillerId === P.moiId ? "" : '<span class="rr-sous">Conseiller : ' + esc(x.conseiller) + "</span>";
    return "<tr>" +
      '<td><span class="rr-ref">' + esc(r.reference) + "</span></td>" +
      "<td>" + nom + (sousNom ? '<span class="rr-sous">' + esc(sousNom) + "</span>" : "") + "</td>" +
      '<td class="rr-nowrap">' + esc(P.dateCourte(r.recueLe)) + "</td>" +
      "<td>" + opportunite + "</td>" +
      "<td>" + htmlResultat(x) + "</td>" +
      "<td>" + esc(ref.attributions[r.attribution] || r.attribution) + conseiller + "</td></tr>";
  }

  function rendreHistorique() {
    var l = RC.recommandations();
    var morceau = paginer("recommandations", l);
    champ("recommandations-corps").innerHTML = morceau.elements.map(ligneRecommandation).join("");
    zone("pagination-recommandations").innerHTML = morceau.pagination;
    champ("recommandations-vide").hidden = l.length > 0;
    racine.querySelector("#panneau-resultats .rr-defile").hidden = !l.length;
  }

  // ---------- Onglet 2 : invitations ----------
  function etatInvitable(l) {
    if (l.invitation) return etatPoint("plein", "vert", "Invitation préparée le " + P.dateCourte(l.invitation.prepareeLe));
    if (l.eligibilite.eligible) return etatPoint("creux", "vert", "Conditions réunies, à valider par vous");
    return etatPoint("creux", "gris", l.eligibilite.raisons.join(" "));
  }

  function ligneInvitable(l) {
    var t = l.transaction;
    var bouton = l.eligibilite.eligible
      ? '<button type="button" class="rr-btn-blanc rr-btn-petit" data-reseau="ouvrir-editeur" data-transaction="' + esc(t.id) + '">Préparer l\'invitation</button>'
      : "";
    return '<li class="rr-personne' + (t.id === focus ? " is-focus" : "") + '" id="eligible-' + esc(t.id) + '">' +
      '<span class="rr-avatar" aria-hidden="true">' + esc(initialesNom(l.client)) + "</span>" +
      '<div class="rr-personne-texte"><strong>' + esc(l.client) + '</strong><span class="rr-sous">' + esc(l.vehicule + " · livré le " + P.dateCourte(l.confirmeeLe)) + "</span></div>" +
      '<div class="rr-personne-etat">' + etatInvitable(l) + bouton + "</div></li>";
  }

  function blocInvitation(x) {
    var i = x.invitation;
    var quand = "Préparée le " + P.dateCourte(i.prepareeLe);
    quand += i.partageeLe ? ", déclarée partagée le " + P.dateCourte(i.partageeLe) : ", pas encore déclarée partagée";
    var recos = x.recommandations
      ? etatPoint("plein", "vert", x.recommandations + " " + accord(x.recommandations, "recommandation associée", "recommandations associées"))
      : etatPoint("creux", "gris", "Aucune recommandation associée");
    var declarer = i.partageeLe ? "" : '<button type="button" class="rr-btn-blanc rr-btn-petit" data-reseau="partagee" data-id="' + esc(i.id) + '"><i class="bi bi-send-check" aria-hidden="true"></i>Déclarer comme partagée</button>';
    return '<div class="rr-invitation"><strong class="rr-invitation-nom">' + esc(x.client) + '</strong><span class="rr-sous">' + esc(quand) + "</span>" +
      '<div class="rr-invitation-etat">' + recos + "</div>" +
      '<div class="rr-boutons">' + declarer +
      '<button type="button" class="rr-btn-blanc rr-btn-petit" data-reseau="copier-lien" data-invitation="' + esc(i.id) + '"><i class="bi bi-link-45deg" aria-hidden="true"></i>Copier le lien personnel</button>' +
      '<a class="rr-btn-blanc rr-btn-petit" href="' + esc(RC.urlApercu(i.id)) + '"><i class="bi bi-eye" aria-hidden="true"></i>Prévisualiser</a></div></div>';
  }

  function rendreInvitations() {
    var livs = RC.livraisons().filter(function (l) { return l.conseillerId === P.moiId; });
    var eligibles = livs.filter(function (l) { return l.eligibilite.eligible; });
    racine.querySelector('[data-champ="nb-eligibles"]').textContent = eligibles.length ? String(eligibles.length) : "";

    var pageLivs = paginer("eligibles", livs);
    champ("eligibles").innerHTML = livs.length
      ? '<ul class="rr-personnes">' + pageLivs.elements.map(ligneInvitable).join("") + "</ul>"
      : '<p class="rr-vide-texte">Aucune livraison confirmée pour le moment.</p>';
    zone("pagination-eligibles").innerHTML = pageLivs.pagination;

    var inv = RC.invitations();
    var pageInv = paginer("invitations", inv);
    champ("invitations").innerHTML = inv.length
      ? pageInv.elements.map(blocInvitation).join("")
      : '<p class="rr-vide-texte">Aucune invitation préparée. Elles apparaîtront ici dès que vous en enregistrerez une.</p>';
    zone("pagination-invitations").innerHTML = pageInv.pagination;
  }

  function ouvrirEditeur(tid) {
    var t = T.transaction(tid);
    if (!t) return;
    editeur = tid;
    var bloc = champ("editeur-invitation");
    bloc.hidden = false;
    bloc.querySelector('[data-zone="invitation-client"]').innerHTML = "<strong>" + esc(T.nomClient(t)) + "</strong>, " + esc(T.nomVehicule(t)) + " · " + esc(t.reference);
    champ("invitation-texte").value = RC.brouillonInvitation(tid);
    if (bloc.scrollIntoView) bloc.scrollIntoView({ block: "center" });
  }

  // ---------- Onglet 3 : profil et carte ----------
  // Remplit le formulaire une seule fois avec le profil enregistré : ensuite, ce que l'utilisateur tape fait foi.
  function remplirFormulaire() {
    var p = RC.profil(), f = champ("form-profil");
    if (f.dataset.rempli) return;
    f.elements.presentation.value = p.presentation;
    f.elements.telephonePro.value = p.telephonePro || "";
    f.elements.courrielPro.value = p.courrielPro || "";
    f.elements.messageCarte.value = p.messageCarte;
    f.elements.afficherTelephone.checked = p.afficherTelephone;
    f.elements.afficherCourriel.checked = p.afficherCourriel;
    f.elements.afficherLangues.checked = p.afficherLangues;
    f.querySelectorAll('[name="langue"]').forEach(function (c) { c.checked = p.langues.indexOf(c.value) >= 0; });
    f.dataset.rempli = "1";
  }

  function languesCochees(f) {
    var cles = [];
    f.querySelectorAll('[name="langue"]').forEach(function (c) { if (c.checked) cles.push(c.value); });
    return cles;
  }

  // Ce que la carte affiche, lu dans le formulaire en cours (même règle que profilPublic : seules les informations cochées).
  function brouillonCarte() {
    var f = champ("form-profil");
    var pp = RC.profilPublic();
    var langues = languesCochees(f).map(function (cle) { return ref.langues[cle] || cle; });
    return {
      nom: pp.nom, role: pp.role, concession: pp.concession,
      message: f.elements.messageCarte.value.trim() || RC.profil().messageCarte,
      telephone: f.elements.afficherTelephone.checked ? f.elements.telephonePro.value.trim() : "",
      courriel: f.elements.afficherCourriel.checked ? f.elements.courrielPro.value.trim() : "",
      langues: f.elements.afficherLangues.checked ? langues : [],
    };
  }

  function ligneContact(icone, texte) {
    return '<li><i class="bi ' + icone + '" aria-hidden="true"></i><span>' + esc(texte) + "</span></li>";
  }

  function contactsCarte(c) {
    var html = "";
    if (c.telephone) html += ligneContact("bi-telephone", c.telephone);
    if (c.courriel) html += ligneContact("bi-envelope", c.courriel);
    if (c.langues.length) html += ligneContact("bi-translate", c.langues.join(", "));
    return html;
  }

  // Lien affiché sans « https:// » pour rester lisible ; la copie garde l'adresse complète.
  function lienLisible() {
    return RC.lienDemo().replace(/^https?:\/\//, "");
  }

  function rendreCarte() {
    var c = brouillonCarte();
    var contacts = contactsCarte(c);
    champ("carte-apercu").innerHTML = '<article class="rr-carte-reco" aria-label="Carte de recommandation de ' + esc(c.nom) + '">' +
      '<header class="rr-reco-tete"><span class="rr-reco-marque"><span class="rr-reco-logo" aria-hidden="true"></span>' + esc(c.concession) + "</span>" +
      '<span class="rr-reco-etiquette">Carte de recommandation</span></header>' +
      '<div class="rr-reco-identite"><span class="rr-reco-avatar" aria-hidden="true">' + esc(initialesNom(c.nom)) + "</span>" +
      '<div><p class="rr-reco-nom">' + esc(c.nom) + '</p><p class="rr-reco-role">' + esc(c.role) + "</p></div></div>" +
      '<p class="rr-reco-message">' + esc(c.message) + "</p>" +
      (contacts ? '<ul class="rr-reco-contacts">' + contacts + "</ul>" : "") +
      '<div class="rr-reco-lien"><span class="rr-reco-qr" role="img" aria-label="Code QR non généré"><i class="bi bi-qr-code" aria-hidden="true"></i></span>' +
      '<div><code data-lien>' + esc(lienLisible()) + '</code><span class="rr-reco-mention">Lien fictif de démonstration. Code QR non généré.</span></div></div>' +
      "</article>";
  }

  // Aperçu du profil public : ce que la personne recommandée verrait, d'après le profil ENREGISTRÉ.
  function rendreProfilPublic() {
    var pp = RC.profilPublic();
    var contacts = contactsCarte({ telephone: pp.telephone, courriel: pp.courriel, langues: pp.langues });
    champ("profil-apercu").innerHTML = '<div class="rr-profil-public"><span class="rr-avatar rr-avatar-grand" aria-hidden="true">' + esc(initialesNom(pp.nom)) + "</span>" +
      '<div><p class="rr-profil-nom">' + esc(pp.nom) + '</p><p class="rr-sous">' + esc(pp.role + " · " + pp.concession) + "</p>" +
      '<p class="rr-profil-presentation">' + esc(pp.presentation) + "</p>" +
      (contacts ? '<ul class="rr-profil-contacts">' + contacts + "</ul>" : "") +
      '<div class="rr-boutons"><span class="rr-btn-blanc rr-btn-petit is-inactif" aria-disabled="true">Prendre contact</span><span class="rr-btn-blanc rr-btn-petit is-inactif" aria-disabled="true">Demander un rendez-vous</span></div>' +
      '<p class="rr-aide">Aperçu non publié. Les boutons sont actifs dans la prévisualisation du parcours du prospect.</p></div></div>';
  }

  // Les pilules à bascule prennent leur style « activé » selon la case qu'elles contiennent.
  function majBascules() {
    racine.querySelectorAll(".rr-bascule").forEach(function (b) {
      b.classList.toggle("is-active", b.querySelector("input").checked);
    });
  }

  function rendreProfil() {
    remplirFormulaire();
    majBascules();
    rendreCarte();
    rendreProfilPublic();
  }

  // ---------- Assemblage ----------
  function rendre() {
    var k = RC.indicateursReseau();
    rendreChiffres(k);
    rendreParcours(k);
    rendreHistorique();
    rendreInvitations();
    rendreProfil();
  }

  racine.addEventListener("click", function (e) {
    var pageBouton = e.target.closest("[data-aller-page]");
    if (pageBouton && !pageBouton.disabled) {
      // Pagination : change de page et garde le focus sur le numéro choisi.
      var liste = pageBouton.dataset.liste;
      pages[liste] = Number(pageBouton.dataset.allerPage);
      rendre();
      var courant = racine.querySelector('[data-liste="' + liste + '"][aria-current="page"]');
      if (courant) courant.focus();
      return;
    }
    var b = e.target.closest("[data-reseau]");
    if (!b) return;
    var q = b.dataset.reseau;
    if (q === "ouvrir-editeur") ouvrirEditeur(b.dataset.transaction);
    else if (q === "fermer-editeur") { editeur = null; champ("editeur-invitation").hidden = true; }
    else if (q === "copier-invitation") copier(champ("invitation-texte").value, "Message copié. Rien n'a été envoyé.");
    else if (q === "preparer") {
      var r = RC.preparerInvitation(editeur, champ("invitation-texte").value);
      if (r.erreur) return P.notifier(r.erreur);
      editeur = null;
      champ("editeur-invitation").hidden = true;
      P.notifier("Invitation enregistrée. Partagez-la vous-même, puis déclarez-la comme partagée.");
    } else if (q === "partagee") {
      P.notifier(RC.declarerPartagee(b.dataset.id) ? "Invitation déclarée comme partagée (aucun envoi par Phineas)." : "Action impossible.");
    } else if (q === "copier-lien") copier(RC.lienDemo(b.dataset.invitation || null), "Lien de démonstration copié : il ne donne accès à rien tant qu'aucun portail public n'existe.");
    else if (q === "copier-message") copier(RC.messagePartage(), "Message de partage copié. Rien n'a été envoyé.");
    else if (q === "voir-recommandations") bootstrap.Tab.getOrCreateInstance(champ("onglet-resultats")).show();
  });

  // Mise à jour en direct de la carte pendant la saisie (rien n'est enregistré avant « Enregistrer le profil »).
  var formulaire = champ("form-profil");
  formulaire.addEventListener("input", function () { majBascules(); rendreCarte(); });
  formulaire.addEventListener("change", function () { majBascules(); rendreCarte(); });
  formulaire.addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target;
    RC.modifierProfil({
      presentation: f.elements.presentation.value.trim(), telephonePro: f.elements.telephonePro.value.trim() || null, courrielPro: f.elements.courrielPro.value.trim() || null,
      messageCarte: f.elements.messageCarte.value.trim() || RC.profil().messageCarte, afficherTelephone: f.elements.afficherTelephone.checked, afficherCourriel: f.elements.afficherCourriel.checked,
      afficherLangues: f.elements.afficherLangues.checked, langues: languesCochees(f),
    });
    P.notifier("Profil enregistré localement (le compte de connexion n'est pas modifié).");
  });

  var apercu = document.querySelector("[data-rc-apercu]");
  if (apercu) apercu.href = RC.urlApercu();

  RC.abonner(rendre);
  P.abonner(rendre);
  T.abonner(rendre);
  rendre();
  // Ouverture ciblée : ?transaction=… (depuis une action « invitation ») ou ?onglet=profil.
  var onglet = focus ? "invitations" : racine.dataset.onglet;
  if (onglet && champ("onglet-" + onglet) && window.bootstrap) bootstrap.Tab.getOrCreateInstance(champ("onglet-" + onglet)).show();
  if (focus && RC.livraisons().some(function (l) { return l.transaction.id === focus && l.eligibilite.eligible; })) ouvrirEditeur(focus);
})();
