# PHINEAS

## Où trouver quoi : espace vendeur

Tous les chemins partent de `Phineas/Phineas/`.

- `Views/Shared/_Layout.cshtml` : squelette commun à tous les rôles. Un espace peut y remplacer la barre latérale par sa section `Barre`.
- `Views/Conseiller/_LayoutConseiller.cshtml` : coque des pages vendeur (barre latérale en verre, notification, scripts communs).
- `Models/ViewModels/Conseiller/NavigationVendeur.cs` : entrées du menu vendeur. Une entrée sans contrôleur s'affiche sans être cliquable.
- `Views/Conseiller/Index.cshtml` : page d'accueil du conseiller.
- `Services/Conseiller/ServiceTableauBordDemo.cs` : données fictives de la page d'accueil (à remplacer par la base de données).
- `wwwroot/js/conseiller.js` : interactions de l'accueil (carte « À faire en premier », notifications).
- `wwwroot/css/conseiller.css` : styles de l'espace vendeur et de l'accueil.

Trajet d'un affichage : `/Conseiller` → `ConseillerController.Index` → `ServiceTableauBordDemo.ObtenirAsync` → `Views/Conseiller/Index.cshtml` → `conseiller.js` pour les clics.

## Où trouver quoi : prospects (création réelle)

- `Services/Conseiller/ServiceProspects.cs` : lecture (prospects fictifs + prospects enregistrés du conseiller) et création (validation, doublons, attribution à la concession et au conseiller). Doublon = même courriel ou même téléphone dans la concession, garanti aussi par les index uniques `(DealershipId, Courriel)` et `(DealershipId, TelephoneChiffres)` (migration `ProspectsDoublonsUniques`) ; le refus ne nomme jamais le dossier d'un collègue. Plusieurs opportunités par prospect (fonctionnalité 18) : `CreerOpportuniteAsync` ajoute un projet au prospect existant (jamais un nouveau prospect), la fiche s'ouvre sur une opportunité précise avec `/Prospects/Fiche/pe-…?opportunite=oe-…` (appartenance vérifiée par `ConsulterAsync`). Fonctionnalité 19 : `P.projet` (`prospects-store.js`) nomme le projet sur les cartes de l'Accueil, du Centre d'actions et de « Mes suivis » quand un client en a plusieurs ; les pages « Nouvelle soumission », « Nouveau rendez-vous » et « Nouvelle transaction » (démonstration) ne proposent jamais un dossier enregistré. Fonctionnalité 20 : la qualification d'une opportunité enregistrée est enregistrée en base (`ServiceProspects.QualifierAsync`, `ProspectsController.Qualifier`, colonnes de qualification de `OpportuniteVente`, migration `QualificationOpportunite`) ; seuls les champs listés dans `champs` changent, une page périmée est refusée, et rien n'est écrit dans l'onglet pour un dossier réel. Fonctionnalité 21 : les véhicules envisagés d'une opportunité enregistrée sont dans la table `VehiculesEnvisages` (entité `VehiculeEnvisage` : marque, modèle, année et version, sans prix ni lien vers l'inventaire ; migration `AjoutVehiculesEnvisages`) ; ajout, modification et retrait par `ServiceProspects.AjouterVehiculeAsync`, `ModifierVehiculeAsync`, `RetirerVehiculeAsync` et les actions `ProspectsController.AjouterVehicule`, `ModifierVehicule`, `RetirerVehicule` (fenêtre `#modal-vehicule` de la fiche, carte de chaque opportunité) ; l'empreinte du prospect inclut ses véhicules. Fonctionnalité 22 : les rendez-vous commerciaux d'une opportunité enregistrée sont dans la table `RendezVousCommerciaux` (entité `RendezVousCommercial` : type permis, `DebutUtc`, `Fuseau`, durée, modalité, lieu, objectif, commentaire ; pas de statut, pas d'invitation, pas de réservation ; migration `AjoutRendezVousCommerciaux`) ; création par `ServiceProspects.PlanifierRendezVousAsync` et `ProspectsController.PlanifierRendezVous` (fenêtre `#modal-rendezvous` de la fiche). L'heure saisie est comprise dans le fuseau commercial unique de l'application (`Services/FuseauCommercial.cs`, clé `FuseauCommercial` d'`appsettings.json`, `America/Toronto`) : heures inexistantes, ambiguës ou déjà passées refusées ; affichage toujours dans ce fuseau (`P.formaterRendezVous`). Limite connue : un seul fuseau pour toutes les concessions, et l'Intelligence commerciale (`rdvFutur`) ne lit pas encore ces rendez-vous (F23).
- `Services/Conseiller/ServiceProspectsDemo.cs` : prospects fictifs de démonstration, ajoutés à la liste par `ServiceProspects`.
- Horloge des données fictives vendeur (`Services/Conseiller/*Demo.cs`) : `TimeProvider` (celui du système, enregistré dans `Program.cs`). Les dates fictives sont calculées par rapport au jour local du serveur : au minuit du serveur, elles avancent d'un jour (billet #87). Les tests fixent l'heure avec `Phineas.Tests/Infrastructure/HorlogeDeTest.cs`.
- `Models/Entities/Prospect.cs` et `OpportuniteVente.cs` : tables `Prospects` et `OpportunitesVente` (migration `AjoutProspects`).
- `Services/Conseiller/ServiceVeillesRecommandations.cs` et `Models/Entities/VeilleRecommandation.cs` : mise en veille enregistrée et réactivation d'une recommandation (table `VeillesRecommandation`, migration `AjoutVeillesRecommandation`, fonctionnalité 14).
- `Views/Prospects/_TiroirProspect.cshtml` et `wwwroot/js/prospects-tiroir.js` : formulaire « Nouveau prospect ».
- `wwwroot/js/prospects-store.js` : état de la page ; les prospects enregistrés viennent toujours du serveur.

Trajet d'une création : clic sur « Créer le prospect » → `prospects-tiroir.js` (vérification dans le navigateur) → `POST /Prospects/Creer` (`ProspectsController.Creer`, jeton antiforgery) → `ServiceProspects.CreerAsync` → base MySQL → retour à `/Prospects` avec un message (ou tiroir rouvert avec les erreurs).

Trajet d'une modification (prospect enregistré seulement) : bouton « Modifier » de la fiche → `prospects-tiroir.js` (tiroir prérempli, opportunité visée et empreinte dans des champs cachés) → `POST /Prospects/Modifier` (`ProspectsController.Modifier`) → `ServiceProspects.ModifierAsync` → base MySQL → retour à la fiche avec un message. La modification d'un prospect fictif reste locale à l'onglet. La fiche d'un prospect enregistré est vérifiée par `ServiceProspects.ConsulterAsync` (404 s'il n'est pas dans le dossier du conseiller).

Trajet d'un changement d'étape (opportunité enregistrée seulement) : menu « Étape » de l'onglet Opportunités ou menu du pipeline → `prospects-store.js` (`envoyerEtape`) → `POST /Prospects/ChangerEtape` → `ServiceProspects.ChangerEtapeAsync` (verrou du prospect, nouvelle étape et ligne de `HistoriquesEtapeOpportunite` enregistrées ensemble) → retour à la fiche ou à la liste avec un message. `Models/Entities/HistoriqueEtapeOpportunite.cs` : historique des étapes (migration `AjoutHistoriqueEtapes`), affiché dans l'onglet Historique. Pour une opportunité enregistrée, « Perdu » (motif de perte pas encore en base) et « Gagné » (confirmation par une transaction pas encore reliée) sont refusés par le serveur ; les autres étapes, et le retour en arrière, sont permis.

Trajet d'une note (prospect enregistré seulement) : formulaire « Ajouter une note » de l'onglet Historique → `prospects-fiche.js` → `POST /Prospects/AjouterNote` → `ServiceProspects.AjouterNoteAsync` (verrou du prospect ; jeton unique du formulaire contre les doubles envois) → table `NotesProspect` (`Models/Entities/NoteProspect.cs`, migration `AjoutNotesProspect`) → retour à l'historique de la fiche avec un message. Une note sur un prospect fictif reste locale à l'onglet.

Trajet d'un suivi (opportunité enregistrée) : fenêtre « Planifier un suivi » de la fiche → `prospects-fiche.js` → `POST /Prospects/PlanifierSuivi` → `ServiceProspects.PlanifierSuiviAsync` (verrou du prospect, empreinte) → `OpportuniteVente.ProchaineAction` et `DateProchaineAction` (une seule prochaine action par opportunité, remplacée ; le jour choisi est gardé à 9 h, sans conversion UTC) → retour à la fiche avec un message. Les champs « Prochaine action » et « Pour le » du formulaire de note planifient le même suivi, enregistré avec la note (tout ou rien). Aucun rappel n'est envoyé. Une nouvelle planification archive l'action précédente dans `HistoriquesSuiviOpportunite` : « Remplacé » si la description change, « Reporté » si seule la date change (même action). Ni l'une ni l'autre n'est comptée comme réalisée.

Trajet d'une réalisation : bouton « Marquer comme réalisé » d'une ligne de « Mes suivis » (ou « Marquer comme réalisée » d'une carte du Centre d'actions ou de la fiche, pour un suivi enregistré) → `prospects-store.js` (`envoyerRealisation`, avec l'empreinte de l'action affichée) → `POST /Prospects/RealiserSuivi` → `ServiceProspects.RealiserSuiviAsync` (verrou du prospect ; refus si l'action a changé entre-temps) → l'action est archivée « Réalisé » dans `HistoriquesSuiviOpportunite` (`Models/Entities/HistoriqueSuiviOpportunite.cs`, migration `AjoutHistoriqueSuivis`) et retirée de `ProchaineAction` → retour à la page d'origine avec un message. Les événements « Suivi réalisé », « Suivi remplacé » et « Suivi reporté » s'affichent dans l'onglet Historique de la fiche.

Trajet d'un report : bouton « Reporter » d'une ligne de « Mes suivis » (ou « Reporter » du menu « Plus » d'une carte du Centre d'actions ou de la fiche, pour un suivi enregistré) → fenêtre « Reporter le suivi » (`intelligence-composants.js`, `ouvrirReportSuivi` : action, échéance actuelle, nouvelle échéance) → `prospects-store.js` (`envoyerReport`, avec l'empreinte de l'action affichée) → `POST /Prospects/ReporterSuivi` → `ServiceProspects.ReporterSuiviAsync` (verrou du prospect ; refus si l'action a été réalisée, remplacée ou reportée entre-temps ; date inchangée refusée sans événement) → la même action garde sa description avec la nouvelle `DateProchaineAction`, et l'ancienne version est archivée « Reporté » avec l'ancienne et la nouvelle date (`NouvelleDatePrevue`, migration `AjoutReportSuivis`), dans le même enregistrement → retour à la page d'origine avec un message. Pour une action de démonstration, « Reporter » reste une mise en veille locale de la recommandation (motif facultatif, rien n'est envoyé). À ne pas confondre avec la pause de « Préférences » (locale, par opportunité). Annuler la migration `AjoutReportSuivis` demande d'abord de supprimer les lignes « Reporte » de `HistoriquesSuiviOpportunite`.

Dettes connues (suivis) :
- Modèle : la colonne `Cloture` (enum `ClotureSuivi`) porte aussi « Reporte », alors qu'un suivi reporté reste actif. Un nom plus juste (ex. « type d'événement ») est une amélioration possible, sans urgence : pas de renommage ni de refonte de schéma pour l'instant.
- Interface : les défauts « défilement horizontal sur mobile » (en-tête `iv-haut` et `iv-puces`, pagination `iv-pages`, lignes `iv-suspendues`) et « double point après une date abrégée » sont corrigés. Retour à la ligne (`flex-wrap`) dans `intelligence-verre.css` : 0 px de débordement à 320, 390 et 1440 px sur « Mes suivis », le Centre d'actions et Recommandations véhicules. `Prospects.terminerPhrase` (`prospects-store.js`) ajoute le point final seulement s'il manque, car une date abrégée (« 25 nov. ») en a déjà un : à utiliser pour toute phrase qui finit par une date.

« Mes suivis » a deux vues (onglets `iv-onglets`, vue gardée dans l'adresse avec `?vue=a-venir`) :
- « À traiter » (`intelligence-regles.js`, règle `suivi-echeance`, et les autres recommandations) : un suivi enregistré dû aujourd'hui ou en retard apparaît toujours.
- « À venir » : trajet `IntelligenceController.Suivis` → `ServiceProspects.SuivisPlanifiesAsync` (prochaine action courante de chaque opportunité active des dossiers du conseiller, dans sa concession actuelle, lue dans `OpportuniteVente` seulement, datée d'aujourd'hui ou plus tard selon le jour du serveur, triée par date puis par opportunité) → `<script id="suivis-planifies">` dans `Views/Intelligence/Suivis.cshtml` → `intelligence-suivis.js` (`suivisAVenir`, `rendreAVenir`, pagination propre « a-venir »). Les boutons « Marquer comme réalisé » et « Reporter » réutilisent les envois existants ; le retour ramène dans « À venir ». Les dossiers de démonstration n'y figurent pas.

Classement des dates : une seule convention, le jour civil du navigateur (`Prospects.ecartJours`), la même que la règle `suivi-echeance` : avant aujourd'hui = en retard, aujourd'hui = « À traiter », après aujourd'hui = « À venir ». Le passage d'une vue à l'autre se fait au chargement de la page le jour venu, sans écriture en base. Le serveur ne classe pas lui-même (il ne connaît pas le fuseau de l'utilisateur ; un classement selon son jour, souvent UTC, ferait disparaître un suivi de demain chaque soir pendant quelques heures) : il envoie seulement les suivis datés de son jour ou plus tard, ce qui suffit tant que l'écart entre les deux fuseaux reste inférieur à un jour. La tolérance d'un jour des validations (`EstJourAccepte`) ne sert pas au classement. Vérifié en E2E (horloge du navigateur un jour derrière ou devant celle du serveur) : le filtre du serveur n'exclut aucun suivi que le navigateur considère comme futur. Limites, sans fuseau métier par concession : deux utilisateurs dans des fuseaux différents peuvent classer différemment un même suivi près de minuit ; la garantie du filtre suppose moins d'un jour d'écart entre le fuseau du serveur et celui du conseiller (seuls les extrêmes UTC−12 et UTC+14 dépassent cet écart).

Les autres actions de la page (préférences, pause, message) restent locales.

Regroupement des obligations (« À traiter ») : `IntelligenceRegles.regrouperObligations` (`intelligence-regles.js`, fonction pure) présente en une seule ligne les recommandations qui expriment la même prise de contact ; rien n'est supprimé (chaque recommandation garde son identifiant, sa règle, sa source et sa résolution, et reste au Centre d'actions). Regroupées seulement si tout concorde : même opportunité, objet = l'opportunité elle-même, message de prise de contact générale (première réponse ou nouveau prospect recommandé, suivi planifié `suivi-echeance`, reprise convenue `achat-reporte`), responsabilité du conseiller. Restent séparés : deux opportunités d'un même client, soumission (proposition commerciale), rendez-vous (confirmation, absence, essai), transaction et financement, véhicule, satisfaction, pertes. Dans le doute, les lignes restent séparées.
- Ligne regroupée : priorité de la raison la plus prioritaire ; échéance affichée = la plus proche de toutes les raisons (jamais masquée) ; raison principale (client, contact, « Préparer le message ») = la plus prioritaire, puis la plus proche, puis le suivi planifié, puis l'identifiant (ordre stable) ; chaque raison reste listée dans « Pourquoi » avec son échéance. La ligne prend la place de sa raison la mieux classée. Le compteur « À traiter » et la pagination portent sur les obligations.
- « Marquer comme réalisé » et « Reporter » agissent sur le suivi enregistré de la ligne, et seulement sur lui. Chaque raison se résout seule, au chargement suivant : un suivi réalisé, reporté ou remplacé ne satisfait jamais la première réponse.
- Le Centre d'actions applique la même règle depuis la fonctionnalité 12 (voir ci-dessous).

Centre d'actions (fonctionnalité 12, `intelligence-actions.js`, `UI.ligneObligation` dans `intelligence-composants.js`) : la file « À traiter » montre une carte par obligation (`regrouperObligations`, la même règle que « Mes suivis »). Quatre notions distinctes : une recommandation (produite par le moteur, avec sa règle et son identifiant), une obligation (une ou plusieurs recommandations de la même prise de contact), une action enregistrée en base (le suivi `OpportuniteVente.ProchaineAction`, les notes) et le statut local d'une carte (commencée, reportée, ignorée, confiée, terminée : propre au navigateur, jamais une écriture). Une carte regroupée liste chaque raison avec SES commandes ; la commande de fin vient de `IntelligenceRegles.commandeRealisation` :
- dossier enregistré, suivi planifié : « Marquer comme réalisée » réalise le suivi en base (fonctionnalité 06), « Reporter » le reporte en base (07) ;
- dossier enregistré, première réponse : pas de « Marquer comme réalisée » ; « Déclarer le contact dans la fiche » (note « Appel effectué », « Courriel (résumé) » ou « Visite en concession ») ;
- dossier enregistré, autre recommandation : aucune clôture simulée ; elle disparaît quand le dossier change en base ;
- dossier de démonstration : commandes locales, comme avant.
Réaliser le suivi ne satisfait pas la première réponse, déclarer un contact ne réalise pas le suivi. Sur un dossier enregistré, « Ignorer » et le report local (règles sans veille enregistrée) le signalent (« rien n'est enregistré dans le dossier ») ; la fenêtre « Préparer une relance » n'y propose ni brouillon ni suivi locaux (le suivi se planifie dans la fiche). Chiffres (`compterObligations`) : « à traiter », « prioritaires », « échéance sous 24 h », « en retard » et le compteur de la barre latérale comptent des obligations ; le texte de la file indique aussi le nombre de recommandations ; « terminées aujourd'hui » et « reportées » comptent les statuts locaux du navigateur. Les onglets « Opportunités qui stagnent », « En veille et reportées », « Traitées et obsolètes » et « Continuité » restent une ligne par recommandation.
- Carte « Priorité » de l'Accueil vendeur (fonctionnalité 13, `accueil-moteur.js`, clic dans `conseiller.js`) : une carte par obligation (`IntelligenceRegles.prioritesAccueil`, même regroupement que le Centre d'actions), au plus 3, Urgent ou Élevé échues aujourd'hui ou en retard. Ses commandes viennent de `commandesObligation` (une par raison, d'après `commandeRealisation`) : « Marquer le suivi comme réalisé » envoie `RealiserSuivi` avec la version et le jeton, puis l'Accueil affiche la confirmation ou le refus du serveur ; « Déclarer le contact dans la fiche » ouvre la fiche ; une autre recommandation réelle ouvre le dossier, sans clôture ; seule une carte de démonstration (marquée « Démonstration ») se termine localement. Le compteur de la barre latérale compte les obligations, comme sur le Centre d'actions. Le message du serveur (TempData, consommé dès qu'il est lu) n'est lu par `RendezVous/_DonneesModules.cshtml` que si la page le demande (`ViewData["AfficheMessagesProspects"] = true`, seulement l'Accueil) : les pages Rendez-vous, qui ne l'affichent pas, ne l'effacent pas.
- Mise en veille enregistrée d'une recommandation (fonctionnalité 14) : menu « Plus » d'une raison du Centre d'actions → « Mettre en veille » (dossier réel, règle de `ReferentielsIntelligence.ReglesVeille`) → fenêtre de durée (1, 3, 7 ou 14 jours de 24 h) dans `intelligence-composants.js` → `Intelligence.envoyerVeille` (`intelligence-store.js`) → POST `IntelligenceController.MettreEnVeille` (jeton antiforgery, étape affichée) → `ServiceVeillesRecommandations.MettreEnVeilleAsync` (verrou du dossier, table `VeillesRecommandation`) → retour à la page avec le message. « Réactiver » (onglet « En veille et reportées ») suit le même trajet vers `ReactiverVeille`.
  - Identité : l'identifiant de la recommandation produit par le moteur (`premiere-reponse:oe-12`, ou `opportunite-inactive:oe-12:2026-11-20` pour une règle datée) ; une nouvelle situation donne un nouvel identifiant, jamais masqué par une ancienne veille.
  - Une veille est active tant que sa fin (UTC) n'est pas atteinte, qu'elle n'est pas réactivée et que l'opportunité garde l'étape du début (évalué à la lecture, `ActivesAsync`, puis dans le navigateur, `IntelligenceRegles.veilleActive`). L'index unique `(ConseillerId, CleActive)` garantit une seule veille ouverte par recommandation ; une nouvelle demande ajuste la durée.
  - Une veille n'est jamais une réalisation : elle ne touche ni le suivi, ni l'étape, ni les notes, ni l'historique ; elle sort la recommandation des priorités (`separerVeilles`, par identifiant : les autres raisons de la carte restent), du compteur « à traiter » et de l'Accueil, et compte à part (« en veille »), jamais dans « terminées ». Un suivi enregistré ne se met pas en veille (il se reporte, fonctionnalité 07) ; une démonstration garde le report local.
- États locaux et dossiers réels (fonctionnalité 15, `IntelligenceRegles.estDossierReel`, `etatLocalApplicable`, `statutPresente`) : un statut gardé dans le navigateur (« Ignorée », « Commencée », « Confiée », « Terminée », report local), une préférence de contact ou une pause ne s'applique jamais à un dossier réel (opportunité `oe-` ou prospect `pe-`), même s'il a été enregistré par une version précédente : ses obligations restent dues sur l'Accueil, le Centre d'actions et Mes suivis, et dans les compteurs. Seules les opérations enregistrées en base les changent (réalisation, report du suivi, note, veille). Pour un dossier réel, le menu « Plus » ne propose plus « Commencer », « Ignorer », « Confier » ni le report local (une explication les remplace), et Mes suivis ne propose plus « Préférences » ; le store refuse aussi ces écritures (`intelligence-store.js`). Les dossiers de démonstration gardent leur comportement local.
- Confirmations, états et indicateurs (fonctionnalité 16) :
  - Mentions réel / démonstration : une seule source, `Models/Constants/MentionsDonnees.cs` (pastilles « Réel et démo » des écrans mixtes, « Démo » des modules simulés, bandeau des fiches, note de l'Accueil).
  - Dossier réel : `prospects-store.js` refuse les modifications locales (étape, note, suivi, véhicule envisagé) ; « Gagné » (Transactions) et « Perdu » (Relations) ne sont pas proposés et sont refusés, avec une explication ; la page Véhicules renvoie à la fiche pour la note et le suivi. La démonstration garde ses actions locales, signalées « démonstration ».
  - Réalisation : un suivi réel n'est « Réalisée, enregistrée » que si la base le prouve (`IntelligenceRegles.issueSuiviEnregistree`, événement « suivi-realise » de la même opportunité et du même jour prévu, champ `DatePrevue` des événements de suivi) ; un report, un remplacement ou toute autre disparition reste « Devenue obsolète ». « Terminées aujourd'hui » compte les réalisations enregistrées du jour et les réalisations simulées.
  - Compteurs : « à traiter » (Centre, barre latérale, onglet, Accueil) compte les obligations que le conseiller garde (`IntelligenceRegles.actionsGardees`) ; le nombre de recommandations est affiché à part ; la phrase de l'Accueil compte toutes les priorités du jour.
  - Messages du serveur : `Intelligence/_DonneesModules.cshtml` ne lit TempData que si la page l'affiche (`ViewData["AfficheMessagesProspects"]`), comme `RendezVous/_DonneesModules.cshtml`.

Premier contact déclaré (« Première réponse ») : une seule règle, `estPremiereReponse` dans `intelligence-regles.js`. Une note ordinaire, une tâche terminée et un contact déclaré sont trois choses différentes. La première réponse d'une opportunité est satisfaite seulement par une note :
- d'un type de contact déclaré : `ReferentielsVente.TypesContactDeclare` (`ProspectsViewModels.cs` : `appel` « Appel effectué », `courriel` « Courriel (résumé) », `visite` « Visite en concession »), seule source, envoyée au navigateur (`referentiels.typesContact`). Jamais une « Note » simple, un suivi réalisé, reporté ou remplacé, un changement d'étape ; le texte libre n'est pas interprété ;
- rattachée à cette opportunité (« Concerne ») : une note générale ou d'une autre opportunité du même prospect ne compte pas (l'aide sous « Concerne » l'explique quand un type de contact est choisi sans opportunité ; la note générale reste permise) ;
- datée du moment de la demande ou après : comparaison des horodatages du serveur (`NotesProspect.DateCreation` et `OpportunitesVente.DateCreation`, même conversion `HeureLocale`). La création de l'opportunité sert de date de la demande (il n'existe pas de date de demande distincte) ;
- pour une opportunité enregistrée (« oe-… »), enregistrée en base (identifiant « ie-n… ») : une saisie locale du navigateur ne compte pas. La fenêtre « Préparer une relance » d'un dossier enregistré renvoie donc à la fiche (« Déclarer le contact dans la fiche ») au lieu de déclarer le contact en local, et un rendez-vous local ne prouve pas le contact. Les dossiers de démonstration gardent leur fonctionnement local.

Activité du dossier et contact déclaré (fonctionnalité 11) : toute interaction est une activité du dossier (note, suivi planifié, réalisé, reporté ou remplacé, étape…). Seule `estContactDeclare` (`intelligence-regles.js`) décide si elle est aussi un contact déclaré avec le client : type `appel`, `courriel` ou `visite` (`ReferentielsVente.TypesContactDeclare`), enregistré en base pour un prospect réel (« ie-n… »), ou `texto` pour les seules données de démonstration ; une note simple, une tâche réalisée, un report, un remplacement ou une étape n'en sont pas, et le texte libre n'est jamais interprété. `contactsDeclares` donne les contacts du plus récent au plus ancien. Trois calculs distincts :
- Dernière activité : interaction la plus récente parmi celles disponibles pour le prospect (notes, événements de suivi et d'étape, création, et entrées journalisées par les modules locaux de démonstration) ; ce n'est pas un journal exhaustif de tous les événements métier (fiche, « Dernière activité » ; liste des prospects, « Dernière interaction »). Une note y compte.
- Dernier contact déclaré : vue globale du prospect (contacts généraux et de toutes ses opportunités) dans la fiche (« Dernier contact déclaré »), « Mes suivis » (colonne « Dernier contact ») et la fenêtre « Préparer une relance » ; vue d'une opportunité (ses contacts et les contacts généraux, jamais ceux d'une autre opportunité) pour les règles de relance. « Aucun contact déclaré » s'il n'y en a pas.
- Première réponse : plus stricte (`estPremiereReponse`) : contact lié à l'opportunité, daté de la demande ou après. Un contact plus ancien ou général peut être le dernier contact du client sans satisfaire la première réponse.

Consommateurs de l'ancienne liste `ECHANGES` (supprimée, ainsi que ses copies) : « Dernier contact » de « Mes suivis » et de la fenêtre de relance (`intelligence-store.js`, contexteRelance) ; règles « soumission sans réponse » ou proche de l'expiration, « essai sans suite », « reprise après perte » (`Moteur.dernierContact`) ; Assistant vendeur (`coach-service.js` : chaque élément est étiqueté « Contact déclaré » ou « Note interne ») ; délai de première réponse des performances (`performances-calcul.js` : même règle que la recommandation « Première réponse ») ; faits des ventes perdues (`relations-regles.js` : « contact(s) déclaré(s) »). Les soumissions, rendez-vous, essais et ventes perdues restent des données de démonstration : ces règles ne deviennent pas persistantes ici.
- Limites : la date de la demande est approchée par la création de l'opportunité ; un contact déclaré n'est jamais vérifié ; les rendez-vous ne sont pas enregistrés en base (pas de preuve de contact pour un dossier réel).

Les lignes de « À venir » ne sont pas des recommandations du moteur : elles n'apparaissent pas au Centre d'actions et ne sont jamais dupliquées par plusieurs règles (une ligne par opportunité).

Dates civiles : un jour choisi dans un formulaire (« Pour le », date du suivi à la création) suit une règle unique, `ServiceProspects.EstJourAccepte`. Le navigateur impose « aujourd'hui ou plus tard » dans le fuseau de l'utilisateur ; le serveur, qui ne connaît pas le fuseau de chaque concession, accepte à partir de la veille de son propre jour. Le jour est stocké à 9 h, sans conversion UTC.

Fenêtres modales : la coque `.ph-espace` étant isolée, une fenêtre Bootstrap ouverte dans une page fait passer la coque au-dessus du fond gris de Bootstrap (`conseiller.css`, règles `.ph-espace:has(.modal.show)`) ; c'est la fenêtre qui assombrit la page.

Migrations : `DbSeeder` applique automatiquement les migrations en attente au démarrage de l'application, sur la base de la chaîne de connexion. Démarrer l'application sur une base réelle depuis une branche qui contient une nouvelle migration l'applique donc à cette base.

## Tests

- `Phineas/Phineas.Tests/` : tests xUnit du service et de la chaîne MVC complète, sur une base MySQL jetable (`phineas_test_xxxxxxxx`, supprimée à la fin). Serveur : variable `PHINEAS_TEST_MYSQL`, sinon le conteneur MySQL local (port 3307). `DoublonsProspectsTests.cs` envoie de vraies requêtes simultanées (barrière de départ) pour vérifier qu'un seul dossier est créé. `PrioritesTemporellesTests.cs` fixe l'heure du serveur (`ApplicationDeTest.Horloge`) autour de son minuit. `OpportunitesMultiplesTests.cs` couvre la création, l'indépendance et la sécurité des opportunités d'un même prospect. `QualificationOpportunitesTests.cs` couvre la qualification enregistrée (champs, sécurité, concurrence). `VehiculesEnvisagesTests.cs` couvre les véhicules envisagés (ajout, modification, retrait, sécurité, concurrence). `RendezVousCommerciauxTests.cs` couvre les rendez-vous enregistrés (fuseau, changements d'heure, types permis, sécurité, concurrence), avec une horloge de test fixe.
- `Phineas/Phineas.Tests/Js/regroupement-obligations.test.js`, `premier-contact.test.js`, `activites-contacts.test.js`, `centre-actions.test.js`, `accueil-priorites.test.js`, `veille-recommandations.test.js`, `statuts-locaux.test.js`, `etats-confirmations.test.js` `priorites-temporelles.test.js` (règle des six heures, minuits, instants fixes) `opportunites-multiples.test.js`, `qualification.test.js`, `vehicules-envisages.test.js` et `rendezvous-reels.test.js` : tests unitaires du moteur de recommandations (regroupement, réévaluation, premier contact déclaré, activité et contact déclaré, performances, ventes perdues, assistant, commandes et compteurs du Centre d'actions, priorités de l'Accueil, mise en veille, états locaux et dossiers réels, confirmations et indicateurs), sans dépendance : `node --test "Phineas.Tests/Js/*.test.js"` depuis le dossier `Phineas`.
- `Phineas/Phineas.Tests/E2E/creation-prospect.e2e.js`, `modification-prospect.e2e.js`, `conflit-prospect.e2e.js`, `etapes-prospect.e2e.js`, `notes-prospect.e2e.js`, `suivis-prospect.e2e.js`, `realisation-suivi.e2e.js`, `report-suivi.e2e.js`, `a-venir-suivis.e2e.js` (horloge du navigateur figée pour le passage de minuit), `deduplication-suivis.e2e.js`, `premier-contact.e2e.js`, `activites-contacts.e2e.js`, `centre-actions.e2e.js`, `accueil-priorites.e2e.js` et `veille-recommandations.e2e.js` (horloge du navigateur avancée pour l'expiration) `statuts-locaux.e2e.js` (anciens états de sessionStorage injectés), `etats-confirmations.e2e.js` et `doublons-prospects.e2e.js` (refus neutre, envois simultanés), `priorites-temporelles.e2e.js` (horloge du navigateur fixée de part et d'autre de minuit UTC et de minuit local) , `opportunites-multiples.e2e.js` (plusieurs opportunités d'un même prospect), `parcours-multi-opportunites.e2e.js` (projet nommé et ciblé dans chaque parcours), `qualification-opportunites.e2e.js` (qualification enregistrée), `vehicules-envisages.e2e.js` (véhicules envisagés enregistrés) et `rendezvous-reels.e2e.js` (rendez-vous enregistrés, fuseaux) : parcours Playwright dans un vrai navigateur (application lancée sur une base de test, voir l'en-tête de chaque fichier).
- Sur un poste où le Contrôle intelligent des applications de Windows bloque les DLL compilées, lancer les tests dans le conteneur `mcr.microsoft.com/dotnet/sdk:10.0` au lieu de désactiver la protection.

## Où trouver quoi : coque commune des espaces

Tous les rôles connectés (administrateur, directeur, vendeur, mécanicien) partagent la même barre latérale en verre et les mêmes blocs d'affichage.

- `Views/Shared/_LayoutEspace.cshtml` : la coque commune (barre latérale, carte de l'utilisateur, menu Affichage avec le thème sombre).
- `Models/ViewModels/NavigationEspaces.cs` : le menu de chaque rôle (`MenuPour(rôle)`). Le menu du vendeur reste dans `NavigationVendeur.cs`.
- `Views/Conseiller/_LayoutConseiller.cshtml` : la coque commune, plus la notification et `conseiller.js` propres au vendeur.
- `Views/Admin`, `Concessions`, `Utilisateurs`, `Directeur`, `Mecanicien` : un `_ViewStart.cshtml` par dossier choisit la coque commune.
- `wwwroot/css/espaces.css` (préfixe `es-`) : en-tête de page, chiffres, carte de liste avec tableau, statuts « point + libellé », état vide, formulaires, alertes et tuiles d'accueil, en clair et en sombre.

Pour une nouvelle page d'un espace : `es-page`, puis `es-entete` (`es-label`, `es-titre`, `es-intro`), `es-chiffres`, et la liste dans `es-verre es-module` avec `es-table`.

## Où trouver quoi : thème sombre

- `wwwroot/js/theme.js` : applique le thème avant l'affichage et gère le bouton de bascule. Son en-tête décrit le contrat complet.
- `wwwroot/css/theme-sombre.css` : palette sombre commune (variables `--ps-*`), composants Bootstrap en sombre, bouton `.ps-bascule-theme`.
- `wwwroot/css/espace-vendeur.css` et `conseiller.css` : coque vendeur et accueil vendeur en sombre (fin de chaque fichier).
- Chaque page refaite garde ses règles sombres dans sa propre feuille (ex. `prospects.css`, `accueil-public.css`).

Le contrat en bref :
- thème actif : `data-theme="sombre"` sur `<html>` (sans cet attribut : thème clair) ; Bootstrap reçoit aussi `data-bs-theme="dark"` ;
- préférence : `localStorage`, clé `phineas-theme`, valeur `clair` ou `sombre` (sans préférence : clair) ;
- `theme.js` se charge de façon synchrone dans le `<head>`, avant les feuilles de style ;
- API : `PhineasTheme.obtenir()`, `PhineasTheme.appliquer("sombre")`, `PhineasTheme.basculer()` ; événement `phineas:theme` sur `document` ;
- bouton : tout élément `[data-basculer-theme]` (icône `[data-theme-icone]`) ;
- réglage « Chiffres de l'accueil » : clé `phineas-accueil-chiffres` (`affiches` ou `masques`), case `[data-reglage-chiffres]`.

Où se trouvent les boutons : menu « Affichage » de la carte utilisateur (espace vendeur), barre de navigation de l'accueil public, haut de la page de connexion, en-tête de la page publique du conseiller.

Pour ajouter le thème sombre à une page, dans sa feuille :

```css
html[data-theme="sombre"] .ma-page {
  --ma-encre: var(--ps-texte);
  --ma-filet: var(--ps-filet);
}
html[data-theme="sombre"] .ma-carte { background: var(--ps-verre); border-color: var(--ps-contour); }
html[data-theme="sombre"] .ma-page .bouton-principal { background: var(--ps-btn-principal); color: var(--ps-btn-principal-texte); }
```

## Où trouver quoi : Docker

- `Dockerfile` (racine du dépôt) : construit l'image en deux étapes, compilation avec le SDK .NET 10 puis image finale avec le runtime seul.
- `.dockerignore` : exclut `bin`, `obj`, `.vs` et `.git` de l'image.

Construire et lancer (depuis la racine du dépôt, Docker Desktop démarré) :

```bash
docker build -t phineas .
docker run -p 8080:8080 -e ConnectionStrings__DefaultConnection="Server=host.docker.internal;Port=3306;Database=phineas;User=phineas;Password=..." phineas
```

L'application répond ensuite sur `http://localhost:8080`. `host.docker.internal` désigne la machine hôte : c'est là que le conteneur trouve la base MySQL locale. Les migrations s'appliquent au démarrage.



## Getting started

To make it easy for you to get started with GitLab, here's a list of recommended next steps.

Already a pro? Just edit this README.md and make it your own. Want to make it easy? [Use the template at the bottom](#editing-this-readme)!

## Add your files

* [Create](https://docs.gitlab.com/user/project/repository/web_editor/#create-a-file) or [upload](https://docs.gitlab.com/user/project/repository/web_editor/#upload-a-file) files
* [Add files using the command line](https://docs.gitlab.com/topics/git/add_files/#add-files-to-a-git-repository) or push an existing Git repository with the following command:

```
cd existing_repo
git remote add origin https://git.dti.crosemont.quebec/jsingh/phineas.git
git branch -M main
git push -uf origin main
```

## Integrate with your tools

* [Set up project integrations](https://git.dti.crosemont.quebec/jsingh/phineas/-/settings/integrations)

## Collaborate with your team

* [Invite team members and collaborators](https://docs.gitlab.com/user/project/members/)
* [Create a new merge request](https://docs.gitlab.com/user/project/merge_requests/creating_merge_requests/)
* [Automatically close issues from merge requests](https://docs.gitlab.com/user/project/issues/managing_issues/#closing-issues-automatically)
* [Enable merge request approvals](https://docs.gitlab.com/user/project/merge_requests/approvals/)
* [Set auto-merge](https://docs.gitlab.com/user/project/merge_requests/auto_merge/)

## Test and Deploy

Use the built-in continuous integration in GitLab.

* [Get started with GitLab CI/CD](https://docs.gitlab.com/ci/quick_start/)
* [Analyze your code for known vulnerabilities with Static Application Security Testing (SAST)](https://docs.gitlab.com/user/application_security/sast/)
* [Deploy to Kubernetes, Amazon EC2, or Amazon ECS using Auto Deploy](https://docs.gitlab.com/topics/autodevops/requirements/)
* [Use pull-based deployments for improved Kubernetes management](https://docs.gitlab.com/user/clusters/agent/)
* [Set up protected environments](https://docs.gitlab.com/ci/environments/protected_environments/)

***

# Editing this README

When you're ready to make this README your own, just edit this file and use the handy template below (or feel free to structure it however you want - this is just a starting point!). Thanks to [makeareadme.com](https://www.makeareadme.com/) for this template.

## Suggestions for a good README

Every project is different, so consider which of these sections apply to yours. The sections used in the template are suggestions for most open source projects. Also keep in mind that while a README can be too long and detailed, too long is better than too short. If you think your README is too long, consider utilizing another form of documentation rather than cutting out information.

## Name
Choose a self-explaining name for your project.

## Description
Let people know what your project can do specifically. Provide context and add a link to any reference visitors might be unfamiliar with. A list of Features or a Background subsection can also be added here. If there are alternatives to your project, this is a good place to list differentiating factors.

## Badges
On some READMEs, you may see small images that convey metadata, such as whether or not all the tests are passing for the project. You can use Shields to add some to your README. Many services also have instructions for adding a badge.

## Visuals
Depending on what you are making, it can be a good idea to include screenshots or even a video (you'll frequently see GIFs rather than actual videos). Tools like ttygif can help, but check out Asciinema for a more sophisticated method.

## Installation
Within a particular ecosystem, there may be a common way of installing things, such as using Yarn, NuGet, or Homebrew. However, consider the possibility that whoever is reading your README is a novice and would like more guidance. Listing specific steps helps remove ambiguity and gets people to using your project as quickly as possible. If it only runs in a specific context like a particular programming language version or operating system or has dependencies that have to be installed manually, also add a Requirements subsection.

## Usage
Use examples liberally, and show the expected output if you can. It's helpful to have inline the smallest example of usage that you can demonstrate, while providing links to more sophisticated examples if they are too long to reasonably include in the README.

## Support
Tell people where they can go to for help. It can be any combination of an issue tracker, a chat room, an email address, etc.

## Roadmap
If you have ideas for releases in the future, it is a good idea to list them in the README.

## Contributing
State if you are open to contributions and what your requirements are for accepting them.

For people who want to make changes to your project, it's helpful to have some documentation on how to get started. Perhaps there is a script that they should run or some environment variables that they need to set. Make these steps explicit. These instructions could also be useful to your future self.

You can also document commands to lint the code or run tests. These steps help to ensure high code quality and reduce the likelihood that the changes inadvertently break something. Having instructions for running tests is especially helpful if it requires external setup, such as starting a Selenium server for testing in a browser.

## Authors and acknowledgment
Show your appreciation to those who have contributed to the project.

## License
For open source projects, say how it is licensed.

## Project status
If you have run out of energy or time for your project, put a note at the top of the README saying that development has slowed down or stopped completely. Someone may choose to fork your project or volunteer to step in as a maintainer or owner, allowing your project to keep going. You can also make an explicit request for maintainers.
