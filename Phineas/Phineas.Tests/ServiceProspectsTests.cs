using Microsoft.EntityFrameworkCore;
using Phineas.Models.Entities;
using Phineas.Models.ViewModels.Account;
using Phineas.Models.ViewModels.Conseiller;
using Phineas.Services.Conseiller;
using Phineas.Tests.Infrastructure;

namespace Phineas.Tests;

// Création réelle d'un prospect (ServiceProspects.CreerAsync), vérifiée en relisant par ObtenirAsync,
// comme le fait la page Prospects. Chaque test crée sa propre concession : les tests ne se gênent pas.
public class ServiceProspectsTests : IClassFixture<BaseMySqlDeTest>
{
    private readonly BaseMySqlDeTest _base;

    public ServiceProspectsTests(BaseMySqlDeTest baseDeTest)
    {
        _base = baseDeTest;
    }

    private static NouveauProspectSaisie SaisieValide() =>
        new()
        {
            Prenom = "Julie",
            Nom = "Lemieux",
            Courriel = "julie.lemieux@exemple.test",
            Telephone = "514-555-0101",
            ContactPrefere = "courriel",
            Source = "site-web",
            ConseillerId = ServiceProspectsDemo.IdConseillerConnecte,
            Etape = "Nouveau",
        };

    private async Task<Phineas.Services.Commun.ResultatService<int>> CreerAsync(ApplicationUser conseiller, NouveauProspectSaisie saisie)
    {
        await using var db = _base.NouveauContexte();
        var service = new ServiceProspects(db, new ServiceProspectsDemo());
        return await service.CreerAsync(conseiller.Id, saisie);
    }

    // Prospects enregistrés visibles par ce conseiller (sans les données fictives).
    private async Task<(List<ContactProspect> Contacts, DonneesProspects Donnees)> LireAsync(ApplicationUser conseiller)
    {
        await using var db = _base.NouveauContexte();
        var service = new ServiceProspects(db, new ServiceProspectsDemo());
        var resume = new UserSummaryViewModel { Id = conseiller.Id, FullName = conseiller.FullName };
        var donnees = await service.ObtenirAsync(resume);
        var contacts = donnees.Contacts.Where(c => c.Enregistre).ToList();
        return (contacts, donnees);
    }

    private async Task<int> CompterProspectsAsync(ApplicationUser conseiller)
    {
        await using var db = _base.NouveauContexte();
        return await db.Prospects.CountAsync(p => p.ConseillerId == conseiller.Id);
    }

    // 1
    [Fact]
    public async Task Une_saisie_valide_est_enregistree_et_relue()
    {
        var conseiller = await _base.CreerConseillerAsync();

        var resultat = await CreerAsync(conseiller, SaisieValide());

        Assert.True(resultat.Succes, resultat.PremierMessage);
        var (contacts, _) = await LireAsync(conseiller);
        var contact = Assert.Single(contacts);
        Assert.Equal("pe-" + resultat.Valeur, contact.Id);
        Assert.Equal("Julie", contact.Prenom);
        Assert.Equal("Lemieux", contact.Nom);
        Assert.Equal("julie.lemieux@exemple.test", contact.Courriel);
        Assert.Equal("514-555-0101", contact.Telephone);
        Assert.Equal("courriel", contact.ContactPrefere);
        Assert.Equal("site-web", contact.Source);
    }

    // 2
    [Fact]
    public async Task Un_formulaire_incomplet_est_refuse_sans_rien_enregistrer()
    {
        var conseiller = await _base.CreerConseillerAsync();
        var saisie = new NouveauProspectSaisie { Prenom = "  ", ConseillerId = "moi", Etape = "Nouveau" };

        var resultat = await CreerAsync(conseiller, saisie);

        Assert.False(resultat.Succes);
        var champs = resultat.Erreurs.Select(e => e.Champ).ToList();
        Assert.Contains("prenom", champs);
        Assert.Contains("nom", champs);
        Assert.Contains("source", champs);
        Assert.Contains("contactPrefere", champs);
        Assert.Contains("courriel", champs);
        Assert.Contains("telephone", champs);
        Assert.Equal(0, await CompterProspectsAsync(conseiller));
    }

    // 3
    [Theory]
    [InlineData("courriel", "julie.lemieux@", null)]
    [InlineData("courriel", "julie lemieux@exemple.test", null)]
    [InlineData("telephone", null, "514-555-01")]
    [InlineData("telephone", null, "2-514-555-0101")]
    public async Task Une_coordonnee_mal_formee_est_refusee(string champAttendu, string? courriel, string? telephone)
    {
        var conseiller = await _base.CreerConseillerAsync();
        var saisie = SaisieValide();
        saisie.Courriel = courriel ?? saisie.Courriel;
        saisie.Telephone = telephone ?? saisie.Telephone;

        var resultat = await CreerAsync(conseiller, saisie);

        Assert.False(resultat.Succes);
        Assert.Contains(resultat.Erreurs, e => e.Champ == champAttendu);
        Assert.Equal(0, await CompterProspectsAsync(conseiller));
    }

    [Fact]
    public async Task Le_moyen_prefere_doit_etre_renseigne()
    {
        var conseiller = await _base.CreerConseillerAsync();
        var saisie = SaisieValide();
        saisie.Courriel = null;
        saisie.ContactPrefere = "courriel";

        var resultat = await CreerAsync(conseiller, saisie);

        var erreur = Assert.Single(resultat.Erreurs);
        Assert.Equal("courriel", erreur.Champ);
    }

    // 4
    [Fact]
    public async Task Un_doublon_de_courriel_ou_de_telephone_est_refuse_sans_fusion()
    {
        var conseiller = await _base.CreerConseillerAsync();
        Assert.True((await CreerAsync(conseiller, SaisieValide())).Succes);

        var memeCourriel = SaisieValide();
        memeCourriel.Prenom = "Autre";
        memeCourriel.Courriel = "  JULIE.Lemieux@exemple.test ";
        memeCourriel.Telephone = "438-555-0199";
        var refusCourriel = await CreerAsync(conseiller, memeCourriel);

        var memeTelephone = SaisieValide();
        memeTelephone.Courriel = "autre@exemple.test";
        memeTelephone.Telephone = "1 (514) 555-0101";
        var refusTelephone = await CreerAsync(conseiller, memeTelephone);

        Assert.Contains(refusCourriel.Erreurs, e => e.Champ == "courriel" && e.Message.Contains("Julie Lemieux"));
        Assert.Contains(refusTelephone.Erreurs, e => e.Champ == "telephone");
        var (contacts, _) = await LireAsync(conseiller);
        var seul = Assert.Single(contacts);
        Assert.Equal("Julie", seul.Prenom);
        Assert.Equal("514-555-0101", seul.Telephone);
    }

    // 5
    [Fact]
    public async Task Deux_personnes_du_meme_nom_avec_des_coordonnees_differentes_sont_deux_prospects()
    {
        var conseiller = await _base.CreerConseillerAsync();
        var homonyme = SaisieValide();
        homonyme.Courriel = "julie.lemieux2@exemple.test";
        homonyme.Telephone = "450-555-0123";

        Assert.True((await CreerAsync(conseiller, SaisieValide())).Succes);
        Assert.True((await CreerAsync(conseiller, homonyme)).Succes);

        var (contacts, _) = await LireAsync(conseiller);
        Assert.Equal(2, contacts.Count(c => c.Prenom == "Julie" && c.Nom == "Lemieux"));
        Assert.Equal(2, contacts.Select(c => c.Id).Distinct().Count());
    }

    // 6
    [Fact]
    public async Task Le_prospect_appartient_a_la_concession_du_compte_et_reste_isole()
    {
        var conseillerA = await _base.CreerConseillerAsync();
        var conseillerB = await _base.CreerConseillerAsync();

        var creeParA = await CreerAsync(conseillerA, SaisieValide());
        // Même courriel dans une autre concession : ce n'est pas un doublon.
        var creeParB = await CreerAsync(conseillerB, SaisieValide());

        Assert.True(creeParA.Succes, creeParA.PremierMessage);
        Assert.True(creeParB.Succes, creeParB.PremierMessage);
        await using (var db = _base.NouveauContexte())
        {
            var prospectA = await db.Prospects.SingleAsync(p => p.Id == creeParA.Valeur);
            Assert.Equal(conseillerA.DealershipId, prospectA.DealershipId);
        }
        var (contactsDeB, _) = await LireAsync(conseillerB);
        Assert.DoesNotContain(contactsDeB, c => c.Id == "pe-" + creeParA.Valeur);
        Assert.Single(contactsDeB);
    }

    [Theory]
    [InlineData(false, true)]
    [InlineData(true, false)]
    public async Task Un_compte_sans_concession_active_ne_peut_pas_creer(bool avecConcession, bool concessionActive)
    {
        var conseiller = await _base.CreerConseillerAsync(concessionActive: concessionActive, avecConcession: avecConcession);

        var resultat = await CreerAsync(conseiller, SaisieValide());

        Assert.False(resultat.Succes);
        Assert.Equal(0, await CompterProspectsAsync(conseiller));
    }

    // 7
    [Fact]
    public async Task Le_prospect_est_attribue_au_conseiller_connecte()
    {
        var conseiller = await _base.CreerConseillerAsync();

        var resultat = await CreerAsync(conseiller, SaisieValide());

        await using var db = _base.NouveauContexte();
        var prospect = await db.Prospects.SingleAsync(p => p.Id == resultat.Valeur);
        Assert.Equal(conseiller.Id, prospect.ConseillerId);
        var (contacts, donnees) = await LireAsync(conseiller);
        Assert.Equal(donnees.ConseillerConnecteId, Assert.Single(contacts).ConseillerId);
    }

    [Theory]
    [InlineData("c-antoine")]
    [InlineData("id-d-un-autre-utilisateur")]
    [InlineData(null)]
    public async Task Un_autre_conseiller_ne_peut_pas_recevoir_le_prospect(string? conseillerId)
    {
        var conseiller = await _base.CreerConseillerAsync();
        var saisie = SaisieValide();
        saisie.ConseillerId = conseillerId;

        var resultat = await CreerAsync(conseiller, saisie);

        Assert.Contains(resultat.Erreurs, e => e.Champ == "conseillerId");
        Assert.Equal(0, await CompterProspectsAsync(conseiller));
    }

    // 8
    [Fact]
    public async Task Les_champs_facultatifs_sont_conserves()
    {
        var conseiller = await _base.CreerConseillerAsync();
        var dateSuivi = DateTime.Today.AddDays(3);
        var saisie = SaisieValide();
        saisie.SourceDetail = "Campagne d'automne";
        saisie.Categorie = "vus";
        saisie.Modele = "Toyota RAV4";
        saisie.Budget = 32500;
        saisie.Horizon = "30j";
        saisie.Commentaire = "Souhaite un essai le samedi.";
        saisie.ProchaineAction = "Rappeler";
        saisie.DateSuivi = dateSuivi;

        var resultat = await CreerAsync(conseiller, saisie);

        Assert.True(resultat.Succes, resultat.PremierMessage);
        var (contacts, donnees) = await LireAsync(conseiller);
        var contact = Assert.Single(contacts);
        Assert.Equal("Campagne d'automne", contact.SourceDetail);
        var opportunite = Assert.Single(donnees.Opportunites, o => o.ProspectId == contact.Id);
        Assert.Equal("vus", opportunite.Qualification.Categorie);
        Assert.Equal(["Toyota RAV4"], opportunite.Qualification.Modeles);
        Assert.Equal(32500m, opportunite.Qualification.BudgetTotal);
        Assert.Equal("30j", opportunite.Qualification.Horizon);
        Assert.Equal("Rappeler", opportunite.ProchaineAction);
        Assert.Equal(dateSuivi.AddHours(9), opportunite.DateProchaineAction);
        Assert.Contains(donnees.Interactions, i => i.ProspectId == contact.Id && i.Type == "note" && i.Resume == "Souhaite un essai le samedi.");
    }

    [Fact]
    public async Task Une_date_de_suivi_passee_ou_un_budget_hors_limite_est_refuse()
    {
        var conseiller = await _base.CreerConseillerAsync();
        var saisie = SaisieValide();
        // Règle unique des dates civiles (fonctionnalité 05) : la veille du serveur est tolérée, l'avant-veille est refusée.
        saisie.DateSuivi = DateTime.Today.AddDays(-2);
        saisie.Budget = 600000;

        var resultat = await CreerAsync(conseiller, saisie);

        Assert.Contains(resultat.Erreurs, e => e.Champ == "dateSuivi");
        Assert.Contains(resultat.Erreurs, e => e.Champ == "budget");
    }

    // 9
    [Fact]
    public async Task Une_panne_de_la_base_donne_un_echec_et_aucun_prospect()
    {
        var conseiller = await _base.CreerConseillerAsync();
        await using var db = _base.NouveauContexte(new PanneEnregistrement());
        var service = new ServiceProspects(db, new ServiceProspectsDemo());

        var resultat = await service.CreerAsync(conseiller.Id, SaisieValide());

        Assert.False(resultat.Succes);
        Assert.Contains("échoué", resultat.PremierMessage);
        Assert.Equal(0, await CompterProspectsAsync(conseiller));
    }

    // 10
    [Fact]
    public async Task Une_seule_opportunite_est_creee_et_liee_au_prospect()
    {
        var conseiller = await _base.CreerConseillerAsync();
        var saisie = SaisieValide();
        saisie.Categorie = "vus";
        saisie.Etape = "AQualifier";
        saisie.DateSuivi = DateTime.Today.AddDays(1);

        var resultat = await CreerAsync(conseiller, saisie);

        var (contacts, donnees) = await LireAsync(conseiller);
        var contact = Assert.Single(contacts);
        var opportunite = Assert.Single(donnees.Opportunites, o => o.ProspectId == contact.Id);
        Assert.Equal(EtapeVente.AQualifier, opportunite.Etape);
        Assert.Equal("VUS", opportunite.Titre);
        Assert.Equal("Premier contact", opportunite.ProchaineAction);
        Assert.Contains(donnees.Interactions, i => i.ProspectId == contact.Id && i.Type == "creation" && i.OpportuniteId == opportunite.Id);
        await using var db = _base.NouveauContexte();
        Assert.Equal(1, await db.OpportunitesVente.CountAsync(o => o.ProspectId == resultat.Valeur));
    }

    [Fact]
    public async Task Un_statut_initial_hors_liste_est_refuse()
    {
        var conseiller = await _base.CreerConseillerAsync();
        var saisie = SaisieValide();
        saisie.Etape = "Gagne";

        var resultat = await CreerAsync(conseiller, saisie);

        Assert.Contains(resultat.Erreurs, e => e.Champ == "etape");
    }
}
