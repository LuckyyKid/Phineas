using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Phineas.Models.Constants;
using Phineas.Models.ViewModels.Conseiller;
using Phineas.Services.Account;
using Phineas.Services.Conseiller;

namespace Phineas.Controllers.Conseiller;

// Centre d'actions, suivis et recommandations de véhicules. Les recommandations sont calculées dans le navigateur.
// Seule écriture : la mise en veille d'une recommandation d'un dossier enregistré et sa réactivation (fonctionnalité 14,
// ServiceVeillesRecommandations). Messages : mêmes clés TempData que ProspectsController, affichés par prospects-store.js.
[Authorize(Roles = AppRoles.Conseiller)]
public class IntelligenceController : Controller
{
    private readonly IAccountService _account;
    private readonly IServiceProspects _prospects;
    private readonly IServiceSoumissions _soumissions;
    private readonly IServiceRendezVous _rendezVous;
    private readonly IServiceTransactions _transactions;
    private readonly IServiceIntelligenceCommerciale _intelligence;
    private readonly IServiceVeillesRecommandations _veilles;

    public IntelligenceController(
        IAccountService account,
        IServiceProspects prospects,
        IServiceSoumissions soumissions,
        IServiceRendezVous rendezVous,
        IServiceTransactions transactions,
        IServiceIntelligenceCommerciale intelligence,
        IServiceVeillesRecommandations veilles
    )
    {
        _account = account;
        _prospects = prospects;
        _soumissions = soumissions;
        _rendezVous = rendezVous;
        _transactions = transactions;
        _intelligence = intelligence;
        _veilles = veilles;
    }

    public async Task<IActionResult> Index()
    {
        var modele = await ConstruireAsync();
        return modele is null ? Challenge() : View(modele);
    }

    // « Mes suivis » : vues « À traiter » (recommandations) et « À venir » (suivis enregistrés, SuivisPlanifies).
    public async Task<IActionResult> Suivis()
    {
        var modele = await ConstruireAsync(avecSuivisPlanifies: true);
        return modele is null ? Challenge() : View(modele);
    }

    public async Task<IActionResult> Vehicules(string? opportunite, string? vehicule)
    {
        var modele = await ConstruireAsync(opportunite, vehicule);
        return modele is null ? Challenge() : View(modele);
    }

    // « Mettre en veille » une recommandation d'un dossier enregistré (Centre d'actions) : veille réelle, jamais une
    // réalisation. cle : identifiant de la recommandation ; jours : une des durées proposées ; etape : étape affichée
    // de l'opportunité (refus si elle a changé). retour : adresse locale de la page d'origine, sinon le Centre d'actions.
    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> MettreEnVeille(string? cle, int jours, string? etape, string? retour)
    {
        var me = await _account.GetSummaryAsync(User);
        if (me is null)
            return Challenge();

        var resultat = await _veilles.MettreEnVeilleAsync(me.Id, cle, jours, etape);
        if (resultat.Introuvable)
            return NotFound();

        if (!resultat.Succes)
            TempData[ProspectsController.CleErreur] = "Recommandation non mise en veille. " + resultat.PremierMessage;
        else
            // La durée, pas l'heure de fin : l'heure du serveur n'est pas celle du conseiller (la fin exacte s'affiche
            // dans le navigateur, à l'heure locale, dans l'onglet « Reportées »).
            TempData[ProspectsController.CleConfirmation] = "Recommandation mise en veille pour " + jours + (jours > 1 ? " jours" : " jour") +
                ". Elle n'est pas marquée comme réalisée : le dossier ne change pas.";
        return Retour(retour);
    }

    // « Réactiver » une recommandation en veille : elle revient dans les priorités si sa règle s'applique toujours.
    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> ReactiverVeille(string? cle, string? retour)
    {
        var me = await _account.GetSummaryAsync(User);
        if (me is null)
            return Challenge();

        var resultat = await _veilles.ReactiverAsync(me.Id, cle);
        if (resultat.Introuvable)
            return NotFound();

        if (!resultat.Succes)
            TempData[ProspectsController.CleErreur] = "Recommandation non réactivée. " + resultat.PremierMessage;
        else if (resultat.Valeur)
            TempData[ProspectsController.CleConfirmation] = "Recommandation réactivée : elle revient dans vos priorités si elle s'applique toujours.";
        else
            TempData[ProspectsController.CleConfirmation] = "Cette recommandation n'était plus en veille : rien n'a changé.";
        return Retour(retour);
    }

    private IActionResult Retour(string? retour)
    {
        if (!string.IsNullOrEmpty(retour) && Url.IsLocalUrl(retour))
            return LocalRedirect(retour);
        return RedirectToAction(nameof(Index));
    }

    private async Task<IntelligencePageViewModel?> ConstruireAsync(string? opportuniteId = null, string? vehiculeId = null, bool avecSuivisPlanifies = false)
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
            SuivisPlanifies = avecSuivisPlanifies ? await _prospects.SuivisPlanifiesAsync(me.Id) : [],
        };
    }
}
