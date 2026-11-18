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
        new("Centre d'actions", "bi-lightning-charge", "Intelligence", "Index"),
        new("Prospects", "bi-person-lines-fill", "Prospects", "Index"),
        new("Rendez-vous", "bi-calendar-event", "RendezVous", "Index"),
        new(
            "Ventes",
            "bi-receipt",
            Enfants:
            [
                new("Soumissions", "bi-file-earmark-text", "Soumissions", "Index"),
                new("Transactions", "bi-cash-coin", "Transactions", "Index"),
            ]
        ),
        new(
            "Relations clients",
            "bi-people",
            Enfants:
            [
                new("Ventes perdues", "bi-x-octagon", "Relations", "Pertes"),
                new("Satisfaction et après-vente", "bi-emoji-smile", "Relations", "Satisfaction"),
                new("Mon réseau et recommandations", "bi-share", "Relations", "Reseau"),
                new("Statistiques relationnelles", "bi-bar-chart-line", "Relations", "Statistiques"),
            ]
        ),
        new("Inventaire", "bi-car-front"),
        new(
            "Outils",
            "bi-grid",
            Enfants:
            [
                new("Mes suivis", "bi-arrow-repeat", "Intelligence", "Suivis"),
                new("Recommandations véhicules", "bi-car-front", "Intelligence", "Vehicules"),
                new("Assistant vendeur", "bi-stars", "Outils", "Assistant"),
                new("Studio d'annonces", "bi-megaphone", "Outils", "Annonces"),
                new("Acquisition commerciale", "bi-diagram-3", "Outils", "Acquisition"),
                new("Mes performances", "bi-graph-up", "Outils", "Performances"),
            ]
        ),
    ];
}
