using Phineas.Models.ViewModels.Account;
using Phineas.Models.ViewModels.Conseiller;

namespace Phineas.Services.Conseiller;

// Relations clients : clôtures d'opportunités perdues, retours volontaires, enquêtes de satisfaction, problèmes après-vente,
// profil commercial et recommandations attribuées. Une implémentation réelle ne devra jamais exposer au client parrain
// d'information sur le dossier du prospect qu'il a recommandé.
public interface IServiceRelationsClients
{
    Task<DonneesRelationsClients> ObtenirAsync(UserSummaryViewModel conseiller);
}
