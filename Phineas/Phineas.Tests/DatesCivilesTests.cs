using Microsoft.EntityFrameworkCore;
using Phineas.Data;
using Phineas.Models.Entities;
using Phineas.Models.ViewModels.Account;
using Phineas.Models.ViewModels.Conseiller;
using Phineas.Services.Conseiller;
using Phineas.Tests.Infrastructure;

namespace Phineas.Tests;

// Règle unique des dates civiles (ServiceProspects.EstJourAccepte), appliquée à la création d'un prospect (Creer)
// et à la planification d'un suivi (PlanifierSuivi, note avec suivi) : mêmes réponses dans les deux parcours.
public class DatesCivilesTests : IClassFixture<BaseMySqlDeTest>
{
    private readonly BaseMySqlDeTest _base;

    public DatesCivilesTests(BaseMySqlDeTest baseDeTest)
    {
        _base = baseDeTest;
    }

    // ---------- La règle elle-même, avec un « aujourd'hui du serveur » choisi ----------

    [Theory]
    [InlineData(0, true)]   // aujourd'hui
    [InlineData(1, true)]   // demain
    [InlineData(30, true)]
    [InlineData(-1, true)]  // hier dans le fuseau du serveur : toléré (aujourd'hui d'un utilisateur en retard sur le serveur)
    [InlineData(-2, false)] // réellement passé
    [InlineData(-30, false)]
    public void Un_jour_est_accepte_a_partir_de_la_veille_du_serveur(int decalage, bool accepte)
    {
        var aujourdhuiServeur = new DateTime(2026, 11, 24);

        Assert.Equal(accepte, ServiceProspects.EstJourAccepte(aujourdhuiServeur.AddDays(decalage), aujourdhuiServeur));
    }

    [Fact]
    public void Pres_de_minuit_l_aujourd_hui_de_l_utilisateur_n_est_jamais_refuse()
    {
        // Serveur en UTC, 00 h 30 le 25 novembre ; utilisateur à Montréal, 19 h 30 le 24 novembre.
        var serveur = new DateTime(2026, 11, 25, 0, 30, 0);
        var aujourdhuiUtilisateur = new DateTime(2026, 11, 24);

        Assert.True(ServiceProspects.EstJourAccepte(aujourdhuiUtilisateur, serveur.Date));          // son « aujourd'hui »
        Assert.True(ServiceProspects.EstJourAccepte(aujourdhuiUtilisateur.AddDays(1), serveur.Date)); // son « demain »
        Assert.False(ServiceProspects.EstJourAccepte(aujourdhuiUtilisateur.AddDays(-1), serveur.Date)); // son « hier »
    }

    [Fact]
    public void L_heure_du_jour_choisi_n_a_pas_d_effet()
    {
        var aujourdhuiServeur = new DateTime(2026, 11, 24);

        // Le formulaire envoie un jour sans heure ; une heure tardive ou matinale ne change pas la réponse.
        Assert.True(ServiceProspects.EstJourAccepte(new DateTime(2026, 11, 23, 0, 0, 1), aujourdhuiServeur));
        Assert.False(ServiceProspects.EstJourAccepte(new DateTime(2026, 11, 22, 23, 59, 59), aujourdhuiServeur));
    }

    // ---------- Les deux parcours donnent la même réponse ----------

    private static ServiceProspects NouveauService(ApplicationDbContext db) => new(db, new ServiceProspectsDemo());

    private async Task<(bool Accepte, int ProspectId)> CreerAvecSuiviAsync(ApplicationUser conseiller, DateTime jour)
    {
        var saisie = new NouveauProspectSaisie
        {
            Prenom = "Lina",
            Nom = "Date",
            Courriel = "lina." + Guid.NewGuid().ToString("N").Substring(0, 8) + "@exemple.test",
            ContactPrefere = "courriel",
            Source = "appel",
            ConseillerId = ServiceProspectsDemo.IdConseillerConnecte,
            Etape = "Nouveau",
            ProchaineAction = "Rappeler",
            DateSuivi = jour,
        };
        await using var db = _base.NouveauContexte();
        var resultat = await NouveauService(db).CreerAsync(conseiller.Id, saisie);
        return (resultat.Succes, resultat.Valeur);
    }

    private async Task<bool> PlanifierAsync(ApplicationUser conseiller, int prospectId, DateTime jour)
    {
        await using var db = _base.NouveauContexte();
        var p = await db.Prospects.AsNoTracking().Include(x => x.Opportunites).SingleAsync(x => x.Id == prospectId);
        var saisie = new SuiviSaisie
        {
            ProspectId = "pe-" + prospectId,
            OpportuniteId = "oe-" + p.Opportunites.Single().Id,
            Action = "Suivi du " + jour.ToString("yyyy-MM-dd"),
            Date = jour,
            Version = ServiceProspects.Empreinte(p),
        };
        return (await NouveauService(db).PlanifierSuiviAsync(conseiller.Id, saisie)).Succes;
    }

    [Theory]
    [InlineData(0, true)]   // aujourd'hui
    [InlineData(-1, true)]  // hier (tolérance de fuseau)
    [InlineData(1, true)]   // demain
    [InlineData(-2, false)] // avant-hier
    public async Task Creation_et_planification_appliquent_la_meme_regle(int decalage, bool accepte)
    {
        var conseiller = await _base.CreerConseillerAsync();
        var jour = DateTime.Today.AddDays(decalage);
        var (_, prospectDeReference) = await CreerAvecSuiviAsync(conseiller, DateTime.Today.AddDays(3));

        var (creationAcceptee, _) = await CreerAvecSuiviAsync(conseiller, jour);
        bool planificationAcceptee = await PlanifierAsync(conseiller, prospectDeReference, jour);

        Assert.Equal(accepte, creationAcceptee);
        Assert.Equal(accepte, planificationAcceptee);
    }

    [Fact]
    public async Task Le_jour_choisi_est_conserve_apres_relecture_dans_les_deux_parcours()
    {
        var conseiller = await _base.CreerConseillerAsync();
        var jourCreation = DateTime.Today;
        var jourSuivi = DateTime.Today.AddDays(1);

        var (accepte, id) = await CreerAvecSuiviAsync(conseiller, jourCreation);
        Assert.True(accepte);
        await using (var db = _base.NouveauContexte())
        {
            var donnees = await NouveauService(db).ObtenirAsync(new UserSummaryViewModel { Id = conseiller.Id, FullName = conseiller.FullName });
            Assert.Equal(jourCreation, Assert.Single(donnees.Opportunites, o => o.ProspectId == "pe-" + id).DateProchaineAction!.Value.Date);
        }

        Assert.True(await PlanifierAsync(conseiller, id, jourSuivi));
        await using (var db = _base.NouveauContexte())
        {
            var donnees = await NouveauService(db).ObtenirAsync(new UserSummaryViewModel { Id = conseiller.Id, FullName = conseiller.FullName });
            var date = Assert.Single(donnees.Opportunites, o => o.ProspectId == "pe-" + id).DateProchaineAction!.Value;
            Assert.Equal(jourSuivi, date.Date);
            Assert.Equal(DateTimeKind.Unspecified, date.Kind); // jamais converti en UTC : le jour affiché ne se décale pas
        }
    }

    [Fact]
    public async Task Un_suivi_deja_echu_reste_consultable()
    {
        var conseiller = await _base.CreerConseillerAsync();
        var (_, id) = await CreerAvecSuiviAsync(conseiller, DateTime.Today.AddDays(2));
        var echeance = DateTime.Today.AddDays(-10).AddHours(9);
        await using (var db = _base.NouveauContexte())
        {
            var o = await db.OpportunitesVente.SingleAsync(x => x.ProspectId == id);
            o.DateProchaineAction = echeance; // échu depuis 10 jours
            await db.SaveChangesAsync();
        }

        await using var lecture = _base.NouveauContexte();
        var donnees = await NouveauService(lecture).ObtenirAsync(new UserSummaryViewModel { Id = conseiller.Id, FullName = conseiller.FullName });

        Assert.Equal(echeance, Assert.Single(donnees.Opportunites, o => o.ProspectId == "pe-" + id).DateProchaineAction);
    }
}
