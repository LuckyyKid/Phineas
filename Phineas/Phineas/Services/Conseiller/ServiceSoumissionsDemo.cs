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

            // Phase 05 : véhicules retenus dans une transaction (statut actuel publié par l'atelier ou la direction).
            V("v-cx30", "DEMO-0981", "Mazda", "CX-30", 2023, "GS", 21_300, "Gris", "VUS", "Essence",
                29_995, StatutVehicule.NettoyageEnCours, false, "Traction intégrale", "Sièges chauffants"),
            V("v-corolla", "DEMO-1055", "Toyota", "Corolla Hybride", 2024, "LE", 12, "Blanc", "Berline", "Hybride",
                31_490, StatutVehicule.Reserve, true, "Apple CarPlay / Android Auto", "Aides à la conduite"),
            V("v-escape", "DEMO-0969", "Ford", "Escape", 2022, "SE", 46_800, "Bleu", "VUS", "Essence",
                27_495, StatutVehicule.Reserve, false, "Traction intégrale", "Caméra de recul"),
            V("v-kona", "DEMO-0993", "Hyundai", "Kona", 2023, "Preferred", 24_100, "Rouge", "VUS", "Essence",
                26_995, StatutVehicule.Reserve, false, "Sièges chauffants", "Aides à la conduite"),
            V("v-tundra", "DEMO-0943", "Toyota", "Tundra", 2021, "SR5", 68_500, "Gris", "Camionnette", "Essence",
                47_995, StatutVehicule.EnInspection, false, "4x4", "Attelage de remorque"),
            V("v-rogue", "DEMO-1058", "Nissan", "Rogue", 2022, "SV", 39_200, "Noir", "VUS", "Essence",
                29_495, StatutVehicule.Recu, false, "Traction intégrale", "Sièges chauffants"),
            V("v-seltos", "DEMO-0987", "Kia", "Seltos", 2023, "EX", 18_900, "Blanc", "VUS", "Essence",
                28_495, StatutVehicule.Vendu, false, "Traction intégrale"),
            V("v-crosstrek", "DEMO-0984", "Subaru", "Crosstrek", 2023, "Touring", 22_400, "Vert", "VUS", "Essence",
                30_995, StatutVehicule.Vendu, false, "Traction intégrale", "Sièges chauffants"),
            V("v-tiguan", "DEMO-0961", "Volkswagen", "Tiguan", 2022, "Comfortline", 37_600, "Gris", "VUS", "Essence",
                31_995, StatutVehicule.Livre, false, "Traction intégrale"),
            V("v-santafe", "DEMO-0975", "Hyundai", "Santa Fe", 2022, "Preferred", 41_300, "Bleu", "VUS", "Essence",
                33_995, StatutVehicule.EnInspection, false, "Traction intégrale", "Démarreur à distance"),

            // Phase 07 : véhicules déjà livrés (suivi après-vente).
            V("v-hrv", "DEMO-0958", "Honda", "HR-V", 2023, "EX-L", 19_800, "Bleu", "VUS", "Essence",
                29_995, StatutVehicule.Livre, false, "Traction intégrale", "Sièges chauffants"),
            V("v-forester", "DEMO-0937", "Subaru", "Forester", 2022, "Touring", 33_400, "Gris", "VUS", "Essence",
                33_495, StatutVehicule.Livre, false, "Traction intégrale", "Grand espace de chargement"),
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
            ["v-cx30"] = "Atelier d'esthétique",
            ["v-corolla"] = "Salle de livraison",
            ["v-escape"] = "Terrain A · rangée 3",
            ["v-kona"] = "Terrain A · rangée 3",
            ["v-tundra"] = "Atelier mécanique · baie 4",
            ["v-rogue"] = "Zone de réception",
            ["v-seltos"] = "Salle de livraison",
            ["v-crosstrek"] = "Salle de livraison",
            ["v-santafe"] = "Atelier mécanique · baie 2",
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

            // Phase 05 : versions acceptées retenues dans une transaction (Transactions ▸ proposition figée).
            new("s-gabriel-cx30", "SOU-2026-0034", IdsProspectsDemo.GabrielRoy, "o-gabriel-cx30", Moi, n.AddDays(-7),
            [
                new()
                {
                    Numero = 1, Date = n.AddDays(-6), Auteur = moi, Statut = StatutSoumission.Acceptee,
                    Note = "Proposition initiale",
                    Vehicule = Inv("v-cx30") with { StatutActuel = StatutVehicule.PretPourVente },
                    Offre = new()
                    {
                        PrixAnnonce = 29_995, Options = [O("tapis")], AcompteVerse = 1_000, ModeAchat = "comptant", DateValidite = j.AddDays(-1),
                    },
                },
            ]),

            new("s-emilie-corolla", "SOU-2026-0035", IdsProspectsDemo.EmilieFournier, "o-emilie-corolla", Moi, n.AddDays(-12),
            [
                new()
                {
                    Numero = 1, Date = n.AddDays(-12), Auteur = moi, Statut = StatutSoumission.Envoyee,
                    Note = "Proposition initiale",
                    Vehicule = Inv("v-corolla") with { StatutActuel = StatutVehicule.PretPourVente },
                    Offre = new()
                    {
                        PrixAnnonce = 31_490, MiseDeFonds = 4_000, ModeAchat = "financement", DureeMois = 60, TauxAnnuel = 5.49m, DateValidite = j.AddDays(-5),
                    },
                },
                new()
                {
                    Numero = 2, Date = n.AddDays(-8), Auteur = moi, Statut = StatutSoumission.Acceptee,
                    Note = "Remise de fin d'année modèle",
                    Vehicule = Inv("v-corolla") with { StatutActuel = StatutVehicule.PretPourVente },
                    Offre = new()
                    {
                        PrixAnnonce = 31_490, Remise = 750, MotifRemise = "Fin d'année modèle (exemple)", MiseDeFonds = 4_000, ModeAchat = "financement", DureeMois = 60, TauxAnnuel = 5.49m, DateValidite = j.AddDays(-1),
                    },
                },
                new()
                {
                    Numero = 3, Date = n.AddHours(-20), Auteur = moi, Statut = StatutSoumission.Brouillon,
                    Note = "Ajout des pneus d'hiver demandé par la cliente",
                    Vehicule = Inv("v-corolla") with { StatutActuel = StatutVehicule.PretPourVente },
                    Offre = new()
                    {
                        PrixAnnonce = 31_490, Remise = 750, MotifRemise = "Fin d'année modèle (exemple)", Options = [O("pneus-hiver")], MiseDeFonds = 4_000, ModeAchat = "financement", DureeMois = 60, TauxAnnuel = 5.49m, DateValidite = j.AddDays(6),
                    },
                },
            ]),

            new("s-marc-escape", "SOU-2026-0036", IdsProspectsDemo.MarcDupuis, "o-marc-escape", Moi, n.AddDays(-9),
            [
                new()
                {
                    Numero = 1, Date = n.AddDays(-9), Auteur = moi, Statut = StatutSoumission.Acceptee,
                    Note = "Proposition initiale",
                    Vehicule = Inv("v-escape") with { StatutActuel = StatutVehicule.PretPourVente },
                    Offre = new()
                    {
                        PrixAnnonce = 27_495, MiseDeFonds = 1_500, ModeAchat = "financement", DureeMois = 72, TauxAnnuel = 8.99m, DateValidite = j.AddDays(-2),
                    },
                },
            ]),

            new("s-lea-kona", "SOU-2026-0037", IdsProspectsDemo.LeaMartin, "o-lea-kona", Moi, n.AddDays(-7),
            [
                new()
                {
                    Numero = 1, Date = n.AddDays(-7), Auteur = moi, Statut = StatutSoumission.Acceptee,
                    Note = "Proposition initiale",
                    Vehicule = Inv("v-kona") with { StatutActuel = StatutVehicule.PretPourVente },
                    Offre = new()
                    {
                        PrixAnnonce = 26_995, Options = [O("protection")], MiseDeFonds = 3_000, ModeAchat = "financement", DureeMois = 60, TauxAnnuel = 6.99m, DateValidite = j.AddDays(-1),
                    },
                },
            ]),

            new("s-patrick-tundra", "SOU-2026-0030", IdsProspectsDemo.PatrickLeblanc, "o-patrick-tundra", Moi, n.AddDays(-8),
            [
                new()
                {
                    Numero = 1, Date = n.AddDays(-6), Auteur = moi, Statut = StatutSoumission.Acceptee,
                    Note = "Proposition initiale",
                    Vehicule = Inv("v-tundra") with { StatutActuel = StatutVehicule.PretPourVente },
                    Offre = new()
                    {
                        PrixAnnonce = 47_995, Options = [O("garantie")], MiseDeFonds = 15_000, ModeAchat = "financement", DureeMois = 72, TauxAnnuel = 7.49m, DateValidite = j.AddDays(-1), Commentaires = "Financement partiel : une part importante payée comptant.",
                    },
                },
            ]),

            new("s-melanie-rogue", "SOU-2026-0042", IdsProspectsDemo.MelanieCaron, "o-melanie-rogue", Moi, n.AddDays(-6),
            [
                new()
                {
                    Numero = 1, Date = n.AddDays(-5), Auteur = moi, Statut = StatutSoumission.Acceptee,
                    Note = "Proposition initiale",
                    Vehicule = Inv("v-rogue") with { StatutActuel = StatutVehicule.PretPourVente },
                    Offre = new()
                    {
                        PrixAnnonce = 29_495, Remise = 1_000, MotifRemise = "Ajustement négocié", Reprise = new("Honda Civic 2014", 4_500, null), MiseDeFonds = 2_000, ModeAchat = "financement", DureeMois = 72, TauxAnnuel = 7.99m, DateValidite = j.AddDays(2),
                    },
                },
            ]),

            new("s-francois-seltos", "SOU-2026-0027", IdsProspectsDemo.FrancoisBelanger, "o-francois-seltos", Moi, n.AddDays(-16),
            [
                new()
                {
                    Numero = 1, Date = n.AddDays(-15), Auteur = moi, Statut = StatutSoumission.Acceptee,
                    Note = "Proposition initiale",
                    Vehicule = Inv("v-seltos") with { StatutActuel = StatutVehicule.PretPourVente },
                    Offre = new()
                    {
                        PrixAnnonce = 28_495, Options = [O("tapis")], AcompteVerse = 2_000, ModeAchat = "comptant", DateValidite = j.AddDays(-8),
                    },
                },
            ]),

            new("s-amelie-crosstrek", "SOU-2026-0026", IdsProspectsDemo.AmelieGirard, "o-amelie-crosstrek", Moi, n.AddDays(-19),
            [
                new()
                {
                    Numero = 1, Date = n.AddDays(-18), Auteur = moi, Statut = StatutSoumission.Acceptee,
                    Note = "Proposition initiale",
                    Vehicule = Inv("v-crosstrek") with { StatutActuel = StatutVehicule.PretPourVente },
                    Offre = new()
                    {
                        PrixAnnonce = 30_995, Options = [O("pneus-hiver")], MiseDeFonds = 5_000, ModeAchat = "financement", DureeMois = 60, TauxAnnuel = 6.49m, DateValidite = j.AddDays(-11),
                    },
                },
            ]),

            new("s-nicolas-tiguan", "SOU-2026-0024", IdsProspectsDemo.NicolasBergeron, "o-nicolas-tiguan", Moi, n.AddDays(-21),
            [
                new()
                {
                    Numero = 1, Date = n.AddDays(-20), Auteur = moi, Statut = StatutSoumission.Acceptee,
                    Note = "Proposition initiale",
                    Vehicule = Inv("v-tiguan") with { StatutActuel = StatutVehicule.PretPourVente },
                    Offre = new()
                    {
                        PrixAnnonce = 31_995, AcompteVerse = 1_500, ModeAchat = "comptant", DateValidite = j.AddDays(-13),
                    },
                },
            ]),

            // Phase 06 : soumission envoyée sans réponse, soumission d'un client qui refuse les sollicitations, soumission acceptée sans transaction.
            new("s-eric-cx5", "SOU-2026-0047", IdsProspectsDemo.EricGendron, "o-eric-cx5", Moi, n.AddDays(-4),
            [
                new()
                {
                    Numero = 1, Date = n.AddDays(-4), Auteur = moi, Statut = StatutSoumission.Envoyee,
                    Note = "Proposition initiale",
                    Vehicule = Inv("v-cx5"),
                    Offre = new()
                    {
                        PrixAnnonce = 32_995, Options = [O("pneus-hiver")], MiseDeFonds = 4_000, ModeAchat = "financement",
                        DureeMois = 60, TauxAnnuel = 6.99m, DateValidite = j.AddDays(6),
                    },
                },
            ]),
            new("s-hugo-equinox", "SOU-2026-0043", IdsProspectsDemo.HugoLambert, "o-hugo-equinox", Moi, n.AddDays(-6),
            [
                new()
                {
                    Numero = 1, Date = n.AddDays(-6), Auteur = moi, Statut = StatutSoumission.Envoyee,
                    Note = "Proposition initiale",
                    Vehicule = Inv("v-equinox"),
                    Offre = new() { PrixAnnonce = 28_995, ModeAchat = "comptant", DateValidite = j.AddDays(8) },
                },
            ]),
            new("s-simon-crv", "SOU-2026-0048", IdsProspectsDemo.SimonThibault, "o-simon-crv", Moi, n.AddDays(-3),
            [
                new()
                {
                    Numero = 1, Date = n.AddDays(-1), Auteur = moi, Statut = StatutSoumission.Acceptee,
                    Note = "Proposition initiale",
                    Vehicule = Inv("v-crv"),
                    Offre = new() { PrixAnnonce = 46_290, Options = [O("tapis")], ModeAchat = "comptant", DateValidite = j.AddDays(6) },
                },
            ]),

            // Phase 07 : proposition refusée (vente perdue pour le prix) et ventes livrées.
            new("s-daniel-rav4", "SOU-2026-0039", IdsProspectsDemo.DanielProulx, "o-daniel-rav4", Moi, n.AddDays(-32),
            [
                new()
                {
                    Numero = 1, Date = n.AddDays(-32), Auteur = moi, Statut = StatutSoumission.Refusee,
                    Note = "Proposition initiale",
                    Vehicule = Inv("v-rav4"),
                    Offre = new() { PrixAnnonce = 41_490, ModeAchat = "financement", MiseDeFonds = 3_000, TauxAnnuel = 6.49m, DateValidite = j.AddDays(-25) },
                },
            ]),
            new("s-martine-hrv", "SOU-2026-0027", IdsProspectsDemo.MartineLavigne, "o-martine-hrv", Moi, n.AddDays(-28),
            [
                new()
                {
                    Numero = 1, Date = n.AddDays(-28), Auteur = moi, Statut = StatutSoumission.Acceptee,
                    Note = "Proposition initiale",
                    Vehicule = Inv("v-hrv") with { StatutActuel = StatutVehicule.PretPourVente },
                    Offre = new() { PrixAnnonce = 29_995, Options = [O("tapis")], ModeAchat = "comptant", DateValidite = j.AddDays(-21) },
                },
            ]),
            new("s-benoit-forester", "SOU-2026-0021", IdsProspectsDemo.BenoitLachance, "o-benoit-forester", Moi, n.AddDays(-55),
            [
                new()
                {
                    Numero = 1, Date = n.AddDays(-55), Auteur = moi, Statut = StatutSoumission.Acceptee,
                    Note = "Proposition initiale",
                    Vehicule = Inv("v-forester") with { StatutActuel = StatutVehicule.PretPourVente },
                    Offre = new() { PrixAnnonce = 33_495, ModeAchat = "comptant", DateValidite = j.AddDays(-48) },
                },
            ]),

            new("s-rachel-santafe", "SOU-2026-0032", IdsProspectsDemo.RachelDion, "o-rachel-santafe", Moi, n.AddDays(-11),
            [
                new()
                {
                    Numero = 1, Date = n.AddDays(-10), Auteur = moi, Statut = StatutSoumission.Acceptee,
                    Note = "Proposition initiale",
                    Vehicule = Inv("v-santafe") with { StatutActuel = StatutVehicule.PretPourVente },
                    Offre = new()
                    {
                        PrixAnnonce = 33_995, Options = [O("protection")], MiseDeFonds = 6_000, ModeAchat = "financement", DureeMois = 60, TauxAnnuel = 6.99m, DateValidite = j.AddDays(-3),
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
