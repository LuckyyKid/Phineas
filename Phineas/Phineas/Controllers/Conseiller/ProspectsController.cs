using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Phineas.Models.Constants;
using Phineas.Models.ViewModels.Conseiller;
using Phineas.Services.Account;
using Phineas.Services.Commun;
using Phineas.Services.Conseiller;

namespace Phineas.Controllers.Conseiller;

// Les pages reçoivent les prospects en JSON : données de démonstration + prospects enregistrés du conseiller.
// La création d'un prospect (POST Creer) est réelle et enregistrée en base par IServiceProspects ;
// les autres modifications (étape, notes, édition) restent locales au navigateur pour l'instant.
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

        // Une valeur illisible (ex. budget non numérique) arrive vide dans la saisie : on le signale aussi.
        var erreurs = new List<ErreurChamp>(resultat.Erreurs);
        foreach (var (cle, entree) in ModelState)
        {
            if (entree.Errors.Count > 0)
                erreurs.Add(new ErreurChamp(NomDuChamp(cle), "Valeur invalide."));
        }

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

        var modele = await ConstruireAsync(id, false, avecModules: true);
        return modele is null ? Challenge() : View(modele);
    }

    private const string CleConfirmation = "ConfirmationProspect";

    private async Task<ProspectsPageViewModel?> ConstruireAsync(
        string? prospectId,
        bool ouvrirCreation,
        bool avecModules = false,
        NouveauProspectSaisie? saisieRefusee = null,
        List<ErreurChamp>? erreurs = null
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
        };
    }
}
