namespace Phineas.Models.ViewModels.Conseiller;

// Une entrée sans Controleur n'est pas encore cliquable : sa page arrive avec un prochain module.
public record EntreeNavigation(string Libelle, string Icone, string? Controleur = null, string? Action = null)
{
    public bool Disponible => Controleur is not null;
}

public static class NavigationVendeur
{
    public static readonly IReadOnlyList<EntreeNavigation> Menu =
    [
        new("Accueil", "bi-house", "Conseiller", "Index"),
        new("Actions", "bi-lightning-charge"),
        new("Prospects", "bi-people"),
        new("Rendez-vous", "bi-calendar4"),
        new("Ventes", "bi-receipt"),
        new("Clients", "bi-person-heart"),
    ];
}
