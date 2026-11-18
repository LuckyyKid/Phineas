using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Phineas.Models.Constants;
using Phineas.Models.ViewModels.Conseiller;
using Phineas.Services.Account;
using Phineas.Services.Conseiller;

namespace Phineas.Controllers.Espaces;

[Authorize(Roles = AppRoles.Conseiller)]
public class ConseillerController : Controller
{
    private readonly IAccountService _account;
    private readonly IServiceTableauBordConseiller _tableauBord;
    private readonly IServiceProspects _prospects;
    private readonly IServiceSoumissions _soumissions;
    private readonly IServiceRendezVous _rendezVous;
    private readonly IServiceTransactions _transactions;

    public ConseillerController(
        IAccountService account,
        IServiceTableauBordConseiller tableauBord,
        IServiceProspects prospects,
        IServiceSoumissions soumissions,
        IServiceRendezVous rendezVous,
        IServiceTransactions transactions
    )
    {
        _account = account;
        _tableauBord = tableauBord;
        _prospects = prospects;
        _soumissions = soumissions;
        _rendezVous = rendezVous;
        _transactions = transactions;
    }

    public async Task<IActionResult> Index()
    {
        var me = await _account.GetSummaryAsync(User);
        if (me is null)
            return Challenge();

        var modele = await _tableauBord.ObtenirAsync(me);
        // Le bloc « Rendez-vous à venir » est rafraîchi depuis l'état local de l'agenda (mêmes données de départ).
        modele.Agenda = new RendezVousPageViewModel
        {
            Prospects = await _prospects.ObtenirAsync(me),
            Soumissions = await _soumissions.ObtenirAsync(me),
            RendezVous = await _rendezVous.ObtenirAsync(me),
            DonneesFictives = true,
            Concession = me.DealershipName,
            ConseillerNom = me.FullName,
            ConseillerCourriel = me.Email,
        };
        modele.Transactions = await _transactions.ObtenirAsync(me);
        return View(modele);
    }
}
