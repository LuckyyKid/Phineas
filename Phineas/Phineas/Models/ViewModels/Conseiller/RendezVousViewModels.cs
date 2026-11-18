namespace Phineas.Models.ViewModels.Conseiller;

public enum TypeRendezVous
{
    PremiereRencontre,
    Consultation,
    PresentationVehicule,
    EssaiRoutier,
    DiscussionSoumission,
    Negociation,
    Financement,
    Finalisation,
    Livraison,
    SuiviApresVente,
    Autre,
}

public enum StatutRendezVous
{
    Planifie,
    AConfirmer,
    Confirme,
    EnCours,
    Termine,
    Annule,
    ClientAbsent,
    Replanifie,
}

// Entrée de l'historique propre au rendez-vous (création, confirmation, replanification, résultat…).
public record EvenementRendezVous(DateTime Date, string Type, string Auteur, string Texte);

public record AnnulationRendezVous(string Motif, string Auteur, DateTime Date, string? Commentaire, bool IntentionReplanifier);

public record AbsenceRendezVous(DateTime Date, string ProchaineAction, string? Commentaire);

// Observations déclarées par le conseiller. Aucune probabilité d'achat n'en est déduite.
public class ResultatRendezVous
{
    public DateTime Date { get; init; }
    public string Resultat { get; init; } = "inconnu";
    public string? Observations { get; init; }
    public string? Objections { get; init; }
    public string? ProchaineAction { get; init; }
    public string? PrecisionAction { get; init; }
    public DateTime? DateSuivi { get; init; }

    // Propres aux essais routiers.
    public string? Appreciation { get; init; }
    public string? PointsAimes { get; init; }
    public string? PointsMoins { get; init; }
    public string? Questions { get; init; }
    public string? Interet { get; init; }
    public string? VehiculeAlternatif { get; init; }
}

public class RendezVous
{
    public required string Id { get; init; }
    public required string ProspectId { get; init; }
    public required string OpportuniteId { get; init; }
    public string? SoumissionId { get; init; }
    public string? VehiculeId { get; init; }
    public required string ConseillerId { get; init; }
    public TypeRendezVous Type { get; init; }
    public StatutRendezVous Statut { get; init; }
    public DateTime Debut { get; init; }
    public int DureeMinutes { get; init; }
    public string Mode { get; init; } = "concession";
    public string? Lieu { get; init; }
    public string? Objectif { get; init; }
    public string? Commentaire { get; init; }
    public DateTime DateCreation { get; init; }
    public IReadOnlyDictionary<string, bool> Checklist { get; init; } = new Dictionary<string, bool>();
    public DateTime? DebutEssai { get; init; }
    public DateTime? FinEssai { get; init; }
    public AnnulationRendezVous? Annulation { get; init; }
    public AbsenceRendezVous? Absence { get; init; }
    public ResultatRendezVous? Resultat { get; init; }
    public string? ReplanifieDepuis { get; init; }
    public string? ReplanifieVers { get; init; }
    public IReadOnlyList<EvenementRendezVous> Historique { get; init; } = [];
}

public record DonneesRendezVous(IReadOnlyList<RendezVous> RendezVous, int HeureOuverture, int HeureFermeture, string LieuParDefaut);

public class RendezVousPageViewModel
{
    public required DonneesProspects Prospects { get; init; }
    public required DonneesSoumissions Soumissions { get; init; }
    public required DonneesRendezVous RendezVous { get; init; }
    public bool DonneesFictives { get; init; }
    public string? Concession { get; init; }
    public string ConseillerNom { get; init; } = "";
    public string ConseillerCourriel { get; init; } = "";
    public string? RendezVousId { get; init; }
    public string? OpportuniteId { get; init; }
    public string? ProspectId { get; init; }
    public string? SoumissionId { get; init; }
    public string? Replanifier { get; init; }
    public string? Date { get; init; }

    // Type présélectionné (ex. « Livraison » depuis une transaction).
    public string? Type { get; init; }

    // Fourni pour relier un rendez-vous de livraison, de financement ou de finalisation à sa transaction.
    public DonneesTransactions? Transactions { get; init; }

    // Véhicule présélectionné (ex. essai routier depuis les recommandations de véhicules).
    public string? VehiculeId { get; init; }

    // Phase 06 : données du moteur d'intelligence commerciale (actions liées au dossier affiché).
    public DonneesIntelligence? Intelligence { get; init; }
}

// Libellés métier : une seule source pour Razor et le JavaScript (prépare la future localisation FR / EN / ES).
public static class ReferentielsRendezVous
{
    public static string Libelle(TypeRendezVous t) =>
        t switch
        {
            TypeRendezVous.PremiereRencontre => "Première rencontre",
            TypeRendezVous.Consultation => "Consultation automobile",
            TypeRendezVous.PresentationVehicule => "Présentation d'un véhicule",
            TypeRendezVous.EssaiRoutier => "Essai routier",
            TypeRendezVous.DiscussionSoumission => "Discussion d'une soumission",
            TypeRendezVous.Negociation => "Rencontre de négociation",
            TypeRendezVous.Financement => "Rencontre avec le service financement",
            TypeRendezVous.Finalisation => "Rencontre de finalisation",
            TypeRendezVous.Livraison => "Livraison du véhicule",
            TypeRendezVous.SuiviApresVente => "Suivi après vente",
            _ => "Autre",
        };

    public static string Icone(TypeRendezVous t) =>
        t switch
        {
            TypeRendezVous.PremiereRencontre => "bi-person-raised-hand",
            TypeRendezVous.Consultation => "bi-chat-square-text",
            TypeRendezVous.PresentationVehicule => "bi-car-front",
            TypeRendezVous.EssaiRoutier => "bi-speedometer",
            TypeRendezVous.DiscussionSoumission => "bi-file-earmark-text",
            TypeRendezVous.Negociation => "bi-arrow-left-right",
            TypeRendezVous.Financement => "bi-bank",
            TypeRendezVous.Finalisation => "bi-clipboard-check",
            TypeRendezVous.Livraison => "bi-key",
            TypeRendezVous.SuiviApresVente => "bi-arrow-repeat",
            _ => "bi-calendar-event",
        };

    public static string Libelle(StatutRendezVous s) =>
        s switch
        {
            StatutRendezVous.Planifie => "Planifié",
            StatutRendezVous.AConfirmer => "En attente de confirmation",
            StatutRendezVous.Confirme => "Confirmé",
            StatutRendezVous.EnCours => "En cours",
            StatutRendezVous.Termine => "Terminé",
            StatutRendezVous.Annule => "Annulé",
            StatutRendezVous.ClientAbsent => "Client absent",
            StatutRendezVous.Replanifie => "Replanifié",
            _ => s.ToString(),
        };

    public static string Icone(StatutRendezVous s) =>
        s switch
        {
            StatutRendezVous.Planifie => "bi-calendar",
            StatutRendezVous.AConfirmer => "bi-question-circle",
            StatutRendezVous.Confirme => "bi-check-circle",
            StatutRendezVous.EnCours => "bi-play-circle",
            StatutRendezVous.Termine => "bi-check2-all",
            StatutRendezVous.Annule => "bi-x-circle",
            StatutRendezVous.ClientAbsent => "bi-person-x",
            StatutRendezVous.Replanifie => "bi-arrow-repeat",
            _ => "bi-circle",
        };

    public static readonly IReadOnlyList<(string Cle, string Libelle)> Modes =
    [
        ("concession", "En concession"),
        ("telephone", "Téléphone"),
        ("virtuel", "Rencontre virtuelle"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> MotifsAnnulation =
    [
        ("empechement", "Empêchement du client"),
        ("report", "Le client souhaite reporter son projet"),
        ("achat-ailleurs", "Le client a acheté ailleurs"),
        ("vehicule-indisponible", "Véhicule indisponible"),
        ("conseiller-indisponible", "Conseiller indisponible"),
        ("autre", "Autre motif"),
        ("inconnu", "Motif inconnu"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> AuteursAnnulation =
    [
        ("client", "Le client"),
        ("conseiller", "Le conseiller"),
        ("concession", "La concession"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> ActionsAbsence =
    [
        ("contacter", "Contacter le client"),
        ("autre-date", "Proposer une autre date"),
        ("attendre", "Attendre une réponse"),
        ("pause", "Mettre le suivi en pause"),
        ("aucune", "Aucune action supplémentaire"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> Resultats =
    [
        ("interesse", "Client toujours intéressé"),
        ("soumission-a-preparer", "Soumission à préparer"),
        ("soumission-a-modifier", "Soumission à modifier"),
        ("deuxieme-essai", "Deuxième essai à prévoir"),
        ("autre-vehicule", "Autre véhicule à proposer"),
        ("discussion", "Discussion supplémentaire nécessaire"),
        ("financement", "Rencontre financement à planifier"),
        ("reflexion", "Le client souhaite réfléchir"),
        ("abandon", "Le client ne souhaite pas poursuivre"),
        ("inconnu", "Résultat inconnu"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> ProchainesActions =
    [
        ("preparer-soumission", "Préparer une soumission"),
        ("modifier-soumission", "Modifier la soumission"),
        ("deuxieme-essai", "Planifier un deuxième essai"),
        ("autre-vehicule", "Proposer un autre véhicule"),
        ("rappeler", "Rappeler le client"),
        ("financement", "Planifier une rencontre financement"),
        ("attendre", "Attendre la réponse du client"),
        ("aucune", "Aucune action"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> Appreciations =
    [
        ("tres-positive", "Très positive"),
        ("positive", "Positive"),
        ("mitigee", "Mitigée"),
        ("negative", "Négative"),
        ("non-exprimee", "Non exprimée"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> Interets =
    [
        ("eleve", "Élevé"),
        ("moyen", "Moyen"),
        ("faible", "Faible"),
        ("non-exprime", "Non exprimé"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> ChecklistPreparation =
    [
        ("besoins", "Vérifier les besoins du client"),
        ("soumission", "Consulter la dernière soumission"),
        ("disponibilite", "Confirmer la disponibilité du véhicule"),
        ("preparation", "Vérifier son état de préparation"),
        ("technique", "Préparer les informations techniques pertinentes"),
        ("documents", "Prévoir les documents nécessaires"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> ChecklistEssai =
    [
        ("essai-disponible", "Véhicule disponible"),
        ("essai-pret", "Véhicule prêt"),
        ("essai-cles", "Clés disponibles"),
        ("essai-conditions", "Documents et conditions de l'essai vérifiés par le personnel autorisé"),
        ("essai-arrivee", "Client arrivé"),
    ];

    public static readonly IReadOnlyList<int> Durees = [15, 30, 45, 60, 90, 120];

    public static object PourClient() =>
        new
        {
            types = Enum.GetValues<TypeRendezVous>().Select(t => new { cle = t.ToString(), libelle = Libelle(t), icone = Icone(t) }),
            statuts = Enum.GetValues<StatutRendezVous>().Select(s => new { cle = s.ToString(), libelle = Libelle(s), icone = Icone(s) }),
            modes = EnDictionnaire(Modes),
            motifsAnnulation = EnDictionnaire(MotifsAnnulation),
            auteursAnnulation = EnDictionnaire(AuteursAnnulation),
            actionsAbsence = EnDictionnaire(ActionsAbsence),
            resultats = EnDictionnaire(Resultats),
            prochainesActions = EnDictionnaire(ProchainesActions),
            appreciations = EnDictionnaire(Appreciations),
            interets = EnDictionnaire(Interets),
            checklistPreparation = ChecklistPreparation.Select(x => new { cle = x.Cle, libelle = x.Libelle }),
            checklistEssai = ChecklistEssai.Select(x => new { cle = x.Cle, libelle = x.Libelle }),
            durees = Durees,
        };

    private static Dictionary<string, string> EnDictionnaire(IReadOnlyList<(string Cle, string Libelle)> liste) =>
        liste.ToDictionary(x => x.Cle, x => x.Libelle);
}
