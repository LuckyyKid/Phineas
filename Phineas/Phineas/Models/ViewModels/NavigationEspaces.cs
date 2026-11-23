using Phineas.Models.Constants;
using Phineas.Models.ViewModels.Conseiller;

namespace Phineas.Models.ViewModels;

// Menu de la barre latérale de chaque espace, affiché par Views/Shared/_LayoutEspace.cshtml.
// Le menu du vendeur est dans NavigationVendeur.cs ; les entrées sans contrôleur sont grisées (« bientôt »).
public static class NavigationEspaces
{
    // Modules annoncés mais pas encore construits, communs à plusieurs espaces.
    private static readonly EntreeNavigation Inventaire = new("Inventaire", "bi-car-front");
    private static readonly EntreeNavigation ScanQr = new("Scan QR", "bi-qr-code-scan");
    private static readonly EntreeNavigation Messagerie = new("Messagerie", "bi-chat-dots");
    private static readonly EntreeNavigation CoffreFort = new("Coffre-fort F&A", "bi-shield-lock");
    private static readonly EntreeNavigation AnnoncesIa = new("Annonces IA", "bi-stars");

    public static readonly IReadOnlyList<EntreeNavigation> Admin =
    [
        new("Accueil", "bi-house", "Admin", "Index"),
        new("Concessions", "bi-buildings", "Concessions", "Index"),
        new("Personnel", "bi-people", "Utilisateurs", "Index"),
        Inventaire,
        ScanQr,
        Messagerie,
        CoffreFort,
        AnnoncesIa,
    ];

    public static readonly IReadOnlyList<EntreeNavigation> Directeur =
    [
        new("Accueil", "bi-house", "Directeur", "Index"),
        Inventaire,
        ScanQr,
        Messagerie,
        CoffreFort,
        AnnoncesIa,
    ];

    public static readonly IReadOnlyList<EntreeNavigation> Mecanicien =
    [
        new("Accueil", "bi-house", "Mecanicien", "Index"),
        Inventaire,
        ScanQr,
        Messagerie,
        AnnoncesIa,
    ];

    // Retourne le menu du rôle connecté ; aucun menu si le rôle est inconnu.
    public static IReadOnlyList<EntreeNavigation> MenuPour(string? role)
    {
        if (role == AppRoles.SystemAdmin)
        {
            return Admin;
        }
        if (role == AppRoles.Directeur)
        {
            return Directeur;
        }
        if (role == AppRoles.Mecanicien)
        {
            return Mecanicien;
        }
        if (role == AppRoles.Conseiller)
        {
            return NavigationVendeur.Menu;
        }
        return [];
    }
}
