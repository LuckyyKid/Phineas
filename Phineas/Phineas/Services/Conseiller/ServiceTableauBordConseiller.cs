using Phineas.Models.ViewModels.Account;
using Phineas.Models.ViewModels.Conseiller;

namespace Phineas.Services.Conseiller;

public interface IServiceTableauBordConseiller
{
    Task<TableauBordConseillerViewModel> ObtenirAsync(UserSummaryViewModel conseiller);
}
