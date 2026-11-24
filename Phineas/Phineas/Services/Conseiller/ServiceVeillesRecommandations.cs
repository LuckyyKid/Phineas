using System.Data;
using System.Globalization;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Phineas.Data;
using Phineas.Models.Entities;
using Phineas.Models.ViewModels.Conseiller;
using Phineas.Services.Commun;

namespace Phineas.Services.Conseiller;

// Mise en veille persistante et réversible d'une recommandation commerciale (fonctionnalité 14).
// Appelé par IntelligenceController (MettreEnVeille, ReactiverVeille) et, pour la lecture, par
// ServiceIntelligenceCommercialeDemo (veilles actives envoyées au moteur du navigateur avec les autres données).
// Une veille n'est jamais une réalisation : ce service n'écrit que dans la table VeillesRecommandation.
public interface IServiceVeillesRecommandations
{
    // Veilles actives du conseiller, sur ses opportunités encore accessibles (expiration évaluée maintenant).
    Task<IReadOnlyList<VeilleRecommandationVue>> ActivesAsync(string conseillerId);

    // Valeur : la fin prévue (UTC) de la veille créée ou ajustée.
    Task<ResultatService<DateTime>> MettreEnVeilleAsync(string utilisateurId, string? cleRecommandation, int jours, string? etapeAffichee);

    // Valeur : true si une veille active a été réactivée, false si la recommandation n'était déjà plus en veille.
    Task<ResultatService<bool>> ReactiverAsync(string utilisateurId, string? cleRecommandation);
}

public class ServiceVeillesRecommandations : IServiceVeillesRecommandations
{
    // « regle:oe-12 » ou « regle:oe-12:2026-11-20 » (même forme que les identifiants de intelligence-regles.js).
    private static readonly Regex FormeCle = new(@"^(?<regle>[a-z-]{1,60}):oe-(?<opp>[1-9][0-9]{0,9})(?::(?<jour>[0-9]{4}-[0-9]{2}-[0-9]{2}))?$");

    private const string MessageCompteInutilisable =
        "Votre compte n'est rattaché à aucune concession active : la recommandation ne peut pas être mise en veille.";

    private readonly ApplicationDbContext _db;

    public ServiceVeillesRecommandations(ApplicationDbContext db)
    {
        _db = db;
    }

    // Morceaux d'une clé valide pour une veille : règle autorisée, opportunité, jour si la règle en porte un.
    public record CleLue(string Regle, int OpportuniteId, DateTime? Jour);

    // Lit et vérifie une clé sans consulter la base : forme, règle de la liste ReferentielsIntelligence.ReglesVeille,
    // jour présent seulement pour une règle datée, et jamais après demain (le jour est celui du navigateur).
    public static CleLue? LireCle(string? cle, DateTime maintenantUtc)
    {
        if (cle is null)
            return null;
        var morceaux = FormeCle.Match(cle);
        if (!morceaux.Success)
            return null;

        string regle = morceaux.Groups["regle"].Value;
        if (!ReferentielsIntelligence.ReglesVeille.Contains(regle))
            return null;
        if (!int.TryParse(morceaux.Groups["opp"].Value, NumberStyles.None, CultureInfo.InvariantCulture, out int opportuniteId))
            return null;

        bool regleDatee = ReferentielsIntelligence.ReglesVeilleDatees.Contains(regle);
        bool aUnJour = morceaux.Groups["jour"].Success;
        if (regleDatee != aUnJour)
            return null;
        if (!aUnJour)
            return new CleLue(regle, opportuniteId, null);

        bool jourLisible = DateTime.TryParseExact(morceaux.Groups["jour"].Value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out DateTime jour);
        if (!jourLisible || jour > maintenantUtc.Date.AddDays(1))
            return null;
        return new CleLue(regle, opportuniteId, jour);
    }

    // ---------- Lecture ----------

    public async Task<IReadOnlyList<VeilleRecommandationVue>> ActivesAsync(string conseillerId)
    {
        var maintenant = DateTime.UtcNow;
        // Même règle d'accès que la liste des prospects : dossier du conseiller, dans sa concession actuelle.
        var veilles = await _db.VeillesRecommandation.AsNoTracking()
            .Where(v => v.ConseillerId == conseillerId && v.CleActive != null && v.FinUtc > maintenant)
            .Where(v => v.Opportunite!.Etape == v.EtapeAuDebut)
            .Where(v => v.Opportunite!.Prospect!.ConseillerId == conseillerId
                && v.Opportunite.Prospect.DealershipId == v.Opportunite.Prospect.Conseiller!.DealershipId
                && v.DealershipId == v.Opportunite.Prospect.DealershipId)
            .OrderBy(v => v.Id)
            .ToListAsync();

        var vues = new List<VeilleRecommandationVue>();
        foreach (var v in veilles)
        {
            vues.Add(new VeilleRecommandationVue(
                v.CleRecommandation,
                ServiceProspects.PrefixeOpportunite + v.OpportuniteId,
                v.Regle,
                DateTime.SpecifyKind(v.DebutUtc, DateTimeKind.Utc),
                DateTime.SpecifyKind(v.FinUtc, DateTimeKind.Utc)));
        }
        return vues;
    }

    // ---------- Mise en veille ----------

    public async Task<ResultatService<DateTime>> MettreEnVeilleAsync(string utilisateurId, string? cleRecommandation, int jours, string? etapeAffichee)
    {
        var maintenant = DateTime.UtcNow;
        var cle = LireCle(cleRecommandation, maintenant);
        if (cle is null)
            return ResultatService<DateTime>.NonTrouve();
        if (!ReferentielsIntelligence.DureesVeilleJours.Contains(jours))
            return ResultatService<DateTime>.Echec("Choisissez une durée de veille proposée.");

        var conseiller = await CompteUtilisableAsync(utilisateurId);
        if (conseiller is null)
            return ResultatService<DateTime>.Echec(MessageCompteInutilisable);

        // Même transaction et même verrou (ligne du prospect parent) que les autres écritures du dossier.
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted);
        var opportunite = await VerrouillerOpportuniteAsync(utilisateurId, cle.OpportuniteId);
        if (opportunite is null)
            return ResultatService<DateTime>.NonTrouve();

        if (opportunite.Etape is EtapeVente.Gagne or EtapeVente.Perdu)
            return ResultatService<DateTime>.Echec("Cette opportunité est clôturée : elle n'a plus de recommandation à mettre en veille.");
        // Page ouverte avant un changement d'étape : la recommandation affichée n'est peut-être plus la bonne.
        if (etapeAffichee != opportunite.Etape.ToString())
            return ResultatService<DateTime>.Echec("Le dossier a changé entre-temps (nouvelle étape). Actualisez la page, puis réessayez si la recommandation est toujours proposée.");

        var fin = maintenant.AddHours(24 * jours);
        var ouverte = await _db.VeillesRecommandation
            .FirstOrDefaultAsync(v => v.ConseillerId == utilisateurId && v.CleActive == cleRecommandation);

        bool encoreActive = ouverte is not null && ouverte.FinUtc > maintenant && ouverte.EtapeAuDebut == opportunite.Etape;
        try
        {
            if (ouverte is not null && encoreActive)
            {
                // Déjà en veille : on ajuste la durée, sans créer une deuxième veille.
                ouverte.FinUtc = fin;
                ouverte.ModifieeLeUtc = maintenant;
            }
            else
            {
                // Une ancienne veille expirée ou invalidée (étape changée) est close d'abord (enregistrée avant
                // l'ajout, pour respecter l'index unique), puis la nouvelle est ouverte, dans la même transaction.
                if (ouverte is not null)
                {
                    ouverte.CleActive = null;
                    await _db.SaveChangesAsync();
                }
                _db.VeillesRecommandation.Add(new VeilleRecommandation
                {
                    DealershipId = conseiller.DealershipId!.Value,
                    ConseillerId = utilisateurId,
                    OpportuniteId = opportunite.Id,
                    Regle = cle.Regle,
                    CleRecommandation = cleRecommandation!,
                    CleActive = cleRecommandation,
                    EtapeAuDebut = opportunite.Etape,
                    DebutUtc = maintenant,
                    FinUtc = fin,
                });
            }
            await _db.SaveChangesAsync();
            await transaction.CommitAsync();
        }
        catch (DbUpdateException)
        {
            // Index unique : une autre demande identique a ouvert la veille au même moment. Rien n'est doublé.
            _db.ChangeTracker.Clear();
            return ResultatService<DateTime>.Echec("L'enregistrement a échoué : la recommandation n'a pas été mise en veille. Actualisez la page, puis réessayez.");
        }
        return ResultatService<DateTime>.Ok(fin);
    }

    // ---------- Réactivation ----------

    public async Task<ResultatService<bool>> ReactiverAsync(string utilisateurId, string? cleRecommandation)
    {
        var maintenant = DateTime.UtcNow;
        var cle = LireCle(cleRecommandation, maintenant);
        if (cle is null)
            return ResultatService<bool>.NonTrouve();

        var conseiller = await CompteUtilisableAsync(utilisateurId);
        if (conseiller is null)
            return ResultatService<bool>.Echec(MessageCompteInutilisable);

        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted);
        var opportunite = await VerrouillerOpportuniteAsync(utilisateurId, cle.OpportuniteId);
        if (opportunite is null)
            return ResultatService<bool>.NonTrouve();

        var ouverte = await _db.VeillesRecommandation
            .FirstOrDefaultAsync(v => v.ConseillerId == utilisateurId && v.CleActive == cleRecommandation);
        // Déjà réactivée (double clic, autre onglet) ou jamais en veille : rien à faire, ce n'est pas une erreur.
        if (ouverte is null)
            return ResultatService<bool>.Ok(false);

        bool etaitActive = ouverte.FinUtc > maintenant && ouverte.EtapeAuDebut == opportunite.Etape;
        ouverte.CleActive = null;
        if (etaitActive)
            ouverte.ReactiveeLeUtc = maintenant;

        try
        {
            await _db.SaveChangesAsync();
            await transaction.CommitAsync();
        }
        catch (DbUpdateException)
        {
            _db.ChangeTracker.Clear();
            return ResultatService<bool>.Echec("L'enregistrement a échoué : la recommandation n'a pas été réactivée. Réessayez dans un instant.");
        }
        return ResultatService<bool>.Ok(etaitActive);
    }

    // ---------- Accès ----------

    // Le conseiller, s'il est actif et rattaché à une concession active ; sinon null (même règle que ServiceProspects).
    private async Task<ApplicationUser?> CompteUtilisableAsync(string utilisateurId)
    {
        var conseiller = await _db.Users.Include(u => u.Dealership).FirstOrDefaultAsync(u => u.Id == utilisateurId);
        bool compteUtilisable = conseiller is not null
            && conseiller.IsActive
            && conseiller.Dealership is not null
            && conseiller.Dealership.IsActive;
        return compteUtilisable ? conseiller : null;
    }

    // Verrouille la ligne du prospect parent (comme ServiceProspects) puis relit l'opportunité, seulement si elle est
    // dans un dossier du conseiller, dans sa concession actuelle. Sinon null : même réponse pour « inexistante » et
    // « appartient à quelqu'un d'autre ».
    private async Task<OpportuniteVente?> VerrouillerOpportuniteAsync(string utilisateurId, int opportuniteId)
    {
        int? prospectId = await _db.OpportunitesVente.Where(o => o.Id == opportuniteId).Select(o => (int?)o.ProspectId).FirstOrDefaultAsync();
        if (prospectId is null)
            return null;
        await _db.Database.ExecuteSqlInterpolatedAsync($"SELECT Id FROM Prospects WHERE Id = {prospectId.Value} FOR UPDATE");
        return await _db.OpportunitesVente
            .Where(o => o.Id == opportuniteId
                && o.Prospect!.ConseillerId == utilisateurId
                && o.Prospect.DealershipId == o.Prospect.Conseiller!.DealershipId)
            .FirstOrDefaultAsync();
    }
}
