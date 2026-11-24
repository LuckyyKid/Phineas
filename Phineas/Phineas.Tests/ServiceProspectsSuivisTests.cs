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

// Planification du prochain suivi d'une opportunité enregistrée (ServiceProspects.PlanifierSuiviAsync),
// seule ou avec une note (AjouterNoteAsync). Chaque test crée son conseiller, sa concession et son prospect.
public class ServiceProspectsSuivisTests : IClassFixture<BaseMySqlDeTest>
{
    private readonly BaseMySqlDeTest _base;

    public ServiceProspectsSuivisTests(BaseMySqlDeTest baseDeTest)
    {
        _base = baseDeTest;
    }

    private static ServiceProspects NouveauService(ApplicationDbContext db) => new(db, new ServiceProspectsDemo());

    // Prospect créé avec une prochaine action « Rappeler » dans 2 jours et une note, à l'étape « Qualifié ».
    private async Task<int> CreerProspectAsync(ApplicationUser conseiller, string courriel = "jade.martel@exemple.test")
    {
        var saisie = new NouveauProspectSaisie
        {
            Prenom = "Jade",
            Nom = "Martel",
            Courriel = courriel,
            ContactPrefere = "courriel",
            Source = "site-web",
            Modele = "Hyundai Tucson",
            Commentaire = "Commentaire initial.",
            ConseillerId = ServiceProspectsDemo.IdConseillerConnecte,
            Etape = "Qualifie",
            ProchaineAction = "Rappeler",
            DateSuivi = DateTime.Today.AddDays(2),
        };
        await using var db = _base.NouveauContexte();
        var resultat = await NouveauService(db).CreerAsync(conseiller.Id, saisie);
        Assert.True(resultat.Succes, resultat.PremierMessage);
        return resultat.Valeur;
    }

    private async Task<Prospect> LireEnBaseAsync(int prospectId)
    {
        await using var db = _base.NouveauContexte();
        return await db.Prospects.AsNoTracking()
            .Include(p => p.Opportunites).ThenInclude(o => o.HistoriqueEtapes)
            .Include(p => p.Notes)
            .SingleAsync(p => p.Id == prospectId);
    }

    // Saisie de la fenêtre « Planifier un suivi », avec l'empreinte lue sur la page (sauf si fournie).
    private async Task<SuiviSaisie> SuiviAsync(int prospectId, string action, DateTime? jour, int? opportuniteId = null)
    {
        var p = await LireEnBaseAsync(prospectId);
        return new SuiviSaisie
        {
            ProspectId = "pe-" + prospectId,
            OpportuniteId = "oe-" + (opportuniteId ?? p.Opportunites.OrderBy(o => o.Id).First().Id),
            Action = action,
            Date = jour,
            Version = ServiceProspects.Empreinte(p),
        };
    }

    private async Task<ResultatService<bool>> PlanifierAsync(ApplicationUser conseiller, SuiviSaisie saisie, params IInterceptor[] intercepteurs)
    {
        await using var db = _base.NouveauContexte(intercepteurs);
        return await NouveauService(db).PlanifierSuiviAsync(conseiller.Id, saisie);
    }

    private async Task<ResultatService<bool>> AjouterNoteAsync(ApplicationUser conseiller, NoteSaisie saisie, params IInterceptor[] intercepteurs)
    {
        await using var db = _base.NouveauContexte(intercepteurs);
        return await NouveauService(db).AjouterNoteAsync(conseiller.Id, saisie);
    }

    // Formulaire « Ajouter une note » avec un suivi, sur l'opportunité principale, avec l'empreinte lue sur la page.
    private async Task<NoteSaisie> NoteAvecSuiviAsync(int prospectId, string action, DateTime? jour)
    {
        var p = await LireEnBaseAsync(prospectId);
        return new NoteSaisie
        {
            ProspectId = "pe-" + prospectId,
            OpportuniteId = "oe-" + p.Opportunites.Single().Id,
            Type = "appel",
            Resume = "Appel : souhaite un essai.",
            ProchaineAction = action,
            Date = jour,
            Jeton = Guid.NewGuid().ToString("N"),
            Version = ServiceProspects.Empreinte(p),
        };
    }

    // 1, 7, 8, 11, 12 et 13
    [Fact]
    public async Task Une_planification_valide_remplace_l_action_et_conserve_le_reste()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        Assert.True((await AjouterNoteAsync(conseiller, new NoteSaisie { ProspectId = "pe-" + id, Type = "note", Resume = "Note existante", Jeton = "n1" })).Succes);
        var avant = await LireEnBaseAsync(id);
        var jour = DateTime.Today.AddDays(5);

        var resultat = await PlanifierAsync(conseiller, await SuiviAsync(id, "  Envoyer la soumission révisée  ", jour));

        Assert.True(resultat.Succes, resultat.PremierMessage);
        Assert.True(resultat.Valeur);
        var apres = await LireEnBaseAsync(id);
        var o = apres.Opportunites.Single();
        Assert.Equal("Envoyer la soumission révisée", o.ProchaineAction);       // remplace « Rappeler »
        Assert.Equal(jour, o.DateProchaineAction!.Value.Date);                 // même jour, jamais décalé
        Assert.Equal(9, o.DateProchaineAction!.Value.Hour);                    // convention existante (depuisChampDate)
        Assert.True(o.DerniereActivite > avant.Opportunites.Single().DerniereActivite);
        // Rien d'autre ne change : étape, titre, historique, notes, contact, attribution.
        Assert.Equal(EtapeVente.Qualifie, o.Etape);
        Assert.Equal("Hyundai Tucson", o.Titre);
        Assert.Empty(o.HistoriqueEtapes);
        Assert.Equal("Note existante", Assert.Single(apres.Notes).Contenu);
        Assert.Equal(avant.Courriel, apres.Courriel);
        Assert.Equal(avant.ConseillerId, apres.ConseillerId);
        Assert.Equal(avant.DealershipId, apres.DealershipId);
        Assert.Equal("Commentaire initial.", apres.CommentaireInitial);

        // La fiche relit la nouvelle prochaine action.
        await using var db = _base.NouveauContexte();
        var donnees = await NouveauService(db).ObtenirAsync(new UserSummaryViewModel { Id = conseiller.Id, FullName = conseiller.FullName });
        var opp = Assert.Single(donnees.Opportunites, x => x.ProspectId == "pe-" + id);
        Assert.Equal("Envoyer la soumission révisée", opp.ProchaineAction);
        Assert.Equal(jour.AddHours(9), opp.DateProchaineAction);
    }

    // 2
    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public async Task Une_action_vide_est_refusee(string? action)
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);

        var resultat = await PlanifierAsync(conseiller, await SuiviAsync(id, action!, DateTime.Today.AddDays(1)));

        Assert.Contains(resultat.Erreurs, e => e.Champ == "action");
        Assert.Equal("Rappeler", (await LireEnBaseAsync(id)).Opportunites.Single().ProchaineAction);
    }

    [Fact]
    public async Task Une_action_trop_longue_est_refusee()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);

        var resultat = await PlanifierAsync(conseiller, await SuiviAsync(id, new string('a', 121), DateTime.Today.AddDays(1)));

        Assert.Contains(resultat.Erreurs, e => e.Champ == "action" && e.Message.Contains("120"));
    }

    // 3
    [Theory]
    [InlineData(null)]
    [InlineData(-2)]
    [InlineData(-30)]
    public async Task Une_date_absente_ou_passee_est_refusee(int? decalage)
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        DateTime? jour = decalage is null ? null : DateTime.Today.AddDays(decalage.Value);

        var resultat = await PlanifierAsync(conseiller, await SuiviAsync(id, "Rappeler plus tard", jour));

        Assert.Contains(resultat.Erreurs, e => e.Champ == "date");
        Assert.Equal("Rappeler", (await LireEnBaseAsync(id)).Opportunites.Single().ProchaineAction);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)] // l'« aujourd'hui » d'un utilisateur dans un fuseau en retard sur celui du serveur
    public async Task Aujourd_hui_est_accepte_y_compris_avec_un_fuseau_en_retard(int decalage)
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);

        var resultat = await PlanifierAsync(conseiller, await SuiviAsync(id, "Appeler aujourd'hui", DateTime.Today.AddDays(decalage)));

        Assert.True(resultat.Succes, resultat.PremierMessage);
    }

    // 4
    [Theory]
    [InlineData("oe-999999")]
    [InlineData("oe-abc")]
    [InlineData("pe-1")]
    [InlineData(null)]
    public async Task Une_opportunite_inexistante_ou_invalide_donne_introuvable(string? opportuniteId)
    {
        var conseiller = await _base.CreerConseillerAsync();
        var saisie = new SuiviSaisie { OpportuniteId = opportuniteId, Action = "Rappeler", Date = DateTime.Today.AddDays(1), Version = "x" };

        var resultat = await PlanifierAsync(conseiller, saisie);

        Assert.True(resultat.Introuvable);
    }

    // 5 et 6
    [Fact]
    public async Task Une_autre_concession_ou_un_autre_conseiller_ne_peut_pas_planifier()
    {
        var proprietaire = await _base.CreerConseillerAsync();
        var ailleurs = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(proprietaire);
        var collegue = new ApplicationUser
        {
            UserName = "collegue.suivi." + id + "@exemple.test",
            Email = "collegue.suivi." + id + "@exemple.test",
            FirstName = "Collegue",
            LastName = "Meme",
            DealershipId = proprietaire.DealershipId,
        };
        await using (var db = _base.NouveauContexte())
        {
            db.Users.Add(collegue);
            await db.SaveChangesAsync();
        }

        var parAilleurs = await PlanifierAsync(ailleurs, await SuiviAsync(id, "Suivi pirate", DateTime.Today.AddDays(1)));
        var parCollegue = await PlanifierAsync(collegue, await SuiviAsync(id, "Suivi du collègue", DateTime.Today.AddDays(1)));

        Assert.True(parAilleurs.Introuvable);
        Assert.True(parCollegue.Introuvable);
        Assert.Equal("Rappeler", (await LireEnBaseAsync(id)).Opportunites.Single().ProchaineAction);
    }

    // 9 et 10
    [Fact]
    public async Task Seule_l_opportunite_selectionnee_recoit_le_suivi()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        int deuxiemeId;
        // Aucun écran ne crée encore de deuxième opportunité enregistrée : on l'ajoute directement en base.
        await using (var db = _base.NouveauContexte())
        {
            var deuxieme = new OpportuniteVente { ProspectId = id, Titre = "Deuxième véhicule", Etape = EtapeVente.Nouveau, ProchaineAction = "Envoyer photos" };
            db.OpportunitesVente.Add(deuxieme);
            await db.SaveChangesAsync();
            deuxiemeId = deuxieme.Id;
        }
        var premiere = (await LireEnBaseAsync(id)).Opportunites.OrderBy(o => o.Id).First();

        var resultat = await PlanifierAsync(conseiller, await SuiviAsync(id, "Essai du deuxième véhicule", DateTime.Today.AddDays(3), deuxiemeId));

        Assert.True(resultat.Succes, resultat.PremierMessage);
        var opps = (await LireEnBaseAsync(id)).Opportunites;
        Assert.Equal("Essai du deuxième véhicule", opps.Single(o => o.Id == deuxiemeId).ProchaineAction);
        var premiereApres = opps.Single(o => o.Id == premiere.Id);
        Assert.Equal("Rappeler", premiereApres.ProchaineAction);
        Assert.Equal(premiere.DateProchaineAction, premiereApres.DateProchaineAction);
        Assert.Equal(premiere.DerniereActivite, premiereApres.DerniereActivite);
    }

    [Fact]
    public async Task Une_opportunite_cloturee_ne_recoit_pas_de_suivi()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        await using (var db = _base.NouveauContexte())
        {
            var o = await db.OpportunitesVente.SingleAsync(x => x.ProspectId == id);
            o.Etape = EtapeVente.Gagne;
            await db.SaveChangesAsync();
        }

        var resultat = await PlanifierAsync(conseiller, await SuiviAsync(id, "Rappeler", DateTime.Today.AddDays(3)));

        Assert.Contains(resultat.Erreurs, e => e.Champ == "opportuniteId");
    }

    // 14
    [Fact]
    public async Task Une_panne_de_la_base_ne_change_pas_le_suivi()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var avant = (await LireEnBaseAsync(id)).Opportunites.Single();

        var resultat = await PlanifierAsync(conseiller, await SuiviAsync(id, "Perdu dans la panne", DateTime.Today.AddDays(3)), new PanneEnregistrement());

        Assert.False(resultat.Succes);
        Assert.Contains("échoué", resultat.PremierMessage);
        var o = (await LireEnBaseAsync(id)).Opportunites.Single();
        Assert.Equal(avant.ProchaineAction, o.ProchaineAction);
        Assert.Equal(avant.DateProchaineAction, o.DateProchaineAction);
    }

    // 15
    [Fact]
    public async Task Un_double_envoi_identique_est_reconnu_sans_conflit()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var saisie = await SuiviAsync(id, "Confirmer l'essai", DateTime.Today.AddDays(4));

        var premier = await PlanifierAsync(conseiller, saisie);
        var second = await PlanifierAsync(conseiller, saisie); // même formulaire, empreinte devenue ancienne

        Assert.True(premier.Succes && premier.Valeur);
        Assert.True(second.Succes, second.PremierMessage);
        Assert.False(second.Valeur);
    }

    // 16
    [Fact]
    public async Task Un_suivi_planifie_entre_temps_n_est_pas_ecrase()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var autreOnglet = await SuiviAsync(id, "Suivi de l'autre onglet", DateTime.Today.AddDays(2));
        var monOnglet = await SuiviAsync(id, "Mon suivi", DateTime.Today.AddDays(6));

        Assert.True((await PlanifierAsync(conseiller, autreOnglet)).Succes);
        var resultat = await PlanifierAsync(conseiller, monOnglet);

        Assert.Contains("entre-temps", resultat.PremierMessage);
        Assert.Equal("Suivi de l'autre onglet", (await LireEnBaseAsync(id)).Opportunites.Single().ProchaineAction);
    }

    [Fact]
    public async Task Deux_planifications_simultanees_un_seul_passe()
    {
        var conseiller = await _base.CreerConseillerAsync();

        for (int essai = 0; essai < 5; essai++)
        {
            int id = await CreerProspectAsync(conseiller, "simultane.suivi." + essai + "@exemple.test");
            var premier = await SuiviAsync(id, "Premier " + essai, DateTime.Today.AddDays(2));
            var second = await SuiviAsync(id, "Second " + essai, DateTime.Today.AddDays(3));

            var resultats = await Task.WhenAll(PlanifierAsync(conseiller, premier), PlanifierAsync(conseiller, second));

            Assert.Equal(1, resultats.Count(r => r.Succes));
            Assert.Contains("entre-temps", resultats.Single(r => !r.Succes).PremierMessage);
            string gagnant = resultats[0].Succes ? "Premier " + essai : "Second " + essai;
            Assert.Equal(gagnant, (await LireEnBaseAsync(id)).Opportunites.Single().ProchaineAction);
        }
    }

    // 17 : note et suivi dans la même soumission
    [Fact]
    public async Task Une_note_avec_suivi_enregistre_les_deux_ensemble()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var jour = DateTime.Today.AddDays(7);

        var resultat = await AjouterNoteAsync(conseiller, await NoteAvecSuiviAsync(id, "Préparer l'essai", jour));

        Assert.True(resultat.Succes, resultat.PremierMessage);
        var p = await LireEnBaseAsync(id);
        Assert.Equal("Appel : souhaite un essai.", Assert.Single(p.Notes).Contenu);
        Assert.Equal("Préparer l'essai", p.Opportunites.Single().ProchaineAction);
        Assert.Equal(jour.AddHours(9), p.Opportunites.Single().DateProchaineAction);
    }

    [Fact]
    public async Task Une_note_avec_une_action_sans_date_retire_l_ancienne_date()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);

        var resultat = await AjouterNoteAsync(conseiller, await NoteAvecSuiviAsync(id, "Attendre son retour", null));

        Assert.True(resultat.Succes, resultat.PremierMessage);
        var o = (await LireEnBaseAsync(id)).Opportunites.Single();
        Assert.Equal("Attendre son retour", o.ProchaineAction);
        Assert.Null(o.DateProchaineAction); // même comportement que le formulaire local (prospects-store.js)
    }

    [Fact]
    public async Task Un_suivi_invalide_refuse_toute_la_soumission_y_compris_la_note()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var dateSeule = await NoteAvecSuiviAsync(id, "", DateTime.Today.AddDays(2));
        var datePassee = await NoteAvecSuiviAsync(id, "Rappeler", DateTime.Today.AddDays(-5));
        var tropLongue = await NoteAvecSuiviAsync(id, new string('x', 121), DateTime.Today.AddDays(2));

        var r1 = await AjouterNoteAsync(conseiller, dateSeule);
        var r2 = await AjouterNoteAsync(conseiller, datePassee);
        var r3 = await AjouterNoteAsync(conseiller, tropLongue);

        Assert.Contains(r1.Erreurs, e => e.Champ == "date");
        Assert.Contains(r2.Erreurs, e => e.Champ == "date");
        Assert.Contains(r3.Erreurs, e => e.Champ == "prochaineAction");
        var p = await LireEnBaseAsync(id);
        Assert.Empty(p.Notes);
        Assert.Equal("Rappeler", p.Opportunites.Single().ProchaineAction);
    }

    [Fact]
    public async Task Une_note_avec_suivi_sur_une_page_perimee_ou_en_panne_n_enregistre_rien()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var perimee = await NoteAvecSuiviAsync(id, "Suivi périmé", DateTime.Today.AddDays(2));
        var enPanne = await NoteAvecSuiviAsync(id, "Suivi en panne", DateTime.Today.AddDays(2));
        Assert.True((await PlanifierAsync(conseiller, await SuiviAsync(id, "Changé ailleurs", DateTime.Today.AddDays(1)))).Succes);
        enPanne.Version = ServiceProspects.Empreinte(await LireEnBaseAsync(id));

        var r1 = await AjouterNoteAsync(conseiller, perimee);
        var r2 = await AjouterNoteAsync(conseiller, enPanne, new PanneEnregistrement());

        Assert.Contains("entre-temps", r1.PremierMessage);
        Assert.Contains("échoué", r2.PremierMessage);
        var p = await LireEnBaseAsync(id);
        Assert.Empty(p.Notes); // aucune note sans son suivi
        Assert.Equal("Changé ailleurs", p.Opportunites.Single().ProchaineAction);
    }

    [Fact]
    public async Task Une_note_seule_ne_demande_pas_d_empreinte_et_le_double_envoi_ne_rejoue_pas_le_suivi()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var avecSuivi = await NoteAvecSuiviAsync(id, "Premier suivi", DateTime.Today.AddDays(2));

        Assert.True((await AjouterNoteAsync(conseiller, avecSuivi)).Succes);
        Assert.True((await PlanifierAsync(conseiller, await SuiviAsync(id, "Suivi plus récent", DateTime.Today.AddDays(4)))).Succes);
        var renvoi = await AjouterNoteAsync(conseiller, avecSuivi); // même formulaire renvoyé
        var noteSeule = await AjouterNoteAsync(conseiller, new NoteSaisie { ProspectId = "pe-" + id, Type = "note", Resume = "Sans suivi", Jeton = "seule", Version = "ancienne" });

        Assert.True(renvoi.Succes);
        Assert.False(renvoi.Valeur);
        Assert.True(noteSeule.Succes, noteSeule.PremierMessage);
        var p = await LireEnBaseAsync(id);
        Assert.Equal(2, p.Notes.Count);
        Assert.Equal("Suivi plus récent", p.Opportunites.Single().ProchaineAction); // le renvoi n'a pas réécrit l'ancien suivi
    }
}
