# Outil de préparation d'imagerie

Cet outil prépare des archives PMTiles d'imagerie satellite/aérienne **en dehors du
réseau isolé** du serveur geoMap, sur une machine de préparation connectée à
Internet. L'archive `.pmtiles` obtenue est ensuite importée dans geoMap via
l'écran « Fonds de carte » de l'administration.

Ne jamais exécuter cet outil sur le serveur geoMap lui-même (air-gap).

## Prérequis

- Python 3 (bibliothèque standard uniquement, aucune dépendance à installer)
- Le binaire `pmtiles` (CLI go-pmtiles, testé avec la version 1.31.2)
- GDAL (`gdal_translate`, `gdaladdo`) pour convertir un fichier raster local (GeoTIFF/JP2)

## Utilisation

Toutes les commandes s'exécutent depuis `tools/imagery` :

```bash
python3 -m imagery ign --bbox W,S,E,N --zooms 10-17 --name NAME \
    --attribution TEXT --licence TEXT --out OUT.pmtiles \
    [--max-tiles N] [--yes] [--pmtiles PATH]

python3 -m imagery gdal INPUT.tif --zooms 10-17 --name NAME \
    --attribution TEXT --licence TEXT --out OUT.pmtiles \
    [--max-tiles N] [--yes] [--pmtiles PATH]
```

L'outil affiche une estimation (nombre de tuiles, taille approximative en Mo à
20 ko/tuile), demande une confirmation sauf si `--yes` est fourni, et refuse de
continuer au-delà de `--max-tiles` (50 000 par défaut) ou si `--attribution`
n'est pas renseigné.

### Exemple : Paris, imagerie IGN

```bash
python3 -m imagery ign --bbox 2.20,48.78,2.47,48.94 --zooms 10-17 \
    --name "Paris" --attribution "© IGN" --licence "Etalab 2.0" \
    --out paris.pmtiles
```

## Sources autorisées

- BD ORTHO de l'IGN, sous Licence Ouverte Etalab 2.0.
- Imagerie fournie par ALIAS.

L'imagerie Esri, Google et Bing ne peut pas être utilisée hors ligne : leurs
conditions d'utilisation interdisent le téléchargement et la réutilisation sur
un réseau isolé.
