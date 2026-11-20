// Centre d'actions : file de travail regroupée par catégorie, surveillance des opportunités, actions reportées,
// historique des actions traitées et continuité commerciale. Aucune recommandation n'est recalculée ici :
// tout vient du store (window.Intelligence).
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
  function liste(el, actions, vide) {
    document.getElementById(el).innerHTML = actions.length ? actions.map(function (a) { return UI.carte(a); }).join("")
      : '<div class="sv-empty"><i class="bi bi-check2-circle"></i><span>' + esc(vide) + "</span></div>";
  }

  function rendre() {
    var c = I.compteurs(P.moiId);
    Object.keys(c).forEach(function (k) {
      var el = document.querySelector('[data-compteur="' + k + '"]');
      if (el) el.textContent = String(c[k]);
    });

    // File active, regroupée par catégorie (les situations liées restent ensemble).
    var actives = I.actives();
    var visibles = actives.filter(correspond);
    var html = "";
    Object.keys(UI.categories).forEach(function (cle) {
      var l = visibles.filter(function (a) { return a.categorie === cle; });
      if (!l.length) return;
      var cat = UI.categories[cle];
      html += '<section class="ia-groupe" aria-labelledby="g-' + esc(cle) + '"><h2 class="ia-groupe-titre" id="g-' + esc(cle) + '"><i class="bi ' + esc(cat.icone) + '" aria-hidden="true"></i>' + esc(cat.libelle) +
        ' <span class="pr-compte">' + l.length + "</span></h2>" + l.map(function (a) { return UI.carte(a); }).join("") + "</section>";
    });
    document.getElementById("file").innerHTML = html;
    var vide = !visibles.length;
    document.getElementById("file-vide").hidden = !vide;
    var tout = I.actives({ conseiller: P.moiId }).length === 0;
    document.querySelector("[data-vide-titre]").textContent = filtresActifs() ? "Aucune action pour ces filtres" : tout ? "Toutes les actions sont traitées" : "Aucune action";
    document.querySelector("[data-vide-texte]").textContent = filtresActifs() ? "Modifiez ou effacez les filtres." : "Phineas vous signalera la prochaine situation qui demande votre attention.";
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
    liste("traitees", I.horsFile(etat), etat === "Obsolete" ? "Aucune action devenue obsolète." : etat === "Ignoree" ? "Aucune action ignorée." : "Aucune action terminée.");

    var date = retour.value ? P.depuisChampDate(retour.value) : null;
    if (date) date.setHours(23, 59, 0, 0);
    var couvrir = date ? I.aCouvrirAvant(date) : [];
    document.getElementById("continuite").innerHTML = (date ? '<p class="small mb-2"><strong>' + couvrir.length + "</strong> action(s) à couvrir avant votre retour le " + esc(P.dateCourte(date)) + ".</p>" : "") +
      (couvrir.length ? couvrir.map(function (a) { return UI.carte(a, { compacte: true }); }).join("") : '<div class="sv-empty"><span>Aucune action urgente avant cette date.</span></div>');
    liste("confiees", I.actives().filter(function (a) { return a.assignation; }), "Aucune action confiée.");
  }

  Object.keys(f).forEach(function (k) { f[k].addEventListener(k === "recherche" ? "input" : "change", rendre); });
  document.getElementById("f-traitees").addEventListener("change", rendre);
  retour.addEventListener("change", rendre);
  racine.querySelector("[data-effacer-filtres]").addEventListener("click", function () {
    f.recherche.value = ""; f.categorie.value = ""; f.priorite.value = ""; f.responsable.value = "moi"; f.retard.checked = false;
    rendre();
  });
  I.abonner(rendre);
  rendre();
})();
