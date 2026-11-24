using System.Net;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Phineas.Data;
using Phineas.Data.Seed;
using Phineas.Models.Constants;
using Phineas.Models.Entities;
using Phineas.Models.ViewModels.Conseiller;
using Phineas.Services.Conseiller;
using Phineas.Tests.Infrastructure;

namespace Phineas.Tests;

// Chaîne complète des notes : HTTP → ProspectsController.AjouterNote → ServiceProspects → EF Core → MySQL de test.
public class ProspectsNotesControllerTests : IClassFixture<ApplicationDeTest>
{
    private const string Sophie = "sophie.gagnon@autoprestige.example"; // conseillère, Auto Prestige Brossard
    private const string Luc = "luc.bergeron@autoprestige.example"; // mécanicien

    private readonly ApplicationDeTest _app;

    public ProspectsNotesControllerTests(ApplicationDeTest app)
    {
        _app = app;
    }

    private static string Unique() => Guid.NewGuid().ToString("N").Substring(0, 8);

    private static async Task<string> JetonAsync(HttpClient client, string adresse) =>
        ApplicationDeTest.JetonAntiforgery(await client.GetStringAsync(adresse));

    private async Task<Prospect> LireAsync(int id)
    {
        using var scope = _app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Prospects.AsNoTracking()
            .Include(p => p.Opportunites).ThenInclude(o => o.HistoriqueEtapes)
            .Include(p => p.Notes)
            .SingleAsync(p => p.Id == id);
    }

    // Crée un prospect par le vrai formulaire de création (fonctionnalité 01) et le relit en base.
    private async Task<Prospect> CreerAsync(HttpClient client, string nom)
    {
        string courriel = nom.ToLowerInvariant() + "@exemple.test";
        var champs = new Dictionary<string, string>
        {
            ["prenom"] = "Ana",
            ["nom"] = nom,
            ["courriel"] = courriel,
            ["contactPrefere"] = "courriel",
            ["source"] = "appel",
            ["modele"] = "Honda HR-V",
            ["conseillerId"] = "moi",
            ["etape"] = "Nouveau",
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Prospects"),
        };
        Assert.Equal(HttpStatusCode.Redirect, (await client.PostAsync("/Prospects/Creer", new FormUrlEncodedContent(champs))).StatusCode);
        using var scope = _app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        int id = await db.Prospects.Where(p => p.Courriel == courriel).Select(p => p.Id).SingleAsync();
        return await LireAsync(id);
    }

    // Champs tels que le formulaire « Ajouter une note » de la fiche les envoie.
    private static Dictionary<string, string> Note(Prospect p, string resume, string jeton, bool surOpportunite = true) =>
        new()
        {
            ["prospectId"] = "pe-" + p.Id,
            ["jeton"] = Guid.NewGuid().ToString("N"),
            ["type"] = "note",
            ["opportuniteId"] = surOpportunite ? "oe-" + p.Opportunites.Single().Id : "",
            ["resume"] = resume,
            ["prochaineAction"] = "",
            ["date"] = "",
            ["__RequestVerificationToken"] = jeton,
        };

    private static Task<HttpResponseMessage> EnvoyerAsync(HttpClient client, Dictionary<string, string> champs) =>
        client.PostAsync("/Prospects/AjouterNote", new FormUrlEncodedContent(champs));

    private async Task<HttpClient> CreerConseillerAsync(int? concessionId)
    {
        string courriel = "conseiller." + Unique() + "@exemple.test";
        using (var scope = _app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            if (concessionId is null)
            {
                var concession = new Dealership { Name = "Concession " + Unique() };
                db.Dealerships.Add(concession);
                await db.SaveChangesAsync();
                concessionId = concession.Id;
            }
            var conseiller = new ApplicationUser { UserName = courriel, Email = courriel, FirstName = "Autre", LastName = "Conseiller", DealershipId = concessionId };
            Assert.True((await users.CreateAsync(conseiller, DbSeeder.DemoPassword)).Succeeded);
            await users.AddToRoleAsync(conseiller, AppRoles.Conseiller);
        }
        return await _app.ConnecterAsync(courriel);
    }

    [Fact]
    public async Task Une_note_valide_est_enregistree_et_affichee_dans_l_historique()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Note" + Unique());

        var envoi = await EnvoyerAsync(client, Note(p, "Souhaite un essai routier samedi.", await JetonAsync(client, "/Prospects/Fiche/pe-" + p.Id)));

        Assert.Equal(HttpStatusCode.Redirect, envoi.StatusCode);
        Assert.Equal("/Prospects/Fiche/pe-" + p.Id + "#historique", envoi.Headers.Location!.ToString());
        var note = Assert.Single((await LireAsync(p.Id)).Notes);
        Assert.Equal("Souhaite un essai routier samedi.", note.Contenu);
        Assert.Equal(p.ConseillerId, note.AuteurId);

        string fiche = await client.GetStringAsync("/Prospects/Fiche/pe-" + p.Id);
        Assert.Contains("\"id\":\"ie-n" + note.Id + "\"", fiche);
        Assert.Contains("Souhaite un essai routier samedi.", fiche);
        Assert.DoesNotContain("\"confirmation\":null", fiche);
    }

    [Fact]
    public async Task Le_meme_formulaire_envoye_deux_fois_ne_cree_qu_une_note()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Double" + Unique());
        var champs = Note(p, "Envoyée deux fois", await JetonAsync(client, "/Prospects"));

        var premier = await EnvoyerAsync(client, champs);
        await client.GetStringAsync(premier.Headers.Location!.ToString());
        var second = await EnvoyerAsync(client, champs);
        string page = await client.GetStringAsync(second.Headers.Location!.ToString());

        Assert.Equal(HttpStatusCode.Redirect, second.StatusCode);
        Assert.Contains("aucun doublon", page);
        Assert.Single((await LireAsync(p.Id)).Notes);
    }

    [Theory]
    [InlineData("", "", "resume")]
    [InlineData("Avec suivi", "2030-01-15", "date")]
    [InlineData("Date illisible", "pas-une-date", "date")]
    public async Task Une_note_invalide_rouvre_le_formulaire_sans_rien_enregistrer(string resume, string date, string champ)
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Invalide" + Unique());
        var champs = Note(p, resume, await JetonAsync(client, "/Prospects"));
        champs["date"] = date;

        var envoi = await EnvoyerAsync(client, champs);
        string page = await envoi.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, envoi.StatusCode);
        Assert.Contains("\"note\":{\"saisie\":", page);
        Assert.Contains("\"champ\":\"" + champ + "\"", page);
        Assert.Contains("\"confirmation\":null", page);
        Assert.Empty((await LireAsync(p.Id)).Notes);
    }

    [Fact]
    public async Task Une_note_trop_longue_est_refusee()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Longue" + Unique());

        var envoi = await EnvoyerAsync(client, Note(p, new string('x', 601), await JetonAsync(client, "/Prospects")));

        Assert.Equal(HttpStatusCode.OK, envoi.StatusCode);
        Assert.Contains("\"champ\":\"resume\"", await envoi.Content.ReadAsStringAsync());
        Assert.Empty((await LireAsync(p.Id)).Notes);
    }

    [Fact]
    public async Task Sans_jeton_antiforgery_la_note_est_rejetee()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Jeton" + Unique());
        var champs = Note(p, "Sans jeton", "");
        champs.Remove("__RequestVerificationToken");

        var envoi = await EnvoyerAsync(client, champs);

        Assert.Equal(HttpStatusCode.BadRequest, envoi.StatusCode);
        Assert.Empty((await LireAsync(p.Id)).Notes);
    }

    [Fact]
    public async Task Un_mecanicien_avec_un_jeton_valide_est_refuse_par_l_autorisation()
    {
        var sophie = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(sophie, "Mecanicien" + Unique());
        var luc = await _app.ConnecterAsync(Luc);
        string jetonDeLuc = await JetonAsync(luc, "/Mecanicien");
        var anonyme = _app.NouveauClient();

        var envoiLuc = await EnvoyerAsync(luc, Note(p, "Note du mécanicien", jetonDeLuc));
        var envoiAnonyme = await EnvoyerAsync(anonyme, Note(p, "Note anonyme", await JetonAsync(anonyme, "/Account/Login")));

        Assert.Equal(HttpStatusCode.Redirect, envoiLuc.StatusCode);
        Assert.Equal("/Account/AccessDenied", new Uri(new Uri("http://localhost"), envoiLuc.Headers.Location!).AbsolutePath);
        Assert.Contains("/Account/Login", envoiAnonyme.Headers.Location!.ToString());
        Assert.Empty((await LireAsync(p.Id)).Notes);
    }

    [Fact]
    public async Task Une_autre_concession_et_un_autre_conseiller_ne_peuvent_pas_ecrire()
    {
        var sophie = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(sophie, "Isole" + Unique());
        var ailleurs = await CreerConseillerAsync(null);
        var collegue = await CreerConseillerAsync(p.DealershipId);

        var envoiAilleurs = await EnvoyerAsync(ailleurs, Note(p, "Note pirate", await JetonAsync(ailleurs, "/Prospects")));
        var envoiCollegue = await EnvoyerAsync(collegue, Note(p, "Note du collègue", await JetonAsync(collegue, "/Prospects")));

        Assert.Equal(HttpStatusCode.NotFound, envoiAilleurs.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, envoiCollegue.StatusCode);
        Assert.DoesNotContain(p.Nom, await envoiAilleurs.Content.ReadAsStringAsync());
        Assert.Empty((await LireAsync(p.Id)).Notes);
    }

    [Fact]
    public async Task Les_notes_et_les_changements_d_etape_cohabitent_dans_l_historique()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Historique" + Unique());
        string jeton = await JetonAsync(client, "/Prospects");
        var etape = new Dictionary<string, string>
        {
            ["opportuniteId"] = "oe-" + p.Opportunites.Single().Id,
            ["prospectId"] = "pe-" + p.Id,
            ["etape"] = "Negociation",
            ["version"] = ServiceProspects.Empreinte(p),
            ["retour"] = "fiche",
            ["__RequestVerificationToken"] = jeton,
        };
        Assert.Equal(HttpStatusCode.Redirect, (await client.PostAsync("/Prospects/ChangerEtape", new FormUrlEncodedContent(etape))).StatusCode);

        Assert.Equal(HttpStatusCode.Redirect, (await EnvoyerAsync(client, Note(p, "Note après l'étape", jeton))).StatusCode);

        var apres = await LireAsync(p.Id);
        var o = apres.Opportunites.Single();
        Assert.Equal(EtapeVente.Negociation, o.Etape); // la note ne change pas l'étape
        Assert.Single(o.HistoriqueEtapes);
        Assert.Single(apres.Notes);
        string fiche = await client.GetStringAsync("/Prospects/Fiche/pe-" + p.Id);
        Assert.Contains("\"type\":\"etape\"", fiche);
        Assert.Contains("\"type\":\"note\"", fiche);
        Assert.Contains("\"type\":\"creation\"", fiche);
    }

    [Fact]
    public async Task Une_note_contenant_du_html_est_rendue_comme_du_texte()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Html" + Unique());
        const string piege = "<img src=x onerror=alert(1)><script>window.piege=1</script>";

        Assert.Equal(HttpStatusCode.Redirect, (await EnvoyerAsync(client, Note(p, piege, await JetonAsync(client, "/Prospects")))).StatusCode);
        string fiche = await client.GetStringAsync("/Prospects/Fiche/pe-" + p.Id);

        Assert.Equal(piege, Assert.Single((await LireAsync(p.Id)).Notes).Contenu); // conservé tel quel en base
        Assert.DoesNotContain("<img src=x", fiche); // jamais injecté tel quel dans la page
        Assert.DoesNotContain("<script>window.piege", fiche);
        Assert.Contains("\\u003Cimg src=x onerror=alert(1)\\u003E", fiche); // encodé dans les données JSON
    }

    [Fact]
    public async Task Une_panne_a_l_enregistrement_affiche_une_erreur_sans_note()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Panne" + Unique());
        var champs = Note(p, "Note perdue", await JetonAsync(client, "/Prospects"));

        HttpResponseMessage envoi;
        _app.Panne.EnPanne = true;
        try
        {
            envoi = await EnvoyerAsync(client, champs);
        }
        finally
        {
            _app.Panne.EnPanne = false;
        }
        string page = await envoi.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, envoi.StatusCode);
        Assert.Contains("\\u00E9chou\\u00E9", page);
        Assert.Contains("\"confirmation\":null", page);
        Assert.Empty((await LireAsync(p.Id)).Notes);
    }

    // Correction faite avec cette fonctionnalité : une valeur illisible est refusée AVANT tout enregistrement.
    [Fact]
    public async Task Une_valeur_illisible_n_enregistre_rien_en_creation_ni_en_modification()
    {
        var client = await _app.ConnecterAsync(Sophie);
        string nom = "Illisible" + Unique();
        var creation = new Dictionary<string, string>
        {
            ["prenom"] = "Ana",
            ["nom"] = nom,
            ["courriel"] = nom.ToLowerInvariant() + "@exemple.test",
            ["contactPrefere"] = "courriel",
            ["source"] = "appel",
            ["budget"] = "beaucoup",
            ["conseillerId"] = "moi",
            ["etape"] = "Nouveau",
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Prospects"),
        };
        var p = await CreerAsync(client, "Existant" + Unique());
        var modification = new Dictionary<string, string>
        {
            ["prospectId"] = "pe-" + p.Id,
            ["opportuniteId"] = "oe-" + p.Opportunites.Single().Id,
            ["version"] = ServiceProspects.Empreinte(p),
            ["prenom"] = "Change",
            ["nom"] = p.Nom,
            ["courriel"] = p.Courriel!,
            ["contactPrefere"] = "courriel",
            ["source"] = "appel",
            ["conseillerId"] = "moi",
            ["budget"] = "beaucoup",
            ["__RequestVerificationToken"] = creation["__RequestVerificationToken"],
        };

        var envoiCreation = await client.PostAsync("/Prospects/Creer", new FormUrlEncodedContent(creation));
        var envoiModification = await client.PostAsync("/Prospects/Modifier", new FormUrlEncodedContent(modification));

        Assert.Equal(HttpStatusCode.OK, envoiCreation.StatusCode);
        Assert.Contains("\"champ\":\"budget\"", await envoiCreation.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.OK, envoiModification.StatusCode);
        using var scope = _app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        Assert.False(await db.Prospects.AnyAsync(x => x.Nom == nom));
        Assert.Equal("Ana", (await LireAsync(p.Id)).Prenom);
    }
}
