using Phineas.Models.ViewModels.Account;
using Phineas.Models.ViewModels.Conseiller;

namespace Phineas.Services.Conseiller;

// DONNÉES FICTIVES — phase frontend uniquement.
// Personnes, véhicules et montants sont inventés et datés par rapport à « maintenant ».
// À remplacer par une implémentation de IServiceTableauBordConseiller branchée sur la base de données.
public class ServiceTableauBordDemo : IServiceTableauBordConseiller
{
    public Task<TableauBordConseillerViewModel> ObtenirAsync(UserSummaryViewModel conseiller)
    {
        var maintenant = DateTime.Now;
        var aujourdhui = maintenant.Date;

        // Triées par priorité : les trois premières échéances du jour alimentent la carte « À faire en premier ».
        var actions = new List<ActionPrioritaire>
        {
            new(1, "Mélissa Hébert", "Hyundai Kona Preferred 2024",
                "Nouveau prospect recommandé", maintenant.AddHours(-5),
                "Elle a demandé à être contactée il y a 5 h et n'a pas encore reçu de réponse.", "Préparer la relance", "bi-telephone",
                EtapeVente.Nouveau, Urgence.Critique, true),
            new(2, "Chloé Bouchard", "Toyota RAV4 Hybride XLE 2024",
                "Soumission sans réponse", maintenant.AddDays(-3),
                "Sa soumission expire demain. Un appel aujourd'hui peut conclure la vente.", "Relancer par téléphone", "bi-telephone",
                EtapeVente.Soumission, Urgence.Critique, true),
            new(3, "Vincent Morin", "Honda Civic Touring 2023",
                "Financement bloqué", maintenant.AddDays(-2),
                "Il manque sa preuve de revenu, et la signature est prévue demain matin.", "Demander la pièce", "bi-file-earmark-arrow-up",
                EtapeVente.Finalisation, Urgence.Haute, true),
            new(4, "Karim Benjelloun", "Subaru Outback Touring 2022",
                "Contre-offre reçue", maintenant.AddHours(-5),
                "Écart de 1 200 $ avec le prix affiché", "Préparer une réponse", "bi-chat-left-text",
                EtapeVente.Negociation, Urgence.Normale, true),
            new(5, "Julien Côté", "Ford F-150 XLT 2021",
                "Essai routier effectué", maintenant.AddDays(-1),
                "Intérêt élevé, aucune suite planifiée", "Envoyer une soumission", "bi-file-earmark-text",
                EtapeVente.EssaiRoutier, Urgence.Haute, false),
            new(6, "Camille Lavoie", "Hyundai Ioniq 5 Preferred 2024",
                "Véhicule recherché maintenant disponible", maintenant.AddHours(-1),
                "Correspond à ses critères (VÉ, TI, moins de 50 000 $)", "Informer la cliente", "bi-envelope",
                EtapeVente.Qualifie, Urgence.Normale, false),
        };

        var rendezVous = new List<RendezVousResume>
        {
            new(aujourdhui.AddHours(18), "Karim Benjelloun", "Outback 2022", TypeVisite.Negociation, true),
            new(aujourdhui.AddHours(18).AddMinutes(30), "Inès Benali", null, TypeVisite.PremiereRencontre, false),
            new(aujourdhui.AddHours(19).AddMinutes(30), "Camille Lavoie", "Ioniq 5", TypeVisite.EssaiRoutier, true),
            new(aujourdhui.AddHours(20).AddMinutes(30), "Olivier Pelletier", "Equinox", TypeVisite.Presentation, false),
            new(aujourdhui.AddDays(1).AddHours(9).AddMinutes(30), "Vincent Morin", "Civic 2023", TypeVisite.Signature, false),
            new(aujourdhui.AddDays(2).AddHours(11), "Julien Côté", "F-150 2021", TypeVisite.EssaiRoutier, true),
        };

        var pipeline = new List<EtapePipeline>
        {
            new(EtapeVente.Nouveau, 5, 162_400m),
            new(EtapeVente.Qualifie, 4, 148_500m),
            new(EtapeVente.Soumission, 3, 118_900m),
            new(EtapeVente.EssaiRoutier, 2, 89_400m),
            new(EtapeVente.Negociation, 2, 71_800m),
            new(EtapeVente.Finalisation, 1, 32_600m),
        };

        var alertes = new List<AlerteVente>
        {
            new(1, TypeAlerte.DossierBloque, "Financement en attente — Vincent Morin",
                "Preuve de revenu manquante. La signature de demain est compromise.", maintenant.AddDays(-2)),
            new(2, TypeAlerte.DossierBloque, "Échange non évalué — Karim Benjelloun",
                "Le véhicule d'échange n'a pas encore été évalué.", maintenant.AddDays(-1)),
            new(3, TypeAlerte.SoumissionSansReponse, "Soumission sans réponse — Chloé Bouchard",
                "Envoyée il y a 3 jours, expire demain.", maintenant.AddDays(-3)),
            new(4, TypeAlerte.RendezVousAConfirmer, "Rendez-vous à confirmer — Olivier Pelletier",
                "Aujourd'hui à 20 h 30, aucune confirmation du client.", maintenant.AddHours(-3)),
            new(5, TypeAlerte.VehiculeDisponible, "Hyundai Ioniq 5 2024 prête pour la vente",
                "Correspond à la recherche de Camille Lavoie.", maintenant.AddHours(-1)),
        };

        var rdvAVenir = rendezVous.Where(r => r.Debut >= maintenant).ToList();
        var rdvAujourdhui = rdvAVenir.Count(r => r.Debut.Date == aujourdhui);
        var bloques = alertes.Count(a => a.Type == TypeAlerte.DossierBloque);

        var modele = new TableauBordConseillerViewModel
        {
            Prenom = conseiller.FirstName,
            NomComplet = conseiller.FullName,
            Concession = conseiller.DealershipName,
            Maintenant = maintenant,
            DonneesFictives = true,
            Indicateurs =
            [
                new("opportunités", pipeline.Sum(e => e.Nombre),
                    FormatVente.Argent(pipeline.Sum(e => e.Valeur)) + " en jeu", "bi-briefcase", TonIndicateur.Neutre),
                new("à recontacter", actions.Count, "relances proposées", "bi-chat-dots", TonIndicateur.Attention),
                new("rendez-vous", rdvAVenir.Count, $"{rdvAujourdhui} aujourd'hui", "bi-calendar-event", TonIndicateur.Neutre),
                new("transactions bloquées", bloques, "financement et échange", "bi-sign-stop", TonIndicateur.Critique),
            ],
            Actions = actions,
            RendezVous = rendezVous,
            Pipeline = pipeline,
            Gagnes = 6,
            Perdus = 2,
            Alertes = alertes,
        };

        return Task.FromResult(modele);
    }
}
