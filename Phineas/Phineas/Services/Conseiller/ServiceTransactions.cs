using Phineas.Models.ViewModels.Account;
using Phineas.Models.ViewModels.Conseiller;

namespace Phineas.Services.Conseiller;

// Ce qu'un conseiller peut voir de ses dossiers d'achat. Une implémentation réelle devra filtrer côté serveur
// tout contenu réservé à F&A (revenus, renseignements bancaires, NAS, rapport de crédit, documents financiers).
public interface IServiceTransactions
{
    Task<DonneesTransactions> ObtenirAsync(UserSummaryViewModel conseiller);
}
