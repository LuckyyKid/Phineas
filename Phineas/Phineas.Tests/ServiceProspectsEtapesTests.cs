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

// Changement d'étape d'une opportunité enregistrée (ServiceProspects.ChangerEtapeAsync) et son historique.
// Chaque test crée son conseiller, sa concession et son prospect par CreerAsync, comme le ferait le formulaire.
public class ServiceProspectsEtapesTests : IClassFixture<BaseMySqlDeTest>
{
    private readonly BaseMySqlDeTest _base;

    public ServiceProspectsEtapesTests(BaseMySqlDeTest baseDeTest)
    {
        _base = baseDeTest;
    }

    private static ServiceProspects NouveauService(ApplicationDbContext db) => new(db, new ServiceProspectsDemo());

    // Prospect complet créé à l'étape « Nouveau » ; retourne son id en base.
    private async Task<int> CreerProspectAsync(ApplicationUser conseiller, string courriel = "sara.lee@exemple.test")
    {
        var saisie = new NouveauProspectSaisie
        {
            Prenom = "Sara",
            Nom = "Lee",
            Courriel = courriel,
            Telephone = null,
            ContactPrefere = "courriel",
            Source = "site-web",
            Categorie = "vus",
            Modele = "Mazda CX-5",
            Budget = 35000,
            Horizon = "1-3-mois",
            Commentaire = "Veut un essai.",
            ConseillerId = ServiceProspectsDemo.IdConseillerConnecte,
            Etape = "Nouveau",
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
            .SingleAsync(p => p.Id == prospectId);
    }

    private async Task<int> CompterHistoriqueAsync(int prospectId)
    {
        await using var db = _base.NouveauContexte();
        return await db.HistoriquesEtapeOpportunite.CountAsync(h => h.Opportunite!.ProspectId == prospectId);
    }

    // Changement d'étape tel que la page l'envoie : opportunité, étape demandée et empreinte lue sur la page.
    private async Task<ResultatService<bool>> ChangerAsync(ApplicationUser conseiller, int prospectId, string? etape, string? version = null, int? opportuniteId = null, params IInterceptor[] intercepteurs)
    {
        var p = await LireEnBaseAsync(prospectId);
        string id = "oe-" + (opportuniteId ?? p.Opportunites.OrderBy(o => o.Id).First().Id);
        await using var db = _base.NouveauContexte(intercepteurs);
        return await NouveauService(db).ChangerEtapeAsync(conseiller.Id, id, etape, version ?? ServiceProspects.Empreinte(p));
    }

    // 1, 10 et 11
    [Fact]
    public async Task Une_transition_valide_est_enregistree_avec_son_historique()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var avant = DateTime.UtcNow.AddSeconds(-5);

        var resultat = await ChangerAsync(conseiller, id, "Negociation");

        Assert.True(resultat.Succes, resultat.PremierMessage);
        Assert.True(resultat.Valeur);
        var o = (await LireEnBaseAsync(id)).Opportunites.Single();
        Assert.Equal(EtapeVente.Negociation, o.Etape);
        var h = Assert.Single(o.HistoriqueEtapes);
        Assert.Equal(EtapeVente.Nouveau, h.AncienneEtape);
        Assert.Equal(EtapeVente.Negociation, h.NouvelleEtape);
        Assert.Equal(conseiller.Id, h.UtilisateurId);
        Assert.InRange(h.DateHeure, avant, DateTime.UtcNow.AddSeconds(5));
    }

    [Fact]
    public async Task Les_changements_successifs_forment_un_historique_coherent_avec_l_etat()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);

        Assert.True((await ChangerAsync(conseiller, id, "Qualifie")).Succes);
        Assert.True((await ChangerAsync(conseiller, id, "Finalisation")).Succes);
        Assert.True((await ChangerAsync(conseiller, id, "Negociation")).Succes); // retour en arrière permis

        var o = (await LireEnBaseAsync(id)).Opportunites.Single();
        var historique = o.HistoriqueEtapes.OrderBy(h => h.Id).Select(h => (h.AncienneEtape, h.NouvelleEtape)).ToList();
        Assert.Equal(
            [(EtapeVente.Nouveau, EtapeVente.Qualifie), (EtapeVente.Qualifie, EtapeVente.Finalisation), (EtapeVente.Finalisation, EtapeVente.Negociation)],
            historique);
        Assert.Equal(o.Etape, historique.Last().NouvelleEtape);
    }

    [Fact]
    public async Task L_historique_apparait_dans_les_interactions_de_la_fiche()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        Assert.True((await ChangerAsync(conseiller, id, "Soumission")).Succes);

        await using var db = _base.NouveauContexte();
        var donnees = await NouveauService(db).ObtenirAsync(new UserSummaryViewModel { Id = conseiller.Id, FullName = conseiller.FullName });

        var etape = Assert.Single(donnees.Interactions, i => i.ProspectId == "pe-" + id && i.Type == "etape");
        Assert.Equal("Étape : Nouveau → Soumission.", etape.Resume);
        Assert.Equal(conseiller.FullName, etape.Auteur);
        Assert.Equal(EtapeVente.Soumission, Assert.Single(donnees.Opportunites, o => o.ProspectId == "pe-" + id).Etape);
    }

    // 2 et 15
    [Fact]
    public async Task La_cloture_comme_perdue_est_refusee_sans_rien_changer()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var avant = await LireEnBaseAsync(id);

        var resultat = await ChangerAsync(conseiller, id, "Perdu");

        Assert.False(resultat.Succes);
        Assert.Contains(resultat.Erreurs, e => e.Champ == "etape" && e.Message.Contains("motif"));
        var apres = await LireEnBaseAsync(id);
        Assert.Equal(EtapeVente.Nouveau, apres.Opportunites.Single().Etape);
        Assert.Equal(ServiceProspects.Empreinte(avant), ServiceProspects.Empreinte(apres));
        Assert.Equal(0, await CompterHistoriqueAsync(id));
    }

    [Theory]
    [InlineData("Finalisation", "Gagne", "transaction")]
    [InlineData("Negociation", "Perdu", "motif")]
    public async Task Gagne_et_Perdu_sont_refuses_depuis_une_etape_avancee_sans_rien_changer(string depart, string demandee, string explication)
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        Assert.True((await ChangerAsync(conseiller, id, depart)).Succes);
        var avant = await LireEnBaseAsync(id);

        var resultat = await ChangerAsync(conseiller, id, demandee);

        Assert.False(resultat.Succes);
        Assert.Contains(resultat.Erreurs, e => e.Champ == "etape" && e.Message.Contains(explication));
        var apres = await LireEnBaseAsync(id);
        var o = apres.Opportunites.Single();
        Assert.Equal(depart, o.Etape.ToString());
        Assert.Single(o.HistoriqueEtapes); // seulement le passage à l'étape de départ
        Assert.Equal(avant.Opportunites.Single().DerniereActivite, o.DerniereActivite);
        Assert.Equal(ServiceProspects.Empreinte(avant), ServiceProspects.Empreinte(apres));
    }

    [Fact]
    public async Task Une_opportunite_deja_gagnee_peut_revenir_en_arriere()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        // Plus aucun chemin ne mène à « Gagné » : on simule une donnée existante directement en base.
        await using (var db = _base.NouveauContexte())
        {
            var o = await db.OpportunitesVente.SingleAsync(x => x.ProspectId == id);
            o.Etape = EtapeVente.Gagne;
            await db.SaveChangesAsync();
        }

        var resultat = await ChangerAsync(conseiller, id, "Finalisation");

        Assert.True(resultat.Succes, resultat.PremierMessage);
        var h = Assert.Single((await LireEnBaseAsync(id)).Opportunites.Single().HistoriqueEtapes);
        Assert.Equal(EtapeVente.Gagne, h.AncienneEtape);
        Assert.Equal(EtapeVente.Finalisation, h.NouvelleEtape);
    }

    [Theory]
    [InlineData("AQualifier")]
    [InlineData("Qualifie")]
    [InlineData("Soumission")]
    [InlineData("EssaiRoutier")]
    [InlineData("Negociation")]
    [InlineData("Finalisation")]
    public async Task Les_etapes_ordinaires_restent_possibles(string etape)
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);

        var resultat = await ChangerAsync(conseiller, id, etape);

        Assert.True(resultat.Succes, resultat.PremierMessage);
        Assert.Equal(etape, (await LireEnBaseAsync(id)).Opportunites.Single().Etape.ToString());
    }

    // 3
    [Theory]
    [InlineData("Inconnue")]
    [InlineData("negociation")]
    [InlineData("5")]
    [InlineData("")]
    [InlineData(null)]
    public async Task Une_etape_inconnue_est_refusee(string? etape)
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);

        var resultat = await ChangerAsync(conseiller, id, etape);

        Assert.Contains(resultat.Erreurs, e => e.Champ == "etape");
        Assert.Equal(EtapeVente.Nouveau, (await LireEnBaseAsync(id)).Opportunites.Single().Etape);
        Assert.Equal(0, await CompterHistoriqueAsync(id));
    }

    // 4
    [Theory]
    [InlineData("oe-999999")]
    [InlineData("oe-abc")]
    [InlineData("pe-1")]
    [InlineData(null)]
    public async Task Une_opportunite_inexistante_ou_un_id_invalide_donne_introuvable(string? opportuniteId)
    {
        var conseiller = await _base.CreerConseillerAsync();
        await using var db = _base.NouveauContexte();

        var resultat = await NouveauService(db).ChangerEtapeAsync(conseiller.Id, opportuniteId, "Qualifie", "x");

        Assert.True(resultat.Introuvable);
    }

    // 5
    [Fact]
    public async Task Une_opportunite_d_une_autre_concession_reste_introuvable_et_intacte()
    {
        var proprietaire = await _base.CreerConseillerAsync();
        var autre = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(proprietaire);

        var resultat = await ChangerAsync(autre, id, "Negociation");

        Assert.True(resultat.Introuvable);
        Assert.Equal(EtapeVente.Nouveau, (await LireEnBaseAsync(id)).Opportunites.Single().Etape);
        Assert.Equal(0, await CompterHistoriqueAsync(id));
    }

    // 6
    [Fact]
    public async Task Un_autre_conseiller_de_la_meme_concession_ne_peut_pas_changer_l_etape()
    {
        var proprietaire = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(proprietaire);
        var collegue = new ApplicationUser
        {
            UserName = "collegue.etape." + id + "@exemple.test",
            Email = "collegue.etape." + id + "@exemple.test",
            FirstName = "Collegue",
            LastName = "Meme",
            DealershipId = proprietaire.DealershipId,
        };
        await using (var db = _base.NouveauContexte())
        {
            db.Users.Add(collegue);
            await db.SaveChangesAsync();
        }

        var resultat = await ChangerAsync(collegue, id, "Negociation");

        Assert.True(resultat.Introuvable);
        Assert.Equal(0, await CompterHistoriqueAsync(id));
    }

    // 7, 9 et titre
    [Fact]
    public async Task Le_contact_la_qualification_le_suivi_et_le_titre_sont_preserves()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var avant = await LireEnBaseAsync(id);
        var oAvant = avant.Opportunites.Single();

        Assert.True((await ChangerAsync(conseiller, id, "EssaiRoutier")).Succes);

        var apres = await LireEnBaseAsync(id);
        var oApres = apres.Opportunites.Single();
        Assert.Equal(avant.Prenom, apres.Prenom);
        Assert.Equal(avant.Courriel, apres.Courriel);
        Assert.Equal(avant.ContactPrefere, apres.ContactPrefere);
        Assert.Equal(avant.Source, apres.Source);
        Assert.Equal(avant.CommentaireInitial, apres.CommentaireInitial);
        Assert.Equal(avant.ConseillerId, apres.ConseillerId);
        Assert.Equal(avant.DealershipId, apres.DealershipId);
        Assert.Equal("Mazda CX-5", oApres.Titre);
        Assert.Equal(oAvant.Categorie, oApres.Categorie);
        Assert.Equal(oAvant.Modele, oApres.Modele);
        Assert.Equal(oAvant.BudgetTotal, oApres.BudgetTotal);
        Assert.Equal(oAvant.Horizon, oApres.Horizon);
        Assert.Equal(oAvant.ProchaineAction, oApres.ProchaineAction);
        Assert.Equal(oAvant.DateProchaineAction, oApres.DateProchaineAction);
        Assert.Equal(oAvant.DateCreation, oApres.DateCreation);
    }

    [Fact]
    public async Task Un_titre_personnalise_est_preserve()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        await using (var db = _base.NouveauContexte())
        {
            var o = await db.OpportunitesVente.SingleAsync(x => x.ProspectId == id);
            o.Titre = "Achat de flotte";
            await db.SaveChangesAsync();
        }

        Assert.True((await ChangerAsync(conseiller, id, "Finalisation")).Succes);

        Assert.Equal("Achat de flotte", (await LireEnBaseAsync(id)).Opportunites.Single().Titre);
    }

    // 8
    [Fact]
    public async Task Seule_l_opportunite_visee_change_d_etape()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        // Aucun écran ne crée encore de deuxième opportunité enregistrée : on l'ajoute directement en base.
        int deuxiemeId;
        await using (var db = _base.NouveauContexte())
        {
            var deuxieme = new OpportuniteVente { ProspectId = id, Titre = "Deuxième véhicule", Etape = EtapeVente.Qualifie, Categorie = "berline" };
            db.OpportunitesVente.Add(deuxieme);
            await db.SaveChangesAsync();
            deuxiemeId = deuxieme.Id;
        }
        var premiereId = (await LireEnBaseAsync(id)).Opportunites.OrderBy(o => o.Id).First().Id;

        var resultat = await ChangerAsync(conseiller, id, "Finalisation", opportuniteId: deuxiemeId);

        Assert.True(resultat.Succes, resultat.PremierMessage);
        var opps = (await LireEnBaseAsync(id)).Opportunites;
        var premiere = opps.Single(o => o.Id == premiereId);
        var deuxiemeApres = opps.Single(o => o.Id == deuxiemeId);
        Assert.Equal(EtapeVente.Nouveau, premiere.Etape);
        Assert.Empty(premiere.HistoriqueEtapes);
        Assert.Equal("Mazda CX-5", premiere.Titre);
        Assert.Equal(EtapeVente.Finalisation, deuxiemeApres.Etape);
        Assert.Equal("Deuxième véhicule", deuxiemeApres.Titre);
        Assert.Single(deuxiemeApres.HistoriqueEtapes);
    }

    // 12
    [Fact]
    public async Task Une_panne_a_l_enregistrement_ne_change_rien_et_n_ecrit_aucun_historique()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);

        var resultat = await ChangerAsync(conseiller, id, "Negociation", intercepteurs: new PanneEnregistrement());

        Assert.False(resultat.Succes);
        Assert.Contains("échoué", resultat.PremierMessage);
        Assert.Equal(EtapeVente.Nouveau, (await LireEnBaseAsync(id)).Opportunites.Single().Etape);
        Assert.Equal(0, await CompterHistoriqueAsync(id));
    }

    // 13
    [Fact]
    public async Task Une_page_perimee_est_refusee_sans_historique()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        string versionLue = ServiceProspects.Empreinte(await LireEnBaseAsync(id));
        Assert.True((await ChangerAsync(conseiller, id, "Qualifie")).Succes); // autre onglet

        var resultat = await ChangerAsync(conseiller, id, "Negociation", version: versionLue);
        var secondClic = await ChangerAsync(conseiller, id, "Negociation", version: versionLue);

        Assert.Contains("entre-temps", resultat.PremierMessage);
        Assert.Contains("entre-temps", secondClic.PremierMessage);
        var o = (await LireEnBaseAsync(id)).Opportunites.Single();
        Assert.Equal(EtapeVente.Qualifie, o.Etape);
        Assert.Single(o.HistoriqueEtapes); // seulement le changement de l'autre onglet
    }

    [Fact]
    public async Task Une_modification_du_contact_rend_la_page_perimee_pour_l_etape()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var p = await LireEnBaseAsync(id);
        string versionLue = ServiceProspects.Empreinte(p);
        await using (var db = _base.NouveauContexte())
        {
            var saisie = new ModificationProspectSaisie
            {
                ProspectId = "pe-" + id, Version = versionLue, Prenom = "Sarah", Nom = p.Nom, Courriel = p.Courriel,
                ContactPrefere = p.ContactPrefere, Source = p.Source, ConseillerId = "moi",
            };
            Assert.True((await NouveauService(db).ModifierAsync(conseiller.Id, saisie)).Succes);
        }

        var resultat = await ChangerAsync(conseiller, id, "Negociation", version: versionLue);

        Assert.Contains("entre-temps", resultat.PremierMessage);
        Assert.Equal("Sarah", (await LireEnBaseAsync(id)).Prenom);
        Assert.Equal(0, await CompterHistoriqueAsync(id));
    }

    [Fact]
    public async Task Deux_changements_simultanes_un_seul_passe_et_un_seul_historique()
    {
        var conseiller = await _base.CreerConseillerAsync();

        for (int essai = 0; essai < 5; essai++)
        {
            int id = await CreerProspectAsync(conseiller, "simultane." + essai + "@exemple.test");
            var p = await LireEnBaseAsync(id);
            string version = ServiceProspects.Empreinte(p);
            string oppId = "oe-" + p.Opportunites.Single().Id;

            async Task<ResultatService<bool>> Changer(string etape)
            {
                await using var db = _base.NouveauContexte();
                return await NouveauService(db).ChangerEtapeAsync(conseiller.Id, oppId, etape, version);
            }
            var resultats = await Task.WhenAll(Changer("Soumission"), Changer("Negociation"));

            Assert.Equal(1, resultats.Count(r => r.Succes));
            Assert.Contains("entre-temps", resultats.Single(r => !r.Succes).PremierMessage);
            var o = (await LireEnBaseAsync(id)).Opportunites.Single();
            var h = Assert.Single(o.HistoriqueEtapes);
            Assert.Equal(EtapeVente.Nouveau, h.AncienneEtape);
            Assert.Equal(o.Etape, h.NouvelleEtape);
        }
    }

    // 14
    [Fact]
    public async Task Choisir_l_etape_actuelle_ne_change_rien_et_n_ecrit_aucun_historique()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var avant = await LireEnBaseAsync(id);

        var resultat = await ChangerAsync(conseiller, id, "Nouveau");

        Assert.True(resultat.Succes);
        Assert.False(resultat.Valeur);
        var apres = await LireEnBaseAsync(id);
        Assert.Equal(avant.Opportunites.Single().DerniereActivite, apres.Opportunites.Single().DerniereActivite);
        Assert.Equal(0, await CompterHistoriqueAsync(id));
    }
}
