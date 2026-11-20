using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Phineas.Models.Constants;
using Phineas.Models.ViewModels.Conseiller;
using Phineas.Services.Account;
using Phineas.Services.Conseiller;

namespace Phineas.Controllers.Conseiller;

// Phase frontend : ventes perdues, satisfaction après-vente, réseau de recommandations et statistiques relationnelles.
// Tout est calculé dans le navigateur à partir des données de démonstration ; aucun envoi, aucune écriture serveur.
// « Recommande » est une PRÉVISUALISATION du futur parcours public, réservée au conseiller connecté : aucun lien public.
[Authorize(Roles = AppRoles.Conseiller)]
public class RelationsController : Controller
{
    private readonly IAccountService _account;
    private readonly IServiceProspects _prospects;
    private readonly IServiceSoumissions _soumissions;
    private readonly IServiceRendezVous _rendezVous;
    private readonly IServiceTransactions _transactions;
    private readonly IServiceIntelligenceCommerciale _intelligence;

    public RelationsController(
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

    public async Task<IActionResult> Pertes(string? opportunite)
    {
        var modele = await ConstruireAsync(opportuniteId: opportunite);
        return modele is null ? Challenge() : View(modele);
    }

    public async Task<IActionResult> Satisfaction(string? transaction)
    {
        var modele = await ConstruireAsync(transactionId: transaction);
        return modele is null ? Challenge() : View(modele);
    }

    public async Task<IActionResult> Reseau(string? transaction, string? onglet)
    {
        var modele = await ConstruireAsync(transactionId: transaction, onglet: onglet);
        return modele is null ? Challenge() : View(modele);
    }

    public async Task<IActionResult> Statistiques()
    {
        var modele = await ConstruireAsync();
        return modele is null ? Challenge() : View(modele);
    }

    // Prévisualisation du parcours d'un prospect recommandé : seules les informations publiques du conseiller sont
    // transmises ; aucune donnée de prospect, de client ou de transaction n'est chargée sur cette page.
    public async Task<IActionResult> Recommande()
    {
        var me = await _account.GetSummaryAsync(User);
        if (me is null)
            return Challenge();
        var relations = (await _intelligence.ObtenirAsync(me)).Relations;
        return View(new ApercuRecommandationViewModel
        {
            ConseillerNom = me.FullName,
            Concession = me.DealershipName,
            Profil = relations?.Profil,
        });
    }

    private async Task<RelationsPageViewModel?> ConstruireAsync(string? opportuniteId = null, string? transactionId = null, string? onglet = null)
    {
        var me = await _account.GetSummaryAsync(User);
        if (me is null)
            return null;

        return new RelationsPageViewModel
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
            TransactionId = transactionId,
            Onglet = onglet,
        };
    }
}
