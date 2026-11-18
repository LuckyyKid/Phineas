using Microsoft.AspNetCore.Identity;

namespace Phineas.Services.Commun;

public record ErreurChamp(string Champ, string Message);

public class ResultatService
{
    public List<ErreurChamp> Erreurs { get; } = new();
    public bool Introuvable { get; protected init; }
    public bool Succes => !Introuvable && Erreurs.Count == 0;

    public string? PremierMessage =>
        Introuvable ? "Élément introuvable." : Erreurs.FirstOrDefault()?.Message;

    public static ResultatService Ok() => new();

    public static ResultatService NonTrouve() => new() { Introuvable = true };

    public static ResultatService Echec(string message, string champ = "")
    {
        var resultat = new ResultatService();
        resultat.Erreurs.Add(new ErreurChamp(champ, message));
        return resultat;
    }

    public static ResultatService DepuisIdentity(IdentityResult resultatIdentity)
    {
        var resultat = new ResultatService();
        foreach (var erreur in resultatIdentity.Errors)
            resultat.Erreurs.Add(new ErreurChamp("", erreur.Description));
        return resultat;
    }
}

public class ResultatService<T> : ResultatService
{
    public T? Valeur { get; private init; }

    public static ResultatService<T> Ok(T valeur) => new() { Valeur = valeur };

    public static new ResultatService<T> NonTrouve() => new() { Introuvable = true };

    public static new ResultatService<T> Echec(string message, string champ = "")
    {
        var resultat = new ResultatService<T>();
        resultat.Erreurs.Add(new ErreurChamp(champ, message));
        return resultat;
    }

    public static ResultatService<T> Depuis(ResultatService autre)
    {
        var resultat = new ResultatService<T> { Introuvable = autre.Introuvable };
        resultat.Erreurs.AddRange(autre.Erreurs);
        return resultat;
    }
}
