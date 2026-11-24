using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Phineas.Data;
using Phineas.Models.Entities;
using Phineas.Models.ViewModels.Account;
using Phineas.Models.ViewModels.Conseiller;
using Phineas.Services.Commun;
using Phineas.Services.Conseiller;
using Phineas.Tests.Infrastructure;

namespace Phineas.Tests;

// Report d'un suivi (ServiceProspects.ReporterSuiviAsync) : même action, nouvelle échéance, événement « Reporté ».
// Aussi : une planification qui ne change que la date (PlanifierSuiviAsync) est un report, pas un remplacement.
// Chaque test crée son conseiller, sa concession et son prospect.
public class ServiceProspectsReportTests : IClassFixture<BaseMySqlDeTest>
{
    private const string Action = "Appeler pour l'essai";

    private readonly BaseMySqlDeTest _base;

    public ServiceProspectsReportTests(BaseMySqlDeTest baseDeTest)
    {
        _base = baseDeTest;
    }

    private static ServiceProspects NouveauService(ApplicationDbContext db) => new(db, new ServiceProspectsDemo());

    // Jour civil tel que stocké (convention du projet : 9 h, sans conversion).
    private static DateTime Jour(int decalage) => DateTime.Today.AddDays(decalage).AddHours(9);

    // Prospect créé avec la prochaine action « Appeler pour l'essai » dans 2 jours (ou sans action), à l'étape « Qualifié ».
    private async Task<int> CreerProspectAsync(ApplicationUser conseiller, bool avecSuivi = true)
    {
        var saisie = new NouveauProspectSaisie
        {
            Prenom = "Paul",
            Nom = "Report",
            Courriel = "paul." + Guid.NewGuid().ToString("N").Substring(0, 8) + "@exemple.test",
            ContactPrefere = "courriel",
            Source = "appel",
            Modele = "Kia Niro",
            ConseillerId = ServiceProspectsDemo.IdConseillerConnecte,
            Etape = "Qualifie",
            ProchaineAction = avecSuivi ? Action : null,
            DateSuivi = avecSuivi ? DateTime.Today.AddDays(2) : null,
        };
        await using var db = _base.NouveauContexte();
        var resultat = await NouveauService(db).CreerAsync(conseiller.Id, saisie);
        Assert.True(resultat.Succes, resultat.PremierMessage);
        return resultat.Valeur;
    }

    private async Task<Prospect> LireAsync(int prospectId)
    {
        await using var db = _base.NouveauContexte();
        return await db.Prospects.AsNoTracking()
            .Include(p => p.Opportunites).ThenInclude(o => o.HistoriqueSuivis)
            .Include(p => p.Opportunites).ThenInclude(o => o.HistoriqueEtapes)
            .Include(p => p.Notes)
            .SingleAsync(p => p.Id == prospectId);
    }

    // Opportunité principale et empreinte du suivi tel qu'il est affiché.
    private async Task<(string OppId, string? Version)> SuiviAfficheAsync(int prospectId)
    {
        var o = (await LireAsync(prospectId)).Opportunites.Single();
        return ("oe-" + o.Id, ServiceProspects.EmpreinteSuivi(o.ProchaineAction, o.DateProchaineAction));
    }

    private async Task<ResultatService<bool>> ReporterAsync(ApplicationUser conseiller, string oppId, string? version, DateTime? jour, params IInterceptor[] intercepteurs)
    {
        await using var db = _base.NouveauContexte(intercepteurs);
        return await NouveauService(db).ReporterSuiviAsync(conseiller.Id, oppId, version, jour);
    }

    private async Task<ResultatService<bool>> RealiserAsync(ApplicationUser conseiller, string oppId, string? version)
    {
        await using var db = _base.NouveauContexte();
        return await NouveauService(db).RealiserSuiviAsync(conseiller.Id, oppId, version);
    }

    private async Task<ResultatService<bool>> PlanifierAsync(ApplicationUser conseiller, int prospectId, string action, DateTime jour)
    {
        await using var db = _base.NouveauContexte();
        var p = await db.Prospects.AsNoTracking().Include(x => x.Opportunites).SingleAsync(x => x.Id == prospectId);
        var saisie = new SuiviSaisie
        {
            ProspectId = "pe-" + prospectId,
            OpportuniteId = "oe-" + p.Opportunites.Single().Id,
            Action = action,
            Date = jour,
            Version = ServiceProspects.Empreinte(p),
        };
        return await NouveauService(db).PlanifierSuiviAsync(conseiller.Id, saisie);
    }

    // 1 à 6
    [Fact]
    public async Task Un_report_valide_change_l_echeance_garde_l_action_et_l_archive_reporte()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var (oppId, version) = await SuiviAfficheAsync(id);
        var debut = DateTime.UtcNow.AddSeconds(-5);

        var resultat = await ReporterAsync(conseiller, oppId, version, DateTime.Today.AddDays(9));

        Assert.True(resultat.Succes, resultat.PremierMessage);
        Assert.True(resultat.Valeur);
        var o = (await LireAsync(id)).Opportunites.Single();
        Assert.Equal(Action, o.ProchaineAction);             // la même action reste à faire
        Assert.Equal(Jour(9), o.DateProchaineAction);        // nouvelle échéance persistée (même convention à 9 h)
        var h = Assert.Single(o.HistoriqueSuivis);
        Assert.Equal(ClotureSuivi.Reporte, h.Cloture);       // ni réalisé, ni remplacé
        Assert.Equal(Action, h.Action);
        Assert.Equal(Jour(2), h.DatePrevue);                 // ancienne date
        Assert.Equal(Jour(9), h.NouvelleDatePrevue);         // nouvelle date
        Assert.Equal(conseiller.Id, h.AuteurId);
        Assert.InRange(h.DateCloture, debut, DateTime.UtcNow.AddSeconds(5));

        // La fiche reçoit un événement « suivi-reporte » et le suivi courant porte une nouvelle version.
        await using var db = _base.NouveauContexte();
        var fiche = await NouveauService(db).ObtenirAsync(new UserSummaryViewModel { Id = conseiller.Id, FullName = conseiller.FullName });
        var evenement = Assert.Single(fiche.Interactions, i => i.ProspectId == "pe-" + id && i.Type.StartsWith("suivi-"));
        Assert.Equal("suivi-reporte", evenement.Type);
        Assert.Contains("l'action reste à faire", evenement.Resume);
        Assert.NotEqual(version, fiche.Opportunites.Single(x => x.Id == oppId).VersionSuivi);
    }

    // 7
    [Fact]
    public async Task Une_date_inchangee_ne_cree_aucun_faux_report()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var (oppId, version) = await SuiviAfficheAsync(id);

        var resultat = await ReporterAsync(conseiller, oppId, version, DateTime.Today.AddDays(2).AddHours(17)); // même jour, autre heure

        Assert.False(resultat.Succes);
        Assert.Equal("date", resultat.Erreurs.Single().Champ);
        var o = (await LireAsync(id)).Opportunites.Single();
        Assert.Equal(Jour(2), o.DateProchaineAction);
        Assert.Empty(o.HistoriqueSuivis);
    }

    // 8 et règle de date : absente, avant la veille du serveur. La veille, aujourd'hui et le futur sont acceptés.
    [Theory]
    [InlineData(null, false)]
    [InlineData(-2, false)]
    [InlineData(-30, false)]
    [InlineData(-1, true)]
    [InlineData(0, true)]
    [InlineData(30, true)]
    public async Task La_nouvelle_date_suit_la_regle_commune_des_jours(int? decalage, bool accepte)
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var (oppId, version) = await SuiviAfficheAsync(id);
        DateTime? jour = decalage is null ? null : DateTime.Today.AddDays(decalage.Value);

        var resultat = await ReporterAsync(conseiller, oppId, version, jour);

        Assert.Equal(accepte, resultat.Succes);
        Assert.Equal(accepte, ServiceProspects.ErreursDeReport(jour).Count == 0);
        var o = (await LireAsync(id)).Opportunites.Single();
        Assert.Equal(accepte ? 1 : 0, o.HistoriqueSuivis.Count);
        Assert.Equal(accepte ? Jour(decalage!.Value) : Jour(2), o.DateProchaineAction);
    }

    // Suivi déjà en retard : reportable, à aujourd'hui comme plus tard.
    [Fact]
    public async Task Un_suivi_en_retard_peut_etre_reporte_a_aujourd_hui()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        await using (var db = _base.NouveauContexte())
        {
            var opp = await db.OpportunitesVente.SingleAsync(x => x.ProspectId == id);
            opp.DateProchaineAction = Jour(-6);
            await db.SaveChangesAsync();
        }
        var (oppId, version) = await SuiviAfficheAsync(id);

        Assert.True((await ReporterAsync(conseiller, oppId, version, DateTime.Today)).Succes);

        var o = (await LireAsync(id)).Opportunites.Single();
        Assert.Equal(Jour(0), o.DateProchaineAction);
        Assert.Equal(Jour(-6), Assert.Single(o.HistoriqueSuivis).DatePrevue);
    }

    // 9
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("oe-0")]
    [InlineData("oe-999999999")]
    [InlineData("pe-1")]
    [InlineData("oe-abc")]
    public async Task Un_suivi_inexistant_ou_un_id_invalide_donne_introuvable(string? oppId)
    {
        var conseiller = await _base.CreerConseillerAsync();

        Assert.True((await ReporterAsync(conseiller, oppId, "x", DateTime.Today.AddDays(3))).Introuvable);
    }

    [Fact]
    public async Task Sans_suivi_actif_rien_n_est_reporte()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller, avecSuivi: false);
        var (oppId, version) = await SuiviAfficheAsync(id);

        var resultat = await ReporterAsync(conseiller, oppId, version, DateTime.Today.AddDays(3));

        Assert.False(resultat.Succes);
        Assert.Contains("aucun suivi actif", resultat.PremierMessage);
        Assert.Empty((await LireAsync(id)).Opportunites.Single().HistoriqueSuivis);
    }

    // 10 : un report périmé ne recrée jamais une action terminée.
    [Fact]
    public async Task Un_suivi_deja_realise_ne_peut_plus_etre_reporte()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var (oppId, version) = await SuiviAfficheAsync(id);
        Assert.True((await RealiserAsync(conseiller, oppId, version)).Succes);

        var resultat = await ReporterAsync(conseiller, oppId, version, DateTime.Today.AddDays(5));

        Assert.False(resultat.Succes);
        Assert.Contains("changé entre-temps", resultat.PremierMessage);
        var o = (await LireAsync(id)).Opportunites.Single();
        Assert.Null(o.ProchaineAction);
        Assert.Equal(ClotureSuivi.Realise, Assert.Single(o.HistoriqueSuivis).Cloture);
    }

    // 11
    [Fact]
    public async Task Un_suivi_remplace_ne_peut_plus_etre_reporte_et_la_nouvelle_action_reste()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var (oppId, version) = await SuiviAfficheAsync(id);
        Assert.True((await PlanifierAsync(conseiller, id, "Nouvelle action", DateTime.Today.AddDays(4))).Succes);

        var resultat = await ReporterAsync(conseiller, oppId, version, DateTime.Today.AddDays(8));

        Assert.False(resultat.Succes);
        var o = (await LireAsync(id)).Opportunites.Single();
        Assert.Equal("Nouvelle action", o.ProchaineAction);
        Assert.Equal(Jour(4), o.DateProchaineAction);
        Assert.Equal(ClotureSuivi.Remplace, Assert.Single(o.HistoriqueSuivis).Cloture);
    }

    // Sémantique : la planification qui ne change que la date est un report ; celle qui change l'action, un remplacement.
    [Fact]
    public async Task Planifier_la_meme_action_a_une_autre_date_est_un_report_pas_un_remplacement()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);

        Assert.True((await PlanifierAsync(conseiller, id, Action, DateTime.Today.AddDays(6))).Succes);

        var o = (await LireAsync(id)).Opportunites.Single();
        var h = Assert.Single(o.HistoriqueSuivis);
        Assert.Equal(ClotureSuivi.Reporte, h.Cloture);
        Assert.Equal(Jour(2), h.DatePrevue);
        Assert.Equal(Jour(6), h.NouvelleDatePrevue);
        Assert.Equal(Action, o.ProchaineAction);
    }

    // 12 : report contre réalisation simultanée, un seul passe ; jamais une action terminée recréée.
    [Fact]
    public async Task Reporter_et_realiser_en_meme_temps_un_seul_passe()
    {
        var conseiller = await _base.CreerConseillerAsync();
        for (int essai = 0; essai < 5; essai++)
        {
            int id = await CreerProspectAsync(conseiller);
            var (oppId, version) = await SuiviAfficheAsync(id);

            var resultats = await Task.WhenAll(ReporterAsync(conseiller, oppId, version, DateTime.Today.AddDays(7)), RealiserAsync(conseiller, oppId, version));

            Assert.Equal(1, resultats.Count(r => r.Succes && r.Valeur));
            var o = (await LireAsync(id)).Opportunites.Single();
            var h = Assert.Single(o.HistoriqueSuivis);
            if (h.Cloture == ClotureSuivi.Realise)
                Assert.Null(o.ProchaineAction);                // réalisé d'abord : le report a été refusé
            else
                Assert.Equal(Jour(7), o.DateProchaineAction);  // reporté d'abord : la réalisation a été refusée
        }
    }

    // 13
    [Fact]
    public async Task Deux_reports_differents_simultanes_un_seul_passe()
    {
        var conseiller = await _base.CreerConseillerAsync();
        for (int essai = 0; essai < 5; essai++)
        {
            int id = await CreerProspectAsync(conseiller);
            var (oppId, version) = await SuiviAfficheAsync(id);

            var resultats = await Task.WhenAll(ReporterAsync(conseiller, oppId, version, DateTime.Today.AddDays(5)), ReporterAsync(conseiller, oppId, version, DateTime.Today.AddDays(10)));

            Assert.Equal(1, resultats.Count(r => r.Succes));
            var o = (await LireAsync(id)).Opportunites.Single();
            var h = Assert.Single(o.HistoriqueSuivis);
            Assert.Equal(h.NouvelleDatePrevue, o.DateProchaineAction); // la date en base est celle du report gagnant
        }
    }

    // 14 : double soumission, ensemble ou l'une après l'autre ; puis réessai après rechargement.
    [Fact]
    public async Task Un_double_envoi_ne_cree_qu_un_evenement_et_un_reessai_apres_rechargement_passe()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var (oppId, version) = await SuiviAfficheAsync(id);

        var simultanes = await Task.WhenAll(ReporterAsync(conseiller, oppId, version, DateTime.Today.AddDays(5)), ReporterAsync(conseiller, oppId, version, DateTime.Today.AddDays(5)));
        var apres = await ReporterAsync(conseiller, oppId, version, DateTime.Today.AddDays(5));

        Assert.All(simultanes, r => Assert.True(r.Succes, r.PremierMessage));
        Assert.Equal(1, simultanes.Count(r => r.Valeur));
        Assert.True(apres.Succes);
        Assert.False(apres.Valeur);                            // reconnu : « déjà reporté à cette date »
        Assert.Single((await LireAsync(id)).Opportunites.Single().HistoriqueSuivis);

        // L'ancienne page ne peut pas reporter à une autre date ; après rechargement (nouvelle version), oui.
        Assert.False((await ReporterAsync(conseiller, oppId, version, DateTime.Today.AddDays(12))).Succes);
        var (_, nouvelleVersion) = await SuiviAfficheAsync(id);
        Assert.True((await ReporterAsync(conseiller, oppId, nouvelleVersion, DateTime.Today.AddDays(12))).Valeur);
        var o = (await LireAsync(id)).Opportunites.Single();
        Assert.Equal(Jour(12), o.DateProchaineAction);
        Assert.Equal(2, o.HistoriqueSuivis.Count(h => h.Cloture == ClotureSuivi.Reporte));
    }

    // 15 et 16
    [Fact]
    public async Task Les_notes_l_etape_et_le_contact_sont_preserves()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        await using (var db = _base.NouveauContexte())
        {
            Assert.True((await NouveauService(db).AjouterNoteAsync(conseiller.Id, new NoteSaisie { ProspectId = "pe-" + id, Type = "note", Resume = "Note conservée", Jeton = "r1" })).Succes);
            var p = await db.Prospects.AsNoTracking().Include(x => x.Opportunites).SingleAsync(x => x.Id == id);
            Assert.True((await NouveauService(db).ChangerEtapeAsync(conseiller.Id, "oe-" + p.Opportunites.Single().Id, "Negociation", ServiceProspects.Empreinte(p))).Succes);
        }
        var avant = await LireAsync(id);
        var (oppId, version) = await SuiviAfficheAsync(id);

        Assert.True((await ReporterAsync(conseiller, oppId, version, DateTime.Today.AddDays(4))).Succes);

        var apres = await LireAsync(id);
        Assert.Equal("Note conservée", Assert.Single(apres.Notes).Contenu);
        var o = apres.Opportunites.Single();
        Assert.Equal(EtapeVente.Negociation, o.Etape);
        Assert.Single(o.HistoriqueEtapes);
        Assert.Equal(avant.Courriel, apres.Courriel);
        Assert.Equal(avant.Opportunites.Single().Titre, o.Titre);
    }

    // 17 et 18
    [Fact]
    public async Task Une_autre_concession_ou_un_autre_conseiller_ne_peut_pas_reporter()
    {
        var proprietaire = await _base.CreerConseillerAsync();
        var ailleurs = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(proprietaire);
        var collegue = new ApplicationUser
        {
            UserName = "collegue.report." + id + "@exemple.test",
            Email = "collegue.report." + id + "@exemple.test",
            FirstName = "Collegue",
            LastName = "Meme",
            DealershipId = proprietaire.DealershipId,
        };
        await using (var db = _base.NouveauContexte())
        {
            db.Users.Add(collegue);
            await db.SaveChangesAsync();
        }
        var (oppId, version) = await SuiviAfficheAsync(id);

        Assert.True((await ReporterAsync(ailleurs, oppId, version, DateTime.Today.AddDays(5))).Introuvable);
        Assert.True((await ReporterAsync(collegue, oppId, version, DateTime.Today.AddDays(5))).Introuvable);
        var o = (await LireAsync(id)).Opportunites.Single();
        Assert.Equal(Jour(2), o.DateProchaineAction);
        Assert.Empty(o.HistoriqueSuivis);
    }

    // 19 et 20 : la date et l'événement sont écrits ensemble, ou pas du tout.
    [Fact]
    public async Task Une_panne_ne_change_ni_la_date_ni_l_historique()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var (oppId, version) = await SuiviAfficheAsync(id);

        var resultat = await ReporterAsync(conseiller, oppId, version, DateTime.Today.AddDays(5), new PanneEnregistrement());

        Assert.False(resultat.Succes);
        Assert.Contains("échoué", resultat.PremierMessage);
        var o = (await LireAsync(id)).Opportunites.Single();
        Assert.Equal(Action, o.ProchaineAction);
        Assert.Equal(Jour(2), o.DateProchaineAction);
        Assert.Empty(o.HistoriqueSuivis);
    }
}
