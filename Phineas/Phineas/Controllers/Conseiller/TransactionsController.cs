using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Phineas.Models.Constants;
using Phineas.Models.ViewModels.Conseiller;
using Phineas.Services.Account;
using Phineas.Services.Conseiller;

namespace Phineas.Controllers.Conseiller;

// Phase frontend : les pages reçoivent les données de démonstration en JSON et toutes les modifications restent
// locales au navigateur (aucun paiement, aucune décision de financement, aucune écriture serveur).
[Authorize(Roles = AppRoles.Conseiller)]
public class TransactionsController : Controller
{
    private readonly IAccountService _account;
    private readonly IServiceProspects _prospects;
    private readonly IServiceSoumissions _soumissions;
    private readonly IServiceRendezVous _rendezVous;
    private readonly IServiceTransactions _transactions;

    public TransactionsController(
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

    public async Task<IActionResult> Nouvelle(string? opportunite, string? prospect, string? soumission, int? version, string? rendezvous)
    {
        var modele = await ConstruireAsync(
            opportuniteId: opportunite,
            prospectId: prospect,
            soumissionId: soumission,
            version: version,
            rendezVousId: rendezvous
        );
        return modele is null ? Challenge() : View(modele);
    }

    public async Task<IActionResult> Detail(string id)
    {
        if (string.IsNullOrWhiteSpace(id))
            return RedirectToAction(nameof(Index));

        var modele = await ConstruireAsync(transactionId: id);
        return modele is null ? Challenge() : View(modele);
    }

    private async Task<TransactionsPageViewModel?> ConstruireAsync(
        string? transactionId = null,
        string? opportuniteId = null,
        string? prospectId = null,
        string? soumissionId = null,
        int? version = null,
        string? rendezVousId = null
    )
    {
        var me = await _account.GetSummaryAsync(User);
        if (me is null)
            return null;

        return new TransactionsPageViewModel
        {
            Prospects = await _prospects.ObtenirAsync(me),
            Soumissions = await _soumissions.ObtenirAsync(me),
            RendezVous = await _rendezVous.ObtenirAsync(me),
            Transactions = await _transactions.ObtenirAsync(me),
            DonneesFictives = true,
            Concession = me.DealershipName,
            ConseillerNom = me.FullName,
            ConseillerCourriel = me.Email,
            TransactionId = transactionId,
            OpportuniteId = opportuniteId,
            ProspectId = prospectId,
            SoumissionId = soumissionId,
            Version = version,
            RendezVousId = rendezVousId,
        };
    }
}
