using Phineas.Models.Entities;

namespace Phineas.Models.ViewModels.Conseiller;

public enum StatutSoumission
{
    Brouillon,
    PreteAEnvoyer,
    Envoyee,
    EnAttente,
    Acceptee,
    Refusee,
    Expiree,
    Annulee,
}

// Même forme que Models.Entities.Vehicule (lecture seule) pour pouvoir brancher le vrai inventaire plus tard.
public record VehiculeInventaire(
    string Id,
    string NumeroStock,
    string Marque,
    string Modele,
    int Annee,
    string? Version,
    int Kilometrage,
    string? Couleur,
    string? Carrosserie,
    string? Carburant,
    string? Transmission,
    decimal PrixDemande,
    StatutVehicule StatutActuel,
    bool Neuf,
    IReadOnlyList<string> Caracteristiques,
    string? Emplacement = null
);

public record OptionCatalogue(string Code, string Libelle, decimal Prix);

public record OptionChoisie(string Code, string Libelle, decimal Prix);

public record RepriseProposee(string Vehicule, decimal? ValeurEstimee, decimal? SoldePret);

public record ScenarioComparaison(
    string Nom,
    string ModeAchat,
    decimal MiseDeFonds,
    int DureeMois,
    decimal? TauxAnnuel,
    bool AvecReprise
);

public class OffreSoumission
{
    public decimal PrixAnnonce { get; init; }
    public decimal Remise { get; init; }
    public string? MotifRemise { get; init; }
    public IReadOnlyList<OptionChoisie> Options { get; init; } = [];
    public RepriseProposee? Reprise { get; init; }
    public decimal MiseDeFonds { get; init; }
    public decimal AcompteVerse { get; init; }
    public string ModeAchat { get; init; } = "financement";
    public int DureeMois { get; init; } = 60;
    public decimal? TauxAnnuel { get; init; }
    public bool InclureTaxes { get; init; } = true;
    public string? Commentaires { get; init; }
    public DateTime DateValidite { get; init; }
}

// Instantané : le véhicule et l'offre sont copiés au moment de la version et ne bougent plus ensuite.
public class VersionSoumission
{
    public int Numero { get; init; }
    public DateTime Date { get; init; }
    public string Auteur { get; init; } = "";
    public StatutSoumission Statut { get; init; }
    public string? Note { get; init; }
    public required VehiculeInventaire Vehicule { get; init; }
    public required OffreSoumission Offre { get; init; }
    public IReadOnlyList<ScenarioComparaison> Scenarios { get; init; } = [];
}

public record Soumission(
    string Id,
    string Reference,
    string ProspectId,
    string OpportuniteId,
    string ConseillerId,
    DateTime DateCreation,
    IReadOnlyList<VersionSoumission> Versions
);

public record ParametresCalcul(decimal TauxTps, decimal TauxTvq, string AvertissementTaxes, IReadOnlyList<int> Durees);

public record DonneesSoumissions(
    IReadOnlyList<VehiculeInventaire> Inventaire,
    IReadOnlyList<OptionCatalogue> Options,
    IReadOnlyList<Soumission> Soumissions,
    ParametresCalcul Parametres
);

public class SoumissionsPageViewModel
{
    public required DonneesProspects Prospects { get; init; }
    public required DonneesSoumissions Soumissions { get; init; }
    public bool DonneesFictives { get; init; }
    public string? Concession { get; init; }
    public string ConseillerNom { get; init; } = "";
    public string ConseillerCourriel { get; init; } = "";
    public string? SoumissionId { get; init; }
    public string? OpportuniteId { get; init; }
    public string? ProspectId { get; init; }

    // Véhicule présélectionné dans le parcours de création (ex. depuis les recommandations de véhicules).
    public string? VehiculeId { get; init; }

    // Fournis sur le détail pour relier la soumission à sa transaction.
    public DonneesRendezVous? RendezVous { get; init; }
    public DonneesTransactions? Transactions { get; init; }

    // Phase 06 : données du moteur d'intelligence commerciale (actions liées au dossier affiché).
    public DonneesIntelligence? Intelligence { get; init; }
}

// Contenu injecté en JSON dans les pages qui utilisent le module Soumissions (liste, parcours, détail, fiche prospect).
public record ChargeSoumissions(DonneesSoumissions Donnees, string ConseillerNom, string ConseillerCourriel, string? Concession);

public static class ReferentielsSoumission
{
    public static string Libelle(StatutSoumission s) =>
        s switch
        {
            StatutSoumission.Brouillon => "Brouillon",
            StatutSoumission.PreteAEnvoyer => "Prête à envoyer",
            StatutSoumission.Envoyee => "Envoyée",
            StatutSoumission.EnAttente => "En attente de réponse",
            StatutSoumission.Acceptee => "Acceptée",
            StatutSoumission.Refusee => "Refusée",
            StatutSoumission.Expiree => "Expirée",
            StatutSoumission.Annulee => "Annulée",
            _ => s.ToString(),
        };

    public static string Libelle(StatutVehicule s) =>
        s switch
        {
            StatutVehicule.Recu => "Reçu",
            StatutVehicule.EnInspection => "En inspection",
            StatutVehicule.InspectionTerminee => "Inspection terminée",
            StatutVehicule.NettoyageEnCours => "Nettoyage en cours",
            StatutVehicule.PretPourVente => "Prêt pour la vente",
            StatutVehicule.Reserve => "Réservé",
            StatutVehicule.Vendu => "Vendu",
            StatutVehicule.Livre => "Livré",
            _ => s.ToString(),
        };

    public static readonly IReadOnlyList<StatutSoumission> Statuts = Enum.GetValues<StatutSoumission>();

    public static object PourClient() =>
        new
        {
            statuts = Statuts.Select(s => new { cle = s.ToString(), libelle = Libelle(s) }),
            statutsVehicule = Enum.GetValues<StatutVehicule>().ToDictionary(s => s.ToString(), Libelle),
        };
}
