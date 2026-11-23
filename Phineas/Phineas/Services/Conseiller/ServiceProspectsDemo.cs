using Phineas.Models.ViewModels.Account;
using Phineas.Models.ViewModels.Conseiller;

namespace Phineas.Services.Conseiller;

// Identifiants partagés entre le module Prospects et le tableau de bord (données fictives cohérentes).
public static class IdsProspectsDemo
{
    public const string ChloeBouchard = "chloe-bouchard";
    public const string VincentMorin = "vincent-morin";
    public const string InesBenali = "ines-benali";
    public const string KarimBenjelloun = "karim-benjelloun";
    public const string JulienCote = "julien-cote";
    public const string CamilleLavoie = "camille-lavoie";
    public const string IsabelleFortin = "isabelle-fortin";
    public const string OlivierPelletier = "olivier-pelletier";
    public const string LaurenceOuellet = "laurence-ouellet";
    public const string MathieuGauthier = "mathieu-gauthier";
    public const string SarahNguyen = "sarah-nguyen";
    public const string AlexandreDube = "alexandre-dube";

    // Phase 05 : clients dont le dossier d'achat est en cours de finalisation (transactions).
    public const string GabrielRoy = "gabriel-roy";
    public const string EmilieFournier = "emilie-fournier";
    public const string MarcDupuis = "marc-dupuis";
    public const string LeaMartin = "lea-martin";
    public const string PatrickLeblanc = "patrick-leblanc";
    public const string MelanieCaron = "melanie-caron";
    public const string FrancoisBelanger = "francois-belanger";
    public const string AmelieGirard = "amelie-girard";
    public const string NicolasBergeron = "nicolas-bergeron";
    public const string RachelDion = "rachel-dion";

    // Phase 06 : scénarios du moteur d'intelligence commerciale.
    public const string EricGendron = "eric-gendron";
    public const string HugoLambert = "hugo-lambert";
    public const string NadiaCloutier = "nadia-cloutier";
    public const string KevinOuimet = "kevin-ouimet";
    public const string SimonThibault = "simon-thibault";

    // Phase 07 : ventes perdues, après-vente et recommandations.
    public const string DanielProulx = "daniel-proulx";
    public const string JulieMenard = "julie-menard";
    public const string AnnieLessard = "annie-lessard";
    public const string PierreLavallee = "pierre-lavallee";
    public const string YannickPoirier = "yannick-poirier";
    public const string SteveTremblay = "steve-tremblay";
    public const string ValerieDesjardins = "valerie-desjardins";
    public const string MartineLavigne = "martine-lavigne";
    public const string BenoitLachance = "benoit-lachance";
    public const string MelissaHebert = "melissa-hebert";

    // Phase 08 : provenance non notée.
    public const string RemiGosselin = "remi-gosselin";
}

// DONNÉES FICTIVES — phase frontend uniquement.
// Personnes, coordonnées (domaine réservé exemple.test, numéros 555-01xx) et véhicules sont inventés,
// datés par rapport à « maintenant ». ServiceProspects y ajoute les prospects enregistrés en base.
public class ServiceProspectsDemo
{
    // Identifiant du conseiller connecté dans les données envoyées au navigateur (ConseillerConnecteId).
    public const string IdConseillerConnecte = "moi";
    private const string Moi = IdConseillerConnecte;
    private const string Antoine = "c-antoine";
    private const string MarieEve = "c-marie-eve";
    private const string Systeme = "Phineas";

    public Task<DonneesProspects> ObtenirAsync(UserSummaryViewModel conseiller)
    {
        var n = DateTime.Now;
        var j = n.Date;
        var moi = conseiller.FullName;
        var heureOlivier = FormatVente.Heure(CreneauxDemo.PresentationOlivier(n));

        var conseillers = new List<ConseillerResume>
        {
            new(Moi, moi, false),
            new(Antoine, "Antoine Lefebvre", true),
            new(MarieEve, "Marie-Ève Paquette", true),
        };

        var contacts = new List<ContactProspect>
        {
            new(IdsProspectsDemo.ChloeBouchard, "Chloé", "Bouchard", "chloe.bouchard@exemple.test", "514-555-0142",
                "courriel", "soir", "site-web", "Formulaire « Demande de soumission »", Moi, n.AddDays(-12)),
            new(IdsProspectsDemo.VincentMorin, "Vincent", "Morin", "vincent.morin@exemple.test", "450-555-0177",
                "telephone", "matin", "visite", null, Moi, n.AddDays(-20)),
            new(IdsProspectsDemo.InesBenali, "Inès", "Benali", "ines.benali@exemple.test", "438-555-0119",
                "telephone", null, "site-web", "Formulaire de contact — fiche Mazda CX-5", Moi, n.AddMinutes(-40)),
            new(IdsProspectsDemo.KarimBenjelloun, "Karim", "Benjelloun", "karim.b@exemple.test", "514-555-0163",
                "telephone", "apres-midi", "appel", null, Moi, n.AddDays(-9)),
            new(IdsProspectsDemo.JulienCote, "Julien", "Côté", "julien.cote@exemple.test", "819-555-0105",
                "texto", "midi", "meta", "Campagne camionnettes de novembre", Moi, n.AddDays(-6)),
            new(IdsProspectsDemo.CamilleLavoie, "Camille", "Lavoie", "camille.lavoie@exemple.test", "514-555-0188",
                "courriel", "indifferent", "recommandation", "Recommandée par Isabelle Fortin", Moi, n.AddDays(-15)),
            new(IdsProspectsDemo.IsabelleFortin, "Isabelle", "Fortin", "isabelle.fortin@exemple.test", "450-555-0131",
                "telephone", "soir", "kijiji", "Annonce Kia Sorento d'occasion", Moi, n.AddDays(-400)),
            new(IdsProspectsDemo.OlivierPelletier, "Olivier", "Pelletier", null, "514-555-0124",
                "telephone", null, "google", null, Moi, n.AddDays(-4)),
            new(IdsProspectsDemo.LaurenceOuellet, "Laurence", "Ouellet", "laurence.ouellet@exemple.test", "438-555-0150",
                "courriel", null, "meta", null, Moi, n.AddDays(-2)),
            new(IdsProspectsDemo.MathieuGauthier, "Mathieu", "Gauthier", "m.gauthier@exemple.test", "450-555-0196",
                "telephone", "matin", "prospection", "Salon de l'auto", Antoine, n.AddDays(-45)),
            new(IdsProspectsDemo.SarahNguyen, "Sarah", "Nguyen", "sarah.nguyen@exemple.test", "514-555-0110",
                "courriel", "soir", "google", null, MarieEve, n.AddDays(-30)),
            new(IdsProspectsDemo.AlexandreDube, "Alexandre", "Dubé", null, "514-555-0137",
                "telephone", null, "appel", null, Antoine, n.AddDays(-1)),

            new(IdsProspectsDemo.GabrielRoy, "Gabriel", "Roy", "gabriel.roy@exemple.test", "450-555-0102",
                "texto", "midi", "site-web", null, Moi, n.AddDays(-18)),
            new(IdsProspectsDemo.EmilieFournier, "Émilie", "Fournier", "emilie.fournier@exemple.test", "514-555-0174",
                "courriel", "soir", "google", null, Moi, n.AddDays(-21)),
            new(IdsProspectsDemo.MarcDupuis, "Marc", "Dupuis", "marc.dupuis@exemple.test", "438-555-0181",
                "telephone", "apres-midi", "visite", null, Moi, n.AddDays(-16)),
            new(IdsProspectsDemo.LeaMartin, "Léa", "Martin", "lea.martin@exemple.test", "514-555-0156",
                "courriel", "indifferent", "meta", null, Moi, n.AddDays(-14)),
            new(IdsProspectsDemo.PatrickLeblanc, "Patrick", "Leblanc", null, "819-555-0149",
                "telephone", "matin", "recommandation", "Client de l'atelier depuis 2018", Moi, n.AddDays(-12)),
            new(IdsProspectsDemo.MelanieCaron, "Mélanie", "Caron", "melanie.caron@exemple.test", "450-555-0168",
                "telephone", "soir", "kijiji", "Annonce Nissan Rogue 2022", Moi, n.AddDays(-11)),
            new(IdsProspectsDemo.FrancoisBelanger, "François", "Bélanger", "francois.belanger@exemple.test", "514-555-0193",
                "courriel", "matin", "site-web", null, Moi, n.AddDays(-25)),
            new(IdsProspectsDemo.AmelieGirard, "Amélie", "Girard", "amelie.girard@exemple.test", "438-555-0127",
                "texto", "apres-midi", "recommandation", "Recommandée par François Bélanger", Moi, n.AddDays(-28)),
            new(IdsProspectsDemo.NicolasBergeron, "Nicolas", "Bergeron", "nicolas.bergeron@exemple.test", "450-555-0115",
                "telephone", "soir", "visite", null, Moi, n.AddDays(-35)),
            new(IdsProspectsDemo.RachelDion, "Rachel", "Dion", "rachel.dion@exemple.test", "514-555-0162",
                "courriel", "midi", "google", null, Moi, n.AddDays(-19)),

            new(IdsProspectsDemo.EricGendron, "Éric", "Gendron", "eric.gendron@exemple.test", "438-555-0171",
                "courriel", "soir", "site-web", null, Moi, n.AddDays(-10)),
            new(IdsProspectsDemo.HugoLambert, "Hugo", "Lambert", "hugo.lambert@exemple.test", "514-555-0108",
                "telephone", "matin", "visite", null, Moi, n.AddDays(-20)),
            new(IdsProspectsDemo.NadiaCloutier, "Nadia", "Cloutier", "nadia.cloutier@exemple.test", "450-555-0185",
                "texto", "apres-midi", "google", null, Moi, n.AddDays(-40)),
            new(IdsProspectsDemo.KevinOuimet, "Kevin", "Ouimet", "kevin.ouimet@exemple.test", "819-555-0133",
                "telephone", "soir", "meta", null, Moi, n.AddDays(-16)),
            new(IdsProspectsDemo.SimonThibault, "Simon", "Thibault", "simon.thibault@exemple.test", "514-555-0129",
                "courriel", "indifferent", "recommandation", "Recommandé par Gabriel Roy", Moi, n.AddDays(-12)),

            new(IdsProspectsDemo.DanielProulx, "Daniel", "Proulx", "daniel.proulx@exemple.test", "514-555-0145",
                "courriel", "soir", "site-web", null, Moi, n.AddDays(-60)),
            new(IdsProspectsDemo.JulieMenard, "Julie", "Ménard", "julie.menard@exemple.test", "450-555-0112",
                "texto", "midi", "google", null, Moi, n.AddDays(-50)),
            new(IdsProspectsDemo.AnnieLessard, "Annie", "Lessard", "annie.lessard@exemple.test", "819-555-0164",
                "telephone", "apres-midi", "visite", null, Moi, n.AddDays(-70)),
            new(IdsProspectsDemo.PierreLavallee, "Pierre", "Lavallée", "pierre.lavallee@exemple.test", "438-555-0139",
                "courriel", null, "meta", null, Moi, n.AddDays(-35)),
            new(IdsProspectsDemo.YannickPoirier, "Yannick", "Poirier", null, "514-555-0157",
                "telephone", "soir", "kijiji", "Annonce Mazda CX-5 2022", Moi, n.AddDays(-40)),
            new(IdsProspectsDemo.SteveTremblay, "Steve", "Tremblay", "steve.tremblay@exemple.test", "819-555-0121",
                "telephone", "matin", "appel", null, Moi, n.AddDays(-55)),
            new(IdsProspectsDemo.ValerieDesjardins, "Valérie", "Desjardins", "valerie.desjardins@exemple.test", "450-555-0190",
                "courriel", "soir", "site-web", null, Moi, n.AddDays(-65)),
            new(IdsProspectsDemo.MartineLavigne, "Martine", "Lavigne", "martine.lavigne@exemple.test", "514-555-0176",
                "courriel", "indifferent", "site-web", null, Moi, n.AddDays(-50)),
            new(IdsProspectsDemo.BenoitLachance, "Benoît", "Lachance", "benoit.lachance@exemple.test", "450-555-0143",
                "telephone", "matin", "visite", null, Moi, n.AddDays(-80)),
            new(IdsProspectsDemo.MelissaHebert, "Mélissa", "Hébert", "melissa.hebert@exemple.test", null,
                "courriel", null, "recommandation", "Formulaire de la carte de recommandation (démonstration)", Moi, n.AddHours(-5)),
            new(IdsProspectsDemo.RemiGosselin, "Rémi", "Gosselin", null, "450-555-0161",
                "telephone", null, "inconnue", null, Moi, n.AddDays(-3)),
        };

        var opportunites = new List<Opportunite>
        {
            new("o-chloe-rav4", IdsProspectsDemo.ChloeBouchard, "VUS hybride", EtapeVente.Soumission,
                n.AddDays(-12), n.AddDays(-3), "Relancer par téléphone : la soumission expire demain", j,
                ["Toyota RAV4 Hybride XLE 2024"],
                new() { Categorie = "vus", Etat = "neuf", Marques = ["Toyota"], Modeles = ["RAV4 Hybride"], Places = 5,
                    Caracteristiques = ["hybride", "ti", "sieges-chauffants"], Utilisation = "quotidien",
                    BudgetTotal = 42_000, BudgetMensuel = 650, ModeAchat = "financement", MiseDeFonds = 5_000,
                    Reprise = "non", Horizon = "30j", ElementsDecision = ["consommation", "fiabilite", "mensualite"],
                    Objections = "Trouve les délais de livraison du neuf trop longs." }),

            new("o-vincent-civic", IdsProspectsDemo.VincentMorin, "Berline d'occasion", EtapeVente.Finalisation,
                n.AddDays(-20), n.AddDays(-2), "Obtenir la preuve de revenu pour le financement", j,
                ["Honda Civic Touring 2023"],
                new() { Categorie = "berline", Etat = "occasion", Marques = ["Honda"], Modeles = ["Civic"], Places = 5,
                    Caracteristiques = ["carplay", "sieges-chauffants"], Utilisation = "quotidien",
                    BudgetTotal = 31_500, BudgetMensuel = 480, ModeAchat = "financement", MiseDeFonds = 3_000,
                    Reprise = "oui", RepriseDetail = "Mazda 3 2015, environ 168 000 km", Horizon = "immediat",
                    ElementsDecision = ["mensualite", "fiabilite"] }),

            // Nouveau prospect non qualifié : seul le modèle consulté est connu.
            new("o-ines-cx5", IdsProspectsDemo.InesBenali, "Mazda CX-5", EtapeVente.Nouveau,
                n.AddMinutes(-40), n.AddMinutes(-40), "Premier appel (objectif : moins d'une heure)", j,
                ["Mazda CX-5 GT 2022"],
                new() { Marques = ["Mazda"], Modeles = ["CX-5"] }),

            new("o-karim-outback", IdsProspectsDemo.KarimBenjelloun, "VUS familial à traction intégrale", EtapeVente.Negociation,
                n.AddDays(-9), n.AddHours(-5), "Répondre à la contre-offre (écart de 1 200 $)", j,
                ["Subaru Outback Touring 2022"],
                new() { Categorie = "vus", Etat = "occasion", Marques = ["Subaru"], Modeles = ["Outback"], Places = 5,
                    Caracteristiques = ["ti", "coffre", "demarreur"], Utilisation = "famille",
                    BudgetTotal = 36_000, ModeAchat = "comptant", Reprise = "oui",
                    RepriseDetail = "Hyundai Elantra 2016, évaluation à faire", Horizon = "immediat",
                    ElementsDecision = ["prix", "reprise", "securite"],
                    Objections = "Juge l'offre de reprise trop basse." }),

            // Plusieurs véhicules envisagés pour une même opportunité.
            new("o-julien-camion", IdsProspectsDemo.JulienCote, "Camionnette de travail", EtapeVente.EssaiRoutier,
                n.AddDays(-6), n.AddDays(-1), "Envoyer un comparatif F-150 / Silverado / Ram", j.AddDays(1),
                ["Ford F-150 XLT 2021", "Chevrolet Silverado LT 2021", "Ram 1500 Big Horn 2020"],
                new() { Categorie = "camionnette", Etat = "occasion", Marques = ["Ford", "Chevrolet", "Ram"],
                    Modeles = ["F-150", "Silverado", "1500"], Places = 5,
                    Caracteristiques = ["remorquage", "ti", "demarreur"], Utilisation = "travail",
                    BudgetTotal = 48_000, BudgetMensuel = 700, ModeAchat = "financement", MiseDeFonds = 8_000,
                    Reprise = "a-determiner", Horizon = "30j", ElementsDecision = ["fiabilite", "prix", "garantie"],
                    Objections = "Hésite entre une garantie prolongée et un prix plus bas." }),

            // Budget précis, prospect issu d'une recommandation.
            new("o-camille-ioniq", IdsProspectsDemo.CamilleLavoie, "Véhicule électrique", EtapeVente.Qualifie,
                n.AddDays(-15), n.AddHours(-1), "Préparer l'essai routier de la Ioniq 5 (aujourd'hui)", j,
                ["Hyundai Ioniq 5 Preferred 2024", "Kia EV6 Wind 2024"],
                new() { Categorie = "vus", Etat = "indifferent", Marques = ["Hyundai", "Kia"], Modeles = ["Ioniq 5", "EV6"],
                    Places = 5, Caracteristiques = ["electrique", "ti", "aides"], Utilisation = "quotidien",
                    BudgetTotal = 48_500, ModeAchat = "financement", MiseDeFonds = 10_000, Reprise = "non",
                    Horizon = "1-3-mois", ElementsDecision = ["consommation", "securite", "prix"],
                    Objections = "Se demande si l'autonomie suffit en hiver." }),

            // Contact avec plusieurs opportunités distinctes (dont une ancienne vente gagnée).
            new("o-isabelle-sorento", IdsProspectsDemo.IsabelleFortin, "VUS 7 places", EtapeVente.EssaiRoutier,
                n.AddDays(-10), n.AddDays(-1), "Faire le suivi de l'essai routier d'hier", j,
                ["Kia Sorento LX 2023"],
                new() { Categorie = "vus", Etat = "occasion", Marques = ["Kia"], Modeles = ["Sorento"], Places = 7,
                    Caracteristiques = ["ti", "coffre"], Utilisation = "famille",
                    BudgetTotal = 38_000, BudgetMensuel = 550, ModeAchat = "financement", MiseDeFonds = 4_000,
                    Reprise = "oui", RepriseDetail = "Honda CR-V 2017 achetée à la concession", Horizon = "30j",
                    ElementsDecision = ["confort", "fiabilite", "mensualite"] }),
            new("o-isabelle-compacte", IdsProspectsDemo.IsabelleFortin, "Petite voiture d'occasion pour la ville", EtapeVente.AQualifier,
                n.AddDays(-3), n.AddDays(-3), null, null,
                [],
                new() { Categorie = "compacte", Etat = "occasion", Utilisation = "urbain", BudgetTotal = 15_000,
                    Horizon = "plus-tard" }),
            new("o-isabelle-crv", IdsProspectsDemo.IsabelleFortin, "Honda CR-V", EtapeVente.Gagne,
                n.AddDays(-400), n.AddDays(-385), null, null,
                ["Honda CR-V EX 2017"],
                new() { Categorie = "vus", Etat = "occasion", Marques = ["Honda"], Modeles = ["CR-V"], Places = 5,
                    Caracteristiques = ["ti"], Utilisation = "famille", BudgetTotal = 24_000,
                    ModeAchat = "financement", MiseDeFonds = 2_000, Reprise = "non", Horizon = "immediat" }),

            // Dossier aux informations de qualification manquantes.
            new("o-olivier-equinox", IdsProspectsDemo.OlivierPelletier, "VUS compact", EtapeVente.AQualifier,
                n.AddDays(-4), n.AddDays(-1), $"Confirmer le rendez-vous de {heureOlivier}", j,
                ["Chevrolet Equinox LT 2022"],
                new() { Categorie = "vus" }),

            // Prospect nécessitant un suivi : aucune prochaine action planifiée.
            new("o-laurence-vus", IdsProspectsDemo.LaurenceOuellet, "VUS compact", EtapeVente.Nouveau,
                n.AddDays(-2), n.AddDays(-2), null, null,
                [],
                new() { Categorie = "vus", Utilisation = "famille" }),

            new("o-mathieu-tacoma", IdsProspectsDemo.MathieuGauthier, "Camionnette intermédiaire", EtapeVente.Perdu,
                n.AddDays(-45), n.AddDays(-20), null, null,
                ["Toyota Tacoma TRD 2022"],
                new() { Categorie = "camionnette", Etat = "occasion", Marques = ["Toyota"], Modeles = ["Tacoma"], Places = 5,
                    Caracteristiques = ["remorquage", "ti"], Utilisation = "loisirs", BudgetTotal = 42_000,
                    ModeAchat = "financement", Reprise = "oui", Horizon = "immediat" }),

            new("o-sarah-tucson", IdsProspectsDemo.SarahNguyen, "VUS hybride", EtapeVente.Gagne,
                n.AddDays(-30), n.AddDays(-6), null, null,
                ["Hyundai Tucson Hybride 2024"],
                new() { Categorie = "vus", Etat = "neuf", Marques = ["Hyundai"], Modeles = ["Tucson Hybride"], Places = 5,
                    Caracteristiques = ["hybride", "ti"], Utilisation = "quotidien", BudgetTotal = 41_000,
                    BudgetMensuel = 600, ModeAchat = "financement", MiseDeFonds = 6_000, Reprise = "non",
                    Horizon = "immediat" }),

            new("o-alexandre", IdsProspectsDemo.AlexandreDube, "Besoin à préciser", EtapeVente.AQualifier,
                n.AddDays(-1), n.AddDays(-1), "Rappeler pour préciser son besoin", j.AddDays(2),
                [],
                new()),

            // Phase 05 : opportunités dont la transaction est ouverte (voir ServiceTransactionsDemo).
            new("o-gabriel-cx30", IdsProspectsDemo.GabrielRoy, "VUS compact", EtapeVente.Finalisation,
                n.AddDays(-18), n.AddDays(-2), "Confirmer la date de livraison quand le véhicule sera prêt", j.AddDays(1),
                ["Mazda CX-30 GS 2023"],
                new() { Categorie = "vus", Etat = "occasion", Marques = ["Mazda"], Modeles = ["CX-30"], Places = 5, Utilisation = "quotidien", BudgetTotal = 32_000, ModeAchat = "comptant", Reprise = "non", Horizon = "immediat", ElementsDecision = ["prix", "fiabilite"] }),
            new("o-emilie-corolla", IdsProspectsDemo.EmilieFournier, "Berline hybride neuve", EtapeVente.Finalisation,
                n.AddDays(-21), n.AddHours(-20), "Répondre à la demande d'ajout de pneus d'hiver", j,
                ["Toyota Corolla Hybride LE 2024"],
                new() { Categorie = "berline", Etat = "neuf", Marques = ["Toyota"], Modeles = ["Corolla"], Places = 5, Caracteristiques = ["hybride"], Utilisation = "quotidien", BudgetTotal = 33_000, BudgetMensuel = 520, ModeAchat = "financement", MiseDeFonds = 4_000, Reprise = "non", Horizon = "30j", ElementsDecision = ["consommation", "mensualite"] }),
            new("o-marc-escape", IdsProspectsDemo.MarcDupuis, "VUS compact d'occasion", EtapeVente.Finalisation,
                n.AddDays(-16), n.AddDays(-1), "Revoir les options avec le client après le refus du financement", j,
                ["Ford Escape SE 2022"],
                new() { Categorie = "vus", Etat = "occasion", Marques = ["Ford"], Modeles = ["Escape"], Places = 5, Utilisation = "famille", BudgetMensuel = 450, ModeAchat = "financement", MiseDeFonds = 1_500, Reprise = "non", Horizon = "30j", ElementsDecision = ["mensualite"] }),
            new("o-lea-kona", IdsProspectsDemo.LeaMartin, "VUS urbain", EtapeVente.Finalisation,
                n.AddDays(-14), n.AddHours(-26), "Rappeler les conditions de financement à la cliente", j.AddDays(1),
                ["Hyundai Kona Preferred 2023"],
                new() { Categorie = "vus", Etat = "occasion", Marques = ["Hyundai"], Modeles = ["Kona"], Places = 5, Utilisation = "urbain", BudgetMensuel = 480, ModeAchat = "financement", MiseDeFonds = 3_000, Reprise = "non", Horizon = "immediat", ElementsDecision = ["mensualite", "securite"] }),
            new("o-patrick-tundra", IdsProspectsDemo.PatrickLeblanc, "Camionnette pleine grandeur", EtapeVente.Finalisation,
                n.AddDays(-12), n.AddDays(-2), "Tenir le client informé de la réparation", j,
                ["Toyota Tundra SR5 2021"],
                new() { Categorie = "camionnette", Etat = "occasion", Marques = ["Toyota"], Modeles = ["Tundra"], Places = 5, Caracteristiques = ["remorquage", "ti"], Utilisation = "travail", BudgetTotal = 50_000, ModeAchat = "financement", MiseDeFonds = 15_000, Reprise = "non", Horizon = "immediat", ElementsDecision = ["fiabilite", "garantie"] }),
            new("o-melanie-rogue", IdsProspectsDemo.MelanieCaron, "VUS familial", EtapeVente.Finalisation,
                n.AddDays(-11), n.AddDays(-2), "Compléter les informations de la reprise", j,
                ["Nissan Rogue SV 2022"],
                new() { Categorie = "vus", Etat = "occasion", Marques = ["Nissan"], Modeles = ["Rogue"], Places = 5, Caracteristiques = ["ti", "sieges-chauffants"], Utilisation = "famille", BudgetMensuel = 500, ModeAchat = "financement", MiseDeFonds = 2_000, Reprise = "oui", RepriseDetail = "Honda Civic 2014", Horizon = "30j", ElementsDecision = ["mensualite", "reprise"] }),
            new("o-francois-seltos", IdsProspectsDemo.FrancoisBelanger, "VUS sous-compact", EtapeVente.Finalisation,
                n.AddDays(-25), n.AddDays(-1), "Planifier la livraison", j,
                ["Kia Seltos EX 2023"],
                new() { Categorie = "vus", Etat = "occasion", Marques = ["Kia"], Modeles = ["Seltos"], Places = 5, Caracteristiques = ["ti"], Utilisation = "quotidien", BudgetTotal = 30_000, ModeAchat = "comptant", Reprise = "non", Horizon = "immediat", ElementsDecision = ["prix"] }),
            new("o-amelie-crosstrek", IdsProspectsDemo.AmelieGirard, "VUS compact à traction intégrale", EtapeVente.Finalisation,
                n.AddDays(-28), n.AddDays(-1), "Livraison prévue demain", j.AddDays(1),
                ["Subaru Crosstrek 2023"],
                new() { Categorie = "vus", Etat = "occasion", Marques = ["Subaru"], Modeles = ["Crosstrek"], Places = 5, Caracteristiques = ["ti"], Utilisation = "loisirs", BudgetMensuel = 520, ModeAchat = "financement", MiseDeFonds = 5_000, Reprise = "non", Horizon = "immediat", ElementsDecision = ["securite", "fiabilite"] }),
            new("o-nicolas-tiguan", IdsProspectsDemo.NicolasBergeron, "VUS compact", EtapeVente.Finalisation,
                n.AddDays(-35), n.AddDays(-1), "Clôturer le dossier et faire le suivi après livraison", j.AddDays(2),
                ["Volkswagen Tiguan Comfortline 2022"],
                new() { Categorie = "vus", Etat = "occasion", Marques = ["Volkswagen"], Modeles = ["Tiguan"], Places = 5, Utilisation = "famille", BudgetTotal = 34_000, ModeAchat = "comptant", Reprise = "non", Horizon = "immediat", ElementsDecision = ["confort"] }),
            new("o-rachel-santafe", IdsProspectsDemo.RachelDion, "VUS intermédiaire", EtapeVente.Finalisation,
                n.AddDays(-19), n.AddHours(-3), "Informer la cliente du nouveau diagnostic", j,
                ["Hyundai Santa Fe Preferred 2022"],
                new() { Categorie = "vus", Etat = "occasion", Marques = ["Hyundai"], Modeles = ["Santa Fe"], Places = 5, Caracteristiques = ["ti"], Utilisation = "famille", BudgetMensuel = 600, ModeAchat = "financement", MiseDeFonds = 6_000, Reprise = "non", Horizon = "immediat", ElementsDecision = ["securite", "confort"] }),

            // Phase 06 : soumission envoyée sans réponse, puis client absent à l'essai.
            new("o-eric-cx5", IdsProspectsDemo.EricGendron, "VUS compact d'occasion", EtapeVente.Soumission,
                n.AddDays(-10), n.AddDays(-1), "Attendre la réponse sur la soumission", j.AddDays(2),
                ["Mazda CX-5 GT 2022"],
                new() { Categorie = "vus", Etat = "occasion", Marques = ["Mazda"], Modeles = ["CX-5"], Places = 5,
                    Caracteristiques = ["ti", "sieges-chauffants"], Utilisation = "quotidien", BudgetTotal = 34_000,
                    ModeAchat = "financement", MiseDeFonds = 4_000, Reprise = "non", Horizon = "30j", ElementsDecision = ["prix", "securite"] }),
            // Ne souhaite plus être sollicité : ses relances commerciales sont suspendues.
            new("o-hugo-equinox", IdsProspectsDemo.HugoLambert, "VUS compact", EtapeVente.Soumission,
                n.AddDays(-20), n.AddDays(-2), null, null,
                ["Chevrolet Equinox LT 2022"],
                new() { Categorie = "vus", Etat = "occasion", Places = 5, Caracteristiques = ["ti"], Utilisation = "quotidien",
                    BudgetTotal = 30_000, ModeAchat = "comptant", Reprise = "non", Horizon = "1-3-mois" }),
            // Achat reporté (pause jusqu'à hier) et demande de recherche non satisfaite.
            new("o-nadia-hybride", IdsProspectsDemo.NadiaCloutier, "VUS hybride abordable", EtapeVente.Qualifie,
                n.AddDays(-40), n.AddDays(-30), null, null,
                [],
                new() { Categorie = "vus", Etat = "occasion", Places = 5, Caracteristiques = ["hybride", "ti"], Utilisation = "quotidien",
                    BudgetTotal = 32_000, ModeAchat = "financement", MiseDeFonds = 3_000, Reprise = "non", Horizon = "1-3-mois",
                    ElementsDecision = ["consommation", "prix"] }),
            // Opportunité qualifiée qui stagne : aucune action, aucun véhicule proposé, achat prévu sous 30 jours.
            new("o-kevin-vus", IdsProspectsDemo.KevinOuimet, "VUS à traction intégrale", EtapeVente.Qualifie,
                n.AddDays(-16), n.AddDays(-9), null, null,
                [],
                new() { Categorie = "vus", Etat = "occasion", Marques = ["Mazda", "Subaru"], Places = 5, Caracteristiques = ["ti", "demarreur"],
                    Utilisation = "famille", BudgetTotal = 35_000, ModeAchat = "financement", MiseDeFonds = 5_000, Reprise = "non",
                    Horizon = "30j", ElementsDecision = ["securite", "prix"] }),
            // Soumission acceptée hier, aucune transaction ouverte.
            new("o-simon-crv", IdsProspectsDemo.SimonThibault, "VUS hybride neuf", EtapeVente.Negociation,
                n.AddDays(-12), n.AddDays(-1), "Ouvrir le dossier d'achat", j,
                ["Honda CR-V Hybride EX-L 2024"],
                new() { Categorie = "vus", Etat = "neuf", Marques = ["Honda"], Modeles = ["CR-V"], Places = 5, Caracteristiques = ["hybride", "ti"],
                    Utilisation = "famille", BudgetTotal = 48_000, ModeAchat = "comptant", Reprise = "non", Horizon = "immediat" }),

            // Phase 07 : opportunités perdues (motifs et origines distincts) et opportunité réactivée.
            new("o-daniel-rav4", IdsProspectsDemo.DanielProulx, "VUS hybride neuf", EtapeVente.Perdu,
                n.AddDays(-60), n.AddDays(-25), null, null,
                ["Toyota RAV4 Hybride XLE 2024"],
                new() { Categorie = "vus", Etat = "neuf", Marques = ["Toyota"], Modeles = ["RAV4 Hybride"], Places = 5, Caracteristiques = ["hybride"],
                    Utilisation = "quotidien", BudgetTotal = 36_000, ModeAchat = "financement", Reprise = "non", Horizon = "30j", ElementsDecision = ["prix"] }),
            new("o-julie-hybride", IdsProspectsDemo.JulieMenard, "VUS hybride d'occasion", EtapeVente.Perdu,
                n.AddDays(-50), n.AddDays(-18), null, null,
                ["Toyota Corolla Cross Hybride 2022 (vendu)"],
                new() { Categorie = "vus", Etat = "occasion", Places = 5, Caracteristiques = ["hybride", "ti"], Utilisation = "quotidien",
                    BudgetTotal = 32_000, ModeAchat = "financement", Reprise = "non", Horizon = "1-3-mois", ElementsDecision = ["consommation"] }),
            new("o-annie-berline", IdsProspectsDemo.AnnieLessard, "Berline compacte", EtapeVente.Perdu,
                n.AddDays(-70), n.AddDays(-40), null, null,
                [],
                new() { Categorie = "berline", Etat = "occasion", Places = 5, Utilisation = "urbain", BudgetTotal = 25_000,
                    ModeAchat = "financement", Reprise = "oui", RepriseDetail = "Véhicule en location, fin de contrat prévue", Horizon = "plus-tard" }),
            new("o-pierre-civic", IdsProspectsDemo.PierreLavallee, "Berline sportive", EtapeVente.Perdu,
                n.AddDays(-35), n.AddDays(-14), null, null,
                ["Honda Civic Touring 2023"],
                new() { Categorie = "berline", Marques = ["Honda"], Modeles = ["Civic"], BudgetTotal = 32_000 }),
            new("o-yannick-tucson", IdsProspectsDemo.YannickPoirier, "VUS compact", EtapeVente.Perdu,
                n.AddDays(-40), n.AddDays(-12), null, null,
                ["Mazda CX-5 GT 2022"],
                new() { Categorie = "vus", Etat = "occasion", Places = 5, Caracteristiques = ["ti"], BudgetTotal = 33_000,
                    ModeAchat = "comptant", Horizon = "30j" }),
            new("o-steve-camionnette", IdsProspectsDemo.SteveTremblay, "Camionnette 4x4 d'occasion", EtapeVente.Perdu,
                n.AddDays(-55), n.AddDays(-30), null, null,
                ["Chevrolet Silverado LT 2021"],
                new() { Categorie = "camionnette", Etat = "occasion", Places = 5, Caracteristiques = ["ti", "remorquage"], Utilisation = "travail",
                    BudgetTotal = 46_000, ModeAchat = "financement", MiseDeFonds = 5_000, Reprise = "non", Horizon = "1-3-mois" }),
            new("o-valerie-cx5", IdsProspectsDemo.ValerieDesjardins, "VUS compact", EtapeVente.AQualifier,
                n.AddDays(-65), n.AddDays(-3), "Mettre à jour le budget et les besoins", j.AddDays(1),
                ["Mazda CX-5 GT 2022"],
                new() { Categorie = "vus", Etat = "occasion", Places = 5, Caracteristiques = ["ti"], BudgetMensuel = 450,
                    ModeAchat = "financement", Horizon = "30j" }),

            // Ventes conclues et livrées : suivi après-vente.
            new("o-martine-hrv", IdsProspectsDemo.MartineLavigne, "VUS sous-compact", EtapeVente.Gagne,
                n.AddDays(-50), n.AddDays(-15), null, null,
                ["Honda HR-V EX-L 2023"],
                new() { Categorie = "vus", Etat = "occasion", Marques = ["Honda"], Modeles = ["HR-V"], Places = 5, Caracteristiques = ["ti"],
                    Utilisation = "urbain", BudgetTotal = 31_000, ModeAchat = "comptant", Reprise = "non", Horizon = "immediat" }),
            new("o-benoit-forester", IdsProspectsDemo.BenoitLachance, "VUS familial", EtapeVente.Gagne,
                n.AddDays(-80), n.AddDays(-40), null, null,
                ["Subaru Forester Touring 2022"],
                new() { Categorie = "vus", Etat = "occasion", Marques = ["Subaru"], Modeles = ["Forester"], Places = 5, Caracteristiques = ["ti"],
                    Utilisation = "famille", BudgetTotal = 35_000, ModeAchat = "comptant", Reprise = "non", Horizon = "immediat" }),

            // Prospect recommandé : a rempli lui-même le formulaire de la carte (démonstration).
            new("o-melissa-vus", IdsProspectsDemo.MelissaHebert, "VUS compact", EtapeVente.Nouveau,
                n.AddHours(-5), n.AddHours(-5), null, null,
                [],
                new() { Categorie = "vus", BudgetTotal = 30_000, Horizon = "1-3-mois" }),

            // Phase 08 : source inconnue (coordonnées laissées à l'accueil).
            new("o-remi-berline", IdsProspectsDemo.RemiGosselin, "Berline d'occasion", EtapeVente.AQualifier,
                n.AddDays(-3), n.AddDays(-2), "Rappeler pour préciser le budget", j.AddDays(1),
                [],
                new() { Categorie = "berline", Etat = "occasion" }),
        };

        var i = 0;
        string Id() => $"i-{++i}";

        var interactions = new List<InteractionProspect>
        {
            new(Id(), IdsProspectsDemo.ChloeBouchard, "o-chloe-rav4", n.AddDays(-12), "creation", Systeme,
                "Prospect créé à partir du formulaire du site Web."),
            new(Id(), IdsProspectsDemo.ChloeBouchard, "o-chloe-rav4", n.AddDays(-11), "appel", moi,
                "Premier appel. Cherche un VUS hybride pour ses trajets quotidiens, budget autour de 42 000 $."),
            new(Id(), IdsProspectsDemo.ChloeBouchard, "o-chloe-rav4", n.AddDays(-8), "visite", moi,
                "Visite en concession, a vu le RAV4 XLE. Souhaite comparer avec un CR-V hybride.", "Préparer la soumission"),
            new(Id(), IdsProspectsDemo.ChloeBouchard, "o-chloe-rav4", n.AddDays(-3).AddMinutes(-5), "etape", Systeme,
                "Étape : Rendez-vous / essai → Soumission"),
            new(Id(), IdsProspectsDemo.ChloeBouchard, "o-chloe-rav4", n.AddDays(-3), "courriel", moi,
                "Soumission envoyée par courriel, valide 4 jours.", "Relancer sans réponse"),
            new(Id(), IdsProspectsDemo.ChloeBouchard, "o-chloe-rav4", n.AddDays(-2), "rendezvous", moi,
                "Discussion de la soumission replanifiée en fin de journée, à la demande de la cliente (retard au travail)."),

            new(Id(), IdsProspectsDemo.VincentMorin, "o-vincent-civic", n.AddDays(-20), "visite", moi,
                "Visite spontanée, intéressé par la Civic Touring d'occasion."),
            new(Id(), IdsProspectsDemo.VincentMorin, "o-vincent-civic", n.AddDays(-6), "etape", Systeme,
                "Étape : Négociation → Finalisation"),
            new(Id(), IdsProspectsDemo.VincentMorin, "o-vincent-civic", n.AddDays(-2), "note", moi,
                "Dossier de financement incomplet : preuve de revenu manquante.", "Obtenir la preuve de revenu"),

            new(Id(), IdsProspectsDemo.InesBenali, "o-ines-cx5", n.AddMinutes(-40), "creation", Systeme,
                "Prospect créé à partir du formulaire de contact du site Web (Mazda CX-5 GT 2022)."),

            new(Id(), IdsProspectsDemo.KarimBenjelloun, "o-karim-outback", n.AddDays(-9), "appel", moi,
                "Appel entrant. Cherche un VUS à traction intégrale pour la famille, paiement comptant."),
            new(Id(), IdsProspectsDemo.KarimBenjelloun, "o-karim-outback", n.AddDays(-4), "visite", moi,
                "Essai de l'Outback, très satisfait. Veut faire évaluer son Elantra."),
            new(Id(), IdsProspectsDemo.KarimBenjelloun, "o-karim-outback", n.AddHours(-5), "note", moi,
                "Contre-offre reçue : 1 200 $ sous le prix affiché.", "Répondre à la contre-offre"),

            new(Id(), IdsProspectsDemo.JulienCote, "o-julien-camion", n.AddDays(-6), "creation", moi,
                "Prospect saisi manuellement à partir d'une réponse à la publicité Meta."),
            new(Id(), IdsProspectsDemo.JulienCote, "o-julien-camion", n.AddDays(-5), "appel", moi,
                "Cherche une camionnette pour le travail, doit tirer une remorque d'environ 5 000 lb."),
            new(Id(), IdsProspectsDemo.JulienCote, "o-julien-camion", n.AddDays(-1), "visite", moi,
                "Essai routier du F-150. Veut comparer avec le Silverado et le Ram 1500.", "Envoyer un comparatif"),

            new(Id(), IdsProspectsDemo.CamilleLavoie, "o-camille-ioniq", n.AddDays(-15), "creation", moi,
                "Prospect créé : recommandée par Isabelle Fortin."),
            new(Id(), IdsProspectsDemo.CamilleLavoie, "o-camille-ioniq", n.AddDays(-14), "appel", moi,
                "Intéressée par un véhicule électrique, budget ferme de 48 500 $."),
            new(Id(), IdsProspectsDemo.CamilleLavoie, null, n.AddDays(-10), "note", moi,
                "Préfère être contactée par courriel."),
            new(Id(), IdsProspectsDemo.CamilleLavoie, "o-camille-ioniq", n.AddHours(-1), "note", moi,
                "La Ioniq 5 Preferred 2024 est arrivée en inventaire.", "L'en informer"),

            new(Id(), IdsProspectsDemo.IsabelleFortin, "o-isabelle-crv", n.AddDays(-400), "creation", moi,
                "Prospect créé à la suite d'une visite en concession."),
            new(Id(), IdsProspectsDemo.IsabelleFortin, "o-isabelle-crv", n.AddDays(-385), "etape", Systeme,
                "Étape : Finalisation → Gagné"),
            new(Id(), IdsProspectsDemo.IsabelleFortin, "o-isabelle-sorento", n.AddDays(-10), "appel", moi,
                "A vu notre annonce Kijiji du Sorento. Cherche un 7 places."),
            new(Id(), IdsProspectsDemo.IsabelleFortin, "o-isabelle-compacte", n.AddDays(-3), "note", moi,
                "Mentionne un second projet, plus tard : une petite voiture d'occasion pour la ville."),
            new(Id(), IdsProspectsDemo.IsabelleFortin, "o-isabelle-sorento", n.AddDays(-2), "appel", moi,
                "Essai routier du Sorento confirmé pour demain 10 h 30."),
            new(Id(), IdsProspectsDemo.IsabelleFortin, "o-isabelle-sorento", j.AddDays(-1).AddHours(11).AddMinutes(30), "rendezvous", moi,
                "Essai routier terminé : client toujours intéressé. Apprécie l'espace de la troisième rangée ; trouve la consommation élevée.",
                "Préparer une soumission avec reprise du CR-V 2017"),

            new(Id(), IdsProspectsDemo.OlivierPelletier, "o-olivier-equinox", n.AddDays(-4), "creation", moi,
                "Prospect saisi manuellement à partir d'une demande reçue par la publicité Google."),
            new(Id(), IdsProspectsDemo.OlivierPelletier, "o-olivier-equinox", n.AddDays(-1), "appel", moi,
                $"Présentation de l'Equinox fixée à demain {heureOlivier}. Budget et délai non abordés.", "Confirmer le rendez-vous"),

            new(Id(), IdsProspectsDemo.LaurenceOuellet, "o-laurence-vus", n.AddDays(-2), "creation", moi,
                "Prospect saisi manuellement à partir d'une réponse à la publicité Meta."),
            new(Id(), IdsProspectsDemo.LaurenceOuellet, "o-laurence-vus", n.AddDays(-1).AddHours(-3), "rendezvous", moi,
                "Consultation d'hier annulée par la cliente (empêchement). Souhaite revenir plus tard dans la semaine."),

            new(Id(), IdsProspectsDemo.MathieuGauthier, "o-mathieu-tacoma", n.AddDays(-45), "visite", "Antoine Lefebvre",
                "Rencontre au Salon de l'auto, intéressé par un Tacoma."),
            new(Id(), IdsProspectsDemo.MathieuGauthier, "o-mathieu-tacoma", n.AddDays(-20), "etape", Systeme,
                "Étape : Négociation → Perdu (a acheté ailleurs)"),

            new(Id(), IdsProspectsDemo.SarahNguyen, "o-sarah-tucson", n.AddDays(-30), "creation", "Marie-Ève Paquette",
                "Prospect saisi manuellement à partir d'une demande reçue par la publicité Google."),
            new(Id(), IdsProspectsDemo.SarahNguyen, "o-sarah-tucson", n.AddDays(-6), "etape", Systeme,
                "Étape : Finalisation → Gagné. Véhicule livré."),

            new(Id(), IdsProspectsDemo.AlexandreDube, "o-alexandre", n.AddDays(-1).AddHours(-6), "appel", "Antoine Lefebvre",
                "Appel entrant, besoin encore flou. Consultation fixée à 14 h."),
            new(Id(), IdsProspectsDemo.AlexandreDube, "o-alexandre", j.AddDays(-1).AddHours(14).AddMinutes(25), "rendezvous", "Antoine Lefebvre",
                "Client absent à la consultation de 14 h.", "Rappeler pour préciser son besoin"),

            new(Id(), IdsProspectsDemo.GabrielRoy, "o-gabriel-cx30", n.AddDays(-18), "creation", Systeme,
                "Prospect créé à partir du formulaire du site Web."),
            new(Id(), IdsProspectsDemo.GabrielRoy, "o-gabriel-cx30", n.AddDays(-4), "transaction", moi,
                "TRX-2026-0018 · Transaction ouverte : Mazda CX-30 GS 2023 (achat comptant)."),
            new(Id(), IdsProspectsDemo.EmilieFournier, "o-emilie-corolla", n.AddDays(-21), "creation", Systeme,
                "Prospect saisi à partir d'une demande reçue par la publicité Google."),
            new(Id(), IdsProspectsDemo.EmilieFournier, "o-emilie-corolla", n.AddDays(-2), "transaction", moi,
                "TRX-2026-0021 · Financement approuvé par le service F&A."),
            new(Id(), IdsProspectsDemo.EmilieFournier, "o-emilie-corolla", n.AddHours(-20), "courriel", moi,
                "La cliente souhaite ajouter des pneus d'hiver : version 3 de la soumission préparée en brouillon.", "Répondre à la demande"),
            new(Id(), IdsProspectsDemo.MarcDupuis, "o-marc-escape", n.AddDays(-16), "visite", moi,
                "Visite en concession, intéressé par l'Escape SE 2022."),
            new(Id(), IdsProspectsDemo.MarcDupuis, "o-marc-escape", n.AddDays(-1), "transaction", moi,
                "TRX-2026-0022 · Financement refusé par le service F&A."),
            new(Id(), IdsProspectsDemo.LeaMartin, "o-lea-kona", n.AddDays(-14), "creation", moi,
                "Prospect saisi à partir d'une réponse à la publicité Meta."),
            new(Id(), IdsProspectsDemo.LeaMartin, "o-lea-kona", n.AddHours(-26), "transaction", moi,
                "TRX-2026-0023 · Financement approuvé sous conditions par le service F&A."),
            new(Id(), IdsProspectsDemo.PatrickLeblanc, "o-patrick-tundra", n.AddDays(-12), "appel", moi,
                "Appel entrant : recommandé par l'atelier, cherche un Tundra pour son entreprise."),
            new(Id(), IdsProspectsDemo.PatrickLeblanc, "o-patrick-tundra", n.AddDays(-2), "transaction", Systeme,
                "TRX-2026-0024 · L'atelier signale une réparation en attente de pièce."),
            new(Id(), IdsProspectsDemo.MelanieCaron, "o-melanie-rogue", n.AddDays(-11), "appel", moi,
                "A vu l'annonce Kijiji du Rogue. Souhaite faire reprendre sa Civic 2014."),
            new(Id(), IdsProspectsDemo.MelanieCaron, "o-melanie-rogue", n.AddDays(-2), "transaction", Systeme,
                "TRX-2026-0025 · Dossier de financement jugé incomplet par le service F&A."),
            new(Id(), IdsProspectsDemo.FrancoisBelanger, "o-francois-seltos", n.AddDays(-25), "creation", Systeme,
                "Prospect créé à partir du formulaire du site Web."),
            new(Id(), IdsProspectsDemo.FrancoisBelanger, "o-francois-seltos", n.AddDays(-1), "transaction", moi,
                "TRX-2026-0019 · Paiement et éléments administratifs confirmés.", "Planifier la livraison"),
            new(Id(), IdsProspectsDemo.AmelieGirard, "o-amelie-crosstrek", n.AddDays(-28), "creation", moi,
                "Prospect créé : recommandée par François Bélanger."),
            new(Id(), IdsProspectsDemo.AmelieGirard, "o-amelie-crosstrek", n.AddDays(-1), "rendezvous", moi,
                "Livraison du véhicule planifiée demain à 16 h."),
            new(Id(), IdsProspectsDemo.NicolasBergeron, "o-nicolas-tiguan", n.AddDays(-35), "visite", moi,
                "Visite spontanée, intéressé par le Tiguan."),
            new(Id(), IdsProspectsDemo.NicolasBergeron, "o-nicolas-tiguan", n.AddDays(-1), "transaction", moi,
                "TRX-2026-0016 · Véhicule livré : Volkswagen Tiguan Comfortline 2022."),
            new(Id(), IdsProspectsDemo.RachelDion, "o-rachel-santafe", n.AddDays(-19), "creation", moi,
                "Prospect saisi à partir d'une demande reçue par la publicité Google."),
            new(Id(), IdsProspectsDemo.RachelDion, "o-rachel-santafe", n.AddHours(-3), "transaction", Systeme,
                "TRX-2026-0020 · Le véhicule est retourné en inspection (témoin de moteur allumé lors de la préparation finale)."),

            new(Id(), IdsProspectsDemo.EricGendron, "o-eric-cx5", n.AddDays(-10), "creation", Systeme,
                "Prospect créé à partir du formulaire du site Web (Mazda CX-5)."),
            new(Id(), IdsProspectsDemo.EricGendron, "o-eric-cx5", n.AddDays(-8), "appel", moi,
                "Premier appel : cherche un VUS à traction intégrale, budget d'environ 34 000 $."),
            new(Id(), IdsProspectsDemo.EricGendron, "o-eric-cx5", n.AddDays(-4), "courriel", moi,
                "Soumission SOU-2026-0047 envoyée par courriel."),
            new(Id(), IdsProspectsDemo.EricGendron, "o-eric-cx5", j.AddDays(-1).AddHours(18).AddMinutes(20), "rendezvous", moi,
                "Client absent à l'essai routier du CX-5 prévu à 18 h.", "Proposer une autre date"),
            new(Id(), IdsProspectsDemo.HugoLambert, "o-hugo-equinox", n.AddDays(-20), "creation", moi,
                "Prospect créé à la suite d'une visite en concession."),
            new(Id(), IdsProspectsDemo.HugoLambert, "o-hugo-equinox", n.AddDays(-6), "courriel", moi,
                "Soumission SOU-2026-0043 envoyée par courriel."),
            new(Id(), IdsProspectsDemo.HugoLambert, "o-hugo-equinox", n.AddDays(-2), "appel", moi,
                "Appel entrant : le client demande à ne plus recevoir de sollicitations commerciales. Il reviendra s'il décide d'acheter."),
            new(Id(), IdsProspectsDemo.NadiaCloutier, "o-nadia-hybride", n.AddDays(-40), "creation", moi,
                "Prospect saisi à partir d'une demande reçue par la publicité Google."),
            new(Id(), IdsProspectsDemo.NadiaCloutier, "o-nadia-hybride", n.AddDays(-30), "appel", moi,
                "Aucun VUS hybride dans son budget en inventaire. Demande d'être recontactée après son retour de voyage."),
            new(Id(), IdsProspectsDemo.KevinOuimet, "o-kevin-vus", n.AddDays(-16), "creation", moi,
                "Prospect saisi à partir d'une réponse à la publicité Meta."),
            new(Id(), IdsProspectsDemo.KevinOuimet, "o-kevin-vus", n.AddDays(-9), "appel", moi,
                "Qualification complète : VUS à traction intégrale d'occasion, 35 000 $ maximum, achat d'ici un mois."),
            new(Id(), IdsProspectsDemo.SimonThibault, "o-simon-crv", n.AddDays(-12), "creation", moi,
                "Prospect créé : recommandé par Gabriel Roy."),
            new(Id(), IdsProspectsDemo.SimonThibault, "o-simon-crv", n.AddDays(-1), "visite", moi,
                "Le client accepte la soumission SOU-2026-0048 (CR-V hybride)."),

            new(Id(), IdsProspectsDemo.DanielProulx, "o-daniel-rav4", n.AddDays(-60), "creation", Systeme,
                "Prospect créé à partir du formulaire du site Web (RAV4 Hybride)."),
            new(Id(), IdsProspectsDemo.DanielProulx, "o-daniel-rav4", n.AddDays(-32), "courriel", moi,
                "Soumission SOU-2026-0039 envoyée par courriel."),
            new(Id(), IdsProspectsDemo.DanielProulx, "o-daniel-rav4", n.AddDays(-26), "appel", moi,
                "Le client refuse la proposition : le prix dépasse ce qu'il est prêt à payer. Il demande à ne plus être sollicité."),
            new(Id(), IdsProspectsDemo.DanielProulx, "o-daniel-rav4", n.AddDays(-25), "perte", moi,
                "Opportunité clôturée comme perdue : prix trop élevé (déclaré par le client)."),
            new(Id(), IdsProspectsDemo.JulieMenard, "o-julie-hybride", n.AddDays(-50), "creation", Systeme,
                "Prospect saisi à partir d'une demande reçue par la publicité Google."),
            new(Id(), IdsProspectsDemo.JulieMenard, "o-julie-hybride", n.AddDays(-19), "texto", moi,
                "Le Corolla Cross hybride qui l'intéressait a été vendu ; aucun équivalent en inventaire."),
            new(Id(), IdsProspectsDemo.JulieMenard, "o-julie-hybride", n.AddDays(-18), "perte", moi,
                "Opportunité clôturée comme perdue : véhicule indisponible (information confirmée). Suivi possible si un véhicule comparable arrive."),
            new(Id(), IdsProspectsDemo.AnnieLessard, "o-annie-berline", n.AddDays(-70), "creation", moi,
                "Prospect créé à la suite d'une visite en concession."),
            new(Id(), IdsProspectsDemo.AnnieLessard, "o-annie-berline", n.AddDays(-40), "appel", moi,
                "Préfère attendre la fin de son contrat de location ; accepte d'être recontactée à cette date."),
            new(Id(), IdsProspectsDemo.AnnieLessard, "o-annie-berline", n.AddDays(-40), "perte", moi,
                "Opportunité clôturée comme perdue : achat reporté (déclaré par la cliente)."),
            new(Id(), IdsProspectsDemo.PierreLavallee, "o-pierre-civic", n.AddDays(-35), "creation", Systeme,
                "Prospect saisi à partir d'une réponse à la publicité Meta."),
            new(Id(), IdsProspectsDemo.PierreLavallee, "o-pierre-civic", n.AddDays(-20), "courriel", moi,
                "Information sur la Civic Touring transmise par courriel."),
            new(Id(), IdsProspectsDemo.PierreLavallee, "o-pierre-civic", n.AddDays(-14), "perte", moi,
                "Opportunité clôturée comme perdue : motif inconnu."),
            new(Id(), IdsProspectsDemo.YannickPoirier, "o-yannick-tucson", n.AddDays(-40), "creation", moi,
                "Prospect créé à la suite d'une annonce Kijiji."),
            new(Id(), IdsProspectsDemo.YannickPoirier, "o-yannick-tucson", n.AddDays(-25), "appel", moi,
                "Proposition sur le Mazda CX-5 présentée par téléphone."),
            new(Id(), IdsProspectsDemo.YannickPoirier, "o-yannick-tucson", n.AddDays(-12), "perte", moi,
                "Opportunité clôturée comme perdue : client ayant acheté ailleurs (hypothèse du conseiller, non confirmée)."),
            new(Id(), IdsProspectsDemo.SteveTremblay, "o-steve-camionnette", n.AddDays(-55), "creation", moi,
                "Prospect créé à la suite d'un appel téléphonique."),
            new(Id(), IdsProspectsDemo.SteveTremblay, "o-steve-camionnette", n.AddDays(-35), "visite", moi,
                "Essai du Chevrolet Silverado LT 2021 ; souhaite réfléchir quelques jours."),
            new(Id(), IdsProspectsDemo.SteveTremblay, "o-steve-camionnette", n.AddDays(-30), "perte", moi,
                "Opportunité clôturée comme perdue : véhicule indisponible (vendu à un autre client). Le client souhaite être informé d'une camionnette comparable."),
            new(Id(), IdsProspectsDemo.ValerieDesjardins, "o-valerie-cx5", n.AddDays(-65), "creation", Systeme,
                "Prospect créé à partir du formulaire du site Web."),
            new(Id(), IdsProspectsDemo.ValerieDesjardins, "o-valerie-cx5", n.AddDays(-40), "perte", moi,
                "Opportunité clôturée comme perdue : budget incompatible (déclaré par la cliente)."),
            new(Id(), IdsProspectsDemo.ValerieDesjardins, "o-valerie-cx5", n.AddDays(-3), "recuperation", moi,
                "Opportunité réactivée par le conseiller : la cliente nous a recontactés, sa mise de fonds a augmenté.", "Mettre à jour le budget et les besoins"),
            new(Id(), IdsProspectsDemo.NicolasBergeron, "o-nicolas-tiguan", n.AddDays(-30), "perte", moi,
                "Opportunité clôturée comme perdue : budget incompatible (déclaré par le client)."),
            new(Id(), IdsProspectsDemo.NicolasBergeron, "o-nicolas-tiguan", n.AddDays(-22), "recuperation", moi,
                "Opportunité réactivée par le conseiller : un Tiguan d'occasion correspondant à son budget est arrivé en inventaire."),
            new(Id(), IdsProspectsDemo.MartineLavigne, "o-martine-hrv", n.AddDays(-50), "creation", Systeme,
                "Prospect créé à partir du formulaire du site Web."),
            new(Id(), IdsProspectsDemo.MartineLavigne, "o-martine-hrv", n.AddDays(-20), "transaction", Systeme,
                "TRX-2026-0012 · Véhicule livré : Honda HR-V EX-L 2023."),
            new(Id(), IdsProspectsDemo.MartineLavigne, "o-martine-hrv", n.AddDays(-17), "satisfaction", moi,
                "Retour de satisfaction reçu (représenté dans le prototype) : satisfaite de l'accompagnement, insatisfaite de la préparation."),
            new(Id(), IdsProspectsDemo.MartineLavigne, "o-martine-hrv", n.AddDays(-17), "probleme", moi,
                "Problème après-vente signalé : deuxième clé et tapis promis non remis."),
            new(Id(), IdsProspectsDemo.BenoitLachance, "o-benoit-forester", n.AddDays(-80), "creation", moi,
                "Prospect créé à la suite d'une visite en concession."),
            new(Id(), IdsProspectsDemo.BenoitLachance, "o-benoit-forester", n.AddDays(-45), "transaction", Systeme,
                "TRX-2026-0010 · Véhicule livré : Subaru Forester Touring 2022."),
            new(Id(), IdsProspectsDemo.BenoitLachance, "o-benoit-forester", n.AddDays(-42), "satisfaction", moi,
                "Retour de satisfaction reçu (représenté dans le prototype) : très satisfait."),
            new(Id(), IdsProspectsDemo.BenoitLachance, "o-benoit-forester", n.AddDays(-38), "recommandation", moi,
                "Invitation facultative à recommander le conseiller préparée et déclarée partagée par le conseiller (aucun envoi automatique)."),
            new(Id(), IdsProspectsDemo.BenoitLachance, "o-benoit-forester", n.AddDays(-10), "probleme", moi,
                "Problème après-vente signalé : certificat d'immatriculation définitif non reçu."),
            new(Id(), IdsProspectsDemo.MelissaHebert, "o-melissa-vus", n.AddHours(-5), "creation", Systeme,
                "Demande reçue par le formulaire de la carte de recommandation (démonstration) : recherche un VUS compact. Source : recommandation."),
            new(Id(), IdsProspectsDemo.RemiGosselin, "o-remi-berline", n.AddDays(-3), "creation", moi,
                "Coordonnées laissées à l'accueil ; provenance non notée."),
            new(Id(), IdsProspectsDemo.RemiGosselin, "o-remi-berline", n.AddDays(-2), "appel", moi,
                "Premier appel : cherche une berline d'occasion, budget à préciser."),
        };

        return Task.FromResult(new DonneesProspects(Moi, conseillers, contacts, opportunites, interactions));
    }
}
