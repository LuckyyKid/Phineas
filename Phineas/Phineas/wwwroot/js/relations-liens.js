// Relations clients dans les autres modules : fiche prospect (motif de perte, récupération, recommandation, timeline
// relationnelle), fiche transaction (satisfaction et problèmes liés) et tableau de bord (compteurs du moteur partagé).
// Rien n'est recalculé ni copié ici : les données viennent des stores existants et du moteur de la phase 06.
(function () {
  "use strict";

  var RC = window.RelationsClients, P = window.Prospects, T = window.Transactions, I = window.Intelligence, RUI = window.RelationsUI;
  if (!RC || !P) return;
  var esc = P.esc, ref = RC.ref;

  function section(titre, icone, corps, lien) {
    return '<section class="card mb-4" aria-label="' + esc(titre) + '"><div class="card-header sv-card-header"><span><i class="bi ' + icone + ' me-2"></i>' + esc(titre) + "</span>" + (lien || "") +
      '</div><div class="card-body">' + corps + "</div></section>";
  }

  // ---------- Fiche prospect ----------
  function rendreProspect(bloc) {
    var id = bloc.dataset.id;
    var c = P.contact(id);
    if (!c) { bloc.innerHTML = ""; return; }
    var opps = P.opportunitesDe(id);
    var html = "";
    // Source de recommandation (attribution conservée dans le store des relations).
    var recos = opps.map(function (o) { return RC.recommandationDe(o.id); }).filter(Boolean);
    if (recos.length || c.source === "recommandation") {
      html += '<h3 class="ia-sous-titre">Source de recommandation</h3><ul class="ia-liste-simple">' + (recos.length ? recos.map(function (r) {
        var x = RC.recommandations().filter(function (y) { return y.recommandation.id === r.id; })[0];
        return "<li>" + esc(r.reference) + " — " + esc(ref.attributions[r.attribution]) + (x && x.parrain ? " ; recommandé par " + esc(x.parrain) : "") + "</li>";
      }).join("") : "<li>" + esc(c.sourceDetail || "Recommandation (détail non renseigné)") + "</li>") + "</ul>";
    }
    // Ventes perdues : motif, origine, récupération.
    var pertes = opps.map(function (o) { var cl = RC.clotureCourante(o.id); return cl ? { o: o, cl: cl, e: RC.etatRecuperation(cl) } : null; }).filter(Boolean);
    if (pertes.length) {
      html += '<h3 class="ia-sous-titre">Opportunités perdues et récupération</h3><ul class="ia-liste-simple">' + pertes.map(function (x) {
        return "<li><strong>" + esc(x.o.titre) + "</strong> — " + esc(ref.motifsPerte[x.cl.motif]) + " " + RUI.pastilleOrigine(x.cl.origine) + " " + RUI.pastilleRecuperation(x.e) +
          ' <a href="' + esc(RC.urlAnalyse(x.o.id)) + '">Analyse</a></li>';
      }).join("") + "</ul>";
    }
    // Après-vente : livraisons, satisfaction, problèmes.
    var livs = RC.livraisons().filter(function (l) { return l.transaction.prospectId === id; });
    if (livs.length) {
      html += '<h3 class="ia-sous-titre">Après-vente</h3><ul class="ia-liste-simple">' + livs.map(function (l) {
        var ouverts = l.problemes.filter(RC.regles.problemeOuvert).length;
        return "<li>" + esc(l.vehicule) + " livré le " + esc(P.dateCourte(l.confirmeeLe)) + " — " + (l.enquete ? "satisfaction globale : " + esc(ref.echelle[String(l.enquete.globale)].toLowerCase()) : "aucun retour de satisfaction") +
          (ouverts ? ' ; <span class="text-danger">' + ouverts + " problème(s) ouvert(s)</span>" : "") + ' <a href="' + esc(ref.urls.satisfaction + "?transaction=" + encodeURIComponent(l.transaction.id)) + '">Suivi</a></li>';
      }).join("") + "</ul>";
    }
    // Projets d'achat ultérieurs : opportunités créées après une vente gagnée ou une perte.
    var dates = opps.filter(function (o) { return o.etape === "Gagne" || o.etape === "Perdu"; }).map(function (o) { return new Date(o.derniereActivite); });
    var ulterieurs = dates.length ? opps.filter(function (o) { return P.estActive(o) && new Date(o.dateCreation) > new Date(Math.min.apply(null, dates)); }) : [];
    if (ulterieurs.length) html += '<h3 class="ia-sous-titre">Projets d\'achat ultérieurs</h3><ul class="ia-liste-simple">' + ulterieurs.map(function (o) { return "<li>" + esc(o.titre) + " — " + esc(P.libelleEtape(o.etape)) + "</li>"; }).join("") + "</ul>";
    // Timeline relationnelle : jalons lus dans l'historique existant (aucune copie des événements).
    var jalons = RC.timeline(id);
    html += '<h3 class="ia-sous-titre">Historique relationnel</h3>' + (jalons.length ? '<ol class="rc-timeline">' + jalons.slice().reverse().map(function (j) {
      var o = j.opportuniteId ? P.opportunite(j.opportuniteId) : null;
      return '<li><span class="rc-jalon">' + esc(j.jalon) + " · " + esc(P.dateCourte(j.date)) + (o ? " · " + esc(o.titre) : "") + "</span>" + esc(j.texte) + "</li>";
    }).join("") + "</ol>" : '<p class="text-muted small mb-0">Aucun jalon relationnel.</p>');
    bloc.innerHTML = section("Relation client", "bi-people", html, '<a class="btn btn-sm btn-link p-0" href="' + esc(ref.urls.pertes) + '">Relations clients</a>');
  }

  // ---------- Fiche transaction ----------
  function rendreTransaction(bloc) {
    var t = T && T.transaction(bloc.dataset.id);
    var l = t ? RC.livraisons().filter(function (x) { return x.transaction.id === t.id; })[0] : null;
    if (!l) {
      bloc.innerHTML = t && t.statut !== "Annulee" ? section("Après-vente", "bi-emoji-smile", '<p class="small text-muted mb-0">Le suivi de satisfaction démarre seulement lorsque la livraison est confirmée.</p>') : "";
      return;
    }
    var e = l.enquete;
    var html = "<p class=\"small\">Livré le " + esc(P.dateCourte(l.confirmeeLe)) + ". " + (e ? "Retour de satisfaction reçu le " + esc(P.dateCourte(e.recueLe)) + " : " + esc(ref.echelle[String(e.globale)].toLowerCase()) + "." : "Aucun retour de satisfaction enregistré.") + "</p>" +
      (e ? '<ul class="ia-liste-simple">' + l.dimensions.map(function (d) { return "<li>" + esc(d.libelle) + " : " + (d.moyenne == null ? "non évalué" : esc(String(d.moyenne).replace(".", ",")) + " / 5") + "</li>"; }).join("") + "</ul>" : "") +
      (l.problemes.length ? '<h3 class="ia-sous-titre">Problèmes après-vente</h3><ul class="ia-liste-simple">' + l.problemes.map(function (p) { return "<li>" + esc(p.nature) + " " + RUI.pastilleProbleme(p.statut) + "</li>"; }).join("") + "</ul>" : "");
    bloc.innerHTML = section("Satisfaction et après-vente", "bi-emoji-smile", html, '<a class="btn btn-sm btn-link p-0" href="' + esc(ref.urls.satisfaction + "?transaction=" + encodeURIComponent(t.id)) + '">Suivi après-vente</a>');
  }

  // ---------- Tableau de bord ----------
  var GROUPES = [
    { cle: "suivis", libelle: "Suivis après-vente à effectuer", icone: "bi-telephone-outbound", regles: ["satisfaction-a-planifier"], url: "satisfaction" },
    { cle: "recuperables", libelle: "Opportunités potentiellement récupérables", icone: "bi-arrow-counterclockwise", regles: ["perte-recuperable", "perte-achat-reporte", "perte-correspondance"], url: "pertes" },
    { cle: "problemes", libelle: "Problèmes clients nécessitant une action", icone: "bi-life-preserver", regles: ["client-insatisfait", "probleme-a-traiter", "probleme-resolu-verifier"], url: "satisfaction" },
    { cle: "recommandes", libelle: "Nouveaux prospects recommandés", icone: "bi-person-plus", regles: ["nouveau-prospect-recommande"], url: "reseau" },
  ];
  function rendreTableau(bloc) {
    var mes = I ? I.actives({ conseiller: P.moiId }) : [];
    bloc.querySelector("[data-rc-zone]").innerHTML = '<ul class="rc-tb">' + GROUPES.map(function (g) {
      var n = mes.filter(function (a) { return g.regles.indexOf(a.regle) >= 0; }).length;
      return '<li data-rc-groupe="' + g.cle + '"><a href="' + esc(ref.urls[g.url]) + '"><i class="bi ' + g.icone + '" aria-hidden="true"></i><span>' + esc(g.libelle) + "</span><strong>" + n + "</strong></a></li>";
    }).join("") + '</ul><p class="small text-muted mb-0 mt-2">Compteurs des actions du Centre d\'actions (catégorie « Relations clients »).</p>';
  }

  function rendre() {
    document.querySelectorAll("[data-rc-lien]").forEach(function (b) {
      if (b.dataset.rcLien === "prospect") rendreProspect(b);
      else if (b.dataset.rcLien === "transaction") rendreTransaction(b);
    });
    var tb = document.getElementById("rc-relations");
    if (tb) rendreTableau(tb);
  }
  RC.abonner(rendre);
  P.abonner(rendre);
  if (T) T.abonner(rendre);
  if (I) I.abonner(rendre);
  rendre();
  // Clôture demandée depuis la liste des prospects : ?cloturer=<opportunité>.
  var demande = new URLSearchParams(window.location.search).get("cloturer");
  if (demande && RUI && P.opportunite(demande)) setTimeout(function () { RUI.ouvrirCloture(demande); }, 0);
})();
