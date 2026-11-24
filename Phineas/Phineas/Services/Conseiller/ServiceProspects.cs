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

    // Change l'étape d'une opportunité enregistrée (id « oe-34 ») et trace le changement dans l'historique.
    // version : empreinte du prospect lue par la page (voir Empreinte). Valeur du résultat : true si l'étape a changé,
    // false si l'opportunité était déjà à cette étape (rien n'est écrit, aucun historique).
    Task<ResultatService<bool>> ChangerEtapeAsync(string utilisateurId, string? opportuniteId, string? etape, string? version);

    // Ajoute une note au dossier d'un prospect enregistré (id « pe-12 »), éventuellement liée à une de ses opportunités,
    // et, si « Prochaine action » est remplie, planifie ce suivi sur cette opportunité (tout ou rien).
    // Valeur du résultat : true si la note a été créée, false si ce même formulaire avait déjà été enregistré (aucun doublon).
    Task<ResultatService<bool>> AjouterNoteAsync(string utilisateurId, NoteSaisie saisie);

    // Planifie la prochaine action d'une opportunité enregistrée (elle remplace l'action courante, archivée « Remplacé »).
    // Valeur du résultat : true si le suivi a changé, false s'il était déjà planifié à l'identique (double envoi).
    Task<ResultatService<bool>> PlanifierSuiviAsync(string utilisateurId, SuiviSaisie saisie);
    // Nouvelle échéance pour la même action ; Valeur = false si ce report était déjà enregistré (double envoi).
    Task<ResultatService<bool>> ReporterSuiviAsync(string utilisateurId, string? opportuniteId, string? versionSuivi, DateTime? date);

    // Marque comme réalisée la prochaine action d'une opportunité enregistrée (id « oe-34 ») : elle est archivée
    // « Réalisé » et retirée des suivis actifs. versionSuivi : empreinte de l'action affichée (EmpreinteSuivi).
    // Valeur du résultat : true si l'action a été réalisée, false si cette même action l'était déjà (double envoi).
    Task<ResultatService<bool>> RealiserSuiviAsync(string utilisateurId, string? opportuniteId, string? versionSuivi);
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
            .ThenInclude(o => o.HistoriqueEtapes)
            .ThenInclude(h => h.Utilisateur)
            .Include(p => p.Notes)
            .ThenInclude(n => n.Auteur)
            .Include(p => p.Opportunites)
            .ThenInclude(o => o.HistoriqueSuivis)
            .ThenInclude(h => h.Auteur)
            .AsSplitQuery()
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
            qualification,
            VersionSuivi: EmpreinteSuivi(o.ProchaineAction, o.DateProchaineAction)
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

        // Notes enregistrées (NoteProspect) : type = catégorie choisie (note, appel, courriel, visite), texte tel que saisi.
        foreach (var n in p.Notes)
        {
            string redacteur = n.Auteur is null ? auteur : n.Auteur.FullName;
            string? opportuniteDeLaNote = n.OpportuniteId is null ? null : PrefixeOpportunite + n.OpportuniteId;
            liste.Add(new(PrefixeInteraction + "n" + n.Id, contactId, opportuniteDeLaNote, HeureLocale(n.DateCreation), n.Type, redacteur, n.Contenu));
        }

        // Suivis réalisés, remplacés ou reportés (HistoriqueSuiviOpportunite) : trois types distincts, jamais confondus.
        foreach (var o in p.Opportunites)
        {
            foreach (var h in o.HistoriqueSuivis)
            {
                string responsable = h.Auteur is null ? auteur : h.Auteur.FullName;
                string prevu = h.DatePrevue is null ? "" : " (prévu le " + JourLisible(h.DatePrevue) + ")";
                string type;
                string resume;
                if (h.Cloture == ClotureSuivi.Realise)
                {
                    type = "suivi-realise";
                    resume = "Suivi réalisé, déclaré par le conseiller : « " + h.Action + " »" + prevu + ".";
                }
                else if (h.Cloture == ClotureSuivi.Reporte)
                {
                    type = "suivi-reporte";
                    resume = "Suivi reporté, l'action reste à faire : « " + h.Action + " » (nouvelle échéance : "
                        + JourLisible(h.NouvelleDatePrevue) + ", auparavant : " + JourLisible(h.DatePrevue) + ").";
                }
                else
                {
                    type = "suivi-remplace";
                    resume = "Suivi remplacé par une nouvelle action, non réalisé : « " + h.Action + " »" + prevu + ".";
                }
                liste.Add(new(PrefixeInteraction + "s" + h.Id, contactId, PrefixeOpportunite + o.Id, HeureLocale(h.DateCloture), type, responsable, resume));
            }
        }

        // Changements d'étape enregistrés (HistoriqueEtapeOpportunite), même type « etape » que les changements locaux.
        foreach (var o in p.Opportunites)
        {
            foreach (var h in o.HistoriqueEtapes)
            {
                string responsable = h.Utilisateur is null ? auteur : h.Utilisateur.FullName;
                string resume = "Étape : " + FormatVente.Libelle(h.AncienneEtape) + " → " + FormatVente.Libelle(h.NouvelleEtape) + ".";
                liste.Add(new(PrefixeInteraction + "e" + h.Id, contactId, PrefixeOpportunite + o.Id, HeureLocale(h.DateHeure), "etape", responsable, resume));
            }
        }
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

    private static readonly CultureInfo CultureFrancaise = CultureInfo.GetCultureInfo("fr-CA");

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
        var prospect = await VerrouillerDansSonDossierAsync(utilisateurId, id.Value);
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

    // ---------- Changement d'étape ----------

    public async Task<ResultatService<bool>> ChangerEtapeAsync(string utilisateurId, string? opportuniteId, string? etape, string? version)
    {
        // 1. L'étape demandée doit être une des étapes du module (EtapeVente).
        EtapeVente? nouvelleEtape = LireEtapeConnue(etape);
        if (nouvelleEtape is null)
            return ResultatService<bool>.Echec("Étape inconnue.", "etape");

        int? id = LireId(opportuniteId, PrefixeOpportunite);
        if (id is null)
            return ResultatService<bool>.NonTrouve();

        var conseiller = await CompteUtilisableAsync(utilisateurId);
        if (conseiller is null)
            return ResultatService<bool>.Echec(MessageCompteInutilisable);

        // 2. Même transaction et même verrou que ModifierAsync, sur la ligne du prospect parent : un changement
        // d'étape et une modification du même dossier passent l'un après l'autre, toujours dans le même ordre.
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted);
        int? prospectId = await _db.OpportunitesVente.Where(o => o.Id == id.Value).Select(o => (int?)o.ProspectId).FirstOrDefaultAsync();
        if (prospectId is null)
            return ResultatService<bool>.NonTrouve();

        var prospect = await VerrouillerDansSonDossierAsync(utilisateurId, prospectId.Value);
        var opportunite = prospect?.Opportunites.FirstOrDefault(o => o.Id == id.Value);
        if (prospect is null || opportunite is null)
            return ResultatService<bool>.NonTrouve();

        // 3. La page doit montrer l'état actuel du dossier, sinon le changement est refusé (comme pour ModifierAsync).
        if (version != Empreinte(prospect))
            return ResultatService<bool>.Echec(MessageConflitEtape);

        // 4. Déjà à cette étape : rien à écrire, et aucun historique trompeur.
        if (opportunite.Etape == nouvelleEtape.Value)
            return ResultatService<bool>.Ok(false);

        // 5. Règle existante : une perte passe par la clôture avec motif (module Relations), qui n'est pas encore en base.
        if (nouvelleEtape.Value == EtapeVente.Perdu)
            return ResultatService<bool>.Echec(
                "La clôture comme perdue demande un motif, qui n'est pas encore enregistré en base : "
                    + "cette étape n'est pas encore disponible pour un prospect enregistré.",
                "etape"
            );

        // Décision de l'architecte fonctionnel : une vente ne compte comme gagnée qu'une fois confirmée par une
        // transaction. Tant que ce lien n'existe pas, « Gagné » est refusé (« Finalisation » reste disponible).
        // Quitter « Gagné » reste permis (retour en arrière). À lever quand les transactions seront intégrées.
        if (nouvelleEtape.Value == EtapeVente.Gagne)
            return ResultatService<bool>.Echec(
                "Une vente est comptée comme gagnée seulement après la confirmation de sa transaction, qui n'est pas encore "
                    + "reliée aux opportunités enregistrées : utilisez « Finalisation » en attendant.",
                "etape"
            );

        // 6. Nouvelle étape et historique dans le même SaveChanges, dans la transaction : tout ou rien.
        // Le titre, le premier intérêt, le suivi et le contact ne changent pas.
        var maintenant = DateTime.UtcNow;
        opportunite.HistoriqueEtapes.Add(new HistoriqueEtapeOpportunite
        {
            AncienneEtape = opportunite.Etape,
            NouvelleEtape = nouvelleEtape.Value,
            DateHeure = maintenant,
            UtilisateurId = utilisateurId,
        });
        opportunite.Etape = nouvelleEtape.Value;
        opportunite.DerniereActivite = maintenant;

        try
        {
            await _db.SaveChangesAsync();
            await transaction.CommitAsync();
        }
        catch (DbUpdateException)
        {
            _db.ChangeTracker.Clear();
            return ResultatService<bool>.Echec("L'enregistrement a échoué : l'étape n'a pas été changée. Réessayez dans un instant.");
        }
        return ResultatService<bool>.Ok(true);
    }

    private const string MessageConflitEtape =
        "Ce prospect a été modifié entre-temps : l'étape n'a pas été changée. La page affiche maintenant ses valeurs actuelles ; refaites votre choix si besoin.";

    // ---------- Notes ----------

    // Même limite que l'attribut maxlength du champ « Résumé » de la fiche.
    private const int LongueurNote = 600;
    private const int LongueurJeton = 64;

    public async Task<ResultatService<bool>> AjouterNoteAsync(string utilisateurId, NoteSaisie saisie)
    {
        int? id = LireId(saisie.ProspectId, PrefixeProspect);
        if (id is null)
            return ResultatService<bool>.NonTrouve();

        var conseiller = await CompteUtilisableAsync(utilisateurId);
        if (conseiller is null)
            return ResultatService<bool>.Echec(MessageCompteInutilisable);

        // Même transaction et même verrou que ModifierAsync et ChangerEtapeAsync : la note peut mettre à jour
        // l'activité de l'opportunité, et deux envois du même formulaire passent l'un après l'autre.
        // Pas de contrôle d'empreinte : une note n'écrase rien (l'empreinte ne contient ni les notes ni l'activité).
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted);
        var prospect = await VerrouillerDansSonDossierAsync(utilisateurId, id.Value);
        if (prospect is null)
            return ResultatService<bool>.NonTrouve();

        // Même formulaire déjà enregistré (double clic, renvoi) : rien de nouveau, ni note ni suivi.
        string? jetonRecu = saisie.Jeton?.Trim();
        if (!string.IsNullOrEmpty(jetonRecu) && await NoteDejaEnregistreeAsync(prospect.Id, jetonRecu))
            return ResultatService<bool>.Ok(false);

        // Validation de toute la soumission (sans dépendre du JavaScript) avant la moindre écriture.
        var resultat = new ResultatService<bool>();
        resultat.Erreurs.AddRange(ErreursDeSaisieNote(saisie));

        OpportuniteVente? opportunite = null;
        if (!string.IsNullOrEmpty(saisie.OpportuniteId))
        {
            int? opportuniteId = LireId(saisie.OpportuniteId, PrefixeOpportunite);
            opportunite = prospect.Opportunites.FirstOrDefault(o => o.Id == opportuniteId);
            if (opportunite is null)
                resultat.Erreurs.Add(new ErreurChamp("opportuniteId", "Cette opportunité n'appartient pas à ce prospect."));
        }

        // Suivi planifié avec la note : il porte sur l'opportunité choisie dans « Concerne ».
        bool avecSuivi = !string.IsNullOrWhiteSpace(saisie.ProchaineAction);
        if (avecSuivi && string.IsNullOrEmpty(saisie.OpportuniteId))
            resultat.Erreurs.Add(new ErreurChamp("opportuniteId", "Choisissez l'opportunité concernée pour planifier ce suivi."));
        if (avecSuivi && opportunite is not null && !EstActive(opportunite))
            resultat.Erreurs.Add(new ErreurChamp("opportuniteId", MessageOpportuniteCloturee));

        if (!resultat.Succes)
            return resultat;

        // Le suivi remplace la prochaine action : la page doit montrer l'état actuel du dossier.
        if (avecSuivi && saisie.Version != Empreinte(prospect))
            return ResultatService<bool>.Echec(MessageConflitSuivi);

        string contenu = NormaliserNote(saisie.Resume);
        string type = saisie.Type!;
        string jeton = jetonRecu!;

        var maintenant = DateTime.UtcNow;
        prospect.Notes.Add(new NoteProspect
        {
            OpportuniteId = opportunite?.Id,
            AuteurId = utilisateurId,
            Type = type,
            Contenu = contenu,
            DateCreation = maintenant,
            JetonSoumission = jeton,
        });
        // Une note sur une opportunité est une activité de cette opportunité (comme dans prospects-store.js).
        if (opportunite is not null)
            opportunite.DerniereActivite = maintenant;
        // Même SaveChanges que la note : la note et le suivi sont enregistrés ensemble, ou pas du tout.
        if (avecSuivi)
            AppliquerSuivi(opportunite!, saisie.ProchaineAction!.Trim(), saisie.Date, utilisateurId);

        try
        {
            await _db.SaveChangesAsync();
            await transaction.CommitAsync();
        }
        catch (DbUpdateException)
        {
            _db.ChangeTracker.Clear();
            // L'index unique (prospect, jeton) a pu refuser un double envoi arrivé en même temps : ce n'est pas un échec.
            if (await NoteDejaEnregistreeAsync(prospect.Id, jeton))
                return ResultatService<bool>.Ok(false);
            return ResultatService<bool>.Echec("L'enregistrement a échoué : la note n'a pas été enregistrée. Réessayez dans un instant.");
        }
        return ResultatService<bool>.Ok(true);
    }

    // Erreurs de saisie d'une note, sans lire la base (texte, type, champs de suivi, jeton du formulaire).
    public static List<ErreurChamp> ErreursDeSaisieNote(NoteSaisie saisie)
    {
        var erreurs = new List<ErreurChamp>();
        void Erreur(string champ, string message) => erreurs.Add(new ErreurChamp(champ, message));

        string contenu = NormaliserNote(saisie.Resume);
        if (contenu.Length == 0)
            Erreur("resume", "Écrivez le résumé de l'échange.");
        else if (contenu.Length > LongueurNote)
            Erreur("resume", $"La note ne doit pas dépasser {LongueurNote} caractères (elle en compte {contenu.Length}).");

        if (!EstDansListe(ReferentielsVente.TypesNote, saisie.Type))
            Erreur("type", "Type de note inconnu.");

        // Suivi facultatif (mêmes règles que le formulaire) : une date demande une action ; l'action peut être sans date.
        if (string.IsNullOrWhiteSpace(saisie.ProchaineAction))
        {
            if (saisie.Date is not null)
                Erreur("date", "Précisez la prochaine action liée à cette date.");
        }
        else
        {
            erreurs.AddRange(ErreursDeSuivi(saisie.ProchaineAction, saisie.Date, "prochaineAction", "date", dateObligatoire: false));
        }

        string jeton = saisie.Jeton?.Trim() ?? "";
        if (jeton.Length == 0 || jeton.Length > LongueurJeton)
            Erreur("", "Le formulaire est incomplet : rechargez la fiche, puis écrivez de nouveau la note.");
        return erreurs;
    }

    // Erreurs de saisie de la création (NouveauProspectSaisie) ou de la modification (ModificationProspectSaisie),
    // sans lire ni écrire la base (les doublons ne sont donc pas cherchés ici).
    // Utilisées par le contrôleur quand une valeur est illisible : toutes les erreurs s'affichent, rien n'est enregistré.
    public static List<ErreurChamp> ErreursDeSaisie(NouveauProspectSaisie saisie, string utilisateurId)
    {
        var valeurs = Nettoyer(saisie);
        var resultat = new ResultatService();
        ValiderContact(valeurs, resultat);
        ValiderAttribution(valeurs, utilisateurId, resultat);
        if (saisie is ModificationProspectSaisie modification)
        {
            if (modification.OpportuniteId is not null)
                ValiderInteret(valeurs, resultat);
        }
        else
        {
            ValiderInteret(valeurs, resultat);
            ValiderChampsDeCreation(valeurs, resultat);
        }
        return resultat.Erreurs;
    }

    // ---------- Suivis ----------

    private const string MessageOpportuniteCloturee = "Cette opportunité est clôturée : planifiez le suivi sur une opportunité active.";
    private const string MessageConflitSuivi =
        "Ce prospect a été modifié entre-temps : le suivi n'a pas été enregistré. La page affiche maintenant ses valeurs actuelles ; refaites la planification si besoin.";

    public async Task<ResultatService<bool>> PlanifierSuiviAsync(string utilisateurId, SuiviSaisie saisie)
    {
        int? id = LireId(saisie.OpportuniteId, PrefixeOpportunite);
        if (id is null)
            return ResultatService<bool>.NonTrouve();

        var conseiller = await CompteUtilisableAsync(utilisateurId);
        if (conseiller is null)
            return ResultatService<bool>.Echec(MessageCompteInutilisable);

        // Même transaction et même verrou (ligne du prospect parent) que les autres écritures du dossier.
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted);
        int? prospectId = await _db.OpportunitesVente.Where(o => o.Id == id.Value).Select(o => (int?)o.ProspectId).FirstOrDefaultAsync();
        if (prospectId is null)
            return ResultatService<bool>.NonTrouve();
        var prospect = await VerrouillerDansSonDossierAsync(utilisateurId, prospectId.Value);
        var opportunite = prospect?.Opportunites.FirstOrDefault(o => o.Id == id.Value);
        if (prospect is null || opportunite is null)
            return ResultatService<bool>.NonTrouve();

        var resultat = new ResultatService<bool>();
        resultat.Erreurs.AddRange(ErreursDeSuivi(saisie.Action, saisie.Date, "action", "date", dateObligatoire: true));
        if (!EstActive(opportunite))
            resultat.Erreurs.Add(new ErreurChamp("opportuniteId", MessageOpportuniteCloturee));
        if (!resultat.Succes)
            return resultat;

        string action = saisie.Action!.Trim();
        DateTime date = DateDuSuivi(saisie.Date)!.Value;

        // Déjà planifié à l'identique (double clic, renvoi) : rien à écrire, et ce n'est pas un conflit.
        if (opportunite.ProchaineAction == action && opportunite.DateProchaineAction == date)
            return ResultatService<bool>.Ok(false);

        // Le suivi remplace la prochaine action : la page doit montrer l'état actuel du dossier.
        if (saisie.Version != Empreinte(prospect))
            return ResultatService<bool>.Echec(MessageConflitSuivi);

        AppliquerSuivi(opportunite, action, saisie.Date, utilisateurId);
        try
        {
            await _db.SaveChangesAsync();
            await transaction.CommitAsync();
        }
        catch (DbUpdateException)
        {
            _db.ChangeTracker.Clear();
            return ResultatService<bool>.Echec("L'enregistrement a échoué : le suivi n'a pas été planifié. Réessayez dans un instant.");
        }
        return ResultatService<bool>.Ok(true);
    }

    // Erreurs d'un suivi, sans lire la base : action obligatoire (120 caractères au plus), date d'aujourd'hui ou à venir.
    // La date d'un suivi déjà échu n'est jamais revérifiée : seule une nouvelle planification passe par ici.
    public static List<ErreurChamp> ErreursDeSuivi(string? action, DateTime? date, string champAction, string champDate, bool dateObligatoire)
    {
        var erreurs = new List<ErreurChamp>();
        string texte = action?.Trim() ?? "";
        if (texte.Length == 0)
            erreurs.Add(new ErreurChamp(champAction, "Décrivez l'action à faire."));
        else if (texte.Length > LongueurProchaineAction)
            erreurs.Add(new ErreurChamp(champAction, $"L'action ne doit pas dépasser {LongueurProchaineAction} caractères."));

        if (date is null)
        {
            if (dateObligatoire)
                erreurs.Add(new ErreurChamp(champDate, "Choisissez la date du suivi."));
        }
        else if (!EstJourAccepte(date.Value, DateTime.Today))
        {
            erreurs.Add(new ErreurChamp(champDate, "Choisissez aujourd'hui ou une date à venir."));
        }
        return erreurs;
    }

    // ---------- Dates civiles (règle unique) ----------
    // Un jour choisi dans un formulaire (« Pour le », date du prochain suivi à la création) est un jour civil, sans heure.
    // Le navigateur impose « aujourd'hui ou plus tard » dans le fuseau de l'utilisateur. L'application ne connaît pas
    // le fuseau de chaque concession (aucun réglage n'existe) : le serveur, qui peut être dans un autre fuseau (ex. UTC),
    // accepte donc à partir de la veille de SON aujourd'hui, pour ne jamais refuser l'« aujourd'hui » d'un utilisateur.
    // Limite connue : un envoi direct qui contourne la page peut planifier la veille. Une règle exacte demandera un
    // fuseau par concession (réglage à ajouter). Utilisée par la création (Creer) et par les suivis (PlanifierSuivi, notes).
    public static bool EstJourAccepte(DateTime jourChoisi, DateTime aujourdhuiServeur) =>
        jourChoisi.Date >= aujourdhuiServeur.Date.AddDays(-1);

    // Jour choisi dans le formulaire (sans heure) : même convention que prospects-store.js (depuisChampDate), à 9 h,
    // sans conversion UTC, pour que le jour affiché ne se décale jamais.
    private static DateTime? DateDuSuivi(DateTime? jour) =>
        jour is null ? null : jour.Value.Date.AddHours(HeureDuSuivi);

    // Remplace la prochaine action courante de l'opportunité (une seule action courante par opportunité).
    // L'ancienne version est archivée dans le même SaveChanges, jamais comptée comme réalisée :
    // « Reporté » si seule la date change (même description), « Remplacé » si la description change.
    private static void AppliquerSuivi(OpportuniteVente opportunite, string action, DateTime? jour, string utilisateurId)
    {
        var maintenant = DateTime.UtcNow;
        DateTime? nouvelleDate = DateDuSuivi(jour);
        if (opportunite.ProchaineAction is not null)
        {
            bool memeAction = opportunite.ProchaineAction == action;
            bool memeDate = opportunite.DateProchaineAction == nouvelleDate;
            if (!memeAction)
                opportunite.HistoriqueSuivis.Add(Archive(opportunite, ClotureSuivi.Remplace, utilisateurId, maintenant));
            else if (!memeDate)
                opportunite.HistoriqueSuivis.Add(Archive(opportunite, ClotureSuivi.Reporte, utilisateurId, maintenant, nouvelleDate));
        }

        opportunite.ProchaineAction = action;
        opportunite.DateProchaineAction = nouvelleDate;
        opportunite.DerniereActivite = maintenant;
    }

    // Copie de l'action courante de l'opportunité, avec sa clôture, pour l'historique des suivis.
    // nouvelleDate : seulement pour un report (nouvelle échéance de la même action).
    private static HistoriqueSuiviOpportunite Archive(OpportuniteVente opportunite, ClotureSuivi cloture, string utilisateurId, DateTime maintenant, DateTime? nouvelleDate = null) =>
        new()
        {
            OpportuniteId = opportunite.Id,
            Action = opportunite.ProchaineAction!,
            DatePrevue = opportunite.DateProchaineAction,
            NouvelleDatePrevue = nouvelleDate,
            Cloture = cloture,
            DateCloture = maintenant,
            AuteurId = utilisateurId,
        };

    // « 30 novembre 2026 », ou « aucune date ».
    private static string JourLisible(DateTime? jour) =>
        jour is null ? "aucune date" : jour.Value.ToString("d MMMM yyyy", CultureFrancaise);

    // ---------- Réalisation d'un suivi ----------

    private const string MessageSuiviChange =
        "Ce suivi a changé entre-temps (réalisé, remplacé ou modifié) : rien n'a été enregistré. Actualisez la page pour voir le suivi actuel.";

    public async Task<ResultatService<bool>> RealiserSuiviAsync(string utilisateurId, string? opportuniteId, string? versionSuivi)
    {
        int? id = LireId(opportuniteId, PrefixeOpportunite);
        if (id is null)
            return ResultatService<bool>.NonTrouve();

        var conseiller = await CompteUtilisableAsync(utilisateurId);
        if (conseiller is null)
            return ResultatService<bool>.Echec(MessageCompteInutilisable);

        // Même transaction et même verrou (ligne du prospect parent) que les autres écritures du dossier.
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted);
        int? prospectId = await _db.OpportunitesVente.Where(o => o.Id == id.Value).Select(o => (int?)o.ProspectId).FirstOrDefaultAsync();
        if (prospectId is null)
            return ResultatService<bool>.NonTrouve();
        var prospect = await VerrouillerDansSonDossierAsync(utilisateurId, prospectId.Value);
        var opportunite = prospect?.Opportunites.FirstOrDefault(o => o.Id == id.Value);
        if (prospect is null || opportunite is null)
            return ResultatService<bool>.NonTrouve();

        // L'action affichée doit être l'action courante. Sinon : soit elle vient d'être réalisée par ce même envoi
        // (double clic), soit elle a été réalisée, remplacée ou modifiée ailleurs, et rien n'est fait.
        string? versionActuelle = EmpreinteSuivi(opportunite.ProchaineAction, opportunite.DateProchaineAction);
        if (versionActuelle is null || versionSuivi != versionActuelle)
        {
            var derniere = await _db.HistoriquesSuiviOpportunite.AsNoTracking()
                .Where(h => h.OpportuniteId == opportunite.Id)
                .OrderByDescending(h => h.Id)
                .FirstOrDefaultAsync();
            bool dejaRealisee = derniere is not null
                && derniere.Cloture == ClotureSuivi.Realise
                && EmpreinteSuivi(derniere.Action, derniere.DatePrevue) == versionSuivi;
            if (dejaRealisee)
                return ResultatService<bool>.Ok(false);
            if (versionActuelle is null && string.IsNullOrEmpty(versionSuivi))
                return ResultatService<bool>.Echec("Cette opportunité n'a aucun suivi actif à marquer comme réalisé.");
            return ResultatService<bool>.Echec(MessageSuiviChange);
        }

        // Archivage « Réalisé » et retrait de l'action courante, dans le même SaveChanges (tout ou rien).
        // Un suivi en retard peut être réalisé : sa date prévue est seulement conservée dans l'historique.
        var maintenant = DateTime.UtcNow;
        opportunite.HistoriqueSuivis.Add(Archive(opportunite, ClotureSuivi.Realise, utilisateurId, maintenant));
        opportunite.ProchaineAction = null;
        opportunite.DateProchaineAction = null;
        opportunite.DerniereActivite = maintenant;

        try
        {
            await _db.SaveChangesAsync();
            await transaction.CommitAsync();
        }
        catch (DbUpdateException)
        {
            _db.ChangeTracker.Clear();
            return ResultatService<bool>.Echec("L'enregistrement a échoué : le suivi n'a pas été marqué comme réalisé. Réessayez dans un instant.");
        }
        return ResultatService<bool>.Ok(true);
    }

    // ---------- Report d'un suivi ----------

    // Erreurs de la nouvelle date d'un report, sans lire la base : même règle de jour que la planification.
    public static List<ErreurChamp> ErreursDeReport(DateTime? date)
    {
        var erreurs = new List<ErreurChamp>();
        if (date is null)
            erreurs.Add(new ErreurChamp("date", "Choisissez la nouvelle date du suivi."));
        else if (!EstJourAccepte(date.Value, DateTime.Today))
            erreurs.Add(new ErreurChamp("date", "Choisissez aujourd'hui ou une date à venir."));
        return erreurs;
    }

    // Donne une nouvelle échéance à l'action courante, sans changer sa description : elle reste à faire.
    // L'ancienne version est archivée « Reporté » (ancienne et nouvelle dates) dans le même SaveChanges.
    // versionSuivi : empreinte de l'action affichée ; refus si elle a été réalisée, remplacée ou reportée entre-temps.
    public async Task<ResultatService<bool>> ReporterSuiviAsync(string utilisateurId, string? opportuniteId, string? versionSuivi, DateTime? date)
    {
        int? id = LireId(opportuniteId, PrefixeOpportunite);
        if (id is null)
            return ResultatService<bool>.NonTrouve();

        var conseiller = await CompteUtilisableAsync(utilisateurId);
        if (conseiller is null)
            return ResultatService<bool>.Echec(MessageCompteInutilisable);

        // Même transaction et même verrou (ligne du prospect parent) que les autres écritures du dossier.
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted);
        int? prospectId = await _db.OpportunitesVente.Where(o => o.Id == id.Value).Select(o => (int?)o.ProspectId).FirstOrDefaultAsync();
        if (prospectId is null)
            return ResultatService<bool>.NonTrouve();
        var prospect = await VerrouillerDansSonDossierAsync(utilisateurId, prospectId.Value);
        var opportunite = prospect?.Opportunites.FirstOrDefault(o => o.Id == id.Value);
        if (prospect is null || opportunite is null)
            return ResultatService<bool>.NonTrouve();

        var resultat = new ResultatService<bool>();
        resultat.Erreurs.AddRange(ErreursDeReport(date));
        if (!EstActive(opportunite))
            resultat.Erreurs.Add(new ErreurChamp("opportuniteId", MessageOpportuniteCloturee));
        if (!resultat.Succes)
            return resultat;
        DateTime nouvelleDate = DateDuSuivi(date)!.Value;

        // L'action affichée doit être l'action courante. Sinon : soit ce même report vient d'être enregistré
        // (double clic), soit l'action a été réalisée, remplacée ou reportée ailleurs, et rien n'est fait.
        string? versionActuelle = EmpreinteSuivi(opportunite.ProchaineAction, opportunite.DateProchaineAction);
        if (versionActuelle is null || versionSuivi != versionActuelle)
        {
            var derniere = await _db.HistoriquesSuiviOpportunite.AsNoTracking()
                .Where(h => h.OpportuniteId == opportunite.Id)
                .OrderByDescending(h => h.Id)
                .FirstOrDefaultAsync();
            bool dejaReporte = derniere is not null
                && derniere.Cloture == ClotureSuivi.Reporte
                && EmpreinteSuivi(derniere.Action, derniere.DatePrevue) == versionSuivi
                && derniere.NouvelleDatePrevue == nouvelleDate
                // Empreinte calculée sur la date relue en base (le format de l'empreinte tient compte du type de date).
                && versionActuelle == EmpreinteSuivi(derniere.Action, derniere.NouvelleDatePrevue);
            if (dejaReporte)
                return ResultatService<bool>.Ok(false);
            if (versionActuelle is null && string.IsNullOrEmpty(versionSuivi))
                return ResultatService<bool>.Echec("Cette opportunité n'a aucun suivi actif à reporter.");
            return ResultatService<bool>.Echec(MessageSuiviChange);
        }

        // Même jour qu'avant : ce n'est pas un report, aucun événement n'est créé.
        if (opportunite.DateProchaineAction == nouvelleDate)
        {
            resultat.Erreurs.Add(new ErreurChamp("date", "La nouvelle date est celle de l'échéance actuelle : rien n'a été modifié."));
            return resultat;
        }

        var maintenant = DateTime.UtcNow;
        opportunite.HistoriqueSuivis.Add(Archive(opportunite, ClotureSuivi.Reporte, utilisateurId, maintenant, nouvelleDate));
        opportunite.DateProchaineAction = nouvelleDate;
        opportunite.DerniereActivite = maintenant;

        try
        {
            await _db.SaveChangesAsync();
            await transaction.CommitAsync();
        }
        catch (DbUpdateException)
        {
            _db.ChangeTracker.Clear();
            return ResultatService<bool>.Echec("L'enregistrement a échoué : le suivi n'a pas été reporté. Réessayez dans un instant.");
        }
        return ResultatService<bool>.Ok(true);
    }

    // Empreinte courte d'une prochaine action (texte et date prévue) ; null s'il n'y a aucune action.
    public static string? EmpreinteSuivi(string? action, DateTime? datePrevue)
    {
        if (action is null)
            return null;
        string texte = action + "|" + datePrevue?.ToString("O", CultureInfo.InvariantCulture);
        byte[] hachage = SHA256.HashData(Encoding.UTF8.GetBytes(texte));
        return Convert.ToHexString(hachage, 0, 8);
    }

    // Même règle que prospects-store.js (estActive) : une opportunité gagnée ou perdue est clôturée.
    private static bool EstActive(OpportuniteVente o) => o.Etape != EtapeVente.Gagne && o.Etape != EtapeVente.Perdu;

    private Task<bool> NoteDejaEnregistreeAsync(int prospectId, string jeton) =>
        _db.NotesProspect.AsNoTracking().AnyAsync(n => n.ProspectId == prospectId && n.JetonSoumission == jeton);

    // Le texte est gardé tel quel, sauf : fins de ligne Windows (\r\n, envoyées par les navigateurs) ramenées à \n,
    // et espaces retirés au début et à la fin. Aucun autre changement (pas d'encodage HTML : il se fait à l'affichage).
    private static string NormaliserNote(string? texte)
    {
        if (texte is null)
            return "";
        return texte.Replace("\r\n", "\n").Replace('\r', '\n').Trim();
    }

    // « Negociation » donne EtapeVente.Negociation ; un nombre ou un texte inconnu donne null.
    private static EtapeVente? LireEtapeConnue(string? valeur)
    {
        foreach (var etape in Enum.GetValues<EtapeVente>())
        {
            if (etape.ToString() == valeur)
                return etape;
        }
        return null;
    }

    // Verrouille la ligne du prospect (SELECT … FOR UPDATE, à appeler dans une transaction) puis le charge
    // s'il est dans le dossier du conseiller. Toute écriture sur un prospect ou ses opportunités passe par ici :
    // un seul verrou, toujours le même, donc pas d'interblocage entre les opérations.
    private async Task<Prospect?> VerrouillerDansSonDossierAsync(string utilisateurId, int prospectId)
    {
        await _db.Database.ExecuteSqlInterpolatedAsync($"SELECT Id FROM Prospects WHERE Id = {prospectId} FOR UPDATE");
        return await TrouverDansSonDossierAsync(utilisateurId, prospectId, suivre: true);
    }

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
        if (s.DateSuivi is not null && !EstJourAccepte(s.DateSuivi.Value, DateTime.Today))
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
