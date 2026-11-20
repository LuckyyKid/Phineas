// Page « Studio d'annonces » : bibliothèque filtrable et éditeur guidé (véhicule, objectif, style, édition et validation).
// Les textes viennent de AnnoncesModeles (déterministe) via le store des outils ; la validation est toujours humaine.
(function () {
  "use strict";

  var P = window.Prospects, S = window.Soumissions, OV = window.OutilsVendeur, A = window.AnnoncesModeles;
  var racine = document.getElementById("annonces");
  if (!P || !S || !OV || !A || !racine) return;
  var esc = P.esc, ref = OV.ref;
  var ed = { annonceId: null, etape: 1, vehiculeId: null };
  // Page affichée de chaque liste (bibliothèque, historique d'une annonce), par id de liste. Absente = page 1.
  var pages = {};
  var Pagination = window.OutilsPagination;

  function champ(id) { return document.getElementById(id); }
  function zone(n) { return racine.querySelector('[data-zone="' + n + '"]'); }
  function editeur() { return champ("editeur"); }
  function radio(nom) { var r = editeur().querySelector('[name="' + nom + '"]:checked'); return r ? r.value : null; }
  function pastille(statut) { return '<span class="ov-statut ov-statut-' + esc(statut) + '">' + esc(ref.statutsAnnonce[statut] || statut) + "</span>"; }
  function plateforme(cle) { return (ref.plateformesParCle[cle] || {}).libelle || cle; }
  function erreur(texte) { var e = zone("erreur"); e.hidden = !texte; e.textContent = texte || ""; }

  // ---------- Bibliothèque ----------
  function filtrer(l) {
    var q = String(champ("f-recherche").value || "").toLowerCase(), st = champ("f-statut").value, ca = champ("f-canal").value;
    return l.filter(function (a) {
      var v = S.vehicule(a.vehiculeId);
      if (q && (a.reference + " " + a.titre + " " + (v ? S.nomVehicule(v) : "")).toLowerCase().indexOf(q) < 0) return false;
      if (st && a.statut !== st) return false;
      if (ca && a.canal !== ca) return false;
      return true;
    });
  }
  function rendreListe() {
    var l = filtrer(OV.annonces()).slice().sort(function (a, b) { return new Date(b.dateModification) - new Date(a.dateModification); });
    var morceau = Pagination.decouper(pages, "liste-corps", l);
    Pagination.afficherBarre(racine, "liste-corps", morceau.pagination);
    champ("liste-corps").innerHTML = morceau.elements.map(function (a) {
      var v = OV.vehiculeDe(a);
      var liens = OV.liens().filter(function (k) { return k.annonceId === a.id; });
      var dispo = A.disponibilite(v);
      return '<tr data-annonce="' + esc(a.id) + '"><td data-label="Annonce"><button type="button" class="btn btn-link p-0 pr-nom" data-an="ouvrir" data-id="' + esc(a.id) + '">' + esc(a.reference) + '</button><span class="pr-sous d-block">' + esc(P.conseiller(a.conseillerId).nom) + "</span></td>" +
        '<td data-label="Véhicule">' + esc(v ? S.nomVehicule(v) : "Véhicule introuvable") + (dispo.cle !== "disponible" ? '<span class="pr-sous d-block text-danger">' + esc(dispo.texte) + "</span>" : "") + "</td>" +
        '<td data-label="Titre et aperçu"><strong>' + esc(a.titre) + '</strong><span class="pr-sous d-block">' + esc(a.description.slice(0, 90)) + (a.description.length > 90 ? "…" : "") + "</span></td>" +
        '<td data-label="Canal">' + esc(plateforme(a.canal)) + "</td>" +
        '<td data-label="Créée / modifiée">' + esc(P.dateCourte(a.dateCreation)) + '<span class="pr-sous d-block">modifiée ' + esc(P.relatif(a.dateModification)) + "</span></td>" +
        '<td data-label="Statut">' + pastille(a.statut) + (a.valideePar ? '<span class="pr-sous d-block">validée par ' + esc(a.valideePar) + "</span>" : "") + "</td>" +
        '<td data-label="Provenance">' + (liens.length ? liens.map(function (k) { return '<code class="ov-code">' + esc(k.reference) + "</code>"; }).join(" ") : '<span class="text-muted">Aucun lien</span>') + "</td></tr>";
    }).join("");
    champ("etat-vide").hidden = l.length > 0;
    racine.querySelector(".ov-table").hidden = !l.length;
    champ("resultat").textContent = l.length + " annonce(s)";
    racine.querySelector(".pr-effacer").hidden = !(champ("f-recherche").value || champ("f-statut").value || champ("f-canal").value);
  }

  // ---------- Éditeur ----------
  var ETAPES = ["Véhicule", "Objectif", "Style", "Édition et validation"];
  function afficherEtape(n) {
    ed.etape = n;
    editeur().querySelectorAll("[data-etape]").forEach(function (x) { x.hidden = x.dataset.etape !== String(n); });
    zone("etapes").innerHTML = ETAPES.map(function (e, i) { return '<li class="' + (i + 1 === n ? "is-active" : i + 1 < n ? "is-fait" : "") + '"' + (i + 1 === n ? ' aria-current="step"' : "") + ">" + (i + 1) + ". " + esc(e) + "</li>"; }).join("");
    // « d-none » : l'attribut hidden ne l'emporte pas sur la classe Bootstrap d-flex.
    zone("navigation").classList.toggle("d-none", n === 4);
    erreur(null);
    if (n === 1) rendreFicheVehicule();
    if (n === 4) rendreEdition();
  }
  function remplirVehicules(choisi) {
    champ("ed-vehicule").innerHTML = '<option value="">Choisir un véhicule</option>' + S.inventaire().map(function (v) {
      var x = OV.vehiculeDe({ vehiculeId: v.id });
      var d = A.disponibilite(x);
      return '<option value="' + esc(v.id) + '"' + (d.ok ? "" : " disabled") + (v.id === choisi ? " selected" : "") + ">" + esc(S.nomVehicule(v) + " · " + v.numeroStock + (d.ok ? "" : " — vendu ou livré")) + "</option>";
    }).join("");
  }
  function inventaire(v) {
    var c = A.champsInventaire(v);
    return c.connus.map(function (x) { return "<div><dt>" + esc(x.libelle) + '</dt><dd>' + esc(x.valeur) + ' <span class="ov-source">Inventaire</span></dd></div>'; }).join("") +
      "<div><dt>Équipements</dt><dd>" + (c.equipements.length ? esc(c.equipements.join(", ")) + ' <span class="ov-source">Inventaire</span>' : '<span class="text-muted">Non indiqués</span>') + "</dd></div>" +
      (c.manquants.length ? '<div><dt>Absent de la fiche</dt><dd class="ov-manquant">' + esc(c.manquants.join(", ")) + "</dd></div>" : "");
  }
  function rendreFicheVehicule() {
    var v = ed.vehiculeId ? OV.vehiculeDe({ vehiculeId: ed.vehiculeId }) : null;
    zone("fiche-vehicule").innerHTML = v ? '<dl class="ov-inventaire">' + inventaire(v) + "</dl><p class=\"small " + (A.disponibilite(v).cle === "disponible" ? "text-muted" : "text-warning-emphasis") + '">' + esc(A.disponibilite(v).texte) + "</p>" +
      '<p class="small text-muted mb-0">L\'inventaire n\'est jamais modifié par le studio.</p>' : "";
  }
  function annonce() { return ed.annonceId ? OV.annonce(ed.annonceId) : null; }
  function apercu(a, v) {
    return '<article class="ov-apercu"><header><span class="ov-apercu-canal">' + esc(plateforme(a.canal)) + "</span>" + pastille(a.statut) + "</header>" +
      '<div class="ov-photo" role="img" aria-label="Aucune photo"><i class="bi bi-image" aria-hidden="true"></i><span>Aucune photo dans l\'inventaire de démonstration</span></div>' +
      "<h3>" + esc(a.titre) + '</h3><p class="ov-prix">' + esc(new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(v.prixDemande)) + ' <span class="pr-sous">prix affiché en inventaire</span></p>' +
      "<p>" + esc(a.description) + "</p>" + (a.pointsForts.length ? "<ul>" + a.pointsForts.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") +
      '<p class="ov-appel">' + esc(a.appelAction) + "</p><footer>" + esc(ref.concession || "Concession de démonstration") + " · " + esc(a.reference) + " · stock " + esc(v.numeroStock) + "</footer></article>";
  }
  function rendreVerifications(a) {
    var x = OV.verifications(a);
    var l = x.mentions.map(function (m) { return '<li class="is-alerte">« ' + esc(m.extrait) + " » — " + esc(m.raison) + "</li>"; })
      .concat(x.coherence.map(function (c) { return '<li class="is-alerte">' + esc(c) + "</li>"; }))
      .concat(x.disponibilite.cle !== "disponible" ? ['<li class="is-alerte">' + esc(x.disponibilite.texte) + "</li>"] : [])
      .concat(x.champs ? x.champs.manquants.map(function (m) { return "<li>" + esc(m) + " : absent de la fiche, ne pas l'affirmer.</li>"; }) : []);
    zone("verifier").innerHTML = l.join("") || "<li>Aucune mention à vérifier détectée.</li>";
  }
  function rendreEdition() {
    var a = annonce();
    if (!a) return;
    var v = OV.vehiculeDe(a);
    if (document.activeElement !== champ("ed-titre")) champ("ed-titre").value = a.titre;
    if (document.activeElement !== champ("ed-description")) champ("ed-description").value = a.description;
    if (document.activeElement !== champ("ed-points")) champ("ed-points").value = (a.pointsForts || []).join("\n");
    if (document.activeElement !== champ("ed-appel")) champ("ed-appel").value = a.appelAction;
    var verrou = a.statut === "Publiee" || a.statut === "Archivee";
    ["ed-titre", "ed-description", "ed-points", "ed-appel"].forEach(function (id) { champ(id).disabled = verrou; });
    zone("titre-editeur").textContent = a.reference + " — " + (v ? S.nomVehicule(v) : "");
    zone("inventaire").innerHTML = v ? inventaire(v) : "";
    rendreVerifications(a);
    zone("apercu").innerHTML = v ? apercu(a, v) : "";
    rendreVariantes(a);
    var tr = OV.transitions(a.statut);
    zone("validation").innerHTML = '<p class="mb-2">Statut : ' + pastille(a.statut) + (a.valideePar ? " — validée par " + esc(a.valideePar) + " le " + esc(P.dateCourte(a.valideeLe)) : "") + "</p>" +
      (tr.indexOf("Approuvee") >= 0 ? '<div class="form-check mb-2"><input class="form-check-input" type="checkbox" id="ed-relu" /><label class="form-check-label" for="ed-relu">J\'ai relu le texte et vérifié chaque information auprès de la fiche du véhicule.</label></div>' : "") +
      '<div class="d-flex flex-wrap gap-2">' + tr.map(function (s) {
        var lib = { EnRevision: "Soumettre en révision", Approuvee: "Approuver (validation humaine)", Brouillon: a.statut === "Archivee" ? "Restaurer en brouillon" : "Renvoyer en brouillon", PretePublication: "Marquer prête à publier", Archivee: "Archiver" }[s] || s;
        return '<button type="button" class="btn btn-sm ' + (s === "Approuvee" ? "btn-success" : s === "Archivee" ? "btn-outline-danger" : "btn-outline-primary") + '" data-an="statut" data-statut="' + esc(s) + '">' + esc(lib) + "</button>";
      }).join("") + (["Approuvee", "PretePublication", "Publiee"].indexOf(a.statut) >= 0 ? '<a class="btn btn-sm btn-ghost" href="' + esc(ref.urls.acquisition + "?onglet=publications") + '">Suivre la publication</a>' : "") + "</div>" +
      '<p class="form-text mb-0">Aucune approbation automatique. « Publiée » ne s\'obtient qu\'en déclarant une publication faite hors Phineas.</p>';
    var historique = Pagination.decouper(pages, "historique", (a.historique || []).slice().reverse());
    Pagination.afficherBarre(racine, "historique", historique.pagination);
    zone("historique").innerHTML = historique.elements.map(function (h) { return '<li><time datetime="' + esc(h.date) + '">' + esc(P.dateComplete(h.date)) + "</time><span>" + esc(h.texte) + ' <span class="pr-sous">— ' + esc(h.auteur) + "</span></span></li>"; }).join("");
  }
  function rendreVariantes(a) {
    if (!a.variantes || !a.variantes.length) { zone("variantes").innerHTML = ""; return; }
    var cmp = A.comparer(a.variantes);
    var libs = {};
    ref.variantesAnnonce.forEach(function (x) { libs[x.cle] = x; });
    zone("variantes").innerHTML = '<h2 class="ia-sous-titre">Variantes rédactionnelles (modèles déterministes — performance non connue)</h2><div class="ov-grille-variantes">' + a.variantes.map(function (x, i) {
      return '<article class="ov-variante' + (a.varianteRetenue === x.cle ? " is-retenue" : "") + '" data-variante="' + esc(x.cle) + '"><h3>' + esc((libs[x.cle] || {}).libelle || x.cle) + '</h3><p class="pr-sous">' + esc((libs[x.cle] || {}).description || "") + "</p>" +
        "<p><strong>" + esc(x.titre) + "</strong></p><p>" + esc(x.description) + '</p><p class="pr-sous">' + x.description.length + " caractères · propre à cette variante : " + esc(cmp.differences[i].propres.slice(0, 6).join(", ") || "—") + "</p>" +
        '<p class="small mb-2">État : ' + (a.varianteRetenue === x.cle ? "retenue — " : "non retenue — ") + esc(ref.statutsAnnonce[a.statut]) + "</p>" +
        (a.statut === "Publiee" || a.statut === "Archivee" ? "" : '<button type="button" class="btn btn-sm btn-outline-primary" data-an="retenir" data-cle="' + esc(x.cle) + '">Retenir cette variante</button>') + "</article>";
    }).join("") + '</div><p class="small text-muted">Informations communes aux trois versions : ' + esc(cmp.communs.slice(0, 12).join(", ") || "—") + ".</p>";
  }
  function ouvrir(id) {
    pages.historique = 1;
    ed = { annonceId: id, etape: 4, vehiculeId: (OV.annonce(id) || {}).vehiculeId };
    editeur().hidden = false;
    afficherEtape(4);
    if (editeur().scrollIntoView) editeur().scrollIntoView({ block: "start" });
  }
  function nouvelle(vehiculeId) {
    ed = { annonceId: null, etape: 1, vehiculeId: vehiculeId || null };
    editeur().hidden = false;
    zone("titre-editeur").textContent = "Nouvelle annonce";
    remplirVehicules(ed.vehiculeId);
    editeur().querySelectorAll('[name="objectif"], [name="style"]').forEach(function (r) { r.checked = false; });
    afficherEtape(1);
  }
  function suivant() {
    if (ed.etape === 1) {
      ed.vehiculeId = champ("ed-vehicule").value || null;
      if (!ed.vehiculeId) return erreur("Choisissez un véhicule disponible.");
      if (!A.disponibilite(OV.vehiculeDe({ vehiculeId: ed.vehiculeId })).ok) return erreur(A.disponibilite(OV.vehiculeDe({ vehiculeId: ed.vehiculeId })).texte);
      return afficherEtape(2);
    }
    if (ed.etape === 2) return radio("objectif") ? afficherEtape(3) : erreur("Choisissez l'objectif de l'annonce.");
    if (ed.etape === 3) {
      if (!radio("style")) return erreur("Choisissez un style rédactionnel.");
      var r = OV.creerAnnonce({ vehiculeId: ed.vehiculeId, objectif: radio("objectif"), style: radio("style"), canal: champ("ed-canal").value });
      if (r.erreur) return erreur(r.erreur);
      ed.annonceId = r.annonce.id;
      afficherEtape(4);
      if (r.avertissements.length) P.notifier(r.avertissements.join(" "));
      else P.notifier("Brouillon préparé à partir de la fiche d'inventaire : relisez-le avant toute validation.");
    }
  }
  function lireEdition() {
    return { titre: champ("ed-titre").value.trim(), description: champ("ed-description").value.trim(), appelAction: champ("ed-appel").value.trim(),
      pointsForts: champ("ed-points").value.split("\n").map(function (x) { return x.trim(); }).filter(Boolean) };
  }

  racine.addEventListener("click", function (e) {
    var b = e.target.closest("[data-an], [data-effacer-filtres]");
    if (!b) return;
    if (b.hasAttribute("data-effacer-filtres")) { champ("f-recherche").value = ""; champ("f-statut").value = ""; champ("f-canal").value = ""; return relancerListe(); }
    var q = b.dataset.an;
    if (q === "ouvrir") ouvrir(b.dataset.id);
    else if (q === "fermer") { editeur().hidden = true; ed.annonceId = null; }
    else if (q === "suivant") suivant();
    else if (q === "precedent") afficherEtape(Math.max(1, ed.etape - 1));
    else if (q === "enregistrer") { P.notifier(OV.modifierAnnonce(ed.annonceId, lireEdition()) ? "Annonce enregistrée (locale)." : "Annonce non modifiable dans cet état."); }
    else if (q === "variantes") { OV.modifierAnnonce(ed.annonceId, lireEdition()); OV.genererVariantes(ed.annonceId); P.notifier("Trois variantes préparées par modèles déterministes : aucune performance n'est connue."); }
    else if (q === "retenir") { OV.retenirVariante(ed.annonceId, b.dataset.cle); P.notifier("Variante retenue : le texte de l'annonce est remplacé (modifiable)."); }
    else if (q === "statut") {
      // La case « relu » est lue AVANT l'enregistrement du texte, qui redessine la zone de validation.
      var relu = champ("ed-relu") && champ("ed-relu").checked;
      if (["Brouillon", "EnRevision", "Approuvee"].indexOf(OV.annonce(ed.annonceId).statut) >= 0) OV.modifierAnnonce(ed.annonceId, lireEdition());
      var r = OV.changerStatut(ed.annonceId, b.dataset.statut, { relu: relu });
      if (r.erreur) erreur(r.erreur); else { erreur(null); P.notifier("Statut : " + ref.statutsAnnonce[b.dataset.statut] + "."); }
    }
  });
  document.querySelector('[data-an="nouvelle"]').addEventListener("click", function () { nouvelle(null); });
  champ("ed-vehicule").addEventListener("change", function () { ed.vehiculeId = this.value || null; rendreFicheVehicule(); });
  function relancerListe() {
    pages["liste-corps"] = 1;
    rendreListe();
  }
  ["f-recherche", "f-statut", "f-canal"].forEach(function (id) { champ(id).addEventListener(id === "f-recherche" ? "input" : "change", relancerListe); });
  function rendre() {
    rendreListe();
    if (!editeur().hidden && ed.etape === 4) rendreEdition();
  }
  Pagination.ecouterClics(racine, pages, rendre);
  OV.abonner(rendre);
  rendre();
  // Ouverture ciblée : ?annonce=… ou ?vehicule=… (depuis l'assistant ou l'inventaire).
  if (racine.dataset.annonce && OV.annonce(racine.dataset.annonce)) ouvrir(racine.dataset.annonce);
  else if (racine.dataset.vehicule && S.vehicule(racine.dataset.vehicule)) nouvelle(racine.dataset.vehicule);
  window.AnnoncesPage = { ouvrir: ouvrir, nouvelle: nouvelle, etat: function () { return ed; } };
})();
