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
    public DbSet<NoteProspect> NotesProspect => Set<NoteProspect>();
    public DbSet<HistoriqueSuiviOpportunite> HistoriquesSuiviOpportunite => Set<HistoriqueSuiviOpportunite>();
    public DbSet<VehiculeEnvisage> VehiculesEnvisages => Set<VehiculeEnvisage>();
    public DbSet<RendezVousCommercial> RendezVousCommerciaux => Set<RendezVousCommercial>();
    public DbSet<EvenementRendezVousCommercial> EvenementsRendezVous => Set<EvenementRendezVousCommercial>();
    public DbSet<EssaiRoutier> EssaisRoutiers => Set<EssaiRoutier>();
    public DbSet<VeilleRecommandation> VeillesRecommandation => Set<VeilleRecommandation>();

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
            // Doublon = même courriel ou même téléphone dans une concession (ServiceProspects.ChercherDoublonAsync).
            // Index uniques (fonctionnalité 17) : la base garantit cette règle même si deux créations ou modifications
            // arrivent au même instant, sur une ou plusieurs instances. Un courriel ou un téléphone absent (null) reste
            // permis plusieurs fois ; deux concessions différentes ne se gênent jamais.
            e.HasIndex(p => new { p.DealershipId, p.Courriel }).IsUnique();
            e.HasIndex(p => new { p.DealershipId, p.TelephoneChiffres }).IsUnique();
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
            // Qualification (fonctionnalité 20).
            e.Property(o => o.BudgetMensuel).HasPrecision(10, 2);
            e.Property(o => o.MiseDeFonds).HasPrecision(10, 2);
            e.Property(o => o.DateCible).HasColumnType("date");

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

        // Véhicules envisagés (fonctionnalité 21) : ils disparaissent avec leur opportunité. Aucun lien vers l'inventaire.
        builder.Entity<VehiculeEnvisage>(e =>
        {
            e.HasOne(v => v.Opportunite)
                .WithMany(o => o.VehiculesEnvisages)
                .HasForeignKey(v => v.OpportuniteId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // Rendez-vous commerciaux (fonctionnalité 22) : type gardé par son nom (comme l'étape) ; ils disparaissent avec
        // leur opportunité. Aucun lien vers un calendrier, un véhicule, une soumission ou une transaction.
        builder.Entity<RendezVousCommercial>(e =>
        {
            e.ToTable("RendezVousCommerciaux");
            e.Property(r => r.Type).HasConversion<string>().HasMaxLength(30);

            e.HasOne(r => r.Opportunite)
                .WithMany(o => o.RendezVous)
                .HasForeignKey(r => r.OpportuniteId)
                .OnDelete(DeleteBehavior.Cascade);

            // Statut (fonctionnalité 23), gardé par son nom. Les rendez-vous déjà enregistrés reçoivent « Planifie »
            // par la migration AjoutCycleVieRendezVous (valeur par défaut de la colonne).
            e.Property(r => r.Statut).HasConversion<string>().HasMaxLength(20);
        });

        // Essais routiers (fonctionnalité 24) : ils disparaissent avec leur opportunité, comme les rendez-vous. Le retrait
        // d'un véhicule envisagé (F21) ne supprime jamais un essai : la référence devient vide, le libellé reste.
        builder.Entity<EssaiRoutier>(e =>
        {
            e.ToTable("EssaisRoutiers");

            e.HasOne(x => x.Opportunite)
                .WithMany(o => o.EssaisRoutiers)
                .HasForeignKey(x => x.OpportuniteId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(x => x.VehiculeEnvisage)
                .WithMany()
                .HasForeignKey(x => x.VehiculeEnvisageId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // Historique des rendez-vous (fonctionnalité 23) : il disparaît avec son rendez-vous, donc avec l'opportunité ;
        // un utilisateur qui a écrit dans l'historique ne peut pas être supprimé (comme l'historique des suivis).
        builder.Entity<EvenementRendezVousCommercial>(e =>
        {
            e.ToTable("EvenementsRendezVousCommerciaux");
            e.Property(h => h.Type).HasConversion<string>().HasMaxLength(20);

            e.HasOne(h => h.RendezVous)
                .WithMany(r => r.Evenements)
                .HasForeignKey(h => h.RendezVousId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(h => h.Auteur)
                .WithMany()
                .HasForeignKey(h => h.AuteurId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<HistoriqueSuiviOpportunite>(e =>
        {
            e.Property(h => h.Cloture).HasConversion<string>().HasMaxLength(20);

            // L'historique d'un suivi disparaît avec son opportunité (comme l'historique des étapes).
            e.HasOne(h => h.Opportunite)
                .WithMany(o => o.HistoriqueSuivis)
                .HasForeignKey(h => h.OpportuniteId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(h => h.Auteur)
                .WithMany()
                .HasForeignKey(h => h.AuteurId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<VeilleRecommandation>(e =>
        {
            e.Property(v => v.EtapeAuDebut).HasConversion<string>().HasMaxLength(30);

            // Une seule veille ouverte par recommandation et par conseiller, garantie par la base (voir CleActive).
            e.HasIndex(v => new { v.ConseillerId, v.CleActive }).IsUnique();

            // Les veilles disparaissent avec leur opportunité ; un conseiller ou une concession ne se supprime pas
            // tant qu'il en a.
            e.HasOne(v => v.Opportunite)
                .WithMany()
                .HasForeignKey(v => v.OpportuniteId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(v => v.Conseiller)
                .WithMany()
                .HasForeignKey(v => v.ConseillerId)
                .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(v => v.Dealership)
                .WithMany()
                .HasForeignKey(v => v.DealershipId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<NoteProspect>(e =>
        {
            // Un même formulaire envoyé deux fois ne crée qu'une note (voir ServiceProspects.AjouterNoteAsync).
            e.HasIndex(n => new { n.ProspectId, n.JetonSoumission }).IsUnique();

            e.HasOne(n => n.Prospect)
                .WithMany(p => p.Notes)
                .HasForeignKey(n => n.ProspectId)
                .OnDelete(DeleteBehavior.Cascade);

            // Si l'opportunité disparaît, la note reste sur le prospect comme note générale (et ne bloque aucune suppression).
            e.HasOne(n => n.Opportunite)
                .WithMany()
                .HasForeignKey(n => n.OpportuniteId)
                .OnDelete(DeleteBehavior.SetNull);

            e.HasOne(n => n.Auteur)
                .WithMany()
                .HasForeignKey(n => n.AuteurId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }
}
