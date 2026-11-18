using System.Security.Claims;

namespace Phineas.Models.Constants;

public static class AppRoles
{
    public const string SystemAdmin = "SystemAdmin";
    public const string Directeur = "Directeur";
    public const string Conseiller = "Conseiller";
    public const string Mecanicien = "Mecanicien";

    public static readonly string[] All = { SystemAdmin, Directeur, Conseiller, Mecanicien };

    public static readonly (string Role, string Controller, string Icon)[] Spaces =
    {
        (SystemAdmin, "Admin", "bi-shield-check"),
        (Directeur, "Directeur", "bi-briefcase"),
        (Conseiller, "Conseiller", "bi-person-vcard"),
        (Mecanicien, "Mecanicien", "bi-wrench-adjustable"),
    };

    public static string Label(string? role) =>
        role switch
        {
            SystemAdmin => "Administrateur système",
            Directeur => "Directeur des ventes / F&A",
            Conseiller => "Conseiller aux ventes",
            Mecanicien => "Mécanicien / Préparateur",
            _ => "Aucun rôle",
        };

    public static string? Of(ClaimsPrincipal user) => All.FirstOrDefault(user.IsInRole);
}
