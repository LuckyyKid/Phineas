using Phineas.Services.Commun;

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
    DateTime DateCreation,
    // true : enregistré en base (ServiceProspects) ; false : donnée fictive de démonstration.
    bool Enregistre = false,
    // Empreinte des valeurs enregistrées (prospect enregistré seulement) : renvoyée avec une modification
    // pour détecter un changement fait entre-temps ailleurs (voir ServiceProspects.Empreinte).
    string? Version = null
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
    QualificationOpportunite Qualification,
    // Opportunité enregistrée : empreinte de la prochaine action affichée (voir ServiceProspects.EmpreinteSuivi),
    // renvoyée par « Marquer comme réalisé » pour ne jamais réaliser une action qui a changé entre-temps.
    string? VersionSuivi = null
);

// Prochaine action enregistrée d'une opportunité active, pour la vue « À venir » de « Mes suivis »
// (voir ServiceProspects.SuivisPlanifiesAsync). Une ligne par opportunité : jamais une action archivée.
public record SuiviPlanifie(
    string OpportuniteId,
    string ProspectId,
    string Client,
    string Opportunite,
    string Action,
    DateTime DatePrevue,
    // Empreinte de l'action (ServiceProspects.EmpreinteSuivi), renvoyée par « Reporter » et « Marquer comme réalisé ».
    string VersionSuivi
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

    // Fourni sur la fiche pour afficher les transactions de chaque opportunité.
    public DonneesTransactions? Transactions { get; init; }

    // Phase 06 : données du moteur d'intelligence commerciale (actions liées au dossier affiché).
    public DonneesIntelligence? Intelligence { get; init; }

    // Message affiché après une création réussie (Post/Redirect/Get, via TempData).
    public string? Confirmation { get; init; }

    // Message affiché après un refus sans formulaire à rouvrir (ex. changement d'étape refusé), via TempData.
    public string? Erreur { get; init; }

    // Création refusée par le serveur : le tiroir se rouvre avec la saisie et les erreurs.
    public NouveauProspectSaisie? SaisieRefusee { get; init; }
    // Champ = attribut name du champ du formulaire ("" = erreur générale).
    public IReadOnlyList<ErreurChamp> ErreursCreation { get; init; } = [];

    // Modification refusée : le tiroir se rouvre en mode « Modifier » sur ce prospect et cette opportunité.
    public string? ModificationProspectId { get; init; }
    public string? ModificationOpportuniteId { get; init; }

    // Empreinte envoyée avec la saisie refusée, renvoyée telle quelle au tiroir (jamais l'empreinte actuelle) :
    // après un conflit, un nouveau clic sur « Enregistrer » est donc refusé lui aussi, tant que l'utilisateur
    // n'a pas rouvert le formulaire sur les valeurs actuelles.
    public string? ModificationVersion { get; init; }

    // Note refusée par le serveur : l'onglet Historique se rouvre avec la saisie et les erreurs (prospects-fiche.js).
    public NoteSaisie? NoteRefusee { get; init; }
    public IReadOnlyList<ErreurChamp> ErreursNote { get; init; } = [];

    // Suivi refusé par le serveur : la fenêtre « Planifier un suivi » se rouvre avec la saisie et les erreurs.
    public SuiviSaisie? SuiviRefuse { get; init; }
    public IReadOnlyList<ErreurChamp> ErreursSuivi { get; init; } = [];
}

// Champs postés par le tiroir « Nouveau prospect » (_TiroirProspect.cshtml).
// Les noms suivent les attributs name du formulaire ; toute la validation se fait dans ServiceProspects.
public class NouveauProspectSaisie
{
    public string? Prenom { get; set; }
    public string? Nom { get; set; }
    public string? Courriel { get; set; }
    public string? Telephone { get; set; }
    public string? ContactPrefere { get; set; }
    public string? Source { get; set; }
    public string? SourceDetail { get; set; }
    public string? Categorie { get; set; }
    public string? Modele { get; set; }
    public decimal? Budget { get; set; }
    public string? Horizon { get; set; }
    public string? Commentaire { get; set; }
    public string? ConseillerId { get; set; }
    public string? Etape { get; set; }
    public string? ProchaineAction { get; set; }
    public DateTime? DateSuivi { get; set; }
}

// Champs postés par le formulaire « Ajouter une note » de la fiche (onglet Historique) pour un prospect enregistré.
// Les noms suivent les attributs name du formulaire ; toute la validation se fait dans ServiceProspects.AjouterNoteAsync.
public class NoteSaisie
{
    public string? ProspectId { get; set; }
    public string? OpportuniteId { get; set; }
    public string? Type { get; set; }
    public string? Resume { get; set; }
    // Suivi facultatif planifié avec la note (« Prochaine action », « Pour le ») : il faut alors choisir l'opportunité.
    public string? ProchaineAction { get; set; }
    public DateTime? Date { get; set; }
    // Jeton unique du formulaire affiché : un double envoi ne crée qu'une note.
    public string? Jeton { get; set; }
    // Empreinte du prospect lue par la page : vérifiée seulement si un suivi est planifié avec la note.
    public string? Version { get; set; }
}

// Champs postés par la fenêtre « Planifier un suivi » de la fiche, pour une opportunité enregistrée.
public class SuiviSaisie
{
    public string? ProspectId { get; set; }
    public string? OpportuniteId { get; set; }
    public string? Action { get; set; }
    public DateTime? Date { get; set; }
    // Empreinte du prospect lue par la page (voir ServiceProspects.Empreinte).
    public string? Version { get; set; }
}

// Champs postés par le tiroir en mode « Modifier » pour un prospect enregistré.
// Seuls le contact et le premier intérêt de l'opportunité visée sont pris en compte (voir ServiceProspects.ModifierAsync) ;
// les champs propres à la création (statut, suivi, commentaire) sont ignorés.
public class ModificationProspectSaisie : NouveauProspectSaisie
{
    // Ids envoyés au navigateur : « pe-12 » pour le prospect, « oe-34 » pour l'opportunité (facultative).
    public string? ProspectId { get; set; }
    public string? OpportuniteId { get; set; }
    public string? Version { get; set; }
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
        // Phase 08 : provenance non notée (jamais devinée).
        ("inconnue", "Source inconnue"),
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

    // Types de note qui déclarent une prise de contact avec le client (sous-ensemble de TypesNote). Une « Note » simple
    // n'en est pas une. Seule source de cette liste : envoyée au navigateur (typesContact), où intelligence-regles.js
    // (estPremiereReponse) décide si une note satisfait la première réponse d'une opportunité.
    public static readonly IReadOnlyList<string> TypesContactDeclare = ["appel", "courriel", "visite"];

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
            typesContact = TypesContactDeclare,
            etapes = Etapes.Select(e => new { cle = e.ToString(), libelle = FormatVente.Libelle(e) }),
        };

    private static Dictionary<string, string> EnDictionnaire(IReadOnlyList<(string Cle, string Libelle)> liste) =>
        liste.ToDictionary(x => x.Cle, x => x.Libelle);
}
