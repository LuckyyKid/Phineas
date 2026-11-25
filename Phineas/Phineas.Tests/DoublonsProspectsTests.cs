using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Phineas.Data;
using Phineas.Data.Seed;
using Phineas.Models.Constants;
using Phineas.Models.Entities;
using Phineas.Tests.Infrastructure;
using System.Text.RegularExpressions;

namespace Phineas.Tests;

// Création de prospects : doublons et confidentialité (fonctionnalité 17), sur MySQL de test.
// Règle existante (inchangée) : doublon = même courriel ou même téléphone (10 chiffres) dans la même concession ; le nom
// ne compte jamais ; un courriel ou un téléphone absent n'est jamais un doublon ; deux concessions sont indépendantes.
// Garantie : index uniques (DealershipId, Courriel) et (DealershipId, TelephoneChiffres) ; un refus ne nomme jamais
// le dossier d'un collègue. Les créations simultanées passent par de vraies requêtes HTTP concurrentes (barrière de
// départ), sur des connexions MySQL indépendantes.
public class DoublonsProspectsTests : IClassFixture<ApplicationDeTest>
{
    private const string Sophie = "sophie.gagnon@autoprestige.example"; // conseillère, Auto Prestige Brossard
    private const string MessageNeutre = "existe déjà dans votre concession";

    private readonly ApplicationDeTest _app;

    public DoublonsProspectsTests(ApplicationDeTest app)
    {
        _app = app;
    }

    private static string Unique() => Guid.NewGuid().ToString("N").Substring(0, 8);

    private static async Task<string> JetonAsync(HttpClient client) =>
        ApplicationDeTest.JetonAntiforgery(await client.GetStringAsync("/Prospects"));

    private static Dictionary<string, string> Formulaire(string jeton, string prenom, string nom, string? courriel, string? telephone)
    {
        var champs = new Dictionary<string, string>
        {
            ["prenom"] = prenom,
            ["nom"] = nom,
            ["contactPrefere"] = courriel is not null ? "courriel" : "telephone",
            ["source"] = "appel",
            ["modele"] = "Kia Sportage",
            ["conseillerId"] = "moi",
            ["etape"] = "Nouveau",
            ["__RequestVerificationToken"] = jeton,
        };
        if (courriel is not null) champs["courriel"] = courriel;
        if (telephone is not null) champs["telephone"] = telephone;
        return champs;
    }

    private static Task<HttpResponseMessage> EnvoyerAsync(HttpClient client, Dictionary<string, string> champs) =>
        client.PostAsync("/Prospects/Creer", new FormUrlEncodedContent(champs));

    private async Task<HttpResponseMessage> CreerAsync(HttpClient client, string prenom, string nom, string? courriel, string? telephone = null) =>
        await EnvoyerAsync(client, Formulaire(await JetonAsync(client), prenom, nom, courriel, telephone));

    // Prospects et opportunités enregistrés pour un courriel ou des chiffres de téléphone, toutes concessions confondues.
    private async Task<(int Prospects, int Opportunites)> CompterAsync(string? courriel = null, string? chiffres = null)
    {
        using var scope = _app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var ids = await db.Prospects.AsNoTracking()
            .Where(p => (courriel != null && p.Courriel == courriel) || (chiffres != null && p.TelephoneChiffres == chiffres))
            .Select(p => p.Id).ToListAsync();
        int opps = await db.OpportunitesVente.CountAsync(o => ids.Contains(o.ProspectId));
        return (ids.Count, opps);
    }

    private async Task<int> DealershipDeSophieAsync()
    {
        using var scope = _app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return (await db.Users.SingleAsync(u => u.Email == Sophie)).DealershipId!.Value;
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

    // Réponse d'un refus : le formulaire est réaffiché et les messages sont dans les données du tiroir
    // (<script id="prospects-donnees">, enregistrement.erreurs ou note.erreurs). Texte : tout ce que reçoit le
    // navigateur, HTML et JSON décodés, pour chercher une fuite sous n'importe quelle forme.
    private static async Task<(List<string> Messages, string Texte)> LireRefusAsync(HttpResponseMessage reponse)
    {
        string page = await reponse.Content.ReadAsStringAsync();
        var messages = new List<string>();
        int debut = page.IndexOf("id=\"prospects-donnees\">", StringComparison.Ordinal);
        string json = "";
        if (debut >= 0)
        {
            debut = page.IndexOf('>', debut) + 1;
            json = page.Substring(debut, page.IndexOf("</script>", debut, StringComparison.Ordinal) - debut);
            var enregistrement = JsonDocument.Parse(json).RootElement.GetProperty("enregistrement");
            if (enregistrement.TryGetProperty("erreurs", out var erreurs) && erreurs.ValueKind == JsonValueKind.Array)
                messages.AddRange(erreurs.EnumerateArray().Select(e => e.GetProperty("message").GetString()!));
            if (enregistrement.TryGetProperty("erreur", out var erreur) && erreur.ValueKind == JsonValueKind.String)
                messages.Add(erreur.GetString()!);
        }
        string jsonDecode = json.Length > 0 ? JsonSerializer.Deserialize<JsonElement>(json).ToString() : "";
        return (messages, WebUtility.HtmlDecode(page) + "\n" + Regex.Unescape(jsonDecode));
    }

    // Envoie toutes les requêtes en même temps : chacune attend la même barrière, puis part.
    private static async Task<HttpResponseMessage[]> EnMemeTempsAsync(IEnumerable<(HttpClient Client, Dictionary<string, string> Champs)> envois)
    {
        var depart = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var taches = envois.Select(async e =>
        {
            await depart.Task;
            return await EnvoyerAsync(e.Client, e.Champs);
        }).ToList();
        depart.SetResult();
        return await Task.WhenAll(taches);
    }

    // ---------- Règle métier ----------

    [Fact]
    public async Task Une_creation_normale_enregistre_le_prospect_et_une_seule_opportunite()
    {
        var client = await _app.ConnecterAsync(Sophie);
        string courriel = "normal." + Unique() + "@exemple.test";

        var envoi = await CreerAsync(client, "Ana", "Normal", courriel);

        Assert.Equal(HttpStatusCode.Redirect, envoi.StatusCode);
        Assert.Equal((1, 1), await CompterAsync(courriel));
    }

    [Theory]
    [InlineData("MAJUSCULES.{0}@Exemple.Test", "majuscules.{0}@exemple.test")]
    [InlineData("  espaces.{0}@exemple.test  ", "espaces.{0}@exemple.test")]
    public async Task Le_meme_courriel_a_la_casse_ou_aux_espaces_pres_est_un_doublon(string modeleSaisi, string modeleExistant)
    {
        var client = await _app.ConnecterAsync(Sophie);
        string u = Unique();
        await CreerAsync(client, "Ana", "Premier", string.Format(modeleExistant, u));

        var refus = await CreerAsync(client, "Ana", "Second", string.Format(modeleSaisi, u));

        Assert.Equal(HttpStatusCode.OK, refus.StatusCode);
        Assert.Equal((1, 1), await CompterAsync(string.Format(modeleExistant, u)));
    }

    [Theory]
    [InlineData("(514) 555-{0}", "514.555.{0}")]
    [InlineData("514 555 {0}", "+1 514-555-{0}")]
    [InlineData("1-514-555-{0}", "5145550000")]
    public async Task Le_meme_telephone_quel_que_soit_son_format_est_un_doublon(string premier, string second)
    {
        var client = await _app.ConnecterAsync(Sophie);
        string quatre = Random.Shared.Next(1000, 9999).ToString();
        string a = string.Format(premier, quatre), b = second == "5145550000" ? "514555" + quatre : string.Format(second, quatre);
        await CreerAsync(client, "Tel", "Premier" + Unique(), null, a);

        var refus = await CreerAsync(client, "Tel", "Second" + Unique(), null, b);

        Assert.Equal(HttpStatusCode.OK, refus.StatusCode);
        Assert.Equal((1, 1), await CompterAsync(chiffres: "514555" + quatre));
    }

    [Fact]
    public async Task Des_homonymes_avec_d_autres_coordonnees_et_des_coordonnees_absentes_ne_sont_jamais_des_doublons()
    {
        var client = await _app.ConnecterAsync(Sophie);
        string u = Unique();

        var premier = await CreerAsync(client, "Marie", "Tremblay", "marie1." + u + "@exemple.test");
        var homonyme = await CreerAsync(client, "Marie", "Tremblay", "marie2." + u + "@exemple.test");
        string t1 = "438" + Random.Shared.Next(1000000, 9999999), t2 = "438" + Random.Shared.Next(1000000, 9999999);
        var sansCourriel1 = await CreerAsync(client, "Sans", "Courriel" + u, null, t1);
        var sansCourriel2 = await CreerAsync(client, "Sans", "Courriel" + u, null, t2);

        Assert.All(new[] { premier, homonyme, sansCourriel1, sansCourriel2 }, r => Assert.Equal(HttpStatusCode.Redirect, r.StatusCode));
    }

    // Les index uniques comparent les valeurs stockées : elles doivent suivre la même normalisation que la recherche.
    [Fact]
    public async Task Les_valeurs_stockees_sont_normalisees_et_un_champ_vide_est_enregistre_comme_absent()
    {
        var client = await _app.ConnecterAsync(Sophie);
        string u = Unique();
        string telephone = "1 (438) 555-" + Random.Shared.Next(1000, 9999);
        var champs = Formulaire(await JetonAsync(client), "Ana", "Stockee" + u, "  Ana.Stockee." + u + "@Exemple.TEST  ", telephone);
        var sansTelephone = Formulaire(await JetonAsync(client), "Ana", "Vide" + u, "ana.vide." + u + "@exemple.test", "   ");

        Assert.Equal(HttpStatusCode.Redirect, (await EnvoyerAsync(client, champs)).StatusCode);
        Assert.Equal(HttpStatusCode.Redirect, (await EnvoyerAsync(client, sansTelephone)).StatusCode);

        using var scope = _app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var stocke = await db.Prospects.AsNoTracking().SingleAsync(p => p.Nom == "Stockee" + u);
        Assert.Equal("ana.stockee." + u + "@exemple.test", stocke.Courriel);
        Assert.Equal("438555" + telephone.Substring(telephone.Length - 4), stocke.TelephoneChiffres);
        var vide = await db.Prospects.AsNoTracking().SingleAsync(p => p.Nom == "Vide" + u);
        Assert.Null(vide.Telephone);
        Assert.Null(vide.TelephoneChiffres);
    }

    [Fact]
    public async Task Une_modification_normale_qui_garde_ses_coordonnees_est_enregistree()
    {
        var client = await _app.ConnecterAsync(Sophie);
        string u = Unique();
        string courriel = "garde." + u + "@exemple.test", telephone = "367" + Random.Shared.Next(1000000, 9999999);
        await CreerAsync(client, "Ana", "Garde" + u, courriel, telephone);
        Prospect p;
        using (var scope = _app.Services.CreateScope())
            p = await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Prospects.AsNoTracking().Include(x => x.Opportunites).SingleAsync(x => x.Courriel == courriel);
        var champs = new Dictionary<string, string>
        {
            ["prospectId"] = "pe-" + p.Id,
            ["opportuniteId"] = "oe-" + p.Opportunites.Single().Id,
            ["version"] = Phineas.Services.Conseiller.ServiceProspects.Empreinte(p),
            ["prenom"] = "Anabelle",
            ["nom"] = "Garde" + u,
            ["courriel"] = courriel.ToUpperInvariant(),
            ["telephone"] = telephone,
            ["contactPrefere"] = "courriel",
            ["source"] = "appel",
            ["conseillerId"] = "moi",
            ["__RequestVerificationToken"] = await JetonAsync(client),
        };

        var envoi = await client.PostAsync("/Prospects/Modifier", new FormUrlEncodedContent(champs));

        Assert.Equal(HttpStatusCode.Redirect, envoi.StatusCode);
        using (var scope = _app.Services.CreateScope())
        {
            var apres = await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Prospects.AsNoTracking().SingleAsync(x => x.Id == p.Id);
            Assert.Equal("Anabelle", apres.Prenom);
            Assert.Equal(courriel, apres.Courriel);
        }
        Assert.Equal((1, 1), await CompterAsync(courriel));
    }

    [Fact]
    public async Task Le_meme_courriel_dans_deux_concessions_est_permis()
    {
        var sophie = await _app.ConnecterAsync(Sophie);
        var ailleurs = await CreerConseillerAsync(null);
        string courriel = "deuxconcessions." + Unique() + "@exemple.test";

        var ici = await CreerAsync(sophie, "Lou", "Ici", courriel);
        var labas = await CreerAsync(ailleurs, "Lou", "Labas", courriel);

        Assert.Equal(HttpStatusCode.Redirect, ici.StatusCode);
        Assert.Equal(HttpStatusCode.Redirect, labas.StatusCode);
        Assert.Equal((2, 2), await CompterAsync(courriel));
    }

    // ---------- Confidentialité ----------

    [Fact]
    public async Task Le_refus_pour_le_dossier_d_un_collegue_ne_divulgue_ni_nom_ni_coordonnees_ni_identifiant()
    {
        var sophie = await _app.ConnecterAsync(Sophie);
        var collegue = await CreerConseillerAsync(await DealershipDeSophieAsync());
        string u = Unique();
        string courriel = "secret." + u + "@exemple.test", telephone = "450" + Random.Shared.Next(1000000, 9999999);
        await CreerAsync(sophie, "Prenomsecret" + u, "Nomsecret" + u, courriel, telephone);
        int idExistant;
        using (var scope = _app.Services.CreateScope())
            idExistant = (await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Prospects.SingleAsync(p => p.Courriel == courriel)).Id;

        var refus = await CreerAsync(collegue, "Autre", "Personne", courriel.ToUpperInvariant(), telephone);
        var (messages, page) = await LireRefusAsync(refus);

        Assert.Equal(HttpStatusCode.OK, refus.StatusCode);
        Assert.Contains("Un dossier correspondant à ce courriel " + MessageNeutre + ". Aucune nouvelle fiche n'a été créée.", messages);
        Assert.Contains(messages, m => m.StartsWith("Un dossier correspondant à ce téléphone " + MessageNeutre));
        Assert.DoesNotContain("Prenomsecret" + u, page);
        Assert.DoesNotContain("Nomsecret" + u, page);
        Assert.DoesNotContain("pe-" + idExistant + "\"", page);
        Assert.DoesNotContain("Sophie", page.Replace("sophie.gagnon", "")); // conseillère responsable jamais nommée
        Assert.Equal((1, 1), await CompterAsync(courriel));
    }

    [Fact]
    public async Task Le_refus_pour_son_propre_prospect_le_nomme_puisque_sa_fiche_est_deja_accessible()
    {
        var client = await _app.ConnecterAsync(Sophie);
        string u = Unique();
        string courriel = "mien." + u + "@exemple.test";
        await CreerAsync(client, "Prenommien", "Nommien" + u, courriel);

        var refus = await CreerAsync(client, "Autre", "Saisie", courriel);
        var (messages, _) = await LireRefusAsync(refus);

        Assert.Contains("Un de vos prospects a déjà ce courriel : Prenommien Nommien" + u + ". Aucune nouvelle fiche n'a été créée.", messages);
    }

    [Fact]
    public async Task La_modification_vers_les_coordonnees_d_un_dossier_de_collegue_est_refusee_sans_divulgation()
    {
        var sophie = await _app.ConnecterAsync(Sophie);
        var collegue = await CreerConseillerAsync(await DealershipDeSophieAsync());
        string u = Unique();
        string courrielSophie = "asophie." + u + "@exemple.test", courrielCollegue = "acollegue." + u + "@exemple.test";
        await CreerAsync(sophie, "Prenomsophie" + u, "Nomsophie", courrielSophie);
        await CreerAsync(collegue, "Pierre", "Collegue" + u, courrielCollegue);
        Prospect p;
        using (var scope = _app.Services.CreateScope())
            p = await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Prospects.AsNoTracking().Include(x => x.Opportunites).SingleAsync(x => x.Courriel == courrielCollegue);
        var champs = new Dictionary<string, string>
        {
            ["prospectId"] = "pe-" + p.Id,
            ["opportuniteId"] = "oe-" + p.Opportunites.Single().Id,
            ["version"] = Phineas.Services.Conseiller.ServiceProspects.Empreinte(p),
            ["prenom"] = "Pierre",
            ["nom"] = "Collegue" + u,
            ["courriel"] = courrielSophie,
            ["contactPrefere"] = "courriel",
            ["source"] = "appel",
            ["conseillerId"] = "moi",
            ["__RequestVerificationToken"] = await JetonAsync(collegue),
        };

        var refus = await collegue.PostAsync("/Prospects/Modifier", new FormUrlEncodedContent(champs));
        var (messages, page) = await LireRefusAsync(refus);

        Assert.Contains("Un dossier correspondant à ce courriel " + MessageNeutre + ". Les modifications n'ont pas été enregistrées.", messages);
        Assert.DoesNotContain("Prenomsophie" + u, page);
        using (var scope = _app.Services.CreateScope())
            Assert.Equal(courrielCollegue, (await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Prospects.AsNoTracking().SingleAsync(x => x.Id == p.Id)).Courriel);
    }

    // ---------- Échec pendant l'enregistrement ----------

    [Fact]
    public async Task Une_panne_pendant_la_creation_n_ecrit_rien_puis_la_creation_suivante_reussit()
    {
        var client = await _app.ConnecterAsync(Sophie);
        string courriel = "panne." + Unique() + "@exemple.test";
        var champs = Formulaire(await JetonAsync(client), "Ana", "Panne", courriel, null);

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

        var (messages, page) = await LireRefusAsync(envoi);
        Assert.Equal(HttpStatusCode.OK, envoi.StatusCode);
        Assert.Contains(messages, m => m.StartsWith("L'enregistrement a échoué : le prospect n'a pas été créé."));
        Assert.DoesNotContain("Exception", page);
        Assert.Equal((0, 0), await CompterAsync(courriel));
        Assert.Equal(HttpStatusCode.Redirect, (await CreerAsync(client, "Ana", "Panne", courriel)).StatusCode);
        Assert.Equal((1, 1), await CompterAsync(courriel));
    }

    // ---------- Concurrence réelle (MySQL) ----------

    [Fact]
    public async Task Scenario_A_des_creations_identiques_simultanees_du_meme_conseiller_n_en_enregistrent_qu_une()
    {
        var client = await _app.ConnecterAsync(Sophie);
        for (int tour = 0; tour < 6; tour++)
        {
            string courriel = "simultane." + Unique() + "@exemple.test";
            string jeton = await JetonAsync(client);
            var reponses = await EnMemeTempsAsync(Enumerable.Range(0, 6).Select(_ => (client, Formulaire(jeton, "Ana", "Simultane", courriel, null))));

            Assert.Equal(1, reponses.Count(r => r.StatusCode == HttpStatusCode.Redirect));
            Assert.All(reponses, r => Assert.NotEqual(HttpStatusCode.InternalServerError, r.StatusCode));
            foreach (var r in reponses.Where(r => r.StatusCode == HttpStatusCode.OK))
            {
                var (messages, page) = await LireRefusAsync(r);
                Assert.Contains(messages, m => m.StartsWith("Un de vos prospects a déjà ce courriel"));
                Assert.DoesNotContain("MySqlException", page);
                Assert.DoesNotContain("Duplicate entry", page);
            }
            Assert.Equal((1, 1), await CompterAsync(courriel));
        }
    }

    [Fact]
    public async Task Scenario_B_deux_conseillers_de_la_meme_concession_en_meme_temps_un_seul_dossier_et_aucune_fuite()
    {
        int concession = await DealershipDeSophieAsync();
        var a = await _app.ConnecterAsync(Sophie);
        var b = await CreerConseillerAsync(concession);
        for (int tour = 0; tour < 6; tour++)
        {
            string u = Unique();
            string telephone = "579" + Random.Shared.Next(1000000, 9999999);
            string jetonA = await JetonAsync(a), jetonB = await JetonAsync(b);
            var reponses = await EnMemeTempsAsync(new[]
            {
                (a, Formulaire(jetonA, "Prenoma" + u, "Noma" + u, null, telephone)),
                (b, Formulaire(jetonB, "Prenomb" + u, "Nomb" + u, null, telephone)),
                (a, Formulaire(jetonA, "Prenoma" + u, "Noma" + u, null, telephone)),
                (b, Formulaire(jetonB, "Prenomb" + u, "Nomb" + u, null, telephone)),
            });

            Assert.Equal(1, reponses.Count(r => r.StatusCode == HttpStatusCode.Redirect));
            Assert.Equal((1, 1), await CompterAsync(chiffres: telephone));
            string? proprietaire;
            using (var scope = _app.Services.CreateScope())
                proprietaire = (await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Prospects.SingleAsync(p => p.TelephoneChiffres == telephone)).Prenom;
            // Le conseiller refusé ne voit jamais le nom du dossier créé par l'autre.
            string nomAutre = proprietaire == "Prenoma" + u ? "Prenoma" + u : "Prenomb" + u;
            for (int i = 0; i < reponses.Length; i++)
            {
                if (reponses[i].StatusCode != HttpStatusCode.OK) continue;
                var (messages, page) = await LireRefusAsync(reponses[i]);
                bool memeConseiller = (i % 2 == 0) == (proprietaire == "Prenoma" + u);
                if (!memeConseiller)
                {
                    Assert.Contains(messages, m => m.StartsWith("Un dossier correspondant à ce téléphone " + MessageNeutre));
                    Assert.DoesNotContain(nomAutre, page);
                }
            }
        }
    }

    [Fact]
    public async Task Scenario_C_deux_concessions_en_meme_temps_chacune_cree_son_dossier()
    {
        var ici = await _app.ConnecterAsync(Sophie);
        var ailleurs = await CreerConseillerAsync(null);
        for (int tour = 0; tour < 4; tour++)
        {
            string courriel = "parallele." + Unique() + "@exemple.test";
            var reponses = await EnMemeTempsAsync(new[]
            {
                (ici, Formulaire(await JetonAsync(ici), "Ici", "Client", courriel, null)),
                (ailleurs, Formulaire(await JetonAsync(ailleurs), "Ailleurs", "Client", courriel, null)),
            });

            Assert.All(reponses, r => Assert.Equal(HttpStatusCode.Redirect, r.StatusCode));
            Assert.Equal((2, 2), await CompterAsync(courriel));
        }
    }

    [Fact]
    public async Task Scenario_D_des_prospects_distincts_crees_en_meme_temps_passent_tous()
    {
        var client = await _app.ConnecterAsync(Sophie);
        string jeton = await JetonAsync(client);
        string u = Unique();
        var courriels = Enumerable.Range(0, 10).Select(i => "distinct" + i + "." + u + "@exemple.test").ToList();

        var reponses = await EnMemeTempsAsync(courriels.Select(c => (client, Formulaire(jeton, "Ana", "Distinct", c, null))));

        Assert.All(reponses, r => Assert.Equal(HttpStatusCode.Redirect, r.StatusCode));
        foreach (var c in courriels)
            Assert.Equal((1, 1), await CompterAsync(c));
    }
}
