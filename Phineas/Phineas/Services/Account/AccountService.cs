using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Phineas.Data;
using Phineas.Models.Constants;
using Phineas.Models.Entities;
using Phineas.Models.ViewModels.Account;

namespace Phineas.Services.Account;

public enum LoginResult
{
    Success,
    InvalidCredentials,
    LockedOut,
    AccountDisabled,
    DealershipSuspended,
}

public interface IAccountService
{
    Task<LoginResult> LoginAsync(string email, string password, bool rememberMe);
    Task LogoutAsync();

    string GetLandingController(ClaimsPrincipal user);

    Task<UserSummaryViewModel?> GetSummaryAsync(ClaimsPrincipal user);

    string MessageFor(LoginResult result);
}

public class AccountService : IAccountService
{
    private readonly UserManager<ApplicationUser> _users;
    private readonly SignInManager<ApplicationUser> _signIn;
    private readonly ApplicationDbContext _db;

    public AccountService(
        UserManager<ApplicationUser> users,
        SignInManager<ApplicationUser> signIn,
        ApplicationDbContext db
    )
    {
        _users = users;
        _signIn = signIn;
        _db = db;
    }

    public async Task<LoginResult> LoginAsync(string email, string password, bool rememberMe)
    {
        var user = await _users.FindByEmailAsync(email.Trim());
        if (user is null)
            return LoginResult.InvalidCredentials;

        var check = await _signIn.CheckPasswordSignInAsync(user, password, lockoutOnFailure: true);
        if (check.IsLockedOut)
            return LoginResult.LockedOut;
        if (!check.Succeeded)
            return LoginResult.InvalidCredentials;

        if (!user.IsActive)
            return LoginResult.AccountDisabled;

        if (user.DealershipId is not null)
        {
            var dealership = await _db.Dealerships.FindAsync(user.DealershipId.Value);
            if (dealership is null || !dealership.IsActive)
                return LoginResult.DealershipSuspended;
        }

        user.LastLoginAt = DateTime.UtcNow;
        await _users.UpdateAsync(user);

        await _signIn.SignInAsync(user, isPersistent: rememberMe);
        return LoginResult.Success;
    }

    public Task LogoutAsync() => _signIn.SignOutAsync();

    public string GetLandingController(ClaimsPrincipal user)
    {
        var role = AppRoles.Of(user);
        var space = AppRoles.Spaces.FirstOrDefault(s => s.Role == role);
        return space.Controller ?? "Home";
    }

    public async Task<UserSummaryViewModel?> GetSummaryAsync(ClaimsPrincipal principal)
    {
        var user = await _users.GetUserAsync(principal);
        if (user is null)
            return null;

        var role = (await _users.GetRolesAsync(user)).FirstOrDefault();
        string? dealershipName = null;
        if (user.DealershipId is not null)
            dealershipName = (await _db.Dealerships.FindAsync(user.DealershipId.Value))?.Name;

        return new UserSummaryViewModel
        {
            Id = user.Id,
            FirstName = user.FirstName,
            FullName = user.FullName,
            Email = user.Email ?? "",
            Role = role,
            RoleLabel = AppRoles.Label(role),
            DealershipName = dealershipName,
            LastLoginAt = user.LastLoginAt,
        };
    }

    public string MessageFor(LoginResult result) =>
        result switch
        {
            LoginResult.LockedOut =>
                "Compte verrouillé après plusieurs tentatives. Réessayez dans 15 minutes.",
            LoginResult.AccountDisabled =>
                "Ce compte est désactivé. Communiquez avec votre directeur.",
            LoginResult.DealershipSuspended =>
                "L'accès de votre concession est suspendu. Communiquez avec l'administrateur de la plateforme.",
            _ => "Courriel ou mot de passe invalide.",
        };
}
