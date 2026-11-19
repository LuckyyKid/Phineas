using System.Globalization;

namespace Phineas.Models.ViewModels.Conseiller;

public enum EtapeVente
{
    Nouveau,
    Qualifie,
    Soumission,
    EssaiRoutier,
    Negociation,
    Finalisation,
    Gagne,
    Perdu,
}

public enum Urgence
{
    Critique,
    Haute,
    Normale,
}

public enum TypeVisite
{
    PremiereRencontre,
    EssaiRoutier,
    Presentation,
    Negociation,
    Signature,
    Livraison,
}

public enum TypeAlerte
{
    VehiculeDisponible,
    SoumissionSansReponse,
    DossierBloque,
    RendezVousAConfirmer,
}

public enum TonIndicateur
{
    Neutre,
    Attention,
    Critique,
}

public record Indicateur(string Libelle, int Valeur, string Detail, string Icone, TonIndicateur Ton);

public record ActionPrioritaire(
    int Id,
    string Prospect,
    string Vehicule,
    string Evenement,
    DateTime DateEvenement,
    string Motif,
    string ProchaineAction,
    string IconeAction,
    EtapeVente Etape,
    Urgence Urgence,
    bool EcheanceAujourdhui
);

// Vehicule nul : le client n'a pas encore choisi de véhicule (ex. première rencontre).
public record RendezVousResume(DateTime Debut, string Client, string? Vehicule, TypeVisite Type, bool Confirme);

public record EtapePipeline(EtapeVente Etape, int Nombre, decimal Valeur);

public record AlerteVente(int Id, TypeAlerte Type, string Titre, string Detail, DateTime Date);

public class TableauBordConseillerViewModel
{
    public string Prenom { get; set; } = "";
    public string NomComplet { get; set; } = "";
    public string? Concession { get; set; }
    public DateTime Maintenant { get; set; }

    // Vrai tant que le tableau de bord est alimenté par ServiceTableauBordDemo.
    public bool DonneesFictives { get; set; }

    public IReadOnlyList<Indicateur> Indicateurs { get; set; } = [];
    public IReadOnlyList<ActionPrioritaire> Actions { get; set; } = [];
    public IReadOnlyList<RendezVousResume> RendezVous { get; set; } = [];
    public IReadOnlyList<EtapePipeline> Pipeline { get; set; } = [];
    public int Gagnes { get; set; }
    public int Perdus { get; set; }
    public IReadOnlyList<AlerteVente> Alertes { get; set; } = [];
}

public static class FormatVente
{
    public static readonly CultureInfo Culture = CultureInfo.GetCultureInfo("fr-CA");

    public static string Argent(decimal montant) => montant.ToString("C0", Culture);

    public static string Heure(DateTime d) => d.ToString("H' h 'mm", Culture);

    // Format compact des listes d'horaires (18:30).
    public static string HeureCourte(DateTime d) => d.ToString("HH':'mm", Culture);

    // « jeudi 19 novembre » : la date du jour en tête du tableau de bord.
    public static string DateDuJour(DateTime d) => d.ToString("dddd d MMMM", Culture);

    public static string DateLongue(DateTime d)
    {
        var texte = d.ToString("dddd d MMMM yyyy", Culture);
        return char.ToUpper(texte[0], Culture) + texte[1..];
    }

    public static string Jour(DateTime d, DateTime maintenant) =>
        (d.Date - maintenant.Date).Days switch
        {
            0 => "Aujourd'hui",
            1 => "Demain",
            _ => d.ToString("dddd d MMM", Culture),
        };

    public static string Relatif(DateTime d, DateTime maintenant)
    {
        var ecart = maintenant - d;
        if (ecart.TotalMinutes < 1)
            return "à l'instant";
        if (ecart.TotalMinutes < 60)
            return $"il y a {(int)ecart.TotalMinutes} min";
        if (ecart.TotalHours < 24)
            return $"il y a {(int)ecart.TotalHours} h";
        if (ecart.TotalDays < 2)
            return "hier";
        return $"il y a {(int)ecart.TotalDays} j";
    }

    public static string Libelle(EtapeVente etape) =>
        etape switch
        {
            EtapeVente.Nouveau => "Nouveau",
            EtapeVente.Qualifie => "Qualifié",
            EtapeVente.Soumission => "Soumission",
            EtapeVente.EssaiRoutier => "Rendez-vous / essai",
            EtapeVente.Negociation => "Négociation",
            EtapeVente.Finalisation => "Finalisation",
            EtapeVente.Gagne => "Gagné",
            EtapeVente.Perdu => "Perdu",
            _ => etape.ToString(),
        };

    public static string Libelle(TypeVisite type) =>
        type switch
        {
            TypeVisite.PremiereRencontre => "Première rencontre",
            TypeVisite.EssaiRoutier => "Essai routier",
            TypeVisite.Presentation => "Présentation",
            TypeVisite.Negociation => "Négociation",
            TypeVisite.Signature => "Signature",
            TypeVisite.Livraison => "Livraison",
            _ => type.ToString(),
        };

    public static (string Libelle, string Icone) Libelle(Urgence urgence) =>
        urgence switch
        {
            Urgence.Critique => ("Critique", "bi-exclamation-octagon-fill"),
            Urgence.Haute => ("Haute", "bi-exclamation-triangle-fill"),
            _ => ("Normale", "bi-info-circle-fill"),
        };

    public static (string Libelle, string Icone) Libelle(TypeAlerte type) =>
        type switch
        {
            TypeAlerte.VehiculeDisponible => ("Véhicule disponible", "bi-car-front"),
            TypeAlerte.SoumissionSansReponse => ("Soumission sans réponse", "bi-hourglass-split"),
            TypeAlerte.DossierBloque => ("Dossier bloqué", "bi-sign-stop"),
            TypeAlerte.RendezVousAConfirmer => ("Confirmation requise", "bi-calendar-check"),
            _ => (type.ToString(), "bi-bell"),
        };
}
