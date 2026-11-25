using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Phineas.Models;
using Phineas.Models.Constants;
using Phineas.Models.ViewModels.Conseiller;
using Phineas.Services.Account;
using Phineas.Services.Commun;
using Phineas.Services.Conseiller;

namespace Phineas.Controllers.Conseiller;

// Les pages reçoivent les prospects en JSON : données de démonstration + prospects enregistrés du conseiller.
// La création (POST Creer), la modification d'un prospect enregistré (POST Modifier), le changement d'étape
// d'une opportunité enregistrée (POST ChangerEtape), l'ajout d'une note (POST AjouterNote) et la planification
// du prochain suivi (POST PlanifierSuivi, ou avec une note) et sa réalisation (POST RealiserSuivi) sont réels,
// enregistrés en base par IServiceProspects ; les autres actions (qualification complète, clôture comme perdue,
// autres actions de « Mes suivis ») et toute modification d'un prospect fictif restent locales pour l'instant.
[Authorize(Roles = AppRoles.Conseiller)]
public class ProspectsController : Controller
{
    private readonly IAccountService _account;
    private readonly IServiceProspects _prospects;
    private readonly IServiceSoumissions _soumissions;
    private readonly IServiceRendezVous _rendezVous;
    private readonly IServiceTransactions _transactions;
    private readonly IServiceIntelligenceCommerciale _intelligence;

    public ProspectsController(
        IAccountService account,
        IServiceProspects prospects,
        IServiceSoumissions soumissions,
        IServiceRendezVous rendezVous,
        IServiceTransactions transactions,
        IServiceIntelligenceCommerciale intelligence
    )
    {
        _account = account;
        _prospects = prospects;
        _soumissions = soumissions;
        _rendezVous = rendezVous;
        _transactions = transactions;
        _intelligence = intelligence;
    }

    public async Task<IActionResult> Index(bool nouveau = false)
    {
        var modele = await ConstruireAsync(null, nouveau);
        return modele is null ? Challenge() : View(modele);
    }

    // Tiroir « Nouveau prospect » : enregistrement réel, puis Post/Redirect/Get vers la liste.
    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Creer(NouveauProspectSaisie saisie)
    {
        var me = await _account.GetSummaryAsync(User);
        if (me is null)
            return Challenge();

        // Une valeur illisible (ex. budget non numérique) est refusée avant tout enregistrement,
        // avec les autres erreurs de saisie pour que tout s'affiche d'un coup.
        var erreurs = ErreursDeLecture();
        if (erreurs.Count > 0)
            erreurs.AddRange(ServiceProspects.ErreursDeSaisie(saisie, me.Id));
        else
        {
            var resultat = await _prospects.CreerAsync(me.Id, saisie);
            if (resultat.Succes)
            {
                TempData[CleConfirmation] = $"{saisie.Prenom?.Trim()} {saisie.Nom?.Trim()} a été enregistré dans vos prospects.";
                return RedirectToAction(nameof(Index));
            }
            erreurs = resultat.Erreurs;
        }

        var modele = await ConstruireAsync(null, false, saisieRefusee: saisie, erreurs: erreurs);
        return modele is null ? Challenge() : View(nameof(Index), modele);
    }

    // "Budget" (clé du ModelState) devient "budget" (attribut name du formulaire).
    private static string NomDuChamp(string cle) =>
        cle.Length == 0 ? "" : char.ToLowerInvariant(cle[0]) + cle.Substring(1);

    // opportunite (facultatif) : opportunité à présenter sélectionnée ; le serveur vérifie qu'elle est à ce prospect.
    public async Task<IActionResult> Fiche(string id, string? opportunite)
    {
        if (string.IsNullOrWhiteSpace(id))
            return RedirectToAction(nameof(Index));

        var me = await _account.GetSummaryAsync(User);
        if (me is null)
            return Challenge();

        // Prospect enregistré (« pe-… ») : le serveur vérifie qu'il est dans le dossier du conseiller.
        // Les prospects fictifs restent trouvés par le JavaScript dans les données de démonstration.
        bool estEnregistre = id.StartsWith(ServiceProspects.PrefixeProspect, StringComparison.Ordinal);
        if (estEnregistre)
        {
            var acces = await _prospects.ConsulterAsync(me.Id, id, opportunite);
            if (acces.Introuvable)
                return await FicheIntrouvableAsync(id);
            if (!acces.Succes)
                return ErreurDeLecture();
            ViewData["OpportuniteChoisie"] = opportunite;
        }

        var modele = await ConstruireAsync(id, false, avecModules: true);
        return modele is null ? Challenge() : View(modele);
    }

    // Tiroir « Modifier » d'un prospect enregistré : enregistrement réel, puis Post/Redirect/Get vers sa fiche.
    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Modifier(ModificationProspectSaisie saisie)
    {
        var me = await _account.GetSummaryAsync(User);
        if (me is null)
            return Challenge();

        // Une valeur illisible (ex. budget non numérique) est refusée avant tout enregistrement,
        // avec les autres erreurs de saisie pour que tout s'affiche d'un coup.
        var erreurs = ErreursDeLecture();
        if (erreurs.Count > 0)
            erreurs.AddRange(ServiceProspects.ErreursDeSaisie(saisie, me.Id));
        else
        {
            var resultat = await _prospects.ModifierAsync(me.Id, saisie);
            if (resultat.Introuvable)
                return await FicheIntrouvableAsync(saisie.ProspectId ?? "");
            if (resultat.Succes)
            {
                TempData[CleConfirmation] = "Modifications enregistrées.";
                return RedirectToAction(nameof(Fiche), new { id = saisie.ProspectId });
            }
            erreurs = resultat.Erreurs;
        }

        var modele = await ConstruireAsync(
            saisie.ProspectId,
            false,
            avecModules: true,
            saisieRefusee: saisie,
            erreurs: erreurs,
            modificationOpportuniteId: saisie.OpportuniteId
        );
        return modele is null ? Challenge() : View(nameof(Fiche), modele);
    }

    // Menu « Étape » d'une opportunité enregistrée (fiche ou pipeline de la liste) : changement réel et tracé,
    // puis Post/Redirect/Get vers la page d'origine avec un message de réussite ou de refus.
    // prospectId et retour ne servent qu'à revenir à la bonne page : l'accès est vérifié par le service.
    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> ChangerEtape(string? opportuniteId, string? etape, string? version, string? prospectId, string? retour)
    {
        var me = await _account.GetSummaryAsync(User);
        if (me is null)
            return Challenge();

        var resultat = await _prospects.ChangerEtapeAsync(me.Id, opportuniteId, etape, version);
        if (resultat.Introuvable)
            return NotFound();

        if (!resultat.Succes)
            TempData[CleErreur] = "Étape non modifiée. " + resultat.PremierMessage;
        else if (resultat.Valeur)
            TempData[CleConfirmation] = "Étape enregistrée : « " + LibelleEtape(etape) + " ».";
        else
            TempData[CleConfirmation] = "L'opportunité est déjà à l'étape « " + LibelleEtape(etape) + " » : rien n'a changé.";

        bool versLaFiche = retour == "fiche" && prospectId is not null && prospectId.StartsWith(ServiceProspects.PrefixeProspect, StringComparison.Ordinal);
        if (versLaFiche)
            return RedirectToAction(nameof(Fiche), new { id = prospectId, opportunite = opportuniteId });
        return RedirectToAction(nameof(Index));
    }

    // Fenêtre « Nouvelle opportunité » de la fiche d'un prospect enregistré (fonctionnalité 18) : enregistrement réel,
    // puis Post/Redirect/Get vers la fiche, la nouvelle opportunité sélectionnée. Refus : message, rien d'écrit.
    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> CreerOpportunite(NouvelleOpportuniteSaisie saisie)
    {
        var me = await _account.GetSummaryAsync(User);
        if (me is null)
            return Challenge();

        var resultat = await _prospects.CreerOpportuniteAsync(me.Id, saisie);
        if (resultat.Introuvable)
            return NotFound();
        if (!resultat.Succes)
        {
            TempData[CleErreur] = "Opportunité non créée. " + resultat.PremierMessage;
            return RedirectToAction(nameof(Fiche), new { id = saisie.ProspectId });
        }

        TempData[CleConfirmation] = "Opportunité « " + saisie.Titre?.Trim() + " » créée pour ce prospect.";
        return RedirectToAction(nameof(Fiche), new { id = saisie.ProspectId, opportunite = ServiceProspects.PrefixeOpportunite + resultat.Valeur });
    }

    // Formulaire « Ajouter une note » (onglet Historique) d'un prospect enregistré : enregistrement réel,
    // puis Post/Redirect/Get vers l'historique de la fiche ; en cas de refus, la fiche se rouvre avec la saisie.
    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> AjouterNote(NoteSaisie saisie)
    {
        var me = await _account.GetSummaryAsync(User);
        if (me is null)
            return Challenge();

        // Une valeur illisible (ex. date mal formée) est refusée avant tout enregistrement,
        // avec les autres erreurs de saisie pour que tout s'affiche d'un coup.
        var erreurs = ErreursDeLecture();
        if (erreurs.Count > 0)
            erreurs.AddRange(ServiceProspects.ErreursDeSaisieNote(saisie));
        else
        {
            var resultat = await _prospects.AjouterNoteAsync(me.Id, saisie);
            if (resultat.Introuvable)
                return await FicheIntrouvableAsync(saisie.ProspectId ?? "");
            if (resultat.Succes)
            {
                TempData[CleConfirmation] = resultat.Valeur
                    ? "Note enregistrée."
                    : "Cette note était déjà enregistrée : aucun doublon n'a été créé.";
                string fiche = Url.Action(nameof(Fiche), new { id = saisie.ProspectId })!;
                return Redirect(fiche + "#historique");
            }
            erreurs = resultat.Erreurs;
        }

        var modele = await ConstruireAsync(saisie.ProspectId, false, avecModules: true, noteRefusee: saisie, erreursNote: erreurs);
        return modele is null ? Challenge() : View(nameof(Fiche), modele);
    }

    // Fenêtre « Planifier un suivi » de la fiche : la prochaine action de l'opportunité choisie est remplacée,
    // puis Post/Redirect/Get vers la fiche ; en cas de refus, la fiche se rouvre avec la fenêtre et la saisie.
    [HttpPost]
    [ValidateAntiForgeryToken]
    // [FromForm] : le champ « action » du formulaire ne doit jamais être rempli par la valeur de route « action ».
    public async Task<IActionResult> PlanifierSuivi([FromForm] SuiviSaisie saisie)
    {
        var me = await _account.GetSummaryAsync(User);
        if (me is null)
            return Challenge();

        // Une valeur illisible (ex. date mal formée) est refusée avant tout enregistrement,
        // avec les autres erreurs de saisie pour que tout s'affiche d'un coup.
        var erreurs = ErreursDeLecture();
        if (erreurs.Count > 0)
            erreurs.AddRange(ServiceProspects.ErreursDeSuivi(saisie.Action, saisie.Date, "action", "date", dateObligatoire: true));
        else
        {
            var resultat = await _prospects.PlanifierSuiviAsync(me.Id, saisie);
            if (resultat.Introuvable)
                return await FicheIntrouvableAsync(saisie.ProspectId ?? "");
            if (resultat.Succes)
            {
                TempData[CleConfirmation] = resultat.Valeur
                    ? "Suivi planifié : il devient la prochaine action de l'opportunité (l'action précédente est conservée dans l'historique). Aucun rappel automatique n'est envoyé."
                    : "Ce suivi était déjà planifié : rien n'a changé.";
                return RedirectToAction(nameof(Fiche), new { id = saisie.ProspectId });
            }
            erreurs = resultat.Erreurs;
        }

        var modele = await ConstruireAsync(saisie.ProspectId, false, avecModules: true, suiviRefuse: saisie, erreursSuivi: erreurs);
        return modele is null ? Challenge() : View(nameof(Fiche), modele);
    }

    // « Marquer comme réalisé » d'un suivi enregistré (« Mes suivis », Centre d'actions, fiche) : réalisation réelle et
    // archivée, puis retour à la page d'origine avec un message de réussite ou de refus.
    // retour : adresse locale de la page d'origine (jamais une adresse externe) ; sinon « Mes suivis ».
    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> RealiserSuivi(string? opportuniteId, string? versionSuivi, string? retour)
    {
        var me = await _account.GetSummaryAsync(User);
        if (me is null)
            return Challenge();

        var resultat = await _prospects.RealiserSuiviAsync(me.Id, opportuniteId, versionSuivi);
        if (resultat.Introuvable)
            return NotFound();

        if (!resultat.Succes)
            TempData[CleErreur] = "Suivi non marqué comme réalisé. " + resultat.PremierMessage;
        else if (resultat.Valeur)
            TempData[CleConfirmation] = "Suivi marqué comme réalisé et ajouté à l'historique du dossier.";
        else
            TempData[CleConfirmation] = "Ce suivi était déjà marqué comme réalisé : rien n'a changé.";

        if (!string.IsNullOrEmpty(retour) && Url.IsLocalUrl(retour))
            return LocalRedirect(retour);
        return RedirectToAction("Suivis", "Intelligence");
    }

    // « Reporter » d'un suivi enregistré (« Mes suivis », Centre d'actions, fiche) : nouvelle échéance pour la même
    // action, archivée « Reporté », puis retour à la page d'origine avec un message. L'action reste à faire.
    // retour : adresse locale de la page d'origine (jamais une adresse externe) ; sinon « Mes suivis ».
    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> ReporterSuivi(string? opportuniteId, string? versionSuivi, DateTime? date, string? retour)
    {
        var me = await _account.GetSummaryAsync(User);
        if (me is null)
            return Challenge();

        // Une date illisible est refusée avant tout enregistrement.
        List<ErreurChamp> erreurs = ErreursDeLecture();
        if (erreurs.Count == 0)
        {
            var resultat = await _prospects.ReporterSuiviAsync(me.Id, opportuniteId, versionSuivi, date);
            if (resultat.Introuvable)
                return NotFound();
            if (resultat.Succes && resultat.Valeur)
                TempData[CleConfirmation] = "Suivi reporté au " + date!.Value.ToString("d MMMM yyyy", new System.Globalization.CultureInfo("fr-CA"))
                    + " : l'action reste à faire, le report est ajouté à l'historique du dossier.";
            else if (resultat.Succes)
                TempData[CleConfirmation] = "Ce suivi était déjà reporté à cette date : rien n'a changé.";
            else
                erreurs = resultat.Erreurs;
        }
        if (erreurs.Count > 0)
            TempData[CleErreur] = "Suivi non reporté. " + erreurs[0].Message;

        if (!string.IsNullOrEmpty(retour) && Url.IsLocalUrl(retour))
            return LocalRedirect(retour);
        return RedirectToAction("Suivis", "Intelligence");
    }

    private static string LibelleEtape(string? etape) =>
        Enum.TryParse<EtapeVente>(etape, out var valeur) ? FormatVente.Libelle(valeur) : etape ?? "";

    // Même page « Prospect introuvable » qu'un id inconnu, avec le code 404 : rien n'est révélé
    // sur un prospect d'une autre concession ou d'un autre conseiller.
    private async Task<IActionResult> FicheIntrouvableAsync(string id)
    {
        var modele = await ConstruireAsync(id, false, avecModules: true);
        if (modele is null)
            return Challenge();
        Response.StatusCode = StatusCodes.Status404NotFound;
        return View(nameof(Fiche), modele);
    }

    private IActionResult ErreurDeLecture()
    {
        Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
        var erreur = new ErrorViewModel { RequestId = HttpContext.TraceIdentifier };
        return View("Error", erreur);
    }

    // Valeurs que MVC n'a pas pu lire (ex. budget non numérique) : elles arrivent vides dans la saisie.
    // Les actions les vérifient AVANT d'appeler le service, sinon le reste serait enregistré malgré l'erreur affichée.
    private List<ErreurChamp> ErreursDeLecture()
    {
        var erreurs = new List<ErreurChamp>();
        foreach (var (cle, entree) in ModelState)
        {
            if (entree.Errors.Count > 0)
                erreurs.Add(new ErreurChamp(NomDuChamp(cle), "Valeur invalide."));
        }
        return erreurs;
    }

    // Clés TempData des messages affichés après un Post/Redirect/Get (lues aussi par les pages Intelligence).
    public const string CleConfirmation = "ConfirmationProspect";
    public const string CleErreur = "ErreurProspect";

    private async Task<ProspectsPageViewModel?> ConstruireAsync(
        string? prospectId,
        bool ouvrirCreation,
        bool avecModules = false,
        NouveauProspectSaisie? saisieRefusee = null,
        List<ErreurChamp>? erreurs = null,
        string? modificationOpportuniteId = null,
        NoteSaisie? noteRefusee = null,
        List<ErreurChamp>? erreursNote = null,
        SuiviSaisie? suiviRefuse = null,
        List<ErreurChamp>? erreursSuivi = null
    )
    {
        var me = await _account.GetSummaryAsync(User);
        if (me is null)
            return null;

        return new ProspectsPageViewModel
        {
            Donnees = await _prospects.ObtenirAsync(me),
            DonneesFictives = true,
            ProspectId = prospectId,
            OuvrirCreation = ouvrirCreation,
            Soumissions = avecModules ? await _soumissions.ObtenirAsync(me) : null,
            RendezVous = avecModules ? await _rendezVous.ObtenirAsync(me) : null,
            Transactions = avecModules ? await _transactions.ObtenirAsync(me) : null,
            Intelligence = avecModules ? await _intelligence.ObtenirAsync(me) : null,
            Confirmation = TempData[CleConfirmation] as string,
            Erreur = TempData[CleErreur] as string,
            SaisieRefusee = saisieRefusee,
            ErreursCreation = erreurs ?? [],
            // Une saisie refusée sur la fiche vient du tiroir en mode « Modifier ».
            ModificationProspectId = saisieRefusee is ModificationProspectSaisie ? prospectId : null,
            ModificationOpportuniteId = modificationOpportuniteId,
            ModificationVersion = (saisieRefusee as ModificationProspectSaisie)?.Version,
            NoteRefusee = noteRefusee,
            ErreursNote = erreursNote ?? [],
            SuiviRefuse = suiviRefuse,
            ErreursSuivi = erreursSuivi ?? [],
        };
    }
}
