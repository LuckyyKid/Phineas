// Page « Assistant vendeur » : sélection du contexte, modes métier, fil de réponses simulées, historique local.
// Les réponses viennent de SalesCoachService (fournisseur de démonstration, aucune IA) ; cette page ne calcule rien.
(function () {
  "use strict";

  var P = window.Prospects, S = window.Soumissions, R = window.RendezVous, T = window.Transactions, OV = window.OutilsVendeur, SVC = window.SalesCoachService;
  var racine = document.getElementById("assistant");
  if (!P || !S || !OV || !SVC || !racine) return;
  var esc = P.esc, ref = OV.ref;
  var mode = null;
  var TYPES = { verifie: { libelle: "Vérifié dans le dossier", icone: "bi-patch-check" }, "a-verifier": { libelle: "À vérifier", icone: "bi-question-circle" }, suggestion: { libelle: "Suggestion à valider", icone: "bi-lightbulb" } };

  function champ(id) { return document.getElementById(id); }
  function zone(n) { return racine.querySelector('[data-zone="' + n + '"]'); }
  function moi(c) { return c && c.conseillerId === P.moiId; }

  // ---------- Contexte ----------
  function choix(type) {
    if (type === "prospect") return P.contacts().filter(moi).map(function (c) { return [c.id, c.prenom + " " + c.nom]; });
    if (type === "opportunite") return P.toutesOpportunites().filter(function (o) { return P.estActive(o) && moi(P.contact(o.prospectId)); }).map(function (o) { var c = P.contact(o.prospectId); return [o.id, c.prenom + " " + c.nom + " — " + o.titre]; });
    if (type === "vehicule") return S.inventaire().map(function (v) { return [v.id, S.nomVehicule(v) + " · " + v.numeroStock]; });
    if (type === "soumission") return S.liste().filter(function (s) { return s.conseillerId === P.moiId; }).map(function (s) { var c = P.contact(s.prospectId); return [s.id, s.reference + " — " + (c ? c.prenom + " " + c.nom : "")]; });
    if (type === "rendezvous" && R) return R.liste().filter(function (r) { return r.conseillerId === P.moiId && R.estActif(r); }).sort(function (a, b) { return new Date(a.debut) - new Date(b.debut); })
      .map(function (r) { var c = P.contact(r.prospectId); return [r.id, R.type(r.type).libelle + " · " + R.creneauTexte(r) + " — " + (c ? c.prenom + " " + c.nom : "")]; });
    if (type === "transaction" && T) return T.liste().filter(function (t) { return t.conseillerId === P.moiId; }).map(function (t) { return [t.id, t.reference + " — " + T.nomClient(t)]; });
    return [];
  }
  function contexte() {
    var t = champ("ctx-type").value;
    return { type: t, id: t === "aucun" ? null : champ("ctx-id").value || null };
  }
  function remplirChoix(choisi) {
    var t = champ("ctx-type").value, l = choix(t), s = champ("ctx-id");
    s.disabled = t === "aucun";
    s.innerHTML = t === "aucun" ? '<option value="">—</option>' : '<option value="">Choisir…</option>' + l.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (x[0] === choisi ? " selected" : "") + ">" + esc(x[1]) + "</option>"; }).join("");
    rendreDisposition();
  }
  // Ce que l'assistant « voit » : références du dossier et contexte minimal (sans coordonnées).
  function rendreDisposition() {
    var r = SVC.construire({ mode: "procedure", contexte: contexte() });
    var c = r.contexteTransmis;
    zone("mis-a-disposition").innerHTML = (r.donnees.length ? r.donnees.map(function (d) { return '<li><a href="' + esc(d.url) + '">' + esc(d.libelle) + "</a></li>"; }).join("") : "<li>Aucun dossier : procédures et connaissances générales seulement.</li>") +
      '<li class="pr-sous">Jamais transmis : ' + esc(c.exclus.join(", ").toLowerCase()) + ".</li>";
  }

  // ---------- Réponses ----------
  function rendreSection(s) {
    var t = TYPES[s.type] || TYPES.suggestion;
    return '<section class="ov-section ov-' + esc(s.type) + '"><h3><span class="ov-type"><i class="bi ' + t.icone + '" aria-hidden="true"></i>' + esc(t.libelle) + "</span>" + esc(s.titre) + "</h3>" +
      (s.items.length ? "<ul>" + s.items.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul>" : '<p class="text-muted small mb-0">' + esc(s.vide || "Aucune information.") + "</p>") + "</section>";
  }
  function bulleReponse(r) {
    var c = r.contexteTransmis || { notes: [], exclus: [] };
    return '<article class="ov-bulle ov-bulle-assistant" data-reponse-mode="' + esc(r.mode || "hors") + '">' +
      '<header><span class="ov-badge-simulation"><i class="bi bi-cpu me-1" aria-hidden="true"></i>Réponse simulée (démonstration)</span>' + (r.modeLibelle ? '<span class="pr-sous">' + esc(r.modeLibelle) + "</span>" : "") + "</header>" +
      (r.avertissements || []).map(function (a) { return '<p class="ia-avertissement"><i class="bi bi-shield-exclamation me-1"></i>' + esc(a) + "</p>"; }).join("") +
      (r.horsContexte ? '<p class="ov-hors-contexte"><i class="bi bi-info-circle me-1"></i>' + esc(r.horsContexte) + "</p>" : (r.sections || []).map(rendreSection).join("")) +
      ((r.liens || []).length ? '<p class="ov-liens">' + r.liens.map(function (l) { return '<a class="btn btn-sm btn-outline-primary" href="' + esc(l.url) + '">' + esc(l.libelle) + "</a>"; }).join(" ") + "</p>" : "") +
      ((r.relances || []).length ? '<p class="ov-liens">' + r.relances.map(function (x) { return '<button type="button" class="btn btn-sm btn-primary" data-ia="relance" data-id="' + esc(x.id) + '"><i class="bi bi-pencil-square me-1"></i>' + esc(x.libelle) + "</button>"; }).join(" ") + "</p>" : "") +
      '<footer><p class="small mb-1"><strong>Données utilisées :</strong> ' + (r.donnees.length ? r.donnees.map(function (d) { return '<a href="' + esc(d.url) + '">' + esc(d.libelle) + "</a>"; }).join(" · ") : "aucun dossier") +
      (r.provenance ? " · " + esc(r.provenance) : "") + "</p>" +
      '<details class="small"><summary>Données qui seraient transmises à un futur service d\'IA</summary><ul>' +
      ["Prénom : " + (c.prenom || "—"), "Opportunité : " + (c.opportunite || "—"), "Véhicule : " + (c.vehicule || "—"), "Budget : " + (c.budget || "—"), "Notes citées : " + c.notes.length + " (données, jamais des consignes)"]
        .map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "<li>Exclu : " + esc(c.exclus.join(", ")) + "</li></ul></details>" +
      '<p class="ov-fournisseur">' + esc(r.fournisseur) + "</p></footer></article>";
  }
  function ajouter(html) {
    var fil = zone("fil");
    var vide = fil.querySelector("[data-vide]");
    if (vide) vide.remove();
    fil.insertAdjacentHTML("beforeend", html);
    fil.scrollTop = fil.scrollHeight;
  }
  function demander(question) {
    var ctx = contexte();
    var params = { objection: champ("p-objection").value || null, procedure: champ("p-procedure").value || null };
    var libelleMode = mode ? ref.modesCoach.filter(function (m) { return m.cle === mode; })[0].libelle : null;
    var texte = String(question || "").trim() || libelleMode || "";
    if (!texte) { champ("coach-question").classList.add("is-invalid"); return; }
    champ("coach-question").classList.remove("is-invalid");
    ajouter('<div class="ov-bulle ov-bulle-vendeur"><span>' + esc(texte) + '</span><span class="pr-sous d-block">' + esc(ref.contextes[ctx.type] + (ctx.id ? " · " + (champ("ctx-id").selectedOptions[0] || {}).textContent : "")) + "</span></div>");
    OV.enregistrerConsultation({ mode: mode || "question", contexteType: ctx.type, contexteId: ctx.id, question: texte });
    return SVC.repondre({ mode: mode, contexte: ctx, question: question, parametres: params }).then(function (r) { ajouter(bulleReponse(r)); return r; });
  }

  // ---------- Historique local ----------
  function rendreHistorique() {
    var l = OV.consultations().slice(0, 8);
    zone("historique").innerHTML = l.length ? l.map(function (c) {
      return "<li><strong>" + esc(c.question) + '</strong><span class="pr-sous d-block">' + esc(P.relatif(c.le)) + " · " + esc(ref.contextes[c.contexteType || "aucun"] || "") + " · simulation</span></li>";
    }).join("") : '<li class="text-muted small">Aucune consultation.</li>';
  }

  function choisirMode(m) {
    mode = mode === m ? null : m;
    racine.querySelectorAll("[data-mode-coach]").forEach(function (b) { var a = b.dataset.modeCoach === mode; b.classList.toggle("is-active", a); b.setAttribute("aria-pressed", a ? "true" : "false"); });
    champ("p-objection").hidden = mode !== "objection";
    champ("p-procedure").hidden = mode !== "procedure";
  }
  racine.addEventListener("click", function (e) {
    var b = e.target.closest("[data-mode-coach]");
    if (!b) return;
    choisirMode(b.dataset.modeCoach);
    if (mode && mode !== "objection") demander("");
  });
  champ("p-objection").addEventListener("change", function () { if (mode === "objection" && this.value) demander(""); });
  champ("p-procedure").addEventListener("change", function () { if (mode === "procedure") demander(""); });
  champ("ctx-type").addEventListener("change", function () { remplirChoix(null); });
  champ("ctx-id").addEventListener("change", rendreDisposition);
  champ("form-coach").addEventListener("submit", function (e) {
    e.preventDefault();
    var q = champ("coach-question").value;
    if (!String(q).trim()) { champ("coach-question").classList.add("is-invalid"); return; }
    demander(q);
    champ("coach-question").value = "";
  });
  OV.abonner(rendreHistorique);

  // Ouverture contextualisée (?mode=…&contexte=…&id=…) depuis une fiche du dossier.
  var ds = racine.dataset;
  if (ds.contexte && ref.contextes[ds.contexte]) { champ("ctx-type").value = ds.contexte; remplirChoix(ds.id || null); } else remplirChoix(null);
  rendreHistorique();
  window.CoachPage = { demander: demander, choisirMode: choisirMode, contexte: contexte };
  if (ds.mode && ref.modesCoach.some(function (m) { return m.cle === ds.mode; })) { choisirMode(ds.mode); if (ds.mode !== "objection") demander(""); }
})();
