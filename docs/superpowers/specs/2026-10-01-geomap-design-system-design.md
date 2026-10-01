# geoMap — Application du design system ALIAS à l'application web

- **Date :** 2026-10-01
- **Statut :** design validé, en attente de relecture de la spec
- **Source :** design system « geoMap » (artifact Design System, `project/tokens.json`, `project/components/bundle.css`, `project/components/bundle.js`, polices et README), lu le 2026-10-01
- **S'appuie sur :** `2026-09-25-geomap-v1-core-design.md`, `2026-09-30-geomap-imagery-design.md`

## 1. Objectif

Toutes les pages existantes de l'application web suivent le design system ALIAS : couleurs en deux thèmes (Nuit, Jour), polices Sora, Inter et JetBrains Mono, icônes, logo, composants. Le comportement ne change pas.

### Critère de succès

Un planificateur et un administrateur utilisent toutes les pages dans le thème de leur système ou dans un thème forcé ; la carte suit le thème ; les parcours Playwright existants passent sans changement de comportement ; aucune ressource n'est chargée depuis Internet.

## 2. Décisions

| Sujet | Décision |
|---|---|
| Branche | `feature/design-system`, depuis `main` (imagerie fusionnée). |
| Composants | `bundle.js` porté en TSX pour React 19, même API, dans `web/src/ui/`. Pas de script global `window.geoMap`. |
| Périmètre des composants | `Icon`, `Logo`, `Button`, `StatusBadge`, `Alert`, `SiteHeader`, `Sidebar`, `MapPanel`, `CoordinateReadout`, `ModeSwitch`. Exclus (console ALIAS) : `ServiceTable`, `ServiceRow`, `CatalogItem`, `LinkIndicator`, `Meter`, `Progress`, `Locality`. |
| Valeurs du design system | `tokens.json` copié tel quel ; `tokens.css` généré à chaque lancement par un plugin Vite (module virtuel). |
| Navigation | Barre latérale (repliée par défaut dans l'éditeur) + en-tête fin. |
| Thème | Suit le réglage du système ; bascule Système / Nuit / Jour dans l'en-tête, mémorisée par navigateur. |
| Carte | Suit le thème : variante Protomaps `dark` en Nuit, `light` en Jour. |
| Logo | Logo ALIAS du design system utilisé tel quel (redessiné, à valider), isolé dans le composant `Logo`. |

## 3. Valeurs du design system

- `web/src/ui/tokens.json` : copie exacte du fichier du design system. Seule source de vérité ; une resynchronisation consiste à le remplacer.
- `web/src/ui/tokens.ts` : fonction pure `tokensCss(tokens): string`.
  - Couleurs : Nuit sous `@media (prefers-color-scheme: dark)` sur `:root:not([data-theme="light"])` et sous `:root[data-theme="dark"]` ; Jour sous `:root` et `:root[data-theme="light"]`.
  - Alias `{nom}` résolus ; un alias vers un jeton absent, une valeur de couleur invalide ou une valeur manquante dans un thème lève une erreur qui fait échouer le lancement et les tests.
  - `@font-face` pour chaque police de `type.fonts` ; `--font-display`, `--font-sans`, `--font-mono` depuis `type.families` ; `--space-*`, `--radius-*`, tailles (`--row-dense`, `--header-height`, `--sidebar-width`…) et `--shadow-overlay` par thème.
- Plugin Vite `geomapTokens()` dans `vite.config.ts` : fournit `virtual:geomap-tokens.css`, importé une fois dans `main.tsx` ; recharge la page quand `tokens.json` change. Vitest utilise la même configuration.
- `web/src/ui/fonts/` : les quatre `.woff2` du design system et la licence SIL OFL.
- `web/src/ui/ui.css` : règles `al-*` de `bundle.css`, sans celles des composants exclus.
- `web/src/ui/mapColors.ts` : couleurs de carte (`map-feature`, `map-guide`, `map-empty`, `map-halo`) lues dans `tokens.json` ; `missionLayer.ts`, `symbolLayer.ts` et `style.ts` n'ont plus de couleur écrite en dur.

## 4. Thème

- Hook `useTheme()` : `preference` (`system` | `dark` | `light`), `resolved` (`dark` | `light`), `setPreference`.
- Préférence dans `localStorage` sous `geomap.theme` ; toute lecture ou écriture protégée : sans stockage, le thème suit le système.
- Changement du réglage système suivi en direct tant que la préférence vaut `system`.
- Premier affichage : un petit script classique `public/theme-init.js`, chargé avant l'application depuis `index.html`, pose `data-theme` à partir de la préférence mémorisée pour éviter un éclair clair. Fichier externe, pas de script en ligne, pour rester compatible avec une future politique de sécurité du contenu stricte.

## 5. Cadre de page et écrans

### 5.1 Cadre (`Layout.tsx`)

- `Sidebar` : logo « ALIAS · geoMap » ; **Missions** (planificateur), **Terminaux** et **Fonds de carte** (administrateur) avec les icônes `missions`, `terminals`, `basemaps` ; `aria-current="page"` sur l'entrée active ; bouton « Replier ». 232 px dépliée, 56 px repliée. Repliée par défaut sur l'éditeur, dépliée ailleurs ; le choix de l'utilisateur est mémorisé (`geomap.sidebar`).
- `SiteHeader` (48 px) : titre de la page ; bascule de thème ; avatar (initiales), nom, rôle (« Planificateur » ou « Administrateur ») ; bouton « Déconnexion ». Pas de nom de site ni d'indicateur de liaison.
- Page sur `bg-000`, panneaux sur `bg-100` séparés par `line`, marges `space-5`.

### 5.2 Écrans

- **Missions** : formulaire de création dans un panneau ; liste en `al-table` ; état en `StatusBadge` : Brouillon → `blocked` (neutre), Publiée → `ok`, Retirée → `revoked`.
- **Éditeur** : panneau `bg-100`, titre en Sora ; barre de dessin avec icône et libellé (`draw-point`, `draw-line`, `draw-polygon`, cercle) ; « Publier » seul bouton primaire de l'écran ; « Retirer » en variante irréversible ; erreurs et avertissements de publication en `Alert` et `StatusBadge`.
- **Carte** : sélecteur de mode et alertes de couche dans des `MapPanel` (`shadow-overlay`) ; coordonnées dans `CoordinateReadout` (MGRS d'abord, mono) ; contrôles MapLibre (zoom, boussole, attribution) aux couleurs du thème.
- **Terminaux, Fonds de carte** : `al-table`, champs sur `bg-200` ; type de fond en badge neutre ; « Révoquer » en variante irréversible.
- **Erreur, chargement** : `Alert` avec titre et suite à donner.
- **Libellés** : inchangés (les parcours Playwright s'appuient sur les noms accessibles) ; un libellé ne change que si la charte l'impose, test mis à jour avec lui.

## 6. Carte

- `basemapStyle({ vector, imagery, theme })` : `namedFlavor("light")` ou `namedFlavor("dark")` ; sprite `sprites/v4/light` ou `sprites/v4/dark`.
- `public/map-assets/sprites/v4/dark*` ajoutés depuis le même commit de `protomaps/basemaps-assets` ; `SOURCE.md` mis à jour ; licence du sprite toujours en revue juridique.
- Sans fond vectoriel : fond `map-empty`.
- Satellite et Hybride : l'imagerie ne change pas ; les couches vectorielles visibles suivent le thème.
- Changement de thème : la carte est recréée comme lors d'un changement de fond ; la vue en cours (centre, zoom, orientation) est conservée ; l'édition en cours est désélectionnée. Pas de `setStyle`.
- Objets : `map-feature`, halo `map-halo`, guides `map-guide`. Symboles APP-6D inchangés.

## 7. Accessibilité

- Valeurs du design system reprises telles quelles (texte ≥ 4,5:1, contours de contrôles ≥ 3:1). Écart connu du design system : fond du bouton primaire en Jour à 2,86:1, conservé et signalé.
- Focus clavier visible sur tout élément interactif : 2 px `focus-ring`, décalage 2 px.
- États toujours avec symbole et libellé ; rien ne dépend du survol.

## 8. Tests

| Niveau | Contenu |
|---|---|
| Unitaires | `tokensCss` (deux thèmes, alias, erreurs, polices, tailles) ; module virtuel du plugin ; composants portés (`Icon` : tracé par nom et nom accessible ; `Button` : variantes et désactivé ; `StatusBadge` : libellé par défaut ; `Alert` : rôle ; `Sidebar` : entrée active et repli mémorisé ; `ModeSwitch` : `aria-pressed`) ; `useTheme` (système, forcé, stockage indisponible, changement système) ; `basemapStyle` (variante et sprite existant selon le thème) ; cadre de page (navigation selon le rôle, bascule de thème, déconnexion). Tests existants verts. |
| Parcours Playwright | Les 7 existants ; nouveau : forcer Nuit (`data-theme="dark"`), ouvrir une mission, changer de thème pendant l'édition, carte recréée au même endroit sans erreur de page, objets visibles, thème conservé au rechargement. |
| Contrôle | `make check`, puis `make e2e`. |

## 9. Hors périmètre

- Écrans et composants propres à la console ALIAS.
- Tiroir et barre inférieure pour tablette.
- Application Android (elle reprendra `tokens.json`).
- Toute modification du design system lui-même.

## 10. Points ouverts

| Point | Action |
|---|---|
| Logo ALIAS redessiné | Valider contre l'original officiel ; remplacer dans `Logo`. |
| Licence du sprite Protomaps (clair et sombre) | Revue juridique. |
| Bouton primaire en Jour (2,86:1) | Décision de la marque. |
