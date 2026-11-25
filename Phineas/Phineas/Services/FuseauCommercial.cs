namespace Phineas.Services;

// Fuseau horaire commercial unique de l'application (décision F22, option 1) : c'est dans ce fuseau qu'une heure de
// rendez-vous saisie (« 14 h ») est comprise, quel que soit le fuseau du serveur ou du navigateur. Valeur lue dans la
// configuration (clé « FuseauCommercial », ex. « America/Toronto ») ; l'application refuse de démarrer si elle manque
// ou n'est pas reconnue : jamais de fuseau de remplacement choisi en silence.
// Limite connue : un seul fuseau pour toutes les concessions (pas de fuseau par concession).
public sealed class FuseauCommercial
{
    public const string CleConfiguration = "FuseauCommercial";

    // Identifiant tel qu'il est configuré et enregistré avec chaque rendez-vous (ex. « America/Toronto »).
    public string Id { get; }

    public TimeZoneInfo Zone { get; }

    public FuseauCommercial(string id)
    {
        if (string.IsNullOrWhiteSpace(id))
            throw new InvalidOperationException($"Configuration « {CleConfiguration} » absente : indiquez le fuseau commercial (ex. America/Toronto).");
        Id = id.Trim();
        Zone = Trouver(Id);
    }

    public static FuseauCommercial Depuis(IConfiguration configuration) => new(configuration[CleConfiguration] ?? "");

    // .NET reconnaît les identifiants IANA sur Linux et sur Windows (ICU) ; sur un Windows sans ICU, on passe par
    // l'identifiant Windows équivalent. Introuvable : erreur claire au démarrage.
    private static TimeZoneInfo Trouver(string id)
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(id);
        }
        catch (TimeZoneNotFoundException)
        {
            if (TimeZoneInfo.TryConvertIanaIdToWindowsId(id, out string? idWindows))
                return TimeZoneInfo.FindSystemTimeZoneById(idWindows);
            throw new InvalidOperationException($"Fuseau commercial « {id} » inconnu sur ce serveur : vérifiez la configuration « {CleConfiguration} ».");
        }
    }

    // Heure commerciale saisie (date et heure, sans fuseau) vers l'instant UTC. Une heure qui n'existe pas (passage à
    // l'heure d'été) ou qui existe deux fois (retour à l'heure normale) n'est pas convertie : l'appelant la refuse.
    public ConversionHeure VersUtc(DateTime heureCommerciale)
    {
        var locale = DateTime.SpecifyKind(heureCommerciale, DateTimeKind.Unspecified);
        if (Zone.IsInvalidTime(locale))
            return new ConversionHeure(EtatHeureCommerciale.Inexistante, null);
        if (Zone.IsAmbiguousTime(locale))
            return new ConversionHeure(EtatHeureCommerciale.Ambigue, null);
        return new ConversionHeure(EtatHeureCommerciale.Valide, TimeZoneInfo.ConvertTimeToUtc(locale, Zone));
    }

    // Instant UTC (tel que lu en base) vers l'heure commerciale de ce fuseau.
    public DateTime VersHeureCommerciale(DateTime utc) =>
        TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), Zone);

    // Décalage du fuseau à cet instant (ex. -5 h en hiver, -4 h en été à Toronto).
    public TimeSpan Decalage(DateTime utc) => Zone.GetUtcOffset(DateTime.SpecifyKind(utc, DateTimeKind.Utc));
}

public enum EtatHeureCommerciale
{
    Valide,
    Inexistante,
    Ambigue,
}

// Résultat de FuseauCommercial.VersUtc : Utc n'a une valeur que si l'heure est valide.
public readonly record struct ConversionHeure(EtatHeureCommerciale Etat, DateTime? Utc);
