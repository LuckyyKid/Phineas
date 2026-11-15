using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc.ModelBinding.Validation;
using Microsoft.AspNetCore.Mvc.Rendering;
using Phineas.Models.Constants;

namespace Phineas.Models.ViewModels.Admin;

public class EmployeResume
{
    public string Id { get; set; } = "";
    public string NomComplet { get; set; } = "";
    public string Email { get; set; } = "";
    public string? Role { get; set; }
    public string LibelleRole { get; set; } = "";
    public int? DealershipId { get; set; }
    public string? NomConcession { get; set; }
    public bool EstActif { get; set; }
    public bool EstVerrouille { get; set; }
    public bool DoitChangerMotDePasse { get; set; }
    public DateTime? DerniereConnexion { get; set; }

    public string Initiales =>
        string.Concat(
            NomComplet.Split(' ', StringSplitOptions.RemoveEmptyEntries).Take(2).Select(p => p[0])
        );
}

public class UtilisateurFormViewModel
{
    public string? Id { get; set; }

    [Required(ErrorMessage = "Le prénom est obligatoire.")]
    [MaxLength(100, ErrorMessage = "100 caractères au maximum.")]
    [Display(Name = "Prénom")]
    public string Prenom { get; set; } = "";

    [Required(ErrorMessage = "Le nom est obligatoire.")]
    [MaxLength(100, ErrorMessage = "100 caractères au maximum.")]
    [Display(Name = "Nom")]
    public string Nom { get; set; } = "";

    [Required(ErrorMessage = "Le courriel est obligatoire.")]
    [EmailAddress(ErrorMessage = "Adresse courriel invalide.")]
    [Display(Name = "Courriel")]
    public string Email { get; set; } = "";

    [Required(ErrorMessage = "Choisissez un rôle.")]
    [Display(Name = "Rôle")]
    public string Role { get; set; } = AppRoles.Conseiller;

    [Display(Name = "Concession")]
    public int? DealershipId { get; set; }

    [ValidateNever]
    public List<SelectListItem> Roles { get; set; } = new();

    [ValidateNever]
    public List<SelectListItem> Concessions { get; set; } = new();

    public bool EstModification => Id is not null;
}

public class UtilisateursIndexViewModel
{
    public List<EmployeResume> Utilisateurs { get; set; } = new();
    public int? DealershipId { get; set; }
    public string? Recherche { get; set; }
    public List<SelectListItem> Concessions { get; set; } = new();
}
