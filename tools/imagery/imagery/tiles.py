"""Web Mercator tile maths for a lon/lat bounding box."""

import math


def tile_range(bbox, z):
    west, south, east, north = bbox
    n = 2**z

    def xy(lon, lat):
        x = min(n - 1, int((lon + 180) / 360 * n))
        y = min(n - 1, int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n))
        return x, y

    x0, y0 = xy(west, north)
    x1, y1 = xy(east, south)
    return [(z, x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]


def count(bbox, zmin, zmax):
    return sum(len(tile_range(bbox, z)) for z in range(zmin, zmax + 1))
