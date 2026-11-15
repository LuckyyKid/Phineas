using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
using Phineas.Data;
using Phineas.Models.Entities;

namespace Phineas.Services.Account;

public static class AppClaims
{
    public const string FullName = "full_name";
    public const string DealershipId = "dealership_id";
    public const string DealershipName = "dealership_name";
}

public class AppClaimsPrincipalFactory : UserClaimsPrincipalFactory<ApplicationUser, IdentityRole>
{
    private readonly ApplicationDbContext _db;

    public AppClaimsPrincipalFactory(
        UserManager<ApplicationUser> userManager,
        RoleManager<IdentityRole> roleManager,
        IOptions<IdentityOptions> options,
        ApplicationDbContext db
    )
        : base(userManager, roleManager, options)
    {
        _db = db;
    }

    protected override async Task<ClaimsIdentity> GenerateClaimsAsync(ApplicationUser user)
    {
        var identity = await base.GenerateClaimsAsync(user);
        identity.AddClaim(new Claim(AppClaims.FullName, user.FullName));

        if (user.DealershipId is not null)
        {
            identity.AddClaim(
                new Claim(AppClaims.DealershipId, user.DealershipId.Value.ToString())
            );
            var dealership = await _db.Dealerships.FindAsync(user.DealershipId.Value);
            if (dealership is not null)
                identity.AddClaim(new Claim(AppClaims.DealershipName, dealership.Name));
        }
        return identity;
    }
}
