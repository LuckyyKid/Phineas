namespace Phineas.Models.Entities;

public enum StatutVehicule
{
    Recu,
    EnInspection,
    InspectionTerminee,
    NettoyageEnCours,
    PretPourVente,
    Reserve,
    Vendu,
    Livre
}

public static class StatutVehiculeExtensions
{
    public static string Libelle(this StatutVehicule s) => s switch
    {
        StatutVehicule.Recu => "Reçu",
        StatutVehicule.EnInspection => "En inspection",
        StatutVehicule.InspectionTerminee => "Inspection terminée",
        StatutVehicule.NettoyageEnCours => "Nettoyage en cours",
        StatutVehicule.PretPourVente => "Prêt pour vente",
        StatutVehicule.Reserve => "Réservé",
        StatutVehicule.Vendu => "Vendu",
        StatutVehicule.Livre => "Livré",
        _ => s.ToString(),
    };
}