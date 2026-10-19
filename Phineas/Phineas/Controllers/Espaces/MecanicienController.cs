using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Phineas.Models.Constants;
using Phineas.Services.Account;

namespace Phineas.Controllers.Espaces;

[Authorize(Roles = AppRoles.Mecanicien)]
public class MecanicienController : Controller
{
    private readonly IAccountService _account;

    public MecanicienController(IAccountService account) => _account = account;

    public async Task<IActionResult> Index()
    {
        var me = await _account.GetSummaryAsync(User);
        return me is null ? Challenge() : View(me);
    }
}
