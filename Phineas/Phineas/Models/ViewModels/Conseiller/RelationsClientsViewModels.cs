namespace Phineas.Models.ViewModels.Conseiller;

// Relations clients (phase 07, frontend) : ventes perdues, récupération, satisfaction après-vente, problèmes clients
// et Referral Loop. Ces données sont des faits enregistrés (clôtures, retours, enquêtes, recommandations) ; les états
// de récupération, l'éligibilité au référencement et les statistiques sont calculés par relations-regles.js, et les
// actions recommandées par le moteur de la phase 06 (aucun second moteur de tâches).

// Clôture d'une opportunité perdue. L'origine du motif distingue ce qui est confirmé de ce qui est supposé.
// Origine : "client" (déclaré par le client), "vendeur-confirme" (information confirmée), "hypothese", "inconnu".
public record CloturePerte(
    string Id,
    string OpportuniteId,
    string Motif,
    string Origine,
    string EtapeAtteinte,
    string? Commentaire,
    bool SuiviPossible,
    DateTime? DateReprise,
    string? Conditions,
    string Restriction,
    DateTime Date,
    string Auteur,
    EvenementRecuperation? Evenement = null,
    ReactivationOpportunite? Reactivation = null
);

// Événement pertinent déclaré par le conseiller (ex. « le client a obtenu un nouvel emploi »).
public record EvenementRecuperation(string Texte, DateTime Le);

// Réactivation explicite par le conseiller : l'historique de la clôture est conservé.
public record ReactivationOpportunite(DateTime Le, string Evenement, string Par, string Etape);

// Retour volontaire d'un client après une opportunité non aboutie (réception simulée : aucun formulaire public).
public record RetourClientPerte(
    string Id,
    string OpportuniteId,
    DateTime RecuLe,
    string? VehiculeTrouve,
    string? Raison,
    string? Amelioration,
    bool? InformerSiDisponible
);

// Enquête de satisfaction rattachée à une transaction. Réponses de 1 à 5 par élément (absent = non évalué).
public record EnqueteSatisfaction(
    string Id,
    string TransactionId,
    DateTime RecueLe,
    IReadOnlyDictionary<string, int> Reponses,
    int Globale,
    string? Commentaire,
    bool RecontacterProbleme,
    bool? InteretRecommander
);

public record EvenementProbleme(DateTime Date, string Texte, string Auteur, string? De, string? Vers);

// Problème signalé après la vente : un dossier de suivi, pas un système de réparation ou de garantie.
// Statut : "Nouveau", "EnCours", "AttenteDepartement", "AttenteClient", "Resolu", "Cloture".
public record ProblemeApresVente(
    string Id,
    string TransactionId,
    string Type,
    string Nature,
    DateTime SignaleLe,
    string Departement,
    string? Responsable,
    string Priorite,
    string Statut,
    string? ProchaineAction,
    string? EnqueteId,
    DateTime? ResoluLe,
    DateTime? VerifieLe,
    IReadOnlyList<EvenementProbleme> Historique
);

// Profil commercial du conseiller (représentation frontend du futur profil public ; le compte Identity n'est pas modifié).
public record ProfilConseiller(
    string Presentation,
    string? TelephonePro,
    string? CourrielPro,
    IReadOnlyList<string> Langues,
    bool AfficherPhoto,
    bool AfficherTelephone,
    bool AfficherCourriel,
    bool AfficherLangues,
    string MessageCarte,
    string CodeRecommandation
);

// Invitation à recommander le conseiller, préparée par lui et déclarée « partagée » par lui (aucun envoi réel).
public record InvitationReferencement(
    string Id,
    string TransactionId,
    string Texte,
    DateTime PrepareeLe,
    DateTime? PartageeLe
);

// Recommandation attribuée : le prospect recommandé a manifesté lui-même son intérêt.
// Attribution : "lien-personnel" (formulaire de la carte), "declaration-prospect", "saisie-conseiller".
public record RecommandationRecue(
    string Id,
    string Reference,
    string ProspectId,
    string? OpportuniteId,
    string? ParrainProspectId,
    DateTime RecueLe,
    string Attribution,
    string ConseillerId,
    bool Doublon = false
);

public record DonneesRelationsClients(
    IReadOnlyList<CloturePerte> Clotures,
    IReadOnlyList<RetourClientPerte> Retours,
    IReadOnlyList<EnqueteSatisfaction> Enquetes,
    IReadOnlyList<ProblemeApresVente> Problemes,
    ProfilConseiller Profil,
    IReadOnlyList<InvitationReferencement> Invitations,
    IReadOnlyList<RecommandationRecue> Recommandations
);

public record ChargeRelations(DonneesRelationsClients Donnees, string ConseillerNom, string? Concession = null);

public class RelationsPageViewModel : IntelligencePageViewModel
{
    public string? TransactionId { get; init; }
    public string? Onglet { get; init; }
}

// Prévisualisation du parcours public : uniquement le profil professionnel autorisé du conseiller.
public class ApercuRecommandationViewModel
{
    public string ConseillerNom { get; init; } = "";
    public string? Concession { get; init; }
    public ProfilConseiller? Profil { get; init; }
}

// Libellés et réglages : une seule source pour Razor et le JavaScript (prépare la localisation FR / EN / ES).
public static class ReferentielsRelations
{
    // ---------- Réglages de démonstration (configurables, sans valeur scientifique) ----------
    public const int DelaiSuiviSatisfactionJours = 2;
    public const int FenetreSatisfactionJours = 30;
    public const int FenetreLivraisonRecenteJours = 60;
    public const int FenetreInvitationJours = 120;
    public const int DelaiVerificationResolutionJours = 2;
    public const int FenetreVerificationMotifJours = 30;
    public const int FenetreEvenementJours = 30;
    public const int FenetreRepriseJours = 30;
    public const int SeuilSatisfait = 4;
    public const int SeuilInsatisfait = 2;
    public const int ObservationsMinimales = 10;

    public static readonly IReadOnlyList<(string Cle, string Libelle)> MotifsPerte =
    [
        ("prix-eleve", "Prix trop élevé"),
        ("budget-incompatible", "Budget incompatible"),
        ("vehicule-indisponible", "Véhicule indisponible"),
        ("caracteristiques-absentes", "Caractéristiques recherchées absentes"),
        ("financement-refuse", "Financement non obtenu"),
        ("conditions-refusees", "Conditions commerciales non acceptées"),
        ("achat-reporte", "Achat reporté"),
        ("achat-ailleurs", "Client ayant acheté ailleurs"),
        ("experience-insatisfaisante", "Expérience client insatisfaisante"),
        ("delais", "Délais trop longs"),
        ("ne-souhaite-plus", "Client ne souhaitant plus poursuivre"),
        ("absence-reponse", "Absence de réponse"),
        ("autre", "Autre"),
        ("inconnu", "Motif inconnu"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> OriginesMotif =
    [
        ("client", "Déclaré par le client"),
        ("vendeur-confirme", "Information confirmée par le conseiller"),
        ("hypothese", "Hypothèse du conseiller (non confirmée)"),
        ("inconnu", "Motif inconnu"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle, string Icone)> EtatsRecuperation =
    [
        ("aucune", "Aucune récupération envisagée", "bi-slash-circle"),
        ("a-verifier", "Récupération à vérifier", "bi-question-circle"),
        ("attente-evenement", "En attente d'un événement", "bi-hourglass"),
        ("suivi-planifie", "Suivi planifié", "bi-calendar-check"),
        ("reactivee", "Opportunité réactivée", "bi-arrow-counterclockwise"),
        ("recuperee", "Récupérée avec succès", "bi-trophy"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> Restrictions =
    [
        ("aucune", "Aucune restriction exprimée"),
        ("dossier-seulement", "Communications liées au dossier uniquement"),
        ("ne-plus-contacter", "Ne souhaite plus être sollicité"),
    ];

    // Financement non obtenu : pistes que le conseiller peut examiner avec le client. Aucune approbation n'est promise.
    public static readonly IReadOnlyList<string> AlternativesFinancement =
    [
        "Revoir le véhicule ou la configuration pour un montant plus bas (nouvelle proposition à valider).",
        "Mise de fonds plus importante, uniquement si le client la propose.",
        "Achat comptant, si le client l'envisage.",
        "Nouvelle demande au Service F&A lorsque la situation du client a changé (décision par le personnel autorisé).",
    ];

    // Enquête de satisfaction : dimensions évaluées séparément (le conseiller n'est pas responsable de tout).
    public static readonly IReadOnlyList<(string Cle, string Libelle, string Departement, IReadOnlyList<(string Cle, string Libelle)> Elements)> Dimensions =
    [
        ("conseiller", "Expérience avec le conseiller", "conseiller",
            [("ecoute", "Écoute"), ("explications", "Qualité des explications"), ("disponibilite", "Disponibilité"), ("accompagnement", "Accompagnement")]),
        ("transparence", "Transparence commerciale", "direction",
            [("clarte-prix", "Clarté du prix"), ("options", "Compréhension des options"), ("proposition", "Compréhension de la proposition")]),
        ("administratif", "Expérience administrative et financière", "administration",
            [("etapes", "Clarté des étapes"), ("demarches", "Facilité des démarches"), ("delais", "Délais")]),
        ("livraison", "Préparation et livraison", "atelier",
            [("etat-vehicule", "État du véhicule"), ("engagements", "Respect des engagements"), ("experience-livraison", "Qualité de l'expérience de livraison")]),
    ];

    public static readonly IReadOnlyList<(int Valeur, string Libelle)> Echelle =
    [
        (1, "Très insatisfait"),
        (2, "Insatisfait"),
        (3, "Neutre"),
        (4, "Satisfait"),
        (5, "Très satisfait"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> TypesProbleme =
    [
        ("comprehension-paiement", "Condition de paiement mal comprise"),
        ("element-promis", "Élément promis manquant à la livraison"),
        ("vehicule", "Problème avec le véhicule"),
        ("document", "Document administratif à transmettre"),
        ("autre", "Autre"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> StatutsProbleme =
    [
        ("Nouveau", "Nouveau"),
        ("EnCours", "En cours"),
        ("AttenteDepartement", "En attente d'un département"),
        ("AttenteClient", "En attente du client"),
        ("Resolu", "Résolu"),
        ("Cloture", "Clôturé"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> Attributions =
    [
        ("lien-personnel", "Lien personnel du conseiller (formulaire volontaire)"),
        ("declaration-prospect", "Déclarée par le prospect"),
        ("saisie-conseiller", "Saisie par le conseiller"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> EtatsRecommandation =
    [
        ("nouveau", "Nouveau prospect"),
        ("qualification", "En qualification"),
        ("en-cours", "En cours"),
        ("gagne", "Gagné"),
        ("perdu", "Perdu"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> Langues =
    [
        ("fr", "Français"),
        ("en", "Anglais"),
        ("es", "Espagnol"),
    ];

    public static object PourClient() =>
        new
        {
            motifsPerte = MotifsPerte.ToDictionary(x => x.Cle, x => x.Libelle),
            originesMotif = OriginesMotif.ToDictionary(x => x.Cle, x => x.Libelle),
            etatsRecuperation = EtatsRecuperation.Select(x => new { cle = x.Cle, libelle = x.Libelle, icone = x.Icone }),
            restrictions = Restrictions.ToDictionary(x => x.Cle, x => x.Libelle),
            alternativesFinancement = AlternativesFinancement,
            dimensions = Dimensions.Select(d => new
            {
                cle = d.Cle,
                libelle = d.Libelle,
                departement = d.Departement,
                elements = d.Elements.Select(e => new { cle = e.Cle, libelle = e.Libelle }),
            }),
            echelle = Echelle.ToDictionary(x => x.Valeur.ToString(), x => x.Libelle),
            typesProbleme = TypesProbleme.ToDictionary(x => x.Cle, x => x.Libelle),
            statutsProbleme = StatutsProbleme.ToDictionary(x => x.Cle, x => x.Libelle),
            attributions = Attributions.ToDictionary(x => x.Cle, x => x.Libelle),
            etatsRecommandation = EtatsRecommandation.ToDictionary(x => x.Cle, x => x.Libelle),
            langues = Langues.ToDictionary(x => x.Cle, x => x.Libelle),
            config = new
            {
                delaiSuiviSatisfactionJours = DelaiSuiviSatisfactionJours,
                fenetreSatisfactionJours = FenetreSatisfactionJours,
                fenetreLivraisonRecenteJours = FenetreLivraisonRecenteJours,
                fenetreInvitationJours = FenetreInvitationJours,
                delaiVerificationResolutionJours = DelaiVerificationResolutionJours,
                fenetreVerificationMotifJours = FenetreVerificationMotifJours,
                fenetreEvenementJours = FenetreEvenementJours,
                fenetreRepriseJours = FenetreRepriseJours,
                seuilSatisfait = SeuilSatisfait,
                seuilInsatisfait = SeuilInsatisfait,
                observationsMinimales = ObservationsMinimales,
            },
        };
}
