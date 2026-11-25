using System.ComponentModel.DataAnnotations;

namespace Phineas.Models.Entities;

// Ce qui est arrivé à un rendez-vous commercial après sa création (fonctionnalité 23).
public enum TypeEvenementRendezVous
{
    // Type, modalité, lieu, objectif ou commentaire changés ; l'horaire ne bouge pas.
    Modification,

    // Nouvel horaire (et éventuellement nouvelle durée) : l'ancien est gardé dans AncienDebutUtc et AncienneDureeMinutes.
    Replanification,

    // Le rendez-vous ne doit plus avoir lieu.
    Annulation,

    // Le conseiller déclare que la rencontre a eu lieu (déclaration, pas une preuve de présence).
    Realisation,

    // Le conseiller déclare que la rencontre n'a pas eu lieu, le client étant absent.
    Absence,
}

// Une ligne de l'historique d'un rendez-vous commercial. Écrite par ServiceProspects dans la même transaction que le
// changement qu'elle décrit ; jamais modifiée ni supprimée ensuite (elle disparaît seulement avec son opportunité).
// Ce n'est pas un contact avec le client : elle n'apparaît que dans le rendez-vous, jamais dans les échanges.
public class EvenementRendezVousCommercial
{
    public int Id { get; set; }

    public int RendezVousId { get; set; }
    public RendezVousCommercial? RendezVous { get; set; }

    public TypeEvenementRendezVous Type { get; set; }

    // Moment réel de l'opération, en UTC (pas l'heure prévue du rendez-vous), et utilisateur qui l'a faite.
    public DateTime Date { get; set; } = DateTime.UtcNow;

    [Required, MaxLength(450)]
    public string AuteurId { get; set; } = string.Empty;
    public ApplicationUser? Auteur { get; set; }

    // Replanification seulement : horaire avant et après (instants UTC, durées en minutes).
    public DateTime? AncienDebutUtc { get; set; }
    public int? AncienneDureeMinutes { get; set; }
    public DateTime? NouveauDebutUtc { get; set; }
    public int? NouvelleDureeMinutes { get; set; }

    // Modification seulement : libellés des informations changées (ex. « Modalité, Lieu »).
    [MaxLength(200)]
    public string? Champs { get; set; }
}
