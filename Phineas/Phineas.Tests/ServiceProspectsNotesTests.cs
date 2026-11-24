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

// Ajout d'une note persistante (ServiceProspects.AjouterNoteAsync), relue comme le fait la fiche (ObtenirAsync).
// Chaque test crée son conseiller, sa concession et son prospect par CreerAsync, comme le ferait le formulaire.
public class ServiceProspectsNotesTests : IClassFixture<BaseMySqlDeTest>
{
    private readonly BaseMySqlDeTest _base;

    public ServiceProspectsNotesTests(BaseMySqlDeTest baseDeTest)
    {
        _base = baseDeTest;
    }

    private static ServiceProspects NouveauService(ApplicationDbContext db) => new(db, new ServiceProspectsDemo());

    private async Task<int> CreerProspectAsync(ApplicationUser conseiller, string courriel = "noemie.gagne@exemple.test")
    {
        var saisie = new NouveauProspectSaisie
        {
            Prenom = "Noémie",
            Nom = "Gagné",
            Courriel = courriel,
            ContactPrefere = "courriel",
            Source = "visite",
            Modele = "Kia Sportage",
            Commentaire = "Commentaire initial.",
            ConseillerId = ServiceProspectsDemo.IdConseillerConnecte,
            Etape = "Qualifie",
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

    private async Task<int> IdOpportuniteAsync(int prospectId) => (await LireEnBaseAsync(prospectId)).Opportunites.OrderBy(o => o.Id).First().Id;

    // Saisie telle que le formulaire de la fiche l'envoie (nouveau jeton à chaque formulaire affiché).
    private static NoteSaisie Note(int prospectId, string resume, int? opportuniteId = null, string type = "note") =>
        new()
        {
            ProspectId = "pe-" + prospectId,
            OpportuniteId = opportuniteId is null ? "" : "oe-" + opportuniteId,
            Type = type,
            Resume = resume,
            Jeton = Guid.NewGuid().ToString("N"),
        };

    private async Task<ResultatService<bool>> AjouterAsync(ApplicationUser conseiller, NoteSaisie saisie, params IInterceptor[] intercepteurs)
    {
        await using var db = _base.NouveauContexte(intercepteurs);
        return await NouveauService(db).AjouterNoteAsync(conseiller.Id, saisie);
    }

    // 1, 7, 8 et 9
    [Fact]
    public async Task Une_note_valide_est_enregistree_avec_son_auteur_sa_date_et_son_opportunite()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        int oppId = await IdOpportuniteAsync(id);
        var avant = DateTime.UtcNow.AddSeconds(-5);

        var resultat = await AjouterAsync(conseiller, Note(id, "A appelé pour un essai samedi.", oppId, "appel"));

        Assert.True(resultat.Succes, resultat.PremierMessage);
        Assert.True(resultat.Valeur);
        var p = await LireEnBaseAsync(id);
        var note = Assert.Single(p.Notes);
        Assert.Equal("A appelé pour un essai samedi.", note.Contenu);
        Assert.Equal("appel", note.Type);
        Assert.Equal(conseiller.Id, note.AuteurId);
        Assert.Equal(oppId, note.OpportuniteId);
        Assert.InRange(note.DateCreation, avant, DateTime.UtcNow.AddSeconds(5));
        Assert.Equal(note.DateCreation, p.Opportunites.Single().DerniereActivite); // activité de l'opportunité
        Assert.Equal("Commentaire initial.", p.CommentaireInitial); // distinct du commentaire initial

        // Relecture comme la fiche : une interaction du type choisi, avec l'auteur et le texte.
        await using var db = _base.NouveauContexte();
        var donnees = await NouveauService(db).ObtenirAsync(new UserSummaryViewModel { Id = conseiller.Id, FullName = conseiller.FullName });
        var interaction = Assert.Single(donnees.Interactions, i => i.Id == "ie-n" + note.Id);
        Assert.Equal("appel", interaction.Type);
        Assert.Equal(conseiller.FullName, interaction.Auteur);
        Assert.Equal("oe-" + oppId, interaction.OpportuniteId);
        Assert.Equal("A appelé pour un essai samedi.", interaction.Resume);
    }

    [Fact]
    public async Task Une_note_generale_n_est_liee_a_aucune_opportunite_et_ne_change_pas_l_activite()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var avant = await LireEnBaseAsync(id);

        var resultat = await AjouterAsync(conseiller, Note(id, "Préfère être contactée le soir."));

        Assert.True(resultat.Succes, resultat.PremierMessage);
        var p = await LireEnBaseAsync(id);
        Assert.Null(Assert.Single(p.Notes).OpportuniteId);
        Assert.Equal(avant.Opportunites.Single().DerniereActivite, p.Opportunites.Single().DerniereActivite);
    }

    // 2
    [Theory]
    [InlineData("")]
    [InlineData("    ")]
    [InlineData("\r\n \n\t")]
    [InlineData(null)]
    public async Task Une_note_vide_est_refusee(string? resume)
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);

        var resultat = await AjouterAsync(conseiller, Note(id, resume!));

        Assert.Contains(resultat.Erreurs, e => e.Champ == "resume");
        Assert.Empty((await LireEnBaseAsync(id)).Notes);
    }

    // 3
    [Fact]
    public async Task Une_note_trop_longue_est_refusee_et_la_limite_exacte_acceptee()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);

        var tropLongue = await AjouterAsync(conseiller, Note(id, new string('a', 601)));
        var limite = await AjouterAsync(conseiller, Note(id, new string('b', 600)));
        // 601 caractères envoyés, mais 600 une fois la fin de ligne Windows (\r\n) ramenée à \n : acceptée.
        var avecRetour = await AjouterAsync(conseiller, Note(id, new string('c', 299) + "\r\n" + new string('d', 300)));

        Assert.Contains(tropLongue.Erreurs, e => e.Champ == "resume" && e.Message.Contains("600"));
        Assert.True(limite.Succes, limite.PremierMessage);
        Assert.True(avecRetour.Succes, avecRetour.PremierMessage);
        var notes = (await LireEnBaseAsync(id)).Notes;
        Assert.Equal(2, notes.Count);
        Assert.Contains(notes, n => n.Contenu == new string('c', 299) + "\n" + new string('d', 300));
    }

    // 4
    [Theory]
    [InlineData("pe-999999")]
    [InlineData("pe-abc")]
    [InlineData("oe-1")]
    [InlineData(null)]
    public async Task Un_prospect_inexistant_ou_un_id_invalide_donne_introuvable(string? prospectId)
    {
        var conseiller = await _base.CreerConseillerAsync();
        var saisie = new NoteSaisie { ProspectId = prospectId, Type = "note", Resume = "Texte", Jeton = "j1" };

        var resultat = await AjouterAsync(conseiller, saisie);

        Assert.True(resultat.Introuvable);
    }

    // 5
    [Fact]
    public async Task Un_prospect_d_une_autre_concession_reste_introuvable_et_sans_note()
    {
        var proprietaire = await _base.CreerConseillerAsync();
        var autre = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(proprietaire);

        var resultat = await AjouterAsync(autre, Note(id, "Note pirate"));

        Assert.True(resultat.Introuvable);
        Assert.Empty((await LireEnBaseAsync(id)).Notes);
    }

    // 6
    [Fact]
    public async Task Un_autre_conseiller_de_la_meme_concession_ne_peut_pas_ecrire_de_note()
    {
        var proprietaire = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(proprietaire);
        var collegue = new ApplicationUser
        {
            UserName = "collegue.note." + id + "@exemple.test",
            Email = "collegue.note." + id + "@exemple.test",
            FirstName = "Collegue",
            LastName = "Meme",
            DealershipId = proprietaire.DealershipId,
        };
        await using (var db = _base.NouveauContexte())
        {
            db.Users.Add(collegue);
            await db.SaveChangesAsync();
        }

        var resultat = await AjouterAsync(collegue, Note(id, "Note du collègue"));

        Assert.True(resultat.Introuvable);
        Assert.Empty((await LireEnBaseAsync(id)).Notes);
    }

    // 10
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Une_opportunite_etrangere_ou_invalide_est_refusee(bool autreProspect)
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        int autreId = await CreerProspectAsync(conseiller, "autre.note@exemple.test");
        var saisie = Note(id, "Note mal rattachée");
        saisie.OpportuniteId = autreProspect ? "oe-" + await IdOpportuniteAsync(autreId) : "oe-abc";

        var resultat = await AjouterAsync(conseiller, saisie);

        Assert.Contains(resultat.Erreurs, e => e.Champ == "opportuniteId");
        Assert.Empty((await LireEnBaseAsync(id)).Notes);
        Assert.Empty((await LireEnBaseAsync(autreId)).Notes);
    }

    // 11
    [Fact]
    public async Task Une_nouvelle_note_conserve_les_precedentes()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);

        Assert.True((await AjouterAsync(conseiller, Note(id, "Première note"))).Succes);
        Assert.True((await AjouterAsync(conseiller, Note(id, "Deuxième note"))).Succes);

        var contenus = (await LireEnBaseAsync(id)).Notes.OrderBy(n => n.Id).Select(n => n.Contenu).ToList();
        Assert.Equal(["Première note", "Deuxième note"], contenus);
    }

    // 12
    [Fact]
    public async Task Une_note_ne_change_ni_l_etape_ni_le_dossier_ni_l_empreinte()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var avant = await LireEnBaseAsync(id);
        string versionLue = ServiceProspects.Empreinte(avant);

        Assert.True((await AjouterAsync(conseiller, Note(id, "Note", await IdOpportuniteAsync(id)))).Succes);

        var apres = await LireEnBaseAsync(id);
        var o = apres.Opportunites.Single();
        Assert.Equal(EtapeVente.Qualifie, o.Etape);
        Assert.Empty(o.HistoriqueEtapes);
        Assert.Equal("Kia Sportage", o.Titre);
        Assert.Equal(versionLue, ServiceProspects.Empreinte(apres));

        // Un formulaire « Modifier » ouvert avant la note reste valide, et la modification ne supprime pas la note.
        await using (var db = _base.NouveauContexte())
        {
            var saisie = new ModificationProspectSaisie
            {
                ProspectId = "pe-" + id, Version = versionLue, Prenom = "Noémie", Nom = "Gagnon", Courriel = avant.Courriel,
                ContactPrefere = avant.ContactPrefere, Source = avant.Source, ConseillerId = "moi",
            };
            Assert.True((await NouveauService(db).ModifierAsync(conseiller.Id, saisie)).Succes);
        }
        var final = await LireEnBaseAsync(id);
        Assert.Equal("Gagnon", final.Nom);
        Assert.Single(final.Notes);
    }

    // 13
    [Fact]
    public async Task Une_panne_a_l_enregistrement_donne_un_echec_sans_note()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var avant = await LireEnBaseAsync(id);

        var resultat = await AjouterAsync(conseiller, Note(id, "Note perdue", await IdOpportuniteAsync(id)), new PanneEnregistrement());

        Assert.False(resultat.Succes);
        Assert.Contains("échoué", resultat.PremierMessage);
        var apres = await LireEnBaseAsync(id);
        Assert.Empty(apres.Notes);
        Assert.Equal(avant.Opportunites.Single().DerniereActivite, apres.Opportunites.Single().DerniereActivite);
    }

    // 14
    [Fact]
    public async Task Le_meme_formulaire_envoye_deux_fois_ne_cree_qu_une_note()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var saisie = Note(id, "Envoyée deux fois");

        var premier = await AjouterAsync(conseiller, saisie);
        var second = await AjouterAsync(conseiller, saisie);

        Assert.True(premier.Succes && premier.Valeur);
        Assert.True(second.Succes);
        Assert.False(second.Valeur);
        Assert.Single((await LireEnBaseAsync(id)).Notes);
    }

    [Fact]
    public async Task Deux_envois_simultanes_du_meme_formulaire_ne_creent_qu_une_note()
    {
        var conseiller = await _base.CreerConseillerAsync();

        for (int essai = 0; essai < 5; essai++)
        {
            int id = await CreerProspectAsync(conseiller, "simultane.note." + essai + "@exemple.test");
            var saisie = Note(id, "Double clic " + essai);

            var resultats = await Task.WhenAll(AjouterAsync(conseiller, saisie), AjouterAsync(conseiller, saisie));

            Assert.All(resultats, r => Assert.True(r.Succes, r.PremierMessage));
            Assert.Equal(1, resultats.Count(r => r.Valeur));
            Assert.Single((await LireEnBaseAsync(id)).Notes);
        }
    }

    // 15
    [Fact]
    public async Task Les_caracteres_speciaux_sont_conserves_tels_quels()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        const string texte = "<script>alert('x')</script> & « guillemets » 50 % < 60 $ 😀\nDeuxième ligne : é à ç";

        Assert.True((await AjouterAsync(conseiller, Note(id, "  " + texte.Replace("\n", "\r\n") + "  "))).Succes);

        Assert.Equal(texte, Assert.Single((await LireEnBaseAsync(id)).Notes).Contenu);
    }

    [Fact]
    // Depuis la fonctionnalité 05, un suivi peut accompagner la note, mais il doit viser une opportunité :
    // « Le contact (général) » est refusé (ServiceProspectsSuivisTests couvre les suivis eux-mêmes).
    public async Task Un_suivi_sans_opportunite_un_type_inconnu_ou_un_jeton_absent_sont_refuses()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var avecSuivi = Note(id, "Avec suivi");
        avecSuivi.ProchaineAction = "Rappeler";
        avecSuivi.Date = DateTime.Today.AddDays(1);
        var typeInconnu = Note(id, "Type inconnu", type: "sms");
        var sansJeton = Note(id, "Sans jeton");
        sansJeton.Jeton = " ";

        var r1 = await AjouterAsync(conseiller, avecSuivi);
        var r2 = await AjouterAsync(conseiller, typeInconnu);
        var r3 = await AjouterAsync(conseiller, sansJeton);

        Assert.Contains(r1.Erreurs, e => e.Champ == "opportuniteId");
        Assert.Contains(r2.Erreurs, e => e.Champ == "type");
        Assert.False(r3.Succes);
        Assert.Empty((await LireEnBaseAsync(id)).Notes);
    }
    // Schéma : aucune suppression n'existe encore dans l'application, mais les clés de NotesProspect ne doivent pas la bloquer.
    [Fact]
    public async Task Les_cles_de_la_table_des_notes_ne_bloquent_aucune_suppression()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        int oppId = await IdOpportuniteAsync(id);
        Assert.True((await AjouterAsync(conseiller, Note(id, "Sur l'opportunité", oppId))).Succes);

        await using (var db = _base.NouveauContexte())
        {
            db.OpportunitesVente.Remove(await db.OpportunitesVente.SingleAsync(o => o.Id == oppId));
            await db.SaveChangesAsync();
        }
        Assert.Null(Assert.Single((await LireEnBaseAsync(id)).Notes).OpportuniteId); // la note devient générale

        await using (var db = _base.NouveauContexte())
        {
            db.Prospects.Remove(await db.Prospects.SingleAsync(p => p.Id == id));
            await db.SaveChangesAsync();
            Assert.False(await db.NotesProspect.AnyAsync(n => n.ProspectId == id));
        }
    }
}
