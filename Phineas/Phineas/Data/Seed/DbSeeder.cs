using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Phineas.Models.Constants;
using Phineas.Models.Entities;

namespace Phineas.Data.Seed;

public static class DbSeeder
{
    public const string DemoPassword = "Phineas2026!";

    public static async Task SeedAsync(IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var sp = scope.ServiceProvider;
        var db = sp.GetRequiredService<ApplicationDbContext>();
        var config = sp.GetRequiredService<IConfiguration>();
        var roles = sp.GetRequiredService<RoleManager<IdentityRole>>();
        var users = sp.GetRequiredService<UserManager<ApplicationUser>>();

        if (!db.Database.GetMigrations().Any())
            throw new InvalidOperationException(
                "Aucune migration trouvée. Dans le dossier Phineas.Web, lancez : "
                    + "dotnet ef migrations add InitialCreate -o Data/Migrations"
            );
        await db.Database.MigrateAsync();

        foreach (var role in AppRoles.All)
            if (!await roles.RoleExistsAsync(role))
                await roles.CreateAsync(new IdentityRole(role));

        var adminEmail = config["Seed:AdminEmail"];
        var adminPassword = config["Seed:AdminPassword"];
        if (
            !string.IsNullOrWhiteSpace(adminEmail)
            && !string.IsNullOrWhiteSpace(adminPassword)
            && await users.FindByEmailAsync(adminEmail) is null
        )
        {
            await CreateUserAsync(
                users,
                new ApplicationUser
                {
                    FirstName = config["Seed:AdminFirstName"] ?? "Admin",
                    LastName = config["Seed:AdminLastName"] ?? "Phineas",
                    Email = adminEmail,
                },
                adminPassword,
                AppRoles.SystemAdmin
            );
        }

        if (config.GetValue<bool>("Seed:DemoData") && !await db.Dealerships.AnyAsync())
        {
            var brossard = new Dealership { Name = "Auto Prestige Brossard" };
            var stLaurent = new Dealership { Name = "Garage Saint-Laurent", IsActive = false };
            db.Dealerships.AddRange(brossard, stLaurent);
            await db.SaveChangesAsync();

            await Staff(
                users,
                brossard,
                "Marc-André",
                "Tremblay",
                "ma.tremblay@autoprestige.example",
                AppRoles.Directeur
            );
            await Staff(
                users,
                brossard,
                "Sophie",
                "Gagnon",
                "sophie.gagnon@autoprestige.example",
                AppRoles.Conseiller
            );
            await Staff(
                users,
                brossard,
                "Luc",
                "Bergeron",
                "luc.bergeron@autoprestige.example",
                AppRoles.Mecanicien
            );

            await Staff(
                users,
                brossard,
                "Émilie",
                "Roy",
                "emilie.roy@autoprestige.example",
                AppRoles.Mecanicien,
                isActive: false
            );
            await Staff(
                users,
                stLaurent,
                "Paul",
                "Girard",
                "paul.girard@garagestl.example",
                AppRoles.Directeur
            );
        }
        
        if (config.GetValue<bool>("Seed:DemoData") && !await db.Vehicules.AnyAsync())
            await SeedVehiculesAsync(db, users);
    }
    
        private static async Task SeedVehiculesAsync(ApplicationDbContext db, UserManager<ApplicationUser> users)
    {
        var brossard = await db.Dealerships.FirstOrDefaultAsync(d => d.Name == "Auto Prestige Brossard");
        var directeur = await users.FindByEmailAsync("ma.tremblay@autoprestige.example");
        if (brossard is null || directeur is null) return;

        var vehicules = new[]
        {
            new Vehicule { NIV = "1HGCV1F30LA000001", NumeroStock = "STK-0042", Marque = "Honda",  Modele = "Accord",  Annee = 2020, Kilometrage = 48000, Couleur = "Gris",  Carrosserie = "Berline", Carburant = "Essence",    Transmission = "Automatique", PrixDemande = 24995m, Emplacement = "Zone B-12", StatutActuel = StatutVehicule.InspectionTerminee },
            new Vehicule { NIV = "2T1BURHE5KC000002", NumeroStock = "STK-0038", Marque = "Toyota", Modele = "Corolla", Annee = 2019, Kilometrage = 62000, Couleur = "Blanc", Carrosserie = "Berline", Carburant = "Essence",    Transmission = "Automatique", PrixDemande = 17495m, Emplacement = "Atelier 2", StatutActuel = StatutVehicule.EnInspection },
            new Vehicule { NIV = "5YJ3E1EA7LF000003", NumeroStock = "STK-0031", Marque = "Tesla",  Modele = "Model 3", Annee = 2021, Kilometrage = 35000, Couleur = "Noir",  Carrosserie = "Berline", Carburant = "Électrique", Transmission = "Automatique", PrixDemande = 38995m, Emplacement = "Zone A-04", StatutActuel = StatutVehicule.PretPourVente },
            new Vehicule { NIV = "1FTFW1E50MF000004", NumeroStock = "STK-0027", Marque = "Ford",   Modele = "F-150",   Annee = 2021, Kilometrage = 71000, Couleur = "Bleu",  Carrosserie = "Camion",  Carburant = "Essence",    Transmission = "Automatique", PrixDemande = 41995m, Emplacement = "Réception", StatutActuel = StatutVehicule.Recu },
        };

        foreach (var v in vehicules)
        {
            v.DealershipId = brossard.Id;
            v.CodeQR = new CodeQR();   // le Guid est généré tout seul
            v.Historique.Add(new HistoriqueStatut
            {
                AncienStatut = null,
                NouveauStatut = StatutVehicule.Recu,
                UtilisateurId = directeur.Id,
                Commentaire = "Véhicule reçu à la concession",
            });
        }

        db.Vehicules.AddRange(vehicules);
        await db.SaveChangesAsync();
    }

    private static Task Staff(
        UserManager<ApplicationUser> users,
        Dealership d,
        string first,
        string last,
        string email,
        string role,
        bool isActive = true
    ) =>
        CreateUserAsync(
            users,
            new ApplicationUser
            {
                FirstName = first,
                LastName = last,
                Email = email,
                DealershipId = d.Id,
                IsActive = isActive,
            },
            DemoPassword,
            role
        );

    private static async Task CreateUserAsync(
        UserManager<ApplicationUser> users,
        ApplicationUser user,
        string password,
        string role
    )
    {
        user.UserName = user.Email;
        user.EmailConfirmed = true;

        var result = await users.CreateAsync(user, password);
        if (!result.Succeeded)
            throw new InvalidOperationException(
                $"Impossible de créer {user.Email} : "
                    + string.Join(" ", result.Errors.Select(e => e.Description))
            );

        await users.AddToRoleAsync(user, role);
    }
}
