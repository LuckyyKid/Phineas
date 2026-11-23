using System.ComponentModel.DataAnnotations;

namespace Phineas.Models.Entities;

// Contact enregistré par un conseiller (module Prospects).
// Les besoins d'achat ne sont pas ici : ils appartiennent à chaque opportunité (OpportuniteVente).
// Créé par ServiceProspects.CreerAsync ; lu par ServiceProspects.ObtenirAsync.
public class Prospect
{
    public int Id { get; set; }

    // Concession du conseiller au moment de la création, jamais une valeur envoyée par le navigateur.
    public int DealershipId { get; set; }
    public Dealership? Dealership { get; set; }

    // Conseiller responsable du prospect.
    [Required, MaxLength(450)]
    public string ConseillerId { get; set; } = "";
    public ApplicationUser? Conseiller { get; set; }

    [Required, MaxLength(60)]
    public string Prenom { get; set; } = "";

    [Required, MaxLength(60)]
    public string Nom { get; set; } = "";

    // Courriel en minuscules, pour comparer les doublons.
    [MaxLength(120)]
    public string? Courriel { get; set; }

    // Téléphone tel que saisi (ex. 514-555-0100) et sa version à 10 chiffres pour les doublons.
    [MaxLength(20)]
    public string? Telephone { get; set; }

    [MaxLength(10)]
    public string? TelephoneChiffres { get; set; }

    // Clé de ReferentielsVente.MoyensContact (telephone, courriel, texto).
    [Required, MaxLength(20)]
    public string ContactPrefere { get; set; } = "";

    // Clé de ReferentielsVente.Sources.
    [Required, MaxLength(30)]
    public string Source { get; set; } = "";

    [MaxLength(120)]
    public string? SourceDetail { get; set; }

    // Commentaire saisi à la création (affiché comme une note dans l'historique).
    [MaxLength(500)]
    public string? CommentaireInitial { get; set; }

    public DateTime DateCreation { get; set; } = DateTime.UtcNow;

    public ICollection<OpportuniteVente> Opportunites { get; set; } = new List<OpportuniteVente>();
}
