using System.Net;
using System.Text.Json;
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

// Données qui alimentent le Centre d'actions (IntelligenceController.Index → MySQL de test) : bonnes opportunités,
// suivis courants, contacts déclarés, et aucune donnée d'un autre conseiller ou d'une autre concession. Le regroupement
// et les commandes des cartes sont testés dans Js/centre-actions.test.js et E2E/centre-actions.e2e.js.
public class CentreActionsDonneesControllerTests : IClassFixture<ApplicationDeTest>
{
    private const string Sophie = "sophie.gagnon@autoprestige.example"; // conseillère, Auto Prestige Brossard

    private readonly ApplicationDeTest _app;

    public CentreActionsDonneesControllerTests(ApplicationDeTest app)
    {
        _app = app;
    }

    private static string Unique() => Guid.NewGuid().ToString("N").Substring(0, 8);

    private static async Task<string> JetonAsync(HttpClient client, string adresse) =>
        ApplicationDeTest.JetonAntiforgery(await client.GetStringAsync(adresse));

    private async Task<Prospect> CreerAsync(HttpClient client, string nom, string suivi)
    {
        string courriel = nom.ToLowerInvariant() + "@exemple.test";
        var champs = new Dictionary<string, string>
        {
            ["prenom"] = "Lou",
            ["nom"] = nom,
            ["courriel"] = courriel,
            ["contactPrefere"] = "courriel",
            ["source"] = "appel",
            ["modele"] = "Kia Sportage",
            ["conseillerId"] = "moi",
            ["etape"] = "Nouveau",
            ["prochaineAction"] = suivi,
            ["dateSuivi"] = DateTime.Today.ToString("yyyy-MM-dd"),
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Prospects"),
        };
        Assert.Equal(HttpStatusCode.Redirect, (await client.PostAsync("/Prospects/Creer", new FormUrlEncodedContent(champs))).StatusCode);
        using var scope = _app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Prospects.AsNoTracking().Include(p => p.Opportunites).SingleAsync(p => p.Courriel == courriel);
    }

    private async Task NoterAppelAsync(HttpClient client, Prospect p)
    {
        var champs = new Dictionary<string, string>
        {
            ["prospectId"] = "pe-" + p.Id,
            ["jeton"] = Guid.NewGuid().ToString("N"),
            ["type"] = "appel",
            ["opportuniteId"] = "oe-" + p.Opportunites.Single().Id,
            ["resume"] = "Premier appel au client.",
            ["prochaineAction"] = "",
            ["date"] = "",
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Prospects"),
        };
        Assert.Equal(HttpStatusCode.Redirect, (await client.PostAsync("/Prospects/AjouterNote", new FormUrlEncodedContent(champs))).StatusCode);
    }

    // Opportunités et interactions d'un prospect transmises par le Centre d'actions (<script id="prospects-donnees">).
    private static (List<JsonElement> Opps, List<JsonElement> Inter) Donnees(string page, int prospectId)
    {
        int debut = page.IndexOf("id=\"prospects-donnees\">", StringComparison.Ordinal);
        Assert.True(debut >= 0, "Données du module Prospects introuvables dans le Centre d'actions.");
        debut = page.IndexOf('>', debut) + 1;
        int fin = page.IndexOf("</script>", debut, StringComparison.Ordinal);
        var json = JsonDocument.Parse(page.Substring(debut, fin - debut)).RootElement.GetProperty("donnees");
        string pid = "pe-" + prospectId;
        return (json.GetProperty("opportunites").EnumerateArray().Where(o => o.GetProperty("prospectId").GetString() == pid).Select(o => o.Clone()).ToList(),
            json.GetProperty("interactions").EnumerateArray().Where(i => i.GetProperty("prospectId").GetString() == pid).Select(i => i.Clone()).ToList());
    }

    [Fact]
    public async Task Le_centre_recoit_le_suivi_courant_avec_sa_version_et_le_contact_declare_lie_a_l_opportunite()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Centre" + Unique(), "Préparer le dossier de financement");
        await NoterAppelAsync(client, p);

        string page = await client.GetStringAsync("/Intelligence");

        var (opps, inter) = Donnees(page, p.Id);
        var o = Assert.Single(opps);
        Assert.Equal("oe-" + p.Opportunites.Single().Id, o.GetProperty("id").GetString());
        Assert.Equal("Nouveau", o.GetProperty("etape").GetString());
        Assert.Equal("Préparer le dossier de financement", o.GetProperty("prochaineAction").GetString());
        Assert.False(string.IsNullOrEmpty(o.GetProperty("versionSuivi").GetString())); // utilisée par « Marquer comme réalisée » et « Reporter »
        var appel = Assert.Single(inter, i => i.GetProperty("type").GetString() == "appel");
        Assert.StartsWith("ie-n", appel.GetProperty("id").GetString());
        Assert.Equal(o.GetProperty("id").GetString(), appel.GetProperty("opportuniteId").GetString());
        Assert.Contains("\"typesContact\":[\"appel\",\"courriel\",\"visite\"]", page);
    }

    [Fact]
    public async Task Apres_realisation_le_centre_ne_recoit_plus_de_suivi_courant_mais_l_evenement_realise()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Realise" + Unique(), "Préparer le dossier de financement");
        var opp = p.Opportunites.Single();
        var champs = new Dictionary<string, string>
        {
            ["opportuniteId"] = "oe-" + opp.Id,
            ["versionSuivi"] = ServiceProspects.EmpreinteSuivi(opp.ProchaineAction, opp.DateProchaineAction)!,
            ["retour"] = "/Intelligence",
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Intelligence"),
        };

        var envoi = await client.PostAsync("/Prospects/RealiserSuivi", new FormUrlEncodedContent(champs));

        Assert.Equal("/Intelligence", envoi.Headers.Location!.ToString());
        var (opps, inter) = Donnees(await client.GetStringAsync("/Intelligence"), p.Id);
        Assert.Equal(JsonValueKind.Null, Assert.Single(opps).GetProperty("prochaineAction").ValueKind);
        Assert.Contains(inter, i => i.GetProperty("type").GetString() == "suivi-realise");
        Assert.DoesNotContain(inter, i => i.GetProperty("type").GetString() == "appel"); // aucun contact créé par la réalisation
    }

    [Fact]
    public async Task Aucun_dossier_d_un_collegue_ou_d_une_autre_concession_n_arrive_au_centre()
    {
        var sophie = await _app.ConnecterAsync(Sophie);
        string u = Unique();
        var p = await CreerAsync(sophie, "Prive" + u, "Suivi privé " + u);
        await NoterAppelAsync(sophie, p);

        foreach (var autre in new[] { await CreerConseillerAsync(null), await CreerConseillerAsync(p.DealershipId) })
        {
            string page = await autre.GetStringAsync("/Intelligence");
            var (opps, inter) = Donnees(page, p.Id);
            Assert.Empty(opps);
            Assert.Empty(inter);
            Assert.DoesNotContain("Suivi privé " + u, page);
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
