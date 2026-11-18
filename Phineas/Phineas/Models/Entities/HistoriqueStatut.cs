using System.ComponentModel.DataAnnotations;

namespace Phineas.Models.Entities;

public class HistoriqueStatut
{
    public int Id { get; set; }

    public StatutVehicule? AncienStatut { get; set; }

    public StatutVehicule NouveauStatut { get; set; }

    public DateTime DateHeure { get; set; } = DateTime.UtcNow;

    [MaxLength(500)]
    public string? Commentaire { get; set; }

    public int VehiculeId { get; set; }
    public Vehicule? Vehicule { get; set; }

    [Required]
    public string UtilisateurId { get; set; } = string.Empty;

    public ApplicationUser? Utilisateur { get; set; }
}
