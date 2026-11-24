using System.ComponentModel.DataAnnotations;

namespace Phineas.Models.Entities;

// Comment un suivi a quitté la place de prochaine action d'une opportunité.
public enum ClotureSuivi
{
    // Le conseiller a déclaré l'action faite (« Marquer comme réalisé ») : déclaration, pas une preuve automatique.
    Realise,

    // Une nouvelle action a été planifiée à sa place : l'ancienne n'est PAS comptée comme accomplie.
    Remplace,
}

// Une prochaine action terminée ou remplacée. L'action courante reste dans OpportuniteVente.ProchaineAction ;
// cette table ne garde que les actions qui ont quitté cette place. Écrite par ServiceProspects (RealiserSuiviAsync,
// PlanifierSuiviAsync, AjouterNoteAsync) dans la même transaction que le changement de l'action courante.
public class HistoriqueSuiviOpportunite
{
    public int Id { get; set; }

    public int OpportuniteId { get; set; }
    public OpportuniteVente? Opportunite { get; set; }

    // Action et date prévue telles qu'elles étaient enregistrées (même convention que DateProchaineAction).
    [Required, MaxLength(120)]
    public string Action { get; set; } = string.Empty;

    public DateTime? DatePrevue { get; set; }

    public ClotureSuivi Cloture { get; set; }

    // Moment réel de la clôture, en UTC, et utilisateur qui l'a faite.
    public DateTime DateCloture { get; set; } = DateTime.UtcNow;

    [Required, MaxLength(450)]
    public string AuteurId { get; set; } = string.Empty;
    public ApplicationUser? Auteur { get; set; }
}
