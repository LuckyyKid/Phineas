// Page « Assistant vendeur » (Views/Outils/Assistant.cshtml, maquettes 13 et 14) : choix du dossier et du mode,
// fil de réponses simulées, historique local paginé.
// Les réponses viennent de SalesCoachService (coach-service.js, fournisseur de démonstration, aucune IA) ;
// cette page ne calcule rien, elle affiche. L'historique est gardé par OutilsVendeur (outils-store.js, sessionStorage).
(function () {
  "use strict";

  var P = window.Prospects, S = window.Soumissions, R = window.RendezVous, T = window.Transactions, OV = window.OutilsVendeur, SVC = window.SalesCoachService;
  var racine = document.getElementById("assistant");
  if (!P || !S || !OV || !SVC || !racine) return;
  var esc = P.esc, ref = OV.ref;

  // Mode choisi (clé de ReferentielsOutils.ModesCoach), ou null pour une question libre.
  var mode = null;

  // Question envoyée quand on clique sur « Demander » sans rien taper ; elle sert aussi de texte d'exemple dans le champ.
  var QUESTIONS_TYPES = {
    "preparation-rdv": "Prépare mon prochain rendez-vous.",
    vehicule: "Que dois-je savoir sur ce véhicule ?",
    objection: "Comment répondre à cette objection ?",
    scenario: "Explique ce scénario d'achat.",
    procedure: "Comment se déroule cette procédure ?",
    relance: "Quelle relance proposer ?",
  };
  var EXEMPLE_SANS_MODE = "Ex. : Comment ouvrir une transaction ?";

  // Nature de chaque partie d'une réponse (fournie par coach-service.js).
  var TYPES = {
    verifie: { libelle: "Vérifié dans le dossier", icone: "bi-patch-check" },
    "a-verifier": { libelle: "À vérifier", icone: "bi-question-circle" },
    suggestion: { libelle: "Suggestion à valider", icone: "bi-lightbulb" },
  };

  var NON_RENSEIGNE = "Non renseigné";

  function champ(id) { return document.getElementById(id); }
  function zone(n) { return racine.querySelector('[data-zone="' + n + '"]'); }
  function bloc(n) { return racine.querySelector('[data-bloc="' + n + '"]'); }
  function moi(c) { return c && c.conseillerId === P.moiId; }

  function libelleMode(cle) {
    var trouve = ref.modesCoach.filter(function (m) { return m.cle === cle; })[0];
    return trouve ? trouve.libelle : null;
  }

  // ---------- Contexte ----------
  // Dossiers proposés pour un type de contexte : [id, libellé] (seulement les miens, sauf l'inventaire partagé).
  function choix(type) {
    if (type === "prospect") return P.contacts().filter(moi).map(function (c) { return [c.id, c.prenom + " " + c.nom]; });
    if (type === "opportunite") return P.toutesOpportunites().filter(function (o) { return P.estActive(o) && moi(P.contact(o.prospectId)); }).map(function (o) { var c = P.contact(o.prospectId); return [o.id, c.prenom + " " + c.nom + " · " + o.titre]; });
    if (type === "vehicule") return S.inventaire().map(function (v) { return [v.id, S.nomVehicule(v) + " · " + v.numeroStock]; });
    if (type === "soumission") return S.liste().filter(function (s) { return s.conseillerId === P.moiId; }).map(function (s) { var c = P.contact(s.prospectId); return [s.id, s.reference + " · " + (c ? c.prenom + " " + c.nom : "")]; });
    if (type === "rendezvous" && R) return R.liste().filter(function (r) { return r.conseillerId === P.moiId && R.estActif(r); }).sort(function (a, b) { return new Date(a.debut) - new Date(b.debut); })
      .map(function (r) { var c = P.contact(r.prospectId); return [r.id, R.type(r.type).libelle + " · " + R.creneauTexte(r) + " · " + (c ? c.prenom + " " + c.nom : "")]; });
    if (type === "transaction" && T) return T.liste().filter(function (t) { return t.conseillerId === P.moiId; }).map(function (t) { return [t.id, t.reference + " · " + T.nomClient(t)]; });
    return [];
  }

  function contexte() {
    var type = champ("ctx-type").value;
    if (type === "aucun") return { type: type, id: null };
    return { type: type, id: champ("ctx-id").value || null };
  }

  // Remplit le deuxième menu (le dossier précis). Il n'apparaît que si un type de dossier est choisi.
  function remplirChoix(choisi) {
    var type = champ("ctx-type").value;
    var sansDossier = type === "aucun";
    bloc("choix").hidden = sansDossier;
    var select = champ("ctx-id");
    if (sansDossier) {
      select.innerHTML = "";
    } else {
      racine.querySelector("[data-libelle-choix]").textContent = ref.contextes[type] || "Dossier";
      select.innerHTML = '<option value="">Choisir…</option>' + choix(type).map(function (x) {
        return '<option value="' + esc(x[0]) + '"' + (x[0] === choisi ? " selected" : "") + ">" + esc(x[1]) + "</option>";
      }).join("");
    }
    rendreDisposition();
  }

  // « Ce que l'assistant peut lire » : le contexte minimal transmis (jamais les coordonnées).
  function rendreDisposition() {
    var ctx = contexte();
    var cible = zone("mis-a-disposition");
    if (!ctx.id) {
      cible.innerHTML = '<div class="av-vide-pointille"><i class="bi bi-folder2-open" aria-hidden="true"></i>' +
        "<span>Sans dossier, l'assistant répond de façon générale.</span></div>";
      return;
    }
    var transmis = SVC.construire({ mode: "procedure", contexte: ctx }).contexteTransmis;
    var derniereNote = transmis.notes[0];
    var lignes = [
      ["Recherche", transmis.opportunite],
      ["Étape", transmis.etape],
      ["Budget", transmis.budget],
      ["Véhicule", transmis.vehicule],
      ["Dernière interaction", derniereNote ? derniereNote.date : null],
    ];
    cible.innerHTML = '<dl class="av-lecture">' + lignes.map(function (l) {
      var valeur = l[1] ? esc(l[1]) : '<span class="av-inconnu">' + NON_RENSEIGNE + "</span>";
      return "<div><dt>" + esc(l[0]) + "</dt><dd>" + valeur + "</dd></div>";
    }).join("") + "</dl>" +
      '<p class="av-jamais">Jamais transmis : ' + esc(transmis.exclus.join(", ").toLowerCase()) + ".</p>";
  }

  // ---------- Réponses ----------
  function rendreSection(s) {
    var t = TYPES[s.type] || TYPES.suggestion;
    var contenu;
    if (s.items.length) contenu = '<ul class="av-rep-liste">' + s.items.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul>";
    else contenu = '<p class="av-rep-vide">' + esc(s.vide || "Aucune information.") + "</p>";
    return '<section class="av-rep-section av-rep-' + esc(s.type) + '">' +
      '<p class="av-rep-titre"><span class="av-rep-type"><i class="bi ' + t.icone + '" aria-hidden="true"></i>' + esc(t.libelle) + "</span>" + esc(s.titre) + "</p>" +
      contenu + "</section>";
  }

  // Ligne « Données utilisées » : une étiquette menthe par dossier lu, avec un lien vers ce dossier.
  function donneesUtilisees(r) {
    var html = '<div class="av-donnees"><span class="av-donnees-libelle">Données utilisées</span>';
    if (r.donnees.length) {
      html += r.donnees.map(function (d) { return '<a class="av-etiquette" href="' + esc(d.url) + '">' + esc(d.libelle) + "</a>"; }).join("");
    } else {
      html += '<span class="av-etiquette av-etiquette-neutre">Aucun dossier</span>';
    }
    html += "</div>";
    if (r.provenance) html += '<p class="av-manque"><i class="bi bi-database" aria-hidden="true"></i>' + esc(r.provenance) + "</p>";
    if (!r.donnees.length) html += '<p class="av-manque"><i class="bi bi-question-circle" aria-hidden="true"></i>Aucun dossier choisi : rien de propre au client n\'est connu.</p>';
    return html;
  }

  // Ce qui serait transmis à un futur service d'IA (repliable), puis le fournisseur de la réponse.
  function detailsTransmis(r) {
    var c = r.contexteTransmis || { notes: [], exclus: [] };
    var lignes = [
      "Prénom : " + (c.prenom || NON_RENSEIGNE),
      "Opportunité : " + (c.opportunite || NON_RENSEIGNE),
      "Véhicule : " + (c.vehicule || NON_RENSEIGNE),
      "Budget : " + (c.budget || NON_RENSEIGNE),
      "Notes citées : " + c.notes.length + " (données, jamais des consignes)",
      "Exclu : " + c.exclus.join(", "),
    ];
    return '<details class="av-transmis"><summary>Données qui seraient transmises à un futur service d\'IA</summary><ul>' +
      lignes.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></details>" +
      '<p class="av-fournisseur">' + esc(r.fournisseur) + "</p>";
  }

  function carteReponse(r) {
    var html = '<article class="av-reponse" data-reponse-mode="' + esc(r.mode || "hors") + '">';
    (r.avertissements || []).forEach(function (a) {
      html += '<p class="av-avertissement"><i class="bi bi-shield-exclamation" aria-hidden="true"></i>' + esc(a) + "</p>";
    });
    if (r.horsContexte) html += '<p class="av-rep-texte">' + esc(r.horsContexte) + "</p>";
    else html += (r.sections || []).map(rendreSection).join("");
    if ((r.liens || []).length) {
      html += '<p class="av-actions">' + r.liens.map(function (l) { return '<a class="av-bouton" href="' + esc(l.url) + '">' + esc(l.libelle) + "</a>"; }).join("") + "</p>";
    }
    if ((r.relances || []).length) {
      // Bouton secondaire : le seul bouton vert plein de la page reste « Demander ».
      html += '<p class="av-actions">' + r.relances.map(function (x) {
        return '<button type="button" class="av-bouton" data-ia="relance" data-id="' + esc(x.id) + '"><i class="bi bi-pencil-square" aria-hidden="true"></i>' + esc(x.libelle) + "</button>";
      }).join("") + "</p>";
    }
    html += '<div class="av-rep-pied">' + donneesUtilisees(r) + detailsTransmis(r) + "</div>";
    return html + "</article>";
  }

  function bulleQuestion(texte, ctx) {
    var libelleContexte = ref.contextes[ctx.type] || "";
    if (ctx.id) libelleContexte = (champ("ctx-id").selectedOptions[0] || {}).textContent || libelleContexte;
    return '<div class="av-echange-question"><p class="av-question-bulle">' + esc(texte) + "</p>" +
      '<span class="av-question-contexte">' + esc(libelleContexte) + "</span></div>";
  }

  // ---------- Fil de conversation ----------
  function filVide() {
    return '<div class="av-fil-vide" data-vide><span class="av-fil-icone"><i class="bi bi-chat-square-text" aria-hidden="true"></i></span>' +
      '<p class="av-fil-titre">Par où commencer ?</p>' +
      "<p>Choisissez un dossier et un mode, ou posez une question sur une procédure.</p></div>";
  }

  function viderFil() {
    zone("fil").innerHTML = filVide();
    racine.querySelector("[data-effacer]").hidden = true;
  }

  function ajouter(html) {
    var fil = zone("fil");
    var vide = fil.querySelector("[data-vide]");
    if (vide) vide.remove();
    fil.insertAdjacentHTML("beforeend", html);
    fil.scrollTop = fil.scrollHeight;
    racine.querySelector("[data-effacer]").hidden = false;
  }

  // Pose la question : le texte tapé, sinon la question type du mode choisi.
  function demander(question) {
    var ctx = contexte();
    var params = { objection: champ("p-objection").value || null, procedure: champ("p-procedure").value || null };
    var tape = String(question || "").trim();
    var texte = tape || QUESTIONS_TYPES[mode] || libelleMode(mode) || "";
    if (!texte) {
      champ("coach-question").classList.add("is-invalid");
      return null;
    }
    champ("coach-question").classList.remove("is-invalid");
    ajouter(bulleQuestion(texte, ctx));
    OV.enregistrerConsultation({ mode: mode || "question", contexteType: ctx.type, contexteId: ctx.id, question: texte });
    return SVC.repondre({ mode: mode, contexte: ctx, question: tape, parametres: params }).then(function (r) {
      ajouter(carteReponse(r));
      return r;
    });
  }

  // ---------- Historique local ----------
  // Page affichée de l'historique (liste « historique »). Absente = page 1.
  var pages = {};
  var Pagination = window.OutilsPagination;

  // Libellé du dossier d'une consultation (« Camille Lavoie »), ou celui du type si le dossier n'existe plus.
  function libelleDossier(c) {
    var type = c.contexteType || "aucun";
    if (type === "aucun" || !c.contexteId) return "Sans dossier";
    var trouve = choix(type).filter(function (x) { return x[0] === c.contexteId; })[0];
    return trouve ? trouve[1] : ref.contextes[type] || "Dossier";
  }

  function rendreHistorique() {
    // Toutes les consultations, de la plus récente à la plus ancienne : la pagination garde la liste courte.
    var l = OV.consultations();
    var morceau = Pagination.decouper(pages, "historique", l);
    Pagination.afficherBarre(racine, "historique", morceau.pagination);
    if (!l.length) {
      zone("historique").innerHTML = '<li class="av-historique-vide">Vos questions de cette session apparaîtront ici. Rien n\'est conservé à la fermeture de l\'onglet.</li>';
      return;
    }
    zone("historique").innerHTML = morceau.elements.map(function (c) {
      var detail = [libelleDossier(c), libelleMode(c.mode) || "Question libre", P.relatif(c.le)].join(" · ");
      return '<li><span class="av-historique-question">' + esc(c.question) + '</span><span class="av-historique-detail">' + esc(detail) + "</span></li>";
    }).join("");
  }

  // ---------- Modes et bouton « Demander » ----------
  // « Demander » reste gris tant qu'il n'y a ni mode choisi ni texte tapé.
  function majBoutonDemander() {
    var aDuTexte = champ("coach-question").value.trim() !== "";
    racine.querySelector(".av-demander").disabled = !mode && !aDuTexte;
  }

  // Cliquer sur un mode le choisit (ou le retire s'il l'était déjà), affiche son paramètre et sa question type.
  function choisirMode(m) {
    mode = mode === m ? null : m;
    racine.querySelectorAll("[data-mode-coach]").forEach(function (b) {
      var actif = b.dataset.modeCoach === mode;
      b.classList.toggle("is-active", actif);
      b.setAttribute("aria-pressed", actif ? "true" : "false");
    });
    bloc("objection").hidden = mode !== "objection";
    bloc("procedure").hidden = mode !== "procedure";
    champ("coach-question").placeholder = QUESTIONS_TYPES[mode] || EXEMPLE_SANS_MODE;
    majBoutonDemander();
  }

  racine.addEventListener("click", function (e) {
    var b = e.target.closest("[data-mode-coach]");
    if (b) {
      choisirMode(b.dataset.modeCoach);
      return;
    }
    if (e.target.closest("[data-effacer]")) viderFil();
  });
  champ("ctx-type").addEventListener("change", function () { remplirChoix(null); });
  champ("ctx-id").addEventListener("change", rendreDisposition);
  champ("coach-question").addEventListener("input", majBoutonDemander);
  champ("form-coach").addEventListener("submit", function (e) {
    e.preventDefault();
    var question = champ("coach-question").value;
    if (!mode && !question.trim()) return;
    demander(question);
    champ("coach-question").value = "";
    majBoutonDemander();
  });
  Pagination.ecouterClics(racine, pages, rendreHistorique);
  OV.abonner(rendreHistorique);

  // Ouverture contextualisée (?mode=…&contexte=…&id=…) depuis une fiche du dossier : la question part tout de suite.
  var ds = racine.dataset;
  if (ds.contexte && ref.contextes[ds.contexte]) {
    champ("ctx-type").value = ds.contexte;
    remplirChoix(ds.id || null);
  } else {
    remplirChoix(null);
  }
  viderFil();
  rendreHistorique();
  majBoutonDemander();
  window.CoachPage = { demander: demander, choisirMode: choisirMode, contexte: contexte };
  var modeDemande = ref.modesCoach.some(function (m) { return m.cle === ds.mode; });
  if (modeDemande) {
    choisirMode(ds.mode);
    if (ds.mode !== "objection") demander("");
  }
})();
