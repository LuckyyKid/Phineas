using System.ComponentModel.DataAnnotations;
using Phineas.Models.ViewModels.Conseiller;

namespace Phineas.Models.Entities;

// Mise en veille temporaire d'une recommandation commerciale d'une opportunité enregistrée (fonctionnalité 14).
// Une veille retire la recommandation des priorités immédiates jusqu'à FinUtc ; ce n'est jamais une réalisation :
// elle ne touche ni le suivi courant, ni son historique, ni l'étape, ni les notes. Écrite par ServiceVeillesRecommandations.
//
// Identité : CleRecommandation est l'identifiant produit par le moteur du navigateur (intelligence-regles.js), par
// exemple « premiere-reponse:oe-12 » ou « opportunite-inactive:oe-12:2026-11-20 ». Il ne contient que la règle,
// l'opportunité et, pour certaines règles, le jour de la situation détectée : il reste le même d'un chargement à
// l'autre, et une nouvelle situation (nouveau jour) donne un nouvel identifiant, jamais masqué par une ancienne veille.
//
// Une veille est active si CleActive n'est pas nulle, si FinUtc n'est pas atteinte et si l'opportunité est toujours à
// EtapeAuDebut (un changement d'étape invalide la veille). L'expiration est évaluée à la lecture, sans tâche de fond.
public class VeilleRecommandation
{
    public int Id { get; set; }

    // Concession du dossier au moment de la veille (filtrage et intégrité entre concessions).
    public int DealershipId { get; set; }
    public Dealership? Dealership { get; set; }

    // Conseiller propriétaire de la veille (celui du dossier).
    [Required, MaxLength(450)]
    public string ConseillerId { get; set; } = string.Empty;
    public ApplicationUser? Conseiller { get; set; }

    public int OpportuniteId { get; set; }
    public OpportuniteVente? Opportunite { get; set; }

    // Règle du moteur (catalogue ReferentielsIntelligence.Regles) et identifiant complet de la recommandation.
    [Required, MaxLength(60)]
    public string Regle { get; set; } = string.Empty;

    [Required, MaxLength(160)]
    public string CleRecommandation { get; set; } = string.Empty;

    // Copie de CleRecommandation tant que la veille n'est pas close (réactivée, ou remplacée après expiration),
    // sinon null. L'index unique (ConseillerId, CleActive) garantit en base une seule veille ouverte par
    // recommandation, même si deux demandes arrivent en même temps ; MySQL accepte plusieurs lignes à null.
    [MaxLength(160)]
    public string? CleActive { get; set; }

    // Étape de l'opportunité quand la veille a été posée.
    public EtapeVente EtapeAuDebut { get; set; }

    // Début et fin prévue, en UTC. Une durée en jours est ajoutée en heures (24 h par jour).
    public DateTime DebutUtc { get; set; } = DateTime.UtcNow;
    public DateTime FinUtc { get; set; }

    // Dernière modification de la durée (nouvelle mise en veille d'une recommandation déjà en veille).
    public DateTime? ModifieeLeUtc { get; set; }

    // Réactivation manuelle par le conseiller avant la fin prévue.
    public DateTime? ReactiveeLeUtc { get; set; }
}
