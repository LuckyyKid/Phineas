// Page « Mon réseau et recommandations » : indicateurs et entonnoir calculés, historique des recommandations,
// invitations facultatives, profil commercial et carte de recommandation (fictive).
(function () {
  "use strict";

  var RC = window.RelationsClients, P = window.Prospects, T = window.Transactions, I = window.Intelligence, UI = window.IntelligenceUI;
  var racine = document.getElementById("reseau");
  if (!RC || !P || !T || !racine) return;
  var esc = P.esc, ref = RC.ref;
  var focus = racine.dataset.transaction || null;
  var editeur = null; // transaction de l'invitation en cours de préparation

  function champ(id) { return document.getElementById(id); }
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
  function tauxTexte(e) {
    return e.denominateur == null ? "" : e.taux == null ? "Non disponible" : e.taux + " % de l'étape précédente";
  }

  // ---------- Résultats ----------
  function rendreResultats() {
    var k = RC.indicateursReseau();
    ["preparees", "partagees", "prospects", "opportunites", "rendezVous", "transactions", "livrees"].forEach(function (c) {
      racine.querySelector('[data-compteur="' + c + '"]').textContent = String(k[c]);
    });
    racine.querySelector('[data-detail="doublons"]').textContent = k.doublons ? "nouveaux (" + k.doublons + " doublon(s) rattaché(s))" : "nouveaux";
    var max = k.entonnoir[0].nombre || 1;
    champ("entonnoir").innerHTML = k.entonnoir.map(function (e) {
      return '<li class="rc-etape"><span class="rc-etape-libelle">' + esc(e.libelle) + '</span><span class="rc-etape-barre" aria-hidden="true"><span style="width:' + Math.round(e.nombre / max * 100) + '%"></span></span>' +
        '<strong class="rc-etape-nombre">' + e.nombre + '</strong><span class="rc-etape-taux">' + esc(tauxTexte(e)) + "</span></li>";
    }).join("");
    var l = RC.recommandations();
    champ("recommandations-corps").innerHTML = l.map(function (x) {
      var r = x.recommandation;
      return "<tr" + (r.doublon ? ' class="rc-ligne-close"' : "") + '><td data-label="Référence"><strong>' + esc(r.reference) + "</strong>" + (r.doublon ? '<span class="pr-sous d-block">Doublon : rattachée au contact existant</span>' : "") + "</td>" +
        '<td data-label="Prospect recommandé">' + (x.contact ? '<a class="pr-nom" href="' + esc(P.urlFiche(x.contact.id)) + '">' + esc(x.prospect) + "</a>" : "—") + (x.parrain ? '<span class="pr-sous d-block">Recommandé par ' + esc(x.parrain) + "</span>" : "") + "</td>" +
        '<td data-label="Date">' + esc(P.dateCourte(r.recueLe)) + "</td>" +
        '<td data-label="Opportunité et étape">' + (x.opportunite ? esc(x.opportunite.titre) + '<span class="pr-sous d-block">' + esc(x.etape) + "</span>" : '<span class="text-muted">Aucune nouvelle opportunité</span>') + "</td>" +
        '<td data-label="Résultat"><span class="rc-reco rc-reco-' + esc(x.etat) + '">' + esc(ref.etatsRecommandation[x.etat]) + "</span></td>" +
        '<td data-label="Attribution">' + esc(ref.attributions[r.attribution]) + "</td>" +
        '<td data-label="Conseiller attribué">' + esc(r.conseillerId === P.moiId ? "Vous" : x.conseiller) + "</td></tr>";
    }).join("");
    champ("recommandations-vide").hidden = l.length > 0;
    racine.querySelector("#panneau-resultats .rc-table").hidden = !l.length;
  }

  // ---------- Invitations ----------
  function rendreInvitations() {
    var livs = RC.livraisons().filter(function (l) { return l.conseillerId === P.moiId; });
    var eligibles = livs.filter(function (l) { return l.eligibilite.eligible; });
    racine.querySelector('[data-champ="nb-eligibles"]').textContent = String(eligibles.length);
    champ("eligibles").innerHTML = livs.length ? '<ul class="rc-liste-invit">' + livs.map(function (l) {
      var t = l.transaction;
      return '<li id="eligible-' + esc(t.id) + '"' + (t.id === focus ? ' class="is-focus"' : "") + "><div><strong>" + esc(l.client) + '</strong> <span class="pr-sous">' + esc(l.vehicule + " · livré le " + P.dateCourte(l.confirmeeLe)) + "</span>" +
        (l.invitation ? '<span class="d-block small text-success"><i class="bi bi-check2 me-1"></i>Invitation préparée le ' + esc(P.dateCourte(l.invitation.prepareeLe)) + "</span>"
          : l.eligibilite.eligible ? '<span class="d-block small text-success"><i class="bi bi-check2-circle me-1"></i>Conditions réunies — à valider par vous</span>'
          : '<span class="d-block small text-muted"><i class="bi bi-slash-circle me-1"></i>' + esc(l.eligibilite.raisons.join(" ")) + "</span>") + "</div>" +
        (l.eligibilite.eligible ? '<button type="button" class="btn btn-sm btn-primary" data-reseau="ouvrir-editeur" data-transaction="' + esc(t.id) + '">Préparer l\'invitation</button>' : "") + "</li>";
    }).join("") + "</ul>" : '<p class="text-muted small mb-0">Aucune livraison confirmée.</p>';
    var inv = RC.invitations();
    champ("invitations").innerHTML = inv.length ? '<ul class="rc-liste-invit">' + inv.map(function (x) {
      var i = x.invitation;
      return "<li><div><strong>" + esc(x.client) + '</strong> <span class="pr-sous">préparée le ' + esc(P.dateCourte(i.prepareeLe)) + "</span>" +
        '<span class="d-block small">' + (i.partageeLe ? '<i class="bi bi-send-check me-1"></i>Déclarée partagée le ' + esc(P.dateCourte(i.partageeLe)) : '<i class="bi bi-hourglass me-1"></i>Non déclarée partagée') +
        " · " + x.recommandations + " recommandation(s) associée(s)</span></div>" +
        '<div class="d-flex flex-wrap gap-2">' + (i.partageeLe ? "" : '<button type="button" class="btn btn-sm btn-outline-primary" data-reseau="partagee" data-id="' + esc(i.id) + '">Déclarer comme partagée</button>') +
        '<button type="button" class="btn btn-sm btn-ghost" data-reseau="copier-lien" data-invitation="' + esc(i.id) + '">Copier le lien personnel</button>' +
        '<a class="btn btn-sm btn-ghost" href="' + esc(RC.urlApercu(i.id)) + '">Prévisualiser</a></div></li>';
    }).join("") + "</ul>" : '<p class="text-muted small mb-0">Aucune invitation préparée.</p>';
  }
  function ouvrirEditeur(tid) {
    var t = T.transaction(tid);
    if (!t) return;
    editeur = tid;
    var bloc = champ("editeur-invitation");
    bloc.hidden = false;
    bloc.querySelector('[data-zone="invitation-client"]').innerHTML = "<strong>" + esc(T.nomClient(t)) + "</strong> — " + esc(T.nomVehicule(t)) + " · " + esc(t.reference);
    champ("invitation-texte").value = RC.brouillonInvitation(tid);
    if (bloc.scrollIntoView) bloc.scrollIntoView({ block: "center" });
  }

  // ---------- Profil et carte ----------
  function contacts(pp) {
    return [pp.telephone ? '<li><i class="bi bi-telephone me-1" aria-hidden="true"></i>' + esc(pp.telephone) + "</li>" : "", pp.courriel ? '<li><i class="bi bi-envelope me-1" aria-hidden="true"></i>' + esc(pp.courriel) + "</li>" : "",
      pp.langues.length ? '<li><i class="bi bi-translate me-1" aria-hidden="true"></i>' + esc(pp.langues.join(", ")) + "</li>" : ""].join("");
  }
  function initialesNom(n) {
    return String(n || "").split(" ").filter(Boolean).map(function (m) { return m.charAt(0).toUpperCase(); }).join("").slice(0, 2);
  }
  function rendreProfil() {
    var p = RC.profil(), pp = RC.profilPublic(), f = champ("form-profil");
    if (!f.dataset.rempli) {
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
    champ("carte-apercu").innerHTML = '<article class="rc-carte" aria-label="Carte de recommandation de ' + esc(pp.nom) + '">' +
      '<header class="rc-carte-tete"><span class="brand-mark brand-mark-sm" aria-hidden="true">P</span><span>' + esc(pp.concession) + "</span></header>" +
      '<div class="rc-carte-corps"><span class="rc-avatar" aria-hidden="true">' + esc(initialesNom(pp.nom)) + "</span><div><strong>" + esc(pp.nom) + '</strong><span class="d-block small">' + esc(pp.role) + "</span>" +
      '<ul class="rc-carte-contacts">' + contacts(pp) + "</ul></div></div>" +
      '<p class="rc-carte-message">' + esc(p.messageCarte) + "</p>" +
      '<div class="rc-carte-pied"><code class="rc-lien" data-lien>' + esc(RC.lienDemo()) + '</code><span class="rc-qr" role="img" aria-label="QR de recommandation non généré"><i class="bi bi-qr-code" aria-hidden="true"></i><span>QR de recommandation non généré : aucun composant local disponible. Ne pas confondre avec les QR des véhicules.</span></span></div>' +
      '<span class="rc-carte-demo">Lien fictif — démonstration</span></article>';
    champ("profil-apercu").innerHTML = '<div class="rc-profil-public"><span class="rc-avatar rc-avatar-lg" aria-hidden="true">' + esc(initialesNom(pp.nom)) + "</span><div><h2 class=\"h5 mb-0\">" + esc(pp.nom) + "</h2>" +
      '<p class="small text-muted mb-2">' + esc(pp.role) + " · " + esc(pp.concession) + "</p><p>" + esc(pp.presentation) + '</p><ul class="rc-carte-contacts">' + contacts(pp) + "</ul>" +
      '<div class="d-flex flex-wrap gap-2"><span class="btn btn-sm btn-primary disabled" aria-disabled="true">Prendre contact</span><span class="btn btn-sm btn-outline-primary disabled" aria-disabled="true">Demander un rendez-vous</span></div>' +
      '<p class="form-text mb-0">Aperçu non publié. Les boutons sont actifs dans la prévisualisation du parcours du prospect.</p></div></div>';
  }

  function rendre() {
    rendreResultats();
    rendreInvitations();
    rendreProfil();
  }

  racine.addEventListener("click", function (e) {
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
  champ("form-profil").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target;
    RC.modifierProfil({
      presentation: f.elements.presentation.value.trim(), telephonePro: f.elements.telephonePro.value.trim() || null, courrielPro: f.elements.courrielPro.value.trim() || null,
      messageCarte: f.elements.messageCarte.value.trim() || RC.profil().messageCarte, afficherTelephone: f.elements.afficherTelephone.checked, afficherCourriel: f.elements.afficherCourriel.checked,
      afficherLangues: f.elements.afficherLangues.checked, langues: Array.prototype.filter.call(f.querySelectorAll('[name="langue"]'), function (c) { return c.checked; }).map(function (c) { return c.value; }),
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
