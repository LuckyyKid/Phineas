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
// La création (POST Creer) et la modification d'un prospect enregistré (POST Modifier) sont réelles,
// enregistrées en base par IServiceProspects ; les autres actions (étape, notes, qualification complète)
// et toute modification d'un prospect fictif restent locales au navigateur pour l'instant.
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

        var resultat = await _prospects.CreerAsync(me.Id, saisie);

        var erreurs = new List<ErreurChamp>(resultat.Erreurs);
        AjouterErreursDeLecture(erreurs);

        if (resultat.Succes && erreurs.Count == 0)
        {
            TempData[CleConfirmation] = $"{saisie.Prenom?.Trim()} {saisie.Nom?.Trim()} a été enregistré dans vos prospects.";
            return RedirectToAction(nameof(Index));
        }

        var modele = await ConstruireAsync(null, false, saisieRefusee: saisie, erreurs: erreurs);
        return modele is null ? Challenge() : View(nameof(Index), modele);
    }

    // "Budget" (clé du ModelState) devient "budget" (attribut name du formulaire).
    private static string NomDuChamp(string cle) =>
        cle.Length == 0 ? "" : char.ToLowerInvariant(cle[0]) + cle.Substring(1);

    public async Task<IActionResult> Fiche(string id)
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
            var acces = await _prospects.ConsulterAsync(me.Id, id);
            if (acces.Introuvable)
                return await FicheIntrouvableAsync(id);
            if (!acces.Succes)
                return ErreurDeLecture();
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

        var resultat = await _prospects.ModifierAsync(me.Id, saisie);
        if (resultat.Introuvable)
            return await FicheIntrouvableAsync(saisie.ProspectId ?? "");

        var erreurs = new List<ErreurChamp>(resultat.Erreurs);
        AjouterErreursDeLecture(erreurs);

        if (resultat.Succes && erreurs.Count == 0)
        {
            TempData[CleConfirmation] = "Modifications enregistrées.";
            return RedirectToAction(nameof(Fiche), new { id = saisie.ProspectId });
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

    // Une valeur illisible (ex. budget non numérique) arrive vide dans la saisie : on le signale aussi.
    private void AjouterErreursDeLecture(List<ErreurChamp> erreurs)
    {
        foreach (var (cle, entree) in ModelState)
        {
            if (entree.Errors.Count > 0)
                erreurs.Add(new ErreurChamp(NomDuChamp(cle), "Valeur invalide."));
        }
    }

    private const string CleConfirmation = "ConfirmationProspect";

    private async Task<ProspectsPageViewModel?> ConstruireAsync(
        string? prospectId,
        bool ouvrirCreation,
        bool avecModules = false,
        NouveauProspectSaisie? saisieRefusee = null,
        List<ErreurChamp>? erreurs = null,
        string? modificationOpportuniteId = null
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
            SaisieRefusee = saisieRefusee,
            ErreursCreation = erreurs ?? [],
            // Une saisie refusée sur la fiche vient du tiroir en mode « Modifier ».
            ModificationProspectId = saisieRefusee is ModificationProspectSaisie ? prospectId : null,
            ModificationOpportuniteId = modificationOpportuniteId,
            ModificationVersion = (saisieRefusee as ModificationProspectSaisie)?.Version,
        };
    }
}
