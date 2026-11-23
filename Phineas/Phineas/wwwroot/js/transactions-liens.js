// Liens vers les transactions depuis le détail d'une soumission et la fiche d'un rendez-vous.
// Le bloc est rendu dans [data-trx-lien="soumission|rendezvous"] (data-id = identifiant de la page).
(function () {
  "use strict";

  var T = window.Transactions, P = window.Prospects, S = window.Soumissions, R = window.RendezVous, UI = window.TransactionsUI;
  var bloc = document.querySelector("[data-trx-lien]");
  if (!T || !P || !S || !UI || !bloc) return;
  var esc = P.esc;
  var genre = bloc.dataset.trxLien;
  var id = bloc.dataset.id;

  function carte(titre, corps) {
    return '<section class="card tx-lien mb-4" aria-label="' + esc(titre) + '"><div class="card-body"><div class="tx-lien-tete"><i class="bi bi-cash-coin" aria-hidden="true"></i><strong>' + esc(titre) + "</strong></div>" + corps + "</div></section>";
  }
  function ligneTransaction(t, details) {
    var a = T.analyse(t);
    return '<li><a href="' + esc(T.urlDetail(t.id)) + '"><strong>' + esc(t.reference) + "</strong></a> " + UI.pastilleStatut(a.statut) + UI.miniAxes(a) +
      (details ? '<span class="pr-sous d-block">' + details + "</span>" : "") +
      (UI.resumeBlocage(a) ? '<span class="d-block">' + UI.resumeBlocage(a) + "</span>" : "") + "</li>";
  }

  function rendreSoumission() {
    var s = S.soumission(id);
    if (!s) { bloc.innerHTML = ""; return; }
    var liees = T.parSoumission(s.id);
    var opp = P.opportunite(s.opportuniteId);
    var acceptees = s.versions.filter(function (v) { return v.statut === "Acceptee"; });
    var enCours = opp ? T.enCoursPourOpportunite(opp.id) : null;
    var html = "";
    if (liees.length) {
      html = '<ul class="tx-lien-liste">' + liees.map(function (t) {
        var courante = S.versionCourante(s).numero;
        return ligneTransaction(t, t.brouillon ? "Brouillon : version " + esc(t.versionNumero) + " envisagée, non figée."
          : "Version " + esc(t.versionNumero) + " retenue (figée)" + (courante !== t.versionNumero ? " · la version " + courante + " plus récente n'est pas reprise automatiquement." : "."));
      }).join("") + "</ul>";
    }
    if (!enCours && acceptees.length && opp && P.estActive(opp)) {
      var v = acceptees[acceptees.length - 1];
      html += '<p class="mb-2 small">Version ' + v.numero + " acceptée par le client. Une soumission acceptée n'est pas une vente conclue : ouvrez une transaction pour suivre la finalisation.</p>" +
        '<a class="btn btn-sm btn-primary" href="' + esc(T.urlNouvelle({ soumission: s.id, version: v.numero })) + '"><i class="bi bi-cash-coin me-1"></i>Ouvrir une transaction</a>';
    } else if (enCours && liees.indexOf(enCours) < 0) {
      html += '<p class="mb-0 small">La transaction en cours de cette opportunité (<a href="' + esc(T.urlDetail(enCours.id)) + '">' + esc(enCours.reference) + "</a>) repose sur une autre soumission.</p>";
    }
    bloc.innerHTML = html ? carte("Transaction", html) : "";
  }

  function rendreRendezVous() {
    var r = R ? R.rdv(id) : null;
    if (!r) { bloc.innerHTML = ""; return; }
    var liste = T.parOpportunite(r.opportuniteId);
    var opp = P.opportunite(r.opportuniteId);
    var html = "";
    if (liste.length) {
      html = '<ul class="tx-lien-liste">' + liste.map(function (t) {
        var a = T.analyse(t);
        var details = null;
        if (r.type === "Livraison" && T.estActive(t)) {
          details = a.pret ? "Toutes les conditions de livraison sont remplies." : "Ce rendez-vous ne vaut pas livraison : " + a.conditionsRestantes.length + " condition(s) restante(s).";
        }
        return ligneTransaction(t, details ? esc(details) : null);
      }).join("") + "</ul>";
    }
    var resultatPositif = r.statut === "Termine" && r.resultat && ["abandon", "inconnu"].indexOf(r.resultat.resultat) < 0;
    if (opp && P.estActive(opp) && !T.enCoursPourOpportunite(opp.id) && resultatPositif) {
      html += '<p class="mb-2 small">Le client souhaite poursuivre ? Ouvrez le dossier d\'achat à partir de ce rendez-vous.</p>' +
        '<a class="btn btn-sm btn-outline-primary" href="' + esc(T.urlNouvelle({ rendezvous: r.id })) + '"><i class="bi bi-cash-coin me-1"></i>Ouvrir une transaction</a>';
    }
    bloc.innerHTML = html ? carte(liste.length ? "Transaction liée" : "Transaction", html) : "";
  }

  function rendre() {
    if (genre === "soumission") rendreSoumission();
    else if (genre === "rendezvous") rendreRendezVous();
  }
  T.abonner(rendre);
  rendre();
})();
