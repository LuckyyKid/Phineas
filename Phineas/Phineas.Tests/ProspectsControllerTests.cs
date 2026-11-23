using System.Net;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Phineas.Data;
using Phineas.Data.Seed;
using Phineas.Models.Constants;
using Phineas.Models.Entities;
using Phineas.Tests.Infrastructure;

namespace Phineas.Tests;

// Chaîne complète : requête HTTP → ProspectsController → ServiceProspects → EF Core → MySQL de test.
public class ProspectsControllerTests : IClassFixture<ApplicationDeTest>
{
    private const string Sophie = "sophie.gagnon@autoprestige.example"; // conseillère, Auto Prestige Brossard
    private const string Luc = "luc.bergeron@autoprestige.example"; // mécanicien

    private readonly ApplicationDeTest _app;

    public ProspectsControllerTests(ApplicationDeTest app)
    {
        _app = app;
    }

    // Champs tels que le tiroir les envoie ; noms ASCII pour les retrouver dans le JSON de la page.
    private static Dictionary<string, string> Formulaire(string nom, string courriel, string telephone, string jeton) =>
        new()
        {
            ["prenom"] = "Zoe",
            ["nom"] = nom,
            ["courriel"] = courriel,
            ["telephone"] = telephone,
            ["contactPrefere"] = "telephone",
            ["source"] = "appel",
            ["sourceDetail"] = "",
            ["categorie"] = "berline",
            ["modele"] = "Honda Civic",
            ["budget"] = "24000",
            ["horizon"] = "",
            ["commentaire"] = "",
            ["conseillerId"] = "moi",
            ["etape"] = "Nouveau",
            ["prochaineAction"] = "",
            ["dateSuivi"] = DateTime.Today.AddDays(2).ToString("yyyy-MM-dd"),
            ["__RequestVerificationToken"] = jeton,
        };

    private static string Unique() => Guid.NewGuid().ToString("N").Substring(0, 8);

    private static async Task<string> JetonDeLaPageAsync(HttpClient client)
    {
        string page = await client.GetStringAsync("/Prospects");
        return ApplicationDeTest.JetonAntiforgery(page);
    }

    private async Task<Prospect?> TrouverAsync(string courriel)
    {
        using var scope = _app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Prospects.AsNoTracking().Include(p => p.Opportunites).FirstOrDefaultAsync(p => p.Courriel == courriel);
    }

    [Fact]
    public async Task Le_conseiller_ouvre_la_page_avec_le_formulaire_branche_sur_le_serveur()
    {
        var client = await _app.ConnecterAsync(Sophie);

        var reponse = await client.GetAsync("/Prospects");
        string page = await reponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, reponse.StatusCode);
        Assert.Contains("action=\"/Prospects/Creer\"", page);
        Assert.Contains("__RequestVerificationToken", page);
    }

    [Fact]
    public async Task Un_visiteur_anonyme_est_renvoye_a_la_connexion()
    {
        var client = _app.NouveauClient();

        var reponse = await client.GetAsync("/Prospects");

        Assert.Equal(HttpStatusCode.Redirect, reponse.StatusCode);
        Assert.Contains("/Account/Login", reponse.Headers.Location!.ToString());
    }

    [Fact]
    public async Task Un_mecanicien_n_a_pas_acces_aux_prospects()
    {
        var client = await _app.ConnecterAsync(Luc);

        var page = await client.GetAsync("/Prospects");

        Assert.Equal(HttpStatusCode.Redirect, page.StatusCode);
        Assert.Contains("/Account/AccessDenied", page.Headers.Location!.ToString());
    }

    [Fact]
    public async Task Un_envoi_valide_enregistre_redirige_et_reste_visible_apres_actualisation()
    {
        var client = await _app.ConnecterAsync(Sophie);
        string nom = "Valide" + Unique();
        string courriel = nom.ToLowerInvariant() + "@exemple.test";
        var formulaire = Formulaire(nom, courriel, "514-555-0142", await JetonDeLaPageAsync(client));

        var envoi = await client.PostAsync("/Prospects/Creer", new FormUrlEncodedContent(formulaire));

        // Post/Redirect/Get : retour à la liste.
        Assert.Equal(HttpStatusCode.Redirect, envoi.StatusCode);
        Assert.Equal("/Prospects", envoi.Headers.Location!.ToString());

        // Enregistrement réel, rattaché à Sophie et à sa concession.
        var prospect = await TrouverAsync(courriel);
        Assert.NotNull(prospect);
        using (var scope = _app.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var sophie = await users.FindByEmailAsync(Sophie);
            Assert.Equal(sophie!.Id, prospect.ConseillerId);
            Assert.Equal(sophie.DealershipId, prospect.DealershipId);
        }
        var opportunite = Assert.Single(prospect.Opportunites);
        Assert.Equal("Honda Civic", opportunite.Titre);
        Assert.Equal(24000m, opportunite.BudgetTotal);

        // La liste affiche le prospect et le message de confirmation...
        string liste = await client.GetStringAsync("/Prospects");
        Assert.Contains(nom, liste);
        Assert.DoesNotContain("\"confirmation\":null", liste);

        // ...et après actualisation, le prospect est toujours là (le message, lui, n'est montré qu'une fois).
        string actualisee = await client.GetStringAsync("/Prospects");
        Assert.Contains(nom, actualisee);
        Assert.Contains("\"confirmation\":null", actualisee);

        // La fiche relit les informations enregistrées.
        string fiche = await client.GetStringAsync("/Prospects/Fiche?id=pe-" + prospect.Id);
        Assert.Contains(courriel, fiche);
        Assert.Contains("514-555-0142", fiche);
    }

    [Fact]
    public async Task Un_envoi_invalide_rouvre_le_formulaire_avec_les_erreurs_sans_rien_enregistrer()
    {
        var client = await _app.ConnecterAsync(Sophie);
        string nom = "Invalide" + Unique();
        string courriel = nom.ToLowerInvariant() + "@";
        var formulaire = Formulaire(nom, courriel, "514-555", await JetonDeLaPageAsync(client));
        formulaire["prenom"] = "";
        formulaire["budget"] = "beaucoup";

        var envoi = await client.PostAsync("/Prospects/Creer", new FormUrlEncodedContent(formulaire));
        string page = await envoi.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, envoi.StatusCode);
        Assert.Contains("\"champ\":\"prenom\"", page);
        Assert.Contains("\"champ\":\"courriel\"", page);
        Assert.Contains("\"champ\":\"telephone\"", page);
        Assert.Contains("\"champ\":\"budget\"", page);
        Assert.Contains(nom, page); // la saisie est renvoyée pour remplir à nouveau le tiroir
        Assert.Null(await TrouverAsync(courriel));
    }

    [Fact]
    public async Task Un_envoi_sans_jeton_antiforgery_est_rejete()
    {
        var client = await _app.ConnecterAsync(Sophie);
        string nom = "SansJeton" + Unique();
        string courriel = nom.ToLowerInvariant() + "@exemple.test";
        var formulaire = Formulaire(nom, courriel, "514-555-0143", "");
        formulaire.Remove("__RequestVerificationToken");

        var envoi = await client.PostAsync("/Prospects/Creer", new FormUrlEncodedContent(formulaire));

        Assert.Equal(HttpStatusCode.BadRequest, envoi.StatusCode);
        Assert.Null(await TrouverAsync(courriel));
    }

    [Fact]
    public async Task Une_autre_concession_ne_voit_pas_les_prospects_de_Brossard()
    {
        // Conseiller réel d'une autre concession, créé pour ce test.
        string courrielConseiller = "conseiller." + Unique() + "@garagestl.example";
        using (var scope = _app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var autreConcession = new Dealership { Name = "Concession " + Unique() };
            db.Dealerships.Add(autreConcession);
            await db.SaveChangesAsync();
            var conseiller = new ApplicationUser
            {
                UserName = courrielConseiller,
                Email = courrielConseiller,
                FirstName = "Hugo",
                LastName = "Ailleurs",
                DealershipId = autreConcession.Id,
            };
            Assert.True((await users.CreateAsync(conseiller, DbSeeder.DemoPassword)).Succeeded);
            await users.AddToRoleAsync(conseiller, AppRoles.Conseiller);
        }

        var sophie = await _app.ConnecterAsync(Sophie);
        string nom = "Brossard" + Unique();
        string courriel = nom.ToLowerInvariant() + "@exemple.test";
        await sophie.PostAsync("/Prospects/Creer", new FormUrlEncodedContent(Formulaire(nom, courriel, "514-555-0144", await JetonDeLaPageAsync(sophie))));
        Assert.NotNull(await TrouverAsync(courriel));

        var hugo = await _app.ConnecterAsync(courrielConseiller);
        string pageHugo = await hugo.GetStringAsync("/Prospects");
        Assert.DoesNotContain(nom, pageHugo);
        string ficheVolee = await hugo.GetStringAsync("/Prospects/Fiche?id=pe-" + (await TrouverAsync(courriel))!.Id);
        Assert.DoesNotContain(courriel, ficheVolee);

        // Le même courriel dans l'autre concession n'est pas un doublon : Hugo peut créer son propre prospect.
        var envoiHugo = await hugo.PostAsync("/Prospects/Creer", new FormUrlEncodedContent(Formulaire("Autre" + nom, courriel, "514-555-0144", await JetonDeLaPageAsync(hugo))));
        Assert.Equal(HttpStatusCode.Redirect, envoiHugo.StatusCode);
    }

    [Fact]
    public async Task Une_panne_de_la_base_affiche_une_erreur_et_jamais_de_succes()
    {
        var client = await _app.ConnecterAsync(Sophie);
        string nom = "Panne" + Unique();
        string courriel = nom.ToLowerInvariant() + "@exemple.test";
        var formulaire = Formulaire(nom, courriel, "514-555-0145", await JetonDeLaPageAsync(client));

        HttpResponseMessage envoi;
        _app.Panne.EnPanne = true;
        try
        {
            envoi = await client.PostAsync("/Prospects/Creer", new FormUrlEncodedContent(formulaire));
        }
        finally
        {
            _app.Panne.EnPanne = false;
        }
        string page = await envoi.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, envoi.StatusCode);
        Assert.Contains("L\\u0027enregistrement a \\u00E9chou\\u00E9", page);
        Assert.Contains("\"confirmation\":null", page);
        Assert.Null(await TrouverAsync(courriel));
    }
}
