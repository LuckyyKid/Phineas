using Phineas.Models.Entities;
using Phineas.Models.ViewModels.Account;
using Phineas.Models.ViewModels.Conseiller;

namespace Phineas.Services.Conseiller;

// DONNÉES FICTIVES — phase frontend uniquement.
// Préférences de communication, pauses, demandes de recherche et états d'actions inventés, datés par rapport à
// « maintenant ». Les véhicules simulés n'existent pas : ils ne rejoignent l'inventaire que dans l'onglet du navigateur.
public class ServiceIntelligenceCommercialeDemo : IServiceIntelligenceCommerciale
{
    private const string Moi = "moi";
    private const string Antoine = "c-antoine";

    public Task<DonneesIntelligence> ObtenirAsync(UserSummaryViewModel conseiller)
    {
        var n = DateTime.Now;
        var j = n.Date;

        var preferences = new List<PreferencesCommunication>
        {
            new(IdsProspectsDemo.ChloeBouchard, "explicite", false, null, "Préfère le courriel, en soirée."),
            new(IdsProspectsDemo.CamilleLavoie, "explicite", false, null, "Préfère être contactée par courriel."),
            new(IdsProspectsDemo.IsabelleFortin, "implicite", false, null, "Cliente depuis 2025."),
            // Ne souhaite plus recevoir de sollicitations commerciales (déclaré au téléphone).
            new(IdsProspectsDemo.HugoLambert, "retire", true, n.AddDays(-2), "Demande faite lors d'un appel entrant."),
        };

        var pauses = new List<PauseSuivi>
        {
            // Date de reprise atteinte : le moteur propose de reprendre contact.
            new("o-nadia-hybride", j.AddDays(-1), "Reprendre contact après son retour de voyage", n.AddDays(-30)),
            // Pause en cours : aucune relance avant le printemps.
            new("o-isabelle-compacte", j.AddDays(45), "Projet prévu au printemps", n.AddDays(-3)),
        };

        var demandes = new List<DemandeRecherche>
        {
            new()
            {
                Id = "dm-nadia-hybride", OpportuniteId = "o-nadia-hybride", Categorie = "vus", BudgetMax = 32_000,
                Caracteristiques = ["hybride", "ti"], Etat = "occasion", AnneeMin = 2021, KilometrageMax = 60_000,
                Indispensables = ["budget", "categorie", "hybride"], Alternatives = "Une berline hybride serait acceptable.",
                Horizon = "1-3-mois", Statut = "Active", ConseillerId = Moi, DateCreation = n.AddDays(-30),
            },
            new()
            {
                Id = "dm-isabelle-compacte", OpportuniteId = "o-isabelle-compacte", Categorie = "compacte", BudgetMax = 15_000,
                Etat = "occasion", Indispensables = ["budget"], Horizon = "plus-tard", Statut = "EnPause", ConseillerId = Moi,
                DateCreation = n.AddDays(-3),
            },
            new()
            {
                Id = "dm-mathieu-camionnette", OpportuniteId = "o-mathieu-tacoma", Categorie = "camionnette", BudgetMax = 42_000,
                Caracteristiques = ["remorquage"], Indispensables = ["budget"], Statut = "Cloturee", ConseillerId = Antoine,
                DateCreation = n.AddDays(-40),
            },
        };

        var indispensables = new Dictionary<string, IReadOnlyList<string>>
        {
            ["o-camille-ioniq"] = ["budget"],
            ["o-isabelle-sorento"] = ["budget", "places"],
            ["o-kevin-vus"] = ["budget", "categorie"],
            ["o-chloe-rav4"] = ["categorie"],
        };

        var etats = new List<EtatActionDemo>
        {
            new("qualification-manquante", "o-olivier-equinox", "Reportee", n.AddHours(-1), j.AddDays(1).AddHours(10), "Après la présentation de l'Equinox"),
            new("rdv-a-confirmer", "r-karim-negociation", "Terminee", n.AddHours(-2)),
            // Plus détectée (opportunité perdue) : le moteur la marque « devenue obsolète » au premier calcul.
            new("soumission-sans-reponse", "s-mathieu-tacoma", "ATraiter", n.AddDays(-21)),
            // Prise en charge temporaire par un collègue (le prospect reste attribué au conseiller).
            new("essai-sans-suite", "r-isabelle-essai", "ATraiter", n.AddHours(-3), CollegueId: Antoine, MotifTransfert: "absence"),
            new("rdv-a-preparer", "r-camille-essai", "Ignoree", n.AddMinutes(-30), Motif: "deja-fait"),
        };

        static VehiculeInventaire V(string id, string stock, string marque, string modele, int annee, string version, int km,
            string carrosserie, string carburant, decimal prix, params string[] caracteristiques) =>
            new(id, stock, marque, modele, annee, version, km, "Gris", carrosserie, carburant, "Automatique", prix,
                StatutVehicule.PretPourVente, false, caracteristiques, "Zone de réception");

        var simules = new List<VehiculeSimule>
        {
            new(V("v-sim-corollacross", "DEMO-1103", "Toyota", "Corolla Cross Hybride", 2023, "XLE", 31_000, "VUS", "Hybride", 28_500,
                "Traction intégrale", "Sièges chauffants"), "Reprise d'un client, inspectée et prête pour la vente (fictif)."),
            new(V("v-sim-mazda3", "DEMO-1104", "Mazda", "3", 2019, "GS", 88_000, "Berline", "Essence", 14_500,
                "Sièges chauffants"), "Véhicule d'échange arrivé en inventaire (fictif)."),
        };

        var blocagesConnus = new Dictionary<string, IReadOnlyList<string>>
        {
            // Décision de financement attendue lors du dernier passage : elle a depuis été rendue (blocage résolu).
            ["t-emilie-corolla"] = ["decision|Décision financière communiquée"],
        };

        return Task.FromResult(new DonneesIntelligence(preferences, pauses, demandes, indispensables, etats, simules, blocagesConnus));
    }
}
