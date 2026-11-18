namespace Phineas.Models.ViewModels.Conseiller;

// Contact / profil client. Les besoins d'achat ne sont PAS ici : ils appartiennent à chaque opportunité.
public record ContactProspect(
    string Id,
    string Prenom,
    string Nom,
    string? Courriel,
    string? Telephone,
    string ContactPrefere,
    string? MomentContact,
    string Source,
    string? SourceDetail,
    string ConseillerId,
    DateTime DateCreation
);

// Qualification propre à une opportunité : deux opportunités d'un même contact ne partagent rien.
public class QualificationOpportunite
{
    public string? Categorie { get; init; }
    public string? Etat { get; init; }
    public IReadOnlyList<string> Marques { get; init; } = [];
    public IReadOnlyList<string> Modeles { get; init; } = [];
    public int? Places { get; init; }
    public IReadOnlyList<string> Caracteristiques { get; init; } = [];
    public string? Utilisation { get; init; }
    public decimal? BudgetTotal { get; init; }
    public decimal? BudgetMensuel { get; init; }
    public string? ModeAchat { get; init; }
    public decimal? MiseDeFonds { get; init; }
    public string? Reprise { get; init; }
    public string? RepriseDetail { get; init; }
    public string? Horizon { get; init; }
    public DateTime? DateCible { get; init; }
    public IReadOnlyList<string> ElementsDecision { get; init; } = [];
    public string? Objections { get; init; }
}

public record Opportunite(
    string Id,
    string ProspectId,
    string Titre,
    EtapeVente Etape,
    DateTime DateCreation,
    DateTime DerniereActivite,
    string? ProchaineAction,
    DateTime? DateProchaineAction,
    IReadOnlyList<string> VehiculesEnvisages,
    QualificationOpportunite Qualification
);

public record InteractionProspect(
    string Id,
    string ProspectId,
    string? OpportuniteId,
    DateTime Date,
    string Type,
    string Auteur,
    string Resume,
    string? ProchaineAction = null
);

public record ConseillerResume(string Id, string Nom, bool EstFictif);

public record DonneesProspects(
    string ConseillerConnecteId,
    IReadOnlyList<ConseillerResume> Conseillers,
    IReadOnlyList<ContactProspect> Contacts,
    IReadOnlyList<Opportunite> Opportunites,
    IReadOnlyList<InteractionProspect> Interactions
);

public class ProspectsPageViewModel
{
    public required DonneesProspects Donnees { get; init; }
    public bool DonneesFictives { get; init; }
    public string? ProspectId { get; init; }
    public bool OuvrirCreation { get; init; }

    // Fourni sur la fiche pour afficher les soumissions de chaque opportunité.
    public DonneesSoumissions? Soumissions { get; init; }

    // Fourni sur la fiche pour afficher les rendez-vous de chaque opportunité.
    public DonneesRendezVous? RendezVous { get; init; }
}

// Libellés métier : une seule source pour les vues Razor et le JavaScript.
public static class ReferentielsVente
{
    public static readonly IReadOnlyList<(string Cle, string Libelle)> Sources =
    [
        ("site-web", "Site Web"),
        ("meta", "Publicité Meta"),
        ("google", "Publicité Google"),
        ("kijiji", "Kijiji / annonce externe"),
        ("appel", "Appel téléphonique"),
        ("visite", "Visite spontanée"),
        ("recommandation", "Recommandation"),
        ("prospection", "Prospection"),
        ("autre", "Autre"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> MoyensContact =
    [
        ("telephone", "Téléphone"),
        ("courriel", "Courriel"),
        ("texto", "Texto"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> MomentsContact =
    [
        ("matin", "Matin"),
        ("midi", "Midi"),
        ("apres-midi", "Après-midi"),
        ("soir", "Soir"),
        ("indifferent", "Indifférent"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> Categories =
    [
        ("berline", "Berline"),
        ("compacte", "Compacte / hatchback"),
        ("vus", "VUS"),
        ("camionnette", "Camionnette (pickup)"),
        ("fourgonnette", "Fourgonnette"),
        ("coupe", "Coupé / cabriolet"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> Etats =
    [
        ("neuf", "Neuf"),
        ("occasion", "Occasion"),
        ("indifferent", "Indifférent"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> Caracteristiques =
    [
        ("ti", "Traction intégrale"),
        ("hybride", "Hybride"),
        ("electrique", "Électrique"),
        ("sieges-chauffants", "Sièges chauffants"),
        ("carplay", "Apple CarPlay / Android Auto"),
        ("aides", "Aides à la conduite"),
        ("coffre", "Grand espace de chargement"),
        ("remorquage", "Capacité de remorquage"),
        ("demarreur", "Démarreur à distance"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> Utilisations =
    [
        ("quotidien", "Trajets quotidiens"),
        ("famille", "Famille"),
        ("travail", "Travail / chantier"),
        ("longues", "Longues distances"),
        ("urbain", "Usage urbain"),
        ("loisirs", "Loisirs / plein air"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> ModesAchat =
    [
        ("comptant", "Comptant"),
        ("financement", "Financement"),
        ("indecis", "Indécis"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> Reprises =
    [
        ("oui", "Oui"),
        ("non", "Non"),
        ("a-determiner", "À déterminer"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> Horizons =
    [
        ("immediat", "Achat immédiat"),
        ("30j", "D'ici 30 jours"),
        ("1-3-mois", "Dans 1 à 3 mois"),
        ("plus-tard", "Plus tard"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> ElementsDecision =
    [
        ("prix", "Prix total"),
        ("mensualite", "Paiement mensuel"),
        ("fiabilite", "Fiabilité"),
        ("consommation", "Consommation / autonomie"),
        ("garantie", "Garantie"),
        ("reprise", "Valeur de la reprise"),
        ("disponibilite", "Disponibilité rapide"),
        ("securite", "Sécurité"),
        ("confort", "Confort"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> TypesNote =
    [
        ("note", "Note"),
        ("appel", "Appel effectué"),
        ("courriel", "Courriel (résumé)"),
        ("visite", "Visite en concession"),
    ];

    public static readonly IReadOnlyList<EtapeVente> Etapes = Enum.GetValues<EtapeVente>();

    public static object PourClient() =>
        new
        {
            sources = EnDictionnaire(Sources),
            moyensContact = EnDictionnaire(MoyensContact),
            momentsContact = EnDictionnaire(MomentsContact),
            categories = EnDictionnaire(Categories),
            etats = EnDictionnaire(Etats),
            caracteristiques = EnDictionnaire(Caracteristiques),
            utilisations = EnDictionnaire(Utilisations),
            modesAchat = EnDictionnaire(ModesAchat),
            reprises = EnDictionnaire(Reprises),
            horizons = EnDictionnaire(Horizons),
            elementsDecision = EnDictionnaire(ElementsDecision),
            typesNote = EnDictionnaire(TypesNote),
            etapes = Etapes.Select(e => new { cle = e.ToString(), libelle = FormatVente.Libelle(e) }),
        };

    private static Dictionary<string, string> EnDictionnaire(IReadOnlyList<(string Cle, string Libelle)> liste) =>
        liste.ToDictionary(x => x.Cle, x => x.Libelle);
}
