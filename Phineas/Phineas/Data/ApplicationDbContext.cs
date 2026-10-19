using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Phineas.Models.Entities;

namespace Phineas.Data;

public class ApplicationDbContext : IdentityDbContext<ApplicationUser>
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
        : base(options) { }

    public DbSet<Dealership> Dealerships => Set<Dealership>();

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
    }
}
