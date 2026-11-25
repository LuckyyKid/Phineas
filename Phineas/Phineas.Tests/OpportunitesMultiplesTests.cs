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
using Phineas.Services.Conseiller;
using Phineas.Tests.Infrastructure;

namespace Phineas.Tests;

// Fonctionnalité 18 : plusieurs opportunités réelles pour un même prospect, sur MySQL de test et par de vraies requêtes.
// Une nouvelle opportunité s'ajoute au prospect existant (jamais un nouveau prospect) ; chaque opportunité garde son
// étape, ses suivis, ses notes, son historique et ses veilles ; un dossier inaccessible ne reçoit rien.
public class OpportunitesMultiplesTests : IClassFixture<ApplicationDeTest>
{
    private const string Sophie = "sophie.gagnon@autoprestige.example"; // conseillère, Auto Prestige Brossard

    private readonly ApplicationDeTest _app;

    public OpportunitesMultiplesTests(ApplicationDeTest app)
    {
        _app = app;
    }

    private static string Unique() => Guid.NewGuid().ToString("N").Substring(0, 8);

    private static async Task<string> JetonAsync(HttpClient client, string page) =>
        ApplicationDeTest.JetonAntiforgery(await client.GetStringAsync(page));

    private static Task<HttpResponseMessage> PosterAsync(HttpClient client, string url, Dictionary<string, string> champs) =>
        client.PostAsync(url, new FormUrlEncodedContent(champs));

    // Prospect enregistré par le formulaire de création (F01) : une première opportunité, étape « Nouveau ».
    private async Task<int> CreerProspectAsync(HttpClient client)
    {
        string u = Unique();
        var champs = new Dictionary<string, string>
        {
            ["prenom"] = "Ana", ["nom"] = "Multi" + u, ["courriel"] = "multi." + u + "@exemple.test", ["contactPrefere"] = "courriel",
            ["source"] = "appel", ["modele"] = "Kia Sportage", ["conseillerId"] = "moi", ["etape"] = "Nouveau",
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Prospects"),
        };
        Assert.Equal(HttpStatusCode.Redirect, (await PosterAsync(client, "/Prospects/Creer", champs)).StatusCode);
        using var scope = _app.Services.CreateScope();
        return (await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Prospects.SingleAsync(p => p.Nom == "Multi" + u)).Id;
    }

    // Le prospect tel qu'en base, avec ses opportunités, leurs historiques, ses notes et les veilles de ses opportunités.
    private async Task<Prospect> LireAsync(int prospectId)
    {
        using var scope = _app.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Prospects.AsNoTracking()
            .Include(p => p.Opportunites).ThenInclude(o => o.HistoriqueEtapes)
            .Include(p => p.Opportunites).ThenInclude(o => o.HistoriqueSuivis)
            .Include(p => p.Notes)
            .SingleAsync(p => p.Id == prospectId);
    }

    private async Task<string> VersionAsync(int prospectId) => ServiceProspects.Empreinte(await LireAsync(prospectId));

    private async Task<HttpResponseMessage> CreerOpportuniteAsync(HttpClient client, int prospectId, string titre, string etape = "AQualifier",
        string? version = null, string? categorie = null)
    {
        var champs = new Dictionary<string, string>
        {
            ["prospectId"] = "pe-" + prospectId, ["titre"] = titre, ["etape"] = etape, ["categorie"] = categorie ?? "",
            ["version"] = version ?? await VersionAsync(prospectId),
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Prospects/Fiche/pe-" + prospectId),
        };
        return await PosterAsync(client, "/Prospects/CreerOpportunite", champs);
    }

    // Message affiché par la fiche après un refus (TempData, relu dans les données JSON de la page : enregistrement.erreur).
    private static async Task<string> MessageDeLaFicheAsync(HttpClient client, int prospectId)
    {
        string page = await client.GetStringAsync("/Prospects/Fiche/pe-" + prospectId);
        const string marque = "id=\"prospects-donnees\">";
        int debut = page.IndexOf(marque, StringComparison.Ordinal) + marque.Length;
        var enregistrement = JsonDocument.Parse(page.Substring(debut, page.IndexOf("</script>", debut, StringComparison.Ordinal) - debut)).RootElement.GetProperty("enregistrement");
        return enregistrement.GetProperty("erreur").GetString() ?? "";
    }

    private async Task<int> NombreDeProspectsAsync()
    {
        using var scope = _app.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Prospects.CountAsync();
    }

    private async Task<HttpClient> CreerConseillerAsync(bool memeConcession)
    {
        string courriel = "conseiller." + Unique() + "@exemple.test";
        using (var scope = _app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            int concession;
            if (memeConcession)
                concession = (await db.Users.SingleAsync(u => u.Email == Sophie)).DealershipId!.Value;
            else
            {
                var autre = new Dealership { Name = "Concession " + Unique() };
                db.Dealerships.Add(autre);
                await db.SaveChangesAsync();
                concession = autre.Id;
            }
            var conseiller = new ApplicationUser { UserName = courriel, Email = courriel, FirstName = "Autre", LastName = "Conseiller", DealershipId = concession };
            Assert.True((await users.CreateAsync(conseiller, DbSeeder.DemoPassword)).Succeeded);
            await users.AddToRoleAsync(conseiller, AppRoles.Conseiller);
        }
        return await _app.ConnecterAsync(courriel);
    }

    // ---------- Création ----------

    [Fact]
    public async Task Deux_nouvelles_opportunites_s_ajoutent_au_meme_prospect_sans_rien_copier_ni_modifier()
    {
        var client = await _app.ConnecterAsync(Sophie);
        int prospectId = await CreerProspectAsync(client);
        var avant = await LireAsync(prospectId);
        var premiere = avant.Opportunites.Single();
        int prospects = await NombreDeProspectsAsync();

        var b = await CreerOpportuniteAsync(client, prospectId, "Deuxième véhicule pour la ville", "Nouveau", categorie: "berline");
        var c = await CreerOpportuniteAsync(client, prospectId, "VUS familial", "AQualifier");

        Assert.Equal(HttpStatusCode.Redirect, b.StatusCode);
        Assert.Equal(HttpStatusCode.Redirect, c.StatusCode);
        var apres = await LireAsync(prospectId);
        Assert.Equal(prospects, await NombreDeProspectsAsync());
        Assert.Equal(3, apres.Opportunites.Count);
        Assert.Equal(3, apres.Opportunites.Select(o => o.Id).Distinct().Count());
        Assert.All(apres.Opportunites, o => Assert.Equal(prospectId, o.ProspectId));
        Assert.Equal((avant.DealershipId, avant.ConseillerId), (apres.DealershipId, apres.ConseillerId));
        // La première opportunité (F01) est intacte.
        var a = apres.Opportunites.Single(o => o.Id == premiere.Id);
        Assert.Equal((premiere.Titre, premiere.Etape, premiere.Modele), (a.Titre, a.Etape, a.Modele));
        // Les nouvelles : leurs propres valeurs, rien de copié (aucun suivi, aucun historique, aucune note).
        var nouvelles = apres.Opportunites.Where(o => o.Id != premiere.Id).OrderBy(o => o.Id).ToList();
        Assert.Equal(("Deuxième véhicule pour la ville", EtapeVente.Nouveau, "berline"), (nouvelles[0].Titre, nouvelles[0].Etape, nouvelles[0].Categorie));
        Assert.Equal(("VUS familial", EtapeVente.AQualifier, (string?)null), (nouvelles[1].Titre, nouvelles[1].Etape, nouvelles[1].Categorie));
        Assert.All(nouvelles, o =>
        {
            Assert.Null(o.ProchaineAction);
            Assert.Null(o.Modele);
            Assert.Empty(o.HistoriqueEtapes);
            Assert.Empty(o.HistoriqueSuivis);
        });
        Assert.Empty(apres.Notes);
        // Retour vers la fiche, la nouvelle opportunité sélectionnée.
        Assert.EndsWith("/Prospects/Fiche/pe-" + prospectId + "?opportunite=oe-" + nouvelles[1].Id, c.Headers.Location!.OriginalString);
    }

    [Theory]
    [InlineData("", "AQualifier", "")]          // projet d'achat absent
    [InlineData("Projet", "Gagne", "")]         // étape finale : jamais à la création
    [InlineData("Projet", "Negociation", "")]   // étape hors des étapes initiales (F01)
    [InlineData("Projet", "AQualifier", "tracteur")] // type de véhicule inconnu
    public async Task Une_saisie_invalide_est_refusee_sans_rien_ecrire(string titre, string etape, string categorie)
    {
        var client = await _app.ConnecterAsync(Sophie);
        int prospectId = await CreerProspectAsync(client);
        string version = await VersionAsync(prospectId);

        var refus = await CreerOpportuniteAsync(client, prospectId, titre, etape, categorie: categorie);

        Assert.Equal(HttpStatusCode.Redirect, refus.StatusCode);
        Assert.EndsWith("/Prospects/Fiche/pe-" + prospectId, refus.Headers.Location!.OriginalString);
        Assert.Single((await LireAsync(prospectId)).Opportunites);
        Assert.Equal(version, await VersionAsync(prospectId));
        Assert.StartsWith("Opportunité non créée.", await MessageDeLaFicheAsync(client, prospectId));
    }

    [Fact]
    public async Task Un_deuxieme_envoi_identique_est_refuse_puis_une_creation_voulue_reste_possible()
    {
        var client = await _app.ConnecterAsync(Sophie);
        int prospectId = await CreerProspectAsync(client);
        string version = await VersionAsync(prospectId);

        var premier = await CreerOpportuniteAsync(client, prospectId, "Projet B", version: version);
        var repetition = await CreerOpportuniteAsync(client, prospectId, "Projet B", version: version);

        Assert.Equal(HttpStatusCode.Redirect, premier.StatusCode);
        Assert.Equal(HttpStatusCode.Redirect, repetition.StatusCode);
        Assert.Equal(2, (await LireAsync(prospectId)).Opportunites.Count);
        Assert.Contains("aucune nouvelle opportunité n'a été créée", await MessageDeLaFicheAsync(client, prospectId));
        // Page rechargée : nouvelle empreinte, deuxième projet voulu accepté.
        Assert.Equal(HttpStatusCode.Redirect, (await CreerOpportuniteAsync(client, prospectId, "Projet C")).StatusCode);
        Assert.Equal(3, (await LireAsync(prospectId)).Opportunites.Count);
    }

    [Fact]
    public async Task Des_envois_simultanes_avec_la_meme_page_ne_creent_qu_une_opportunite()
    {
        var client = await _app.ConnecterAsync(Sophie);
        for (int tour = 0; tour < 4; tour++)
        {
            int prospectId = await CreerProspectAsync(client);
            string version = await VersionAsync(prospectId);
            string jeton = await JetonAsync(client, "/Prospects/Fiche/pe-" + prospectId);
            var champs = new Dictionary<string, string>
            {
                ["prospectId"] = "pe-" + prospectId, ["titre"] = "Projet simultané", ["etape"] = "Nouveau", ["version"] = version,
                ["__RequestVerificationToken"] = jeton,
            };
            var depart = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var envois = Enumerable.Range(0, 5).Select(async _ => { await depart.Task; return await PosterAsync(client, "/Prospects/CreerOpportunite", new Dictionary<string, string>(champs)); }).ToList();
            depart.SetResult();
            var reponses = await Task.WhenAll(envois);

            Assert.All(reponses, r => Assert.Equal(HttpStatusCode.Redirect, r.StatusCode));
            Assert.Equal(1, reponses.Count(r => r.Headers.Location!.OriginalString.Contains("?opportunite=oe-")));
            Assert.Equal(2, (await LireAsync(prospectId)).Opportunites.Count);
        }
    }

    [Fact]
    public async Task Une_panne_pendant_la_creation_n_ecrit_rien()
    {
        var client = await _app.ConnecterAsync(Sophie);
        int prospectId = await CreerProspectAsync(client);
        string version = await VersionAsync(prospectId);
        string jeton = await JetonAsync(client, "/Prospects/Fiche/pe-" + prospectId);
        var champs = new Dictionary<string, string>
        {
            ["prospectId"] = "pe-" + prospectId, ["titre"] = "Projet en panne", ["etape"] = "Nouveau", ["version"] = version, ["__RequestVerificationToken"] = jeton,
        };

        HttpResponseMessage envoi;
        _app.Panne.EnPanne = true;
        try
        {
            envoi = await PosterAsync(client, "/Prospects/CreerOpportunite", champs);
        }
        finally
        {
            _app.Panne.EnPanne = false;
        }

        Assert.Equal(HttpStatusCode.Redirect, envoi.StatusCode);
        Assert.DoesNotContain("?opportunite=", envoi.Headers.Location!.OriginalString);
        Assert.Single((await LireAsync(prospectId)).Opportunites);
        Assert.Contains("l'opportunité n'a pas été créée", await MessageDeLaFicheAsync(client, prospectId));
    }

    // ---------- Sécurité ----------

    [Fact]
    public async Task Un_collegue_un_autre_concessionnaire_ou_un_identifiant_forge_ne_creent_rien()
    {
        var sophie = await _app.ConnecterAsync(Sophie);
        int prospectId = await CreerProspectAsync(sophie);
        string version = await VersionAsync(prospectId);
        var collegue = await CreerConseillerAsync(memeConcession: true);
        var ailleurs = await CreerConseillerAsync(memeConcession: false);

        foreach (var intrus in new[] { collegue, ailleurs })
        {
            var champs = new Dictionary<string, string>
            {
                ["prospectId"] = "pe-" + prospectId, ["titre"] = "Intrusion", ["etape"] = "Nouveau", ["version"] = version,
                ["__RequestVerificationToken"] = await JetonAsync(intrus, "/Prospects"),
            };
            var refus = await PosterAsync(intrus, "/Prospects/CreerOpportunite", champs);
            Assert.Equal(HttpStatusCode.NotFound, refus.StatusCode);
            Assert.DoesNotContain("Multi", await refus.Content.ReadAsStringAsync());
        }
        var forge = await PosterAsync(sophie, "/Prospects/CreerOpportunite", new Dictionary<string, string>
        {
            ["prospectId"] = "pe-999999999", ["titre"] = "Forgé", ["etape"] = "Nouveau", ["version"] = version,
            ["__RequestVerificationToken"] = await JetonAsync(sophie, "/Prospects"),
        });
        Assert.Equal(HttpStatusCode.NotFound, forge.StatusCode);
        var sansJeton = await PosterAsync(sophie, "/Prospects/CreerOpportunite", new Dictionary<string, string>
        {
            ["prospectId"] = "pe-" + prospectId, ["titre"] = "Sans jeton", ["etape"] = "Nouveau", ["version"] = version,
        });
        Assert.Equal(HttpStatusCode.BadRequest, sansJeton.StatusCode);
        Assert.Single((await LireAsync(prospectId)).Opportunites);
    }

    [Fact]
    public async Task La_fiche_n_ouvre_qu_une_opportunite_de_ce_prospect_jamais_une_autre_par_defaut()
    {
        var client = await _app.ConnecterAsync(Sophie);
        int p1 = await CreerProspectAsync(client);
        int p2 = await CreerProspectAsync(client);
        await CreerOpportuniteAsync(client, p1, "Projet B");
        var b = (await LireAsync(p1)).Opportunites.OrderBy(o => o.Id).Last();
        var deP2 = (await LireAsync(p2)).Opportunites.Single();

        var valide = await client.GetAsync("/Prospects/Fiche/pe-" + p1 + "?opportunite=oe-" + b.Id);
        var autreProspect = await client.GetAsync("/Prospects/Fiche/pe-" + p1 + "?opportunite=oe-" + deP2.Id);
        var inexistante = await client.GetAsync("/Prospects/Fiche/pe-" + p1 + "?opportunite=oe-999999999");
        var illisible = await client.GetAsync("/Prospects/Fiche/pe-" + p1 + "?opportunite=pe-" + p1);
        var collegue = await CreerConseillerAsync(memeConcession: true);
        var chezCollegue = await collegue.GetAsync("/Prospects/Fiche/pe-" + p1 + "?opportunite=oe-" + b.Id);

        Assert.Equal(HttpStatusCode.OK, valide.StatusCode);
        Assert.Contains("data-opportunite=\"oe-" + b.Id + "\"", await valide.Content.ReadAsStringAsync());
        Assert.All(new[] { autreProspect, inexistante, illisible, chezCollegue }, r => Assert.Equal(HttpStatusCode.NotFound, r.StatusCode));
    }

    // ---------- Indépendance des opportunités ----------

    [Fact]
    public async Task Changer_l_etape_de_B_ne_touche_ni_A_ni_C_et_l_historique_est_celui_de_B()
    {
        var client = await _app.ConnecterAsync(Sophie);
        int prospectId = await CreerProspectAsync(client);
        await CreerOpportuniteAsync(client, prospectId, "Projet B", "Nouveau");
        await CreerOpportuniteAsync(client, prospectId, "Projet C", "Nouveau");
        var avant = (await LireAsync(prospectId)).Opportunites.OrderBy(o => o.Id).ToList();

        var envoi = await PosterAsync(client, "/Prospects/ChangerEtape", new Dictionary<string, string>
        {
            ["opportuniteId"] = "oe-" + avant[1].Id, ["etape"] = "Qualifie", ["version"] = await VersionAsync(prospectId),
            ["prospectId"] = "pe-" + prospectId, ["retour"] = "fiche",
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Prospects/Fiche/pe-" + prospectId),
        });

        Assert.EndsWith("/Prospects/Fiche/pe-" + prospectId + "?opportunite=oe-" + avant[1].Id, envoi.Headers.Location!.OriginalString);
        var apres = (await LireAsync(prospectId)).Opportunites.OrderBy(o => o.Id).ToList();
        Assert.Equal(EtapeVente.Qualifie, apres[1].Etape);
        Assert.Equal(avant[0].Etape, apres[0].Etape);
        Assert.Equal(avant[2].Etape, apres[2].Etape);
        Assert.Single(apres[1].HistoriqueEtapes);
        Assert.Empty(apres[0].HistoriqueEtapes);
        Assert.Empty(apres[2].HistoriqueEtapes);
    }

    private async Task PlanifierAsync(HttpClient client, int prospectId, int oppId, string action, int jours)
    {
        var envoi = await PosterAsync(client, "/Prospects/PlanifierSuivi", new Dictionary<string, string>
        {
            ["prospectId"] = "pe-" + prospectId, ["opportuniteId"] = "oe-" + oppId, ["action"] = action,
            ["date"] = DateTime.Today.AddDays(jours).ToString("yyyy-MM-dd"), ["version"] = await VersionAsync(prospectId),
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Prospects/Fiche/pe-" + prospectId),
        });
        Assert.Equal(HttpStatusCode.Redirect, envoi.StatusCode);
    }

    [Fact]
    public async Task Realiser_ou_reporter_le_suivi_de_A_ne_touche_pas_celui_de_B()
    {
        var client = await _app.ConnecterAsync(Sophie);
        int prospectId = await CreerProspectAsync(client);
        await CreerOpportuniteAsync(client, prospectId, "Projet B", "Nouveau");
        var ids = (await LireAsync(prospectId)).Opportunites.OrderBy(o => o.Id).Select(o => o.Id).ToList();
        await PlanifierAsync(client, prospectId, ids[0], "Rappeler A", 0);
        await PlanifierAsync(client, prospectId, ids[1], "Rappeler B", 1);

        var a = (await LireAsync(prospectId)).Opportunites.Single(o => o.Id == ids[0]);
        var realisation = await PosterAsync(client, "/Prospects/RealiserSuivi", new Dictionary<string, string>
        {
            ["opportuniteId"] = "oe-" + ids[0], ["versionSuivi"] = ServiceProspects.EmpreinteSuivi(a.ProchaineAction, a.DateProchaineAction)!,
            ["retour"] = "/Intelligence", ["__RequestVerificationToken"] = await JetonAsync(client, "/Intelligence"),
        });
        Assert.Equal(HttpStatusCode.Redirect, realisation.StatusCode);
        var apres = (await LireAsync(prospectId)).Opportunites.OrderBy(o => o.Id).ToList();
        Assert.Null(apres[0].ProchaineAction);
        Assert.Equal(ClotureSuivi.Realise, apres[0].HistoriqueSuivis.Single().Cloture);
        Assert.Equal("Rappeler B", apres[1].ProchaineAction);
        Assert.Empty(apres[1].HistoriqueSuivis);

        var report = await PosterAsync(client, "/Prospects/ReporterSuivi", new Dictionary<string, string>
        {
            ["opportuniteId"] = "oe-" + ids[1], ["versionSuivi"] = ServiceProspects.EmpreinteSuivi(apres[1].ProchaineAction, apres[1].DateProchaineAction)!,
            ["date"] = DateTime.Today.AddDays(5).ToString("yyyy-MM-dd"), ["retour"] = "/Intelligence",
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Intelligence"),
        });
        Assert.Equal(HttpStatusCode.Redirect, report.StatusCode);
        var fin = (await LireAsync(prospectId)).Opportunites.OrderBy(o => o.Id).ToList();
        Assert.Equal(ClotureSuivi.Reporte, fin[1].HistoriqueSuivis.Single().Cloture);
        Assert.Equal(DateTime.Today.AddDays(5), fin[1].DateProchaineAction!.Value.Date);
        Assert.Single(fin[0].HistoriqueSuivis);
        Assert.Null(fin[0].ProchaineAction);
    }

    [Fact]
    public async Task La_veille_de_la_premiere_reponse_de_A_ne_concerne_que_A()
    {
        var client = await _app.ConnecterAsync(Sophie);
        int prospectId = await CreerProspectAsync(client);
        await CreerOpportuniteAsync(client, prospectId, "Projet B", "Nouveau");
        var ids = (await LireAsync(prospectId)).Opportunites.OrderBy(o => o.Id).Select(o => o.Id).ToList();

        var veille = await PosterAsync(client, "/Intelligence/MettreEnVeille", new Dictionary<string, string>
        {
            ["cle"] = "premiere-reponse:oe-" + ids[0], ["jours"] = "3", ["etape"] = "Nouveau", ["retour"] = "/Intelligence",
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Intelligence"),
        });

        Assert.Equal(HttpStatusCode.Redirect, veille.StatusCode);
        using var scope = _app.Services.CreateScope();
        var lignes = await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().VeillesRecommandation.AsNoTracking()
            .Where(v => ids.Contains(v.OpportuniteId)).ToListAsync();
        Assert.Single(lignes);
        Assert.Equal(ids[0], lignes[0].OpportuniteId);
        Assert.Equal("premiere-reponse:oe-" + ids[0], lignes[0].CleRecommandation);
    }

    [Fact]
    public async Task Une_note_garde_son_perimetre_opportunite_B_ou_contact_general()
    {
        var client = await _app.ConnecterAsync(Sophie);
        int prospectId = await CreerProspectAsync(client);
        await CreerOpportuniteAsync(client, prospectId, "Projet B", "Nouveau");
        var ids = (await LireAsync(prospectId)).Opportunites.OrderBy(o => o.Id).Select(o => o.Id).ToList();

        foreach (var (opp, resume) in new[] { ("oe-" + ids[1], "Note sur B"), ("", "Note générale") })
        {
            var envoi = await PosterAsync(client, "/Prospects/AjouterNote", new Dictionary<string, string>
            {
                ["prospectId"] = "pe-" + prospectId, ["opportuniteId"] = opp, ["type"] = "note", ["resume"] = resume,
                ["jeton"] = Guid.NewGuid().ToString("N"), ["version"] = await VersionAsync(prospectId),
                ["__RequestVerificationToken"] = await JetonAsync(client, "/Prospects/Fiche/pe-" + prospectId),
            });
            Assert.Equal(HttpStatusCode.Redirect, envoi.StatusCode);
        }

        var notes = (await LireAsync(prospectId)).Notes.ToDictionary(n => n.Contenu, n => n.OpportuniteId);
        Assert.Equal(ids[1], notes["Note sur B"]);
        Assert.Null(notes["Note générale"]);
    }

    [Fact]
    public async Task L_historique_de_la_fiche_rattache_l_ouverture_de_B_a_B_et_la_creation_du_prospect_a_A()
    {
        var client = await _app.ConnecterAsync(Sophie);
        int prospectId = await CreerProspectAsync(client);
        await CreerOpportuniteAsync(client, prospectId, "Projet B", "Nouveau");
        var ids = (await LireAsync(prospectId)).Opportunites.OrderBy(o => o.Id).Select(o => o.Id).ToList();
        // Un suivi réalisé sur B : son événement appartient à B, jamais à A.
        await PlanifierAsync(client, prospectId, ids[1], "Rappeler B", 0);
        var b = (await LireAsync(prospectId)).Opportunites.Single(o => o.Id == ids[1]);
        Assert.Equal(HttpStatusCode.Redirect, (await PosterAsync(client, "/Prospects/RealiserSuivi", new Dictionary<string, string>
        {
            ["opportuniteId"] = "oe-" + ids[1], ["versionSuivi"] = ServiceProspects.EmpreinteSuivi(b.ProchaineAction, b.DateProchaineAction)!,
            ["retour"] = "/Intelligence", ["__RequestVerificationToken"] = await JetonAsync(client, "/Intelligence"),
        })).StatusCode);

        string page = await client.GetStringAsync("/Prospects/Fiche/pe-" + prospectId);
        const string marque = "id=\"prospects-donnees\">";
        int debut = page.IndexOf(marque, StringComparison.Ordinal) + marque.Length;
        var racine = JsonDocument.Parse(page.Substring(debut, page.IndexOf("</script>", debut, StringComparison.Ordinal) - debut)).RootElement.GetProperty("donnees");
        var interactions = racine.GetProperty("interactions").EnumerateArray().Where(i => i.GetProperty("prospectId").GetString() == "pe-" + prospectId).ToList();

        var ouverture = interactions.Single(i => i.GetProperty("type").GetString() == "opportunite");
        Assert.Equal("oe-" + ids[1], ouverture.GetProperty("opportuniteId").GetString());
        Assert.Contains("Projet B", ouverture.GetProperty("resume").GetString());
        Assert.Equal("oe-" + ids[0], interactions.Single(i => i.GetProperty("type").GetString() == "creation").GetProperty("opportuniteId").GetString());
        Assert.Equal(2, racine.GetProperty("opportunites").EnumerateArray().Count(o => o.GetProperty("prospectId").GetString() == "pe-" + prospectId));
        Assert.Equal("oe-" + ids[1], interactions.Single(i => i.GetProperty("type").GetString() == "suivi-realise").GetProperty("opportuniteId").GetString());
    }

    // ---------- Fonctionnalité 19 ----------

    [Fact]
    public async Task F19_reporter_le_suivi_de_A_et_mettre_en_veille_B_restent_independants()
    {
        var client = await _app.ConnecterAsync(Sophie);
        int prospectId = await CreerProspectAsync(client);
        await CreerOpportuniteAsync(client, prospectId, "Projet B", "Nouveau");
        var ids = (await LireAsync(prospectId)).Opportunites.OrderBy(o => o.Id).Select(o => o.Id).ToList();
        await PlanifierAsync(client, prospectId, ids[0], "Rappeler A", 0);
        var a = (await LireAsync(prospectId)).Opportunites.Single(o => o.Id == ids[0]);

        var report = await PosterAsync(client, "/Prospects/ReporterSuivi", new Dictionary<string, string>
        {
            ["opportuniteId"] = "oe-" + ids[0], ["versionSuivi"] = ServiceProspects.EmpreinteSuivi(a.ProchaineAction, a.DateProchaineAction)!,
            ["date"] = DateTime.Today.AddDays(3).ToString("yyyy-MM-dd"), ["retour"] = "/Intelligence",
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Intelligence"),
        });
        var veille = await PosterAsync(client, "/Intelligence/MettreEnVeille", new Dictionary<string, string>
        {
            ["cle"] = "premiere-reponse:oe-" + ids[1], ["jours"] = "3", ["etape"] = "Nouveau", ["retour"] = "/Intelligence",
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Intelligence"),
        });

        Assert.Equal(HttpStatusCode.Redirect, report.StatusCode);
        Assert.Equal(HttpStatusCode.Redirect, veille.StatusCode);
        var apres = (await LireAsync(prospectId)).Opportunites.OrderBy(o => o.Id).ToList();
        Assert.Equal(ClotureSuivi.Reporte, apres[0].HistoriqueSuivis.Single().Cloture);
        Assert.Empty(apres[1].HistoriqueSuivis);
        Assert.Null(apres[1].ProchaineAction);
        using var scope = _app.Services.CreateScope();
        var veilles = await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().VeillesRecommandation.AsNoTracking()
            .Where(v => ids.Contains(v.OpportuniteId)).ToListAsync();
        Assert.Equal(new[] { ids[1] }, veilles.Select(v => v.OpportuniteId).ToArray());
    }

    [Theory]
    [InlineData("/Soumissions/Nouvelle?opportunite=")]
    [InlineData("/RendezVous/Nouveau?opportunite=")]
    [InlineData("/Transactions/Nouvelle?opportunite=")]
    public async Task F19_ouvrir_un_module_de_demonstration_avec_une_opportunite_reelle_n_ecrit_rien(string page)
    {
        var client = await _app.ConnecterAsync(Sophie);
        int prospectId = await CreerProspectAsync(client);
        var avant = await LireAsync(prospectId);
        string version = ServiceProspects.Empreinte(avant);

        var reponse = await client.GetAsync(page + "oe-" + avant.Opportunites.Single().Id);

        Assert.Equal(HttpStatusCode.OK, reponse.StatusCode);
        var apres = await LireAsync(prospectId);
        Assert.Equal(version, ServiceProspects.Empreinte(apres));
        Assert.Empty(apres.Notes);
        Assert.Empty(apres.Opportunites.Single().HistoriqueEtapes);
        Assert.Empty(apres.Opportunites.Single().HistoriqueSuivis);
    }

    // ---------- F17 inchangée ----------

    [Fact]
    public async Task Ajouter_des_opportunites_ne_contourne_pas_la_regle_de_doublon_des_prospects()
    {
        var client = await _app.ConnecterAsync(Sophie);
        int prospectId = await CreerProspectAsync(client);
        await CreerOpportuniteAsync(client, prospectId, "Projet B");
        var prospect = await LireAsync(prospectId);
        int prospects = await NombreDeProspectsAsync();

        var doublon = await PosterAsync(client, "/Prospects/Creer", new Dictionary<string, string>
        {
            ["prenom"] = "Autre", ["nom"] = "Personne", ["courriel"] = prospect.Courriel!.ToUpperInvariant(), ["contactPrefere"] = "courriel",
            ["source"] = "appel", ["modele"] = "Kia Sportage", ["conseillerId"] = "moi", ["etape"] = "Nouveau",
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Prospects"),
        });

        Assert.Equal(HttpStatusCode.OK, doublon.StatusCode);
        Assert.Equal(prospects, await NombreDeProspectsAsync());
        Assert.Equal(2, (await LireAsync(prospectId)).Opportunites.Count);
    }
}
