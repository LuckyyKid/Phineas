// Page « Acquisition commerciale » (Views/Outils/Acquisition.cshtml, maquettes 15 à 20) : sources et origines (calculées),
// liens de provenance fictifs, publications déclarées, prospects entrants et prospection personnelle.
// Les prospects sont créés ou rattachés dans le store Prospects. Styles : acquisition-verre.css (préfixe acq-).
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
  // Une ligne de répartition : libellé (et explication grise), nombre, puis barre fine proportionnelle à la plus grande valeur.
  function barre(libelle, n, max, explication) {
    var largeur = max ? Math.round(n / max * 100) : 0;
    return '<li class="acq-barre"><div class="acq-barre-tete"><span class="acq-barre-libelle">' + esc(libelle) +
      (explication ? '<span class="acq-sous">' + esc(explication) + "</span>" : "") + "</span><strong>" + n + "</strong></div>" +
      '<span class="acq-barre-piste" aria-hidden="true"><span style="width:' + largeur + '%"></span></span></li>';
  }

  // Origines : nom court affiché et explication grise (le référentiel donne « Referral Loop (recommandation attribuée) »).
  var ORIGINES_AFFICHAGE = {
    entrant: { nom: "Prospect entrant", explication: "Le client a fait la première démarche" },
    referral: { nom: "Referral Loop", explication: "Recommandation attribuée" },
    concession: { nom: "Attribué par la concession", explication: "Prospect confié par la direction" },
    reseau: { nom: "Réseau du conseiller", explication: "Recommandation sans attribution" },
    prospection: { nom: "Prospection personnelle", explication: "Démarche du conseiller" },
  };
  function origineAffichee(cle) {
    return ORIGINES_AFFICHAGE[cle] || { nom: ref.origines[cle] || cle, explication: "" };
  }

  // Initiales d'un contact pour l'avatar rond (ex. « CB » pour Chloé Bouchard).
  function initiales(c) {
    return ((c.prenom || "").charAt(0) + (c.nom || "").charAt(0)).toUpperCase();
  }

  // Valeur principale, puis précision en petit gris dessous quand il y en a une.
  function valeurEtPrecision(valeur, precision) {
    return esc(valeur) + (precision ? '<span class="acq-sous">' + esc(precision) + "</span>" : "");
  }

  // Date courte suivie de « par vous » ou du nom du conseiller.
  function parQui(conseillerId) {
    if (conseillerId === P.moiId) return "par vous";
    return "par " + P.conseiller(conseillerId).nom;
  }
  // Page affichée de chaque liste (provenances, liens, publications, prospection), par id de liste. Absente = page 1.
  var pages = {};
  var Pagination = window.OutilsPagination;

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
    zone("nb-prospects").innerHTML = "<strong>" + l.length + "</strong> prospect" + (l.length > 1 ? "s" : "");
    zone("sources").innerHTML = '<ul class="acq-barres">' + ks.map(function (k) { return barre(P.libelle("sources", k) || (k === "inconnue" ? "Source inconnue" : k), parSource[k], max); }).join("") + "</ul>";
    // Origines de la plus grande à la plus petite, comme les sources.
    var ko = Object.keys(ref.origines).sort(function (a, b) { return (parOrigine[b] || 0) - (parOrigine[a] || 0); });
    var maxo = Math.max.apply(null, ko.map(function (k) { return parOrigine[k] || 0; }));
    zone("origines").innerHTML = '<ul class="acq-barres">' + ko.map(function (k) {
      var o = origineAffichee(k);
      return barre(o.nom, parOrigine[k] || 0, maxo, o.explication);
    }).join("") + "</ul>";
    var f = champ("f-origine").value;
    var provenances = Pagination.decouper(pages, "provenances-corps", l.filter(function (c) { return !f || OV.origine(c.id) === f; }));
    Pagination.afficherBarre(racine, "provenances-corps", provenances.pagination);
    champ("provenances-corps").innerHTML = provenances.elements.map(function (c) {
      var at = OV.attributionDe(c.id);
      var o = at && at.opportuniteId ? P.opportunite(at.opportuniteId) : P.opportunitesDe(c.id)[0];
      var lien = at && at.lienId ? OV.lien(at.lienId) : null, an = at && at.annonceId ? OV.annonce(at.annonceId) : null;
      var origine = OV.origine(c.id);
      // La précision d'origine n'est utile que quand le nom court la cache (Referral Loop).
      var precisionOrigine = origine === "referral" ? origineAffichee(origine).explication : "";

      var provenance;
      if (at) {
        provenance = esc(ref.methodesAttribution[at.methode]);
        if (lien) provenance += '<span class="acq-ref-ligne"><code class="acq-ref">' + esc(lien.reference) + "</code></span>";
        if (an) provenance += '<span class="acq-sous">Annonce ' + esc(an.reference) + "</span>";
        if (at.campagne) provenance += '<span class="acq-sous">Campagne : ' + esc(at.campagne) + "</span>";
      } else {
        provenance = '<span class="acq-manquante"><span class="acq-point-creux" aria-hidden="true"></span>Attribution manquante</span>';
      }

      var opportunite = o ? valeurEtPrecision(o.titre, P.libelleEtape(o.etape)) : '<span class="acq-attenue">Aucune opportunité</span>';
      return '<tr data-prospect="' + esc(c.id) + '"><td data-label="Prospect"><a class="acq-prospect" href="' + esc(P.urlFiche(c.id)) + '"><span class="acq-avatar" aria-hidden="true">' + esc(initiales(c)) + "</span>" + esc(c.prenom + " " + c.nom) + "</a></td>" +
        '<td data-label="Source déclarée">' + valeurEtPrecision(P.libelle("sources", c.source) || "Source inconnue", c.sourceDetail) + "</td>" +
        '<td data-label="Origine">' + valeurEtPrecision(origineAffichee(origine).nom, precisionOrigine) + "</td>" +
        '<td data-label="Provenance établie">' + provenance + "</td>" +
        '<td data-label="Opportunité">' + opportunite + "</td></tr>";
    }).join("");
  }

  // ---------- Liens ----------
  function rendreLiens() {
    var sa = champ("lk-annonce"), sv = champ("lk-vehicule"), a0 = sa.value, v0 = sv.value;
    sa.innerHTML = '<option value="">Aucune annonce</option>' + OV.annonces().filter(function (a) { return a.statut !== "Archivee"; }).map(function (a) { return '<option value="' + esc(a.id) + '"' + (a.id === a0 ? " selected" : "") + ">" + esc(a.reference + ", " + a.titre) + "</option>"; }).join("");
    sv.innerHTML = '<option value="">Choisir</option>' + S.inventaire().map(function (v) { return '<option value="' + esc(v.id) + '"' + (v.id === v0 ? " selected" : "") + ">" + esc(S.nomVehicule(v) + " · " + v.numeroStock) + "</option>"; }).join("");
    var liens = Pagination.decouper(pages, "liens-corps", OV.liens().slice().reverse());
    Pagination.afficherBarre(racine, "liens-corps", liens.pagination);
    champ("liens-corps").innerHTML = liens.elements.map(function (l) {
      var a = l.annonceId ? OV.annonce(l.annonceId) : null, v = S.vehicule(l.vehiculeId);
      var nb = OV.attributions().filter(function (x) { return x.lienId === l.id; }).length;
      var campagne = l.campagne ? esc(l.campagne) : '<span class="acq-attenue">Aucune</span>';
      var annonce = a ? '<span class="acq-mono">' + esc(a.reference) + "</span>" : '<span class="acq-attenue">Aucune annonce</span>';
      return '<tr><td data-label="Référence de suivi"><span class="acq-ref-copie"><code class="acq-ref">' + esc(l.reference) + '</code><button type="button" class="acq-lien-vert" data-acq="copier-lien" data-id="' + esc(l.id) + '"><i class="bi bi-copy" aria-hidden="true"></i>Copier</button></span></td>' +
        '<td data-label="Source et support">' + valeurEtPrecision(plateforme(l.source), ref.supports[l.support] || l.support) + "</td>" +
        '<td data-label="Campagne">' + campagne + "</td>" +
        '<td data-label="Annonce et véhicule">' + annonce + (v ? '<span class="acq-sous-fonce">' + esc(S.nomVehicule(v)) + "</span>" : "") + "</td>" +
        '<td data-label="Créé le">' + valeurEtPrecision(P.dateCourte(l.dateCreation), parQui(l.conseillerId)) + "</td>" +
        '<td data-label="Prospects" class="acq-droite acq-nombre">' + nb + "</td></tr>";
    }).join("");
    champ("en-lien").innerHTML = '<option value="">Aucun lien établi</option>' + OV.liens().map(function (l) { return '<option value="' + esc(l.id) + '">' + esc(l.reference + ", " + plateforme(l.source) + (l.campagne ? " · " + l.campagne : "")) + "</option>"; }).join("");
  }

  // ---------- Publications ----------
  // Statut d'une publication : point plein vert sapin (publiée), point plein gris (archivée), sinon point creux gris.
  var STATUT_PUB = { APreparer: "acq-statut-attente", Prevue: "acq-statut-attente", Publiee: "acq-statut-publiee", Retiree: "acq-statut-retiree" };

  // Bouton rond blanc à icône verte, avec infobulle.
  function boutonRond(icone, libelle, attributs) {
    return '<button type="button" class="acq-rond" title="' + esc(libelle) + '" aria-label="' + esc(libelle) + '" ' + attributs + '><i class="bi ' + icone + '" aria-hidden="true"></i></button>';
  }
  function rendrePublications() {
    var s = champ("pb-annonce"), v0 = s.value;
    s.innerHTML = OV.annonces().filter(function (a) { return ["Approuvee", "PretePublication", "Publiee"].indexOf(a.statut) >= 0; }).map(function (a) { return '<option value="' + esc(a.id) + '"' + (a.id === v0 ? " selected" : "") + ">" + esc(a.reference + ", " + a.titre) + "</option>"; }).join("") || '<option value="">Aucune annonce approuvée</option>';
    var publications = Pagination.decouper(pages, "publications-corps", OV.publications());
    Pagination.afficherBarre(racine, "publications-corps", publications.pagination);
    champ("publications-corps").innerHTML = publications.elements.map(function (p) {
      var a = OV.annonce(p.annonceId), v = a ? S.vehicule(a.vehiculeId) : null;
      var actif = p.statut === "APreparer" || p.statut === "Prevue";

      // Date sous le statut : « Déclarée le 8 nov. » ou « Le 22 nov. ».
      var date = "";
      if (p.declareeLe) date = "Déclarée le " + P.dateCourte(p.declareeLe);
      else if (p.datePrevue) date = "Le " + P.dateCourte(p.datePrevue);

      var adresse;
      if (p.url) adresse = esc(p.url);
      else if (p.statut === "Publiee") adresse = '<span class="acq-attenue">Non connue</span>';
      else adresse = '<span class="acq-attenue">Aucune</span>';

      // Plateforme, et le conseiller seulement quand ce n'est pas vous.
      var plateformeHtml = esc(plateforme(p.plateforme));
      if (p.conseillerId !== P.moiId) plateformeHtml += '<span class="acq-sous">' + esc(P.conseiller(p.conseillerId).nom) + "</span>";

      var titre = a ? a.titre : "Annonce introuvable";
      var annonce = esc(titre) + (a ? '<span class="acq-sous acq-mono">' + esc(a.reference) + "</span>" : "");
      if (v && a && a.titre.indexOf(v.modele) < 0) annonce += '<span class="acq-sous">' + esc(S.nomVehicule(v)) + "</span>";

      var actions = boutonRond("bi-copy", "Copier le texte de l'annonce", 'data-acq="copier-texte" data-id="' + esc(p.id) + '"');
      if (p.lienId) actions += boutonRond("bi-link-45deg", "Copier le lien de provenance", 'data-acq="copier-lien" data-id="' + esc(p.lienId) + '"');
      else actions += boutonRond("bi-link-45deg", "Aucun lien de provenance pour cette publication", "disabled");
      if (a) actions += '<a class="acq-rond" href="' + esc(ref.urls.annonces + "?annonce=" + encodeURIComponent(a.id)) + '" title="Prévisualiser l\'annonce" aria-label="Prévisualiser l\'annonce"><i class="bi bi-eye" aria-hidden="true"></i></a>';
      if (actif) {
        actions += boutonRond("bi-check2-circle", "Déclarer publiée", 'data-acq="declarer" data-id="' + esc(p.id) + '"');
        actions += boutonRond("bi-archive", "Archiver", 'data-acq="retirer" data-id="' + esc(p.id) + '"');
      }

      return '<tr data-publication="' + esc(p.id) + '"><td data-label="Plateforme" class="acq-fort">' + plateformeHtml + "</td>" +
        '<td data-label="Annonce et véhicule">' + annonce + "</td>" +
        '<td data-label="Statut"><span class="acq-statut ' + (STATUT_PUB[p.statut] || "") + '"><span class="acq-statut-point" aria-hidden="true"></span>' + esc(ref.statutsPublication[p.statut]) + "</span>" +
        (date ? '<span class="acq-sous">' + esc(date) + "</span>" : "") + "</td>" +
        '<td data-label="Adresse">' + adresse + "</td>" +
        '<td data-label="Actions"><div class="acq-ronds">' + actions + "</div></td></tr>";
    }).join("");
  }

  // ---------- Prospection personnelle ----------
  function rendreProspection() {
    var l = OV.prospection();
    zone("nb-prospection").textContent = String(l.length);
    var prospection = Pagination.decouper(pages, "prospection", l);
    Pagination.afficherBarre(racine, "prospection", prospection.pagination);
    zone("prospection").innerHTML = l.length ? prospection.elements.map(htmlContact).join("") : '<li class="acq-attenue">Aucun contact de prospection.</li>';
  }

  // Un contact : nom, entreprise, pastille de source, contexte, puis Intérêt / Contact autorisé / Prochaine action.
  function htmlContact(p) {
    var interet = p.vehiculeInteret || "Non précisé";
    if (p.premierContact) interet += " · premier contact le " + P.dateCourte(p.premierContact);
    var contactAutorise = p.moyenContactAutorise || "Non précisé";
    var prochaine = "Aucune";
    if (p.prochaineAction) prochaine = p.prochaineAction + (p.dateProchaineAction ? ", le " + P.dateCourte(p.dateProchaineAction) : "");

    var bouton = p.opportuniteId
      ? '<a class="acq-btn-blanc" href="' + esc(P.urlFiche(p.prospectId)) + '">Opportunité créée</a>'
      : '<button type="button" class="acq-btn-blanc" data-acq="convertir" data-id="' + esc(p.id) + '">Créer l\'opportunité</button>';

    return '<li class="acq-contact" data-prospection="' + esc(p.id) + '"><div class="acq-contact-corps">' +
      '<p class="acq-contact-tete"><strong>' + esc(p.nom) + "</strong>" + (p.entreprise ? '<span class="acq-entreprise">' + esc(p.entreprise) + "</span>" : "") +
      '<span class="acq-pastille-blanche">' + esc(ref.typesProspection[p.type]) + "</span></p>" +
      (p.contexte ? '<p class="acq-contexte">' + esc(p.contexte) + "</p>" : "") +
      '<dl class="acq-infos"><div><dt>Intérêt</dt><dd>' + esc(interet) + "</dd></div>" +
      "<div><dt>Contact autorisé</dt><dd>" + esc(contactAutorise) + "</dd></div>" +
      "<div><dt>Prochaine action</dt><dd>" + esc(prochaine) + "</dd></div></dl></div>" +
      bouton + "</li>";
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
    if (UI) UI.fenetre("Créer l'opportunité : " + p.nom, corps, pied);
  }

  // ---------- Performance publicitaire : données non connectées ----------
  function rendrePublicite() {
    zone("publicite").innerHTML = ref.indicateursPublicitaires.map(function (x) {
      return '<div class="acq-tuile"><span class="acq-tuile-nom">' + esc(x.libelle) + '</span><span class="acq-tuile-etat"><i class="bi bi-plug" aria-hidden="true"></i>Non connecté</span></div>';
    }).join("");
  }

  function rendre() { rendreSources(); rendreLiens(); rendrePublications(); rendreProspection(); }

  champ("f-origine").addEventListener("change", function () {
    pages["provenances-corps"] = 1;
    rendreSources();
  });
  champ("lk-annonce").addEventListener("change", function () { var a = OV.annonce(this.value); if (a) champ("lk-vehicule").value = a.vehiculeId; });
  champ("form-lien").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target;
    var r = OV.creerLien({ annonceId: f.elements.annonceId.value || null, vehiculeId: f.elements.vehiculeId.value || null, source: f.elements.source.value, support: f.elements.support.value, campagne: f.elements.campagne.value, conseillerId: f.elements.conseillerId.value });
    erreurs(f, r.erreurs);
    if (r.erreurs) return;
    var details = [
      ["Référence de suivi", r.lien.reference],
      ["Source", plateforme(r.lien.source)],
      ["Support", ref.supports[r.lien.support]],
      ["Campagne", r.lien.campagne || "Aucune"],
      ["Créé le", P.dateCourte(r.lien.dateCreation)],
    ];
    zone("lien-apercu").innerHTML = '<p class="acq-apercu-titre">Lien de démonstration <span class="acq-attenue">(fictif, non publié)</span></p><code class="acq-url" data-lien-apercu>' + esc(r.url) + "</code>" +
      '<dl class="acq-apercu-details">' + details.map(function (x) { return "<div><dt>" + esc(x[0]) + "</dt><dd>" + esc(x[1]) + "</dd></div>"; }).join("") + "</dl>" +
      '<button type="button" class="acq-btn-blanc" data-acq="copier-lien" data-id="' + esc(r.lien.id) + '"><i class="bi bi-copy" aria-hidden="true"></i>Copier le lien de démonstration</button>';
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
  Pagination.ecouterClics(racine, pages, rendre);
  OV.abonner(rendre);
  P.abonner(rendre);
  rendre();
  rendrePublicite();
  var o = racine.dataset.onglet;
  if (o && champ("onglet-" + o) && window.bootstrap) bootstrap.Tab.getOrCreateInstance(champ("onglet-" + o)).show();
})();
