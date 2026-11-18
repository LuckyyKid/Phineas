using Microsoft.AspNetCore.Mvc.ModelBinding;
using Phineas.Services.Commun;

namespace Phineas.Controllers;

public static class ModelStateExtensions
{
    public static void AjouterErreurs(
        this ModelStateDictionary modelState,
        ResultatService resultat
    )
    {
        foreach (var erreur in resultat.Erreurs)
            modelState.AddModelError(erreur.Champ, erreur.Message);
    }
}
