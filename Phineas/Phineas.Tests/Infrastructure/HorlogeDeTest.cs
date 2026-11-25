namespace Phineas.Tests.Infrastructure;

// Horloge des tests (billet #87) : l'heure réelle tant qu'aucun instant n'est fixé. Fixer() arrête le temps à un
// instant précis, Avancer() le fait progresser ; Liberer() revient à l'heure réelle. Ne touche jamais l'horloge du poste.
public sealed class HorlogeDeTest : TimeProvider
{
    private DateTimeOffset? _fixe;

    public void Fixer(DateTimeOffset instant) => _fixe = instant.ToUniversalTime();

    public void Avancer(TimeSpan duree)
    {
        if (_fixe is null)
            throw new InvalidOperationException("Fixer l'horloge avant de la faire avancer.");
        _fixe = _fixe.Value + duree;
    }

    public void Liberer() => _fixe = null;

    public override DateTimeOffset GetUtcNow() => _fixe ?? base.GetUtcNow();
}
