// Page « Acquisition commerciale » : sources et origines (calculées), liens de provenance fictifs, publications
// déclarées, prospects entrants et prospection personnelle. Les prospects sont créés ou rattachés dans le store Prospects.
(function () {
  "use strict";

  var P = window.Prospects, S = window.Soumissions, OV = window.OutilsVendeur, I = window.Intelligence;
  var racine = document.getElementById("acquisition");
  if (!P || !S || !OV || !racine) return;
  var esc = P.esc, ref = OV.ref;

  function champ(id) { return document.getElementById(id); }
  function zone(n) { return racine.querySelector('[data-zone="' + n + '"]'); }
  function plateforme(cle) { return (ref.plateformesParCle[cle] || {}).libelle || cle; }
  function erreurs(form, e) {
    form.querySelectorAll(".is-invalid").forEach(function (x) { x.classList.remove("is-invalid"); });
    form.querySelectorAll("[data-erreur]").forEach(function (x) { x.textContent = ""; x.style.display = ""; });
    Object.keys(e || {}).forEach(function (k) {
      var c = form.elements[k] || (k === "contact" ? form.elements.courriel : k === "vehicule" ? form.elements.vehiculeId : null);
      if (c) c.classList.add("is-invalid");
      var m = form.querySelector('[data-erreur="' + k + '"]');
      if (m) { m.textContent = e[k]; m.style.display = "block"; }
    });
  }
  function copier(texte, message) {
    try { if (navigator.clipboard) navigator.clipboard.writeText(texte); P.notifier(message); } catch (e) { P.notifier("Copie impossible : sélectionnez le texte manuellement."); }
    racine.dataset.dernierCopie = texte;
  }
  function barre(libelle, n, max) {
    return '<li class="rc-ligne-barre"><span class="rc-lb-libelle">' + esc(libelle) + '</span><span class="rc-lb-piste" aria-hidden="true"><span style="width:' + (max ? Math.round(n / max * 100) : 0) + '%"></span></span><strong>' + n + "</strong></li>";
  }
  function mesContacts() { return P.contacts().filter(function (c) { return c.conseillerId === P.moiId; }); }

  // ---------- Sources et origines ----------
  function rendreSources() {
    var l = mesContacts();
    var parSource = {}, parOrigine = {};
    l.forEach(function (c) {
      var k = c.source || "inconnue"; parSource[k] = (parSource[k] || 0) + 1;
      var o = OV.origine(c.id); parOrigine[o] = (parOrigine[o] || 0) + 1;
    });
    var ks = Object.keys(parSource).sort(function (a, b) { return parSource[b] - parSource[a]; });
    var max = ks.length ? parSource[ks[0]] : 0;
    zone("sources").innerHTML = '<ul class="rc-barres">' + ks.map(function (k) { return barre(P.libelle("sources", k) || (k === "inconnue" ? "Source inconnue" : k), parSource[k], max); }).join("") + "</ul>" +
      '<p class="small text-muted mt-2 mb-0">' + l.length + " prospect(s) dont vous êtes responsable, toutes périodes. Source déclarée dans la fiche ; une source inconnue n'est jamais devinée.</p>";
    var ko = Object.keys(ref.origines);
    var maxo = Math.max.apply(null, ko.map(function (k) { return parOrigine[k] || 0; }));
    zone("origines").innerHTML = '<ul class="rc-barres">' + ko.map(function (k) { return barre(ref.origines[k], parOrigine[k] || 0, maxo); }).join("") + "</ul>" +
      '<p class="small text-muted mt-2 mb-0">Referral Loop : recommandation attribuée (phase 07). Réseau : recommandation sans attribution. Concession : prospects confiés par la direction.</p>';
    var f = champ("f-origine").value;
    champ("provenances-corps").innerHTML = l.filter(function (c) { return !f || OV.origine(c.id) === f; }).map(function (c) {
      var at = OV.attributionDe(c.id);
      var o = at && at.opportuniteId ? P.opportunite(at.opportuniteId) : P.opportunitesDe(c.id)[0];
      var lien = at && at.lienId ? OV.lien(at.lienId) : null, an = at && at.annonceId ? OV.annonce(at.annonceId) : null;
      return '<tr data-prospect="' + esc(c.id) + '"><td data-label="Prospect"><a class="pr-nom" href="' + esc(P.urlFiche(c.id)) + '">' + esc(c.prenom + " " + c.nom) + "</a></td>" +
        '<td data-label="Source déclarée">' + esc(P.libelle("sources", c.source) || "Source inconnue") + (c.sourceDetail ? '<span class="pr-sous d-block">' + esc(c.sourceDetail) + "</span>" : "") + "</td>" +
        '<td data-label="Origine">' + esc(ref.origines[OV.origine(c.id)]) + "</td>" +
        '<td data-label="Provenance établie">' + (at ? esc(ref.methodesAttribution[at.methode]) + (lien ? ' <code class="ov-code">' + esc(lien.reference) + "</code>" : "") + (an ? '<span class="pr-sous d-block">Annonce ' + esc(an.reference) + "</span>" : "") + (at.campagne ? '<span class="pr-sous d-block">Campagne : ' + esc(at.campagne) + "</span>" : "")
          : '<span class="text-muted">Attribution manquante</span>') + "</td>" +
        '<td data-label="Opportunité">' + (o ? esc(o.titre) + '<span class="pr-sous d-block">' + esc(P.libelleEtape(o.etape)) + "</span>" : "—") + "</td></tr>";
    }).join("");
  }

  // ---------- Liens ----------
  function rendreLiens() {
    var sa = champ("lk-annonce"), sv = champ("lk-vehicule"), a0 = sa.value, v0 = sv.value;
    sa.innerHTML = '<option value="">Aucune annonce</option>' + OV.annonces().filter(function (a) { return a.statut !== "Archivee"; }).map(function (a) { return '<option value="' + esc(a.id) + '"' + (a.id === a0 ? " selected" : "") + ">" + esc(a.reference + " — " + a.titre) + "</option>"; }).join("");
    sv.innerHTML = '<option value="">Choisir</option>' + S.inventaire().map(function (v) { return '<option value="' + esc(v.id) + '"' + (v.id === v0 ? " selected" : "") + ">" + esc(S.nomVehicule(v) + " · " + v.numeroStock) + "</option>"; }).join("");
    champ("liens-corps").innerHTML = OV.liens().slice().reverse().map(function (l) {
      var a = l.annonceId ? OV.annonce(l.annonceId) : null, v = S.vehicule(l.vehiculeId);
      var nb = OV.attributions().filter(function (x) { return x.lienId === l.id; }).length;
      return '<tr><td data-label="Référence de suivi"><code class="ov-code">' + esc(l.reference) + '</code> <button type="button" class="btn btn-link btn-sm p-0" data-acq="copier-lien" data-id="' + esc(l.id) + '">Copier</button></td>' +
        '<td data-label="Source et support">' + esc(plateforme(l.source)) + '<span class="pr-sous d-block">' + esc(ref.supports[l.support] || l.support) + "</span></td>" +
        '<td data-label="Campagne">' + esc(l.campagne || "—") + "</td>" +
        '<td data-label="Annonce et véhicule">' + esc(a ? a.reference : "—") + '<span class="pr-sous d-block">' + esc(v ? S.nomVehicule(v) : "") + "</span></td>" +
        '<td data-label="Conseiller">' + esc(l.conseillerId === P.moiId ? "Vous" : P.conseiller(l.conseillerId).nom) + "</td>" +
        '<td data-label="Créé le">' + esc(P.dateCourte(l.dateCreation)) + "</td>" +
        '<td data-label="Prospects rattachés">' + nb + "</td></tr>";
    }).join("");
    champ("en-lien").innerHTML = '<option value="">Aucun lien établi</option>' + OV.liens().map(function (l) { return '<option value="' + esc(l.id) + '">' + esc(l.reference + " — " + plateforme(l.source) + (l.campagne ? " · " + l.campagne : "")) + "</option>"; }).join("");
  }

  // ---------- Publications ----------
  var STATUT_PUB = { APreparer: "rc-recup-a-verifier", Prevue: "rc-recup-attente-evenement", Publiee: "rc-recup-recuperee", Retiree: "rc-recup-aucune" };
  function rendrePublications() {
    var s = champ("pb-annonce"), v0 = s.value;
    s.innerHTML = OV.annonces().filter(function (a) { return ["Approuvee", "PretePublication", "Publiee"].indexOf(a.statut) >= 0; }).map(function (a) { return '<option value="' + esc(a.id) + '"' + (a.id === v0 ? " selected" : "") + ">" + esc(a.reference + " — " + a.titre) + "</option>"; }).join("") || '<option value="">Aucune annonce approuvée</option>';
    champ("publications-corps").innerHTML = OV.publications().map(function (p) {
      var a = OV.annonce(p.annonceId), v = a ? S.vehicule(a.vehiculeId) : null;
      var actif = p.statut === "APreparer" || p.statut === "Prevue";
      return '<tr data-publication="' + esc(p.id) + '"><td data-label="Plateforme">' + esc(plateforme(p.plateforme)) + "</td>" +
        '<td data-label="Annonce">' + esc(a ? a.reference : "—") + '<span class="pr-sous d-block">' + esc(a ? a.titre : "") + "</span></td>" +
        '<td data-label="Véhicule">' + esc(v ? S.nomVehicule(v) : "—") + "</td>" +
        '<td data-label="Statut"><span class="rc-recup ' + (STATUT_PUB[p.statut] || "") + '">' + esc(ref.statutsPublication[p.statut]) + "</span></td>" +
        '<td data-label="Date">' + esc(p.declareeLe ? "déclarée le " + P.dateCourte(p.declareeLe) : p.datePrevue ? "prévue le " + P.dateCourte(p.datePrevue) : "—") + "</td>" +
        '<td data-label="Conseiller">' + esc(p.conseillerId === P.moiId ? "Vous" : P.conseiller(p.conseillerId).nom) + "</td>" +
        '<td data-label="Adresse">' + (p.url ? esc(p.url) : '<span class="text-muted">' + (p.statut === "Publiee" ? "Non connue" : "—") + "</span>") + "</td>" +
        '<td data-label="Actions" class="ia-cellule-actions"><button type="button" class="btn btn-sm btn-ghost" data-acq="copier-texte" data-id="' + esc(p.id) + '">Copier le texte</button>' +
        (p.lienId ? '<button type="button" class="btn btn-sm btn-ghost" data-acq="copier-lien" data-id="' + esc(p.lienId) + '">Copier le lien</button>' : "") +
        (a ? '<a class="btn btn-sm btn-ghost" href="' + esc(ref.urls.annonces + "?annonce=" + encodeURIComponent(a.id)) + '">Prévisualiser</a>' : "") +
        (actif ? '<button type="button" class="btn btn-sm btn-outline-primary" data-acq="declarer" data-id="' + esc(p.id) + '">Déclarer publiée</button><button type="button" class="btn btn-sm btn-ghost" data-acq="retirer" data-id="' + esc(p.id) + '">Archiver</button>' : "") + "</td></tr>";
    }).join("");
  }

  // ---------- Prospection personnelle ----------
  function rendreProspection() {
    var l = OV.prospection();
    zone("prospection").innerHTML = l.length ? l.map(function (p) {
      return '<li data-prospection="' + esc(p.id) + '"><div><strong>' + esc(p.nom) + "</strong>" + (p.entreprise ? " — " + esc(p.entreprise) : "") + ' <span class="badge-soft">' + esc(ref.typesProspection[p.type]) + "</span>" +
        '<span class="d-block small">' + esc([p.vehiculeInteret ? "Intérêt : " + p.vehiculeInteret : null, p.premierContact ? "premier contact le " + P.dateCourte(p.premierContact) : null, p.moyenContactAutorise ? "contact autorisé : " + p.moyenContactAutorise : "moyen de contact autorisé non précisé"].filter(Boolean).join(" · ")) + "</span>" +
        (p.contexte ? '<span class="d-block small text-muted">' + esc(p.contexte) + "</span>" : "") +
        '<span class="d-block small">' + (p.prochaineAction ? "Prochaine action : " + esc(p.prochaineAction) + (p.dateProchaineAction ? " (" + esc(P.dateCourte(p.dateProchaineAction)) + ")" : "") : "Aucune prochaine action") + "</span></div>" +
        (p.opportuniteId ? '<a class="btn btn-sm btn-outline-primary" href="' + esc(P.urlFiche(p.prospectId)) + '">Opportunité créée</a>' : '<button type="button" class="btn btn-sm btn-primary" data-acq="convertir" data-id="' + esc(p.id) + '">Créer l\'opportunité</button>') + "</li>";
    }).join("") : '<li class="text-muted">Aucun contact de prospection.</li>';
  }
  function ouvrirConversion(id) {
    var p = OV.prospection().filter(function (x) { return x.id === id; })[0];
    var noms = p.nom.split(" ");
    var UI = window.IntelligenceUI;
    var corps = '<form id="ov-form-conv" novalidate class="row g-3"><p class="small mb-0">Le contact rejoint vos prospects (source « Prospection ») ; un contact déjà connu est rattaché, jamais dupliqué.</p>' +
      '<div class="col-sm-6"><label class="form-label" for="cv-prenom">Prénom</label><input class="form-control" id="cv-prenom" name="prenom" value="' + esc(noms[0]) + '"></div>' +
      '<div class="col-sm-6"><label class="form-label" for="cv-nom">Nom</label><input class="form-control" id="cv-nom" name="nom" value="' + esc(noms.slice(1).join(" ")) + '"></div>' +
      '<div class="col-sm-6"><label class="form-label" for="cv-courriel">Courriel</label><input class="form-control" id="cv-courriel" name="courriel"></div>' +
      '<div class="col-sm-6"><label class="form-label" for="cv-tel">Téléphone</label><input class="form-control" id="cv-tel" name="telephone"></div><p class="text-danger small mb-0" data-erreur-conv></p></form>';
    var pied = '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Annuler</button><button type="button" class="btn btn-primary" data-acq="valider-conversion" data-id="' + esc(id) + '">Créer l\'opportunité</button>';
    if (UI) UI.fenetre("Créer l'opportunité — " + p.nom, corps, pied);
  }

  // ---------- Performance publicitaire : données non connectées ----------
  function rendrePublicite() {
    zone("publicite").innerHTML = ref.indicateursPublicitaires.map(function (x) {
      return '<div class="rc-chiffre"><span class="rc-chiffre-libelle">' + esc(x.libelle) + '</span><strong class="rc-chiffre-valeur ov-nc">Données non connectées</strong></div>';
    }).join("");
  }

  function rendre() { rendreSources(); rendreLiens(); rendrePublications(); rendreProspection(); }

  champ("f-origine").addEventListener("change", rendreSources);
  champ("lk-annonce").addEventListener("change", function () { var a = OV.annonce(this.value); if (a) champ("lk-vehicule").value = a.vehiculeId; });
  champ("form-lien").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target;
    var r = OV.creerLien({ annonceId: f.elements.annonceId.value || null, vehiculeId: f.elements.vehiculeId.value || null, source: f.elements.source.value, support: f.elements.support.value, campagne: f.elements.campagne.value, conseillerId: f.elements.conseillerId.value });
    erreurs(f, r.erreurs);
    if (r.erreurs) return;
    zone("lien-apercu").innerHTML = '<p class="small mb-1"><strong>Lien de démonstration</strong> (fictif, non publié) :</p><code class="rc-lien" data-lien-apercu>' + esc(r.url) + '</code>' +
      '<ul class="small mt-2 mb-0">' + ["Référence de suivi : " + r.lien.reference, "Source : " + plateforme(r.lien.source), "Support : " + ref.supports[r.lien.support], "Campagne : " + (r.lien.campagne || "—"), "Créé le " + P.dateCourte(r.lien.dateCreation)].map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" +
      '<button type="button" class="btn btn-sm btn-outline-primary mt-2" data-acq="copier-lien" data-id="' + esc(r.lien.id) + '">Copier le lien de démonstration</button>';
    P.notifier("Lien de provenance préparé : il est fictif et ne mène à aucune page publique.");
  });
  champ("form-publication").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target;
    var r = OV.planifierPublication(f.elements.annonceId.value, f.elements.plateforme.value, f.elements.date.value ? P.depuisChampDate(f.elements.date.value) : null);
    P.notifier(r.erreur || "Publication ajoutée au suivi (aucune publication automatique).");
  });
  champ("form-entrant").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target;
    var r = OV.enregistrerEntrant({ prenom: f.elements.prenom.value, nom: f.elements.nom.value, courriel: f.elements.courriel.value, telephone: f.elements.telephone.value, source: f.elements.source.value,
      lienId: f.elements.lienId.value || null, campagne: f.elements.campagne.value });
    erreurs(f, r.erreurs);
    if (r.erreurs) return;
    f.reset();
    P.notifier(r.statut === "cree" ? "Prospect créé avec sa provenance ; prise en charge proposée dans le Centre d'actions." : "Contact déjà connu : demande rattachée, aucun doublon créé.");
  });
  champ("form-prospection").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target, x = {};
    ["nom", "entreprise", "type", "vehiculeInteret", "moyenContactAutorise", "prochaineAction", "contexte"].forEach(function (k) { x[k] = f.elements[k].value; });
    x.premierContact = new Date();
    var r = OV.ajouterProspection(x);
    erreurs(f, r.erreurs);
    if (!r.erreurs) { f.reset(); P.notifier("Contact de prospection ajouté."); }
  });
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-acq]");
    if (!b) return;
    var q = b.dataset.acq, id = b.dataset.id;
    if (q === "copier-lien") copier(OV.urlLien(OV.lien(id)), "Lien de démonstration copié : il ne mène à aucune page publique.");
    else if (q === "copier-texte") { var p = OV.publications().filter(function (x) { return x.id === id; })[0], a = OV.annonce(p.annonceId); copier(a.titre + "\n\n" + a.description + "\n\n" + a.appelAction, "Texte de l'annonce copié. Rien n'a été publié."); }
    else if (q === "declarer") {
      var url = window.prompt("Adresse de la publication (laisser vide si inconnue) :", "");
      if (url === null) return;
      var r = OV.declarerPublication(id, url);
      P.notifier(r.erreur || "Publication déclarée par vous (aucune vérification auprès de la plateforme).");
    } else if (q === "retirer") P.notifier(OV.retirerPublication(id) ? "Publication archivée." : "Action impossible.");
    else if (q === "convertir") ouvrirConversion(id);
    else if (q === "valider-conversion") {
      var f = document.getElementById("ov-form-conv");
      var r2 = OV.convertirProspection(id, { prenom: f.elements.prenom.value, nom: f.elements.nom.value, courriel: f.elements.courriel.value, telephone: f.elements.telephone.value });
      if (r2.erreurs) { f.querySelector("[data-erreur-conv]").textContent = Object.keys(r2.erreurs).map(function (k) { return r2.erreurs[k]; }).join(" "); return; }
      var m = document.getElementById("ia-modale");
      if (m && window.bootstrap) bootstrap.Modal.getOrCreateInstance(m).hide();
      P.notifier(r2.statut === "cree" ? "Opportunité créée (source « Prospection ») ; suivi planifié." : "Contact déjà connu : rattaché, aucun doublon créé.");
    }
  });
  OV.abonner(rendre);
  P.abonner(rendre);
  rendre();
  rendrePublicite();
  var o = racine.dataset.onglet;
  if (o && champ("onglet-" + o) && window.bootstrap) bootstrap.Tab.getOrCreateInstance(champ("onglet-" + o)).show();
})();
