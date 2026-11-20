using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Phineas.Models.Constants;
using Phineas.Models.ViewModels.Conseiller;
using Phineas.Services.Account;
using Phineas.Services.Conseiller;

namespace Phineas.Controllers.Conseiller;

// Phase frontend : Centre d'actions, suivis et recommandations de véhicules. Les recommandations sont calculées
// dans le navigateur à partir des données de démonstration ; aucun envoi, aucune écriture serveur.
[Authorize(Roles = AppRoles.Conseiller)]
public class IntelligenceController : Controller
{
    private readonly IAccountService _account;
    private readonly IServiceProspects _prospects;
    private readonly IServiceSoumissions _soumissions;
    private readonly IServiceRendezVous _rendezVous;
    private readonly IServiceTransactions _transactions;
    private readonly IServiceIntelligenceCommerciale _intelligence;

    public IntelligenceController(
        IAccountService account,
        IServiceProspects prospects,
        IServiceSoumissions soumissions,
        IServiceRendezVous rendezVous,
        IServiceTransactions transactions,
        IServiceIntelligenceCommerciale intelligence
    )
    {
        _account = account;
        _prospects = prospects;
        _soumissions = soumissions;
        _rendezVous = rendezVous;
        _transactions = transactions;
        _intelligence = intelligence;
    }

    public async Task<IActionResult> Index()
    {
        var modele = await ConstruireAsync();
        return modele is null ? Challenge() : View(modele);
    }

    public async Task<IActionResult> Suivis()
    {
        var modele = await ConstruireAsync();
        return modele is null ? Challenge() : View(modele);
    }

    public async Task<IActionResult> Vehicules(string? opportunite, string? vehicule)
    {
        var modele = await ConstruireAsync(opportunite, vehicule);
        return modele is null ? Challenge() : View(modele);
    }

    private async Task<IntelligencePageViewModel?> ConstruireAsync(string? opportuniteId = null, string? vehiculeId = null)
    {
        var me = await _account.GetSummaryAsync(User);
        if (me is null)
            return null;

        return new IntelligencePageViewModel
        {
            Prospects = await _prospects.ObtenirAsync(me),
            Soumissions = await _soumissions.ObtenirAsync(me),
            RendezVous = await _rendezVous.ObtenirAsync(me),
            Transactions = await _transactions.ObtenirAsync(me),
            Intelligence = await _intelligence.ObtenirAsync(me),
            DonneesFictives = true,
            Concession = me.DealershipName,
            ConseillerNom = me.FullName,
            ConseillerCourriel = me.Email,
            OpportuniteId = opportuniteId,
            VehiculeId = vehiculeId,
        };
    }
}
