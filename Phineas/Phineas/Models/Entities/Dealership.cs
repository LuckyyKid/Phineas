using System.ComponentModel.DataAnnotations;

namespace Phineas.Models.Entities;

public class Dealership
{
    public int Id { get; set; }

    [Required, MaxLength(150)]
    public string Name { get; set; } = "";

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<ApplicationUser> Staff { get; set; } = new List<ApplicationUser>();
}
