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

// Fonctionnalité 20 : qualification commerciale enregistrée d'une opportunité réelle, sur MySQL de test et par de vraies
// requêtes (ProspectsController.Qualifier). Seuls les champs listés dans « champs » changent ; la qualification reste
// celle de SON opportunité ; ni contact, ni étape, ni suivi, ni activité ; une page périmée ne peut rien écraser.
public class QualificationOpportunitesTests : IClassFixture<ApplicationDeTest>
{
    private const string Sophie = "sophie.gagnon@autoprestige.example";
    private const string TousLesChamps = "categorie,etat,marques,modeles,places,caracteristiques,utilisation,budgetTotal,budgetMensuel,modeAchat,miseDeFonds,reprise,repriseDetail,horizon,dateCible,elementsDecision,objections";

    private readonly ApplicationDeTest _app;

    public QualificationOpportunitesTests(ApplicationDeTest app)
    {
        _app = app;
    }

    private static string Unique() => Guid.NewGuid().ToString("N").Substring(0, 8);

    private static async Task<string> JetonAsync(HttpClient client, string page) =>
        ApplicationDeTest.JetonAntiforgery(await client.GetStringAsync(page));

    private async Task<int> CreerProspectAsync(HttpClient client)
    {
        string u = Unique();
        var champs = new Dictionary<string, string>
        {
            ["prenom"] = "Ana", ["nom"] = "Qualif" + u, ["courriel"] = "qualif." + u + "@exemple.test", ["contactPrefere"] = "courriel",
            ["source"] = "appel", ["modele"] = "Kia Sportage", ["conseillerId"] = "moi", ["etape"] = "Nouveau",
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Prospects"),
        };
        Assert.Equal(HttpStatusCode.Redirect, (await client.PostAsync("/Prospects/Creer", new FormUrlEncodedContent(champs))).StatusCode);
        using var scope = _app.Services.CreateScope();
        return (await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Prospects.SingleAsync(p => p.Nom == "Qualif" + u)).Id;
    }

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

    // Envoi du formulaire « Qualification » : valeurs (clé répétée pour une liste), champs listés, empreinte du prospect.
    private async Task<HttpResponseMessage> QualifierAsync(HttpClient client, int prospectId, int oppId, IEnumerable<KeyValuePair<string, string>> valeurs,
        string champs = TousLesChamps, string? version = null, bool jeton = true, int? prospectEnvoye = null)
    {
        var formulaire = new List<KeyValuePair<string, string>>
        {
            new("prospectId", "pe-" + (prospectEnvoye ?? prospectId)), new("opportuniteId", "oe-" + oppId),
            new("version", version ?? await VersionAsync(prospectId)), new("champs", champs),
        };
        if (jeton)
            formulaire.Add(new("__RequestVerificationToken", await JetonAsync(client, "/Prospects/Fiche/pe-" + prospectId)));
        formulaire.AddRange(valeurs);
        return await client.PostAsync("/Prospects/Qualifier", new FormUrlEncodedContent(formulaire));
    }

    private static KeyValuePair<string, string> V(string cle, string valeur) => new(cle, valeur);

    private static List<KeyValuePair<string, string>> QualificationComplete() =>
    [
        V("categorie", "vus"), V("etat", "occasion"), V("marques", "Kia,  Hyundai, Kia"), V("modeles", "Sportage, Tucson"), V("places", "5"),
        V("caracteristiques", "ti"), V("caracteristiques", "sieges-chauffants"), V("utilisation", "famille"), V("budgetTotal", "32000"),
        V("budgetMensuel", "450.50"), V("modeAchat", "financement"), V("miseDeFonds", "3000"), V("reprise", "oui"),
        V("repriseDetail", "Civic 2016, 140 000 km"), V("horizon", "30j"), V("dateCible", "2027-03-15"),
        V("elementsDecision", "prix"), V("elementsDecision", "fiabilite"), V("objections", "Hésite sur la mensualité."),
    ];

    // Qualification projetée vers la fiche (données JSON de la page), celle que voit le navigateur.
    private static async Task<JsonElement> QualificationProjeteeAsync(HttpClient client, int prospectId, int oppId)
    {
        string page = await client.GetStringAsync("/Prospects/Fiche/pe-" + prospectId);
        const string marque = "id=\"prospects-donnees\">";
        int debut = page.IndexOf(marque, StringComparison.Ordinal) + marque.Length;
        var racine = JsonDocument.Parse(page.Substring(debut, page.IndexOf("</script>", debut, StringComparison.Ordinal) - debut)).RootElement;
        return racine.GetProperty("donnees").GetProperty("opportunites").EnumerateArray().Single(o => o.GetProperty("id").GetString() == "oe-" + oppId).GetProperty("qualification").Clone();
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

    // ---------- Enregistrement et lecture ----------

    [Fact]
    public async Task Une_opportunite_neuve_n_a_aucune_qualification_inventee()
    {
        var client = await _app.ConnecterAsync(Sophie);
        int p = await CreerProspectAsync(client);
        var o = (await LireAsync(p)).Opportunites.Single();

        Assert.Null(o.EtatVehicule); Assert.Null(o.Marques); Assert.Null(o.Places); Assert.Null(o.Caracteristiques); Assert.Null(o.Utilisation);
        Assert.Null(o.BudgetMensuel); Assert.Null(o.ModeAchat); Assert.Null(o.MiseDeFonds); Assert.Null(o.Reprise); Assert.Null(o.DateCible);
        Assert.Null(o.ElementsDecision); Assert.Null(o.Objections);
        var q = await QualificationProjeteeAsync(client, p, o.Id);
        Assert.Equal(JsonValueKind.Null, q.GetProperty("etat").ValueKind);
        Assert.Equal(0, q.GetProperty("caracteristiques").GetArrayLength());
    }

    [Fact]
    public async Task La_premiere_qualification_est_enregistree_puis_relue_par_la_fiche()
    {
        var client = await _app.ConnecterAsync(Sophie);
        int p = await CreerProspectAsync(client);
        int oppId = (await LireAsync(p)).Opportunites.Single().Id;

        var envoi = await QualifierAsync(client, p, oppId, QualificationComplete());

        Assert.Equal(HttpStatusCode.Redirect, envoi.StatusCode);
        Assert.EndsWith("/Prospects/Fiche/pe-" + p + "?opportunite=oe-" + oppId + "#qualification", envoi.Headers.Location!.OriginalString);
        Assert.Equal("Qualification enregistrée.", (await MessagesAsync(client, p)).Confirmation);
        var o = (await LireAsync(p)).Opportunites.Single();
        Assert.Equal(("vus", "occasion", "Kia, Hyundai", "Sportage, Tucson", 5), (o.Categorie, o.EtatVehicule, o.Marques, o.Modele, o.Places));
        Assert.Equal(("ti,sieges-chauffants", "famille", 32000m, 450.50m), (o.Caracteristiques, o.Utilisation, o.BudgetTotal, o.BudgetMensuel));
        Assert.Equal(("financement", 3000m, "oui", "Civic 2016, 140 000 km", "30j"), (o.ModeAchat, o.MiseDeFonds, o.Reprise, o.RepriseDetail, o.Horizon));
        Assert.Equal((new DateTime(2027, 3, 15), "prix,fiabilite", "Hésite sur la mensualité."), (o.DateCible!.Value, o.ElementsDecision, o.Objections));
        var q = await QualificationProjeteeAsync(client, p, oppId);
        Assert.Equal("occasion", q.GetProperty("etat").GetString());
        Assert.Equal(new[] { "Kia", "Hyundai" }, q.GetProperty("marques").EnumerateArray().Select(x => x.GetString()).ToArray());
        Assert.Equal(new[] { "Sportage", "Tucson" }, q.GetProperty("modeles").EnumerateArray().Select(x => x.GetString()).ToArray());
        Assert.Equal(new[] { "prix", "fiabilite" }, q.GetProperty("elementsDecision").EnumerateArray().Select(x => x.GetString()).ToArray());
        Assert.Equal(450.50m, q.GetProperty("budgetMensuel").GetDecimal());

    }

    // Messages du serveur affichés par la fiche après un envoi (TempData, lus une seule fois).
    private static async Task<(string? Confirmation, string? Erreur)> MessagesAsync(HttpClient client, int prospectId)
    {
        var e = JsonDocument.Parse(ExtraireDonnees(await client.GetStringAsync("/Prospects/Fiche/pe-" + prospectId))).RootElement.GetProperty("enregistrement");
        string? Lire(string nom) => e.GetProperty(nom).ValueKind == JsonValueKind.String ? e.GetProperty(nom).GetString() : null;
        return (Lire("confirmation"), Lire("erreur"));
    }

    private static string ExtraireDonnees(string page)
    {
        const string marque = "id=\"prospects-donnees\">";
        int debut = page.IndexOf(marque, StringComparison.Ordinal) + marque.Length;
        return page.Substring(debut, page.IndexOf("</script>", debut, StringComparison.Ordinal) - debut);
    }

    [Fact]
    public async Task Seuls_les_champs_envoyes_changent_et_un_champ_envoye_vide_est_efface()
    {
        var client = await _app.ConnecterAsync(Sophie);
        int p = await CreerProspectAsync(client);
        int oppId = (await LireAsync(p)).Opportunites.Single().Id;
        await QualifierAsync(client, p, oppId, QualificationComplete());

        var modification = await QualifierAsync(client, p, oppId, [V("budgetMensuel", "500"), V("objections", "")], "budgetMensuel,objections");

        Assert.Equal(HttpStatusCode.Redirect, modification.StatusCode);
        var o = (await LireAsync(p)).Opportunites.Single();
        Assert.Equal(500m, o.BudgetMensuel);
        Assert.Null(o.Objections);
        Assert.Equal(("vus", "occasion", 32000m, "ti,sieges-chauffants", "Civic 2016, 140 000 km"), (o.Categorie, o.EtatVehicule, o.BudgetTotal, o.Caracteristiques, o.RepriseDetail));
    }

    [Fact]
    public async Task Sans_reprise_la_precision_de_reprise_est_effacee_et_les_listes_decochees_aussi()
    {
        var client = await _app.ConnecterAsync(Sophie);
        int p = await CreerProspectAsync(client);
        int oppId = (await LireAsync(p)).Opportunites.Single().Id;
        await QualifierAsync(client, p, oppId, QualificationComplete());

        await QualifierAsync(client, p, oppId, [V("reprise", "non"), V("repriseDetail", "Civic 2016")], "reprise,repriseDetail,caracteristiques");

        var o = (await LireAsync(p)).Opportunites.Single();
        Assert.Equal(("non", (string?)null, (string?)null), (o.Reprise, o.RepriseDetail, o.Caracteristiques));
    }

    [Theory]
    [InlineData("categorie", "tracteur")]
    [InlineData("etat", "presque-neuf")]
    [InlineData("places", "3")]
    [InlineData("budgetTotal", "-1")]
    [InlineData("budgetMensuel", "20000")]
    [InlineData("miseDeFonds", "abc")]
    [InlineData("caracteristiques", "turbo")]
    [InlineData("dateCible", "2026-13-01")]
    [InlineData("horizon", "jamais")]
    public async Task Une_valeur_invalide_est_refusee_et_rien_n_est_ecrit(string champ, string valeur)
    {
        var client = await _app.ConnecterAsync(Sophie);
        int p = await CreerProspectAsync(client);
        int oppId = (await LireAsync(p)).Opportunites.Single().Id;
        await QualifierAsync(client, p, oppId, QualificationComplete());
        string version = await VersionAsync(p);

        var refus = await QualifierAsync(client, p, oppId, [V("objections", "Ne doit pas être enregistré"), V(champ, valeur)], "objections," + champ);

        Assert.Equal(HttpStatusCode.Redirect, refus.StatusCode);
        Assert.Equal(version, await VersionAsync(p));
        var erreur = JsonDocument.Parse(ExtraireDonnees(await client.GetStringAsync("/Prospects/Fiche/pe-" + p))).RootElement.GetProperty("enregistrement").GetProperty("erreur").GetString();
        Assert.StartsWith("Qualification non enregistrée.", erreur);
    }

    [Theory]
    [InlineData("marques", 121)]
    [InlineData("modeles", 81)]
    [InlineData("repriseDetail", 121)]
    [InlineData("objections", 501)]
    public async Task Un_texte_trop_long_est_refuse(string champ, int longueur)
    {
        var client = await _app.ConnecterAsync(Sophie);
        int p = await CreerProspectAsync(client);
        int oppId = (await LireAsync(p)).Opportunites.Single().Id;
        string version = await VersionAsync(p);

        await QualifierAsync(client, p, oppId, [V("reprise", "oui"), V(champ, new string('a', longueur))], "reprise," + champ);

        Assert.Equal(version, await VersionAsync(p));
    }

    // ---------- Plusieurs opportunités ----------

    [Fact]
    public async Task Qualifier_A_ne_touche_pas_B_et_chacune_garde_sa_qualification()
    {
        var client = await _app.ConnecterAsync(Sophie);
        int p = await CreerProspectAsync(client);
        int a = (await LireAsync(p)).Opportunites.Single().Id;
        int b = await AjouterOpportuniteAsync(client, p, "Deuxième véhicule");

        await QualifierAsync(client, p, a, QualificationComplete());
        await QualifierAsync(client, p, b, [V("categorie", "berline"), V("etat", "neuf"), V("budgetTotal", "25000")], "categorie,etat,budgetTotal");
        await QualifierAsync(client, p, a, [V("places", "7")], "places");

        var apres = (await LireAsync(p)).Opportunites.ToDictionary(o => o.Id);
        Assert.Equal(("vus", "occasion", 7, 32000m), (apres[a].Categorie, apres[a].EtatVehicule, apres[a].Places, apres[a].BudgetTotal));
        Assert.Equal(("berline", "neuf", (int?)null, 25000m, (string?)null), (apres[b].Categorie, apres[b].EtatVehicule, apres[b].Places, apres[b].BudgetTotal, apres[b].Objections));
    }

    // ---------- Sécurité ----------

    [Fact]
    public async Task Collegue_autre_concession_mauvais_prospect_ou_opportunite_inconnue_sont_refuses_sans_ecriture()
    {
        var sophie = await _app.ConnecterAsync(Sophie);
        int p = await CreerProspectAsync(sophie);
        int autre = await CreerProspectAsync(sophie);
        int oppId = (await LireAsync(p)).Opportunites.Single().Id;
        string version = await VersionAsync(p);

        foreach (var intrus in new[] { await CreerConseillerAsync(true), await CreerConseillerAsync(false) })
        {
            var formulaire = new List<KeyValuePair<string, string>>
            {
                V("prospectId", "pe-" + p), V("opportuniteId", "oe-" + oppId), V("version", version), V("champs", "objections"), V("objections", "Intrusion"),
                V("__RequestVerificationToken", await JetonAsync(intrus, "/Prospects")),
            };
            var refus = await intrus.PostAsync("/Prospects/Qualifier", new FormUrlEncodedContent(formulaire));
            Assert.Equal(HttpStatusCode.NotFound, refus.StatusCode);
            Assert.DoesNotContain("Qualif", await refus.Content.ReadAsStringAsync());
        }
        // Bon prospect envoyé, mais l'opportunité d'un autre prospect ; puis une opportunité inconnue.
        var croise = await QualifierAsync(sophie, p, (await LireAsync(autre)).Opportunites.Single().Id, [V("objections", "Croisé")], "objections", prospectEnvoye: p);
        var inconnue = await QualifierAsync(sophie, p, 999999999, [V("objections", "Inconnue")], "objections");
        var sansJeton = await QualifierAsync(sophie, p, oppId, [V("objections", "Sans jeton")], "objections", jeton: false);

        Assert.Equal(HttpStatusCode.NotFound, croise.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, inconnue.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, sansJeton.StatusCode);
        Assert.Equal(version, await VersionAsync(p));
        Assert.Null((await LireAsync(autre)).Opportunites.Single().Objections);
    }

    [Fact]
    public async Task Des_champs_injectes_hors_qualification_sont_ignores()
    {
        var client = await _app.ConnecterAsync(Sophie);
        int p = await CreerProspectAsync(client);
        var avant = await LireAsync(p);
        int oppId = avant.Opportunites.Single().Id;

        var envoi = await QualifierAsync(client, p, oppId,
            [V("objections", "Ok"), V("etape", "Gagne"), V("conseillerId", "autre"), V("dealershipId", "999"), V("titre", "Pirate"), V("prochaineAction", "Faux")],
            "objections,etape,conseillerId,dealershipId,titre,prochaineAction");

        Assert.Equal(HttpStatusCode.Redirect, envoi.StatusCode);
        var apres = await LireAsync(p);
        var o = apres.Opportunites.Single();
        Assert.Equal("Ok", o.Objections);
        Assert.Equal((avant.Opportunites.Single().Etape, avant.Opportunites.Single().Titre, (string?)null), (o.Etape, o.Titre, o.ProchaineAction));
        Assert.Equal((avant.ConseillerId, avant.DealershipId), (apres.ConseillerId, apres.DealershipId));
    }

    // ---------- Concurrence ----------

    [Fact]
    public async Task Une_page_perimee_ne_peut_pas_ecraser_une_qualification_plus_recente()
    {
        var client = await _app.ConnecterAsync(Sophie);
        int p = await CreerProspectAsync(client);
        int oppId = (await LireAsync(p)).Opportunites.Single().Id;
        string pagePerimee = await VersionAsync(p);
        await QualifierAsync(client, p, oppId, [V("budgetMensuel", "400")], "budgetMensuel");

        var refus = await QualifierAsync(client, p, oppId, [V("budgetMensuel", "900")], "budgetMensuel", version: pagePerimee);

        Assert.Equal(HttpStatusCode.Redirect, refus.StatusCode);
        Assert.Equal(400m, (await LireAsync(p)).Opportunites.Single().BudgetMensuel);
        var erreur = JsonDocument.Parse(ExtraireDonnees(await client.GetStringAsync("/Prospects/Fiche/pe-" + p))).RootElement.GetProperty("enregistrement").GetProperty("erreur").GetString();
        Assert.Contains("modifié entre-temps", erreur);
    }

    [Fact]
    public async Task Deux_sessions_qui_envoient_en_meme_temps_la_meme_page_une_seule_est_appliquee()
    {
        // Deux sessions distinctes (deux onglets, deux postes) : chacune reçoit son propre message.
        var premiere = await _app.ConnecterAsync(Sophie);
        var seconde = await _app.ConnecterAsync(Sophie);
        for (int tour = 0; tour < 3; tour++)
        {
            int p = await CreerProspectAsync(premiere);
            int oppId = (await LireAsync(p)).Opportunites.Single().Id;
            string version = await VersionAsync(p);
            async Task<List<KeyValuePair<string, string>>> Formulaire(HttpClient c, string montant) =>
                [V("prospectId", "pe-" + p), V("opportuniteId", "oe-" + oppId), V("version", version), V("champs", "budgetMensuel"), V("budgetMensuel", montant),
                 V("__RequestVerificationToken", await JetonAsync(c, "/Prospects/Fiche/pe-" + p))];
            var f1 = await Formulaire(premiere, "300");
            var f2 = await Formulaire(seconde, "700");
            var depart = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var e1 = Task.Run(async () => { await depart.Task; return await premiere.PostAsync("/Prospects/Qualifier", new FormUrlEncodedContent(f1)); });
            var e2 = Task.Run(async () => { await depart.Task; return await seconde.PostAsync("/Prospects/Qualifier", new FormUrlEncodedContent(f2)); });
            depart.SetResult();
            await Task.WhenAll(e1, e2);

            var m1 = await MessagesAsync(premiere, p);
            var m2 = await MessagesAsync(seconde, p);
            // Exactement une confirmation ; l'autre session est prévenue que le dossier a changé ; aucune valeur mélangée.
            Assert.Equal(1, new[] { m1.Confirmation, m2.Confirmation }.Count(x => x == "Qualification enregistrée."));
            Assert.Equal(1, new[] { m1.Erreur, m2.Erreur }.Count(x => x != null && x.Contains("modifié entre-temps")));
            decimal attendu = m1.Confirmation is not null ? 300m : 700m;
            Assert.Equal(attendu, (await LireAsync(p)).Opportunites.Single().BudgetMensuel);
        }
    }

    // ---------- Ce que la qualification ne fait pas ----------

    [Fact]
    public async Task La_qualification_n_est_ni_un_contact_ni_un_suivi_ni_une_etape_ni_une_activite_ni_un_vehicule_envisage()
    {
        var client = await _app.ConnecterAsync(Sophie);
        int p = await CreerProspectAsync(client);
        var avant = (await LireAsync(p)).Opportunites.Single();

        await QualifierAsync(client, p, avant.Id, QualificationComplete());

        var apres = await LireAsync(p);
        var o = apres.Opportunites.Single();
        Assert.Empty(apres.Notes);
        Assert.Empty(o.HistoriqueEtapes);
        Assert.Empty(o.HistoriqueSuivis);
        Assert.Equal((avant.Etape, avant.ProchaineAction, avant.DerniereActivite), (o.Etape, o.ProchaineAction, o.DerniereActivite));
        var q = await QualificationProjeteeAsync(client, p, avant.Id);
        string page = await client.GetStringAsync("/Prospects/Fiche/pe-" + p);
        var opp = JsonDocument.Parse(ExtraireDonnees(page)).RootElement.GetProperty("donnees").GetProperty("opportunites").EnumerateArray().Single(x => x.GetProperty("id").GetString() == "oe-" + avant.Id);
        Assert.Equal(0, opp.GetProperty("vehiculesEnvisages").GetArrayLength());
        Assert.Equal("vus", q.GetProperty("categorie").GetString());
    }
}
