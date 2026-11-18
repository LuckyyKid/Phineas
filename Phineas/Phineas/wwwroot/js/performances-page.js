// Page « Mes performances commerciales » : affichage des calculs de performances-calcul.js (instantané des stores)
// et des statistiques relationnelles de la phase 07. Chaque mesure indique sa définition, la période et son statut.
(function () {
  "use strict";

  var P = window.Prospects, R = window.RendezVous, OV = window.OutilsVendeur, PC = window.PerformancesCalcul, RC = window.RelationsClients, I = window.Intelligence;
  var racine = document.getElementById("performances");
  if (!P || !OV || !PC || !racine) return;
  var esc = P.esc;
  var periode = document.getElementById("f-periode");
  var SOURCE = "Source : vos dossiers dans Sales OS (données de démonstration).";

  function zone(n) { return racine.querySelector('[data-zone="' + n + '"]'); }
  function libPeriode() { return periode.value ? periode.value + " derniers jours" : "depuis le début"; }
  function valeur(o, suffixe) {
    if (!o || o.statut !== "observe") return '<span class="rc-tag rc-tag-manquant" title="' + esc(o && o.note || "") + '">Non disponible</span>';
    return esc(String(o.valeur).replace(".", ",") + (suffixe || ""));
  }
  // Tuile : valeur, définition de la mesure et note (nombre d'observations, raison d'indisponibilité).
  function chiffre(libelle, o, definition, suffixe) {
    return '<div class="rc-chiffre" data-mesure="' + esc(libelle) + '"><span class="rc-chiffre-libelle">' + esc(libelle) + '</span><strong class="rc-chiffre-valeur">' + valeur(o, suffixe) + "</strong>" +
      (definition ? '<span class="pr-sous">' + esc(definition) + "</span>" : "") + (o && o.note ? '<span class="pr-sous ov-note">' + esc(o.note) + "</span>" : "") + "</div>";
  }
  // Graphique en barres horizontales : légende de période, source, définition et limites.
  function graphique(titre, lignes, definition, limites) {
    var max = lignes.reduce(function (m, l) { return Math.max(m, l.n); }, 0);
    return '<figure class="ov-graphique"><figcaption><strong>' + esc(titre) + "</strong> — " + esc(libPeriode()) + "</figcaption>" +
      (lignes.length ? '<ul class="rc-barres">' + lignes.map(function (l) {
        return '<li class="rc-ligne-barre"><span class="rc-lb-libelle">' + esc(l.libelle) + '</span><span class="rc-lb-piste" aria-hidden="true"><span style="width:' + (max ? Math.round(l.n / max * 100) : 0) + '%"></span></span><strong>' + l.n + "</strong>" +
          (l.detail ? '<span class="pr-sous">' + esc(l.detail) + "</span>" : "") + "</li>";
      }).join("") + "</ul>" : '<p class="text-muted small mb-0">Aucune observation sur la période.</p>') +
      '<p class="ov-legende-graphique">' + esc(definition) + " " + esc(SOURCE) + (limites ? " Limites : " + esc(limites) : "") + "</p></figure>";
  }
  function dict(o, lib) {
    return Object.keys(o).map(function (k) { return { libelle: lib(k), n: o[k] }; }).sort(function (a, b) { return b.n - a.n; });
  }

  function rendre() {
    var per = periode.value ? Number(periode.value) : null;
    var s = OV.instantanePerformances(per);
    racine.querySelectorAll("[data-periode]").forEach(function (x) { x.innerHTML = '<span class="rc-tag rc-tag-demo">Démonstration</span> ' + esc(libPeriode()); });

    var a = PC.acquisition(s);
    zone("acquisition").innerHTML = '<div class="rc-chiffres">' +
      chiffre("Nouveaux prospects", a.nouveaux, "Contacts créés pendant la période.") +
      chiffre("Opportunités créées", a.opportunitesCreees, "Opportunités ouvertes pendant la période.") +
      chiffre("Issus des recommandations", a.recommandations, "Recommandations attribuées (Referral Loop), sans doublon.") +
      chiffre("Issus des annonces", a.annonces, "Provenance établie par un lien ou un formulaire d'annonce.") +
      chiffre("Sources inconnues", a.sourcesInconnues, "Source non notée : jamais devinée.") +
      chiffre("Délai de première réponse", a.delaiPremiereReponse, "Médiane, en heures, entre la création et le premier échange.", " h") + "</div>" +
      (a.sansReponse ? '<p class="small text-muted">' + a.sansReponse + " opportunité(s) sans premier échange : exclue(s) du délai (ce n'est pas un zéro).</p>" : "") +
      (a.datesManquantes ? '<p class="small text-muted">' + a.datesManquantes + " contact(s) sans date de création : exclu(s).</p>" : "") +
      graphique("Répartition des sources", dict(a.parSource, function (k) { return P.libelle("sources", k) || (k === "inconnue" ? "Source inconnue" : k); }),
        "Nouveaux prospects de la période selon la source déclarée.", "une source déclarée n'est pas une attribution vérifiée.");

    var p = PC.pipeline(s), ent = PC.entonnoir(s);
    zone("pipeline").innerHTML = '<div class="rc-chiffres">' +
      chiffre("Opportunités actives", p.actives, "Toutes périodes, non gagnées ni perdues.") +
      chiffre("Gagnées", p.gagnees, "Vente livrée ou opportunité marquée gagnée pendant la période.") +
      chiffre("Perdues", p.perdues, "Clôturées comme perdues pendant la période.") +
      chiffre("Taux de réussite observé", p.tauxReussite, "Gagnées ÷ (gagnées + perdues) parmi les opportunités closes pendant la période.", " %") +
      chiffre("Durée commerciale observée", p.dureeCommerciale, "Moyenne en jours, de la création à la vente, pour les ventes de la période.", " j") + "</div>" +
      graphique("Opportunités par étape", P.etapes.filter(function (e) { return p.parEtape[e.cle]; }).map(function (e) { return { libelle: e.libelle, n: p.parEtape[e.cle] }; }),
        "État actuel de toutes vos opportunités (instantané, toutes périodes).", null) +
      graphique("Entonnoir commercial (cohorte)", ent.map(function (e) { return { libelle: e.libelle, n: e.nombre, detail: e.taux ? (e.taux.statut === "observe" ? e.taux.valeur + " % de la cohorte" : "Non disponible") : "cohorte de départ" }; }),
        "Opportunités CRÉÉES pendant la période ; chaque étape compte celles qui l'ont atteinte (une vente par opportunité, même avec plusieurs soumissions).", "une cohorte récente n'a pas eu le temps d'atteindre la vente.") +
      graphique("Évolution des résultats (8 dernières semaines)", PC.evolution(s, 8).map(function (w) { return { libelle: "Semaine du " + P.dateCourte(w.debut), n: w.gagnees + w.perdues, detail: w.gagnees + " gagnée(s), " + w.perdues + " perdue(s)" }; }),
        "Opportunités closes par semaine, gagnées et perdues.", "peu d'observations par semaine.");

    var so = PC.soumissions(s);
    zone("soumissions").innerHTML = '<div class="rc-chiffres">' +
      chiffre("Créées", so.creees, "Soumissions créées pendant la période.") + chiffre("Envoyées", so.envoyees, "Au moins une version transmise au client.") +
      chiffre("Acceptées", so.acceptees, "Au moins une version acceptée.") + chiffre("Refusées", so.refusees, "Refusées sans version acceptée.") +
      chiffre("Taux d'acceptation", so.tauxAcceptation, "Acceptées ÷ soumissions ayant reçu une réponse (acceptée, refusée, expirée).", " %") +
      chiffre("Délai de réponse", so.delaiReponse, "Moyenne en jours entre l'envoi et la réponse du client.", " j") +
      chiffre("Opportunités avec plusieurs soumissions", so.opportunitesAvecPlusieurs, "Une vente reste comptée une seule fois par opportunité.") + "</div>";

    var rv = PC.rendezVous(s);
    zone("rendezvous").innerHTML = '<div class="rc-chiffres">' +
      chiffre("Planifiés", rv.planifies, "Rendez-vous de la période et à venir.") + chiffre("Confirmés", rv.confirmes, "Statut « confirmé ».") +
      chiffre("Réalisés", rv.realises, "Rendez-vous terminés.") + chiffre("Absences", rv.absences, "Client absent.") +
      chiffre("Taux de présence", rv.tauxPresence, "Réalisés ÷ (réalisés + absences).", " %") + chiffre("Essais routiers", rv.essais, "Rendez-vous de type essai.") +
      chiffre("Prospects distincts", rv.prospectsDistincts, "Plusieurs rendez-vous pour un même prospect comptent une fois.") + "</div>" +
      graphique("Résultats des essais", dict(rv.resultatsEssais, function (k) { return R ? R.libelle("resultats", k) || k : k; }), "Résultat enregistré après chaque essai.", "un essai sans résultat enregistré n'apparaît pas.");

    var tr = PC.transactions(s);
    zone("transactions").innerHTML = '<div class="rc-chiffres">' +
      chiffre("Ouvertes", tr.ouvertes, "Transactions actives ou en attente.") + chiffre("Bloquées", tr.bloquees, "Au moins un blocage dans le Deal Control Tower.") +
      chiffre("Finalisées", tr.finalisees, "Livrées ou clôturées.") + chiffre("Annulées", tr.annulees, "Conservées dans l'historique, jamais comptées comme ventes.") +
      chiffre("Livraisons réalisées", tr.livraisons, "Livraisons confirmées pendant la période.") +
      chiffre("Durée ouverture → livraison", tr.dureeOuvertureLivraison, "Moyenne en jours pour les livraisons de la période.", " j") + "</div>" +
      graphique("Causes des blocages en cours", dict(tr.typesBlocage, function (k) { return k; }), "Blocages actuels des transactions ouvertes, par responsable (analyse du Deal Control Tower).", "instantané, pas un historique.");

    if (RC) {
      var st = RC.statistiques(per), res = RC.indicateursReseau();
      zone("relation").innerHTML = '<div class="rc-chiffres">' +
        chiffre("Opportunités perdues", PC.obs(st.pertes.total), "Clôtures de la période (phase 07).") + chiffre("Réactivées", PC.obs(st.pertes.reactivees), "Réactivées par le conseiller.") +
        chiffre("Retours de satisfaction", PC.obs(st.satisfaction.reponses), "Réceptions simulées.") + chiffre("Problèmes ouverts", PC.obs(st.satisfaction.problemesOuverts), "Après-vente.") +
        chiffre("Prospects recommandés", PC.obs(st.reseau.prospects), "Sans doublon.") + chiffre("Ventes livrées issues du réseau", PC.obs(st.reseau.livrees), "Recommandations attribuées.") + "</div>" +
        graphique("Motifs de perte", st.pertes.parMotif.map(function (m) { return { libelle: RC.ref.motifsPerte[m.motif], n: m.total, detail: m.confirmes + " confirmé(s), " + m.hypotheses + " hypothèse(s), " + m.inconnus + " inconnu(s)" }; }),
          "Clôtures de la période, avec l'origine des motifs.", "échantillon réduit.") +
        graphique("Résultats des recommandations", res.entonnoir.map(function (e) { return { libelle: e.libelle, n: e.nombre, detail: e.denominateur == null ? "" : e.taux == null ? "Non disponible" : e.taux + " % de l'étape précédente" }; }),
          "Prospects recommandés → rendez-vous → transactions (statistiques de la phase 07, toutes périodes).", null);
    } else zone("relation").innerHTML = '<p class="text-muted small mb-0">Statistiques relationnelles non chargées.</p>';

    // Axes d'amélioration : constats tirés des données, sans cause supposée ni notation.
    var mes = I ? I.actives({ conseiller: P.moiId }) : [];
    var ax = PC.axes(s, {
      rdvSansResultat: mes.filter(function (x) { return x.regle === "rdv-sans-resultat"; }).length,
      qualifieesSansVehicule: mes.filter(function (x) { return x.regle === "qualifiee-sans-vehicule" || (x.constats || []).some(function (c) { return c.regle === "qualifiee-sans-vehicule"; }); }).length,
      motifsFrequents: RC ? RC.statistiques(per).pertes.parMotif.filter(function (m) { return m.total >= 2; }).map(function (m) { return { motif: m.motif, total: m.total, libelle: RC.ref.motifsPerte[m.motif] }; }) : [],
      cibleHeures: OV.ref.config.delaiPremiereReponseCibleHeures,
    });
    var liens = { actions: I && I.ref.urlActions, prospects: P.urlListe, pertes: RC && RC.ref.urls.pertes };
    zone("axes").innerHTML = (ax.length ? '<ul class="ov-axes">' + ax.map(function (c) {
      return '<li data-axe="' + esc(c.cle) + '"><span>' + esc(c.texte) + "</span>" + (liens[c.lien] ? ' <a href="' + esc(liens[c.lien]) + '">Voir</a>' : "") + "</li>";
    }).join("") + "</ul>" : '<p class="mb-0">Aucun constat particulier sur la période.</p>') +
      '<p class="small text-muted mb-0 mt-2">Constats observés dans vos dossiers ; une corrélation n\'est pas une explication.</p>';
  }
  periode.addEventListener("change", rendre);
  OV.abonner(rendre);
  if (RC) RC.abonner(rendre);
  if (I) I.abonner(rendre);
  rendre();
})();
