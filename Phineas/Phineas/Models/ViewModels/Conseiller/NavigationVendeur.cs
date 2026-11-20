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
    // « Centre d'actions » couvre aussi Mes suivis et Recommandations véhicules (même contrôleur Intelligence).
    public static readonly IReadOnlyList<EntreeNavigation> Menu =
    [
        new("Accueil", "bi-house", "Conseiller", "Index"),
        new("Centre d'actions", "bi-lightning-charge", "Intelligence", "Index"),
        new("Prospects", "bi-people", "Prospects", "Index"),
        new("Rendez-vous", "bi-calendar4", "RendezVous", "Index"),
        new(
            "Ventes",
            "bi-receipt",
            Enfants:
            [
                new("Soumissions", "bi-file-earmark-text", "Soumissions", "Index"),
                new("Nouvelle soumission", "bi-file-earmark-plus", "Soumissions", "Nouvelle"),
                new("Transactions", "bi-cash-stack", "Transactions", "Index"),
                new("Nouvelle transaction", "bi-cash-coin", "Transactions", "Nouvelle"),
            ]
        ),
        new(
            "Relations clients",
            "bi-person-heart",
            Enfants:
            [
                new("Ventes perdues", "bi-x-octagon", "Relations", "Pertes"),
                new("Satisfaction et après-vente", "bi-emoji-smile", "Relations", "Satisfaction"),
                new("Réseau et recommandations", "bi-share", "Relations", "Reseau"),
                new("Statistiques relationnelles", "bi-bar-chart-line", "Relations", "Statistiques"),
            ]
        ),
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
