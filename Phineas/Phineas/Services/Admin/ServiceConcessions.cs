using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Phineas.Data;
using Phineas.Models.Constants;
using Phineas.Models.Entities;
using Phineas.Models.ViewModels.Admin;
using Phineas.Services.Commun;

namespace Phineas.Services.Admin;

public interface IServiceConcessions
{
    Task<List<ConcessionResume>> ListerAsync();
    Task<ConcessionDetailsViewModel?> ObtenirDetailsAsync(int id);
    Task<ConcessionFormViewModel?> ObtenirFormulaireAsync(int id);

    Task<ResultatService<int>> CreerAsync(ConcessionFormViewModel vm);
    Task<ResultatService> ModifierAsync(ConcessionFormViewModel vm);

    Task<ResultatService<bool>> BasculerActivationAsync(int id);
    Task<ConcessionSuppressionViewModel?> ObtenirSuppressionAsync(int id);
    Task<ResultatService> SupprimerAsync(int id);
}

public class ServiceConcessions : IServiceConcessions
{
    private readonly ApplicationDbContext _db;
    private readonly UserManager<ApplicationUser> _users;
    private readonly IServiceUtilisateurs _utilisateurs;

    public ServiceConcessions(
        ApplicationDbContext db,
        UserManager<ApplicationUser> users,
        IServiceUtilisateurs utilisateurs
    )
    {
        _db = db;
        _users = users;
        _utilisateurs = utilisateurs;
    }

    public async Task<List<ConcessionResume>> ListerAsync()
    {
        var concessions = await _db.Dealerships.AsNoTracking().OrderBy(d => d.Name).ToListAsync();

        var nbEmployes = await _db
            .Users.Where(u => u.DealershipId != null)
            .GroupBy(u => u.DealershipId!.Value)
            .Select(g => new { Id = g.Key, Nb = g.Count() })
            .ToDictionaryAsync(x => x.Id, x => x.Nb);

        var nbVehicules = await _db
            .Vehicules.GroupBy(v => v.DealershipId)
            .Select(g => new { Id = g.Key, Nb = g.Count() })
            .ToDictionaryAsync(x => x.Id, x => x.Nb);

        var directeurs = await DirecteursParConcessionAsync();

        return concessions
            .Select(d => new ConcessionResume
            {
                Id = d.Id,
                Nom = d.Name,
                EstActive = d.IsActive,
                NomDirecteur = directeurs.GetValueOrDefault(d.Id),
                NbEmployes = nbEmployes.GetValueOrDefault(d.Id),
                NbVehicules = nbVehicules.GetValueOrDefault(d.Id),
                DateCreation = d.CreatedAt,
            })
            .ToList();
    }

    public async Task<ConcessionDetailsViewModel?> ObtenirDetailsAsync(int id)
    {
        var resume = (await ListerAsync()).FirstOrDefault(c => c.Id == id);
        if (resume is null)
            return null;

        return new ConcessionDetailsViewModel
        {
            Concession = resume,
            Employes = await _utilisateurs.ListerAsync(id, null),
        };
    }

    public async Task<ConcessionFormViewModel?> ObtenirFormulaireAsync(int id)
    {
        var concession = await _db.Dealerships.FindAsync(id);
        return concession is null
            ? null
            : new ConcessionFormViewModel
            {
                Id = concession.Id,
                Nom = concession.Name,
                EstActive = concession.IsActive,
            };
    }

    public async Task<ConcessionSuppressionViewModel?> ObtenirSuppressionAsync(int id)
    {
        var concession = await _db.Dealerships.FindAsync(id);
        if (concession is null)
            return null;

        return new ConcessionSuppressionViewModel
        {
            Id = concession.Id,
            Nom = concession.Name,
            NbEmployes = await _db.Users.CountAsync(u => u.DealershipId == id),
            NbVehicules = await _db.Vehicules.CountAsync(v => v.DealershipId == id),
        };
    }

    public async Task<ResultatService<int>> CreerAsync(ConcessionFormViewModel vm)
    {
        var nom = vm.Nom.Trim();
        if (await NomDejaPrisAsync(nom, idExistant: null))
            return ResultatService<int>.Echec("Une concession porte déjà ce nom.", nameof(vm.Nom));

        var concession = new Dealership
        {
            Name = nom,
            IsActive = vm.EstActive,
            CreatedAt = DateTime.UtcNow,
        };
        _db.Dealerships.Add(concession);
        await _db.SaveChangesAsync();

        return ResultatService<int>.Ok(concession.Id);
    }

    public async Task<ResultatService> ModifierAsync(ConcessionFormViewModel vm)
    {
        var concession = await _db.Dealerships.FindAsync(vm.Id);
        if (concession is null)
            return ResultatService.NonTrouve();

        var nom = vm.Nom.Trim();
        if (await NomDejaPrisAsync(nom, concession.Id))
            return ResultatService.Echec("Une concession porte déjà ce nom.", nameof(vm.Nom));

        var suspendue = concession.IsActive && !vm.EstActive;
        concession.Name = nom;
        concession.IsActive = vm.EstActive;
        await _db.SaveChangesAsync();

        if (suspendue)
            await DeconnecterPersonnelAsync(concession.Id);
        return ResultatService.Ok();
    }

    public async Task<ResultatService<bool>> BasculerActivationAsync(int id)
    {
        var concession = await _db.Dealerships.FindAsync(id);
        if (concession is null)
            return ResultatService<bool>.NonTrouve();

        concession.IsActive = !concession.IsActive;
        await _db.SaveChangesAsync();

        if (!concession.IsActive)
            await DeconnecterPersonnelAsync(id);
        return ResultatService<bool>.Ok(concession.IsActive);
    }

    public async Task<ResultatService> SupprimerAsync(int id)
    {
        var resume = await ObtenirSuppressionAsync(id);
        if (resume is null)
            return ResultatService.NonTrouve();

        if (!resume.PeutSupprimer)
            return ResultatService.Echec(
                "Cette concession a encore du personnel ou des véhicules. Retirez-les d'abord, ou suspendez-la plutôt."
            );

        var concession = await _db.Dealerships.FindAsync(id);
        _db.Dealerships.Remove(concession!);
        await _db.SaveChangesAsync();
        return ResultatService.Ok();
    }

    private Task<bool> NomDejaPrisAsync(string nom, int? idExistant) =>
        _db.Dealerships.AnyAsync(d => d.Name == nom && d.Id != idExistant);

    private async Task DeconnecterPersonnelAsync(int dealershipId)
    {
        var personnel = await _db.Users.Where(u => u.DealershipId == dealershipId).ToListAsync();
        foreach (var personne in personnel)
            await _users.UpdateSecurityStampAsync(personne);
    }

    private async Task<Dictionary<int, string>> DirecteursParConcessionAsync()
    {
        var directeurs = await (
            from u in _db.Users
            join ur in _db.UserRoles on u.Id equals ur.UserId
            join r in _db.Roles on ur.RoleId equals r.Id
            where r.Name == AppRoles.Directeur && u.DealershipId != null
            select new
            {
                Id = u.DealershipId!.Value,
                u.FirstName,
                u.LastName,
            }
        ).ToListAsync();

        return directeurs
            .GroupBy(d => d.Id)
            .ToDictionary(
                g => g.Key,
                g => string.Join(", ", g.Select(d => $"{d.FirstName} {d.LastName}"))
            );
    }
}
