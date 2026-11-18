using Phineas.Models.ViewModels.Account;
using Phineas.Models.ViewModels.Conseiller;

namespace Phineas.Services.Conseiller;

// DONNÉES FICTIVES — phase frontend uniquement.
// Personnes, véhicules et montants sont inventés et datés par rapport à « maintenant ».
// À remplacer par une implémentation de IServiceTableauBordConseiller branchée sur la base de données.
public class ServiceTableauBordDemo : IServiceTableauBordConseiller
{
    private static readonly StatutRendezVous[] StatutsActifs =
        [StatutRendezVous.Planifie, StatutRendezVous.AConfirmer, StatutRendezVous.Confirme, StatutRendezVous.EnCours];

    private readonly IServiceProspects _prospects;
    private readonly IServiceSoumissions _soumissions;
    private readonly IServiceRendezVous _rendezVous;

    public ServiceTableauBordDemo(IServiceProspects prospects, IServiceSoumissions soumissions, IServiceRendezVous rendezVous)
    {
        _prospects = prospects;
        _soumissions = soumissions;
        _rendezVous = rendezVous;
    }

    public async Task<TableauBordConseillerViewModel> ObtenirAsync(UserSummaryViewModel conseiller)
    {
        var maintenant = DateTime.Now;
        var aujourdhui = maintenant.Date;
        var prospects = await _prospects.ObtenirAsync(conseiller);
        var soumissions = await _soumissions.ObtenirAsync(conseiller);
        var agenda = await _rendezVous.ObtenirAsync(conseiller);

        // Les actions prioritaires sont calculées dans le navigateur par le moteur d'intelligence commerciale
        // (intelligence-tableau.js), la même source que le Centre d'actions.
        var actions = new List<ActionPrioritaire>();

        // Mes rendez-vous actifs qui ne sont pas encore terminés : même source que l'agenda.
        var rendezVous = agenda.RendezVous
            .Where(r => r.ConseillerId == prospects.ConseillerConnecteId && StatutsActifs.Contains(r.Statut)
                && r.Debut.AddMinutes(r.DureeMinutes) >= maintenant)
            .OrderBy(r => r.Debut)
            .Select(r =>
            {
                var c = prospects.Contacts.First(x => x.Id == r.ProspectId);
                var v = r.VehiculeId is null ? null : soumissions.Inventaire.FirstOrDefault(x => x.Id == r.VehiculeId);
                return new RendezVousResume(r.Id, r.Debut, c.Id, $"{c.Prenom} {c.Nom}",
                    v is null ? null : $"{v.Marque} {v.Modele} {v.Version} {v.Annee}", r.Type, r.Statut);
            })
            .ToList();
        var aConfirmer = rendezVous.FirstOrDefault(r => r.Statut == StatutRendezVous.AConfirmer);

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
            // Les alertes « Dossier bloqué » sont calculées dans le navigateur à partir des transactions (transactions-tableau.js).
            new(3, TypeAlerte.SoumissionSansReponse, "Soumission sans réponse — Chloé Bouchard",
                "Envoyée il y a 3 jours, expire demain.", maintenant.AddDays(-3)),
            new(5, TypeAlerte.VehiculeDisponible, "Hyundai Ioniq 5 2024 prête pour la vente",
                "Correspond à la recherche de Camille Lavoie.", maintenant.AddHours(-1)),
        };

        if (aConfirmer is not null)
            // Entre l'alerte 3 et l'alerte 5 (les alertes « Dossier bloqué » ne sont plus dans cette liste).
            alertes.Insert(1, new(4, TypeAlerte.RendezVousAConfirmer, $"Rendez-vous à confirmer — {aConfirmer.Client}",
                $"{FormatVente.Jour(aConfirmer.Debut, maintenant)} à {FormatVente.Heure(aConfirmer.Debut)}, aucune confirmation du client.",
                maintenant.AddHours(-3), aConfirmer.Id));

        var rdvAVenir = rendezVous;
        var rdvAujourdhui = rdvAVenir.Count(r => r.Debut.Date == aujourdhui);

        var modele = new TableauBordConseillerViewModel
        {
            Prenom = conseiller.FirstName,
            NomComplet = conseiller.FullName,
            Concession = conseiller.DealershipName,
            Maintenant = maintenant,
            DonneesFictives = true,
            Indicateurs =
            [
                new("Opportunités en cours", pipeline.Sum(e => e.Nombre),
                    FormatVente.Argent(pipeline.Sum(e => e.Valeur)) + " en jeu", "bi-briefcase", TonIndicateur.Neutre),
                new("Prospects à recontacter", null, "relances proposées par le moteur", "bi-chat-dots", TonIndicateur.Attention),
                new("Rendez-vous à venir", rdvAVenir.Count, $"{rdvAujourdhui} aujourd'hui", "bi-calendar-event", TonIndicateur.Neutre),
                new("Transactions bloquées", null, "calculé à partir de vos transactions", "bi-sign-stop", TonIndicateur.Critique),
            ],
            Actions = actions,
            RendezVous = rendezVous,
            Pipeline = pipeline,
            Gagnes = 6,
            Perdus = 2,
            Alertes = alertes,
        };

        return modele;
    }
}
