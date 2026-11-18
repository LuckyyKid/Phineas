using System.Security.Cryptography;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Rendering;
using Microsoft.EntityFrameworkCore;
using Phineas.Data;
using Phineas.Models.Constants;
using Phineas.Models.Entities;
using Phineas.Models.ViewModels.Admin;
using Phineas.Services.Commun;

namespace Phineas.Services.Admin;

public interface IServiceUtilisateurs
{
    Task<List<EmployeResume>> ListerAsync(int? dealershipId, string? recherche);
    Task<UtilisateursIndexViewModel> ObtenirIndexAsync(int? dealershipId, string? recherche);
    Task<UtilisateurFormViewModel> NouveauFormulaireAsync(int? dealershipId);
    Task<UtilisateurFormViewModel?> ObtenirFormulaireAsync(string id);
    Task RemplirListesAsync(UtilisateurFormViewModel vm);

    Task<ResultatService<string>> CreerAsync(UtilisateurFormViewModel vm);
    Task<ResultatService> ModifierAsync(UtilisateurFormViewModel vm, string idActeur);

    Task<ResultatService<bool>> BasculerActivationAsync(string id, string idActeur);

    Task<ResultatService<string>> ReinitialiserMotDePasseAsync(string id);
    Task<ResultatService> SupprimerAsync(string id, string idActeur);
}

public class ServiceUtilisateurs : IServiceUtilisateurs
{
    private readonly ApplicationDbContext _db;
    private readonly UserManager<ApplicationUser> _users;

    public ServiceUtilisateurs(ApplicationDbContext db, UserManager<ApplicationUser> users)
    {
        _db = db;
        _users = users;
    }

    public async Task<List<EmployeResume>> ListerAsync(int? dealershipId, string? recherche)
    {
        var requete = _db.Users.Include(u => u.Dealership).AsNoTracking().AsQueryable();

        if (dealershipId is not null)
            requete = requete.Where(u => u.DealershipId == dealershipId);

        if (!string.IsNullOrWhiteSpace(recherche))
        {
            var terme = recherche.Trim();
            requete = requete.Where(u =>
                u.FirstName.Contains(terme)
                || u.LastName.Contains(terme)
                || u.Email!.Contains(terme)
            );
        }

        var utilisateurs = await requete
            .OrderBy(u => u.Dealership == null ? "" : u.Dealership.Name)
            .ThenBy(u => u.LastName)
            .ThenBy(u => u.FirstName)
            .ToListAsync();

        var roles = await RolesParUtilisateurAsync();
        var maintenant = DateTimeOffset.UtcNow;

        return utilisateurs
            .Select(u =>
            {
                var role = roles.GetValueOrDefault(u.Id);
                return new EmployeResume
                {
                    Id = u.Id,
                    NomComplet = $"{u.FirstName} {u.LastName}",
                    Email = u.Email ?? "",
                    Role = role,
                    LibelleRole = AppRoles.Label(role),
                    DealershipId = u.DealershipId,
                    NomConcession = u.Dealership?.Name,
                    EstActif = u.IsActive,
                    EstVerrouille = u.LockoutEnd is not null && u.LockoutEnd > maintenant,
                    DoitChangerMotDePasse = u.MustChangePassword,
                    DerniereConnexion = u.LastLoginAt,
                };
            })
            .ToList();
    }

    public async Task<UtilisateursIndexViewModel> ObtenirIndexAsync(
        int? dealershipId,
        string? recherche
    )
    {
        return new UtilisateursIndexViewModel
        {
            Utilisateurs = await ListerAsync(dealershipId, recherche),
            DealershipId = dealershipId,
            Recherche = recherche,
            Concessions = await ListeConcessionsAsync(),
        };
    }

    public async Task<UtilisateurFormViewModel> NouveauFormulaireAsync(int? dealershipId)
    {
        var vm = new UtilisateurFormViewModel { DealershipId = dealershipId };
        await RemplirListesAsync(vm);
        return vm;
    }

    public async Task<UtilisateurFormViewModel?> ObtenirFormulaireAsync(string id)
    {
        var utilisateur = await _users.FindByIdAsync(id);
        if (utilisateur is null)
            return null;

        var roles = await _users.GetRolesAsync(utilisateur);
        var vm = new UtilisateurFormViewModel
        {
            Id = utilisateur.Id,
            Prenom = utilisateur.FirstName,
            Nom = utilisateur.LastName,
            Email = utilisateur.Email ?? "",
            Role = roles.FirstOrDefault() ?? AppRoles.Conseiller,
            DealershipId = utilisateur.DealershipId,
        };
        await RemplirListesAsync(vm);
        return vm;
    }

    public async Task RemplirListesAsync(UtilisateurFormViewModel vm)
    {
        vm.Roles = AppRoles
            .All.Select(r => new SelectListItem(AppRoles.Label(r), r, r == vm.Role))
            .ToList();
        vm.Concessions = await ListeConcessionsAsync();
    }

    public async Task<ResultatService<string>> CreerAsync(UtilisateurFormViewModel vm)
    {
        var validation = await ValiderAsync(vm, idExistant: null);
        if (!validation.Succes)
            return ResultatService<string>.Depuis(validation);

        var utilisateur = new ApplicationUser
        {
            UserName = vm.Email.Trim(),
            Email = vm.Email.Trim(),
            EmailConfirmed = true,
            FirstName = vm.Prenom.Trim(),
            LastName = vm.Nom.Trim(),
            DealershipId = vm.DealershipId,
            IsActive = true,
            MustChangePassword = true,
            CreatedAt = DateTime.UtcNow,
        };

        var motDePasse = GenererMotDePasseTemporaire();
        var creation = await _users.CreateAsync(utilisateur, motDePasse);
        if (!creation.Succeeded)
            return ResultatService<string>.Depuis(ResultatService.DepuisIdentity(creation));

        var ajoutRole = await _users.AddToRoleAsync(utilisateur, vm.Role);
        if (!ajoutRole.Succeeded)
        {
            await _users.DeleteAsync(utilisateur);
            return ResultatService<string>.Depuis(ResultatService.DepuisIdentity(ajoutRole));
        }

        return ResultatService<string>.Ok(motDePasse);
    }

    public async Task<ResultatService> ModifierAsync(UtilisateurFormViewModel vm, string idActeur)
    {
        var utilisateur = await _users.FindByIdAsync(vm.Id!);
        if (utilisateur is null)
            return ResultatService.NonTrouve();

        var validation = await ValiderAsync(vm, utilisateur.Id);
        if (!validation.Succes)
            return validation;

        var roleActuel = (await _users.GetRolesAsync(utilisateur)).FirstOrDefault();
        var changeRole = roleActuel != vm.Role;
        var changeConcession = utilisateur.DealershipId != vm.DealershipId;
        var changeEmail = !string.Equals(
            utilisateur.Email,
            vm.Email.Trim(),
            StringComparison.OrdinalIgnoreCase
        );

        if (utilisateur.Id == idActeur && (changeRole || changeConcession))
            return ResultatService.Echec(
                "Vous ne pouvez pas changer votre propre rôle ou concession.",
                nameof(vm.Role)
            );

        if (
            changeRole
            && roleActuel == AppRoles.SystemAdmin
            && utilisateur.IsActive
            && await NbAdminsActifsAsync() <= 1
        )
            return ResultatService.Echec(
                "C'est le dernier administrateur actif : son rôle ne peut pas changer.",
                nameof(vm.Role)
            );

        utilisateur.FirstName = vm.Prenom.Trim();
        utilisateur.LastName = vm.Nom.Trim();
        utilisateur.DealershipId = vm.DealershipId;
        if (changeEmail)
        {
            utilisateur.Email = vm.Email.Trim();
            utilisateur.UserName = vm.Email.Trim();
            utilisateur.NormalizedEmail = _users.NormalizeEmail(utilisateur.Email);
            utilisateur.NormalizedUserName = _users.NormalizeName(utilisateur.UserName);
        }

        var maj = await _users.UpdateAsync(utilisateur);
        if (!maj.Succeeded)
            return ResultatService.DepuisIdentity(maj);

        if (changeRole)
        {
            if (roleActuel is not null)
                await _users.RemoveFromRoleAsync(utilisateur, roleActuel);
            await _users.AddToRoleAsync(utilisateur, vm.Role);
        }

        if (changeRole || changeConcession || changeEmail)
            await _users.UpdateSecurityStampAsync(utilisateur);

        return ResultatService.Ok();
    }

    public async Task<ResultatService<bool>> BasculerActivationAsync(string id, string idActeur)
    {
        var utilisateur = await _users.FindByIdAsync(id);
        if (utilisateur is null)
            return ResultatService<bool>.NonTrouve();

        if (utilisateur.Id == idActeur)
            return ResultatService<bool>.Echec(
                "Vous ne pouvez pas désactiver votre propre compte."
            );

        if (
            utilisateur.IsActive
            && await _users.IsInRoleAsync(utilisateur, AppRoles.SystemAdmin)
            && await NbAdminsActifsAsync() <= 1
        )
            return ResultatService<bool>.Echec(
                "C'est le dernier administrateur actif : il ne peut pas être désactivé."
            );

        utilisateur.IsActive = !utilisateur.IsActive;
        var maj = await _users.UpdateAsync(utilisateur);
        if (!maj.Succeeded)
            return ResultatService<bool>.Depuis(ResultatService.DepuisIdentity(maj));

        await _users.UpdateSecurityStampAsync(utilisateur);
        return ResultatService<bool>.Ok(utilisateur.IsActive);
    }

    public async Task<ResultatService<string>> ReinitialiserMotDePasseAsync(string id)
    {
        var utilisateur = await _users.FindByIdAsync(id);
        if (utilisateur is null)
            return ResultatService<string>.NonTrouve();

        var motDePasse = GenererMotDePasseTemporaire();
        var jeton = await _users.GeneratePasswordResetTokenAsync(utilisateur);
        var reset = await _users.ResetPasswordAsync(utilisateur, jeton, motDePasse);
        if (!reset.Succeeded)
            return ResultatService<string>.Depuis(ResultatService.DepuisIdentity(reset));

        await _users.SetLockoutEndDateAsync(utilisateur, null);
        await _users.ResetAccessFailedCountAsync(utilisateur);
        utilisateur.MustChangePassword = true;
        await _users.UpdateAsync(utilisateur);

        return ResultatService<string>.Ok(motDePasse);
    }

    public async Task<ResultatService> SupprimerAsync(string id, string idActeur)
    {
        var utilisateur = await _users.FindByIdAsync(id);
        if (utilisateur is null)
            return ResultatService.NonTrouve();

        if (utilisateur.Id == idActeur)
            return ResultatService.Echec("Vous ne pouvez pas supprimer votre propre compte.");

        if (
            await _users.IsInRoleAsync(utilisateur, AppRoles.SystemAdmin)
            && utilisateur.IsActive
            && await NbAdminsActifsAsync() <= 1
        )
            return ResultatService.Echec(
                "C'est le dernier administrateur actif : il ne peut pas être supprimé."
            );

        if (await _db.HistoriquesStatut.AnyAsync(h => h.UtilisateurId == utilisateur.Id))
            return ResultatService.Echec(
                "Cette personne a déjà modifié des véhicules : son nom doit rester dans l'historique. Désactivez plutôt son compte."
            );

        var suppression = await _users.DeleteAsync(utilisateur);
        return suppression.Succeeded
            ? ResultatService.Ok()
            : ResultatService.DepuisIdentity(suppression);
    }

    private async Task<ResultatService> ValiderAsync(
        UtilisateurFormViewModel vm,
        string? idExistant
    )
    {
        if (!AppRoles.All.Contains(vm.Role))
            return ResultatService.Echec("Rôle invalide.", nameof(vm.Role));

        if (vm.Role == AppRoles.SystemAdmin)
        {
            vm.DealershipId = null;
        }
        else
        {
            if (vm.DealershipId is null)
                return ResultatService.Echec(
                    "Choisissez la concession de cette personne.",
                    nameof(vm.DealershipId)
                );
            if (!await _db.Dealerships.AnyAsync(d => d.Id == vm.DealershipId))
                return ResultatService.Echec(
                    "Cette concession n'existe pas.",
                    nameof(vm.DealershipId)
                );
        }

        var existant = await _users.FindByEmailAsync(vm.Email.Trim());
        if (existant is not null && existant.Id != idExistant)
            return ResultatService.Echec(
                "Ce courriel est déjà utilisé par un autre compte.",
                nameof(vm.Email)
            );

        return ResultatService.Ok();
    }

    private async Task<Dictionary<string, string>> RolesParUtilisateurAsync()
    {
        var paires = await (
            from ur in _db.UserRoles
            join r in _db.Roles on ur.RoleId equals r.Id
            select new { ur.UserId, r.Name }
        ).ToListAsync();
        return paires.GroupBy(p => p.UserId).ToDictionary(g => g.Key, g => g.First().Name!);
    }

    private async Task<int> NbAdminsActifsAsync()
    {
        var admins = await _users.GetUsersInRoleAsync(AppRoles.SystemAdmin);
        return admins.Count(a => a.IsActive);
    }

    private async Task<List<SelectListItem>> ListeConcessionsAsync()
    {
        return await _db
            .Dealerships.OrderBy(d => d.Name)
            .Select(d => new SelectListItem(
                d.IsActive ? d.Name : d.Name + " (suspendue)",
                d.Id.ToString()
            ))
            .ToListAsync();
    }

    private static string GenererMotDePasseTemporaire()
    {
        const string majuscules = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        const string minuscules = "abcdefghijkmnopqrstuvwxyz";
        const string chiffres = "23456789";
        const string symboles = "!@#$%*?";
        const string tous = majuscules + minuscules + chiffres + symboles;

        var caracteres = new List<char>
        {
            majuscules[RandomNumberGenerator.GetInt32(majuscules.Length)],
            minuscules[RandomNumberGenerator.GetInt32(minuscules.Length)],
            chiffres[RandomNumberGenerator.GetInt32(chiffres.Length)],
            symboles[RandomNumberGenerator.GetInt32(symboles.Length)],
        };
        while (caracteres.Count < 12)
            caracteres.Add(tous[RandomNumberGenerator.GetInt32(tous.Length)]);

        for (var i = caracteres.Count - 1; i > 0; i--)
        {
            var j = RandomNumberGenerator.GetInt32(i + 1);
            (caracteres[i], caracteres[j]) = (caracteres[j], caracteres[i]);
        }
        return new string(caracteres.ToArray());
    }
}
