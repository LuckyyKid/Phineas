namespace Phineas.Models.ViewModels.Conseiller;

// Outils du vendeur (phase 08, frontend) : assistant vendeur (Sales Coach), studio d'annonces, acquisition commerciale
// et performances. Aucune IA, aucune plateforme publicitaire ni aucun backend n'est appelé : les réponses de l'assistant
// et les textes d'annonce viennent de modèles déterministes ; les statistiques sont calculées dans le navigateur à partir
// des données des autres modules (performances-calcul.js).

// ---------- Studio d'annonces ----------
// Statut : "Brouillon", "EnRevision", "Approuvee", "PretePublication", "Publiee" (déclarée), "Archivee".
public record VarianteAnnonce(string Cle, string Titre, string Description);

public record EvenementAnnonce(DateTime Date, string Texte, string Auteur);

public record Annonce(
    string Id,
    string Reference,
    string VehiculeId,
    string Titre,
    string Description,
    IReadOnlyList<string> PointsForts,
    string AppelAction,
    string Objectif,
    string Style,
    string Canal,
    string Langue,
    string Statut,
    string ConseillerId,
    DateTime DateCreation,
    DateTime DateModification,
    IReadOnlyList<VarianteAnnonce> Variantes,
    string? VarianteRetenue,
    string? ValideePar,
    DateTime? ValideeLe,
    IReadOnlyList<EvenementAnnonce> Historique
);

// Publication suivie localement. « Publiee » seulement si le conseiller la déclare ; aucun identifiant de plateforme.
// Statut : "APreparer", "Prevue", "Publiee", "Retiree".
public record PublicationAnnonce(
    string Id,
    string AnnonceId,
    string Plateforme,
    string Statut,
    DateTime? DatePrevue,
    DateTime? DeclareeLe,
    string? Url,
    string ConseillerId,
    string? LienId
);

// ---------- Acquisition ----------
// Lien de provenance FICTIF : aucune route publique n'existe ; aucun renseignement personnel dans les paramètres.
public record LienProvenance(
    string Id,
    string Reference,
    string? AnnonceId,
    string? VehiculeId,
    string Source,
    string Support,
    string? Campagne,
    string ConseillerId,
    DateTime DateCreation
);

// Provenance d'un prospect. Méthode : "lien-suivi", "formulaire-site", "declaree", "saisie-conseiller".
// Une campagne n'est créditée que si la relation est établie (lien ou formulaire), jamais par simple coïncidence.
public record AttributionProspect(
    string Id,
    string ProspectId,
    string? OpportuniteId,
    string Source,
    string? LienId,
    string? AnnonceId,
    string? Campagne,
    string? VehiculeId,
    string Methode,
    DateTime EtablieLe,
    string ConseillerId
);

// Prospect confié au conseiller par la concession (répartition des demandes).
public record AttributionConcession(string ProspectId, DateTime Le, string Par);

// Prospection personnelle du conseiller : organisation de ses propres contacts, sans collecte automatique.
public record ProspectionPersonnelle(
    string Id,
    string Nom,
    string? Entreprise,
    string Type,
    string? VehiculeInteret,
    string? Contexte,
    DateTime? PremierContact,
    string? MoyenContactAutorise,
    string? ProchaineAction,
    DateTime? DateProchaineAction,
    string? ProspectId,
    string? OpportuniteId
);

// ---------- Assistant vendeur ----------
// Consultation de démonstration : aucune IA n'a répondu ; la réponse est reconstruite par des modèles déterministes.
public record ConsultationCoach(string Id, DateTime Le, string Mode, string? ContexteType, string? ContexteId, string Question);

public record DonneesOutilsVendeur(
    IReadOnlyList<Annonce> Annonces,
    IReadOnlyList<PublicationAnnonce> Publications,
    IReadOnlyList<LienProvenance> Liens,
    IReadOnlyList<AttributionProspect> Attributions,
    IReadOnlyList<AttributionConcession> AttributionsConcession,
    IReadOnlyList<ProspectionPersonnelle> Prospection,
    IReadOnlyList<ConsultationCoach> Consultations
);

public record ChargeOutils(DonneesOutilsVendeur Donnees, string ConseillerNom, string? Concession = null);

public class OutilsPageViewModel : IntelligencePageViewModel
{
    public string? Mode { get; init; }
    public string? ContexteType { get; init; }
    public string? ContexteId { get; init; }
    public string? AnnonceId { get; init; }
    public string? Onglet { get; init; }
}

// Libellés, guides et réglages : une seule source pour Razor et le JavaScript (prépare la localisation FR / EN / ES).
public static class ReferentielsOutils
{
    public const int DelaiPremiereReponseCibleHeures = 1;
    public const int ObservationsMinimales = 10;

    // ---------- Assistant vendeur ----------
    public static readonly IReadOnlyList<(string Cle, string Libelle, string Icone)> ModesCoach =
    [
        ("preparation-rdv", "Préparer mon rendez-vous", "bi-calendar-check"),
        ("vehicule", "Comprendre un véhicule", "bi-car-front"),
        ("objection", "Comprendre une objection", "bi-chat-left-dots"),
        ("scenario", "Expliquer un scénario d'achat", "bi-calculator"),
        ("procedure", "Comprendre une procédure", "bi-signpost-split"),
        ("relance", "Préparer une relance", "bi-arrow-repeat"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> Contextes =
    [
        ("aucun", "Aucun dossier (question générale)"),
        ("prospect", "Prospect"),
        ("opportunite", "Opportunité"),
        ("vehicule", "Véhicule"),
        ("soumission", "Soumission"),
        ("rendezvous", "Rendez-vous"),
        ("transaction", "Transaction"),
    ];

    // Guides d'objection : clarifier, vérifier, questionner. Aucune technique de pression ni de manipulation.
    public static readonly IReadOnlyList<(string Cle, string Libelle, string Clarifier, IReadOnlyList<string> Verifier, IReadOnlyList<string> Questions)> Objections =
    [
        ("prix", "Prix trop élevé",
            "Comprendre à quoi le client compare le prix (budget, autre offre, valeur perçue) avant de proposer quoi que ce soit.",
            ["Budget total déclaré dans la qualification", "Montant total estimé de la dernière soumission", "Options incluses et facultatives", "Autres véhicules compatibles dans le budget"],
            ["Par rapport à quoi le prix vous semble-t-il élevé ?", "Quel montant total aviez-vous en tête ?", "Quelles options sont essentielles pour vous ?"]),
        ("mensualite", "Paiement mensuel souhaité incompatible avec le budget réel",
            "Distinguer la mensualité du coût total : une durée plus longue baisse la mensualité mais augmente les intérêts.",
            ["Budget mensuel et budget total déclarés", "Mise de fonds envisagée", "Durée et taux hypothétiques de la soumission (non confirmés par F&A)"],
            ["Quelle mensualité vous semble raisonnable ?", "Préférez-vous réduire la mensualité ou le coût total ?", "Une mise de fonds est-elle envisageable ?"]),
        ("hesitation", "Client hésitant",
            "Identifier ce qui manque au client pour décider ; respecter son rythme.",
            ["Éléments de décision déclarés", "Questions restées sans réponse lors des derniers échanges", "Prochaine étape convenue"],
            ["Qu'est-ce qui vous aiderait à prendre votre décision ?", "Y a-t-il une information que je peux vous transmettre ?", "Souhaitez-vous en discuter avec un proche ?"]),
        ("comparaison", "Client souhaitant comparer deux véhicules",
            "Comparer sur des critères vérifiés (prix, équipements de la fiche, état), sans dénigrer l'autre véhicule.",
            ["Fiches d'inventaire des deux véhicules", "Critères importants déclarés par le client", "Compatibilité calculée par le Vehicle Matching Engine"],
            ["Quels critères comptent le plus pour vous ?", "Qu'est-ce qui vous plaît dans chacun des deux ?"]),
        ("frais", "Client préoccupé par les frais",
            "Détailler chaque montant de la soumission ; signaler ce qui reste estimé ou à confirmer.",
            ["Détail des options et des taxes de la soumission", "Éléments marqués « à confirmer » dans le calcul"],
            ["Quel montant souhaitez-vous que je détaille ?", "Voulez-vous une version sans option facultative ?"]),
        ("remise", "Client demandant une remise",
            "Ne jamais promettre de remise : toute remise au-delà du seuil exige l'approbation du directeur des ventes.",
            ["Remise déjà accordée sur la soumission", "Seuil d'approbation des remises (Deal Control Tower)", "Statut d'une demande de remise en cours"],
            ["Qu'est-ce qui rendrait la proposition acceptable pour vous ?", "Une autre configuration ou un autre véhicule conviendrait-il ?"]),
    ];

    // Procédures : seules celles réellement outillées dans Phineas Sales OS sont « documentées ».
    public static readonly IReadOnlyList<(string Cle, string Libelle, bool Documentee, string Module, IReadOnlyList<string> Etapes)> Procedures =
    [
        ("soumission", "Préparer une soumission", true, "Soumissions",
            ["Choisir le prospect et l'opportunité", "Sélectionner un véhicule disponible de l'inventaire", "Saisir l'offre (prix, options, reprise, mode d'achat)", "Vérifier les montants « à confirmer »", "Enregistrer, puis marquer prête à envoyer"]),
        ("essai", "Planifier un essai", true, "Rendez-vous",
            ["Choisir le prospect et l'opportunité", "Type « Essai routier » et créneau", "Choisir un véhicule disponible et prêt", "Compléter la liste de préparation de l'essai", "Les documents et conditions de l'essai sont vérifiés par le personnel autorisé"]),
        ("absence", "Gérer une absence", true, "Rendez-vous",
            ["Marquer le rendez-vous « Client absent »", "Indiquer la prochaine action (autre date, rappel…)", "Le Centre d'actions propose un nouveau créneau", "Replanifier : l'ancien créneau reste dans l'historique"]),
        ("transaction", "Ouvrir une transaction", true, "Transactions",
            ["Partir d'une soumission acceptée", "Vérifier la proposition retenue (figée)", "Choisir le mode d'achat", "Suivre les axes dans le Deal Control Tower"]),
        ("livraison", "Préparer une livraison", true, "Transactions",
            ["Vérifier que toutes les conditions de livraison sont remplies", "Planifier le rendez-vous de livraison", "Déclarer la remise du véhicule", "Confirmer la livraison, puis le suivi de satisfaction"]),
        ("transfert", "Transférer un dossier", true, "Prospects et Centre d'actions",
            ["Pour une absence : confier temporairement l'action à un collègue (Continuité)", "Pour un changement de responsable : modifier le conseiller dans la fiche du prospect", "Le transfert est tracé dans l'historique"]),
        ("depot", "Rembourser un dépôt", false, "",
            []),
    ];

    // Informations souvent demandées par les acheteurs mais absentes de la fiche d'inventaire : toujours « à confirmer ».
    public static readonly IReadOnlyList<string> InformationsHorsInventaire =
    [
        "Consommation",
        "Historique d'entretien",
        "Historique d'accidents",
        "Garantie restante",
        "Nombre de places (si non indiqué)",
    ];

    // ---------- Studio d'annonces ----------
    public static readonly IReadOnlyList<(string Cle, string Libelle)> StatutsAnnonce =
    [
        ("Brouillon", "Brouillon"),
        ("EnRevision", "En révision"),
        ("Approuvee", "Approuvée"),
        ("PretePublication", "Prête à publier"),
        ("Publiee", "Publiée (déclarée)"),
        ("Archivee", "Archivée"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> ObjectifsAnnonce =
    [
        ("presentation", "Présentation générale du véhicule"),
        ("equipements", "Mise en valeur des équipements"),
        ("en-ligne", "Description pour une annonce en ligne"),
        ("reseau-social", "Publication destinée à un réseau social"),
        ("prospect", "Présentation courte pour un prospect"),
        ("arrivee", "Annonce d'arrivée d'un véhicule"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> StylesAnnonce =
    [
        ("professionnel", "Professionnel"),
        ("informatif", "Informatif"),
        ("concis", "Concis"),
        ("dynamique", "Dynamique"),
        ("premium", "Premium"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle, string Description)> VariantesAnnonce =
    [
        ("fonctionnelle", "Variante A — Fonctionnelle", "Met l'accent sur les équipements et caractéristiques."),
        ("usage", "Variante B — Usage", "Présente le véhicule selon un besoin automobile pertinent."),
        ("synthetique", "Variante C — Synthétique", "Version courte, adaptée à une publication rapide."),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle, bool Disponible)> Langues =
    [
        ("fr", "Français", true),
        ("en", "Anglais", false),
        ("es", "Espagnol", false),
    ];

    // Mentions à vérifier avant validation : elles ne peuvent pas venir de l'inventaire (promesses, état, financement).
    public static readonly IReadOnlyList<(string Motif, string Raison)> MentionsAVerifier =
    [
        ("garanti", "Garantie : à confirmer, absente de la fiche d'inventaire."),
        ("jamais accidenté|aucun accident|sans accident", "Historique d'accidents : non documenté dans l'inventaire."),
        ("financement (approuvé|garanti|assuré)|approbation garantie|crédit garanti", "Aucune approbation de financement ne peut être promise."),
        ("meilleur prix|prix imbattable|plus bas prix", "Affirmation comparative non vérifiable."),
        ("dernière chance|aujourd'hui seulement|offre limitée|vite", "Fausse urgence interdite."),
        ("\\d+ ?%|taux de", "Taux ou pourcentage : non confirmé (décision F&A)."),
        ("économise|consomm", "Consommation : non documentée dans l'inventaire."),
    ];

    // ---------- Acquisition ----------
    public static readonly IReadOnlyList<(string Cle, string Libelle, string UtmSource)> Plateformes =
    [
        ("site-web", "Site Web de la concession", "site_web"),
        ("meta", "Meta (Facebook, Instagram)", "facebook"),
        ("google", "Google", "google"),
        ("kijiji", "Kijiji / annonce externe", "kijiji"),
        ("autre", "Autre plateforme", "autre"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> Supports =
    [
        ("organic", "Contenu non payé"),
        ("paid_social", "Publicité sur réseau social"),
        ("cpc", "Annonce payée au clic"),
        ("classified", "Petite annonce"),
        ("email", "Courriel"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> StatutsPublication =
    [
        ("APreparer", "À préparer"),
        ("Prevue", "Prévue"),
        ("Publiee", "Publiée (déclarée)"),
        ("Retiree", "Retirée / archivée"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> MethodesAttribution =
    [
        ("lien-suivi", "Lien de provenance"),
        ("formulaire-site", "Formulaire d'une annonce du site"),
        ("declaree", "Déclarée (aucune synchronisation avec la plateforme)"),
        ("saisie-conseiller", "Saisie par le conseiller"),
    ];

    // Origine du prospect pour le conseiller (distincte de la source d'acquisition).
    public static readonly IReadOnlyList<(string Cle, string Libelle)> Origines =
    [
        ("entrant", "Prospect entrant"),
        ("concession", "Attribué par la concession"),
        ("reseau", "Réseau du conseiller"),
        ("prospection", "Prospection personnelle"),
        ("referral", "Referral Loop (recommandation attribuée)"),
    ];

    public static readonly IReadOnlyList<(string Cle, string Libelle)> TypesProspection =
    [
        ("entreprise", "Entreprise locale"),
        ("salon", "Salon ou événement"),
        ("connaissance", "Connaissance personnelle"),
        ("ancien-client", "Ancien client"),
        ("autre", "Autre"),
    ];

    // Indicateurs publicitaires futurs : affichés « Données non connectées » tant qu'aucune intégration n'existe.
    public static readonly IReadOnlyList<(string Cle, string Libelle)> IndicateursPublicitaires =
    [
        ("budget", "Budget publicitaire"),
        ("depenses", "Dépenses réelles"),
        ("prospects", "Prospects attribués"),
        ("cout-prospect", "Coût par prospect"),
        ("rdv", "Rendez-vous attribués"),
        ("cout-rdv", "Coût par rendez-vous"),
        ("transactions", "Transactions attribuées"),
        ("cout-acquisition", "Coût d'acquisition"),
        ("revenus", "Revenus associés"),
        ("rentabilite", "Rentabilité estimée"),
    ];

    public static object PourClient() =>
        new
        {
            modesCoach = ModesCoach.Select(x => new { cle = x.Cle, libelle = x.Libelle, icone = x.Icone }),
            contextes = Contextes.ToDictionary(x => x.Cle, x => x.Libelle),
            objections = Objections.Select(o => new { cle = o.Cle, libelle = o.Libelle, clarifier = o.Clarifier, verifier = o.Verifier, questions = o.Questions }),
            procedures = Procedures.Select(p => new { cle = p.Cle, libelle = p.Libelle, documentee = p.Documentee, module = p.Module, etapes = p.Etapes }),
            informationsHorsInventaire = InformationsHorsInventaire,
            statutsAnnonce = StatutsAnnonce.ToDictionary(x => x.Cle, x => x.Libelle),
            objectifsAnnonce = ObjectifsAnnonce.ToDictionary(x => x.Cle, x => x.Libelle),
            stylesAnnonce = StylesAnnonce.ToDictionary(x => x.Cle, x => x.Libelle),
            variantesAnnonce = VariantesAnnonce.Select(v => new { cle = v.Cle, libelle = v.Libelle, description = v.Description }),
            langues = Langues.Select(l => new { cle = l.Cle, libelle = l.Libelle, disponible = l.Disponible }),
            mentionsAVerifier = MentionsAVerifier.Select(m => new { motif = m.Motif, raison = m.Raison }),
            plateformes = Plateformes.Select(p => new { cle = p.Cle, libelle = p.Libelle, utmSource = p.UtmSource }),
            supports = Supports.ToDictionary(x => x.Cle, x => x.Libelle),
            statutsPublication = StatutsPublication.ToDictionary(x => x.Cle, x => x.Libelle),
            methodesAttribution = MethodesAttribution.ToDictionary(x => x.Cle, x => x.Libelle),
            origines = Origines.ToDictionary(x => x.Cle, x => x.Libelle),
            typesProspection = TypesProspection.ToDictionary(x => x.Cle, x => x.Libelle),
            indicateursPublicitaires = IndicateursPublicitaires.Select(x => new { cle = x.Cle, libelle = x.Libelle }),
            config = new { delaiPremiereReponseCibleHeures = DelaiPremiereReponseCibleHeures, observationsMinimales = ObservationsMinimales },
        };
}
