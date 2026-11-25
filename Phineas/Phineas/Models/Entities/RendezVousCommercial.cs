using System.ComponentModel.DataAnnotations;
using Phineas.Models.ViewModels.Conseiller;

namespace Phineas.Models.Entities;

// Rendez-vous commercial planifié pour UN projet d'achat (fonctionnalité 22). C'est une intention enregistrée dans
// Phineas : aucun calendrier externe, aucune invitation envoyée, aucun créneau ni véhicule réservé, aucune présence
// confirmée. Cycle de vie (fonctionnalité 23) : Planifie, puis Annule, Termine (réalisé, déclaré par le conseiller) ou
// ClientAbsent (absence déclarée), trois états définitifs. Aucun changement automatique : un rendez-vous dont l'heure
// est passée reste « Planifié » tant que le conseiller n'a rien déclaré.
// Écrit par ServiceProspects (PlanifierRendezVousAsync, ModifierRendezVousAsync, ReplanifierRendezVousAsync,
// ChangerStatutRendezVousAsync), toujours sous le verrou du prospect. Chaque changement est noté dans Evenements.
public class RendezVousCommercial
{
    public int Id { get; set; }

    // Le projet d'achat auquel il appartient ; le prospect, le conseiller et la concession s'en déduisent.
    public int OpportuniteId { get; set; }
    public OpportuniteVente? Opportunite { get; set; }

    // Un des types de rendez-vous existants, parmi ceux permis par F22 (ServiceProspects.TypesRendezVousPermis).
    public TypeRendezVous Type { get; set; }

    // Instant du début, en UTC, calculé par le serveur à partir de l'heure commerciale saisie dans le fuseau ci-dessous.
    public DateTime DebutUtc { get; set; }

    // Fuseau dans lequel l'heure a été saisie et doit être affichée (ex. « America/Toronto », voir FuseauCommercial).
    [Required, MaxLength(64)]
    public string Fuseau { get; set; } = string.Empty;

    // Minutes réellement écoulées entre le début et la fin (une des durées du module Rendez-vous).
    public int DureeMinutes { get; set; }

    // « concession », « telephone » ou « virtuel » (ReferentielsRendezVous.Modes).
    [Required, MaxLength(20)]
    public string Mode { get; set; } = string.Empty;

    [MaxLength(120)]
    public string? Lieu { get; set; }

    [MaxLength(200)]
    public string? Objectif { get; set; }

    [MaxLength(500)]
    public string? Commentaire { get; set; }

    public DateTime DateCreation { get; set; } = DateTime.UtcNow;

    // Un des statuts permis par F23 (ServiceProspects.StatutsRendezVousPersistants). Les rendez-vous créés avant F23
    // reçoivent « Planifie » par la migration AjoutCycleVieRendezVous.
    public StatutRendezVous Statut { get; set; } = StatutRendezVous.Planifie;

    // Dernier changement (modification, replanification ou statut), en UTC ; null tant qu'il n'y en a pas eu.
    public DateTime? DateModification { get; set; }

    // Changements enregistrés, du plus ancien au plus récent (jamais effacés, même après annulation).
    public ICollection<EvenementRendezVousCommercial> Evenements { get; set; } = new List<EvenementRendezVousCommercial>();
}
