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

// Mise en veille persistante d'une recommandation (fonctionnalité 14) : IntelligenceController.MettreEnVeille et
// ReactiverVeille, ServiceVeillesRecommandations et la table VeillesRecommandation, sur une base MySQL jetable.
// Une veille n'est jamais une réalisation : le suivi, l'étape, les notes et l'historique du dossier ne changent pas.
// La séparation présentées / en veille côté navigateur est testée dans Js/veille-recommandations.test.js.
public class VeillesRecommandationsTests : IClassFixture<ApplicationDeTest>
{
    private const string Sophie = "sophie.gagnon@autoprestige.example"; // conseillère, Auto Prestige Brossard
    private const string Suivi = "Préparer le dossier de financement";

    private readonly ApplicationDeTest _app;

    public VeillesRecommandationsTests(ApplicationDeTest app)
    {
        _app = app;
    }

    private static string Unique() => Guid.NewGuid().ToString("N").Substring(0, 8);

    private static async Task<string> JetonAsync(HttpClient client, string adresse) =>
        ApplicationDeTest.JetonAntiforgery(await client.GetStringAsync(adresse));

    // Prospect réel « Nouveau » avec un suivi du jour : recommandations premiere-reponse:oe-N et suivi-echeance.
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
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Prospects"),
        };
        Assert.Equal(HttpStatusCode.Redirect, (await client.PostAsync("/Prospects/Creer", new FormUrlEncodedContent(champs))).StatusCode);
        await using var db = Contexte(out var scope);
        using (scope)
            return await db.OpportunitesVente.AsNoTracking().Include(o => o.Prospect).SingleAsync(o => o.Prospect!.Courriel == courriel);
    }

    private ApplicationDbContext Contexte(out IServiceScope scope)
    {
        scope = _app.Services.CreateScope();
        return scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    }

    private static string Cle(OpportuniteVente o) => "premiere-reponse:oe-" + o.Id;

    private async Task<HttpResponseMessage> VeilleAsync(HttpClient client, string cle, int jours = 3, string etape = "Nouveau", bool avecJeton = true)
    {
        var champs = new Dictionary<string, string> { ["cle"] = cle, ["jours"] = jours.ToString(), ["etape"] = etape, ["retour"] = "/Intelligence" };
        if (avecJeton)
            champs["__RequestVerificationToken"] = await JetonAsync(client, "/Intelligence");
        return await client.PostAsync("/Intelligence/MettreEnVeille", new FormUrlEncodedContent(champs));
    }

    private async Task<HttpResponseMessage> ReactiverAsync(HttpClient client, string cle)
    {
        var champs = new Dictionary<string, string>
        {
            ["cle"] = cle,
            ["retour"] = "/Intelligence",
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Intelligence"),
        };
        return await client.PostAsync("/Intelligence/ReactiverVeille", new FormUrlEncodedContent(champs));
    }

    private async Task<List<VeilleRecommandation>> VeillesAsync(int opportuniteId)
    {
        await using var db = Contexte(out var scope);
        using (scope)
            return await db.VeillesRecommandation.AsNoTracking().Where(v => v.OpportuniteId == opportuniteId).OrderBy(v => v.Id).ToListAsync();
    }

    private async Task ModifierAsync(int opportuniteId, Action<ApplicationDbContext, OpportuniteVente> changement)
    {
        await using var db = Contexte(out var scope);
        using (scope)
        {
            var o = await db.OpportunitesVente.Include(x => x.Prospect).SingleAsync(x => x.Id == opportuniteId);
            changement(db, o);
            await db.SaveChangesAsync();
        }
    }

    // Fin d'une veille placée dans le passé, directement dans la base jetable : l'expiration côté serveur ne dépend
    // pas de l'horloge du navigateur.
    private async Task ExpirerAsync(int opportuniteId)
    {
        await using var db = Contexte(out var scope);
        using (scope)
        {
            foreach (var v in await db.VeillesRecommandation.Where(x => x.OpportuniteId == opportuniteId && x.CleActive != null).ToListAsync())
                v.FinUtc = DateTime.UtcNow.AddMinutes(-1);
            await db.SaveChangesAsync();
        }
    }

    // Veilles transmises au navigateur par une page (balise intelligence-donnees) et message du serveur.
    private static List<string> VeillesDeLaPage(string page)
    {
        int debut = page.IndexOf("id=\"intelligence-donnees\">", StringComparison.Ordinal);
        Assert.True(debut >= 0, "Données du moteur introuvables.");
        debut = page.IndexOf('>', debut) + 1;
        int fin = page.IndexOf("</script>", debut, StringComparison.Ordinal);
        var donnees = JsonDocument.Parse(page.Substring(debut, fin - debut)).RootElement.GetProperty("donnees");
        return donnees.GetProperty("veilles").EnumerateArray().Select(v => v.GetProperty("cle").GetString()!).ToList();
    }

    private static string? Message(string page, string champ)
    {
        int debut = page.IndexOf("id=\"prospects-donnees\">", StringComparison.Ordinal);
        debut = page.IndexOf('>', debut) + 1;
        int fin = page.IndexOf("</script>", debut, StringComparison.Ordinal);
        return JsonDocument.Parse(page.Substring(debut, fin - debut)).RootElement.GetProperty("enregistrement").GetProperty(champ).GetString();
    }

    // Le dossier tel qu'il était : suivi, étape, activité, notes et historique des suivis.
    private async Task<string> EmpreinteDossierAsync(int opportuniteId)
    {
        await using var db = Contexte(out var scope);
        using (scope)
        {
            var o = await db.OpportunitesVente.AsNoTracking().SingleAsync(x => x.Id == opportuniteId);
            int notes = await db.NotesProspect.CountAsync(n => n.ProspectId == o.ProspectId);
            int historique = await db.HistoriquesSuiviOpportunite.CountAsync(h => h.OpportuniteId == o.Id);
            return $"{o.ProchaineAction}|{o.DateProchaineAction:O}|{o.Etape}|{o.DerniereActivite:O}|{notes}|{historique}";
        }
    }

    // ---------- Mise en veille, relecture, réactivation ----------

    [Fact]
    public async Task Une_veille_autorisee_est_enregistree_relue_et_ne_change_rien_au_dossier()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var o = await CreerAsync(client, "Veille" + Unique());
        string avant = await EmpreinteDossierAsync(o.Id);

        var envoi = await VeilleAsync(client, Cle(o), jours: 3);

        Assert.Equal("/Intelligence", envoi.Headers.Location!.ToString());
        var v = Assert.Single(await VeillesAsync(o.Id));
        Assert.Equal(Cle(o), v.CleRecommandation);
        Assert.Equal(Cle(o), v.CleActive);
        Assert.Equal("premiere-reponse", v.Regle);
        Assert.Equal(EtapeVente.Nouveau, v.EtapeAuDebut);
        Assert.Equal(o.Prospect!.DealershipId, v.DealershipId);
        Assert.InRange((v.FinUtc - v.DebutUtc).TotalHours, 71.99, 72.01);
        Assert.Null(v.ReactiveeLeUtc);
        Assert.Equal(avant, await EmpreinteDossierAsync(o.Id)); // aucun « Réalisé », aucune note, suivi intact

        string page = await client.GetStringAsync("/Intelligence");
        Assert.Contains(Cle(o), VeillesDeLaPage(page));
        Assert.Equal("Recommandation mise en veille pour 3 jours. Elle n'est pas marquée comme réalisée : le dossier ne change pas.", Message(page, "confirmation"));
        // Relue à chaque page qui charge le moteur (Accueil compris), sans nouveau message.
        string accueil = await client.GetStringAsync("/Conseiller");
        Assert.Contains(Cle(o), VeillesDeLaPage(accueil));
    }

    [Fact]
    public async Task La_reactivation_est_enregistree_et_idempotente()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var o = await CreerAsync(client, "Reactive" + Unique());
        await VeilleAsync(client, Cle(o));

        await ReactiverAsync(client, Cle(o));
        string page = await client.GetStringAsync("/Intelligence");
        await ReactiverAsync(client, Cle(o)); // double envoi

        var v = Assert.Single(await VeillesAsync(o.Id));
        Assert.Null(v.CleActive);
        Assert.NotNull(v.ReactiveeLeUtc);
        Assert.DoesNotContain(Cle(o), VeillesDeLaPage(page));
        Assert.Equal("Recommandation réactivée : elle revient dans vos priorités si elle s'applique toujours.", Message(page, "confirmation"));
        Assert.Equal("Cette recommandation n'était plus en veille : rien n'a changé.", Message(await client.GetStringAsync("/Intelligence"), "confirmation"));
    }

    [Fact]
    public async Task Deux_demandes_identiques_ne_creent_qu_une_veille_et_ajustent_la_duree()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var o = await CreerAsync(client, "Double" + Unique());

        await VeilleAsync(client, Cle(o), jours: 1);
        await VeilleAsync(client, Cle(o), jours: 1);
        await VeilleAsync(client, Cle(o), jours: 7); // modification de la durée

        var v = Assert.Single(await VeillesAsync(o.Id));
        Assert.Equal(Cle(o), v.CleActive);
        Assert.NotNull(v.ModifieeLeUtc);
        Assert.InRange((v.FinUtc - v.ModifieeLeUtc!.Value).TotalHours, 167.99, 168.01);
    }

    [Fact]
    public async Task Des_demandes_simultanees_ne_laissent_qu_une_veille_ouverte()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var o = await CreerAsync(client, "Simultane" + Unique());
        string sophieId = o.Prospect!.ConseillerId;

        async Task<bool> MettreEnVeilleAsync()
        {
            using var scope = _app.Services.CreateScope();
            var service = scope.ServiceProvider.GetRequiredService<IServiceVeillesRecommandations>();
            return (await service.MettreEnVeilleAsync(sophieId, Cle(o), 3, "Nouveau")).Succes;
        }
        var resultats = await Task.WhenAll(Enumerable.Range(0, 6).Select(_ => MettreEnVeilleAsync()));

        Assert.Contains(true, resultats);
        Assert.Single(await VeillesAsync(o.Id), v => v.CleActive != null);

        async Task<bool> ReactiverDepuisServiceAsync()
        {
            using var scope = _app.Services.CreateScope();
            var service = scope.ServiceProvider.GetRequiredService<IServiceVeillesRecommandations>();
            return (await service.ReactiverAsync(sophieId, Cle(o))).Valeur;
        }
        var reactivations = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => ReactiverDepuisServiceAsync()));
        Assert.Single(reactivations, r => r); // une seule réactivation effective, les autres ne changent rien
        Assert.All(await VeillesAsync(o.Id), v => Assert.Null(v.CleActive));
    }

    [Fact]
    public async Task L_index_unique_refuse_deux_veilles_ouvertes_pour_la_meme_recommandation()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var o = await CreerAsync(client, "Index" + Unique());
        await VeilleAsync(client, Cle(o));
        var existante = Assert.Single(await VeillesAsync(o.Id));

        await using var db = Contexte(out var scope);
        using (scope)
        {
            db.VeillesRecommandation.Add(new VeilleRecommandation
            {
                DealershipId = existante.DealershipId, ConseillerId = existante.ConseillerId, OpportuniteId = o.Id,
                Regle = "premiere-reponse", CleRecommandation = Cle(o), CleActive = Cle(o), EtapeAuDebut = EtapeVente.Nouveau,
                DebutUtc = DateTime.UtcNow, FinUtc = DateTime.UtcNow.AddDays(1),
            });
            await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        }
    }

    // ---------- Expiration et invalidation ----------

    [Fact]
    public async Task Une_veille_expiree_n_est_plus_active_et_une_nouvelle_veille_la_remplace()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var o = await CreerAsync(client, "Expire" + Unique());
        await VeilleAsync(client, Cle(o));
        await using (var db = Contexte(out var scope))
        using (scope)
        {
            var v = await db.VeillesRecommandation.SingleAsync(x => x.OpportuniteId == o.Id);
            v.FinUtc = DateTime.UtcNow.AddMinutes(-1);
            await db.SaveChangesAsync();
        }

        Assert.DoesNotContain(Cle(o), VeillesDeLaPage(await client.GetStringAsync("/Intelligence")));

        await VeilleAsync(client, Cle(o), jours: 1);
        string page = await client.GetStringAsync("/Intelligence");
        Assert.StartsWith("Recommandation mise en veille pour 1 jour.", Message(page, "confirmation")); // l'index unique ne bloque pas
        Assert.Contains(Cle(o), VeillesDeLaPage(page));
        var veilles = await VeillesAsync(o.Id);
        Assert.Equal(2, veilles.Count);
        Assert.Null(veilles[0].CleActive);
        Assert.Null(veilles[0].ReactiveeLeUtc); // expirée, pas réactivée
        Assert.Equal(Cle(o), veilles[1].CleActive);
        Assert.Single(veilles, v => v.CleActive != null); // aucune deuxième veille active équivalente

        // Une seconde expiration suivie d'une nouvelle veille : toujours une seule veille ouverte.
        await ExpirerAsync(o.Id);
        await VeilleAsync(client, Cle(o), jours: 3);
        veilles = await VeillesAsync(o.Id);
        Assert.Equal(3, veilles.Count);
        Assert.Single(veilles, v => v.CleActive != null);
    }

    [Fact]
    public async Task Reactiver_une_veille_expiree_ne_change_rien_puis_une_nouvelle_veille_fonctionne()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var o = await CreerAsync(client, "ReactExp" + Unique());
        await VeilleAsync(client, Cle(o));
        await ExpirerAsync(o.Id);

        await ReactiverAsync(client, Cle(o));
        Assert.Equal("Cette recommandation n'était plus en veille : rien n'a changé.", Message(await client.GetStringAsync("/Intelligence"), "confirmation"));
        var close = Assert.Single(await VeillesAsync(o.Id));
        Assert.Null(close.CleActive);
        Assert.Null(close.ReactiveeLeUtc); // expirée : pas comptée comme une réactivation

        await VeilleAsync(client, Cle(o), jours: 7);
        var veilles = await VeillesAsync(o.Id);
        Assert.Equal(2, veilles.Count);
        Assert.Single(veilles, v => v.CleActive != null);
    }

    // Limite acceptée : une recommandation sans jour dans sa clé, revenue à l'étape du début, retrouve sa veille.
    // Elle reste bornée par sa fin prévue (14 jours au plus) : une ancienne veille ne masque jamais indéfiniment.
    [Fact]
    public async Task Un_retour_a_la_meme_etape_retrouve_la_veille_seulement_jusqu_a_sa_fin()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var o = await CreerAsync(client, "Retour" + Unique());
        await VeilleAsync(client, Cle(o), jours: 14);

        await ModifierAsync(o.Id, (db, x) => x.Etape = EtapeVente.AQualifier); // la première réponse ne s'applique plus
        Assert.DoesNotContain(Cle(o), VeillesDeLaPage(await client.GetStringAsync("/Intelligence")));
        await ModifierAsync(o.Id, (db, x) => x.Etape = EtapeVente.Nouveau);    // situation similaire
        Assert.Contains(Cle(o), VeillesDeLaPage(await client.GetStringAsync("/Intelligence")));

        var v = Assert.Single(await VeillesAsync(o.Id));
        Assert.True(v.FinUtc <= v.DebutUtc.AddDays(14));
        await ExpirerAsync(o.Id);
        Assert.DoesNotContain(Cle(o), VeillesDeLaPage(await client.GetStringAsync("/Intelligence")));
    }

    [Fact]
    public async Task Les_autres_recommandations_de_l_opportunite_ne_sont_jamais_enregistrees_en_veille()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var o = await CreerAsync(client, "Autres" + Unique());

        await VeilleAsync(client, Cle(o));

        var v = Assert.Single(await VeillesAsync(o.Id)); // une seule raison visée (la première réponse), jamais le suivi
        Assert.Equal("premiere-reponse", v.Regle);
        Assert.DoesNotContain(VeillesDeLaPage(await client.GetStringAsync("/Intelligence")), c => c.StartsWith("suivi-echeance:"));
    }

    [Fact]
    public async Task Un_changement_d_etape_invalide_la_veille_et_une_page_perimee_est_refusee()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var o = await CreerAsync(client, "Etape" + Unique());
        await VeilleAsync(client, Cle(o));

        await ModifierAsync(o.Id, (db, x) => x.Etape = EtapeVente.AQualifier);
        Assert.DoesNotContain(Cle(o), VeillesDeLaPage(await client.GetStringAsync("/Intelligence")));

        // Page ouverte avant le changement : l'étape affichée n'est plus la bonne, rien n'est écrit.
        string avant = await EmpreinteDossierAsync(o.Id);
        await VeilleAsync(client, Cle(o), etape: "Nouveau");
        Assert.StartsWith("Recommandation non mise en veille. Le dossier a changé entre-temps", Message(await client.GetStringAsync("/Intelligence"), "erreur"));
        var veilles = await VeillesAsync(o.Id);
        Assert.Single(veilles);
        Assert.Equal(EtapeVente.Nouveau, veilles[0].EtapeAuDebut);
        Assert.Equal(avant, await EmpreinteDossierAsync(o.Id));
    }

    [Fact]
    public async Task Le_suivi_realise_ou_reporte_pendant_la_veille_ne_touche_pas_la_veille()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var o = await CreerAsync(client, "Pendant" + Unique());
        await VeilleAsync(client, Cle(o));

        var report = new Dictionary<string, string>
        {
            ["opportuniteId"] = "oe-" + o.Id,
            ["versionSuivi"] = ServiceProspects.EmpreinteSuivi(o.ProchaineAction, o.DateProchaineAction)!,
            ["date"] = DateTime.Today.AddDays(3).ToString("yyyy-MM-dd"),
            ["retour"] = "/Intelligence",
            ["__RequestVerificationToken"] = await JetonAsync(client, "/Intelligence"),
        };
        Assert.Equal(HttpStatusCode.Redirect, (await client.PostAsync("/Prospects/ReporterSuivi", new FormUrlEncodedContent(report))).StatusCode);

        var v = Assert.Single(await VeillesAsync(o.Id));
        Assert.Equal(Cle(o), v.CleActive);
        Assert.Contains(Cle(o), VeillesDeLaPage(await client.GetStringAsync("/Intelligence")));
        await using var db = Contexte(out var scope);
        using (scope)
            Assert.Equal(new[] { ClotureSuivi.Reporte }, await db.HistoriquesSuiviOpportunite.Where(h => h.OpportuniteId == o.Id).Select(h => h.Cloture).ToArrayAsync());
    }

    // ---------- Validation des entrées ----------

    [Theory]
    [InlineData("suivi-echeance:oe-{0}:2026-11-24")]         // un suivi se reporte, il ne se met pas en veille
    [InlineData("rdv-a-confirmer:oe-{0}")]                     // règle d'un module encore local
    [InlineData("regle-inventee:oe-{0}")]                      // règle inexistante
    [InlineData("premiere-reponse:oe-{0}:2026-11-20")]       // jour sur une règle qui n'en porte pas
    [InlineData("opportunite-inactive:oe-{0}")]                // règle datée sans jour
    [InlineData("opportunite-inactive:oe-{0}:2999-01-01")]   // jour à venir
    [InlineData("premiere-reponse:pe-{0}")]                    // prospect au lieu d'une opportunité
    [InlineData("premiere-reponse:oe-0")]
    [InlineData("premiere-reponse:o-melissa-vus")]             // dossier de démonstration
    [InlineData("Ana Lavoie")]
    [InlineData(" premiere-reponse:oe-{0}")]                   // espaces
    [InlineData("PREMIERE-REPONSE:oe-{0}")]                    // casse
    [InlineData("premiere-reponse:oe-{0};DROP TABLE Prospects")]
    [InlineData("premiere-reponse:oe-{0}:oe-1")]               // deux opportunités
    [InlineData("premiere-reponse:oe-99999999")]               // opportunité inexistante
    public async Task Une_cle_invalide_est_refusee_sans_ecriture(string modele)
    {
        var client = await _app.ConnecterAsync(Sophie);
        var o = await CreerAsync(client, "Cle" + Unique());

        var envoi = await VeilleAsync(client, string.Format(modele, o.Id));

        Assert.Equal(HttpStatusCode.NotFound, envoi.StatusCode);
        Assert.Empty(await VeillesAsync(o.Id));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(2)]
    [InlineData(-3)]
    [InlineData(365)]
    public async Task Une_duree_non_proposee_est_refusee_sans_ecriture(int jours)
    {
        var client = await _app.ConnecterAsync(Sophie);
        var o = await CreerAsync(client, "Duree" + Unique());

        await VeilleAsync(client, Cle(o), jours: jours);

        Assert.Empty(await VeillesAsync(o.Id));
        Assert.Equal("Recommandation non mise en veille. Choisissez une durée de veille proposée.", Message(await client.GetStringAsync("/Intelligence"), "erreur"));
    }

    [Fact]
    public async Task Une_opportunite_cloturee_est_refusee_sans_ecriture()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var o = await CreerAsync(client, "Perdue" + Unique());
        await ModifierAsync(o.Id, (db, x) => x.Etape = EtapeVente.Perdu);

        await VeilleAsync(client, Cle(o), etape: "Perdu");

        Assert.Empty(await VeillesAsync(o.Id));
    }

    [Fact]
    public async Task Sans_jeton_antiforgery_rien_n_est_ecrit()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var o = await CreerAsync(client, "Jeton" + Unique());

        var envoi = await VeilleAsync(client, Cle(o), avecJeton: false);

        Assert.Equal(HttpStatusCode.BadRequest, envoi.StatusCode);
        Assert.Empty(await VeillesAsync(o.Id));
    }

    [Fact]
    public async Task Une_panne_de_sauvegarde_n_ecrit_rien_et_le_dit()
    {
        var client = await _app.ConnecterAsync(Sophie);
        var o = await CreerAsync(client, "Panne" + Unique());
        string jeton = await JetonAsync(client, "/Intelligence");
        var champs = new Dictionary<string, string> { ["cle"] = Cle(o), ["jours"] = "3", ["etape"] = "Nouveau", ["retour"] = "/Intelligence", ["__RequestVerificationToken"] = jeton };

        _app.Panne.EnPanne = true;
        try
        {
            await client.PostAsync("/Intelligence/MettreEnVeille", new FormUrlEncodedContent(champs));
        }
        finally
        {
            _app.Panne.EnPanne = false;
        }

        Assert.Empty(await VeillesAsync(o.Id));
        Assert.StartsWith("Recommandation non mise en veille. L'enregistrement a échoué", Message(await client.GetStringAsync("/Intelligence"), "erreur"));
    }

    // ---------- Isolation ----------

    [Fact]
    public async Task Un_collegue_ou_une_autre_concession_ne_peut_ni_voir_ni_poser_ni_reactiver_la_veille()
    {
        var sophie = await _app.ConnecterAsync(Sophie);
        var o = await CreerAsync(sophie, "Prive" + Unique());
        await VeilleAsync(sophie, Cle(o));

        foreach (var autre in new[] { await CreerConseillerAsync(o.Prospect!.DealershipId), await CreerConseillerAsync(null) })
        {
            string page = await autre.GetStringAsync("/Intelligence");
            Assert.DoesNotContain(Cle(o), VeillesDeLaPage(page));
            Assert.Equal(HttpStatusCode.NotFound, (await VeilleAsync(autre, Cle(o), jours: 14)).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await ReactiverAsync(autre, Cle(o))).StatusCode);
        }

        var v = Assert.Single(await VeillesAsync(o.Id));
        Assert.Equal(Cle(o), v.CleActive);
        Assert.Null(v.ReactiveeLeUtc);
        Assert.InRange((v.FinUtc - v.DebutUtc).TotalHours, 71.99, 72.01);
    }

    [Fact]
    public async Task Une_opportunite_devenue_inaccessible_ne_transmet_plus_sa_veille()
    {
        var sophie = await _app.ConnecterAsync(Sophie);
        var o = await CreerAsync(sophie, "Transfere" + Unique());
        await VeilleAsync(sophie, Cle(o));

        // Le prospect passe à un autre conseiller (réaffectation faite ailleurs).
        await CreerConseillerAsync(o.Prospect!.DealershipId, "nouveau.titulaire." + o.Id + "@exemple.test");
        await ModifierAsync(o.Id, (db, x) => x.Prospect!.ConseillerId = db.Users.Single(u => u.Email == "nouveau.titulaire." + o.Id + "@exemple.test").Id);

        Assert.DoesNotContain(Cle(o), VeillesDeLaPage(await sophie.GetStringAsync("/Intelligence")));
        Assert.Equal(HttpStatusCode.NotFound, (await ReactiverAsync(sophie, Cle(o))).StatusCode);
    }

    private async Task<HttpClient> CreerConseillerAsync(int? concessionId, string? courriel = null)
    {
        courriel ??= "conseiller." + Unique() + "@exemple.test";
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
