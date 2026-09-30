# geoMap — Couches d'imagerie (vue satellite)

- **Date :** 2026-09-30
- **Statut :** design validé, en attente de relecture de la spec
- **S'appuie sur :** `2026-09-25-geomap-v1-core-design.md` (V1, section 2 « format extensible à d'autres couches », section 13 « couches satellite hors périmètre V1 »)

## 1. Objectif

Permettre au planificateur de voir le terrain réel (images aériennes ou satellite) en plus de la carte vectorielle, hors ligne, sur le PC. Les objets de mission et les symboles APP-6D restent dessinés au-dessus.

Livraison en deux temps :

1. **Maintenant (ce document, périmètre livré) :** serveur, web et outil de préparation. Le paquet envoyé aux terminaux ne change pas.
2. **Plus tard (conçu ici, livré avec le plan Android) :** l'imagerie voyage vers les terminaux.

### Critère de succès

Un administrateur importe un fichier d'imagerie PMTiles préparé par l'outil ; un planificateur l'ajoute aux couches d'une mission, bascule entre Carte, Satellite et Hybride, et voit ses objets et symboles au-dessus de l'imagerie, sans erreur, hors ligne.

## 2. Décisions

| Sujet | Décision |
|---|---|
| Portée | Web d'abord ; format conçu pour le terrain, livré avec Android. |
| Affichage | Trois modes : Carte, Satellite, Hybride (imagerie + routes et noms du vectoriel). Pas de transparence réglable. |
| Modèle | Une mission porte une liste ordonnée de couches : exactement un fond vectoriel, puis zéro ou plusieurs couches raster. |
| Arrivée de l'imagerie | Import par l'administrateur d'un PMTiles raster déjà préparé. Pas de génération par le serveur, pas de téléchargement par le serveur (isolé d'Internet). |
| Outil de préparation | `tools/imagery/`, Python 3, hors produit : entrée service IGN (Géoplateforme) ou fichiers GeoTIFF/JP2 locaux (GDAL). |
| Sources | IGN BD ORTHO (Licence Ouverte Etalab 2.0) ; imagerie fournie par ALIAS. Exclues : sources interdisant l'usage hors ligne (Esri, Google, Bing). |

## 3. Serveur

### 3.1 Fonds de carte

- Nouvel attribut `kind` : `VECTOR` ou `RASTER`, lu dans l'en-tête PMTiles à l'import (type de tuile : MVT → `VECTOR` ; PNG, JPEG, WebP, AVIF → `RASTER`).
- Un fichier qui n'est pas un PMTiles lisible (en-tête absent ou invalide) est refusé à l'import (400, « le fichier n'est pas un PMTiles valide »). Aujourd'hui n'importe quel fichier est accepté.
- Nouveaux attributs lus dans les métadonnées et l'en-tête PMTiles : `attribution` (texte, vide si absent) et `bounds` (emprise ouest, sud, est, nord).
- Migration : les fonds existants reçoivent `kind` en relisant l'en-tête de leur fichier dans MinIO ; un fond illisible est marqué `VECTOR` et signalé dans les journaux.
- Le service par morceaux `GET /api/basemaps/{id}/pmtiles` (requêtes `Range`) est inchangé et sert aussi les fonds raster.

### 3.2 Mission

- Le champ `basemapId` est remplacé par `layers` : liste ordonnée d'identifiants de fonds, ordre d'empilement du bas vers le haut, fond vectoriel en premier.
- Règles à l'enregistrement (`POST` et `PATCH /api/missions/{id}`), refus 400 sinon : au plus un fond `VECTOR`, en première position ; pas de doublon ; fonds existants.
- Migration de base : une mission avec `basemap_id` devient `layers = [basemap_id]` ; sans fond, `layers = []`.

### 3.3 Validateur

| Code | Niveau | Condition |
|---|---|---|
| `NO_BASEMAP` | erreur | aucun fond vectoriel dans `layers` |
| `UNKNOWN_BASEMAP` | erreur | une couche référence un fond inexistant |
| `IMAGERY_OUT_OF_AREA` | avertissement | une couche raster ne recouvre aucun objet de la mission (emprises disjointes) |

### 3.4 Publication

Inchangée dans ce périmètre : le paquet `.gmp` (format 1) ne référence que le fond vectoriel ; l'imagerie n'est pas envoyée aux terminaux.

## 4. Application web

### 4.1 Paramètres de la mission

La liste « Fond de carte » devient une section « Couches » :

- liste déroulante du fond vectoriel (obligatoire pour publier) ;
- liste des couches d'imagerie : ajouter, retirer, monter, descendre ;
- pour chaque couche : nom, taille, attribution.

### 4.2 Carte et modes

- Chaque couche raster devient une source MapLibre de type `raster` lue dans son PMTiles par le protocole existant (même en-tête d'authentification que le fond vectoriel).
- Style selon le mode :
  - **Carte** : style vectoriel actuel ; rasters masqués.
  - **Satellite** : arrière-plan du fond vectoriel (terre et eau, sans routes ni textes) pour combler les zones hors imagerie, puis les rasters dans l'ordre de la liste.
  - **Hybride** : Satellite, plus par-dessus les routes, limites et noms de lieux du fond vectoriel.
- Les objets de mission et symboles APP-6D restent toujours au-dessus.
- Sélecteur à trois boutons en haut à droite de la carte ; Satellite et Hybride grisés sans couche d'imagerie. Le choix est mémorisé par navigateur (stockage local), pas dans la mission.
- Attributions de toutes les couches visibles en bas de la carte.
- Cadrage sans objet : emprise du fond vectoriel, comme aujourd'hui.
- Une couche illisible affiche une alerte en français qui la nomme, sans bloquer les autres couches.

### 4.3 Administration

La page « Fonds de carte » affiche le type (vectoriel ou imagerie) et l'attribution de chaque fond. L'import est inchangé ; le type est détecté par le serveur.

## 5. Outil de préparation (`tools/imagery/`)

- Produit un PMTiles raster à partir d'une source autorisée, sur un poste de préparation connecté ; jamais sur le serveur isolé.
- **Entrée 1 — service IGN (Géoplateforme, WMTS)** : emprise et zooms en paramètres ; parallélisme limité, reprises en cas d'échec, décompte des tuiles manquantes.
- **Entrée 2 — fichiers GeoTIFF ou JP2 locaux** (imagerie ALIAS, BD ORTHO par département) : découpe par GDAL, installé sur le poste de préparation.
- **Sortie** : `.pmtiles` en JPEG (WebP en option) ; métadonnées obligatoires : nom, attribution, licence, emprise.
- **Garde-fous** : estimation du nombre de tuiles et du volume avant lancement ; plafond par défaut (option pour le dépasser) ; refus sans attribution.
- Python 3, bibliothèque standard pour l'entrée IGN ; binaire `pmtiles` pour la conversion ; tests unitaires (calcul des tuiles, métadonnées).

## 6. Suite terrain (conçue ici, livrée avec le plan Android)

- Manifeste `.gmp` format 2 : `basemap` devient `layers: [{ "id", "kind", "sha256" }]` ; chaque couche est un fichier public signé, livré à part et gardé en cache comme le fond vectoriel.
- Le terminal refuse la mission si une couche manque ou si son empreinte diffère (message « fond de carte manquant, synchronisez sur le Wi-Fi du PC »).
- Aucune rétrocompatibilité : aucun terminal n'existe encore.
- Imagerie téléchargée uniquement sur le Wi-Fi du PC (spec V1 §10), limitée aux zones de mission.

## 7. Tests

| Niveau | Contenu |
|---|---|
| Serveur | détection du type à l'import (MVT, JPEG, PNG) ; fichier non PMTiles refusé ; règles de `layers` ; migration des missions et des fonds existants ; `IMAGERY_OUT_OF_AREA`. |
| Web | construction du style pour les trois modes (fonctions pures) ; section Couches ; sélecteur de mode ; alerte de couche illisible. |
| Parcours Playwright | importer un petit PMTiles raster de test, l'ajouter à une mission, passer en Satellite puis Hybride, sans erreur de page. |
| Outil | calcul des tuiles pour une emprise ; métadonnées écrites ; plafond et estimation. |

## 8. Hors périmètre

- Génération d'imagerie par le serveur (avec planetiler, plan Helm).
- Transparence réglable.
- Autres couches (SCAN IGN, relief/MNT) : le modèle en couches les accueillera.
- Envoi de l'imagerie aux terminaux (plan Android).

## 9. Points ouverts

| Point | Action |
|---|---|
| Source d'imagerie en production | Imagerie fournie par ALIAS ou l'état-major (Géode…) : format et licence à obtenir. |
| Droits d'usage militaire des sources publiques | BD ORTHO (Etalab) autorisé ; toute autre source à valider par le juridique. |
