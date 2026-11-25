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
    Task<ResultatService> ConsulterAsync(string utilisateurId, string? prospectId, string? opportuniteId = null);

    // Modifie le contact d'un prospect enregistré et, si OpportuniteId est fourni, le premier intérêt de cette opportunité.
    Task<ResultatService> ModifierAsync(string utilisateurId, ModificationProspectSaisie saisie);

    // Fonctionnalité 18 : nouvelle opportunité pour un prospect enregistré du conseiller (jamais un nouveau prospect).
    // Résultat : l'identifiant de l'opportunité créée ; NonTrouve si le prospect n'est pas dans son dossier.
    Task<ResultatService<int>> CreerOpportuniteAsync(string utilisateurId, NouvelleOpportuniteSaisie saisie);

    // Fonctionnalité 20 : qualification commerciale d'une opportunité enregistrée du conseiller (seulement elle).
    Task<ResultatService> QualifierAsync(string utilisateurId, QualificationSaisie saisie);

    // Véhicules envisagés d'une opportunité enregistrée du conseiller (fonctionnalité 21) : ajout (identifiant du
    // véhicule créé), modification des champs envoyés, retrait. Simple description : ni inventaire, ni réservation.
    Task<ResultatService<int>> AjouterVehiculeAsync(string utilisateurId, VehiculeSaisie saisie);
    Task<ResultatService> ModifierVehiculeAsync(string utilisateurId, VehiculeSaisie saisie);
    Task<ResultatService> RetirerVehiculeAsync(string utilisateurId, VehiculeSaisie saisie);

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
    // Prochaines actions enregistrées des dossiers du conseiller, datées d'aujourd'hui (jour du serveur) ou plus tard.
    Task<IReadOnlyList<SuiviPlanifie>> SuivisPlanifiesAsync(string utilisateurId);
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
            .Include(p => p.Opportunites)
            .ThenInclude(o => o.VehiculesEnvisages)
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

    // ---------- Suivis à venir ----------

    // Prochaine action courante de chaque opportunité active des dossiers du conseiller, dans sa concession actuelle,
    // triée par date prévue puis par opportunité (ordre stable). Lue dans OpportuniteVente seulement : les actions
    // archivées (réalisées, remplacées, reportées) ne sont jamais des suivis actifs.
    // Le classement « À traiter » ou « À venir » se fait dans le navigateur, avec le jour civil de l'utilisateur, comme la
    // règle « suivi-echeance » de « À traiter » (une seule convention ; le serveur ne connaît pas le fuseau de l'utilisateur).
    // Le serveur n'envoie que les suivis datés d'aujourd'hui (son jour) ou plus tard : un suivi antérieur ne peut pas être
    // après le jour de l'utilisateur tant que l'écart entre les deux fuseaux reste inférieur à un jour.
    public async Task<IReadOnlyList<SuiviPlanifie>> SuivisPlanifiesAsync(string utilisateurId)
    {
        DateTime premierJour = DateTime.Today;
        var lignes = await _db.OpportunitesVente.AsNoTracking()
            .Where(o => o.Prospect!.ConseillerId == utilisateurId && o.Prospect.DealershipId == o.Prospect.Conseiller!.DealershipId)
            .Where(o => o.Etape != EtapeVente.Gagne && o.Etape != EtapeVente.Perdu)
            .Where(o => o.ProchaineAction != null && o.DateProchaineAction != null && o.DateProchaineAction >= premierJour)
            .OrderBy(o => o.DateProchaineAction)
            .ThenBy(o => o.Id)
            .Select(o => new { o.Id, o.ProspectId, o.Prospect!.Prenom, o.Prospect.Nom, o.Titre, o.ProchaineAction, o.DateProchaineAction })
            .ToListAsync();

        var suivis = new List<SuiviPlanifie>();
        foreach (var l in lignes)
        {
            string client = (l.Prenom + " " + l.Nom).Trim();
            string version = EmpreinteSuivi(l.ProchaineAction, l.DateProchaineAction)!;
            suivis.Add(new SuiviPlanifie(PrefixeOpportunite + l.Id, PrefixeProspect + l.ProspectId, client, l.Titre, l.ProchaineAction!, l.DateProchaineAction!.Value, version));
        }
        return suivis;
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
            Etat = o.EtatVehicule,
            Marques = ListeTexte(o.Marques),
            Modeles = ListeTexte(o.Modele),
            Places = o.Places,
            Caracteristiques = ListeTexte(o.Caracteristiques),
            Utilisation = o.Utilisation,
            BudgetTotal = o.BudgetTotal,
            BudgetMensuel = o.BudgetMensuel,
            ModeAchat = o.ModeAchat,
            MiseDeFonds = o.MiseDeFonds,
            Reprise = o.Reprise,
            RepriseDetail = o.RepriseDetail,
            Horizon = o.Horizon,
            DateCible = o.DateCible,
            ElementsDecision = ListeTexte(o.ElementsDecision),
            Objections = o.Objections,
        };

        // Véhicules envisagés (fonctionnalité 21), dans l'ordre où ils ont été ajoutés.
        var vehicules = new List<VehiculeEnvisageVue>();
        foreach (var v in o.VehiculesEnvisages.OrderBy(v => v.Id))
            vehicules.Add(new VehiculeEnvisageVue(PrefixeVehicule + v.Id, v.Marque, v.Modele, v.Annee, v.Finition, LibelleVehicule(v)));

        return new Opportunite(
            PrefixeOpportunite + o.Id,
            PrefixeProspect + o.ProspectId,
            o.Titre,
            o.Etape,
            HeureLocale(o.DateCreation),
            HeureLocale(o.DerniereActivite),
            o.ProchaineAction,
            o.DateProchaineAction,
            vehicules.Select(v => v.Libelle).ToList(),
            qualification,
            VersionSuivi: EmpreinteSuivi(o.ProchaineAction, o.DateProchaineAction),
            VehiculesDetail: vehicules
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

        // Opportunités ajoutées ensuite (fonctionnalité 18) : leur ouverture, rattachée à elles seules. Ce n'est ni un
        // contact déclaré ni une note : seulement la trace de la date d'ouverture enregistrée.
        foreach (var o in p.Opportunites.Where(o => premiere is not null && o.Id != premiere.Id))
            liste.Add(new(PrefixeInteraction + "o" + o.Id, contactId, PrefixeOpportunite + o.Id, HeureLocale(o.DateCreation), "opportunite", auteur,
                "Nouvelle opportunité : « " + o.Titre + " »."));

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
                liste.Add(new(PrefixeInteraction + "s" + h.Id, contactId, PrefixeOpportunite + o.Id, HeureLocale(h.DateCloture), type, responsable, resume, DatePrevue: h.DatePrevue, ActionPrevue: h.Action));
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
        await ChercherDoublonAsync(concessionId, valeurs, null, utilisateurId, ContexteDoublon.Creation, resultat);
        if (!resultat.Succes)
            return resultat;

        // Le prospect et sa première opportunité : un seul SaveChanges, donc une seule transaction (tout ou rien).
        var prospect = CreerEntites(valeurs, utilisateurId, concessionId);
        _db.Prospects.Add(prospect);
        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // Rien n'a été enregistré : jamais de message de succès dans ce cas. Si une création simultanée du même
            // courriel ou téléphone vient d'être enregistrée, l'index unique a refusé celle-ci : on le dit comme un
            // doublon ordinaire (même message, sans données d'un collègue) ; sinon, échec technique.
            _db.ChangeTracker.Clear();
            var refus = new ResultatService<int>();
            await ChercherDoublonAsync(concessionId, valeurs, null, utilisateurId, ContexteDoublon.Creation, refus);
            if (!refus.Succes)
                return refus;
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

    // opportuniteId (facultatif, ex. adresse /Prospects/Fiche/pe-3?opportunite=oe-7) : elle doit appartenir à ce
    // prospect. Une opportunité inconnue ou d'un autre dossier donne NonTrouve, jamais une autre opportunité par défaut.
    public async Task<ResultatService> ConsulterAsync(string utilisateurId, string? prospectId, string? opportuniteId = null)
    {
        int? id = LireId(prospectId, PrefixeProspect);
        if (id is null)
            return ResultatService.NonTrouve();

        try
        {
            var prospect = await TrouverDansSonDossierAsync(utilisateurId, id.Value, suivre: false);
            if (prospect is null)
                return ResultatService.NonTrouve();
            if (opportuniteId is null)
                return ResultatService.Ok();
            int? idOpportunite = LireId(opportuniteId, PrefixeOpportunite);
            bool appartient = prospect.Opportunites.Any(o => o.Id == idOpportunite);
            return appartient ? ResultatService.Ok() : ResultatService.NonTrouve();
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

        await ChercherDoublonAsync(prospect.DealershipId, valeurs, prospect.Id, utilisateurId, ContexteDoublon.Modification, resultat);
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
            // Index unique : un autre dossier vient de recevoir ce courriel ou ce téléphone (même règle qu'à la création).
            _db.ChangeTracker.Clear();
            var refus = new ResultatService();
            await ChercherDoublonAsync(prospect.DealershipId, valeurs, prospect.Id, utilisateurId, ContexteDoublon.Modification, refus);
            if (!refus.Succes)
                return refus;
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

    // ---------- Nouvelle opportunité d'un prospect enregistré (fonctionnalité 18) ----------

    private const int LongueurTitreOpportunite = 80;

    private const string MessageConflitOpportunite =
        "La fiche a changé depuis l'ouverture du formulaire (cette opportunité a peut-être déjà été créée) : "
        + "aucune nouvelle opportunité n'a été créée. Vérifiez la liste des opportunités, puis recommencez si besoin.";

    // Ajoute un projet d'achat au prospect existant : même concession, même conseiller, aucun nouveau prospect
    // (la règle de doublon F17 ne s'applique qu'à la création d'un prospect). Étape initiale et catégorie suivent les
    // règles de la création (F01). Rien n'est copié depuis une autre opportunité : ni suivi, ni note, ni historique.
    // Double envoi : la page envoie l'empreinte du prospect qu'elle affiche (Empreinte, qui inclut ses opportunités).
    // Sous le verrou du prospect, un deuxième envoi identique trouve une empreinte déjà changée par le premier : il
    // est refusé, et une seule opportunité est créée. Deux créations voulues restent possibles : la page rechargée
    // après la première porte la nouvelle empreinte.
    public async Task<ResultatService<int>> CreerOpportuniteAsync(string utilisateurId, NouvelleOpportuniteSaisie saisie)
    {
        int? id = LireId(saisie.ProspectId, PrefixeProspect);
        if (id is null)
            return ResultatService<int>.NonTrouve();

        var conseiller = await CompteUtilisableAsync(utilisateurId);
        if (conseiller is null)
            return ResultatService<int>.Echec(MessageCompteInutilisable);

        string? titre = Texte(saisie.Titre);
        string? categorie = Texte(saisie.Categorie);
        var resultat = new ResultatService<int>();
        if (titre is null)
            resultat.Erreurs.Add(new ErreurChamp("titre", "Indiquez le projet d'achat."));
        else if (titre.Length > LongueurTitreOpportunite)
            resultat.Erreurs.Add(new ErreurChamp("titre", $"Le projet d'achat ne doit pas dépasser {LongueurTitreOpportunite} caractères."));
        if (categorie is not null && !EstDansListe(ReferentielsVente.Categories, categorie))
            resultat.Erreurs.Add(new ErreurChamp("categorie", "Type de véhicule inconnu."));
        EtapeVente? etape = LireEtape(Texte(saisie.Etape));
        if (etape is null)
            resultat.Erreurs.Add(new ErreurChamp("etape", "Choisissez l'étape initiale."));
        if (!resultat.Succes)
            return resultat;

        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted);
        var prospect = await VerrouillerDansSonDossierAsync(utilisateurId, id.Value);
        if (prospect is null)
            return ResultatService<int>.NonTrouve();
        if (saisie.Version != Empreinte(prospect))
            return ResultatService<int>.Echec(MessageConflitOpportunite);

        var maintenant = DateTime.UtcNow;
        var opportunite = new OpportuniteVente
        {
            ProspectId = prospect.Id,
            Titre = titre!,
            Categorie = categorie,
            Etape = etape!.Value,
            DateCreation = maintenant,
            DerniereActivite = maintenant,
        };
        _db.OpportunitesVente.Add(opportunite);
        try
        {
            await _db.SaveChangesAsync();
            await transaction.CommitAsync();
        }
        catch (DbUpdateException)
        {
            _db.ChangeTracker.Clear();
            return ResultatService<int>.Echec("L'enregistrement a échoué : l'opportunité n'a pas été créée. Réessayez dans un instant.");
        }
        return ResultatService<int>.Ok(opportunite.Id);
    }

    // ---------- Véhicules envisagés d'une opportunité enregistrée (fonctionnalité 21) ----------

    public const string PrefixeVehicule = "ve-";
    private const int LongueurMarqueVehicule = 40;
    private const int LongueurModeleVehicule = 60;
    private const int LongueurFinition = 60;
    private const int AnneeMinimum = 1980;

    // Noms des champs du formulaire « Véhicule envisagé » (attribut name).
    private static readonly string[] ChampsVehicule = ["marque", "modele", "annee", "finition"];

    // « 2024 Kia Sportage EX », comme le catalogue (soumissions-store.js, nomVehicule) ; sans année : « Kia Sportage ».
    public static string LibelleVehicule(VehiculeEnvisage v)
    {
        var morceaux = new List<string>();
        if (v.Annee is not null)
            morceaux.Add(v.Annee.Value.ToString(CultureInfo.InvariantCulture));
        morceaux.Add(v.Marque);
        morceaux.Add(v.Modele);
        if (v.Finition is not null)
            morceaux.Add(v.Finition);
        return string.Join(" ", morceaux);
    }

    private static string MessageConflitVehicule(string action) =>
        $"Ce dossier a été modifié entre-temps : le véhicule envisagé n'a pas été {action}. La page affiche maintenant "
        + "les valeurs actuelles ; refaites votre changement si besoin.";

    // Ajoute un véhicule envisagé à UNE opportunité du conseiller (son prospect, sa concession, l'opportunité de ce
    // prospect, contrôlés côté serveur). Marque et modèle obligatoires ; année et version facultatives.
    // Double envoi : comme pour une nouvelle opportunité (F18), la page envoie l'empreinte du prospect qu'elle affiche ;
    // sous le verrou, un deuxième envoi de la même page trouve une empreinte déjà changée par le premier et il est
    // refusé. Deux ajouts voulus restent possibles : la page rechargée après le premier porte la nouvelle empreinte.
    // Ni contact déclaré, ni étape, ni suivi, ni date d'activité, ni qualification.
    public async Task<ResultatService<int>> AjouterVehiculeAsync(string utilisateurId, VehiculeSaisie saisie)
    {
        int? idProspect = LireId(saisie.ProspectId, PrefixeProspect);
        int? idOpportunite = LireId(saisie.OpportuniteId, PrefixeOpportunite);
        if (idProspect is null || idOpportunite is null)
            return ResultatService<int>.NonTrouve();

        var conseiller = await CompteUtilisableAsync(utilisateurId);
        if (conseiller is null)
            return ResultatService<int>.Echec(MessageCompteInutilisable);

        var resultat = new ResultatService<int>();
        var valeurs = LireVehicule(saisie, ChampsVehicule.ToHashSet(), resultat.Erreurs);
        if (!resultat.Succes)
            return resultat;

        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted);
        var prospect = await VerrouillerDansSonDossierAsync(utilisateurId, idProspect.Value);
        var opportunite = prospect?.Opportunites.FirstOrDefault(o => o.Id == idOpportunite.Value);
        if (prospect is null || opportunite is null)
            return ResultatService<int>.NonTrouve();
        if (saisie.Version != Empreinte(prospect))
            return ResultatService<int>.Echec(MessageConflitVehicule("ajouté"));

        var vehicule = new VehiculeEnvisage
        {
            OpportuniteId = opportunite.Id,
            Marque = valeurs.Marque!,
            Modele = valeurs.Modele!,
            Annee = valeurs.Annee,
            Finition = valeurs.Finition,
        };
        _db.VehiculesEnvisages.Add(vehicule);
        try
        {
            await _db.SaveChangesAsync();
            await transaction.CommitAsync();
        }
        catch (DbUpdateException)
        {
            _db.ChangeTracker.Clear();
            return ResultatService<int>.Echec("L'enregistrement a échoué : le véhicule envisagé n'a pas été ajouté. Réessayez dans un instant.");
        }
        return ResultatService<int>.Ok(vehicule.Id);
    }

    // Modifie UN véhicule envisagé : il doit appartenir à l'opportunité envoyée, elle-même au prospect du conseiller.
    // Seuls les champs nommés dans saisie.Champs changent ; année ou version envoyée vide est effacée ; marque et
    // modèle ne peuvent pas être vidés. Une page périmée (empreinte changée) ne peut rien écraser.
    public async Task<ResultatService> ModifierVehiculeAsync(string utilisateurId, VehiculeSaisie saisie)
    {
        int? idProspect = LireId(saisie.ProspectId, PrefixeProspect);
        int? idOpportunite = LireId(saisie.OpportuniteId, PrefixeOpportunite);
        int? idVehicule = LireId(saisie.VehiculeId, PrefixeVehicule);
        if (idProspect is null || idOpportunite is null || idVehicule is null)
            return ResultatService.NonTrouve();

        var conseiller = await CompteUtilisableAsync(utilisateurId);
        if (conseiller is null)
            return ResultatService.Echec(MessageCompteInutilisable);

        var champs = (saisie.Champs ?? "").Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .Where(c => ChampsVehicule.Contains(c)).ToHashSet();
        var resultat = new ResultatService();
        var valeurs = LireVehicule(saisie, champs, resultat.Erreurs);
        if (!resultat.Succes)
            return resultat;

        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted);
        var trouve = await VehiculeDansSonDossierAsync(utilisateurId, idProspect.Value, idOpportunite.Value, idVehicule.Value);
        if (trouve.Prospect is null || trouve.Opportunite is null)
            return ResultatService.NonTrouve();
        // Page périmée (dossier changé, véhicule peut-être déjà retiré) : refus, rien n'est recréé ni modifié.
        if (saisie.Version != Empreinte(trouve.Prospect))
            return ResultatService.Echec(MessageConflitVehicule("modifié"));
        if (trouve.Vehicule is null)
            return ResultatService.NonTrouve();

        var vehicule = trouve.Vehicule;
        if (champs.Contains("marque"))
            vehicule.Marque = valeurs.Marque!;
        if (champs.Contains("modele"))
            vehicule.Modele = valeurs.Modele!;
        if (champs.Contains("annee"))
            vehicule.Annee = valeurs.Annee;
        if (champs.Contains("finition"))
            vehicule.Finition = valeurs.Finition;
        try
        {
            await _db.SaveChangesAsync();
            await transaction.CommitAsync();
        }
        catch (DbUpdateException)
        {
            _db.ChangeTracker.Clear();
            return ResultatService.Echec("L'enregistrement a échoué : le véhicule envisagé n'a pas été modifié. Réessayez dans un instant.");
        }
        return ResultatService.Ok();
    }

    // Retire UN véhicule envisagé de son opportunité (suppression de la ligne) : il n'est plus considéré pour ce projet.
    // Rien d'autre ne change : ni inventaire, ni opportunité, ni qualification, ni suivi. Même contrôle d'appartenance
    // et d'empreinte que la modification.
    public async Task<ResultatService> RetirerVehiculeAsync(string utilisateurId, VehiculeSaisie saisie)
    {
        int? idProspect = LireId(saisie.ProspectId, PrefixeProspect);
        int? idOpportunite = LireId(saisie.OpportuniteId, PrefixeOpportunite);
        int? idVehicule = LireId(saisie.VehiculeId, PrefixeVehicule);
        if (idProspect is null || idOpportunite is null || idVehicule is null)
            return ResultatService.NonTrouve();

        var conseiller = await CompteUtilisableAsync(utilisateurId);
        if (conseiller is null)
            return ResultatService.Echec(MessageCompteInutilisable);

        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted);
        var trouve = await VehiculeDansSonDossierAsync(utilisateurId, idProspect.Value, idOpportunite.Value, idVehicule.Value);
        if (trouve.Prospect is null || trouve.Opportunite is null)
            return ResultatService.NonTrouve();
        if (saisie.Version != Empreinte(trouve.Prospect))
            return ResultatService.Echec(MessageConflitVehicule("retiré"));
        if (trouve.Vehicule is null)
            return ResultatService.NonTrouve();

        _db.VehiculesEnvisages.Remove(trouve.Vehicule);
        try
        {
            await _db.SaveChangesAsync();
            await transaction.CommitAsync();
        }
        catch (DbUpdateException)
        {
            _db.ChangeTracker.Clear();
            return ResultatService.Echec("L'enregistrement a échoué : le véhicule envisagé n'a pas été retiré. Réessayez dans un instant.");
        }
        return ResultatService.Ok();
    }

    // Verrouille le prospect du conseiller, puis cherche l'opportunité DE CE prospect et le véhicule DE CETTE
    // opportunité. Chaque élément vaut null s'il n'est pas trouvé à sa place (jamais de repli sur un autre élément).
    private async Task<(Prospect? Prospect, OpportuniteVente? Opportunite, VehiculeEnvisage? Vehicule)> VehiculeDansSonDossierAsync(
        string utilisateurId, int idProspect, int idOpportunite, int idVehicule)
    {
        var prospect = await VerrouillerDansSonDossierAsync(utilisateurId, idProspect);
        var opportunite = prospect?.Opportunites.FirstOrDefault(o => o.Id == idOpportunite);
        var vehicule = opportunite?.VehiculesEnvisages.FirstOrDefault(v => v.Id == idVehicule);
        return (prospect, opportunite, vehicule);
    }

    private sealed record ValeursVehicule(string? Marque, string? Modele, int? Annee, string? Finition);

    // Lit et valide les champs envoyés (seulement ceux de la liste) ; les erreurs sont ajoutées à la liste donnée.
    private static ValeursVehicule LireVehicule(VehiculeSaisie s, HashSet<string> champs, List<ErreurChamp> erreurs)
    {
        string? marque = null;
        if (champs.Contains("marque"))
        {
            marque = Texte(s.Marque);
            if (marque is null)
                erreurs.Add(new ErreurChamp("marque", "Indiquez la marque."));
            else if (marque.Length > LongueurMarqueVehicule)
                erreurs.Add(new ErreurChamp("marque", $"Marque : {LongueurMarqueVehicule} caractères au plus."));
        }

        string? modele = null;
        if (champs.Contains("modele"))
        {
            modele = Texte(s.Modele);
            if (modele is null)
                erreurs.Add(new ErreurChamp("modele", "Indiquez le modèle."));
            else if (modele.Length > LongueurModeleVehicule)
                erreurs.Add(new ErreurChamp("modele", $"Modèle : {LongueurModeleVehicule} caractères au plus."));
        }

        string? finition = champs.Contains("finition") ? Texte(s.Finition) : null;
        if (finition is not null && finition.Length > LongueurFinition)
            erreurs.Add(new ErreurChamp("finition", $"Version : {LongueurFinition} caractères au plus."));

        int? annee = null;
        string? texteAnnee = champs.Contains("annee") ? Texte(s.Annee) : null;
        if (texteAnnee is not null)
        {
            int anneeMaximum = DateTime.UtcNow.Year + 2;
            bool lisible = int.TryParse(texteAnnee, NumberStyles.None, CultureInfo.InvariantCulture, out int nombre);
            if (!lisible || nombre < AnneeMinimum || nombre > anneeMaximum)
                erreurs.Add(new ErreurChamp("annee", $"Année : entre {AnneeMinimum} et {anneeMaximum}."));
            else
                annee = nombre;
        }
        return new ValeursVehicule(marque, modele, annee, finition);
    }

    // ---------- Qualification d'une opportunité enregistrée (fonctionnalité 20) ----------

    private const int LongueurMarques = 120;
    private const int LongueurRepriseDetail = 120;
    private const int LongueurObjections = 500;
    private const decimal BudgetMensuelMaximum = 10_000m;
    private static readonly int[] PlacesAdmises = [2, 4, 5, 7, 8];

    // Noms des champs du formulaire « Qualification » (attribut name) qu'on peut modifier.
    private static readonly string[] ChampsQualification =
    [
        "categorie", "etat", "marques", "modeles", "places", "caracteristiques", "utilisation", "budgetTotal", "budgetMensuel",
        "modeAchat", "miseDeFonds", "reprise", "repriseDetail", "horizon", "dateCible", "elementsDecision", "objections",
    ];

    private const string MessageConflitQualification =
        "Ce dossier a été modifié entre-temps : la qualification n'a pas été enregistrée. La page affiche maintenant les valeurs "
        + "actuelles ; refaites vos changements si besoin.";

    // Enregistre la qualification d'UNE opportunité du conseiller (contrôlée côté serveur : son prospect, sa concession,
    // l'opportunité de ce prospect). Seuls les champs nommés dans saisie.Champs changent ; un champ de la liste envoyé
    // vide efface la valeur (tout est facultatif). Ni contact déclaré, ni étape, ni suivi, ni date d'activité : la
    // qualification décrit le projet, elle ne dit pas qu'on a parlé au client. Tout ou rien, sous le verrou du prospect,
    // avec l'empreinte affichée par la page (une page périmée ne peut pas écraser une valeur plus récente).
    public async Task<ResultatService> QualifierAsync(string utilisateurId, QualificationSaisie saisie)
    {
        int? idProspect = LireId(saisie.ProspectId, PrefixeProspect);
        int? idOpportunite = LireId(saisie.OpportuniteId, PrefixeOpportunite);
        if (idProspect is null || idOpportunite is null)
            return ResultatService.NonTrouve();

        var conseiller = await CompteUtilisableAsync(utilisateurId);
        if (conseiller is null)
            return ResultatService.Echec(MessageCompteInutilisable);

        var champs = (saisie.Champs ?? "").Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .Where(c => ChampsQualification.Contains(c)).ToHashSet();
        var resultat = new ResultatService();
        var valeurs = LireQualification(saisie, champs, resultat);
        if (!resultat.Succes)
            return resultat;

        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted);
        var prospect = await VerrouillerDansSonDossierAsync(utilisateurId, idProspect.Value);
        var opportunite = prospect?.Opportunites.FirstOrDefault(o => o.Id == idOpportunite.Value);
        if (prospect is null || opportunite is null)
            return ResultatService.NonTrouve();
        if (saisie.Version != Empreinte(prospect))
            return ResultatService.Echec(MessageConflitQualification);

        AppliquerQualification(opportunite, champs, valeurs);
        try
        {
            await _db.SaveChangesAsync();
            await transaction.CommitAsync();
        }
        catch (DbUpdateException)
        {
            _db.ChangeTracker.Clear();
            return ResultatService.Echec("L'enregistrement a échoué : la qualification n'a pas été enregistrée. Réessayez dans un instant.");
        }
        return ResultatService.Ok();
    }

    // Valeurs lues et validées (seulement pour les champs envoyés) ; les erreurs sont ajoutées au résultat.
    private sealed record ValeursQualification(
        string? Categorie, string? Etat, string? Marques, string? Modeles, int? Places, string? Caracteristiques, string? Utilisation,
        decimal? BudgetTotal, decimal? BudgetMensuel, string? ModeAchat, decimal? MiseDeFonds, string? Reprise, string? RepriseDetail,
        string? Horizon, DateTime? DateCible, string? ElementsDecision, string? Objections);

    private static ValeursQualification LireQualification(QualificationSaisie s, HashSet<string> champs, ResultatService resultat)
    {
        void Erreur(string champ, string message) => resultat.Erreurs.Add(new ErreurChamp(champ, message));

        string? Cle(string champ, string? valeur, IReadOnlyList<(string Cle, string Libelle)> liste, string message)
        {
            string? v = Texte(valeur);
            if (!champs.Contains(champ) || v is null)
                return null;
            if (!EstDansListe(liste, v))
                Erreur(champ, message);
            return v;
        }
        string? TexteBorne(string champ, string? valeur, int longueur, string libelle)
        {
            string? v = Texte(valeur);
            if (!champs.Contains(champ) || v is null)
                return null;
            if (v.Length > longueur)
                Erreur(champ, $"{libelle} : {longueur} caractères au plus.");
            return v;
        }
        decimal? Montant(string champ, string? valeur, decimal maximum, string libelle)
        {
            string? v = Texte(valeur);
            if (!champs.Contains(champ) || v is null)
                return null;
            bool lisible = decimal.TryParse(v, NumberStyles.Number, CultureInfo.InvariantCulture, out decimal montant);
            if (!lisible || montant < 0 || montant > maximum)
            {
                Erreur(champ, $"{libelle} : un montant entre 0 et {maximum.ToString("N0", CultureFrancaise)} $.");
                return null;
            }
            return montant;
        }
        string? Cles(string champ, List<string> valeurs, IReadOnlyList<(string Cle, string Libelle)> liste, string message)
        {
            if (!champs.Contains(champ))
                return null;
            var retenues = valeurs.Select(Texte).Where(v => v is not null).Select(v => v!).Distinct().ToList();
            if (retenues.Any(v => !EstDansListe(liste, v)))
                Erreur(champ, message);
            return retenues.Count == 0 ? null : string.Join(",", retenues);
        }

        int? places = null;
        string? textePlaces = Texte(s.Places);
        if (champs.Contains("places") && textePlaces is not null)
        {
            bool lisible = int.TryParse(textePlaces, NumberStyles.None, CultureInfo.InvariantCulture, out int nombre);
            if (!lisible || !PlacesAdmises.Contains(nombre))
                Erreur("places", "Nombre de places inconnu.");
            else
                places = nombre;
        }

        DateTime? dateCible = null;
        string? texteDate = Texte(s.DateCible);
        if (champs.Contains("dateCible") && texteDate is not null)
        {
            bool lisible = DateTime.TryParseExact(texteDate, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out DateTime jour);
            if (!lisible || jour.Year < 2000 || jour > DateTime.Today.AddYears(10))
                Erreur("dateCible", "Date cible invalide.");
            else
                dateCible = jour;
        }

        // Marques et modèles : listes séparées par des virgules, gardées comme le conseiller les a écrites (sans doublon).
        string? marques = TexteBorne("marques", NormaliserListe(s.Marques), LongueurMarques, "Marques");
        string? modeles = TexteBorne("modeles", NormaliserListe(s.Modeles), LongueurModele, "Modèles");
        string? reprise = Cle("reprise", s.Reprise, ReferentielsVente.Reprises, "Réponse de reprise inconnue.");
        // Comme le formulaire : la précision de la reprise n'a de sens que si un véhicule est (peut-être) à reprendre.
        string? repriseDetail = TexteBorne("repriseDetail", s.RepriseDetail, LongueurRepriseDetail, "Précision de la reprise");

        return new ValeursQualification(
            Cle("categorie", s.Categorie, ReferentielsVente.Categories, "Catégorie inconnue."),
            Cle("etat", s.Etat, ReferentielsVente.Etats, "Choix neuf ou occasion inconnu."),
            marques,
            modeles,
            places,
            Cles("caracteristiques", s.Caracteristiques, ReferentielsVente.Caracteristiques, "Caractéristique inconnue."),
            Cle("utilisation", s.Utilisation, ReferentielsVente.Utilisations, "Utilisation inconnue."),
            Montant("budgetTotal", s.BudgetTotal, BudgetMaximum, "Budget total"),
            Montant("budgetMensuel", s.BudgetMensuel, BudgetMensuelMaximum, "Budget mensuel"),
            Cle("modeAchat", s.ModeAchat, ReferentielsVente.ModesAchat, "Mode d'achat inconnu."),
            Montant("miseDeFonds", s.MiseDeFonds, BudgetMaximum, "Mise de fonds"),
            reprise,
            repriseDetail,
            Cle("horizon", s.Horizon, ReferentielsVente.Horizons, "Horizon d'achat inconnu."),
            dateCible,
            Cles("elementsDecision", s.ElementsDecision, ReferentielsVente.ElementsDecision, "Élément de décision inconnu."),
            TexteBorne("objections", s.Objections, LongueurObjections, "Objections"));
    }

    // Écrit seulement les champs envoyés. Un titre automatique suit la catégorie et le modèle (même règle que ModifierAsync).
    private static void AppliquerQualification(OpportuniteVente o, HashSet<string> champs, ValeursQualification v)
    {
        bool titreAutomatique = o.Titre == TitreAutomatique(o.Modele, o.Categorie);
        if (champs.Contains("categorie")) o.Categorie = v.Categorie;
        if (champs.Contains("etat")) o.EtatVehicule = v.Etat;
        if (champs.Contains("marques")) o.Marques = v.Marques;
        if (champs.Contains("modeles")) o.Modele = v.Modeles;
        if (champs.Contains("places")) o.Places = v.Places;
        if (champs.Contains("caracteristiques")) o.Caracteristiques = v.Caracteristiques;
        if (champs.Contains("utilisation")) o.Utilisation = v.Utilisation;
        if (champs.Contains("budgetTotal")) o.BudgetTotal = v.BudgetTotal;
        if (champs.Contains("budgetMensuel")) o.BudgetMensuel = v.BudgetMensuel;
        if (champs.Contains("modeAchat")) o.ModeAchat = v.ModeAchat;
        if (champs.Contains("miseDeFonds")) o.MiseDeFonds = v.MiseDeFonds;
        if (champs.Contains("reprise"))
            o.Reprise = v.Reprise;
        // La précision ne vaut que si un véhicule est (peut-être) à reprendre ; non envoyée, elle garde sa valeur.
        if (o.Reprise is not ("oui" or "a-determiner"))
            o.RepriseDetail = null;
        else if (champs.Contains("repriseDetail"))
            o.RepriseDetail = v.RepriseDetail;
        if (champs.Contains("horizon")) o.Horizon = v.Horizon;
        if (champs.Contains("dateCible")) o.DateCible = v.DateCible;
        if (champs.Contains("elementsDecision")) o.ElementsDecision = v.ElementsDecision;
        if (champs.Contains("objections")) o.Objections = v.Objections;
        if (titreAutomatique)
            o.Titre = TitreAutomatique(o.Modele, o.Categorie);
    }

    // « a, b ,, a » devient « a, b » ; texte vide : null.
    private static string? NormaliserListe(string? texte) =>
        Texte(string.Join(", ", ListeTexte(texte)));

    // Liste enregistrée (virgules) relue en éléments, sans espaces superflus ni doublons.
    private static IReadOnlyList<string> ListeTexte(string? texte) =>
        (texte ?? "").Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).Distinct().ToList();

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
        var requete = _db.Prospects.Include(p => p.Opportunites).ThenInclude(o => o.VehiculesEnvisages).Where(p =>
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
            // Qualification (fonctionnalité 20) : une page qui ne l'affiche pas à jour ne peut plus rien enregistrer.
            texte.AppendJoin('|', o.EtatVehicule, o.Marques, o.Places, o.Caracteristiques, o.Utilisation,
                o.BudgetMensuel?.ToString(CultureInfo.InvariantCulture), o.ModeAchat, o.MiseDeFonds?.ToString(CultureInfo.InvariantCulture),
                o.Reprise, o.RepriseDetail, o.DateCible?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), o.ElementsDecision, o.Objections);
            // Véhicules envisagés (fonctionnalité 21). Rien n'est ajouté quand il n'y en a pas : l'empreinte d'un
            // dossier sans véhicule reste celle d'avant.
            foreach (var v in o.VehiculesEnvisages.OrderBy(v => v.Id))
            {
                texte.Append('~');
                texte.AppendJoin('|', v.Id, v.Marque, v.Modele, v.Annee, v.Finition);
            }
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

    // Création ou modification : seule la fin du message de refus change.
    private enum ContexteDoublon
    {
        Creation,
        Modification,
    }

    // Doublon = même courriel ou même téléphone dans la concession. Le nom seul ne suffit jamais :
    // deux personnes peuvent s'appeler pareil. On refuse l'enregistrement, sans rien fusionner.
    // La même règle est garantie par les index uniques (DealershipId, Courriel) et (DealershipId, TelephoneChiffres).
    // exclureId : le prospect en cours de modification, qui ne peut pas être son propre doublon.
    // Confidentialité (fonctionnalité 17) : le nom n'est donné que si le dossier existant est déjà accessible au
    // conseiller (le sien, dans sa concession). Pour le dossier d'un collègue, le message ne dit rien de plus que
    // « un dossier existe » : ni nom, ni coordonnées, ni identifiant, ni conseiller responsable.
    private async Task ChercherDoublonAsync(int concessionId, NouveauProspectSaisie s, int? exclureId, string utilisateurId,
        ContexteDoublon contexte, ResultatService resultat)
    {
        var autres = _db.Prospects.AsNoTracking().Where(p => p.DealershipId == concessionId);
        if (exclureId is not null)
            autres = autres.Where(p => p.Id != exclureId.Value);

        if (s.Courriel is not null)
        {
            var existant = await autres.FirstOrDefaultAsync(p => p.Courriel == s.Courriel);
            if (existant is not null)
                resultat.Erreurs.Add(new ErreurChamp("courriel", MessageDoublon("ce courriel", existant, utilisateurId, contexte)));
        }

        string? chiffres = TelephoneEnChiffres(s.Telephone);
        if (chiffres is not null)
        {
            var existant = await autres.FirstOrDefaultAsync(p => p.TelephoneChiffres == chiffres);
            if (existant is not null)
                resultat.Erreurs.Add(new ErreurChamp("telephone", MessageDoublon("ce téléphone", existant, utilisateurId, contexte)));
        }
    }

    // Message de refus d'un doublon. Prospect du conseiller : il peut déjà ouvrir sa fiche, le nom l'aide à le retrouver.
    // Prospect d'un collègue : message neutre, aucune donnée du dossier existant.
    private static string MessageDoublon(string coordonnee, Prospect existant, string utilisateurId, ContexteDoublon contexte)
    {
        string suite = contexte == ContexteDoublon.Creation
            ? "Aucune nouvelle fiche n'a été créée."
            : "Les modifications n'ont pas été enregistrées.";
        if (existant.ConseillerId == utilisateurId)
            return $"Un de vos prospects a déjà {coordonnee} : {existant.Prenom} {existant.Nom}. {suite}";
        return $"Un dossier correspondant à {coordonnee} existe déjà dans votre concession. {suite}";
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
