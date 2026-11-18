// Parcours « Nouveau rendez-vous » (et replanification) : 1. client et contexte, 2. type, 3. planification, 4. véhicule.
(function () {
  "use strict";

  var R = window.RendezVous, P = window.Prospects, S = window.Soumissions, UI = window.RendezVousUI;
  var racine = document.getElementById("parcours");
  if (!R || !P || !S || !UI || !racine) return;
  var esc = P.esc;

  var etat = {
    etape: 1, etapeMax: 1,
    prospectId: null, oppId: null, soumissionId: null, type: null, vehiculeId: null,
    chevauchementAccepte: false,
  };
  var ancien = racine.dataset.replanifier ? R.rdv(racine.dataset.replanifier) : null;
  var form = document.getElementById("form-planification");
  var aide = racine.querySelector("[data-aide]");

  function zone(nom) {
    return racine.querySelector('[data-zone="' + nom + '"]');
  }
  function normaliser(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  function exigeVehicule() {
    return etat.type === "EssaiRoutier";
  }

  // ---------- Étape 1 : client, opportunité, soumission ----------
  var rechercheClient = document.getElementById("n-recherche-client");
  function rendreClients() {
    var q = normaliser(rechercheClient.value.trim());
    var contacts = P.contacts().filter(function (c) {
      return !q || normaliser(c.prenom + " " + c.nom + " " + (c.courriel || "")).indexOf(q) >= 0;
    }).sort(function (a, b) {
      var actA = P.opportunitesDe(a.id).some(P.estActive) ? 0 : 1, actB = P.opportunitesDe(b.id).some(P.estActive) ? 0 : 1;
      return actA - actB || (a.nom + a.prenom).localeCompare(b.nom + b.prenom, "fr-CA");
    });
    zone("clients").innerHTML = contacts.length ? contacts.map(function (c) {
      var actives = P.opportunitesDe(c.id).filter(P.estActive).length;
      var choisi = c.id === etat.prospectId;
      return '<button type="button" role="radio" aria-checked="' + choisi + '" class="so-choix' + (choisi ? " is-active" : "") + '" data-prospect="' + esc(c.id) + '">' +
        '<span class="avatar">' + esc(P.initiales(c)) + "</span><span><strong>" + esc(c.prenom + " " + c.nom) + "</strong>" +
        '<span class="pr-sous d-block">' + (actives ? actives + " opportunité" + (actives > 1 ? "s" : "") + " active" + (actives > 1 ? "s" : "") : "Aucune opportunité active") + "</span></span></button>";
    }).join("") : '<div class="sv-empty"><span>Aucun prospect trouvé.</span></div>';
  }
  function rendreOpportunites() {
    var z = zone("opportunites");
    if (!etat.prospectId) return;
    var opps = P.opportunitesDe(etat.prospectId);
    if (!opps.length) {
      z.innerHTML = '<p class="text-muted mb-0">Ce prospect n\'a aucune opportunité. Créez-en une depuis sa fiche.</p>';
      return;
    }
    z.innerHTML = '<div class="so-opps" role="radiogroup" aria-label="Opportunité">' + opps.map(function (o) {
      var active = P.estActive(o);
      var choisie = o.id === etat.oppId;
      var aVenir = R.parOpportunite(o.id).filter(function (r) { return R.estActif(r) && R.fin(r) >= new Date(); }).length;
      return '<button type="button" role="radio" aria-checked="' + choisie + '" class="so-choix' + (choisie ? " is-active" : "") + '" data-opp="' + esc(o.id) + '"' + (active ? "" : ' disabled aria-disabled="true"') + ">" +
        "<span><strong>" + esc(o.titre) + '</strong> <span class="status-pill sv-et-' + esc(o.etape) + '">' + esc(P.libelleEtape(o.etape)) + "</span>" +
        '<span class="pr-sous d-block">' + esc(P.resumeVehicule(o) || "Véhicule à préciser") +
        (aVenir ? " · " + aVenir + " rendez-vous à venir" : "") + (active ? "" : " · opportunité clôturée") + "</span></span></button>";
    }).join("") + "</div>";
  }
  function rendreSoumissions() {
    var carte = zone("carte-soumissions");
    var liste = etat.oppId ? S.parOpportunite(etat.oppId) : [];
    carte.hidden = !etat.oppId;
    if (!etat.oppId) return;
    var options = [{ id: "", titre: "Aucune soumission", detail: "Un rendez-vous peut avoir lieu sans soumission préalable." }].concat(liste.map(function (s) {
      var v = S.versionCourante(s);
      return { id: s.id, titre: s.reference + " · " + S.libelleStatut(v.statut), detail: S.nomVehicule(v.vehicule) + " · version " + v.numero };
    }));
    zone("soumissions").innerHTML = '<div class="so-opps" role="radiogroup" aria-label="Soumission associée">' + options.map(function (x) {
      var choisie = (etat.soumissionId || "") === x.id;
      return '<button type="button" role="radio" aria-checked="' + choisie + '" class="so-choix' + (choisie ? " is-active" : "") + '" data-soumission="' + esc(x.id) + '">' +
        "<span><strong>" + esc(x.titre) + '</strong><span class="pr-sous d-block">' + esc(x.detail) + "</span></span></button>";
    }).join("") + "</div>";
  }
  function rendreContexte() {
    var z = zone("contexte");
    var o = etat.oppId && P.opportunite(etat.oppId);
    z.hidden = !o;
    if (!o) return;
    var c = P.contact(o.prospectId);
    var q = o.qualification || {};
    function ligne(t, v) {
      return "<div><dt>" + esc(t) + "</dt><dd>" + (v ? esc(v) : UI.A_VERIFIER) + "</dd></div>";
    }
    z.innerHTML = '<div class="card-header sv-card-header"><span><i class="bi bi-clipboard-data me-2"></i>Préférences et contexte</span><span class="pr-sous">Repris du dossier</span></div>' +
      '<dl class="pr-liste-def so-besoins">' +
      ligne("Moyen de contact préféré", UI.moyenPrefere(c)) +
      ligne("Coordonnée", UI.coordonnee(c)) +
      ligne("Véhicule recherché", P.resumeVehicule(o)) +
      ligne("Budget indicatif", P.resumeBudget(q)) +
      ligne("Horizon d'achat", P.libelle("horizons", q.horizon)) +
      ligne("Prochaine action prévue", o.prochaineAction) +
      "</dl>";
  }

  // ---------- Étape 2 : type ----------
  function rendreTypes() {
    zone("types").innerHTML = R.ref.types.map(function (t) {
      var choisi = t.cle === etat.type;
      return '<button type="button" role="radio" aria-checked="' + choisi + '" class="rv-type-choix' + (choisi ? " is-active" : "") + '" data-type="' + esc(t.cle) + '">' +
        '<i class="bi ' + esc(t.icone) + '" aria-hidden="true"></i><span>' + esc(t.libelle) + "</span>" +
        (t.cle === "EssaiRoutier" ? '<small>Véhicule obligatoire</small>' : t.cle === "Financement" || t.cle === "Livraison" ? "<small>Événement d'agenda seulement</small>" : "") +
        "</button>";
    }).join("");
  }

  // ---------- Étape 3 : planification ----------
  function creneau() {
    var d = form.elements.date.value, h = form.elements.heure.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(h)) return null;
    var p = d.split("-"), t = h.split(":");
    var debut = new Date(+p[0], +p[1] - 1, +p[2], +t[0], +t[1]);
    return isNaN(debut) ? null : { debut: debut, dureeMinutes: Number(form.elements.duree.value) };
  }
  function modeChoisi() {
    var x = form.querySelector('input[name="mode"]:checked');
    return x ? x.value : null;
  }
  function verification() {
    var c = creneau();
    if (!c) return null;
    return R.conflits({ id: null, exclure: ancien ? ancien.id : null, debut: c.debut, dureeMinutes: c.dureeMinutes, conseillerId: form.elements.conseiller.value, vehiculeId: etat.vehiculeId });
  }
  function rendreVerification() {
    var c = creneau();
    var fin = c ? new Date(c.debut.getTime() + c.dureeMinutes * 60000) : null;
    document.getElementById("p-fin").textContent = fin ? R.heure(fin) + (R.memeJour(fin, c.debut) ? "" : " (le lendemain)") : "—";
    var z = zone("verification");
    if (!c) { z.innerHTML = '<p class="text-muted mb-0">Indiquez une date et une heure.</p>'; return; }
    var v = verification();
    var html = '<p class="mb-2"><strong>' + esc(R.jourTexte(c.debut)) + "</strong>, " + esc(R.heure(c.debut)) + " – " + esc(R.heure(fin)) + "</p>";
    var lignes = [];
    if (v.passe) lignes.push({ niveau: "critique", texte: "Le créneau sélectionné est dans le passé." });
    v.conseiller.forEach(function (r) {
      lignes.push({ niveau: "attention", texte: "Le conseiller a déjà un rendez-vous de " + R.plage(r) + " (" + UI.nomClient(r) + ", " + R.type(r.type).libelle.toLowerCase() + ")." });
    });
    if (etat.vehiculeId) v.vehicule.forEach(function (r) {
      lignes.push({ niveau: "critique", texte: "Le véhicule choisi est déjà prévu de " + R.plage(r) + " (" + UI.nomClient(r) + ")." });
    });
    html += lignes.length ? UI.alertes(lignes) : '<p class="rv-ok mb-0"><i class="bi bi-check-circle-fill me-1"></i>Aucun conflit détecté dans l\'agenda de démonstration.</p>';
    if (v.conseiller.length) {
      html += '<div class="form-check mt-2"><input class="form-check-input" type="checkbox" id="p-chevauchement"' + (etat.chevauchementAccepte ? " checked" : "") + ' />' +
        '<label class="form-check-label" for="p-chevauchement">Je confirme vouloir planifier ce chevauchement (exceptionnel).</label></div>';
    }
    html += '<p class="pr-note mt-3 mb-0">Vérification faite sur les rendez-vous de démonstration de cet onglet : elle ne garantit pas une disponibilité réelle.</p>';
    z.innerHTML = html;
  }
  function dateParDefaut() {
    var demandee = racine.dataset.date && /^\d{4}-\d{2}-\d{2}$/.test(racine.dataset.date) ? racine.dataset.date : null;
    var m = new Date();
    if (demandee && demandee !== P.aujourdhuiChamp()) return { date: demandee, heure: "10:00" };
    var t = new Date(m.getTime() + 30 * 60000);
    var debut = new Date(t.getFullYear(), t.getMonth(), t.getDate(), t.getHours(), t.getMinutes() < 30 ? 30 : 60);
    if (debut.getHours() >= R.heureFermeture || !R.memeJour(debut, m)) {
      var demain = new Date(m.getFullYear(), m.getMonth(), m.getDate() + 1, 9, 0);
      return { date: P.versChampDate(demain), heure: "09:00" };
    }
    return { date: P.versChampDate(debut), heure: String(debut.getHours()).padStart(2, "0") + ":" + String(debut.getMinutes()).padStart(2, "0") };
  }
  function definirMode(mode) {
    var x = document.getElementById("p-mode-" + mode);
    if (x) x.checked = true;
    var lieu = form.elements.lieu;
    if (mode === "concession" && !lieu.value) lieu.value = R.lieuParDefaut;
    if (mode !== "concession" && lieu.value === R.lieuParDefaut) lieu.value = "";
  }

  // ---------- Étape 4 : véhicule ----------
  var rechercheVehicule = document.getElementById("n-recherche-vehicule");
  function vehiculeSoumission() {
    var s = etat.soumissionId && S.soumission(etat.soumissionId);
    return s ? S.versionCourante(s).vehicule.id : null;
  }
  function rendreVehicules() {
    var c = creneau();
    var o = P.opportunite(etat.oppId);
    var deSoumission = vehiculeSoumission();
    zone("rappel-vehicule").innerHTML = (exigeVehicule() ? '<strong><i class="bi bi-speedometer me-1"></i>Essai routier : un véhicule est obligatoire.</strong> ' : "Véhicule facultatif pour ce type de rendez-vous. ") +
      (o ? "Besoin : " + esc(P.resumeVehicule(o) || "à préciser") : "");
    var qr = normaliser(rechercheVehicule.value.trim());
    var liste = S.inventaire().filter(function (v) {
      return !qr || normaliser([v.marque, v.modele, v.version, v.annee, v.numeroStock].join(" ")).indexOf(qr) >= 0;
    }).sort(function (a, b) {
      var pa = a.id === deSoumission ? 0 : 1, pb = b.id === deSoumission ? 0 : 1;
      var sa = R.etatVehicule(a, etat.type, vehiculeSoumission()).selectionnable ? 0 : 1, sb = R.etatVehicule(b, etat.type, vehiculeSoumission()).selectionnable ? 0 : 1;
      return pa - pb || sa - sb || a.prixDemande - b.prixDemande;
    });
    var aucun = exigeVehicule() ? "" : '<button type="button" role="radio" aria-checked="' + !etat.vehiculeId + '" class="so-vehicule rv-sans-vehicule' + (!etat.vehiculeId ? " is-active" : "") + '" data-vehicule="">' +
      '<span class="so-photo"><i class="bi bi-slash-circle"></i></span><span class="so-vehicule-corps"><strong>Aucun véhicule</strong><span class="pr-sous d-block">Le rendez-vous ne porte pas sur un véhicule précis.</span></span></button>';
    zone("vehicules").innerHTML = aucun + liste.map(function (v) {
      var ev = R.etatVehicule(v, etat.type, vehiculeSoumission());
      var conflitsV = c ? R.conflits({ exclure: ancien ? ancien.id : null, debut: c.debut, dureeMinutes: c.dureeMinutes, conseillerId: "__aucun", vehiculeId: v.id }).vehicule : [];
      var bloque = !ev.selectionnable || conflitsV.length > 0;
      var choisi = v.id === etat.vehiculeId;
      var raison = !ev.selectionnable ? ev.message : conflitsV.length ? "Déjà prévu de " + conflitsV.map(function (r) { return R.plage(r) + " (" + UI.nomClient(r) + ")"; }).join(", ") + " : non sélectionnable sur ce créneau." : ev.niveau === "attention" ? ev.message : "";
      return '<button type="button" role="radio" aria-checked="' + choisi + '" class="so-vehicule' + (choisi ? " is-active" : "") + '" data-vehicule="' + esc(v.id) + '"' + (bloque ? ' disabled aria-disabled="true"' : "") + ">" +
        '<span class="so-photo"><i class="bi bi-car-front"></i><small>Photo non disponible</small></span>' +
        '<span class="so-vehicule-corps"><span class="so-vehicule-tete"><strong>' + esc(v.annee + " " + v.marque + " " + v.modele) + "</strong>" + UI.pastilleVehicule(v.statutActuel) + "</span>" +
        '<span class="pr-sous d-block">' + esc([v.version, v.neuf ? "Neuf" : v.kilometrage.toLocaleString("fr-CA") + " km", v.carburant].filter(Boolean).join(" · ")) + "</span>" +
        '<span class="so-vehicule-prix">' + esc(P.argent(v.prixDemande)) + "<small>N° " + esc(v.numeroStock) + "</small></span>" +
        '<span class="pr-sous d-block">' + esc((v.caracteristiques || []).join(" · ")) + "</span>" +
        (v.id === deSoumission ? '<span class="so-pertinence"><i class="bi bi-file-earmark-text"></i>Véhicule de la soumission</span>' : "") +
        (raison ? '<span class="so-alerte"><i class="bi bi-exclamation-triangle"></i>' + esc(raison) + "</span>" : "") +
        "</span></button>";
    }).join("");
    rendreRecapitulatif();
  }
  function rendreRecapitulatif() {
    var c = creneau();
    var o = P.opportunite(etat.oppId);
    var v = etat.vehiculeId ? S.vehicule(etat.vehiculeId) : null;
    var s = etat.soumissionId ? S.soumission(etat.soumissionId) : null;
    var cons = P.conseiller(form.elements.conseiller.value);
    var alertes = [];
    if (v) {
      var ev = R.etatVehicule(v, etat.type, vehiculeSoumission());
      if (ev.niveau !== "ok") alertes.push({ niveau: ev.niveau === "bloque" ? "critique" : "attention", texte: ev.message });
    } else if (exigeVehicule()) alertes.push({ niveau: "critique", texte: "Choisissez le véhicule de l'essai." });
    var verif = verification();
    if (verif && verif.conseiller.length) alertes.push({ niveau: "attention", texte: "Chevauchement avec " + verif.conseiller.length + " rendez-vous du conseiller" + (etat.chevauchementAccepte ? " (accepté)." : " : à confirmer à l'étape 3.") });
    zone("recapitulatif").innerHTML = '<dl class="pr-liste-def pr-liste-def-compacte">' +
      "<div><dt>Client</dt><dd>" + esc(etat.prospectId ? UI.nomClient({ prospectId: etat.prospectId }) : "—") + "</dd></div>" +
      "<div><dt>Opportunité</dt><dd>" + esc(o ? o.titre : "—") + "</dd></div>" +
      "<div><dt>Type</dt><dd>" + esc(etat.type ? R.type(etat.type).libelle : "—") + "</dd></div>" +
      "<div><dt>Créneau</dt><dd>" + (c ? esc(R.jourTexte(c.debut) + ", " + R.heure(c.debut) + " – " + R.heure(new Date(c.debut.getTime() + c.dureeMinutes * 60000))) : "—") + "</dd></div>" +
      "<div><dt>Lieu</dt><dd>" + esc([R.libelle("modes", modeChoisi()), form.elements.lieu.value.trim()].filter(Boolean).join(" · ") || "—") + "</dd></div>" +
      "<div><dt>Conseiller</dt><dd>" + esc(cons.nom) + "</dd></div>" +
      "<div><dt>Soumission</dt><dd>" + esc(s ? s.reference : "Aucune") + "</dd></div>" +
      "<div><dt>Véhicule</dt><dd>" + (v ? esc(S.nomVehicule(v)) + '<span class="pr-sous d-block">N° ' + esc(v.numeroStock) + (v.emplacement ? " · " + esc(v.emplacement) : "") + "</span>" : "Aucun") + "</dd></div>" +
      "</dl>" + UI.alertes(alertes) +
      '<p class="pr-note mb-0 mt-2">Le rendez-vous sera enregistré localement dans cet onglet, au statut « Planifié ». Aucune réservation réelle n\'est faite.</p>';
  }

  // ---------- Navigation ----------
  function erreurEtape(n) {
    if (n === 1 && !etat.prospectId) return "Choisissez un prospect.";
    if (n === 1 && !etat.oppId) return "Choisissez une opportunité active.";
    if (n === 2 && !etat.type) return "Choisissez le type de rendez-vous.";
    if (n === 3) {
      var c = creneau();
      [form.elements.date, form.elements.heure].forEach(function (x) { x.classList.remove("is-invalid"); });
      if (!c) {
        (form.elements.date.value ? form.elements.heure : form.elements.date).classList.add("is-invalid");
        return "Indiquez une date et une heure valides.";
      }
      if (!modeChoisi()) return "Choisissez le moyen de rencontre.";
      var v = verification();
      if (v.passe) {
        form.elements.date.classList.add("is-invalid");
        form.querySelector('[data-message="date"]').textContent = "Le créneau est dans le passé.";
        return "Le créneau sélectionné est dans le passé.";
      }
      if (v.conseiller.length && !etat.chevauchementAccepte) return "Corrigez le créneau ou confirmez explicitement le chevauchement.";
    }
    if (n === 4) {
      if (exigeVehicule() && !etat.vehiculeId) return "Un essai routier exige un véhicule.";
      if (etat.vehiculeId) {
        var ve = S.vehicule(etat.vehiculeId);
        if (!R.etatVehicule(ve, etat.type, vehiculeSoumission()).selectionnable) return "Ce véhicule n'est pas disponible.";
        var vv = verification();
        if (vv && vv.vehicule.length) return "Ce véhicule est déjà prévu sur ce créneau.";
      }
    }
    return null;
  }
  function allerA(n) {
    for (var i = 1; i < n; i++) {
      var err = erreurEtape(i);
      if (err) { aide.textContent = err; n = i; break; }
    }
    if (n === etat.etape && aide.textContent) { rendre(); return; }
    aide.textContent = "";
    etat.etape = n;
    etat.etapeMax = Math.max(etat.etapeMax, n);
    rendre();
    var section = racine.querySelector('[data-etape="' + n + '"]');
    section.setAttribute("tabindex", "-1");
    section.focus({ preventScroll: true });
    section.scrollIntoView({ block: "nearest" });
  }
  function rendre() {
    racine.querySelectorAll("[data-etape]").forEach(function (s) { s.hidden = Number(s.dataset.etape) !== etat.etape; });
    racine.querySelectorAll(".so-etapes li").forEach(function (li, i) {
      var n = i + 1;
      li.classList.toggle("is-active", n === etat.etape);
      li.classList.toggle("is-fait", n < etat.etape);
      var b = li.querySelector("button");
      b.disabled = n > etat.etapeMax || (ancien && n < 3);
      if (n === etat.etape) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    });
    racine.querySelector("[data-precedent]").hidden = etat.etape === 1 || (ancien && etat.etape === 3);
    racine.querySelector("[data-suivant]").hidden = etat.etape === 4;
    racine.querySelector("[data-creer]").hidden = etat.etape !== 4;
    if (etat.etape === 1) { rendreClients(); rendreOpportunites(); rendreSoumissions(); rendreContexte(); }
    if (etat.etape === 2) rendreTypes();
    if (etat.etape === 3) rendreVerification();
    if (etat.etape === 4) rendreVehicules();
  }
  // Un changement de contexte invalide les étapes suivantes.
  function reinitialiserApres(n) {
    etat.etapeMax = Math.min(etat.etapeMax, n);
  }

  racine.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b || b.disabled) return;
    if (b.dataset.prospect !== undefined && b.dataset.prospect) {
      if (etat.prospectId !== b.dataset.prospect) {
        etat.prospectId = b.dataset.prospect;
        var actives = P.opportunitesDe(etat.prospectId).filter(P.estActive);
        etat.oppId = actives.length === 1 ? actives[0].id : null;
        etat.soumissionId = null;
        reinitialiserApres(1);
      }
      aide.textContent = "";
      rendre();
    } else if (b.dataset.opp) {
      if (etat.oppId !== b.dataset.opp) { etat.oppId = b.dataset.opp; etat.soumissionId = null; reinitialiserApres(1); }
      aide.textContent = "";
      rendre();
    } else if (b.dataset.soumission !== undefined) {
      etat.soumissionId = b.dataset.soumission || null;
      var vs = vehiculeSoumission();
      if (vs && R.etatVehicule(S.vehicule(vs), etat.type, vehiculeSoumission()).selectionnable) etat.vehiculeId = vs;
      rendre();
    } else if (b.dataset.type) {
      etat.type = b.dataset.type;
      if (etat.type !== "EssaiRoutier" && R.avecVehicule.indexOf(etat.type) < 0 && !vehiculeSoumission()) etat.vehiculeId = null;
      reinitialiserApres(2);
      aide.textContent = "";
      rendre();
    } else if (b.dataset.vehicule !== undefined) {
      etat.vehiculeId = b.dataset.vehicule || null;
      aide.textContent = "";
      rendreVehicules();
    } else if (b.dataset.aller) allerA(Number(b.dataset.aller));
    else if (b.hasAttribute("data-suivant")) allerA(etat.etape + 1);
    else if (b.hasAttribute("data-precedent")) allerA(etat.etape - 1);
    else if (b.hasAttribute("data-creer")) creer();
  });
  rechercheClient.addEventListener("input", rendreClients);
  rechercheVehicule.addEventListener("input", rendreVehicules);
  // La case de confirmation du chevauchement est dans le panneau de vérification, hors du formulaire.
  zone("verification").addEventListener("change", function (e) {
    if (e.target.id !== "p-chevauchement") return;
    etat.chevauchementAccepte = e.target.checked;
    aide.textContent = "";
  });
  form.addEventListener("input", function (e) {
    e.target.classList.remove("is-invalid");
    if (["date", "heure", "duree", "conseiller"].indexOf(e.target.name) >= 0) etat.chevauchementAccepte = false;
    if (e.target.name === "mode") definirMode(e.target.value);
    rendreVerification();
  });
  form.addEventListener("change", function (e) {
    if (e.target.name === "duree" || e.target.name === "conseiller") { etat.chevauchementAccepte = false; rendreVerification(); }
  });
  form.addEventListener("submit", function (e) { e.preventDefault(); });

  function creer() {
    for (var n = 1; n <= 4; n++) {
      var err = erreurEtape(n);
      if (err) { aide.textContent = err; if (n !== etat.etape) allerA(n); aide.textContent = err; return; }
    }
    var c = creneau();
    var x = {
      prospectId: etat.prospectId,
      opportuniteId: etat.oppId,
      soumissionId: etat.soumissionId,
      vehiculeId: etat.vehiculeId,
      conseillerId: form.elements.conseiller.value,
      type: etat.type,
      debut: c.debut,
      dureeMinutes: c.dureeMinutes,
      mode: modeChoisi(),
      lieu: form.elements.lieu.value.trim(),
      objectif: form.elements.objectif.value.trim(),
      commentaire: form.elements.commentaire.value.trim(),
      chevauchementAccepte: etat.chevauchementAccepte && verification().conseiller.length > 0,
    };
    var r = ancien ? R.replanifier(ancien.id, x) : R.planifier(x);
    if (!r) { aide.textContent = "Ce rendez-vous ne peut plus être replanifié."; return; }
    window.location.href = R.urlDetail(r.id) + "#apercu";
  }

  // ---------- Préremplissage ----------
  var defaut = dateParDefaut();
  form.elements.date.value = defaut.date;
  form.elements.heure.value = defaut.heure;
  form.elements.duree.value = "45";
  form.elements.conseiller.value = P.moiId;
  form.elements.date.min = P.aujourdhuiChamp();
  definirMode("concession");

  var typeDemande = racine.dataset.type && R.ref.types.some(function (x) { return x.cle === racine.dataset.type; }) ? racine.dataset.type : null;
  if (typeDemande && !racine.dataset.replanifier) etat.type = typeDemande;
  var dsS = racine.dataset.soumission && S.soumission(racine.dataset.soumission);
  var dsO = racine.dataset.opportunite && P.opportunite(racine.dataset.opportunite);
  if (ancien) {
    // Replanification : tout est repris, seul le créneau change.
    etat.prospectId = ancien.prospectId;
    etat.oppId = ancien.opportuniteId;
    etat.soumissionId = ancien.soumissionId;
    etat.type = ancien.type;
    etat.vehiculeId = ancien.vehiculeId && R.etatVehicule(S.vehicule(ancien.vehiculeId), ancien.type, R.vehiculeAttendu(ancien.soumissionId)).selectionnable ? ancien.vehiculeId : null;
    form.elements.duree.value = String(ancien.dureeMinutes);
    form.elements.conseiller.value = ancien.conseillerId;
    definirMode(ancien.mode);
    form.elements.lieu.value = ancien.lieu || "";
    form.elements.objectif.value = ancien.objectif || "";
    form.elements.commentaire.value = ancien.commentaire || "";
    var z = zone("replanification");
    z.hidden = false;
    z.innerHTML = '<i class="bi bi-arrow-repeat"></i><span>Replanification de « ' + esc(R.type(ancien.type).libelle) + " » avec " + esc(UI.nomClient(ancien)) +
      ". Ancien créneau : <strong>" + esc(R.creneauTexte(ancien)) + "</strong> (" + esc(R.statut(ancien.statut).libelle.toLowerCase()) + "). Il reste dans l'historique." + "</span>";
    etat.etape = etat.etapeMax = 3;
    if (!R.peutReplanifier(ancien)) aide.textContent = "Ce rendez-vous a déjà été replanifié ou ne peut plus l'être.";
  } else if (dsS) {
    etat.prospectId = dsS.prospectId;
    var oS = P.opportunite(dsS.opportuniteId);
    if (oS && P.estActive(oS)) etat.oppId = oS.id;
    etat.soumissionId = dsS.id;
    var vS = S.versionCourante(dsS).vehicule.id;
    if (R.etatVehicule(S.vehicule(vS), etat.type, vehiculeSoumission()).selectionnable) etat.vehiculeId = vS;
  } else if (dsO) {
    etat.prospectId = dsO.prospectId;
    if (P.estActive(dsO)) etat.oppId = dsO.id;
    // Véhicule présélectionné (ex. essai depuis les recommandations de véhicules), s'il est sélectionnable.
    var vD = racine.dataset.vehicule && S.vehicule(racine.dataset.vehicule);
    if (vD && R.etatVehicule(vD, etat.type).selectionnable) etat.vehiculeId = vD.id;
  } else if (racine.dataset.prospect && P.contact(racine.dataset.prospect)) {
    etat.prospectId = racine.dataset.prospect;
    var act = P.opportunitesDe(etat.prospectId).filter(P.estActive);
    if (act.length === 1) etat.oppId = act[0].id;
  }
  rendre();
})();
