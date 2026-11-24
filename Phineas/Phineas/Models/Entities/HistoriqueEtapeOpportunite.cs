using System.ComponentModel.DataAnnotations;
using Phineas.Models.ViewModels.Conseiller;

namespace Phineas.Models.Entities;

// Un changement d'étape effectif d'une opportunité enregistrée : qui, quand, de quelle étape vers quelle étape.
// Même forme que HistoriqueStatut (historique des véhicules). Écrit par ServiceProspects.ChangerEtapeAsync,
// dans la même transaction que la nouvelle étape ; affiché dans l'onglet Historique de la fiche.
public class HistoriqueEtapeOpportunite
{
    public int Id { get; set; }

    public int OpportuniteId { get; set; }
    public OpportuniteVente? Opportunite { get; set; }

    public EtapeVente AncienneEtape { get; set; }
    public EtapeVente NouvelleEtape { get; set; }

    public DateTime DateHeure { get; set; } = DateTime.UtcNow;

    [Required, MaxLength(450)]
    public string UtilisateurId { get; set; } = string.Empty;
    public ApplicationUser? Utilisateur { get; set; }
}
