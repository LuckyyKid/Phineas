using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Phineas.Models.Constants;
using Phineas.Services.Account;
using Phineas.Services.Conseiller;

namespace Phineas.Controllers.Espaces;

[Authorize(Roles = AppRoles.Conseiller)]
public class ConseillerController : Controller
{
    private readonly IAccountService _account;
    private readonly IServiceTableauBordConseiller _tableauBord;

    public ConseillerController(IAccountService account, IServiceTableauBordConseiller tableauBord)
    {
        _account = account;
        _tableauBord = tableauBord;
    }

    public async Task<IActionResult> Index()
    {
        var me = await _account.GetSummaryAsync(User);
        return me is null ? Challenge() : View(await _tableauBord.ObtenirAsync(me));
    }
}
