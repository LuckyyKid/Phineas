using System.Net;
using System.Text.Json;
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

// Données que « Mes suivis » reçoit pour regrouper et réévaluer les recommandations (fonctionnalité 09) :
// HTTP → IntelligenceController.Suivis → ServiceProspects → MySQL de test. Le regroupement lui-même est calculé dans
// le navigateur (intelligence-regles.js, tests Js/regroupement-obligations.test.js et E2E deduplication-suivis.e2e.js) :
// ici, on vérifie que chaque opportunité et chaque événement de suivi lui parviennent correctement, sans fuite.
public class ProspectsDeduplicationControllerTests : IClassFixture<ApplicationDeTest>
{
    private const string Sophie = "sophie.gagnon@autoprestige.example"; // conseillère, Auto Prestige Brossard

    private readonly ApplicationDeTest _app;

    public ProspectsDeduplicationControllerTests(ApplicationDeTest app)
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

    // Prospect créé par le vrai formulaire (étape Nouveau : une première réponse est attendue), avec un suivi du jour.
    private async Task<Prospect> CreerAsync(HttpClient client, string nom, string action)
    {
        string courriel = nom.ToLowerInvariant() + "@exemple.test";
        var champs = new Dictionary<string, string>
        {
            ["prenom"] = "Noa",
            ["nom"] = nom,
            ["courriel"] = courriel,
            ["contactPrefere"] = "courriel",
            ["source"] = "appel",
            ["modele"] = "Kia Seltos",
            ["conseillerId"] = "moi",
            ["etape"] = "Nouveau",
            ["prochaineAction"] = action,
            ["dateSuivi"] = DateTime.Today.ToString("yyyy-MM-dd"),
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Prospects"),
        };
        Assert.Equal(HttpStatusCode.Redirect, (await client.PostAsync("/Prospects/Creer", new FormUrlEncodedContent(champs))).StatusCode);
        using var scope = _app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        int id = await db.Prospects.Where(p => p.Courriel == courriel).Select(p => p.Id).SingleAsync();
        return await LireAsync(id);
    }

    // Opportunités et interactions d'un prospect, telles que la page les transmet à prospects-store.js.
    private static (List<JsonElement> Opportunites, List<JsonElement> Interactions) Donnees(string page, int prospectId)
    {
        int debut = page.IndexOf("id=\"prospects-donnees\">", StringComparison.Ordinal);
        Assert.True(debut >= 0, "Données du module Prospects introuvables dans la page.");
        debut = page.IndexOf('>', debut) + 1;
        int fin = page.IndexOf("</script>", debut, StringComparison.Ordinal);
        var json = JsonDocument.Parse(page.Substring(debut, fin - debut)).RootElement.GetProperty("donnees");
        string pid = "pe-" + prospectId;
        var opps = json.GetProperty("opportunites").EnumerateArray().Where(o => o.GetProperty("prospectId").GetString() == pid).ToList();
        var inter = json.GetProperty("interactions").EnumerateArray().Where(i => i.GetProperty("prospectId").GetString() == pid).ToList();
        return (opps, inter);
    }

    private static Dictionary<string, string> Realisation(OpportuniteVente o, string jeton) => new()
    {
        ["opportuniteId"] = "oe-" + o.Id,
        ["versionSuivi"] = ServiceProspects.EmpreinteSuivi(o.ProchaineAction, o.DateProchaineAction)!,
        ["retour"] = "/Intelligence/Suivis",
        ["__RequestVerificationToken"] = jeton,
    };

    [Fact]
    public async Task Apres_realisation_la_page_recoit_un_seul_evenement_rattache_a_la_bonne_opportunite_a_chaque_actualisation()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Dedup" + Unique(), "Appeler le client");
        var o = p.Opportunites.Single();

        // Avant : l'opportunité est « Nouveau », sans échange, avec un suivi du jour (les deux raisons de la même prise de contact).
        var (oppsAvant, interAvant) = Donnees(await client.GetStringAsync("/Intelligence/Suivis"), p.Id);
        var opp = Assert.Single(oppsAvant);
        Assert.Equal("Nouveau", opp.GetProperty("etape").GetString());
        Assert.Equal("Appeler le client", opp.GetProperty("prochaineAction").GetString());
        Assert.DoesNotContain(interAvant, i => i.GetProperty("type").GetString()!.StartsWith("suivi-"));

        await client.PostAsync("/Prospects/RealiserSuivi", new FormUrlEncodedContent(Realisation(o, await JetonAsync(client, "/Intelligence/Suivis"))));

        // Deux actualisations : mêmes données, aucun événement en double.
        for (int essai = 0; essai < 2; essai++)
        {
            var (opps, inter) = Donnees(await client.GetStringAsync("/Intelligence/Suivis"), p.Id);
            Assert.Equal(JsonValueKind.Null, Assert.Single(opps).GetProperty("prochaineAction").ValueKind);
            var evenement = Assert.Single(inter, i => i.GetProperty("type").GetString() == "suivi-realise");
            Assert.Equal("oe-" + o.Id, evenement.GetProperty("opportuniteId").GetString());
            // Événement daté après la création de l'opportunité. Il n'est pas un contact : la première réponse reste due
            // tant qu'aucun échange n'est déclaré (intelligence-regles.js, tests Js/regroupement-obligations.test.js).
            Assert.True(evenement.GetProperty("date").GetDateTime() > opp.GetProperty("dateCreation").GetDateTime());
        }
        Assert.Equal(ClotureSuivi.Realise, Assert.Single((await LireAsync(p.Id)).Opportunites.Single().HistoriqueSuivis).Cloture);
    }

    [Fact]
    public async Task Apres_report_la_page_recoit_un_evenement_reporte_qui_n_est_pas_une_realisation()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Reporte" + Unique(), "Appeler le client");
        var o = p.Opportunites.Single();
        var champs = Realisation(o, await JetonAsync(client, "/Intelligence/Suivis"));
        champs["date"] = DateTime.Today.AddDays(4).ToString("yyyy-MM-dd");

        await client.PostAsync("/Prospects/ReporterSuivi", new FormUrlEncodedContent(champs));

        var (opps, inter) = Donnees(await client.GetStringAsync("/Intelligence/Suivis"), p.Id);
        Assert.Equal("Appeler le client", Assert.Single(opps).GetProperty("prochaineAction").GetString());
        Assert.Contains(inter, i => i.GetProperty("type").GetString() == "suivi-reporte");
        Assert.DoesNotContain(inter, i => i.GetProperty("type").GetString() == "suivi-realise");
    }

    [Fact]
    public async Task Deux_opportunites_du_meme_client_restent_distinctes_et_une_realisation_ne_touche_que_la_sienne()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "DeuxOpp" + Unique(), "Appeler pour la première");
        int deuxieme;
        using (var scope = _app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var o = new OpportuniteVente { ProspectId = p.Id, Titre = "Deuxième véhicule", Etape = EtapeVente.Nouveau, ProchaineAction = "Appeler pour la deuxième", DateProchaineAction = DateTime.Today.AddHours(9) };
            db.OpportunitesVente.Add(o);
            await db.SaveChangesAsync();
            deuxieme = o.Id;
        }
        var premiere = p.Opportunites.Single();

        await client.PostAsync("/Prospects/RealiserSuivi", new FormUrlEncodedContent(Realisation(premiere, await JetonAsync(client, "/Intelligence/Suivis"))));

        var (opps, inter) = Donnees(await client.GetStringAsync("/Intelligence/Suivis"), p.Id);
        Assert.Equal(2, opps.Count);
        var autre = Assert.Single(opps, x => x.GetProperty("id").GetString() == "oe-" + deuxieme);
        Assert.Equal("Appeler pour la deuxième", autre.GetProperty("prochaineAction").GetString()); // obligation indépendante intacte
        Assert.All(inter.Where(i => i.GetProperty("type").GetString() == "suivi-realise"),
            i => Assert.Equal("oe-" + premiere.Id, i.GetProperty("opportuniteId").GetString()));
    }

    [Fact]
    public async Task Un_autre_conseiller_ne_recoit_ni_les_opportunites_ni_les_evenements_de_suivi()
    {
        var sophie = await _app.ConnecterAsync(Sophie);
        string u = Unique();
        var p = await CreerAsync(sophie, "Prive" + u, "Action privée " + u);
        await sophie.PostAsync("/Prospects/RealiserSuivi", new FormUrlEncodedContent(Realisation(p.Opportunites.Single(), await JetonAsync(sophie, "/Intelligence/Suivis"))));

        foreach (var autre in new[] { await CreerConseillerAsync(null), await CreerConseillerAsync(p.DealershipId) })
        {
            string page = await autre.GetStringAsync("/Intelligence/Suivis");
            var (opps, inter) = Donnees(page, p.Id);
            Assert.Empty(opps);
            Assert.Empty(inter);
            Assert.DoesNotContain("Action privée " + u, page);
            Assert.DoesNotContain("Prive" + u, page);
        }
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
