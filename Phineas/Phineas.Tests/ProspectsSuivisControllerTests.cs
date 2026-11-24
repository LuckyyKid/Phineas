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

// Chaîne complète du suivi : HTTP → ProspectsController.PlanifierSuivi (ou AjouterNote) → ServiceProspects → MySQL de test.
public class ProspectsSuivisControllerTests : IClassFixture<ApplicationDeTest>
{
    private const string Sophie = "sophie.gagnon@autoprestige.example"; // conseillère, Auto Prestige Brossard
    private const string Luc = "luc.bergeron@autoprestige.example"; // mécanicien

    private readonly ApplicationDeTest _app;

    public ProspectsSuivisControllerTests(ApplicationDeTest app)
    {
        _app = app;
    }

    private static string Unique() => Guid.NewGuid().ToString("N").Substring(0, 8);

    private static string Jour(int decalage) => DateTime.Today.AddDays(decalage).ToString("yyyy-MM-dd");

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

    private async Task<Prospect> CreerAsync(HttpClient client, string nom)
    {
        string courriel = nom.ToLowerInvariant() + "@exemple.test";
        var champs = new Dictionary<string, string>
        {
            ["prenom"] = "Tom",
            ["nom"] = nom,
            ["courriel"] = courriel,
            ["contactPrefere"] = "courriel",
            ["source"] = "appel",
            ["modele"] = "Toyota Corolla",
            ["conseillerId"] = "moi",
            ["etape"] = "Qualifie",
            ["prochaineAction"] = "Rappeler",
            ["dateSuivi"] = Jour(2),
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Prospects"),
        };
        Assert.Equal(HttpStatusCode.Redirect, (await client.PostAsync("/Prospects/Creer", new FormUrlEncodedContent(champs))).StatusCode);
        using var scope = _app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        int id = await db.Prospects.Where(p => p.Courriel == courriel).Select(p => p.Id).SingleAsync();
        return await LireAsync(id);
    }

    // Champs tels que la fenêtre « Planifier un suivi » les envoie.
    private static Dictionary<string, string> Suivi(Prospect p, string action, string date, string jeton) =>
        new()
        {
            ["prospectId"] = "pe-" + p.Id,
            ["opportuniteId"] = "oe-" + p.Opportunites.Single().Id,
            ["action"] = action,
            ["date"] = date,
            ["version"] = ServiceProspects.Empreinte(p),
            ["__RequestVerificationToken"] = jeton,
        };

    private static Task<HttpResponseMessage> EnvoyerAsync(HttpClient client, Dictionary<string, string> champs) =>
        client.PostAsync("/Prospects/PlanifierSuivi", new FormUrlEncodedContent(champs));

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
    public async Task Un_suivi_valide_est_enregistre_et_relu_sur_la_fiche()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Suivi" + Unique());

        var envoi = await EnvoyerAsync(client, Suivi(p, "Envoyer la soumission", Jour(6), await JetonAsync(client, "/Prospects/Fiche/pe-" + p.Id)));

        Assert.Equal(HttpStatusCode.Redirect, envoi.StatusCode);
        Assert.Equal("/Prospects/Fiche/pe-" + p.Id, envoi.Headers.Location!.ToString());
        var o = (await LireAsync(p.Id)).Opportunites.Single();
        Assert.Equal("Envoyer la soumission", o.ProchaineAction);
        Assert.Equal(DateTime.Today.AddDays(6).AddHours(9), o.DateProchaineAction);
        Assert.Equal(EtapeVente.Qualifie, o.Etape);
        Assert.Equal("Toyota Corolla", o.Titre);

        string fiche = await client.GetStringAsync("/Prospects/Fiche/pe-" + p.Id);
        Assert.Contains("\"prochaineAction\":\"Envoyer la soumission\"", fiche);
        Assert.Contains("\"dateProchaineAction\":\"" + DateTime.Today.AddDays(6).ToString("yyyy-MM-dd") + "T09:00:00\"", fiche);
        Assert.DoesNotContain("\"confirmation\":null", fiche);
    }

    [Theory]
    [InlineData("", "2030-01-15", "action")]
    [InlineData("Rappeler", "", "date")]
    [InlineData("Rappeler", "pas-une-date", "date")]
    [InlineData("Rappeler", "2000-01-01", "date")]
    public async Task Un_suivi_invalide_rouvre_la_fenetre_sans_rien_changer(string action, string date, string champ)
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Invalide" + Unique());

        var envoi = await EnvoyerAsync(client, Suivi(p, action, date, await JetonAsync(client, "/Prospects")));
        string page = await envoi.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, envoi.StatusCode);
        Assert.Contains("\"suivi\":{\"saisie\":", page);
        Assert.Contains("\"champ\":\"" + champ + "\"", page);
        Assert.Contains("\"confirmation\":null", page);
        Assert.Equal("Rappeler", (await LireAsync(p.Id)).Opportunites.Single().ProchaineAction);
        Assert.Equal(DateTime.Today.AddDays(2).AddHours(9), (await LireAsync(p.Id)).Opportunites.Single().DateProchaineAction);
    }

    [Fact]
    public async Task Sans_champ_action_la_valeur_de_route_n_est_jamais_enregistree()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Route" + Unique());
        var champs = Suivi(p, "x", Jour(3), await JetonAsync(client, "/Prospects"));
        champs.Remove("action"); // la route contient aussi « action » = PlanifierSuivi

        var envoi = await EnvoyerAsync(client, champs);

        Assert.Equal(HttpStatusCode.OK, envoi.StatusCode);
        Assert.Contains("\"champ\":\"action\"", await envoi.Content.ReadAsStringAsync());
        Assert.Equal("Rappeler", (await LireAsync(p.Id)).Opportunites.Single().ProchaineAction);
    }

    [Fact]
    public async Task Sans_jeton_antiforgery_le_suivi_est_rejete()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Jeton" + Unique());
        var champs = Suivi(p, "Sans jeton", Jour(3), "");
        champs.Remove("__RequestVerificationToken");

        var envoi = await EnvoyerAsync(client, champs);

        Assert.Equal(HttpStatusCode.BadRequest, envoi.StatusCode);
        Assert.Equal("Rappeler", (await LireAsync(p.Id)).Opportunites.Single().ProchaineAction);
    }

    [Fact]
    public async Task Un_mecanicien_ou_un_anonyme_est_refuse_par_l_autorisation()
    {
        var sophie = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(sophie, "Acces" + Unique());
        var luc = await _app.ConnecterAsync(Luc);
        var anonyme = _app.NouveauClient();

        var envoiLuc = await EnvoyerAsync(luc, Suivi(p, "Suivi mécanicien", Jour(3), await JetonAsync(luc, "/Mecanicien")));
        var envoiAnonyme = await EnvoyerAsync(anonyme, Suivi(p, "Suivi anonyme", Jour(3), await JetonAsync(anonyme, "/Account/Login")));

        Assert.Equal(HttpStatusCode.Redirect, envoiLuc.StatusCode);
        Assert.Equal("/Account/AccessDenied", new Uri(new Uri("http://localhost"), envoiLuc.Headers.Location!).AbsolutePath);
        Assert.Contains("/Account/Login", envoiAnonyme.Headers.Location!.ToString());
        Assert.Equal("Rappeler", (await LireAsync(p.Id)).Opportunites.Single().ProchaineAction);
    }

    [Fact]
    public async Task Une_autre_concession_et_un_autre_conseiller_sont_refuses()
    {
        var sophie = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(sophie, "Isole" + Unique());
        var ailleurs = await CreerConseillerAsync(null);
        var collegue = await CreerConseillerAsync(p.DealershipId);

        var envoiAilleurs = await EnvoyerAsync(ailleurs, Suivi(p, "Suivi pirate", Jour(3), await JetonAsync(ailleurs, "/Prospects")));
        var envoiCollegue = await EnvoyerAsync(collegue, Suivi(p, "Suivi du collègue", Jour(3), await JetonAsync(collegue, "/Prospects")));

        Assert.Equal(HttpStatusCode.NotFound, envoiAilleurs.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, envoiCollegue.StatusCode);
        Assert.DoesNotContain(p.Nom, await envoiAilleurs.Content.ReadAsStringAsync());
        Assert.Equal("Rappeler", (await LireAsync(p.Id)).Opportunites.Single().ProchaineAction);
    }

    [Fact]
    public async Task Un_double_envoi_est_reconnu_et_une_page_perimee_est_refusee()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Concurrence" + Unique());
        string jeton = await JetonAsync(client, "/Prospects");
        var premier = Suivi(p, "Premier suivi", Jour(3), jeton);
        var autre = Suivi(p, "Autre suivi", Jour(4), jeton); // ouvert sur la même version de la page

        var envoi1 = await EnvoyerAsync(client, premier);
        await client.GetStringAsync(envoi1.Headers.Location!.ToString());
        var envoi2 = await EnvoyerAsync(client, premier); // double envoi identique
        string page2 = await client.GetStringAsync(envoi2.Headers.Location!.ToString());
        var envoi3 = await EnvoyerAsync(client, autre);   // conflit
        string page3 = await envoi3.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Redirect, envoi2.StatusCode);
        Assert.Contains("d\\u00E9j\\u00E0 planifi\\u00E9", page2);
        Assert.Equal(HttpStatusCode.OK, envoi3.StatusCode);
        Assert.Contains("entre-temps", page3);
        Assert.Equal("Premier suivi", (await LireAsync(p.Id)).Opportunites.Single().ProchaineAction);
    }

    [Fact]
    public async Task Une_note_avec_suivi_enregistre_les_deux_et_s_affiche_dans_la_fiche()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "NoteSuivi" + Unique());
        var champs = new Dictionary<string, string>
        {
            ["prospectId"] = "pe-" + p.Id,
            ["jeton"] = Guid.NewGuid().ToString("N"),
            ["version"] = ServiceProspects.Empreinte(p),
            ["type"] = "visite",
            ["opportuniteId"] = "oe-" + p.Opportunites.Single().Id,
            ["resume"] = "Visite en concession : a essayé la Corolla.",
            ["prochaineAction"] = "Envoyer l'offre de financement",
            ["date"] = Jour(5),
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Prospects"),
        };

        var envoi = await client.PostAsync("/Prospects/AjouterNote", new FormUrlEncodedContent(champs));

        Assert.Equal(HttpStatusCode.Redirect, envoi.StatusCode);
        var apres = await LireAsync(p.Id);
        Assert.Equal("Visite en concession : a essayé la Corolla.", Assert.Single(apres.Notes).Contenu);
        Assert.Equal("Envoyer l'offre de financement", apres.Opportunites.Single().ProchaineAction);
        string fiche = await client.GetStringAsync("/Prospects/Fiche/pe-" + p.Id);
        Assert.Contains("\"prochaineAction\":\"Envoyer l\\u0027offre de financement\"", fiche);
    }

    [Fact]
    public async Task Une_panne_a_l_enregistrement_affiche_une_erreur_sans_rien_changer()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Panne" + Unique());
        var champs = Suivi(p, "Suivi perdu", Jour(3), await JetonAsync(client, "/Prospects"));

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
        Assert.Equal("Rappeler", (await LireAsync(p.Id)).Opportunites.Single().ProchaineAction);
    }

    [Fact]
    public async Task La_page_Mes_suivis_recoit_le_suivi_enregistre()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "MesSuivis" + Unique());
        string action = "Relancer " + Unique();
        Assert.Equal(HttpStatusCode.Redirect, (await EnvoyerAsync(client, Suivi(p, action, Jour(0), await JetonAsync(client, "/Prospects")))).StatusCode);

        string page = await client.GetStringAsync("/Intelligence/Suivis");

        // Les données de la page (prospects-store.js) contiennent l'opportunité enregistrée et son suivi du jour.
        Assert.Contains("\"id\":\"oe-" + p.Opportunites.Single().Id + "\"", page);
        Assert.Contains("\"prochaineAction\":\"" + action + "\"", page);
    }
}
