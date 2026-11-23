using System.Net;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Phineas.Data;
using Phineas.Data.Seed;

namespace Phineas.Tests.Infrastructure;

// L'application complète (Program.cs) branchée sur une base MySQL jetable.
// Au démarrage, DbSeeder applique les migrations et crée les comptes de démonstration
// (appsettings.Development.json : Sophie Gagnon, conseillère ; Luc Bergeron, mécanicien ; etc.).
public sealed class ApplicationDeTest : WebApplicationFactory<Program>, IAsyncLifetime
{
    public BaseMySqlDeTest Base { get; } = new();

    // Désactivée par défaut ; un test l'active pour simuler une panne de la base.
    public PanneEnregistrement Panne { get; } = new() { EnPanne = false };

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.ConfigureServices(services =>
        {
            // Remplace la base de l'application par la base de test, et ajoute la panne simulée.
            services.ConfigureDbContext<ApplicationDbContext>(options =>
                options.UseMySql(Base.ChaineConnexion, BaseMySqlDeTest.VersionMySql).AddInterceptors(Panne)
            );
        });
    }

    public Task InitializeAsync() => Task.CompletedTask;

    async Task IAsyncLifetime.DisposeAsync()
    {
        await base.DisposeAsync();
        await Base.DisposeAsync();
    }

    // Client qui garde les cookies et ne suit pas les redirections (pour pouvoir les vérifier).
    public HttpClient NouveauClient() =>
        CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, HandleCookies = true });

    // Connexion réelle par le formulaire /Account/Login (jeton antiforgery compris).
    public async Task<HttpClient> ConnecterAsync(string courriel, string motDePasse = DbSeeder.DemoPassword)
    {
        var client = NouveauClient();
        string page = await client.GetStringAsync("/Account/Login");
        var champs = new Dictionary<string, string>
        {
            ["Email"] = courriel,
            ["Password"] = motDePasse,
            ["__RequestVerificationToken"] = JetonAntiforgery(page),
        };

        var reponse = await client.PostAsync("/Account/Login", new FormUrlEncodedContent(champs));
        if (reponse.StatusCode != HttpStatusCode.Redirect)
            throw new InvalidOperationException($"Connexion de {courriel} refusée : réponse {(int)reponse.StatusCode}.");
        return client;
    }

    public static string JetonAntiforgery(string html)
    {
        var trouve = Regex.Match(html, "name=\"__RequestVerificationToken\" type=\"hidden\" value=\"([^\"]+)\"");
        if (!trouve.Success)
            throw new InvalidOperationException("Jeton antiforgery introuvable dans la page.");
        return trouve.Groups[1].Value;
    }
}
