using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Phineas.Models.Entities;

public class Vehicule
{
    public int Id { get; set; }

    [Required(ErrorMessage = "Le NIV est obligatoire.")]
    [MaxLength(17)]
    public string NIV { get; set; } = string.Empty;

    [Required(ErrorMessage = "Le numéro de stock est obligatoire.")]
    [MaxLength(20)]
    public string NumeroStock { get; set; } = string.Empty;

    [Required(ErrorMessage = "La marque est obligatoire.")]
    [MaxLength(50)]
    public string Marque { get; set; } = string.Empty;

    [Required(ErrorMessage = "Le modèle est obligatoire.")]
    [MaxLength(50)]
    public string Modele { get; set; } = string.Empty;

    public int Annee { get; set; }

    public int Kilometrage { get; set; }

    [MaxLength(50)]
    public string? Couleur { get; set; }

    [MaxLength(50)]
    public string? Carrosserie { get; set; }

    [MaxLength(50)]
    public string? Carburant { get; set; }

    [MaxLength(50)]
    public string? Transmission { get; set; }

    [MaxLength(50)]
    public string? Emplacement { get; set; }

    [Column(TypeName = "decimal(10,2)")]
    public decimal PrixDemande { get; set; }

    public StatutVehicule StatutActuel { get; set; } = StatutVehicule.Recu;

    public DateTime DateAjout { get; set; } = DateTime.UtcNow;

    // Clé étrangère et relation vers Dealership
    public int DealershipId { get; set; }
    public Dealership? Dealership { get; set; }

    // Relation 1 à 1 optionnelle avec CodeQR
    public CodeQR? CodeQR { get; set; }

    // Collection pour l'historique des statuts
    public ICollection<HistoriqueStatut> Historique { get; set; } = new List<HistoriqueStatut>();
}