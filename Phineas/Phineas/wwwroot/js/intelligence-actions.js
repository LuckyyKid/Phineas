// Centre d'actions (Views/Intelligence/Index.cshtml, maquette 01) : file de travail, surveillance des opportunités,
// actions reportées, historique des actions traitées et continuité commerciale. Chaque action est une ligne
// (UI.ligne, intelligence-composants.js). Aucune recommandation n'est recalculée ici : tout vient du store
// (window.Intelligence).
(function () {
  "use strict";

  var I = window.Intelligence, P = window.Prospects, UI = window.IntelligenceUI;
  var racine = document.getElementById("centre");
  if (!I || !P || !UI || !racine) return;
  var esc = P.esc;
  var f = {
    recherche: document.getElementById("f-recherche"),
    categorie: document.getElementById("f-categorie"),
    priorite: document.getElementById("f-priorite"),
    responsable: document.getElementById("f-responsable"),
    retard: document.getElementById("f-retard"),
  };
  var retour = document.getElementById("c-retour");
  var dans3 = new Date(); dans3.setDate(dans3.getDate() + 3);
  retour.value = P.versChampDate(dans3);
  retour.min = P.aujourdhuiChamp();

  function normaliser(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  function filtresActifs() {
    return !!(f.recherche.value.trim() || f.categorie.value || f.priorite.value || f.responsable.value !== "moi" || f.retard.checked);
  }
  function correspond(a) {
    if (f.responsable.value === "moi" && (a.conseillerId !== P.moiId || a.assignation)) return false;
    if (f.responsable.value === "confiees" && !a.assignation) return false;
    if (f.categorie.value && a.categorie !== f.categorie.value) return false;
    if (f.priorite.value && a.priorite !== f.priorite.value) return false;
    if (f.retard.checked && !(a.echeance && new Date(a.echeance) < new Date())) return false;
    var q = normaliser(f.recherche.value.trim());
    return !q || normaliser([a.client, a.vehicule, a.regleLibelle, a.motif, a.declencheur].join(" ")).indexOf(q) >= 0;
  }
  function lignes(actions) {
    return actions.map(function (a) { return UI.ligne(a); }).join("");
  }

  // ---------- Pagination ----------
  // Au-delà de ACTIONS_PAR_PAGE, chaque liste se découpe en pages : la page reste courte, sans défilement sans fin.
  var ACTIONS_PAR_PAGE = 6;
  // Page affichée de chaque liste, rangée par id de liste (ex. pages.file = 2). Absente = page 1.
  var pages = {};

  // Lignes de la page courante de la liste, suivies de la pagination si la liste dépasse une page.
  function lignesPaginees(idListe, actions) {
    // La liste a pu raccourcir (action traitée, filtre) : on reste sur une page qui existe.
    var page = UI.pageValide(pages[idListe], actions.length, ACTIONS_PAR_PAGE);
    pages[idListe] = page;
    var debut = (page - 1) * ACTIONS_PAR_PAGE;
    var actionsDeLaPage = actions.slice(debut, debut + ACTIONS_PAR_PAGE);
    return lignes(actionsDeLaPage) + UI.htmlPagination(idListe, actions.length, page, ACTIONS_PAR_PAGE);
  }

  function liste(el, actions, vide) {
    document.getElementById(el).innerHTML = actions.length ? lignesPaginees(el, actions) : '<p class="iv-vide-texte">' + esc(vide) + "</p>";
  }

  function rendre() {
    var c = I.compteurs(P.moiId);
    Object.keys(c).forEach(function (k) {
      var el = document.querySelector('[data-compteur="' + k + '"]');
      if (el) el.textContent = String(c[k]);
    });

    // File active, dans l'ordre du store ; la catégorie est rappelée sur chaque ligne.
    var actives = I.actives();
    var visibles = actives.filter(correspond);
    document.getElementById("file").innerHTML = lignesPaginees("file", visibles);
    var vide = !visibles.length;
    document.getElementById("file-vide").hidden = !vide;
    var toutEstTraite = I.actives({ conseiller: P.moiId }).length === 0;
    var titreVide = "Aucune action";
    var texteVide = "Phineas vous signalera la prochaine situation qui demande votre attention.";
    if (toutEstTraite) titreVide = "Toutes les actions sont traitées";
    if (filtresActifs()) {
      titreVide = "Rien à afficher avec ces filtres.";
      texteVide = "Modifiez ou effacez les filtres.";
    }
    document.querySelector("[data-vide-titre]").textContent = titreVide;
    document.querySelector("[data-vide-texte]").textContent = texteVide;
    document.getElementById("resultat").textContent = visibles.length + " action" + (visibles.length > 1 ? "s" : "") + " à traiter";
    racine.querySelector("[data-effacer-filtres]").hidden = !filtresActifs();
    racine.querySelector('[data-champ="nb-file"]').textContent = String(actives.filter(function (a) { return a.conseillerId === P.moiId && !a.assignation; }).length);

    var surv = I.surveillance().filter(function (a) { return a.conseillerId === P.moiId; });
    liste("surveillance", surv, "Aucune opportunité ne stagne selon les règles actuelles.");
    racine.querySelector('[data-champ="nb-surveillance"]').textContent = String(surv.length);
    var rep = I.horsFile("Reportee");
    liste("reportees", rep, "Aucune action reportée.");
    racine.querySelector('[data-champ="nb-reportees"]').textContent = String(rep.length);
    var etat = document.getElementById("f-traitees").value;
    var videTraitees = "Aucune action terminée.";
    if (etat === "Ignoree") videTraitees = "Aucune action ignorée.";
    if (etat === "Obsolete") videTraitees = "Aucune action devenue obsolète.";
    liste("traitees", I.horsFile(etat), videTraitees);
    // Le compteur de l'onglet additionne les trois états, quel que soit celui affiché.
    var nbTraitees = I.horsFile("Terminee").length + I.horsFile("Ignoree").length + I.horsFile("Obsolete").length;
    racine.querySelector('[data-champ="nb-traitees"]').textContent = String(nbTraitees);

    var date = retour.value ? P.depuisChampDate(retour.value) : null;
    if (date) date.setHours(23, 59, 0, 0);
    var couvrir = date ? I.aCouvrirAvant(date) : [];
    var htmlContinuite = "";
    if (date) htmlContinuite += '<p class="iv-intro-panneau"><strong>' + couvrir.length + "</strong> action(s) à couvrir avant votre retour le " + esc(P.dateCourte(date)) + ".</p>";
    htmlContinuite += couvrir.length ? lignesPaginees("continuite", couvrir) : '<p class="iv-vide-texte">Aucune action urgente avant cette date.</p>';
    document.getElementById("continuite").innerHTML = htmlContinuite;
    racine.querySelector('[data-champ="nb-continuite"]').textContent = String(couvrir.length);
    liste("confiees", I.actives().filter(function (a) { return a.assignation; }), "Aucune action confiée.");
  }

  // Un nouveau filtre ou une nouvelle date repart de la première page de la liste concernée.
  function relancerFile() {
    pages.file = 1;
    rendre();
  }
  Object.keys(f).forEach(function (k) { f[k].addEventListener(k === "recherche" ? "input" : "change", relancerFile); });
  document.getElementById("f-traitees").addEventListener("change", function () {
    pages.traitees = 1;
    rendre();
  });
  retour.addEventListener("change", function () {
    pages.continuite = 1;
    rendre();
  });
  racine.querySelector("[data-effacer-filtres]").addEventListener("click", function () {
    f.recherche.value = ""; f.categorie.value = ""; f.priorite.value = ""; f.responsable.value = "moi"; f.retard.checked = false;
    relancerFile();
  });

  // Clic sur un bouton de pagination : change de page, garde le focus sur la page choisie et remonte en haut de la liste.
  racine.addEventListener("click", function (e) {
    var bouton = e.target.closest("[data-aller-page]");
    if (!bouton || bouton.disabled) return;
    var idListe = bouton.dataset.liste;
    pages[idListe] = Number(bouton.dataset.allerPage);
    rendre();
    var zoneListe = document.getElementById(idListe);
    var pageCourante = zoneListe.querySelector('[aria-current="page"]');
    if (pageCourante) pageCourante.focus();
    zoneListe.scrollIntoView({ block: "start", behavior: "smooth" });
  });
  // Les filtres ne concernent que l'onglet « À traiter » : on les masque sur les autres onglets.
  var zoneFiltres = racine.querySelector("[data-filtres]");
  racine.querySelectorAll('[data-bs-toggle="tab"]').forEach(function (onglet) {
    onglet.addEventListener("shown.bs.tab", function () {
      zoneFiltres.hidden = onglet.id !== "onglet-file";
    });
  });

  I.abonner(rendre);
  rendre();
})();
