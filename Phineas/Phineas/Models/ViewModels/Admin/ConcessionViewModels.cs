using System.ComponentModel.DataAnnotations;

namespace Phineas.Models.ViewModels.Admin;

public class ConcessionResume
{
    public int Id { get; set; }
    public string Nom { get; set; } = "";
    public bool EstActive { get; set; }
    public string? NomDirecteur { get; set; }
    public int NbEmployes { get; set; }
    public int NbVehicules { get; set; }
    public DateTime DateCreation { get; set; }
}

public class ConcessionFormViewModel
{
    public int? Id { get; set; }

    [Required(ErrorMessage = "Le nom de la concession est obligatoire.")]
    [MaxLength(150, ErrorMessage = "150 caractères au maximum.")]
    [Display(Name = "Nom de la concession")]
    public string Nom { get; set; } = "";

    [Display(Name = "Concession active")]
    public bool EstActive { get; set; } = true;

    public bool EstModification => Id is not null;
}

public class ConcessionDetailsViewModel
{
    public ConcessionResume Concession { get; set; } = new();
    public List<EmployeResume> Employes { get; set; } = new();
}

public class ConcessionSuppressionViewModel
{
    public int Id { get; set; }
    public string Nom { get; set; } = "";
    public int NbEmployes { get; set; }
    public int NbVehicules { get; set; }
    public bool PeutSupprimer => NbEmployes == 0 && NbVehicules == 0;
}
