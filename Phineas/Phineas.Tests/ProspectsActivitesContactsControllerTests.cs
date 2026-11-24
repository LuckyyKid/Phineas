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

// Source de vérité de la distinction activité / contact déclaré (fonctionnalité 11) : notes réelles enregistrées en
// MySQL (HTTP → ProspectsController.AjouterNote), relues par les pages avec leur type, leur auteur, leur date serveur,
// leur opportunité et leur identifiant. La classification (estContactDeclare) est testée dans Js/activites-contacts.test.js.
public class ProspectsActivitesContactsControllerTests : IClassFixture<ApplicationDeTest>
{
    private const string Sophie = "sophie.gagnon@autoprestige.example"; // conseillère, Auto Prestige Brossard

    private readonly ApplicationDeTest _app;

    public ProspectsActivitesContactsControllerTests(ApplicationDeTest app)
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
        return await db.Prospects.AsNoTracking().Include(p => p.Opportunites).Include(p => p.Notes).SingleAsync(p => p.Id == id);
    }

    private async Task<Prospect> CreerAsync(HttpClient client, string nom, string? suivi = null)
    {
        string courriel = nom.ToLowerInvariant() + "@exemple.test";
        var champs = new Dictionary<string, string>
        {
            ["prenom"] = "Zoe",
            ["nom"] = nom,
            ["courriel"] = courriel,
            ["contactPrefere"] = "courriel",
            ["source"] = "appel",
            ["modele"] = "Mazda CX-50",
            ["conseillerId"] = "moi",
            ["etape"] = "Nouveau",
            ["prochaineAction"] = suivi ?? "",
            ["dateSuivi"] = suivi is null ? "" : DateTime.Today.ToString("yyyy-MM-dd"),
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Prospects"),
        };
        Assert.Equal(HttpStatusCode.Redirect, (await client.PostAsync("/Prospects/Creer", new FormUrlEncodedContent(champs))).StatusCode);
        using var scope = _app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        int id = await db.Prospects.Where(p => p.Courriel == courriel).Select(p => p.Id).SingleAsync();
        return await LireAsync(id);
    }

    private async Task NoterAsync(HttpClient client, int prospectId, string type, string? oppId, string resume)
    {
        var champs = new Dictionary<string, string>
        {
            ["prospectId"] = "pe-" + prospectId,
            ["jeton"] = Guid.NewGuid().ToString("N"),
            ["type"] = type,
            ["opportuniteId"] = oppId ?? "",
            ["resume"] = resume,
            ["prochaineAction"] = "",
            ["date"] = "",
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Prospects"),
        };
        Assert.Equal(HttpStatusCode.Redirect, (await client.PostAsync("/Prospects/AjouterNote", new FormUrlEncodedContent(champs))).StatusCode);
    }

    // Interactions d'un prospect transmises au navigateur (<script id="prospects-donnees">).
    private static List<JsonElement> Interactions(string page, int prospectId)
    {
        int debut = page.IndexOf("id=\"prospects-donnees\">", StringComparison.Ordinal);
        Assert.True(debut >= 0, "Données du module Prospects introuvables dans la page.");
        debut = page.IndexOf('>', debut) + 1;
        int fin = page.IndexOf("</script>", debut, StringComparison.Ordinal);
        var json = JsonDocument.Parse(page.Substring(debut, fin - debut)).RootElement;
        return json.GetProperty("donnees").GetProperty("interactions").EnumerateArray()
            .Where(i => i.GetProperty("prospectId").GetString() == "pe-" + prospectId).Select(i => i.Clone()).ToList();
    }

    [Fact]
    public async Task Les_notes_et_contacts_arrivent_avec_type_auteur_date_serveur_opportunite_et_identifiant_de_note()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Activite" + Unique());
        string opp = "oe-" + p.Opportunites.Single().Id;

        await NoterAsync(client, p.Id, "appel", opp, "Premier appel.");
        await NoterAsync(client, p.Id, "note", opp, "Client intéressé par les hybrides.");
        await NoterAsync(client, p.Id, "note", null, "Note générale.");

        var notes = Interactions(await client.GetStringAsync("/Intelligence/Suivis"), p.Id).Where(i => i.GetProperty("id").GetString()!.StartsWith("ie-n")).ToList();
        Assert.Equal(3, notes.Count);
        Assert.All(notes, n => Assert.Equal("Sophie Gagnon", n.GetProperty("auteur").GetString()));
        var appel = Assert.Single(notes, n => n.GetProperty("type").GetString() == "appel");
        var note = Assert.Single(notes, n => n.GetProperty("resume").GetString() == "Client intéressé par les hybrides.");
        var generale = Assert.Single(notes, n => n.GetProperty("resume").GetString() == "Note générale.");
        Assert.Equal("note", note.GetProperty("type").GetString());
        Assert.Equal(opp, appel.GetProperty("opportuniteId").GetString());
        Assert.Equal(JsonValueKind.Null, generale.GetProperty("opportuniteId").ValueKind);
        // Horodatages du serveur, dans l'ordre d'enregistrement : la note est plus récente que l'appel.
        Assert.True(note.GetProperty("date").GetDateTimeOffset() > appel.GetProperty("date").GetDateTimeOffset());
        // En base : rien n'a été transformé (types d'origine).
        Assert.Equal(new[] { "appel", "note", "note" }, (await LireAsync(p.Id)).Notes.OrderBy(n => n.Id).Select(n => n.Type));
    }

    [Fact]
    public async Task Un_suivi_realise_arrive_comme_evenement_de_suivi_et_non_comme_note()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Tache" + Unique(), "Préparer le dossier de financement");
        var o = p.Opportunites.Single();
        var champs = new Dictionary<string, string>
        {
            ["opportuniteId"] = "oe-" + o.Id,
            ["versionSuivi"] = ServiceProspects.EmpreinteSuivi(o.ProchaineAction, o.DateProchaineAction)!,
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Intelligence/Suivis"),
        };
        await client.PostAsync("/Prospects/RealiserSuivi", new FormUrlEncodedContent(champs));

        var inter = Interactions(await client.GetStringAsync("/Intelligence/Suivis"), p.Id);
        var realise = Assert.Single(inter, i => i.GetProperty("type").GetString() == "suivi-realise");
        Assert.StartsWith("ie-s", realise.GetProperty("id").GetString());
        Assert.DoesNotContain(inter, i => i.GetProperty("id").GetString()!.StartsWith("ie-n"));
        Assert.Empty((await LireAsync(p.Id)).Notes); // aucune note ni contact créé par la réalisation
    }

    [Fact]
    public async Task La_fiche_presente_la_derniere_activite_et_le_dernier_contact_declare_separement()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Fiche" + Unique());

        string page = await client.GetStringAsync("/Prospects/Fiche/pe-" + p.Id);

        Assert.Contains("Dernière activité", page);
        Assert.Contains("data-champ=\"dernier-contact\"", page);
        Assert.Contains("\"typesContact\":[\"appel\",\"courriel\",\"visite\"]", page);
    }

    [Fact]
    public async Task Les_notes_et_contacts_d_un_conseiller_n_arrivent_jamais_chez_un_autre()
    {
        var sophie = await _app.ConnecterAsync(Sophie);
        string u = Unique();
        var p = await CreerAsync(sophie, "Prive" + u);
        await NoterAsync(sophie, p.Id, "visite", "oe-" + p.Opportunites.Single().Id, "Visite confidentielle " + u);

        foreach (var autre in new[] { await CreerConseillerAsync(null), await CreerConseillerAsync(p.DealershipId) })
        {
            foreach (string adresse in new[] { "/Intelligence/Suivis", "/Outils/Performances", "/Relations/Pertes" })
            {
                string page = await autre.GetStringAsync(adresse);
                Assert.Empty(Interactions(page, p.Id));
                Assert.DoesNotContain("Visite confidentielle " + u, page);
            }
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
