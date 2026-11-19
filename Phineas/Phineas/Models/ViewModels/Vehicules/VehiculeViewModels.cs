using System.ComponentModel.DataAnnotations;
using Phineas.Models.Entities;

namespace Phineas.Models.ViewModels.Vehicules;

public class FicheVehiculeViewModel
{
    public int Id { get; set; }
    public Guid Jeton { get; set; }
    public string NumeroStock { get; set; } = "";
    public string NIV { get; set; } = "";
    public string Marque { get; set; } = "";
    public string Modele { get; set; } = "";
    public int Annee { get; set; }
    public string? Emplacement { get; set; }
    public StatutVehicule StatutActuel { get; set; }
    public IReadOnlyList<StatutVehicule> StatutsPermis { get; set; } = [];
}

public class ChangerStatutViewModel
{
    public int VehiculeId { get; set; }
    public Guid Jeton { get; set; }

    [Required(ErrorMessage = "Choisissez un nouveau statut.")]
    public StatutVehicule? NouveauStatut { get; set; }

    [MaxLength(500)]
    public string? Commentaire { get; set; }
}