// Page « Transactions » : indicateurs, vue Liste et vue Pipeline, recherche et filtres sur les données locales.
(function () {
  "use strict";

  var T = window.Transactions, P = window.Prospects, S = window.Soumissions, UI = window.TransactionsUI;
  var racine = document.getElementById("transactions");
  if (!T || !P || !S || !UI || !racine) return;
  var esc = P.esc;
  var ref = T.ref;

  var f = {
    recherche: document.getElementById("f-recherche"),
    conseiller: document.getElementById("f-conseiller"),
    etape: document.getElementById("f-etape"),
    mode: document.getElementById("f-mode"),
    financement: document.getElementById("f-financement"),
    departement: document.getElementById("f-departement"),
    livraison: document.getElementById("f-livraison"),
    bloquees: document.getElementById("f-bloquees"),
    action: document.getElementById("f-action"),
  };
  f.conseiller.value = P.moiId;
  var corps = document.getElementById("liste-corps");
  var board = document.getElementById("pipeline");
  var CLE_VUE = "phineas.salesos.transactions.v1:vue";

  function normaliser(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  function actionRequise(a) {
    return a.actionsVendeur.length > 0 || a.blocages.some(function (b) { return b.proprietaire === "vendeur"; });
  }
  var FIN_ATTENTE = ["Transmis", "EnAnalyse", "InformationRequise"];
  function financementEnAttente(t) {
    var fin = t.financement || {};
    return FIN_ATTENTE.indexOf(fin.statut) >= 0 || (fin.statut === "ApprouveSousConditions" && (fin.conditions || []).some(function (c) { return !c.remplie; }));
  }
  function estOuverte(a) {
    return ["Livree", "Cloturee", "Annulee"].indexOf(a.statut) < 0;
  }

  function correspond(t, a) {
    if (f.conseiller.value && t.conseillerId !== f.conseiller.value) return false;
    var q = normaliser(f.recherche.value.trim());
    if (q) {
      var v = T.vehiculeDe(t);
      var texte = [T.nomClient(t), t.reference, T.nomVehicule(t), v ? v.numeroStock : ""].join(" ");
      if (normaliser(texte).indexOf(q) < 0) return false;
    }
    if (f.etape.value && a.etapePipeline !== f.etape.value) return false;
    if (f.mode.value && t.modeAchat !== f.mode.value) return false;
    if (f.financement.value && (t.financement || {}).statut !== f.financement.value) return false;
    if (f.departement.value && !a.elements.some(function (e) { return e.departement === f.departement.value && e.niveau !== "information"; })) return false;
    if (f.bloquees.checked && !a.blocages.length) return false;
    if (f.action.checked && !actionRequise(a)) return false;
    var date = t.livraison && t.livraison.datePrevue;
    if (f.livraison.value === "connue" && !date) return false;
    if (f.livraison.value === "inconnue" && (date || !estOuverte(a))) return false;
    if (f.livraison.value === "7j" && !(date && P.ecartJours(date) >= 0 && P.ecartJours(date) <= 7)) return false;
    return true;
  }
  function filtresActifs() {
    return !!(f.recherche.value.trim() || f.conseiller.value !== P.moiId || f.etape.value || f.mode.value || f.financement.value || f.departement.value || f.livraison.value || f.bloquees.checked || f.action.checked);
  }

  // ---------- Indicateurs (mes transactions) ----------
  function compteurs() {
    var miennes = T.liste().filter(function (t) { return t.conseillerId === P.moiId; });
    var c = { actives: 0, action: 0, bloquees: 0, financement: 0, pretes: 0, finalisees: 0 };
    miennes.forEach(function (t) {
      var a = T.analyse(t);
      if (T.estActive(t)) {
        c.actives++;
        if (actionRequise(a)) c.action++;
        if (a.blocages.length) c.bloquees++;
        if (financementEnAttente(t)) c.financement++;
        if (a.pret) c.pretes++;
      }
      if (t.statut === "Livree" || t.statut === "Cloturee") c.finalisees++;
    });
    Object.keys(c).forEach(function (k) {
      var el = document.querySelector('[data-compteur="' + k + '"]');
      if (el) el.textContent = String(c[k]);
    });
  }

  // ---------- Cellules communes ----------
  function montantTexte(t) {
    var m = T.montants(t);
    if (!m) return '<span class="text-muted">À déterminer</span>';
    return esc(UI.montant(m.totalEstime)) + (m.figee ? "" : ' <span class="tx-brouillon-tag">non figé</span>');
  }
  function livraisonTexte(t, a) {
    var d = t.livraison && t.livraison.datePrevue;
    if (a.statut === "Livree" || a.statut === "Cloturee") return '<span class="pr-sous">Livrée le ' + esc(P.dateCourte(t.livraison.confirmeeLe || d)) + "</span>";
    if (a.statut === "Annulee") return '<span class="text-muted">—</span>';
    if (!d) return '<span class="text-muted">Non déterminée</span>';
    return esc(P.dateCourte(d)) + '<span class="pr-sous d-block">' + esc(P.echeance(d)) + (a.statut === "LivraisonPlanifiee" ? " · rendez-vous planifié" : "") + "</span>";
  }
  function departementsTexte(a) {
    if (!a.departementsAttendus.length) return '<span class="text-muted">—</span>';
    return a.departementsAttendus.map(function (d) { return '<span class="tx-dep">' + esc(d.libelle) + "</span>"; }).join("");
  }
  function prochaineTexte(a) {
    var p = a.prochaineAction;
    return esc(p.texte) + (p.responsable ? '<span class="pr-sous d-block">' + esc(p.responsable.libelle) + "</span>" : "");
  }
  function etapeLibelle(cle) {
    return (ref.etapesPipeline.filter(function (x) { return x.cle === cle; })[0] || { libelle: cle }).libelle;
  }

  // ---------- Vue Liste ----------
  function ligne(t, a) {
    var cons = P.conseiller(t.conseillerId);
    var v = T.vehiculeDe(t);
    return '<tr class="' + (a.blocages.length ? "is-bloquee" : "") + '">' +
      '<td data-label="Transaction"><a class="pr-nom" href="' + esc(T.urlDetail(t.id)) + '">' + esc(T.nomClient(t)) + "</a>" +
      '<span class="pr-sous d-block">' + esc(t.reference) + (t.brouillon ? ' · <span class="tx-brouillon-tag">Brouillon</span>' : "") + "</span>" +
      '<span class="pr-sous d-block">' + esc(cons.moi ? "Vous" : cons.nom + " (fictif)") + "</span></td>" +
      '<td data-label="Véhicule">' + esc(T.nomVehicule(t)) + (v ? '<span class="pr-sous d-block">N° ' + esc(v.numeroStock) + "</span>" : "") + UI.pastilleVehicule(T.statutVehicule(t.vehiculeId)) + "</td>" +
      '<td data-label="Montant et mode">' + montantTexte(t) + '<span class="pr-sous d-block">' + esc(ref.modesAchat[t.modeAchat]) + "</span></td>" +
      '<td data-label="Étape">' + UI.pastilleStatut(a.statut) + '<span class="pr-sous d-block">' + esc(etapeLibelle(a.etapePipeline)) + "</span>" + UI.miniAxes(a) + "</td>" +
      '<td data-label="Blocages">' + (a.blocages.length ? '<span class="tx-nb-blocages"><i class="bi bi-sign-stop-fill" aria-hidden="true"></i>' + a.blocages.length + "</span>" + UI.resumeBlocage(a) : '<span class="text-muted">Aucun</span>') + "</td>" +
      '<td data-label="Département attendu">' + departementsTexte(a) + "</td>" +
      '<td data-label="Prochaine action">' + prochaineTexte(a) + "</td>" +
      '<td data-label="Livraison">' + livraisonTexte(t, a) + "</td></tr>";
  }

  // ---------- Vue Pipeline ----------
  function carte(t, a) {
    return '<article class="vcard pr-carte tx-carte' + (a.blocages.length ? " is-bloquee" : "") + '" role="listitem">' +
      '<a class="pr-nom" href="' + esc(T.urlDetail(t.id)) + '">' + esc(T.nomClient(t)) + "</a>" +
      '<div class="vcard-meta">' + esc(t.reference) + (t.brouillon ? " · Brouillon" : "") + "</div>" +
      '<div class="pr-carte-ligne"><i class="bi bi-car-front"></i>' + esc(T.nomVehicule(t)) + "</div>" +
      '<div class="pr-carte-ligne"><i class="bi bi-cash"></i>' + montantTexte(t) + " · " + esc(ref.modesAchat[t.modeAchat]) + "</div>" +
      '<div class="tx-carte-axes">' + UI.pastilleStatut(a.statut) + UI.miniAxes(a) + "</div>" +
      (UI.resumeBlocage(a) ? '<div class="pr-carte-action">' + UI.resumeBlocage(a) + "</div>" : "") +
      "</article>";
  }

  function rendre() {
    compteurs();
    var liste = T.liste().map(function (t) { return { t: t, a: T.analyse(t) }; }).filter(function (x) { return correspond(x.t, x.a); });
    // Les dossiers bloqués et ceux qui attendent le conseiller d'abord ; les dossiers fermés en dernier.
    liste.sort(function (x, y) {
      var ox = estOuverte(x.a) ? 0 : 1, oy = estOuverte(y.a) ? 0 : 1;
      return ox - oy || y.a.blocages.length - x.a.blocages.length || (actionRequise(y.a) ? 1 : 0) - (actionRequise(x.a) ? 1 : 0) || new Date(y.t.dateCreation) - new Date(x.t.dateCreation);
    });
    corps.innerHTML = liste.map(function (x) { return ligne(x.t, x.a); }).join("");

    board.innerHTML = ref.etapesPipeline.map(function (e) {
      var cartes = liste.filter(function (x) { return x.a.etapePipeline === e.cle; });
      return '<section class="board-col pr-col tx-col tx-col-' + esc(e.cle) + '" role="listitem" aria-label="' + esc(e.libelle) + ", " + cartes.length + ' transaction(s)">' +
        '<header><span class="pr-col-titre">' + esc(e.libelle) + '</span><span class="count">' + cartes.length + "</span></header>" +
        '<div class="board-cards" role="list">' + (cartes.length ? cartes.map(function (x) { return carte(x.t, x.a); }).join("") : '<div class="pr-col-vide">Aucune transaction</div>') + "</div></section>";
    }).join("");

    var vide = !liste.length;
    document.getElementById("etat-vide").hidden = !vide;
    document.querySelector("[data-vide-texte]").textContent = filtresActifs() ? "Aucune transaction ne correspond à ces critères." : "Vous n'avez encore aucune transaction. Ouvrez-en une depuis une soumission acceptée ou une opportunité.";
    var pipeline = document.getElementById("vue-pipeline").checked;
    document.getElementById("vue-liste-contenu").hidden = pipeline || vide;
    document.getElementById("vue-pipeline-contenu").hidden = !pipeline || vide;
    document.getElementById("resultat").textContent = liste.length + " transaction" + (liste.length > 1 ? "s" : "");
    racine.querySelectorAll("[data-effacer-filtres]").forEach(function (b) { b.hidden = !filtresActifs(); });
  }

  Object.keys(f).forEach(function (k) {
    f[k].addEventListener(k === "recherche" ? "input" : "change", rendre);
  });
  document.querySelectorAll('input[name="vue"]').forEach(function (r) {
    r.addEventListener("change", function () {
      try { window.sessionStorage.setItem(CLE_VUE, r.value); } catch (e) {}
      rendre();
    });
  });
  racine.addEventListener("click", function (e) {
    if (!e.target.closest("[data-effacer-filtres]")) return;
    f.recherche.value = "";
    ["etape", "mode", "financement", "departement", "livraison"].forEach(function (k) { f[k].value = ""; });
    f.conseiller.value = P.moiId;
    f.bloquees.checked = f.action.checked = false;
    rendre();
  });
  try {
    if (window.sessionStorage.getItem(CLE_VUE) === "pipeline") document.getElementById("vue-pipeline").checked = true;
  } catch (e) {}

  T.abonner(rendre);
  rendre();
})();
