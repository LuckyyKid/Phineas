using System.ComponentModel.DataAnnotations;

namespace Phineas.Models.Entities;

// Véhicule qu'un client considère pour UN projet d'achat (fonctionnalité 21). Simple description saisie par le
// conseiller : ce n'est ni un véhicule de l'inventaire, ni une réservation, ni une soumission, et aucun prix n'est
// enregistré. Le libellé affiché suit la forme du catalogue (« 2024 Kia Sportage EX »). Écrit par ServiceProspects
// (AjouterVehiculeAsync, ModifierVehiculeAsync, RetirerVehiculeAsync), sous le verrou du prospect.
public class VehiculeEnvisage
{
    public int Id { get; set; }

    // Le projet d'achat auquel il appartient ; le prospect et la concession se déduisent de cette opportunité.
    public int OpportuniteId { get; set; }
    public OpportuniteVente? Opportunite { get; set; }

    [Required, MaxLength(40)]
    public string Marque { get; set; } = string.Empty;

    [Required, MaxLength(60)]
    public string Modele { get; set; } = string.Empty;

    // Facultatifs : année du modèle et version (finition), comme dans le catalogue.
    public int? Annee { get; set; }

    [MaxLength(60)]
    public string? Finition { get; set; }
}
