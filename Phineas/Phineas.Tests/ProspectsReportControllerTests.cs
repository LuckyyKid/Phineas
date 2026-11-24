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

// Chaîne complète de « Reporter » un suivi : HTTP → ProspectsController.ReporterSuivi → ServiceProspects → MySQL de test,
// puis relecture par « Mes suivis » (message) et par la fiche (événement « suivi-reporte »).
// Les messages relus dans la page sont encodés en JSON (é = é, apostrophe = ').
public class ProspectsReportControllerTests : IClassFixture<ApplicationDeTest>
{
    private const string Sophie = "sophie.gagnon@autoprestige.example"; // conseillère, Auto Prestige Brossard
    private const string Luc = "luc.bergeron@autoprestige.example"; // mécanicien

    private readonly ApplicationDeTest _app;

    public ProspectsReportControllerTests(ApplicationDeTest app)
    {
        _app = app;
    }

    private static string Unique() => Guid.NewGuid().ToString("N").Substring(0, 8);

    private static DateTime Jour(int decalage) => DateTime.Today.AddDays(decalage).AddHours(9);

    private static async Task<string> JetonAsync(HttpClient client, string adresse) =>
        ApplicationDeTest.JetonAntiforgery(await client.GetStringAsync(adresse));

    private async Task<Prospect> LireAsync(int id)
    {
        using var scope = _app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Prospects.AsNoTracking().Include(p => p.Opportunites).ThenInclude(o => o.HistoriqueSuivis).SingleAsync(p => p.Id == id);
    }

    // Prospect créé par le vrai formulaire, avec la prochaine action « action » dans « decalage » jours.
    private async Task<Prospect> CreerAsync(HttpClient client, string nom, string action, int decalage = 0)
    {
        string courriel = nom.ToLowerInvariant() + "@exemple.test";
        var champs = new Dictionary<string, string>
        {
            ["prenom"] = "Eli",
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

    // Champs du formulaire « Reporter » tel que la page l'envoie (version du suivi affiché).
    private static Dictionary<string, string> Report(Prospect p, string jeton, string date, string retour = "/Intelligence/Suivis")
    {
        var o = p.Opportunites.Single();
        return new()
        {
            ["opportuniteId"] = "oe-" + o.Id,
            ["versionSuivi"] = ServiceProspects.EmpreinteSuivi(o.ProchaineAction, o.DateProchaineAction) ?? "",
            ["date"] = date,
            ["retour"] = retour,
            ["__RequestVerificationToken"] = jeton,
        };
    }

    private static string Champ(int decalage) => DateTime.Today.AddDays(decalage).ToString("yyyy-MM-dd");

    private static Task<HttpResponseMessage> EnvoyerAsync(HttpClient client, Dictionary<string, string> champs) =>
        client.PostAsync("/Prospects/ReporterSuivi", new FormUrlEncodedContent(champs));

    // Envoie le report, suit la redirection et retourne la page affichée ensuite (avec son message).
    private static async Task<string> EnvoyerEtLireAsync(HttpClient client, Dictionary<string, string> champs)
    {
        var envoi = await EnvoyerAsync(client, champs);
        Assert.Equal(HttpStatusCode.Redirect, envoi.StatusCode);
        return await client.GetStringAsync(envoi.Headers.Location!.ToString());
    }

    [Fact]
    public async Task Un_report_est_persiste_reste_actif_et_apparait_dans_l_historique()
    {
        var client = await _app.ConnecterAsync(Sophie);
        string action = "Rappeler " + Unique();
        var p = await CreerAsync(client, "Report" + Unique(), action);

        var envoi = await EnvoyerAsync(client, Report(p, await JetonAsync(client, "/Intelligence/Suivis"), Champ(6)));

        Assert.Equal(HttpStatusCode.Redirect, envoi.StatusCode);
        Assert.Equal("/Intelligence/Suivis", envoi.Headers.Location!.ToString());
        string page = await client.GetStringAsync("/Intelligence/Suivis");
        Assert.Contains("Suivi report\\u00E9 au", page);
        Assert.Contains("reste \\u00E0 faire", page);
        var o = (await LireAsync(p.Id)).Opportunites.Single();
        Assert.Equal(action, o.ProchaineAction);
        Assert.Equal(Jour(6), o.DateProchaineAction);
        var h = Assert.Single(o.HistoriqueSuivis);
        Assert.Equal(ClotureSuivi.Reporte, h.Cloture);
        Assert.Equal(Jour(0), h.DatePrevue);
        Assert.Equal(Jour(6), h.NouvelleDatePrevue);

        var types = TypesEvenements(await client.GetStringAsync("/Prospects/Fiche/pe-" + p.Id), p.Id);
        Assert.Contains("suivi-reporte", types);
        Assert.DoesNotContain("suivi-realise", types);
        Assert.DoesNotContain("suivi-remplace", types);
    }

    [Theory]
    [InlineData("", "Choisissez la nouvelle date")]
    [InlineData("pas-une-date", "")]
    [InlineData("passe", "Choisissez aujourd\\u0027hui")]
    [InlineData("meme", "rien n\\u0027a \\u00E9t\\u00E9 modifi\\u00E9")]
    public async Task Une_date_absente_invalide_passee_ou_inchangee_est_refusee_sans_ecriture(string cas, string message)
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Date" + Unique(), "Date à vérifier", decalage: 2);
        string date = cas == "passe" ? Champ(-5) : cas == "meme" ? Champ(2) : cas;

        string page = await EnvoyerEtLireAsync(client, Report(p, await JetonAsync(client, "/Intelligence/Suivis"), date));

        Assert.Contains("Suivi non report\\u00E9", page);
        Assert.Contains(message, page);
        var o = (await LireAsync(p.Id)).Opportunites.Single();
        Assert.Equal(Jour(2), o.DateProchaineAction);
        Assert.Empty(o.HistoriqueSuivis);
    }

    [Fact]
    public async Task Un_double_envoi_n_ajoute_qu_un_evenement()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Double" + Unique(), "Double clic");
        var champs = Report(p, await JetonAsync(client, "/Intelligence/Suivis"), Champ(4));

        await EnvoyerEtLireAsync(client, champs);
        string page = await EnvoyerEtLireAsync(client, champs);

        Assert.Contains("d\\u00E9j\\u00E0 report\\u00E9", page);
        Assert.Single((await LireAsync(p.Id)).Opportunites.Single().HistoriqueSuivis);
    }

    [Fact]
    public async Task Apres_une_realisation_un_report_perime_est_refuse_puis_un_reessai_recharge_n_a_plus_rien_a_reporter()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Perime" + Unique(), "Suivi périmé");
        string jeton = await JetonAsync(client, "/Intelligence/Suivis");
        var anciennePage = Report(p, jeton, Champ(5));
        var realisation = new Dictionary<string, string>
        {
            ["opportuniteId"] = anciennePage["opportuniteId"],
            ["versionSuivi"] = anciennePage["versionSuivi"],
            ["__RequestVerificationToken"] = jeton,
        };
        await client.PostAsync("/Prospects/RealiserSuivi", new FormUrlEncodedContent(realisation));

        string page = await EnvoyerEtLireAsync(client, anciennePage);

        Assert.Contains("chang\\u00E9 entre-temps", page);
        var o = (await LireAsync(p.Id)).Opportunites.Single();
        Assert.Null(o.ProchaineAction);                                   // l'action terminée n'est pas recréée
        Assert.Equal(ClotureSuivi.Realise, Assert.Single(o.HistoriqueSuivis).Cloture);

        // Réessai après rechargement : la page ne montre plus de suivi, la version envoyée est vide.
        page = await EnvoyerEtLireAsync(client, Report(await LireAsync(p.Id), jeton, Champ(5)));
        Assert.Contains("aucun suivi actif", page);
        Assert.Single((await LireAsync(p.Id)).Opportunites.Single().HistoriqueSuivis);
    }

    [Fact]
    public async Task Apres_un_premier_report_une_page_rechargee_peut_reporter_encore()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Encore" + Unique(), "Reporter deux fois");
        string jeton = await JetonAsync(client, "/Intelligence/Suivis");
        await EnvoyerEtLireAsync(client, Report(p, jeton, Champ(3)));

        string refus = await EnvoyerEtLireAsync(client, Report(p, jeton, Champ(9)));        // ancienne version
        string reussite = await EnvoyerEtLireAsync(client, Report(await LireAsync(p.Id), jeton, Champ(9))); // rechargée

        Assert.Contains("chang\\u00E9 entre-temps", refus);
        Assert.Contains("Suivi report\\u00E9 au", reussite);
        var o = (await LireAsync(p.Id)).Opportunites.Single();
        Assert.Equal(Jour(9), o.DateProchaineAction);
        Assert.Equal(2, o.HistoriqueSuivis.Count);
        Assert.All(o.HistoriqueSuivis, h => Assert.Equal(ClotureSuivi.Reporte, h.Cloture));
    }

    [Fact]
    public async Task Sans_jeton_antiforgery_la_requete_est_rejetee()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Jeton" + Unique(), "Sans jeton");
        var champs = Report(p, "", Champ(3));
        champs.Remove("__RequestVerificationToken");

        var envoi = await EnvoyerAsync(client, champs);

        Assert.Equal(HttpStatusCode.BadRequest, envoi.StatusCode);
        Assert.Equal(Jour(0), (await LireAsync(p.Id)).Opportunites.Single().DateProchaineAction);
    }

    [Fact]
    public async Task Un_mecanicien_avec_un_jeton_valide_est_refuse_par_l_autorisation()
    {
        var sophie = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(sophie, "Mecanicien" + Unique(), "Suivi protégé");
        var luc = await _app.ConnecterAsync(Luc);

        var envoi = await EnvoyerAsync(luc, Report(p, await JetonAsync(luc, "/Mecanicien"), Champ(3)));

        Assert.Equal(HttpStatusCode.Redirect, envoi.StatusCode);
        Assert.Equal("/Account/AccessDenied", new Uri(new Uri("http://localhost"), envoi.Headers.Location!).AbsolutePath);
        Assert.Empty((await LireAsync(p.Id)).Opportunites.Single().HistoriqueSuivis);
    }

    [Fact]
    public async Task Une_autre_concession_et_un_autre_conseiller_sont_refuses_sans_ecriture()
    {
        var sophie = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(sophie, "Isole" + Unique(), "Suivi isolé");
        var ailleurs = await CreerConseillerAsync(null);
        var collegue = await CreerConseillerAsync(p.DealershipId);

        var envoiAilleurs = await EnvoyerAsync(ailleurs, Report(p, await JetonAsync(ailleurs, "/Intelligence/Suivis"), Champ(3)));
        var envoiCollegue = await EnvoyerAsync(collegue, Report(p, await JetonAsync(collegue, "/Intelligence/Suivis"), Champ(3)));

        Assert.Equal(HttpStatusCode.NotFound, envoiAilleurs.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, envoiCollegue.StatusCode);
        var o = (await LireAsync(p.Id)).Opportunites.Single();
        Assert.Equal(Jour(0), o.DateProchaineAction);
        Assert.Empty(o.HistoriqueSuivis);
    }

    [Fact]
    public async Task Une_adresse_de_retour_externe_est_ignoree()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Retour" + Unique(), "Retour externe");

        var envoi = await EnvoyerAsync(client, Report(p, await JetonAsync(client, "/Intelligence/Suivis"), Champ(3), retour: "https://exemple.test/piege"));

        Assert.Equal(HttpStatusCode.Redirect, envoi.StatusCode);
        Assert.Equal("/Intelligence/Suivis", envoi.Headers.Location!.ToString());
    }

    [Fact]
    public async Task Une_panne_affiche_une_erreur_sans_changer_la_date_ni_l_historique()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Panne" + Unique(), "Suivi en panne");
        var champs = Report(p, await JetonAsync(client, "/Intelligence/Suivis"), Champ(3));

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
        Assert.Equal(Jour(0), o.DateProchaineAction);
        Assert.Empty(o.HistoriqueSuivis);
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
