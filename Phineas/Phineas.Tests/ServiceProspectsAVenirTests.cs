using Microsoft.EntityFrameworkCore;
using Phineas.Data;
using Phineas.Models.Entities;
using Phineas.Models.ViewModels.Conseiller;
using Phineas.Services.Conseiller;
using Phineas.Tests.Infrastructure;

namespace Phineas.Tests;

// Lecture des suivis pour la vue « À venir » (ServiceProspects.SuivisPlanifiesAsync) : l'action courante de chaque
// opportunité active, jamais l'historique, seulement les dossiers du conseiller dans sa concession, triée par date.
// Le classement « À traiter » ou « À venir » d'un suivi du jour se fait dans le navigateur (voir realisation et
// a-venir-suivis.e2e.js) : ici, on vérifie ce que le serveur transmet.
public class ServiceProspectsAVenirTests : IClassFixture<BaseMySqlDeTest>
{
    private readonly BaseMySqlDeTest _base;

    public ServiceProspectsAVenirTests(BaseMySqlDeTest baseDeTest)
    {
        _base = baseDeTest;
    }

    private static ServiceProspects NouveauService(ApplicationDbContext db) => new(db, new ServiceProspectsDemo());

    // Jour civil tel que stocké (convention du projet : 9 h, sans conversion).
    private static DateTime Jour(int decalage) => DateTime.Today.AddDays(decalage).AddHours(9);

    // Prospect créé avec la prochaine action « action » dans « decalage » jours ; retourne (id du prospect, id de l'opportunité).
    private async Task<(int Prospect, int Opportunite)> CreerAsync(ApplicationUser conseiller, string action, int decalage, string nom = "Avenir")
    {
        var saisie = new NouveauProspectSaisie
        {
            Prenom = "Lea",
            Nom = nom,
            Courriel = "lea." + Guid.NewGuid().ToString("N").Substring(0, 8) + "@exemple.test",
            ContactPrefere = "courriel",
            Source = "appel",
            Modele = "Toyota RAV4",
            ConseillerId = ServiceProspectsDemo.IdConseillerConnecte,
            Etape = "Qualifie",
            ProchaineAction = action,
            DateSuivi = DateTime.Today.AddDays(Math.Max(decalage, 0)),
        };
        await using var db = _base.NouveauContexte();
        var resultat = await NouveauService(db).CreerAsync(conseiller.Id, saisie);
        Assert.True(resultat.Succes, resultat.PremierMessage);
        int oppId = await db.OpportunitesVente.Where(o => o.ProspectId == resultat.Valeur).Select(o => o.Id).SingleAsync();
        if (decalage < 0)
            await ChangerDateAsync(oppId, Jour(decalage));
        return (resultat.Valeur, oppId);
    }

    // Change directement la date en base (simule le temps qui passe : un suivi futur devient échu).
    private async Task ChangerDateAsync(int oppId, DateTime date)
    {
        await using var db = _base.NouveauContexte();
        var o = await db.OpportunitesVente.SingleAsync(x => x.Id == oppId);
        o.DateProchaineAction = date;
        await db.SaveChangesAsync();
    }

    private async Task<IReadOnlyList<SuiviPlanifie>> LireAsync(ApplicationUser conseiller)
    {
        await using var db = _base.NouveauContexte();
        return await NouveauService(db).SuivisPlanifiesAsync(conseiller.Id);
    }

    private async Task<string?> VersionAsync(int oppId)
    {
        await using var db = _base.NouveauContexte();
        var o = await db.OpportunitesVente.AsNoTracking().SingleAsync(x => x.Id == oppId);
        return ServiceProspects.EmpreinteSuivi(o.ProchaineAction, o.DateProchaineAction);
    }

    // Deuxième opportunité du même prospect (aucun écran ne la crée encore : ajout direct en base).
    private async Task<int> AjouterOpportuniteAsync(int prospectId, string action, DateTime date, EtapeVente etape = EtapeVente.Qualifie)
    {
        await using var db = _base.NouveauContexte();
        var o = new OpportuniteVente { ProspectId = prospectId, Titre = "Deuxième véhicule", Etape = etape, ProchaineAction = action, DateProchaineAction = date };
        db.OpportunitesVente.Add(o);
        await db.SaveChangesAsync();
        return o.Id;
    }

    // 1
    [Fact]
    public async Task Un_suivi_futur_reel_est_transmis_avec_le_prospect_l_opportunite_l_action_et_la_date()
    {
        var conseiller = await _base.CreerConseillerAsync();
        var (prospect, opp) = await CreerAsync(conseiller, "Appeler vendredi", 3, nom: "Vendredi");

        var s = Assert.Single(await LireAsync(conseiller));

        Assert.Equal("oe-" + opp, s.OpportuniteId);
        Assert.Equal("pe-" + prospect, s.ProspectId);
        Assert.Equal("Lea Vendredi", s.Client);
        Assert.Contains("Toyota RAV4", s.Opportunite);
        Assert.Equal("Appeler vendredi", s.Action);
        Assert.Equal(Jour(3), s.DatePrevue);
        Assert.Equal(await VersionAsync(opp), s.VersionSuivi); // utilisable par « Reporter » et « Marquer comme réalisé »
    }

    // 3 et 15 : un suivi passé (en retard, ou futur devenu échu) n'est plus transmis ; il relève de « À traiter ».
    [Fact]
    public async Task Un_suivi_en_retard_ou_devenu_echu_n_est_pas_transmis()
    {
        var conseiller = await _base.CreerConseillerAsync();
        await CreerAsync(conseiller, "En retard", -4);
        var (_, futur) = await CreerAsync(conseiller, "Futur puis échu", 2);
        Assert.Single(await LireAsync(conseiller));

        await ChangerDateAsync(futur, Jour(-1)); // le temps a passé : sa date est maintenant hier

        Assert.Empty(await LireAsync(conseiller));
    }

    // 2 et 18 : la borne du serveur est le début de son jour. Un suivi du jour est transmis (le navigateur le classe
    // dans « À traiter ») ; une minute avant minuit la veille, non.
    [Theory]
    [InlineData(0, 1, true)]        // aujourd'hui 00 h 01
    [InlineData(0, 9 * 60, true)]   // aujourd'hui 9 h (convention)
    [InlineData(0, 0, true)]        // aujourd'hui minuit pile
    [InlineData(-1, 23 * 60 + 59, false)] // hier 23 h 59
    [InlineData(1, 0, true)]        // demain minuit
    public async Task La_borne_du_serveur_est_minuit_au_debut_de_son_jour(int jour, int minutes, bool transmis)
    {
        var conseiller = await _base.CreerConseillerAsync();
        var (_, opp) = await CreerAsync(conseiller, "Autour de minuit", 1);
        await ChangerDateAsync(opp, DateTime.Today.AddDays(jour).AddMinutes(minutes));

        Assert.Equal(transmis, (await LireAsync(conseiller)).Count == 1);
    }

    // 4 et 16
    [Fact]
    public async Task Un_suivi_futur_realise_n_est_plus_un_suivi_actif_et_son_historique_reste()
    {
        var conseiller = await _base.CreerConseillerAsync();
        var (_, opp) = await CreerAsync(conseiller, "Réalisé en avance", 5);

        await using (var db = _base.NouveauContexte())
            Assert.True((await NouveauService(db).RealiserSuiviAsync(conseiller.Id, "oe-" + opp, await VersionAsync(opp))).Valeur);

        Assert.Empty(await LireAsync(conseiller));
        await using var lecture = _base.NouveauContexte();
        Assert.Equal(ClotureSuivi.Realise, (await lecture.HistoriquesSuiviOpportunite.SingleAsync(h => h.OpportuniteId == opp)).Cloture);
    }

    // 5 et 7 : après un remplacement, seule la nouvelle action est transmise, une seule fois.
    [Fact]
    public async Task Apres_un_remplacement_seule_la_nouvelle_action_est_transmise()
    {
        var conseiller = await _base.CreerConseillerAsync();
        var (prospect, opp) = await CreerAsync(conseiller, "Ancienne action", 2);
        await using (var db = _base.NouveauContexte())
        {
            var p = await db.Prospects.AsNoTracking().Include(x => x.Opportunites).SingleAsync(x => x.Id == prospect);
            var saisie = new SuiviSaisie { ProspectId = "pe-" + prospect, OpportuniteId = "oe-" + opp, Action = "Nouvelle action", Date = DateTime.Today.AddDays(6), Version = ServiceProspects.Empreinte(p) };
            Assert.True((await NouveauService(db).PlanifierSuiviAsync(conseiller.Id, saisie)).Succes);
        }

        var s = Assert.Single(await LireAsync(conseiller));
        Assert.Equal("Nouvelle action", s.Action);
        Assert.Equal(Jour(6), s.DatePrevue);
    }

    // 6 et 14 : les reports historiques ne sont pas des suivis ; un suivi en retard reporté au futur est transmis à sa nouvelle date.
    [Fact]
    public async Task Un_suivi_reporte_deux_fois_est_transmis_une_fois_a_sa_derniere_date()
    {
        var conseiller = await _base.CreerConseillerAsync();
        var (_, opp) = await CreerAsync(conseiller, "Reporté", -3);
        Assert.Empty(await LireAsync(conseiller));

        await using (var db = _base.NouveauContexte())
            Assert.True((await NouveauService(db).ReporterSuiviAsync(conseiller.Id, "oe-" + opp, await VersionAsync(opp), DateTime.Today.AddDays(4))).Valeur);
        Assert.Equal(Jour(4), Assert.Single(await LireAsync(conseiller)).DatePrevue);

        await using (var db = _base.NouveauContexte())
            Assert.True((await NouveauService(db).ReporterSuiviAsync(conseiller.Id, "oe-" + opp, await VersionAsync(opp), DateTime.Today.AddDays(9))).Valeur);
        var s = Assert.Single(await LireAsync(conseiller));
        Assert.Equal(Jour(9), s.DatePrevue);
        await using var lecture = _base.NouveauContexte();
        Assert.Equal(2, await lecture.HistoriquesSuiviOpportunite.CountAsync(h => h.OpportuniteId == opp && h.Cloture == ClotureSuivi.Reporte));
    }

    // 8, 9 et 17 : tri par date, puis par opportunité à date égale ; chaque opportunité garde sa propre action.
    [Fact]
    public async Task Les_suivis_sont_tries_par_date_puis_par_opportunite_et_restent_separes()
    {
        var conseiller = await _base.CreerConseillerAsync();
        var (p1, loin) = await CreerAsync(conseiller, "Loin", 10, nom: "Un");
        var (_, egalA) = await CreerAsync(conseiller, "Égal A", 3, nom: "Deux");
        var (_, egalB) = await CreerAsync(conseiller, "Égal B", 3, nom: "Trois");
        int proche = await AjouterOpportuniteAsync(p1, "Proche", Jour(1)); // même prospect, autre opportunité

        var suivis = await LireAsync(conseiller);

        Assert.Equal(new[] { "oe-" + proche, "oe-" + egalA, "oe-" + egalB, "oe-" + loin }, suivis.Select(s => s.OpportuniteId));
        Assert.Equal(new[] { "Proche", "Égal A", "Égal B", "Loin" }, suivis.Select(s => s.Action));
        Assert.Equal(2, suivis.Count(s => s.ProspectId == "pe-" + p1)); // une ligne par opportunité, pas par prospect
        Assert.Equal(suivis, await LireAsync(conseiller)); // même ordre à chaque lecture
    }

    [Fact]
    public async Task Une_opportunite_close_ou_sans_date_n_est_pas_transmise()
    {
        var conseiller = await _base.CreerConseillerAsync();
        var (p, _) = await CreerAsync(conseiller, "Active", 2);
        await AjouterOpportuniteAsync(p, "Gagnée", Jour(3), EtapeVente.Gagne);
        await AjouterOpportuniteAsync(p, "Perdue", Jour(3), EtapeVente.Perdu);
        await using (var db = _base.NouveauContexte())
        {
            db.OpportunitesVente.Add(new OpportuniteVente { ProspectId = p, Titre = "Sans date", ProchaineAction = "Sans date" });
            await db.SaveChangesAsync();
        }

        Assert.Equal("Active", Assert.Single(await LireAsync(conseiller)).Action);
    }

    // 13
    [Fact]
    public async Task Sans_suivi_futur_la_liste_est_vide()
    {
        var conseiller = await _base.CreerConseillerAsync();

        Assert.Empty(await LireAsync(conseiller));
    }

    // 11 et 12 : un collègue de la même concession, un conseiller d'ailleurs, ou le conseiller après un changement de
    // concession ne reçoivent pas ces suivis.
    [Fact]
    public async Task Seuls_les_dossiers_du_conseiller_dans_sa_concession_actuelle_sont_transmis()
    {
        var proprietaire = await _base.CreerConseillerAsync();
        var ailleurs = await _base.CreerConseillerAsync();
        await CreerAsync(proprietaire, "À moi", 2);
        await CreerAsync(ailleurs, "À quelqu'un d'ailleurs", 2);
        var collegue = new ApplicationUser
        {
            UserName = "collegue.avenir." + Guid.NewGuid().ToString("N").Substring(0, 8) + "@exemple.test",
            Email = "collegue.avenir@exemple.test",
            FirstName = "Collegue",
            LastName = "Meme",
            DealershipId = proprietaire.DealershipId,
        };
        await using (var db = _base.NouveauContexte())
        {
            db.Users.Add(collegue);
            await db.SaveChangesAsync();
        }

        Assert.Equal("À moi", Assert.Single(await LireAsync(proprietaire)).Action);
        Assert.Equal("À quelqu'un d'ailleurs", Assert.Single(await LireAsync(ailleurs)).Action);
        Assert.Empty(await LireAsync(collegue));

        // Le propriétaire change de concession : ses anciens dossiers ne sont plus transmis.
        await using (var db = _base.NouveauContexte())
        {
            var u = await db.Users.SingleAsync(x => x.Id == proprietaire.Id);
            u.DealershipId = ailleurs.DealershipId;
            await db.SaveChangesAsync();
        }
        Assert.Empty(await LireAsync(proprietaire));
    }
}
