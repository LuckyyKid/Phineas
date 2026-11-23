using Phineas.Models.ViewModels.Account;
using Phineas.Models.ViewModels.Conseiller;

namespace Phineas.Services.Conseiller;

public interface IServiceSoumissions
{
    Task<DonneesSoumissions> ObtenirAsync(UserSummaryViewModel conseiller);
}
