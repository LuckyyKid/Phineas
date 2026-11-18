using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Phineas.Models.Constants;
using Phineas.Models.ViewModels.Conseiller;
using Phineas.Services.Account;
using Phineas.Services.Conseiller;

namespace Phineas.Controllers.Conseiller;

// Phase frontend : les pages reçoivent les données de démonstration en JSON
// et toutes les modifications restent locales au navigateur (aucune réservation ni écriture serveur).
[Authorize(Roles = AppRoles.Conseiller)]
public class RendezVousController : Controller
{
    private readonly IAccountService _account;
    private readonly IServiceProspects _prospects;
    private readonly IServiceSoumissions _soumissions;
    private readonly IServiceRendezVous _rendezVous;
    private readonly IServiceTransactions _transactions;

    public RendezVousController(
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

    public async Task<IActionResult> Index(string? date)
    {
        var modele = await ConstruireAsync(date: date);
        return modele is null ? Challenge() : View(modele);
    }

    public async Task<IActionResult> Nouveau(string? opportunite, string? prospect, string? soumission, string? replanifier, string? date, string? type)
    {
        var modele = await ConstruireAsync(
            opportuniteId: opportunite,
            prospectId: prospect,
            soumissionId: soumission,
            replanifier: replanifier,
            date: date,
            type: type
        );
        return modele is null ? Challenge() : View(modele);
    }

    public async Task<IActionResult> Detail(string id)
    {
        if (string.IsNullOrWhiteSpace(id))
            return RedirectToAction(nameof(Index));

        var modele = await ConstruireAsync(rendezVousId: id, avecTransactions: true);
        return modele is null ? Challenge() : View(modele);
    }

    private async Task<RendezVousPageViewModel?> ConstruireAsync(
        string? rendezVousId = null,
        string? opportuniteId = null,
        string? prospectId = null,
        string? soumissionId = null,
        string? replanifier = null,
        string? date = null,
        string? type = null,
        bool avecTransactions = false
    )
    {
        var me = await _account.GetSummaryAsync(User);
        if (me is null)
            return null;

        return new RendezVousPageViewModel
        {
            Prospects = await _prospects.ObtenirAsync(me),
            Soumissions = await _soumissions.ObtenirAsync(me),
            RendezVous = await _rendezVous.ObtenirAsync(me),
            DonneesFictives = true,
            Concession = me.DealershipName,
            ConseillerNom = me.FullName,
            ConseillerCourriel = me.Email,
            RendezVousId = rendezVousId,
            OpportuniteId = opportuniteId,
            ProspectId = prospectId,
            SoumissionId = soumissionId,
            Replanifier = replanifier,
            Date = date,
            Type = type,
            Transactions = avecTransactions ? await _transactions.ObtenirAsync(me) : null,
        };
    }
}
