// Parcours « Nouvelle soumission » : 1. client et opportunité, 2. véhicule, 3. offre.
(function () {
  "use strict";

  var S = window.Soumissions, P = window.Prospects, UI = window.SoumissionsUI;
  var racine = document.getElementById("parcours");
  if (!S || !P || !UI || !racine) return;
  var esc = P.esc;

  var etat = { etape: 1, prospectId: null, oppId: null, vehiculeId: null, etapeMax: 1 };
  var editeur = window.EditeurOffre(document.getElementById("form-offre"), { surChangement: majDetail });
  var editeurPour = null; // « opportunité|véhicule » pour lesquels l'offre a été préremplie

  function zone(nom) {
    return racine.querySelector('[data-zone="' + nom + '"]');
  }
  function normaliser(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  // ---------- Étape 1 : client et opportunité ----------
  var rechercheClient = document.getElementById("n-recherche-client");

  function rendreClients() {
    var q = normaliser(rechercheClient.value.trim());
    var contacts = P.contacts().filter(function (c) {
      return !q || normaliser(c.prenom + " " + c.nom + " " + (c.courriel || "")).indexOf(q) >= 0;
    }).sort(function (a, b) {
      var actA = P.opportunitesDe(a.id).some(P.estActive) ? 0 : 1, actB = P.opportunitesDe(b.id).some(P.estActive) ? 0 : 1;
      return actA - actB || (a.nom + a.prenom).localeCompare(b.nom + b.prenom, "fr-CA");
    });
    zone("clients").innerHTML = contacts.length ? contacts.map(function (c) {
      var actives = P.opportunitesDe(c.id).filter(P.estActive).length;
      var choisi = c.id === etat.prospectId;
      return '<button type="button" role="radio" aria-checked="' + choisi + '" class="so-choix' + (choisi ? " is-active" : "") + '" data-prospect="' + esc(c.id) + '">' +
        '<span class="avatar">' + esc(P.initiales(c)) + "</span><span><strong>" + esc(c.prenom + " " + c.nom) + "</strong>" +
        '<span class="pr-sous d-block">' + (actives ? actives + " opportunité" + (actives > 1 ? "s" : "") + " active" + (actives > 1 ? "s" : "") : "Aucune opportunité active") + "</span></span></button>";
    }).join("") : '<div class="sv-empty"><span>Aucun prospect trouvé.</span></div>';
  }

  function rendreOpportunites() {
    var z = zone("opportunites");
    if (!etat.prospectId) return;
    var opps = P.opportunitesDe(etat.prospectId);
    if (!opps.length) {
      z.innerHTML = '<p class="text-muted mb-0">Ce prospect n\'a aucune opportunité. Créez-en une depuis sa fiche.</p>';
      return;
    }
    z.innerHTML = '<div class="so-opps" role="radiogroup" aria-label="Opportunité">' + opps.map(function (o) {
      var active = P.estActive(o);
      var choisie = o.id === etat.oppId;
      var nb = S.parOpportunite(o.id).length;
      return '<button type="button" role="radio" aria-checked="' + choisie + '" class="so-choix' + (choisie ? " is-active" : "") + '" data-opp="' + esc(o.id) + '"' + (active ? "" : ' disabled aria-disabled="true"') + ">" +
        "<span><strong>" + esc(o.titre) + '</strong> <span class="status-pill sv-et-' + esc(o.etape) + '">' + esc(P.libelleEtape(o.etape)) + "</span>" +
        '<span class="pr-sous d-block">' + esc(P.resumeVehicule(o) || "Véhicule à préciser") + (nb ? " · " + nb + " soumission" + (nb > 1 ? "s" : "") + " existante" + (nb > 1 ? "s" : "") : "") +
        (active ? "" : " · opportunité clôturée") + "</span></span></button>";
    }).join("") + "</div>";
  }

  function rendreBesoins() {
    var z = zone("besoins");
    var o = etat.oppId && P.opportunite(etat.oppId);
    z.hidden = !o;
    if (!o) return;
    var q = o.qualification || {};
    var c = P.contact(o.prospectId);
    var cons = P.conseiller(c.conseillerId);
    function ligne(t, v) {
      return "<div><dt>" + esc(t) + "</dt><dd>" + (v ? esc(v) : '<span class="text-muted">À préciser</span>') + "</dd></div>";
    }
    var criteres = (q.elementsDecision || []).map(function (k) { return P.libelle("elementsDecision", k); })
      .concat((q.caracteristiques || []).map(function (k) { return P.libelle("caracteristiques", k); })).filter(Boolean);
    z.innerHTML = '<div class="card-header sv-card-header"><span><i class="bi bi-clipboard-data me-2"></i>Besoins connus</span><span class="pr-sous">Repris de la qualification</span></div>' +
      '<dl class="pr-liste-def so-besoins">' +
      ligne("Véhicule recherché", P.resumeVehicule(o)) +
      ligne("Budget indicatif", P.resumeBudget(q)) +
      ligne("Mode d'achat envisagé", P.libelle("modesAchat", q.modeAchat)) +
      ligne("Mise de fonds envisagée", q.miseDeFonds != null ? P.argent(q.miseDeFonds) : null) +
      ligne("Reprise", q.reprise ? P.libelle("reprises", q.reprise) + (q.repriseDetail ? " : " + q.repriseDetail : "") : null) +
      ligne("Horizon d'achat", P.libelle("horizons", q.horizon)) +
      ligne("Critères prioritaires", criteres.join(" · ")) +
      ligne("Conseiller responsable", cons.nom + (cons.moi ? " (moi)" : cons.fictif ? " (fictif)" : "")) +
      "</dl>";
  }

  // ---------- Étape 2 : véhicule ----------
  var rechercheVehicule = document.getElementById("n-recherche-vehicule");
  var voirIndisponibles = document.getElementById("n-indisponibles");
  var CARROSSERIES = { vus: "VUS", camionnette: "Camionnette", berline: "Berline", compacte: "Berline" };

  // Pertinence par rapport au besoin qualifié (indication, pas une recommandation automatique).
  function pertinence(v, q) {
    var raisons = [];
    var marques = (q.marques || []).map(normaliser), modeles = (q.modeles || []).map(normaliser);
    if (modeles.some(function (m) { return m && normaliser(v.modele).indexOf(m) >= 0; })) raisons.push("Modèle envisagé");
    else if (marques.indexOf(normaliser(v.marque)) >= 0) raisons.push("Marque préférée");
    if (q.categorie && CARROSSERIES[q.categorie] === v.carrosserie) raisons.push("Catégorie recherchée");
    return raisons;
  }

  function rendreVehicules() {
    var o = P.opportunite(etat.oppId);
    var q = (o && o.qualification) || {};
    var budget = q.budgetTotal;
    zone("rappel-besoin").innerHTML = o
      ? '<i class="bi bi-clipboard-data me-1"></i>Besoin : <strong>' + esc(P.resumeVehicule(o) || "à préciser") + "</strong>" + (budget ? " · budget indicatif " + esc(P.argent(budget)) : "")
      : "";
    var qr = normaliser(rechercheVehicule.value.trim());
    var liste = S.inventaire().filter(function (v) {
      if (!voirIndisponibles.checked && (v.statutActuel === "Vendu" || v.statutActuel === "Livre")) return false;
      return !qr || normaliser([v.marque, v.modele, v.version, v.annee, v.numeroStock].join(" ")).indexOf(qr) >= 0;
    }).map(function (v) { return { v: v, raisons: pertinence(v, q) }; })
      .sort(function (a, b) { return b.raisons.length - a.raisons.length || (S.disponible(b.v) ? 1 : 0) - (S.disponible(a.v) ? 1 : 0) || a.v.prixDemande - b.v.prixDemande; });

    zone("vehicules").innerHTML = liste.map(function (x) {
      var v = x.v;
      var vendu = v.statutActuel === "Vendu" || v.statutActuel === "Livre";
      var choisi = v.id === etat.vehiculeId;
      var avertissement = vendu ? "Indisponible : ne peut pas être proposé"
        : !S.disponible(v) ? "Disponibilité à confirmer (" + S.libelleStatutVehicule(v.statutActuel).toLowerCase() + ")" : "";
      var ecartBudget = budget ? v.prixDemande - budget : null;
      return '<button type="button" role="radio" aria-checked="' + choisi + '" class="so-vehicule' + (choisi ? " is-active" : "") + '" data-vehicule="' + esc(v.id) + '"' + (vendu ? ' disabled aria-disabled="true"' : "") + ">" +
        '<span class="so-photo"><i class="bi bi-car-front"></i><small>Photo non disponible</small></span>' +
        '<span class="so-vehicule-corps"><span class="so-vehicule-tete"><strong>' + esc(v.annee + " " + v.marque + " " + v.modele) + "</strong>" + UI.pastilleVehicule(v.statutActuel) + "</span>" +
        '<span class="pr-sous d-block">' + esc([v.version, v.neuf ? "Neuf" : v.kilometrage.toLocaleString("fr-CA") + " km", v.carburant].filter(Boolean).join(" · ")) + "</span>" +
        '<span class="so-vehicule-prix">' + esc(P.argent(v.prixDemande)) + '<small>N° ' + esc(v.numeroStock) + "</small></span>" +
        '<span class="pr-sous d-block">' + esc((v.caracteristiques || []).join(" · ")) + "</span>" +
        (x.raisons.length ? '<span class="so-pertinence"><i class="bi bi-check2"></i>' + esc(x.raisons.join(" · ")) + "</span>" : "") +
        (ecartBudget !== null ? '<span class="pr-sous d-block">' + (ecartBudget <= 0 ? "Dans le budget indicatif" : esc(P.argent(ecartBudget)) + " au-delà du budget indicatif") + "</span>" : "") +
        (avertissement ? '<span class="so-alerte"><i class="bi bi-exclamation-triangle"></i>' + esc(avertissement) + "</span>" : "") +
        "</span></button>";
    }).join("");
    zone("vehicules-vide").hidden = liste.length > 0;
  }

  // ---------- Étape 3 : offre préremplie ----------
  function offreInitiale(v, o) {
    var q = (o && o.qualification) || {};
    var validite = new Date();
    validite.setDate(validite.getDate() + 7);
    return {
      prixAnnonce: v.prixDemande,
      remise: 0,
      options: [],
      reprise: q.reprise === "oui" || q.reprise === "a-determiner" ? { vehicule: q.repriseDetail || "", valeurEstimee: null, soldePret: null } : null,
      miseDeFonds: q.miseDeFonds || 0,
      acompteVerse: 0,
      modeAchat: q.modeAchat === "comptant" ? "comptant" : "financement",
      dureeMois: 60,
      tauxAnnuel: null,
      inclureTaxes: true,
      commentaires: null,
      dateValidite: validite.toISOString(),
    };
  }
  function majDetail(offre) {
    zone("detail-prix").innerHTML = UI.detailPrix(offre);
  }

  // ---------- Navigation entre étapes ----------
  var aide = racine.querySelector("[data-aide]");
  function erreurEtape(n) {
    if (n === 1 && !etat.prospectId) return "Choisissez un prospect.";
    if (n === 1 && !etat.oppId) return "Choisissez une opportunité active.";
    if (n === 2 && !etat.vehiculeId) return "Choisissez un véhicule.";
    return null;
  }
  function allerA(n) {
    for (var i = 1; i < n; i++) {
      var err = erreurEtape(i);
      if (err) { aide.textContent = err; n = i; break; }
    }
    if (n === etat.etape && aide.textContent) { rendre(); return; }
    aide.textContent = "";
    etat.etape = n;
    etat.etapeMax = Math.max(etat.etapeMax, n);
    if (n === 3) {
      var cle = etat.oppId + "|" + etat.vehiculeId;
      if (editeurPour !== cle) {
        var v = S.vehicule(etat.vehiculeId);
        var offre = offreInitiale(v, P.opportunite(etat.oppId));
        editeur.remplir(offre, v);
        majDetail(offre);
        editeurPour = cle;
      }
    }
    rendre();
    var titre = document.getElementById("titre-etape-" + n);
    var section = racine.querySelector('[data-etape="' + n + '"]');
    section.setAttribute("tabindex", "-1");
    section.focus({ preventScroll: true });
    if (titre) section.scrollIntoView({ block: "nearest" });
  }

  function rendre() {
    racine.querySelectorAll("[data-etape]").forEach(function (s) { s.hidden = Number(s.dataset.etape) !== etat.etape; });
    racine.querySelectorAll(".so-etapes li").forEach(function (li, i) {
      var n = i + 1;
      li.classList.toggle("is-active", n === etat.etape);
      li.classList.toggle("is-fait", n < etat.etape);
      var b = li.querySelector("button");
      b.disabled = n > etat.etapeMax;
      if (n === etat.etape) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    });
    racine.querySelector("[data-precedent]").hidden = etat.etape === 1;
    racine.querySelector("[data-suivant]").hidden = etat.etape === 3;
    racine.querySelector("[data-creer]").hidden = etat.etape !== 3;
    if (etat.etape === 1) { rendreClients(); rendreOpportunites(); rendreBesoins(); }
    if (etat.etape === 2) rendreVehicules();
  }

  racine.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b || b.disabled) return;
    if (b.dataset.prospect) {
      if (etat.prospectId !== b.dataset.prospect) {
        etat.prospectId = b.dataset.prospect;
        var actives = P.opportunitesDe(etat.prospectId).filter(P.estActive);
        etat.oppId = actives.length === 1 ? actives[0].id : null;
        etat.etapeMax = 1;
      }
      aide.textContent = "";
      rendre();
    } else if (b.dataset.opp) {
      etat.oppId = b.dataset.opp;
      etat.etapeMax = 1;
      aide.textContent = "";
      rendre();
    } else if (b.dataset.vehicule) {
      etat.vehiculeId = b.dataset.vehicule;
      etat.etapeMax = 2;
      aide.textContent = "";
      rendreVehicules();
    } else if (b.dataset.aller) {
      allerA(Number(b.dataset.aller));
    } else if (b.hasAttribute("data-suivant")) {
      allerA(etat.etape + 1);
    } else if (b.hasAttribute("data-precedent")) {
      allerA(etat.etape - 1);
    } else if (b.hasAttribute("data-creer")) {
      creer();
    }
  });
  rechercheClient.addEventListener("input", rendreClients);
  rechercheVehicule.addEventListener("input", rendreVehicules);
  voirIndisponibles.addEventListener("change", rendreVehicules);

  function creer() {
    if (!editeur.valider()) {
      aide.textContent = "Corrigez les champs signalés.";
      return;
    }
    var c = P.contact(etat.prospectId);
    var s = S.creer({
      prospectId: etat.prospectId,
      opportuniteId: etat.oppId,
      conseillerId: c.conseillerId,
      vehicule: editeur.vehicule(),
      offre: editeur.lire(),
    });
    window.location.href = S.urlDetail(s.id) + "#offre";
  }

  // Présélection depuis une opportunité ou une fiche prospect.
  var oppDemandee = racine.dataset.opportunite && P.opportunite(racine.dataset.opportunite);
  if (oppDemandee) {
    etat.prospectId = oppDemandee.prospectId;
    if (P.estActive(oppDemandee)) etat.oppId = oppDemandee.id;
    // Véhicule présélectionné (recommandations de véhicules), seulement s'il est disponible.
    var vDemande = racine.dataset.vehicule && S.vehicule(racine.dataset.vehicule);
    if (etat.oppId && vDemande && S.disponible(vDemande)) {
      etat.vehiculeId = vDemande.id;
      etat.etapeMax = 2;
    }
  } else if (racine.dataset.prospect && P.contact(racine.dataset.prospect)) {
    etat.prospectId = racine.dataset.prospect;
    var actives = P.opportunitesDe(etat.prospectId).filter(P.estActive);
    if (actives.length === 1) etat.oppId = actives[0].id;
  }
  rendre();
})();
