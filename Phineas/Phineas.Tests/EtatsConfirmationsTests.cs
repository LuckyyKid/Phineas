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

// Fiabilité des confirmations, états et indicateurs vendeur (fonctionnalité 16), sur MySQL de test.
// G8 : les événements de suivi enregistrés (réalisé, reporté, remplacé) arrivent au navigateur avec leur jour prévu,
//      pour relier une réalisation à la bonne recommandation ; seulement ceux du conseiller.
// G1 : chaque écran affiche la mention réel/démonstration qui lui correspond (MentionsDonnees).
// Messages : Intelligence/_DonneesModules ne consomme plus le message d'une page qui ne l'affiche pas.
// Le comportement du navigateur est testé dans Js/etats-confirmations.test.js et E2E/etats-confirmations.e2e.js.
public class EtatsConfirmationsTests : IClassFixture<ApplicationDeTest>
{
    private const string Sophie = "sophie.gagnon@autoprestige.example"; // conseillère, Auto Prestige Brossard
    private const string Suivi = "Préparer le dossier de financement";

    private readonly ApplicationDeTest _app;

    public EtatsConfirmationsTests(ApplicationDeTest app)
    {
        _app = app;
    }

    private static string Unique() => Guid.NewGuid().ToString("N").Substring(0, 8);

    private static async Task<string> JetonAsync(HttpClient client, string adresse) =>
        ApplicationDeTest.JetonAntiforgery(await client.GetStringAsync(adresse));

    private async Task<OpportuniteVente> CreerAsync(HttpClient client, string nom, int decalageJours = 0)
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
            ["dateSuivi"] = DateTime.Today.AddDays(decalageJours).ToString("yyyy-MM-dd"),
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Prospects"),
        };
        Assert.Equal(HttpStatusCode.Redirect, (await client.PostAsync("/Prospects/Creer", new FormUrlEncodedContent(champs))).StatusCode);
        using var scope = _app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.OpportunitesVente.AsNoTracking().Include(o => o.Prospect).SingleAsync(o => o.Prospect!.Courriel == courriel);
    }

    private async Task<HttpResponseMessage> RealiserAsync(HttpClient client, OpportuniteVente o, string retour)
    {
        var champs = new Dictionary<string, string>
        {
            ["opportuniteId"] = "oe-" + o.Id,
            ["versionSuivi"] = ServiceProspects.EmpreinteSuivi(o.ProchaineAction, o.DateProchaineAction)!,
            ["retour"] = retour,
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Intelligence"),
        };
        return await client.PostAsync("/Prospects/RealiserSuivi", new FormUrlEncodedContent(champs));
    }

    private static JsonElement Prospects(string page)
    {
        int debut = page.IndexOf("id=\"prospects-donnees\">", StringComparison.Ordinal);
        Assert.True(debut >= 0, "Données du module Prospects introuvables.");
        debut = page.IndexOf('>', debut) + 1;
        int fin = page.IndexOf("</script>", debut, StringComparison.Ordinal);
        return JsonDocument.Parse(page.Substring(debut, fin - debut)).RootElement.Clone();
    }

    private static List<JsonElement> EvenementsSuivi(string page, OpportuniteVente o) =>
        Prospects(page).GetProperty("donnees").GetProperty("interactions").EnumerateArray()
            .Where(i => i.GetProperty("opportuniteId").GetString() == "oe-" + o.Id && i.GetProperty("type").GetString()!.StartsWith("suivi-"))
            .ToList();

    // ---------- G8 : jour prévu des événements de suivi ----------

    [Fact]
    public async Task Une_realisation_enregistree_arrive_avec_son_jour_prevu_et_un_report_est_distingue()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var realise = await CreerAsync(client, "Realise" + Unique());
        var reporte = await CreerAsync(client, "Reporte" + Unique());
        await RealiserAsync(client, realise, "/Intelligence");
        var report = new Dictionary<string, string>
        {
            ["opportuniteId"] = "oe-" + reporte.Id,
            ["versionSuivi"] = ServiceProspects.EmpreinteSuivi(reporte.ProchaineAction, reporte.DateProchaineAction)!,
            ["date"] = DateTime.Today.AddDays(3).ToString("yyyy-MM-dd"),
            ["retour"] = "/Intelligence",
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Intelligence"),
        };
        Assert.Equal(HttpStatusCode.Redirect, (await client.PostAsync("/Prospects/ReporterSuivi", new FormUrlEncodedContent(report))).StatusCode);

        string page = await client.GetStringAsync("/Intelligence");

        var r = Assert.Single(EvenementsSuivi(page, realise));
        Assert.Equal("suivi-realise", r.GetProperty("type").GetString());
        Assert.Equal(realise.DateProchaineAction!.Value.Date, r.GetProperty("datePrevue").GetDateTime().Date);
        Assert.Equal(Suivi, r.GetProperty("actionPrevue").GetString());
        var p = Assert.Single(EvenementsSuivi(page, reporte));
        Assert.Equal("suivi-reporte", p.GetProperty("type").GetString());
        Assert.Equal(reporte.DateProchaineAction!.Value.Date, p.GetProperty("datePrevue").GetDateTime().Date);
        // Une note ou un contact n'a jamais de jour prévu : seuls les événements de suivi le portent.
        Assert.All(Prospects(page).GetProperty("donnees").GetProperty("interactions").EnumerateArray()
            .Where(i => !i.GetProperty("type").GetString()!.StartsWith("suivi-")),
            i => Assert.True(!i.TryGetProperty("datePrevue", out var d) || d.ValueKind == JsonValueKind.Null));
    }

    [Fact]
    public async Task Un_remplacement_enregistre_porte_le_jour_de_l_ancienne_action()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var o = await CreerAsync(client, "Remplace" + Unique());
        Prospect prospect;
        using (var scope = _app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            prospect = await db.Prospects.AsNoTracking().Include(x => x.Opportunites).SingleAsync(x => x.Id == o.ProspectId);
        }
        var champs = new Dictionary<string, string>
        {
            ["prospectId"] = "pe-" + o.ProspectId,
            ["opportuniteId"] = "oe-" + o.Id,
            ["action"] = "Nouvelle action " + Unique(),
            ["date"] = DateTime.Today.AddDays(2).ToString("yyyy-MM-dd"),
            ["version"] = ServiceProspects.Empreinte(prospect),
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Prospects/Fiche/pe-" + o.ProspectId),
        };
        Assert.Equal(HttpStatusCode.Redirect, (await client.PostAsync("/Prospects/PlanifierSuivi", new FormUrlEncodedContent(champs))).StatusCode);

        using (var scope = _app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            Assert.Equal(ClotureSuivi.Remplace, (await db.HistoriquesSuiviOpportunite.SingleAsync(h => h.OpportuniteId == o.Id)).Cloture);
        }
        var e = Assert.Single(EvenementsSuivi(await client.GetStringAsync("/Intelligence/Suivis"), o));
        Assert.Equal("suivi-remplace", e.GetProperty("type").GetString());
        Assert.Equal(o.DateProchaineAction!.Value.Date, e.GetProperty("datePrevue").GetDateTime().Date);
    }

    // Deux suivis successifs prévus le même jour : chaque clôture porte sa propre action, ce qui permet au navigateur de
    // ne jamais attribuer la réalisation de A au report de B (IntelligenceRegles.issueSuiviEnregistree).
    [Fact]
    public async Task Deux_suivis_du_meme_jour_gardent_chacun_leur_action_et_leur_issue()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var o = await CreerAsync(client, "MemeJour" + Unique());
        await RealiserAsync(client, o, "/Intelligence"); // A : « Préparer le dossier de financement », réalisé

        Prospect prospect;
        using (var scope = _app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            prospect = await db.Prospects.AsNoTracking().Include(x => x.Opportunites).SingleAsync(x => x.Id == o.ProspectId);
        }
        string actionB = "Rappeler pour l'essai " + Unique();
        var planification = new Dictionary<string, string>
        {
            ["prospectId"] = "pe-" + o.ProspectId,
            ["opportuniteId"] = "oe-" + o.Id,
            ["action"] = actionB,
            ["date"] = DateTime.Today.ToString("yyyy-MM-dd"),
            ["version"] = ServiceProspects.Empreinte(prospect),
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Prospects/Fiche/pe-" + o.ProspectId),
        };
        Assert.Equal(HttpStatusCode.Redirect, (await client.PostAsync("/Prospects/PlanifierSuivi", new FormUrlEncodedContent(planification))).StatusCode);
        OpportuniteVente b;
        using (var scope = _app.Services.CreateScope())
            b = await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().OpportunitesVente.AsNoTracking().SingleAsync(x => x.Id == o.Id);
        var report = new Dictionary<string, string>
        {
            ["opportuniteId"] = "oe-" + o.Id,
            ["versionSuivi"] = ServiceProspects.EmpreinteSuivi(b.ProchaineAction, b.DateProchaineAction)!,
            ["date"] = DateTime.Today.AddDays(3).ToString("yyyy-MM-dd"),
            ["retour"] = "/Intelligence",
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Intelligence"),
        };
        Assert.Equal(HttpStatusCode.Redirect, (await client.PostAsync("/Prospects/ReporterSuivi", new FormUrlEncodedContent(report))).StatusCode);

        var evenements = EvenementsSuivi(await client.GetStringAsync("/Intelligence"), o);

        Assert.Equal(2, evenements.Count);
        var realise = Assert.Single(evenements, e => e.GetProperty("type").GetString() == "suivi-realise");
        var reporte = Assert.Single(evenements, e => e.GetProperty("type").GetString() == "suivi-reporte");
        Assert.Equal(Suivi, realise.GetProperty("actionPrevue").GetString());
        Assert.Equal(actionB, reporte.GetProperty("actionPrevue").GetString());
        Assert.Equal(DateTime.Today, realise.GetProperty("datePrevue").GetDateTime().Date);
        Assert.Equal(DateTime.Today, reporte.GetProperty("datePrevue").GetDateTime().Date); // même jour prévu : seule l'action les distingue
        Assert.Equal(DateTime.Today, realise.GetProperty("date").GetDateTime().Date);      // date de réalisation (clôture), pas d'échéance
        using (var scope = _app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var clotures = await db.HistoriquesSuiviOpportunite.AsNoTracking().Where(h => h.OpportuniteId == o.Id).OrderBy(h => h.Id).Select(h => h.Cloture).ToListAsync();
            Assert.Equal(new[] { ClotureSuivi.Realise, ClotureSuivi.Reporte }, clotures); // aucune réalisation artificielle
        }
    }

    [Fact]
    public async Task Les_evenements_de_suivi_d_un_autre_conseiller_ou_d_une_autre_concession_ne_sont_jamais_transmis()
    {
        var sophie = await _app.ConnecterAsync(Sophie);
        var o = await CreerAsync(sophie, "Isole" + Unique());
        await RealiserAsync(sophie, o, "/Intelligence");

        foreach (var autre in new[] { await CreerConseillerAsync(o.Prospect!.DealershipId), await CreerConseillerAsync(null) })
        {
            string page = await autre.GetStringAsync("/Intelligence");
            Assert.Empty(EvenementsSuivi(page, o));
            Assert.DoesNotContain("oe-" + o.Id, page);
        }
    }

    // ---------- G1 : mentions réel / démonstration ----------

    [Theory]
    [InlineData("/Intelligence", "EcranMixte")]
    [InlineData("/Intelligence/Suivis", "EcranMixte")]
    [InlineData("/Prospects", "EcranMixte")]
    [InlineData("/RendezVous", "ModuleSimule")]
    [InlineData("/Soumissions", "ModuleSimule")]
    [InlineData("/Transactions", "ModuleSimule")]
    [InlineData("/Relations/Pertes", "ModuleSimule")]
    [InlineData("/Outils/Performances", "ModuleSimule")]
    [InlineData("/Intelligence/Vehicules", "ModuleSimule")]
    public async Task Chaque_ecran_affiche_la_mention_qui_correspond_a_ce_qu_il_enregistre(string adresse, string mention)
    {
        var client = await _app.ConnecterAsync(Sophie);
        string attendu = mention == "EcranMixte" ? MentionsDonnees.EcranMixte : MentionsDonnees.ModuleSimule;

        string page = WebUtility.HtmlDecode(await client.GetStringAsync(adresse));

        Assert.Contains(attendu, page);
        Assert.DoesNotContain("Rien n'est enregistré en base", page);
    }

    [Fact]
    public async Task L_accueil_et_les_fiches_n_annoncent_plus_que_rien_n_est_enregistre()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var o = await CreerAsync(client, "Mention" + Unique());

        string accueil = WebUtility.HtmlDecode(await client.GetStringAsync("/Conseiller"));
        string fiche = WebUtility.HtmlDecode(await client.GetStringAsync("/Prospects/Fiche/pe-" + o.ProspectId));

        Assert.Contains(MentionsDonnees.Accueil, accueil);
        Assert.DoesNotContain("rien n'est enregistré", accueil);
        Assert.Contains(MentionsDonnees.BandeauTexte, fiche);
    }

    // Bandeau corrigé avec F23 : affiché tel quel sur la fiche d'un dossier enregistré et sur celle d'un dossier fictif,
    // il annonce enregistrés la qualification, les véhicules envisagés et les rendez-vous des dossiers enregistrés, et
    // seulement les dossiers fictifs, soumissions, transactions et rendez-vous de démonstration comme locaux.
    [Fact]
    public async Task Le_bandeau_des_fiches_reelles_et_fictives_annonce_exactement_ce_qui_est_enregistre()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var o = await CreerAsync(client, "Bandeau" + Unique());

        string reelle = WebUtility.HtmlDecode(await client.GetStringAsync("/Prospects/Fiche/pe-" + o.ProspectId));
        string fictive = WebUtility.HtmlDecode(await client.GetStringAsync("/Prospects/Fiche/chloe-bouchard"));
        string[] phrases = MentionsDonnees.BandeauTexte.Split("sont enregistrés en base de données.");

        Assert.Contains(MentionsDonnees.BandeauTexte, reelle);
        Assert.Contains(MentionsDonnees.BandeauTexte, fictive);
        Assert.Equal(2, phrases.Length);
        foreach (var persiste in new[] { "dossiers enregistrés", "qualifications", "véhicules envisagés", "rendez-vous commerciaux" })
            Assert.Contains(persiste, phrases[0]);
        Assert.DoesNotContain("soumission", phrases[0]);
        Assert.DoesNotContain("transaction", phrases[0]);
        Assert.Contains("dossiers fictifs", phrases[1]);
        Assert.Contains("les soumissions et les transactions, restent locaux à cet onglet et ne sont pas enregistrés en base", phrases[1]);
        Assert.Contains("rendez-vous de démonstration restent également fictifs", phrases[1]);
        foreach (var page in new[] { reelle, fictive })
        {
            Assert.DoesNotContain("disparaît à sa fermeture", page);
            Assert.DoesNotContain("qualification détaillée, véhicules envisagés, rendez-vous", page);
        }
    }

    // ---------- Messages du serveur (TempData) ----------

    [Theory]
    [InlineData("/Outils/Performances")]
    [InlineData("/Outils/Annonces")]
    [InlineData("/Relations/Statistiques")]
    [InlineData("/Transactions")]
    [InlineData("/Transactions/Nouvelle")]
    public async Task Une_page_qui_n_affiche_pas_le_message_ne_le_consomme_plus(string pageSansMessage)
    {
        var client = await _app.ConnecterAsync(Sophie);
        var o = await CreerAsync(client, "Message" + Unique());
        await RealiserAsync(client, o, "/Intelligence");

        var sans = Prospects(await client.GetStringAsync(pageSansMessage)).GetProperty("enregistrement");
        Assert.Equal(JsonValueKind.Null, sans.GetProperty("confirmation").ValueKind);

        var avec = Prospects(await client.GetStringAsync("/Intelligence")).GetProperty("enregistrement");
        Assert.Equal("Suivi marqué comme réalisé et ajouté à l'historique du dossier.", avec.GetProperty("confirmation").GetString());
        var ensuite = Prospects(await client.GetStringAsync("/Intelligence")).GetProperty("enregistrement");
        Assert.Equal(JsonValueKind.Null, ensuite.GetProperty("confirmation").ValueKind); // affiché une seule fois
    }

    [Fact]
    public async Task Un_refus_du_serveur_n_est_pas_consomme_par_une_page_qui_ne_l_affiche_pas()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var o = await CreerAsync(client, "Refus" + Unique());
        var champs = new Dictionary<string, string>
        {
            ["opportuniteId"] = "oe-" + o.Id,
            ["versionSuivi"] = ServiceProspects.EmpreinteSuivi("Autre action", o.DateProchaineAction)!, // page périmée
            ["retour"] = "/Intelligence",
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Intelligence"),
        };
        await client.PostAsync("/Prospects/RealiserSuivi", new FormUrlEncodedContent(champs));

        var sans = Prospects(await client.GetStringAsync("/Relations/Statistiques")).GetProperty("enregistrement");
        Assert.Equal(JsonValueKind.Null, sans.GetProperty("erreur").ValueKind);
        var avec = Prospects(await client.GetStringAsync("/Intelligence")).GetProperty("enregistrement");
        Assert.StartsWith("Suivi non marqué comme réalisé.", avec.GetProperty("erreur").GetString());
        Assert.Equal(JsonValueKind.Null, Prospects(await client.GetStringAsync("/Intelligence")).GetProperty("enregistrement").GetProperty("erreur").ValueKind);
    }

    [Theory]
    [InlineData("/Intelligence/Suivis")]
    [InlineData("/Relations/Pertes")]
    [InlineData("/Outils/Assistant")]
    public async Task Une_page_qui_affiche_le_message_le_recoit_toujours(string page)
    {
        var client = await _app.ConnecterAsync(Sophie);
        var o = await CreerAsync(client, "Recoit" + Unique());

        var envoi = await RealiserAsync(client, o, page);

        Assert.Equal(page, envoi.Headers.Location!.ToString());
        var e = Prospects(await client.GetStringAsync(page)).GetProperty("enregistrement");
        Assert.Equal("Suivi marqué comme réalisé et ajouté à l'historique du dossier.", e.GetProperty("confirmation").GetString());
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
