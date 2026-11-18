using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Phineas.Models.Constants;
using Phineas.Models.ViewModels.Conseiller;
using Phineas.Services.Account;
using Phineas.Services.Conseiller;

namespace Phineas.Controllers.Conseiller;

// Phase frontend : assistant vendeur, studio d'annonces, acquisition commerciale et performances. Aucune IA, aucune
// plateforme publicitaire ni aucune écriture serveur : tout est calculé dans le navigateur à partir des données de démo.
[Authorize(Roles = AppRoles.Conseiller)]
public class OutilsController : Controller
{
    private readonly IAccountService _account;
    private readonly IServiceProspects _prospects;
    private readonly IServiceSoumissions _soumissions;
    private readonly IServiceRendezVous _rendezVous;
    private readonly IServiceTransactions _transactions;
    private readonly IServiceIntelligenceCommerciale _intelligence;

    public OutilsController(
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

    // ?mode=preparation-rdv&contexte=rendezvous&id=r-camille-essai : ouverture contextualisée depuis une fiche.
    public async Task<IActionResult> Assistant(string? mode, string? contexte, string? id)
    {
        var modele = await ConstruireAsync(m => m with { Mode = mode, ContexteType = contexte, ContexteId = id });
        return modele is null ? Challenge() : View(modele);
    }

    public async Task<IActionResult> Annonces(string? annonce, string? vehicule)
    {
        var modele = await ConstruireAsync(m => m with { AnnonceId = annonce, VehiculeId = vehicule });
        return modele is null ? Challenge() : View(modele);
    }

    public async Task<IActionResult> Acquisition(string? onglet)
    {
        var modele = await ConstruireAsync(m => m with { Onglet = onglet });
        return modele is null ? Challenge() : View(modele);
    }

    public async Task<IActionResult> Performances()
    {
        var modele = await ConstruireAsync(m => m);
        return modele is null ? Challenge() : View(modele);
    }

    private record Options(string? Mode = null, string? ContexteType = null, string? ContexteId = null, string? AnnonceId = null, string? VehiculeId = null, string? Onglet = null);

    private async Task<OutilsPageViewModel?> ConstruireAsync(Func<Options, Options> options)
    {
        var me = await _account.GetSummaryAsync(User);
        if (me is null)
            return null;
        var o = options(new Options());
        return new OutilsPageViewModel
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
            VehiculeId = o.VehiculeId,
            Mode = o.Mode,
            ContexteType = o.ContexteType,
            ContexteId = o.ContexteId,
            AnnonceId = o.AnnonceId,
            Onglet = o.Onglet,
        };
    }
}
