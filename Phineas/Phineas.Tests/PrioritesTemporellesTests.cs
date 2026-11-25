using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Phineas.Data;
using Phineas.Models.ViewModels.Account;
using Phineas.Services.Conseiller;
using Phineas.Tests.Infrastructure;

namespace Phineas.Tests;

// Billet #87 : données vendeur au passage du jour du serveur, avec une horloge fixée (HorlogeDeTest), jamais l'heure réelle.
// Cause démontrée de l'étape 6 de veille-recommandations.e2e.js : les données FICTIVES sont recalculées à chaque
// chargement par rapport au jour local du serveur ; au minuit du serveur, celles qui sont rattachées à un jour avancent
// d'un jour entier, alors que le jour du navigateur, lui, n'a pas changé. Les dossiers réels ne bougent pas.
// Instants : le dernier minuit local (fuseau du processus de test), moins 10 min, moins 10 s, plus 10 s.
public class PrioritesTemporellesTests : IClassFixture<ApplicationDeTest>
{
    private const string Sophie = "sophie.gagnon@autoprestige.example";
    private static readonly TimeSpan DixSecondes = TimeSpan.FromSeconds(10);

    private readonly ApplicationDeTest _app;

    public PrioritesTemporellesTests(ApplicationDeTest app)
    {
        _app = app;
    }

    // Dernier minuit local : un instant passé, donc la connexion (cookie de 8 h émis à l'heure réelle) reste valide avec
    // l'horloge fixée, quelle que soit l'heure à laquelle le test est lancé.
    private static DateTimeOffset DernierMinuit()
    {
        var minuit = DateTime.Today;
        return new DateTimeOffset(minuit, TimeZoneInfo.Local.GetUtcOffset(minuit));
    }

    private static HorlogeDeTest HorlogeA(DateTimeOffset instant)
    {
        var horloge = new HorlogeDeTest();
        horloge.Fixer(instant);
        return horloge;
    }

    private static Task<Phineas.Models.ViewModels.Conseiller.DonneesProspects> ProspectsFictifsA(DateTimeOffset instant) =>
        new ServiceProspectsDemo(HorlogeA(instant)).ObtenirAsync(new UserSummaryViewModel());

    // Écart entre deux chargements pour chaque suivi fictif (même opportunité), en ignorant les suivis absents.
    private static async Task<List<TimeSpan>> EcartsDesSuivis(DateTimeOffset avant, DateTimeOffset apres)
    {
        var a = (await ProspectsFictifsA(avant)).Opportunites.Where(o => o.DateProchaineAction is not null).ToDictionary(o => o.Id, o => o.DateProchaineAction!.Value);
        var b = (await ProspectsFictifsA(apres)).Opportunites.Where(o => o.DateProchaineAction is not null).ToDictionary(o => o.Id, o => o.DateProchaineAction!.Value);
        Assert.Equal(a.Keys.OrderBy(k => k), b.Keys.OrderBy(k => k));
        return a.Keys.Select(id => b[id] - a[id]).ToList();
    }

    // ---------- Services de démonstration, horloge fixée ----------

    [Fact]
    public async Task Sans_horloge_fixee_les_dates_fictives_restent_celles_de_DateTime_Now()
    {
        var avant = DateTime.Now;
        var donnees = await new ServiceProspectsDemo().ObtenirAsync(new UserSummaryViewModel());
        var apres = DateTime.Now;

        // Même type de date que DateTime.Now : la sérialisation JSON envoyée au navigateur ne change pas.
        var suivis = donnees.Opportunites.Where(o => o.DateProchaineAction is not null).Select(o => o.DateProchaineAction!.Value).ToList();
        Assert.NotEmpty(suivis);
        Assert.All(suivis, d => Assert.Equal(DateTimeKind.Local, d.Kind));
        Assert.Contains(suivis, d => d.Date >= avant.Date && d.Date <= apres.Date.AddDays(1));
    }

    [Fact]
    public async Task Deux_chargements_le_meme_jour_du_serveur_gardent_les_memes_jours_de_suivi()
    {
        var minuit = DernierMinuit();

        var ecarts = await EcartsDesSuivis(minuit - TimeSpan.FromMinutes(10), minuit - DixSecondes);

        // Suivis rattachés à un jour (j, j + 1…) : identiques. Suivis rattachés à « maintenant » : avancent de 9 min 50 s.
        Assert.All(ecarts, e => Assert.True(e == TimeSpan.Zero || e == TimeSpan.FromSeconds(590), "écart inattendu : " + e));
        Assert.Contains(TimeSpan.Zero, ecarts);
    }

    [Fact]
    public async Task Au_minuit_du_serveur_les_suivis_fictifs_rattaches_a_un_jour_avancent_d_un_jour_entier()
    {
        var minuit = DernierMinuit();

        var ecarts = await EcartsDesSuivis(minuit - DixSecondes, minuit + DixSecondes);

        // C'est le changement observé à l'étape 6 : le jeu fictif change de jour, le navigateur non.
        Assert.All(ecarts, e => Assert.True(e == TimeSpan.FromDays(1) || e == TimeSpan.FromSeconds(20), "écart inattendu : " + e));
        Assert.Contains(TimeSpan.FromDays(1), ecarts);
    }

    [Fact]
    public async Task Les_rendez_vous_fictifs_suivent_la_meme_regle_au_minuit_du_serveur()
    {
        var minuit = DernierMinuit();
        var u = new UserSummaryViewModel();
        var avant = (await new ServiceRendezVousDemo(HorlogeA(minuit - DixSecondes)).ObtenirAsync(u)).RendezVous.ToDictionary(r => r.Id, r => r.Debut);
        var meme = (await new ServiceRendezVousDemo(HorlogeA(minuit - TimeSpan.FromMinutes(10))).ObtenirAsync(u)).RendezVous.ToDictionary(r => r.Id, r => r.Debut);
        var apres = (await new ServiceRendezVousDemo(HorlogeA(minuit + DixSecondes)).ObtenirAsync(u)).RendezVous.ToDictionary(r => r.Id, r => r.Debut);

        // Certains rendez-vous fictifs sont placés sur la demi-heure qui suit « maintenant » : seuls ceux qui sont
        // rattachés à un jour avancent d'un jour entier, et seulement au minuit du serveur.
        Assert.Contains(avant.Keys, id => apres[id] - avant[id] == TimeSpan.FromDays(1));
        Assert.DoesNotContain(avant.Keys, id => avant[id] - meme[id] >= TimeSpan.FromDays(1));
    }

    // ---------- Application complète : dossier réel et données fictives, même page, deux jours du serveur ----------

    private static List<(string Id, string? Date)> Opportunites(string page)
    {
        const string marque = "id=\"prospects-donnees\">";
        int debut = page.IndexOf(marque, StringComparison.Ordinal) + marque.Length;
        string json = page.Substring(debut, page.IndexOf("</script>", debut, StringComparison.Ordinal) - debut);
        return JsonDocument.Parse(json).RootElement.GetProperty("donnees").GetProperty("opportunites").EnumerateArray()
            .Select(o => (o.GetProperty("id").GetString()!, o.GetProperty("dateProchaineAction").ValueKind == JsonValueKind.Null ? null : o.GetProperty("dateProchaineAction").GetString()))
            .ToList();
    }

    private async Task<(int, int, int, int, int)> LignesEnBaseAsync()
    {
        using var scope = _app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return (await db.Prospects.CountAsync(), await db.OpportunitesVente.CountAsync(), await db.HistoriquesSuiviOpportunite.CountAsync(),
            await db.NotesProspect.CountAsync(), await db.VeillesRecommandation.CountAsync());
    }

    [Fact]
    public async Task Au_minuit_du_serveur_le_dossier_reel_ne_bouge_pas_les_fictifs_changent_de_jour_et_rien_n_est_ecrit()
    {
        var client = await _app.ConnecterAsync(Sophie);
        string u = Guid.NewGuid().ToString("N").Substring(0, 8);
        string jeton = ApplicationDeTest.JetonAntiforgery(await client.GetStringAsync("/Prospects"));
        var creation = await client.PostAsync("/Prospects/Creer", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["prenom"] = "Ana", ["nom"] = "Minuit" + u, ["courriel"] = "minuit." + u + "@exemple.test", ["contactPrefere"] = "courriel",
            ["source"] = "appel", ["modele"] = "Kia Sportage", ["conseillerId"] = "moi", ["etape"] = "Nouveau",
            ["prochaineAction"] = "Rappeler " + u, ["dateSuivi"] = DateTime.Today.AddDays(1).ToString("yyyy-MM-dd"),
            ["__RequestVerificationToken"] = jeton,
        }));
        Assert.Equal(HttpStatusCode.Redirect, creation.StatusCode);
        var lignes = await LignesEnBaseAsync();
        var minuit = DernierMinuit();

        List<(string Id, string? Date)> avant, meme, apres;
        try
        {
            _app.Horloge.Fixer(minuit - TimeSpan.FromMinutes(10));
            meme = Opportunites(await client.GetStringAsync("/Intelligence"));
            _app.Horloge.Fixer(minuit - DixSecondes);
            avant = Opportunites(await client.GetStringAsync("/Intelligence"));
            _app.Horloge.Avancer(TimeSpan.FromSeconds(20));
            apres = Opportunites(await client.GetStringAsync("/Intelligence"));
        }
        finally
        {
            _app.Horloge.Liberer();
        }

        var reelAvant = avant.Where(o => o.Id.StartsWith("oe-")).ToList();
        Assert.Single(reelAvant);
        Assert.Equal(reelAvant, apres.Where(o => o.Id.StartsWith("oe-")).ToList());
        Assert.Equal(reelAvant, meme.Where(o => o.Id.StartsWith("oe-")).ToList());

        // Fictifs : au moins un suivi rattaché à un jour avance d'un jour entier entre « avant » et « après ».
        var fictifsAvant = avant.Where(o => !o.Id.StartsWith("oe-") && o.Date is not null).ToDictionary(o => o.Id, o => DateTimeOffset.Parse(o.Date!));
        var fictifsApres = apres.Where(o => !o.Id.StartsWith("oe-") && o.Date is not null).ToDictionary(o => o.Id, o => DateTimeOffset.Parse(o.Date!));
        Assert.Contains(fictifsAvant.Keys, id => fictifsApres[id] - fictifsAvant[id] == TimeSpan.FromDays(1));
        // Même jour du serveur : aucun suivi rattaché à un jour ne bouge.
        var fictifsMeme = meme.Where(o => !o.Id.StartsWith("oe-") && o.Date is not null).ToDictionary(o => o.Id, o => DateTimeOffset.Parse(o.Date!));
        Assert.DoesNotContain(fictifsMeme.Keys, id => fictifsAvant[id] - fictifsMeme[id] == TimeSpan.FromDays(1));

        // Trois lectures, aucune écriture.
        Assert.Equal(lignes, await LignesEnBaseAsync());
    }
}
