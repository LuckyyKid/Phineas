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

// Chaîne complète pour la fiche et la modification : HTTP → ProspectsController (Fiche, Modifier)
// → ServiceProspects → EF Core → MySQL de test.
public class ProspectsModificationControllerTests : IClassFixture<ApplicationDeTest>
{
    private const string Sophie = "sophie.gagnon@autoprestige.example"; // conseillère, Auto Prestige Brossard
    private const string Luc = "luc.bergeron@autoprestige.example"; // mécanicien

    private readonly ApplicationDeTest _app;

    public ProspectsModificationControllerTests(ApplicationDeTest app)
    {
        _app = app;
    }

    private static string Unique() => Guid.NewGuid().ToString("N").Substring(0, 8);

    private static async Task<string> JetonAsync(HttpClient client, string adresse)
    {
        string page = await client.GetStringAsync(adresse);
        return ApplicationDeTest.JetonAntiforgery(page);
    }

    private async Task<Prospect> LireAsync(int id)
    {
        using var scope = _app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Prospects.AsNoTracking().Include(p => p.Opportunites).SingleAsync(p => p.Id == id);
    }

    // Crée un prospect par le vrai formulaire de création (fonctionnalité 01) et le relit en base.
    private async Task<Prospect> CreerAsync(HttpClient client, string nom, string telephone)
    {
        string courriel = nom.ToLowerInvariant() + "@exemple.test";
        var champs = new Dictionary<string, string>
        {
            ["prenom"] = "Lea",
            ["nom"] = nom,
            ["courriel"] = courriel,
            ["telephone"] = telephone,
            ["contactPrefere"] = "telephone",
            ["source"] = "appel",
            ["categorie"] = "berline",
            ["modele"] = "Honda Civic",
            ["budget"] = "24000",
            ["horizon"] = "30j",
            ["commentaire"] = "Premier appel",
            ["conseillerId"] = "moi",
            ["etape"] = "Qualifie",
            ["prochaineAction"] = "Rappeler",
            ["dateSuivi"] = DateTime.Today.AddDays(3).ToString("yyyy-MM-dd"),
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Prospects"),
        };
        var reponse = await client.PostAsync("/Prospects/Creer", new FormUrlEncodedContent(champs));
        Assert.Equal(HttpStatusCode.Redirect, reponse.StatusCode);

        using var scope = _app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Prospects.AsNoTracking().Include(p => p.Opportunites).SingleAsync(p => p.Courriel == courriel);
    }

    // Formulaire « Modifier » prérempli avec les valeurs en base, tel que le tiroir l'envoie.
    private static Dictionary<string, string> FormulaireModification(Prospect p, string jeton) =>
        new()
        {
            ["prospectId"] = "pe-" + p.Id,
            ["opportuniteId"] = "oe-" + p.Opportunites.Single().Id,
            ["version"] = ServiceProspects.Empreinte(p),
            ["prenom"] = p.Prenom,
            ["nom"] = p.Nom,
            ["courriel"] = p.Courriel ?? "",
            ["telephone"] = p.Telephone ?? "",
            ["contactPrefere"] = p.ContactPrefere,
            ["source"] = p.Source,
            ["sourceDetail"] = p.SourceDetail ?? "",
            ["conseillerId"] = "moi",
            ["categorie"] = p.Opportunites.Single().Categorie ?? "",
            ["modele"] = p.Opportunites.Single().Modele ?? "",
            ["budget"] = "24000",
            ["horizon"] = p.Opportunites.Single().Horizon ?? "",
            ["__RequestVerificationToken"] = jeton,
        };

    [Fact]
    public async Task La_fiche_d_un_prospect_enregistre_affiche_ses_valeurs()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Fiche" + Unique(), "514-555-0201");

        var reponse = await client.GetAsync("/Prospects/Fiche?id=pe-" + p.Id);
        string page = await reponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, reponse.StatusCode);
        Assert.Contains(p.Nom, page);
        Assert.Contains("514-555-0201", page);
        Assert.Contains(ServiceProspects.Empreinte(p), page); // version transmise au formulaire
        Assert.Contains("data-action-modification=\"/Prospects/Modifier\"", page);
    }

    [Theory]
    [InlineData("pe-999999")]
    [InlineData("pe-abc")]
    public async Task Une_fiche_inexistante_ou_invalide_repond_404(string id)
    {
        var client = await _app.ConnecterAsync(Sophie);

        var reponse = await client.GetAsync("/Prospects/Fiche?id=" + id);

        Assert.Equal(HttpStatusCode.NotFound, reponse.StatusCode);
    }

    [Fact]
    public async Task Une_autre_concession_ne_peut_ni_consulter_ni_modifier()
    {
        var sophie = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(sophie, "Isole" + Unique(), "514-555-0202");

        string courrielHugo = "hugo." + Unique() + "@garagestl.example";
        using (var scope = _app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var concession = new Dealership { Name = "Concession " + Unique() };
            db.Dealerships.Add(concession);
            await db.SaveChangesAsync();
            var hugo = new ApplicationUser { UserName = courrielHugo, Email = courrielHugo, FirstName = "Hugo", LastName = "Ailleurs", DealershipId = concession.Id };
            Assert.True((await users.CreateAsync(hugo, DbSeeder.DemoPassword)).Succeeded);
            await users.AddToRoleAsync(hugo, AppRoles.Conseiller);
        }
        var hugoClient = await _app.ConnecterAsync(courrielHugo);

        var fiche = await hugoClient.GetAsync("/Prospects/Fiche?id=pe-" + p.Id);
        string pageFiche = await fiche.Content.ReadAsStringAsync();
        var formulaire = FormulaireModification(p, await JetonAsync(hugoClient, "/Prospects"));
        formulaire["nom"] = "Pirate";
        var modification = await hugoClient.PostAsync("/Prospects/Modifier", new FormUrlEncodedContent(formulaire));

        Assert.Equal(HttpStatusCode.NotFound, fiche.StatusCode);
        Assert.DoesNotContain(p.Nom, pageFiche);
        Assert.DoesNotContain("514-555-0202", pageFiche);
        Assert.Equal(HttpStatusCode.NotFound, modification.StatusCode);
        Assert.Equal(p.Nom, (await LireAsync(p.Id)).Nom);
    }

    [Fact]
    public async Task Une_modification_valide_est_enregistree_et_relue_sur_la_fiche()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Modif" + Unique(), "514-555-0203");
        var formulaire = FormulaireModification(p, await JetonAsync(client, "/Prospects/Fiche?id=pe-" + p.Id));
        formulaire["telephone"] = "438-555-0204";
        formulaire["modele"] = "Mazda 3";
        formulaire["budget"] = "26500";

        var envoi = await client.PostAsync("/Prospects/Modifier", new FormUrlEncodedContent(formulaire));

        // Post/Redirect/Get vers la fiche.
        Assert.Equal(HttpStatusCode.Redirect, envoi.StatusCode);
        Assert.Equal("/Prospects/Fiche/pe-" + p.Id, envoi.Headers.Location!.ToString());

        // En base : nouvelles valeurs, relations et suivi intacts.
        var apres = await LireAsync(p.Id);
        var o = Assert.Single(apres.Opportunites);
        Assert.Equal("438-555-0204", apres.Telephone);
        Assert.Equal("Mazda 3", o.Modele);
        Assert.Equal(26500m, o.BudgetTotal);
        Assert.Equal(p.Opportunites.Single().Id, o.Id);
        Assert.Equal("Qualifie", o.Etape.ToString());
        Assert.Equal("Rappeler", o.ProchaineAction);
        Assert.Equal("Premier appel", apres.CommentaireInitial);
        Assert.Equal(p.ConseillerId, apres.ConseillerId);
        Assert.Equal(p.DealershipId, apres.DealershipId);

        // La fiche affiche la confirmation puis, après actualisation, les nouvelles valeurs sans le message.
        string fiche = await client.GetStringAsync("/Prospects/Fiche?id=pe-" + p.Id);
        Assert.Contains("438-555-0204", fiche);
        Assert.Contains("Mazda 3", fiche);
        Assert.DoesNotContain("\"confirmation\":null", fiche);
        string actualisee = await client.GetStringAsync("/Prospects/Fiche?id=pe-" + p.Id);
        Assert.Contains("438-555-0204", actualisee);
        Assert.Contains("\"confirmation\":null", actualisee);
    }

    [Fact]
    public async Task Une_modification_invalide_rouvre_le_tiroir_sans_rien_changer()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Invalide" + Unique(), "514-555-0205");
        var formulaire = FormulaireModification(p, await JetonAsync(client, "/Prospects"));
        formulaire["nom"] = "";
        formulaire["telephone"] = "514-555";
        formulaire["budget"] = "beaucoup";

        var envoi = await client.PostAsync("/Prospects/Modifier", new FormUrlEncodedContent(formulaire));
        string page = await envoi.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, envoi.StatusCode);
        Assert.Contains("\"champ\":\"nom\"", page);
        Assert.Contains("\"champ\":\"telephone\"", page);
        Assert.Contains("\"champ\":\"budget\"", page);
        Assert.Contains("\"prospectId\":\"pe-" + p.Id + "\"", page); // le tiroir se rouvre en mode « Modifier »
        Assert.Contains("\"confirmation\":null", page);
        var apres = await LireAsync(p.Id);
        Assert.Equal(p.Nom, apres.Nom);
        Assert.Equal("514-555-0205", apres.Telephone);
    }

    [Fact]
    public async Task Un_doublon_avec_un_autre_prospect_est_refuse()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Doublon" + Unique(), "514-555-0206");
        var autre = await CreerAsync(client, "Autre" + Unique(), "514-555-0207");
        var formulaire = FormulaireModification(p, await JetonAsync(client, "/Prospects"));
        formulaire["telephone"] = "(514) 555-0207";

        var envoi = await client.PostAsync("/Prospects/Modifier", new FormUrlEncodedContent(formulaire));
        string page = await envoi.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, envoi.StatusCode);
        Assert.Contains("\"champ\":\"telephone\"", page);
        Assert.Contains(autre.Nom, page); // le message nomme le prospect qui a déjà ce numéro
        Assert.Equal("514-555-0206", (await LireAsync(p.Id)).Telephone);
    }

    [Fact]
    public async Task Une_modification_sans_jeton_antiforgery_est_rejetee()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Jeton" + Unique(), "514-555-0208");
        var formulaire = FormulaireModification(p, "");
        formulaire.Remove("__RequestVerificationToken");
        formulaire["nom"] = "SansJeton";

        var envoi = await client.PostAsync("/Prospects/Modifier", new FormUrlEncodedContent(formulaire));

        Assert.Equal(HttpStatusCode.BadRequest, envoi.StatusCode);
        Assert.Equal(p.Nom, (await LireAsync(p.Id)).Nom);
    }

    [Fact]
    public async Task Un_visiteur_anonyme_ou_un_mecanicien_ne_peut_pas_modifier()
    {
        var sophie = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(sophie, "Acces" + Unique(), "514-555-0209");

        var anonyme = _app.NouveauClient();
        var formulaireAnonyme = FormulaireModification(p, await JetonAsync(anonyme, "/Account/Login"));
        formulaireAnonyme["nom"] = "Anonyme";
        var envoiAnonyme = await anonyme.PostAsync("/Prospects/Modifier", new FormUrlEncodedContent(formulaireAnonyme));

        var luc = await _app.ConnecterAsync(Luc);
        var ficheLuc = await luc.GetAsync("/Prospects/Fiche?id=pe-" + p.Id);

        Assert.Equal(HttpStatusCode.Redirect, envoiAnonyme.StatusCode);
        Assert.Contains("/Account/Login", envoiAnonyme.Headers.Location!.ToString());
        Assert.Equal(HttpStatusCode.Redirect, ficheLuc.StatusCode);
        Assert.Contains("/Account/AccessDenied", ficheLuc.Headers.Location!.ToString());
        Assert.Equal(p.Nom, (await LireAsync(p.Id)).Nom);
    }

    [Fact]
    public async Task Une_panne_a_l_enregistrement_affiche_une_erreur_sans_confirmation()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Panne" + Unique(), "514-555-0210");
        var formulaire = FormulaireModification(p, await JetonAsync(client, "/Prospects"));
        formulaire["nom"] = "Change";

        HttpResponseMessage envoi;
        _app.Panne.EnPanne = true;
        try
        {
            envoi = await client.PostAsync("/Prospects/Modifier", new FormUrlEncodedContent(formulaire));
        }
        finally
        {
            _app.Panne.EnPanne = false;
        }
        string page = await envoi.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, envoi.StatusCode);
        Assert.Contains("L\\u0027enregistrement a \\u00E9chou\\u00E9", page);
        Assert.Contains("\"confirmation\":null", page);
        Assert.Equal(p.Nom, (await LireAsync(p.Id)).Nom);
    }

    [Fact]
    public async Task Une_panne_a_la_lecture_de_la_fiche_repond_503()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Lecture" + Unique(), "514-555-0211");

        HttpResponseMessage reponse;
        _app.PanneLecture.EnPanne = true;
        try
        {
            reponse = await client.GetAsync("/Prospects/Fiche?id=pe-" + p.Id);
        }
        finally
        {
            _app.PanneLecture.EnPanne = false;
        }

        Assert.Equal(HttpStatusCode.ServiceUnavailable, reponse.StatusCode);
        Assert.DoesNotContain(p.Nom, await reponse.Content.ReadAsStringAsync());
    }
    [Fact]
    public async Task Un_conflit_reste_refuse_au_second_clic_puis_passe_apres_rechargement()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Conflit" + Unique(), "514-555-0212");
        string jeton = await JetonAsync(client, "/Prospects/Fiche/pe-" + p.Id);
        var autreOnglet = FormulaireModification(p, jeton);
        var monOnglet = FormulaireModification(p, jeton);
        autreOnglet["telephone"] = "438-555-0213";
        monOnglet["nom"] = "Change" + Unique();

        Assert.Equal(HttpStatusCode.Redirect, (await client.PostAsync("/Prospects/Modifier", new FormUrlEncodedContent(autreOnglet))).StatusCode);
        await client.GetStringAsync("/Prospects/Fiche/pe-" + p.Id); // le navigateur suit la redirection (message affiché)
        var premierClic = await client.PostAsync("/Prospects/Modifier", new FormUrlEncodedContent(monOnglet));
        string pagePremier = await premierClic.Content.ReadAsStringAsync();
        var secondClic = await client.PostAsync("/Prospects/Modifier", new FormUrlEncodedContent(monOnglet));

        // Refusé deux fois, avec le message de conflit et l'empreinte envoyée (pas l'actuelle) renvoyée au tiroir.
        Assert.Equal(HttpStatusCode.OK, premierClic.StatusCode);
        Assert.Contains("modifi\\u00E9 entre-temps", pagePremier);
        Assert.Contains("\"version\":\"" + monOnglet["version"] + "\"", pagePremier);
        Assert.Contains("\"confirmation\":null", pagePremier);
        Assert.Equal(HttpStatusCode.OK, secondClic.StatusCode);
        var apresConflit = await LireAsync(p.Id);
        Assert.Equal("438-555-0213", apresConflit.Telephone);
        Assert.Equal(p.Nom, apresConflit.Nom);

        // Rechargement volontaire : nouvelle empreinte lue sur les valeurs actuelles, puis le même changement passe.
        var recharge = FormulaireModification(apresConflit, await JetonAsync(client, "/Prospects/Fiche/pe-" + p.Id));
        recharge["nom"] = monOnglet["nom"];
        var envoi = await client.PostAsync("/Prospects/Modifier", new FormUrlEncodedContent(recharge));

        Assert.Equal(HttpStatusCode.Redirect, envoi.StatusCode);
        var final = await LireAsync(p.Id);
        Assert.Equal(monOnglet["nom"], final.Nom);
        Assert.Equal("438-555-0213", final.Telephone);
    }
}
