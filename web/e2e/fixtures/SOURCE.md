# e2e PMTiles fixtures

Both archives cover central Paris, bbox `2.33,48.85,2.36,48.87`, and were made on 2026-09-30
with go-pmtiles 1.31.2.

## vector.pmtiles (1 969 164 bytes)

Extract of the Protomaps daily build of **2026-09-29**:

```bash
pmtiles extract https://build.protomaps.com/20260929.pmtiles \
  web/e2e/fixtures/vector.pmtiles --bbox=2.33,48.85,2.36,48.87 --maxzoom=12
```

`--maxzoom=12` rather than 14 keeps the file under 2 MB: at maxzoom 14 it is 2.9 MB, at 13 it
is 2.3 MB, and even a single-tile-per-zoom bbox reaches 2.1 MB at maxzoom 14 (Paris tiles are
dense).

Licence: © OpenStreetMap contributors, Open Database License (ODbL) 1.0; build by Protomaps.

## imagery.pmtiles (501 285 bytes)

IGN BD ORTHO tiles from the Géoplateforme WMTS, packed by `tools/imagery`:

```bash
cd tools/imagery && python3 -m imagery ign --bbox 2.33,48.85,2.36,48.87 --zooms 12-15 \
  --name "IGN test" --attribution "© IGN BD ORTHO" --licence "Licence Ouverte Etalab 2.0" \
  --out ../../web/e2e/fixtures/imagery.pmtiles --yes --pmtiles "$PMTILES"
```

22 JPEG tiles, zooms 12–15.

Licence: © IGN, Licence Ouverte / Open Licence Etalab 2.0.
