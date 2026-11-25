using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Phineas.Data;
using Phineas.Data.Seed;
using Phineas.Models.Entities;
using Phineas.Services.Account;
using Phineas.Services.Admin;
using Phineas.Services.Conseiller;
using Phineas.Services.Vehicules;

var builder = WebApplication.CreateBuilder(args);

var connectionString =
    builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("Chaîne de connexion 'DefaultConnection' introuvable.");

builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseMySql(connectionString, new MySqlServerVersion(new Version(8, 4, 0)))
);

builder.Services.AddScoped<IServiceStatut, ServiceStatut>();

builder
    .Services.AddIdentity<ApplicationUser, IdentityRole>(options =>
    {
        options.Password.RequiredLength = 10;
        options.Password.RequireDigit = true;
        options.Password.RequireLowercase = true;
        options.Password.RequireUppercase = true;
        options.Password.RequireNonAlphanumeric = true;

        options.Lockout.MaxFailedAccessAttempts = 5;
        options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);

        options.User.RequireUniqueEmail = true;
    })
    .AddEntityFrameworkStores<ApplicationDbContext>()
    .AddDefaultTokenProviders()
    .AddClaimsPrincipalFactory<AppClaimsPrincipalFactory>();

builder.Services.ConfigureApplicationCookie(options =>
{
    options.Cookie.Name = "Phineas.Auth";
    options.LoginPath = "/Account/Login";
    options.LogoutPath = "/Account/Logout";
    options.AccessDeniedPath = "/Account/AccessDenied";
    options.ExpireTimeSpan = TimeSpan.FromHours(8);
    options.SlidingExpiration = true;
});

builder.Services.Configure<SecurityStampValidatorOptions>(options =>
{
    options.ValidationInterval = TimeSpan.Zero;
});

builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build();
});

builder.Services.AddScoped<IAccountService, AccountService>();
builder.Services.AddScoped<IServiceUtilisateurs, ServiceUtilisateurs>();
builder.Services.AddScoped<IServiceConcessions, ServiceConcessions>();
// Horloge des données fictives vendeur (billet #87) : celle du système ; les tests la remplacent par une horloge fixe.
builder.Services.AddSingleton(TimeProvider.System);
// Données fictives (phase frontend vendeur) : remplacer par l'implémentation réelle.
builder.Services.AddScoped<IServiceTableauBordConseiller, ServiceTableauBordDemo>();
// Prospects : données fictives + prospects réellement enregistrés en base (création réelle).
builder.Services.AddScoped<ServiceProspectsDemo>();
builder.Services.AddScoped<IServiceProspects, ServiceProspects>();
builder.Services.AddScoped<IServiceSoumissions, ServiceSoumissionsDemo>();
builder.Services.AddScoped<IServiceRendezVous, ServiceRendezVousDemo>();
builder.Services.AddScoped<IServiceTransactions, ServiceTransactionsDemo>();
builder.Services.AddScoped<IServiceIntelligenceCommerciale, ServiceIntelligenceCommercialeDemo>();
builder.Services.AddScoped<IServiceVeillesRecommandations, ServiceVeillesRecommandations>();
builder.Services.AddScoped<IServiceRelationsClients, ServiceRelationsClientsDemo>();
builder.Services.AddScoped<IServiceOutilsVendeur, ServiceOutilsVendeurDemo>();

builder.Services.AddControllersWithViews();

var app = builder.Build();

await DbSeeder.SeedAsync(app.Services);

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();

app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllerRoute(name: "default", pattern: "{controller=Home}/{action=Index}/{id?}");

app.Run();

// Rend la classe visible pour les tests d'intégration (WebApplicationFactory<Program>).
public partial class Program { }
