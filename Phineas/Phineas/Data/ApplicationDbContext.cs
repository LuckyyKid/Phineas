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
    }
}
