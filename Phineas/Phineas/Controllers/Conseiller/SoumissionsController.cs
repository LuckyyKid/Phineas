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
public class SoumissionsController : Controller
{
    private readonly IAccountService _account;
    private readonly IServiceProspects _prospects;
    private readonly IServiceSoumissions _soumissions;
    private readonly IServiceRendezVous _rendezVous;
    private readonly IServiceTransactions _transactions;

    public SoumissionsController(
        IAccountService account,
        IServiceProspects prospects,
        IServiceSoumissions soumissions,
        IServiceRendezVous rendezVous,
        IServiceTransactions transactions
    )
    {
        _account = account;
        _prospects = prospects;
        _soumissions = soumissions;
        _rendezVous = rendezVous;
        _transactions = transactions;
    }

    public async Task<IActionResult> Index()
    {
        var modele = await ConstruireAsync();
        return modele is null ? Challenge() : View(modele);
    }

    public async Task<IActionResult> Nouvelle(string? opportunite, string? prospect)
    {
        var modele = await ConstruireAsync(opportuniteId: opportunite, prospectId: prospect);
        return modele is null ? Challenge() : View(modele);
    }

    public async Task<IActionResult> Detail(string id)
    {
        if (string.IsNullOrWhiteSpace(id))
            return RedirectToAction(nameof(Index));

        var modele = await ConstruireAsync(soumissionId: id, avecTransactions: true);
        return modele is null ? Challenge() : View(modele);
    }

    private async Task<SoumissionsPageViewModel?> ConstruireAsync(
        string? soumissionId = null,
        string? opportuniteId = null,
        string? prospectId = null,
        bool avecTransactions = false
    )
    {
        var me = await _account.GetSummaryAsync(User);
        if (me is null)
            return null;

        return new SoumissionsPageViewModel
        {
            Prospects = await _prospects.ObtenirAsync(me),
            Soumissions = await _soumissions.ObtenirAsync(me),
            DonneesFictives = true,
            Concession = me.DealershipName,
            ConseillerNom = me.FullName,
            ConseillerCourriel = me.Email,
            SoumissionId = soumissionId,
            OpportuniteId = opportuniteId,
            ProspectId = prospectId,
            RendezVous = avecTransactions ? await _rendezVous.ObtenirAsync(me) : null,
            Transactions = avecTransactions ? await _transactions.ObtenirAsync(me) : null,
        };
    }
}
