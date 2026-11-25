// Parcours « Nouvelle transaction » : 1. client et opportunité, 2. véhicule et proposition, 3. mode d'achat, 4. vérification,
// puis écran « Transaction ouverte ». Page : Views/Transactions/Nouvelle.cshtml (maquette 08).
// Point de départ possible : la page Transactions, une opportunité, une soumission (et sa version) ou un rendez-vous.
// Les règles (ce qui est permis ou bloquant) sont dans transactions-store.js : T.invalide, T.apercu, T.creer.
(function () {
  "use strict";

  var T = window.Transactions, P = window.Prospects, S = window.Soumissions, R = window.RendezVous, UI = window.TransactionsUI, C = window.SoumissionsCalcul;
  var racine = document.getElementById("parcours");
  if (!T || !P || !S || !UI || !racine) return;
  var esc = P.esc;
  var ref = T.ref;

  var DERNIERE_ETAPE = 4;
  var A_VERIFIER = '<span class="nt-a-verifier">À vérifier</span>';

  var etat = {
    etape: 1, etapeMax: 1,
    prospectId: null, oppId: null, soumissionId: null, versionNumero: null, sansSoumission: false, vehiculeId: null,
    mode: null,
  };
  var form = document.getElementById("form-mode-achat");
  var aide = racine.querySelector("[data-aide]");
  var boutonSuivant = racine.querySelector("[data-suivant]");
  var boutonCreer = racine.querySelector("[data-creer]");

  function zone(nom) {
    return racine.querySelector('[data-zone="' + nom + '"]');
  }
  function normaliser(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  // Une ligne « libellé à gauche, valeur à droite » des listes ns-details. La valeur est déjà en HTML.
  function ligneDef(terme, valeur) {
    return "<div><dt>" + esc(terme) + "</dt><dd>" + valeur + "</dd></div>";
  }
  function sousLigne(texte) {
    return '<span class="nt-sous">' + esc(texte) + "</span>";
  }
  function alerte(texte, icone) {
    return '<p class="nt-alerte"><i class="bi ' + icone + '" aria-hidden="true"></i><span>' + texte + "</span></p>";
  }
  function nomDuClient() {
    var c = etat.prospectId ? P.contact(etat.prospectId) : null;
    return c ? c.prenom + " " + c.nom : "";
  }
  function estVenduOuLivre(statut) {
    return statut === "Vendu" || statut === "Livre";
  }
  // Transaction active qui retient déjà ce véhicule, ou null.
  function transactionQuiRetient(vehiculeId) {
    var actives = T.liste().filter(function (t) { return t.vehiculeId === vehiculeId && T.estActive(t); });
    return actives.length ? actives[0] : null;
  }

  function version() {
    var s = etat.soumissionId ? S.soumission(etat.soumissionId) : null;
    return s ? S.version(s, etat.versionNumero) : null;
  }

  // ---------- Étape 1 : client et opportunité ----------
  var rechercheClient = document.getElementById("n-recherche-client");

  function nombreSoumissionsAcceptees(prospectId) {
    var total = 0;
    P.opportunitesDe(prospectId).filter(P.estActive).forEach(function (o) {
      S.parOpportunite(o.id).forEach(function (s) {
        var acceptee = s.versions.some(function (v) { return v.statut === "Acceptee"; });
        if (acceptee) total++;
      });
    });
    return total;
  }

  function rendreClients() {
    var recherche = normaliser(rechercheClient.value.trim());
    // Démonstration seulement (fonctionnalité 19) : un dossier enregistré n'est jamais proposé, pour qu'aucun élément fictif ne
    // soit rattaché à une opportunité réelle (il apparaîtrait sur sa fiche et dans ses recommandations).
    var contacts = P.contacts().filter(function (c) {
      if (c.enregistre) return false;
      var texte = normaliser(c.prenom + " " + c.nom + " " + (c.courriel || "") + " " + (c.telephone || ""));
      var correspond = !recherche || texte.indexOf(recherche) >= 0;
      var aUneOpportuniteActive = P.opportunitesDe(c.id).some(P.estActive);
      return correspond && aUneOpportuniteActive;
    });
    contacts.sort(function (a, b) { return (a.nom + a.prenom).localeCompare(b.nom + b.prenom, "fr-CA"); });

    if (!contacts.length) {
      zone("clients").innerHTML = '<p class="ns-vide-texte">Aucun prospect avec une opportunité active.</p>';
      return;
    }
    var html = "";
    contacts.forEach(function (c) {
      var choisi = c.id === etat.prospectId;
      var acceptees = nombreSoumissionsAcceptees(c.id);
      var infoSoumissions = acceptees ? acceptees + " soumission(s) acceptée(s)" : "Aucune soumission acceptée";
      html += '<button type="button" role="radio" aria-checked="' + choisi + '" class="ns-client' + (choisi ? " is-choisi" : "") + '" data-prospect="' + esc(c.id) + '">' +
        '<span class="ns-avatar">' + esc(P.initiales(c)) + "</span>" +
        '<span class="ns-client-id"><strong>' + esc(c.prenom + " " + c.nom) + "</strong>" +
        "<span>" + esc(c.courriel || c.telephone || "Coordonnées à compléter") + "</span>" +
        '<span class="nt-client-info' + (acceptees ? " is-acceptee" : "") + '">' + esc(infoSoumissions) + "</span></span>" +
        (choisi ? '<i class="bi bi-check-circle-fill ns-coche" aria-hidden="true"></i>' : "") +
        "</button>";
    });
    zone("clients").innerHTML = html;
  }

  // Carte de droite : nom du client, choix de l'opportunité s'il y en a plusieurs, puis le dossier ligne par ligne.
  function rendreOpportunite() {
    var z = zone("opportunite");
    var c = etat.prospectId ? P.contact(etat.prospectId) : null;
    if (!c) {
      z.innerHTML = '<div class="ns-vide"><i class="bi bi-person"></i><span>Choisissez d\'abord un prospect.</span></div>';
      return;
    }
    var html = '<h3 class="ns-opp-nom">' + esc(c.prenom + " " + c.nom) + "</h3>";
    var opps = P.opportunitesDe(c.id).filter(P.estActive);
    if (!opps.length) {
      z.innerHTML = html + '<p class="ns-vide-texte">Aucune opportunité active pour ce client.</p>';
      return;
    }
    if (opps.length > 1) {
      html += '<div class="ns-opp-choix" role="radiogroup" aria-label="Opportunité">';
      opps.forEach(function (o) {
        var choisie = o.id === etat.oppId;
        html += '<button type="button" role="radio" aria-checked="' + choisie + '" class="ns-opp-pilule' + (choisie ? " is-choisi" : "") + '" data-opp="' + esc(o.id) + '">' + esc(o.titre) + "</button>";
      });
      html += "</div>";
    }
    var o = etat.oppId ? P.opportunite(etat.oppId) : null;
    if (!o) {
      z.innerHTML = html + '<p class="ns-vide-texte">Choisissez l\'opportunité concernée.</p>';
      return;
    }

    var existante = T.enCoursPourOpportunite(o.id);
    if (existante) {
      html += alerte('Une transaction est déjà en cours pour cette opportunité : <a href="' + esc(T.urlDetail(existante.id)) + '">' + esc(existante.reference) + "</a>. Une seule transaction active est permise par opportunité.", "bi-exclamation-triangle");
    }

    var q = o.qualification || {};
    var recherche = P.resumeVehicule(o);
    var budget = P.resumeBudget(q);
    var modeEnvisage = P.libelle("modesAchat", q.modeAchat);
    var coordonnees = [c.telephone, c.courriel].filter(Boolean).join(" · ");
    var reprise = A_VERIFIER;
    if (q.reprise === "oui") reprise = esc(q.repriseDetail || "Oui");
    if (q.reprise === "non") reprise = "Non";

    var historique = P.interactionsDe(c.id).filter(function (i) { return i.opportuniteId === o.id; }).slice(0, 3);
    var historiqueHtml = '<span class="ns-attenue">Aucune interaction</span>';
    if (historique.length) {
      historiqueHtml = '<ul class="nt-historique">' + historique.map(function (i) {
        return "<li>" + esc(i.resume) + sousLigne(P.relatif(i.date)) + "</li>";
      }).join("") + "</ul>";
    }

    html += '<dl class="ns-details">' +
      ligneDef("Recherche", recherche ? esc(recherche) : A_VERIFIER) +
      ligneDef("Étape", esc(P.libelleEtape(o.etape))) +
      ligneDef("Budget", budget ? esc(budget) : A_VERIFIER) +
      ligneDef("Conseiller", esc(P.conseiller(c.conseillerId).nom)) +
      ligneDef("Coordonnées", esc(coordonnees || "Non renseignées") + sousLigne("Préfère : " + (P.libelle("moyensContact", c.contactPrefere) || "non précisé"))) +
      ligneDef("Mode d'achat envisagé", modeEnvisage ? esc(modeEnvisage) : A_VERIFIER) +
      ligneDef("Reprise", reprise) +
      ligneDef("Historique pertinent", historiqueHtml) +
      "</dl>";
    z.innerHTML = html;
  }

  // ---------- Étape 2 : véhicule et proposition ----------
  function tuileVersion(s, v) {
    var choisie = !etat.sansSoumission && etat.soumissionId === s.id && etat.versionNumero === v.numero;
    var calcul = C ? C.calculer(v.offre, S.parametres) : null;
    var prix = calcul ? UI.montant(calcul.totalEstime) : P.argent(v.offre.prixAnnonce);
    var acceptee = v.statut === "Acceptee";
    var etatVersion = acceptee
      ? '<small class="ns-pertinence"><i class="bi bi-check-circle-fill"></i> Acceptée : sera figée dans la transaction</small>'
      : '<small class="ns-avertissement">Non acceptée : brouillon de transaction</small>';
    return '<button type="button" role="radio" aria-checked="' + choisie + '" class="ns-tuile' + (choisie ? " is-choisi" : "") + '" data-version="' + esc(s.id + "|" + v.numero) + '">' +
      "<strong>" + esc(S.nomVehicule(v.vehicule)) + "</strong>" +
      "<span>" + esc(prix) + "</span>" +
      "<small>" + esc(s.reference + " · version " + v.numero + " · " + S.libelleStatut(v.statut)) + (v.note ? " · " + esc(v.note) : "") + "</small>" +
      etatVersion +
      "</button>";
  }

  function rendreVersions() {
    zone("pour-client-2").textContent = "Pour " + nomDuClient();
    var soumissions = etat.oppId ? S.parOpportunite(etat.oppId) : [];
    var html = "";
    soumissions.forEach(function (s) {
      // La version la plus récente en premier.
      s.versions.slice().reverse().forEach(function (v) { html += tuileVersion(s, v); });
    });
    html += '<button type="button" role="radio" aria-checked="' + etat.sansSoumission + '" class="ns-tuile' + (etat.sansSoumission ? " is-choisi" : "") + '" data-sans-soumission>' +
      "<strong>Sans soumission</strong>" +
      "<span>Brouillon incomplet</span>" +
      "<small>Choisir le véhicule envisagé, sans prix ni condition retenus.</small>" +
      "</button>";
    zone("versions").innerHTML = html;

    zone("bloc-vehicules").hidden = !etat.sansSoumission;
    if (etat.sansSoumission) rendreVehicules();
    rendreResumeProposition();
  }

  // Raison pour laquelle un véhicule ne peut pas (ou pas encore) être vendu, ou "".
  function raisonVehicule(vehiculeId, statut) {
    if (estVenduOuLivre(statut)) return "Déjà vendu ou livré : non sélectionnable.";
    var autre = transactionQuiRetient(vehiculeId);
    if (autre) return "Retenu par la transaction " + autre.reference + ".";
    if (statut !== "PretPourVente" && statut !== "Reserve") return "Préparation à suivre : « " + ref.statutsVehicule[statut].toLowerCase() + " ».";
    return "";
  }

  function rendreVehicules() {
    var vehicules = S.inventaire().slice().sort(function (a, b) { return a.prixDemande - b.prixDemande; });
    var html = "";
    vehicules.forEach(function (v) {
      var statut = T.statutVehicule(v.id);
      var bloque = estVenduOuLivre(statut) || !!transactionQuiRetient(v.id);
      var choisi = v.id === etat.vehiculeId;
      var raison = raisonVehicule(v.id, statut);
      html += '<button type="button" role="radio" aria-checked="' + choisi + '" class="ns-tuile' + (choisi ? " is-choisi" : "") + '" data-vehicule="' + esc(v.id) + '"' + (bloque ? ' disabled aria-disabled="true"' : "") + ">" +
        "<strong>" + esc(v.annee + " " + v.marque + " " + v.modele) + "</strong>" +
        "<span>" + esc(P.argent(v.prixDemande)) + "</span>" +
        "<small>N° " + esc(v.numeroStock) + " · " + esc(ref.statutsVehicule[statut] || statut) + "</small>" +
        (raison ? '<small class="ns-avertissement">' + esc(raison) + "</small>" : "") +
        "</button>";
    });
    zone("vehicules").innerHTML = html;
  }

  function rendreResumeProposition() {
    var z = zone("resume-proposition");
    var v = version();
    if (!v && !(etat.sansSoumission && etat.vehiculeId)) {
      z.innerHTML = '<p class="ns-vide-texte">Choisissez une version de soumission (ou un véhicule pour un brouillon).</p>';
      return;
    }

    if (!v) {
      var inv = S.vehicule(etat.vehiculeId);
      z.innerHTML = alerte("Brouillon sans soumission : aucun prix ni condition ne sont retenus. La transaction restera incomplète.", "bi-pencil-square") +
        '<dl class="ns-details">' +
        ligneDef("Véhicule", esc(S.nomVehicule(inv))) +
        ligneDef("Prix en inventaire", esc(P.argent(inv.prixDemande)) + sousLigne("indicatif, non figé")) +
        ligneDef("Statut du véhicule", UI.pastilleVehicule(T.statutVehicule(inv.id))) +
        "</dl>";
      return;
    }

    var o = v.offre;
    var calcul = C ? C.calculer(o, S.parametres) : null;
    var html = "";
    if (v.statut !== "Acceptee") {
      html += alerte("Version « " + esc(S.libelleStatut(v.statut).toLowerCase()) + " » : la transaction sera un brouillon incomplet, sans proposition figée.", "bi-pencil-square");
    }

    var remise = "Aucune";
    if (o.remise) {
      remise = esc(P.argent(o.remise));
      if (o.remise > ref.seuilRemiseApprobation) remise += sousLigne("validation du directeur requise");
    }
    var options = (o.options || []).map(function (x) { return x.libelle; });
    var reprise = "Aucune";
    if (o.reprise) {
      reprise = esc(o.reprise.vehicule);
      if (o.reprise.valeurEstimee != null) reprise += " · " + esc(P.argent(o.reprise.valeurEstimee));
    }

    html += '<dl class="ns-details">' +
      ligneDef("Véhicule", esc(S.nomVehicule(v.vehicule)) + sousLigne("N° " + v.vehicule.numeroStock)) +
      ligneDef("Prix annoncé", esc(P.argent(o.prixAnnonce))) +
      ligneDef("Remise", remise) +
      ligneDef("Options", options.length ? esc(options.join(", ")) : "Aucune") +
      ligneDef("Mode d'achat envisagé", esc(o.modeAchat === "comptant" ? "Comptant" : "Financement")) +
      ligneDef("Reprise", reprise) +
      ligneDef("Mise de fonds", o.miseDeFonds ? esc(P.argent(o.miseDeFonds)) : "Aucune") +
      ligneDef("Total estimé", calcul ? "<strong>" + esc(UI.montant(calcul.totalEstime)) + "</strong>" : "Non calculé") +
      ligneDef("Statut actuel du véhicule", UI.pastilleVehicule(T.statutVehicule(v.vehicule.id))) +
      "</dl>";
    if (v.statut === "Acceptee") {
      html += '<p class="ns-note"><i class="bi bi-lock"></i> Un instantané de cette version sera conservé : un changement de prix en inventaire ou une nouvelle version ne modifiera pas la transaction.</p>';
    }
    z.innerHTML = html;
  }

  // ---------- Étape 3 : mode d'achat ----------
  function rendreModes() {
    racine.querySelectorAll("[data-mode]").forEach(function (b) {
      var choisi = b.dataset.mode === etat.mode;
      b.classList.toggle("is-choisi", choisi);
      b.setAttribute("aria-checked", String(choisi));
    });
  }

  // Reprend ce que la soumission (ou, à défaut, la qualification de l'opportunité) dit déjà.
  function preremplirEtape3() {
    zone("pour-client-3").textContent = "Pour " + nomDuClient();
    var v = version();
    var o = v ? v.offre : null;
    var opp = P.opportunite(etat.oppId);
    var q = (opp && opp.qualification) || {};

    if (!etat.mode) {
      if (o) etat.mode = o.modeAchat;
      else if (q.modeAchat === "comptant" || q.modeAchat === "financement") etat.mode = q.modeAchat;
      else etat.mode = "indetermine";
    }
    rendreModes();

    var interrupteur = document.getElementById("n-reprise");
    var avecReprise = !!(o && o.reprise) || q.reprise === "oui";
    if (!interrupteur.dataset.touche) interrupteur.checked = avecReprise;
    if (!form.elements.description.value) form.elements.description.value = o && o.reprise ? o.reprise.vehicule : q.repriseDetail || "";
    zone("champs-reprise").hidden = !interrupteur.checked;

    zone("aide-depot").textContent = o && o.acompteVerse
      ? "La soumission indique un acompte de " + P.argent(o.acompteVerse) + " : il sera noté « déclaré », à confirmer par une personne autorisée."
      : "Montant envisagé uniquement : aucun encaissement.";
  }

  // Toutes les informations saisies, dans la forme attendue par T.invalide, T.apercu et T.creer.
  function donnees() {
    var reprise = null;
    if (document.getElementById("n-reprise").checked) {
      reprise = {
        description: form.elements.description.value.trim() || null,
        marque: form.elements.marque.value.trim() || null,
        modele: form.elements.modele.value.trim() || null,
        annee: form.elements.annee.value || null,
        kilometrage: form.elements.kilometrage.value,
      };
    }
    return {
      prospectId: etat.prospectId,
      opportuniteId: etat.oppId,
      soumissionId: etat.sansSoumission ? null : etat.soumissionId,
      versionNumero: etat.sansSoumission ? null : etat.versionNumero,
      vehiculeId: etat.vehiculeId,
      modeAchat: etat.mode || "indetermine",
      depot: form.elements.depot.value,
      reprise: reprise,
      aConfirmer: form.elements.aConfirmer.value.trim() || null,
    };
  }

  // ---------- Étape 4 : vérification ----------
  function liste(items, icone, vide) {
    if (!items.length) return '<p class="ns-vide-texte">' + esc(vide) + "</p>";
    return '<ul class="nt-liste">' + items.map(function (texte) {
      return '<li><i class="bi ' + icone + '" aria-hidden="true"></i><span>' + texte + "</span></li>";
    }).join("") + "</ul>";
  }

  function rendreVerification() {
    var x = donnees();
    var refus = T.invalide(x);
    var apercu = T.apercu(x);
    var html = "";
    if (refus) {
      html += '<p class="nt-alerte is-bloquant"><i class="bi bi-exclamation-octagon-fill" aria-hidden="true"></i><span><span class="visually-hidden">Bloquant : </span>' + esc(refus) + "</span></p>";
    }
    if (apercu) {
      var analyse = apercu.analyse;

      var completes = [];
      var c = P.contact(x.prospectId);
      if (c) completes.push("Client : " + c.prenom + " " + c.nom);
      if (P.opportunite(x.opportuniteId)) completes.push("Opportunité : " + P.opportunite(x.opportuniteId).titre);
      completes.push("Véhicule : " + T.nomVehicule(apercu.transaction));
      if (!apercu.transaction.brouillon) completes.push("Proposition acceptée retenue (version " + x.versionNumero + ")");
      if (x.modeAchat !== "indetermine") completes.push("Mode d'achat : " + ref.modesAchat[x.modeAchat]);

      var manquantes = analyse.elements.filter(function (e) { return e.proprietaire === "vendeur" || e.niveau === "information"; });
      var validations = analyse.elements.filter(function (e) { return e.proprietaire === "departement" && e.niveau !== "information"; });
      // Étapes à faire par un autre département (ni le conseiller ni le client), pas encore terminées.
      var etapesAutres = [];
      analyse.axes.forEach(function (axe) {
        axe.etapes.forEach(function (e) {
          var aFaire = e.etat !== "NonApplicable" && e.etat !== "Terminee";
          var parUnDepartement = e.responsable && e.responsable !== "conseiller" && e.responsable !== "client";
          var dejaListee = validations.some(function (v) { return v.etape === e.cle; });
          if (aFaire && parUnDepartement && !dejaListee) etapesAutres.push(e);
        });
      });
      var disponibilite = analyse.elements.filter(function (e) { return e.axe === "vehicule" && e.niveau !== "information"; });

      var textesValidations = validations.map(function (e) {
        return esc(e.nature) + sousLigne(e.departementLibelle);
      }).concat(etapesAutres.map(function (e) {
        return esc(e.libelle) + sousLigne(ref.departements[e.responsable].libelle);
      }));
      var prochaines = [esc(analyse.prochaineAction.texte)].concat(analyse.actionsVendeur.slice(1, 3).map(function (e) { return esc(e.actionVendeur); }));

      html += '<h3 class="nt-sous-titre">Informations complètes</h3>' + liste(completes.map(esc), "bi-check-circle-fill is-ok", "Aucune.") +
        '<h3 class="nt-sous-titre">Informations manquantes ou à compléter</h3>' + liste(manquantes.map(function (e) { return esc(e.nature); }), "bi-exclamation-circle is-attention", "Aucune information manquante.") +
        '<h3 class="nt-sous-titre">Validations nécessaires</h3>' + liste(textesValidations, "bi-person-badge", "Aucune validation d'un autre département.") +
        '<h3 class="nt-sous-titre">Disponibilité du véhicule</h3>' + liste(disponibilite.map(function (e) { return esc(e.nature); }), "bi-car-front", "Aucun problème de disponibilité connu.") +
        '<h3 class="nt-sous-titre">Prochaines étapes</h3>' + liste(prochaines, "bi-arrow-right-circle", "Aucune.");
    }
    zone("verification").innerHTML = html || '<p class="ns-vide-texte">Complétez les étapes précédentes.</p>';
    rendreRecapitulatif(x, apercu);
    boutonCreer.disabled = !!refus;
  }

  // Lignes du récapitulatif, communes à l'étape 4 et à l'écran final.
  function lignesRecap(x, transaction) {
    var o = P.opportunite(x.opportuniteId);
    var s = x.soumissionId ? S.soumission(x.soumissionId) : null;
    var m = transaction ? T.montants(transaction) : null;
    var proposition = s ? s.reference + " · version " + x.versionNumero : "Aucune proposition (brouillon)";
    var vehicule = transaction ? esc(T.nomVehicule(transaction)) : "À choisir";
    var montant = '<span class="ns-attenue">À déterminer</span>';
    if (m) montant = esc(UI.montant(m.totalEstime)) + (m.figee ? "" : ' <span class="nt-etiquette-brouillon">non figé</span>');
    var etatCreation = "Non disponible";
    if (transaction) etatCreation = transaction.brouillon ? '<span class="nt-etiquette-brouillon">Brouillon incomplet</span>' : "Transaction active";

    return ligneDef("Client", esc(x.prospectId ? T.nomClient(x) : "À choisir")) +
      ligneDef("Opportunité", esc(o ? o.titre : "À choisir")) +
      ligneDef("Véhicule et proposition", vehicule + sousLigne(proposition)) +
      ligneDef("Montant", montant) +
      ligneDef("Mode d'achat", esc(ref.modesAchat[x.modeAchat])) +
      ligneDef("Reprise", x.reprise ? esc(x.reprise.description || "Oui") : "Aucune") +
      ligneDef("État à la création", etatCreation);
  }

  function rendreRecapitulatif(x, apercu) {
    zone("recapitulatif").innerHTML = lignesRecap(x, apercu ? apercu.transaction : null);
  }

  // ---------- Navigation entre les étapes ----------

  // Vrai quand l'étape a ce qu'il faut pour activer « Suivant » (les règles complètes sont dans erreurEtape).
  function etapeRemplie(n) {
    if (n === 1) return !!(etat.prospectId && etat.oppId);
    if (n === 2) return !!etat.vehiculeId;
    if (n === 3) return !!etat.mode;
    return true;
  }

  // Message qui empêche de quitter l'étape n, ou null si tout va bien.
  function erreurEtape(n) {
    if (n === 1) {
      if (!etat.prospectId) return "Choisissez un client.";
      if (!etat.oppId) return "Choisissez une opportunité active.";
      var existante = T.enCoursPourOpportunite(etat.oppId);
      if (existante) return "Une transaction est déjà en cours pour cette opportunité (" + existante.reference + ").";
    }
    if (n === 2) {
      if (!etat.sansSoumission && !etat.soumissionId) return "Choisissez une version de soumission, ou « Sans soumission ».";
      if (!etat.vehiculeId) return "Choisissez le véhicule envisagé.";
      if (estVenduOuLivre(T.statutVehicule(etat.vehiculeId))) return "Ce véhicule est déjà vendu ou livré à un autre client.";
      var autre = transactionQuiRetient(etat.vehiculeId);
      if (autre) return "Ce véhicule est déjà retenu par la transaction " + autre.reference + ".";
    }
    if (n === 3) {
      form.querySelector("[data-erreur-mode]").hidden = !!etat.mode;
      if (!etat.mode) return "Choisissez un mode d'achat.";

      var depot = form.elements.depot;
      var depotInvalide = depot.value !== "" && !(Number(depot.value) >= 0 && Number(depot.value) <= 100000);
      depot.classList.toggle("is-invalid", depotInvalide);

      var avecReprise = document.getElementById("n-reprise").checked;
      var annee = form.elements.annee;
      var km = form.elements.kilometrage;
      var anneeMax = new Date().getFullYear() + 1;
      var anneeInvalide = avecReprise && annee.value !== "" && (Number(annee.value) < 1980 || Number(annee.value) > anneeMax);
      var kmInvalide = avecReprise && km.value !== "" && (Number(km.value) < 0 || Number(km.value) > 1000000);
      annee.classList.toggle("is-invalid", anneeInvalide);
      km.classList.toggle("is-invalid", kmInvalide);

      if (form.querySelector(".is-invalid")) return "Corrigez les montants indiqués.";
    }
    return null;
  }

  // Avance (en vérifiant chaque étape traversée) ou recule jusqu'à l'étape n.
  function allerA(n) {
    if (n < 1 || n > DERNIERE_ETAPE) return;
    if (n > etat.etape) {
      for (var k = etat.etape; k < n; k++) {
        var erreur = erreurEtape(k);
        if (erreur) {
          if (k !== etat.etape) {
            etat.etape = k;
            rendre();
          }
          aide.textContent = erreur;
          return;
        }
      }
    }
    aide.textContent = "";
    etat.etape = n;
    etat.etapeMax = Math.max(etat.etapeMax, n);
    rendre();
  }

  function rendreIndicateurEtapes() {
    racine.querySelectorAll("[data-aller]").forEach(function (b) {
      var n = Number(b.dataset.aller);
      var li = b.closest("li");
      var faite = n < etat.etape;
      b.disabled = n > etat.etapeMax;
      li.classList.toggle("is-courante", n === etat.etape);
      li.classList.toggle("is-faite", faite);
      b.querySelector(".ns-num").innerHTML = faite ? '<i class="bi bi-check-lg" aria-hidden="true"></i>' : String(n);
      if (n === etat.etape) b.setAttribute("aria-current", "step");
      else b.removeAttribute("aria-current");
    });
  }

  function rendreBoutons() {
    var derniere = etat.etape === DERNIERE_ETAPE;
    boutonSuivant.hidden = derniere;
    boutonSuivant.disabled = !etapeRemplie(etat.etape);
    boutonCreer.hidden = !derniere;
  }

  function rendre() {
    racine.querySelectorAll("[data-etape]").forEach(function (s) { s.hidden = Number(s.dataset.etape) !== etat.etape; });
    rendreIndicateurEtapes();
    if (etat.etape === 1) { rendreClients(); rendreOpportunite(); }
    if (etat.etape === 2) rendreVersions();
    if (etat.etape === 3) preremplirEtape3();
    if (etat.etape === 4) rendreVerification();
    rendreBoutons();
  }

  // Un choix fait plus tôt dans le parcours oblige à repasser par les étapes suivantes.
  function reinitialiserApres(n) {
    etat.etapeMax = Math.min(etat.etapeMax, n);
  }
  function oublierProposition() {
    etat.soumissionId = null;
    etat.versionNumero = null;
    etat.vehiculeId = null;
    etat.sansSoumission = false;
    etat.mode = null;
  }

  function precedent() {
    if (etat.etape === 1) {
      window.location.href = racine.dataset.urlListe;
      return;
    }
    allerA(etat.etape - 1);
  }

  racine.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b || b.disabled) return;

    if (b.dataset.prospect) {
      if (etat.prospectId !== b.dataset.prospect) {
        etat.prospectId = b.dataset.prospect;
        var actives = P.opportunitesDe(etat.prospectId).filter(P.estActive);
        etat.oppId = actives.length === 1 ? actives[0].id : null;
        oublierProposition();
        reinitialiserApres(1);
      }
      aide.textContent = "";
      rendre();
    } else if (b.dataset.opp) {
      if (etat.oppId !== b.dataset.opp) {
        etat.oppId = b.dataset.opp;
        oublierProposition();
        reinitialiserApres(1);
      }
      aide.textContent = "";
      rendre();
    } else if (b.dataset.version) {
      var morceaux = b.dataset.version.split("|");
      etat.soumissionId = morceaux[0];
      etat.versionNumero = Number(morceaux[1]);
      etat.sansSoumission = false;
      etat.vehiculeId = version().vehicule.id;
      etat.mode = null;
      reinitialiserApres(2);
      aide.textContent = "";
      rendreVersions();
      rendreBoutons();
    } else if (b.hasAttribute("data-sans-soumission")) {
      oublierProposition();
      etat.sansSoumission = true;
      reinitialiserApres(2);
      rendreVersions();
      rendreBoutons();
    } else if (b.dataset.vehicule) {
      etat.vehiculeId = b.dataset.vehicule;
      aide.textContent = "";
      rendreVehicules();
      rendreResumeProposition();
      rendreBoutons();
    } else if (b.dataset.mode) {
      etat.mode = b.dataset.mode;
      form.querySelector("[data-erreur-mode]").hidden = true;
      aide.textContent = "";
      rendreModes();
      rendreBoutons();
    } else if (b.dataset.aller) {
      allerA(Number(b.dataset.aller));
    } else if (b.hasAttribute("data-suivant")) {
      allerA(etat.etape + 1);
    } else if (b.hasAttribute("data-precedent")) {
      precedent();
    } else if (b.hasAttribute("data-creer")) {
      creer();
    }
  });
  rechercheClient.addEventListener("input", rendreClients);
  document.getElementById("n-reprise").addEventListener("change", function (e) {
    e.target.dataset.touche = "1";
    zone("champs-reprise").hidden = !e.target.checked;
  });
  form.addEventListener("submit", function (e) { e.preventDefault(); });

  // ---------- Création et écran final ----------
  function afficherFin(transaction, x) {
    racine.querySelector("[data-assistant]").hidden = true;
    zone("origine").hidden = true;
    zone("recap-fin").innerHTML = ligneDef("Référence", esc(transaction.reference)) + lignesRecap(x, transaction);
    racine.querySelector("[data-ouvrir]").href = T.urlDetail(transaction.id);
    var fin = racine.querySelector("[data-fin]");
    fin.hidden = false;
    fin.focus();
  }

  function creer() {
    for (var n = 1; n < DERNIERE_ETAPE; n++) {
      var erreur = erreurEtape(n);
      if (erreur) {
        if (n !== etat.etape) {
          etat.etape = n;
          rendre();
        }
        aide.textContent = erreur;
        return;
      }
    }
    var x = donnees();
    var refus = T.invalide(x);
    if (refus) {
      aide.textContent = refus;
      rendreVerification();
      return;
    }
    var transaction = T.creer(x);
    if (!transaction) {
      aide.textContent = "Création impossible : le dossier n'a pas pu être enregistré dans cet onglet.";
      return;
    }
    afficherFin(transaction, x);
  }

  // ---------- Préremplissage selon le point de départ ----------
  function versionAcceptee(soumission) {
    var acceptees = soumission.versions.slice().reverse().filter(function (v) { return v.statut === "Acceptee"; });
    return acceptees.length ? acceptees[0] : null;
  }
  function retenirVersion(soumission, v) {
    etat.soumissionId = soumission.id;
    etat.versionNumero = v.numero;
    etat.vehiculeId = v.vehicule.id;
  }

  var ds = racine.dataset;
  var origine = null;
  var depuisSoumission = ds.soumission ? S.soumission(ds.soumission) : null;
  var depuisRendezVous = ds.rendezvous && R ? R.rdv(ds.rendezvous) : null;

  if (depuisSoumission) {
    etat.prospectId = depuisSoumission.prospectId;
    var oS = P.opportunite(depuisSoumission.opportuniteId);
    if (oS && P.estActive(oS)) etat.oppId = oS.id;
    var numero = Number(ds.version) || null;
    var vS = numero ? S.version(depuisSoumission, numero) : null;
    if (!vS) vS = versionAcceptee(depuisSoumission) || S.versionCourante(depuisSoumission);
    retenirVersion(depuisSoumission, vS);
    origine = "Depuis la soumission " + depuisSoumission.reference + " (version " + vS.numero + ", " + S.libelleStatut(vS.statut).toLowerCase() + ").";
  } else if (depuisRendezVous) {
    etat.prospectId = depuisRendezVous.prospectId;
    var oR = P.opportunite(depuisRendezVous.opportuniteId);
    if (oR && P.estActive(oR)) etat.oppId = oR.id;
    origine = "Depuis le rendez-vous « " + R.type(depuisRendezVous.type).libelle + " » du " + R.jourCourt(depuisRendezVous.debut);
    if (depuisRendezVous.resultat) origine += " (résultat : " + (R.libelle("resultats", depuisRendezVous.resultat.resultat) || "").toLowerCase() + ")";
    origine += ".";
    var sR = depuisRendezVous.soumissionId ? S.soumission(depuisRendezVous.soumissionId) : null;
    var vR = sR ? versionAcceptee(sR) : null;
    if (vR) retenirVersion(sR, vR);
  } else if (ds.opportunite && P.opportunite(ds.opportunite) && !P.estEnregistree(ds.opportunite)) { // dossier réel : jamais présélectionné
    var o = P.opportunite(ds.opportunite);
    etat.prospectId = o.prospectId;
    if (P.estActive(o)) etat.oppId = o.id;
    origine = "Depuis l'opportunité « " + o.titre + " ».";
    // Une seule version acceptée pour cette opportunité : on la retient d'office.
    var acceptees = [];
    S.parOpportunite(o.id).forEach(function (s) {
      s.versions.forEach(function (v) { if (v.statut === "Acceptee") acceptees.push({ s: s, v: v }); });
    });
    if (acceptees.length === 1) retenirVersion(acceptees[0].s, acceptees[0].v);
  } else if (ds.prospect && P.contact(ds.prospect) && !P.contact(ds.prospect).enregistre) {
    etat.prospectId = ds.prospect;
    var activesDepart = P.opportunitesDe(etat.prospectId).filter(P.estActive);
    if (activesDepart.length === 1) etat.oppId = activesDepart[0].id;
  }

  if (origine) {
    var zoneOrigine = zone("origine");
    zoneOrigine.hidden = false;
    zoneOrigine.innerHTML = '<i class="bi bi-box-arrow-in-right" aria-hidden="true"></i>' + esc(origine) + " Les informations connues sont reprises.";
  }
  if (etat.prospectId && etat.oppId && etat.soumissionId) etat.etapeMax = 3;
  rendre();
})();
