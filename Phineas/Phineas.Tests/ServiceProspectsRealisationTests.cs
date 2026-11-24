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

// Réalisation d'un suivi (ServiceProspects.RealiserSuiviAsync) et archivage des suivis remplacés
// (PlanifierSuiviAsync, AjouterNoteAsync). Chaque test crée son conseiller, sa concession et son prospect.
public class ServiceProspectsRealisationTests : IClassFixture<BaseMySqlDeTest>
{
    private readonly BaseMySqlDeTest _base;

    public ServiceProspectsRealisationTests(BaseMySqlDeTest baseDeTest)
    {
        _base = baseDeTest;
    }

    private static ServiceProspects NouveauService(ApplicationDbContext db) => new(db, new ServiceProspectsDemo());

    // Prospect créé avec la prochaine action « Appeler pour l'essai » dans 2 jours (ou sans action), à l'étape « Qualifié ».
    private async Task<int> CreerProspectAsync(ApplicationUser conseiller, bool avecSuivi = true, string? courriel = null)
    {
        var saisie = new NouveauProspectSaisie
        {
            Prenom = "Rose",
            Nom = "Tanguay",
            Courriel = courriel ?? "rose." + Guid.NewGuid().ToString("N").Substring(0, 8) + "@exemple.test",
            ContactPrefere = "courriel",
            Source = "appel",
            Modele = "Subaru Crosstrek",
            Commentaire = "Commentaire initial.",
            ConseillerId = ServiceProspectsDemo.IdConseillerConnecte,
            Etape = "Qualifie",
            ProchaineAction = avecSuivi ? "Appeler pour l'essai" : null,
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
    private async Task<(string OppId, string? Version)> SuiviAfficheAsync(int prospectId, int? opportuniteId = null)
    {
        var p = await LireAsync(prospectId);
        var o = opportuniteId is null ? p.Opportunites.OrderBy(x => x.Id).First() : p.Opportunites.Single(x => x.Id == opportuniteId);
        return ("oe-" + o.Id, ServiceProspects.EmpreinteSuivi(o.ProchaineAction, o.DateProchaineAction));
    }

    private async Task<ResultatService<bool>> RealiserAsync(ApplicationUser conseiller, string oppId, string? version, params IInterceptor[] intercepteurs)
    {
        await using var db = _base.NouveauContexte(intercepteurs);
        return await NouveauService(db).RealiserSuiviAsync(conseiller.Id, oppId, version);
    }

    private async Task<ResultatService<bool>> PlanifierAsync(ApplicationUser conseiller, int prospectId, string action, DateTime jour)
    {
        await using var db = _base.NouveauContexte();
        var p = await db.Prospects.AsNoTracking().Include(x => x.Opportunites).SingleAsync(x => x.Id == prospectId);
        var saisie = new SuiviSaisie
        {
            ProspectId = "pe-" + prospectId,
            OpportuniteId = "oe-" + p.Opportunites.OrderBy(o => o.Id).First().Id,
            Action = action,
            Date = jour,
            Version = ServiceProspects.Empreinte(p),
        };
        return await NouveauService(db).PlanifierSuiviAsync(conseiller.Id, saisie);
    }

    // 1, 8, 9, 10, 11, 17 et 18
    [Fact]
    public async Task Une_realisation_valide_archive_le_suivi_et_le_retire_des_actifs()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var avant = await LireAsync(id);
        var (oppId, version) = await SuiviAfficheAsync(id);
        var debut = DateTime.UtcNow.AddSeconds(-5);

        var resultat = await RealiserAsync(conseiller, oppId, version);

        Assert.True(resultat.Succes, resultat.PremierMessage);
        Assert.True(resultat.Valeur);
        var apres = await LireAsync(id);
        var o = apres.Opportunites.Single();
        Assert.Null(o.ProchaineAction);                      // plus parmi les suivis actifs
        Assert.Null(o.DateProchaineAction);
        var h = Assert.Single(o.HistoriqueSuivis);
        Assert.Equal(ClotureSuivi.Realise, h.Cloture);
        Assert.Equal("Appeler pour l'essai", h.Action);
        Assert.Equal(DateTime.Today.AddDays(2).AddHours(9), h.DatePrevue); // date prévue conservée
        Assert.Equal(conseiller.Id, h.AuteurId);
        Assert.InRange(h.DateCloture, debut, DateTime.UtcNow.AddSeconds(5));
        // Rien d'autre ne change.
        Assert.Equal(EtapeVente.Qualifie, o.Etape);
        Assert.Equal("Subaru Crosstrek", o.Titre);
        Assert.Equal(avant.Courriel, apres.Courriel);
        Assert.Equal(avant.Prenom, apres.Prenom);
        Assert.Equal("Commentaire initial.", apres.CommentaireInitial);

        // La fiche relit l'événement « suivi-realise ».
        await using var db = _base.NouveauContexte();
        var donnees = await NouveauService(db).ObtenirAsync(new UserSummaryViewModel { Id = conseiller.Id, FullName = conseiller.FullName });
        var evenement = Assert.Single(donnees.Interactions, i => i.ProspectId == "pe-" + id && i.Type == "suivi-realise");
        Assert.Contains("Appeler pour l'essai", evenement.Resume);
        Assert.Null(Assert.Single(donnees.Opportunites, x => x.Id == oppId).VersionSuivi);
    }

    // 2
    [Fact]
    public async Task Sans_suivi_actif_rien_n_est_realise()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller, avecSuivi: false);
        var (oppId, version) = await SuiviAfficheAsync(id);
        Assert.Null(version);

        var resultat = await RealiserAsync(conseiller, oppId, "");

        Assert.False(resultat.Succes);
        Assert.Contains("aucun suivi actif", resultat.PremierMessage);
        Assert.Empty((await LireAsync(id)).Opportunites.Single().HistoriqueSuivis);
    }

    // 3
    [Theory]
    [InlineData("oe-999999")]
    [InlineData("oe-abc")]
    [InlineData("pe-1")]
    [InlineData(null)]
    public async Task Un_suivi_inexistant_ou_un_id_invalide_donne_introuvable(string? oppId)
    {
        var conseiller = await _base.CreerConseillerAsync();

        var resultat = await RealiserAsync(conseiller, oppId!, "x");

        Assert.True(resultat.Introuvable);
    }

    // 4 et 14
    [Fact]
    public async Task Un_suivi_deja_realise_n_est_pas_realise_deux_fois()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var (oppId, version) = await SuiviAfficheAsync(id);

        var premier = await RealiserAsync(conseiller, oppId, version);
        var second = await RealiserAsync(conseiller, oppId, version); // même formulaire renvoyé

        Assert.True(premier.Succes && premier.Valeur);
        Assert.True(second.Succes, second.PremierMessage);
        Assert.False(second.Valeur);
        Assert.Single((await LireAsync(id)).Opportunites.Single().HistoriqueSuivis);
    }

    [Fact]
    public async Task Deux_realisations_simultanees_ne_creent_qu_un_evenement()
    {
        var conseiller = await _base.CreerConseillerAsync();

        for (int essai = 0; essai < 5; essai++)
        {
            int id = await CreerProspectAsync(conseiller);
            var (oppId, version) = await SuiviAfficheAsync(id);

            var resultats = await Task.WhenAll(RealiserAsync(conseiller, oppId, version), RealiserAsync(conseiller, oppId, version));

            Assert.All(resultats, r => Assert.True(r.Succes, r.PremierMessage));
            Assert.Equal(1, resultats.Count(r => r.Valeur));
            Assert.Single((await LireAsync(id)).Opportunites.Single().HistoriqueSuivis);
        }
    }

    [Fact]
    public async Task Apres_realisation_une_nouvelle_action_n_est_pas_realisee_par_un_ancien_formulaire()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var (oppId, ancienne) = await SuiviAfficheAsync(id);
        Assert.True((await RealiserAsync(conseiller, oppId, ancienne)).Succes);
        Assert.True((await PlanifierAsync(conseiller, id, "Nouvelle action", DateTime.Today.AddDays(4))).Succes);

        var renvoi = await RealiserAsync(conseiller, oppId, ancienne); // ancienne page renvoyée

        Assert.True(renvoi.Succes);
        Assert.False(renvoi.Valeur);
        var o = (await LireAsync(id)).Opportunites.Single();
        Assert.Equal("Nouvelle action", o.ProchaineAction); // la nouvelle action reste active
        Assert.Single(o.HistoriqueSuivis);                  // pas de remplacement : l'ancienne était déjà réalisée
    }

    // 5, 12, 13 et 15
    [Fact]
    public async Task Un_suivi_remplace_est_archive_remplace_et_ne_peut_plus_etre_realise()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var (oppId, versionAffichee) = await SuiviAfficheAsync(id);
        var jour = DateTime.Today.AddDays(6);

        Assert.True((await PlanifierAsync(conseiller, id, "Envoyer l'offre", jour)).Succes);
        var resultat = await RealiserAsync(conseiller, oppId, versionAffichee); // page ouverte avant le remplacement

        Assert.Contains("changé entre-temps", resultat.PremierMessage);
        var o = (await LireAsync(id)).Opportunites.Single();
        Assert.Equal("Envoyer l'offre", o.ProchaineAction);   // la nouvelle action reste active
        Assert.Equal(jour.AddHours(9), o.DateProchaineAction);
        var h = Assert.Single(o.HistoriqueSuivis);
        Assert.Equal(ClotureSuivi.Remplace, h.Cloture);       // l'ancienne : remplacée, pas réalisée
        Assert.Equal("Appeler pour l'essai", h.Action);
        Assert.Equal(DateTime.Today.AddDays(2).AddHours(9), h.DatePrevue);
        Assert.Equal(conseiller.Id, h.AuteurId);
        Assert.Equal(0, o.HistoriqueSuivis.Count(x => x.Cloture == ClotureSuivi.Realise));
    }

    [Fact]
    public async Task Une_planification_identique_ou_sur_une_opportunite_sans_action_n_archive_rien()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int sansAction = await CreerProspectAsync(conseiller, avecSuivi: false);
        int avecAction = await CreerProspectAsync(conseiller);

        Assert.True((await PlanifierAsync(conseiller, sansAction, "Première action", DateTime.Today.AddDays(1))).Succes);
        Assert.True((await PlanifierAsync(conseiller, avecAction, "Appeler pour l'essai", DateTime.Today.AddDays(2))).Succes); // identique

        Assert.Empty((await LireAsync(sansAction)).Opportunites.Single().HistoriqueSuivis);
        Assert.Empty((await LireAsync(avecAction)).Opportunites.Single().HistoriqueSuivis);
    }

    [Fact]
    public async Task Une_note_avec_un_nouveau_suivi_archive_l_ancien_comme_remplace()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var p = await LireAsync(id);
        var note = new NoteSaisie
        {
            ProspectId = "pe-" + id,
            OpportuniteId = "oe-" + p.Opportunites.Single().Id,
            Type = "appel",
            Resume = "Le client préfère la semaine prochaine.",
            ProchaineAction = "Rappeler lundi",
            Date = DateTime.Today.AddDays(5),
            Jeton = Guid.NewGuid().ToString("N"),
            Version = ServiceProspects.Empreinte(p),
        };
        await using (var db = _base.NouveauContexte())
            Assert.True((await NouveauService(db).AjouterNoteAsync(conseiller.Id, note)).Succes);

        var o = (await LireAsync(id)).Opportunites.Single();
        Assert.Equal("Rappeler lundi", o.ProchaineAction);
        var h = Assert.Single(o.HistoriqueSuivis);
        Assert.Equal(ClotureSuivi.Remplace, h.Cloture);
        Assert.Equal("Appeler pour l'essai", h.Action);
    }

    [Fact]
    public async Task Realiser_et_remplacer_en_meme_temps_un_seul_passe()
    {
        var conseiller = await _base.CreerConseillerAsync();

        for (int essai = 0; essai < 5; essai++)
        {
            int id = await CreerProspectAsync(conseiller);
            var (oppId, version) = await SuiviAfficheAsync(id);
            // Les deux formulaires sont ouverts sur la même page, avant l'un ou l'autre envoi.
            var p = await LireAsync(id);
            var remplacement = new SuiviSaisie
            {
                ProspectId = "pe-" + id, OpportuniteId = oppId, Action = "Remplacement " + essai,
                Date = DateTime.Today.AddDays(3), Version = ServiceProspects.Empreinte(p),
            };
            async Task<ResultatService<bool>> Remplacer()
            {
                await using var db = _base.NouveauContexte();
                return await NouveauService(db).PlanifierSuiviAsync(conseiller.Id, remplacement);
            }

            var resultats = await Task.WhenAll(RealiserAsync(conseiller, oppId, version), Remplacer());

            Assert.Equal(1, resultats.Count(r => r.Succes));
            var o = (await LireAsync(id)).Opportunites.Single();
            var h = Assert.Single(o.HistoriqueSuivis);
            if (resultats[0].Succes)
            {
                Assert.Equal(ClotureSuivi.Realise, h.Cloture);
                Assert.Null(o.ProchaineAction);
            }
            else
            {
                Assert.Equal(ClotureSuivi.Remplace, h.Cloture);
                Assert.Equal("Remplacement " + essai, o.ProchaineAction);
            }
        }
    }

    // 6 et 7
    [Theory]
    [InlineData(-10)] // en retard
    [InlineData(0)]   // aujourd'hui
    public async Task Un_suivi_en_retard_ou_du_jour_peut_etre_realise(int decalage)
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var prevue = DateTime.Today.AddDays(decalage).AddHours(9);
        await using (var db = _base.NouveauContexte())
        {
            var o = await db.OpportunitesVente.SingleAsync(x => x.ProspectId == id);
            o.DateProchaineAction = prevue;
            await db.SaveChangesAsync();
        }
        var (oppId, version) = await SuiviAfficheAsync(id);

        var resultat = await RealiserAsync(conseiller, oppId, version);

        Assert.True(resultat.Succes, resultat.PremierMessage);
        Assert.Equal(prevue, Assert.Single((await LireAsync(id)).Opportunites.Single().HistoriqueSuivis).DatePrevue);
    }

    // 16
    [Fact]
    public async Task Les_autres_opportunites_ne_changent_pas()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        int deuxiemeId;
        // Aucun écran ne crée encore de deuxième opportunité enregistrée : on l'ajoute directement en base.
        await using (var db = _base.NouveauContexte())
        {
            var deuxieme = new OpportuniteVente { ProspectId = id, Titre = "Deuxième véhicule", Etape = EtapeVente.Nouveau, ProchaineAction = "Envoyer photos", DateProchaineAction = DateTime.Today.AddDays(1).AddHours(9) };
            db.OpportunitesVente.Add(deuxieme);
            await db.SaveChangesAsync();
            deuxiemeId = deuxieme.Id;
        }
        var (oppId, version) = await SuiviAfficheAsync(id);

        Assert.True((await RealiserAsync(conseiller, oppId, version)).Succes);

        var deuxiemeApres = (await LireAsync(id)).Opportunites.Single(o => o.Id == deuxiemeId);
        Assert.Equal("Envoyer photos", deuxiemeApres.ProchaineAction);
        Assert.Empty(deuxiemeApres.HistoriqueSuivis);
    }

    [Fact]
    public async Task Les_notes_et_les_etapes_sont_preservees()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        await using (var db = _base.NouveauContexte())
        {
            Assert.True((await NouveauService(db).AjouterNoteAsync(conseiller.Id, new NoteSaisie { ProspectId = "pe-" + id, Type = "note", Resume = "Note conservée", Jeton = "n1" })).Succes);
            var p = await db.Prospects.AsNoTracking().Include(x => x.Opportunites).SingleAsync(x => x.Id == id);
            Assert.True((await NouveauService(db).ChangerEtapeAsync(conseiller.Id, "oe-" + p.Opportunites.Single().Id, "Negociation", ServiceProspects.Empreinte(p))).Succes);
        }
        var (oppId, version) = await SuiviAfficheAsync(id);

        Assert.True((await RealiserAsync(conseiller, oppId, version)).Succes);

        var apres = await LireAsync(id);
        Assert.Equal("Note conservée", Assert.Single(apres.Notes).Contenu);
        var o = apres.Opportunites.Single();
        Assert.Equal(EtapeVente.Negociation, o.Etape);
        Assert.Single(o.HistoriqueEtapes);
    }

    // 19 et 20
    [Fact]
    public async Task Une_autre_concession_ou_un_autre_conseiller_ne_peut_pas_realiser()
    {
        var proprietaire = await _base.CreerConseillerAsync();
        var ailleurs = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(proprietaire);
        var collegue = new ApplicationUser
        {
            UserName = "collegue.realisation." + id + "@exemple.test",
            Email = "collegue.realisation." + id + "@exemple.test",
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

        Assert.True((await RealiserAsync(ailleurs, oppId, version)).Introuvable);
        Assert.True((await RealiserAsync(collegue, oppId, version)).Introuvable);
        var o = (await LireAsync(id)).Opportunites.Single();
        Assert.Equal("Appeler pour l'essai", o.ProchaineAction);
        Assert.Empty(o.HistoriqueSuivis);
    }

    // 21 et 22
    [Fact]
    public async Task Une_panne_ne_cree_aucun_historique_et_garde_le_suivi_actif()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var (oppId, version) = await SuiviAfficheAsync(id);

        var resultat = await RealiserAsync(conseiller, oppId, version, new PanneEnregistrement());

        Assert.False(resultat.Succes);
        Assert.Contains("échoué", resultat.PremierMessage);
        var o = (await LireAsync(id)).Opportunites.Single();
        Assert.Equal("Appeler pour l'essai", o.ProchaineAction);
        Assert.Empty(o.HistoriqueSuivis);
    }
}
