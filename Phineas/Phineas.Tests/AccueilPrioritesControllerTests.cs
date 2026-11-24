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

// Carte « Priorité » de l'Accueil vendeur (ConseillerController.Index → MySQL de test) : la page reçoit le suivi courant
// avec sa version, la réalisation depuis l'Accueil passe par la route existante et revient avec le message du serveur,
// et aucun dossier d'un collègue ou d'une autre concession n'arrive sur l'Accueil. Le choix des cartes et de leurs
// commandes est testé dans Js/accueil-priorites.test.js et E2E/accueil-priorites.e2e.js.
public class AccueilPrioritesControllerTests : IClassFixture<ApplicationDeTest>
{
    private const string Sophie = "sophie.gagnon@autoprestige.example"; // conseillère, Auto Prestige Brossard

    private readonly ApplicationDeTest _app;

    public AccueilPrioritesControllerTests(ApplicationDeTest app)
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

    // Données du module Prospects de l'Accueil (<script id="prospects-donnees">) : opportunités du prospect, message du serveur.
    private static (List<JsonElement> Opps, string? Confirmation, string? Erreur) Donnees(string page, int prospectId)
    {
        int debut = page.IndexOf("id=\"prospects-donnees\">", StringComparison.Ordinal);
        Assert.True(debut >= 0, "Données du module Prospects introuvables sur l'Accueil.");
        debut = page.IndexOf('>', debut) + 1;
        int fin = page.IndexOf("</script>", debut, StringComparison.Ordinal);
        var racine = JsonDocument.Parse(page.Substring(debut, fin - debut)).RootElement;
        string pid = "pe-" + prospectId;
        var opps = racine.GetProperty("donnees").GetProperty("opportunites").EnumerateArray()
            .Where(o => o.GetProperty("prospectId").GetString() == pid).Select(o => o.Clone()).ToList();
        var enregistrement = racine.GetProperty("enregistrement");
        return (opps, enregistrement.GetProperty("confirmation").GetString(), enregistrement.GetProperty("erreur").GetString());
    }

    // Clôtures archivées (HistoriquesSuiviOpportunite) d'une opportunité, lues en base.
    private async Task<List<string>> CloturesAsync(int opportuniteId)
    {
        using var scope = _app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var clotures = await db.HistoriquesSuiviOpportunite.AsNoTracking().Where(h => h.OpportuniteId == opportuniteId).Select(h => h.Cloture).ToListAsync();
        return clotures.Select(c => c.ToString()).ToList();
    }

    private async Task<HttpResponseMessage> RealiserAsync(HttpClient client, int opportuniteId, string version, string retour = "/Conseiller")
    {
        var champs = new Dictionary<string, string>
        {
            ["opportuniteId"] = "oe-" + opportuniteId,
            ["versionSuivi"] = version,
            ["retour"] = retour,
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Conseiller"),
        };
        return await client.PostAsync("/Prospects/RealiserSuivi", new FormUrlEncodedContent(champs));
    }

    [Fact]
    public async Task L_accueil_recoit_le_suivi_courant_avec_sa_version()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Accueil" + Unique(), "Préparer le dossier de financement");

        var (opps, _, _) = Donnees(await client.GetStringAsync("/Conseiller"), p.Id);

        var o = Assert.Single(opps);
        Assert.Equal("Préparer le dossier de financement", o.GetProperty("prochaineAction").GetString());
        var opp = p.Opportunites.Single();
        Assert.Equal(ServiceProspects.EmpreinteSuivi(opp.ProchaineAction, opp.DateProchaineAction), o.GetProperty("versionSuivi").GetString());
    }

    [Fact]
    public async Task Realiser_depuis_l_accueil_revient_sur_l_accueil_avec_la_confirmation_et_retire_le_suivi()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Realise" + Unique(), "Préparer le dossier de financement");
        var opp = p.Opportunites.Single();

        var envoi = await RealiserAsync(client, opp.Id, ServiceProspects.EmpreinteSuivi(opp.ProchaineAction, opp.DateProchaineAction)!);

        Assert.Equal("/Conseiller", envoi.Headers.Location!.ToString());
        var (opps, confirmation, erreur) = Donnees(await client.GetStringAsync("/Conseiller"), p.Id);
        Assert.Equal("Suivi marqué comme réalisé et ajouté à l'historique du dossier.", confirmation);
        Assert.Null(erreur);
        Assert.Equal(JsonValueKind.Null, Assert.Single(opps).GetProperty("prochaineAction").ValueKind);
        Assert.Equal(new[] { "Realise" }, await CloturesAsync(opp.Id));
        var (_, deuxieme, _) = Donnees(await client.GetStringAsync("/Conseiller"), p.Id);
        Assert.Null(deuxieme); // message affiché une seule fois
    }

    [Fact]
    public async Task Une_version_perimee_est_refusee_et_le_refus_s_affiche_sur_l_accueil()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Perime" + Unique(), "Préparer le dossier de financement");
        var opp = p.Opportunites.Single();

        var envoi = await RealiserAsync(client, opp.Id, ServiceProspects.EmpreinteSuivi("Autre action", opp.DateProchaineAction)!);

        Assert.Equal("/Conseiller", envoi.Headers.Location!.ToString());
        var (opps, confirmation, erreur) = Donnees(await client.GetStringAsync("/Conseiller"), p.Id);
        Assert.Null(confirmation);
        Assert.StartsWith("Suivi non marqué comme réalisé.", erreur);
        Assert.Equal("Préparer le dossier de financement", Assert.Single(opps).GetProperty("prochaineAction").GetString());
        Assert.Empty(await CloturesAsync(opp.Id));
    }

    // Scénario C : les pages Rendez-vous incluent le même composant de données (_DonneesModules) mais n'affichent pas
    // ces messages ; elles ne doivent ni les recevoir ni les consommer (lire TempData l'efface à la fin de la requête).
    [Fact]
    public async Task Une_page_rendez_vous_ne_consomme_pas_le_message_destine_a_l_accueil()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Agenda" + Unique(), "Préparer le dossier de financement");
        var opp = p.Opportunites.Single();
        await RealiserAsync(client, opp.Id, ServiceProspects.EmpreinteSuivi(opp.ProchaineAction, opp.DateProchaineAction)!);

        foreach (var page in new[] { "/RendezVous", "/RendezVous/Nouveau" })
        {
            var (_, surAgenda, erreurAgenda) = Donnees(await client.GetStringAsync(page), p.Id);
            Assert.Null(surAgenda);
            Assert.Null(erreurAgenda);
        }

        var (_, surAccueil, _) = Donnees(await client.GetStringAsync("/Conseiller"), p.Id);
        Assert.Equal("Suivi marqué comme réalisé et ajouté à l'historique du dossier.", surAccueil);
    }

    // Scénario D : un message destiné à « Mes suivis » y reste affiché comme avant, puis n'apparaît pas sur l'Accueil.
    [Fact]
    public async Task Le_message_destine_a_mes_suivis_y_reste_et_n_apparait_pas_ensuite_sur_l_accueil()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Suivis" + Unique(), "Préparer le dossier de financement");
        var opp = p.Opportunites.Single();

        var envoi = await RealiserAsync(client, opp.Id, ServiceProspects.EmpreinteSuivi(opp.ProchaineAction, opp.DateProchaineAction)!, "/Intelligence/Suivis");

        Assert.Equal("/Intelligence/Suivis", envoi.Headers.Location!.ToString());
        var (_, surSuivis, _) = Donnees(await client.GetStringAsync("/Intelligence/Suivis"), p.Id);
        Assert.Equal("Suivi marqué comme réalisé et ajouté à l'historique du dossier.", surSuivis);
        var (_, surAccueil, erreurAccueil) = Donnees(await client.GetStringAsync("/Conseiller"), p.Id);
        Assert.Null(surAccueil);
        Assert.Null(erreurAccueil);
    }

    [Fact]
    public async Task Aucun_dossier_d_un_collegue_ou_d_une_autre_concession_n_arrive_sur_l_accueil()
    {
        var sophie = await _app.ConnecterAsync(Sophie);
        string u = Unique();
        var p = await CreerAsync(sophie, "Prive" + u, "Suivi privé " + u);
        var opp = p.Opportunites.Single();
        string version = ServiceProspects.EmpreinteSuivi(opp.ProchaineAction, opp.DateProchaineAction)!;

        foreach (var autre in new[] { await CreerConseillerAsync(null), await CreerConseillerAsync(p.DealershipId) })
        {
            string page = await autre.GetStringAsync("/Conseiller");
            Assert.Empty(Donnees(page, p.Id).Opps);
            Assert.DoesNotContain("Suivi privé " + u, page);
            Assert.Equal(HttpStatusCode.NotFound, (await RealiserAsync(autre, opp.Id, version)).StatusCode);
        }
        using var scope = _app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        Assert.Equal("Suivi privé " + u, (await db.OpportunitesVente.AsNoTracking().SingleAsync(o => o.Id == opp.Id)).ProchaineAction);
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
