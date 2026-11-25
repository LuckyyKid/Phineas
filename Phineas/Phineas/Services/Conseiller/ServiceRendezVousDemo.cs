using Phineas.Models.ViewModels.Account;
using Phineas.Models.ViewModels.Conseiller;

namespace Phineas.Services.Conseiller;

// Créneaux partagés entre les rendez-vous, les prospects et le tableau de bord de démonstration,
// pour que les textes (« rendez-vous de 16 h 30 ») restent cohérents quelle que soit l'heure.
public static class CreneauxDemo
{
    // Première demi-heure pleine située au moins 30 minutes après « maintenant ».
    public static DateTime Base(DateTime maintenant)
    {
        var t = maintenant.AddMinutes(30);
        return t.Date.AddHours(t.Hour).AddMinutes(t.Minute < 30 ? 30 : 60);
    }

    public static DateTime NegociationKarim(DateTime maintenant) => Base(maintenant);

    public static DateTime PresentationOlivier(DateTime maintenant) => Base(maintenant).AddHours(2).AddMinutes(30);
}

// DONNÉES FICTIVES — phase frontend uniquement.
// Rendez-vous inventés, datés par rapport à « maintenant ». Aucune réservation réelle : ni le calendrier
// d'un conseiller ni la disponibilité d'un véhicule ne sont lus ou modifiés.
// À remplacer par une implémentation de IServiceRendezVous branchée sur la base.
public class ServiceRendezVousDemo : IServiceRendezVous
{
    // Horloge (billet #87) : les dates fictives sont calculées par rapport à « maintenant » ; les tests peuvent fixer cet
    // instant (ApplicationDeTest.Horloge). GetUtcNow().LocalDateTime donne exactement DateTime.Now (heure locale du
    // serveur, même sérialisation) : rien ne change en production.
    private readonly TimeProvider _temps;

    public ServiceRendezVousDemo(TimeProvider? temps = null)
    {
        _temps = temps ?? TimeProvider.System;
    }

    private const string Moi = "moi";
    private const string Antoine = "c-antoine";
    private const string MarieEve = "c-marie-eve";

    public Task<DonneesRendezVous> ObtenirAsync(UserSummaryViewModel conseiller)
    {
        var n = _temps.GetUtcNow().LocalDateTime;
        var j = n.Date;
        var moi = conseiller.FullName;
        var b = CreneauxDemo.Base(n);

        static Dictionary<string, bool> Coches(params string[] cles) => cles.ToDictionary(c => c, _ => true);
        EvenementRendezVous E(DateTime date, string type, string texte, string? auteur = null) => new(date, type, auteur ?? moi, texte);

        var rendezVous = new List<RendezVous>
        {
            // 1. Confirmé aujourd'hui, associé à une soumission. Chevauche l'appel d'Inès (conflit de conseiller).
            new()
            {
                Id = "r-karim-negociation", ProspectId = IdsProspectsDemo.KarimBenjelloun, OpportuniteId = "o-karim-outback",
                SoumissionId = "s-karim-outback", VehiculeId = "v-outback", ConseillerId = Moi,
                Type = TypeRendezVous.Negociation, Statut = StatutRendezVous.Confirme,
                Debut = CreneauxDemo.NegociationKarim(n), DureeMinutes = 60, Mode = "concession", Lieu = "Bureau des ventes 2",
                Objectif = "Répondre à la contre-offre et présenter l'évaluation de la reprise.",
                DateCreation = n.AddHours(-5), Checklist = Coches("besoins", "soumission"),
                Historique =
                [
                    E(n.AddHours(-5), "creation", "Rendez-vous créé."),
                    E(n.AddHours(-4), "confirmation", "Confirmé par téléphone avec le client."),
                ],
            },

            // 11. Conflit de conseiller : appel planifié pendant la négociation avec Karim.
            new()
            {
                Id = "r-ines-appel", ProspectId = IdsProspectsDemo.InesBenali, OpportuniteId = "o-ines-cx5",
                ConseillerId = Moi, Type = TypeRendezVous.PremiereRencontre, Statut = StatutRendezVous.Planifie,
                Debut = b.AddMinutes(30), DureeMinutes = 30, Mode = "telephone",
                Objectif = "Premier appel : comprendre le besoin.",
                DateCreation = n.AddMinutes(-35),
                Historique = [E(n.AddMinutes(-35), "creation", "Rendez-vous créé.")],
            },

            // 2. À confirmer, visite sans soumission préalable. Le client n'a pas de courriel.
            new()
            {
                Id = "r-olivier-presentation", ProspectId = IdsProspectsDemo.OlivierPelletier, OpportuniteId = "o-olivier-equinox",
                VehiculeId = "v-equinox", ConseillerId = Moi,
                Type = TypeRendezVous.PresentationVehicule, Statut = StatutRendezVous.AConfirmer,
                Debut = CreneauxDemo.PresentationOlivier(n), DureeMinutes = 45, Mode = "concession", Lieu = "Salle d'exposition",
                Objectif = "Présenter l'Equinox et compléter la qualification (budget, délai).",
                DateCreation = n.AddDays(-1),
                Historique =
                [
                    E(n.AddDays(-1), "creation", "Rendez-vous créé."),
                    E(n.AddDays(-1).AddMinutes(2), "statut", "Planifié → En attente de confirmation"),
                ],
            },

            // Rencontre financement (événement d'agenda uniquement), associée à la soumission acceptée.
            new()
            {
                Id = "r-vincent-financement", ProspectId = IdsProspectsDemo.VincentMorin, OpportuniteId = "o-vincent-civic",
                SoumissionId = "s-vincent-civic", ConseillerId = Moi,
                Type = TypeRendezVous.Financement, Statut = StatutRendezVous.Confirme,
                Debut = j.AddDays(1).AddHours(9).AddMinutes(30), DureeMinutes = 60, Mode = "concession", Lieu = "Bureau du directeur commercial",
                Objectif = "Rencontre avec le service financement. La preuve de revenu est toujours manquante.",
                DateCreation = n.AddDays(-6), Checklist = Coches("besoins", "soumission"),
                Historique =
                [
                    E(n.AddDays(-6), "creation", "Rendez-vous créé."),
                    E(n.AddDays(-5), "confirmation", "Confirmé par téléphone avec le client."),
                ],
            },

            // Créneau d'hier dont le statut n'a pas été mis à jour : suivi requis (terminé, absent ou replanifié ?).
            new()
            {
                Id = "r-vincent-documents", ProspectId = IdsProspectsDemo.VincentMorin, OpportuniteId = "o-vincent-civic",
                SoumissionId = "s-vincent-civic", ConseillerId = Moi,
                Type = TypeRendezVous.Autre, Statut = StatutRendezVous.Confirme,
                Debut = j.AddDays(-1).AddHours(16).AddMinutes(30), DureeMinutes = 30, Mode = "concession", Lieu = "Bureau des ventes 2",
                Objectif = "Remise des documents de financement (preuve de revenu).",
                DateCreation = n.AddDays(-3),
                Historique =
                [
                    E(n.AddDays(-3), "creation", "Rendez-vous créé."),
                    E(n.AddDays(-3).AddMinutes(10), "confirmation", "Confirmé par téléphone avec le client."),
                ],
            },

            // 7. Replanifié : l'ancien créneau reste dans l'historique et pointe vers le nouveau.
            new()
            {
                Id = "r-chloe-discussion-1", ProspectId = IdsProspectsDemo.ChloeBouchard, OpportuniteId = "o-chloe-rav4",
                SoumissionId = "s-chloe-rav4", VehiculeId = "v-rav4", ConseillerId = Moi,
                Type = TypeRendezVous.DiscussionSoumission, Statut = StatutRendezVous.Replanifie,
                Debut = j.AddDays(-1).AddHours(17).AddMinutes(30), DureeMinutes = 45, Mode = "concession", Lieu = "Bureau des ventes 2",
                Objectif = "Revoir la soumission SOU-2026-0041 (version 2).",
                DateCreation = n.AddDays(-3), ReplanifieVers = "r-chloe-discussion-2",
                Historique =
                [
                    E(n.AddDays(-3), "creation", "Rendez-vous créé."),
                    E(n.AddDays(-2), "replanification", "Replanifié à la demande de la cliente (retard au travail)."),
                ],
            },
            new()
            {
                Id = "r-chloe-discussion-2", ProspectId = IdsProspectsDemo.ChloeBouchard, OpportuniteId = "o-chloe-rav4",
                SoumissionId = "s-chloe-rav4", VehiculeId = "v-rav4", ConseillerId = Moi,
                Type = TypeRendezVous.DiscussionSoumission, Statut = StatutRendezVous.Planifie,
                Debut = j.AddDays(1).AddHours(18), DureeMinutes = 45, Mode = "concession", Lieu = "Bureau des ventes 2",
                Objectif = "Revoir la soumission SOU-2026-0041 (version 2).",
                Commentaire = "Préfère les rendez-vous en fin de journée.",
                DateCreation = n.AddDays(-2), ReplanifieDepuis = "r-chloe-discussion-1",
                Historique = [E(n.AddDays(-2), "creation", "Rendez-vous créé par replanification.")],
            },

            // 4. Essai sur un véhicule encore en préparation (nettoyage en cours).
            new()
            {
                Id = "r-julien-essai-ram", ProspectId = IdsProspectsDemo.JulienCote, OpportuniteId = "o-julien-camion",
                VehiculeId = "v-ram", ConseillerId = Moi,
                Type = TypeRendezVous.EssaiRoutier, Statut = StatutRendezVous.Planifie,
                Debut = j.AddDays(1).AddHours(13), DureeMinutes = 60, Mode = "concession",
                Objectif = "Deuxième essai : comparer le Ram 1500 au F-150 essayé hier.",
                DateCreation = n.AddDays(-1).AddHours(1),
                Historique = [E(n.AddDays(-1).AddHours(1), "creation", "Rendez-vous créé à la suite de l'essai du F-150.")],
            },

            // 3. Essai sur un véhicule disponible, associé à une soumission. 12. Même véhicule que l'essai de Laurence.
            new()
            {
                Id = "r-camille-essai", ProspectId = IdsProspectsDemo.CamilleLavoie, OpportuniteId = "o-camille-ioniq",
                SoumissionId = "s-camille-ioniq", VehiculeId = "v-ioniq5", ConseillerId = Moi,
                Type = TypeRendezVous.EssaiRoutier, Statut = StatutRendezVous.Confirme,
                Debut = b.AddHours(1).AddMinutes(30), DureeMinutes = 45, Mode = "concession",
                Objectif = "Essai routier de la Ioniq 5 ; discuter de l'autonomie en hiver.",
                DateCreation = n.AddHours(-1), Checklist = Coches("besoins", "essai-disponible"),
                Historique =
                [
                    E(n.AddHours(-1), "creation", "Rendez-vous créé."),
                    E(n.AddMinutes(-50), "confirmation", "Confirmé par courriel par la cliente."),
                ],
            },
            new()
            {
                Id = "r-laurence-essai", ProspectId = IdsProspectsDemo.LaurenceOuellet, OpportuniteId = "o-laurence-vus",
                VehiculeId = "v-ioniq5", ConseillerId = MarieEve,
                Type = TypeRendezVous.EssaiRoutier, Statut = StatutRendezVous.Planifie,
                Debut = b.AddHours(2), DureeMinutes = 60, Mode = "concession",
                Objectif = "Essai d'un VUS électrique.",
                DateCreation = n.AddHours(-20), ReplanifieDepuis = "r-laurence-consultation",
                Historique = [E(n.AddHours(-20), "creation", "Rendez-vous créé après l'annulation de la consultation.", "Marie-Ève Paquette")],
            },

            // 5. Annulé par la cliente, avec intention de replanifier.
            new()
            {
                Id = "r-laurence-consultation", ProspectId = IdsProspectsDemo.LaurenceOuellet, OpportuniteId = "o-laurence-vus",
                ConseillerId = Moi, Type = TypeRendezVous.Consultation, Statut = StatutRendezVous.Annule,
                Debut = j.AddDays(-1).AddHours(11), DureeMinutes = 45, Mode = "concession",
                Objectif = "Consultation : préciser le besoin familial.",
                DateCreation = n.AddDays(-2), ReplanifieVers = "r-laurence-essai",
                Annulation = new("empechement", "client", n.AddDays(-1).AddHours(-3), "Enfant malade, souhaite revenir plus tard dans la semaine.", true),
                Historique =
                [
                    E(n.AddDays(-2), "creation", "Rendez-vous créé."),
                    E(n.AddDays(-1).AddHours(-3), "annulation", "Annulé par le client : empêchement du client."),
                ],
            },

            // 6. Client absent, prochaine action choisie.
            new()
            {
                Id = "r-alexandre-consultation", ProspectId = IdsProspectsDemo.AlexandreDube, OpportuniteId = "o-alexandre",
                ConseillerId = Antoine, Type = TypeRendezVous.Consultation, Statut = StatutRendezVous.ClientAbsent,
                Debut = j.AddDays(-1).AddHours(14), DureeMinutes = 30, Mode = "concession",
                Objectif = "Préciser le besoin.",
                DateCreation = n.AddDays(-1).AddHours(-6),
                Absence = new(j.AddDays(-1).AddHours(14).AddMinutes(25), "autre-date", "Aucune réponse au téléphone à 14 h 15."),
                Historique =
                [
                    E(n.AddDays(-1).AddHours(-6), "creation", "Rendez-vous créé.", "Antoine Lefebvre"),
                    E(j.AddDays(-1).AddHours(14).AddMinutes(25), "absence", "Client absent. Prochaine action : proposer une autre date.", "Antoine Lefebvre"),
                ],
            },

            // 8. Terminé avec résultat (essai routier).
            new()
            {
                Id = "r-isabelle-essai", ProspectId = IdsProspectsDemo.IsabelleFortin, OpportuniteId = "o-isabelle-sorento",
                VehiculeId = "v-sorento", ConseillerId = Moi,
                Type = TypeRendezVous.EssaiRoutier, Statut = StatutRendezVous.Termine,
                Debut = j.AddDays(-1).AddHours(10).AddMinutes(30), DureeMinutes = 60, Mode = "concession",
                Objectif = "Essai routier du Sorento 7 places.",
                DateCreation = n.AddDays(-3),
                Checklist = Coches("besoins", "disponibilite", "preparation", "essai-disponible", "essai-pret", "essai-cles", "essai-conditions", "essai-arrivee"),
                DebutEssai = j.AddDays(-1).AddHours(10).AddMinutes(40), FinEssai = j.AddDays(-1).AddHours(11).AddMinutes(15),
                Resultat = new()
                {
                    Date = j.AddDays(-1).AddHours(11).AddMinutes(30), Resultat = "interesse",
                    Observations = "Apprécie l'espace de la troisième rangée.", Objections = "Trouve la consommation élevée.",
                    ProchaineAction = "preparer-soumission", PrecisionAction = "Soumission avec reprise du CR-V 2017",
                    DateSuivi = j, Appreciation = "positive", PointsAimes = "Espace, confort de conduite",
                    PointsMoins = "Consommation", Questions = "Valeur de reprise du CR-V ?", Interet = "eleve",
                },
                Historique =
                [
                    E(n.AddDays(-3), "creation", "Rendez-vous créé."),
                    E(n.AddDays(-2), "confirmation", "Confirmé par téléphone avec la cliente."),
                    E(j.AddDays(-1).AddHours(10).AddMinutes(40), "essai", "Essai routier commencé."),
                    E(j.AddDays(-1).AddHours(11).AddMinutes(15), "essai", "Essai routier terminé."),
                    E(j.AddDays(-1).AddHours(11).AddMinutes(30), "resultat", "Résultat : client toujours intéressé."),
                ],
            },

            // Essai terminé à l'origine du deuxième essai de Julien.
            new()
            {
                Id = "r-julien-essai-f150", ProspectId = IdsProspectsDemo.JulienCote, OpportuniteId = "o-julien-camion",
                VehiculeId = "v-f150", ConseillerId = Moi,
                Type = TypeRendezVous.EssaiRoutier, Statut = StatutRendezVous.Termine,
                Debut = j.AddDays(-1).AddHours(15), DureeMinutes = 45, Mode = "concession",
                DateCreation = n.AddDays(-5),
                Checklist = Coches("essai-disponible", "essai-pret", "essai-cles", "essai-conditions", "essai-arrivee"),
                DebutEssai = j.AddDays(-1).AddHours(15).AddMinutes(5), FinEssai = j.AddDays(-1).AddHours(15).AddMinutes(40),
                Resultat = new()
                {
                    Date = j.AddDays(-1).AddHours(15).AddMinutes(50), Resultat = "deuxieme-essai",
                    Observations = "Veut comparer avec le Silverado et le Ram 1500.",
                    ProchaineAction = "deuxieme-essai", DateSuivi = j.AddDays(1),
                    Appreciation = "positive", PointsAimes = "Puissance, attelage", Interet = "moyen",
                    VehiculeAlternatif = "Ram 1500 Big Horn 2020",
                },
                Historique =
                [
                    E(n.AddDays(-5), "creation", "Rendez-vous créé."),
                    E(n.AddDays(-4), "confirmation", "Confirmé par texto avec le client."),
                    E(j.AddDays(-1).AddHours(15).AddMinutes(5), "essai", "Essai routier commencé."),
                    E(j.AddDays(-1).AddHours(15).AddMinutes(40), "essai", "Essai routier terminé."),
                    E(j.AddDays(-1).AddHours(15).AddMinutes(50), "resultat", "Résultat : deuxième essai à prévoir."),
                ],
            },

            // Phase 05 : livraison planifiée depuis une transaction prête à livrer (le rendez-vous ne vaut pas livraison).
            new()
            {
                Id = "r-amelie-livraison", ProspectId = IdsProspectsDemo.AmelieGirard, OpportuniteId = "o-amelie-crosstrek",
                SoumissionId = "s-amelie-crosstrek", VehiculeId = "v-crosstrek", ConseillerId = Moi,
                Type = TypeRendezVous.Livraison, Statut = StatutRendezVous.Confirme,
                Debut = j.AddDays(1).AddHours(16), DureeMinutes = 60, Mode = "concession", Lieu = "Salle de livraison",
                Objectif = "Remise du Crosstrek et présentation des commandes.",
                DateCreation = n.AddDays(-1), Checklist = Coches("besoins", "soumission", "disponibilite"),
                Historique =
                [
                    E(n.AddDays(-1), "creation", "Rendez-vous créé depuis la transaction TRX-2026-0017."),
                    E(n.AddDays(-1).AddMinutes(20), "confirmation", "Confirmé par texto avec la cliente."),
                ],
            },

            // Livraison planifiée alors que le véhicule était prêt : il est depuis retourné en inspection.
            new()
            {
                Id = "r-rachel-livraison", ProspectId = IdsProspectsDemo.RachelDion, OpportuniteId = "o-rachel-santafe",
                SoumissionId = "s-rachel-santafe", VehiculeId = "v-santafe", ConseillerId = Moi,
                Type = TypeRendezVous.Livraison, Statut = StatutRendezVous.Confirme,
                Debut = j.AddDays(2).AddHours(11), DureeMinutes = 60, Mode = "concession", Lieu = "Salle de livraison",
                Objectif = "Remise du Santa Fe.",
                DateCreation = n.AddDays(-3),
                Historique =
                [
                    E(n.AddDays(-3), "creation", "Rendez-vous créé depuis la transaction TRX-2026-0020."),
                    E(n.AddDays(-3).AddMinutes(30), "confirmation", "Confirmé par courriel avec la cliente."),
                ],
            },

            // Phase 06 : client absent à un essai routier ; une autre date doit lui être proposée.
            new()
            {
                Id = "r-eric-essai", ProspectId = IdsProspectsDemo.EricGendron, OpportuniteId = "o-eric-cx5",
                SoumissionId = "s-eric-cx5", VehiculeId = "v-cx5", ConseillerId = Moi,
                Type = TypeRendezVous.EssaiRoutier, Statut = StatutRendezVous.ClientAbsent,
                Debut = j.AddDays(-1).AddHours(18), DureeMinutes = 45, Mode = "concession",
                Objectif = "Essai routier du CX-5 proposé dans la soumission.",
                DateCreation = n.AddDays(-3),
                Absence = new(j.AddDays(-1).AddHours(18).AddMinutes(20), "autre-date", "Aucune réponse au téléphone."),
                Historique =
                [
                    E(n.AddDays(-3), "creation", "Rendez-vous créé."),
                    E(j.AddDays(-1).AddHours(18).AddMinutes(20), "absence", "Client absent. Prochaine action : proposer une autre date."),
                ],
            },

            // Rencontre de finalisation : revoir les conditions de financement avec la cliente.
            new()
            {
                Id = "r-lea-finalisation", ProspectId = IdsProspectsDemo.LeaMartin, OpportuniteId = "o-lea-kona",
                SoumissionId = "s-lea-kona", VehiculeId = "v-kona", ConseillerId = Moi,
                Type = TypeRendezVous.Finalisation, Statut = StatutRendezVous.Planifie,
                Debut = j.AddDays(2).AddHours(10), DureeMinutes = 45, Mode = "concession", Lieu = "Bureau des ventes 2",
                Objectif = "Revoir les conditions de l'approbation et les éléments à fournir.",
                DateCreation = n.AddHours(-25),
                Historique = [E(n.AddHours(-25), "creation", "Rendez-vous créé depuis la transaction TRX-2026-0023.")],
            },
        };

        return Task.FromResult(new DonneesRendezVous(rendezVous, 8, 20, "Salle d'exposition"));
    }
}
