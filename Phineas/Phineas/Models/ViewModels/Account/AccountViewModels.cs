using System.ComponentModel.DataAnnotations;

namespace Phineas.Models.ViewModels.Account;

public class LoginViewModel
{
    [Required(ErrorMessage = "Le courriel est requis.")]
    [EmailAddress(ErrorMessage = "Adresse courriel invalide.")]
    [Display(Name = "Courriel")]
    public string Email { get; set; } = "";

    [Required(ErrorMessage = "Le mot de passe est requis.")]
    [DataType(DataType.Password)]
    [Display(Name = "Mot de passe")]
    public string Password { get; set; } = "";

    [Display(Name = "Se souvenir de moi")]
    public bool RememberMe { get; set; }
}

public class UserSummaryViewModel
{
    public string FirstName { get; set; } = "";
    public string FullName { get; set; } = "";
    public string Email { get; set; } = "";
    public string? Role { get; set; }
    public string RoleLabel { get; set; } = "";
    public string? DealershipName { get; set; }
    public DateTime? LastLoginAt { get; set; }
}
