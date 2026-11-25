using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Phineas.Data;
using Phineas.Data.Seed;
using Phineas.Models.Constants;
using Phineas.Models.Entities;
using Phineas.Models.ViewModels.Conseiller;
using Phineas.Services;
using Phineas.Services.Conseiller;
using Phineas.Tests.Infrastructure;

namespace Phineas.Tests;

// Fonctionnalité 22 : rendez-vous commerciaux enregistrés d'une opportunité réelle, sur MySQL de test et par de vraies
// requêtes (ProspectsController.PlanifierRendezVous). L'heure saisie est comprise dans le fuseau commercial
// (America/Toronto), convertie en UTC par le serveur ; heures inexistantes, ambiguës, traversant un changement d'heure
// ou déjà passées (horloge du serveur, fixée ici) sont refusées ; seuls les types permis par F22 sont acceptés ; le
// rendez-vous appartient à SON opportunité et ne change rien d'autre (ni contact, ni suivi, ni étape, ni qualification).
public class RendezVousCommerciauxTests : IClassFixture<ApplicationDeTest>
{
    private const string Sophie = "sophie.gagnon@autoprestige.example";
    // Maintenant, pour toute la classe : 10 janvier 2027, 15 h UTC = 10 h à Toronto (heure normale, UTC-5).
    private static readonly DateTimeOffset Maintenant = new(2027, 1, 10, 15, 0, 0, TimeSpan.Zero);

    private readonly ApplicationDeTest _app;

    public RendezVousCommerciauxTests(ApplicationDeTest app)
    {
        _app = app;
        _app.Horloge.Fixer(Maintenant);
    }

    private static string Unique() => Guid.NewGuid().ToString("N").Substring(0, 8);

    private static async Task<string> JetonAsync(HttpClient client, string page) =>
        ApplicationDeTest.JetonAntiforgery(await client.GetStringAsync(page));

    private static KeyValuePair<string, string> V(string cle, string valeur) => new(cle, valeur);

    private static DateTime Utc(int annee, int mois, int jour, int heure, int minute = 0) => new(annee, mois, jour, heure, minute, 0, DateTimeKind.Utc);

    private async Task<int> CreerProspectAsync(HttpClient client)
    {
        string u = Unique();
        var champs = new Dictionary<string, string>
        {
            ["prenom"] = "Ana", ["nom"] = "Rdv" + u, ["courriel"] = "rdv." + u + "@exemple.test", ["contactPrefere"] = "courriel",
            ["source"] = "appel", ["modele"] = "Kia Sportage", ["conseillerId"] = "moi", ["etape"] = "Nouveau",
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Prospects"),
        };
        Assert.Equal(HttpStatusCode.Redirect, (await client.PostAsync("/Prospects/Creer", new FormUrlEncodedContent(champs))).StatusCode);
        using var scope = _app.Services.CreateScope();
        return (await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Prospects.SingleAsync(p => p.Nom == "Rdv" + u)).Id;
    }

    private async Task<Prospect> LireAsync(int prospectId)
    {
        using var scope = _app.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Prospects.AsNoTracking()
            .Include(p => p.Opportunites).ThenInclude(o => o.VehiculesEnvisages)
            .Include(p => p.Opportunites).ThenInclude(o => o.RendezVous)
            .Include(p => p.Opportunites).ThenInclude(o => o.HistoriqueEtapes)
            .Include(p => p.Opportunites).ThenInclude(o => o.HistoriqueSuivis)
            .Include(p => p.Notes)
            .SingleAsync(p => p.Id == prospectId);
    }

    private async Task<string> VersionAsync(int prospectId) => ServiceProspects.Empreinte(await LireAsync(prospectId));

    private async Task<List<RendezVousCommercial>> RendezVousAsync(int oppId)
    {
        using var scope = _app.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().RendezVousCommerciaux.AsNoTracking()
            .Where(r => r.OpportuniteId == oppId).OrderBy(r => r.Id).ToListAsync();
    }

    private async Task<int> NombreAsync()
    {
        using var scope = _app.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().RendezVousCommerciaux.CountAsync();
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

    // Envoi de la fenêtre « Planifier un rendez-vous ». Version : l'empreinte actuelle si rien n'est donné.
    private async Task<HttpResponseMessage> PlanifierAsync(HttpClient client, int p, string opportuniteId, string date, string heure,
        string type = "Consultation", string duree = "45", string mode = "concession", string? version = null, bool jeton = true,
        IEnumerable<KeyValuePair<string, string>>? autres = null)
    {
        var formulaire = new List<KeyValuePair<string, string>>
        {
            V("prospectId", "pe-" + p), V("opportuniteId", opportuniteId), V("version", version ?? await VersionAsync(p)),
            V("type", type), V("date", date), V("heure", heure), V("dureeMinutes", duree), V("mode", mode),
        };
        if (jeton)
            formulaire.Add(V("__RequestVerificationToken", await JetonAsync(client, "/Prospects/Fiche/pe-" + p)));
        if (autres is not null)
            formulaire.AddRange(autres);
        return await client.PostAsync("/Prospects/PlanifierRendezVous", new FormUrlEncodedContent(formulaire));
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

    private static JsonElement Projetee(JsonElement donnees, int oppId) =>
        donnees.GetProperty("donnees").GetProperty("opportunites").EnumerateArray().Single(o => o.GetProperty("id").GetString() == "oe-" + oppId);

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
            var u = new ApplicationUser { UserName = courriel, Email = courriel, FirstName = "Autre", LastName = "Personne", DealershipId = concession };
            Assert.True((await users.CreateAsync(u, DbSeeder.DemoPassword)).Succeeded);
            await users.AddToRoleAsync(u, role);
        }
        return await _app.ConnecterAsync(courriel);
    }

    // ---------- Fuseau commercial ----------

    [Fact]
    public void Le_fuseau_commercial_vient_de_la_configuration_et_un_fuseau_absent_ou_inconnu_est_refuse()
    {
        var fuseau = _app.Services.GetRequiredService<FuseauCommercial>();
        Assert.Equal("America/Toronto", fuseau.Id);
        Assert.Equal(fuseau.Id, _app.Services.GetRequiredService<IConfiguration>()[FuseauCommercial.CleConfiguration]);
        Assert.Throws<InvalidOperationException>(() => new FuseauCommercial(""));
        Assert.Throws<InvalidOperationException>(() => new FuseauCommercial("Mars/Olympus_Mons"));
        // Conversions indépendantes du fuseau de la machine de test : hiver UTC-5, été UTC-4.
        Assert.Equal(Utc(2027, 1, 15, 19), fuseau.VersUtc(new DateTime(2027, 1, 15, 14, 0, 0)).Utc);
        Assert.Equal(Utc(2027, 7, 15, 18), fuseau.VersUtc(new DateTime(2027, 7, 15, 14, 0, 0)).Utc);
        Assert.Equal(EtatHeureCommerciale.Inexistante, fuseau.VersUtc(new DateTime(2027, 3, 14, 2, 30, 0)).Etat);
        Assert.Equal(EtatHeureCommerciale.Ambigue, fuseau.VersUtc(new DateTime(2027, 11, 7, 1, 30, 0)).Etat);
        Assert.Equal(new DateTime(2027, 7, 15, 14, 0, 0), fuseau.VersHeureCommerciale(Utc(2027, 7, 15, 18)));
    }

    // ---------- Création et lecture ----------

    [Fact]
    public async Task Une_opportunite_neuve_n_a_aucun_rendez_vous_invente()
    {
        var (client, p, opp) = await DossierAsync();

        Assert.Empty(await RendezVousAsync(opp));
        Assert.Equal(0, Projetee(await DonneesAsync(client, p), opp).GetProperty("rendezVousEnregistres").GetArrayLength());
    }

    [Fact]
    public async Task Quatorze_heures_a_Toronto_en_hiver_et_en_ete_donne_le_bon_instant_UTC_et_la_fiche_le_relit()
    {
        var (client, p, opp) = await DossierAsync();

        var hiver = await PlanifierAsync(client, p, "oe-" + opp, "2027-01-15", "14:00", "Consultation", "45", "concession",
            autres: [V("lieu", "Salle d'exposition"), V("objectif", "Comparer deux VUS"), V("commentaire", "Vient avec sa conjointe.")]);
        Assert.Equal("Rendez-vous enregistré dans le dossier (aucune invitation n'a été envoyée au client).", Message(await DonneesAsync(client, p), "confirmation"));
        await PlanifierAsync(client, p, "oe-" + opp, "2027-07-15", "14:00", "Negociation", "60", "virtuel");

        Assert.Equal(HttpStatusCode.Redirect, hiver.StatusCode);
        Assert.EndsWith("/Prospects/Fiche/pe-" + p + "?opportunite=oe-" + opp + "#opportunites", hiver.Headers.Location!.OriginalString);
        var enBase = await RendezVousAsync(opp);
        Assert.Equal(2, enBase.Select(r => r.Id).Distinct().Count());
        Assert.Equal((TypeRendezVous.Consultation, Utc(2027, 1, 15, 19), "America/Toronto", 45, "concession"),
            (enBase[0].Type, DateTime.SpecifyKind(enBase[0].DebutUtc, DateTimeKind.Utc), enBase[0].Fuseau, enBase[0].DureeMinutes, enBase[0].Mode));
        Assert.Equal(("Salle d'exposition", "Comparer deux VUS", "Vient avec sa conjointe."), (enBase[0].Lieu, enBase[0].Objectif, enBase[0].Commentaire));
        Assert.Equal((TypeRendezVous.Negociation, Utc(2027, 7, 15, 18), 60, "virtuel"),
            (enBase[1].Type, DateTime.SpecifyKind(enBase[1].DebutUtc, DateTimeKind.Utc), enBase[1].DureeMinutes, enBase[1].Mode));
        var projetes = Projetee(await DonneesAsync(client, p), opp).GetProperty("rendezVousEnregistres").EnumerateArray().ToList();
        Assert.Equal(new[] { "2027-01-15T19:00:00Z", "2027-07-15T18:00:00Z" }, projetes.Select(r => r.GetProperty("debutUtc").GetString()).ToArray());
        Assert.Equal(enBase.Select(r => "rv-" + r.Id).ToArray(), projetes.Select(r => r.GetProperty("id").GetString()).ToArray());
        Assert.All(projetes, r => Assert.Equal("America/Toronto", r.GetProperty("fuseau").GetString()));
        Assert.Equal("Consultation automobile", projetes[0].GetProperty("typeLibelle").GetString());
    }

    [Fact]
    public async Task Les_rendez_vous_sont_relus_dans_l_ordre_chronologique_et_deux_le_meme_jour_restent_distincts()
    {
        var (client, p, opp) = await DossierAsync();

        await PlanifierAsync(client, p, "oe-" + opp, "2027-02-18", "10:00");
        await PlanifierAsync(client, p, "oe-" + opp, "2027-02-10", "15:30", "PremiereRencontre");
        await PlanifierAsync(client, p, "oe-" + opp, "2027-02-10", "15:30", "PremiereRencontre");

        var projetes = Projetee(await DonneesAsync(client, p), opp).GetProperty("rendezVousEnregistres").EnumerateArray()
            .Select(r => (r.GetProperty("id").GetString(), r.GetProperty("debutUtc").GetString())).ToList();
        var enBase = await RendezVousAsync(opp);
        Assert.Equal(3, enBase.Count);
        Assert.Equal(new[] { "rv-" + enBase[1].Id, "rv-" + enBase[2].Id, "rv-" + enBase[0].Id }, projetes.Select(x => x.Item1).ToArray());
        Assert.Equal(new[] { "2027-02-10T20:30:00Z", "2027-02-10T20:30:00Z", "2027-02-18T15:00:00Z" }, projetes.Select(x => x.Item2).ToArray());
    }

    [Fact]
    public async Task Le_serveur_lit_l_heure_dans_le_fuseau_commercial_et_jamais_comme_UTC_ni_selon_un_champ_envoye()
    {
        var (client, p, opp) = await DossierAsync();

        // 10 h 30 à Toronto = 15 h 30 UTC, encore à venir à 15 h UTC ; lue comme UTC, elle serait passée (refus).
        await PlanifierAsync(client, p, "oe-" + opp, "2027-01-10", "10:30",
            autres: [V("fuseau", "Europe/Paris"), V("debutUtc", "2030-01-01T00:00:00Z"), V("statut", "Termine"), V("conseillerId", "autre")]);

        var r = (await RendezVousAsync(opp)).Single();
        Assert.Equal((Utc(2027, 1, 10, 15, 30), "America/Toronto"), (DateTime.SpecifyKind(r.DebutUtc, DateTimeKind.Utc), r.Fuseau));
    }

    // ---------- Validations ----------

    [Theory]
    [InlineData("2027-03-14", "02:30", "45", "n'existe pas")]           // passage à l'heure d'été
    [InlineData("2027-11-07", "01:30", "45", "existe deux fois")]        // retour à l'heure normale
    [InlineData("2027-03-14", "01:30", "45", "changement d'heure")]      // 1 h 30 + 45 min traverse 2 h
    [InlineData("2027-11-07", "00:30", "90", "changement d'heure")]      // 0 h 30 + 90 min traverse 2 h
    [InlineData("2027-01-09", "14:00", "45", "déjà passé")]              // la veille
    [InlineData("2027-01-10", "09:00", "45", "déjà passé")]              // aujourd'hui, heure passée (14 h UTC)
    [InlineData("2027-01-10", "10:00", "45", "déjà passé")]              // exactement maintenant
    [InlineData("2027-02-30", "10:00", "45", "date valide")]
    [InlineData("2027-02-10", "25:00", "45", "heure valide")]
    [InlineData("10/02/2027", "10:00", "45", "date valide")]
    [InlineData("2027-02-10", "10h00", "45", "heure valide")]
    [InlineData("2027-02-10", "10:00", "50", "durée")]
    [InlineData("2027-02-10", "10:00", "0", "durée")]
    [InlineData("2027-02-10", "10:00", "-45", "durée")]
    public async Task Une_date_une_heure_ou_une_duree_invalide_est_refusee_sans_rien_ecrire(string date, string heure, string duree, string motif)
    {
        var (client, p, opp) = await DossierAsync();
        string version = await VersionAsync(p);

        var refus = await PlanifierAsync(client, p, "oe-" + opp, date, heure, duree: duree);

        Assert.Equal(HttpStatusCode.Redirect, refus.StatusCode);
        string? erreur = Message(await DonneesAsync(client, p), "erreur");
        Assert.StartsWith("Rendez-vous non enregistré.", erreur);
        Assert.Contains(motif, erreur);
        Assert.Empty(await RendezVousAsync(opp));
        Assert.Equal(version, await VersionAsync(p));
    }

    [Fact]
    public async Task Juste_avant_et_juste_apres_les_changements_d_heure_les_heures_valides_sont_acceptees()
    {
        var (client, p, opp) = await DossierAsync();

        await PlanifierAsync(client, p, "oe-" + opp, "2027-03-14", "01:00", duree: "45");   // 1 h EST → 6 h UTC, fin 1 h 45
        await PlanifierAsync(client, p, "oe-" + opp, "2027-03-14", "03:00", duree: "45");   // 3 h EDT → 7 h UTC
        await PlanifierAsync(client, p, "oe-" + opp, "2027-11-07", "00:00", duree: "45");   // 0 h EDT → 4 h UTC
        await PlanifierAsync(client, p, "oe-" + opp, "2027-11-07", "02:00", duree: "45");   // 2 h EST → 7 h UTC

        Assert.Equal(new[] { Utc(2027, 3, 14, 6), Utc(2027, 3, 14, 7), Utc(2027, 11, 7, 4), Utc(2027, 11, 7, 7) },
            (await RendezVousAsync(opp)).Select(r => DateTime.SpecifyKind(r.DebutUtc, DateTimeKind.Utc)).ToArray());
    }

    [Theory]
    [InlineData("EssaiRoutier")]
    [InlineData("Livraison")]
    [InlineData("Financement")]
    [InlineData("SuiviApresVente")]
    [InlineData("DiscussionSoumission")]
    [InlineData("Finalisation")]
    [InlineData("Inconnu")]
    [InlineData("3")]
    [InlineData("")]
    public async Task Un_type_non_permis_par_F22_est_refuse_meme_par_requete_forgee(string type)
    {
        var (client, p, opp) = await DossierAsync();

        await PlanifierAsync(client, p, "oe-" + opp, "2027-02-10", "10:00", type);

        Assert.Contains("type de rendez-vous", Message(await DonneesAsync(client, p), "erreur"));
        Assert.Empty(await RendezVousAsync(opp));
    }

    [Theory]
    [InlineData("PremiereRencontre")]
    [InlineData("Consultation")]
    [InlineData("PresentationVehicule")]
    [InlineData("Negociation")]
    [InlineData("Autre")]
    public async Task Chaque_type_permis_est_accepte(string type)
    {
        var (client, p, opp) = await DossierAsync();

        await PlanifierAsync(client, p, "oe-" + opp, "2027-02-10", "10:00", type);

        Assert.Equal(type, (await RendezVousAsync(opp)).Single().Type.ToString());
    }

    [Theory]
    [InlineData("mode", "pigeon")]
    [InlineData("lieu", 121)]
    [InlineData("objectif", 201)]
    [InlineData("commentaire", 501)]
    public async Task Une_modalite_inconnue_ou_un_texte_trop_long_est_refuse(string champ, object valeur)
    {
        var (client, p, opp) = await DossierAsync();
        string texte = valeur is int n ? new string('a', n) : (string)valeur;

        if (champ == "mode")
            await PlanifierAsync(client, p, "oe-" + opp, "2027-02-10", "10:00", mode: texte);
        else
            await PlanifierAsync(client, p, "oe-" + opp, "2027-02-10", "10:00", autres: [V(champ, texte)]);

        Assert.StartsWith("Rendez-vous non enregistré.", Message(await DonneesAsync(client, p), "erreur"));
        Assert.Empty(await RendezVousAsync(opp));
    }

    [Fact]
    public async Task Une_opportunite_cloturee_ne_recoit_pas_de_rendez_vous()
    {
        var (client, p, opp) = await DossierAsync();
        using (var scope = _app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await db.OpportunitesVente.Where(o => o.Id == opp).ExecuteUpdateAsync(s => s.SetProperty(o => o.Etape, EtapeVente.Perdu));
        }

        await PlanifierAsync(client, p, "oe-" + opp, "2027-02-10", "10:00");

        Assert.Contains("clôturée", Message(await DonneesAsync(client, p), "erreur"));
        Assert.Empty(await RendezVousAsync(opp));
    }

    // ---------- Doubles envois et concurrence ----------

    [Fact]
    public async Task Le_meme_formulaire_envoye_deux_fois_ne_cree_qu_un_rendez_vous_et_deux_creations_voulues_restent_possibles()
    {
        var (client, p, opp) = await DossierAsync();
        string version = await VersionAsync(p);

        await PlanifierAsync(client, p, "oe-" + opp, "2027-02-10", "10:00", version: version);
        await PlanifierAsync(client, p, "oe-" + opp, "2027-02-10", "10:00", version: version);
        Assert.Contains("modifié entre-temps", Message(await DonneesAsync(client, p), "erreur"));
        await PlanifierAsync(client, p, "oe-" + opp, "2027-02-10", "10:00");

        Assert.Equal(2, (await RendezVousAsync(opp)).Count);
    }

    [Fact]
    public async Task Deux_sessions_simultanees_depuis_la_meme_page_un_seul_rendez_vous_est_cree()
    {
        var premiere = await _app.ConnecterAsync(Sophie);
        var seconde = await _app.ConnecterAsync(Sophie);
        for (int tour = 0; tour < 3; tour++)
        {
            int p = await CreerProspectAsync(premiere);
            int opp = (await LireAsync(p)).Opportunites.Single().Id;
            string version = await VersionAsync(p);
            async Task<List<KeyValuePair<string, string>>> Formulaire(HttpClient c, string heure) =>
                [V("prospectId", "pe-" + p), V("opportuniteId", "oe-" + opp), V("version", version), V("type", "Consultation"), V("date", "2027-02-10"),
                 V("heure", heure), V("dureeMinutes", "45"), V("mode", "concession"), V("__RequestVerificationToken", await JetonAsync(c, "/Prospects/Fiche/pe-" + p))];
            var f1 = await Formulaire(premiere, "10:00");
            var f2 = await Formulaire(seconde, "16:00");
            var depart = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var e1 = Task.Run(async () => { await depart.Task; return await premiere.PostAsync("/Prospects/PlanifierRendezVous", new FormUrlEncodedContent(f1)); });
            var e2 = Task.Run(async () => { await depart.Task; return await seconde.PostAsync("/Prospects/PlanifierRendezVous", new FormUrlEncodedContent(f2)); });
            depart.SetResult();
            await Task.WhenAll(e1, e2);

            var d1 = await DonneesAsync(premiere, p);
            var d2 = await DonneesAsync(seconde, p);
            Assert.Single(new[] { Message(d1, "confirmation"), Message(d2, "confirmation") }.Where(x => x is not null));
            Assert.Contains("modifié entre-temps", new[] { Message(d1, "erreur"), Message(d2, "erreur") }.Single(x => x is not null));
            var r = (await RendezVousAsync(opp)).Single();
            Assert.Equal(Message(d1, "confirmation") is not null ? Utc(2027, 2, 10, 15) : Utc(2027, 2, 10, 21), DateTime.SpecifyKind(r.DebutUtc, DateTimeKind.Utc));
        }
    }

    // ---------- Plusieurs opportunités ----------

    [Fact]
    public async Task Les_rendez_vous_de_A_et_de_B_restent_separes()
    {
        var (client, p, a) = await DossierAsync();
        int b = await AjouterOpportuniteAsync(client, p, "Projet B");

        await PlanifierAsync(client, p, "oe-" + a, "2027-12-10", "10:00");
        await PlanifierAsync(client, p, "oe-" + a, "2027-12-18", "10:00");
        await PlanifierAsync(client, p, "oe-" + b, "2027-12-12", "10:00");

        var donnees = await DonneesAsync(client, p);
        string[] Jours(int opp) => Projetee(donnees, opp).GetProperty("rendezVousEnregistres").EnumerateArray().Select(r => r.GetProperty("debutUtc").GetString()![..10]).ToArray();
        Assert.Equal(new[] { "2027-12-10", "2027-12-18" }, Jours(a));
        Assert.Equal(new[] { "2027-12-12" }, Jours(b));
        Assert.Equal((2, 1), ((await RendezVousAsync(a)).Count, (await RendezVousAsync(b)).Count));
    }

    // ---------- Sécurité ----------

    [Fact]
    public async Task Opportunite_d_un_autre_prospect_identifiants_forges_inexistants_et_jeton_absent_sont_refuses()
    {
        var (client, p, opp) = await DossierAsync();
        int autre = await CreerProspectAsync(client);
        int oppAutre = (await LireAsync(autre)).Opportunites.Single().Id;
        int total = await NombreAsync();
        string version = await VersionAsync(p);

        var reponses = new List<HttpResponseMessage>
        {
            await PlanifierAsync(client, p, "oe-" + oppAutre, "2027-02-10", "10:00"),
            await PlanifierAsync(client, p, "oe-999999999", "2027-02-10", "10:00"),
            await PlanifierAsync(client, p, "oe-abc", "2027-02-10", "10:00"),
            await PlanifierAsync(client, p, "" + opp, "2027-02-10", "10:00"),
        };
        var prospectInexistant = await client.PostAsync("/Prospects/PlanifierRendezVous", new FormUrlEncodedContent(new[]
        {
            V("prospectId", "pe-999999999"), V("opportuniteId", "oe-" + opp), V("version", version), V("type", "Consultation"), V("date", "2027-02-10"),
            V("heure", "10:00"), V("dureeMinutes", "45"), V("mode", "concession"), V("__RequestVerificationToken", await JetonAsync(client, "/Prospects")),
        }));
        var sansJeton = await PlanifierAsync(client, p, "oe-" + opp, "2027-02-10", "10:00", jeton: false);
        var parGet = await client.GetAsync($"/Prospects/PlanifierRendezVous?prospectId=pe-{p}&opportuniteId=oe-{opp}&version={version}&type=Consultation&date=2027-02-10&heure=10:00&dureeMinutes=45&mode=concession");

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
        string version = await VersionAsync(p);
        int total = await NombreAsync();

        foreach (var intrus in new[] { await CreerUtilisateurAsync(AppRoles.Conseiller, true), await CreerUtilisateurAsync(AppRoles.Conseiller, false) })
        {
            var r = await intrus.PostAsync("/Prospects/PlanifierRendezVous", new FormUrlEncodedContent(new[]
            {
                V("prospectId", "pe-" + p), V("opportuniteId", "oe-" + opp), V("version", version), V("type", "Consultation"), V("date", "2027-02-10"),
                V("heure", "10:00"), V("dureeMinutes", "45"), V("mode", "concession"), V("__RequestVerificationToken", await JetonAsync(intrus, "/Prospects")),
            }));
            Assert.Equal(HttpStatusCode.NotFound, r.StatusCode);
            Assert.DoesNotContain("Rdv", await r.Content.ReadAsStringAsync());
        }
        var directeur = await CreerUtilisateurAsync(AppRoles.Directeur, true);
        var refusRole = await directeur.PostAsync("/Prospects/PlanifierRendezVous", new FormUrlEncodedContent(new[]
        {
            V("prospectId", "pe-" + p), V("opportuniteId", "oe-" + opp), V("version", version), V("type", "Consultation"), V("date", "2027-02-10"),
            V("heure", "10:00"), V("dureeMinutes", "45"), V("mode", "concession"),
        }));

        // Le directeur n'atteint pas l'action (accès refusé) : jamais de retour sur la fiche comme après un envoi traité.
        bool traite = refusRole.StatusCode == HttpStatusCode.Redirect && (refusRole.Headers.Location?.OriginalString ?? "").Contains("/Prospects/Fiche");
        Assert.False(traite);
        Assert.NotEqual(HttpStatusCode.OK, refusRole.StatusCode);
        Assert.Equal(total, await NombreAsync());
    }

    // ---------- Ce que planifier ne fait pas ----------

    [Fact]
    public async Task Planifier_ne_touche_ni_qualification_ni_vehicules_ni_etape_ni_suivi_ni_activite_ni_contact_ni_veille()
    {
        var (client, p, opp) = await DossierAsync();
        await client.PostAsync("/Prospects/Qualifier", new FormUrlEncodedContent(new[]
        {
            V("prospectId", "pe-" + p), V("opportuniteId", "oe-" + opp), V("version", await VersionAsync(p)), V("champs", "categorie,budgetTotal"),
            V("categorie", "vus"), V("budgetTotal", "32000"), V("__RequestVerificationToken", await JetonAsync(client, "/Prospects/Fiche/pe-" + p)),
        }));
        await client.PostAsync("/Prospects/AjouterVehicule", new FormUrlEncodedContent(new[]
        {
            V("prospectId", "pe-" + p), V("opportuniteId", "oe-" + opp), V("version", await VersionAsync(p)), V("marque", "Kia"), V("modele", "Sportage"),
            V("__RequestVerificationToken", await JetonAsync(client, "/Prospects/Fiche/pe-" + p)),
        }));
        var avant = await LireAsync(p);
        var o0 = avant.Opportunites.Single();
        Assert.Single(o0.VehiculesEnvisages);

        await PlanifierAsync(client, p, "oe-" + opp, "2027-02-10", "10:00", "PremiereRencontre");

        var apres = await LireAsync(p);
        var o = apres.Opportunites.Single();
        Assert.Single(o.RendezVous);
        Assert.Equal((o0.Categorie, o0.BudgetTotal, o0.Etape, o0.ProchaineAction, o0.DateProchaineAction, o0.DerniereActivite, o0.Titre),
            (o.Categorie, o.BudgetTotal, o.Etape, o.ProchaineAction, o.DateProchaineAction, o.DerniereActivite, o.Titre));
        Assert.Equal(("Kia", "Sportage"), (o.VehiculesEnvisages.Single().Marque, o.VehiculesEnvisages.Single().Modele));
        Assert.Empty(apres.Notes);
        Assert.Empty(o.HistoriqueEtapes);
        Assert.Empty(o.HistoriqueSuivis);
        using var scope = _app.Services.CreateScope();
        Assert.False(await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().VeillesRecommandation.AnyAsync(v => v.OpportuniteId == opp));
    }

    [Fact]
    public async Task Avec_un_rendez_vous_l_empreinte_de_la_fiche_reste_celle_du_serveur_et_les_autres_actions_fonctionnent()
    {
        var (client, p, opp) = await DossierAsync();
        string sansRendezVous = await VersionAsync(p);
        await PlanifierAsync(client, p, "oe-" + opp, "2027-02-10", "10:00");

        var contact = (await DonneesAsync(client, p)).GetProperty("donnees").GetProperty("contacts").EnumerateArray().Single(c => c.GetProperty("id").GetString() == "pe-" + p);
        string versionFiche = contact.GetProperty("version").GetString()!;
        var etape = await client.PostAsync("/Prospects/ChangerEtape", new FormUrlEncodedContent(new[]
        {
            V("opportuniteId", "oe-" + opp), V("prospectId", "pe-" + p), V("etape", "AQualifier"), V("version", versionFiche), V("retour", "fiche"),
            V("__RequestVerificationToken", await JetonAsync(client, "/Prospects/Fiche/pe-" + p)),
        }));

        Assert.NotEqual(sansRendezVous, versionFiche);
        Assert.Equal(HttpStatusCode.Redirect, etape.StatusCode);
        Assert.Equal(EtapeVente.AQualifier, (await LireAsync(p)).Opportunites.Single().Etape);
    }
}
