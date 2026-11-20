// Statistiques relationnelles : uniquement des observations calculées à partir des données locales, avec la période
// et le nombre d'observations. Faits, hypothèses, données manquantes et démonstration sont distingués visuellement.
(function () {
  "use strict";

  var RC = window.RelationsClients, P = window.Prospects;
  var racine = document.getElementById("statistiques");
  if (!RC || !P || !racine) return;
  var esc = P.esc, ref = RC.ref, Regles = RC.regles;
  var periode = document.getElementById("f-periode");

  function badge(n) {
    var e = Regles.echantillon(n, ref);
    return '<span class="rc-tag rc-tag-demo">Démonstration</span> <span class="rc-tag ' + (e.suffisant ? "rc-tag-observe" : "rc-tag-manquant") + '">' + esc(e.texte) + "</span>";
  }
  function chiffre(libelle, valeur, detail, tag) {
    return '<div class="rc-chiffre"><span class="rc-chiffre-libelle">' + esc(libelle) + '</span><strong class="rc-chiffre-valeur">' + esc(valeur == null ? "Non disponible" : String(valeur)) + "</strong>" +
      (detail ? '<span class="pr-sous">' + esc(detail) + "</span>" : "") + (tag ? " " + tag : "") + "</div>";
  }
  function barre(libelle, n, max, extra) {
    return '<li class="rc-ligne-barre"><span class="rc-lb-libelle">' + esc(libelle) + '</span><span class="rc-lb-piste" aria-hidden="true"><span style="width:' + (max ? Math.round(n / max * 100) : 0) + '%"></span></span><strong>' + n + "</strong>" + (extra || "") + "</li>";
  }
  function pourcent(n, d) {
    var t = Regles.taux(n, d);
    return t == null ? "Non disponible" : t + " %";
  }

  function rendrePertes(s) {
    var p = s.pertes;
    var max = p.parMotif.reduce(function (m, x) { return Math.max(m, x.total); }, 0);
    var etapes = Object.keys(p.parEtape);
    var maxE = etapes.reduce(function (m, k) { return Math.max(m, p.parEtape[k]); }, 0);
    return '<div class="rc-chiffres">' + chiffre("Opportunités perdues", p.total) + chiffre("Motifs confirmés", p.confirmes, null, '<span class="rc-tag rc-tag-observe">Observé</span>') +
      chiffre("Hypothèses", p.hypotheses, null, '<span class="rc-tag rc-tag-hypothese">Hypothèse</span>') + chiffre("Motifs inconnus", p.inconnus + s.sansCloture, null, '<span class="rc-tag rc-tag-manquant">Manquant</span>') +
      chiffre("Réactivées", p.reactivees) + chiffre("Récupérées avec vente livrée", p.recuperees, p.reactivees ? pourcent(p.recuperees, p.reactivees) + " des réactivées" : null) + "</div>" +
      (p.total ? '<div class="rc-grille"><div><h3 class="ia-sous-titre">Répartition par motif</h3><ul class="rc-barres rc-barres-empilees">' + p.parMotif.map(function (m) {
        return '<li class="rc-ligne-barre"><span class="rc-lb-libelle">' + esc(ref.motifsPerte[m.motif]) + '</span><span class="rc-lb-piste rc-lb-pile" aria-hidden="true">' +
          (m.confirmes ? '<span class="rc-seg-confirme" style="width:' + Math.round(m.confirmes / max * 100) + '%"></span>' : "") +
          (m.hypotheses ? '<span class="rc-seg-hypothese" style="width:' + Math.round(m.hypotheses / max * 100) + '%"></span>' : "") +
          (m.inconnus ? '<span class="rc-seg-inconnu" style="width:' + Math.round(m.inconnus / max * 100) + '%"></span>' : "") + "</span><strong>" + m.total + '</strong><span class="pr-sous">' +
          esc([m.confirmes ? m.confirmes + " confirmé(s)" : null, m.hypotheses ? m.hypotheses + " hypothèse(s)" : null, m.inconnus ? m.inconnus + " inconnu(s)" : null].filter(Boolean).join(", ")) + "</span></li>";
      }).join("") + '</ul><p class="rc-legende small"><span><span class="rc-pastille rc-seg-confirme"></span>Confirmé</span><span><span class="rc-pastille rc-seg-hypothese"></span>Hypothèse</span><span><span class="rc-pastille rc-seg-inconnu"></span>Inconnu</span></p></div>' +
        '<div><h3 class="ia-sous-titre">Étape commerciale atteinte</h3><ul class="rc-barres">' + P.etapes.filter(function (e) { return p.parEtape[e.cle]; }).map(function (e) { return barre(e.libelle, p.parEtape[e.cle], maxE); }).join("") + "</ul></div></div>"
        : '<p class="text-muted small mb-0">Aucune vente perdue sur la période.</p>');
  }
  function rendreSatisfaction(s) {
    var x = s.satisfaction;
    var maxR = Object.keys(x.repartition).reduce(function (m, k) { return Math.max(m, x.repartition[k]); }, 0);
    return '<div class="rc-chiffres">' + chiffre("Livraisons confirmées", x.livraisons) + chiffre("Retours reçus", x.reponses, "réception simulée") +
      chiffre("Taux de réponse", x.tauxReponse == null ? null : x.tauxReponse + " %", x.livraisons ? x.reponses + " sur " + x.livraisons + " livraison(s)" : "aucune livraison : non calculable") +
      chiffre("Problèmes ouverts", x.problemesOuverts) + chiffre("Problèmes résolus", x.problemesResolus) +
      chiffre("Délai de résolution observé", x.delaiMoyenResolutionJours == null ? null : String(x.delaiMoyenResolutionJours).replace(".", ",") + " j", x.observationsDelai + " observation(s)") + "</div>" +
      (x.reponses ? '<div class="rc-grille"><div><h3 class="ia-sous-titre">Satisfaction globale déclarée</h3><ul class="rc-barres">' + Object.keys(x.repartition).reverse().map(function (k) { return barre(ref.echelle[k], x.repartition[k], maxR); }).join("") + "</ul></div>" +
        '<div><h3 class="ia-sous-titre">Satisfaction par dimension</h3><ul class="rc-barres">' + x.parDimension.map(function (d) {
          return '<li class="rc-ligne-barre"><span class="rc-lb-libelle">' + esc(d.libelle) + '</span><span class="rc-lb-piste" aria-hidden="true"><span style="width:' + (d.moyenne == null ? 0 : Math.round(d.moyenne / 5 * 100)) + '%"></span></span><strong>' +
            esc(d.moyenne == null ? "—" : String(d.moyenne).replace(".", ",") + " / 5") + '</strong><span class="pr-sous">' + d.observations + " obs.</span></li>";
        }).join("") + '</ul><p class="small text-muted mb-0">Moyennes des éléments évalués ; chaque dimension relève d\'un département différent.</p></div></div>'
        : '<p class="text-muted small mb-0">Aucun retour de satisfaction sur la période.</p>');
  }
  function rendreReseau(s) {
    var r = s.reseau;
    return '<div class="rc-chiffres">' + chiffre("Prospects issus du réseau", r.prospects, r.doublons ? r.doublons + " doublon(s) rattaché(s), non comptés" : null) + chiffre("Transactions conclues", r.transactions) + chiffre("Ventes livrées", r.livrees) +
      chiffre("Revenus des ventes recommandées", null, "non calculés : aucune donnée autorisée de revenu dans ce prototype", '<span class="rc-tag rc-tag-manquant">Manquant</span>') + "</div>" +
      '<h3 class="ia-sous-titre">Progression commerciale</h3><ol class="rc-entonnoir">' + r.entonnoir.map(function (e) {
        var max = r.entonnoir[0].nombre || 1;
        return '<li class="rc-etape"><span class="rc-etape-libelle">' + esc(e.libelle) + '</span><span class="rc-etape-barre" aria-hidden="true"><span style="width:' + Math.round(e.nombre / max * 100) + '%"></span></span><strong class="rc-etape-nombre">' + e.nombre +
          '</strong><span class="rc-etape-taux">' + esc(e.denominateur == null ? "" : e.taux == null ? "Non disponible" : e.taux + " % de l'étape précédente") + "</span></li>";
      }).join("") + "</ol>";
  }

  function rendre() {
    var s = RC.statistiques(periode.value ? Number(periode.value) : null);
    racine.querySelector('[data-zone="pertes"]').innerHTML = rendrePertes(s);
    racine.querySelector('[data-zone="satisfaction"]').innerHTML = rendreSatisfaction(s);
    racine.querySelector('[data-zone="reseau"]').innerHTML = rendreReseau(s);
    racine.querySelector('[data-echantillon="pertes"]').innerHTML = badge(s.pertes.total);
    racine.querySelector('[data-echantillon="satisfaction"]').innerHTML = badge(s.satisfaction.reponses);
    racine.querySelector('[data-echantillon="reseau"]').innerHTML = badge(s.reseau.prospects);
  }
  periode.addEventListener("change", rendre);
  RC.abonner(rendre);
  rendre();
})();
