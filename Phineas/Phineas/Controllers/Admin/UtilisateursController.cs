using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Phineas.Models.Constants;
using Phineas.Models.ViewModels.Admin;
using Phineas.Services.Admin;

namespace Phineas.Controllers.Admin;

[Authorize(Roles = AppRoles.SystemAdmin)]
public class UtilisateursController : Controller
{
    private readonly IServiceUtilisateurs _utilisateurs;

    public UtilisateursController(IServiceUtilisateurs utilisateurs)
    {
        _utilisateurs = utilisateurs;
    }

    private string IdActeur => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

    public async Task<IActionResult> Index(int? dealershipId, string? q)
    {
        return View(await _utilisateurs.ObtenirIndexAsync(dealershipId, q));
    }

    [HttpGet]
    public async Task<IActionResult> Creer(int? dealershipId)
    {
        return View(await _utilisateurs.NouveauFormulaireAsync(dealershipId));
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Creer(UtilisateurFormViewModel vm)
    {
        if (!ModelState.IsValid)
        {
            await _utilisateurs.RemplirListesAsync(vm);
            return View(vm);
        }

        var resultat = await _utilisateurs.CreerAsync(vm);
        if (!resultat.Succes)
        {
            ModelState.AjouterErreurs(resultat);
            await _utilisateurs.RemplirListesAsync(vm);
            return View(vm);
        }

        TempData["MotDePasseTemporaire"] = resultat.Valeur;
        TempData["MotDePassePour"] = vm.Email.Trim();
        TempData["Succes"] = $"Compte de {vm.Prenom.Trim()} {vm.Nom.Trim()} créé.";
        return RetourApresEnregistrement(vm.DealershipId);
    }

    [HttpGet]
    public async Task<IActionResult> Modifier(string id)
    {
        var vm = await _utilisateurs.ObtenirFormulaireAsync(id);
        return vm is null ? NotFound() : View(vm);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Modifier(string id, UtilisateurFormViewModel vm)
    {
        vm.Id = id;
        if (!ModelState.IsValid)
        {
            await _utilisateurs.RemplirListesAsync(vm);
            return View(vm);
        }

        var resultat = await _utilisateurs.ModifierAsync(vm, IdActeur);
        if (resultat.Introuvable)
            return NotFound();
        if (!resultat.Succes)
        {
            ModelState.AjouterErreurs(resultat);
            await _utilisateurs.RemplirListesAsync(vm);
            return View(vm);
        }

        TempData["Succes"] = "Modifications enregistrées.";
        return RetourApresEnregistrement(vm.DealershipId);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> BasculerActivation(string id, string? retour)
    {
        var resultat = await _utilisateurs.BasculerActivationAsync(id, IdActeur);
        if (resultat.Introuvable)
            return NotFound();

        if (resultat.Succes)
            TempData["Succes"] = resultat.Valeur
                ? "Compte réactivé."
                : "Compte désactivé : la personne a été déconnectée.";
        else
            TempData["Erreur"] = resultat.PremierMessage;

        return Retour(retour);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> ReinitialiserMotDePasse(
        string id,
        string? retour,
        string? courriel
    )
    {
        var resultat = await _utilisateurs.ReinitialiserMotDePasseAsync(id);
        if (resultat.Introuvable)
            return NotFound();

        if (resultat.Succes)
        {
            TempData["MotDePasseTemporaire"] = resultat.Valeur;
            TempData["MotDePassePour"] = courriel;
            TempData["Succes"] = "Nouveau mot de passe temporaire généré.";
        }
        else
        {
            TempData["Erreur"] = resultat.PremierMessage;
        }

        return Retour(retour);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Supprimer(string id, string? retour)
    {
        var resultat = await _utilisateurs.SupprimerAsync(id, IdActeur);
        if (resultat.Introuvable)
            return NotFound();

        if (resultat.Succes)
            TempData["Succes"] = "Compte supprimé.";
        else
            TempData["Erreur"] = resultat.PremierMessage;

        return Retour(retour);
    }

    private IActionResult RetourApresEnregistrement(int? dealershipId) =>
        dealershipId is not null
            ? RedirectToAction("Details", "Concessions", new { id = dealershipId })
            : RedirectToAction(nameof(Index));

    private IActionResult Retour(string? retour) =>
        !string.IsNullOrEmpty(retour) && Url.IsLocalUrl(retour)
            ? LocalRedirect(retour)
            : RedirectToAction(nameof(Index));
}
