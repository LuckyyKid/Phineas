namespace Phineas.Models.Entities;

public class CodeQR
{
    public int Id { get; set; }

    public Guid Jeton { get; set; } = Guid.NewGuid();

    public DateTime DateGeneration { get; set; } = DateTime.UtcNow;

    public int VehiculeId { get; set; }
    public Vehicule? Vehicule { get; set; }
}
