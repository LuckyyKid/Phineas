using Microsoft.EntityFrameworkCore;
using Phineas.Data;
using Phineas.Models.Constants;
using Phineas.Models.Entities;

namespace Phineas.Services.Vehicules;

public record ResultatChangement(bool Succes, string? Erreur = null)
{
    public static ResultatChangement Ok() => new(true);
    public static ResultatChangement Echec(string erreur) => new(false, erreur);
}

public interface IServiceStatut
{
    IReadOnlyList<StatutVehicule> TransitionsPermises(StatutVehicule actuel, string? role);

    Task<ResultatChangement> ChangerStatutAsync(
        int vehiculeId, int dealershipId, StatutVehicule nouveau,
        string utilisateurId, string? role, string? commentaire);
}

public class ServiceStatut : IServiceStatut
{
    private readonly ApplicationDbContext _db;

    public ServiceStatut(ApplicationDbContext db) => _db = db;

    // Diagramme d'états : (de, vers) → rôles autorisés
    private static readonly Dictionary<(StatutVehicule De, StatutVehicule Vers), string[]> Transitions = new()
    {
        [(StatutVehicule.Recu,               StatutVehicule.EnInspection)]       = [AppRoles.Mecanicien, AppRoles.Directeur],
        [(StatutVehicule.EnInspection,       StatutVehicule.InspectionTerminee)] = [AppRoles.Mecanicien, AppRoles.Directeur],
        [(StatutVehicule.InspectionTerminee, StatutVehicule.NettoyageEnCours)]   = [AppRoles.Mecanicien, AppRoles.Directeur],
        [(StatutVehicule.InspectionTerminee, StatutVehicule.PretPourVente)]      = [AppRoles.Mecanicien, AppRoles.Directeur],
        [(StatutVehicule.NettoyageEnCours,   StatutVehicule.PretPourVente)]      = [AppRoles.Mecanicien, AppRoles.Directeur],
        [(StatutVehicule.PretPourVente,      StatutVehicule.EnInspection)]       = [AppRoles.Mecanicien, AppRoles.Directeur],
        [(StatutVehicule.PretPourVente,      StatutVehicule.Reserve)]            = [AppRoles.Conseiller, AppRoles.Directeur],
        [(StatutVehicule.Reserve,            StatutVehicule.PretPourVente)]      = [AppRoles.Conseiller, AppRoles.Directeur],
        [(StatutVehicule.Reserve,            StatutVehicule.Vendu)]              = [AppRoles.Directeur],
        [(StatutVehicule.Vendu,              StatutVehicule.Livre)]              = [AppRoles.Conseiller, AppRoles.Directeur],
    };

    public IReadOnlyList<StatutVehicule> TransitionsPermises(StatutVehicule actuel, string? role) =>
        Transitions
            .Where(t => t.Key.De == actuel && role is not null && t.Value.Contains(role))
            .Select(t => t.Key.Vers)
            .ToList();

    public async Task<ResultatChangement> ChangerStatutAsync(
        int vehiculeId, int dealershipId, StatutVehicule nouveau,
        string utilisateurId, string? role, string? commentaire)
    {
        // Filtré par concession : impossible de toucher au véhicule d'une autre concession
        var vehicule = await _db.Vehicules
            .FirstOrDefaultAsync(v => v.Id == vehiculeId && v.DealershipId == dealershipId);

        if (vehicule is null)
            return ResultatChangement.Echec("Véhicule introuvable.");

        if (!TransitionsPermises(vehicule.StatutActuel, role).Contains(nouveau))
            return ResultatChangement.Echec("Cette transition de statut n'est pas permise.");

        _db.HistoriquesStatut.Add(new HistoriqueStatut
        {
            VehiculeId = vehicule.Id,
            AncienStatut = vehicule.StatutActuel,
            NouveauStatut = nouveau,
            UtilisateurId = utilisateurId,
            Commentaire = string.IsNullOrWhiteSpace(commentaire) ? null : commentaire.Trim(),
        });
        vehicule.StatutActuel = nouveau;

        // Un seul SaveChanges = les deux écritures réussissent ou échouent ensemble
        await _db.SaveChangesAsync();

        // TODO : diffuser le changement via SignalR
        return ResultatChangement.Ok();
    }
}