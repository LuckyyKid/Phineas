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

// Fonctionnalité 21 : véhicules envisagés enregistrés d'une opportunité réelle, sur MySQL de test et par de vraies
// requêtes (ProspectsController.AjouterVehicule, ModifierVehicule, RetirerVehicule). Chaque véhicule appartient à SON
// opportunité ; rien d'autre ne change (qualification, étape, suivi, activité, inventaire) ; une page périmée ne peut
// rien écraser ; un identifiant d'un autre dossier ou d'une autre opportunité est refusé sans écriture.
public class VehiculesEnvisagesTests : IClassFixture<ApplicationDeTest>
{
    private const string Sophie = "sophie.gagnon@autoprestige.example";

    private readonly ApplicationDeTest _app;

    public VehiculesEnvisagesTests(ApplicationDeTest app)
    {
        _app = app;
    }

    private static string Unique() => Guid.NewGuid().ToString("N").Substring(0, 8);

    private static async Task<string> JetonAsync(HttpClient client, string page) =>
        ApplicationDeTest.JetonAntiforgery(await client.GetStringAsync(page));

    private static KeyValuePair<string, string> V(string cle, string valeur) => new(cle, valeur);

    private async Task<int> CreerProspectAsync(HttpClient client)
    {
        string u = Unique();
        var champs = new Dictionary<string, string>
        {
            ["prenom"] = "Ana", ["nom"] = "Vehic" + u, ["courriel"] = "vehic." + u + "@exemple.test", ["contactPrefere"] = "courriel",
            ["source"] = "appel", ["modele"] = "Kia Sportage", ["conseillerId"] = "moi", ["etape"] = "Nouveau",
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Prospects"),
        };
        Assert.Equal(HttpStatusCode.Redirect, (await client.PostAsync("/Prospects/Creer", new FormUrlEncodedContent(champs))).StatusCode);
        using var scope = _app.Services.CreateScope();
        return (await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Prospects.SingleAsync(p => p.Nom == "Vehic" + u)).Id;
    }

    private async Task<Prospect> LireAsync(int prospectId)
    {
        using var scope = _app.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Prospects.AsNoTracking()
            .Include(p => p.Opportunites).ThenInclude(o => o.VehiculesEnvisages)
            .Include(p => p.Opportunites).ThenInclude(o => o.HistoriqueEtapes)
            .Include(p => p.Opportunites).ThenInclude(o => o.HistoriqueSuivis)
            .Include(p => p.Notes)
            .SingleAsync(p => p.Id == prospectId);
    }

    private async Task<string> VersionAsync(int prospectId) => ServiceProspects.Empreinte(await LireAsync(prospectId));

    // Véhicules d'une opportunité en base, dans l'ordre d'ajout : « Id:2024 Kia Sportage EX ».
    private async Task<List<VehiculeEnvisage>> VehiculesAsync(int oppId)
    {
        using var scope = _app.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().VehiculesEnvisages.AsNoTracking()
            .Where(v => v.OpportuniteId == oppId).OrderBy(v => v.Id).ToListAsync();
    }

    private async Task<int> NombreDeVehiculesAsync()
    {
        using var scope = _app.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().VehiculesEnvisages.CountAsync();
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

    // Envoi d'une des trois actions. Version : l'empreinte actuelle si rien n'est donné (page à jour).
    private async Task<HttpResponseMessage> EnvoyerAsync(HttpClient client, string action, int prospectId, string opportuniteId, string? vehiculeId,
        IEnumerable<KeyValuePair<string, string>> valeurs, string? version = null, bool jeton = true, string? champs = null)
    {
        var formulaire = new List<KeyValuePair<string, string>>
        {
            V("prospectId", "pe-" + prospectId), V("opportuniteId", opportuniteId), V("vehiculeId", vehiculeId ?? ""),
            V("version", version ?? await VersionAsync(prospectId)), V("champs", champs ?? "marque,modele,annee,finition"),
        };
        if (jeton)
            formulaire.Add(V("__RequestVerificationToken", await JetonAsync(client, "/Prospects/Fiche/pe-" + prospectId)));
        formulaire.AddRange(valeurs);
        return await client.PostAsync("/Prospects/" + action, new FormUrlEncodedContent(formulaire));
    }

    private Task<HttpResponseMessage> AjouterAsync(HttpClient client, int p, int opp, string marque, string modele, string annee = "", string finition = "", string? version = null) =>
        EnvoyerAsync(client, "AjouterVehicule", p, "oe-" + opp, null, [V("marque", marque), V("modele", modele), V("annee", annee), V("finition", finition)], version);

    private static string ExtraireDonnees(string page)
    {
        const string marque = "id=\"prospects-donnees\">";
        int debut = page.IndexOf(marque, StringComparison.Ordinal) + marque.Length;
        return page.Substring(debut, page.IndexOf("</script>", debut, StringComparison.Ordinal) - debut);
    }

    // Données de la fiche (JSON lu par le navigateur) : messages du serveur et opportunités projetées.
    private static async Task<JsonElement> DonneesAsync(HttpClient client, int prospectId) =>
        JsonDocument.Parse(ExtraireDonnees(await client.GetStringAsync("/Prospects/Fiche/pe-" + prospectId))).RootElement.Clone();

    private static string? Message(JsonElement donnees, string nom)
    {
        var e = donnees.GetProperty("enregistrement").GetProperty(nom);
        return e.ValueKind == JsonValueKind.String ? e.GetString() : null;
    }

    private static JsonElement Projetee(JsonElement donnees, int oppId) =>
        donnees.GetProperty("donnees").GetProperty("opportunites").EnumerateArray().Single(o => o.GetProperty("id").GetString() == "oe-" + oppId);

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

    // ---------- Lecture, ajout ----------

    [Fact]
    public async Task Une_opportunite_neuve_n_a_aucun_vehicule_envisage_invente()
    {
        var client = await _app.ConnecterAsync(Sophie);
        int p = await CreerProspectAsync(client);
        int opp = (await LireAsync(p)).Opportunites.Single().Id;

        var projetee = Projetee(await DonneesAsync(client, p), opp);

        Assert.Empty(await VehiculesAsync(opp));
        Assert.Equal(0, projetee.GetProperty("vehiculesEnvisages").GetArrayLength());
        Assert.Equal(0, projetee.GetProperty("vehiculesDetail").GetArrayLength());
    }

    [Fact]
    public async Task Trois_ajouts_successifs_donnent_trois_vehicules_distincts_de_la_bonne_opportunite_relus_par_la_fiche()
    {
        var client = await _app.ConnecterAsync(Sophie);
        int p = await CreerProspectAsync(client);
        int opp = (await LireAsync(p)).Opportunites.Single().Id;

        var premier = await AjouterAsync(client, p, opp, " Kia ", "Sportage", "2024", "EX");
        Assert.Equal("Véhicule envisagé ajouté.", Message(await DonneesAsync(client, p), "confirmation"));
        await AjouterAsync(client, p, opp, "Kia", "Sportage", "2023");
        await AjouterAsync(client, p, opp, "Mazda", "CX-5");

        Assert.Equal(HttpStatusCode.Redirect, premier.StatusCode);
        Assert.EndsWith("/Prospects/Fiche/pe-" + p + "?opportunite=oe-" + opp + "#opportunites", premier.Headers.Location!.OriginalString);
        var enBase = await VehiculesAsync(opp);
        Assert.Equal(3, enBase.Select(v => v.Id).Distinct().Count());
        Assert.All(enBase, v => Assert.Equal(opp, v.OpportuniteId));
        Assert.Equal(("Kia", "Sportage", (int?)2024, "EX"), (enBase[0].Marque, enBase[0].Modele, enBase[0].Annee, enBase[0].Finition));
        Assert.Equal(("Mazda", "CX-5", (int?)null, (string?)null), (enBase[2].Marque, enBase[2].Modele, enBase[2].Annee, enBase[2].Finition));
        var projetee = Projetee(await DonneesAsync(client, p), opp);
        Assert.Equal(new[] { "2024 Kia Sportage EX", "2023 Kia Sportage", "Mazda CX-5" },
            projetee.GetProperty("vehiculesEnvisages").EnumerateArray().Select(x => x.GetString()).ToArray());
        Assert.Equal(enBase.Select(v => "ve-" + v.Id).ToArray(),
            projetee.GetProperty("vehiculesDetail").EnumerateArray().Select(x => x.GetProperty("id").GetString()).ToArray());
    }

    // ---------- Modification, retrait ----------

    [Fact]
    public async Task Modifier_le_deuxieme_ne_change_que_lui_et_seulement_les_champs_envoyes()
    {
        var client = await _app.ConnecterAsync(Sophie);
        int p = await CreerProspectAsync(client);
        int opp = (await LireAsync(p)).Opportunites.Single().Id;
        await AjouterAsync(client, p, opp, "Kia", "Sportage", "2024", "EX");
        await AjouterAsync(client, p, opp, "Honda", "CR-V", "2022", "Touring");
        await AjouterAsync(client, p, opp, "Mazda", "CX-5");
        var avant = await VehiculesAsync(opp);

        var envoi = await EnvoyerAsync(client, "ModifierVehicule", p, "oe-" + opp, "ve-" + avant[1].Id, [V("annee", ""), V("finition", "Sport")], champs: "annee,finition");

        Assert.Equal(HttpStatusCode.Redirect, envoi.StatusCode);
        Assert.Equal("Véhicule envisagé modifié.", Message(await DonneesAsync(client, p), "confirmation"));
        var apres = await VehiculesAsync(opp);
        Assert.Equal(("Honda", "CR-V", (int?)null, "Sport"), (apres[1].Marque, apres[1].Modele, apres[1].Annee, apres[1].Finition));
        Assert.Equal((avant[0].Marque, avant[0].Annee, avant[0].Finition), (apres[0].Marque, apres[0].Annee, apres[0].Finition));
        Assert.Equal((avant[2].Marque, avant[2].Modele), (apres[2].Marque, apres[2].Modele));
    }

    [Fact]
    public async Task Retirer_le_premier_garde_les_autres_et_une_modification_du_vehicule_retire_est_refusee()
    {
        var client = await _app.ConnecterAsync(Sophie);
        int p = await CreerProspectAsync(client);
        int opp = (await LireAsync(p)).Opportunites.Single().Id;
        await AjouterAsync(client, p, opp, "Kia", "Sportage");
        await AjouterAsync(client, p, opp, "Honda", "CR-V");
        await AjouterAsync(client, p, opp, "Mazda", "CX-5");
        var avant = await VehiculesAsync(opp);
        string pageAvantRetrait = await VersionAsync(p);

        var retrait = await EnvoyerAsync(client, "RetirerVehicule", p, "oe-" + opp, "ve-" + avant[0].Id, []);
        Assert.Equal("Véhicule envisagé retiré.", Message(await DonneesAsync(client, p), "confirmation"));
        // Ancien formulaire (empreinte d'avant le retrait) : conflit expliqué ; page à jour : le véhicule n'existe plus.
        var perimee = await EnvoyerAsync(client, "ModifierVehicule", p, "oe-" + opp, "ve-" + avant[0].Id, [V("marque", "Toyota"), V("modele", "RAV4")], pageAvantRetrait, champs: "marque,modele");
        string? conflit = Message(await DonneesAsync(client, p), "erreur");
        var aJour = await EnvoyerAsync(client, "ModifierVehicule", p, "oe-" + opp, "ve-" + avant[0].Id, [V("marque", "Toyota"), V("modele", "RAV4")], champs: "marque,modele");

        Assert.Equal(HttpStatusCode.Redirect, retrait.StatusCode);
        Assert.Equal(HttpStatusCode.Redirect, perimee.StatusCode);
        Assert.Contains("modifié entre-temps", conflit);
        Assert.Equal(HttpStatusCode.NotFound, aJour.StatusCode);
        var apres = await VehiculesAsync(opp);
        Assert.Equal(new[] { avant[1].Id, avant[2].Id }, apres.Select(v => v.Id).ToArray());
        Assert.DoesNotContain(apres, v => v.Marque == "Toyota");

        // Retrait du dernier : c'est exactement lui qui part, pas le premier de la liste.
        await EnvoyerAsync(client, "RetirerVehicule", p, "oe-" + opp, "ve-" + avant[2].Id, []);
        Assert.Equal(new[] { avant[1].Id }, (await VehiculesAsync(opp)).Select(v => v.Id).ToArray());
    }

    [Fact]
    public async Task Un_GET_ne_retire_rien_et_libelles_et_detail_restent_les_memes_vehicules_apres_modification_et_retrait()
    {
        var client = await _app.ConnecterAsync(Sophie);
        int p = await CreerProspectAsync(client);
        int opp = (await LireAsync(p)).Opportunites.Single().Id;
        await AjouterAsync(client, p, opp, "Kia", "Sportage", "2024");
        await AjouterAsync(client, p, opp, "Honda", "CR-V");
        var avant = await VehiculesAsync(opp);
        string version = await VersionAsync(p);

        // Une simple navigation (GET, même avec tous les paramètres) n'est pas une commande : rien n'est retiré.
        var get = await client.GetAsync($"/Prospects/RetirerVehicule?prospectId=pe-{p}&opportuniteId=oe-{opp}&vehiculeId=ve-{avant[0].Id}&version={version}");
        Assert.NotEqual(HttpStatusCode.Redirect, get.StatusCode);
        Assert.False(get.IsSuccessStatusCode);
        Assert.Equal(2, (await VehiculesAsync(opp)).Count);

        await EnvoyerAsync(client, "ModifierVehicule", p, "oe-" + opp, "ve-" + avant[1].Id, [V("annee", "2023"), V("finition", "EX")], champs: "annee,finition");
        await EnvoyerAsync(client, "RetirerVehicule", p, "oe-" + opp, "ve-" + avant[0].Id, []);

        var projetee = Projetee(await DonneesAsync(client, p), opp);
        var libelles = projetee.GetProperty("vehiculesEnvisages").EnumerateArray().Select(x => x.GetString()).ToArray();
        var detail = projetee.GetProperty("vehiculesDetail").EnumerateArray().ToList();
        Assert.Equal(new[] { "2023 Honda CR-V EX" }, libelles);
        Assert.Equal(new[] { "ve-" + avant[1].Id }, detail.Select(x => x.GetProperty("id").GetString()).ToArray());
        Assert.Equal(libelles, detail.Select(x => x.GetProperty("libelle").GetString()).ToArray());
    }

    // ---------- Validations ----------

    [Theory]
    [InlineData("", "Sportage", "", "")]
    [InlineData("Kia", "  ", "", "")]
    [InlineData("Kia", "Sportage", "1979", "")]
    [InlineData("Kia", "Sportage", "3000", "")]
    [InlineData("Kia", "Sportage", "deux-mille", "")]
    [InlineData("Kia", "Sportage", "-2024", "")]
    public async Task Un_ajout_invalide_est_refuse_sans_rien_ecrire(string marque, string modele, string annee, string finition)
    {
        var client = await _app.ConnecterAsync(Sophie);
        int p = await CreerProspectAsync(client);
        int opp = (await LireAsync(p)).Opportunites.Single().Id;
        string version = await VersionAsync(p);

        var refus = await AjouterAsync(client, p, opp, marque, modele, annee, finition);

        Assert.Equal(HttpStatusCode.Redirect, refus.StatusCode);
        Assert.StartsWith("Véhicule envisagé non ajouté.", Message(await DonneesAsync(client, p), "erreur"));
        Assert.Empty(await VehiculesAsync(opp));
        Assert.Equal(version, await VersionAsync(p));
    }

    [Theory]
    [InlineData("marque", 41)]
    [InlineData("modele", 61)]
    [InlineData("finition", 61)]
    public async Task Un_texte_trop_long_est_refuse_et_la_modification_vide_de_la_marque_aussi(string champ, int longueur)
    {
        var client = await _app.ConnecterAsync(Sophie);
        int p = await CreerProspectAsync(client);
        int opp = (await LireAsync(p)).Opportunites.Single().Id;
        await AjouterAsync(client, p, opp, "Kia", "Sportage", "2024", "EX");
        int ve = (await VehiculesAsync(opp)).Single().Id;

        await EnvoyerAsync(client, "ModifierVehicule", p, "oe-" + opp, "ve-" + ve, [V(champ, new string('a', longueur))], champs: champ);
        await EnvoyerAsync(client, "ModifierVehicule", p, "oe-" + opp, "ve-" + ve, [V("marque", "")], champs: "marque");

        var v = (await VehiculesAsync(opp)).Single();
        Assert.Equal(("Kia", "Sportage", (int?)2024, "EX"), (v.Marque, v.Modele, v.Annee, v.Finition));
    }

    // ---------- Doubles envois et concurrence ----------

    [Fact]
    public async Task Le_meme_formulaire_envoye_deux_fois_n_ajoute_qu_un_vehicule()
    {
        var client = await _app.ConnecterAsync(Sophie);
        int p = await CreerProspectAsync(client);
        int opp = (await LireAsync(p)).Opportunites.Single().Id;
        string version = await VersionAsync(p);

        await AjouterAsync(client, p, opp, "Kia", "Sportage", version: version);
        await AjouterAsync(client, p, opp, "Kia", "Sportage", version: version);

        Assert.Single(await VehiculesAsync(opp));
        Assert.Contains("modifié entre-temps", Message(await DonneesAsync(client, p), "erreur"));
    }

    [Fact]
    public async Task Deux_sessions_simultanees_depuis_la_meme_page_une_seule_operation_est_appliquee()
    {
        var premiere = await _app.ConnecterAsync(Sophie);
        var seconde = await _app.ConnecterAsync(Sophie);
        for (int tour = 0; tour < 3; tour++)
        {
            int p = await CreerProspectAsync(premiere);
            int opp = (await LireAsync(p)).Opportunites.Single().Id;
            await AjouterAsync(premiere, p, opp, "Kia", "Sportage");
            int ve = (await VehiculesAsync(opp)).Single().Id;
            string version = await VersionAsync(p);
            async Task<List<KeyValuePair<string, string>>> Formulaire(HttpClient c, string vehiculeId, params KeyValuePair<string, string>[] valeurs)
            {
                var f = new List<KeyValuePair<string, string>> { V("prospectId", "pe-" + p), V("opportuniteId", "oe-" + opp), V("vehiculeId", vehiculeId),
                    V("version", version), V("champs", "marque,modele,annee,finition"), V("__RequestVerificationToken", await JetonAsync(c, "/Prospects/Fiche/pe-" + p)) };
                f.AddRange(valeurs);
                return f;
            }
            // Tour 0 : deux ajouts ; tour 1 : deux modifications du même véhicule ; tour 2 : retrait et modification.
            string a1 = tour == 2 ? "RetirerVehicule" : tour == 1 ? "ModifierVehicule" : "AjouterVehicule";
            string a2 = tour == 0 ? "AjouterVehicule" : "ModifierVehicule";
            var f1 = await Formulaire(premiere, tour == 0 ? "" : "ve-" + ve, V("marque", "Honda"), V("modele", "CR-V"));
            var f2 = await Formulaire(seconde, tour == 0 ? "" : "ve-" + ve, V("marque", "Mazda"), V("modele", "CX-5"));
            var depart = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var e1 = Task.Run(async () => { await depart.Task; return await premiere.PostAsync("/Prospects/" + a1, new FormUrlEncodedContent(f1)); });
            var e2 = Task.Run(async () => { await depart.Task; return await seconde.PostAsync("/Prospects/" + a2, new FormUrlEncodedContent(f2)); });
            depart.SetResult();
            await Task.WhenAll(e1, e2);

            var d1 = await DonneesAsync(premiere, p);
            var d2 = await DonneesAsync(seconde, p);
            var confirmations = new[] { Message(d1, "confirmation"), Message(d2, "confirmation") }.Where(x => x is not null).ToList();
            var refus = new[] { Message(d1, "erreur"), Message(d2, "erreur") }.Where(x => x is not null).ToList();
            Assert.Single(confirmations);
            Assert.Single(refus);
            Assert.Contains("modifié entre-temps", refus[0]);
            var apres = await VehiculesAsync(opp);
            bool premiereGagne = Message(d1, "confirmation") is not null;
            if (tour == 0)
                Assert.Equal(new[] { "Kia", premiereGagne ? "Honda" : "Mazda" }, apres.Select(v => v.Marque).ToArray());
            else if (tour == 1)
                Assert.Equal(premiereGagne ? "Honda" : "Mazda", apres.Single().Marque);
            else
                Assert.Equal(premiereGagne ? 0 : 1, apres.Count); // retrait gagnant : aucun véhicule recréé
        }
    }

    // ---------- Plusieurs opportunités ----------

    [Fact]
    public async Task Les_vehicules_de_trois_opportunites_restent_separes_et_independants()
    {
        var client = await _app.ConnecterAsync(Sophie);
        int p = await CreerProspectAsync(client);
        int a = (await LireAsync(p)).Opportunites.Single().Id;
        int b = await AjouterOpportuniteAsync(client, p, "Projet B");
        int c = await AjouterOpportuniteAsync(client, p, "Projet C");
        await AjouterAsync(client, p, a, "Kia", "Sportage");
        await AjouterAsync(client, p, a, "Kia", "Seltos");
        await AjouterAsync(client, p, b, "Honda", "Civic");
        await AjouterAsync(client, p, c, "Ford", "F-150");
        int veB = (await VehiculesAsync(b)).Single().Id;

        await EnvoyerAsync(client, "ModifierVehicule", p, "oe-" + a, "ve-" + (await VehiculesAsync(a))[0].Id, [V("annee", "2025")], champs: "annee");
        await EnvoyerAsync(client, "RetirerVehicule", p, "oe-" + c, "ve-" + (await VehiculesAsync(c)).Single().Id, []);

        Assert.Equal(new[] { "Sportage", "Seltos" }, (await VehiculesAsync(a)).Select(v => v.Modele).ToArray());
        Assert.Equal(2025, (await VehiculesAsync(a))[0].Annee);
        Assert.Equal((veB, "Civic", (int?)null), ((await VehiculesAsync(b)).Single().Id, (await VehiculesAsync(b)).Single().Modele, (await VehiculesAsync(b)).Single().Annee));
        Assert.Empty(await VehiculesAsync(c));
        var donnees = await DonneesAsync(client, p);
        Assert.Equal(new[] { "Kia Sportage", "Kia Seltos" }.Select((x, i) => i == 0 ? "2025 " + x : x).ToArray(),
            Projetee(donnees, a).GetProperty("vehiculesEnvisages").EnumerateArray().Select(x => x.GetString()).ToArray());
        Assert.Equal(new[] { "Honda Civic" }, Projetee(donnees, b).GetProperty("vehiculesEnvisages").EnumerateArray().Select(x => x.GetString()).ToArray());
        Assert.Equal(0, Projetee(donnees, c).GetProperty("vehiculesDetail").GetArrayLength());
    }

    // ---------- Sécurité ----------

    [Fact]
    public async Task Vehicule_d_une_autre_opportunite_ou_d_un_autre_prospect_identifiants_forges_et_jeton_absent_sont_refuses()
    {
        var client = await _app.ConnecterAsync(Sophie);
        int p = await CreerProspectAsync(client);
        int a = (await LireAsync(p)).Opportunites.Single().Id;
        int b = await AjouterOpportuniteAsync(client, p, "Projet B");
        int autre = await CreerProspectAsync(client);
        int oppAutre = (await LireAsync(autre)).Opportunites.Single().Id;
        await AjouterAsync(client, p, a, "Kia", "Sportage");
        await AjouterAsync(client, p, b, "Honda", "Civic");
        await AjouterAsync(client, autre, oppAutre, "Ford", "Escape");
        int veA = (await VehiculesAsync(a)).Single().Id;
        int veB = (await VehiculesAsync(b)).Single().Id;
        int veAutre = (await VehiculesAsync(oppAutre)).Single().Id;
        int total = await NombreDeVehiculesAsync();
        string version = await VersionAsync(p);
        var modifier = new[] { V("marque", "Pirate"), V("modele", "X") };

        var reponses = new List<HttpResponseMessage>
        {
            // Véhicule de B envoyé avec l'opportunité A ; véhicule d'un autre prospect ; opportunité d'un autre prospect.
            await EnvoyerAsync(client, "ModifierVehicule", p, "oe-" + a, "ve-" + veB, modifier, champs: "marque,modele"),
            await EnvoyerAsync(client, "RetirerVehicule", p, "oe-" + a, "ve-" + veB, []),
            await EnvoyerAsync(client, "RetirerVehicule", p, "oe-" + a, "ve-" + veAutre, []),
            await EnvoyerAsync(client, "AjouterVehicule", p, "oe-" + oppAutre, null, modifier),
            await EnvoyerAsync(client, "AjouterVehicule", p, "oe-999999999", null, modifier),
            await EnvoyerAsync(client, "RetirerVehicule", p, "oe-" + a, "ve-999999999", []),
            await EnvoyerAsync(client, "ModifierVehicule", p, "oe-" + a, "ve-abc", modifier, champs: "marque,modele"),
            await EnvoyerAsync(client, "ModifierVehicule", p, "oe-" + a, "" + veA, modifier, champs: "marque,modele"),
        };
        var sansJeton = await EnvoyerAsync(client, "RetirerVehicule", p, "oe-" + a, "ve-" + veA, [], jeton: false);

        Assert.All(reponses, r => Assert.Equal(HttpStatusCode.NotFound, r.StatusCode));
        Assert.Equal(HttpStatusCode.BadRequest, sansJeton.StatusCode);
        Assert.Equal(total, await NombreDeVehiculesAsync());
        Assert.Equal(version, await VersionAsync(p));
        Assert.Equal("Civic", (await VehiculesAsync(b)).Single().Modele);
        Assert.Equal("Escape", (await VehiculesAsync(oppAutre)).Single().Modele);
    }

    [Fact]
    public async Task Un_collegue_ou_une_autre_concession_ne_peut_ni_ajouter_ni_modifier_ni_retirer()
    {
        var sophie = await _app.ConnecterAsync(Sophie);
        int p = await CreerProspectAsync(sophie);
        int opp = (await LireAsync(p)).Opportunites.Single().Id;
        await AjouterAsync(sophie, p, opp, "Kia", "Sportage");
        int ve = (await VehiculesAsync(opp)).Single().Id;
        string version = await VersionAsync(p);

        foreach (var intrus in new[] { await CreerConseillerAsync(true), await CreerConseillerAsync(false) })
        {
            string jeton = await JetonAsync(intrus, "/Prospects");
            foreach (var (action, vehicule) in new[] { ("AjouterVehicule", ""), ("ModifierVehicule", "ve-" + ve), ("RetirerVehicule", "ve-" + ve) })
            {
                var r = await intrus.PostAsync("/Prospects/" + action, new FormUrlEncodedContent(new[]
                {
                    V("prospectId", "pe-" + p), V("opportuniteId", "oe-" + opp), V("vehiculeId", vehicule), V("version", version),
                    V("champs", "marque,modele"), V("marque", "Intrusion"), V("modele", "X"), V("__RequestVerificationToken", jeton),
                }));
                Assert.Equal(HttpStatusCode.NotFound, r.StatusCode);
                Assert.DoesNotContain("Vehic", await r.Content.ReadAsStringAsync());
            }
        }
        Assert.Equal("Kia", (await VehiculesAsync(opp)).Single().Marque);
        Assert.Equal(version, await VersionAsync(p));
    }

    // ---------- Ce que les véhicules envisagés ne font pas ----------

    [Fact]
    public async Task Ajouter_modifier_retirer_ne_touche_ni_qualification_ni_etape_ni_suivi_ni_activite_ni_contact_ni_inventaire()
    {
        var client = await _app.ConnecterAsync(Sophie);
        int p = await CreerProspectAsync(client);
        int opp = (await LireAsync(p)).Opportunites.Single().Id;
        var qualification = await client.PostAsync("/Prospects/Qualifier", new FormUrlEncodedContent(new[]
        {
            V("prospectId", "pe-" + p), V("opportuniteId", "oe-" + opp), V("version", await VersionAsync(p)), V("champs", "categorie,budgetTotal,objections"),
            V("categorie", "vus"), V("budgetTotal", "32000"), V("objections", "Prix"), V("__RequestVerificationToken", await JetonAsync(client, "/Prospects/Fiche/pe-" + p)),
        }));
        Assert.Equal(HttpStatusCode.Redirect, qualification.StatusCode);
        var avant = await LireAsync(p);
        int inventaire;
        using (var scope = _app.Services.CreateScope())
            inventaire = await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Vehicules.CountAsync();

        await AjouterAsync(client, p, opp, "Kia", "Sportage", "2024");
        await AjouterAsync(client, p, opp, "Honda", "CR-V");
        var vehicules = await VehiculesAsync(opp);
        await EnvoyerAsync(client, "ModifierVehicule", p, "oe-" + opp, "ve-" + vehicules[0].Id, [V("finition", "EX")], champs: "finition");
        await EnvoyerAsync(client, "RetirerVehicule", p, "oe-" + opp, "ve-" + vehicules[1].Id, []);

        var apres = await LireAsync(p);
        var o = apres.Opportunites.Single();
        var o0 = avant.Opportunites.Single();
        Assert.Equal((o0.Categorie, o0.BudgetTotal, o0.Objections, o0.Modele), (o.Categorie, o.BudgetTotal, o.Objections, o.Modele));
        Assert.Equal((o0.Etape, o0.ProchaineAction, o0.DateProchaineAction, o0.DerniereActivite, o0.Titre), (o.Etape, o.ProchaineAction, o.DateProchaineAction, o.DerniereActivite, o.Titre));
        Assert.Empty(apres.Notes);
        Assert.Empty(o.HistoriqueEtapes);
        Assert.Empty(o.HistoriqueSuivis);
        using (var scope = _app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            Assert.Equal(inventaire, await db.Vehicules.CountAsync());
            Assert.False(await db.VeillesRecommandation.AnyAsync(v => v.OpportuniteId == opp));
        }
    }

    [Fact]
    public async Task Avec_des_vehicules_l_empreinte_de_la_fiche_reste_celle_du_serveur_et_les_autres_actions_fonctionnent()
    {
        var client = await _app.ConnecterAsync(Sophie);
        int p = await CreerProspectAsync(client);
        string sansVehicule = await VersionAsync(p);
        int opp = (await LireAsync(p)).Opportunites.Single().Id;
        await AjouterAsync(client, p, opp, "Kia", "Sportage");

        var contact = (await DonneesAsync(client, p)).GetProperty("donnees").GetProperty("contacts").EnumerateArray().Single(c => c.GetProperty("id").GetString() == "pe-" + p);
        string versionFiche = contact.GetProperty("version").GetString()!;
        var etape = await client.PostAsync("/Prospects/ChangerEtape", new FormUrlEncodedContent(new[]
        {
            V("opportuniteId", "oe-" + opp), V("prospectId", "pe-" + p), V("etape", "AQualifier"), V("version", versionFiche), V("retour", "fiche"),
            V("__RequestVerificationToken", await JetonAsync(client, "/Prospects/Fiche/pe-" + p)),
        }));

        Assert.NotEqual(sansVehicule, versionFiche);
        Assert.Equal(HttpStatusCode.Redirect, etape.StatusCode);
        Assert.Equal(EtapeVente.AQualifier, (await LireAsync(p)).Opportunites.Single().Etape);
    }
}
