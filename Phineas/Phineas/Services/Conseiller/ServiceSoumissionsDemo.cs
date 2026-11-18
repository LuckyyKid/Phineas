using Phineas.Models.Entities;
using Phineas.Models.ViewModels.Account;
using Phineas.Models.ViewModels.Conseiller;

namespace Phineas.Services.Conseiller;

// DONNÉES FICTIVES — phase frontend uniquement.
// Inventaire, options, prix, taux et soumissions sont inventés et illustratifs. Ils ne constituent ni une offre
// ni une approbation de crédit. À remplacer par une implémentation de IServiceSoumissions (et par la lecture du
// vrai inventaire, dont VehiculeInventaire reprend la forme).
public class ServiceSoumissionsDemo : IServiceSoumissions
{
    private const string Moi = "moi";

    public Task<DonneesSoumissions> ObtenirAsync(UserSummaryViewModel conseiller)
    {
        var n = DateTime.Now;
        var j = n.Date;
        var moi = conseiller.FullName;

        static VehiculeInventaire V(string id, string stock, string marque, string modele, int annee, string version,
            int km, string couleur, string carrosserie, string carburant, decimal prix, StatutVehicule statut,
            bool neuf, params string[] caracteristiques) =>
            new(id, stock, marque, modele, annee, version, km, couleur, carrosserie, carburant, "Automatique",
                prix, statut, neuf, caracteristiques);

        var inventaire = new List<VehiculeInventaire>
        {
            V("v-rav4", "DEMO-1041", "Toyota", "RAV4 Hybride", 2024, "XLE", 12, "Gris lunaire", "VUS", "Hybride",
                41_490, StatutVehicule.PretPourVente, true, "Traction intégrale", "Sièges chauffants", "Apple CarPlay / Android Auto"),
            V("v-crv", "DEMO-1047", "Honda", "CR-V Hybride", 2024, "EX-L", 25, "Blanc platine", "VUS", "Hybride",
                46_290, StatutVehicule.PretPourVente, true, "Traction intégrale", "Cuir", "Hayon électrique"),
            V("v-civic", "DEMO-0988", "Honda", "Civic", 2023, "Touring", 18_400, "Bleu", "Berline", "Essence",
                31_495, StatutVehicule.Reserve, false, "Toit ouvrant", "Sièges chauffants", "Apple CarPlay / Android Auto"),
            V("v-cx5", "DEMO-0972", "Mazda", "CX-5", 2022, "GT", 38_900, "Rouge", "VUS", "Essence",
                32_995, StatutVehicule.PretPourVente, false, "Traction intégrale", "Cuir", "Affichage tête haute"),
            V("v-outback", "DEMO-0965", "Subaru", "Outback", 2022, "Touring", 41_200, "Vert", "VUS", "Essence",
                35_995, StatutVehicule.PretPourVente, false, "Traction intégrale", "Grand espace de chargement", "Démarreur à distance"),
            V("v-f150", "DEMO-0951", "Ford", "F-150", 2021, "XLT", 62_000, "Noir", "Camionnette", "Essence",
                44_995, StatutVehicule.PretPourVente, false, "4x4", "Attelage de remorque", "Caméra de recul"),
            V("v-silverado", "DEMO-0949", "Chevrolet", "Silverado", 2021, "LT", 55_300, "Argent", "Camionnette", "Essence",
                46_495, StatutVehicule.Vendu, false, "4x4", "Attelage de remorque", "Sièges chauffants"),
            V("v-ram", "DEMO-0955", "Ram", "1500", 2020, "Big Horn", 71_000, "Blanc", "Camionnette", "Essence",
                39_995, StatutVehicule.NettoyageEnCours, false, "4x4", "Attelage de remorque"),
            V("v-ioniq5", "DEMO-1033", "Hyundai", "Ioniq 5", 2024, "Preferred", 8_500, "Gris", "VUS", "Électrique",
                47_995, StatutVehicule.PretPourVente, false, "Traction intégrale", "Recharge rapide", "Aides à la conduite"),
            V("v-ev6", "DEMO-1050", "Kia", "EV6", 2024, "Wind", 15, "Bleu", "VUS", "Électrique",
                52_495, StatutVehicule.EnInspection, true, "Traction intégrale", "Recharge rapide"),
            V("v-sorento", "DEMO-0991", "Kia", "Sorento", 2023, "LX", 29_800, "Gris", "VUS", "Essence",
                36_995, StatutVehicule.PretPourVente, false, "7 places", "Traction intégrale"),
            V("v-equinox", "DEMO-0978", "Chevrolet", "Equinox", 2022, "LT", 44_100, "Blanc", "VUS", "Essence",
                28_995, StatutVehicule.PretPourVente, false, "Traction intégrale", "Démarreur à distance"),
            V("v-tacoma", "DEMO-0912", "Toyota", "Tacoma", 2022, "TRD Sport", 35_000, "Orange", "Camionnette", "Essence",
                45_995, StatutVehicule.Vendu, false, "4x4", "Attelage de remorque"),
            V("v-tucson", "DEMO-1002", "Hyundai", "Tucson Hybride", 2024, "Preferred", 10, "Noir", "VUS", "Hybride",
                40_495, StatutVehicule.Livre, true, "Traction intégrale", "Sièges chauffants"),
        };

        // Emplacements fictifs sur le terrain (même champ que Vehicule.Emplacement). Absent = non renseigné.
        var emplacements = new Dictionary<string, string>
        {
            ["v-rav4"] = "Salle d'exposition",
            ["v-outback"] = "Terrain A · rangée 2",
            ["v-f150"] = "Terrain B · rangée 1",
            ["v-ram"] = "Atelier d'esthétique",
            ["v-ioniq5"] = "Borne de recharge 3",
            ["v-sorento"] = "Terrain A · rangée 4",
            ["v-equinox"] = "Terrain A · rangée 1",
            ["v-cx5"] = "Terrain B · rangée 3",
        };
        inventaire = inventaire.Select(v => emplacements.TryGetValue(v.Id, out var e) ? v with { Emplacement = e } : v).ToList();

        // Prix illustratifs. Ce sont des produits FACULTATIFS : ils ne sont ajoutés que si le client les choisit.
        var options = new List<OptionCatalogue>
        {
            new("tapis", "Tapis toutes saisons", 189),
            new("pneus-hiver", "Pneus d'hiver montés sur jantes", 1_295),
            new("demarreur", "Démarreur à distance", 495),
            new("protection", "Protection de carrosserie et de tissus", 695),
            new("attelage", "Attelage de remorque", 895),
            new("garantie", "Garantie prolongée (produit facultatif)", 2_195),
        };
        OptionChoisie O(string code)
        {
            var o = options.First(x => x.Code == code);
            return new(o.Code, o.Libelle, o.Prix);
        }
        VehiculeInventaire Inv(string id) => inventaire.First(v => v.Id == id);

        var soumissions = new List<Soumission>
        {
            // Plusieurs versions ; financement ; options facultatives ; prix d'inventaire changé depuis la v1.
            new("s-chloe-rav4", "SOU-2026-0041", IdsProspectsDemo.ChloeBouchard, "o-chloe-rav4", Moi, n.AddDays(-5),
            [
                new()
                {
                    Numero = 1, Date = n.AddDays(-5), Auteur = moi, Statut = StatutSoumission.Envoyee,
                    Note = "Proposition initiale",
                    Vehicule = Inv("v-rav4") with { PrixDemande = 41_990 },
                    Offre = new()
                    {
                        PrixAnnonce = 41_990, Remise = 500, MotifRemise = "Promotion du mois (exemple)",
                        Options = [O("tapis"), O("pneus-hiver")], MiseDeFonds = 5_000, ModeAchat = "financement",
                        DureeMois = 60, TauxAnnuel = 6.49m, DateValidite = j.AddDays(2),
                        Commentaires = "Délai de livraison estimé : 2 semaines.",
                    },
                },
                new()
                {
                    Numero = 2, Date = n.AddDays(-3), Auteur = moi, Statut = StatutSoumission.EnAttente,
                    Note = "Mise de fonds portée à 7 000 $",
                    Vehicule = Inv("v-rav4") with { PrixDemande = 41_990 },
                    Offre = new()
                    {
                        PrixAnnonce = 41_990, Remise = 500, MotifRemise = "Promotion du mois (exemple)",
                        Options = [O("tapis"), O("pneus-hiver")], MiseDeFonds = 7_000, ModeAchat = "financement",
                        DureeMois = 60, TauxAnnuel = 6.49m, DateValidite = j.AddDays(1),
                        Commentaires = "Délai de livraison estimé : 2 semaines.",
                    },
                },
            ]),

            // Deuxième proposition pour la même opportunité.
            new("s-chloe-crv", "SOU-2026-0044", IdsProspectsDemo.ChloeBouchard, "o-chloe-rav4", Moi, n.AddDays(-1),
            [
                new()
                {
                    Numero = 1, Date = n.AddDays(-1), Auteur = moi, Statut = StatutSoumission.Brouillon,
                    Note = "Alternative demandée : CR-V hybride",
                    Vehicule = Inv("v-crv"),
                    Offre = new()
                    {
                        PrixAnnonce = 46_290, MiseDeFonds = 7_000, ModeAchat = "financement",
                        DureeMois = 72, TauxAnnuel = 6.49m, DateValidite = j.AddDays(7),
                    },
                },
            ]),

            // Achat financé avec reprise ; acceptée à la version 2.
            new("s-vincent-civic", "SOU-2026-0038", IdsProspectsDemo.VincentMorin, "o-vincent-civic", Moi, n.AddDays(-10),
            [
                new()
                {
                    Numero = 1, Date = n.AddDays(-10), Auteur = moi, Statut = StatutSoumission.Envoyee,
                    Note = "Proposition initiale",
                    Vehicule = Inv("v-civic") with { StatutActuel = StatutVehicule.PretPourVente },
                    Offre = new()
                    {
                        PrixAnnonce = 31_495, Options = [O("demarreur")],
                        Reprise = new("Mazda 3 2015, environ 168 000 km", 6_500, 1_200),
                        MiseDeFonds = 3_000, ModeAchat = "financement", DureeMois = 72, TauxAnnuel = 7.99m,
                        DateValidite = j.AddDays(-3),
                    },
                },
                new()
                {
                    Numero = 2, Date = n.AddDays(-7), Auteur = moi, Statut = StatutSoumission.Acceptee,
                    Note = "Remise de 495 $ et durée ramenée à 60 mois",
                    Vehicule = Inv("v-civic") with { StatutActuel = StatutVehicule.PretPourVente },
                    Offre = new()
                    {
                        PrixAnnonce = 31_495, Remise = 495, MotifRemise = "Ajustement négocié",
                        Options = [O("demarreur")],
                        Reprise = new("Mazda 3 2015, environ 168 000 km", 6_500, 1_200),
                        MiseDeFonds = 3_000, ModeAchat = "financement", DureeMois = 60, TauxAnnuel = 7.99m,
                        DateValidite = j.AddDays(-1),
                    },
                },
            ]),

            // Achat comptant avec reprise (solde de prêt inconnu) et acompte déjà versé.
            new("s-karim-outback", "SOU-2026-0039", IdsProspectsDemo.KarimBenjelloun, "o-karim-outback", Moi, n.AddDays(-4),
            [
                new()
                {
                    Numero = 1, Date = n.AddDays(-4), Auteur = moi, Statut = StatutSoumission.Envoyee,
                    Note = "Proposition initiale",
                    Vehicule = Inv("v-outback"),
                    Offre = new()
                    {
                        PrixAnnonce = 35_995, Options = [O("protection")],
                        Reprise = new("Hyundai Elantra 2016, évaluation à faire", 7_000, null),
                        AcompteVerse = 500, ModeAchat = "comptant", DateValidite = j.AddDays(3),
                    },
                },
            ]),

            // Expirée.
            new("s-mathieu-tacoma", "SOU-2026-0029", IdsProspectsDemo.MathieuGauthier, "o-mathieu-tacoma", "c-antoine", n.AddDays(-30),
            [
                new()
                {
                    Numero = 1, Date = n.AddDays(-30), Auteur = "Antoine Lefebvre", Statut = StatutSoumission.Expiree,
                    Note = "Proposition initiale",
                    Vehicule = Inv("v-tacoma") with { StatutActuel = StatutVehicule.PretPourVente },
                    Offre = new()
                    {
                        PrixAnnonce = 45_995, Options = [O("attelage")], MiseDeFonds = 5_000,
                        ModeAchat = "financement", DureeMois = 72, TauxAnnuel = 7.49m, DateValidite = j.AddDays(-23),
                    },
                },
            ]),

            // Brouillon incomplet sur un véhicule devenu indisponible (vendu depuis).
            new("s-julien-silverado", "SOU-2026-0040", IdsProspectsDemo.JulienCote, "o-julien-camion", Moi, n.AddDays(-1),
            [
                new()
                {
                    Numero = 1, Date = n.AddDays(-1), Auteur = moi, Statut = StatutSoumission.Brouillon,
                    Note = "Proposition initiale",
                    Vehicule = Inv("v-silverado") with { StatutActuel = StatutVehicule.PretPourVente },
                    Offre = new()
                    {
                        PrixAnnonce = 46_495, Options = [O("attelage")], MiseDeFonds = 8_000,
                        ModeAchat = "financement", DureeMois = 84, TauxAnnuel = null, DateValidite = j.AddDays(5),
                    },
                },
            ]),

            // Achat comptant accepté, produits facultatifs choisis.
            new("s-sarah-tucson", "SOU-2026-0031", IdsProspectsDemo.SarahNguyen, "o-sarah-tucson", "c-marie-eve", n.AddDays(-12),
            [
                new()
                {
                    Numero = 1, Date = n.AddDays(-12), Auteur = "Marie-Ève Paquette", Statut = StatutSoumission.Acceptee,
                    Note = "Proposition initiale",
                    Vehicule = Inv("v-tucson") with { StatutActuel = StatutVehicule.PretPourVente },
                    Offre = new()
                    {
                        PrixAnnonce = 40_495, Options = [O("tapis"), O("garantie")], AcompteVerse = 1_000,
                        ModeAchat = "comptant", DateValidite = j.AddDays(-5),
                    },
                },
            ]),

            new("s-camille-ioniq", "SOU-2026-0045", IdsProspectsDemo.CamilleLavoie, "o-camille-ioniq", Moi, n.AddHours(-2),
            [
                new()
                {
                    Numero = 1, Date = n.AddHours(-2), Auteur = moi, Statut = StatutSoumission.PreteAEnvoyer,
                    Note = "Proposition initiale",
                    Vehicule = Inv("v-ioniq5"),
                    Offre = new()
                    {
                        PrixAnnonce = 47_995, Options = [O("pneus-hiver")], MiseDeFonds = 10_000,
                        ModeAchat = "financement", DureeMois = 60, TauxAnnuel = 5.99m, DateValidite = j.AddDays(7),
                        Commentaires = "Autonomie hivernale : prévoir un essai routier pour en discuter.",
                    },
                },
            ]),
        };

        var parametres = new ParametresCalcul(
            TauxTps: 5m,
            TauxTvq: 9.975m,
            AvertissementTaxes: "Taux TPS 5 % et TVQ 9,975 % appliqués à titre illustratif, sans tenir compte d'éventuelles règles particulières (reprise, exemptions, droits gouvernementaux). À valider avant tout usage réel.",
            Durees: [36, 48, 60, 72, 84]
        );

        return Task.FromResult(new DonneesSoumissions(inventaire, options, soumissions, parametres));
    }
}
