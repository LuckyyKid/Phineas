// Page « Transactions » (Views/Transactions/Index.cshtml) : chiffres, vue Liste et vue Pipeline, recherche et filtres
// sur les données locales (window.Transactions). Rien n'est recalculé ici : l'analyse de chaque dossier vient de T.analyse.
// Styles : transactions-liste-verre.css (préfixe txv-).
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

  // Icône de chaque état d'un axe : l'état se lit à la couleur ET à l'icône (jamais à la couleur seule).
  var ICONES_AXE = {
    Terminee: "bi-check-lg",
    EnCours: "bi-arrow-repeat",
    Bloquee: "bi-slash-circle",
    EnAttente: "bi-hourglass-split",
    NonCommencee: "bi-circle",
    NonApplicable: "bi-dash",
  };
  // Statuts qui apportent une information de plus que l'étape et les pastilles : affichés sous l'étape.
  var STATUTS_A_PRECISER = ["EnAttente", "LivraisonPlanifiee", "Cloturee", "Annulee"];

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

  // ---------- Chiffres (mes transactions) ----------
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

  // ---------- Morceaux communs à la liste et au pipeline ----------

  // Quatre ronds de 20 px, un par axe (validation commerciale, financement, véhicule, livraison).
  // L'infobulle donne l'axe et son état, ex. « Financement : bloqué ».
  function pastillesAxes(a) {
    var resume = a.axes.map(function (x) { return x.libelle + " : " + etatAxe(x); }).join(" ; ");
    var ronds = a.axes.map(function (x) {
      return '<span class="txv-axe txv-axe-' + esc(x.etat) + '" title="' + esc(x.libelle + " : " + etatAxe(x)) + '">' +
        '<i class="bi ' + (ICONES_AXE[x.etat] || "bi-circle") + '" aria-hidden="true"></i></span>';
    }).join("");
    return '<span class="txv-axes" role="img" aria-label="' + esc(resume) + '">' + ronds + "</span>";
  }
  function etatAxe(x) {
    return (ref.etatsEtape[x.etat] || x.etat).toLowerCase();
  }

  // « Financement complet » ; « Achat comptant, prix non figé » tant qu'aucune proposition n'est retenue.
  function modeTexte(t) {
    var texte = ref.modesAchat[t.modeAchat] || "";
    var m = T.montants(t);
    if (m && !m.figee) texte += ", prix non figé";
    return texte;
  }
  function montantTexte(t) {
    var m = T.montants(t);
    if (!m) return "À déterminer";
    return UI.montant(m.totalEstime);
  }

  // « N° DEMO-1058 · Reçu » : numéro d'inventaire et état du véhicule, en texte gris (pas de pastille colorée).
  function vehiculeDetail(t) {
    var v = T.vehiculeDe(t);
    var morceaux = [];
    if (v) morceaux.push("N° " + v.numeroStock);
    var statut = T.statutVehicule(t.vehiculeId);
    if (statut) morceaux.push(ref.statutsVehicule[statut] || statut);
    return morceaux.join(" · ");
  }

  // Blocage en rouge précédé d'un point ; sinon ce qui est en attente (ambre) ; sinon « Aucun blocage ».
  function blocageTexte(a) {
    if (a.blocages.length) {
      var autres = a.blocages.length > 1 ? " (+" + (a.blocages.length - 1) + ")" : "";
      return '<span class="txv-blocage"><span class="txv-point txv-point-rouge" aria-hidden="true"></span>' + esc(a.blocages[0].nature + autres) + "</span>";
    }
    var attente = a.elements.filter(function (e) { return e.niveau === "attente"; })[0];
    if (attente) return '<span class="txv-attente"><span class="txv-point txv-point-ambre" aria-hidden="true"></span>' + esc(attente.nature) + "</span>";
    return '<span class="txv-gris">Aucun blocage</span>';
  }
  function attenduTexte(a) {
    if (!a.departementsAttendus.length) return "";
    var noms = a.departementsAttendus.map(function (d) { return d.libelle; }).join(", ");
    return '<span class="txv-sous">Attendu de : ' + esc(noms) + "</span>";
  }
  function prochaineTexte(a) {
    var p = a.prochaineAction;
    return esc(p.texte) + (p.responsable ? '<span class="txv-sous">' + esc(p.responsable.libelle) + "</span>" : "");
  }
  function livraisonTexte(t, a) {
    var d = t.livraison && t.livraison.datePrevue;
    if (a.statut === "Livree" || a.statut === "Cloturee") return "Livrée le " + esc(P.dateCourte(t.livraison.confirmeeLe || d));
    if (a.statut === "Annulee") return '<span class="txv-gris">Annulée</span>';
    if (!d) return '<span class="txv-gris">À déterminer</span>';
    var precision = P.echeance(d);
    if (a.statut === "LivraisonPlanifiee") precision += " · rendez-vous planifié";
    return esc(P.dateCourte(d)) + '<span class="txv-sous">' + esc(precision) + "</span>";
  }
  function etapeLibelle(cle) {
    return (ref.etapesPipeline.filter(function (x) { return x.cle === cle; })[0] || { libelle: cle }).libelle;
  }
  function statutPrecision(a) {
    if (STATUTS_A_PRECISER.indexOf(a.statut) < 0) return "";
    return '<span class="txv-sous">' + esc(T.statutAffiche(a.statut).libelle) + "</span>";
  }
  // Référence en mono, avec « Brouillon » et le conseiller quand ce n'est pas vous (dossiers fictifs de collègues).
  function referenceTexte(t) {
    var texte = t.reference;
    if (t.brouillon) texte += " · Brouillon";
    var conseiller = P.conseiller(t.conseillerId);
    var html = '<span class="txv-ref">' + esc(texte) + "</span>";
    if (!conseiller.moi) html += '<span class="txv-sous">' + esc(conseiller.nom) + " (fictif)</span>";
    return html;
  }

  // ---------- Vue Liste ----------
  function ligne(t, a) {
    return "<tr>" +
      '<td><a class="txv-nom" href="' + esc(T.urlDetail(t.id)) + '">' + esc(T.nomClient(t)) + "</a>" + referenceTexte(t) + "</td>" +
      "<td>" + esc(T.nomVehicule(t)) + '<span class="txv-sous">' + esc(vehiculeDetail(t)) + "</span></td>" +
      '<td><span class="txv-montant">' + esc(montantTexte(t)) + '</span><span class="txv-sous">' + esc(modeTexte(t)) + "</span></td>" +
      "<td>" + esc(etapeLibelle(a.etapePipeline)) + statutPrecision(a) + pastillesAxes(a) + "</td>" +
      "<td>" + blocageTexte(a) + attenduTexte(a) + "</td>" +
      "<td>" + prochaineTexte(a) + "</td>" +
      "<td>" + livraisonTexte(t, a) + "</td></tr>";
  }

  // ---------- Vue Pipeline ----------
  // Une seule ligne sous le filet : le blocage (rouge), sinon ce qui est en attente, sinon la prochaine action.
  function ligneBasDeCarte(a) {
    if (a.blocages.length || a.elements.some(function (e) { return e.niveau === "attente"; })) return blocageTexte(a);
    return '<span class="txv-gris">' + esc(a.prochaineAction.texte) + "</span>";
  }
  function carte(t, a) {
    var montant = montantTexte(t) + " · " + modeTexte(t);
    return '<article class="txv-carte" role="listitem">' +
      '<a class="txv-nom" href="' + esc(T.urlDetail(t.id)) + '">' + esc(T.nomClient(t)) + "</a>" + referenceTexte(t) +
      '<p class="txv-carte-vehicule">' + esc(T.nomVehicule(t)) + '<span class="txv-sous">' + esc(montant) + "</span></p>" +
      pastillesAxes(a) +
      '<div class="txv-carte-bas">' + ligneBasDeCarte(a) + "</div>" +
      "</article>";
  }
  function colonne(etape, dossiers) {
    var contenu = '<p class="txv-colonne-vide">Aucune transaction</p>';
    if (dossiers.length) contenu = dossiers.map(function (x) { return carte(x.t, x.a); }).join("");
    return '<section class="txv-colonne" role="listitem" aria-label="' + esc(etape.libelle) + ", " + dossiers.length + ' transaction(s)">' +
      '<header class="txv-colonne-tete"><span>' + esc(etape.libelle) + '</span><span class="txv-compte">' + dossiers.length + "</span></header>" +
      '<div class="txv-cartes" role="list">' + contenu + "</div></section>";
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
      var dossiers = liste.filter(function (x) { return x.a.etapePipeline === e.cle; });
      return colonne(e, dossiers);
    }).join("");

    var vide = !liste.length;
    document.getElementById("etat-vide").hidden = !vide;
    var texteVide = "Vous n'avez encore aucune transaction. Ouvrez-en une depuis une soumission acceptée ou une opportunité.";
    if (filtresActifs()) texteVide = "Aucune transaction ne correspond.";
    document.querySelector("[data-vide-texte]").textContent = texteVide;
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
