using Phineas.Models.Entities;

namespace Phineas.Models.ViewModels.Conseiller;

// États enregistrés d'une transaction. Les états affichés (bloquée, prête à livrer, livraison planifiée)
// sont calculés à partir des données par transactions-regles.js : ils ne sont jamais saisis à la main.
public enum StatutTransaction
{
    Active,
    EnAttente,
    Livree,
    Cloturee,
    Annulee,
}

public enum StatutFinancement
{
    NonApplicable,
    NonCommence,
    EnPreparation,
    DossierIncomplet,
    Transmis,
    EnAnalyse,
    InformationRequise,
    Approuve,
    ApprouveSousConditions,
    Refuse,
    Annule,
}

public enum StatutReprise
{
    Envisagee,
    InformationsManquantes,
    EvaluationDemandee,
    EvaluationEnCours,
    ValeurConfirmee,
    Acceptee,
    Refusee,
}

// Validation de la remise par le directeur des ventes.
public enum StatutRemise
{
    NonRequise,
    ADemander,
    Demandee,
    Approuvee,
    Refusee,
}

// Paiements : « déclaré » = annoncé par le client au conseiller ; « confirmé » = vérifié par une personne autorisée.
public enum StatutPaiement
{
    Aucun,
    EnAttente,
    Declare,
    Confirme,
}

public enum StatutAdministratif
{
    NonCommence,
    EnCours,
    Confirme,
}

public enum StatutTacheAtelier
{
    AFaire,
    EnCours,
    EnAttentePiece,
    Terminee,
}

// Instantané figé de la proposition retenue : copie d'une version de soumission au moment où elle est retenue.
// Une nouvelle version de la soumission ou un changement de prix en inventaire ne le modifie jamais.
public record PropositionRetenue(DateTime DateFigee, VehiculeInventaire Vehicule, OffreSoumission Offre);

public class EtatCommercial
{
    public bool PrixConfirme { get; init; }
    public bool OptionsConfirmees { get; init; }
    public StatutRemise Remise { get; init; } = StatutRemise.NonRequise;
    public DateTime? RemiseDepuis { get; init; }
    public DateTime? AccordClient { get; init; }
}

// Pièce demandée par le service F&A : seul son intitulé est connu du conseiller, jamais son contenu.
public record PieceFinancement(string Libelle, string Statut, DateTime Depuis);

public record ConditionFinancement(string Libelle, string Responsable, bool Remplie);

// Ce que le conseiller peut savoir du dossier de financement : un état, pas son contenu.
// Aucun revenu, renseignement bancaire, NAS ni rapport de crédit n'est transmis au navigateur.
public class EtatFinancement
{
    public StatutFinancement Statut { get; init; } = StatutFinancement.NonCommence;
    public DateTime? Depuis { get; init; }
    public IReadOnlyList<PieceFinancement> Pieces { get; init; } = [];
    public IReadOnlyList<ConditionFinancement> Conditions { get; init; } = [];
    public IReadOnlyDictionary<string, bool> Preparation { get; init; } = new Dictionary<string, bool>();
}

// Reprise : la valeur estimée vient de la proposition figée ; la valeur confirmée vient de l'évaluateur autorisé.
// Le solde de financement n'est affiché que s'il a été déclaré au conseiller (SoldeVisible).
public class RepriseTransaction
{
    public string Description { get; init; } = "";
    public string? Marque { get; init; }
    public string? Modele { get; init; }
    public int? Annee { get; init; }
    public int? Kilometrage { get; init; }
    public decimal? ValeurEstimee { get; init; }
    public decimal? ValeurConfirmee { get; init; }
    public decimal? Solde { get; init; }
    public bool SoldeVisible { get; init; }
    public StatutReprise Statut { get; init; }
    public DateTime? Depuis { get; init; }
}

public class EtatPaiement
{
    public decimal? DepotPrevu { get; init; }
    public StatutPaiement Depot { get; init; } = StatutPaiement.Aucun;
    public StatutPaiement Versement { get; init; } = StatutPaiement.EnAttente;

    // Date du dernier changement d'état (déclaration ou confirmation), pour mesurer le temps d'attente.
    public DateTime? DepotDepuis { get; init; }
    public DateTime? VersementDepuis { get; init; }
}

public class EtatAdministratif
{
    public StatutAdministratif Statut { get; init; } = StatutAdministratif.NonCommence;
    public DateTime? Depuis { get; init; }
}

public class EtatLivraison
{
    public DateTime? DatePrevue { get; init; }
    public DateTime? RemiseLe { get; init; }
    public DateTime? ConfirmeeLe { get; init; }
}

public record AttenteTransaction(string Motif, DateTime Depuis);

public record AnnulationTransaction(string Motif, string Auteur, DateTime Date, string? Commentaire, bool Reprendre);

// Origine : « conseiller » (action du vendeur), « departement » (autre service), « simulation » (démonstration), « systeme ».
public record EvenementTransaction(
    DateTime Date,
    string Type,
    string Origine,
    string Auteur,
    string? Departement,
    string Description,
    string? Ancien = null,
    string? Nouveau = null
);

public class Transaction
{
    public required string Id { get; init; }
    public required string Reference { get; init; }
    public required string ProspectId { get; init; }
    public required string OpportuniteId { get; init; }
    public required string ConseillerId { get; init; }
    public required string VehiculeId { get; init; }
    public string? SoumissionId { get; init; }
    public int? VersionNumero { get; init; }
    public PropositionRetenue? Proposition { get; init; }

    // Vrai tant qu'aucune version acceptée n'a été retenue : dossier préparé, mais incomplet.
    public bool Brouillon { get; init; }
    public string ModeAchat { get; init; } = "indetermine";
    public StatutTransaction Statut { get; init; } = StatutTransaction.Active;
    public DateTime DateCreation { get; init; }
    public EtatCommercial Commercial { get; init; } = new();
    public EtatFinancement Financement { get; init; } = new();
    public RepriseTransaction? Reprise { get; init; }
    public EtatPaiement Paiement { get; init; } = new();
    public EtatAdministratif Administratif { get; init; } = new();
    public EtatLivraison Livraison { get; init; } = new();
    public AttenteTransaction? Attente { get; init; }
    public AnnulationTransaction? Annulation { get; init; }
    public DateTime? ClotureLe { get; init; }
    public IReadOnlyList<EvenementTransaction> Historique { get; init; } = [];
}

public record TacheAtelier(string Cle, string Libelle, string Type, StatutTacheAtelier Statut, DateTime? Depuis);

// Même forme que Models.Entities.HistoriqueStatut, en lecture seule.
public record ChangementStatutVehicule(DateTime Date, StatutVehicule? Ancien, StatutVehicule Nouveau, string Departement, string? Commentaire);

// Suivi de préparation d'un véhicule tel que l'atelier le publie (lecture seule pour le conseiller).
public record SuiviAtelier(
    string VehiculeId,
    DateTime? DisponibiliteEstimee,
    IReadOnlyList<TacheAtelier> Taches,
    IReadOnlyList<ChangementStatutVehicule> Historique
);

public record DonneesTransactions(IReadOnlyList<Transaction> Transactions, IReadOnlyList<SuiviAtelier> Atelier);

public class TransactionsPageViewModel
{
    public required DonneesProspects Prospects { get; init; }
    public required DonneesSoumissions Soumissions { get; init; }
    public required DonneesRendezVous RendezVous { get; init; }
    public required DonneesTransactions Transactions { get; init; }
    public bool DonneesFictives { get; init; }
    public string? Concession { get; init; }
    public string ConseillerNom { get; init; } = "";
    public string ConseillerCourriel { get; init; } = "";
    public string? TransactionId { get; init; }
    public string? OpportuniteId { get; init; }
    public string? ProspectId { get; init; }
    public string? SoumissionId { get; init; }
    public int? Version { get; init; }
    public string? RendezVousId { get; init; }

    // Phase 06 : données du moteur d'intelligence commerciale (actions liées au dossier affiché).
    public DonneesIntelligence? Intelligence { get; init; }
}

// Contenu injecté en JSON dans les pages qui utilisent le module Transactions.
public record ChargeTransactions(DonneesTransactions Donnees, string ConseillerNom);

// Libellés et règles paramétrables : une seule source pour Razor et le JavaScript (prépare la localisation FR / EN / ES).
public static class ReferentielsTransactions
{
    // Règles de démonstration, à confirmer avec la direction avant tout usage réel.
    public const decimal SeuilRemiseApprobation = 0m;
    public const int DelaiAttenteJours = 3;

    public static string Libelle(StatutTransaction s) =>
        s switch
        {
            StatutTransaction.Active => "En cours",
            StatutTransaction.EnAttente => "En attente",
            StatutTransaction.Livree => "Livrée",
            StatutTransaction.Cloturee => "Clôturée",
            StatutTransaction.Annulee => "Annulée",
            _ => s.ToString(),
        };

    // États affichés (calculés) : clé, libellé, icône.
    public static readonly IReadOnlyList<(string Cle, string Libelle, string Icone)> StatutsAffiches =
    [
        ("Active", "En cours", "bi-arrow-right-circle"),
        ("Bloquee", "Bloquée", "bi-sign-stop"),
        ("EnAttente", "En attente", "bi-pause-circle"),
        ("PreteALivrer", "Prête à livrer", "bi-check2-circle"),
        ("LivraisonPlanifiee", "Livraison planifiée", "bi-calendar-check"),
        ("Livree", "Livrée", "bi-key"),
        ("Cloturee", "Clôturée", "bi-archive"),
        ("Annulee", "Annulée", "bi-x-circle"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> ModesAchat =
    [
        ("comptant", "Achat comptant"),
        ("financement", "Financement complet"),
        ("partiel", "Financement partiel"),
        ("indetermine", "Mode d'achat à déterminer"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> StatutsFinancement =
    [
        ("NonApplicable", "Non applicable"),
        ("NonCommence", "Non commencé"),
        ("EnPreparation", "En préparation"),
        ("DossierIncomplet", "Dossier incomplet"),
        ("Transmis", "Transmis au service F&A"),
        ("EnAnalyse", "En cours d'analyse"),
        ("InformationRequise", "Information complémentaire requise"),
        ("Approuve", "Approuvé"),
        ("ApprouveSousConditions", "Approuvé sous conditions"),
        ("Refuse", "Refusé"),
        ("Annule", "Annulé"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> StatutsReprise =
    [
        ("Envisagee", "Reprise envisagée"),
        ("InformationsManquantes", "Informations manquantes"),
        ("EvaluationDemandee", "Évaluation demandée"),
        ("EvaluationEnCours", "Évaluation en cours"),
        ("ValeurConfirmee", "Valeur confirmée"),
        ("Acceptee", "Reprise acceptée"),
        ("Refusee", "Reprise refusée"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> StatutsRemise =
    [
        ("NonRequise", "Aucune validation requise"),
        ("ADemander", "Validation à demander"),
        ("Demandee", "Validation demandée"),
        ("Approuvee", "Remise approuvée"),
        ("Refusee", "Remise refusée"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> StatutsPaiement =
    [
        ("Aucun", "Aucun"),
        ("EnAttente", "Paiement en attente"),
        ("Declare", "Déclaré par le client"),
        ("Confirme", "Confirmé par une personne autorisée"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> StatutsAdministratifs =
    [
        ("NonCommence", "Non commencé"),
        ("EnCours", "En cours de vérification"),
        ("Confirme", "Confirmés par le personnel autorisé"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> StatutsTache =
    [
        ("AFaire", "À faire"),
        ("EnCours", "En cours"),
        ("EnAttentePiece", "En attente d'une pièce"),
        ("Terminee", "Terminée"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> EtatsEtape =
    [
        ("NonCommencee", "Non commencée"),
        ("EnCours", "En cours"),
        ("EnAttente", "En attente"),
        ("Bloquee", "Bloquée"),
        ("Terminee", "Terminée"),
        ("NonApplicable", "Non applicable"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> Axes =
    [
        ("commercial", "Validation commerciale"),
        ("paiement", "Paiement ou financement"),
        ("vehicule", "Préparation du véhicule"),
        ("livraison", "Livraison"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> Etapes =
    [
        ("proposition", "Proposition retenue"),
        ("prix", "Prix confirmé"),
        ("options", "Options confirmées"),
        ("remise", "Remise validée"),
        ("reprise", "Reprise évaluée"),
        ("accord", "Accord commercial du client"),
        ("mode", "Mode de paiement sélectionné"),
        ("dossier", "Dossier de financement préparé"),
        ("transmission", "Dossier transmis au service F&A"),
        ("pieces", "Pièces requises vérifiées par F&A"),
        ("decision", "Décision financière communiquée"),
        ("conditions", "Conditions de financement remplies"),
        ("depot", "Dépôt confirmé"),
        ("paiement", "Conditions de paiement vérifiées"),
        ("vehicule", "Véhicule identifié"),
        ("disponibilite", "Disponibilité vérifiée"),
        ("inspection", "Inspection terminée"),
        ("reparations", "Réparations terminées"),
        ("nettoyage", "Nettoyage et préparation terminés"),
        ("pret", "Véhicule prêt"),
        ("administratif", "Éléments administratifs confirmés"),
        ("date", "Date de livraison déterminée"),
        ("rendezvous", "Rendez-vous de livraison planifié"),
        ("remise-vehicule", "Remise du véhicule"),
        ("livraison", "Livraison confirmée"),
    ];

    // Étapes synthétiques de la vue Pipeline (le financement et la préparation peuvent avancer en parallèle).
    public static readonly IReadOnlyList<(string Cle, string Libelle)> EtapesPipeline =
    [
        ("Ouverte", "Transaction ouverte"),
        ("PropositionRetenue", "Proposition retenue"),
        ("ValidationCommerciale", "Validation commerciale"),
        ("PaiementFinancement", "Paiement ou financement"),
        ("PreparationVehicule", "Préparation du véhicule"),
        ("PreteALivrer", "Prête à livrer"),
        ("Livree", "Livrée"),
        ("Terminee", "Clôturée ou annulée"),
    ];

    // Départements et personnes responsables (noms fictifs). Personne vide = non attribuée ou non communiquée.
    public static readonly IReadOnlyList<(string Cle, string Libelle, string Personne)> Departements =
    [
        ("conseiller", "Vous (conseiller)", ""),
        ("client", "Client", ""),
        ("direction", "Directeur des ventes", "Nathalie Roy"),
        ("fa", "Service F&A", "Hélène Gosselin"),
        ("atelier", "Atelier (mécanicien / préparateur)", "Marc-André Simard"),
        ("evaluation", "Évaluateur des reprises", ""),
        ("administration", "Administration des ventes", ""),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> PreparationFinancement =
    [
        ("mode", "Mode d'achat sélectionné"),
        ("infos", "Informations commerciales disponibles"),
        ("proposition", "Proposition retenue"),
        ("client", "Informations requises communiquées au client"),
        ("documents", "Documents attendus identifiés avec le client"),
        ("completude", "État de complétude confirmé par F&A"),
        ("transmission", "Dossier transmis au service F&A"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> MotifsAnnulation =
    [
        ("changement-avis", "Client a changé d'avis"),
        ("vehicule-indisponible", "Véhicule indisponible"),
        ("prix", "Désaccord sur le prix"),
        ("financement", "Financement non obtenu"),
        ("report", "Achat reporté"),
        ("achat-ailleurs", "Client a acheté ailleurs"),
        ("autre", "Autre"),
        ("inconnu", "Motif inconnu"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> AuteursAnnulation =
    [
        ("client", "Le client"),
        ("conseiller", "Le conseiller"),
        ("concession", "La concession"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> MotifsAttente =
    [
        ("reflexion", "Le client prend un temps de réflexion"),
        ("financement", "Nouvelle démarche de financement"),
        ("vehicule", "Attente d'un autre véhicule"),
        ("autre", "Autre motif"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> Origines =
    [
        ("conseiller", "Vous"),
        ("departement", "Autre département"),
        ("simulation", "Simulation (fictif)"),
        ("systeme", "Phineas"),
    ];

    public static object PourClient() =>
        new
        {
            statutsAffiches = StatutsAffiches.Select(s => new { cle = s.Cle, libelle = s.Libelle, icone = s.Icone }),
            modesAchat = ModesAchat.ToDictionary(x => x.Cle, x => x.Libelle),
            statutsFinancement = StatutsFinancement.ToDictionary(x => x.Cle, x => x.Libelle),
            statutsReprise = StatutsReprise.ToDictionary(x => x.Cle, x => x.Libelle),
            statutsRemise = StatutsRemise.ToDictionary(x => x.Cle, x => x.Libelle),
            statutsPaiement = StatutsPaiement.ToDictionary(x => x.Cle, x => x.Libelle),
            statutsAdministratifs = StatutsAdministratifs.ToDictionary(x => x.Cle, x => x.Libelle),
            statutsTache = StatutsTache.ToDictionary(x => x.Cle, x => x.Libelle),
            etatsEtape = EtatsEtape.ToDictionary(x => x.Cle, x => x.Libelle),
            axes = Axes.Select(x => new { cle = x.Cle, libelle = x.Libelle }),
            etapes = Etapes.ToDictionary(x => x.Cle, x => x.Libelle),
            etapesPipeline = EtapesPipeline.Select(x => new { cle = x.Cle, libelle = x.Libelle }),
            departements = Departements.ToDictionary(x => x.Cle, x => new { libelle = x.Libelle, personne = x.Personne == "" ? null : x.Personne }),
            preparationFinancement = PreparationFinancement.Select(x => new { cle = x.Cle, libelle = x.Libelle }),
            motifsAnnulation = MotifsAnnulation.ToDictionary(x => x.Cle, x => x.Libelle),
            auteursAnnulation = AuteursAnnulation.ToDictionary(x => x.Cle, x => x.Libelle),
            motifsAttente = MotifsAttente.ToDictionary(x => x.Cle, x => x.Libelle),
            origines = Origines.ToDictionary(x => x.Cle, x => x.Libelle),
            seuilRemiseApprobation = SeuilRemiseApprobation,
            delaiAttenteJours = DelaiAttenteJours,
        };
}
