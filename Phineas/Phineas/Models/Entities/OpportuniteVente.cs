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

    // Qualification commerciale (fonctionnalité 20), en plus de Categorie, Modele, BudgetTotal et Horizon ci-dessus.
    // Tout est facultatif : une information absente reste null, jamais une valeur par défaut présentée comme dite
    // par le client. Valeurs fermées : clés de ReferentielsVente. Listes de clés : séparées par des virgules.
    [MaxLength(20)]
    public string? EtatVehicule { get; set; }

    [MaxLength(120)]
    public string? Marques { get; set; }

    public int? Places { get; set; }

    [MaxLength(200)]
    public string? Caracteristiques { get; set; }

    [MaxLength(20)]
    public string? Utilisation { get; set; }

    public decimal? BudgetMensuel { get; set; }

    [MaxLength(20)]
    public string? ModeAchat { get; set; }

    public decimal? MiseDeFonds { get; set; }

    [MaxLength(20)]
    public string? Reprise { get; set; }

    [MaxLength(120)]
    public string? RepriseDetail { get; set; }

    // Jour civil visé par le client (sans heure).
    public DateTime? DateCible { get; set; }

    [MaxLength(200)]
    public string? ElementsDecision { get; set; }

    [MaxLength(500)]
    public string? Objections { get; set; }

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

    // Véhicules que le client considère pour ce projet (fonctionnalité 21, voir VehiculeEnvisage).
    public ICollection<VehiculeEnvisage> VehiculesEnvisages { get; set; } = new List<VehiculeEnvisage>();

    // Rendez-vous commerciaux planifiés pour ce projet (fonctionnalité 22, voir RendezVousCommercial).
    public ICollection<RendezVousCommercial> RendezVous { get; set; } = new List<RendezVousCommercial>();

    // Essais routiers planifiés pour ce projet (fonctionnalité 24, voir EssaiRoutier).
    public ICollection<EssaiRoutier> EssaisRoutiers { get; set; } = new List<EssaiRoutier>();
}
