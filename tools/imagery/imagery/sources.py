"""Tile sources: the IGN Géoplateforme WMTS and local rasters through GDAL."""

import shutil
import subprocess
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from . import tiles

IGN_URL = (
    "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0"
    "&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM"
    "&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg"
)


def fetch_ign(z, x, y):
    for attempt in range(5):
        try:
            with urllib.request.urlopen(IGN_URL.format(z=z, x=x, y=y), timeout=30) as response:
                return response.read()
        except OSError:
            time.sleep(2**attempt)
    return None


def ign_tiles(bbox, zmin, zmax, fetch=fetch_ign, workers=6, missing=None):
    """Yields ((z, x, y), bytes); tiles that never download are appended to `missing`."""
    wanted = [t for z in range(zmin, zmax + 1) for t in tiles.tile_range(bbox, z)]
    with ThreadPoolExecutor(workers) as pool:
        for tile, data in zip(wanted, pool.map(lambda t: fetch(*t), wanted)):
            if data is None:
                if missing is not None:
                    missing.append(tile)
                continue
            yield tile, data


def gdal_available():
    return shutil.which("gdal_translate") is not None and shutil.which("gdaladdo") is not None


def gdal_mbtiles(source, out):
    subprocess.run(["gdal_translate", "-of", "MBTILES", "-co", "TILE_FORMAT=JPEG", source, out], check=True)
    # GDAL stops adding overview levels once one fits in a single tile, so a generous list is safe.
    subprocess.run(["gdaladdo", "-r", "average", out, *[str(2**i) for i in range(1, 20)]], check=True)
