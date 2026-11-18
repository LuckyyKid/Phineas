// Parcours « Nouvelle transaction » : 1. client et opportunité, 2. véhicule et proposition, 3. mode d'achat, 4. vérification.
// Point de départ possible : la page Transactions, une opportunité, une soumission (et sa version) ou un rendez-vous.
(function () {
  "use strict";

  var T = window.Transactions, P = window.Prospects, S = window.Soumissions, R = window.RendezVous, UI = window.TransactionsUI, C = window.SoumissionsCalcul;
  var racine = document.getElementById("parcours");
  if (!T || !P || !S || !UI || !racine) return;
  var esc = P.esc;
  var ref = T.ref;

  var etat = {
    etape: 1, etapeMax: 1,
    prospectId: null, oppId: null, soumissionId: null, versionNumero: null, sansSoumission: false, vehiculeId: null,
  };
  var form = document.getElementById("form-mode-achat");
  var aide = racine.querySelector("[data-aide]");

  function zone(nom) {
    return racine.querySelector('[data-zone="' + nom + '"]');
  }
  function normaliser(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  function ligneDef(terme, valeur) {
    return "<div><dt>" + esc(terme) + "</dt><dd>" + valeur + "</dd></div>";
  }
  var A_VERIFIER = '<span class="rv-a-verifier">À vérifier</span>';

  function version() {
    var s = etat.soumissionId ? S.soumission(etat.soumissionId) : null;
    return s ? S.version(s, etat.versionNumero) : null;
  }
  function modeChoisi() {
    var r = form.querySelector('input[name="mode"]:checked');
    return r ? r.value : null;
  }
  function brouillonCourant() {
    var v = version();
    return !v || v.statut !== "Acceptee";
  }

  // ---------- Étape 1 ----------
  var rechercheClient = document.getElementById("n-recherche-client");
  function rendreClients() {
    var q = normaliser(rechercheClient.value.trim());
    var contacts = P.contacts().filter(function (c) {
      return (!q || normaliser(c.prenom + " " + c.nom + " " + (c.courriel || "")).indexOf(q) >= 0) && P.opportunitesDe(c.id).some(P.estActive);
    }).sort(function (a, b) { return (a.nom + a.prenom).localeCompare(b.nom + b.prenom, "fr-CA"); });
    zone("clients").innerHTML = contacts.length ? contacts.map(function (c) {
      var choisi = c.id === etat.prospectId;
      var acceptees = P.opportunitesDe(c.id).filter(P.estActive).reduce(function (n, o) {
        return n + S.parOpportunite(o.id).filter(function (s) { return s.versions.some(function (v) { return v.statut === "Acceptee"; }); }).length;
      }, 0);
      return '<button type="button" role="radio" aria-checked="' + choisi + '" class="so-choix' + (choisi ? " is-active" : "") + '" data-prospect="' + esc(c.id) + '">' +
        '<span class="avatar">' + esc(P.initiales(c)) + "</span><span><strong>" + esc(c.prenom + " " + c.nom) + "</strong>" +
        '<span class="pr-sous d-block">' + (acceptees ? acceptees + " soumission(s) acceptée(s)" : "Aucune soumission acceptée") + "</span></span></button>";
    }).join("") : '<div class="sv-empty"><span>Aucun prospect avec une opportunité active.</span></div>';
  }
  function rendreOpportunites() {
    var z = zone("opportunites");
    if (!etat.prospectId) return;
    var opps = P.opportunitesDe(etat.prospectId).filter(P.estActive);
    z.innerHTML = opps.length ? '<div class="so-opps" role="radiogroup" aria-label="Opportunité">' + opps.map(function (o) {
      var choisie = o.id === etat.oppId;
      var existante = T.enCoursPourOpportunite(o.id);
      return '<button type="button" role="radio" aria-checked="' + choisie + '" class="so-choix' + (choisie ? " is-active" : "") + '" data-opp="' + esc(o.id) + '">' +
        "<span><strong>" + esc(o.titre) + '</strong> <span class="status-pill sv-et-' + esc(o.etape) + '">' + esc(P.libelleEtape(o.etape)) + "</span>" +
        '<span class="pr-sous d-block">' + esc(P.resumeVehicule(o) || "Véhicule à préciser") + "</span>" +
        (existante ? '<span class="so-alerte"><i class="bi bi-exclamation-triangle"></i>Transaction déjà en cours : ' + esc(existante.reference) + "</span>" : "") +
        "</span></button>";
    }).join("") + "</div>" : '<p class="text-muted mb-0">Aucune opportunité active pour ce client.</p>';
  }
  function rendreContexte() {
    var z = zone("contexte");
    var c = etat.prospectId ? P.contact(etat.prospectId) : null;
    var o = etat.oppId ? P.opportunite(etat.oppId) : null;
    z.hidden = !c || !o;
    if (!c || !o) return;
    var q = o.qualification || {};
    var existante = T.enCoursPourOpportunite(o.id);
    var historique = P.interactionsDe(c.id).filter(function (i) { return i.opportuniteId === o.id; }).slice(0, 3);
    z.innerHTML = '<div class="card-header sv-card-header"><span><i class="bi bi-person-vcard me-2"></i>Dossier du client</span></div><div class="card-body">' +
      (existante ? '<div class="alert alert-warning small d-flex gap-2"><i class="bi bi-exclamation-triangle"></i><span>Une transaction est déjà en cours pour cette opportunité : <a href="' + esc(T.urlDetail(existante.id)) + '">' + esc(existante.reference) + "</a>. Une seule transaction active est permise par opportunité.</span></div>" : "") +
      '<dl class="pr-liste-def pr-liste-def-compacte">' +
      ligneDef("Coordonnées", esc([c.telephone, c.courriel].filter(Boolean).join(" · ") || "—") + '<span class="pr-sous d-block">Préfère : ' + esc(P.libelle("moyensContact", c.contactPrefere) || "non précisé") + "</span>") +
      ligneDef("Besoins", esc(P.resumeVehicule(o) || "") ? esc(P.resumeVehicule(o)) + (P.resumeBudget(q) ? '<span class="pr-sous d-block">Budget : ' + esc(P.resumeBudget(q)) + "</span>" : "") : A_VERIFIER) +
      ligneDef("Mode d'achat envisagé", P.libelle("modesAchat", q.modeAchat) ? esc(P.libelle("modesAchat", q.modeAchat)) : A_VERIFIER) +
      ligneDef("Reprise", q.reprise === "oui" ? esc(q.repriseDetail || "Oui") : q.reprise === "non" ? "Non" : A_VERIFIER) +
      ligneDef("Conseiller", esc(P.conseiller(c.conseillerId).nom)) +
      ligneDef("Historique pertinent", historique.length ? '<ul class="rv-notes">' + historique.map(function (i) { return '<li><span class="pr-sous">' + esc(P.relatif(i.date)) + "</span>" + esc(i.resume) + "</li>"; }).join("") + "</ul>" : '<span class="text-muted">Aucune interaction</span>') +
      "</dl></div>";
  }

  // ---------- Étape 2 ----------
  function rendreVersions() {
    var liste = etat.oppId ? S.parOpportunite(etat.oppId) : [];
    var options = [];
    liste.forEach(function (s) {
      s.versions.slice().reverse().forEach(function (v) { options.push({ s: s, v: v }); });
    });
    var html = options.length ? '<div class="so-opps" role="radiogroup" aria-label="Version de soumission">' + options.map(function (x) {
      var choisie = !etat.sansSoumission && etat.soumissionId === x.s.id && etat.versionNumero === x.v.numero;
      var calc = C ? C.calculer(x.v.offre, S.parametres) : null;
      var acceptee = x.v.statut === "Acceptee";
      return '<button type="button" role="radio" aria-checked="' + choisie + '" class="so-choix' + (choisie ? " is-active" : "") + '" data-version="' + esc(x.s.id + "|" + x.v.numero) + '">' +
        "<span><strong>" + esc(x.s.reference) + " · version " + x.v.numero + '</strong> <span class="so-statut so-st-' + esc(x.v.statut) + '">' + esc(S.libelleStatut(x.v.statut)) + "</span>" +
        '<span class="pr-sous d-block">' + esc(S.nomVehicule(x.v.vehicule)) + (calc ? " · " + esc(UI.montant(calc.totalEstime)) : "") + (x.v.note ? " · " + esc(x.v.note) : "") + "</span>" +
        (acceptee ? '<span class="tx-ok"><i class="bi bi-check-circle-fill"></i>Acceptée : sera figée dans la transaction</span>' : '<span class="tx-brouillon-tag">Non acceptée : brouillon de transaction</span>') +
        "</span></button>";
    }).join("") + "</div>" : '<p class="text-muted">Aucune soumission pour cette opportunité.</p>';
    html += '<button type="button" role="radio" aria-checked="' + etat.sansSoumission + '" class="so-choix mt-2' + (etat.sansSoumission ? " is-active" : "") + '" data-sans-soumission>' +
      '<span><strong>Sans soumission</strong><span class="pr-sous d-block">Préparer un brouillon de transaction, clairement incomplet, en choisissant le véhicule envisagé.</span></span></button>';
    zone("versions").innerHTML = html;
    zone("carte-vehicules").hidden = !etat.sansSoumission;
    if (etat.sansSoumission) rendreVehicules();
    rendreResumeProposition();
  }
  function rendreVehicules() {
    zone("vehicules").innerHTML = S.inventaire().slice().sort(function (a, b) { return a.prixDemande - b.prixDemande; }).map(function (v) {
      var st = T.statutVehicule(v.id);
      var autre = T.liste().filter(function (t) { return t.vehiculeId === v.id && T.estActive(t); })[0];
      var bloque = ["Vendu", "Livre"].indexOf(st) >= 0 || !!autre;
      var choisi = v.id === etat.vehiculeId;
      var raison = ["Vendu", "Livre"].indexOf(st) >= 0 ? "Déjà vendu ou livré : non sélectionnable." : autre ? "Retenu par la transaction " + autre.reference + "." : st !== "PretPourVente" && st !== "Reserve" ? "Préparation à suivre : « " + ref.statutsVehicule[st].toLowerCase() + " »." : "";
      return '<button type="button" role="radio" aria-checked="' + choisi + '" class="so-vehicule' + (choisi ? " is-active" : "") + '" data-vehicule="' + esc(v.id) + '"' + (bloque ? ' disabled aria-disabled="true"' : "") + ">" +
        '<span class="so-photo"><i class="bi bi-car-front"></i><small>Photo non disponible</small></span>' +
        '<span class="so-vehicule-corps"><span class="so-vehicule-tete"><strong>' + esc(v.annee + " " + v.marque + " " + v.modele) + "</strong>" + UI.pastilleVehicule(st) + "</span>" +
        '<span class="so-vehicule-prix">' + esc(P.argent(v.prixDemande)) + "<small>N° " + esc(v.numeroStock) + "</small></span>" +
        (raison ? '<span class="so-alerte"><i class="bi bi-exclamation-triangle"></i>' + esc(raison) + "</span>" : "") + "</span></button>";
    }).join("");
  }
  function rendreResumeProposition() {
    var z = zone("resume-proposition");
    var v = version();
    if (!v && !(etat.sansSoumission && etat.vehiculeId)) {
      z.innerHTML = '<p class="text-muted mb-0">Choisissez une version de soumission (ou un véhicule pour un brouillon).</p>';
      return;
    }
    if (!v) {
      var inv = S.vehicule(etat.vehiculeId);
      z.innerHTML = '<div class="alert alert-warning small d-flex gap-2"><i class="bi bi-pencil-square"></i><span>Brouillon sans soumission : aucun prix ni condition ne sont retenus. La transaction restera incomplète.</span></div>' +
        '<dl class="pr-liste-def pr-liste-def-compacte">' + ligneDef("Véhicule", esc(S.nomVehicule(inv))) + ligneDef("Prix en inventaire", esc(P.argent(inv.prixDemande)) + '<span class="pr-sous d-block">indicatif, non figé</span>') +
        ligneDef("Statut du véhicule", UI.pastilleVehicule(T.statutVehicule(inv.id))) + "</dl>";
      return;
    }
    var o = v.offre;
    var calc = C ? C.calculer(o, S.parametres) : null;
    var st = T.statutVehicule(v.vehicule.id);
    z.innerHTML = (v.statut !== "Acceptee" ? '<div class="alert alert-warning small d-flex gap-2"><i class="bi bi-pencil-square"></i><span>Version « ' + esc(S.libelleStatut(v.statut).toLowerCase()) + " » : la transaction sera un brouillon incomplet, sans proposition figée.</span></div>" : "") +
      '<dl class="pr-liste-def pr-liste-def-compacte">' +
      ligneDef("Véhicule", esc(S.nomVehicule(v.vehicule)) + '<span class="pr-sous d-block">N° ' + esc(v.vehicule.numeroStock) + "</span>") +
      ligneDef("Prix annoncé", esc(P.argent(o.prixAnnonce))) +
      ligneDef("Remise", o.remise ? esc(P.argent(o.remise)) + (o.remise > ref.seuilRemiseApprobation ? ' <span class="pr-sous">(validation du directeur requise)</span>' : "") : "Aucune") +
      ligneDef("Options", (o.options || []).length ? esc(o.options.map(function (x) { return x.libelle; }).join(", ")) : "Aucune") +
      ligneDef("Mode d'achat envisagé", esc(o.modeAchat === "comptant" ? "Comptant" : "Financement")) +
      ligneDef("Reprise", o.reprise ? esc(o.reprise.vehicule) + (o.reprise.valeurEstimee != null ? " · " + esc(P.argent(o.reprise.valeurEstimee)) : "") : "Aucune") +
      ligneDef("Mise de fonds", o.miseDeFonds ? esc(P.argent(o.miseDeFonds)) : "Aucune") +
      ligneDef("Total estimé", calc ? "<strong>" + esc(UI.montant(calc.totalEstime)) + "</strong>" : "—") +
      ligneDef("Statut actuel du véhicule", UI.pastilleVehicule(st)) +
      "</dl>" +
      (v.statut === "Acceptee" ? '<p class="pr-note mb-0"><i class="bi bi-lock me-1"></i>Un instantané de cette version sera conservé : un changement de prix en inventaire ou une nouvelle version ne modifiera pas la transaction.</p>' : "");
  }

  // ---------- Étape 3 ----------
  function preremplirEtape3() {
    var v = version();
    var o = v ? v.offre : null;
    var opp = P.opportunite(etat.oppId);
    var q = (opp && opp.qualification) || {};
    if (!modeChoisi()) {
      var mode = o ? o.modeAchat : q.modeAchat === "comptant" || q.modeAchat === "financement" ? q.modeAchat : "indetermine";
      var radio = document.getElementById("n-mode-" + mode);
      if (radio) radio.checked = true;
    }
    var avec = !!(o && o.reprise) || q.reprise === "oui";
    var sw = document.getElementById("n-reprise");
    if (!sw.dataset.touche) sw.checked = avec;
    if (!form.elements.description.value) form.elements.description.value = o && o.reprise ? o.reprise.vehicule : q.repriseDetail || "";
    zone("champs-reprise").hidden = !sw.checked;
    zone("aide-depot").textContent = o && o.acompteVerse ? "La soumission indique un acompte de " + P.argent(o.acompteVerse) + " : il sera noté « déclaré », à confirmer par une personne autorisée." : "Montant envisagé uniquement : aucun encaissement.";
  }

  function donnees() {
    var sw = document.getElementById("n-reprise");
    var reprise = sw.checked ? {
      description: form.elements.description.value.trim() || null,
      marque: form.elements.marque.value.trim() || null,
      modele: form.elements.modele.value.trim() || null,
      annee: form.elements.annee.value || null,
      kilometrage: form.elements.kilometrage.value,
    } : null;
    return {
      prospectId: etat.prospectId,
      opportuniteId: etat.oppId,
      soumissionId: etat.sansSoumission ? null : etat.soumissionId,
      versionNumero: etat.sansSoumission ? null : etat.versionNumero,
      vehiculeId: etat.vehiculeId,
      modeAchat: modeChoisi() || "indetermine",
      depot: form.elements.depot.value,
      reprise: reprise,
      aConfirmer: form.elements.aConfirmer.value.trim() || null,
    };
  }

  // ---------- Étape 4 ----------
  function rendreVerification() {
    var x = donnees();
    var refus = T.invalide(x);
    var ap = T.apercu(x);
    var html = "";
    if (refus) html += '<ul class="rv-alertes"><li class="rv-al-critique"><i class="bi bi-exclamation-octagon-fill" aria-hidden="true"></i><span><span class="visually-hidden">Bloquant : </span>' + esc(refus) + "</span></li></ul>";
    if (ap) {
      var a = ap.analyse;
      var completes = [];
      var c = P.contact(x.prospectId);
      if (c) completes.push("Client : " + c.prenom + " " + c.nom);
      if (P.opportunite(x.opportuniteId)) completes.push("Opportunité : " + P.opportunite(x.opportuniteId).titre);
      completes.push("Véhicule : " + T.nomVehicule(ap.transaction));
      if (!ap.transaction.brouillon) completes.push("Proposition acceptée retenue (version " + x.versionNumero + ")");
      if (x.modeAchat !== "indetermine") completes.push("Mode d'achat : " + ref.modesAchat[x.modeAchat]);
      var manquantes = a.elements.filter(function (e) { return e.proprietaire === "vendeur" || e.niveau === "information"; });
      var validations = a.elements.filter(function (e) { return e.proprietaire === "departement" && e.niveau !== "information"; });
      var etapesReq = a.axes.reduce(function (l, axe) {
        return l.concat(axe.etapes.filter(function (e) { return e.etat !== "NonApplicable" && e.etat !== "Terminee" && e.responsable && e.responsable !== "conseiller" && e.responsable !== "client"; }));
      }, []);
      var dispo = a.elements.filter(function (e) { return e.axe === "vehicule" && e.niveau !== "information"; });
      function liste(items, icone, vide) {
        return items.length ? '<ul class="tx-verif">' + items.map(function (t) { return '<li><i class="bi ' + icone + '" aria-hidden="true"></i><span>' + t + "</span></li>"; }).join("") + "</ul>" : '<p class="text-muted small mb-0">' + esc(vide) + "</p>";
      }
      html += '<h3 class="tx-sous-titre">Informations complètes</h3>' + liste(completes.map(esc), "bi-check-circle-fill text-success", "—") +
        '<h3 class="tx-sous-titre">Informations manquantes ou à compléter</h3>' + liste(manquantes.map(function (e) { return esc(e.nature); }), "bi-exclamation-circle", "Aucune information manquante.") +
        '<h3 class="tx-sous-titre">Validations nécessaires</h3>' + liste(validations.map(function (e) { return esc(e.nature) + ' <span class="pr-sous">· ' + esc(e.departementLibelle) + "</span>"; })
          .concat(etapesReq.filter(function (e) { return !validations.some(function (v) { return v.etape === e.cle; }); }).map(function (e) { return esc(e.libelle) + ' <span class="pr-sous">· ' + esc(ref.departements[e.responsable].libelle) + "</span>"; })), "bi-person-badge", "Aucune validation d'un autre département.") +
        '<h3 class="tx-sous-titre">Disponibilité du véhicule</h3>' + liste(dispo.map(function (e) { return esc(e.nature); }), "bi-car-front", "Aucun problème de disponibilité connu.") +
        '<h3 class="tx-sous-titre">Prochaines étapes</h3>' + liste([esc(a.prochaineAction.texte)].concat(a.actionsVendeur.slice(1, 3).map(function (e) { return esc(e.actionVendeur); })), "bi-arrow-right-circle", "—");
    }
    zone("verification").innerHTML = html || '<p class="text-muted mb-0">Complétez les étapes précédentes.</p>';
    rendreRecapitulatif(x, ap);
    racine.querySelector("[data-creer]").disabled = !!refus;
  }
  function rendreRecapitulatif(x, ap) {
    var o = P.opportunite(x.opportuniteId);
    var s = x.soumissionId ? S.soumission(x.soumissionId) : null;
    var m = ap ? T.montants(ap.transaction) : null;
    zone("recapitulatif").innerHTML = '<dl class="pr-liste-def pr-liste-def-compacte">' +
      ligneDef("Client", esc(x.prospectId ? T.nomClient(x) : "—")) +
      ligneDef("Opportunité", esc(o ? o.titre : "—")) +
      ligneDef("Proposition", s ? esc(s.reference + " · version " + x.versionNumero) : "Aucune (brouillon)") +
      ligneDef("Véhicule", ap ? esc(T.nomVehicule(ap.transaction)) : "—") +
      ligneDef("Montant", m ? esc(UI.montant(m.totalEstime)) + (m.figee ? "" : ' <span class="tx-brouillon-tag">non figé</span>') : '<span class="text-muted">À déterminer</span>') +
      ligneDef("Mode d'achat", esc(ref.modesAchat[x.modeAchat])) +
      ligneDef("Reprise", x.reprise ? esc(x.reprise.description || "Oui") : "Aucune") +
      ligneDef("État à la création", ap ? (ap.transaction.brouillon ? '<span class="tx-brouillon-tag">Brouillon incomplet</span>' : "Transaction active") : "—") +
      "</dl>" +
      '<p class="pr-note mb-0 mt-2">Enregistrement local dans cet onglet uniquement : aucune vente, aucun paiement, aucune réservation réelle du véhicule.</p>';
  }

  // ---------- Navigation ----------
  function erreurEtape(n) {
    if (n === 1) {
      if (!etat.prospectId) return "Choisissez un client.";
      if (!etat.oppId) return "Choisissez une opportunité active.";
      var ex = T.enCoursPourOpportunite(etat.oppId);
      if (ex) return "Une transaction est déjà en cours pour cette opportunité (" + ex.reference + ").";
    }
    if (n === 2) {
      if (!etat.sansSoumission && !etat.soumissionId) return "Choisissez une version de soumission, ou « Sans soumission ».";
      if (!etat.vehiculeId) return "Choisissez le véhicule envisagé.";
      var st = T.statutVehicule(etat.vehiculeId);
      if (["Vendu", "Livre"].indexOf(st) >= 0) return "Ce véhicule est déjà vendu ou livré à un autre client.";
      var autre = T.liste().filter(function (t) { return t.vehiculeId === etat.vehiculeId && T.estActive(t); })[0];
      if (autre) return "Ce véhicule est déjà retenu par la transaction " + autre.reference + ".";
    }
    if (n === 3) {
      form.querySelector("[data-erreur-mode]").hidden = !!modeChoisi();
      if (!modeChoisi()) return "Choisissez un mode d'achat.";
      var depot = form.elements.depot;
      depot.classList.toggle("is-invalid", depot.value !== "" && !(Number(depot.value) >= 0 && Number(depot.value) <= 100000));
      var an = form.elements.annee, km = form.elements.kilometrage;
      var avec = document.getElementById("n-reprise").checked;
      an.classList.toggle("is-invalid", avec && an.value !== "" && (Number(an.value) < 1980 || Number(an.value) > new Date().getFullYear() + 1));
      km.classList.toggle("is-invalid", avec && km.value !== "" && (Number(km.value) < 0 || Number(km.value) > 1000000));
      if (form.querySelector(".is-invalid")) return "Corrigez les montants indiqués.";
    }
    return null;
  }
  function allerA(n) {
    if (n < 1 || n > 4) return;
    if (n > etat.etape) {
      for (var k = etat.etape; k < n; k++) {
        var err = erreurEtape(k);
        if (err) { aide.textContent = err; if (k !== etat.etape) { etat.etape = k; rendre(); aide.textContent = err; } return; }
      }
    }
    aide.textContent = "";
    etat.etape = n;
    etat.etapeMax = Math.max(etat.etapeMax, n);
    rendre();
  }
  function rendre() {
    racine.querySelectorAll("[data-etape]").forEach(function (s) { s.hidden = Number(s.dataset.etape) !== etat.etape; });
    racine.querySelectorAll("[data-aller]").forEach(function (b) {
      var n = Number(b.dataset.aller);
      b.disabled = n > etat.etapeMax;
      b.closest("li").classList.toggle("is-active", n === etat.etape);
      b.closest("li").classList.toggle("is-fait", n < etat.etape);
      if (n === etat.etape) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    });
    racine.querySelector("[data-precedent]").hidden = etat.etape === 1;
    racine.querySelector("[data-suivant]").hidden = etat.etape === 4;
    racine.querySelector("[data-creer]").hidden = etat.etape !== 4;
    if (etat.etape === 1) { rendreClients(); rendreOpportunites(); rendreContexte(); }
    if (etat.etape === 2) rendreVersions();
    if (etat.etape === 3) preremplirEtape3();
    if (etat.etape === 4) rendreVerification();
  }
  function reinitialiserApres(n) {
    etat.etapeMax = Math.min(etat.etapeMax, n);
  }

  racine.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b || b.disabled) return;
    if (b.dataset.prospect) {
      if (etat.prospectId !== b.dataset.prospect) {
        etat.prospectId = b.dataset.prospect;
        var actives = P.opportunitesDe(etat.prospectId).filter(P.estActive);
        etat.oppId = actives.length === 1 ? actives[0].id : null;
        etat.soumissionId = etat.versionNumero = etat.vehiculeId = null;
        etat.sansSoumission = false;
        reinitialiserApres(1);
      }
      aide.textContent = "";
      rendre();
    } else if (b.dataset.opp) {
      if (etat.oppId !== b.dataset.opp) {
        etat.oppId = b.dataset.opp;
        etat.soumissionId = etat.versionNumero = etat.vehiculeId = null;
        etat.sansSoumission = false;
        reinitialiserApres(1);
      }
      aide.textContent = "";
      rendre();
    } else if (b.dataset.version) {
      var p = b.dataset.version.split("|");
      etat.soumissionId = p[0];
      etat.versionNumero = Number(p[1]);
      etat.sansSoumission = false;
      etat.vehiculeId = version().vehicule.id;
      form.querySelectorAll('input[name="mode"]').forEach(function (r) { r.checked = false; });
      reinitialiserApres(2);
      aide.textContent = "";
      rendreVersions();
    } else if (b.hasAttribute("data-sans-soumission")) {
      etat.sansSoumission = true;
      etat.soumissionId = etat.versionNumero = null;
      etat.vehiculeId = null;
      reinitialiserApres(2);
      rendreVersions();
    } else if (b.dataset.vehicule) {
      etat.vehiculeId = b.dataset.vehicule;
      aide.textContent = "";
      rendreVehicules();
      rendreResumeProposition();
    } else if (b.dataset.aller) allerA(Number(b.dataset.aller));
    else if (b.hasAttribute("data-suivant")) allerA(etat.etape + 1);
    else if (b.hasAttribute("data-precedent")) allerA(etat.etape - 1);
    else if (b.hasAttribute("data-creer")) creer();
  });
  rechercheClient.addEventListener("input", rendreClients);
  document.getElementById("n-reprise").addEventListener("change", function (e) {
    e.target.dataset.touche = "1";
    zone("champs-reprise").hidden = !e.target.checked;
  });
  form.addEventListener("change", function (e) {
    if (e.target.name === "mode") form.querySelector("[data-erreur-mode]").hidden = true;
  });
  form.addEventListener("submit", function (e) { e.preventDefault(); });

  function creer() {
    for (var n = 1; n <= 3; n++) {
      var err = erreurEtape(n);
      if (err) { if (n !== etat.etape) { etat.etape = n; rendre(); } aide.textContent = err; return; }
    }
    var x = donnees();
    var refus = T.invalide(x);
    if (refus) { aide.textContent = refus; rendreVerification(); return; }
    var t = T.creer(x);
    if (!t) { aide.textContent = "Création impossible."; return; }
    window.location.href = T.urlDetail(t.id);
  }

  // ---------- Préremplissage selon le point de départ ----------
  var ds = racine.dataset;
  var origine = null;
  var dsS = ds.soumission && S.soumission(ds.soumission);
  var dsR = ds.rendezvous && R ? R.rdv(ds.rendezvous) : null;
  if (dsS) {
    etat.prospectId = dsS.prospectId;
    var oS = P.opportunite(dsS.opportuniteId);
    if (oS && P.estActive(oS)) etat.oppId = oS.id;
    var num = Number(ds.version) || null;
    var vs = num ? S.version(dsS, num) : null;
    if (!vs) vs = dsS.versions.slice().reverse().filter(function (v) { return v.statut === "Acceptee"; })[0] || S.versionCourante(dsS);
    etat.soumissionId = dsS.id;
    etat.versionNumero = vs.numero;
    etat.vehiculeId = vs.vehicule.id;
    origine = "Depuis la soumission " + dsS.reference + " (version " + vs.numero + ", " + S.libelleStatut(vs.statut).toLowerCase() + ").";
  } else if (dsR) {
    etat.prospectId = dsR.prospectId;
    var oR = P.opportunite(dsR.opportuniteId);
    if (oR && P.estActive(oR)) etat.oppId = oR.id;
    origine = "Depuis le rendez-vous « " + R.type(dsR.type).libelle + " » du " + R.jourCourt(dsR.debut) + (dsR.resultat ? " (résultat : " + (R.libelle("resultats", dsR.resultat.resultat) || "").toLowerCase() + ")" : "") + ".";
    if (dsR.soumissionId && S.soumission(dsR.soumissionId)) {
      var sR = S.soumission(dsR.soumissionId);
      var vR = sR.versions.slice().reverse().filter(function (v) { return v.statut === "Acceptee"; })[0];
      if (vR) { etat.soumissionId = sR.id; etat.versionNumero = vR.numero; etat.vehiculeId = vR.vehicule.id; }
    }
  } else if (ds.opportunite && P.opportunite(ds.opportunite)) {
    var o = P.opportunite(ds.opportunite);
    etat.prospectId = o.prospectId;
    if (P.estActive(o)) etat.oppId = o.id;
    origine = "Depuis l'opportunité « " + o.titre + " ».";
    var acc = [];
    S.parOpportunite(o.id).forEach(function (s) { s.versions.forEach(function (v) { if (v.statut === "Acceptee") acc.push({ s: s, v: v }); }); });
    if (acc.length === 1) { etat.soumissionId = acc[0].s.id; etat.versionNumero = acc[0].v.numero; etat.vehiculeId = acc[0].v.vehicule.id; }
  } else if (ds.prospect && P.contact(ds.prospect)) {
    etat.prospectId = ds.prospect;
    var act = P.opportunitesDe(etat.prospectId).filter(P.estActive);
    if (act.length === 1) etat.oppId = act[0].id;
  }
  if (origine) {
    var z = zone("origine");
    z.hidden = false;
    z.innerHTML = '<i class="bi bi-box-arrow-in-right me-1" aria-hidden="true"></i>' + esc(origine) + " Les informations connues sont reprises.";
  }
  if (etat.prospectId && etat.oppId && etat.soumissionId) etat.etapeMax = 3;
  rendre();
})();
