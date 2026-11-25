using System.ComponentModel.DataAnnotations;

namespace Phineas.Models.Entities;

// Essai routier planifié pour UN projet d'achat (fonctionnalité 24). C'est un enregistrement commercial interne :
// aucun véhicule d'inventaire réservé, aucune clé attribuée, aucun permis ni assurance vérifiés, aucune présence
// confirmée, aucune invitation envoyée. Pas de statut : tout essai de F24 est planifié (le cycle de vie viendra avec F25).
// Entité distincte des rendez-vous (RendezVousCommercial) : un essai n'est ni modifié, ni annulé, ni compté dans
// rdvFutur par les règles des rendez-vous. Écrit par ServiceProspects.PlanifierEssaiRoutierAsync, sous le verrou du prospect.
public class EssaiRoutier
{
    public int Id { get; set; }

    // Le projet d'achat auquel il appartient ; le prospect, le conseiller et la concession s'en déduisent.
    public int OpportuniteId { get; set; }
    public OpportuniteVente? Opportunite { get; set; }

    // Véhicule envisagé de la même opportunité, choisi à la planification (facultatif). Si ce véhicule est retiré
    // ensuite (fonctionnalité 21), la référence devient vide et l'essai reste, avec son libellé ci-dessous.
    public int? VehiculeEnvisageId { get; set; }
    public VehiculeEnvisage? VehiculeEnvisage { get; set; }

    // Véhicule à essayer tel qu'il était au moment de la planification (« 2024 Kia Sportage EX », ou description libre).
    // Jamais une unité d'inventaire.
    [Required, MaxLength(200)]
    public string VehiculeLibelle { get; set; } = string.Empty;

    // Même convention que les rendez-vous (F22) : instant UTC du début, fuseau de saisie et d'affichage, minutes.
    public DateTime DebutUtc { get; set; }

    [Required, MaxLength(64)]
    public string Fuseau { get; set; } = string.Empty;

    public int DureeMinutes { get; set; }

    [MaxLength(500)]
    public string? Commentaire { get; set; }

    public DateTime DateCreation { get; set; } = DateTime.UtcNow;
}
