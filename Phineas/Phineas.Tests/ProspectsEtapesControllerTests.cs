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

// Chaîne complète du changement d'étape : HTTP → ProspectsController.ChangerEtape → ServiceProspects → EF Core → MySQL de test.
public class ProspectsEtapesControllerTests : IClassFixture<ApplicationDeTest>
{
    private const string Sophie = "sophie.gagnon@autoprestige.example"; // conseillère, Auto Prestige Brossard
    private const string Luc = "luc.bergeron@autoprestige.example"; // mécanicien

    private readonly ApplicationDeTest _app;

    public ProspectsEtapesControllerTests(ApplicationDeTest app)
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
            .SingleAsync(p => p.Id == id);
    }

    // Crée un prospect par le vrai formulaire de création (fonctionnalité 01) et le relit en base.
    private async Task<Prospect> CreerAsync(HttpClient client, string nom)
    {
        string courriel = nom.ToLowerInvariant() + "@exemple.test";
        var champs = new Dictionary<string, string>
        {
            ["prenom"] = "Max",
            ["nom"] = nom,
            ["courriel"] = courriel,
            ["contactPrefere"] = "courriel",
            ["source"] = "appel",
            ["categorie"] = "vus",
            ["modele"] = "Subaru Forester",
            ["budget"] = "33000",
            ["conseillerId"] = "moi",
            ["etape"] = "AQualifier",
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Prospects"),
        };
        Assert.Equal(HttpStatusCode.Redirect, (await client.PostAsync("/Prospects/Creer", new FormUrlEncodedContent(champs))).StatusCode);

        using var scope = _app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        int id = await db.Prospects.Where(p => p.Courriel == courriel).Select(p => p.Id).SingleAsync();
        return await LireAsync(id);
    }

    // Champs tels que prospects-store.js (envoyerEtape) les envoie.
    private static Dictionary<string, string> Changement(Prospect p, string etape, string jeton, string retour = "fiche") =>
        new()
        {
            ["opportuniteId"] = "oe-" + p.Opportunites.Single().Id,
            ["prospectId"] = "pe-" + p.Id,
            ["etape"] = etape,
            ["version"] = ServiceProspects.Empreinte(p),
            ["retour"] = retour,
            ["__RequestVerificationToken"] = jeton,
        };

    private static Task<HttpResponseMessage> EnvoyerAsync(HttpClient client, Dictionary<string, string> champs) =>
        client.PostAsync("/Prospects/ChangerEtape", new FormUrlEncodedContent(champs));

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
    public async Task Un_changement_valide_est_enregistre_trace_et_affiche()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Etape" + Unique());

        var envoi = await EnvoyerAsync(client, Changement(p, "Negociation", await JetonAsync(client, "/Prospects/Fiche/pe-" + p.Id)));

        Assert.Equal(HttpStatusCode.Redirect, envoi.StatusCode);
        // Depuis la fonctionnalité 18, la fiche se rouvre sur l'opportunité modifiée.
        Assert.Equal("/Prospects/Fiche/pe-" + p.Id + "?opportunite=oe-" + p.Opportunites.Single().Id, envoi.Headers.Location!.ToString());
        var o = (await LireAsync(p.Id)).Opportunites.Single();
        Assert.Equal(EtapeVente.Negociation, o.Etape);
        var h = Assert.Single(o.HistoriqueEtapes);
        Assert.Equal(EtapeVente.AQualifier, h.AncienneEtape);
        Assert.Equal(EtapeVente.Negociation, h.NouvelleEtape);
        Assert.Equal(p.ConseillerId, h.UtilisateurId);

        // La fiche affiche la confirmation, la nouvelle étape et l'événement d'historique.
        string fiche = await client.GetStringAsync("/Prospects/Fiche/pe-" + p.Id);
        Assert.Contains("\"etape\":\"Negociation\"", fiche);
        Assert.Contains("\"type\":\"etape\"", fiche);
        Assert.DoesNotContain("\"confirmation\":null", fiche);
        Assert.Contains("\"erreur\":null", fiche);
    }

    [Fact]
    public async Task Depuis_le_pipeline_le_retour_se_fait_sur_la_liste()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Pipeline" + Unique());

        var envoi = await EnvoyerAsync(client, Changement(p, "Soumission", await JetonAsync(client, "/Prospects"), retour: "liste"));

        Assert.Equal(HttpStatusCode.Redirect, envoi.StatusCode);
        Assert.Equal("/Prospects", envoi.Headers.Location!.ToString());
        Assert.Equal(EtapeVente.Soumission, (await LireAsync(p.Id)).Opportunites.Single().Etape);
    }

    [Theory]
    [InlineData("Perdu", "motif")]
    [InlineData("Inconnue", "inconnue")]
    public async Task Une_transition_refusee_ne_change_rien_et_affiche_le_refus(string etape, string fragment)
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Refus" + Unique());

        var envoi = await EnvoyerAsync(client, Changement(p, etape, await JetonAsync(client, "/Prospects")));
        string page = await client.GetStringAsync(envoi.Headers.Location!.ToString());

        Assert.Equal(HttpStatusCode.Redirect, envoi.StatusCode);
        Assert.Contains("\"confirmation\":null", page);
        Assert.Contains("\"erreur\":\"\\u00C9tape non modifi\\u00E9e.", page);
        Assert.Contains(fragment, page);
        var o = (await LireAsync(p.Id)).Opportunites.Single();
        Assert.Equal(EtapeVente.AQualifier, o.Etape);
        Assert.Empty(o.HistoriqueEtapes);
    }

    [Fact]
    public async Task Une_page_perimee_est_refusee_sans_historique()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Perime" + Unique());
        string jeton = await JetonAsync(client, "/Prospects");
        var ancienneVersion = Changement(p, "Finalisation", jeton);
        Assert.Equal(HttpStatusCode.Redirect, (await EnvoyerAsync(client, Changement(p, "Qualifie", jeton))).StatusCode);
        await client.GetStringAsync("/Prospects/Fiche/pe-" + p.Id); // le navigateur suit la redirection

        var envoi = await EnvoyerAsync(client, ancienneVersion);
        string page = await client.GetStringAsync(envoi.Headers.Location!.ToString());

        Assert.Contains("entre-temps", page);
        var o = (await LireAsync(p.Id)).Opportunites.Single();
        Assert.Equal(EtapeVente.Qualifie, o.Etape);
        Assert.Single(o.HistoriqueEtapes);
    }

    [Fact]
    public async Task Sans_jeton_antiforgery_la_requete_est_rejetee()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Jeton" + Unique());
        var champs = Changement(p, "Negociation", "");
        champs.Remove("__RequestVerificationToken");

        var envoi = await EnvoyerAsync(client, champs);

        Assert.Equal(HttpStatusCode.BadRequest, envoi.StatusCode);
        Assert.Empty((await LireAsync(p.Id)).Opportunites.Single().HistoriqueEtapes);
    }

    [Fact]
    public async Task Un_visiteur_anonyme_est_renvoye_a_la_connexion()
    {
        var sophie = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(sophie, "Anonyme" + Unique());
        var anonyme = _app.NouveauClient();

        var envoi = await EnvoyerAsync(anonyme, Changement(p, "Negociation", await JetonAsync(anonyme, "/Account/Login")));

        Assert.Equal(HttpStatusCode.Redirect, envoi.StatusCode);
        Assert.Contains("/Account/Login", envoi.Headers.Location!.ToString());
        Assert.Empty((await LireAsync(p.Id)).Opportunites.Single().HistoriqueEtapes);
    }

    [Fact]
    public async Task Un_mecanicien_avec_un_jeton_valide_est_refuse_par_l_autorisation()
    {
        var sophie = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(sophie, "Mecanicien" + Unique());
        var luc = await _app.ConnecterAsync(Luc);
        // Jeton antiforgery émis pour la session de Luc, sur une page qu'il a le droit d'ouvrir.
        string jetonDeLuc = await JetonAsync(luc, "/Mecanicien");

        var envoi = await EnvoyerAsync(luc, Changement(p, "Negociation", jetonDeLuc));

        // Refus d'autorisation configuré dans Program.cs : redirection vers AccessDenied (un rejet antiforgery donnerait 400).
        Assert.Equal(HttpStatusCode.Redirect, envoi.StatusCode);
        Assert.Equal("/Account/AccessDenied", new Uri(new Uri("http://localhost"), envoi.Headers.Location!).AbsolutePath);
        var o = (await LireAsync(p.Id)).Opportunites.Single();
        Assert.Equal(EtapeVente.AQualifier, o.Etape);
        Assert.Empty(o.HistoriqueEtapes);

        // Preuve que le jeton était valide : la même session l'utilise avec succès pour se déconnecter
        // (un jeton invalide donnerait 400 ici aussi).
        var deconnexion = await luc.PostAsync("/Account/Logout", new FormUrlEncodedContent(new Dictionary<string, string> { ["__RequestVerificationToken"] = jetonDeLuc }));
        Assert.Equal(HttpStatusCode.Redirect, deconnexion.StatusCode);
    }

    [Theory]
    [InlineData("Finalisation", "Gagne", "transaction")]
    [InlineData("Negociation", "Perdu", "motif")]
    public async Task Gagne_et_Perdu_sont_refuses_par_le_serveur(string depart, string demandee, string explication)
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Cloture" + Unique());
        Assert.Equal(HttpStatusCode.Redirect, (await EnvoyerAsync(client, Changement(p, depart, await JetonAsync(client, "/Prospects")))).StatusCode);
        await client.GetStringAsync("/Prospects/Fiche/pe-" + p.Id); // le navigateur suit la redirection
        var avant = await LireAsync(p.Id);

        var envoi = await EnvoyerAsync(client, Changement(avant, demandee, await JetonAsync(client, "/Prospects")));
        string page = await client.GetStringAsync(envoi.Headers.Location!.ToString());

        Assert.Contains("\"confirmation\":null", page);
        Assert.Contains("\"erreur\":\"\\u00C9tape non modifi\\u00E9e.", page);
        Assert.Contains(explication, page);
        var o = (await LireAsync(p.Id)).Opportunites.Single();
        Assert.Equal(depart, o.Etape.ToString());
        Assert.Single(o.HistoriqueEtapes);
        Assert.Equal(ServiceProspects.Empreinte(avant), ServiceProspects.Empreinte(await LireAsync(p.Id)));
    }

    [Fact]
    public async Task Une_autre_concession_et_un_autre_conseiller_sont_refuses()
    {
        var sophie = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(sophie, "Isole" + Unique());
        int brossard = p.DealershipId;
        var ailleurs = await CreerConseillerAsync(null);
        var collegue = await CreerConseillerAsync(brossard);

        var envoiAilleurs = await EnvoyerAsync(ailleurs, Changement(p, "Finalisation", await JetonAsync(ailleurs, "/Prospects")));
        var envoiCollegue = await EnvoyerAsync(collegue, Changement(p, "Finalisation", await JetonAsync(collegue, "/Prospects")));

        Assert.Equal(HttpStatusCode.NotFound, envoiAilleurs.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, envoiCollegue.StatusCode);
        var o = (await LireAsync(p.Id)).Opportunites.Single();
        Assert.Equal(EtapeVente.AQualifier, o.Etape);
        Assert.Empty(o.HistoriqueEtapes);
    }

    [Fact]
    public async Task Le_changement_d_etape_preserve_les_donnees_des_fonctionnalites_01_et_02()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Donnees" + Unique());

        // Fonctionnalité 02 : modification du contact et du premier intérêt.
        var modification = new Dictionary<string, string>
        {
            ["prospectId"] = "pe-" + p.Id,
            ["opportuniteId"] = "oe-" + p.Opportunites.Single().Id,
            ["version"] = ServiceProspects.Empreinte(p),
            ["prenom"] = "Maxime",
            ["nom"] = p.Nom,
            ["courriel"] = p.Courriel!,
            ["telephone"] = "514-555-0300",
            ["contactPrefere"] = "courriel",
            ["source"] = "appel",
            ["conseillerId"] = "moi",
            ["categorie"] = "vus",
            ["modele"] = "Toyota Highlander",
            ["budget"] = "45000",
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Prospects"),
        };
        Assert.Equal(HttpStatusCode.Redirect, (await client.PostAsync("/Prospects/Modifier", new FormUrlEncodedContent(modification))).StatusCode);
        var avant = await LireAsync(p.Id);

        // Fonctionnalité 03 : changement d'étape.
        Assert.Equal(HttpStatusCode.Redirect, (await EnvoyerAsync(client, Changement(avant, "EssaiRoutier", await JetonAsync(client, "/Prospects")))).StatusCode);

        var apres = await LireAsync(p.Id);
        var o = apres.Opportunites.Single();
        Assert.Equal("Maxime", apres.Prenom);
        Assert.Equal("514-555-0300", apres.Telephone);
        Assert.Equal("Toyota Highlander", o.Modele);
        Assert.Equal("Toyota Highlander", o.Titre);
        Assert.Equal(45000m, o.BudgetTotal);
        Assert.Equal(EtapeVente.EssaiRoutier, o.Etape);

        // Et la fonctionnalité 02 fonctionne encore après le changement d'étape (avec la page à jour).
        modification["version"] = ServiceProspects.Empreinte(apres);
        modification["telephone"] = "514-555-0301";
        Assert.Equal(HttpStatusCode.Redirect, (await client.PostAsync("/Prospects/Modifier", new FormUrlEncodedContent(modification))).StatusCode);
        var final = await LireAsync(p.Id);
        Assert.Equal("514-555-0301", final.Telephone);
        Assert.Equal(EtapeVente.EssaiRoutier, final.Opportunites.Single().Etape);
    }

    [Fact]
    public async Task Une_panne_a_l_enregistrement_affiche_une_erreur_sans_historique()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Panne" + Unique());
        var champs = Changement(p, "Negociation", await JetonAsync(client, "/Prospects"));

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

        Assert.Contains("\"confirmation\":null", page);
        Assert.Contains("\\u00E9chou\\u00E9", page);
        var o = (await LireAsync(p.Id)).Opportunites.Single();
        Assert.Equal(EtapeVente.AQualifier, o.Etape);
        Assert.Empty(o.HistoriqueEtapes);
    }
}
