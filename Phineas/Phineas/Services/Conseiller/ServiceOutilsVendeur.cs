using Phineas.Models.ViewModels.Account;
using Phineas.Models.ViewModels.Conseiller;

namespace Phineas.Services.Conseiller;

// Outils du vendeur : annonces, publications déclarées, liens de provenance, attributions, prospection personnelle et
// historique de l'assistant. Une implémentation réelle devra remplacer la génération déterministe par le service
// d'annonces IA de Phineas (avec validation humaine) et l'attribution par des données de provenance réellement captées.
public interface IServiceOutilsVendeur
{
    Task<DonneesOutilsVendeur> ObtenirAsync(UserSummaryViewModel conseiller);
}
