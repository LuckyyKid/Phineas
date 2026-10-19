using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Phineas.Models.ViewModels.Account;
using Phineas.Services.Account;

namespace Phineas.Controllers.Account;

public class AccountController : Controller
{
    private readonly IAccountService _account;

    public AccountController(IAccountService account) => _account = account;

    [AllowAnonymous]
    [HttpGet]
    public IActionResult Login(string? returnUrl = null)
    {
        if (User.Identity?.IsAuthenticated == true)
            return RedirectToAction(nameof(Home));

        ViewData["ReturnUrl"] = returnUrl;
        return View(new LoginViewModel());
    }

    [AllowAnonymous]
    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Login(LoginViewModel vm, string? returnUrl = null)
    {
        ViewData["ReturnUrl"] = returnUrl;

        if (ModelState.IsValid)
        {
            var result = await _account.LoginAsync(vm.Email, vm.Password, vm.RememberMe);
            if (result == LoginResult.Success)
            {
                if (Url.IsLocalUrl(returnUrl))
                    return LocalRedirect(returnUrl);
                return RedirectToAction(nameof(Home));
            }
            ModelState.AddModelError(string.Empty, _account.MessageFor(result));
        }

        return View(vm);
    }

    [HttpGet]
    public IActionResult Home() => RedirectToAction("Index", _account.GetLandingController(User));

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Logout()
    {
        await _account.LogoutAsync();
        return RedirectToAction("Index", "Home");
    }

    [AllowAnonymous]
    [HttpGet]
    public IActionResult AccessDenied() => View();
}
