using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Phineas.Models.Constants;
using Phineas.Models.ViewModels.Conseiller;
using Phineas.Services.Account;
using Phineas.Services.Conseiller;

namespace Phineas.Controllers.Conseiller;

// Phase frontend : les pages reçoivent les données de démonstration en JSON
// et toutes les modifications restent locales au navigateur (aucune écriture serveur).
[Authorize(Roles = AppRoles.Conseiller)]
public class ProspectsController : Controller
{
    private readonly IAccountService _account;
    private readonly IServiceProspects _prospects;

    public ProspectsController(IAccountService account, IServiceProspects prospects)
    {
        _account = account;
        _prospects = prospects;
    }

    public async Task<IActionResult> Index(bool nouveau = false)
    {
        var modele = await ConstruireAsync(null, nouveau);
        return modele is null ? Challenge() : View(modele);
    }

    public async Task<IActionResult> Fiche(string id)
    {
        if (string.IsNullOrWhiteSpace(id))
            return RedirectToAction(nameof(Index));

        var modele = await ConstruireAsync(id, false);
        return modele is null ? Challenge() : View(modele);
    }

    private async Task<ProspectsPageViewModel?> ConstruireAsync(string? prospectId, bool ouvrirCreation)
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
        };
    }
}
