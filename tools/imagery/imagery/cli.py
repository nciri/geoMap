"""Prepare an imagery PMTiles archive for geoMap, on a connected preparation machine."""

import argparse
import subprocess
import tempfile
from pathlib import Path

from . import mbtiles, sources, tiles

TILE_KB = 20


def pmtiles_convert(pmtiles_bin):
    return lambda src, dst: subprocess.run([pmtiles_bin, "convert", str(src), str(dst)], check=True)


def main(argv=None, fetch=sources.fetch_ign, convert=None):
    parser = argparse.ArgumentParser(prog="imagery")
    parser.add_argument("source", choices=["ign", "gdal"])
    parser.add_argument("input", nargs="?", help="GeoTIFF/JP2 file for the gdal source")
    parser.add_argument("--bbox", help="west,south,east,north (ign source)")
    parser.add_argument("--zooms", required=True, help="min-max, e.g. 10-17")
    parser.add_argument("--name", required=True)
    parser.add_argument("--attribution")
    parser.add_argument("--licence", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--max-tiles", type=int, default=50_000)
    parser.add_argument("--yes", action="store_true")
    parser.add_argument("--pmtiles", default="pmtiles")
    args = parser.parse_args(argv)

    if not args.attribution:
        print("--attribution est obligatoire : la carte doit citer la source de l'imagerie.")
        return 2
    zmin, zmax = (int(z) for z in args.zooms.split("-"))
    convert = convert or pmtiles_convert(args.pmtiles)
    metadata = {
        "name": args.name,
        "format": "jpg",
        "type": "baselayer",
        "minzoom": zmin,
        "maxzoom": zmax,
        "attribution": args.attribution,
        "licence": args.licence,
    }

    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp) / "imagery.mbtiles"
        if args.source == "ign":
            bbox = tuple(float(v) for v in args.bbox.split(","))
            total = tiles.count(bbox, zmin, zmax)
            print(f"{total} tuiles, environ {total * TILE_KB // 1024} Mo")
            if total > args.max_tiles:
                print(f"Plus de {args.max_tiles} tuiles : réduisez la zone ou les zooms, ou relevez --max-tiles.")
                return 2
            if not args.yes and input("Continuer ? [o/N] ").strip().lower() != "o":
                return 1
            metadata["bounds"] = args.bbox
            missing = []
            mbtiles.write(work, metadata, sources.ign_tiles(bbox, zmin, zmax, fetch=fetch, missing=missing))
            if missing:
                print(f"{len(missing)} tuiles manquantes")
        else:
            sources.gdal_mbtiles(args.input, str(work), zmax)
            mbtiles.write(work, metadata, [])
        convert(work, Path(args.out))
    print(f"Écrit : {args.out}")
    return 0
