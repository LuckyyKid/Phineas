using System.Text.Json.Serialization;

namespace Phineas.Models.ViewModels.Conseiller;

// Phineas Sales Intelligence Engine (phase 06, frontend) : catalogue de règles, paramètres et données de démonstration.
// La détection et la priorisation sont faites par intelligence-regles.js et intelligence-matching.js (fonctions pures)
// à partir des données des autres modules ; ce fichier ne contient que des libellés, des réglages et des états locaux.

// Préférences de communication d'un contact. Consentement : "explicite", "implicite", "inconnu" ou "retire".
// À valider juridiquement : le prototype ne garantit pas à lui seul la conformité des communications commerciales.
public record PreferencesCommunication(
    string ProspectId,
    string Consentement,
    bool NePlusContacter,
    DateTime? DemandeArretLe,
    string? Note
);

// Suivi d'une opportunité mis en pause à la demande du client, jusqu'à une date de reprise souhaitée.
public record PauseSuivi(string OpportuniteId, DateTime Jusqua, string Motif, DateTime Depuis);

// Demande de recherche non satisfaite (le véhicule voulu n'est pas en inventaire).
// Statut : "Active", "CorrespondanceTrouvee", "AVerifier", "EnPause", "Cloturee".
public class DemandeRecherche
{
    public required string Id { get; init; }
    public required string OpportuniteId { get; init; }
    public string? Categorie { get; init; }
    public decimal? BudgetMax { get; init; }
    public IReadOnlyList<string> Marques { get; init; } = [];
    public IReadOnlyList<string> Caracteristiques { get; init; } = [];
    public int? Places { get; init; }
    public string? Etat { get; init; }
    public int? AnneeMin { get; init; }
    public int? KilometrageMax { get; init; }
    public IReadOnlyList<string> Indispensables { get; init; } = [];
    public string? Alternatives { get; init; }
    public string? Horizon { get; init; }
    public string Statut { get; init; } = "Active";
    public required string ConseillerId { get; init; }
    public DateTime DateCreation { get; init; }
}

// État initial d'une action, désignée par sa règle et son objet (l'identifiant exact est calculé par le moteur).
// Statut : "ATraiter", "EnCours", "Reportee", "Terminee", "Ignoree", "Obsolete".
public record EtatActionDemo(
    string Regle,
    string ObjetId,
    string Statut,
    DateTime Date,
    DateTime? ReporteJusqua = null,
    string? Motif = null,
    string? CollegueId = null,
    string? MotifTransfert = null
);

// Véhicule fictif pouvant « arriver » en inventaire pendant la démonstration.
public record VehiculeSimule(VehiculeInventaire Vehicule, string Evenement);

public record DonneesIntelligence(
    IReadOnlyList<PreferencesCommunication> Preferences,
    IReadOnlyList<PauseSuivi> Pauses,
    IReadOnlyList<DemandeRecherche> Demandes,
    IReadOnlyDictionary<string, IReadOnlyList<string>> Indispensables,
    IReadOnlyList<EtatActionDemo> EtatsActions,
    IReadOnlyList<VehiculeSimule> VehiculesSimules,
    IReadOnlyDictionary<string, IReadOnlyList<string>> BlocagesConnus,
    // Phase 07 : faits des relations clients (clôtures, enquêtes, problèmes, recommandations), entrées du moteur au même
    // titre que les préférences de contact. Sérialisés à part (balise #relations-donnees) avec leurs propres libellés.
    [property: JsonIgnore] DonneesRelationsClients? Relations = null
);

public class IntelligencePageViewModel
{
    public required DonneesProspects Prospects { get; init; }
    public required DonneesSoumissions Soumissions { get; init; }
    public required DonneesRendezVous RendezVous { get; init; }
    public required DonneesTransactions Transactions { get; init; }
    public required DonneesIntelligence Intelligence { get; init; }
    public bool DonneesFictives { get; init; }
    public string? Concession { get; init; }
    public string ConseillerNom { get; init; } = "";
    public string ConseillerCourriel { get; init; } = "";
    public string? OpportuniteId { get; init; }
    public string? VehiculeId { get; init; }
}

public record ChargeIntelligence(DonneesIntelligence Donnees, string ConseillerNom, string? Concession = null);

// Libellés, règles et réglages : une seule source pour Razor et le JavaScript (prépare la localisation FR / EN / ES).
public static class ReferentielsIntelligence
{
    // ---------- Réglages de démonstration (configurables, sans valeur scientifique) ----------
    public const int DelaiPremiereReponseHeures = 1;
    public const int DelaiRelanceSoumissionJours = 3;
    public const int DelaiEntreRelancesJours = 2;
    public const int ExpirationProcheJours = 2;
    public const int HorizonPreparationHeures = 24;
    public const int HorizonConfirmationHeures = 48;
    public const int DelaiInactiviteJours = 7;
    public const int DelaiBlocageResoluJours = 2;
    public const int HorizonLivraisonHeures = 48;
    public const int SeuilQualification = 5;
    public const int SeuilCompatibilite = 70;
    public const int CouvertureMinimale = 50;

    // Catalogue des règles : clé, libellé, catégorie, priorité de base, nature de la communication éventuelle.
    // Nature : "commerciale" (sollicitation), "dossier" (communication nécessaire au traitement), "interne" (aucun contact client).
    public static readonly IReadOnlyList<(string Cle, string Libelle, string Categorie, string Priorite, string Nature)> Regles =
    [
        ("premiere-reponse", "Demande reçue sans première réponse", "prospects", "Eleve", "commerciale"),
        ("qualification-manquante", "Opportunité à qualifier", "prospects", "Normal", "commerciale"),
        ("soumission-a-envoyer", "Soumission prête à être envoyée", "soumissions", "Normal", "commerciale"),
        ("soumission-sans-reponse", "Soumission sans réponse", "soumissions", "Normal", "commerciale"),
        ("soumission-expire", "Soumission proche de son expiration", "soumissions", "Eleve", "commerciale"),
        ("soumission-acceptee", "Soumission acceptée sans transaction", "soumissions", "Eleve", "dossier"),
        ("soumission-vehicule-indisponible", "Véhicule de la soumission indisponible", "soumissions", "Eleve", "dossier"),
        ("rdv-a-confirmer", "Rendez-vous à confirmer", "rendezvous", "Normal", "dossier"),
        ("rdv-vehicule-indisponible", "Rendez-vous : véhicule indisponible", "rendezvous", "Eleve", "interne"),
        ("rdv-a-preparer", "Rendez-vous à préparer", "rendezvous", "Normal", "interne"),
        ("rdv-sans-resultat", "Rendez-vous passé sans résultat", "rendezvous", "Eleve", "interne"),
        ("rdv-client-absent", "Client absent ou rendez-vous à replanifier", "rendezvous", "Eleve", "commerciale"),
        ("essai-sans-suite", "Essai terminé : suite à donner", "rendezvous", "Normal", "commerciale"),
        ("transaction-action-vendeur", "Transaction : action du conseiller nécessaire", "transactions", "Eleve", "dossier"),
        ("transaction-attente-departement", "Transaction en attente d'un élément autorisé", "transactions", "Normal", "interne"),
        ("transaction-blocage-resolu", "Blocage récemment résolu", "transactions", "Normal", "dossier"),
        ("transaction-prete", "Transaction prête : livraison à planifier", "transactions", "Eleve", "dossier"),
        ("livraison-a-preparer", "Livraison prochaine à préparer", "transactions", "Normal", "dossier"),
        ("nouvelle-correspondance", "Nouveau véhicule correspondant à une demande", "opportunites", "Normal", "commerciale"),
        ("suivi-echeance", "Suivi demandé arrivé à échéance", "opportunites", "Normal", "commerciale"),
        ("achat-reporte", "Achat reporté : date de reprise atteinte", "opportunites", "Normal", "commerciale"),
        ("opportunite-sans-action", "Opportunité sans prochaine action", "opportunites", "Normal", "interne"),
        ("opportunite-inactive", "Opportunité inactive", "opportunites", "Faible", "interne"),
        ("qualifiee-sans-vehicule", "Opportunité qualifiée sans véhicule proposé", "opportunites", "Normal", "interne"),
        ("horizon-sans-proposition", "Achat proche sans proposition", "opportunites", "Normal", "commerciale"),
        // Phase 07 : relations clients (ventes perdues, après-vente, référencement). Même déduplication, priorisation,
        // résolution, report et expiration que les règles précédentes.
        ("perte-motif-inconnu", "Vente perdue : motif à vérifier", "relations", "Faible", "interne"),
        ("perte-recuperable", "Opportunité perdue : nouvelles conditions à examiner", "relations", "Normal", "interne"),
        ("perte-achat-reporte", "Achat reporté : date de reprise atteinte (opportunité perdue)", "relations", "Normal", "commerciale"),
        ("perte-correspondance", "Véhicule correspondant à une ancienne demande", "relations", "Normal", "commerciale"),
        ("satisfaction-a-planifier", "Livraison confirmée : suivi de satisfaction", "relations", "Normal", "dossier"),
        ("client-insatisfait", "Client insatisfait : prise en charge", "relations", "Eleve", "dossier"),
        ("probleme-a-traiter", "Problème client à traiter", "relations", "Eleve", "dossier"),
        ("probleme-resolu-verifier", "Problème résolu : vérifier avec le client", "relations", "Normal", "dossier"),
        ("invitation-referencement", "Client satisfait : invitation facultative à recommander", "relations", "Faible", "commerciale"),
        ("nouveau-prospect-recommande", "Nouveau prospect recommandé à prendre en charge", "prospects", "Eleve", "commerciale"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle, string Icone)> Categories =
    [
        ("prospects", "Nouveaux prospects", "bi-person-plus"),
        ("soumissions", "Soumissions", "bi-file-earmark-text"),
        ("rendezvous", "Rendez-vous", "bi-calendar-event"),
        ("transactions", "Transactions", "bi-cash-coin"),
        ("opportunites", "Opportunités commerciales", "bi-binoculars"),
        ("relations", "Relations clients", "bi-people"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle, string Icone)> Priorites =
    [
        ("Urgent", "Urgent", "bi-exclamation-octagon-fill"),
        ("Eleve", "Élevé", "bi-exclamation-triangle-fill"),
        ("Normal", "Normal", "bi-info-circle-fill"),
        ("Faible", "Faible", "bi-dash-circle"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> EtatsAction =
    [
        ("ATraiter", "À traiter"),
        ("EnCours", "En cours"),
        ("Reportee", "Reportée"),
        ("Terminee", "Terminée"),
        ("Ignoree", "Ignorée"),
        ("Obsolete", "Devenue obsolète"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> Tons =
    [
        ("professionnel", "Professionnel"),
        ("chaleureux", "Chaleureux"),
        ("concis", "Concis"),
        ("informatif", "Informatif"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> MotifsIgnorer =
    [
        ("deja-fait", "Déjà traité hors Phineas"),
        ("non-pertinent", "Pas pertinent pour ce client"),
        ("client-prefere-attendre", "Le client préfère attendre"),
        ("autre", "Autre motif"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> MotifsTransfert =
    [
        ("absence", "Absence ou congé"),
        ("horaire", "Hors de mes heures de travail"),
        ("charge", "Charge de travail"),
        ("expertise", "Expertise d'un collègue"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> StatutsDemande =
    [
        ("Active", "Recherche active"),
        ("CorrespondanceTrouvee", "Correspondance trouvée"),
        ("AVerifier", "À vérifier"),
        ("EnPause", "En pause"),
        ("Cloturee", "Clôturée"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> Consentements =
    [
        ("explicite", "Consentement explicite"),
        ("implicite", "Relation d'affaires en cours"),
        ("inconnu", "Consentement non documenté"),
        ("retire", "Consentement retiré"),
    ];

    // Matching : critères et pondérations illustratives (non validées statistiquement).
    public static readonly IReadOnlyList<(string Cle, string Libelle, int Poids)> CriteresMatching =
    [
        ("budget", "Budget", 30),
        ("categorie", "Catégorie", 25),
        ("caracteristiques", "Caractéristiques importantes", 20),
        ("etat", "Neuf ou occasion, année et kilométrage", 15),
        ("marque", "Marque et modèle préférés", 10),
    ];

    public static object PourClient() =>
        new
        {
            regles = Regles.Select(r => new { cle = r.Cle, libelle = r.Libelle, categorie = r.Categorie, priorite = r.Priorite, nature = r.Nature }),
            categories = Categories.Select(c => new { cle = c.Cle, libelle = c.Libelle, icone = c.Icone }),
            priorites = Priorites.Select(p => new { cle = p.Cle, libelle = p.Libelle, icone = p.Icone }),
            etatsAction = EtatsAction.ToDictionary(x => x.Cle, x => x.Libelle),
            tons = Tons.Select(x => new { cle = x.Cle, libelle = x.Libelle }),
            motifsIgnorer = MotifsIgnorer.ToDictionary(x => x.Cle, x => x.Libelle),
            motifsTransfert = MotifsTransfert.ToDictionary(x => x.Cle, x => x.Libelle),
            statutsDemande = StatutsDemande.ToDictionary(x => x.Cle, x => x.Libelle),
            consentements = Consentements.ToDictionary(x => x.Cle, x => x.Libelle),
            criteres = CriteresMatching.Select(c => new { cle = c.Cle, libelle = c.Libelle, poids = c.Poids }),
            config = new
            {
                delaiPremiereReponseHeures = DelaiPremiereReponseHeures,
                delaiRelanceSoumissionJours = DelaiRelanceSoumissionJours,
                delaiEntreRelancesJours = DelaiEntreRelancesJours,
                expirationProcheJours = ExpirationProcheJours,
                horizonPreparationHeures = HorizonPreparationHeures,
                horizonConfirmationHeures = HorizonConfirmationHeures,
                delaiInactiviteJours = DelaiInactiviteJours,
                delaiBlocageResoluJours = DelaiBlocageResoluJours,
                horizonLivraisonHeures = HorizonLivraisonHeures,
                seuilQualification = SeuilQualification,
                seuilCompatibilite = SeuilCompatibilite,
                couvertureMinimale = CouvertureMinimale,
            },
        };
}
