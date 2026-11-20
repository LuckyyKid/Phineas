// Outils du vendeur dans les autres modules : provenance et accès contextualisé à l'assistant dans les fiches
// (prospect, soumission, rendez-vous, transaction), et encart compact du tableau de bord. Rien n'est recalculé ici.
(function () {
  "use strict";

  var P = window.Prospects, OV = window.OutilsVendeur, PC = window.PerformancesCalcul;
  if (!P || !OV) return;
  var esc = P.esc, ref = OV.ref;

  function urlAssistant(mode, type, id) {
    return ref.urls.assistant + "?" + [mode ? "mode=" + encodeURIComponent(mode) : null, "contexte=" + encodeURIComponent(type), "id=" + encodeURIComponent(id)].filter(Boolean).join("&");
  }
  function bouton(url, libelle) {
    return '<a class="btn btn-sm btn-outline-primary" href="' + esc(url) + '"><i class="bi bi-stars me-1" aria-hidden="true"></i>' + esc(libelle) + "</a>";
  }
  function section(corps) {
    return '<section class="card mb-4 ov-lien" aria-label="Outils du vendeur"><div class="card-header sv-card-header"><span><i class="bi bi-stars me-2"></i>Assistant vendeur et provenance</span><span class="badge-soft">Simulation</span></div><div class="card-body">' + corps + "</div></section>";
  }

  function rendreProspect(b) {
    var c = P.contact(b.dataset.id);
    if (!c) return;
    var lignes = ["Source déclarée : " + (P.libelle("sources", c.source) || "Source inconnue") + (c.sourceDetail ? " — " + c.sourceDetail : ""), "Origine : " + ref.origines[OV.origine(c.id)]];
    P.opportunitesDe(c.id).forEach(function (o) {
      var pv = OV.provenance(o.id);
      if (pv) lignes.push(o.titre + " : " + pv.methode + (pv.lien ? " " + pv.lien : "") + (pv.campagne ? ", campagne « " + pv.campagne + " »" : "") + (pv.annonce ? ", annonce " + pv.annonce : ""));
    });
    var active = P.opportunitesDe(c.id).filter(P.estActive)[0];
    b.innerHTML = section('<ul class="ia-liste-simple mb-2">' + lignes.map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("") + "</ul>" +
      '<div class="d-flex flex-wrap gap-2">' + bouton(urlAssistant(null, "prospect", c.id), "Ouvrir l'assistant pour ce prospect") +
      (active ? bouton(urlAssistant("objection", "opportunite", active.id), "Préparer une objection") : "") + "</div>");
  }
  function rendreObjet(b, type) {
    var id = b.dataset.id;
    var l = {
      soumission: [[urlAssistant("scenario", "soumission", id), "Expliquer ce scénario d'achat"], [urlAssistant("objection", "soumission", id), "Préparer une objection"]],
      rendezvous: [[urlAssistant("preparation-rdv", "rendezvous", id), "Préparer ce rendez-vous"], [urlAssistant("vehicule", "rendezvous", id), "Comprendre le véhicule"]],
      transaction: [[urlAssistant("procedure", "transaction", id), "Procédures de la transaction"], [urlAssistant("relance", "transaction", id), "Préparer une communication"]],
    }[type];
    b.innerHTML = section('<p class="small text-muted">Réponses construites à partir de ce dossier seulement ; aucune IA n\'est connectée.</p><div class="d-flex flex-wrap gap-2">' + l.map(function (x) { return bouton(x[0], x[1]); }).join("") + "</div>");
  }
  // Tableau de bord : accès rapides, principales sources et trois indicateurs essentiels (calculs centralisés).
  function rendreTableau(b) {
    var html = '<div class="d-flex flex-wrap gap-2 mb-3">' +
      [[ref.urls.assistant, "bi-stars", "Assistant vendeur"], [ref.urls.annonces, "bi-megaphone", "Studio d'annonces"], [ref.urls.acquisition, "bi-diagram-3", "Acquisition"], [ref.urls.performances, "bi-graph-up", "Mes performances"]]
        .map(function (x) { return '<a class="btn btn-sm btn-outline-primary" href="' + esc(x[0]) + '"><i class="bi ' + x[1] + ' me-1" aria-hidden="true"></i>' + esc(x[2]) + "</a>"; }).join("") + "</div>";
    if (PC) {
      var s = OV.instantanePerformances(90);
      var a = PC.acquisition(s), p = PC.pipeline(s);
      var top = Object.keys(a.parSource).sort(function (x, y) { return a.parSource[y] - a.parSource[x]; }).slice(0, 3);
      function v(o, suf) { return o.statut === "observe" ? esc(o.valeur + (suf || "")) : "Non disponible"; }
      html += '<ul class="ov-tb-chiffres"><li><span>Opportunités actives</span><strong data-ov="actives">' + v(p.actives) + "</strong></li>" +
        '<li><span>Ventes conclues (90 j)</span><strong data-ov="gagnees">' + v(p.gagnees) + "</strong></li>" +
        '<li><span>Taux de réussite observé (90 j)</span><strong data-ov="reussite">' + v(p.tauxReussite, " %") + "</strong></li></ul>" +
        '<p class="small mb-0"><strong>Principales sources (90 j) :</strong> ' + (top.length ? top.map(function (k) { return esc((P.libelle("sources", k) || "Source inconnue") + " (" + a.parSource[k] + ")"); }).join(", ") : "aucune") +
        ' · <a href="' + esc(ref.urls.performances) + '">Analyses détaillées</a></p>';
    }
    b.querySelector("[data-ov-zone]").innerHTML = html;
  }

  function rendre() {
    document.querySelectorAll("[data-ov-lien]").forEach(function (b) {
      if (b.dataset.ovLien === "prospect") rendreProspect(b); else rendreObjet(b, b.dataset.ovLien);
    });
    var tb = document.getElementById("ov-outils");
    if (tb) rendreTableau(tb);
  }
  OV.abonner(rendre);
  P.abonner(rendre);
  rendre();
})();
