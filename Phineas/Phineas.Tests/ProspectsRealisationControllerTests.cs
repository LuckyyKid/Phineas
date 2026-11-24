using System.Net;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Phineas.Data;
using Phineas.Data.Seed;
using Phineas.Models.Constants;
using Phineas.Models.Entities;
using Phineas.Services.Conseiller;
using Phineas.Tests.Infrastructure;

namespace Phineas.Tests;

// Chaîne complète de « Marquer comme réalisé » : HTTP → ProspectsController.RealiserSuivi → ServiceProspects → MySQL de test,
// puis relecture par la page « Mes suivis » (IntelligenceController.Suivis) et par la fiche.
public class ProspectsRealisationControllerTests : IClassFixture<ApplicationDeTest>
{
    private const string Sophie = "sophie.gagnon@autoprestige.example"; // conseillère, Auto Prestige Brossard
    private const string Luc = "luc.bergeron@autoprestige.example"; // mécanicien

    private readonly ApplicationDeTest _app;

    public ProspectsRealisationControllerTests(ApplicationDeTest app)
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
        return await db.Prospects.AsNoTracking().Include(p => p.Opportunites).ThenInclude(o => o.HistoriqueSuivis).SingleAsync(p => p.Id == id);
    }

    // Prospect créé par le vrai formulaire, avec la prochaine action « action » dans « decalage » jours.
    private async Task<Prospect> CreerAsync(HttpClient client, string nom, string action, int decalage = 2)
    {
        string courriel = nom.ToLowerInvariant() + "@exemple.test";
        var champs = new Dictionary<string, string>
        {
            ["prenom"] = "Ugo",
            ["nom"] = nom,
            ["courriel"] = courriel,
            ["contactPrefere"] = "courriel",
            ["source"] = "appel",
            ["modele"] = "Mazda CX-30",
            ["conseillerId"] = "moi",
            ["etape"] = "Qualifie",
            ["prochaineAction"] = action,
            ["dateSuivi"] = DateTime.Today.AddDays(decalage).ToString("yyyy-MM-dd"),
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Prospects"),
        };
        Assert.Equal(HttpStatusCode.Redirect, (await client.PostAsync("/Prospects/Creer", new FormUrlEncodedContent(champs))).StatusCode);
        using var scope = _app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        int id = await db.Prospects.Where(p => p.Courriel == courriel).Select(p => p.Id).SingleAsync();
        return await LireAsync(id);
    }

    private static Dictionary<string, string> Realisation(Prospect p, string jeton, string retour = "/Intelligence/Suivis")
    {
        var o = p.Opportunites.Single();
        return new()
        {
            ["opportuniteId"] = "oe-" + o.Id,
            ["versionSuivi"] = ServiceProspects.EmpreinteSuivi(o.ProchaineAction, o.DateProchaineAction) ?? "",
            ["retour"] = retour,
            ["__RequestVerificationToken"] = jeton,
        };
    }

    private static Task<HttpResponseMessage> EnvoyerAsync(HttpClient client, Dictionary<string, string> champs) =>
        client.PostAsync("/Prospects/RealiserSuivi", new FormUrlEncodedContent(champs));

    [Fact]
    public async Task Une_realisation_est_persistee_et_la_page_Mes_suivis_affiche_la_confirmation()
    {
        var client = await _app.ConnecterAsync(Sophie);
        string action = "Appeler " + Unique();
        var p = await CreerAsync(client, "Realise" + Unique(), action, decalage: 0); // suivi du jour

        // Avant : « Mes suivis » reçoit le suivi actif et sa version.
        string avant = await client.GetStringAsync("/Intelligence/Suivis");
        Assert.Contains("\"prochaineAction\":\"" + action + "\"", avant);

        var envoi = await EnvoyerAsync(client, Realisation(p, ApplicationDeTest.JetonAntiforgery(avant)));
        Assert.Equal(HttpStatusCode.Redirect, envoi.StatusCode);
        Assert.Equal("/Intelligence/Suivis", envoi.Headers.Location!.ToString());

        string apres = await client.GetStringAsync("/Intelligence/Suivis");
        Assert.Contains("ajout\\u00E9 \\u00E0 l\\u0027historique", apres);       // confirmation réelle
        Assert.DoesNotContain("\"prochaineAction\":\"" + action + "\"", apres);    // plus un suivi actif
        var o = (await LireAsync(p.Id)).Opportunites.Single();
        Assert.Null(o.ProchaineAction);
        var h = Assert.Single(o.HistoriqueSuivis);
        Assert.Equal(ClotureSuivi.Realise, h.Cloture);
        Assert.Equal(action, h.Action);

        // La fiche affiche l'événement de réalisation, après actualisation aussi.
        var types = TypesEvenements(await client.GetStringAsync("/Prospects/Fiche/pe-" + p.Id), p.Id);
        Assert.Contains("suivi-realise", types);
    }

    [Fact]
    public async Task Un_suivi_en_retard_peut_etre_realise()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Retard" + Unique(), "Relance en retard");
        using (var scope = _app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var o = await db.OpportunitesVente.SingleAsync(x => x.ProspectId == p.Id);
            o.DateProchaineAction = DateTime.Today.AddDays(-8).AddHours(9);
            await db.SaveChangesAsync();
        }
        p = await LireAsync(p.Id);

        var envoi = await EnvoyerAsync(client, Realisation(p, await JetonAsync(client, "/Intelligence/Suivis")));

        Assert.Equal(HttpStatusCode.Redirect, envoi.StatusCode);
        Assert.Equal(ClotureSuivi.Realise, Assert.Single((await LireAsync(p.Id)).Opportunites.Single().HistoriqueSuivis).Cloture);
    }

    [Fact]
    public async Task Un_double_envoi_n_ajoute_qu_un_evenement()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Double" + Unique(), "Double clic");
        var champs = Realisation(p, await JetonAsync(client, "/Intelligence/Suivis"));

        var premier = await EnvoyerAsync(client, champs);
        await client.GetStringAsync(premier.Headers.Location!.ToString());
        var second = await EnvoyerAsync(client, champs);
        string page = await client.GetStringAsync(second.Headers.Location!.ToString());

        Assert.Contains("d\\u00E9j\\u00E0 marqu\\u00E9 comme r\\u00E9alis\\u00E9", page);
        Assert.Single((await LireAsync(p.Id)).Opportunites.Single().HistoriqueSuivis);
    }

    [Fact]
    public async Task Un_remplacement_est_archive_et_une_ancienne_page_ne_realise_pas_la_nouvelle_action()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Remplace" + Unique(), "Ancienne action");
        string jeton = await JetonAsync(client, "/Prospects/Fiche/pe-" + p.Id);
        var anciennePage = Realisation(p, jeton);
        var planification = new Dictionary<string, string>
        {
            ["prospectId"] = "pe-" + p.Id,
            ["opportuniteId"] = "oe-" + p.Opportunites.Single().Id,
            ["action"] = "Nouvelle action",
            ["date"] = DateTime.Today.AddDays(5).ToString("yyyy-MM-dd"),
            ["version"] = ServiceProspects.Empreinte(p),
            ["__RequestVerificationToken"] = jeton,
        };
        var remplacement = await client.PostAsync("/Prospects/PlanifierSuivi", new FormUrlEncodedContent(planification));
        await client.GetStringAsync(remplacement.Headers.Location!.ToString());

        var envoi = await EnvoyerAsync(client, anciennePage);
        string page = await client.GetStringAsync(envoi.Headers.Location!.ToString());

        Assert.Contains("chang\\u00E9 entre-temps", page);
        var o = (await LireAsync(p.Id)).Opportunites.Single();
        Assert.Equal("Nouvelle action", o.ProchaineAction);
        var h = Assert.Single(o.HistoriqueSuivis);
        Assert.Equal(ClotureSuivi.Remplace, h.Cloture);
        Assert.Equal("Ancienne action", h.Action);
        // Événements de CE prospect seulement : la page contient aussi les autres dossiers de la conseillère.
        var types = TypesEvenements(await client.GetStringAsync("/Prospects/Fiche/pe-" + p.Id), p.Id);
        Assert.Contains("suivi-remplace", types);
        Assert.DoesNotContain("suivi-realise", types);
    }

    // Types des événements d'historique d'un prospect, lus dans les données envoyées à prospects-store.js
    // (balise <script id="prospects-donnees">).
    private static List<string> TypesEvenements(string page, int prospectId)
    {
        int debut = page.IndexOf("id=\"prospects-donnees\">", StringComparison.Ordinal);
        Assert.True(debut >= 0, "Données du module Prospects introuvables dans la page.");
        debut = page.IndexOf('>', debut) + 1;
        int fin = page.IndexOf("</script>", debut, StringComparison.Ordinal);
        using var json = System.Text.Json.JsonDocument.Parse(page.Substring(debut, fin - debut));
        var types = new List<string>();
        foreach (var i in json.RootElement.GetProperty("donnees").GetProperty("interactions").EnumerateArray())
        {
            if (i.GetProperty("prospectId").GetString() == "pe-" + prospectId)
                types.Add(i.GetProperty("type").GetString()!);
        }
        return types;
    }

    [Fact]
    public async Task Sans_jeton_antiforgery_la_requete_est_rejetee()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Jeton" + Unique(), "Sans jeton");
        var champs = Realisation(p, "");
        champs.Remove("__RequestVerificationToken");

        var envoi = await EnvoyerAsync(client, champs);

        Assert.Equal(HttpStatusCode.BadRequest, envoi.StatusCode);
        Assert.Equal("Sans jeton", (await LireAsync(p.Id)).Opportunites.Single().ProchaineAction);
    }

    [Fact]
    public async Task Un_mecanicien_avec_un_jeton_valide_est_refuse_par_l_autorisation()
    {
        var sophie = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(sophie, "Mecanicien" + Unique(), "Suivi protégé");
        var luc = await _app.ConnecterAsync(Luc);

        var envoi = await EnvoyerAsync(luc, Realisation(p, await JetonAsync(luc, "/Mecanicien")));

        Assert.Equal(HttpStatusCode.Redirect, envoi.StatusCode);
        Assert.Equal("/Account/AccessDenied", new Uri(new Uri("http://localhost"), envoi.Headers.Location!).AbsolutePath);
        Assert.Equal("Suivi protégé", (await LireAsync(p.Id)).Opportunites.Single().ProchaineAction);
    }

    [Fact]
    public async Task Une_autre_concession_et_un_autre_conseiller_sont_refuses()
    {
        var sophie = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(sophie, "Isole" + Unique(), "Suivi isolé");
        var ailleurs = await CreerConseillerAsync(null);
        var collegue = await CreerConseillerAsync(p.DealershipId);

        var envoiAilleurs = await EnvoyerAsync(ailleurs, Realisation(p, await JetonAsync(ailleurs, "/Intelligence/Suivis")));
        var envoiCollegue = await EnvoyerAsync(collegue, Realisation(p, await JetonAsync(collegue, "/Intelligence/Suivis")));

        Assert.Equal(HttpStatusCode.NotFound, envoiAilleurs.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, envoiCollegue.StatusCode);
        var o = (await LireAsync(p.Id)).Opportunites.Single();
        Assert.Equal("Suivi isolé", o.ProchaineAction);
        Assert.Empty(o.HistoriqueSuivis);
    }

    [Fact]
    public async Task Une_adresse_de_retour_externe_est_ignoree()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Retour" + Unique(), "Retour externe");

        var envoi = await EnvoyerAsync(client, Realisation(p, await JetonAsync(client, "/Intelligence/Suivis"), retour: "https://exemple.test/piege"));

        Assert.Equal(HttpStatusCode.Redirect, envoi.StatusCode);
        Assert.Equal("/Intelligence/Suivis", envoi.Headers.Location!.ToString());
    }

    [Fact]
    public async Task Une_panne_affiche_une_erreur_sans_historique()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Panne" + Unique(), "Suivi en panne");
        var champs = Realisation(p, await JetonAsync(client, "/Intelligence/Suivis"));

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
        string page = await client.GetStringAsync(envoi.Headers.Location!.ToString());

        Assert.Contains("\\u00E9chou\\u00E9", page);
        Assert.Contains("\"confirmation\":null", page);
        var o = (await LireAsync(p.Id)).Opportunites.Single();
        Assert.Equal("Suivi en panne", o.ProchaineAction);
        Assert.Empty(o.HistoriqueSuivis);
    }

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
}
