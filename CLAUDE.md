# CLAUDE.md : design de Phineas

Règles de design communes à toute l'équipe et à tout agent de code (Claude Code les lit au début de chaque séance).
But : chaque page, de chaque rôle, a le même aspect que l'espace vendeur (le « nouveau design » : verre clair, vert sapin, thème sombre).

En cas de doute, ouvrir une page qui existe déjà et copier sa structure :
- liste : `Views/Concessions/Index.cshtml` ;
- fiche : `Views/Concessions/Details.cshtml` ;
- formulaire : `Views/Utilisateurs/Creer.cshtml` et `_Formulaire.cshtml` ;
- accueil d'un rôle : `Views/Admin/Index.cshtml`.

## 1. Où vit le design

| Fichier | Rôle |
|---|---|
| `Views/Shared/_LayoutEspace.cshtml` | Coque de **toutes** les pages connectées : barre latérale en verre, carte de l'utilisateur, menu Affichage (thème sombre). |
| `Models/ViewModels/NavigationEspaces.cs` | Menu de la barre latérale pour chaque rôle (`MenuPour(rôle)`). Menu du vendeur : `NavigationVendeur.cs`. |
| `Views/Conseiller/_LayoutConseiller.cshtml` | Coque commune, plus la notification et `conseiller.js` propres au vendeur. |
| `wwwroot/css/espaces.css` | Blocs communs, préfixe `es-` : en-tête, chiffres, listes, statuts, formulaires, alertes, tuiles. |
| `wwwroot/css/conseiller.css`, `espace-vendeur.css` | Variables `--ph-*` de la coque, halos, barre latérale, en-tête d'accueil (`ph-head`, `ph-hello`). |
| `wwwroot/css/theme-sombre.css` | Palette du thème sombre `--ps-*`. |
| `wwwroot/js/theme.js` | Contrat du thème clair / sombre (lire son en-tête). |

Pages publiques (hors connexion), qui ont leur propre mise en page : accueil `Views/Home/Index.cshtml` (`accueil-public.css`, préfixe `acc-`) et connexion `Views/Account/Login.cshtml` (`connexion.css`, préfixe `cx-`).

## 2. Règles à ne jamais enfreindre

1. **Une page connectée utilise la coque commune.** Dans un nouveau dossier de vues, ajouter un `_ViewStart.cshtml` avec `Layout = "_LayoutEspace";`. Une page vendeur utilise `_LayoutConseiller`. Jamais de nouvelle barre latérale ni de `Layout = null` pour une page connectée.
2. **Nouvelle page d'un rôle = nouvelle entrée de menu** dans `NavigationEspaces.cs` (ou `NavigationVendeur.cs`). Une entrée sans contrôleur s'affiche grisée « bientôt ».
3. **Réutiliser les blocs `es-` avant d'écrire du CSS.** Une page n'a sa propre feuille que pour ce qui lui est vraiment propre, avec son propre préfixe (ex. `sl-` pour la liste des soumissions), chargée dans `@section Styles`.
4. **Aucune nouvelle couleur inventée** : utiliser les variables `--ph-*` (clair) et `--ps-*` (sombre). Les quelques valeurs fixes déjà présentes dans `espaces.css` (vert sapin `#17614F` des points et interrupteurs, ambre des étiquettes « Bientôt », blanc `#FFFFFF` des surfaces en clair) sont la référence : les reprendre telles quelles plutôt que d'en créer d'autres.
5. **Toute nouvelle règle a sa version sombre**, à la fin de la même feuille, sous `html[data-theme="sombre"] .prefixe { … }`. Vérifier chaque page dans les deux thèmes (menu Affichage, en bas de la barre latérale).
6. **Pas de Bootstrap visuel dans les pages connectées** : pas de `card`, `table`, `btn-primary`, `badge`, `alert`, `form-control`, `breadcrumb`. Bootstrap reste permis pour la grille utilitaire (`d-flex`, `gap-2`, `visually-hidden`), les menus déroulants (`dropdown`) et les icônes `bi`.
7. **Refaire une page d'après une maquette = design seulement** : garder toute la logique, les champs, les routes, les formulaires et les modes existants.
8. **Textes de l'interface** : aucun tiret décoratif (—, – ou « - » entouré d'espaces). Réécrire avec une virgule, un point, un deux-points ou des parenthèses. Une valeur absente s'écrit en mots (« Aucun », « Jamais »), pas « — ».

## 3. Identité visuelle

**Polices** : Geist (texte) et Geist Mono (étiquettes, chiffres de référence), chargées par la coque. Variables `--ph-font` et `--ph-mono`.

**Couleurs (clair)**, toutes définies sur `.ph-espace` :

| Variable | Usage |
|---|---|
| `--ph-ink` | titres, texte principal, chiffres |
| `--ph-text` | paragraphes, libellés courants |
| `--ph-muted`, `--ph-muted-2` | précisions, étiquettes, placeholders |
| `--ph-line`, `--ph-line-2` | contours et filets |
| `--ph-sapin` | dégradé vert sapin du bouton principal |
| `--ph-sapin-ink`, `--ph-menthe-ink` | texte vert, focus, liens d'action |
| `--ph-rouge`, `--ph-ambre` | erreur ou blocage ; à surveiller |
| `--ph-glass-bg`, `--ph-glass-blur`, `--ph-glass-shadow` | surface en verre |

En sombre, les `--ph-*` sont redéfinies automatiquement ; pour les surfaces, utiliser `--ps-verre`, `--ps-contour`, `--ps-champ`, `--ps-btn-principal`, `--ps-btn-second`, `--ps-menthe`, `--ps-survol` (liste complète en tête de `theme-sombre.css`).

**Formes** : pilules `border-radius: 999px` (boutons, champs de recherche, menus) ; chiffres 20 px ; cartes et tuiles 24 px ; carte de liste 28 px ; champs de formulaire 14 px.

**Typographie des titres** : grand titre fin (`font-weight: 300`, lettres resserrées `-0.04em`), étiquette au-dessus en Geist Mono majuscules espacées.

**Boutons** :
- `es-btn-sapin` : l'action principale, **une seule par page** ou par carte. En thème sombre, elle devient blanche (automatique).
- `es-btn-secondaire` : toutes les autres actions ; ajouter `es-btn-danger` pour supprimer ou retirer (texte rouge, jamais de bouton rouge plein).

**Statuts** : toujours un point de 8 px et un libellé, sans fond ni contour.
- `es-st-ok` : vert, actif ou en ordre ;
- `es-st-attente` : ambre, à surveiller ;
- `es-st-alerte` : rouge, bloqué ;
- `es-st-off` : point creux gris, suspendu ou désactivé ;
- `es-st-couleur` avec `style="--c: …"` : couleur fournie (ex. statut d'un véhicule).

## 4. Composer une page (blocs `es-`)

```html
<div class="es-page">                          <!-- es-page-etroite pour un formulaire -->
    <nav class="es-ariane" aria-label="Fil d'Ariane">
        <a asp-action="Index">Concessions</a><i class="bi bi-chevron-right" aria-hidden="true"></i><span aria-current="page">Nom</span>
    </nav>

    <header class="es-entete">
        <div>
            <p class="es-label">Administration</p>
            <h1 class="es-titre">Concessions</h1>
            <p class="es-intro">Une phrase qui dit à quoi sert la page.</p>
        </div>
        <a class="es-btn-sapin" asp-action="Creer"><i class="bi bi-plus-lg" aria-hidden="true"></i>Nouvelle concession</a>
    </header>

    <partial name="_Alertes" />                <!-- messages TempData après une action -->

    <section class="es-chiffres" aria-label="Résumé">
        <div class="es-verre es-chiffre"><span class="es-chiffre-valeur">12</span><span class="es-chiffre-libelle">au total</span></div>
    </section>

    <section class="es-verre es-module" aria-label="Liste">
        <form method="get" class="es-outils">  <!-- recherche et filtres -->
            <div class="es-recherche"><i class="bi bi-search" aria-hidden="true"></i><input type="search" name="q" placeholder="Rechercher" /></div>
            <select class="es-select" name="filtre">…</select>
        </form>
        <div class="es-defile">
            <table class="es-table">
                <thead><tr><th>Nom</th><th>Statut</th><th class="es-cellule-ouvrir"><span class="visually-hidden">Ouvrir</span></th></tr></thead>
                <tbody>
                    <tr>
                        <td><span class="es-nom">Nom</span><span class="es-sous">Précision</span></td>
                        <td><span class="es-statut es-st-ok"><span class="es-statut-point" aria-hidden="true"></span>Actif</span></td>
                        <td class="es-cellule-ouvrir"><a class="es-ouvrir" href="…" aria-label="Ouvrir Nom"><i class="bi bi-arrow-right" aria-hidden="true"></i></a></td>
                    </tr>
                </tbody>
            </table>
        </div>
        <!-- Liste vide : <div class="es-vide"><span class="es-vide-icone"><i class="bi bi-…"></i></span><p>Aucun élément pour l'instant.</p></div> -->
    </section>
</div>
```

Autres blocs :
- **Carte simple** : `es-verre es-carte`, titre `es-carte-titre`.
- **Carte avec en-tête** : `es-verre es-module`, puis `es-module-tete` (titre `h2` et bouton).
- **Formulaire** : `<form class="es-formulaire">`, champs dans `es-champ` (label, input ou select, `es-aide`, `es-erreur`), deux colonnes avec `es-grille` (`es-pleine-largeur` pour une ligne entière), interrupteur `form-check form-switch es-interrupteur`, choix en cartes `es-choix`, boutons dans `es-actions`. Résumé de validation : `<div asp-validation-summary="ModelOnly" class="es-alerte es-alerte-erreur"></div>`.
- **Alerte** : `es-alerte` avec `es-alerte-ok`, `es-alerte-erreur`, `es-alerte-info` ou `es-alerte-attention`.
- **Accueil d'un rôle** : `<partial name="_LoginConfirmation" model="Model" view-data='new ViewDataDictionary(ViewData) { ["Embleme"] = true }' />` (salutation et logo qui tourne), puis `es-section-titre` et des tuiles `es-verre es-tuile` (`es-tuile-off` et `es-bientot` pour un module à venir).
- **Menu d'actions d'une ligne** : `dropdown` Bootstrap avec `dropdown-menu ph-menu` ; dans une carte de liste, ajouter `data-bs-popper-config='{"strategy":"fixed"}'` au bouton, sinon le menu est coupé.
- **Colonnes à masquer** sur petit écran : `es-cacher-tablette` (moins de 992 px), `es-cacher-mobile` (moins de 768 px).

## 5. Avant de dire qu'une page est terminée

1. `dotnet build` passe sans erreur.
2. La page s'ouvre avec le bon rôle, dans la coque commune, et son entrée de menu est surlignée.
3. Vérifiée en thème clair **et** sombre, à 1440 px et à 390 px de large (aucun défilement horizontal de la page).
4. Aucune couleur en dur, aucun composant Bootstrap visuel, aucun tiret décoratif dans les textes.
5. La section « Où trouver quoi » du `README.md` est à jour si un fichier important a été ajouté.
