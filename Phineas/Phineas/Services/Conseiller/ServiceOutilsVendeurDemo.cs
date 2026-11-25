using Phineas.Models.ViewModels.Account;
using Phineas.Models.ViewModels.Conseiller;

namespace Phineas.Services.Conseiller;

// DONNÉES FICTIVES : phase frontend uniquement.
// Annonces, publications, liens de provenance et attributions inventés, datés par rapport à « maintenant » et rattachés à
// l'inventaire et aux prospects de démonstration. Aucune annonce n'a été publiée sur une vraie plateforme ; aucune donnée
// publicitaire n'est synchronisée ; aucune IA n'a rédigé ces textes.
public class ServiceOutilsVendeurDemo : IServiceOutilsVendeur
{
    // Horloge (billet #87) : les dates fictives sont calculées par rapport à « maintenant » ; les tests peuvent fixer cet
    // instant (ApplicationDeTest.Horloge). GetUtcNow().LocalDateTime donne exactement DateTime.Now (heure locale du
    // serveur, même sérialisation) : rien ne change en production.
    private readonly TimeProvider _temps;

    public ServiceOutilsVendeurDemo(TimeProvider? temps = null)
    {
        _temps = temps ?? TimeProvider.System;
    }

    private const string Moi = "moi";

    public Task<DonneesOutilsVendeur> ObtenirAsync(UserSummaryViewModel conseiller)
    {
        var n = _temps.GetUtcNow().LocalDateTime;
        var j = n.Date;
        var moi = conseiller.FullName;
        EvenementAnnonce Ev(DateTime d, string t) => new(d, t, moi);

        var annonces = new List<Annonce>
        {
            // 8. Brouillon.
            new("an-rav4", "ANN-2026-0011", "v-rav4", "Toyota RAV4 Hybride XLE 2024, traction intégrale",
                "Toyota RAV4 Hybride XLE 2024 neuf, gris lunaire. Motorisation hybride, transmission automatique et traction intégrale. Sièges chauffants et Apple CarPlay / Android Auto.",
                ["Motorisation hybride", "Traction intégrale", "Sièges chauffants", "Apple CarPlay / Android Auto"],
                "Communiquez avec nous pour planifier un essai.", "presentation", "professionnel", "site-web", "fr", "Brouillon", Moi,
                n.AddDays(-2), n.AddDays(-2), [], null, null, null, [Ev(n.AddDays(-2), "Brouillon créé à partir de la fiche d'inventaire.")]),
            // 9. En attente de validation.
            new("an-outback", "ANN-2026-0009", "v-outback", "Subaru Outback Touring 2022, 41 200 km",
                "Subaru Outback Touring 2022 d'occasion, vert, 41 200 km. Traction intégrale, grand espace de chargement et démarreur à distance.",
                ["Traction intégrale", "Grand espace de chargement", "Démarreur à distance"],
                "Écrivez-nous pour connaître sa disponibilité.", "en-ligne", "informatif", "kijiji", "fr", "EnRevision", Moi,
                n.AddDays(-5), n.AddDays(-1), [], null, null, null,
                [Ev(n.AddDays(-5), "Brouillon créé à partir de la fiche d'inventaire."), Ev(n.AddDays(-1), "Soumise en révision.")]),
            // 10 et 11. Approuvée, avec trois variantes rédactionnelles.
            new("an-f150", "ANN-2026-0007", "v-f150", "Ford F-150 XLT 2021 4x4, prêt pour le travail",
                "Ford F-150 XLT 2021 d'occasion, noir, 62 000 km. 4x4, attelage de remorque et caméra de recul.",
                ["4x4", "Attelage de remorque", "Caméra de recul"],
                "Planifiez un essai routier avec votre conseiller.", "equipements", "professionnel", "meta", "fr", "Approuvee", Moi,
                n.AddDays(-8), n.AddDays(-3),
                [
                    new("fonctionnelle", "Ford F-150 XLT 2021 : 4x4, attelage et caméra de recul",
                        "Ford F-150 XLT 2021, 62 000 km. Équipements indiqués dans la fiche : 4x4, attelage de remorque, caméra de recul. Transmission automatique."),
                    new("usage", "Une camionnette 4x4 pour le travail et le remorquage",
                        "Vous cherchez une camionnette pour le travail ? Ce Ford F-150 XLT 2021 (62 000 km) est équipé d'un attelage de remorque et du 4x4."),
                    new("synthetique", "Ford F-150 XLT 2021 4x4",
                        "F-150 XLT 2021, 62 000 km, 4x4, attelage. Prix affiché : 44 995 $."),
                ],
                "fonctionnelle", moi, n.AddDays(-3),
                [Ev(n.AddDays(-8), "Brouillon créé à partir de la fiche d'inventaire."), Ev(n.AddDays(-6), "Trois variantes comparées ; variante A retenue."),
                 Ev(n.AddDays(-4), "Soumise en révision."), Ev(n.AddDays(-3), "Approuvée après relecture humaine des informations.")]),
            // 12. Publication déclarée manuellement (site de la concession).
            new("an-cx5", "ANN-2026-0005", "v-cx5", "Mazda CX-5 GT 2022, cuir et affichage tête haute",
                "Mazda CX-5 GT 2022 d'occasion, rouge, 38 900 km. Traction intégrale, sièges en cuir et affichage tête haute.",
                ["Traction intégrale", "Cuir", "Affichage tête haute"],
                "Demandez plus d'information à votre conseiller.", "en-ligne", "professionnel", "site-web", "fr", "Publiee", Moi,
                n.AddDays(-15), n.AddDays(-12), [], null, moi, n.AddDays(-13),
                [Ev(n.AddDays(-15), "Brouillon créé à partir de la fiche d'inventaire."), Ev(n.AddDays(-13), "Approuvée après relecture humaine des informations."),
                 Ev(n.AddDays(-12), "Publication déclarée par le conseiller : site Web de la concession.")]),
            // Véhicule vendu : annonce archivée.
            new("an-silverado", "ANN-2026-0003", "v-silverado", "Chevrolet Silverado LT 2021 4x4",
                "Chevrolet Silverado LT 2021 d'occasion, argent, 55 300 km. 4x4, attelage de remorque et sièges chauffants.",
                ["4x4", "Attelage de remorque", "Sièges chauffants"],
                "Communiquez avec nous.", "en-ligne", "informatif", "kijiji", "fr", "Archivee", Moi,
                n.AddDays(-40), n.AddDays(-31), [], null, moi, n.AddDays(-38),
                [Ev(n.AddDays(-40), "Brouillon créé à partir de la fiche d'inventaire."), Ev(n.AddDays(-31), "Archivée : véhicule vendu.")]),
        };

        var publications = new List<PublicationAnnonce>
        {
            new("pub-cx5-site", "an-cx5", "site-web", "Publiee", null, n.AddDays(-12), null, Moi, "lk-cx5-site"),
            new("pub-f150-meta", "an-f150", "meta", "Prevue", j.AddDays(2).AddHours(9), null, null, Moi, "lk-f150-meta"),
            new("pub-f150-kijiji", "an-f150", "kijiji", "APreparer", null, null, null, Moi, null),
        };

        var liens = new List<LienProvenance>
        {
            // 13. Liens de provenance fictifs.
            new("lk-cx5-site", "PH-CX5-SITE", "an-cx5", "v-cx5", "site-web", "organic", null, Moi, n.AddDays(-12)),
            new("lk-f150-meta", "PH-F150-META", "an-f150", "v-f150", "meta", "paid_social", "camionnettes-novembre", Moi, n.AddDays(-6)),
        };

        var attributions = new List<AttributionProspect>
        {
            // 14. Prospect provenant d'une annonce (formulaire de la fiche du site).
            new("at-ines", IdsProspectsDemo.InesBenali, "o-ines-cx5", "site-web", "lk-cx5-site", "an-cx5", null, "v-cx5", "formulaire-site", n.AddMinutes(-40), Moi),
            // 15. Publicité Meta déclarée par le prospect : aucune synchronisation, aucun lien établi avec une annonce.
            new("at-julien", IdsProspectsDemo.JulienCote, "o-julien-camion", "meta", null, null, "camionnettes-novembre", null, "declaree", n.AddDays(-6), Moi),
        };

        var concession = new List<AttributionConcession>
        {
            new(IdsProspectsDemo.OlivierPelletier, n.AddDays(-4), "Directeur des ventes (fictif)"),
        };

        var prospection = new List<ProspectionPersonnelle>
        {
            // 16. Prospection personnelle, pas encore transformée en opportunité.
            new("pp-gervais", "Luc Gervais", "Paysagement Gervais", "entreprise", "Camionnette de travail",
                "Entreprise locale : deux camionnettes de la flotte à remplacer d'ici le printemps.", n.AddDays(-5),
                "Téléphone (accordé lors de la rencontre)", "Rappeler pour connaître le calendrier de remplacement", j.AddDays(3), null, null),
            new("pp-pare", "Dominique Paré", null, "salon", "VUS familial",
                "Rencontrée au salon de l'auto ; souhaite être rappelée après les fêtes.", n.AddDays(-20),
                "Courriel (carte remise par la personne)", "Écrire en janvier", j.AddDays(45), null, null),
        };

        var consultations = new List<ConsultationCoach>
        {
            // 25. Consultation de l'assistant (simulation, aucune IA appelée).
            new("cc-camille", n.AddDays(-1), "preparation-rdv", "rendezvous", "r-camille-essai", "Préparer l'essai routier de Camille Lavoie"),
        };

        return Task.FromResult(new DonneesOutilsVendeur(annonces, publications, liens, attributions, concession, prospection, consultations));
    }
}
