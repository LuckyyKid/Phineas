using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Phineas.Data;
using Phineas.Models.Entities;
using Phineas.Models.ViewModels.Account;
using Phineas.Models.ViewModels.Conseiller;
using Phineas.Services.Commun;

namespace Phineas.Services.Conseiller;

public interface IServiceProspects
{
    // Données du module Prospects : prospects fictifs de démonstration + prospects enregistrés du conseiller.
    Task<DonneesProspects> ObtenirAsync(UserSummaryViewModel conseiller);

    // Valide la saisie du tiroir « Nouveau prospect » et enregistre le prospect et son opportunité.
    // Retourne l'identifiant du prospect créé, ou les erreurs (Champ = name du champ du formulaire).
    Task<ResultatService<int>> CreerAsync(string utilisateurId, NouveauProspectSaisie saisie);
}

// Prospects réels du conseiller (table Prospects et OpportunitesVente), ajoutés aux données fictives.
// Appelé par ProspectsController (création) et par tous les contrôleurs vendeur qui lisent les prospects.
// Les ids envoyés au navigateur sont préfixés (« pe- », « oe- », « ie- ») pour ne jamais croiser ceux de la démo.
public class ServiceProspects : IServiceProspects
{
    public const string PrefixeProspect = "pe-";
    public const string PrefixeOpportunite = "oe-";
    public const string PrefixeInteraction = "ie-";

    // Mêmes limites que les attributs maxlength du formulaire (_TiroirProspect.cshtml).
    private const int LongueurNom = 60;
    private const int LongueurCourriel = 120;
    private const int LongueurTelephone = 20;
    private const int LongueurPrecision = 120;
    private const int LongueurModele = 80;
    private const int LongueurCommentaire = 500;
    private const int LongueurProchaineAction = 120;
    private const decimal BudgetMaximum = 500_000m;

    // Le prochain suivi est placé à 9 h, comme dans prospects-store.js (depuisChampDate).
    private const int HeureDuSuivi = 9;

    // Statuts proposés à la création (liste « Statut initial » du formulaire).
    private static readonly EtapeVente[] EtapesInitiales =
    [
        EtapeVente.Nouveau,
        EtapeVente.AQualifier,
        EtapeVente.Qualifie,
    ];

    // Même règle que la validation du tiroir (prospects-tiroir.js).
    private static readonly Regex FormatCourriel = new(@"^[^\s@]+@[^\s@]+\.[^\s@]+$");

    private readonly ApplicationDbContext _db;
    private readonly ServiceProspectsDemo _demo;

    public ServiceProspects(ApplicationDbContext db, ServiceProspectsDemo demo)
    {
        _db = db;
        _demo = demo;
    }

    // ---------- Lecture ----------

    public async Task<DonneesProspects> ObtenirAsync(UserSummaryViewModel conseiller)
    {
        var demo = await _demo.ObtenirAsync(conseiller);

        // Seulement les prospects du conseiller, dans sa concession actuelle (isolation entre concessions).
        var enregistres = await _db
            .Prospects.AsNoTracking()
            .Include(p => p.Opportunites)
            .Where(p => p.ConseillerId == conseiller.Id && p.DealershipId == p.Conseiller!.DealershipId)
            .OrderBy(p => p.Id)
            .ToListAsync();

        var contacts = new List<ContactProspect>(demo.Contacts);
        var opportunites = new List<Opportunite>(demo.Opportunites);
        var interactions = new List<InteractionProspect>(demo.Interactions);

        foreach (var prospect in enregistres)
        {
            contacts.Add(VersContact(prospect));
            foreach (var opportunite in prospect.Opportunites)
                opportunites.Add(VersOpportunite(opportunite));
            interactions.AddRange(VersInteractions(prospect, conseiller.FullName));
        }

        return new DonneesProspects(demo.ConseillerConnecteId, demo.Conseillers, contacts, opportunites, interactions);
    }

    private static ContactProspect VersContact(Prospect p) =>
        new(
            PrefixeProspect + p.Id,
            p.Prenom,
            p.Nom,
            p.Courriel,
            p.Telephone,
            p.ContactPrefere,
            null,
            p.Source,
            p.SourceDetail,
            ServiceProspectsDemo.IdConseillerConnecte,
            HeureLocale(p.DateCreation),
            Enregistre: true
        );

    private static Opportunite VersOpportunite(OpportuniteVente o)
    {
        var qualification = new QualificationOpportunite
        {
            Categorie = o.Categorie,
            Modeles = o.Modele is null ? [] : [o.Modele],
            BudgetTotal = o.BudgetTotal,
            Horizon = o.Horizon,
        };

        return new Opportunite(
            PrefixeOpportunite + o.Id,
            PrefixeProspect + o.ProspectId,
            o.Titre,
            o.Etape,
            HeureLocale(o.DateCreation),
            HeureLocale(o.DerniereActivite),
            o.ProchaineAction,
            o.DateProchaineAction,
            [],
            qualification
        );
    }

    // Historique affiché sur la fiche : la création, puis le commentaire initial s'il y en a un.
    private static List<InteractionProspect> VersInteractions(Prospect p, string auteur)
    {
        var contactId = PrefixeProspect + p.Id;
        var premiere = p.Opportunites.OrderBy(o => o.Id).FirstOrDefault();
        string? opportuniteId = premiere is null ? null : PrefixeOpportunite + premiere.Id;
        var date = HeureLocale(p.DateCreation);

        var provenance = Libelle(ReferentielsVente.Sources, p.Source) ?? p.Source;
        if (p.SourceDetail is not null)
            provenance += " (" + p.SourceDetail + ")";

        var liste = new List<InteractionProspect>
        {
            new(PrefixeInteraction + p.Id + "-creation", contactId, opportuniteId, date, "creation", auteur,
                "Prospect créé manuellement. Provenance : " + provenance + "."),
        };
        if (p.CommentaireInitial is not null)
            liste.Add(new(PrefixeInteraction + p.Id + "-note", contactId, opportuniteId, date, "note", auteur, p.CommentaireInitial));
        return liste;
    }

    // Les dates sont stockées en UTC ; la démo et le JavaScript travaillent en heure locale.
    private static DateTime HeureLocale(DateTime utc) =>
        DateTime.SpecifyKind(utc, DateTimeKind.Utc).ToLocalTime();

    // ---------- Création ----------

    public async Task<ResultatService<int>> CreerAsync(string utilisateurId, NouveauProspectSaisie saisie)
    {
        // La concession vient du compte en base, jamais du formulaire.
        var conseiller = await _db.Users.Include(u => u.Dealership).FirstOrDefaultAsync(u => u.Id == utilisateurId);
        bool compteUtilisable = conseiller is not null
            && conseiller.IsActive
            && conseiller.Dealership is not null
            && conseiller.Dealership.IsActive;
        if (!compteUtilisable)
            return ResultatService<int>.Echec(
                "Votre compte n'est rattaché à aucune concession active : le prospect ne peut pas être enregistré."
            );

        var valeurs = Nettoyer(saisie);
        var resultat = Valider(valeurs, utilisateurId);
        if (!resultat.Succes)
            return resultat;

        int concessionId = conseiller!.DealershipId!.Value;
        var doublon = await ChercherDoublonAsync(concessionId, valeurs);
        if (doublon is not null)
            return doublon;

        var prospect = CreerEntites(valeurs, utilisateurId, concessionId);
        _db.Prospects.Add(prospect);
        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // Rien n'a été enregistré : jamais de message de succès dans ce cas.
            _db.ChangeTracker.Clear();
            return ResultatService<int>.Echec(
                "L'enregistrement a échoué : le prospect n'a pas été créé. Réessayez dans un instant."
            );
        }

        return ResultatService<int>.Ok(prospect.Id);
    }

    // Copie de la saisie avec les espaces retirés et les champs vides remplacés par null.
    private static NouveauProspectSaisie Nettoyer(NouveauProspectSaisie s) =>
        new()
        {
            Prenom = Texte(s.Prenom),
            Nom = Texte(s.Nom),
            Courriel = Texte(s.Courriel)?.ToLowerInvariant(),
            Telephone = Texte(s.Telephone),
            ContactPrefere = Texte(s.ContactPrefere),
            Source = Texte(s.Source),
            SourceDetail = Texte(s.SourceDetail),
            Categorie = Texte(s.Categorie),
            Modele = Texte(s.Modele),
            Budget = s.Budget,
            Horizon = Texte(s.Horizon),
            Commentaire = Texte(s.Commentaire),
            ConseillerId = Texte(s.ConseillerId),
            Etape = Texte(s.Etape),
            ProchaineAction = Texte(s.ProchaineAction),
            DateSuivi = s.DateSuivi,
        };

    private static string? Texte(string? valeur) =>
        string.IsNullOrWhiteSpace(valeur) ? null : valeur.Trim();

    // Mêmes règles que le tiroir (prospects-tiroir.js), vérifiées ici sans dépendre du JavaScript.
    private static ResultatService<int> Valider(NouveauProspectSaisie s, string utilisateurId)
    {
        var resultat = new ResultatService<int>();
        void Erreur(string champ, string message) => resultat.Erreurs.Add(new ErreurChamp(champ, message));

        // Contact
        if (s.Prenom is null)
            Erreur("prenom", "Indiquez le prénom.");
        else if (s.Prenom.Length > LongueurNom)
            Erreur("prenom", $"Le prénom ne doit pas dépasser {LongueurNom} caractères.");

        if (s.Nom is null)
            Erreur("nom", "Indiquez le nom.");
        else if (s.Nom.Length > LongueurNom)
            Erreur("nom", $"Le nom ne doit pas dépasser {LongueurNom} caractères.");

        bool courrielValide = s.Courriel is not null && s.Courriel.Length <= LongueurCourriel && FormatCourriel.IsMatch(s.Courriel);
        if (s.Courriel is not null && !courrielValide)
            Erreur("courriel", "Adresse courriel invalide (ex. : nom@domaine.ca).");

        bool telephoneValide = s.Telephone is not null && s.Telephone.Length <= LongueurTelephone && TelephoneEnChiffres(s.Telephone) is not null;
        if (s.Telephone is not null && !telephoneValide)
            Erreur("telephone", "Numéro invalide : 10 chiffres attendus.");

        if (!EstDansListe(ReferentielsVente.MoyensContact, s.ContactPrefere))
            Erreur("contactPrefere", "Choisissez le moyen de contact préféré.");

        if (s.Courriel is null && s.Telephone is null)
        {
            Erreur("courriel", "Indiquez un courriel ou un téléphone.");
            Erreur("telephone", "Indiquez un courriel ou un téléphone.");
        }
        else if (s.ContactPrefere == "courriel" && s.Courriel is null)
            Erreur("courriel", "Requis : le courriel est le moyen de contact préféré.");
        else if ((s.ContactPrefere == "telephone" || s.ContactPrefere == "texto") && s.Telephone is null)
            Erreur("telephone", "Requis : le téléphone est le moyen de contact préféré.");

        // Provenance
        if (!EstDansListe(ReferentielsVente.Sources, s.Source))
            Erreur("source", "Choisissez la provenance.");
        if (s.SourceDetail is not null && s.SourceDetail.Length > LongueurPrecision)
            Erreur("sourceDetail", $"La précision ne doit pas dépasser {LongueurPrecision} caractères.");

        // Premier intérêt (tous facultatifs)
        if (s.Categorie is not null && !EstDansListe(ReferentielsVente.Categories, s.Categorie))
            Erreur("categorie", "Type de véhicule inconnu.");
        if (s.Modele is not null && s.Modele.Length > LongueurModele)
            Erreur("modele", $"Le modèle ne doit pas dépasser {LongueurModele} caractères.");
        if (s.Budget is not null && (s.Budget < 0 || s.Budget > BudgetMaximum))
            Erreur("budget", "Montant entre 0 et 500 000 $.");
        if (s.Horizon is not null && !EstDansListe(ReferentielsVente.Horizons, s.Horizon))
            Erreur("horizon", "Horizon d'achat inconnu.");
        if (s.Commentaire is not null && s.Commentaire.Length > LongueurCommentaire)
            Erreur("commentaire", $"Le commentaire ne doit pas dépasser {LongueurCommentaire} caractères.");

        // Attribution : le seul conseiller réel proposé par le formulaire est le conseiller connecté.
        bool conseillerAutorise = s.ConseillerId == ServiceProspectsDemo.IdConseillerConnecte || s.ConseillerId == utilisateurId;
        if (!conseillerAutorise)
            Erreur("conseillerId", "Un prospect enregistré ne peut être attribué qu'à vous : les conseillers fictifs de la démonstration ne peuvent pas le recevoir.");

        if (LireEtape(s.Etape) is null)
            Erreur("etape", "Choisissez le statut initial.");
        if (s.ProchaineAction is not null && s.ProchaineAction.Length > LongueurProchaineAction)
            Erreur("prochaineAction", $"La prochaine action ne doit pas dépasser {LongueurProchaineAction} caractères.");
        if (s.DateSuivi is not null && s.DateSuivi.Value.Date < DateTime.Today)
            Erreur("dateSuivi", "La date ne peut pas être passée.");

        return resultat;
    }

    // 514-555-0100, (514) 555-0100 ou 1 514 555 0100 donnent « 5145550100 » ; sinon null.
    public static string? TelephoneEnChiffres(string? telephone)
    {
        if (telephone is null)
            return null;
        string chiffres = new string(telephone.Where(char.IsDigit).ToArray());
        if (chiffres.Length == 11 && chiffres[0] == '1')
            chiffres = chiffres.Substring(1);
        return chiffres.Length == 10 ? chiffres : null;
    }

    private static EtapeVente? LireEtape(string? valeur)
    {
        foreach (var etape in EtapesInitiales)
        {
            if (etape.ToString() == valeur)
                return etape;
        }
        return null;
    }

    private static bool EstDansListe(IReadOnlyList<(string Cle, string Libelle)> liste, string? cle) =>
        cle is not null && liste.Any(x => x.Cle == cle);

    private static string? Libelle(IReadOnlyList<(string Cle, string Libelle)> liste, string? cle) =>
        liste.FirstOrDefault(x => x.Cle == cle).Libelle;

    // Doublon = même courriel ou même téléphone dans la concession. Le nom seul ne suffit jamais :
    // deux personnes peuvent s'appeler pareil. On refuse la création, sans rien fusionner.
    private async Task<ResultatService<int>?> ChercherDoublonAsync(int concessionId, NouveauProspectSaisie s)
    {
        var resultat = new ResultatService<int>();

        if (s.Courriel is not null)
        {
            var existant = await _db.Prospects.AsNoTracking()
                .FirstOrDefaultAsync(p => p.DealershipId == concessionId && p.Courriel == s.Courriel);
            if (existant is not null)
                resultat.Erreurs.Add(new ErreurChamp("courriel",
                    $"Ce courriel appartient déjà à {existant.Prenom} {existant.Nom}, un prospect de votre concession."));
        }

        string? chiffres = TelephoneEnChiffres(s.Telephone);
        if (chiffres is not null)
        {
            var existant = await _db.Prospects.AsNoTracking()
                .FirstOrDefaultAsync(p => p.DealershipId == concessionId && p.TelephoneChiffres == chiffres);
            if (existant is not null)
                resultat.Erreurs.Add(new ErreurChamp("telephone",
                    $"Ce téléphone appartient déjà à {existant.Prenom} {existant.Nom}, un prospect de votre concession."));
        }

        return resultat.Succes ? null : resultat;
    }

    // Le prospect et son unique opportunité, enregistrés ensemble par le même SaveChanges.
    private static Prospect CreerEntites(NouveauProspectSaisie s, string conseillerId, int concessionId)
    {
        var maintenant = DateTime.UtcNow;

        string titre = s.Modele ?? Libelle(ReferentielsVente.Categories, s.Categorie) ?? "Premier intérêt";

        // Comme le JavaScript : une date de suivi sans action devient « Premier contact ».
        string? prochaineAction = s.ProchaineAction;
        if (prochaineAction is null && s.DateSuivi is not null)
            prochaineAction = "Premier contact";

        DateTime? dateSuivi = null;
        if (s.DateSuivi is not null)
            dateSuivi = s.DateSuivi.Value.Date.AddHours(HeureDuSuivi);

        var opportunite = new OpportuniteVente
        {
            Titre = titre,
            Etape = LireEtape(s.Etape)!.Value,
            Categorie = s.Categorie,
            Modele = s.Modele,
            BudgetTotal = s.Budget,
            Horizon = s.Horizon,
            ProchaineAction = prochaineAction,
            DateProchaineAction = dateSuivi,
            DateCreation = maintenant,
            DerniereActivite = maintenant,
        };

        return new Prospect
        {
            DealershipId = concessionId,
            ConseillerId = conseillerId,
            Prenom = s.Prenom!,
            Nom = s.Nom!,
            Courriel = s.Courriel,
            Telephone = s.Telephone,
            TelephoneChiffres = TelephoneEnChiffres(s.Telephone),
            ContactPrefere = s.ContactPrefere!,
            Source = s.Source!,
            SourceDetail = s.SourceDetail,
            CommentaireInitial = s.Commentaire,
            DateCreation = maintenant,
            Opportunites = { opportunite },
        };
    }
}
