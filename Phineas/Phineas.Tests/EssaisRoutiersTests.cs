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

// Fonctionnalité 24 : essais routiers planifiés d'une opportunité réelle, sur MySQL de test et par de vraies requêtes
// (ProspectsController.PlanifierEssaiRoutier). Véhicule : un véhicule envisagé de CETTE opportunité (libellé recopié) ou
// une description ; horaire : mêmes règles que les rendez-vous (fuseau America/Toronto, moment futur, changements
// d'heure) ; l'essai appartient à SON opportunité et ne change rien d'autre (ni inventaire, ni rendez-vous, ni contact,
// ni suivi, ni étape). Horloge du serveur fixée.
public class EssaisRoutiersTests : IClassFixture<ApplicationDeTest>
{
    private const string Sophie = "sophie.gagnon@autoprestige.example";
    // Maintenant, pour toute la classe : 10 janvier 2027, 15 h UTC = 10 h à Toronto (heure normale, UTC-5).
    private static readonly DateTimeOffset Maintenant = new(2027, 1, 10, 15, 0, 0, TimeSpan.Zero);

    private readonly ApplicationDeTest _app;

    public EssaisRoutiersTests(ApplicationDeTest app)
    {
        _app = app;
        _app.Horloge.Fixer(Maintenant);
    }

    // ---------- Outils ----------

    private static string Unique() => Guid.NewGuid().ToString("N").Substring(0, 8);

    private static async Task<string> JetonAsync(HttpClient client, string page) =>
        ApplicationDeTest.JetonAntiforgery(await client.GetStringAsync(page));

    private static KeyValuePair<string, string> V(string cle, string valeur) => new(cle, valeur);

    private static DateTime Utc(int annee, int mois, int jour, int heure, int minute = 0) => new(annee, mois, jour, heure, minute, 0, DateTimeKind.Utc);

    private static DateTime EnUtc(DateTime valeur) => DateTime.SpecifyKind(valeur, DateTimeKind.Utc);

    private static ApplicationDbContext Base(IServiceScope scope) => scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

    private async Task<int> CreerProspectAsync(HttpClient client)
    {
        string u = Unique();
        var champs = new Dictionary<string, string>
        {
            ["prenom"] = "Ana", ["nom"] = "Essai" + u, ["courriel"] = "essai." + u + "@exemple.test", ["contactPrefere"] = "courriel",
            ["source"] = "appel", ["modele"] = "Kia Sportage", ["conseillerId"] = "moi", ["etape"] = "Nouveau",
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Prospects"),
        };
        Assert.Equal(HttpStatusCode.Redirect, (await client.PostAsync("/Prospects/Creer", new FormUrlEncodedContent(champs))).StatusCode);
        using var scope = _app.Services.CreateScope();
        return (await Base(scope).Prospects.SingleAsync(p => p.Nom == "Essai" + u)).Id;
    }

    private async Task<Prospect> LireAsync(int prospectId)
    {
        using var scope = _app.Services.CreateScope();
        return await Base(scope).Prospects.AsNoTracking()
            .Include(p => p.Opportunites).ThenInclude(o => o.VehiculesEnvisages)
            .Include(p => p.Opportunites).ThenInclude(o => o.RendezVous).ThenInclude(r => r.Evenements)
            .Include(p => p.Opportunites).ThenInclude(o => o.EssaisRoutiers)
            .Include(p => p.Opportunites).ThenInclude(o => o.HistoriqueEtapes)
            .Include(p => p.Opportunites).ThenInclude(o => o.HistoriqueSuivis)
            .Include(p => p.Notes)
            .AsSplitQuery()
            .SingleAsync(p => p.Id == prospectId);
    }

    private async Task<string> VersionAsync(int prospectId) => ServiceProspects.Empreinte(await LireAsync(prospectId));

    private async Task<List<EssaiRoutier>> EssaisAsync(int oppId)
    {
        using var scope = _app.Services.CreateScope();
        return await Base(scope).EssaisRoutiers.AsNoTracking().Where(e => e.OpportuniteId == oppId).OrderBy(e => e.Id).ToListAsync();
    }

    private async Task<int> NombreAsync()
    {
        using var scope = _app.Services.CreateScope();
        return await Base(scope).EssaisRoutiers.CountAsync();
    }

    private async Task<int> AjouterOpportuniteAsync(HttpClient client, int prospectId, string titre)
    {
        var envoi = await client.PostAsync("/Prospects/CreerOpportunite", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["prospectId"] = "pe-" + prospectId, ["titre"] = titre, ["etape"] = "Nouveau", ["version"] = await VersionAsync(prospectId),
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Prospects/Fiche/pe-" + prospectId),
        }));
        Assert.Equal(HttpStatusCode.Redirect, envoi.StatusCode);
        return (await LireAsync(prospectId)).Opportunites.Max(o => o.Id);
    }

    // Ajoute un véhicule envisagé (F21) et retourne son identifiant.
    private async Task<int> AjouterVehiculeAsync(HttpClient client, int p, int opp, string marque, string modele, string annee = "", string finition = "")
    {
        var envoi = await client.PostAsync("/Prospects/AjouterVehicule", new FormUrlEncodedContent(new[]
        {
            V("prospectId", "pe-" + p), V("opportuniteId", "oe-" + opp), V("version", await VersionAsync(p)), V("marque", marque), V("modele", modele),
            V("annee", annee), V("finition", finition), V("__RequestVerificationToken", await JetonAsync(client, "/Prospects/Fiche/pe-" + p)),
        }));
        Assert.Equal(HttpStatusCode.Redirect, envoi.StatusCode);
        return (await LireAsync(p)).Opportunites.Single(o => o.Id == opp).VehiculesEnvisages.Max(v => v.Id);
    }

    // Envoi de la fenêtre « Planifier un essai routier ». Version : l'empreinte actuelle si rien n'est donné.
    private async Task<HttpResponseMessage> PlanifierAsync(HttpClient client, int p, string opportuniteId, string date, string heure,
        string? vehiculeId = null, string? description = null, string duree = "45", string? version = null, bool jeton = true,
        IEnumerable<KeyValuePair<string, string>>? autres = null)
    {
        var formulaire = new List<KeyValuePair<string, string>>
        {
            V("prospectId", "pe-" + p), V("opportuniteId", opportuniteId), V("version", version ?? await VersionAsync(p)),
            V("vehiculeId", vehiculeId ?? ""), V("vehicule", description ?? ""), V("date", date), V("heure", heure), V("dureeMinutes", duree),
        };
        if (jeton)
            formulaire.Add(V("__RequestVerificationToken", await JetonAsync(client, "/Prospects/Fiche/pe-" + p)));
        if (autres is not null)
            formulaire.AddRange(autres);
        return await client.PostAsync("/Prospects/PlanifierEssaiRoutier", new FormUrlEncodedContent(formulaire));
    }

    private static string ExtraireDonnees(string page)
    {
        const string marque = "id=\"prospects-donnees\">";
        int debut = page.IndexOf(marque, StringComparison.Ordinal) + marque.Length;
        return page.Substring(debut, page.IndexOf("</script>", debut, StringComparison.Ordinal) - debut);
    }

    private static async Task<JsonElement> DonneesAsync(HttpClient client, int prospectId) =>
        JsonDocument.Parse(ExtraireDonnees(await client.GetStringAsync("/Prospects/Fiche/pe-" + prospectId))).RootElement.Clone();

    private static string? Message(JsonElement donnees, string nom)
    {
        var e = donnees.GetProperty("enregistrement").GetProperty(nom);
        return e.ValueKind == JsonValueKind.String ? e.GetString() : null;
    }

    private static List<JsonElement> Projetes(JsonElement donnees, int oppId) =>
        donnees.GetProperty("donnees").GetProperty("opportunites").EnumerateArray().Single(o => o.GetProperty("id").GetString() == "oe-" + oppId)
            .GetProperty("essaisRoutiers").EnumerateArray().ToList();

    private async Task<(HttpClient Client, int Prospect, int Opp)> DossierAsync()
    {
        var client = await _app.ConnecterAsync(Sophie);
        int p = await CreerProspectAsync(client);
        return (client, p, (await LireAsync(p)).Opportunites.Single().Id);
    }

    private async Task<HttpClient> CreerUtilisateurAsync(string role, bool memeConcession)
    {
        string courriel = "u." + Unique() + "@exemple.test";
        using (var scope = _app.Services.CreateScope())
        {
            var db = Base(scope);
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
            var u = new ApplicationUser { UserName = courriel, Email = courriel, FirstName = "Autre", LastName = "Personne", DealershipId = concession };
            Assert.True((await users.CreateAsync(u, DbSeeder.DemoPassword)).Succeeded);
            await users.AddToRoleAsync(u, role);
        }
        return await _app.ConnecterAsync(courriel);
    }

    // ---------- Création et consultation ----------

    [Fact]
    public async Task Une_opportunite_neuve_n_a_aucun_essai_invente()
    {
        var (client, p, opp) = await DossierAsync();

        Assert.Empty(await EssaisAsync(opp));
        Assert.Empty(Projetes(await DonneesAsync(client, p), opp));
    }

    [Fact]
    public async Task Deux_essais_l_un_sur_un_vehicule_envisage_l_autre_decrit_sont_enregistres_et_relus()
    {
        var (client, p, opp) = await DossierAsync();
        int ve = await AjouterVehiculeAsync(client, p, opp, "Kia", "Sportage", "2024", "EX");

        var premier = await PlanifierAsync(client, p, "oe-" + opp, "2027-01-15", "14:00", vehiculeId: "ve-" + ve, autres: [V("commentaire", "Vient avec sa conjointe.")]);
        Assert.Equal("Essai routier planifié dans le dossier. La disponibilité du véhicule et les autorisations de conduite ne sont pas vérifiées par cet enregistrement.",
            Message(await DonneesAsync(client, p), "confirmation"));
        await PlanifierAsync(client, p, "oe-" + opp, "2027-07-15", "14:00", description: "Hyundai Tucson hybride gris", duree: "60");

        Assert.Equal(HttpStatusCode.Redirect, premier.StatusCode);
        Assert.EndsWith("/Prospects/Fiche/pe-" + p + "?opportunite=oe-" + opp + "#opportunites", premier.Headers.Location!.OriginalString);
        var enBase = await EssaisAsync(opp);
        Assert.Equal(2, enBase.Select(e => e.Id).Distinct().Count());
        Assert.Equal((ve, "2024 Kia Sportage EX", Utc(2027, 1, 15, 19), "America/Toronto", 45, "Vient avec sa conjointe."),
            (enBase[0].VehiculeEnvisageId!.Value, enBase[0].VehiculeLibelle, EnUtc(enBase[0].DebutUtc), enBase[0].Fuseau, enBase[0].DureeMinutes, enBase[0].Commentaire));
        Assert.Equal(((int?)null, "Hyundai Tucson hybride gris", Utc(2027, 7, 15, 18), 60),
            (enBase[1].VehiculeEnvisageId, enBase[1].VehiculeLibelle, EnUtc(enBase[1].DebutUtc), enBase[1].DureeMinutes));

        // Relu par une nouvelle session (reconnexion) : mêmes essais, mêmes identifiants, fuseau conservé.
        var autreSession = await _app.ConnecterAsync(Sophie);
        var projetes = Projetes(await DonneesAsync(autreSession, p), opp);
        Assert.Equal(enBase.Select(e => "er-" + e.Id).ToArray(), projetes.Select(e => e.GetProperty("id").GetString()).ToArray());
        Assert.Equal(new[] { "2027-01-15T19:00:00Z", "2027-07-15T18:00:00Z" }, projetes.Select(e => e.GetProperty("debutUtc").GetString()).ToArray());
        Assert.Equal("ve-" + ve, projetes[0].GetProperty("vehiculeEnvisageId").GetString());
        Assert.Equal(JsonValueKind.Null, projetes[1].GetProperty("vehiculeEnvisageId").ValueKind);
        Assert.All(projetes, e => Assert.Equal("America/Toronto", e.GetProperty("fuseau").GetString()));
    }

    [Fact]
    public async Task Les_essais_sont_relus_dans_l_ordre_chronologique_et_deux_au_meme_moment_restent_distincts()
    {
        var (client, p, opp) = await DossierAsync();

        await PlanifierAsync(client, p, "oe-" + opp, "2027-02-18", "10:00", description: "Mazda CX-5");
        await PlanifierAsync(client, p, "oe-" + opp, "2027-02-10", "15:30", description: "Kia Seltos");
        await PlanifierAsync(client, p, "oe-" + opp, "2027-02-10", "15:30", description: "Kia Seltos");

        var enBase = await EssaisAsync(opp);
        var projetes = Projetes(await DonneesAsync(client, p), opp);
        Assert.Equal(3, enBase.Count);
        Assert.Equal(new[] { "er-" + enBase[1].Id, "er-" + enBase[2].Id, "er-" + enBase[0].Id }, projetes.Select(e => e.GetProperty("id").GetString()).ToArray());
    }

    // ---------- Véhicule ----------

    [Fact]
    public async Task Un_vehicule_d_une_autre_opportunite_inexistant_ou_forge_est_refuse_sans_rien_ecrire()
    {
        var (client, p, a) = await DossierAsync();
        int b = await AjouterOpportuniteAsync(client, p, "Projet B");
        int veB = await AjouterVehiculeAsync(client, p, b, "Kia", "Seltos");
        int total = await NombreAsync();
        string version = await VersionAsync(p);

        var reponses = new List<HttpResponseMessage>
        {
            await PlanifierAsync(client, p, "oe-" + a, "2027-02-10", "10:00", vehiculeId: "ve-" + veB),
            await PlanifierAsync(client, p, "oe-" + a, "2027-02-10", "10:00", vehiculeId: "ve-999999999"),
            await PlanifierAsync(client, p, "oe-" + a, "2027-02-10", "10:00", vehiculeId: "ve-abc"),
            await PlanifierAsync(client, p, "oe-" + a, "2027-02-10", "10:00", vehiculeId: "" + veB),
        };

        Assert.All(reponses, r => Assert.Equal(HttpStatusCode.NotFound, r.StatusCode));
        Assert.Equal(total, await NombreAsync());
        Assert.Equal(version, await VersionAsync(p));
    }

    [Fact]
    public async Task Sans_vehicule_ni_description_ou_avec_des_textes_trop_longs_l_essai_est_refuse()
    {
        var (client, p, opp) = await DossierAsync();
        int total = await NombreAsync();

        await PlanifierAsync(client, p, "oe-" + opp, "2027-02-10", "10:00");
        Assert.Contains("Choisissez un véhicule envisagé ou décrivez le véhicule", Message(await DonneesAsync(client, p), "erreur"));
        await PlanifierAsync(client, p, "oe-" + opp, "2027-02-10", "10:00", description: "   ");
        Assert.Contains("Choisissez un véhicule envisagé", Message(await DonneesAsync(client, p), "erreur"));
        await PlanifierAsync(client, p, "oe-" + opp, "2027-02-10", "10:00", description: new string('x', 121));
        Assert.Contains("120 caractères", Message(await DonneesAsync(client, p), "erreur"));
        await PlanifierAsync(client, p, "oe-" + opp, "2027-02-10", "10:00", description: "Kia", autres: [V("commentaire", new string('x', 501))]);
        Assert.Contains("500 caractères", Message(await DonneesAsync(client, p), "erreur"));

        Assert.Equal(total, await NombreAsync());
    }

    [Fact]
    public async Task Retirer_ou_modifier_le_vehicule_envisage_ne_supprime_ni_ne_reecrit_l_essai()
    {
        var (client, p, opp) = await DossierAsync();
        int ve = await AjouterVehiculeAsync(client, p, opp, "Kia", "Sportage", "2024");
        await PlanifierAsync(client, p, "oe-" + opp, "2027-01-15", "14:00", vehiculeId: "ve-" + ve);
        int essai = (await EssaisAsync(opp)).Single().Id;

        // Modification du véhicule envisagé (F21) : l'essai garde le véhicule tel qu'il était planifié.
        await client.PostAsync("/Prospects/ModifierVehicule", new FormUrlEncodedContent(new[]
        {
            V("prospectId", "pe-" + p), V("opportuniteId", "oe-" + opp), V("vehiculeId", "ve-" + ve), V("version", await VersionAsync(p)),
            V("champs", "modele"), V("modele", "Sorento"), V("__RequestVerificationToken", await JetonAsync(client, "/Prospects/Fiche/pe-" + p)),
        }));
        Assert.Equal("Sorento", (await LireAsync(p)).Opportunites.Single().VehiculesEnvisages.Single().Modele);
        Assert.Equal("2024 Kia Sportage", (await EssaisAsync(opp)).Single().VehiculeLibelle);

        // Retrait du véhicule envisagé (F21) : l'essai reste, sans référence, avec son libellé.
        var retrait = await client.PostAsync("/Prospects/RetirerVehicule", new FormUrlEncodedContent(new[]
        {
            V("prospectId", "pe-" + p), V("opportuniteId", "oe-" + opp), V("vehiculeId", "ve-" + ve), V("version", await VersionAsync(p)),
            V("__RequestVerificationToken", await JetonAsync(client, "/Prospects/Fiche/pe-" + p)),
        }));

        Assert.Equal(HttpStatusCode.Redirect, retrait.StatusCode);
        Assert.Empty((await LireAsync(p)).Opportunites.Single().VehiculesEnvisages);
        var apres = (await EssaisAsync(opp)).Single();
        Assert.Equal((essai, (int?)null, "2024 Kia Sportage", Utc(2027, 1, 15, 19)), (apres.Id, apres.VehiculeEnvisageId, apres.VehiculeLibelle, EnUtc(apres.DebutUtc)));
        var projete = Projetes(await DonneesAsync(client, p), opp).Single();
        Assert.Equal(JsonValueKind.Null, projete.GetProperty("vehiculeEnvisageId").ValueKind);
        Assert.Equal("2024 Kia Sportage", projete.GetProperty("vehiculeLibelle").GetString());
    }

    // ---------- Temps ----------

    [Theory]
    [InlineData("2027-03-14", "02:30", "45", "n'existe pas")]
    [InlineData("2027-11-07", "01:30", "45", "existe deux fois")]
    [InlineData("2027-03-14", "01:30", "60", "changement d'heure")]
    [InlineData("2027-01-09", "10:00", "45", "déjà passé")]
    [InlineData("2027-01-10", "09:55", "45", "déjà passé")]
    [InlineData("2027-01-20", "14:00", "50", "durée")]
    [InlineData("2027-01-20", "25:00", "45", "heure valide")]
    [InlineData("20/01/2027", "14:00", "45", "date valide")]
    public async Task Un_horaire_invalide_est_refuse_sans_rien_ecrire(string date, string heure, string duree, string motif)
    {
        var (client, p, opp) = await DossierAsync();
        int total = await NombreAsync();

        await PlanifierAsync(client, p, "oe-" + opp, date, heure, description: "Kia Sportage", duree: duree);

        Assert.Contains(motif, Message(await DonneesAsync(client, p), "erreur"));
        Assert.Equal(total, await NombreAsync());
    }

    [Fact]
    public async Task Autour_des_changements_d_heure_et_d_un_jour_a_l_autre_les_instants_UTC_sont_exacts()
    {
        var (client, p, opp) = await DossierAsync();

        await PlanifierAsync(client, p, "oe-" + opp, "2027-03-14", "03:00", description: "A");
        await PlanifierAsync(client, p, "oe-" + opp, "2027-11-07", "02:00", description: "B");
        await PlanifierAsync(client, p, "oe-" + opp, "2027-01-20", "23:30", description: "C");

        Assert.Equal(new[] { Utc(2027, 3, 14, 7), Utc(2027, 11, 7, 7), Utc(2027, 1, 21, 4, 30) }, (await EssaisAsync(opp)).Select(e => EnUtc(e.DebutUtc)).ToArray());
    }

    // ---------- Concurrence ----------

    [Fact]
    public async Task Le_meme_formulaire_envoye_deux_fois_ne_cree_qu_un_essai_et_deux_essais_voulus_restent_possibles()
    {
        var (client, p, opp) = await DossierAsync();
        string version = await VersionAsync(p);

        await PlanifierAsync(client, p, "oe-" + opp, "2027-02-10", "10:00", description: "Kia Sportage", version: version);
        await PlanifierAsync(client, p, "oe-" + opp, "2027-02-10", "10:00", description: "Kia Sportage", version: version);
        Assert.Contains("modifié entre-temps", Message(await DonneesAsync(client, p), "erreur"));
        Assert.Single(await EssaisAsync(opp));

        await PlanifierAsync(client, p, "oe-" + opp, "2027-02-10", "10:00", description: "Kia Sportage");
        Assert.Equal(2, (await EssaisAsync(opp)).Count);
    }

    [Fact]
    public async Task Deux_sessions_simultanees_depuis_la_meme_page_un_seul_essai_est_cree()
    {
        var premiere = await _app.ConnecterAsync(Sophie);
        var seconde = await _app.ConnecterAsync(Sophie);
        for (int tour = 0; tour < 3; tour++)
        {
            int p = await CreerProspectAsync(premiere);
            int opp = (await LireAsync(p)).Opportunites.Single().Id;
            string version = await VersionAsync(p);
            async Task<List<KeyValuePair<string, string>>> Formulaire(HttpClient c, string heure) =>
                [V("prospectId", "pe-" + p), V("opportuniteId", "oe-" + opp), V("version", version), V("vehicule", "Kia Sportage"), V("date", "2027-02-10"),
                 V("heure", heure), V("dureeMinutes", "45"), V("__RequestVerificationToken", await JetonAsync(c, "/Prospects/Fiche/pe-" + p))];
            var f1 = await Formulaire(premiere, "10:00");
            var f2 = await Formulaire(seconde, "16:00");
            var depart = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var e1 = Task.Run(async () => { await depart.Task; return await premiere.PostAsync("/Prospects/PlanifierEssaiRoutier", new FormUrlEncodedContent(f1)); });
            var e2 = Task.Run(async () => { await depart.Task; return await seconde.PostAsync("/Prospects/PlanifierEssaiRoutier", new FormUrlEncodedContent(f2)); });
            depart.SetResult();
            await Task.WhenAll(e1, e2);

            var d1 = await DonneesAsync(premiere, p);
            var d2 = await DonneesAsync(seconde, p);
            Assert.Single(new[] { Message(d1, "confirmation"), Message(d2, "confirmation") }.Where(x => x is not null));
            Assert.Contains("modifié entre-temps", new[] { Message(d1, "erreur"), Message(d2, "erreur") }.Single(x => x is not null));
            var e = (await EssaisAsync(opp)).Single();
            Assert.Equal(Message(d1, "confirmation") is not null ? Utc(2027, 2, 10, 15) : Utc(2027, 2, 10, 21), EnUtc(e.DebutUtc));
        }
    }

    [Fact]
    public async Task Avec_un_essai_l_empreinte_change_et_la_fiche_garde_celle_du_serveur()
    {
        var (client, p, opp) = await DossierAsync();
        string sansEssai = await VersionAsync(p);
        await PlanifierAsync(client, p, "oe-" + opp, "2027-02-10", "10:00", description: "Kia Sportage");

        string avecEssai = await VersionAsync(p);
        var contact = (await DonneesAsync(client, p)).GetProperty("donnees").GetProperty("contacts").EnumerateArray().Single(c => c.GetProperty("id").GetString() == "pe-" + p);

        Assert.NotEqual(sansEssai, avecEssai);
        Assert.Equal(avecEssai, contact.GetProperty("version").GetString());
    }

    // ---------- Plusieurs opportunités ----------

    [Fact]
    public async Task Les_essais_de_A_et_de_B_restent_separes()
    {
        var (client, p, a) = await DossierAsync();
        int b = await AjouterOpportuniteAsync(client, p, "Projet B");

        await PlanifierAsync(client, p, "oe-" + a, "2027-12-10", "10:00", description: "A1");
        await PlanifierAsync(client, p, "oe-" + a, "2027-12-18", "10:00", description: "A2");
        await PlanifierAsync(client, p, "oe-" + b, "2027-12-12", "10:00", description: "B1");

        var donnees = await DonneesAsync(client, p);
        Assert.Equal(new[] { "A1", "A2" }, Projetes(donnees, a).Select(e => e.GetProperty("vehiculeLibelle").GetString()).ToArray());
        Assert.Equal(new[] { "B1" }, Projetes(donnees, b).Select(e => e.GetProperty("vehiculeLibelle").GetString()).ToArray());
        Assert.Equal((2, 1), ((await EssaisAsync(a)).Count, (await EssaisAsync(b)).Count));
    }

    [Fact]
    public async Task Une_opportunite_cloturee_ne_recoit_pas_d_essai()
    {
        var (client, p, opp) = await DossierAsync();
        using (var scope = _app.Services.CreateScope())
            await Base(scope).Database.ExecuteSqlInterpolatedAsync($"UPDATE OpportunitesVente SET Etape = 'Perdu' WHERE Id = {opp}");
        int total = await NombreAsync();

        await PlanifierAsync(client, p, "oe-" + opp, "2027-02-10", "10:00", description: "Kia Sportage");

        Assert.Contains("clôturée", Message(await DonneesAsync(client, p), "erreur"));
        Assert.Equal(total, await NombreAsync());
    }

    // ---------- Sécurité ----------

    [Fact]
    public async Task Opportunite_d_un_autre_prospect_identifiants_forges_jeton_absent_et_GET_sont_refuses()
    {
        var (client, p, opp) = await DossierAsync();
        int autre = await CreerProspectAsync(client);
        int oppAutre = (await LireAsync(autre)).Opportunites.Single().Id;
        int total = await NombreAsync();
        string version = await VersionAsync(p);

        var reponses = new List<HttpResponseMessage>
        {
            await PlanifierAsync(client, p, "oe-" + oppAutre, "2027-02-10", "10:00", description: "Kia"),
            await PlanifierAsync(client, p, "oe-999999999", "2027-02-10", "10:00", description: "Kia"),
            await PlanifierAsync(client, p, "oe-abc", "2027-02-10", "10:00", description: "Kia"),
            await PlanifierAsync(client, p, "" + opp, "2027-02-10", "10:00", description: "Kia"),
        };
        var prospectInexistant = await client.PostAsync("/Prospects/PlanifierEssaiRoutier", new FormUrlEncodedContent(new[]
        {
            V("prospectId", "pe-999999999"), V("opportuniteId", "oe-" + opp), V("version", version), V("vehicule", "Kia"), V("date", "2027-02-10"),
            V("heure", "10:00"), V("dureeMinutes", "45"), V("__RequestVerificationToken", await JetonAsync(client, "/Prospects")),
        }));
        var sansJeton = await PlanifierAsync(client, p, "oe-" + opp, "2027-02-10", "10:00", description: "Kia", jeton: false);
        var parGet = await client.GetAsync($"/Prospects/PlanifierEssaiRoutier?prospectId=pe-{p}&opportuniteId=oe-{opp}&version={version}&vehicule=Kia&date=2027-02-10&heure=10:00&dureeMinutes=45");

        Assert.All(reponses, r => Assert.Equal(HttpStatusCode.NotFound, r.StatusCode));
        Assert.Equal(HttpStatusCode.NotFound, prospectInexistant.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, sansJeton.StatusCode);
        Assert.False(parGet.IsSuccessStatusCode);
        Assert.Equal(total, await NombreAsync());
        Assert.Equal(version, await VersionAsync(p));
    }

    [Fact]
    public async Task Collegue_autre_concession_et_role_non_conseiller_ne_peuvent_rien_planifier()
    {
        var (sophie, p, opp) = await DossierAsync();
        int ve = await AjouterVehiculeAsync(sophie, p, opp, "Kia", "Sportage");
        string version = await VersionAsync(p);
        int total = await NombreAsync();

        foreach (var intrus in new[] { await CreerUtilisateurAsync(AppRoles.Conseiller, true), await CreerUtilisateurAsync(AppRoles.Conseiller, false) })
        {
            var r = await intrus.PostAsync("/Prospects/PlanifierEssaiRoutier", new FormUrlEncodedContent(new[]
            {
                V("prospectId", "pe-" + p), V("opportuniteId", "oe-" + opp), V("version", version), V("vehiculeId", "ve-" + ve), V("date", "2027-02-10"),
                V("heure", "10:00"), V("dureeMinutes", "45"), V("__RequestVerificationToken", await JetonAsync(intrus, "/Prospects")),
            }));
            Assert.Equal(HttpStatusCode.NotFound, r.StatusCode);
            Assert.DoesNotContain("Sportage", await r.Content.ReadAsStringAsync());
        }
        var directeur = await CreerUtilisateurAsync(AppRoles.Directeur, true);
        var refusRole = await directeur.PostAsync("/Prospects/PlanifierEssaiRoutier", new FormUrlEncodedContent(new[]
        {
            V("prospectId", "pe-" + p), V("opportuniteId", "oe-" + opp), V("version", version), V("vehicule", "Kia"), V("date", "2027-02-10"),
            V("heure", "10:00"), V("dureeMinutes", "45"),
        }));

        bool traite = refusRole.StatusCode == HttpStatusCode.Redirect && (refusRole.Headers.Location?.OriginalString ?? "").Contains("/Prospects/Fiche");
        Assert.False(traite);
        Assert.NotEqual(HttpStatusCode.OK, refusRole.StatusCode);
        Assert.Equal(total, await NombreAsync());
    }

    // ---------- Ce que planifier un essai ne fait pas ----------

    [Fact]
    public async Task Planifier_un_essai_ne_touche_ni_inventaire_ni_rendez_vous_ni_qualification_ni_vehicules_ni_contact_ni_suivi()
    {
        var (client, p, opp) = await DossierAsync();
        await client.PostAsync("/Prospects/Qualifier", new FormUrlEncodedContent(new[]
        {
            V("prospectId", "pe-" + p), V("opportuniteId", "oe-" + opp), V("version", await VersionAsync(p)), V("champs", "categorie,budgetTotal"),
            V("categorie", "vus"), V("budgetTotal", "32000"), V("__RequestVerificationToken", await JetonAsync(client, "/Prospects/Fiche/pe-" + p)),
        }));
        int ve = await AjouterVehiculeAsync(client, p, opp, "Kia", "Sportage", "2024");
        await client.PostAsync("/Prospects/PlanifierRendezVous", new FormUrlEncodedContent(new[]
        {
            V("prospectId", "pe-" + p), V("opportuniteId", "oe-" + opp), V("version", await VersionAsync(p)), V("type", "Consultation"), V("date", "2027-02-01"),
            V("heure", "10:00"), V("dureeMinutes", "45"), V("mode", "concession"), V("__RequestVerificationToken", await JetonAsync(client, "/Prospects/Fiche/pe-" + p)),
        }));
        var avant = await LireAsync(p);
        var o0 = avant.Opportunites.Single();
        int vehiculesInventaire, historiquesInventaire, rendezVous;
        string statutsInventaire;
        using (var scope = _app.Services.CreateScope())
        {
            var db = Base(scope);
            vehiculesInventaire = await db.Vehicules.CountAsync();
            statutsInventaire = string.Join(",", await db.Vehicules.OrderBy(v => v.Id).Select(v => v.Id + ":" + v.StatutActuel).ToListAsync());
            historiquesInventaire = await db.HistoriquesStatut.CountAsync();
            rendezVous = await db.RendezVousCommerciaux.CountAsync();
        }

        await PlanifierAsync(client, p, "oe-" + opp, "2027-02-10", "10:00", vehiculeId: "ve-" + ve);

        var apres = await LireAsync(p);
        var o = apres.Opportunites.Single();
        Assert.Single(o.EssaisRoutiers);
        Assert.Equal((o0.Categorie, o0.BudgetTotal, o0.Etape, o0.ProchaineAction, o0.DateProchaineAction, o0.DerniereActivite, o0.Titre),
            (o.Categorie, o.BudgetTotal, o.Etape, o.ProchaineAction, o.DateProchaineAction, o.DerniereActivite, o.Titre));
        Assert.Equal(("Kia", "Sportage", 2024), (o.VehiculesEnvisages.Single().Marque, o.VehiculesEnvisages.Single().Modele, o.VehiculesEnvisages.Single().Annee!.Value));
        var rdv = o.RendezVous.Single();
        Assert.Equal((StatutRendezVous.Planifie, 0), (rdv.Statut, rdv.Evenements.Count));
        Assert.Empty(apres.Notes);
        Assert.Empty(o.HistoriqueEtapes);
        Assert.Empty(o.HistoriqueSuivis);
        using (var scope = _app.Services.CreateScope())
        {
            var db = Base(scope);
            Assert.Equal((vehiculesInventaire, historiquesInventaire, rendezVous),
                (await db.Vehicules.CountAsync(), await db.HistoriquesStatut.CountAsync(), await db.RendezVousCommerciaux.CountAsync()));
            // Aucun véhicule d'inventaire réservé ni changé de statut par la planification.
            Assert.Equal(statutsInventaire, string.Join(",", await db.Vehicules.OrderBy(v => v.Id).Select(v => v.Id + ":" + v.StatutActuel).ToListAsync()));
            Assert.True(vehiculesInventaire > 0, "l'inventaire de démonstration de la base de test n'est pas vide : le contrôle a un sens");
            // Base propre à cette classe : aucun de ses tests ne réserve un véhicule, et chacun planifie des essais. Aucun
            // véhicule ne doit donc être « Réservé », quel que soit l'ordre des tests (une réservation par essai se verrait ici).
            Assert.DoesNotContain(StatutVehicule.Reserve, await db.Vehicules.Select(v => v.StatutActuel).ToListAsync());
            Assert.False(await db.VeillesRecommandation.AnyAsync(v => v.OpportuniteId == opp));
        }
        // Les échanges de la fiche ne contiennent aucune trace de l'essai (ce n'est pas un contact).
        var interactions = (await DonneesAsync(client, p)).GetProperty("donnees").GetProperty("interactions").EnumerateArray()
            .Where(i => i.GetProperty("prospectId").GetString() == "pe-" + p).Select(i => i.GetProperty("type").GetString()).ToList();
        Assert.DoesNotContain(interactions, t => t is "rendezvous" or "appel" or "courriel" or "visite" or "essai" or "suivi-realise");
    }
}
