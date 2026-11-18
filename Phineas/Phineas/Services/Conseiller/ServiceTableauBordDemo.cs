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

        var actions = new List<ActionPrioritaire>
        {
            new(1, IdsProspectsDemo.ChloeBouchard, "Chloé Bouchard", "Toyota RAV4 Hybride XLE 2024",
                "Soumission envoyée, sans réponse", maintenant.AddDays(-3),
                "La soumission expire demain", "Relancer par téléphone", "bi-telephone",
                EtapeVente.Soumission, Urgence.Critique, true),
            new(2, IdsProspectsDemo.VincentMorin, "Vincent Morin", "Honda Civic Touring 2023",
                "Financement : preuve de revenu manquante", maintenant.AddDays(-2),
                "Dossier bloqué depuis 2 jours, rencontre de financement prévue demain", "Demander la pièce manquante", "bi-file-earmark-arrow-up",
                EtapeVente.Finalisation, Urgence.Critique, true),
            new(3, IdsProspectsDemo.InesBenali, "Inès Benali", "Mazda CX-5 GT 2022",
                "Nouvelle demande reçue par le site Web", maintenant.AddMinutes(-40),
                "Objectif de première réponse : moins d'une heure", "Appeler la prospecte", "bi-telephone",
                EtapeVente.Nouveau, Urgence.Haute, true),
            new(4, IdsProspectsDemo.KarimBenjelloun, "Karim Benjelloun", "Subaru Outback Touring 2022",
                "Contre-offre reçue", maintenant.AddHours(-5),
                "Écart de 1 200 $ avec le prix affiché", "Préparer une réponse", "bi-chat-left-text",
                EtapeVente.Negociation, Urgence.Haute, true),
            new(5, IdsProspectsDemo.JulienCote, "Julien Côté", "Ford F-150 XLT 2021",
                "Essai routier effectué", maintenant.AddDays(-1),
                "Deuxième essai (Ram 1500) prévu demain, comparatif attendu", "Préparer le comparatif", "bi-file-earmark-text",
                EtapeVente.EssaiRoutier, Urgence.Haute, false),
            new(6, IdsProspectsDemo.CamilleLavoie, "Camille Lavoie", "Hyundai Ioniq 5 Preferred 2024",
                "Véhicule recherché maintenant disponible", maintenant.AddHours(-1),
                "Essai routier prévu aujourd'hui (VÉ, TI, moins de 50 000 $)", "Préparer l'essai routier", "bi-speedometer",
                EtapeVente.Qualifie, Urgence.Normale, false),
        };

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
            new(1, TypeAlerte.DossierBloque, "Financement en attente — Vincent Morin",
                "Preuve de revenu manquante. La rencontre de financement de demain est compromise.", maintenant.AddDays(-2)),
            new(2, TypeAlerte.DossierBloque, "Échange non évalué — Karim Benjelloun",
                "Le véhicule d'échange n'a pas encore été évalué.", maintenant.AddDays(-1)),
            new(3, TypeAlerte.SoumissionSansReponse, "Soumission sans réponse — Chloé Bouchard",
                "Envoyée il y a 3 jours, expire demain.", maintenant.AddDays(-3)),
            new(5, TypeAlerte.VehiculeDisponible, "Hyundai Ioniq 5 2024 prête pour la vente",
                "Correspond à la recherche de Camille Lavoie.", maintenant.AddHours(-1)),
        };

        if (aConfirmer is not null)
            alertes.Insert(3, new(4, TypeAlerte.RendezVousAConfirmer, $"Rendez-vous à confirmer — {aConfirmer.Client}",
                $"{FormatVente.Jour(aConfirmer.Debut, maintenant)} à {FormatVente.Heure(aConfirmer.Debut)}, aucune confirmation du client.",
                maintenant.AddHours(-3), aConfirmer.Id));

        var rdvAVenir = rendezVous;
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
                new("Opportunités en cours", pipeline.Sum(e => e.Nombre),
                    FormatVente.Argent(pipeline.Sum(e => e.Valeur)) + " en jeu", "bi-briefcase", TonIndicateur.Neutre),
                new("Prospects à recontacter", 3, "dont 1 nouveau aujourd'hui", "bi-chat-dots", TonIndicateur.Attention),
                new("Rendez-vous à venir", rdvAVenir.Count, $"{rdvAujourdhui} aujourd'hui", "bi-calendar-event", TonIndicateur.Neutre),
                new("Transactions bloquées", bloques, "financement et échange", "bi-sign-stop", TonIndicateur.Critique),
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
