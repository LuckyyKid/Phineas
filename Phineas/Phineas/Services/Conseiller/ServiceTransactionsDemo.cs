using Phineas.Models.Entities;
using Phineas.Models.ViewModels.Account;
using Phineas.Models.ViewModels.Conseiller;

namespace Phineas.Services.Conseiller;

// DONNÉES FICTIVES — phase frontend uniquement.
// Dossiers d'achat, décisions de financement, travaux d'atelier et paiements sont inventés et datés par rapport
// à « maintenant ». Aucune donnée financière confidentielle n'est produite : le conseiller ne reçoit que des états
// (« pièce justificative requise par F&A »), jamais de revenus, de renseignements bancaires ni de rapport de crédit.
// Les propositions retenues sont copiées des versions de soumission de ServiceSoumissionsDemo (instantanés cohérents).
public class ServiceTransactionsDemo : IServiceTransactions
{
    private const string Moi = "moi";
    private const string Antoine = "c-antoine";
    private const string MarieEve = "c-marie-eve";

    private readonly IServiceSoumissions _soumissions;

    public ServiceTransactionsDemo(IServiceSoumissions soumissions) => _soumissions = soumissions;

    public async Task<DonneesTransactions> ObtenirAsync(UserSummaryViewModel conseiller)
    {
        var n = DateTime.Now;
        var j = n.Date;
        var moi = conseiller.FullName;
        var soumissions = (await _soumissions.ObtenirAsync(conseiller)).Soumissions;

        PropositionRetenue Figer(string soumissionId, int numero, DateTime date)
        {
            var v = soumissions.First(s => s.Id == soumissionId).Versions.First(x => x.Numero == numero);
            return new(date, v.Vehicule, v.Offre);
        }
        EvenementTransaction Moi_(DateTime date, string type, string texte, string? ancien = null, string? nouveau = null) =>
            new(date, type, "conseiller", moi, "conseiller", texte, ancien, nouveau);
        static EvenementTransaction Dep(DateTime date, string type, string departement, string auteur, string texte, string? ancien = null, string? nouveau = null) =>
            new(date, type, "departement", auteur + " (fictif)", departement, texte, ancien, nouveau);
        static Dictionary<string, bool> Prep(params string[] cles) => cles.ToDictionary(c => c, _ => true);

        var transactions = new List<Transaction>
        {
            // 1. Achat comptant, véhicule en préparation (nettoyage en cours, date estimée connue).
            new()
            {
                Id = "t-gabriel-cx30", Reference = "TRX-2026-0018", ProspectId = IdsProspectsDemo.GabrielRoy, OpportuniteId = "o-gabriel-cx30",
                ConseillerId = Moi, VehiculeId = "v-cx30", SoumissionId = "s-gabriel-cx30", VersionNumero = 1,
                Proposition = Figer("s-gabriel-cx30", 1, n.AddDays(-4)), ModeAchat = "comptant", DateCreation = n.AddDays(-4),
                Commercial = new() { PrixConfirme = true, OptionsConfirmees = true, AccordClient = n.AddDays(-6) },
                Financement = new() { Statut = StatutFinancement.NonApplicable },
                Paiement = new() { DepotPrevu = 1_000, Depot = StatutPaiement.Confirme, Versement = StatutPaiement.EnAttente },
                Historique =
                [
                    Moi_(n.AddDays(-4), "creation", "Transaction ouverte.", null, "En cours"),
                    Moi_(n.AddDays(-4), "proposition", "Proposition retenue : SOU-2026-0034 version 1 (instantané figé).", null, "v1"),
                    Moi_(n.AddDays(-4).AddMinutes(10), "validation", "Prix et options confirmés avec le client."),
                    Dep(n.AddDays(-3), "paiement", "administration", "Administration des ventes", "Dépôt de 1 000 $ confirmé.", "Déclaré par le client", "Confirmé par une personne autorisée"),
                    Dep(n.AddDays(-1), "vehicule", "atelier", "Atelier", "Nettoyage commencé ; disponibilité estimée demain.", "Inspection terminée", "Nettoyage en cours"),
                ],
            },

            // 2. Financement en attente d'une pièce ; reprise évaluée à une valeur différente de l'estimation figée.
            new()
            {
                Id = "t-vincent-civic", Reference = "TRX-2026-0026", ProspectId = IdsProspectsDemo.VincentMorin, OpportuniteId = "o-vincent-civic",
                ConseillerId = Moi, VehiculeId = "v-civic", SoumissionId = "s-vincent-civic", VersionNumero = 2,
                Proposition = Figer("s-vincent-civic", 2, n.AddDays(-7)), ModeAchat = "financement", DateCreation = n.AddDays(-7),
                Commercial = new() { PrixConfirme = true, OptionsConfirmees = true, Remise = StatutRemise.Approuvee, RemiseDepuis = n.AddDays(-6), AccordClient = n.AddDays(-7) },
                Financement = new()
                {
                    Statut = StatutFinancement.InformationRequise, Depuis = n.AddDays(-2),
                    Pieces = [new("Justificatif de revenu", "Requise", n.AddDays(-2))],
                    Preparation = Prep("client", "documents"),
                },
                Reprise = new()
                {
                    Description = "Mazda 3 2015, environ 168 000 km", Marque = "Mazda", Modele = "3", Annee = 2015, Kilometrage = 168_000,
                    ValeurEstimee = 6_500, ValeurConfirmee = 6_000, Solde = 1_200, SoldeVisible = true,
                    Statut = StatutReprise.ValeurConfirmee, Depuis = n.AddDays(-1),
                },
                Paiement = new() { Versement = StatutPaiement.EnAttente },
                Historique =
                [
                    Moi_(n.AddDays(-7), "creation", "Transaction ouverte.", null, "En cours"),
                    Moi_(n.AddDays(-7), "proposition", "Proposition retenue : SOU-2026-0038 version 2 (instantané figé).", null, "v2"),
                    Moi_(n.AddDays(-7).AddMinutes(5), "validation", "Demande de validation de la remise transmise au directeur des ventes (hors Phineas).", "Validation à demander", "Validation demandée"),
                    Dep(n.AddDays(-6), "validation", "direction", "Directeur des ventes", "Remise de 495 $ approuvée.", "Validation demandée", "Remise approuvée"),
                    Moi_(n.AddDays(-5), "financement", "Dossier de financement transmis au service F&A (hors Phineas).", "En préparation", "Transmis au service F&A"),
                    Dep(n.AddDays(-4), "financement", "fa", "Service F&A", "Analyse du dossier commencée.", "Transmis au service F&A", "En cours d'analyse"),
                    Dep(n.AddDays(-2), "financement", "fa", "Service F&A", "Pièce justificative requise : justificatif de revenu.", "En cours d'analyse", "Information complémentaire requise"),
                    Dep(n.AddDays(-1), "reprise", "evaluation", "Évaluateur des reprises", "Valeur de reprise confirmée : 6 000 $.", "Évaluation en cours", "Valeur confirmée"),
                ],
            },

            // 3 et 14. Financement approuvé, mais livraison impossible : mise de fonds et éléments administratifs à confirmer.
            // Une version 3 (brouillon) existe : la transaction reste basée sur la version 2 retenue.
            new()
            {
                Id = "t-emilie-corolla", Reference = "TRX-2026-0021", ProspectId = IdsProspectsDemo.EmilieFournier, OpportuniteId = "o-emilie-corolla",
                ConseillerId = Moi, VehiculeId = "v-corolla", SoumissionId = "s-emilie-corolla", VersionNumero = 2,
                Proposition = Figer("s-emilie-corolla", 2, n.AddDays(-8)), ModeAchat = "financement", DateCreation = n.AddDays(-8),
                Commercial = new() { PrixConfirme = true, Remise = StatutRemise.Approuvee, RemiseDepuis = n.AddDays(-7), AccordClient = n.AddDays(-8) },
                Financement = new() { Statut = StatutFinancement.Approuve, Depuis = n.AddDays(-2), Preparation = Prep("client", "documents") },
                Paiement = new() { Versement = StatutPaiement.Declare, VersementDepuis = n.AddDays(-2).AddHours(1) },
                Administratif = new() { Statut = StatutAdministratif.EnCours, Depuis = n.AddDays(-1) },
                Historique =
                [
                    Moi_(n.AddDays(-8), "creation", "Transaction ouverte.", null, "En cours"),
                    Moi_(n.AddDays(-8), "proposition", "Proposition retenue : SOU-2026-0035 version 2 (instantané figé).", null, "v2"),
                    Dep(n.AddDays(-7), "validation", "direction", "Directeur des ventes", "Remise de 750 $ approuvée.", "Validation demandée", "Remise approuvée"),
                    Moi_(n.AddDays(-6), "financement", "Dossier de financement transmis au service F&A (hors Phineas).", "En préparation", "Transmis au service F&A"),
                    Dep(n.AddDays(-2), "financement", "fa", "Service F&A", "Financement approuvé.", "En cours d'analyse", "Approuvé"),
                    Moi_(n.AddDays(-2).AddHours(1), "paiement", "Mise de fonds déclarée par la cliente, à confirmer par une personne autorisée.", "Paiement en attente", "Déclaré par le client"),
                    Dep(n.AddDays(-1), "administratif", "administration", "Administration des ventes", "Vérification des éléments administratifs commencée.", "Non commencé", "En cours de vérification"),
                ],
            },

            // 4. Financement refusé : options autorisées présentées au conseiller.
            new()
            {
                Id = "t-marc-escape", Reference = "TRX-2026-0022", ProspectId = IdsProspectsDemo.MarcDupuis, OpportuniteId = "o-marc-escape",
                ConseillerId = Moi, VehiculeId = "v-escape", SoumissionId = "s-marc-escape", VersionNumero = 1,
                Proposition = Figer("s-marc-escape", 1, n.AddDays(-9)), ModeAchat = "financement", DateCreation = n.AddDays(-9),
                Commercial = new() { PrixConfirme = true, AccordClient = n.AddDays(-9) },
                Financement = new() { Statut = StatutFinancement.Refuse, Depuis = n.AddDays(-1), Preparation = Prep("client", "documents") },
                Paiement = new() { DepotPrevu = 500, Depot = StatutPaiement.Confirme },
                Historique =
                [
                    Moi_(n.AddDays(-9), "creation", "Transaction ouverte.", null, "En cours"),
                    Dep(n.AddDays(-8), "paiement", "administration", "Administration des ventes", "Dépôt de 500 $ confirmé.", "Déclaré par le client", "Confirmé par une personne autorisée"),
                    Moi_(n.AddDays(-7), "financement", "Dossier de financement transmis au service F&A (hors Phineas).", "En préparation", "Transmis au service F&A"),
                    Dep(n.AddDays(-1), "financement", "fa", "Service F&A", "Financement refusé. Le détail de la décision reste au service F&A.", "En cours d'analyse", "Refusé"),
                ],
            },

            // 5. Approuvé sous conditions : une condition pour la cliente, une vérification par F&A.
            new()
            {
                Id = "t-lea-kona", Reference = "TRX-2026-0023", ProspectId = IdsProspectsDemo.LeaMartin, OpportuniteId = "o-lea-kona",
                ConseillerId = Moi, VehiculeId = "v-kona", SoumissionId = "s-lea-kona", VersionNumero = 1,
                Proposition = Figer("s-lea-kona", 1, n.AddDays(-7)), ModeAchat = "financement", DateCreation = n.AddDays(-7),
                Commercial = new() { PrixConfirme = true, OptionsConfirmees = true, AccordClient = n.AddDays(-7) },
                Financement = new()
                {
                    Statut = StatutFinancement.ApprouveSousConditions, Depuis = n.AddHours(-26), Preparation = Prep("client", "documents"),
                    Conditions =
                    [
                        new("Preuve d'assurance du véhicule à fournir", "client", false),
                        new("Vérification complémentaire du dossier par F&A", "fa", false),
                        new("Mise de fonds versée avant la livraison", "client", true),
                    ],
                },
                Paiement = new() { Versement = StatutPaiement.Confirme },
                Historique =
                [
                    Moi_(n.AddDays(-7), "creation", "Transaction ouverte.", null, "En cours"),
                    Moi_(n.AddDays(-5), "financement", "Dossier de financement transmis au service F&A (hors Phineas).", "En préparation", "Transmis au service F&A"),
                    Dep(n.AddHours(-26), "financement", "fa", "Service F&A", "Financement approuvé sous conditions.", "En cours d'analyse", "Approuvé sous conditions"),
                    Dep(n.AddHours(-24), "paiement", "administration", "Administration des ventes", "Mise de fonds confirmée.", "Déclaré par le client", "Confirmé par une personne autorisée"),
                ],
            },

            // 6. Bloquée par l'atelier : réparation en attente de pièce, date de disponibilité inconnue. Financement partiel.
            new()
            {
                Id = "t-patrick-tundra", Reference = "TRX-2026-0024", ProspectId = IdsProspectsDemo.PatrickLeblanc, OpportuniteId = "o-patrick-tundra",
                ConseillerId = Moi, VehiculeId = "v-tundra", SoumissionId = "s-patrick-tundra", VersionNumero = 1,
                Proposition = Figer("s-patrick-tundra", 1, n.AddDays(-6)), ModeAchat = "partiel", DateCreation = n.AddDays(-6),
                Commercial = new() { PrixConfirme = true, OptionsConfirmees = true, AccordClient = n.AddDays(-6) },
                Financement = new() { Statut = StatutFinancement.EnAnalyse, Depuis = n.AddDays(-1), Preparation = Prep("client", "documents") },
                Paiement = new() { DepotPrevu = 2_000, Depot = StatutPaiement.Confirme, Versement = StatutPaiement.EnAttente },
                Historique =
                [
                    Moi_(n.AddDays(-6), "creation", "Transaction ouverte.", null, "En cours"),
                    Dep(n.AddDays(-5), "paiement", "administration", "Administration des ventes", "Dépôt de 2 000 $ confirmé.", "Déclaré par le client", "Confirmé par une personne autorisée"),
                    Dep(n.AddDays(-3), "vehicule", "atelier", "Atelier", "Inspection : usure des freins arrière constatée.", "Reçu", "En inspection"),
                    Dep(n.AddDays(-2), "vehicule", "atelier", "Atelier", "Réparation en attente d'une pièce commandée ; date de disponibilité non communiquée."),
                    Moi_(n.AddDays(-2), "financement", "Dossier de financement transmis au service F&A (hors Phineas).", "En préparation", "Transmis au service F&A"),
                    Dep(n.AddDays(-1), "financement", "fa", "Service F&A", "Analyse du dossier commencée.", "Transmis au service F&A", "En cours d'analyse"),
                ],
            },

            // 7. Plusieurs blocages simultanés : remise en attente prolongée, dossier incomplet, reprise incomplète,
            // dépôt non confirmé, véhicule reçu et pas encore inspecté.
            new()
            {
                Id = "t-melanie-rogue", Reference = "TRX-2026-0025", ProspectId = IdsProspectsDemo.MelanieCaron, OpportuniteId = "o-melanie-rogue",
                ConseillerId = Moi, VehiculeId = "v-rogue", SoumissionId = "s-melanie-rogue", VersionNumero = 1,
                Proposition = Figer("s-melanie-rogue", 1, n.AddDays(-5)), ModeAchat = "financement", DateCreation = n.AddDays(-5),
                Commercial = new() { PrixConfirme = true, Remise = StatutRemise.Demandee, RemiseDepuis = n.AddDays(-5), AccordClient = n.AddDays(-5) },
                Financement = new() { Statut = StatutFinancement.DossierIncomplet, Depuis = n.AddDays(-2), Preparation = Prep("client") },
                Reprise = new()
                {
                    Description = "Honda Civic 2014", Marque = "Honda", Modele = "Civic", Annee = 2014, Kilometrage = null,
                    ValeurEstimee = 4_500, Statut = StatutReprise.InformationsManquantes, Depuis = n.AddDays(-5),
                },
                Paiement = new() { DepotPrevu = 500, Depot = StatutPaiement.EnAttente, Versement = StatutPaiement.EnAttente },
                Historique =
                [
                    Moi_(n.AddDays(-5), "creation", "Transaction ouverte.", null, "En cours"),
                    Moi_(n.AddDays(-5).AddMinutes(10), "validation", "Demande de validation de la remise transmise au directeur des ventes (hors Phineas).", "Validation à demander", "Validation demandée"),
                    Moi_(n.AddDays(-3), "financement", "Dossier de financement transmis au service F&A (hors Phineas).", "En préparation", "Transmis au service F&A"),
                    Dep(n.AddDays(-2), "financement", "fa", "Service F&A", "Dossier jugé incomplet : la liste des éléments attendus doit être revue avec la cliente.", "Transmis au service F&A", "Dossier incomplet"),
                    Dep(n.AddDays(-1), "vehicule", "atelier", "Atelier", "Véhicule reçu ; inspection à planifier.", null, "Reçu"),
                ],
            },

            // 8. Reprise à évaluer ; aucune version acceptée : transaction en brouillon (incomplète).
            new()
            {
                Id = "t-karim-outback", Reference = "TRX-2026-0027", ProspectId = IdsProspectsDemo.KarimBenjelloun, OpportuniteId = "o-karim-outback",
                ConseillerId = Moi, VehiculeId = "v-outback", SoumissionId = "s-karim-outback", VersionNumero = 1,
                Brouillon = true, ModeAchat = "comptant", DateCreation = n.AddDays(-1),
                Financement = new() { Statut = StatutFinancement.NonApplicable },
                Reprise = new()
                {
                    Description = "Hyundai Elantra 2016, évaluation à faire", Marque = "Hyundai", Modele = "Elantra", Annee = 2016, Kilometrage = 142_000,
                    ValeurEstimee = 7_000, Statut = StatutReprise.EvaluationDemandee, Depuis = n.AddDays(-1),
                },
                Paiement = new() { DepotPrevu = 500, Depot = StatutPaiement.Declare, DepotDepuis = n.AddDays(-1), Versement = StatutPaiement.EnAttente },
                Historique =
                [
                    Moi_(n.AddDays(-1), "creation", "Transaction ouverte en brouillon : aucune version acceptée n'est retenue.", null, "Brouillon"),
                    Moi_(n.AddDays(-1), "paiement", "Acompte de 500 $ indiqué dans la soumission : déclaré, à confirmer par une personne autorisée.", null, "Déclaré par le client"),
                    Moi_(n.AddDays(-1).AddMinutes(15), "reprise", "Évaluation de la reprise demandée au personnel autorisé (hors Phineas).", "Reprise envisagée", "Évaluation demandée"),
                ],
            },

            // 9. Prête à livrer : toutes les conditions sont remplies, aucun rendez-vous de livraison encore.
            new()
            {
                Id = "t-francois-seltos", Reference = "TRX-2026-0019", ProspectId = IdsProspectsDemo.FrancoisBelanger, OpportuniteId = "o-francois-seltos",
                ConseillerId = Moi, VehiculeId = "v-seltos", SoumissionId = "s-francois-seltos", VersionNumero = 1,
                Proposition = Figer("s-francois-seltos", 1, n.AddDays(-14)), ModeAchat = "comptant", DateCreation = n.AddDays(-14),
                Commercial = new() { PrixConfirme = true, OptionsConfirmees = true, AccordClient = n.AddDays(-15) },
                Financement = new() { Statut = StatutFinancement.NonApplicable },
                Paiement = new() { DepotPrevu = 2_000, Depot = StatutPaiement.Confirme, Versement = StatutPaiement.Confirme },
                Administratif = new() { Statut = StatutAdministratif.Confirme, Depuis = n.AddDays(-1) },
                Historique =
                [
                    Moi_(n.AddDays(-14), "creation", "Transaction ouverte.", null, "En cours"),
                    Dep(n.AddDays(-13), "paiement", "administration", "Administration des ventes", "Dépôt de 2 000 $ confirmé.", "Déclaré par le client", "Confirmé par une personne autorisée"),
                    Dep(n.AddDays(-2), "paiement", "administration", "Administration des ventes", "Paiement du solde confirmé.", "Déclaré par le client", "Confirmé par une personne autorisée"),
                    Dep(n.AddDays(-1), "administratif", "administration", "Administration des ventes", "Éléments administratifs confirmés ; vente enregistrée.", "En cours de vérification", "Confirmés par le personnel autorisé"),
                ],
            },

            // 10. Livraison planifiée (rendez-vous r-amelie-livraison) : le véhicule n'est pas livré pour autant.
            new()
            {
                Id = "t-amelie-crosstrek", Reference = "TRX-2026-0017", ProspectId = IdsProspectsDemo.AmelieGirard, OpportuniteId = "o-amelie-crosstrek",
                ConseillerId = Moi, VehiculeId = "v-crosstrek", SoumissionId = "s-amelie-crosstrek", VersionNumero = 1,
                Proposition = Figer("s-amelie-crosstrek", 1, n.AddDays(-17)), ModeAchat = "financement", DateCreation = n.AddDays(-17),
                Commercial = new() { PrixConfirme = true, OptionsConfirmees = true, AccordClient = n.AddDays(-18) },
                Financement = new() { Statut = StatutFinancement.Approuve, Depuis = n.AddDays(-6), Preparation = Prep("client", "documents") },
                Paiement = new() { Versement = StatutPaiement.Confirme },
                Administratif = new() { Statut = StatutAdministratif.Confirme, Depuis = n.AddDays(-2) },
                Livraison = new() { DatePrevue = j.AddDays(1).AddHours(16) },
                Historique =
                [
                    Moi_(n.AddDays(-17), "creation", "Transaction ouverte.", null, "En cours"),
                    Dep(n.AddDays(-6), "financement", "fa", "Service F&A", "Financement approuvé.", "En cours d'analyse", "Approuvé"),
                    Dep(n.AddDays(-4), "paiement", "administration", "Administration des ventes", "Mise de fonds confirmée.", "Déclaré par le client", "Confirmé par une personne autorisée"),
                    Dep(n.AddDays(-2), "administratif", "administration", "Administration des ventes", "Éléments administratifs confirmés ; vente enregistrée.", "En cours de vérification", "Confirmés par le personnel autorisé"),
                    Moi_(n.AddDays(-1), "livraison", "Rendez-vous de livraison planifié demain à 16 h.", null, "Livraison planifiée"),
                ],
            },

            // 11. Livrée hier : la clôture administrative reste à faire ; l'opportunité n'est pas encore marquée gagnée.
            new()
            {
                Id = "t-nicolas-tiguan", Reference = "TRX-2026-0016", ProspectId = IdsProspectsDemo.NicolasBergeron, OpportuniteId = "o-nicolas-tiguan",
                ConseillerId = Moi, VehiculeId = "v-tiguan", SoumissionId = "s-nicolas-tiguan", VersionNumero = 1,
                Proposition = Figer("s-nicolas-tiguan", 1, n.AddDays(-19)), ModeAchat = "comptant", Statut = StatutTransaction.Livree, DateCreation = n.AddDays(-19),
                Commercial = new() { PrixConfirme = true, OptionsConfirmees = true, AccordClient = n.AddDays(-20) },
                Financement = new() { Statut = StatutFinancement.NonApplicable },
                Paiement = new() { DepotPrevu = 1_500, Depot = StatutPaiement.Confirme, Versement = StatutPaiement.Confirme },
                Administratif = new() { Statut = StatutAdministratif.Confirme, Depuis = n.AddDays(-3) },
                Livraison = new() { DatePrevue = j.AddDays(-1).AddHours(15), RemiseLe = j.AddDays(-1).AddHours(15).AddMinutes(40), ConfirmeeLe = j.AddDays(-1).AddHours(16) },
                Historique =
                [
                    Moi_(n.AddDays(-19), "creation", "Transaction ouverte.", null, "En cours"),
                    Dep(n.AddDays(-4), "paiement", "administration", "Administration des ventes", "Paiement du solde confirmé.", "Déclaré par le client", "Confirmé par une personne autorisée"),
                    Dep(n.AddDays(-3), "administratif", "administration", "Administration des ventes", "Éléments administratifs confirmés ; vente enregistrée.", "En cours de vérification", "Confirmés par le personnel autorisé"),
                    Moi_(j.AddDays(-1).AddHours(15).AddMinutes(40), "livraison", "Remise du véhicule au client déclarée par le conseiller.", null, "Véhicule remis"),
                    Moi_(j.AddDays(-1).AddHours(16), "statut", "Livraison confirmée.", "Prête à livrer", "Livrée"),
                ],
            },

            // Clôturée (autre conseillère) : visible avec le filtre « Tous les conseillers ».
            new()
            {
                Id = "t-sarah-tucson", Reference = "TRX-2026-0011", ProspectId = IdsProspectsDemo.SarahNguyen, OpportuniteId = "o-sarah-tucson",
                ConseillerId = MarieEve, VehiculeId = "v-tucson", SoumissionId = "s-sarah-tucson", VersionNumero = 1,
                Proposition = Figer("s-sarah-tucson", 1, n.AddDays(-11)), ModeAchat = "comptant", Statut = StatutTransaction.Cloturee, DateCreation = n.AddDays(-11),
                Commercial = new() { PrixConfirme = true, OptionsConfirmees = true, AccordClient = n.AddDays(-12) },
                Financement = new() { Statut = StatutFinancement.NonApplicable },
                Paiement = new() { DepotPrevu = 1_000, Depot = StatutPaiement.Confirme, Versement = StatutPaiement.Confirme },
                Administratif = new() { Statut = StatutAdministratif.Confirme, Depuis = n.AddDays(-8) },
                Livraison = new() { DatePrevue = n.AddDays(-6), RemiseLe = n.AddDays(-6), ConfirmeeLe = n.AddDays(-6) },
                ClotureLe = n.AddDays(-2),
                Historique =
                [
                    new(n.AddDays(-11), "creation", "conseiller", "Marie-Ève Paquette", "conseiller", "Transaction ouverte.", null, "En cours"),
                    new(n.AddDays(-6), "statut", "conseiller", "Marie-Ève Paquette", "conseiller", "Livraison confirmée.", "Prête à livrer", "Livrée"),
                    new(n.AddDays(-2), "statut", "conseiller", "Marie-Ève Paquette", "conseiller", "Dossier clôturé.", "Livrée", "Clôturée"),
                ],
            },

            // Phase 07 : ventes livrées et clôturées (suivi de satisfaction, problème après-vente, recommandation).
            new()
            {
                Id = "t-martine-hrv", Reference = "TRX-2026-0012", ProspectId = IdsProspectsDemo.MartineLavigne, OpportuniteId = "o-martine-hrv",
                ConseillerId = Moi, VehiculeId = "v-hrv", SoumissionId = "s-martine-hrv", VersionNumero = 1,
                Proposition = Figer("s-martine-hrv", 1, n.AddDays(-26)), ModeAchat = "comptant", Statut = StatutTransaction.Cloturee, DateCreation = n.AddDays(-26),
                Commercial = new() { PrixConfirme = true, OptionsConfirmees = true, AccordClient = n.AddDays(-27) },
                Financement = new() { Statut = StatutFinancement.NonApplicable },
                Paiement = new() { DepotPrevu = 1_000, Depot = StatutPaiement.Confirme, Versement = StatutPaiement.Confirme },
                Administratif = new() { Statut = StatutAdministratif.Confirme, Depuis = n.AddDays(-22) },
                Livraison = new() { DatePrevue = n.AddDays(-20), RemiseLe = n.AddDays(-20), ConfirmeeLe = n.AddDays(-20) },
                ClotureLe = n.AddDays(-15),
                Historique =
                [
                    Moi_(n.AddDays(-26), "creation", "Transaction ouverte.", null, "En cours"),
                    Moi_(n.AddDays(-20), "statut", "Livraison confirmée.", "Prête à livrer", "Livrée"),
                    Moi_(n.AddDays(-15), "statut", "Dossier clôturé.", "Livrée", "Clôturée"),
                ],
            },
            new()
            {
                Id = "t-benoit-forester", Reference = "TRX-2026-0010", ProspectId = IdsProspectsDemo.BenoitLachance, OpportuniteId = "o-benoit-forester",
                ConseillerId = Moi, VehiculeId = "v-forester", SoumissionId = "s-benoit-forester", VersionNumero = 1,
                Proposition = Figer("s-benoit-forester", 1, n.AddDays(-52)), ModeAchat = "comptant", Statut = StatutTransaction.Cloturee, DateCreation = n.AddDays(-52),
                Commercial = new() { PrixConfirme = true, OptionsConfirmees = true, AccordClient = n.AddDays(-53) },
                Financement = new() { Statut = StatutFinancement.NonApplicable },
                Paiement = new() { DepotPrevu = 1_000, Depot = StatutPaiement.Confirme, Versement = StatutPaiement.Confirme },
                Administratif = new() { Statut = StatutAdministratif.Confirme, Depuis = n.AddDays(-47) },
                Livraison = new() { DatePrevue = n.AddDays(-45), RemiseLe = n.AddDays(-45), ConfirmeeLe = n.AddDays(-45) },
                ClotureLe = n.AddDays(-40),
                Historique =
                [
                    Moi_(n.AddDays(-52), "creation", "Transaction ouverte.", null, "En cours"),
                    Moi_(n.AddDays(-45), "statut", "Livraison confirmée.", "Prête à livrer", "Livrée"),
                    Moi_(n.AddDays(-40), "statut", "Dossier clôturé.", "Livrée", "Clôturée"),
                ],
            },

            // 12. Annulée (client a acheté ailleurs) : conservée dans l'historique.
            new()
            {
                Id = "t-mathieu-tacoma", Reference = "TRX-2026-0009", ProspectId = IdsProspectsDemo.MathieuGauthier, OpportuniteId = "o-mathieu-tacoma",
                ConseillerId = Antoine, VehiculeId = "v-tacoma", SoumissionId = "s-mathieu-tacoma", VersionNumero = 1,
                Brouillon = true, ModeAchat = "financement", Statut = StatutTransaction.Annulee, DateCreation = n.AddDays(-28),
                Financement = new() { Statut = StatutFinancement.NonCommence },
                Annulation = new("achat-ailleurs", "client", n.AddDays(-20), "A trouvé un Tacoma chez un concurrent.", false),
                Historique =
                [
                    new(n.AddDays(-28), "creation", "conseiller", "Antoine Lefebvre", "conseiller", "Transaction ouverte en brouillon : aucune version acceptée n'est retenue.", null, "Brouillon"),
                    new(n.AddDays(-20), "annulation", "conseiller", "Antoine Lefebvre", "conseiller", "Transaction annulée par le client : client a acheté ailleurs. A trouvé un Tacoma chez un concurrent.", "En cours", "Annulée"),
                ],
            },

            // 13. Statut du véhicule modifié : retourné en inspection alors que la livraison était planifiée.
            new()
            {
                Id = "t-rachel-santafe", Reference = "TRX-2026-0020", ProspectId = IdsProspectsDemo.RachelDion, OpportuniteId = "o-rachel-santafe",
                ConseillerId = Moi, VehiculeId = "v-santafe", SoumissionId = "s-rachel-santafe", VersionNumero = 1,
                Proposition = Figer("s-rachel-santafe", 1, n.AddDays(-9)), ModeAchat = "financement", DateCreation = n.AddDays(-9),
                Commercial = new() { PrixConfirme = true, OptionsConfirmees = true, AccordClient = n.AddDays(-10) },
                Financement = new() { Statut = StatutFinancement.Approuve, Depuis = n.AddDays(-4), Preparation = Prep("client", "documents") },
                Paiement = new() { Versement = StatutPaiement.Confirme },
                Administratif = new() { Statut = StatutAdministratif.Confirme, Depuis = n.AddDays(-3) },
                Livraison = new() { DatePrevue = j.AddDays(2).AddHours(11) },
                Historique =
                [
                    Moi_(n.AddDays(-9), "creation", "Transaction ouverte.", null, "En cours"),
                    Dep(n.AddDays(-4), "financement", "fa", "Service F&A", "Financement approuvé.", "En cours d'analyse", "Approuvé"),
                    Dep(n.AddDays(-3), "administratif", "administration", "Administration des ventes", "Éléments administratifs confirmés ; vente enregistrée.", "En cours de vérification", "Confirmés par le personnel autorisé"),
                    Moi_(n.AddDays(-3), "livraison", "Rendez-vous de livraison planifié.", null, "Livraison planifiée"),
                    Dep(n.AddHours(-3), "vehicule", "atelier", "Atelier", "Véhicule retourné en inspection : témoin de moteur allumé lors de la préparation finale.", "Réservé", "En inspection"),
                ],
            },
        };

        StatutVehicule? Aucun = null;
        var atelier = new List<SuiviAtelier>
        {
            new("v-cx30", j.AddDays(1),
            [
                new("inspection", "Inspection mécanique", "inspection", StatutTacheAtelier.Terminee, n.AddDays(-6)),
                new("esthetique", "Esthétique complète", "nettoyage", StatutTacheAtelier.EnCours, n.AddDays(-1)),
            ],
            [
                new(n.AddDays(-9), Aucun, StatutVehicule.Recu, "atelier", null),
                new(n.AddDays(-8), StatutVehicule.Recu, StatutVehicule.EnInspection, "atelier", null),
                new(n.AddDays(-6), StatutVehicule.EnInspection, StatutVehicule.InspectionTerminee, "atelier", "Aucun défaut constaté."),
                new(n.AddDays(-1), StatutVehicule.InspectionTerminee, StatutVehicule.NettoyageEnCours, "atelier", null),
            ]),
            new("v-tundra", null,
            [
                new("inspection", "Inspection mécanique", "inspection", StatutTacheAtelier.EnCours, n.AddDays(-3)),
                new("freins", "Remplacement des plaquettes et disques arrière", "reparation", StatutTacheAtelier.EnAttentePiece, n.AddDays(-2)),
                new("esthetique", "Esthétique complète", "nettoyage", StatutTacheAtelier.AFaire, null),
            ],
            [
                new(n.AddDays(-10), Aucun, StatutVehicule.Recu, "atelier", null),
                new(n.AddDays(-3), StatutVehicule.Recu, StatutVehicule.EnInspection, "atelier", "Usure des freins arrière constatée."),
            ]),
            new("v-rogue", null,
            [
                new("inspection", "Inspection mécanique", "inspection", StatutTacheAtelier.AFaire, null),
                new("esthetique", "Esthétique complète", "nettoyage", StatutTacheAtelier.AFaire, null),
            ],
            [new(n.AddDays(-1), Aucun, StatutVehicule.Recu, "atelier", "Véhicule reçu d'un encan.")]),
            new("v-santafe", null,
            [
                new("diagnostic", "Diagnostic du témoin de moteur", "inspection", StatutTacheAtelier.EnCours, n.AddHours(-3)),
            ],
            [
                new(n.AddDays(-14), Aucun, StatutVehicule.Recu, "atelier", null),
                new(n.AddDays(-13), StatutVehicule.Recu, StatutVehicule.EnInspection, "atelier", null),
                new(n.AddDays(-12), StatutVehicule.EnInspection, StatutVehicule.InspectionTerminee, "atelier", null),
                new(n.AddDays(-11), StatutVehicule.InspectionTerminee, StatutVehicule.PretPourVente, "atelier", null),
                new(n.AddDays(-9), StatutVehicule.PretPourVente, StatutVehicule.Reserve, "conseiller", "Réservé pour la transaction TRX-2026-0020."),
                new(n.AddHours(-3), StatutVehicule.Reserve, StatutVehicule.EnInspection, "atelier", "Témoin de moteur allumé lors de la préparation finale."),
            ]),
            new("v-corolla", null,
            [new("pdi", "Préparation de livraison du véhicule neuf", "preparation", StatutTacheAtelier.Terminee, n.AddDays(-5))],
            [
                new(n.AddDays(-15), Aucun, StatutVehicule.PretPourVente, "atelier", null),
                new(n.AddDays(-8), StatutVehicule.PretPourVente, StatutVehicule.Reserve, "conseiller", "Réservé pour la transaction TRX-2026-0021."),
            ]),
            new("v-civic", null, [],
            [new(n.AddDays(-7), StatutVehicule.PretPourVente, StatutVehicule.Reserve, "conseiller", "Réservé pour la transaction TRX-2026-0026.")]),
            new("v-escape", null, [],
            [new(n.AddDays(-9), StatutVehicule.PretPourVente, StatutVehicule.Reserve, "conseiller", "Réservé pour la transaction TRX-2026-0022.")]),
            new("v-kona", null, [],
            [new(n.AddDays(-7), StatutVehicule.PretPourVente, StatutVehicule.Reserve, "conseiller", "Réservé pour la transaction TRX-2026-0023.")]),
            new("v-seltos", null, [],
            [
                new(n.AddDays(-14), StatutVehicule.PretPourVente, StatutVehicule.Reserve, "conseiller", "Réservé pour la transaction TRX-2026-0019."),
                new(n.AddDays(-1), StatutVehicule.Reserve, StatutVehicule.Vendu, "direction", "Vente enregistrée."),
            ]),
            new("v-crosstrek", null, [],
            [
                new(n.AddDays(-17), StatutVehicule.PretPourVente, StatutVehicule.Reserve, "conseiller", "Réservé pour la transaction TRX-2026-0017."),
                new(n.AddDays(-2), StatutVehicule.Reserve, StatutVehicule.Vendu, "direction", "Vente enregistrée."),
            ]),
            new("v-tiguan", null, [],
            [
                new(n.AddDays(-3), StatutVehicule.Reserve, StatutVehicule.Vendu, "direction", "Vente enregistrée."),
                new(j.AddDays(-1).AddHours(16), StatutVehicule.Vendu, StatutVehicule.Livre, "conseiller", "Livré au client."),
            ]),
        };

        return new DonneesTransactions(transactions, atelier);
    }
}
