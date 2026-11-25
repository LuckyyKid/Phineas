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

// Fonctionnalité 23 : cycle de vie des rendez-vous commerciaux enregistrés, sur MySQL de test et par de vraies requêtes
// (ProspectsController.ModifierRendezVous, ReplanifierRendezVous, ChangerStatutRendezVous).
// Règle : avant le début, modifier, replanifier ou annuler ; à partir du début, déclarer réalisé ou absent ; annulé,
// réalisé et absent sont définitifs ; chaque changement a sa ligne d'historique ; rien ne change tout seul ; aucun
// contact, suivi, étape ou activité n'en découle. L'horloge du serveur est fixée.
public class RendezVousCycleVieTests : IClassFixture<ApplicationDeTest>
{
    private const string Sophie = "sophie.gagnon@autoprestige.example";
    // Maintenant, pour toute la classe : 10 janvier 2027, 15 h UTC = 10 h à Toronto (heure normale, UTC-5).
    private static readonly DateTimeOffset Maintenant = new(2027, 1, 10, 15, 0, 0, TimeSpan.Zero);
    // Le rendez-vous type de ces tests : 15 janvier 2027, 14 h à Toronto = 19 h UTC.
    private static readonly DateTimeOffset DebutHabituel = new(2027, 1, 15, 19, 0, 0, TimeSpan.Zero);

    private readonly ApplicationDeTest _app;

    public RendezVousCycleVieTests(ApplicationDeTest app)
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

    private ApplicationDbContext Base(IServiceScope scope) => scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

    // Fixe l'horloge du serveur à un autre instant puis reconnecte Sophie : une session dure 8 h sur cette horloge
    // (Program.cs, ExpireTimeSpan), comme pour un conseiller qui revient le jour du rendez-vous.
    private async Task<HttpClient> APartirDeAsync(DateTimeOffset instant)
    {
        _app.Horloge.Fixer(instant);
        return await _app.ConnecterAsync(Sophie);
    }

    private async Task<int> CreerProspectAsync(HttpClient client)
    {
        string u = Unique();
        var champs = new Dictionary<string, string>
        {
            ["prenom"] = "Ana", ["nom"] = "Cycle" + u, ["courriel"] = "cycle." + u + "@exemple.test", ["contactPrefere"] = "courriel",
            ["source"] = "appel", ["modele"] = "Kia Sportage", ["conseillerId"] = "moi", ["etape"] = "Nouveau",
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Prospects"),
        };
        Assert.Equal(HttpStatusCode.Redirect, (await client.PostAsync("/Prospects/Creer", new FormUrlEncodedContent(champs))).StatusCode);
        using var scope = _app.Services.CreateScope();
        return (await Base(scope).Prospects.SingleAsync(p => p.Nom == "Cycle" + u)).Id;
    }

    private async Task<Prospect> LireAsync(int prospectId)
    {
        using var scope = _app.Services.CreateScope();
        return await Base(scope).Prospects.AsNoTracking()
            .Include(p => p.Opportunites).ThenInclude(o => o.VehiculesEnvisages)
            .Include(p => p.Opportunites).ThenInclude(o => o.RendezVous).ThenInclude(r => r.Evenements)
            .Include(p => p.Opportunites).ThenInclude(o => o.HistoriqueEtapes)
            .Include(p => p.Opportunites).ThenInclude(o => o.HistoriqueSuivis)
            .Include(p => p.Notes)
            .AsSplitQuery()
            .SingleAsync(p => p.Id == prospectId);
    }

    private async Task<string> VersionAsync(int prospectId) => ServiceProspects.Empreinte(await LireAsync(prospectId));

    private async Task<RendezVousCommercial> RendezVousAsync(int rendezVousId)
    {
        using var scope = _app.Services.CreateScope();
        return await Base(scope).RendezVousCommerciaux.AsNoTracking().Include(r => r.Evenements)
            .SingleAsync(r => r.Id == rendezVousId);
    }

    private async Task<int> NombreEvenementsAsync()
    {
        using var scope = _app.Services.CreateScope();
        return await Base(scope).EvenementsRendezVous.CountAsync();
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

    // Planifie un rendez-vous (F22) et retourne son identifiant en base.
    private async Task<int> PlanifierAsync(HttpClient client, int p, int opp, string date = "2027-01-15", string heure = "14:00",
        string type = "Consultation", string duree = "45")
    {
        var reponse = await client.PostAsync("/Prospects/PlanifierRendezVous", new FormUrlEncodedContent(new[]
        {
            V("prospectId", "pe-" + p), V("opportuniteId", "oe-" + opp), V("version", await VersionAsync(p)), V("type", type), V("date", date),
            V("heure", heure), V("dureeMinutes", duree), V("mode", "concession"), V("lieu", "Salle A"), V("objectif", "Comparer deux VUS"),
            V("__RequestVerificationToken", await JetonAsync(client, "/Prospects/Fiche/pe-" + p)),
        }));
        Assert.Equal(HttpStatusCode.Redirect, reponse.StatusCode);
        using var scope = _app.Services.CreateScope();
        return await Base(scope).RendezVousCommerciaux.Where(r => r.OpportuniteId == opp).MaxAsync(r => r.Id);
    }

    // Envoi d'une opération du cycle de vie. Version : l'empreinte actuelle si rien n'est donné.
    private async Task<HttpResponseMessage> EnvoyerAsync(HttpClient client, string action, int p, string opportuniteId, string rendezVousId,
        IEnumerable<KeyValuePair<string, string>> champs, string? version = null, bool jeton = true)
    {
        var formulaire = new List<KeyValuePair<string, string>>
        {
            V("prospectId", "pe-" + p), V("opportuniteId", opportuniteId), V("rendezVousId", rendezVousId), V("version", version ?? await VersionAsync(p)),
        };
        formulaire.AddRange(champs);
        if (jeton)
            formulaire.Add(V("__RequestVerificationToken", await JetonAsync(client, "/Prospects")));
        return await client.PostAsync("/Prospects/" + action, new FormUrlEncodedContent(formulaire));
    }

    private Task<HttpResponseMessage> ModifierAsync(HttpClient client, int p, int opp, int rv, string mode = "virtuel", string? lieu = "Lien Teams",
        string? objectif = "Comparer deux VUS", string type = "Consultation", string? version = null, IEnumerable<KeyValuePair<string, string>>? autres = null)
    {
        var champs = new List<KeyValuePair<string, string>> { V("type", type), V("mode", mode), V("lieu", lieu ?? ""), V("objectif", objectif ?? "") };
        if (autres is not null)
            champs.AddRange(autres);
        return EnvoyerAsync(client, "ModifierRendezVous", p, "oe-" + opp, "rv-" + rv, champs, version);
    }

    private Task<HttpResponseMessage> ReplanifierAsync(HttpClient client, int p, int opp, int rv, string date, string heure, string duree = "45", string? version = null) =>
        EnvoyerAsync(client, "ReplanifierRendezVous", p, "oe-" + opp, "rv-" + rv, [V("date", date), V("heure", heure), V("dureeMinutes", duree)], version);

    private Task<HttpResponseMessage> StatutAsync(HttpClient client, int p, int opp, int rv, string statut, string? version = null) =>
        EnvoyerAsync(client, "ChangerStatutRendezVous", p, "oe-" + opp, "rv-" + rv, [V("statut", statut)], version);

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

    private static JsonElement Projete(JsonElement donnees, int opp, int rv) =>
        donnees.GetProperty("donnees").GetProperty("opportunites").EnumerateArray().Single(o => o.GetProperty("id").GetString() == "oe-" + opp)
            .GetProperty("rendezVousEnregistres").EnumerateArray().Single(r => r.GetProperty("id").GetString() == "rv-" + rv);

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

    // ---------- Statut initial et lecture ----------

    [Fact]
    public async Task Un_rendez_vous_ecrit_comme_avant_F23_est_Planifie_et_sa_fiche_ne_montre_que_sa_creation()
    {
        var (client, p, opp) = await DossierAsync();
        int rv;
        // Écriture sans la colonne Statut, comme une ligne de F22 : la valeur par défaut de la migration s'applique.
        using (var scope = _app.Services.CreateScope())
        {
            var db = Base(scope);
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"INSERT INTO RendezVousCommerciaux (OpportuniteId, Type, DebutUtc, Fuseau, DureeMinutes, Mode, DateCreation) VALUES ({opp}, 'Consultation', {Utc(2027, 1, 15, 19)}, 'America/Toronto', 45, 'concession', {Utc(2027, 1, 5, 12)})");
            rv = await db.RendezVousCommerciaux.Where(r => r.OpportuniteId == opp).MaxAsync(r => r.Id);
        }

        var enBase = await RendezVousAsync(rv);
        var projete = Projete(await DonneesAsync(client, p), opp, rv);

        Assert.Equal(StatutRendezVous.Planifie, enBase.Statut);
        Assert.Null(enBase.DateModification);
        Assert.Empty(enBase.Evenements);
        Assert.Equal(("Planifie", "Planifié"), (projete.GetProperty("statut").GetString(), projete.GetProperty("statutLibelle").GetString()));
        var historique = projete.GetProperty("historique").EnumerateArray().ToList();
        Assert.Single(historique);
        Assert.Equal(("Creation", "2027-01-05T12:00:00Z"), (historique[0].GetProperty("type").GetString(), historique[0].GetProperty("date").GetString()));
    }

    [Fact]
    public async Task Un_rendez_vous_passe_reste_Planifie_tant_que_rien_n_est_declare()
    {
        var (client, p, opp) = await DossierAsync();
        int rv = await PlanifierAsync(client, p, opp);

        client = await APartirDeAsync(DebutHabituel.AddDays(3));

        Assert.Equal(StatutRendezVous.Planifie, (await RendezVousAsync(rv)).Statut);
        Assert.Equal("Planifie", Projete(await DonneesAsync(client, p), opp, rv).GetProperty("statut").GetString());
        Assert.Empty((await RendezVousAsync(rv)).Evenements);
    }

    // ---------- Modification ----------

    [Fact]
    public async Task Modifier_change_seulement_les_informations_du_rendez_vous_demande_et_l_historique_les_nomme()
    {
        var (client, p, opp) = await DossierAsync();
        int premier = await PlanifierAsync(client, p, opp, "2027-01-14", "09:00");
        int second = await PlanifierAsync(client, p, opp);
        var premierAvant = await RendezVousAsync(premier);

        // Une date et une heure envoyées avec la modification sont ignorées : l'horaire ne bouge jamais ici.
        var reponse = await ModifierAsync(client, p, opp, second, "virtuel", "Lien Teams", "Présenter le financement",
            autres: [V("date", "2027-02-01"), V("heure", "08:00"), V("dureeMinutes", "90"), V("statut", "Termine"), V("commentaire", "Apporter le bilan.")]);

        Assert.Equal(HttpStatusCode.Redirect, reponse.StatusCode);
        Assert.EndsWith("/Prospects/Fiche/pe-" + p + "?opportunite=oe-" + opp + "#opportunites", reponse.Headers.Location!.OriginalString);
        var r = await RendezVousAsync(second);
        Assert.Equal(("virtuel", "Lien Teams", "Présenter le financement", "Apporter le bilan."), (r.Mode, r.Lieu, r.Objectif, r.Commentaire));
        Assert.Equal((TypeRendezVous.Consultation, Utc(2027, 1, 15, 19), 45, StatutRendezVous.Planifie), (r.Type, EnUtc(r.DebutUtc), r.DureeMinutes, r.Statut));
        Assert.Equal(Maintenant.UtcDateTime, EnUtc(r.DateModification!.Value));
        var evenement = Assert.Single(r.Evenements);
        Assert.Equal((TypeEvenementRendezVous.Modification, "Modalité, Lieu, Objectif, Commentaire", Maintenant.UtcDateTime),
            (evenement.Type, evenement.Champs, EnUtc(evenement.Date)));
        Assert.Null(evenement.AncienDebutUtc);

        var premierApres = await RendezVousAsync(premier);
        Assert.Equal((premierAvant.Mode, premierAvant.Lieu, premierAvant.Objectif, premierAvant.DebutUtc, premierAvant.Statut),
            (premierApres.Mode, premierApres.Lieu, premierApres.Objectif, premierApres.DebutUtc, premierApres.Statut));
        Assert.Empty(premierApres.Evenements);

        var donnees = await DonneesAsync(client, p);
        Assert.Equal("Rendez-vous modifié dans le dossier (aucun message n'a été envoyé au client).", Message(donnees, "confirmation"));
        var historique = Projete(donnees, opp, second).GetProperty("historique").EnumerateArray().ToList();
        Assert.Equal(new[] { "Creation", "Modification" }, historique.Select(h => h.GetProperty("type").GetString()).ToArray());
        Assert.Contains("Sophie", historique[1].GetProperty("auteur").GetString());
        Assert.Equal("Informations modifiées : Modalité, Lieu, Objectif, Commentaire.", historique[1].GetProperty("texte").GetString());
    }

    [Fact]
    public async Task Modifier_sans_rien_changer_ou_avec_une_valeur_invalide_est_refuse_sans_historique()
    {
        var (client, p, opp) = await DossierAsync();
        int rv = await PlanifierAsync(client, p, opp);
        string version = await VersionAsync(p);

        await ModifierAsync(client, p, opp, rv, "concession", "Salle A", "Comparer deux VUS");
        Assert.Contains("Aucune information n'a changé", Message(await DonneesAsync(client, p), "erreur"));
        await ModifierAsync(client, p, opp, rv, "pigeon-voyageur");
        Assert.Contains("modalité", Message(await DonneesAsync(client, p), "erreur"));
        await ModifierAsync(client, p, opp, rv, type: "EssaiRoutier");
        Assert.Contains("type de rendez-vous", Message(await DonneesAsync(client, p), "erreur"));
        await ModifierAsync(client, p, opp, rv, lieu: new string('x', 121));
        Assert.Contains("120 caractères", Message(await DonneesAsync(client, p), "erreur"));

        var r = await RendezVousAsync(rv);
        Assert.Equal(("concession", "Salle A", TypeRendezVous.Consultation), (r.Mode, r.Lieu, r.Type));
        Assert.Empty(r.Evenements);
        Assert.Null(r.DateModification);
        Assert.Equal(version, await VersionAsync(p));
    }

    // ---------- Replanification ----------

    [Fact]
    public async Task Replanifier_garde_le_meme_rendez_vous_et_l_ancien_horaire_dans_l_historique()
    {
        var (client, p, opp) = await DossierAsync();
        int rv = await PlanifierAsync(client, p, opp);
        int nombre = (await LireAsync(p)).Opportunites.Single().RendezVous.Count;

        // Hiver (UTC-5) vers été (UTC-4), 45 puis 60 minutes.
        var reponse = await ReplanifierAsync(client, p, opp, rv, "2027-07-15", "14:00", "60");

        Assert.Equal(HttpStatusCode.Redirect, reponse.StatusCode);
        var r = await RendezVousAsync(rv);
        Assert.Equal((Utc(2027, 7, 15, 18), 60, "America/Toronto", StatutRendezVous.Planifie), (EnUtc(r.DebutUtc), r.DureeMinutes, r.Fuseau, r.Statut));
        Assert.Equal(("concession", "Salle A", TypeRendezVous.Consultation), (r.Mode, r.Lieu, r.Type));
        Assert.Equal(nombre, (await LireAsync(p)).Opportunites.Single().RendezVous.Count);
        var evenement = Assert.Single(r.Evenements);
        Assert.Equal((TypeEvenementRendezVous.Replanification, Utc(2027, 1, 15, 19), 45, Utc(2027, 7, 15, 18), 60),
            (evenement.Type, EnUtc(evenement.AncienDebutUtc!.Value), evenement.AncienneDureeMinutes, EnUtc(evenement.NouveauDebutUtc!.Value), evenement.NouvelleDureeMinutes));

        var donnees = await DonneesAsync(client, p);
        Assert.Equal("Rendez-vous replanifié dans le dossier (aucune invitation n'a été envoyée au client).", Message(donnees, "confirmation"));
        var projete = Projete(donnees, opp, rv);
        Assert.Equal("2027-07-15T18:00:00Z", projete.GetProperty("debutUtc").GetString());
        var derniere = projete.GetProperty("historique").EnumerateArray().Last();
        Assert.Equal(("Replanification", "2027-01-15T19:00:00Z", 45),
            (derniere.GetProperty("type").GetString(), derniere.GetProperty("ancienDebutUtc").GetString(), derniere.GetProperty("ancienneDureeMinutes").GetInt32()));
    }

    [Fact]
    public async Task Replanifier_autour_des_changements_d_heure_et_d_un_jour_a_l_autre_donne_les_bons_instants_UTC()
    {
        var (client, p, opp) = await DossierAsync();
        int rv = await PlanifierAsync(client, p, opp);

        // Juste après le passage à l'heure d'été (3 h existe, UTC-4).
        await ReplanifierAsync(client, p, opp, rv, "2027-03-14", "03:00");
        Assert.Equal(Utc(2027, 3, 14, 7), EnUtc((await RendezVousAsync(rv)).DebutUtc));
        // Juste après le retour à l'heure normale (2 h n'existe qu'une fois, UTC-5).
        await ReplanifierAsync(client, p, opp, rv, "2027-11-07", "02:00");
        Assert.Equal(Utc(2027, 11, 7, 7), EnUtc((await RendezVousAsync(rv)).DebutUtc));
        // 23 h 30 à Toronto est déjà le lendemain en UTC.
        await ReplanifierAsync(client, p, opp, rv, "2027-01-20", "23:30");
        Assert.Equal(Utc(2027, 1, 21, 4, 30), EnUtc((await RendezVousAsync(rv)).DebutUtc));

        Assert.Equal(3, (await RendezVousAsync(rv)).Evenements.Count);
    }

    [Theory]
    [InlineData("2027-03-14", "02:30", "45", "n'existe pas")]
    [InlineData("2027-11-07", "01:30", "45", "existe deux fois")]
    [InlineData("2027-03-14", "01:30", "60", "changement d'heure")]
    [InlineData("2027-01-09", "10:00", "45", "déjà passé")]
    [InlineData("2027-01-10", "09:55", "45", "déjà passé")]
    [InlineData("2027-01-15", "14:00", "45", "identique")]
    [InlineData("2027-01-20", "14:00", "50", "durée")]
    [InlineData("15/01/2027", "14:00", "45", "date valide")]
    public async Task Un_nouvel_horaire_invalide_est_refuse_sans_rien_ecrire(string date, string heure, string duree, string motif)
    {
        var (client, p, opp) = await DossierAsync();
        int rv = await PlanifierAsync(client, p, opp);
        string version = await VersionAsync(p);

        await ReplanifierAsync(client, p, opp, rv, date, heure, duree);

        Assert.Contains(motif, Message(await DonneesAsync(client, p), "erreur"));
        var r = await RendezVousAsync(rv);
        Assert.Equal((Utc(2027, 1, 15, 19), 45), (EnUtc(r.DebutUtc), r.DureeMinutes));
        Assert.Empty(r.Evenements);
        Assert.Equal(version, await VersionAsync(p));
    }

    // ---------- Annulation, réalisation, absence ----------

    [Fact]
    public async Task Annuler_avant_le_debut_garde_la_ligne_et_son_contenu_et_trace_l_annulation_meme_apres_reconnexion()
    {
        var (client, p, opp) = await DossierAsync();
        int rv = await PlanifierAsync(client, p, opp);
        var avant = await RendezVousAsync(rv);

        var reponse = await StatutAsync(client, p, opp, rv, "Annule");

        Assert.Equal(HttpStatusCode.Redirect, reponse.StatusCode);
        var r = await RendezVousAsync(rv);
        Assert.Equal(StatutRendezVous.Annule, r.Statut);
        Assert.Equal((avant.Type, avant.DebutUtc, avant.Fuseau, avant.DureeMinutes, avant.Mode, avant.Lieu, avant.Objectif, avant.OpportuniteId),
            (r.Type, r.DebutUtc, r.Fuseau, r.DureeMinutes, r.Mode, r.Lieu, r.Objectif, r.OpportuniteId));
        var evenement = Assert.Single(r.Evenements);
        Assert.Equal((TypeEvenementRendezVous.Annulation, Maintenant.UtcDateTime), (evenement.Type, EnUtc(evenement.Date)));
        Assert.Equal("Rendez-vous annulé dans le dossier (aucun message n'a été envoyé au client).", Message(await DonneesAsync(client, p), "confirmation"));

        var autreSession = await _app.ConnecterAsync(Sophie);
        var projete = Projete(await DonneesAsync(autreSession, p), opp, rv);
        Assert.Equal(("Annule", "Annulé"), (projete.GetProperty("statut").GetString(), projete.GetProperty("statutLibelle").GetString()));
        Assert.Equal("Rendez-vous annulé.", projete.GetProperty("historique").EnumerateArray().Last().GetProperty("texte").GetString());
    }

    [Fact]
    public async Task Realise_et_absent_se_declarent_seulement_a_partir_de_l_heure_prevue()
    {
        var (client, p, opp) = await DossierAsync();
        int premier = await PlanifierAsync(client, p, opp);
        int second = await PlanifierAsync(client, p, opp, heure: "16:00");

        await StatutAsync(client, p, opp, premier, "Termine");
        Assert.Contains("pas encore commencé", Message(await DonneesAsync(client, p), "erreur"));
        client = await APartirDeAsync(DebutHabituel.AddMinutes(-1));
        await StatutAsync(client, p, opp, premier, "ClientAbsent");
        Assert.Contains("pas encore commencé", Message(await DonneesAsync(client, p), "erreur"));
        Assert.Equal(StatutRendezVous.Planifie, (await RendezVousAsync(premier)).Statut);

        _app.Horloge.Fixer(DebutHabituel);
        await StatutAsync(client, p, opp, premier, "Termine");
        Assert.Equal("Rencontre déclarée réalisée dans le dossier.", Message(await DonneesAsync(client, p), "confirmation"));

        var finDuSecond = new DateTimeOffset(2027, 1, 15, 22, 30, 0, TimeSpan.Zero);
        _app.Horloge.Fixer(finDuSecond);
        await StatutAsync(client, p, opp, second, "ClientAbsent");
        Assert.Equal("Absence du client déclarée dans le dossier.", Message(await DonneesAsync(client, p), "confirmation"));

        var realise = await RendezVousAsync(premier);
        var absent = await RendezVousAsync(second);
        Assert.Equal((StatutRendezVous.Termine, TypeEvenementRendezVous.Realisation, DebutHabituel.UtcDateTime),
            (realise.Statut, realise.Evenements.Single().Type, EnUtc(realise.Evenements.Single().Date)));
        Assert.Equal((StatutRendezVous.ClientAbsent, TypeEvenementRendezVous.Absence, finDuSecond.UtcDateTime),
            (absent.Statut, absent.Evenements.Single().Type, EnUtc(absent.Evenements.Single().Date)));
        // La déclaration et l'horaire prévu sont deux faits différents : l'horaire n'est pas réécrit.
        Assert.Equal(Utc(2027, 1, 15, 21), EnUtc(absent.DebutUtc));
        var donnees = await DonneesAsync(client, p);
        Assert.Equal("Réalisé", Projete(donnees, opp, premier).GetProperty("statutLibelle").GetString());
        Assert.Equal("Client absent", Projete(donnees, opp, second).GetProperty("statutLibelle").GetString());
    }

    [Fact]
    public async Task A_partir_du_debut_on_ne_peut_plus_annuler_modifier_ni_replanifier()
    {
        var (client, p, opp) = await DossierAsync();
        int rv = await PlanifierAsync(client, p, opp);
        client = await APartirDeAsync(DebutHabituel);

        await StatutAsync(client, p, opp, rv, "Annule");
        Assert.Contains("ne peut plus être annulé", Message(await DonneesAsync(client, p), "erreur"));
        await ModifierAsync(client, p, opp, rv);
        Assert.Contains("ne peut plus être modifié ni replanifié", Message(await DonneesAsync(client, p), "erreur"));
        await ReplanifierAsync(client, p, opp, rv, "2027-01-20", "14:00");
        Assert.Contains("ne peut plus être modifié ni replanifié", Message(await DonneesAsync(client, p), "erreur"));

        var r = await RendezVousAsync(rv);
        Assert.Equal((StatutRendezVous.Planifie, "concession", Utc(2027, 1, 15, 19)), (r.Statut, r.Mode, EnUtc(r.DebutUtc)));
        Assert.Empty(r.Evenements);
    }

    [Theory]
    [InlineData("Annule")]
    [InlineData("Termine")]
    [InlineData("ClientAbsent")]
    public async Task Un_rendez_vous_annule_realise_ou_absent_est_definitif(string statutFinal)
    {
        var (client, p, opp) = await DossierAsync();
        int rv = await PlanifierAsync(client, p, opp);
        if (statutFinal != "Annule")
            client = await APartirDeAsync(DebutHabituel.AddMinutes(5));
        await StatutAsync(client, p, opp, rv, statutFinal);
        var fige = await RendezVousAsync(rv);
        Assert.Equal(statutFinal, fige.Statut.ToString());
        int evenements = await NombreEvenementsAsync();

        // Chaque tentative, avant et après l'heure prévue, avec la version à jour : refus contrôlé.
        foreach (var instant in new[] { Maintenant, DebutHabituel.AddMinutes(5) })
        {
            client = await APartirDeAsync(instant);
            foreach (var cible in new[] { "Annule", "Termine", "ClientAbsent" })
            {
                await StatutAsync(client, p, opp, rv, cible);
                Assert.Contains("ne peut plus être modifié ni changer de statut", Message(await DonneesAsync(client, p), "erreur"));
            }
            await ModifierAsync(client, p, opp, rv);
            Assert.Contains("ne peut plus être modifié", Message(await DonneesAsync(client, p), "erreur"));
            await ReplanifierAsync(client, p, opp, rv, "2027-02-20", "14:00");
            Assert.Contains("ne peut plus être modifié", Message(await DonneesAsync(client, p), "erreur"));
        }

        var apres = await RendezVousAsync(rv);
        Assert.Equal((fige.Statut, fige.Mode, fige.DebutUtc, fige.DureeMinutes, fige.DateModification), (apres.Statut, apres.Mode, apres.DebutUtc, apres.DureeMinutes, apres.DateModification));
        Assert.Equal(evenements, await NombreEvenementsAsync());
    }

    [Theory]
    [InlineData("Planifie")]
    [InlineData("Replanifie")]
    [InlineData("Confirme")]
    [InlineData("0")]
    [InlineData("annule")]
    [InlineData("")]
    public async Task Un_statut_cible_non_propose_est_refuse(string statut)
    {
        var (client, p, opp) = await DossierAsync();
        int rv = await PlanifierAsync(client, p, opp);

        await StatutAsync(client, p, opp, rv, statut);

        Assert.Contains("changement de statut proposé", Message(await DonneesAsync(client, p), "erreur"));
        Assert.Equal(StatutRendezVous.Planifie, (await RendezVousAsync(rv)).Statut);
        Assert.Empty((await RendezVousAsync(rv)).Evenements);
    }

    // ---------- Concurrence et doubles envois ----------

    [Fact]
    public async Task La_meme_annulation_envoyee_deux_fois_ne_cree_qu_une_transition_et_un_historique()
    {
        var (client, p, opp) = await DossierAsync();
        int rv = await PlanifierAsync(client, p, opp);
        string version = await VersionAsync(p);

        await StatutAsync(client, p, opp, rv, "Annule", version);
        await StatutAsync(client, p, opp, rv, "Annule", version);

        Assert.Contains("modifié entre-temps", Message(await DonneesAsync(client, p), "erreur"));
        var r = await RendezVousAsync(rv);
        Assert.Equal(StatutRendezVous.Annule, r.Statut);
        Assert.Single(r.Evenements);
    }

    [Fact]
    public async Task Une_page_perimee_ne_peut_ni_annuler_un_rendez_vous_realise_ni_declarer_l_ancien_horaire()
    {
        // Scénario B : la session 1 déclare réalisé, la session 2 tente d'annuler depuis sa page d'avant.
        var (client, p, opp) = await DossierAsync();
        int rv = await PlanifierAsync(client, p, opp);
        string pageSession2 = await VersionAsync(p);
        client = await APartirDeAsync(DebutHabituel.AddMinutes(10));
        await StatutAsync(client, p, opp, rv, "Termine");
        await StatutAsync(client, p, opp, rv, "Annule", pageSession2);
        Assert.Contains("modifié entre-temps", Message(await DonneesAsync(client, p), "erreur"));
        Assert.Equal((StatutRendezVous.Termine, 1), ((await RendezVousAsync(rv)).Statut, (await RendezVousAsync(rv)).Evenements.Count));

        // Scénario C : la session 1 replanifie, la session 2 tente ensuite une action depuis l'ancien horaire.
        client = await APartirDeAsync(Maintenant);
        int autre = await PlanifierAsync(client, p, opp, "2027-01-12", "10:00");
        string avantReplanification = await VersionAsync(p);
        await ReplanifierAsync(client, p, opp, autre, "2027-01-20", "10:00");
        client = await APartirDeAsync(new DateTimeOffset(2027, 1, 12, 15, 30, 0, TimeSpan.Zero));
        await StatutAsync(client, p, opp, autre, "Termine", avantReplanification);
        Assert.Contains("modifié entre-temps", Message(await DonneesAsync(client, p), "erreur"));
        var r = await RendezVousAsync(autre);
        Assert.Equal((StatutRendezVous.Planifie, Utc(2027, 1, 20, 15), 1), (r.Statut, EnUtc(r.DebutUtc), r.Evenements.Count));
    }

    [Fact]
    public async Task Deux_declarations_simultanees_sur_le_meme_rendez_vous_un_seul_changement_est_enregistre()
    {
        for (int tour = 0; tour < 3; tour++)
        {
            var premiere = await APartirDeAsync(Maintenant);
            int p = await CreerProspectAsync(premiere);
            int opp = (await LireAsync(p)).Opportunites.Single().Id;
            int rv = await PlanifierAsync(premiere, p, opp);
            premiere = await APartirDeAsync(DebutHabituel.AddMinutes(30));
            var seconde = await _app.ConnecterAsync(Sophie);
            string version = await VersionAsync(p);
            async Task<List<KeyValuePair<string, string>>> Formulaire(HttpClient c, string statut) =>
                [V("prospectId", "pe-" + p), V("opportuniteId", "oe-" + opp), V("rendezVousId", "rv-" + rv), V("version", version), V("statut", statut),
                 V("__RequestVerificationToken", await JetonAsync(c, "/Prospects"))];
            var f1 = await Formulaire(premiere, "Termine");
            var f2 = await Formulaire(seconde, "ClientAbsent");
            var depart = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var e1 = Task.Run(async () => { await depart.Task; return await premiere.PostAsync("/Prospects/ChangerStatutRendezVous", new FormUrlEncodedContent(f1)); });
            var e2 = Task.Run(async () => { await depart.Task; return await seconde.PostAsync("/Prospects/ChangerStatutRendezVous", new FormUrlEncodedContent(f2)); });
            depart.SetResult();
            await Task.WhenAll(e1, e2);

            var d1 = await DonneesAsync(premiere, p);
            var d2 = await DonneesAsync(seconde, p);
            Assert.Single(new[] { Message(d1, "confirmation"), Message(d2, "confirmation") }.Where(x => x is not null));
            Assert.Contains("modifié entre-temps", new[] { Message(d1, "erreur"), Message(d2, "erreur") }.Single(x => x is not null));
            var r = await RendezVousAsync(rv);
            Assert.Equal(Message(d1, "confirmation") is not null ? StatutRendezVous.Termine : StatutRendezVous.ClientAbsent, r.Statut);
            Assert.Single(r.Evenements);
        }
    }

    [Fact]
    public async Task Deux_modifications_simultanees_du_meme_rendez_vous_aucune_ecrasee_en_silence()
    {
        var premiere = await _app.ConnecterAsync(Sophie);
        var seconde = await _app.ConnecterAsync(Sophie);
        for (int tour = 0; tour < 3; tour++)
        {
            int p = await CreerProspectAsync(premiere);
            int opp = (await LireAsync(p)).Opportunites.Single().Id;
            int rv = await PlanifierAsync(premiere, p, opp);
            string version = await VersionAsync(p);
            var depart = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var jeton1 = await JetonAsync(premiere, "/Prospects");
            var jeton2 = await JetonAsync(seconde, "/Prospects");
            var e1 = Task.Run(async () =>
            {
                await depart.Task;
                return await premiere.PostAsync("/Prospects/ModifierRendezVous", new FormUrlEncodedContent(new[]
                {
                    V("prospectId", "pe-" + p), V("opportuniteId", "oe-" + opp), V("rendezVousId", "rv-" + rv), V("version", version), V("type", "Consultation"),
                    V("mode", "virtuel"), V("lieu", "Lien Teams"), V("__RequestVerificationToken", jeton1),
                }));
            });
            var e2 = Task.Run(async () =>
            {
                await depart.Task;
                return await seconde.PostAsync("/Prospects/ReplanifierRendezVous", new FormUrlEncodedContent(new[]
                {
                    V("prospectId", "pe-" + p), V("opportuniteId", "oe-" + opp), V("rendezVousId", "rv-" + rv), V("version", version), V("date", "2027-01-22"),
                    V("heure", "11:00"), V("dureeMinutes", "45"), V("__RequestVerificationToken", jeton2),
                }));
            });
            depart.SetResult();
            await Task.WhenAll(e1, e2);

            var d1 = await DonneesAsync(premiere, p);
            var d2 = await DonneesAsync(seconde, p);
            Assert.Single(new[] { Message(d1, "confirmation"), Message(d2, "confirmation") }.Where(x => x is not null));
            var r = await RendezVousAsync(rv);
            var evenement = Assert.Single(r.Evenements);
            if (Message(d1, "confirmation") is not null)
                Assert.Equal((TypeEvenementRendezVous.Modification, "virtuel", Utc(2027, 1, 15, 19)), (evenement.Type, r.Mode, EnUtc(r.DebutUtc)));
            else
                Assert.Equal((TypeEvenementRendezVous.Replanification, "concession", Utc(2027, 1, 22, 16)), (evenement.Type, r.Mode, EnUtc(r.DebutUtc)));
        }
    }

    [Fact]
    public async Task L_empreinte_du_prospect_change_avec_le_statut_et_les_informations_d_un_rendez_vous()
    {
        var (client, p, opp) = await DossierAsync();
        int rv = await PlanifierAsync(client, p, opp);
        var versions = new List<string> { await VersionAsync(p) };

        await ModifierAsync(client, p, opp, rv, "concession", "Salle B");
        versions.Add(await VersionAsync(p));
        await ModifierAsync(client, p, opp, rv, "concession", "Salle B", "Autre objectif");
        versions.Add(await VersionAsync(p));
        await StatutAsync(client, p, opp, rv, "Annule");
        versions.Add(await VersionAsync(p));

        Assert.Equal(4, versions.Distinct().Count());
        var contact = (await DonneesAsync(client, p)).GetProperty("donnees").GetProperty("contacts").EnumerateArray().Single(c => c.GetProperty("id").GetString() == "pe-" + p);
        Assert.Equal(versions.Last(), contact.GetProperty("version").GetString());
    }

    // ---------- Plusieurs opportunités et sécurité ----------

    [Fact]
    public async Task Les_changements_sur_A_ne_touchent_jamais_les_rendez_vous_de_B()
    {
        var (client, p, a) = await DossierAsync();
        int b = await AjouterOpportuniteAsync(client, p, "Projet B");
        int rvA = await PlanifierAsync(client, p, a);
        int rvB = await PlanifierAsync(client, p, b);
        var bAvant = await RendezVousAsync(rvB);

        await ModifierAsync(client, p, a, rvA, "telephone", null);
        await ReplanifierAsync(client, p, a, rvA, "2027-01-25", "09:00");
        await StatutAsync(client, p, a, rvA, "Annule");
        // Le rendez-vous de B envoyé avec l'opportunité A : introuvable, rien ne change.
        var croise = await StatutAsync(client, p, a, rvB, "Annule");

        Assert.Equal(HttpStatusCode.NotFound, croise.StatusCode);
        var bApres = await RendezVousAsync(rvB);
        Assert.Equal((bAvant.Statut, bAvant.Mode, bAvant.DebutUtc, bAvant.Lieu), (bApres.Statut, bApres.Mode, bApres.DebutUtc, bApres.Lieu));
        Assert.Empty(bApres.Evenements);
        Assert.Equal((StatutRendezVous.Annule, 3), ((await RendezVousAsync(rvA)).Statut, (await RendezVousAsync(rvA)).Evenements.Count));
        var donnees = await DonneesAsync(client, p);
        Assert.Equal("Planifie", Projete(donnees, b, rvB).GetProperty("statut").GetString());
        Assert.Single(Projete(donnees, b, rvB).GetProperty("historique").EnumerateArray());
    }

    [Fact]
    public async Task Identifiants_forges_inexistants_d_un_autre_prospect_sans_jeton_ou_par_GET_ne_changent_rien()
    {
        var (client, p, opp) = await DossierAsync();
        int rv = await PlanifierAsync(client, p, opp);
        int autre = await CreerProspectAsync(client);
        int oppAutre = (await LireAsync(autre)).Opportunites.Single().Id;
        int rvAutre = await PlanifierAsync(client, autre, oppAutre);
        string version = await VersionAsync(p);
        int evenements = await NombreEvenementsAsync();

        var introuvables = new List<HttpResponseMessage>();
        foreach (var action in new[] { "ModifierRendezVous", "ReplanifierRendezVous", "ChangerStatutRendezVous" })
        {
            var champs = new[] { V("type", "Consultation"), V("mode", "virtuel"), V("date", "2027-01-20"), V("heure", "10:00"), V("dureeMinutes", "45"), V("statut", "Annule") };
            introuvables.Add(await EnvoyerAsync(client, action, p, "oe-" + opp, "rv-" + rvAutre, champs));
            introuvables.Add(await EnvoyerAsync(client, action, p, "oe-" + oppAutre, "rv-" + rvAutre, champs));
            introuvables.Add(await EnvoyerAsync(client, action, p, "oe-" + opp, "rv-999999999", champs));
            introuvables.Add(await EnvoyerAsync(client, action, p, "oe-" + opp, "rv-abc", champs));
            introuvables.Add(await EnvoyerAsync(client, action, p, "oe-" + opp, "" + rv, champs));
            introuvables.Add(await EnvoyerAsync(client, action, p, "oe-" + opp, "", champs));
            var sansJeton = await EnvoyerAsync(client, action, p, "oe-" + opp, "rv-" + rv, champs, jeton: false);
            Assert.Equal(HttpStatusCode.BadRequest, sansJeton.StatusCode);
            var parGet = await client.GetAsync($"/Prospects/{action}?prospectId=pe-{p}&opportuniteId=oe-{opp}&rendezVousId=rv-{rv}&version={version}&statut=Annule&mode=virtuel&type=Consultation&date=2027-01-20&heure=10:00&dureeMinutes=45");
            Assert.False(parGet.IsSuccessStatusCode);
            Assert.DoesNotContain("/Prospects/Fiche", parGet.Headers.Location?.OriginalString ?? "");
        }

        Assert.All(introuvables, r => Assert.Equal(HttpStatusCode.NotFound, r.StatusCode));
        Assert.Equal(evenements, await NombreEvenementsAsync());
        Assert.Equal(version, await VersionAsync(p));
        Assert.Equal((StatutRendezVous.Planifie, StatutRendezVous.Planifie), ((await RendezVousAsync(rv)).Statut, (await RendezVousAsync(rvAutre)).Statut));
    }

    [Fact]
    public async Task Collegue_autre_concession_et_role_non_conseiller_ne_peuvent_rien_changer()
    {
        var (sophie, p, opp) = await DossierAsync();
        int rv = await PlanifierAsync(sophie, p, opp);
        string version = await VersionAsync(p);
        int evenements = await NombreEvenementsAsync();

        foreach (var intrus in new[] { await CreerUtilisateurAsync(AppRoles.Conseiller, true), await CreerUtilisateurAsync(AppRoles.Conseiller, false) })
        {
            foreach (var action in new[] { "ModifierRendezVous", "ReplanifierRendezVous", "ChangerStatutRendezVous" })
            {
                var r = await EnvoyerAsync(intrus, action, p, "oe-" + opp, "rv-" + rv,
                    [V("type", "Consultation"), V("mode", "virtuel"), V("date", "2027-01-20"), V("heure", "10:00"), V("dureeMinutes", "45"), V("statut", "Annule")], version);
                Assert.Equal(HttpStatusCode.NotFound, r.StatusCode);
                Assert.DoesNotContain("Cycle", await r.Content.ReadAsStringAsync());
            }
        }
        var directeur = await CreerUtilisateurAsync(AppRoles.Directeur, true);
        var refusRole = await directeur.PostAsync("/Prospects/ChangerStatutRendezVous", new FormUrlEncodedContent(new[]
        {
            V("prospectId", "pe-" + p), V("opportuniteId", "oe-" + opp), V("rendezVousId", "rv-" + rv), V("version", version), V("statut", "Annule"),
        }));

        bool traite = refusRole.StatusCode == HttpStatusCode.Redirect && (refusRole.Headers.Location?.OriginalString ?? "").Contains("/Prospects/Fiche");
        Assert.False(traite);
        Assert.NotEqual(HttpStatusCode.OK, refusRole.StatusCode);
        Assert.Equal(evenements, await NombreEvenementsAsync());
        Assert.Equal(StatutRendezVous.Planifie, (await RendezVousAsync(rv)).Statut);
    }

    // ---------- Ce que le cycle de vie ne fait pas ----------

    [Fact]
    public async Task Le_cycle_de_vie_ne_touche_ni_qualification_ni_vehicules_ni_etape_ni_suivi_ni_activite_ni_contact_ni_veille()
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
        int aModifier = await PlanifierAsync(client, p, opp, "2027-01-12", "10:00");
        int aAnnuler = await PlanifierAsync(client, p, opp, "2027-01-13", "10:00");
        int aRealiser = await PlanifierAsync(client, p, opp, "2027-01-15", "14:00");
        int aDeclarerAbsent = await PlanifierAsync(client, p, opp, "2027-01-15", "16:00");
        var avant = await LireAsync(p);
        var o0 = avant.Opportunites.Single();

        await ModifierAsync(client, p, opp, aModifier, "telephone", null);
        await ReplanifierAsync(client, p, opp, aModifier, "2027-01-14", "11:00");
        await StatutAsync(client, p, opp, aAnnuler, "Annule");
        client = await APartirDeAsync(new DateTimeOffset(2027, 1, 15, 22, 0, 0, TimeSpan.Zero));
        await StatutAsync(client, p, opp, aRealiser, "Termine");
        await StatutAsync(client, p, opp, aDeclarerAbsent, "ClientAbsent");

        var apres = await LireAsync(p);
        var o = apres.Opportunites.Single();
        Assert.Equal(5, o.RendezVous.Sum(r => r.Evenements.Count));
        Assert.Equal((o0.Categorie, o0.BudgetTotal, o0.Etape, o0.ProchaineAction, o0.DateProchaineAction, o0.DerniereActivite, o0.Titre),
            (o.Categorie, o.BudgetTotal, o.Etape, o.ProchaineAction, o.DateProchaineAction, o.DerniereActivite, o.Titre));
        Assert.Equal(("Kia", "Sportage"), (o.VehiculesEnvisages.Single().Marque, o.VehiculesEnvisages.Single().Modele));
        Assert.Equal(4, o.RendezVous.Count);
        // Ni note, ni contact déclaré, ni première réponse, ni suivi réalisé, ni changement d'étape.
        Assert.Empty(apres.Notes);
        Assert.Empty(o.HistoriqueEtapes);
        Assert.Empty(o.HistoriqueSuivis);
        using var scope = _app.Services.CreateScope();
        Assert.False(await Base(scope).VeillesRecommandation.AnyAsync(v => v.OpportuniteId == opp));
        // Les échanges de la fiche ne contiennent aucune trace des rendez-vous (l'historique reste dans le rendez-vous).
        var interactions = (await DonneesAsync(client, p)).GetProperty("donnees").GetProperty("interactions").EnumerateArray()
            .Where(i => i.GetProperty("prospectId").GetString() == "pe-" + p).Select(i => i.GetProperty("type").GetString()).ToList();
        Assert.DoesNotContain(interactions, t => t is "rendezvous" or "appel" or "courriel" or "visite" or "suivi-realise");
    }
}
