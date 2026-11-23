using Microsoft.EntityFrameworkCore;
using Phineas.Models.Entities;
using Phineas.Models.ViewModels.Account;
using Phineas.Models.ViewModels.Conseiller;
using Phineas.Services.Commun;
using Phineas.Services.Conseiller;
using Phineas.Tests.Infrastructure;

namespace Phineas.Tests;

// Consultation et modification d'un prospect enregistré (ServiceProspects.ConsulterAsync et ModifierAsync).
// Chaque test crée son conseiller, sa concession et son prospect par CreerAsync, comme le ferait le formulaire.
public class ServiceProspectsModificationTests : IClassFixture<BaseMySqlDeTest>
{
    private readonly BaseMySqlDeTest _base;

    public ServiceProspectsModificationTests(BaseMySqlDeTest baseDeTest)
    {
        _base = baseDeTest;
    }

    private static ServiceProspects NouveauService(Phineas.Data.ApplicationDbContext db) => new(db, new ServiceProspectsDemo());

    // Crée un prospect complet (contact + premier intérêt + suivi) et retourne son id en base.
    private async Task<int> CreerProspectAsync(ApplicationUser conseiller, string courriel = "marc.roy@exemple.test", string telephone = "514-555-0110")
    {
        var saisie = new NouveauProspectSaisie
        {
            Prenom = "Marc",
            Nom = "Roy",
            Courriel = courriel,
            Telephone = telephone,
            ContactPrefere = "telephone",
            Source = "visite",
            SourceDetail = "Salon de l'auto",
            Categorie = "vus",
            Modele = "Toyota RAV4",
            Budget = 30000,
            Horizon = "30j",
            Commentaire = "Préfère être appelé le soir.",
            ConseillerId = ServiceProspectsDemo.IdConseillerConnecte,
            Etape = "AQualifier",
            ProchaineAction = "Rappeler",
            DateSuivi = DateTime.Today.AddDays(5),
        };
        await using var db = _base.NouveauContexte();
        var resultat = await NouveauService(db).CreerAsync(conseiller.Id, saisie);
        Assert.True(resultat.Succes, resultat.PremierMessage);
        return resultat.Valeur;
    }

    private async Task<Prospect> LireEnBaseAsync(int id)
    {
        await using var db = _base.NouveauContexte();
        return await db.Prospects.AsNoTracking().Include(p => p.Opportunites).SingleAsync(p => p.Id == id);
    }

    // Saisie de modification qui reprend les valeurs actuelles en base (comme le tiroir prérempli).
    private async Task<ModificationProspectSaisie> SaisieActuelleAsync(int id)
    {
        var p = await LireEnBaseAsync(id);
        var o = p.Opportunites.Single();
        return new ModificationProspectSaisie
        {
            ProspectId = "pe-" + p.Id,
            OpportuniteId = "oe-" + o.Id,
            Version = ServiceProspects.Empreinte(p),
            Prenom = p.Prenom,
            Nom = p.Nom,
            Courriel = p.Courriel,
            Telephone = p.Telephone,
            ContactPrefere = p.ContactPrefere,
            Source = p.Source,
            SourceDetail = p.SourceDetail,
            ConseillerId = ServiceProspectsDemo.IdConseillerConnecte,
            Categorie = o.Categorie,
            Modele = o.Modele,
            Budget = o.BudgetTotal,
            Horizon = o.Horizon,
        };
    }

    private async Task<ResultatService> ModifierAsync(ApplicationUser conseiller, ModificationProspectSaisie saisie, params Microsoft.EntityFrameworkCore.Diagnostics.IInterceptor[] intercepteurs)
    {
        await using var db = _base.NouveauContexte(intercepteurs);
        return await NouveauService(db).ModifierAsync(conseiller.Id, saisie);
    }

    private async Task<ResultatService> ConsulterAsync(ApplicationUser conseiller, string? id, params Microsoft.EntityFrameworkCore.Diagnostics.IInterceptor[] intercepteurs)
    {
        await using var db = _base.NouveauContexte(intercepteurs);
        return await NouveauService(db).ConsulterAsync(conseiller.Id, id);
    }

    // 1
    [Fact]
    public async Task Un_prospect_enregistre_est_consultable_avec_ses_valeurs_en_base()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);

        var acces = await ConsulterAsync(conseiller, "pe-" + id);

        Assert.True(acces.Succes);
        await using var db = _base.NouveauContexte();
        var donnees = await NouveauService(db).ObtenirAsync(new UserSummaryViewModel { Id = conseiller.Id, FullName = conseiller.FullName });
        var contact = Assert.Single(donnees.Contacts, c => c.Id == "pe-" + id);
        Assert.Equal("514-555-0110", contact.Telephone);
        Assert.Equal(ServiceProspects.Empreinte(await LireEnBaseAsync(id)), contact.Version);
    }

    // 2
    [Theory]
    [InlineData("pe-999999")]
    [InlineData("pe-abc")]
    [InlineData("pe-0")]
    [InlineData("12")]
    [InlineData("")]
    [InlineData(null)]
    public async Task Un_id_inexistant_ou_invalide_donne_introuvable(string? id)
    {
        var conseiller = await _base.CreerConseillerAsync();

        var acces = await ConsulterAsync(conseiller, id);
        var modification = await ModifierAsync(conseiller, new ModificationProspectSaisie { ProspectId = id, Prenom = "X" });

        Assert.True(acces.Introuvable);
        Assert.True(modification.Introuvable);
    }

    // 3
    [Fact]
    public async Task Un_prospect_d_une_autre_concession_reste_introuvable_et_intact()
    {
        var proprietaire = await _base.CreerConseillerAsync();
        var autre = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(proprietaire);
        var saisie = await SaisieActuelleAsync(id);
        saisie.Nom = "Pirate";

        var acces = await ConsulterAsync(autre, "pe-" + id);
        var modification = await ModifierAsync(autre, saisie);

        Assert.True(acces.Introuvable);
        Assert.True(modification.Introuvable);
        Assert.Equal("Roy", (await LireEnBaseAsync(id)).Nom);
    }

    [Fact]
    public async Task Un_autre_conseiller_de_la_meme_concession_ne_voit_pas_le_prospect()
    {
        var proprietaire = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(proprietaire);
        ApplicationUser collegue;
        await using (var db = _base.NouveauContexte())
        {
            collegue = new ApplicationUser
            {
                UserName = "collegue." + id + "@exemple.test",
                Email = "collegue." + id + "@exemple.test",
                FirstName = "Collegue",
                LastName = "Meme",
                DealershipId = proprietaire.DealershipId,
            };
            db.Users.Add(collegue);
            await db.SaveChangesAsync();
        }

        Assert.True((await ConsulterAsync(collegue, "pe-" + id)).Introuvable);
        Assert.True((await ModifierAsync(collegue, await SaisieActuelleAsync(id))).Introuvable);
    }

    // 4
    [Fact]
    public async Task Une_modification_valide_est_enregistree()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var saisie = await SaisieActuelleAsync(id);
        saisie.Prenom = "Marc-Antoine";
        saisie.Telephone = "438-555-0177";
        saisie.ContactPrefere = "texto";
        saisie.Source = "recommandation";
        saisie.SourceDetail = "Recommandé par Julie";

        var resultat = await ModifierAsync(conseiller, saisie);

        Assert.True(resultat.Succes, resultat.PremierMessage);
        var p = await LireEnBaseAsync(id);
        Assert.Equal("Marc-Antoine", p.Prenom);
        Assert.Equal("438-555-0177", p.Telephone);
        Assert.Equal("4385550177", p.TelephoneChiffres);
        Assert.Equal("texto", p.ContactPrefere);
        Assert.Equal("recommandation", p.Source);
        Assert.Equal("Recommandé par Julie", p.SourceDetail);
    }

    [Fact]
    public async Task Le_premier_interet_de_l_opportunite_visee_est_modifie()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var saisie = await SaisieActuelleAsync(id);
        saisie.Categorie = "camionnette";
        saisie.Modele = "Ford F-150";
        saisie.Budget = 52000;
        saisie.Horizon = null;

        var resultat = await ModifierAsync(conseiller, saisie);

        Assert.True(resultat.Succes, resultat.PremierMessage);
        var o = (await LireEnBaseAsync(id)).Opportunites.Single();
        Assert.Equal("camionnette", o.Categorie);
        Assert.Equal("Ford F-150", o.Modele);
        Assert.Equal(52000m, o.BudgetTotal);
        Assert.Null(o.Horizon);
    }

    [Fact]
    public async Task Sans_opportunite_visee_le_premier_interet_n_est_pas_touche()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var saisie = await SaisieActuelleAsync(id);
        saisie.OpportuniteId = null;
        saisie.Categorie = "coupe";
        saisie.Budget = 999999; // ignoré : aucune opportunité visée

        var resultat = await ModifierAsync(conseiller, saisie);

        Assert.True(resultat.Succes, resultat.PremierMessage);
        var o = (await LireEnBaseAsync(id)).Opportunites.Single();
        Assert.Equal("vus", o.Categorie);
        Assert.Equal(30000m, o.BudgetTotal);
    }

    [Fact]
    public async Task L_opportunite_d_un_autre_prospect_ne_peut_pas_etre_visee()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        int autreId = await CreerProspectAsync(conseiller, "autre@exemple.test", "450-555-0111");
        var saisie = await SaisieActuelleAsync(id);
        saisie.OpportuniteId = "oe-" + (await LireEnBaseAsync(autreId)).Opportunites.Single().Id;
        saisie.Categorie = "coupe";

        var resultat = await ModifierAsync(conseiller, saisie);

        Assert.True(resultat.Introuvable);
        Assert.Equal("vus", (await LireEnBaseAsync(autreId)).Opportunites.Single().Categorie);
    }

    // 5
    [Fact]
    public async Task Une_modification_invalide_est_refusee_sans_rien_changer()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var saisie = await SaisieActuelleAsync(id);
        saisie.Prenom = " ";
        saisie.Courriel = "marc.roy@";
        saisie.Telephone = "555";
        saisie.Source = "inventee";
        saisie.Budget = -10;
        saisie.Horizon = "demain";

        var resultat = await ModifierAsync(conseiller, saisie);

        var champs = resultat.Erreurs.Select(e => e.Champ).ToList();
        Assert.Contains("prenom", champs);
        Assert.Contains("courriel", champs);
        Assert.Contains("telephone", champs);
        Assert.Contains("source", champs);
        Assert.Contains("budget", champs);
        Assert.Contains("horizon", champs);
        var p = await LireEnBaseAsync(id);
        Assert.Equal("Marc", p.Prenom);
        Assert.Equal("514-555-0110", p.Telephone);
        Assert.Equal(30000m, p.Opportunites.Single().BudgetTotal);
    }

    // 6
    [Fact]
    public async Task De_nouvelles_coordonnees_libres_sont_acceptees()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        await CreerProspectAsync(conseiller, "autre@exemple.test", "450-555-0111");
        var saisie = await SaisieActuelleAsync(id);
        saisie.Courriel = "marc.nouveau@exemple.test";
        saisie.Telephone = "819-555-0123";

        var resultat = await ModifierAsync(conseiller, saisie);

        Assert.True(resultat.Succes, resultat.PremierMessage);
        Assert.Equal("marc.nouveau@exemple.test", (await LireEnBaseAsync(id)).Courriel);
    }

    // 7
    [Fact]
    public async Task Les_coordonnees_d_un_autre_prospect_sont_refusees_comme_doublon()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        await CreerProspectAsync(conseiller, "autre@exemple.test", "450-555-0111");
        var saisie = await SaisieActuelleAsync(id);
        saisie.Courriel = "AUTRE@exemple.test";
        saisie.Telephone = "(450) 555-0111";

        var resultat = await ModifierAsync(conseiller, saisie);

        Assert.Contains(resultat.Erreurs, e => e.Champ == "courriel");
        Assert.Contains(resultat.Erreurs, e => e.Champ == "telephone");
        var p = await LireEnBaseAsync(id);
        Assert.Equal("marc.roy@exemple.test", p.Courriel);
        Assert.Equal("514-555-0110", p.Telephone);
    }

    // 8
    [Fact]
    public async Task Enregistrer_sans_changer_ses_coordonnees_n_est_pas_un_doublon_de_soi_meme()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var saisie = await SaisieActuelleAsync(id);
        saisie.Telephone = "1 (514) 555-0110"; // même numéro, autre écriture

        var resultat = await ModifierAsync(conseiller, saisie);

        Assert.True(resultat.Succes, resultat.PremierMessage);
    }

    // 9, 10 et 11
    [Fact]
    public async Task Les_champs_non_modifiables_l_opportunite_et_l_attribution_sont_preserves()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var avant = await LireEnBaseAsync(id);
        var opportuniteAvant = avant.Opportunites.Single();
        var saisie = await SaisieActuelleAsync(id);
        saisie.Telephone = "438-555-0177";
        saisie.Modele = "Honda CR-V";
        // Valeurs qu'un navigateur manipulé pourrait envoyer : elles doivent être ignorées.
        saisie.Etape = "Gagne";
        saisie.Commentaire = "Commentaire remplacé";
        saisie.ProchaineAction = "Autre action";
        saisie.DateSuivi = DateTime.Today.AddDays(30);

        var resultat = await ModifierAsync(conseiller, saisie);

        Assert.True(resultat.Succes, resultat.PremierMessage);
        var apres = await LireEnBaseAsync(id);
        var opportuniteApres = Assert.Single(apres.Opportunites);
        // Contact : seul le téléphone a changé.
        Assert.Equal(avant.Prenom, apres.Prenom);
        Assert.Equal(avant.Courriel, apres.Courriel);
        Assert.Equal(avant.Source, apres.Source);
        Assert.Equal(avant.CommentaireInitial, apres.CommentaireInitial);
        Assert.Equal(avant.DateCreation, apres.DateCreation);
        // Attribution
        Assert.Equal(conseiller.Id, apres.ConseillerId);
        Assert.Equal(avant.DealershipId, apres.DealershipId);
        // Opportunité : même ligne, pipeline et suivi intacts, seul le modèle a changé.
        Assert.Equal(opportuniteAvant.Id, opportuniteApres.Id);
        Assert.Equal(opportuniteAvant.Etape, opportuniteApres.Etape);
        Assert.Equal("Honda CR-V", opportuniteApres.Titre); // titre automatique : il suit le nouveau modèle
        Assert.Equal(opportuniteAvant.ProchaineAction, opportuniteApres.ProchaineAction);
        Assert.Equal(opportuniteAvant.DateProchaineAction, opportuniteApres.DateProchaineAction);
        Assert.Equal(opportuniteAvant.DateCreation, opportuniteApres.DateCreation);
        Assert.Equal("Honda CR-V", opportuniteApres.Modele);
    }

    [Theory]
    [InlineData("c-antoine")]
    [InlineData("id-d-un-autre-utilisateur")]
    public async Task Le_conseiller_responsable_ne_peut_pas_etre_change(string conseillerId)
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var saisie = await SaisieActuelleAsync(id);
        saisie.ConseillerId = conseillerId;

        var resultat = await ModifierAsync(conseiller, saisie);

        Assert.Contains(resultat.Erreurs, e => e.Champ == "conseillerId");
        Assert.Equal(conseiller.Id, (await LireEnBaseAsync(id)).ConseillerId);
    }

    // 12
    [Fact]
    public async Task Une_panne_a_l_enregistrement_donne_un_echec_et_rien_ne_change()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var saisie = await SaisieActuelleAsync(id);
        saisie.Nom = "Panne";

        var resultat = await ModifierAsync(conseiller, saisie, new PanneEnregistrement());

        Assert.False(resultat.Succes);
        Assert.Contains("échoué", resultat.PremierMessage);
        Assert.Equal("Roy", (await LireEnBaseAsync(id)).Nom);
    }

    [Fact]
    public async Task Une_panne_a_la_lecture_donne_un_echec_et_pas_introuvable()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);

        var acces = await ConsulterAsync(conseiller, "pe-" + id, new PanneLectureProspects { EnPanne = true });

        Assert.False(acces.Succes);
        Assert.False(acces.Introuvable);
    }

    [Fact]
    public async Task Une_modification_faite_entre_temps_est_signalee_et_pas_ecrasee()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var premierOnglet = await SaisieActuelleAsync(id);
        var secondOnglet = await SaisieActuelleAsync(id);
        premierOnglet.Telephone = "438-555-0177";
        secondOnglet.Nom = "Royer";

        var premier = await ModifierAsync(conseiller, premierOnglet);
        var second = await ModifierAsync(conseiller, secondOnglet);

        Assert.True(premier.Succes, premier.PremierMessage);
        Assert.False(second.Succes);
        Assert.Contains("entre-temps", second.PremierMessage);
        var p = await LireEnBaseAsync(id);
        Assert.Equal("438-555-0177", p.Telephone);
        Assert.Equal("Roy", p.Nom);
    }
    // ---------- Titre de l'opportunité ----------

    [Fact]
    public async Task Un_titre_automatique_suit_le_nouveau_modele()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        Assert.Equal("Toyota RAV4", (await LireEnBaseAsync(id)).Opportunites.Single().Titre);
        var saisie = await SaisieActuelleAsync(id);
        saisie.Modele = "Honda CR-V";

        var resultat = await ModifierAsync(conseiller, saisie);

        Assert.True(resultat.Succes, resultat.PremierMessage);
        Assert.Equal("Honda CR-V", (await LireEnBaseAsync(id)).Opportunites.Single().Titre);
    }

    [Fact]
    public async Task Sans_modele_le_titre_automatique_reprend_le_type_puis_premier_interet()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var sansModele = await SaisieActuelleAsync(id);
        sansModele.Modele = null;

        Assert.True((await ModifierAsync(conseiller, sansModele)).Succes);
        Assert.Equal("VUS", (await LireEnBaseAsync(id)).Opportunites.Single().Titre);

        var sansRien = await SaisieActuelleAsync(id);
        sansRien.Modele = null;
        sansRien.Categorie = null;
        Assert.True((await ModifierAsync(conseiller, sansRien)).Succes);
        Assert.Equal("Premier intérêt", (await LireEnBaseAsync(id)).Opportunites.Single().Titre);
    }

    [Fact]
    public async Task Un_titre_personnalise_n_est_jamais_remplace()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        // Aucun écran ne permet encore de renommer une opportunité : on pose le titre directement en base.
        await using (var db = _base.NouveauContexte())
        {
            var o = await db.OpportunitesVente.SingleAsync(x => x.ProspectId == id);
            o.Titre = "Voiture familiale de Marc";
            await db.SaveChangesAsync();
        }
        var saisie = await SaisieActuelleAsync(id);
        saisie.Modele = "Honda CR-V";
        saisie.Categorie = "fourgonnette";

        var resultat = await ModifierAsync(conseiller, saisie);

        Assert.True(resultat.Succes, resultat.PremierMessage);
        var apres = (await LireEnBaseAsync(id)).Opportunites.Single();
        Assert.Equal("Voiture familiale de Marc", apres.Titre);
        Assert.Equal("Honda CR-V", apres.Modele);
    }

    // ---------- Conflits ----------

    [Fact]
    public async Task Apres_un_conflit_un_second_envoi_identique_est_encore_refuse()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var autreOnglet = await SaisieActuelleAsync(id);
        var monOnglet = await SaisieActuelleAsync(id);
        autreOnglet.Telephone = "438-555-0177";
        monOnglet.Nom = "Royer";
        Assert.True((await ModifierAsync(conseiller, autreOnglet)).Succes);

        var premierClic = await ModifierAsync(conseiller, monOnglet);
        var secondClic = await ModifierAsync(conseiller, monOnglet); // même saisie, même empreinte

        Assert.Contains("entre-temps", premierClic.PremierMessage);
        Assert.Contains("entre-temps", secondClic.PremierMessage);
        var p = await LireEnBaseAsync(id);
        Assert.Equal("438-555-0177", p.Telephone); // la modification de l'autre onglet est intacte
        Assert.Equal("Roy", p.Nom);
    }

    [Fact]
    public async Task Apres_rechargement_volontaire_la_modification_passe_et_garde_celle_de_l_autre()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);
        var autreOnglet = await SaisieActuelleAsync(id);
        var monOnglet = await SaisieActuelleAsync(id);
        autreOnglet.Telephone = "438-555-0177";
        monOnglet.Nom = "Royer";
        Assert.True((await ModifierAsync(conseiller, autreOnglet)).Succes);
        Assert.False((await ModifierAsync(conseiller, monOnglet)).Succes);

        // Rechargement : le formulaire repart des valeurs actuelles, puis l'utilisateur refait son changement.
        var recharge = await SaisieActuelleAsync(id);
        recharge.Nom = "Royer";
        var resultat = await ModifierAsync(conseiller, recharge);

        Assert.True(resultat.Succes, resultat.PremierMessage);
        var p = await LireEnBaseAsync(id);
        Assert.Equal("Royer", p.Nom);
        Assert.Equal("438-555-0177", p.Telephone);
    }

    [Fact]
    public async Task Deux_enregistrements_simultanes_avec_la_meme_empreinte_un_seul_passe()
    {
        var conseiller = await _base.CreerConseillerAsync();
        int id = await CreerProspectAsync(conseiller);

        for (int essai = 0; essai < 5; essai++)
        {
            var premier = await SaisieActuelleAsync(id);
            var second = await SaisieActuelleAsync(id);
            premier.Telephone = "438-555-01" + essai.ToString("00");
            second.Telephone = "819-555-01" + essai.ToString("00");

            var resultats = await Task.WhenAll(ModifierAsync(conseiller, premier), ModifierAsync(conseiller, second));

            Assert.Equal(1, resultats.Count(r => r.Succes));
            Assert.Contains("entre-temps", resultats.Single(r => !r.Succes).PremierMessage);
        }
    }
}
