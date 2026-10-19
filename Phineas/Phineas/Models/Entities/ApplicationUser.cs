using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.AspNetCore.Identity;

namespace Phineas.Models.Entities;

public class ApplicationUser : IdentityUser
{
    [Required, MaxLength(100)]
    public string FirstName { get; set; } = "";

    [Required, MaxLength(100)]
    public string LastName { get; set; } = "";

    public int? DealershipId { get; set; }
    public Dealership? Dealership { get; set; }

    public bool IsActive { get; set; } = true;

    public bool MustChangePassword { get; set; }

    public DateTime? LastLoginAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [NotMapped]
    public string FullName => $"{FirstName} {LastName}";
}
