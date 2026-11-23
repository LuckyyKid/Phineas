using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Phineas.Data;
using Phineas.Models.Entities;

namespace Phineas.Tests.Infrastructure;

// Base MySQL jetable : une base « phineas_test_xxxxxxxx » créée avec les vraies migrations,
// puis supprimée à la fin de la classe de tests. Ne touche jamais à la base « phineas ».
// Serveur : variable d'environnement PHINEAS_TEST_MYSQL, sinon le conteneur MySQL local du projet (port 3307).
public sealed class BaseMySqlDeTest : IAsyncLifetime
{
    private const string ServeurParDefaut = "Server=localhost;Port=3307;User=phineas;Password=phineas_dev_password;";
    public static readonly MySqlServerVersion VersionMySql = new(new Version(8, 4, 0));

    public string NomBase { get; } = "phineas_test_" + Guid.NewGuid().ToString("N").Substring(0, 8);

    public string ChaineConnexion
    {
        get
        {
            string serveur = Environment.GetEnvironmentVariable("PHINEAS_TEST_MYSQL") ?? ServeurParDefaut;
            return serveur + "Database=" + NomBase + ";";
        }
    }

    public ApplicationDbContext NouveauContexte(params IInterceptor[] intercepteurs)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseMySql(ChaineConnexion, VersionMySql)
            .AddInterceptors(intercepteurs)
            .Options;
        return new ApplicationDbContext(options);
    }

    public async Task InitializeAsync()
    {
        await using var db = NouveauContexte();
        await db.Database.MigrateAsync();
    }

    public async Task DisposeAsync()
    {
        await using var db = NouveauContexte();
        await db.Database.EnsureDeletedAsync();
    }

    // Crée une concession et un conseiller (sans mot de passe : suffisant pour appeler les services).
    public async Task<ApplicationUser> CreerConseillerAsync(bool concessionActive = true, bool avecConcession = true)
    {
        await using var db = NouveauContexte();
        string suffixe = Guid.NewGuid().ToString("N").Substring(0, 8);

        Dealership? concession = null;
        if (avecConcession)
        {
            concession = new Dealership { Name = "Concession " + suffixe, IsActive = concessionActive };
            db.Dealerships.Add(concession);
        }

        var conseiller = new ApplicationUser
        {
            UserName = "conseiller." + suffixe + "@exemple.test",
            Email = "conseiller." + suffixe + "@exemple.test",
            FirstName = "Conseiller",
            LastName = suffixe,
            Dealership = concession,
        };
        db.Users.Add(conseiller);
        await db.SaveChangesAsync();
        return conseiller;
    }
}

// Simule une panne de la base au moment d'enregistrer (ex. connexion perdue).
// Active seulement quand EnPanne vaut true, pour laisser passer l'initialisation de l'application.
public sealed class PanneEnregistrement : SaveChangesInterceptor
{
    public bool EnPanne { get; set; } = true;

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default
    )
    {
        if (EnPanne)
            throw new DbUpdateException("Panne simulée par le test.");
        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }
}

// Simule une base illisible, seulement pour les requêtes qui lisent la table Prospects
// (la connexion et le chargement du compte continuent de fonctionner). Active quand EnPanne vaut true.
public sealed class PanneLectureProspects : DbCommandInterceptor
{
    public bool EnPanne { get; set; }

    public override ValueTask<InterceptionResult<System.Data.Common.DbDataReader>> ReaderExecutingAsync(
        System.Data.Common.DbCommand command,
        CommandEventData eventData,
        InterceptionResult<System.Data.Common.DbDataReader> result,
        CancellationToken cancellationToken = default
    )
    {
        if (EnPanne && command.CommandText.Contains("`Prospects`"))
            throw new ErreurBaseSimulee();
        return base.ReaderExecutingAsync(command, eventData, result, cancellationToken);
    }
}

// DbException est abstraite : cette sous-classe représente l'erreur renvoyée par MySQL.
public sealed class ErreurBaseSimulee : System.Data.Common.DbException
{
    public ErreurBaseSimulee()
        : base("Lecture impossible (panne simulée par le test).") { }
}
