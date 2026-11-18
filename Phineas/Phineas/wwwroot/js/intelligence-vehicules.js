// Recommandations véhicules (Vehicle Matching Engine) : véhicules pour un prospect, prospects pour un véhicule,
// demandes de recherche non satisfaites et arrivées de véhicules simulées. Le calcul vient du store et du module
// de matching ; cette page ne fait qu'afficher et déclencher des actions locales.
(function () {
  "use strict";

  var I = window.Intelligence, P = window.Prospects, S = window.Soumissions, R = window.RendezVous, UI = window.IntelligenceUI;
  var racine = document.getElementById("matching");
  if (!I || !P || !S || !UI || !racine) return;
  var esc = P.esc;
  var GROUPES = [["budget", "Budget"], ["categorie", "Catégorie"], ["caracteristiques", "Caractéristiques"], ["places", "Nombre de places"], ["etat", "Neuf ou occasion"], ["marque", "Marque"]];

  function zone(n) {
    return racine.querySelector('[data-zone="' + n + '"]');
  }
  function oppsActives() {
    return P.toutesOpportunites().filter(function (o) { return ["Gagne", "Perdu"].indexOf(o.etape) < 0; }).sort(function (a, b) {
      var ca = P.contact(a.prospectId), cb = P.contact(b.prospectId);
      return (ca.nom + ca.prenom).localeCompare(cb.nom + cb.prenom, "fr-CA");
    });
  }
  function libelleOpp(o) {
    var c = P.contact(o.prospectId);
    return c.prenom + " " + c.nom + " — " + o.titre;
  }
  function pastilleStatut(v) {
    var st = I.statutVehicule(v.id);
    return '<span class="status-pill s-' + esc(st) + '">' + esc(S.libelleStatutVehicule(st)) + "</span>";
  }

  // ---------- Mode 1 ----------
  var selOpp = document.getElementById("m-opportunite");
  selOpp.innerHTML = oppsActives().map(function (o) { return '<option value="' + esc(o.id) + '">' + esc(libelleOpp(o)) + "</option>"; }).join("");
  if (racine.dataset.opportunite && P.opportunite(racine.dataset.opportunite)) selOpp.value = racine.dataset.opportunite;

  function rendreCriteres() {
    var o = P.opportunite(selOpp.value);
    var q = (o && o.qualification) || {};
    var indisp = I.indispensables(o.id);
    var budget = q.budgetTotal != null ? P.argent(q.budgetTotal) : q.budgetMensuel != null ? P.argent(q.budgetMensuel) + " / mois (comparaison impossible)" : null;
    var valeurs = {
      budget: budget, categorie: P.libelle("categories", q.categorie), caracteristiques: (q.caracteristiques || []).map(function (k) { return P.libelle("caracteristiques", k); }).join(", ") || null,
      places: q.places ? q.places + " places" : null, etat: P.libelle("etats", q.etat), marque: (q.marques || []).concat(q.modeles || []).join(", ") || null,
    };
    zone("criteres").innerHTML = '<ul class="ia-criteres-client">' + GROUPES.map(function (g) {
      var connu = !!valeurs[g[0]];
      return "<li><span><strong>" + esc(g[1]) + "</strong>" + '<span class="d-block small">' + (connu ? esc(valeurs[g[0]]) : '<span class="rv-a-verifier">Non renseigné</span>') + "</span></span>" +
        '<div class="form-check form-switch"><input class="form-check-input" type="checkbox" role="switch" id="ind-' + g[0] + '" data-indispensable="' + g[0] + '"' + (indisp.indexOf(g[0]) >= 0 ? " checked" : "") + (connu ? "" : " disabled") + ' />' +
        '<label class="form-check-label small" for="ind-' + g[0] + '">Indispensable</label></div></li>';
    }).join("") + "</ul>" +
      '<p class="small mb-0"><a href="' + esc(P.urlFiche(o.prospectId) + "#qualification") + '">Compléter la qualification</a> pour améliorer la couverture.</p>';
  }
  function rendreVehicules() {
    var o = P.opportunite(selOpp.value);
    var l = I.vehiculesPour(o.id, { inclureIndisponibles: document.getElementById("m-indisponibles").checked });
    var compatibles = l.filter(function (r) { return r.niveau === "compatible"; }).length;
    document.getElementById("m-resultat").textContent = l.length + " véhicule(s) évalué(s) · " + compatibles + " compatible(s)";
    var tousInsuffisants = l.length && l.every(function (r) { return r.niveau === "a-verifier" && r.score == null; });
    document.getElementById("m-vehicules").innerHTML = (tousInsuffisants ? '<div class="alert alert-warning small"><i class="bi bi-exclamation-triangle me-1"></i>Informations insuffisantes : trop peu de critères sont connus pour calculer une compatibilité fiable. Les véhicules sont listés « à vérifier ».</div>' : "") +
      (l.length ? l.map(function (r) {
        var v = S.vehicule(r.vehiculeId);
        var nom = S.nomVehicule(v);
        var dejaEnvisage = (o.vehiculesEnvisages || []).indexOf(nom) >= 0;
        return '<article class="ia-vehicule ia-niveau-' + esc(r.niveau) + '" data-vehicule-id="' + esc(v.id) + '">' +
          '<header><span class="so-photo"><i class="bi bi-car-front"></i><small>Photo non disponible</small></span><div><h3>' + esc(nom) + "</h3>" +
          '<span class="pr-sous">' + esc(P.argent(v.prixDemande)) + " · " + esc(v.neuf ? "Neuf" : v.kilometrage.toLocaleString("fr-CA") + " km") + " · N° " + esc(v.numeroStock) + "</span>" +
          '<div class="d-flex flex-wrap gap-2 mt-1">' + UI.pastilleCompatibilite(r) + pastilleStatut(v) + "</div>" +
          (r.ecarts.length ? '<p class="ia-ecart small mb-0 mt-1"><i class="bi bi-x-circle me-1" aria-hidden="true"></i>Écart : ' + esc(r.ecarts.map(function (i) { return i.libelle + " (" + i.detail.replace(/\.$/, "") + ")"; }).join(" · ")) + "</p>" : "") +
          (r.disponibilite.cle !== "disponible" ? '<p class="small mb-0 mt-1"><i class="bi bi-exclamation-triangle me-1"></i>' + esc(r.disponibilite.texte) + "</p>" : "") + "</div></header>" +
          '<details' + (r.niveau === "incompatible" ? " open" : "") + '><summary>Critères : ' + r.satisfaits.length + " satisfait(s), " + r.ecarts.length + " écart(s), " + r.inconnus.length + " à vérifier</summary>" + UI.criteres(r) + "</details>" +
          '<footer class="ia-carte-actions">' +
          '<button type="button" class="btn btn-sm btn-outline-primary" data-voir="' + esc(v.id) + '">Consulter le véhicule</button>' +
          '<button type="button" class="btn btn-sm btn-outline-primary" data-envisager="' + esc(v.id) + '"' + (dejaEnvisage ? " disabled" : "") + ">" + (dejaEnvisage ? "Déjà envisagé" : "Ajouter aux options envisagées") + "</button>" +
          (r.disponibilite.cle !== "indisponible" ? '<a class="btn btn-sm btn-outline-primary" href="' + esc(S.urlNouvelle(o.id) + "&vehicule=" + encodeURIComponent(v.id)) + '">Créer une soumission</a>' +
            (R ? '<a class="btn btn-sm btn-outline-primary" href="' + esc(R.urlNouveau({ opportunite: o.id, type: "EssaiRoutier", vehicule: v.id })) + '">Planifier un essai</a>' : "") : "") +
          '<button type="button" class="btn btn-sm btn-ghost" data-noter="' + esc(v.id) + '">Enregistrer une note</button>' +
          "</footer></article>";
      }).join("") : '<div class="pr-etat-vide"><i class="bi bi-car-front"></i><strong>Aucun véhicule compatible</strong><span>Aucun véhicule disponible de l\'inventaire ne peut être évalué pour ce client. Vous pouvez enregistrer une demande de recherche.</span></div>');
  }

  // ---------- Mode 2 ----------
  var selVeh = document.getElementById("v-vehicule");
  function remplirVehicules() {
    var actuel = selVeh.value;
    selVeh.innerHTML = S.inventaire().filter(function (v) { return ["Vendu", "Livre"].indexOf(I.statutVehicule(v.id)) < 0; }).map(function (v) {
      return '<option value="' + esc(v.id) + '">' + esc(S.nomVehicule(v) + " · " + P.argent(v.prixDemande) + " · " + S.libelleStatutVehicule(I.statutVehicule(v.id))) + "</option>";
    }).join("");
    if (actuel && S.vehicule(actuel)) selVeh.value = actuel;
    else if (racine.dataset.vehicule && S.vehicule(racine.dataset.vehicule)) selVeh.value = racine.dataset.vehicule;
  }
  function rendreProspects() {
    var v = S.vehicule(selVeh.value);
    if (!v) return;
    zone("fiche-vehicule").innerHTML = '<p class="mb-0"><strong>' + esc(S.nomVehicule(v)) + "</strong> · " + esc(P.argent(v.prixDemande)) + " · " + esc(v.carrosserie || "") + " · " + esc(v.carburant || "") + " · " + pastilleStatut(v) + "</p>";
    var l = I.prospectsPour(v.id).filter(function (r) { return r.niveau !== "incompatible" && (r.score == null || r.score >= 50); });
    document.getElementById("v-prospects").innerHTML = l.map(function (r) {
      var o = r.opportunite, c = r.contact, q = o.qualification || {};
      var dernier = P.derniereInteraction(c.id);
      return "<tr>" +
        '<td data-label="Prospect"><a class="pr-nom" href="' + esc(P.urlFiche(c.id)) + '">' + esc(c.prenom + " " + c.nom) + '</a><span class="pr-sous d-block">' + esc(o.titre) + "</span></td>" +
        '<td data-label="Besoin et budget">' + esc(P.resumeVehicule(o) || P.libelle("categories", q.categorie) || "À préciser") + '<span class="pr-sous d-block">' + esc(P.resumeBudget(q) || "Budget inconnu") + "</span></td>" +
        '<td data-label="Compatibilité">' + UI.pastilleCompatibilite(r) + '<span class="pr-sous d-block">Couverture ' + r.couverture + " %</span></td>" +
        '<td data-label="Horizon et dernier contact">' + esc(P.libelle("horizons", q.horizon) || "Horizon inconnu") + '<span class="pr-sous d-block">' + esc(dernier ? P.relatif(dernier.date) : "—") + "</span></td>" +
        '<td data-label="Conseiller et suivi">' + esc(P.conseiller(c.conseillerId).nom) + (r.suspension ? '<span class="ia-avertissement d-block">' + esc(r.suspension) + "</span>" : '<span class="pr-sous d-block">Contact possible</span>') + "</td>" +
        '<td data-label="Actions" class="ia-cellule-actions"><a class="btn btn-sm btn-outline-primary" href="' + esc(P.urlFiche(c.id)) + '">Consulter</a>' +
        '<button type="button" class="btn btn-sm btn-outline-primary" data-presenter="' + esc(o.id) + '"' + (r.suspension ? " disabled" : "") + ">Préparer une présentation</button>" +
        '<button type="button" class="btn btn-sm btn-ghost" data-suivi-opp="' + esc(o.id) + '">Ajouter un suivi</button></td></tr>';
    }).join("");
    document.getElementById("v-vide").hidden = l.length > 0;
  }

  // ---------- Demandes et arrivées ----------
  var selDemOpp = document.getElementById("d-opportunite");
  selDemOpp.innerHTML = '<option value="">Choisir…</option>' + oppsActives().map(function (o) { return '<option value="' + esc(o.id) + '">' + esc(libelleOpp(o)) + "</option>"; }).join("");
  function libelleCritere(cle) {
    var g = GROUPES.filter(function (x) { return x[0] === cle; })[0];
    return g ? g[1] : P.libelle("caracteristiques", cle) || cle;
  }
  function resumeDemande(dm) {
    var morceaux = [P.libelle("categories", dm.categorie), dm.budgetMax ? "≤ " + P.argent(dm.budgetMax) : null,
      (dm.caracteristiques || []).map(function (k) { return P.libelle("caracteristiques", k); }).join(", ") || null,
      dm.anneeMin ? "année ≥ " + dm.anneeMin : null, dm.kilometrageMax ? "≤ " + dm.kilometrageMax.toLocaleString("fr-CA") + " km" : null].filter(Boolean);
    return morceaux.join(" · ") || "Critères à préciser";
  }
  function rendreDemandes() {
    var corr = I.actives().filter(function (a) { return a.regle === "nouvelle-correspondance"; });
    var l = I.demandes();
    racine.querySelector('[data-champ="nb-demandes"]').textContent = String(l.filter(function (d) { return d.statut === "Active" || d.statut === "CorrespondanceTrouvee"; }).length);
    zone("demandes").innerHTML = l.length ? '<ul class="ia-demandes">' + l.map(function (dm) {
      var o = P.opportunite(dm.opportuniteId), c = o ? P.contact(o.prospectId) : null;
      var trouvees = corr.filter(function (a) { return a.objet.id === dm.id; });
      return '<li data-demande="' + esc(dm.id) + '"><div><strong>' + esc(c ? c.prenom + " " + c.nom : "?") + "</strong> — " + esc(o ? o.titre : "") +
        '<span class="d-block small">' + esc(resumeDemande(dm)) + "</span>" +
        ((dm.indispensables || []).length ? '<span class="pr-sous d-block">Indispensable : ' + esc(dm.indispensables.map(libelleCritere).join(", ")) + "</span>" : "") +
        (dm.alternatives ? '<span class="pr-sous d-block">Alternatives acceptables : ' + esc(dm.alternatives) + "</span>" : "") +
        '<span class="pr-sous d-block">Conseiller : ' + esc(P.conseiller(dm.conseillerId).nom) + " · horizon : " + esc(P.libelle("horizons", dm.horizon) || "inconnu") + "</span>" +
        (trouvees.length ? '<span class="ia-trouve d-block"><i class="bi bi-stars me-1"></i>' + trouvees.length + " correspondance(s) : " + esc(trouvees.map(function (a) { return a.vehicule; }).join(", ")) + ' — <a href="' + esc(I.ref.conseillerNom ? "#" : "#") + '" data-voir-action="' + esc(trouvees[0].id) + '">voir dans le Centre d\'actions</a></span>' : "") +
        "</div>" +
        '<label class="visually-hidden" for="st-' + esc(dm.id) + '">État de la demande</label><select class="form-select form-select-sm pr-select-compact" id="st-' + esc(dm.id) + '" data-statut-demande="' + esc(dm.id) + '">' +
        Object.keys(I.ref.statutsDemande).map(function (k) { return '<option value="' + esc(k) + '"' + (dm.statut === k ? " selected" : "") + ">" + esc(I.ref.statutsDemande[k]) + "</option>"; }).join("") + "</select></li>";
    }).join("") + "</ul>" : '<div class="sv-empty"><span>Aucune demande enregistrée.</span></div>';
    zone("arrivees").innerHTML = I.vehiculesSimules().map(function (x) {
      return '<div class="ia-arrivee"><div><strong>' + esc(S.nomVehicule(x.vehicule)) + "</strong>" + '<span class="pr-sous d-block">' + esc(P.argent(x.vehicule.prixDemande)) + " · " + esc(x.vehicule.carrosserie) + " · " + esc(x.vehicule.carburant) + " · " + esc(x.vehicule.kilometrage.toLocaleString("fr-CA")) + " km</span>" +
        '<span class="pr-sous d-block">' + esc(x.evenement) + "</span></div>" +
        (x.arrive ? '<span class="badge-soft"><i class="bi bi-check2 me-1"></i>Arrivé dans l\'inventaire de l\'onglet</span>' : '<button type="button" class="btn btn-sm btn-outline-secondary" data-arrivee="' + esc(x.vehicule.id) + '">Simuler l\'arrivée</button>') + "</div>";
    }).join("") + '<div data-zone="arrivee-resultat" aria-live="polite"></div>';
  }

  function rendre() {
    if (!P.opportunite(selOpp.value)) selOpp.selectedIndex = 0;
    rendreCriteres();
    rendreVehicules();
    remplirVehicules();
    rendreProspects();
    rendreDemandes();
  }

  // ---------- Événements ----------
  selOpp.addEventListener("change", rendre);
  document.getElementById("m-indisponibles").addEventListener("change", rendreVehicules);
  selVeh.addEventListener("change", rendreProspects);
  racine.addEventListener("change", function (e) {
    var ind = e.target.closest("[data-indispensable]");
    if (ind) I.basculerIndispensable(selOpp.value, ind.dataset.indispensable);
    var st = e.target.closest("[data-statut-demande]");
    if (st) {
      var ann = I.changerStatutDemande(st.dataset.statutDemande, st.value);
      P.notifier(ann ? "Demande : " + I.ref.statutsDemande[st.value].toLowerCase() + "." : "Changement impossible.", ann || undefined);
    }
  });
  racine.addEventListener("click", function (e) {
    var b = e.target.closest("button, a[data-voir-action]");
    if (!b || b.disabled) return;
    var o = P.opportunite(selOpp.value);
    if (b.dataset.voir) {
      var v = S.vehicule(b.dataset.voir);
      UI.fenetre(S.nomVehicule(v), '<dl class="pr-liste-def pr-liste-def-compacte">' +
        [["N° d'inventaire", v.numeroStock], ["Prix demandé", P.argent(v.prixDemande)], ["Kilométrage", v.neuf ? "Neuf" : v.kilometrage.toLocaleString("fr-CA") + " km"], ["Carrosserie", v.carrosserie], ["Motorisation", v.carburant],
          ["Transmission", v.transmission], ["Couleur", v.couleur], ["Emplacement", v.emplacement || "Non renseigné"], ["Caractéristiques", (v.caracteristiques || []).join(", ") || "Non renseignées"], ["Statut", S.libelleStatutVehicule(I.statutVehicule(v.id))]]
          .map(function (x) { return "<div><dt>" + esc(x[0]) + "</dt><dd>" + esc(x[1] || "—") + "</dd></div>"; }).join("") + "</dl>" +
        '<p class="pr-note mb-0">Fiche issue de l\'inventaire partagé de démonstration. Aucune caractéristique n\'est déduite : ce qui n\'est pas listé reste à vérifier.</p>');
    } else if (b.dataset.envisager) {
      var ok = P.ajouterVehiculeEnvisage(o.id, S.nomVehicule(S.vehicule(b.dataset.envisager)));
      P.notifier(ok ? "Véhicule ajouté aux options envisagées de l'opportunité." : "Déjà envisagé.");
    } else if (b.dataset.noter) {
      var r = I.comparer(o.id, b.dataset.noter);
      P.ajouterNote(o.prospectId, { type: "note", opportuniteId: o.id, resume: "Véhicule repéré : " + S.nomVehicule(S.vehicule(b.dataset.noter)) + " (" + UI.niveauxCompatibilite[r.niveau].toLowerCase() + (r.score != null ? ", " + r.score + " %" : "") + ", couverture " + r.couverture + " %)." });
      P.notifier("Note enregistrée dans l'historique du prospect.");
    } else if (b.dataset.presenter) {
      var op = P.opportunite(b.dataset.presenter), c = P.contact(op.prospectId), ve = S.vehicule(selVeh.value);
      var rc = I.comparer(op.id, ve.id);
      UI.fenetre("Présentation personnalisée — " + c.prenom + " " + c.nom,
        '<p class="small">Points retenus à partir des critères connus (aucune caractéristique inventée) :</p><ul class="small">' + rc.satisfaits.map(function (i) { return "<li>" + esc(i.detail) + "</li>"; }).join("") + "</ul>" +
        (rc.inconnus.length ? '<p class="small rv-a-verifier">À vérifier avant d\'en parler : ' + esc(rc.inconnus.map(function (i) { return i.libelle; }).join(", ")) + ".</p>" : "") +
        '<label class="form-label" for="ia-presentation">Brouillon (modifiable)</label><textarea class="form-control" id="ia-presentation" rows="7">' +
        esc("Bonjour " + c.prenom + ",\n\nJe pense à vous en voyant le " + S.nomVehicule(ve) + " (" + P.argent(ve.prixDemande) + ") disponible chez nous. " +
          (rc.satisfaits.length ? "Il correspond à plusieurs de vos critères : " + rc.satisfaits.map(function (i) { return i.libelle.toLowerCase(); }).join(", ") + ". " : "") +
          "Souhaitez-vous que je vous en dise plus ?\n\n" + I.ref.conseillerNom) + "</textarea>" +
        '<p class="pr-note mt-2 mb-0">Rien n\'est envoyé : copiez le texte et transmettez-le vous-même.</p>');
    } else if (b.dataset.suiviOpp) {
      var ve2 = S.vehicule(selVeh.value), d1 = new Date(); d1.setDate(d1.getDate() + 1);
      P.planifierSuivi(b.dataset.suiviOpp, "Présenter le " + S.nomVehicule(ve2), d1);
      P.notifier("Suivi ajouté à l'opportunité (demain).");
    } else if (b.dataset.arrivee) {
      var nouvelles = I.simulerArrivee(b.dataset.arrivee);
      zone("arrivee-resultat").innerHTML = '<p class="small mt-2 mb-0"><i class="bi bi-cone-striped me-1"></i>Simulation : ' + (nouvelles && nouvelles.length
        ? nouvelles.length + " nouvelle(s) recommandation(s) : " + esc(nouvelles.map(function (a) { return a.client + " (" + a.vehicule + ")"; }).join(", ")) + "."
        : "aucune demande active ne correspond à ce véhicule (les demandes en pause ou clôturées ne sont pas réactivées).") + "</p>";
    } else if (b.dataset.voirAction) {
      e.preventDefault();
      UI.fenetre("Recommandation", UI.carte(I.action(b.dataset.voirAction)));
    }
  });
  document.getElementById("form-demande").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target;
    f.elements.opportunite.classList.toggle("is-invalid", !f.elements.opportunite.value);
    if (!f.elements.opportunite.value) return;
    var indisp = Array.prototype.filter.call(f.querySelectorAll('[name="indispensable"]'), function (x) { return x.checked; }).map(function (x) { return x.value; });
    var dm = I.creerDemande({ opportuniteId: f.elements.opportunite.value, categorie: f.elements.categorie.value, budgetMax: f.elements.budget.value, anneeMin: f.elements.annee.value,
      kilometrageMax: f.elements.km.value, indispensables: indisp });
    P.notifier(dm ? "Demande de recherche enregistrée." : "Création impossible.");
    if (dm) f.reset();
  });

  I.abonner(rendre);
  rendre();
  if (racine.dataset.vehicule && S.vehicule(racine.dataset.vehicule) && window.bootstrap) bootstrap.Tab.getOrCreateInstance(document.getElementById("onglet-vehicule")).show();
})();
