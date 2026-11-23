using Phineas.Models.ViewModels.Account;
using Phineas.Models.ViewModels.Conseiller;

namespace Phineas.Services.Conseiller;

// Données propres au moteur d'intelligence commerciale : préférences de contact, pauses de suivi, demandes de recherche,
// états des actions. Les recommandations elles-mêmes sont calculées à partir des autres modules.
public interface IServiceIntelligenceCommerciale
{
    Task<DonneesIntelligence> ObtenirAsync(UserSummaryViewModel conseiller);
}
