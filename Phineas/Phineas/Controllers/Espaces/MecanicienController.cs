using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Phineas.Data;
using Phineas.Models.Constants;
using Phineas.Models.Entities;
using Phineas.Models.ViewModels.Vehicules;
using Phineas.Services.Account;
using Phineas.Services.Vehicules;

namespace Phineas.Controllers.Espaces;

[Authorize(Roles = AppRoles.Mecanicien)]
public class MecanicienController : Controller
{
    private readonly IAccountService _account;
    private readonly ApplicationDbContext _db;
    private readonly IServiceStatut _statut;

    public MecanicienController(IAccountService account, ApplicationDbContext db, IServiceStatut statut)
    {
        _account = account;
        _db = db;
        _statut = statut;
    }

    public async Task<IActionResult> Index()
    {
        var me = await _account.GetSummaryAsync(User);
        return me is null ? Challenge() : View(me);
    }
    
    private int? DealershipId() =>
        int.TryParse(User.FindFirstValue(AppClaims.DealershipId), out var id) ? id : null;
    
    // GET /Mecanicien/Fiche/{jeton}
    [HttpGet]
    public async Task<IActionResult> Fiche(Guid id)
    {
        if (DealershipId() is not int dealershipId) return Forbid();

        var vm = await _db.Vehicules
            .AsNoTracking()
            .Where(v => v.CodeQR!.Jeton == id && v.DealershipId == dealershipId)
            .Select(v => new FicheVehiculeViewModel
            {
                Id = v.Id,
                Jeton = id,
                NumeroStock = v.NumeroStock,
                NIV = v.NIV,
                Marque = v.Marque,
                Modele = v.Modele,
                Annee = v.Annee,
                Emplacement = v.Emplacement,
                StatutActuel = v.StatutActuel,
            })
            .FirstOrDefaultAsync();

        if (vm is null) return NotFound();

        vm.StatutsPermis = _statut.TransitionsPermises(vm.StatutActuel, AppRoles.Of(User));
        return View(vm);
    }

    // POST /Mecanicien/ChangerStatut
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> ChangerStatut(ChangerStatutViewModel form)
    {
        if (DealershipId() is not int dealershipId) return Forbid();

        if (!ModelState.IsValid || form.NouveauStatut is null)
        {
            TempData["Erreur"] = "Choisissez un nouveau statut.";
            return RedirectToAction(nameof(Fiche), new { id = form.Jeton });
        }

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        var resultat = await _statut.ChangerStatutAsync(
            form.VehiculeId, dealershipId, form.NouveauStatut.Value,
            userId, AppRoles.Of(User), form.Commentaire);

        if (resultat.Succes)
            TempData["Succes"] = $"Statut changé : {form.NouveauStatut.Value.Libelle()}.";
        else
            TempData["Erreur"] = resultat.Erreur;

        // Post-Redirect-Get
        return RedirectToAction(nameof(Fiche), new { id = form.Jeton });
    }
}
