using Phineas.Models.ViewModels.Account;
using Phineas.Models.ViewModels.Conseiller;

namespace Phineas.Services.Conseiller;

public interface IServiceRendezVous
{
    Task<DonneesRendezVous> ObtenirAsync(UserSummaryViewModel conseiller);
}
