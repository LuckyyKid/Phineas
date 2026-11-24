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
using Phineas.Tests.Infrastructure;

namespace Phineas.Tests;

// Données dont le moteur a besoin pour reconnaître un premier contact déclaré (fonctionnalité 10) : notes réelles
// (HTTP → ProspectsController.AjouterNote → MySQL de test), relues par « Mes suivis » avec leur type, leur opportunité
// et leur date serveur. La règle elle-même (estPremiereReponse) est testée dans Js/premier-contact.test.js et en E2E.
public class ProspectsPremierContactControllerTests : IClassFixture<ApplicationDeTest>
{
    private const string Sophie = "sophie.gagnon@autoprestige.example"; // conseillère, Auto Prestige Brossard

    private readonly ApplicationDeTest _app;

    public ProspectsPremierContactControllerTests(ApplicationDeTest app)
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

    // Prospect réel créé par le formulaire, à l'étape « Nouveau » (une première réponse est attendue).
    private async Task<Prospect> CreerAsync(HttpClient client, string nom)
    {
        string courriel = nom.ToLowerInvariant() + "@exemple.test";
        var champs = new Dictionary<string, string>
        {
            ["prenom"] = "Eva",
            ["nom"] = nom,
            ["courriel"] = courriel,
            ["contactPrefere"] = "courriel",
            ["source"] = "appel",
            ["modele"] = "Hyundai Kona",
            ["conseillerId"] = "moi",
            ["etape"] = "Nouveau",
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Prospects"),
        };
        Assert.Equal(HttpStatusCode.Redirect, (await client.PostAsync("/Prospects/Creer", new FormUrlEncodedContent(champs))).StatusCode);
        using var scope = _app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        int id = await db.Prospects.Where(p => p.Courriel == courriel).Select(p => p.Id).SingleAsync();
        return await LireAsync(id);
    }

    private async Task<int> AjouterOpportuniteAsync(int prospectId, string titre)
    {
        using var scope = _app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var o = new OpportuniteVente { ProspectId = prospectId, Titre = titre, Etape = EtapeVente.Nouveau };
        db.OpportunitesVente.Add(o);
        await db.SaveChangesAsync();
        return o.Id;
    }

    // Envoie le formulaire « Ajouter une note » de la fiche ; oppId null : « Le contact (général) ».
    private async Task<HttpResponseMessage> NoterAsync(HttpClient client, int prospectId, string type, string? oppId, string resume)
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
        return await client.PostAsync("/Prospects/AjouterNote", new FormUrlEncodedContent(champs));
    }

    // Données transmises au navigateur par « Mes suivis » (<script id="prospects-donnees">).
    private static JsonElement Charge(string page)
    {
        int debut = page.IndexOf("id=\"prospects-donnees\">", StringComparison.Ordinal);
        Assert.True(debut >= 0, "Données du module Prospects introuvables dans la page.");
        debut = page.IndexOf('>', debut) + 1;
        int fin = page.IndexOf("</script>", debut, StringComparison.Ordinal);
        return JsonDocument.Parse(page.Substring(debut, fin - debut)).RootElement.Clone();
    }

    private static List<JsonElement> Notes(JsonElement charge, int prospectId) =>
        charge.GetProperty("donnees").GetProperty("interactions").EnumerateArray()
            .Where(i => i.GetProperty("prospectId").GetString() == "pe-" + prospectId && i.GetProperty("id").GetString()!.StartsWith("ie-n"))
            .ToList();

    private static JsonElement Opportunite(JsonElement charge, int oppId) =>
        charge.GetProperty("donnees").GetProperty("opportunites").EnumerateArray().Single(o => o.GetProperty("id").GetString() == "oe-" + oppId);

    [Fact]
    public async Task Les_types_de_contact_et_les_notes_reelles_arrivent_a_la_page_avec_type_opportunite_et_date_serveur()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Contact" + Unique());
        int opp = p.Opportunites.Single().Id;

        await NoterAsync(client, p.Id, "note", "oe-" + opp, "Client intéressé par les véhicules hybrides.");
        await NoterAsync(client, p.Id, "appel", "oe-" + opp, "Premier appel : rappel jeudi.");

        var charge = Charge(await client.GetStringAsync("/Intelligence/Suivis"));
        // Source unique de la liste des contacts déclarés (ReferentielsVente.TypesContactDeclare).
        Assert.Equal(new[] { "appel", "courriel", "visite" }, charge.GetProperty("referentiels").GetProperty("typesContact").EnumerateArray().Select(x => x.GetString()));
        var notes = Notes(charge, p.Id);
        Assert.Equal(new[] { "appel", "note" }, notes.Select(n => n.GetProperty("type").GetString()).OrderBy(t => t));
        Assert.All(notes, n => Assert.Equal("oe-" + opp, n.GetProperty("opportuniteId").GetString()));
        // Horodatages du serveur, sur la même base que la date de la demande : postérieurs à la création de l'opportunité.
        var creation = Opportunite(charge, opp).GetProperty("dateCreation").GetDateTimeOffset();
        Assert.All(notes, n => Assert.True(n.GetProperty("date").GetDateTimeOffset() >= creation));
        // En base : les deux notes, contenu intact, catégories persistées.
        var enBase = (await LireAsync(p.Id)).Notes.OrderBy(n => n.Id).ToList();
        Assert.Equal(new[] { "note", "appel" }, enBase.Select(n => n.Type));
        Assert.Equal("Client intéressé par les véhicules hybrides.", enBase[0].Contenu);
    }

    [Fact]
    public async Task Une_note_generale_reste_sans_opportunite_et_deux_opportunites_restent_distinctes()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "DeuxOpp" + Unique());
        int a = p.Opportunites.Single().Id;
        int b = await AjouterOpportuniteAsync(p.Id, "Deuxième véhicule");

        await NoterAsync(client, p.Id, "appel", "oe-" + a, "Appel pour la première demande.");
        await NoterAsync(client, p.Id, "visite", null, "Visite générale en concession.");

        var notes = Notes(Charge(await client.GetStringAsync("/Intelligence/Suivis")), p.Id);
        var appel = Assert.Single(notes, n => n.GetProperty("type").GetString() == "appel");
        Assert.Equal("oe-" + a, appel.GetProperty("opportuniteId").GetString());
        var visite = Assert.Single(notes, n => n.GetProperty("type").GetString() == "visite");
        Assert.Equal(JsonValueKind.Null, visite.GetProperty("opportuniteId").ValueKind); // jamais attribuée à A ni à B
        Assert.DoesNotContain(notes, n => n.GetProperty("opportuniteId").ValueKind == JsonValueKind.String && n.GetProperty("opportuniteId").GetString() == "oe-" + b);
    }

    [Fact]
    public async Task Un_contact_anterieur_a_la_demande_reste_dans_l_historique_avec_sa_date_d_origine()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Ancien" + Unique());
        int opp = p.Opportunites.Single().Id;
        await NoterAsync(client, p.Id, "appel", "oe-" + opp, "Appel d'une ancienne demande.");
        using (var scope = _app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var n = await db.NotesProspect.SingleAsync(x => x.ProspectId == p.Id);
            var o = await db.OpportunitesVente.SingleAsync(x => x.Id == opp);
            n.DateCreation = o.DateCreation.AddDays(-5); // contact réel, antérieur à la nouvelle demande
            await db.SaveChangesAsync();
        }

        var charge = Charge(await client.GetStringAsync("/Intelligence/Suivis"));
        var note = Assert.Single(Notes(charge, p.Id));
        Assert.True(note.GetProperty("date").GetDateTimeOffset() < Opportunite(charge, opp).GetProperty("dateCreation").GetDateTimeOffset());
        Assert.Contains("Appel d\\u0027une ancienne demande.", await client.GetStringAsync("/Prospects/Fiche/pe-" + p.Id)); // historique conservé
    }

    [Fact]
    public async Task Sans_note_aucun_contact_n_est_transmis()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Rien" + Unique());

        Assert.Empty(Notes(Charge(await client.GetStringAsync("/Intelligence/Suivis")), p.Id));
    }

    [Fact]
    public async Task Une_opportunite_d_un_autre_dossier_ne_peut_pas_recevoir_le_contact()
    {
        var sophie = await _app.ConnecterAsync(Sophie);
        var mien = await CreerAsync(sophie, "Mien" + Unique());
        var autreClient = await CreerConseillerAsync(null);
        var sien = await CreerAsync(autreClient, "Sien" + Unique());

        // Mon prospect, mais l'opportunité d'un dossier d'une autre concession : refusé, rien n'est enregistré.
        var envoi = await NoterAsync(sophie, mien.Id, "appel", "oe-" + sien.Opportunites.Single().Id, "Tentative d'association.");

        Assert.NotEqual(HttpStatusCode.Redirect, envoi.StatusCode);
        Assert.Empty((await LireAsync(mien.Id)).Notes);
        Assert.Empty((await LireAsync(sien.Id)).Notes);
    }

    [Fact]
    public async Task Les_notes_d_un_conseiller_n_arrivent_jamais_chez_un_collegue_ou_une_autre_concession()
    {
        var sophie = await _app.ConnecterAsync(Sophie);
        string u = Unique();
        var p = await CreerAsync(sophie, "Prive" + u);
        await NoterAsync(sophie, p.Id, "appel", "oe-" + p.Opportunites.Single().Id, "Appel confidentiel " + u);

        foreach (var autre in new[] { await CreerConseillerAsync(null), await CreerConseillerAsync(p.DealershipId) })
        {
            string page = await autre.GetStringAsync("/Intelligence/Suivis");
            Assert.Empty(Notes(Charge(page), p.Id));
            Assert.DoesNotContain("Appel confidentiel " + u, page);
            Assert.Equal(HttpStatusCode.NotFound, (await NoterAsync(autre, p.Id, "appel", "oe-" + p.Opportunites.Single().Id, "Intrusion")).StatusCode);
        }
        Assert.Single((await LireAsync(p.Id)).Notes);
    }

    [Fact]
    public async Task Le_contenu_d_une_note_est_encode_dans_les_donnees_de_la_page()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var p = await CreerAsync(client, "Code" + Unique());

        await NoterAsync(client, p.Id, "courriel", "oe-" + p.Opportunites.Single().Id, "<b>Envoyé</b> le prix");

        string page = await client.GetStringAsync("/Intelligence/Suivis");
        Assert.DoesNotContain("<b>Envoyé</b>", page);
        Assert.Equal("<b>Envoyé</b> le prix", Assert.Single(Notes(Charge(page), p.Id)).GetProperty("resume").GetString());
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
