using System.ComponentModel.DataAnnotations;

namespace Phineas.Models.Entities;

// Comment une version d'un suivi (action et date prévue) a quitté la place de prochaine action d'une opportunité.
public enum ClotureSuivi
{
    // Le conseiller a déclaré l'action faite (« Marquer comme réalisé ») : déclaration, pas une preuve automatique.
    Realise,

    // Une nouvelle action a été planifiée à sa place : l'ancienne n'est PAS comptée comme accomplie.
    Remplace,

    // La même action (même description) a reçu une nouvelle échéance : elle reste à faire.
    // Ni réalisée ni remplacée ; la nouvelle date est dans NouvelleDatePrevue.
    Reporte,
}

// Une version terminée, remplacée ou reportée de la prochaine action. L'action courante reste dans
// OpportuniteVente.ProchaineAction ; cette table garde les versions qui ont quitté cette place. Écrite par
// ServiceProspects (RealiserSuiviAsync, ReporterSuiviAsync, PlanifierSuiviAsync, AjouterNoteAsync) dans la même
// transaction que le changement de l'action courante.
public class HistoriqueSuiviOpportunite
{
    public int Id { get; set; }

    public int OpportuniteId { get; set; }
    public OpportuniteVente? Opportunite { get; set; }

    // Action et date prévue telles qu'elles étaient enregistrées (même convention que DateProchaineAction).
    [Required, MaxLength(120)]
    public string Action { get; set; } = string.Empty;

    public DateTime? DatePrevue { get; set; }

    // Seulement pour un report : la nouvelle échéance donnée à la même action (même convention de date).
    public DateTime? NouvelleDatePrevue { get; set; }

    public ClotureSuivi Cloture { get; set; }

    // Moment réel de la clôture, en UTC, et utilisateur qui l'a faite.
    public DateTime DateCloture { get; set; } = DateTime.UtcNow;

    [Required, MaxLength(450)]
    public string AuteurId { get; set; } = string.Empty;
    public ApplicationUser? Auteur { get; set; }
}
