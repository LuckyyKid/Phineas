namespace Phineas.Models.ViewModels.Conseiller;

// Une entrée sans Controleur est affichée comme « Bientôt » : la page n'existe pas encore.
public record EntreeNavigation(
    string Libelle,
    string Icone,
    string? Controleur = null,
    string? Action = null,
    IReadOnlyList<EntreeNavigation>? Enfants = null
)
{
    public bool Disponible => Controleur is not null || (Enfants?.Any(e => e.Disponible) ?? false);
}

public static class NavigationVendeur
{
    public static readonly IReadOnlyList<EntreeNavigation> Menu =
    [
        new("Tableau de bord", "bi-speedometer2", "Conseiller", "Index"),
        new("Prospects", "bi-person-lines-fill", "Prospects", "Index"),
        new("Rendez-vous", "bi-calendar-event", "RendezVous", "Index"),
        new(
            "Ventes",
            "bi-receipt",
            Enfants:
            [
                new("Soumissions", "bi-file-earmark-text", "Soumissions", "Index"),
                new("Transactions", "bi-cash-coin"),
            ]
        ),
        new("Inventaire", "bi-car-front"),
        new(
            "Outils",
            "bi-grid",
            Enfants:
            [
                new("Suivis", "bi-arrow-repeat"),
                new("Assistant vendeur", "bi-stars"),
                new("Référencement", "bi-share"),
                new("Statistiques", "bi-bar-chart-line"),
            ]
        ),
    ];
}
