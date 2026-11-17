// Composants d'affichage des soumissions : statut, détail du prix, comparateur de scénarios, document client.
(function () {
  "use strict";

  var S = window.Soumissions, C = window.SoumissionsCalcul, P = window.Prospects;
  if (!S || !P) return;
  var esc = P.esc;
  var fmt = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function m(c) {
    return fmt.format(c / 100);
  }
  function taux(t) {
    return String(t).replace(".", ",") + " %";
  }
  var MENTION = "Simulation illustrative préparée avec des données de démonstration. Ce n'est ni une offre de crédit, ni une approbation de financement, ni un calcul fiscal validé.";

  function pastilleStatut(cle) {
    return '<span class="so-statut so-st-' + esc(cle) + '">' + esc(S.libelleStatut(cle)) + "</span>";
  }
  function pastilleVehicule(cle) {
    return '<span class="status-pill s-' + esc(cle) + '">' + esc(S.libelleStatutVehicule(cle)) + "</span>";
  }

  // ---------- Détail du prix (transparence : chaque catégorie est distincte) ----------
  function detailPrix(offre) {
    var r = C.calculer(offre, S.parametres);
    var pa = S.parametres;
    var lignes = [];
    function ligne(libelle, montant, classe, note) {
      lignes.push('<div class="so-ligne ' + (classe || "") + '"><span>' + libelle + (note ? '<small>' + note + "</small>" : "") + "</span><span>" + montant + "</span></div>");
    }
    function titre(t) {
      lignes.push('<div class="so-ligne-titre">' + esc(t) + "</div>");
    }

    titre("Prix du véhicule");
    ligne("Prix annoncé", m(r.prixAnnonce));
    if (r.remise) ligne("Remise" + (offre.motifRemise ? " · " + esc(offre.motifRemise) : ""), "− " + m(r.remise), "is-remise");
    titre("Options facultatives choisies");
    if (r.options.length) r.options.forEach(function (o) { ligne(esc(o.libelle), m(o.montant)); });
    else ligne('<span class="text-muted">Aucune</span>', "");
    ligne("Sous-total avant taxes", m(r.sousTotal), "is-sous-total");
    titre("Taxes");
    if (r.taxes === null) {
      ligne("TPS et TVQ", '<span class="so-a-confirmer">À confirmer</span>');
    } else {
      ligne("TPS estimée (" + taux(pa.tauxTps) + ")", m(r.tps));
      ligne("TVQ estimée (" + taux(pa.tauxTvq) + ")", m(r.tvq));
    }
    ligne("Droits gouvernementaux", '<span class="so-a-confirmer">À confirmer</span>');
    ligne(r.taxes === null ? "Total estimé avant taxes" : "Total estimé", m(r.totalEstime), "is-total");

    if (r.acompte || r.reprise) titre("Montants déjà versés et reprise");
    if (r.acompte) ligne("Acompte déjà versé", "− " + m(r.acompte), "is-remise");
    if (r.reprise) {
      ligne("Reprise : " + esc(r.reprise.vehicule || "véhicule à préciser"), "", "is-sous");
      ligne("Valeur estimée", r.reprise.valeur === null ? '<span class="so-a-confirmer">À confirmer</span>' : m(r.reprise.valeur), "is-retrait");
      ligne("Solde de prêt existant", r.reprise.solde === null ? '<span class="so-a-confirmer">À confirmer</span>' : "− " + m(r.reprise.solde), "is-retrait");
      ligne("Montant net de reprise", r.reprise.net === null ? '<span class="so-a-confirmer">À confirmer, non déduit</span>' : m(r.reprise.net), "is-retrait");
    }

    if (offre.modeAchat === "comptant") {
      titre("Achat comptant");
      ligne("Solde estimé à payer", m(r.comptant.solde), "is-total");
    } else {
      var f = r.financement;
      titre("Financement (simulation)");
      if (r.miseDeFonds) ligne("Mise de fonds", "− " + m(r.miseDeFonds), "is-remise");
      ligne("Montant à financer", f.montantFinance < 0 ? '<span class="so-erreur">Négatif : vérifiez la mise de fonds</span>' : m(f.montantFinance));
      ligne("Durée envisagée", esc(f.dureeMois + " mois"));
      ligne("Taux annuel hypothétique", f.taux === null ? '<span class="so-a-confirmer">À saisir</span>' : taux(f.taux));
      if (f.etat === "ok") {
        ligne("Versement mensuel estimé", m(f.versement), "is-total");
        ligne("Total des versements", m(f.totalVersements));
        ligne("Intérêts estimés", m(f.interets));
        ligne("Coût total estimé", m(f.coutTotal), "is-sous-total", "versements + mise de fonds + acompte + reprise nette");
      } else {
        ligne("Versement mensuel estimé", '<span class="so-a-confirmer">Calcul impossible : ' + (f.etat === "taux-manquant" ? "taux à saisir" : "montants à vérifier") + "</span>", "is-total");
      }
    }

    var hyp = [];
    if (offre.modeAchat === "financement") hyp.push("Versements mensuels égaux, taux fixe hypothétique saisi par le conseiller, arrondi au cent (le dernier versement absorberait l'écart).");
    if (r.taxes !== null) hyp.push("Taxes estimées sur le sous-total, sans règle particulière.");
    r.aConfirmer.forEach(function (x) { hyp.push(x); });
    return (
      '<div class="so-detail">' + lignes.join("") + "</div>" +
      '<div class="so-hypotheses"><strong><i class="bi bi-info-circle me-1"></i>Hypothèses et points à confirmer</strong><ul>' +
      hyp.map(function (h) { return "<li>" + esc(h) + "</li>"; }).join("") + "<li>" + esc(MENTION) + "</li></ul></div>"
    );
  }

  // ---------- Comparateur de scénarios ----------
  function comparateur(conteneur, reglages) {
    var offre = reglages.offre;
    var scenarios = JSON.parse(JSON.stringify(reglages.scenarios));
    var modifiable = reglages.modifiable;

    function rendre() {
      var resultats = scenarios.map(function (sc) { return C.calculer(C.scenario(offre, sc), S.parametres); });
      var couts = resultats.map(function (r, i) {
        // Comptant : le coût total est le total estimé (l'acompte et la reprise en sont des moyens de paiement).
        if (scenarios[i].modeAchat === "comptant") return r.totalEstime;
        return r.financement.etat === "ok" ? r.financement.coutTotal : null;
      });
      var valides = couts.filter(function (c) { return c !== null; });
      var min = valides.length > 1 ? Math.min.apply(null, valides) : null;

      function cellule(i, contenu) {
        return '<td class="' + (couts[i] !== null && couts[i] === min ? "is-min" : "") + '">' + contenu + "</td>";
      }
      function rangee(libelle, f) {
        return "<tr><th scope=\"row\">" + libelle + "</th>" + scenarios.map(function (sc, i) { return cellule(i, f(sc, resultats[i], i)); }).join("") + "</tr>";
      }
      function champ(i, nom, valeur, type, attrs, format) {
        if (!modifiable) return valeur === null || valeur === "" || valeur === undefined ? "—" : esc(format ? format(valeur) : String(valeur));
        return '<input class="form-control form-control-sm" data-sc="' + i + '" data-champ="' + nom + '" type="' + type + '" value="' + esc(valeur == null ? "" : valeur) + '" ' + (attrs || "") + " />";
      }
      var durees = S.parametres.durees;
      var html =
        '<div class="table-responsive"><table class="table so-comparateur mb-0"><thead><tr><th scope="col"><span class="visually-hidden">Élément</span></th>' +
        scenarios.map(function (sc, i) {
          return '<th scope="col">' + (modifiable
            ? '<input class="form-control form-control-sm fw-semibold" data-sc="' + i + '" data-champ="nom" value="' + esc(sc.nom) + '" aria-label="Nom du scénario" maxlength="40" />'
            : esc(sc.nom)) + (modifiable && scenarios.length > 1 ? '<button type="button" class="btn btn-sm btn-link text-danger p-0 mt-1" data-retirer="' + i + '">Retirer</button>' : "") + "</th>";
        }).join("") + "</tr></thead><tbody>" +
        rangee("Mode d'achat", function (sc, r, i) {
          if (!modifiable) return sc.modeAchat === "comptant" ? "Comptant" : "Financement";
          return '<select class="form-select form-select-sm" data-sc="' + i + '" data-champ="modeAchat"><option value="comptant"' + (sc.modeAchat === "comptant" ? " selected" : "") + '>Comptant</option><option value="financement"' + (sc.modeAchat === "financement" ? " selected" : "") + ">Financement</option></select>";
        }) +
        rangee("Reprise incluse", function (sc, r, i) {
          if (!offre.reprise) return '<span class="text-muted">Aucune reprise</span>';
          if (!modifiable) return sc.avecReprise ? "Oui" : "Non";
          return '<div class="form-check"><input class="form-check-input" type="checkbox" data-sc="' + i + '" data-champ="avecReprise" id="sc-rep-' + i + '"' + (sc.avecReprise ? " checked" : "") + ' /><label class="form-check-label" for="sc-rep-' + i + '">Oui</label></div>';
        }) +
        rangee("Total estimé", function (sc, r) { return m(r.totalEstime) + (r.taxes === null ? ' <small class="text-muted">avant taxes</small>' : ""); }) +
        rangee("Mise de fonds", function (sc, r, i) { return sc.modeAchat === "comptant" ? "—" : champ(i, "miseDeFonds", sc.miseDeFonds, "number", 'min="0" step="100" aria-label="Mise de fonds"', P.argent); }) +
        rangee("Durée", function (sc, r, i) {
          if (sc.modeAchat === "comptant") return "—";
          if (!modifiable) return sc.dureeMois + " mois";
          return '<select class="form-select form-select-sm" data-sc="' + i + '" data-champ="dureeMois" aria-label="Durée">' + durees.map(function (d) { return '<option value="' + d + '"' + (d === Number(sc.dureeMois) ? " selected" : "") + ">" + d + " mois</option>"; }).join("") + "</select>";
        }) +
        rangee("Taux hypothétique", function (sc, r, i) { return sc.modeAchat === "comptant" ? "—" : champ(i, "tauxAnnuel", sc.tauxAnnuel, "number", 'min="0" max="30" step="0.01" placeholder="À saisir" aria-label="Taux annuel hypothétique (%)"', S.tauxTexte); }) +
        rangee("Montant financé", function (sc, r) { return sc.modeAchat === "comptant" ? "—" : r.financement.montantFinance < 0 ? '<span class="so-erreur">Négatif</span>' : m(r.financement.montantFinance); }) +
        rangee("Paiement mensuel estimé", function (sc, r) {
          if (sc.modeAchat === "comptant") return "—";
          return r.financement.etat === "ok" ? m(r.financement.versement) : '<span class="so-a-confirmer">' + (r.financement.etat === "taux-manquant" ? "Taux à saisir" : "À vérifier") + "</span>";
        }) +
        rangee("Intérêts estimés", function (sc, r) { return sc.modeAchat === "comptant" ? m(0) : r.financement.etat === "ok" ? m(r.financement.interets) : "—"; }) +
        rangee("<strong>Coût total estimé</strong>", function (sc, r, i) {
          return couts[i] === null ? '<span class="so-a-confirmer">À confirmer</span>' : "<strong>" + m(couts[i]) + "</strong>" + (couts[i] === min ? '<span class="so-min">Coût total le plus bas</span>' : "");
        }) +
        "</tbody></table></div>";
      conteneur.innerHTML = html +
        (modifiable && scenarios.length < 4 ? '<button type="button" class="btn btn-sm btn-outline-primary mt-3" data-ajouter-scenario><i class="bi bi-plus-lg me-1"></i>Ajouter un scénario</button>' : "") +
        '<div class="so-hypotheses mt-3"><strong><i class="bi bi-info-circle me-1"></i>À lire avant de comparer</strong><ul>' +
        "<li>Le paiement mensuel le plus bas n'est pas forcément l'option la plus avantageuse : comparez surtout le coût total et la durée.</li>" +
        "<li>Coût total = versements + mise de fonds + acompte + reprise nette (comptant : total estimé).</li>" +
        "<li>Taux hypothétiques saisis par le conseiller. " + esc(MENTION) + "</li></ul></div>";
    }

    function surSaisie(e) {
      var t = e.target;
      if (t.dataset.sc === undefined) return;
      var sc = scenarios[Number(t.dataset.sc)];
      var c = t.dataset.champ;
      if (c === "avecReprise") sc[c] = t.checked;
      else if (c === "nom" || c === "modeAchat") sc[c] = t.value;
      else if (c === "tauxAnnuel") sc[c] = t.value === "" ? null : Number(t.value);
      else sc[c] = Number(t.value) || 0;
      if (e.type === "change") {
        rendre();
        if (reglages.surChangement) reglages.surChangement(scenarios);
      }
    }
    conteneur.addEventListener("change", surSaisie);
    conteneur.addEventListener("input", function (e) { if (e.target.type === "number" || e.target.dataset.champ === "nom") surSaisie(e); });
    conteneur.addEventListener("click", function (e) {
      if (e.target.closest("[data-ajouter-scenario]")) {
        var base = scenarios[scenarios.length - 1];
        scenarios.push({ nom: "Scénario " + (scenarios.length + 1), modeAchat: "financement", miseDeFonds: base.miseDeFonds || 0, dureeMois: base.dureeMois || 60, tauxAnnuel: base.tauxAnnuel, avecReprise: base.avecReprise });
      } else if (e.target.closest("[data-retirer]")) {
        scenarios.splice(Number(e.target.closest("[data-retirer]").dataset.retirer), 1);
      } else return;
      rendre();
      if (reglages.surChangement) reglages.surChangement(scenarios);
    });
    rendre();
    return { scenarios: function () { return scenarios; } };
  }

  // ---------- Document destiné au client ----------
  function documentClient(s, v) {
    var c = P.contact(s.prospectId);
    var o = P.opportunite(s.opportuniteId);
    var veh = v.vehicule;
    var off = v.offre;
    var r = C.calculer(off, S.parametres);
    var emise = ["Brouillon", "PreteAEnvoyer"].indexOf(v.statut) < 0;
    var finance = off.modeAchat === "financement";
    return (
      '<article class="so-document" aria-label="Aperçu de la proposition">' +
      '<div class="so-doc-filigrane">Démonstration · non contractuel</div>' +
      '<header class="so-doc-tete"><div><div class="so-doc-concession"><span class="brand-mark">P</span>' + esc(S.concession || "Concession") + "</div>" +
      '<div class="so-doc-titre">Proposition d\'achat</div></div>' +
      '<dl class="so-doc-ref"><div><dt>Référence</dt><dd>' + esc(s.reference) + " · v" + v.numero + "</dd></div>" +
      "<div><dt>Date</dt><dd>" + esc(P.dateCourte(v.date)) + "</dd></div>" +
      "<div><dt>Valide jusqu'au</dt><dd>" + esc(P.dateCourte(off.dateValidite)) + "</dd></div></dl></header>" +
      (emise ? "" : '<div class="so-doc-brouillon"><i class="bi bi-pencil-square me-1"></i>Version de travail (' + esc(S.libelleStatut(v.statut)) + ") : ce document n'a pas été émis.</div>") +
      '<section class="so-doc-parties"><div><h3>Préparée pour</h3><p><strong>' + esc(c ? c.prenom + " " + c.nom : "Client") + "</strong>" +
      (c && c.courriel ? "<br />" + esc(c.courriel) : "") + (c && c.telephone ? "<br />" + esc(c.telephone) : "") + "</p></div>" +
      "<div><h3>Votre conseiller</h3><p><strong>" + esc(v.auteur) + "</strong><br />" + esc(S.conseiller.courriel || "") + "<br />" + esc(S.concession || "") + "</p></div></section>" +
      '<section><h3>Véhicule proposé</h3><div class="so-doc-vehicule"><span class="so-photo"><i class="bi bi-car-front"></i></span><div><strong>' + esc(S.nomVehicule(veh)) + "</strong>" +
      "<div>" + esc([veh.neuf ? "Neuf" : veh.kilometrage.toLocaleString("fr-CA") + " km", veh.couleur, veh.carburant, veh.transmission].filter(Boolean).join(" · ")) + "</div>" +
      '<div class="text-muted">N° d\'inventaire ' + esc(veh.numeroStock) + "</div>" +
      (veh.caracteristiques && veh.caracteristiques.length ? "<div>" + esc(veh.caracteristiques.join(" · ")) + "</div>" : "") + "</div></div></section>" +
      "<section><h3>Détail du prix" + (finance ? " et simulation de financement" : "") + "</h3>" + detailPrix(off) + "</section>" +
      (o ? '<section><h3>Projet d\'achat</h3><p>' + esc(o.titre) + " · " + (finance ? "Financement envisagé" : "Achat comptant envisagé") + "</p></section>" : "") +
      (off.commentaires ? "<section><h3>Informations complémentaires</h3><p>" + esc(off.commentaires) + "</p></section>" : "") +
      '<footer class="so-doc-pied">Le prix annoncé inclut tous les frais du commerçant ; la TPS, la TVQ et les droits gouvernementaux s\'y ajoutent. ' +
      "Les produits facultatifs ne sont inclus que s'ils ont été choisis. Toute simulation de financement est conditionnelle à l'approbation d'un prêteur. " +
      "Document de démonstration généré par Phineas Sales OS.</footer>" +
      "</article>"
    );
  }

  window.SoumissionsUI = {
    pastilleStatut: pastilleStatut,
    pastilleVehicule: pastilleVehicule,
    detailPrix: detailPrix,
    comparateur: comparateur,
    documentClient: documentClient,
    montant: m,
  };
})();
