"""Minimal MBTiles writer; `pmtiles convert` turns it into a PMTiles archive."""

import sqlite3


def write(path, metadata, tiles):
    db = sqlite3.connect(path)
    db.executescript(
        "CREATE TABLE IF NOT EXISTS metadata (name TEXT, value TEXT);"
        "CREATE TABLE IF NOT EXISTS tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB);"
        "CREATE UNIQUE INDEX IF NOT EXISTS tile_index ON tiles (zoom_level, tile_column, tile_row);"
    )
    # Keep one row per key: a GDAL-written MBTiles already has its own metadata
    # rows (name, format, minzoom…), so replace rather than append.
    for key, value in metadata.items():
        db.execute("DELETE FROM metadata WHERE name = ?", (key,))
        db.execute("INSERT INTO metadata VALUES (?, ?)", (key, str(value)))
    written = 0
    for (z, x, y), data in tiles:
        # MBTiles rows count from the bottom (TMS).
        db.execute("INSERT OR REPLACE INTO tiles VALUES (?, ?, ?, ?)", (z, x, (2**z - 1) - y, data))
        written += 1
        if written % 500 == 0:
            db.commit()
    db.commit()
    db.close()
    return written


def zoom_range(path):
    """The zooms the archive really holds, which GDAL derives from the source resolution."""
    db = sqlite3.connect(path)
    zooms = db.execute("SELECT MIN(zoom_level), MAX(zoom_level) FROM tiles").fetchone()
    db.close()
    return zooms
