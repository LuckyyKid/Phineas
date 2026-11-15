using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Phineas.Models.Constants;
using Phineas.Models.ViewModels.Admin;
using Phineas.Services.Admin;

namespace Phineas.Controllers.Admin;

[Authorize(Roles = AppRoles.SystemAdmin)]
public class ConcessionsController : Controller
{
    private readonly IServiceConcessions _concessions;

    public ConcessionsController(IServiceConcessions concessions)
    {
        _concessions = concessions;
    }

    public async Task<IActionResult> Index()
    {
        return View(await _concessions.ListerAsync());
    }

    public async Task<IActionResult> Details(int id)
    {
        var vm = await _concessions.ObtenirDetailsAsync(id);
        return vm is null ? NotFound() : View(vm);
    }

    [HttpGet]
    public IActionResult Creer()
    {
        return View(new ConcessionFormViewModel());
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Creer(ConcessionFormViewModel vm)
    {
        if (!ModelState.IsValid)
            return View(vm);

        var resultat = await _concessions.CreerAsync(vm);
        if (!resultat.Succes)
        {
            ModelState.AjouterErreurs(resultat);
            return View(vm);
        }

        TempData["Succes"] =
            $"Concession « {vm.Nom.Trim()} » créée. Ajoutez maintenant son directeur.";
        return RedirectToAction(nameof(Details), new { id = resultat.Valeur });
    }

    [HttpGet]
    public async Task<IActionResult> Modifier(int id)
    {
        var vm = await _concessions.ObtenirFormulaireAsync(id);
        return vm is null ? NotFound() : View(vm);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Modifier(int id, ConcessionFormViewModel vm)
    {
        vm.Id = id;
        if (!ModelState.IsValid)
            return View(vm);

        var resultat = await _concessions.ModifierAsync(vm);
        if (resultat.Introuvable)
            return NotFound();
        if (!resultat.Succes)
        {
            ModelState.AjouterErreurs(resultat);
            return View(vm);
        }

        TempData["Succes"] = "Concession enregistrée.";
        return RedirectToAction(nameof(Details), new { id });
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> BasculerActivation(int id)
    {
        var resultat = await _concessions.BasculerActivationAsync(id);
        if (resultat.Introuvable)
            return NotFound();

        TempData["Succes"] = resultat.Valeur
            ? "Concession réactivée : son personnel peut de nouveau se connecter."
            : "Concession suspendue : son personnel a été déconnecté et ne peut plus se connecter.";
        return RedirectToAction(nameof(Details), new { id });
    }

    [HttpGet]
    public async Task<IActionResult> Supprimer(int id)
    {
        var vm = await _concessions.ObtenirSuppressionAsync(id);
        return vm is null ? NotFound() : View(vm);
    }

    [HttpPost]
    [ActionName("Supprimer")]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> SupprimerConfirme(int id)
    {
        var resultat = await _concessions.SupprimerAsync(id);
        if (resultat.Introuvable)
            return NotFound();
        if (!resultat.Succes)
        {
            TempData["Erreur"] = resultat.PremierMessage;
            return RedirectToAction(nameof(Details), new { id });
        }

        TempData["Succes"] = "Concession supprimée.";
        return RedirectToAction(nameof(Index));
    }
}
