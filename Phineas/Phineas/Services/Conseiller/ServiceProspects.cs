using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
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

    // Vérifie qu'un prospect enregistré (id « pe-12 ») est consultable par ce conseiller.
    // NonTrouve : id invalide, inexistant ou hors de son dossier (même réponse, rien n'est révélé).
    // Échec : la base n'a pas pu être lue.
    Task<ResultatService> ConsulterAsync(string utilisateurId, string? prospectId);

    // Modifie le contact d'un prospect enregistré et, si OpportuniteId est fourni, le premier intérêt de cette opportunité.
    Task<ResultatService> ModifierAsync(string utilisateurId, ModificationProspectSaisie saisie);
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
            Enregistre: true,
            Version: Empreinte(p)
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
        var conseiller = await CompteUtilisableAsync(utilisateurId);
        if (conseiller is null)
            return ResultatService<int>.Echec(MessageCompteInutilisable);

        var valeurs = Nettoyer(saisie);
        var resultat = new ResultatService<int>();
        ValiderContact(valeurs, resultat);
        ValiderInteret(valeurs, resultat);
        ValiderAttribution(valeurs, utilisateurId, resultat);
        ValiderChampsDeCreation(valeurs, resultat);
        if (!resultat.Succes)
            return resultat;

        int concessionId = conseiller.DealershipId!.Value;
        await ChercherDoublonAsync(concessionId, valeurs, null, resultat);
        if (!resultat.Succes)
            return resultat;

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

    private const string MessageCompteInutilisable =
        "Votre compte n'est rattaché à aucune concession active : le prospect ne peut pas être enregistré.";

    // Le conseiller, s'il est actif et rattaché à une concession active ; sinon null.
    private async Task<ApplicationUser?> CompteUtilisableAsync(string utilisateurId)
    {
        var conseiller = await _db.Users.Include(u => u.Dealership).FirstOrDefaultAsync(u => u.Id == utilisateurId);
        bool compteUtilisable = conseiller is not null
            && conseiller.IsActive
            && conseiller.Dealership is not null
            && conseiller.Dealership.IsActive;
        return compteUtilisable ? conseiller : null;
    }

    // ---------- Consultation et modification ----------

    public async Task<ResultatService> ConsulterAsync(string utilisateurId, string? prospectId)
    {
        int? id = LireId(prospectId, PrefixeProspect);
        if (id is null)
            return ResultatService.NonTrouve();

        try
        {
            var prospect = await TrouverDansSonDossierAsync(utilisateurId, id.Value, suivre: false);
            return prospect is null ? ResultatService.NonTrouve() : ResultatService.Ok();
        }
        catch (DbException)
        {
            return ResultatService.Echec("Le dossier n'a pas pu être lu. Réessayez dans un instant.");
        }
    }

    public async Task<ResultatService> ModifierAsync(string utilisateurId, ModificationProspectSaisie saisie)
    {
        // 1. Le prospect et l'opportunité visés doivent être dans le dossier du conseiller.
        int? id = LireId(saisie.ProspectId, PrefixeProspect);
        if (id is null)
            return ResultatService.NonTrouve();

        var conseiller = await CompteUtilisableAsync(utilisateurId);
        if (conseiller is null)
            return ResultatService.Echec(MessageCompteInutilisable);

        // Transaction + verrou de la ligne du prospect (SELECT … FOR UPDATE) : deux enregistrements simultanés
        // du même prospect passent l'un après l'autre. Le second relit donc les valeurs du premier, et son
        // empreinte ne correspond plus : il est refusé. Sans ce verrou, les deux pourraient passer la vérification.
        // Si la méthode se termine sans CommitAsync, la transaction est annulée (rien n'est écrit).
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted);
        await _db.Database.ExecuteSqlInterpolatedAsync($"SELECT Id FROM Prospects WHERE Id = {id.Value} FOR UPDATE");

        var prospect = await TrouverDansSonDossierAsync(utilisateurId, id.Value, suivre: true);
        if (prospect is null)
            return ResultatService.NonTrouve();

        OpportuniteVente? opportunite = null;
        if (saisie.OpportuniteId is not null)
        {
            int? opportuniteId = LireId(saisie.OpportuniteId, PrefixeOpportunite);
            opportunite = prospect.Opportunites.FirstOrDefault(o => o.Id == opportuniteId);
            if (opportunite is null)
                return ResultatService.NonTrouve();
        }

        // 2. Refus si le dossier a changé depuis l'ouverture du formulaire (autre onglet, autre poste).
        if (saisie.Version != Empreinte(prospect))
            return ResultatService.Echec(MessageConflit);

        // 3. Mêmes règles qu'à la création, et doublons cherchés parmi les autres prospects seulement.
        var valeurs = Nettoyer(saisie);
        var resultat = new ResultatService();
        ValiderContact(valeurs, resultat);
        ValiderAttribution(valeurs, utilisateurId, resultat);
        if (opportunite is not null)
            ValiderInteret(valeurs, resultat);
        if (!resultat.Succes)
            return resultat;

        await ChercherDoublonAsync(prospect.DealershipId, valeurs, prospect.Id, resultat);
        if (!resultat.Succes)
            return resultat;

        // 4. Seuls ces champs changent : id, concession, conseiller, dates, statut et historique restent intacts.
        prospect.Prenom = valeurs.Prenom!;
        prospect.Nom = valeurs.Nom!;
        prospect.Courriel = valeurs.Courriel;
        prospect.Telephone = valeurs.Telephone;
        prospect.TelephoneChiffres = TelephoneEnChiffres(valeurs.Telephone);
        prospect.ContactPrefere = valeurs.ContactPrefere!;
        prospect.Source = valeurs.Source!;
        prospect.SourceDetail = valeurs.SourceDetail;

        if (opportunite is not null)
        {
            // Un titre égal à celui que la règle donne pour les valeurs actuelles est automatique : il suit le
            // nouveau premier intérêt. Tout autre titre a été choisi par quelqu'un : il est conservé.
            bool titreAutomatique = opportunite.Titre == TitreAutomatique(opportunite.Modele, opportunite.Categorie);

            opportunite.Categorie = valeurs.Categorie;
            opportunite.Modele = valeurs.Modele;
            opportunite.BudgetTotal = valeurs.Budget;
            opportunite.Horizon = valeurs.Horizon;

            if (titreAutomatique)
                opportunite.Titre = TitreAutomatique(valeurs.Modele, valeurs.Categorie);
        }

        // Un seul SaveChanges dans la transaction : le contact et l'opportunité sont enregistrés ensemble, ou pas du tout.
        try
        {
            await _db.SaveChangesAsync();
            await transaction.CommitAsync();
        }
        catch (DbUpdateException)
        {
            _db.ChangeTracker.Clear();
            return ResultatService.Echec("L'enregistrement a échoué : les modifications n'ont pas été enregistrées. Réessayez dans un instant.");
        }
        return ResultatService.Ok();
    }

    private const string MessageConflit =
        "Ce prospect a été modifié entre-temps : vos changements n'ont pas été enregistrés. "
        + "Fermez ce formulaire et cliquez sur « Modifier » pour repartir des valeurs actuelles, puis refaites vos changements.";

    // Titre donné automatiquement à une opportunité : le modèle, sinon le type de véhicule, sinon « Premier intérêt ».
    // Même règle que prospects-store.js (ajouterProspect).
    public static string TitreAutomatique(string? modele, string? categorie) =>
        modele ?? Libelle(ReferentielsVente.Categories, categorie) ?? "Premier intérêt";

    // Même règle que la liste (ObtenirAsync) : prospect du conseiller, dans sa concession actuelle.
    private async Task<Prospect?> TrouverDansSonDossierAsync(string utilisateurId, int id, bool suivre)
    {
        var requete = _db.Prospects.Include(p => p.Opportunites).Where(p =>
            p.Id == id && p.ConseillerId == utilisateurId && p.DealershipId == p.Conseiller!.DealershipId);
        if (!suivre)
            requete = requete.AsNoTracking();
        return await requete.FirstOrDefaultAsync();
    }

    // « pe-12 » avec le préfixe « pe- » donne 12 ; tout autre texte donne null.
    public static int? LireId(string? id, string prefixe)
    {
        if (id is null || !id.StartsWith(prefixe, StringComparison.Ordinal))
            return null;
        bool lisible = int.TryParse(id.Substring(prefixe.Length), NumberStyles.None, CultureInfo.InvariantCulture, out int valeur);
        if (!lisible || valeur <= 0)
            return null;
        return valeur;
    }

    // Empreinte courte des valeurs enregistrées d'un prospect et de ses opportunités.
    // Elle change dès qu'une de ces valeurs change : c'est ce qui permet de détecter une modification concurrente.
    public static string Empreinte(Prospect p)
    {
        var texte = new StringBuilder();
        texte.AppendJoin('|', p.Prenom, p.Nom, p.Courriel, p.Telephone, p.ContactPrefere, p.Source, p.SourceDetail);
        foreach (var o in p.Opportunites.OrderBy(o => o.Id))
        {
            texte.Append('#');
            texte.AppendJoin('|', o.Id, o.Titre, o.Etape, o.Categorie, o.Modele,
                o.BudgetTotal?.ToString(CultureInfo.InvariantCulture), o.Horizon, o.ProchaineAction,
                o.DateProchaineAction?.ToString("O", CultureInfo.InvariantCulture));
        }
        byte[] hachage = SHA256.HashData(Encoding.UTF8.GetBytes(texte.ToString()));
        return Convert.ToHexString(hachage, 0, 8);
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
    // Chaque méthode ajoute ses erreurs au résultat ; Champ = attribut name du champ du formulaire.

    // Informations du contact et provenance (création et modification).
    private static void ValiderContact(NouveauProspectSaisie s, ResultatService resultat)
    {
        void Erreur(string champ, string message) => resultat.Erreurs.Add(new ErreurChamp(champ, message));

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

        if (!EstDansListe(ReferentielsVente.Sources, s.Source))
            Erreur("source", "Choisissez la provenance.");
        if (s.SourceDetail is not null && s.SourceDetail.Length > LongueurPrecision)
            Erreur("sourceDetail", $"La précision ne doit pas dépasser {LongueurPrecision} caractères.");
    }

    // Premier intérêt d'une opportunité (tous les champs sont facultatifs).
    private static void ValiderInteret(NouveauProspectSaisie s, ResultatService resultat)
    {
        void Erreur(string champ, string message) => resultat.Erreurs.Add(new ErreurChamp(champ, message));

        if (s.Categorie is not null && !EstDansListe(ReferentielsVente.Categories, s.Categorie))
            Erreur("categorie", "Type de véhicule inconnu.");
        if (s.Modele is not null && s.Modele.Length > LongueurModele)
            Erreur("modele", $"Le modèle ne doit pas dépasser {LongueurModele} caractères.");
        if (s.Budget is not null && (s.Budget < 0 || s.Budget > BudgetMaximum))
            Erreur("budget", "Montant entre 0 et 500 000 $.");
        if (s.Horizon is not null && !EstDansListe(ReferentielsVente.Horizons, s.Horizon))
            Erreur("horizon", "Horizon d'achat inconnu.");
    }

    // Le seul conseiller réel proposé par le formulaire est le conseiller connecté (pas de transfert pour l'instant).
    private static void ValiderAttribution(NouveauProspectSaisie s, string utilisateurId, ResultatService resultat)
    {
        bool conseillerAutorise = s.ConseillerId == ServiceProspectsDemo.IdConseillerConnecte || s.ConseillerId == utilisateurId;
        if (!conseillerAutorise)
            resultat.Erreurs.Add(new ErreurChamp("conseillerId",
                "Un prospect enregistré ne peut être attribué qu'à vous : les conseillers fictifs de la démonstration ne peuvent pas le recevoir."));
    }

    // Champs présents seulement à la création : commentaire initial, statut initial et prochain suivi.
    private static void ValiderChampsDeCreation(NouveauProspectSaisie s, ResultatService resultat)
    {
        void Erreur(string champ, string message) => resultat.Erreurs.Add(new ErreurChamp(champ, message));

        if (s.Commentaire is not null && s.Commentaire.Length > LongueurCommentaire)
            Erreur("commentaire", $"Le commentaire ne doit pas dépasser {LongueurCommentaire} caractères.");
        if (LireEtape(s.Etape) is null)
            Erreur("etape", "Choisissez le statut initial.");
        if (s.ProchaineAction is not null && s.ProchaineAction.Length > LongueurProchaineAction)
            Erreur("prochaineAction", $"La prochaine action ne doit pas dépasser {LongueurProchaineAction} caractères.");
        if (s.DateSuivi is not null && s.DateSuivi.Value.Date < DateTime.Today)
            Erreur("dateSuivi", "La date ne peut pas être passée.");
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
    // deux personnes peuvent s'appeler pareil. On refuse l'enregistrement, sans rien fusionner.
    // exclureId : le prospect en cours de modification, qui ne peut pas être son propre doublon.
    private async Task ChercherDoublonAsync(int concessionId, NouveauProspectSaisie s, int? exclureId, ResultatService resultat)
    {
        var autres = _db.Prospects.AsNoTracking().Where(p => p.DealershipId == concessionId);
        if (exclureId is not null)
            autres = autres.Where(p => p.Id != exclureId.Value);

        if (s.Courriel is not null)
        {
            var existant = await autres.FirstOrDefaultAsync(p => p.Courriel == s.Courriel);
            if (existant is not null)
                resultat.Erreurs.Add(new ErreurChamp("courriel",
                    $"Ce courriel appartient déjà à {existant.Prenom} {existant.Nom}, un prospect de votre concession."));
        }

        string? chiffres = TelephoneEnChiffres(s.Telephone);
        if (chiffres is not null)
        {
            var existant = await autres.FirstOrDefaultAsync(p => p.TelephoneChiffres == chiffres);
            if (existant is not null)
                resultat.Erreurs.Add(new ErreurChamp("telephone",
                    $"Ce téléphone appartient déjà à {existant.Prenom} {existant.Nom}, un prospect de votre concession."));
        }
    }

    // Le prospect et son unique opportunité, enregistrés ensemble par le même SaveChanges.
    private static Prospect CreerEntites(NouveauProspectSaisie s, string conseillerId, int concessionId)
    {
        var maintenant = DateTime.UtcNow;

        string titre = TitreAutomatique(s.Modele, s.Categorie);

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
