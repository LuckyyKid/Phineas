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

// Vue « À venir » de « Mes suivis » : HTTP → IntelligenceController.Suivis → ServiceProspects.SuivisPlanifiesAsync → MySQL
// de test, puis lecture des données transmises au navigateur (<script id="suivis-planifies">) et du reste de la page.
public class ProspectsAVenirControllerTests : IClassFixture<ApplicationDeTest>
{
    private const string Sophie = "sophie.gagnon@autoprestige.example"; // conseillère, Auto Prestige Brossard
    private const string Luc = "luc.bergeron@autoprestige.example"; // mécanicien

    private readonly ApplicationDeTest _app;

    public ProspectsAVenirControllerTests(ApplicationDeTest app)
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
    private async Task<Prospect> CreerAsync(HttpClient client, string nom, string action, int decalage)
    {
        string courriel = nom.ToLowerInvariant() + "@exemple.test";
        var champs = new Dictionary<string, string>
        {
            ["prenom"] = "Ivo",
            ["nom"] = nom,
            ["courriel"] = courriel,
            ["contactPrefere"] = "courriel",
            ["source"] = "appel",
            ["modele"] = "Honda Civic",
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

    // Suivis transmis au navigateur par la page « Mes suivis » : (opportunité, action, date AAAA-MM-JJ), dans l'ordre reçu.
    private static List<(string Opp, string Action, string Date, string Prospect)> SuivisTransmis(string page)
    {
        int debut = page.IndexOf("id=\"suivis-planifies\">", StringComparison.Ordinal);
        Assert.True(debut >= 0, "Données « suivis-planifies » introuvables dans la page.");
        debut = page.IndexOf('>', debut) + 1;
        int fin = page.IndexOf("</script>", debut, StringComparison.Ordinal);
        using var json = JsonDocument.Parse(page.Substring(debut, fin - debut));
        var suivis = new List<(string, string, string, string)>();
        foreach (var s in json.RootElement.EnumerateArray())
        {
            suivis.Add((s.GetProperty("opportuniteId").GetString()!, s.GetProperty("action").GetString()!,
                s.GetProperty("datePrevue").GetString()!.Substring(0, 10), s.GetProperty("prospectId").GetString()!));
        }
        return suivis;
    }

    private static string Champ(int decalage) => DateTime.Today.AddDays(decalage).ToString("yyyy-MM-dd");

    [Fact]
    public async Task La_page_transmet_les_suivis_futurs_persistes_tries_par_date_avec_les_deux_vues()
    {
        var client = await _app.ConnecterAsync(Sophie);
        string u = Unique();
        var loin = await CreerAsync(client, "Loin" + u, "Loin " + u, 8);
        var proche = await CreerAsync(client, "Proche" + u, "Proche " + u, 2);

        string page = await client.GetStringAsync("/Intelligence/Suivis");

        Assert.Contains("id=\"onglet-a-traiter\"", page);
        Assert.Contains("id=\"onglet-a-venir\"", page);
        var miens = SuivisTransmis(page).Where(s => s.Action.EndsWith(u)).ToList();
        Assert.Equal(new[] { "Proche " + u, "Loin " + u }, miens.Select(s => s.Action));
        Assert.Equal(Champ(2), miens[0].Date);
        Assert.Equal("oe-" + proche.Opportunites.Single().Id, miens[0].Opp);
        Assert.Equal("pe-" + loin.Id, miens[1].Prospect);
        // Toute la liste reçue est triée par date (les autres suivis de Sophie compris).
        var dates = SuivisTransmis(page).Select(s => s.Date).ToList();
        Assert.Equal(dates.OrderBy(d => d, StringComparer.Ordinal), dates);

        // Le lien de la ligne mène à la bonne fiche.
        string fiche = await client.GetStringAsync("/Prospects/Fiche/" + miens[0].Prospect);
        Assert.Contains("Proche" + u, fiche);
    }

    [Fact]
    public async Task Un_suivi_en_retard_n_est_pas_transmis_et_un_suivi_du_jour_est_transmis_pour_le_classement()
    {
        var client = await _app.ConnecterAsync(Sophie);
        string u = Unique();
        var retard = await CreerAsync(client, "Retard" + u, "Retard " + u, 1);
        using (var scope = _app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var o = await db.OpportunitesVente.SingleAsync(x => x.ProspectId == retard.Id);
            o.DateProchaineAction = DateTime.Today.AddDays(-3).AddHours(9);
            await db.SaveChangesAsync();
        }
        await CreerAsync(client, "Jour" + u, "Jour " + u, 0);

        var actions = SuivisTransmis(await client.GetStringAsync("/Intelligence/Suivis")).Select(s => s.Action).ToList();

        Assert.DoesNotContain("Retard " + u, actions);
        Assert.Contains("Jour " + u, actions); // le navigateur le range dans « À traiter » (jour civil de l'utilisateur)
    }

    [Fact]
    public async Task Apres_un_report_depuis_A_venir_le_retour_garde_la_vue_et_la_nouvelle_date()
    {
        var client = await _app.ConnecterAsync(Sophie);
        string u = Unique();
        var p = await CreerAsync(client, "Report" + u, "Report " + u, 3);
        var o = p.Opportunites.Single();
        var champs = new Dictionary<string, string>
        {
            ["opportuniteId"] = "oe-" + o.Id,
            ["versionSuivi"] = ServiceProspects.EmpreinteSuivi(o.ProchaineAction, o.DateProchaineAction)!,
            ["date"] = Champ(11),
            ["retour"] = "/Intelligence/Suivis?vue=a-venir",
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Intelligence/Suivis?vue=a-venir"),
        };

        var envoi = await client.PostAsync("/Prospects/ReporterSuivi", new FormUrlEncodedContent(champs));

        Assert.Equal("/Intelligence/Suivis?vue=a-venir", envoi.Headers.Location!.ToString());
        var s = Assert.Single(SuivisTransmis(await client.GetStringAsync("/Intelligence/Suivis?vue=a-venir")), x => x.Action == "Report " + u);
        Assert.Equal(Champ(11), s.Date);
        Assert.Equal(ClotureSuivi.Reporte, Assert.Single((await LireAsync(p.Id)).Opportunites.Single().HistoriqueSuivis).Cloture);
    }

    [Fact]
    public async Task Apres_une_realisation_le_suivi_n_est_plus_transmis_et_l_historique_reste()
    {
        var client = await _app.ConnecterAsync(Sophie);
        string u = Unique();
        var p = await CreerAsync(client, "Realise" + u, "Réalisé " + u, 4);
        var o = p.Opportunites.Single();
        var champs = new Dictionary<string, string>
        {
            ["opportuniteId"] = "oe-" + o.Id,
            ["versionSuivi"] = ServiceProspects.EmpreinteSuivi(o.ProchaineAction, o.DateProchaineAction)!,
            ["retour"] = "/Intelligence/Suivis?vue=a-venir",
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Intelligence/Suivis"),
        };

        await client.PostAsync("/Prospects/RealiserSuivi", new FormUrlEncodedContent(champs));

        Assert.DoesNotContain(SuivisTransmis(await client.GetStringAsync("/Intelligence/Suivis")), s => s.Action == "Réalisé " + u);
        Assert.Contains("\"type\":\"suivi-realise\"", await client.GetStringAsync("/Prospects/Fiche/pe-" + p.Id));
    }

    [Fact]
    public async Task Aucun_suivi_d_une_autre_concession_ou_d_un_collegue_n_est_transmis_quel_que_soit_le_parametre()
    {
        var sophie = await _app.ConnecterAsync(Sophie);
        string u = Unique();
        var p = await CreerAsync(sophie, "Secret" + u, "Action secrète " + u, 5);
        var ailleurs = await CreerConseillerAsync(null);
        var collegue = await CreerConseillerAsync(p.DealershipId);

        foreach (var client in new[] { ailleurs, collegue })
        {
            foreach (string adresse in new[] { "/Intelligence/Suivis", "/Intelligence/Suivis?vue=a-venir&conseiller=" + p.ConseillerId + "&prospect=pe-" + p.Id + "&page=2" })
            {
                string page = await client.GetStringAsync(adresse);
                Assert.Empty(SuivisTransmis(page));               // ce conseiller n'a aucun suivi enregistré
                Assert.DoesNotContain("Action secrète " + u, page); // ni dans les données, ni ailleurs dans la page
                Assert.DoesNotContain("Secret" + u, page);
            }
        }
    }

    [Fact]
    public async Task Sans_suivi_la_page_transmet_une_liste_vide_et_affiche_l_etat_vide()
    {
        var client = await CreerConseillerAsync(null);

        string page = await client.GetStringAsync("/Intelligence/Suivis?vue=a-venir");

        Assert.Empty(SuivisTransmis(page));
        Assert.Contains("Aucun suivi à venir", page);
    }

    [Fact]
    public async Task Un_mecanicien_ou_un_visiteur_anonyme_n_accede_pas_a_la_page()
    {
        var luc = await _app.ConnecterAsync(Luc);
        var anonyme = _app.NouveauClient();

        var reponseLuc = await luc.GetAsync("/Intelligence/Suivis?vue=a-venir");
        var reponseAnonyme = await anonyme.GetAsync("/Intelligence/Suivis?vue=a-venir");

        Assert.Equal("/Account/AccessDenied", new Uri(new Uri("http://localhost"), reponseLuc.Headers.Location!).AbsolutePath);
        Assert.Equal("/Account/Login", new Uri(new Uri("http://localhost"), reponseAnonyme.Headers.Location!).AbsolutePath);
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
