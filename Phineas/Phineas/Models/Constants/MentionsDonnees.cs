namespace Phineas.Models.Constants;

// Ce qui est réellement enregistré, écran par écran, dans l'espace vendeur (fonctionnalité 16). Une seule source pour
// les pastilles « Démo », les bandeaux et la note de l'Accueil : un écran ne doit jamais annoncer « rien n'est
// enregistré » s'il enregistre une partie de ses opérations, ni laisser croire qu'un module de démonstration enregistre.
//
// Écrans mixtes (Accueil, Centre d'actions, Mes suivis, Prospects) : les prospects enregistrés et leurs opérations
// passent par la base (ServiceProspects, ServiceVeillesRecommandations) ; le reste est une démonstration.
// Modules simulés (rendez-vous, soumissions, transactions, relations clients, outils, recommandations de véhicules) :
// aucune écriture serveur ; un prospect enregistré peut y être choisi, mais rien n'est ajouté à son dossier.
public static class MentionsDonnees
{
    public const string LibelleMixte = "Réel et démo";

    public const string EcranMixte =
        "Écran mixte : vos prospects enregistrés et leurs opérations (modification, étapes intermédiaires, notes, suivis, "
        + "mise en veille) sont enregistrés en base. Les dossiers fictifs et les autres modules restent des démonstrations : "
        + "leurs modifications restent dans cet onglet.";

    public const string LibelleSimule = "Démo";

    public const string ModuleSimule =
        "Module de démonstration : ses données sont fictives et ses modifications restent dans cet onglet, elles ne sont pas "
        + "enregistrées en base. Vos prospects enregistrés peuvent y être choisis, mais rien de ce que vous faites ici n'est "
        + "ajouté à leur dossier.";

    // Note en bas de l'Accueil (écran mixte).
    public const string Accueil =
        "Prospects et suivis enregistrés : réels. Rendez-vous, transactions et chiffre « opportunités » : démonstration.";

    // Bandeau des fiches (prospect, rendez-vous, soumission, transaction).
    public const string BandeauTitre = "Données réelles et de démonstration.";

    public const string BandeauTexte =
        "Les prospects créés avec « Nouveau prospect » sont enregistrés, ainsi que leurs modifications, notes, étapes "
        + "intermédiaires et suivis, et les opportunités ajoutées à leur fiche. Le reste (prospects fictifs, qualification détaillée, "
        + "véhicules envisagés, rendez-vous, soumissions, transactions) reste dans cet onglet du navigateur : ce n'est pas enregistré "
        + "en base et disparaît à sa fermeture.";
}
