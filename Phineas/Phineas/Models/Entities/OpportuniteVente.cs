using System.ComponentModel.DataAnnotations;
using Phineas.Models.ViewModels.Conseiller;

namespace Phineas.Models.Entities;

// Projet d'achat d'un prospect enregistré : la section « Premier intérêt » du formulaire de création.
// Un prospect créé par le formulaire reçoit exactement une opportunité (voir ServiceProspects.CreerAsync).
public class OpportuniteVente
{
    public int Id { get; set; }

    public int ProspectId { get; set; }
    public Prospect? Prospect { get; set; }

    [Required, MaxLength(120)]
    public string Titre { get; set; } = "";

    public EtapeVente Etape { get; set; } = EtapeVente.Nouveau;

    // Clés de ReferentielsVente (Categories, Horizons) ; null si pas encore connu.
    [MaxLength(30)]
    public string? Categorie { get; set; }

    [MaxLength(80)]
    public string? Modele { get; set; }

    public decimal? BudgetTotal { get; set; }

    [MaxLength(30)]
    public string? Horizon { get; set; }

    [MaxLength(120)]
    public string? ProchaineAction { get; set; }

    // Date locale du prochain suivi (9 h, comme dans le JavaScript du module).
    public DateTime? DateProchaineAction { get; set; }

    public DateTime DateCreation { get; set; } = DateTime.UtcNow;
    public DateTime DerniereActivite { get; set; } = DateTime.UtcNow;

    // Changements d'étape effectifs, du plus ancien au plus récent (voir HistoriqueEtapeOpportunite).
    public ICollection<HistoriqueEtapeOpportunite> HistoriqueEtapes { get; set; } = new List<HistoriqueEtapeOpportunite>();

    // Prochaines actions réalisées ou remplacées (voir HistoriqueSuiviOpportunite).
    public ICollection<HistoriqueSuiviOpportunite> HistoriqueSuivis { get; set; } = new List<HistoriqueSuiviOpportunite>();
}
