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
    private readonly IServiceSoumissions _soumissions;
    private readonly IServiceRendezVous _rendezVous;

    public ProspectsController(
        IAccountService account,
        IServiceProspects prospects,
        IServiceSoumissions soumissions,
        IServiceRendezVous rendezVous
    )
    {
        _account = account;
        _prospects = prospects;
        _soumissions = soumissions;
        _rendezVous = rendezVous;
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

        var modele = await ConstruireAsync(id, false, avecModules: true);
        return modele is null ? Challenge() : View(modele);
    }

    private async Task<ProspectsPageViewModel?> ConstruireAsync(string? prospectId, bool ouvrirCreation, bool avecModules = false)
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
        };
    }
}
