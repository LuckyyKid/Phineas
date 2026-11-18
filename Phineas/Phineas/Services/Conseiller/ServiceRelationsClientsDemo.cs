using Phineas.Models.ViewModels.Account;
using Phineas.Models.ViewModels.Conseiller;

namespace Phineas.Services.Conseiller;

// DONNÉES FICTIVES — phase frontend uniquement.
// Clôtures, retours, enquêtes, problèmes et recommandations inventés, datés par rapport à « maintenant » et rattachés
// aux prospects, opportunités et transactions des autres services de démonstration. Aucun retour n'a réellement été
// reçu : les réponses représentent ce qu'un client pourrait déclarer.
public class ServiceRelationsClientsDemo : IServiceRelationsClients
{
    private const string Moi = "moi";
    private const string Antoine = "Antoine Lefebvre";

    public Task<DonneesRelationsClients> ObtenirAsync(UserSummaryViewModel conseiller)
    {
        var n = DateTime.Now;
        var j = n.Date;
        var moi = conseiller.FullName;

        var clotures = new List<CloturePerte>
        {
            // 1. Prix : déclaré par la cliente ; elle ne souhaite plus être sollicitée.
            new("cl-daniel", "o-daniel-rav4", "prix-eleve", "client", "Soumission",
                "Le client trouve l'écart avec son budget trop important, même après explication des options.",
                false, null, null, "ne-plus-contacter", n.AddDays(-25), moi),
            // 2. Véhicule indisponible : en attente de l'arrivée d'un véhicule comparable.
            new("cl-julie", "o-julie-hybride", "vehicule-indisponible", "vendeur-confirme", "Qualifie",
                "Le Corolla Cross hybride d'occasion qu'elle visait a été vendu avant sa visite.",
                true, null, "Un VUS hybride d'occasion à traction intégrale, 32 000 $ maximum.", "aucune", n.AddDays(-18), moi),
            // 3. Achat ailleurs (dossier d'Antoine) : aucune relance commerciale.
            new("cl-mathieu", "o-mathieu-tacoma", "achat-ailleurs", "client", "Finalisation",
                "A trouvé un Tacoma chez un concurrent.", false, null, null, "aucune", n.AddDays(-20), Antoine),
            // 4. Achat reporté : la date de reprise souhaitée est atteinte.
            new("cl-annie", "o-annie-berline", "achat-reporte", "client", "Qualifie",
                "Préfère attendre la fin de son contrat de location actuel.", true, j.AddDays(-1), null, "aucune", n.AddDays(-40), moi),
            // 5. Motif inconnu : ne pas inventer de raison.
            new("cl-pierre", "o-pierre-civic", "inconnu", "inconnu", "Soumission",
                null, true, null, null, "aucune", n.AddDays(-14), moi),
            // 6. Hypothèse : l'absence de réponse ne prouve pas un achat ailleurs.
            new("cl-yannick", "o-yannick-tucson", "achat-ailleurs", "hypothese", "Soumission",
                "Plus de réponse après l'envoi de la soumission ; je suppose qu'il a acheté ailleurs.", true, null, null, "aucune", n.AddDays(-12), moi),
            // 7. Ancienne opportunité compatible avec un véhicule maintenant en inventaire.
            new("cl-steve", "o-steve-camionnette", "vehicule-indisponible", "client", "EssaiRoutier",
                "Le Silverado essayé a été vendu à un autre client pendant sa réflexion.", true, null,
                "Une camionnette 4x4 d'occasion avec attelage, 46 000 $ maximum.", "aucune", n.AddDays(-30), moi),
            // 8. Opportunité réactivée (historique de la clôture conservé).
            new("cl-valerie", "o-valerie-cx5", "budget-incompatible", "client", "Soumission",
                "Mise de fonds insuffisante pour la mensualité visée.", true, null, "Si sa mise de fonds augmente.", "aucune", n.AddDays(-40), moi,
                Reactivation: new(n.AddDays(-3), "La cliente nous a recontactés : sa mise de fonds a augmenté.", moi, "AQualifier")),
            // 9. Récupérée avec vente conclue : réactivée, puis livrée (transaction TRX-2026-0016).
            new("cl-nicolas", "o-nicolas-tiguan", "budget-incompatible", "client", "Soumission",
                "Le Tiguan neuf dépassait son budget.", true, null, "Un Tiguan d'occasion dans son budget.", "aucune", n.AddDays(-30), moi,
                Reactivation: new(n.AddDays(-22), "Un Tiguan d'occasion correspondant à son budget est arrivé en inventaire.", moi, "Qualifie")),
        };

        var retours = new List<RetourClientPerte>
        {
            new("rt-daniel", "o-daniel-rav4", n.AddDays(-24), "non", "Le prix du véhicule dépassait ce que j'étais prêt à payer.",
                "Rien de particulier, l'accueil était bien.", false),
        };

        var enquetes = new List<EnqueteSatisfaction>
        {
            // 12. Satisfaite de son conseiller, insatisfaite de la préparation et de la livraison.
            new("e-martine", "t-martine-hrv", n.AddDays(-17),
                new Dictionary<string, int>
                {
                    ["ecoute"] = 5, ["explications"] = 5, ["disponibilite"] = 4, ["accompagnement"] = 5,
                    ["clarte-prix"] = 4, ["options"] = 4, ["proposition"] = 5,
                    ["etapes"] = 4, ["demarches"] = 3, ["delais"] = 3,
                    ["etat-vehicule"] = 2, ["engagements"] = 2, ["experience-livraison"] = 3,
                },
                3, "Très bien accompagnée par mon conseiller, mais la deuxième clé et les tapis promis n'étaient pas là à la livraison, et le véhicule n'avait pas été lavé.",
                true, true),
            // 11. Client satisfait.
            new("e-benoit", "t-benoit-forester", n.AddDays(-42),
                new Dictionary<string, int>
                {
                    ["ecoute"] = 5, ["explications"] = 5, ["disponibilite"] = 5, ["accompagnement"] = 5,
                    ["clarte-prix"] = 5, ["options"] = 4, ["proposition"] = 5,
                    ["etapes"] = 4, ["demarches"] = 4, ["delais"] = 4,
                    ["etat-vehicule"] = 5, ["engagements"] = 5, ["experience-livraison"] = 5,
                },
                5, "Excellent suivi du début à la fin.", false, true),
        };

        var problemes = new List<ProblemeApresVente>
        {
            // 13. Problème ouvert : élément promis manquant, coordonné avec l'atelier.
            new("pb-martine-cle", "t-martine-hrv", "element-promis", "Deuxième clé et tapis toutes saisons promis non remis à la livraison.",
                n.AddDays(-17), "atelier", "Marc-André Simard (fictif)", "Eleve", "EnCours",
                "Convenir avec l'atelier d'une date de remise de la deuxième clé et des tapis", "e-martine", null, null,
                [
                    new(n.AddDays(-17), "Problème signalé dans l'enquête de satisfaction.", moi, null, "Nouveau"),
                    new(n.AddDays(-16), "Prise en charge : la cliente a été informée que le dossier est suivi.", moi, "Nouveau", "EnCours"),
                ]),
            // 14. Problème résolu, vérification avec le client encore à faire.
            new("pb-benoit-document", "t-benoit-forester", "document", "Certificat d'immatriculation définitif à transmettre au client.",
                n.AddDays(-10), "administration", "Administration des ventes", "Normal", "Resolu", null, null, j.AddDays(-2).AddHours(11), null,
                [
                    new(n.AddDays(-10), "Le client signale ne pas avoir reçu son certificat définitif.", moi, null, "Nouveau"),
                    new(n.AddDays(-9), "Transfert préparé vers l'administration des ventes (aucun envoi automatique).", moi, "Nouveau", "AttenteDepartement"),
                    new(j.AddDays(-2).AddHours(11), "Document transmis au client par l'administration des ventes (fictif).", "Administration des ventes (fictif)", "AttenteDepartement", "Resolu"),
                ]),
        };

        var initiales = string.Concat((moi ?? "").Split(' ', StringSplitOptions.RemoveEmptyEntries).Select(m => char.ToUpperInvariant(m[0])));
        var profil = new ProfilConseiller(
            "Au service des clients de la concession depuis 2019, j'accompagne les familles et les travailleurs dans le choix d'un véhicule neuf ou d'occasion adapté à leurs besoins et à leur budget.",
            "514-555-0100", "conseiller.ventes@exemple.test", ["fr", "en"],
            false, true, true, true,
            "Vous connaissez quelqu'un qui recherche un véhicule ? Vous pouvez lui partager ma carte professionnelle. Je serai heureux de l'accompagner dans ses recherches.",
            "DEMO-" + (initiales.Length > 0 ? initiales : "CV") + "-2026");

        var invitations = new List<InvitationReferencement>
        {
            new("inv-benoit", "t-benoit-forester",
                "Bonjour Benoît, merci encore pour votre confiance lors de l'achat de votre véhicule. Si un proche recherche éventuellement une voiture, vous pouvez lui partager ma carte professionnelle. Je serai heureux de l'aider selon ses besoins, sans engagement.",
                n.AddDays(-38), n.AddDays(-38)),
        };

        var recommandations = new List<RecommandationRecue>
        {
            new("rec-camille", "REC-2026-0001", IdsProspectsDemo.CamilleLavoie, "o-camille-ioniq", IdsProspectsDemo.IsabelleFortin, n.AddDays(-15), "declaration-prospect", Moi),
            new("rec-amelie", "REC-2026-0002", IdsProspectsDemo.AmelieGirard, "o-amelie-crosstrek", IdsProspectsDemo.FrancoisBelanger, n.AddDays(-28), "declaration-prospect", Moi),
            new("rec-simon", "REC-2026-0003", IdsProspectsDemo.SimonThibault, "o-simon-crv", IdsProspectsDemo.GabrielRoy, n.AddDays(-12), "declaration-prospect", Moi),
            new("rec-melissa", "REC-2026-0004", IdsProspectsDemo.MelissaHebert, "o-melissa-vus", IdsProspectsDemo.BenoitLachance, n.AddHours(-5), "lien-personnel", Moi),
            // 20. Tentative en double : rattachée au prospect existant, aucune seconde fiche créée.
            new("rec-simon-doublon", "REC-2026-0005", IdsProspectsDemo.SimonThibault, null, null, n.AddDays(-2), "lien-personnel", Moi, Doublon: true),
        };

        return Task.FromResult(new DonneesRelationsClients(clotures, retours, enquetes, problemes, profil, invitations, recommandations));
    }
}
