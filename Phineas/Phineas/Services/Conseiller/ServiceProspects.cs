using Phineas.Models.ViewModels.Account;
using Phineas.Models.ViewModels.Conseiller;

namespace Phineas.Services.Conseiller;

public interface IServiceProspects
{
    Task<DonneesProspects> ObtenirAsync(UserSummaryViewModel conseiller);
}
