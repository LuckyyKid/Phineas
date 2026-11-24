// Relations clients : composants partagés (pastilles, fenêtres de clôture, réactivation, retour, enquête, problème).
// Réutilise la fenêtre générique du Centre d'actions (IntelligenceUI.fenetre). Aucun calcul métier ici : les
// validations et états viennent de relations-store.js / relations-regles.js.
(function () {
  "use strict";

  var RC = window.RelationsClients, P = window.Prospects, T = window.Transactions, UI = window.IntelligenceUI;
  if (!RC || !P || !T || !UI) return;
  var esc = P.esc, ref = RC.ref;

  // ---------- Pastilles (toujours texte + icône) ----------
  function pastilleRecuperation(e) {
    var x = ref.libellesEtats[e.cle] || { libelle: e.cle, icone: "bi-circle" };
    return '<span class="rc-recup rc-recup-' + esc(e.cle) + '" title="' + esc(e.raison || "") + '"><i class="bi ' + esc(x.icone) + '" aria-hidden="true"></i>' + esc(x.libelle) + "</span>";
  }
  function pastilleOrigine(origine) {
    var cls = origine === "hypothese" ? "hypothese" : origine === "inconnu" ? "inconnu" : "confirme";
    var ic = cls === "hypothese" ? "bi-lightbulb" : cls === "inconnu" ? "bi-question-circle" : "bi-patch-check";
    return '<span class="rc-origine rc-origine-' + cls + '"><i class="bi ' + ic + '" aria-hidden="true"></i>' + esc(ref.originesMotif[origine] || origine) + "</span>";
  }
  function pastilleProbleme(statut) {
    return '<span class="rc-pb rc-pb-' + esc(statut) + '">' + esc(ref.statutsProbleme[statut] || statut) + "</span>";
  }
  // Barre de score : valeur affichée en texte ; la barre n'est qu'un repère visuel.
  function barre(valeur, max, libelle) {
    if (valeur == null) return '<span class="text-muted small">Non évalué</span>';
    var pct = Math.round(valeur / max * 100);
    return '<span class="rc-barre" role="img" aria-label="' + esc(libelle + " : " + valeur + " sur " + max) + '"><span class="rc-barre-fond"><span class="rc-barre-val" style="width:' + pct + '%"></span></span><span class="rc-barre-txt">' + esc(String(valeur).replace(".", ",")) + " / " + max + "</span></span>";
  }
  function options(dict, choisi, vide) {
    return (vide ? '<option value="">' + esc(vide) + "</option>" : "") + Object.keys(dict).map(function (k) { return '<option value="' + esc(k) + '"' + (k === choisi ? " selected" : "") + ">" + esc(dict[k]) + "</option>"; }).join("");
  }
  function erreur(champ) {
    return '<div class="invalid-feedback" data-erreur="' + champ + '"></div>';
  }
  function afficherErreurs(racine, erreurs) {
    racine.querySelectorAll("[data-erreur]").forEach(function (x) { x.textContent = ""; x.style.display = ""; });
    racine.querySelectorAll(".is-invalid").forEach(function (x) { x.classList.remove("is-invalid"); });
    Object.keys(erreurs || {}).forEach(function (k) {
      var champ = racine.querySelector('[name="' + k + '"]');
      if (champ) champ.classList.add("is-invalid");
      var f = racine.querySelector('[data-erreur="' + k + '"]');
      if (f) { f.textContent = erreurs[k]; f.style.display = "block"; }
    });
  }
  function modale() {
    return document.getElementById("ia-modale");
  }
  function fermer() {
    var m = modale();
    if (m && window.bootstrap) bootstrap.Modal.getOrCreateInstance(m).hide();
  }
  function pied(valider, libelle) {
    return '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Annuler</button><button type="button" class="btn btn-primary" data-rc-valider="' + valider + '">' + esc(libelle) + "</button>";
  }
  function valeurs(form) {
    var v = {};
    Array.prototype.forEach.call(form.elements, function (e) {
      if (!e.name) return;
      if (e.type === "radio") { if (e.checked) v[e.name] = e.value; }
      else if (e.type === "checkbox") v[e.name] = e.checked;
      else v[e.name] = e.value;
    });
    return v;
  }

  // ---------- Clôture rapide d'une opportunité perdue ----------
  var contexte = null;
  function ouvrirCloture(oppId) {
    // Dossiers de démonstration seulement : un dossier enregistré ne se clôture pas encore ici (fonctionnalité 16).
    var opps = P.toutesOpportunites().filter(function (o) { var c = P.contact(o.prospectId); return P.estActive(o) && c && c.conseillerId === P.moiId && !P.estEnregistree(o.id); });
    var o = oppId ? P.opportunite(oppId) : null;
    if (oppId && RC.refusCloture(oppId)) { P.notifier(RC.refusCloture(oppId)); return; }
    contexte = { type: "cloture", oppId: oppId || null };
    var etapes = {};
    P.actives.forEach(function (k) { etapes[k] = P.libelleEtape(k); });
    var origines = Object.keys(ref.originesMotif).map(function (k) {
      return '<div class="form-check"><input class="form-check-input" type="radio" name="origine" id="rc-or-' + k + '" value="' + k + '"><label class="form-check-label" for="rc-or-' + k + '">' + esc(ref.originesMotif[k]) + "</label></div>";
    }).join("");
    var corps = '<form id="rc-form" novalidate>' +
      (o ? '<p class="mb-3"><strong>' + esc(P.contact(o.prospectId).prenom + " " + P.contact(o.prospectId).nom) + "</strong> — " + esc(o.titre) + ' <span class="pr-sous">(' + esc(P.libelleEtape(o.etape)) + ")</span></p>"
        : '<div class="mb-3"><label class="form-label" for="rc-opp">Opportunité</label><select class="form-select" id="rc-opp" name="opportunite"><option value="">Choisir une opportunité active</option>' +
          opps.map(function (x) { var c = P.contact(x.prospectId); return '<option value="' + esc(x.id) + '">' + esc(c.prenom + " " + c.nom + " — " + x.titre) + "</option>"; }).join("") + "</select>" + erreur("opportunite") + "</div>") +
      '<div class="row g-3"><div class="col-md-6"><label class="form-label" for="rc-motif">Motif de perte</label><select class="form-select" id="rc-motif" name="motif">' + options(ref.motifsPerte, null, "Choisir un motif") + "</select>" + erreur("motif") +
      '<div class="form-text">Inconnu ? Choisissez « Motif inconnu » : n\'inventez pas de raison.</div></div>' +
      '<div class="col-md-6"><fieldset><legend class="form-label fs-6">Origine du motif</legend>' + origines + erreur("origine") + "</fieldset></div></div>" +
      '<div class="row g-3 mt-1"><div class="col-md-6"><label class="form-label" for="rc-etape">Étape atteinte</label><select class="form-select" id="rc-etape" name="etapeAtteinte">' + options(etapes, o ? o.etape : null) + "</select></div>" +
      '<div class="col-md-6"><label class="form-label" for="rc-restriction">Restrictions de communication</label><select class="form-select" id="rc-restriction" name="restriction">' + options(ref.restrictions, "aucune") + "</select>" + erreur("restriction") + "</div></div>" +
      '<div class="mt-3"><label class="form-label" for="rc-commentaire">Commentaire <span class="pr-sous">(facultatif)</span></label><textarea class="form-control" id="rc-commentaire" name="commentaire" rows="2"></textarea>' + erreur("commentaire") + "</div>" +
      '<div class="form-check form-switch mt-3"><input class="form-check-input" type="checkbox" role="switch" id="rc-suivi" name="suiviPossible"><label class="form-check-label" for="rc-suivi">Un futur suivi est possible</label></div>' +
      '<div class="row g-3 mt-1" data-rc-suivi hidden><div class="col-md-6"><label class="form-label" for="rc-reprise">Date de reprise souhaitée <span class="pr-sous">(si connue)</span></label><input type="date" class="form-control" id="rc-reprise" name="dateReprise">' + erreur("dateReprise") + "</div>" +
      '<div class="col-md-6"><label class="form-label" for="rc-conditions">Conditions de réactivation <span class="pr-sous">(facultatif)</span></label><input type="text" class="form-control" id="rc-conditions" name="conditions" placeholder="Ex. : un VUS hybride sous 30 000 $"></div></div>' +
      '<p class="alert alert-danger mt-3 mb-0" data-erreur="general" hidden></p>' +
      '<p class="pr-note mt-3 mb-0"><i class="bi bi-info-circle me-1"></i>L\'historique complet de l\'opportunité est conservé. Une hypothèse ne sera jamais présentée comme une raison confirmée.</p></form>';
    UI.fenetre("Clôturer une opportunité perdue", corps, pied("cloture", "Clôturer comme perdue"));
  }
  function validerCloture(m) {
    var f = m.querySelector("#rc-form");
    var v = valeurs(f);
    var oppId = contexte.oppId || v.opportunite;
    if (!oppId) { afficherErreurs(f, { opportunite: "Choisissez une opportunité." }); return; }
    var res = RC.cloturer(oppId, { motif: v.motif, origine: v.origine, etapeAtteinte: v.etapeAtteinte, commentaire: v.commentaire, suiviPossible: v.suiviPossible,
      dateReprise: v.suiviPossible && v.dateReprise ? P.depuisChampDate(v.dateReprise) : null, conditions: v.suiviPossible ? v.conditions : null, restriction: v.restriction });
    if (res.erreurs) {
      afficherErreurs(f, res.erreurs);
      var g = f.querySelector('[data-erreur="general"]');
      g.hidden = !res.erreurs.general;
      g.textContent = res.erreurs.general || "";
      return;
    }
    fermer();
    P.notifier("Opportunité clôturée comme perdue : " + ref.motifsPerte[res.cloture.motif].toLowerCase() + ".", res.annuler);
  }

  // ---------- Récupération ----------
  function ouvrirReactivation(oppId) {
    contexte = { type: "reactivation", oppId: oppId };
    var etapes = {};
    P.actives.forEach(function (k) { etapes[k] = P.libelleEtape(k); });
    UI.fenetre("Réactiver l'opportunité", '<form id="rc-form" novalidate><p class="small">La réactivation est votre décision : elle suppose qu\'un événement pertinent est survenu et que le client accepte d\'en reparler. L\'historique de la clôture est conservé.</p>' +
      '<label class="form-label" for="rc-evenement">Événement qui justifie la reprise</label><textarea class="form-control" id="rc-evenement" name="evenement" rows="2" placeholder="Ex. : la cliente nous a recontactés, sa mise de fonds a augmenté"></textarea>' + erreur("evenement") +
      '<label class="form-label mt-3" for="rc-etape-r">Reprendre à l\'étape</label><select class="form-select" id="rc-etape-r" name="etape">' + options(etapes, "AQualifier") + "</select></form>", pied("reactivation", "Réactiver"));
  }
  function ouvrirEvenement(oppId) {
    contexte = { type: "evenement", oppId: oppId };
    UI.fenetre("Déclarer un événement pertinent", '<form id="rc-form" novalidate><p class="small">L\'événement ne réactive rien : il propose d\'examiner la situation dans le Centre d\'actions.</p>' +
      '<label class="form-label" for="rc-ev">Que s\'est-il passé ?</label><textarea class="form-control" id="rc-ev" name="texte" rows="2"></textarea>' + erreur("texte") + "</form>", pied("evenement", "Enregistrer"));
  }
  function ouvrirPreciser(oppId) {
    var cl = RC.clotureCourante(oppId);
    contexte = { type: "preciser", oppId: oppId };
    var origines = Object.keys(ref.originesMotif).map(function (k) {
      return '<div class="form-check"><input class="form-check-input" type="radio" name="origine" id="rc-po-' + k + '" value="' + k + '"' + (k === cl.origine ? " checked" : "") + '><label class="form-check-label" for="rc-po-' + k + '">' + esc(ref.originesMotif[k]) + "</label></div>";
    }).join("");
    UI.fenetre("Préciser le motif de perte", '<form id="rc-form" novalidate><p class="small">Utilisez cette fenêtre lorsqu\'une information nouvelle est obtenue. L\'ancien motif reste dans l\'historique.</p>' +
      '<label class="form-label" for="rc-pm">Motif</label><select class="form-select" id="rc-pm" name="motif">' + options(ref.motifsPerte, cl.motif) + "</select>" + erreur("motif") +
      '<fieldset class="mt-3"><legend class="form-label fs-6">Origine</legend>' + origines + erreur("origine") + "</fieldset>" +
      '<label class="form-label mt-3" for="rc-pc">Commentaire</label><textarea class="form-control" id="rc-pc" name="commentaire" rows="2"></textarea>' + erreur("commentaire") + "</form>", pied("preciser", "Enregistrer"));
  }
  function ouvrirSuivi(oppId) {
    var cl = RC.clotureCourante(oppId);
    contexte = { type: "suivi", oppId: oppId };
    UI.fenetre("Futur suivi", '<form id="rc-form" novalidate><div class="form-check form-switch"><input class="form-check-input" type="checkbox" role="switch" id="rc-s" name="suiviPossible"' + (cl.suiviPossible ? " checked" : "") + '><label class="form-check-label" for="rc-s">Un futur suivi est possible</label></div>' +
      '<label class="form-label mt-3" for="rc-sd">Date de reprise souhaitée</label><input type="date" class="form-control" id="rc-sd" name="dateReprise" value="' + (cl.dateReprise ? P.versChampDate(new Date(cl.dateReprise)) : "") + '">' +
      '<label class="form-label mt-3" for="rc-sc">Conditions de réactivation</label><input type="text" class="form-control" id="rc-sc" name="conditions" value="' + esc(cl.conditions || "") + '"></form>', pied("suivi", "Enregistrer"));
  }
  // Retour volontaire : prévisualisation du formulaire client et réception SIMULÉE, jamais préremplie.
  var QUESTIONS_RETOUR = [
    "Avez-vous trouvé le véhicule que vous recherchiez ?",
    "Quelle était la principale raison pour laquelle vous n'avez pas poursuivi avec notre concession ?",
    "Y a-t-il quelque chose que nous aurions pu améliorer ?",
    "Souhaitez-vous être informé si un véhicule correspondant à vos besoins devient disponible ?",
  ];
  function formulaireRetour(simulation) {
    var d = simulation ? "" : " disabled";
    return '<form id="rc-form" novalidate class="rc-formulaire-client">' +
      '<p class="small text-muted">Formulaire facultatif. ' + (simulation ? "Saisissez des réponses FICTIVES pour représenter un retour reçu ; ne remplissez jamais à la place du client." : "Aperçu : ce formulaire n'est envoyé à personne.") + "</p>" +
      '<fieldset class="mb-3"' + d + '><legend class="form-label fs-6">1. ' + esc(QUESTIONS_RETOUR[0]) + "</legend>" +
      ["oui", "non", "en-partie"].map(function (k) { return '<div class="form-check form-check-inline"><input class="form-check-input" type="radio" name="vehiculeTrouve" id="rt-vt-' + k + '" value="' + k + '"><label class="form-check-label" for="rt-vt-' + k + '">' + { oui: "Oui", non: "Non", "en-partie": "En partie" }[k] + "</label></div>"; }).join("") + "</fieldset>" +
      '<label class="form-label" for="rt-raison">2. ' + esc(QUESTIONS_RETOUR[1]) + '</label><textarea class="form-control mb-3" id="rt-raison" name="raison" rows="2"' + d + "></textarea>" +
      '<label class="form-label" for="rt-amelioration">3. ' + esc(QUESTIONS_RETOUR[2]) + '</label><textarea class="form-control mb-3" id="rt-amelioration" name="amelioration" rows="2"' + d + "></textarea>" +
      '<fieldset' + d + '><legend class="form-label fs-6">4. ' + esc(QUESTIONS_RETOUR[3]) + "</legend>" +
      ["oui", "non"].map(function (k) { return '<div class="form-check form-check-inline"><input class="form-check-input" type="radio" name="informer" id="rt-inf-' + k + '" value="' + k + '"><label class="form-check-label" for="rt-inf-' + k + '">' + (k === "oui" ? "Oui" : "Non") + "</label></div>"; }).join("") + "</fieldset></form>";
  }
  function ouvrirApercuRetour() {
    contexte = null;
    UI.fenetre("Aperçu du formulaire de retour client", formulaireRetour(false));
  }
  function ouvrirRetour(oppId) {
    contexte = { type: "retour", oppId: oppId };
    UI.fenetre("Simuler la réception d'un retour client", '<p class="rc-simulation-bandeau"><i class="bi bi-cone-striped me-1"></i>Simulation de démonstration : aucun formulaire n\'a été envoyé et aucun client n\'a répondu.</p>' + formulaireRetour(true), pied("retour", "Enregistrer le retour simulé"));
  }

  // ---------- Satisfaction ----------
  function ouvrirEnquete(tid) {
    var t = T.transaction(tid);
    contexte = { type: "enquete", tid: tid };
    var echelle = Object.keys(ref.echelle);
    function ligne(cle, libelle) {
      return '<div class="rc-question"><span class="rc-question-libelle" id="q-' + cle + '">' + esc(libelle) + '</span><div class="rc-echelle" role="radiogroup" aria-labelledby="q-' + cle + '">' +
        echelle.map(function (v) { return '<input type="radio" class="btn-check" name="r-' + cle + '" id="r-' + cle + "-" + v + '" value="' + v + '"><label class="btn btn-sm btn-outline-secondary" for="r-' + cle + "-" + v + '" title="' + esc(ref.echelle[v]) + '">' + v + "</label>"; }).join("") +
        "</div></div>";
    }
    var corps = '<p class="rc-simulation-bandeau"><i class="bi bi-cone-striped me-1"></i>Représentation d\'un retour reçu (simulation) : aucune enquête n\'a été envoyée par courriel ou texto.</p>' +
      '<p class="small mb-2"><strong>' + esc(T.nomClient(t)) + "</strong> — " + esc(T.nomVehicule(t)) + " · " + esc(t.reference) + '</p><p class="small text-muted">Échelle : 1 = ' + esc(ref.echelle["1"].toLowerCase()) + ", 5 = " + esc(ref.echelle["5"].toLowerCase()) + ". Laissez vide ce qui n'est pas évalué.</p>" +
      '<form id="rc-form" novalidate>' + ref.dimensions.map(function (d) {
        return '<fieldset class="rc-dimension"><legend>' + esc(d.libelle) + "</legend>" + d.elements.map(function (e) { return ligne(e.cle, e.libelle); }).join("") + "</fieldset>";
      }).join("") +
      '<fieldset class="rc-dimension"><legend>Satisfaction globale</legend>' + ligne("globale", "Niveau de satisfaction") + erreur("globale") +
      '<label class="form-label mt-2" for="rc-com">Commentaire <span class="pr-sous">(facultatif)</span></label><textarea class="form-control" id="rc-com" name="commentaire" rows="2"></textarea>' +
      '<div class="form-check mt-2"><input class="form-check-input" type="checkbox" id="rc-rec" name="recontacterProbleme"><label class="form-check-label" for="rc-rec">Le client accepte d\'être recontacté au sujet d\'un problème</label></div>' +
      '<div class="mt-2"><span class="form-label d-block">Recommanderait-il son conseiller à un proche ?</span>' +
      [["oui", "Oui"], ["non", "Non"], ["", "Non précisé"]].map(function (x) { return '<div class="form-check form-check-inline"><input class="form-check-input" type="radio" name="interet" id="rc-int-' + (x[0] || "np") + '" value="' + x[0] + '"' + (x[0] === "" ? " checked" : "") + '><label class="form-check-label" for="rc-int-' + (x[0] || "np") + '">' + x[1] + "</label></div>"; }).join("") +
      '<div class="form-text">Répondre « oui » n\'est pas un consentement à être sollicité.</div></div></fieldset>' +
      '<p class="alert alert-danger mt-3 mb-0" data-erreur="general" hidden></p></form>';
    UI.fenetre("Retour de satisfaction", corps, pied("enquete", "Enregistrer le retour simulé"));
  }
  function validerEnquete(m) {
    var f = m.querySelector("#rc-form");
    var v = valeurs(f);
    var reponses = {};
    Object.keys(v).forEach(function (k) { if (k.indexOf("r-") === 0 && k !== "r-globale" && v[k]) reponses[k.slice(2)] = Number(v[k]); });
    var res = RC.enregistrerEnquete(contexte.tid, { reponses: reponses, globale: Number(v["r-globale"] || 0), commentaire: v.commentaire, recontacterProbleme: v.recontacterProbleme, interetRecommander: v.interet === "" ? null : v.interet === "oui" });
    if (res.erreurs) {
      afficherErreurs(f, res.erreurs);
      var g = f.querySelector('[data-erreur="general"]');
      g.hidden = !res.erreurs.general;
      g.textContent = res.erreurs.general || "";
      return;
    }
    fermer();
    P.notifier("Retour de satisfaction enregistré (simulation).");
  }
  function ouvrirProbleme(tid, enqueteId, departement) {
    contexte = { type: "probleme", tid: tid || null, enqueteId: enqueteId || null };
    var livs = RC.livraisons().filter(function (l) { return l.conseillerId === P.moiId; });
    var deps = {};
    Object.keys(T.ref.departements).forEach(function (k) { if (k !== "client") deps[k] = T.ref.departements[k].libelle; });
    UI.fenetre("Enregistrer un problème après-vente", '<form id="rc-form" novalidate>' +
      '<label class="form-label" for="rc-pt">Client et transaction</label><select class="form-select" id="rc-pt" name="transactionId"><option value="">Choisir une transaction livrée</option>' +
      livs.map(function (l) { return '<option value="' + esc(l.transaction.id) + '"' + (l.transaction.id === tid ? " selected" : "") + ">" + esc(l.client + " — " + l.vehicule + " (" + l.transaction.reference + ")") + "</option>"; }).join("") + "</select>" + erreur("transactionId") +
      '<div class="row g-3 mt-1"><div class="col-md-6"><label class="form-label" for="rc-ptype">Nature du problème</label><select class="form-select" id="rc-ptype" name="type">' + options(ref.typesProbleme, null, "Choisir") + "</select>" + erreur("type") + "</div>" +
      '<div class="col-md-6"><label class="form-label" for="rc-pdep">Département concerné</label><select class="form-select" id="rc-pdep" name="departement">' + options(deps, departement || null, "Choisir") + "</select>" + erreur("departement") + "</div></div>" +
      '<label class="form-label mt-3" for="rc-pnat">Description</label><textarea class="form-control" id="rc-pnat" name="nature" rows="2"></textarea>' + erreur("nature") +
      '<div class="row g-3 mt-1"><div class="col-md-6"><label class="form-label" for="rc-pprio">Priorité</label><select class="form-select" id="rc-pprio" name="priorite"><option value="Eleve">Élevée</option><option value="Normal">Normale</option></select></div>' +
      '<div class="col-md-6"><label class="form-label" for="rc-pact">Prochaine action <span class="pr-sous">(facultatif)</span></label><input type="text" class="form-control" id="rc-pact" name="prochaineAction"></div></div>' +
      '<p class="pr-note mt-3 mb-0"><i class="bi bi-info-circle me-1"></i>Dossier de suivi uniquement : aucune gestion de réparation ni de garantie, aucun envoi automatique au département.</p></form>', pied("probleme", "Enregistrer le problème"));
  }
  function ouvrirDetailProbleme(id) {
    var p = RC.probleme(id);
    if (!p) return;
    var t = T.transaction(p.transactionId);
    contexte = { type: "detail-probleme", id: id };
    var deps = {};
    Object.keys(T.ref.departements).forEach(function (k) { if (k !== "client" && k !== "conseiller") deps[k] = T.ref.departements[k].libelle; });
    var trans = RC.transitionsProbleme(p.statut).filter(function (s) { return s !== "AttenteDepartement"; });
    var ouvert = RC.regles.problemeOuvert(p);
    var corps = '<dl class="rc-def"><div><dt>Client</dt><dd>' + esc(T.nomClient(t)) + "</dd></div><div><dt>Transaction</dt><dd>" + esc(t.reference) + "</dd></div><div><dt>Véhicule</dt><dd>" + esc(T.nomVehicule(t)) + "</dd></div>" +
      "<div><dt>Nature</dt><dd>" + esc(ref.typesProbleme[p.type]) + "</dd></div><div><dt>Signalé le</dt><dd>" + esc(P.dateComplete(p.signaleLe)) + "</dd></div><div><dt>Département</dt><dd>" + esc((T.ref.departements[p.departement] || {}).libelle || p.departement) + "</dd></div>" +
      "<div><dt>Responsable</dt><dd>" + esc(p.responsable || "—") + "</dd></div><div><dt>Priorité</dt><dd>" + UI.pastillePriorite(p.priorite) + "</dd></div><div><dt>État</dt><dd>" + pastilleProbleme(p.statut) + "</dd></div></dl>" +
      '<p class="mt-2"><strong>Description :</strong> ' + esc(p.nature) + "</p>" + (p.prochaineAction ? "<p><strong>Prochaine action :</strong> " + esc(p.prochaineAction) + "</p>" : "") +
      (ouvert ? '<form id="rc-form" novalidate class="rc-pb-actions"><label class="form-label" for="rc-note">Action locale réalisée</label><textarea class="form-control" id="rc-note" name="note" rows="2"></textarea>' +
        '<label class="form-label mt-2" for="rc-proch">Prochaine action</label><input type="text" class="form-control" id="rc-proch" name="prochaine" value="' + esc(p.prochaineAction || "") + '">' +
        '<div class="d-flex flex-wrap gap-2 mt-2"><button type="button" class="btn btn-sm btn-outline-primary" data-rc-pb="noter">Enregistrer l\'action</button>' +
        trans.map(function (s) { return '<button type="button" class="btn btn-sm ' + (s === "Resolu" ? "btn-success" : "btn-outline-secondary") + '" data-rc-pb="statut" data-statut="' + s + '">' + esc(s === "Resolu" ? "Déclarer résolu" : ref.statutsProbleme[s]) + "</button>"; }).join("") + "</div>" +
        '<div class="d-flex flex-wrap gap-2 align-items-end mt-3"><div><label class="form-label" for="rc-dep">Préparer un transfert vers</label><select class="form-select form-select-sm" id="rc-dep" name="departement">' + options(deps, null) + "</select></div>" +
        '<button type="button" class="btn btn-sm btn-outline-secondary" data-rc-pb="transferer">Préparer le transfert</button></div><p class="form-text">Le transfert est tracé ; aucun message n\'est envoyé au département.</p></form>'
        : p.statut === "Resolu" ? '<div class="rc-verifier"><p class="mb-2"><i class="bi bi-person-check me-1"></i>Le problème est déclaré résolu. Vérifiez avec le client que la résolution répond à son besoin.</p>' +
          '<button type="button" class="btn btn-sm btn-success" data-rc-pb="verifier" data-ok="1">Résolution confirmée par le client</button> <button type="button" class="btn btn-sm btn-outline-danger" data-rc-pb="verifier" data-ok="0">Le besoin n\'est pas résolu</button></div>'
        : '<p class="text-muted small">Dossier clôturé.</p>') +
      '<h3 class="ia-sous-titre">Historique</h3><ol class="ia-historique">' + p.historique.slice().reverse().map(function (h) {
        return '<li><time datetime="' + esc(h.date) + '">' + esc(P.dateComplete(h.date)) + "</time><span>" + esc(h.texte) + ' <span class="pr-sous">— ' + esc(h.auteur) + "</span></span></li>";
      }).join("") + "</ol>";
    UI.fenetre("Problème après-vente", corps);
  }

  // ---------- Validation des fenêtres ----------
  document.addEventListener("click", function (e) {
    var m = modale();
    var b = e.target.closest("[data-rc-valider], [data-rc-pb]");
    if (b && m && m.contains(b) && contexte) {
      var f = m.querySelector("#rc-form");
      var v = f ? valeurs(f) : {};
      var quoi = b.dataset.rcValider;
      if (quoi === "cloture") return validerCloture(m);
      if (quoi === "enquete") return validerEnquete(m);
      if (quoi === "reactivation") {
        var r = RC.reactiver(contexte.oppId, { evenement: v.evenement, etape: v.etape });
        if (r.erreur) return afficherErreurs(f, { evenement: r.erreur });
        fermer();
        return P.notifier("Opportunité réactivée : elle reprend le processus commercial normal.", r.annuler);
      }
      if (quoi === "evenement") {
        if (!RC.declarerEvenement(contexte.oppId, v.texte)) return afficherErreurs(f, { texte: "Décrivez l'événement." });
        fermer();
        return P.notifier("Événement enregistré : la situation est proposée à l'examen dans le Centre d'actions.");
      }
      if (quoi === "preciser") {
        var x = RC.preciserMotif(contexte.oppId, { motif: v.motif, origine: v.origine, commentaire: v.commentaire });
        if (x && x.erreurs) return afficherErreurs(f, x.erreurs);
        fermer();
        return P.notifier("Motif mis à jour ; l'ancien motif reste dans l'historique.");
      }
      if (quoi === "suivi") {
        RC.definirSuivi(contexte.oppId, { suiviPossible: v.suiviPossible, dateReprise: v.dateReprise ? P.depuisChampDate(v.dateReprise) : null, conditions: v.conditions });
        fermer();
        return P.notifier(v.suiviPossible ? "Futur suivi enregistré." : "Opportunité classée sans suite.");
      }
      if (quoi === "retour") {
        RC.enregistrerRetour(contexte.oppId, { vehiculeTrouve: v.vehiculeTrouve, raison: v.raison, amelioration: v.amelioration, informerSiDisponible: v.informer ? v.informer === "oui" : null });
        fermer();
        return P.notifier("Retour client enregistré (réception simulée).");
      }
      if (quoi === "probleme") {
        var pr = RC.creerProbleme({ transactionId: v.transactionId, type: v.type, nature: v.nature, departement: v.departement, priorite: v.priorite, prochaineAction: v.prochaineAction, enqueteId: contexte.enqueteId });
        if (pr.erreurs) return afficherErreurs(f, pr.erreurs);
        fermer();
        return P.notifier("Problème enregistré : un dossier de suivi est ouvert.");
      }
      var id = contexte.id, ann = null, ok = "";
      if (b.dataset.rcPb === "noter") { ann = RC.noterActionProbleme(id, v.note, v.prochaine); ok = "Action enregistrée."; if (!ann) return P.notifier("Décrivez l'action réalisée."); }
      else if (b.dataset.rcPb === "statut") { ann = RC.changerStatutProbleme(id, b.dataset.statut, v.note); ok = "État du problème : " + ref.statutsProbleme[b.dataset.statut].toLowerCase() + "."; }
      else if (b.dataset.rcPb === "transferer") { ann = RC.transfererProbleme(id, v.departement, v.note); ok = "Transfert préparé (aucun envoi automatique)."; }
      else if (b.dataset.rcPb === "verifier") { ann = RC.verifierResolution(id, b.dataset.ok === "1"); ok = b.dataset.ok === "1" ? "Résolution vérifiée : dossier clôturé." : "Problème rouvert."; }
      if (ann) { ouvrirDetailProbleme(id); P.notifier(ok, ann); } else P.notifier("Action impossible dans l'état actuel.");
      return;
    }
    var a = e.target.closest("[data-rc]");
    if (!a || a.disabled) return;
    var opp = a.dataset.opp, tid = a.dataset.transaction;
    switch (a.dataset.rc) {
      case "cloturer": return ouvrirCloture(opp || null);
      case "reactiver": return ouvrirReactivation(opp);
      case "evenement": return ouvrirEvenement(opp);
      case "preciser": return ouvrirPreciser(opp);
      case "suivi": return ouvrirSuivi(opp);
      case "retour": return ouvrirRetour(opp);
      case "apercu-retour": return ouvrirApercuRetour();
      case "enquete": return ouvrirEnquete(tid);
      case "probleme": return ouvrirProbleme(tid, a.dataset.enquete, a.dataset.departement);
      case "probleme-detail": return ouvrirDetailProbleme(a.dataset.id);
    }
  });
  // Motif inconnu ⇒ origine inconnue (on ne peut pas confirmer ce qu'on ne sait pas).
  document.addEventListener("change", function (e) {
    var m = modale();
    if (!m || !m.contains(e.target)) return;
    if (e.target.name === "motif" && contexte && (contexte.type === "cloture" || contexte.type === "preciser")) {
      var inc = m.querySelector('input[name="origine"][value="inconnu"]');
      if (e.target.value === "inconnu" && inc) inc.checked = true;
    }
    // Opportunité choisie dans la fenêtre : l'étape atteinte reprend son étape actuelle (modifiable).
    if (e.target.name === "opportunite" && contexte && contexte.type === "cloture") {
      var choisie = P.opportunite(e.target.value);
      if (choisie) m.querySelector('[name="etapeAtteinte"]').value = choisie.etape;
    }
    if (e.target.name === "suiviPossible" && contexte && contexte.type === "cloture") {
      m.querySelector("[data-rc-suivi]").hidden = !e.target.checked;
    }
  });

  window.RelationsUI = {
    pastilleRecuperation: pastilleRecuperation,
    pastilleOrigine: pastilleOrigine,
    pastilleProbleme: pastilleProbleme,
    barre: barre,
    ouvrirCloture: ouvrirCloture,
    ouvrirReactivation: ouvrirReactivation,
    ouvrirEnquete: ouvrirEnquete,
    ouvrirProbleme: ouvrirProbleme,
    ouvrirDetailProbleme: ouvrirDetailProbleme,
    ouvrirRetour: ouvrirRetour,
    questionsRetour: QUESTIONS_RETOUR,
  };
})();
