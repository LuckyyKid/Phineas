// Calculs illustratifs d'une soumission (prototype frontend).
// Tous les montants sont traités en cents entiers et arrondis au cent le plus proche à chaque étape publiée.
// Ces résultats sont des SIMULATIONS : ni une offre de crédit, ni une approbation, ni un calcul fiscal validé.
(function (racine) {
  "use strict";

  function cents(v) {
    var n = Number(v);
    return isFinite(n) ? Math.round(n * 100) : 0;
  }
  function estNombre(v) {
    return v !== null && v !== undefined && v !== "" && isFinite(Number(v));
  }

  // Versement mensuel constant d'un prêt amorti (versements en fin de mois) :
  //   M = P × r / (1 − (1 + r)^−n), r = taux annuel / 12.  Taux nul : M = P / n.
  // Résultat arrondi au cent ; le dernier versement absorberait l'écart d'arrondi.
  function versementMensuel(principalCents, tauxAnnuelPct, dureeMois) {
    if (principalCents <= 0 || dureeMois <= 0) return 0;
    var r = Number(tauxAnnuelPct) / 100 / 12;
    if (r === 0) return Math.round(principalCents / dureeMois);
    return Math.round((principalCents * r) / (1 - Math.pow(1 + r, -dureeMois)));
  }

  // Vérifie les saisies. Les erreurs bloquent l'enregistrement ; les avertissements signalent un calcul incomplet.
  function valider(offre, params) {
    var erreurs = {};
    function borne(champ, v, min, max, message) {
      if (!estNombre(v)) return;
      if (Number(v) < min || Number(v) > max) erreurs[champ] = message;
    }
    if (!estNombre(offre.prixAnnonce) || Number(offre.prixAnnonce) <= 0) erreurs.prixAnnonce = "Indiquez le prix annoncé du véhicule.";
    borne("prixAnnonce", offre.prixAnnonce, 1, 1000000, "Prix hors limites (1 $ à 1 000 000 $).");
    borne("remise", offre.remise, 0, Number(offre.prixAnnonce) || 0, "La remise doit être comprise entre 0 $ et le prix annoncé.");
    borne("miseDeFonds", offre.miseDeFonds, 0, 1000000, "Montant invalide.");
    borne("acompteVerse", offre.acompteVerse, 0, 1000000, "Montant invalide.");
    if (Number(offre.remise) > 0 && !String(offre.motifRemise || "").trim()) erreurs.motifRemise = "Précisez le motif de la remise.";
    if (offre.reprise) {
      if (!String(offre.reprise.vehicule || "").trim()) erreurs.repriseVehicule = "Décrivez le véhicule repris.";
      borne("repriseValeur", offre.reprise.valeurEstimee, 0, 1000000, "Montant invalide.");
      borne("repriseSolde", offre.reprise.soldePret, 0, 1000000, "Montant invalide.");
    }
    if (offre.modeAchat === "financement") {
      if ((params.durees || []).indexOf(Number(offre.dureeMois)) < 0) erreurs.dureeMois = "Choisissez une durée proposée.";
      borne("tauxAnnuel", offre.tauxAnnuel, 0, 30, "Taux hypothétique entre 0 % et 30 %.");
    }
    if (!offre.dateValidite) erreurs.dateValidite = "Indiquez une date de validité.";
    return erreurs;
  }

  function calculer(offre, params) {
    var r = {
      prixAnnonce: cents(offre.prixAnnonce),
      remise: cents(offre.remise),
      options: (offre.options || []).map(function (o) { return { libelle: o.libelle, montant: cents(o.prix) }; }),
      aConfirmer: [],
    };
    r.totalOptions = r.options.reduce(function (s, o) { return s + o.montant; }, 0);
    r.prixApresRemise = r.prixAnnonce - r.remise;
    r.sousTotal = r.prixApresRemise + r.totalOptions;

    // Taxes : estimation simple sur le sous-total, sans aucune règle particulière (notamment pour la reprise).
    if (offre.inclureTaxes) {
      r.tps = Math.round((r.sousTotal * params.tauxTps) / 100);
      r.tvq = Math.round((r.sousTotal * params.tauxTvq) / 100);
      r.taxes = r.tps + r.tvq;
    } else {
      r.taxes = null;
      r.aConfirmer.push("Taxes non incluses dans l'estimation.");
    }
    r.totalEstime = r.sousTotal + (r.taxes || 0);

    // Reprise : le montant net n'est appliqué que si la valeur ET le solde de prêt sont connus.
    r.reprise = null;
    if (offre.reprise) {
      var valeur = estNombre(offre.reprise.valeurEstimee) ? cents(offre.reprise.valeurEstimee) : null;
      var solde = estNombre(offre.reprise.soldePret) ? cents(offre.reprise.soldePret) : null;
      var net = valeur !== null && solde !== null ? valeur - solde : null;
      r.reprise = { vehicule: offre.reprise.vehicule, valeur: valeur, solde: solde, net: net };
      if (net === null) r.aConfirmer.push("Montant net de reprise à confirmer (valeur ou solde de prêt inconnu) : il n'est pas déduit.");
      else if (net < 0) r.aConfirmer.push("Solde de prêt supérieur à la valeur de reprise : traitement à confirmer avec le service F&A.");
    }
    var netApplique = r.reprise && r.reprise.net !== null ? r.reprise.net : 0;

    r.acompte = cents(offre.acompteVerse);
    r.miseDeFonds = cents(offre.miseDeFonds);

    // Comptant : solde restant après acompte et reprise nette.
    r.comptant = { solde: r.totalEstime - r.acompte - netApplique };

    // Financement : montant financé, versement, intérêts et coût total.
    var f = { dureeMois: Number(offre.dureeMois) || 0, taux: estNombre(offre.tauxAnnuel) ? Number(offre.tauxAnnuel) : null };
    f.montantFinance = r.totalEstime - r.acompte - r.miseDeFonds - netApplique;
    if (f.montantFinance < 0) {
      f.etat = "negatif";
    } else if (f.taux === null) {
      f.etat = "taux-manquant";
    } else if (f.dureeMois <= 0) {
      f.etat = "duree-manquante";
    } else {
      f.etat = "ok";
      f.versement = versementMensuel(f.montantFinance, f.taux, f.dureeMois);
      f.totalVersements = f.taux === 0 ? f.montantFinance : f.versement * f.dureeMois;
      f.interets = Math.max(0, f.totalVersements - f.montantFinance);
      f.coutTotal = f.totalVersements + r.miseDeFonds + r.acompte + netApplique;
    }
    r.financement = f;
    return r;
  }

  // Applique un scénario (mode, mise de fonds, durée, taux, reprise) à une offre, sans la modifier.
  function scenario(offre, sc) {
    var o = JSON.parse(JSON.stringify(offre));
    o.modeAchat = sc.modeAchat;
    o.miseDeFonds = sc.modeAchat === "comptant" ? 0 : sc.miseDeFonds;
    o.dureeMois = sc.dureeMois;
    o.tauxAnnuel = sc.tauxAnnuel;
    if (!sc.avecReprise) o.reprise = null;
    return o;
  }

  var api = { cents: cents, versementMensuel: versementMensuel, valider: valider, calculer: calculer, scenario: scenario };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else racine.SoumissionsCalcul = api;
})(this);
