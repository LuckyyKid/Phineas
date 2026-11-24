using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Phineas.Models.Entities;

namespace Phineas.Data;

public class ApplicationDbContext : IdentityDbContext<ApplicationUser>
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
        : base(options) { }

    public DbSet<Dealership> Dealerships => Set<Dealership>();
    public DbSet<Vehicule> Vehicules => Set<Vehicule>();
    public DbSet<CodeQR> CodesQR => Set<CodeQR>();
    public DbSet<HistoriqueStatut> HistoriquesStatut => Set<HistoriqueStatut>();
    public DbSet<Prospect> Prospects => Set<Prospect>();
    public DbSet<OpportuniteVente> OpportunitesVente => Set<OpportuniteVente>();
    public DbSet<HistoriqueEtapeOpportunite> HistoriquesEtapeOpportunite => Set<HistoriqueEtapeOpportunite>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<Dealership>(e =>
        {
            e.HasIndex(d => d.Name).IsUnique();
        });

        builder.Entity<ApplicationUser>(e =>
        {
            e.HasOne(u => u.Dealership)
                .WithMany(d => d.Staff)
                .HasForeignKey(u => u.DealershipId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<Vehicule>(e =>
        {
            e.HasIndex(v => new { v.DealershipId, v.NIV }).IsUnique();
            e.HasIndex(v => new { v.DealershipId, v.NumeroStock }).IsUnique();

            e.Property(v => v.StatutActuel).HasConversion<string>().HasMaxLength(30);

            e.HasOne(v => v.Dealership)
                .WithMany()
                .HasForeignKey(v => v.DealershipId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<CodeQR>(e =>
        {
            e.HasIndex(c => c.Jeton).IsUnique();

            e.HasOne(c => c.Vehicule)
                .WithOne(v => v.CodeQR)
                .HasForeignKey<CodeQR>(c => c.VehiculeId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<HistoriqueStatut>(e =>
        {
            e.Property(h => h.AncienStatut).HasConversion<string>().HasMaxLength(30);
            e.Property(h => h.NouveauStatut).HasConversion<string>().HasMaxLength(30);

            e.HasOne(h => h.Vehicule)
                .WithMany(v => v.Historique)
                .HasForeignKey(h => h.VehiculeId)
                .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(h => h.Utilisateur)
                .WithMany()
                .HasForeignKey(h => h.UtilisateurId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<Prospect>(e =>
        {
            // Index pour la recherche de doublons dans une concession.
            e.HasIndex(p => new { p.DealershipId, p.Courriel });
            e.HasIndex(p => new { p.DealershipId, p.TelephoneChiffres });
            e.HasIndex(p => new { p.DealershipId, p.ConseillerId });

            e.HasOne(p => p.Dealership)
                .WithMany()
                .HasForeignKey(p => p.DealershipId)
                .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(p => p.Conseiller)
                .WithMany()
                .HasForeignKey(p => p.ConseillerId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<OpportuniteVente>(e =>
        {
            e.Property(o => o.Etape).HasConversion<string>().HasMaxLength(30);
            e.Property(o => o.BudgetTotal).HasPrecision(10, 2);

            e.HasOne(o => o.Prospect)
                .WithMany(p => p.Opportunites)
                .HasForeignKey(o => o.ProspectId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<HistoriqueEtapeOpportunite>(e =>
        {
            e.Property(h => h.AncienneEtape).HasConversion<string>().HasMaxLength(30);
            e.Property(h => h.NouvelleEtape).HasConversion<string>().HasMaxLength(30);

            e.HasOne(h => h.Opportunite)
                .WithMany(o => o.HistoriqueEtapes)
                .HasForeignKey(h => h.OpportuniteId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(h => h.Utilisateur)
                .WithMany()
                .HasForeignKey(h => h.UtilisateurId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }
}
