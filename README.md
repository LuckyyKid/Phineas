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

- `Services/Conseiller/ServiceProspects.cs` : lecture (prospects fictifs + prospects enregistrés du conseiller) et création (validation, doublons, attribution à la concession et au conseiller).
- `Services/Conseiller/ServiceProspectsDemo.cs` : prospects fictifs de démonstration, ajoutés à la liste par `ServiceProspects`.
- `Models/Entities/Prospect.cs` et `OpportuniteVente.cs` : tables `Prospects` et `OpportunitesVente` (migration `AjoutProspects`).
- `Views/Prospects/_TiroirProspect.cshtml` et `wwwroot/js/prospects-tiroir.js` : formulaire « Nouveau prospect ».
- `wwwroot/js/prospects-store.js` : état de la page ; les prospects enregistrés viennent toujours du serveur.

Trajet d'une création : clic sur « Créer le prospect » → `prospects-tiroir.js` (vérification dans le navigateur) → `POST /Prospects/Creer` (`ProspectsController.Creer`, jeton antiforgery) → `ServiceProspects.CreerAsync` → base MySQL → retour à `/Prospects` avec un message (ou tiroir rouvert avec les erreurs).

Trajet d'une modification (prospect enregistré seulement) : bouton « Modifier » de la fiche → `prospects-tiroir.js` (tiroir prérempli, opportunité visée et empreinte dans des champs cachés) → `POST /Prospects/Modifier` (`ProspectsController.Modifier`) → `ServiceProspects.ModifierAsync` → base MySQL → retour à la fiche avec un message. La modification d'un prospect fictif reste locale à l'onglet. La fiche d'un prospect enregistré est vérifiée par `ServiceProspects.ConsulterAsync` (404 s'il n'est pas dans le dossier du conseiller).

Trajet d'un changement d'étape (opportunité enregistrée seulement) : menu « Étape » de l'onglet Opportunités ou menu du pipeline → `prospects-store.js` (`envoyerEtape`) → `POST /Prospects/ChangerEtape` → `ServiceProspects.ChangerEtapeAsync` (verrou du prospect, nouvelle étape et ligne de `HistoriquesEtapeOpportunite` enregistrées ensemble) → retour à la fiche ou à la liste avec un message. `Models/Entities/HistoriqueEtapeOpportunite.cs` : historique des étapes (migration `AjoutHistoriqueEtapes`), affiché dans l'onglet Historique. Pour une opportunité enregistrée, « Perdu » (motif de perte pas encore en base) et « Gagné » (confirmation par une transaction pas encore reliée) sont refusés par le serveur ; les autres étapes, et le retour en arrière, sont permis.

Trajet d'une note (prospect enregistré seulement) : formulaire « Ajouter une note » de l'onglet Historique → `prospects-fiche.js` → `POST /Prospects/AjouterNote` → `ServiceProspects.AjouterNoteAsync` (verrou du prospect ; jeton unique du formulaire contre les doubles envois) → table `NotesProspect` (`Models/Entities/NoteProspect.cs`, migration `AjoutNotesProspect`) → retour à l'historique de la fiche avec un message. Une note sur un prospect fictif reste locale à l'onglet.

Trajet d'un suivi (opportunité enregistrée) : fenêtre « Planifier un suivi » de la fiche → `prospects-fiche.js` → `POST /Prospects/PlanifierSuivi` → `ServiceProspects.PlanifierSuiviAsync` (verrou du prospect, empreinte) → `OpportuniteVente.ProchaineAction` et `DateProchaineAction` (une seule prochaine action par opportunité, remplacée ; le jour choisi est gardé à 9 h, sans conversion UTC) → retour à la fiche avec un message. Les champs « Prochaine action » et « Pour le » du formulaire de note planifient le même suivi, enregistré avec la note (tout ou rien). Aucun rappel n'est envoyé. Une action remplacée par une nouvelle planification est archivée « Remplacé » (jamais comptée comme réalisée).

Trajet d'une réalisation : bouton « Marquer comme réalisé » d'une ligne de « Mes suivis » (ou « Marquer comme réalisée » d'une carte du Centre d'actions ou de la fiche, pour un suivi enregistré) → `prospects-store.js` (`envoyerRealisation`, avec l'empreinte de l'action affichée) → `POST /Prospects/RealiserSuivi` → `ServiceProspects.RealiserSuiviAsync` (verrou du prospect ; refus si l'action a changé entre-temps) → l'action est archivée « Réalisé » dans `HistoriquesSuiviOpportunite` (`Models/Entities/HistoriqueSuiviOpportunite.cs`, migration `AjoutHistoriqueSuivis`) et retirée de `ProchaineAction` → retour à la page d'origine avec un message. Les événements « Suivi réalisé » et « Suivi remplacé » s'affichent dans l'onglet Historique de la fiche.

« Mes suivis » (`intelligence-regles.js`, règle `suivi-echeance`) : un suivi enregistré dû aujourd'hui ou en retard apparaît toujours ; un suivi futur n'apparaît qu'à son échéance (il reste visible sur la fiche ; une vue « À venir » fera l'objet d'une fonctionnalité dédiée). Les autres actions de la page (préférences, pause, message) restent locales.

Plusieurs lignes pour une même opportunité : le moteur peut produire, pour un même dossier, une ligne par obligation différente. Exemple courant : « Demande reçue sans première réponse » (répondre à une demande entrante) et « Suivi demandé arrivé à échéance » (faire l'action planifiée par le conseiller). Ce sont deux obligations distinctes, pas un doublon : la première disparaît quand un premier échange est enregistré, la seconde quand le suivi est réalisé ou replanifié. La mention « prévu : … » dans la première ligne n'est qu'un rappel de contexte ; seule la ligne du suivi porte « Marquer comme réalisé ». Aucune ligne n'est supprimée automatiquement ; un éventuel regroupement des lignes d'un même dossier relève d'une évolution du moteur, hors de cette fonctionnalité.

Dates civiles : un jour choisi dans un formulaire (« Pour le », date du suivi à la création) suit une règle unique, `ServiceProspects.EstJourAccepte`. Le navigateur impose « aujourd'hui ou plus tard » dans le fuseau de l'utilisateur ; le serveur, qui ne connaît pas le fuseau de chaque concession, accepte à partir de la veille de son propre jour. Le jour est stocké à 9 h, sans conversion UTC.

Fenêtres modales : la coque `.ph-espace` étant isolée, une fenêtre Bootstrap ouverte dans une page fait passer la coque au-dessus du fond gris de Bootstrap (`conseiller.css`, règles `.ph-espace:has(.modal.show)`) ; c'est la fenêtre qui assombrit la page.

Migrations : `DbSeeder` applique automatiquement les migrations en attente au démarrage de l'application, sur la base de la chaîne de connexion. Démarrer l'application sur une base réelle depuis une branche qui contient une nouvelle migration l'applique donc à cette base.

## Tests

- `Phineas/Phineas.Tests/` : tests xUnit du service et de la chaîne MVC complète, sur une base MySQL jetable (`phineas_test_xxxxxxxx`, supprimée à la fin). Serveur : variable `PHINEAS_TEST_MYSQL`, sinon le conteneur MySQL local (port 3307).
- `Phineas/Phineas.Tests/E2E/creation-prospect.e2e.js`, `modification-prospect.e2e.js`, `conflit-prospect.e2e.js`, `etapes-prospect.e2e.js`, `notes-prospect.e2e.js`, `suivis-prospect.e2e.js` et `realisation-suivi.e2e.js` : parcours Playwright dans un vrai navigateur (application lancée sur une base de test, voir l'en-tête de chaque fichier).
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
