using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Phineas.Data;
using Phineas.Models.Entities;
using Phineas.Tests.Infrastructure;

namespace Phineas.Tests;

// Protection des obligations réelles contre les états locaux (fonctionnalité 15), côté serveur et MySQL de test.
// La correction est dans le navigateur (intelligence-regles.js, intelligence-store.js) : ces tests vérifient que les
// données réelles sur lesquelles elle s'appuie arrivent bien aux trois surfaces (Accueil, Centre d'actions, Mes suivis),
// qu'aucune préférence ni pause n'est transmise pour un dossier réel, qu'aucune route n'enregistre un statut local et
// que la consultation des pages n'écrit rien (ni « Réalisé », ni attribution, ni historique).
// Le comportement des statuts locaux est testé dans Js/statuts-locaux.test.js et E2E/statuts-locaux.e2e.js.
public class StatutsLocauxDonneesTests : IClassFixture<ApplicationDeTest>
{
    private const string Sophie = "sophie.gagnon@autoprestige.example"; // conseillère, Auto Prestige Brossard
    private const string Suivi = "Préparer le dossier de financement";

    private readonly ApplicationDeTest _app;

    public StatutsLocauxDonneesTests(ApplicationDeTest app)
    {
        _app = app;
    }

    private static string Unique() => Guid.NewGuid().ToString("N").Substring(0, 8);

    private async Task<OpportuniteVente> CreerAsync(HttpClient client, string nom)
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
            ["prochaineAction"] = Suivi,
            ["dateSuivi"] = DateTime.Today.ToString("yyyy-MM-dd"),
            ["__RequestVerificationToken"] = ApplicationDeTest.JetonAntiforgery(await client.GetStringAsync("/Prospects")),
        };
        Assert.Equal(HttpStatusCode.Redirect, (await client.PostAsync("/Prospects/Creer", new FormUrlEncodedContent(champs))).StatusCode);
        using var scope = _app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.OpportunitesVente.AsNoTracking().Include(o => o.Prospect).SingleAsync(o => o.Prospect!.Courriel == courriel);
    }

    // Contenu JSON d'une balise <script id="…"> de la page.
    private static JsonElement Balise(string page, string id)
    {
        int debut = page.IndexOf("id=\"" + id + "\">", StringComparison.Ordinal);
        Assert.True(debut >= 0, "Balise " + id + " introuvable.");
        debut = page.IndexOf('>', debut) + 1;
        int fin = page.IndexOf("</script>", debut, StringComparison.Ordinal);
        return JsonDocument.Parse(page.Substring(debut, fin - debut)).RootElement.Clone();
    }

    // Le dossier tel qu'il est en base : suivi, étape, conseiller, notes, historiques.
    private async Task<string> EmpreinteAsync(OpportuniteVente o)
    {
        using var scope = _app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var x = await db.OpportunitesVente.AsNoTracking().Include(v => v.Prospect).SingleAsync(v => v.Id == o.Id);
        int notes = await db.NotesProspect.CountAsync(n => n.ProspectId == x.ProspectId);
        int suivis = await db.HistoriquesSuiviOpportunite.CountAsync(h => h.OpportuniteId == x.Id);
        int etapes = await db.HistoriquesEtapeOpportunite.CountAsync(h => h.OpportuniteId == x.Id);
        int veilles = await db.VeillesRecommandation.CountAsync(v => v.OpportuniteId == x.Id);
        return $"{x.ProchaineAction}|{x.DateProchaineAction:O}|{x.Etape}|{x.Prospect!.ConseillerId}|{x.DerniereActivite:O}|{notes}|{suivis}|{etapes}|{veilles}";
    }

    [Theory]
    [InlineData("/Conseiller")]
    [InlineData("/Intelligence")]
    [InlineData("/Intelligence/Suivis")]
    public async Task Le_suivi_reel_echu_arrive_a_chaque_surface_et_aucune_preference_ni_pause_n_est_envoyee_pour_un_dossier_reel(string adresse)
    {
        var client = await _app.ConnecterAsync(Sophie);
        var o = await CreerAsync(client, "Surface" + Unique());

        string page = await client.GetStringAsync(adresse);

        var donnees = Balise(page, "prospects-donnees").GetProperty("donnees");
        var reelle = Assert.Single(donnees.GetProperty("opportunites").EnumerateArray(), x => x.GetProperty("id").GetString() == "oe-" + o.Id);
        Assert.Equal(Suivi, reelle.GetProperty("prochaineAction").GetString());
        // Le dossier reste attribué au conseiller connecté (« moi ») : aucun statut local ne le confie à un autre.
        var contact = Assert.Single(donnees.GetProperty("contacts").EnumerateArray(), x => x.GetProperty("id").GetString() == "pe-" + o.ProspectId);
        Assert.Equal("moi", contact.GetProperty("conseillerId").GetString());
        var intel = Balise(page, "intelligence-donnees").GetProperty("donnees");
        Assert.DoesNotContain(intel.GetProperty("preferences").EnumerateArray(), p => p.GetProperty("prospectId").GetString()!.StartsWith("pe-"));
        Assert.DoesNotContain(intel.GetProperty("pauses").EnumerateArray(), p => p.GetProperty("opportuniteId").GetString()!.StartsWith("oe-"));
    }

    [Theory]
    [InlineData("/Intelligence/Ignorer")]
    [InlineData("/Intelligence/Commencer")]
    [InlineData("/Intelligence/Confier")]
    [InlineData("/Intelligence/Terminer")]
    [InlineData("/Intelligence/MettreEnPause")]
    [InlineData("/Intelligence/Preferences")]
    public async Task Aucune_route_n_enregistre_un_statut_local_et_rien_n_est_ecrit(string adresse)
    {
        var client = await _app.ConnecterAsync(Sophie);
        var o = await CreerAsync(client, "Route" + Unique());
        string avant = await EmpreinteAsync(o);
        var champs = new Dictionary<string, string>
        {
            ["id"] = "suivi-echeance:oe-" + o.Id + ":" + DateTime.Today.ToString("yyyy-MM-dd"),
            ["cle"] = "premiere-reponse:oe-" + o.Id,
            ["opportuniteId"] = "oe-" + o.Id,
            ["collegueId"] = "c-antoine",
            ["__RequestVerificationToken"] = ApplicationDeTest.JetonAntiforgery(await client.GetStringAsync("/Intelligence")),
        };

        var envoi = await client.PostAsync(adresse, new FormUrlEncodedContent(champs));

        Assert.Equal(HttpStatusCode.NotFound, envoi.StatusCode);
        Assert.Equal(avant, await EmpreinteAsync(o));
    }

    [Fact]
    public async Task Consulter_les_trois_surfaces_n_ecrit_rien_ni_realisation_ni_attribution_ni_historique()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var o = await CreerAsync(client, "Lecture" + Unique());
        string avant = await EmpreinteAsync(o);

        foreach (var adresse in new[] { "/Conseiller", "/Intelligence", "/Intelligence/Suivis", "/Intelligence/Suivis?vue=a-venir", "/Prospects/Fiche/pe-" + o.ProspectId })
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(adresse)).StatusCode);

        Assert.Equal(avant, await EmpreinteAsync(o));
    }
}
