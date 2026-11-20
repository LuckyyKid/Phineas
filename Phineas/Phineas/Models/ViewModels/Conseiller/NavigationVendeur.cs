namespace Phineas.Models.ViewModels.Conseiller;

// Une entrée sans Controleur n'est pas encore cliquable : sa page arrive avec un prochain module.
// Une entrée avec Enfants s'affiche comme un groupe dépliable.
public record EntreeNavigation(
    string Libelle,
    string Icone,
    string? Controleur = null,
    string? Action = null,
    IReadOnlyList<EntreeNavigation>? Enfants = null
)
{
    public bool Disponible => Controleur is not null;
}

public static class NavigationVendeur
{
    public static readonly IReadOnlyList<EntreeNavigation> Menu =
    [
        new("Accueil", "bi-house", "Conseiller", "Index"),
        new("Actions", "bi-lightning-charge"),
        new("Prospects", "bi-people", "Prospects", "Index"),
        new("Rendez-vous", "bi-calendar4"),
        new(
            "Ventes",
            "bi-receipt",
            Enfants:
            [
                new("Nouvelle soumission", "bi-file-earmark-plus"),
                new("Nouvelle transaction", "bi-cash-coin"),
            ]
        ),
        new("Clients", "bi-person-heart"),
    ];
}
