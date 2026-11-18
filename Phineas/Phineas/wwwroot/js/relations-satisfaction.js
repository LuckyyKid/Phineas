// Page « Satisfaction et après-vente » : suivis après livraison, retours (simulés), problèmes clients, actions.
// Les suivis à effectuer viennent du moteur de la phase 06 (règle « Livraison confirmée : suivi de satisfaction »).
(function () {
  "use strict";

  var RC = window.RelationsClients, P = window.Prospects, T = window.Transactions, I = window.Intelligence, UI = window.IntelligenceUI, RUI = window.RelationsUI;
  var racine = document.getElementById("satisfaction");
  if (!RC || !P || !T || !UI || !RUI || !racine) return;
  var esc = P.esc, ref = RC.ref;
  var focus = racine.dataset.transaction || null;
  var urlRdv = racine.dataset.rdvUrl || "#";

  function champ(id) { return document.getElementById(id); }
  function conseiller() { return champ("f-conseiller").value || null; }

  function actionsDe(tid, regle) {
    return I ? I.actives().filter(function (a) { return a.objet && a.objet.id === tid && (!regle || a.regle === regle); }) : [];
  }
  function blocDimensions(l) {
    return '<div class="rc-dimensions">' + l.dimensions.map(function (d) {
      var alerte = d.minimum != null && d.minimum <= ref.config.seuilInsatisfait;
      return '<div class="rc-dim' + (alerte ? " is-alerte" : "") + '"><span class="rc-dim-libelle">' + esc(d.libelle) + (alerte ? ' <i class="bi bi-exclamation-triangle-fill text-danger" aria-label="Insatisfaction"></i>' : "") +
        '<span class="pr-sous d-block">' + d.evalues + " / " + d.total + " élément(s) évalué(s)</span></span>" + RUI.barre(d.moyenne, 5, d.libelle) + "</div>";
    }).join("") + "</div>";
  }
  function carte(l) {
    var t = l.transaction, e = l.enquete;
    var suivi = actionsDe(t.id, "satisfaction-a-planifier")[0];
    var c = P.contact(t.prospectId);
    var probs = l.problemes;
    var ouverts = probs.filter(RC.regles.problemeOuvert);
    var etatSuivi = e ? '<span class="rc-etat rc-etat-ok"><i class="bi bi-chat-square-heart me-1" aria-hidden="true"></i>Retour reçu le ' + esc(P.dateCourte(e.recueLe)) + "</span>"
      : suivi ? '<span class="rc-etat rc-etat-attention"><i class="bi bi-telephone-outbound me-1" aria-hidden="true"></i>Suivi à effectuer · ' + esc(UI.echeanceTexte(suivi.echeance)) + "</span>"
      : '<span class="rc-etat"><i class="bi bi-dash-circle me-1" aria-hidden="true"></i>Aucun retour enregistré</span>';
    return '<article class="rc-livraison' + (t.id === focus ? " is-focus" : "") + '" id="livraison-' + esc(t.id) + '" aria-labelledby="lv-' + esc(t.id) + '">' +
      '<header class="rc-livraison-tete"><div><h2 class="h6 mb-0" id="lv-' + esc(t.id) + '"><a href="' + esc(P.urlFiche(t.prospectId)) + '">' + esc(l.client) + "</a></h2>" +
      '<span class="pr-sous">' + esc(l.vehicule) + ' · <a href="' + esc(T.urlDetail(t.id)) + '">' + esc(t.reference) + "</a> · livré le " + esc(P.dateCourte(l.confirmeeLe)) + (t.conseillerId !== P.moiId ? " · " + esc(P.conseiller(t.conseillerId).nom) + " (fictif)" : "") + "</span></div>" + etatSuivi + "</header>" +
      (e ? blocDimensions(l) + '<p class="small mb-1"><strong>Satisfaction globale :</strong> ' + esc(ref.echelle[String(e.globale)]) + " (" + e.globale + " / 5)" + (e.commentaire ? " — « " + esc(e.commentaire) + " »" : "") + "</p>" +
        '<p class="small text-muted mb-2">Chaque dimension relève d\'un département différent : ces réponses ne mesurent pas la performance du conseiller.' + (e.simule ? " Retour représenté par simulation." : "") + "</p>" : "") +
      (probs.length ? '<ul class="rc-problemes-mini">' + probs.map(function (p) { return '<li><button type="button" class="btn btn-link btn-sm p-0" data-rc="probleme-detail" data-id="' + esc(p.id) + '">' + esc(p.nature) + "</button> " + RUI.pastilleProbleme(p.statut) + "</li>"; }).join("") + "</ul>" : "") +
      '<p class="small mb-2"><strong>Invitation à recommander :</strong> ' + (l.invitation ? "préparée le " + esc(P.dateCourte(l.invitation.prepareeLe)) + (l.invitation.partageeLe ? ", déclarée partagée" : "")
        : l.eligibilite.eligible ? 'envisageable (à valider par vous) — <a href="' + esc(ref.urls.reseau + "?transaction=" + encodeURIComponent(t.id)) + '">préparer</a>' : "non proposée : " + esc(l.eligibilite.raisons.join(" ").toLowerCase())) + "</p>" +
      '<footer class="ia-carte-actions">' +
      (suivi ? '<button type="button" class="btn btn-sm btn-primary" data-ia="relance" data-id="' + esc(suivi.id) + '"><i class="bi bi-pencil-square me-1"></i>Préparer le suivi</button>' : "") +
      (!e ? '<button type="button" class="btn btn-sm btn-outline-primary" data-rc="enquete" data-transaction="' + esc(t.id) + '"><i class="bi bi-cone-striped me-1"></i>Saisir un retour reçu (simulation)</button>' : "") +
      '<button type="button" class="btn btn-sm btn-outline-primary" data-rc="probleme" data-transaction="' + esc(t.id) + '"' + (e ? ' data-enquete="' + esc(e.id) + '"' : "") + '><i class="bi bi-life-preserver me-1"></i>Signaler un problème</button>' +
      (c ? '<a class="btn btn-sm btn-ghost" href="' + esc(urlRdv + "?opportunite=" + encodeURIComponent(t.opportuniteId) + "&type=SuiviApresVente") + '"><i class="bi bi-calendar-plus me-1"></i>Planifier une rencontre</a>' : "") +
      (ouverts.length ? '<span class="small text-danger ms-auto"><i class="bi bi-exclamation-octagon me-1"></i>' + ouverts.length + " problème(s) ouvert(s)</span>" : "") +
      "</footer></article>";
  }
  function rendreLivraisons() {
    var f = champ("f-etat").value;
    var l = RC.livraisons().filter(function (x) { return !conseiller() || x.conseillerId === conseiller(); }).filter(function (x) {
      if (f === "a-faire") return !x.enquete && actionsDe(x.transaction.id, "satisfaction-a-planifier").length;
      if (f === "recu") return !!x.enquete;
      if (f === "probleme") return x.problemes.some(RC.regles.problemeOuvert);
      return true;
    });
    champ("livraisons").innerHTML = l.map(carte).join("");
    champ("livraisons-vide").hidden = l.length > 0;
  }
  function rendreProblemes() {
    var l = RC.problemes().filter(function (x) { return x.transaction && (!conseiller() || x.transaction.conseillerId === conseiller()); });
    champ("problemes-corps").innerHTML = l.map(function (x) {
      var p = x.probleme;
      return '<tr id="probleme-' + esc(p.id) + '"' + (x.ouvert ? "" : ' class="rc-ligne-close"') + '><td data-label="Client"><a class="pr-nom" href="' + esc(P.urlFiche(x.transaction.prospectId)) + '">' + esc(x.client) + "</a></td>" +
        '<td data-label="Transaction et véhicule"><a href="' + esc(T.urlDetail(x.transaction.id)) + '">' + esc(x.transaction.reference) + '</a><span class="pr-sous d-block">' + esc(x.vehicule) + "</span></td>" +
        '<td data-label="Problème"><button type="button" class="btn btn-link p-0 text-start" data-rc="probleme-detail" data-id="' + esc(p.id) + '">' + esc(p.nature) + '</button><span class="pr-sous d-block">' + esc(ref.typesProbleme[p.type]) + "</span></td>" +
        '<td data-label="Signalé le">' + esc(P.dateCourte(p.signaleLe)) + "</td>" +
        '<td data-label="Département">' + esc((T.ref.departements[p.departement] || {}).libelle || p.departement) + '<span class="pr-sous d-block">' + esc(p.responsable || "") + "</span></td>" +
        '<td data-label="Priorité">' + UI.pastillePriorite(p.priorite) + "</td>" +
        '<td data-label="État">' + RUI.pastilleProbleme(p.statut) + "</td>" +
        '<td data-label="Prochaine action">' + esc(p.prochaineAction || (p.statut === "Resolu" ? "Vérifier avec le client" : "—")) + "</td></tr>";
    }).join("");
    champ("problemes-vide").hidden = l.length > 0;
    racine.querySelector(".rc-table").hidden = !l.length;
    racine.querySelector('[data-champ="nb-problemes"]').textContent = String(l.filter(function (x) { return x.ouvert; }).length);
  }
  var APRES_VENTE = ["satisfaction-a-planifier", "client-insatisfait", "probleme-a-traiter", "probleme-resolu-verifier", "invitation-referencement"];
  function rendreActions() {
    var l = I ? I.actives({ conseiller: conseiller() }).filter(function (a) { return APRES_VENTE.indexOf(a.regle) >= 0; }) : [];
    champ("actions").innerHTML = l.length ? l.map(function (a) { return UI.carte(a); }).join("") : '<div class="sv-empty"><i class="bi bi-check2-circle"></i><span>Aucune action après-vente à traiter.</span></div>';
    racine.querySelector('[data-champ="nb-actions"]').textContent = String(l.length);
  }
  function rendre() {
    var k = RC.compteursSatisfaction(conseiller());
    Object.keys(k).forEach(function (c) { var e = racine.querySelector('[data-compteur="' + c + '"]'); if (e) e.textContent = k[c] == null ? "—" : String(k[c]); });
    racine.querySelector('[data-detail="livres"]').textContent = "confirmées depuis " + ref.config.fenetreLivraisonRecenteJours + " jours";
    rendreLivraisons();
    rendreProblemes();
    rendreActions();
  }
  champ("f-conseiller").addEventListener("change", rendre);
  champ("f-etat").addEventListener("change", rendre);
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
