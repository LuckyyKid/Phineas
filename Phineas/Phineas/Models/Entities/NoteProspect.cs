using System.ComponentModel.DataAnnotations;

namespace Phineas.Models.Entities;

// Note ajoutée au dossier d'un prospect enregistré (onglet Historique de la fiche).
// Distincte du commentaire initial (Prospect.CommentaireInitial) et des changements d'étape (HistoriqueEtapeOpportunite).
// Écrite par ServiceProspects.AjouterNoteAsync ; jamais modifiée ni supprimée pour l'instant.
public class NoteProspect
{
    public int Id { get; set; }

    public int ProspectId { get; set; }
    public Prospect? Prospect { get; set; }

    // Opportunité concernée (menu « Concerne ») ; null : la note concerne le contact en général.
    public int? OpportuniteId { get; set; }
    public OpportuniteVente? Opportunite { get; set; }

    [Required, MaxLength(450)]
    public string AuteurId { get; set; } = string.Empty;
    public ApplicationUser? Auteur { get; set; }

    // Catégorie de la note : clé de ReferentielsVente.TypesNote (note, appel, courriel, visite).
    // C'est le résumé d'un échange, pas l'enregistrement d'un appel ou d'un courriel.
    [Required, MaxLength(20)]
    public string Type { get; set; } = "note";

    // Texte tel que saisi (fins de ligne ramenées à \n, espaces de début et de fin retirés).
    [Required, MaxLength(600)]
    public string Contenu { get; set; } = string.Empty;

    public DateTime DateCreation { get; set; } = DateTime.UtcNow;

    // Jeton unique du formulaire envoyé : le même envoi reçu deux fois (double clic, renvoi) ne crée qu'une note.
    [Required, MaxLength(64)]
    public string JetonSoumission { get; set; } = string.Empty;
}
