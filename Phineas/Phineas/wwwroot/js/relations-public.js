// Prévisualisation du parcours d'un prospect recommandé (démonstration, distincte de l'espace conseiller).
// Cette page ne lit AUCUNE donnée interne : seulement le profil public du conseiller. La demande est déposée dans une
// « boîte » de l'onglet ; l'espace conseiller la traite (attribution, doublons) et ne renvoie rien à cette page.
(function () {
  "use strict";

  var source = document.getElementById("profil-public");
  var Regles = window.RelationsRegles;
  if (!source || !Regles) return;
  var profil = JSON.parse(source.textContent);
  var CLE_BOITE = "phineas.salesos.relations.v1:demandes-recues";
  var CLE_PROFIL = "phineas.salesos.relations.v1:profil-public";
  var params = new URLSearchParams(window.location.search);
  var racine = document.getElementById("parcours");

  // Modifications locales du profil (présentation, coordonnées autorisées) faites dans l'espace conseiller.
  try {
    var local = JSON.parse(window.sessionStorage.getItem(CLE_PROFIL) || "null");
    if (local) ["presentation", "telephone", "courriel", "langues"].forEach(function (k) { if (k in local) profil[k] = local[k]; });
  } catch (e) {}

  function esc(v) {
    return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function remplir(nom, html) {
    racine.querySelectorAll('[data-pub="' + nom + '"]').forEach(function (x) { x.innerHTML = html; });
  }
  remplir("nom", esc(profil.nom));
  remplir("role", esc(profil.role));
  remplir("concession", esc(profil.concession));
  remplir("presentation", esc(profil.presentation || ""));
  remplir("initiales", esc(String(profil.nom || "").split(" ").filter(Boolean).map(function (m) { return m.charAt(0).toUpperCase(); }).join("").slice(0, 2)));
  remplir("contacts", [profil.telephone ? '<li><i class="bi bi-telephone me-1" aria-hidden="true"></i>' + esc(profil.telephone) + "</li>" : "",
    profil.courriel ? '<li><i class="bi bi-envelope me-1" aria-hidden="true"></i>' + esc(profil.courriel) + "</li>" : "",
    (profil.langues || []).length ? '<li><i class="bi bi-translate me-1" aria-hidden="true"></i>' + esc(profil.langues.join(", ")) + "</li>" : ""].join(""));

  function etape(n) {
    racine.querySelectorAll("[data-etape]").forEach(function (s) { s.hidden = s.dataset.etape !== String(n); });
  }
  racine.addEventListener("click", function (e) {
    var b = e.target.closest("[data-pub-action]");
    if (!b) return;
    if (b.dataset.pubAction === "retour") return etape(1);
    document.getElementById("pub-form").elements.motif.value = b.dataset.pubAction;
    etape(2);
  });
  document.getElementById("pub-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target;
    var d = {
      prenom: f.elements.prenom.value, nom: f.elements.nom.value, courriel: f.elements.courriel.value, telephone: f.elements.telephone.value, contactPrefere: f.elements.contactPrefere.value,
      vehicule: f.elements.vehicule.value, budget: f.elements.budget.value, horizon: f.elements.horizon.value,
      commentaire: (f.elements.motif.value === "rendezvous" ? "Souhaite un rendez-vous. " : "") + f.elements.commentaire.value,
      consentementContact: f.elements.consentementContact.checked, consentementInformation: f.elements.consentementInformation.checked,
      code: params.get("code") || profil.code, parrainage: params.get("p") || null, envoyeeLe: new Date().toISOString(),
    };
    var erreurs = Regles.validerDemandePublique(d);
    f.querySelectorAll(".is-invalid").forEach(function (x) { x.classList.remove("is-invalid"); });
    f.querySelectorAll("[data-erreur]").forEach(function (x) { x.textContent = ""; x.style.display = ""; });
    Object.keys(erreurs).forEach(function (k) {
      var c = f.elements[k] || (k === "contact" ? f.elements.courriel : null);
      if (c) c.classList.add("is-invalid");
      var m = f.querySelector('[data-erreur="' + k + '"]');
      if (m) { m.textContent = erreurs[k]; m.style.display = "block"; }
    });
    if (Object.keys(erreurs).length) return;
    try {
      var boite = JSON.parse(window.sessionStorage.getItem(CLE_BOITE) || "[]");
      boite.push(d);
      window.sessionStorage.setItem(CLE_BOITE, JSON.stringify(boite));
    } catch (err) {}
    // Même message dans tous les cas : la page ne révèle jamais si la personne est déjà connue.
    f.reset();
    etape(3);
  });
})();
